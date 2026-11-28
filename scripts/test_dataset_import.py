"""Run isolated import checks without touching the studio database."""
import hashlib
import importlib
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
SANDBOX = tempfile.TemporaryDirectory(prefix='studio-import-test-')
os.environ['YOLO_STUDIO_DATA'] = str(Path(SANDBOX.name) / 'studio')
os.environ['YOLO_ALLOWED_ROOTS'] = SANDBOX.name
backend = importlib.import_module('src.backend.app')
from fastapi.testclient import TestClient
from PIL import Image


class DatasetImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=SANDBOX.name)
        self.root = Path(self.temp.name)
        self.client = TestClient(backend.app)
        with backend.db_connect() as db:
            self.user_id = db.execute(
                'INSERT INTO users(username,display_name,password_hash,is_admin,created_at) VALUES(?,?,?,?,?)',
                (self.root.name, 'Test user', 'unused', 1, backend.now())).lastrowid
            self.wid = db.execute('INSERT INTO workspaces(name,created_by,created_at) VALUES(?,?,?)',
                                  ('Test', self.user_id, backend.now())).lastrowid
            self.token = self.root.name
            db.execute('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)',
                       (hashlib.sha256(self.token.encode()).hexdigest(), self.user_id, 'test-csrf', backend.now()+600))
        self.client.cookies.set('yws_session', self.token)
        self.client.headers['x-csrf-token'] = 'test-csrf'

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    def image(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new('RGB', (64, 64)).save(path)

    def label(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('1 0.5 0.5 0.2 0.2\n', encoding='utf-8')

    def job(self, payload):
        response = self.client.post(f'/api/workspaces/{self.wid}/imports', json={'name': 'Dataset test', **payload})
        self.assertEqual(response.status_code, 200, response.text)
        key = response.json()['job_id']
        states = []
        for _ in range(200):
            response = self.client.get(f'/api/workspaces/{self.wid}/imports/{key}')
            self.assertEqual(response.status_code, 200, response.text)
            state = response.json()
            states.append(state)
            if state['status'] != 'running':
                return state, states
            time.sleep(.02)
        self.fail('Import did not finish')

    def test_auto_detects_labels_from_dataset_and_images_directory(self):
        self.image(self.root/'images'/'train'/'a.jpg')
        self.label(self.root/'labels'/'train'/'a.txt')
        (self.root/'classes.txt').write_text('normal\nsleep\n', encoding='utf-8')
        for path in (self.root, self.root/'images', self.root/'images'/'train'):
            state, _ = self.job(dict(import_mode='auto', dataset_path=str(path)))
            self.assertEqual(state['status'], 'completed', state)
            self.assertEqual(state['paired'], 1)
            self.assertEqual(state['result']['classes'], ['normal', 'sleep'])

    def test_auto_mixed_same_folder_and_unlabeled(self):
        self.image(self.root/'a.jpg')
        self.label(self.root/'a.txt')
        self.image(self.root/'b.jpg')
        state, _ = self.job(dict(import_mode='auto', dataset_path=str(self.root)))
        self.assertEqual(state['status'], 'completed', state)
        self.assertEqual((state['paired'], state['missing']), (1, 1))

    def test_assignments_ratio_rounding_and_redistribution(self):
        for i in range(7):
            self.image(self.root/f'{i}.jpg')
        state, _ = self.job(dict(import_mode='auto', dataset_path=str(self.root)))
        pid = state['result']['id']
        with backend.db_connect() as db:
            ids = []
            for i in range(2):
                uid = db.execute('INSERT INTO users(username,display_name,password_hash,created_at) VALUES(?,?,?,?)',
                                 (f'{self.root.name}-{i}', f'Editor {i}', 'unused', backend.now())).lastrowid
                db.execute('INSERT INTO members(workspace_id,user_id,role) VALUES(?,?,?)', (self.wid, uid, 'editor'))
                ids.append(uid)
        url = f'/api/projects/{pid}/assignments/distribute'
        payload = dict(member_ids=ids, percentages=[70, 30])
        response = self.client.post(url, json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['counts'], {str(ids[0]): 5, str(ids[1]): 2})
        self.assertEqual(self.client.post(url, json=payload).json()['assigned'], 0)
        response = self.client.post(url, json={**payload, 'percentages': [30, 70], 'only_unassigned': False})
        self.assertEqual(response.json()['counts'], {str(ids[0]): 2, str(ids[1]): 5})
        self.assertEqual(self.client.post(url, json={**payload, 'percentages': [30, 30]}).status_code, 422)
        with backend.db_connect() as db:
            counts = dict(db.execute('SELECT assigned_to,COUNT(*) FROM assets WHERE project_id=? GROUP BY assigned_to', (pid,)).fetchall())
        self.assertEqual(counts, {ids[0]: 2, ids[1]: 5})

    def test_separate_paths_and_class_names(self):
        images, labels = self.root/'photos', self.root/'annotations'
        for sub in ('one', 'two'):
            self.image(images/sub/'same.jpg')
            self.label(labels/sub/'same.txt')
        (labels/'classes.txt').write_text('normal\nsleep\n', encoding='utf-8')
        state, _ = self.job(dict(import_mode='separate', image_path=str(images), label_path=str(labels)))
        self.assertEqual(state['status'], 'completed', state)
        self.assertEqual((state['scanned'], state['paired'], state['inserted']), (2, 2, 2))
        self.assertEqual(state['result']['classes'], ['normal', 'sleep'])
        with backend.db_connect() as db:
            project = db.execute('SELECT * FROM projects WHERE id=?', (state['result']['id'],)).fetchone()
            rows = db.execute('SELECT * FROM assets WHERE project_id=?', (project['id'],)).fetchall()
            for row in rows:
                image, label = backend.image_and_label_paths(project, row)
                self.assertTrue(image.is_file())
                self.assertTrue(label.is_file())

    def test_missing_labels_fails_without_project(self):
        self.image(self.root/'images'/'a.jpg')
        (self.root/'labels').mkdir()
        state, _ = self.job(dict(import_mode='separate', image_path=str(self.root/'images'), label_path=str(self.root/'labels')))
        self.assertEqual(state['status'], 'failed')
        self.assertEqual(state['missing'], 1)
        with backend.db_connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM projects WHERE workspace_id=?', (self.wid,)).fetchone()[0], 0)

    def test_same_folder_and_images_only(self):
        self.image(self.root/'sample.jpg')
        for mode in ('same_folder', 'images'):
            state, _ = self.job(dict(import_mode=mode, dataset_path=str(self.root)))
            self.assertEqual(state['status'], 'completed', state)
            self.assertEqual(state['missing'], 1)

    def test_train_val_without_test_split(self):
        for split in ('train', 'val'):
            self.image(self.root/'images'/split/'a.jpg')
            self.label(self.root/'labels'/split/'a.txt')
        state, _ = self.job(dict(import_mode='split', dataset_path=str(self.root)))
        self.assertEqual(state['status'], 'completed', state)
        self.assertEqual(state['result']['count'], 2)

    def test_blank_path_rejected(self):
        state, _ = self.job(dict(import_mode='separate', image_path='', label_path=''))
        self.assertEqual(state['status'], 'failed')

    def test_job_requires_login(self):
        response = TestClient(backend.app).get(f'/api/workspaces/{self.wid}/imports/not-a-job')
        self.assertEqual(response.status_code, 401)

    def test_failed_write_rolls_back_project(self):
        self.image(self.root/'sample.jpg')
        with backend.db_connect() as db:
            db.execute("CREATE TRIGGER import_test_fail BEFORE INSERT ON assets BEGIN SELECT RAISE(ABORT, 'test insert failure'); END")
        try:
            state, _ = self.job(dict(import_mode='same_folder', dataset_path=str(self.root)))
            self.assertEqual(state['status'], 'failed')
            with backend.db_connect() as db:
                count = db.execute('SELECT COUNT(*) FROM projects WHERE workspace_id=?', (self.wid,)).fetchone()[0]
                self.assertEqual(count, 0)
        finally:
            with backend.db_connect() as db:
                db.execute('DROP TRIGGER import_test_fail')

    def test_existing_synchronous_endpoint_still_works(self):
        self.image(self.root/'sample.jpg')
        response = self.client.post(f'/api/workspaces/{self.wid}/projects', json={
            'name': 'Legacy import', 'import_mode': 'same_folder', 'dataset_path': str(self.root)})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['count'], 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
