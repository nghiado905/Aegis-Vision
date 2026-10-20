"""YOLO Workspace Studio: self-hosted collaborative YOLO detection editor.

Single Uvicorn worker only. Dataset originals stay in-place; annotations are backed up
before their first edit. Authenticated cookie sessions and per-image edit leases.
"""
from __future__ import annotations

import argparse
import getpass
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import sqlite3
import tempfile
import time
import zipfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI, HTTPException, Request, Response, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from PIL import Image, ImageOps

HERE = Path(__file__).resolve().parents[2]
FRONTEND_DIR = HERE / 'src' / 'frontend'
DATA_DIR = Path(os.environ.get('YOLO_STUDIO_DATA', str(HERE / '.studio_data'))).expanduser().resolve()
DB_PATH = DATA_DIR / 'workspace.db'
IMG_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff'}
LEASE_SECONDS = 180
SESSION_SECONDS = 60 * 60 * 24 * 7
SECURE_COOKIES = os.environ.get('YOLO_SECURE_COOKIE', '').lower() in ('1', 'true', 'yes')
ALLOWED_ROOTS = [Path(p).expanduser().resolve() for p in os.environ.get('YOLO_ALLOWED_ROOTS', '').split(os.pathsep) if p]


def now() -> int:
    return int(time.time())


def connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA busy_timeout=30000')
    db.execute('PRAGMA journal_mode=WAL')
    return db


@contextmanager
def db_connect():
    db = connect()
    try:
        yield db
    finally:
        db.close()

def init_db():
    with db_connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          is_admin INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          csrf TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workspaces (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          created_by INTEGER REFERENCES users(id),
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS members (
          workspace_id INTEGER NOT NULL
            REFERENCES workspaces(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL
            REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(
            role IN ('owner', 'manager', 'editor', 'viewer')
          ),
          PRIMARY KEY (workspace_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY,
          workspace_id INTEGER NOT NULL
            REFERENCES workspaces(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          dataset_root TEXT NOT NULL,
          classes_json TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS assets (
          id INTEGER PRIMARY KEY,
          project_id INTEGER NOT NULL
            REFERENCES projects(id) ON DELETE CASCADE,
          image_rel TEXT NOT NULL,
          label_rel TEXT NOT NULL,
          split TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 0,
          review_state TEXT NOT NULL DEFAULT 'todo',
          locked_by INTEGER REFERENCES users(id),
          lock_until INTEGER,
          updated_by INTEGER REFERENCES users(id),
          updated_at INTEGER,
          reviewed_by INTEGER REFERENCES users(id),
          reviewed_at INTEGER,
          UNIQUE(project_id, image_rel)
        );

        CREATE TABLE IF NOT EXISTS changes (
          id INTEGER PRIMARY KEY,
          asset_id INTEGER NOT NULL
            REFERENCES assets(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id),
          revision INTEGER NOT NULL,
          previous_json TEXT NOT NULL,
          current_json TEXT NOT NULL,
          changed_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS ix_assets_project
          ON assets(project_id, split, review_state);

        CREATE INDEX IF NOT EXISTS ix_changes_asset
          ON changes(asset_id, id DESC);
        ''')

        # Hỗ trợ nâng cấp database phiên bản cũ
        # mà không xóa dữ liệu hiện tại.
        cols = {
            row['name']
            for row in db.execute('PRAGMA table_info(assets)')
        }

        if 'reviewed_by' not in cols:
            db.execute(
                'ALTER TABLE assets '
                'ADD COLUMN reviewed_by INTEGER REFERENCES users(id)'
            )

        if 'reviewed_at' not in cols:
            db.execute(
                'ALTER TABLE assets '
                'ADD COLUMN reviewed_at INTEGER'
            )


def password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 310000)
    return f'pbkdf2_sha256$310000${salt.hex()}${digest.hex()}'


def password_check(password: str, stored: str) -> bool:
    try:
        _, iters, salt, digest = stored.split('$')
        calc = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(iters))
        return hmac.compare_digest(calc, bytes.fromhex(digest))
    except (ValueError, TypeError):
        return False


def public_user(row):
    return {'id': row['id'], 'username': row['username'],
            'display_name': row['display_name'], 'is_admin': bool(row['is_admin'])}


def fail(status, message):
    raise HTTPException(status_code=status, detail=message)


def require_user(request: Request, db):
    raw = request.cookies.get('yws_session', '')
    if not raw:
        fail(401, 'Vui lòng đăng nhập')
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    row = db.execute('''SELECT u.*, s.csrf FROM users u JOIN sessions s ON s.user_id=u.id
                        WHERE s.token_hash=? AND s.expires_at>?''', (token_hash, now())).fetchone()
    if not row:
        fail(401, 'Phiên đăng nhập đã hết hạn')
    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
        if not hmac.compare_digest(request.headers.get('x-csrf-token', ''), row['csrf']):
            fail(403, 'CSRF token không hợp lệ')
    return row


def require_admin(user):
    if not user['is_admin']:
        fail(403, 'Chỉ quản trị viên hệ thống có quyền này')


def require_workspace(db, user, wid, minimum='viewer'):
    ws = db.execute('SELECT * FROM workspaces WHERE id=?', (wid,)).fetchone()
    if not ws:
        fail(404, 'Workspace không tồn tại')
    if user['is_admin']:
        return ws, 'owner'
    role_row = db.execute('SELECT role FROM members WHERE workspace_id=? AND user_id=?',
                          (wid, user['id'])).fetchone()
    if not role_row:
        fail(403, 'Bạn không có quyền truy cập workspace này')
    role = role_row['role']
    if {'viewer': 0, 'editor': 1, 'manager': 2, 'owner': 3}[role] < {
        'viewer': 0, 'editor': 1, 'manager': 2, 'owner': 3}[minimum]:
        fail(403, f'Yêu cầu quyền {minimum} trở lên')
    return ws, role


def project_access(db, user, pid, minimum='viewer'):
    project = db.execute('SELECT * FROM projects WHERE id=?', (pid,)).fetchone()
    if not project:
        fail(404, 'Project không tồn tại')
    _, role = require_workspace(db, user, project['workspace_id'], minimum)
    return project, role


def asset_access(db, user, pid, aid, minimum='viewer'):
    project, role = project_access(db, user, pid, minimum)
    asset = db.execute('SELECT * FROM assets WHERE project_id=? AND id=?', (pid, aid)).fetchone()
    if not asset:
        fail(404, 'Ảnh không thuộc project này')
    return project, role, asset


def inside(root: Path, target: Path) -> Path:
    """Reject symlinks escaping project root, even for a DB-controlled asset path."""
    result = target.resolve()
    if not result.is_relative_to(root.resolve()):
        fail(403, 'Đường dẫn nằm ngoài dataset')
    return result


def discover(root: Path):
    """Match images/train/a.jpg <-> labels/train/a.txt and train/images/a.jpg patterns."""
    candidate_pairs = []
    for d in root.rglob('images'):
        if not d.is_dir():
            continue
        label_dir = d.parent / 'labels'
        if label_dir.is_dir():
            candidate_pairs.append((d, label_dir))
        elif d == root / 'images' and (root / 'labels').is_dir():
            candidate_pairs.append((d, root / 'labels'))
    assets = {}
    for image_dir, label_dir in candidate_pairs:
        for file in image_dir.rglob('*'):
            if not file.is_file() or file.suffix.lower() not in IMG_EXT:
                continue
            # Refuse importing symbolic links going outside dataset.
            if not file.resolve().is_relative_to(root) or not label_dir.resolve().is_relative_to(root):
                continue
            rel = file.relative_to(image_dir)
            label = label_dir / rel.with_suffix('.txt')
            key = file.relative_to(root).as_posix()
            if key in assets:
                continue
            parts = rel.parts
            split = parts[0].lower() if len(parts) > 1 and parts[0].lower() in ('train','val','valid','test') else (
                image_dir.parent.name.lower() if image_dir.parent.name.lower() in ('train','val','valid','test') else 'unsplit')
            assets[key] = (key, label.relative_to(root).as_posix(), split)
    return sorted(assets.values())


def read_classes(root: Path, assets):
    for name in ('data.yaml', 'dataset.yaml', 'data.yml'):
        file = root / name
        if not file.is_file():
            continue
        try:
            data = yaml.safe_load(file.read_text(encoding='utf-8')) or {}
            names = data.get('names', [])
            if isinstance(names, list) and names:
                return [str(n) for n in names]
            if isinstance(names, dict) and names:
                ids = [int(k) for k in names]
                if min(ids) >= 0 and max(ids) < 10000:
                    return [str(names.get(i, names.get(str(i), f'class_{i}'))) for i in range(max(ids)+1)]
        except (ValueError, yaml.YAMLError, OSError):
            pass
    cfile = root / 'classes.txt'
    if cfile.is_file():
        names = [s.strip() for s in cfile.read_text(encoding='utf-8-sig').splitlines() if s.strip()]
        if names: return names
    max_id = 0
    for _, label, _ in assets:
        path = root / label
        if path.is_file():
            try:
                for line in path.read_text(encoding='utf-8-sig').splitlines():
                    fields = line.split()
                    if fields: max_id = max(max_id, int(fields[0]))
            except (ValueError, UnicodeError, OSError):
                continue
    return [f'class_{i}' for i in range(min(max_id, 9999)+1)]


def parse_labels(path: Path, class_count: int):
    boxes = []
    if not path.exists():
        return boxes
    for box_index, line in enumerate(path.read_text(encoding='utf-8-sig').splitlines(), 1):
        if not line.strip():
            continue
        parts = line.split()
        if len(parts) != 5:
            fail(422, f'{path.name}:{box_index} không phải định dạng YOLO detect 5 cột. Không tự xóa nhãn này.')
        try:
            cls = int(parts[0]); x, y, w, h = map(float, parts[1:])
        except ValueError:
            fail(422, f'{path.name}:{box_index} chứa giá trị không hợp lệ')
        import math
        if not (0 <= cls < class_count and all(math.isfinite(v) for v in (x,y,w,h))
                and 0 <= x <= 1 and 0 <= y <= 1 and 0 < w <= 1 and 0 < h <= 1
                and x-w/2 >= -0.000002 and x+w/2 <= 1.000002
                and y-h/2 >= -0.000002 and y+h/2 <= 1.000002):
                fail(422, f'BBox #{box_index} hoặc class không hợp lệ: cls={cls}, x={x}, y={y}, w={w}, h={h}, số class={class_count}')
        boxes.append({'cls': cls, 'x': x, 'y': y, 'w': w, 'h': h})
    return boxes


def image_and_label_paths(project, asset):
    root = Path(project['dataset_root']).resolve()

    image_rel = Path(asset['image_rel'])
    image_path = inside(root, root / image_rel)

    # sqlite3.Row is not a dict and does not provide .get(). Older database
    # rows may also not contain label_rel, so infer the path when it is absent.
    label_rel_raw = asset['label_rel'] if 'label_rel' in asset.keys() else ''
    label_rel_raw = label_rel_raw or ''
    label_rel = Path(label_rel_raw) if label_rel_raw else None

    # Nếu đường dẫn nhãn trong database bị thiếu tên file,
    # bị sai phần mở rộng hoặc đang trỏ tới thư mục,
    # tự suy ra lại từ đường dẫn ảnh.
    if (
        label_rel is None
        or label_rel.suffix.lower() != '.txt'
        or (root / label_rel).is_dir()
    ):
        parts = list(image_rel.parts)

        # images/train/abc.jpg -> labels/train/abc.txt
        # train/images/abc.jpg -> train/labels/abc.txt
        positions = [
            i for i, name in enumerate(parts[:-1])
            if name.lower() == 'images'
        ]

        if not positions:
            raise ValueError(
                f'Không tìm thấy thư mục images trong: {image_rel}'
            )

        parts[positions[-1]] = 'labels'
        label_rel = Path(*parts).with_suffix('.txt')

    label_path = inside(root, root / label_rel)

    if label_path.is_dir():
        raise ValueError(
            f'Đường dẫn nhãn đang là thư mục: {label_path}'
        )

    return image_path, label_path



def asset_dict(db, row):
    locker = None
    if row['locked_by'] and row['lock_until'] and row['lock_until'] > now():
        r = db.execute('SELECT display_name FROM users WHERE id=?', (row['locked_by'],)).fetchone()
        locker = {'id': row['locked_by'], 'name': r['display_name'] if r else '?', 'until': row['lock_until']}
    rev_user=db.execute('SELECT display_name FROM users WHERE id=?',(row['reviewed_by'],)).fetchone() if row['reviewed_by'] else None
    last_user=db.execute('SELECT display_name FROM users WHERE id=?',(row['updated_by'],)).fetchone() if row['updated_by'] else None
    return {'id': row['id'], 'image_rel': row['image_rel'], 'split': row['split'],
            'has_label': bool(row['label_rel']), 'revision': row['revision'],
            'state': row['review_state'], 'lock': locker, 'updated_at': row['updated_at'],
            'updated_by': last_user['display_name'] if last_user else None,
            'reviewed_by': rev_user['display_name'] if rev_user else None, 'reviewed_at': row['reviewed_at']}


class LoginData(BaseModel):
    username: str
    password: str


class UserData(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    display_name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=10, max_length=256)


class NameData(BaseModel):
    name: str = Field(min_length=2, max_length=100)


class MemberData(BaseModel):
    username: str
    role: str


class ProjectData(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    dataset_path: str = Field(min_length=1, max_length=4096)


class BoxData(BaseModel):
    cls: int
    x: float
    y: float
    w: float
    h: float


class SaveData(BaseModel):
    revision: int
    boxes: list[BoxData] = Field(max_length=3000)
    state: str = 'in_progress'


class InferData(BaseModel):
    model_path: str
    asset_ids: list[int] = Field(default_factory=list)
    confidence: float = Field(default=0.25, ge=0.0, le=1.0)
    update_classes: bool = True


app = FastAPI(title='YOLO Workspace Studio', docs_url=None, redoc_url=None)
init_db()
app.mount('/static', StaticFiles(directory=str(FRONTEND_DIR)), name='static')


@app.get('/')
def home():
    return FileResponse(FRONTEND_DIR/'index.html', headers={'Cache-Control': 'no-store'})


@app.post('/api/auth/login')
def login(data: LoginData, response: Response):
    with db_connect() as db:
        user = db.execute('SELECT * FROM users WHERE username=?', (data.username.strip().lower(),)).fetchone()
        if not user or not password_check(data.password, user['password_hash']):
            fail(401, 'Tên đăng nhập hoặc mật khẩu không chính xác')
        token = secrets.token_urlsafe(36)
        csrf = secrets.token_urlsafe(24)
        db.execute('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)',
                   (hashlib.sha256(token.encode()).hexdigest(), user['id'], csrf, now()+SESSION_SECONDS))
        response.set_cookie('yws_session', token, httponly=True, secure=SECURE_COOKIES,
                            samesite='strict', max_age=SESSION_SECONDS, path='/')
        return {'user': public_user(user), 'csrf': csrf}


@app.get('/api/auth/me')
def me(request: Request):
    with db_connect() as db:
        user = require_user(request, db)
        return {'user': public_user(user), 'csrf': user['csrf']}


@app.post('/api/auth/logout')
def logout(request: Request, response: Response):
    with db_connect() as db:
        require_user(request, db)
        db.execute('DELETE FROM sessions WHERE token_hash=?',
                   (hashlib.sha256(request.cookies['yws_session'].encode()).hexdigest(),))
        response.delete_cookie('yws_session', path='/')
        return {'ok': True}


@app.get('/api/users')
def users(request: Request):
    with db_connect() as db:
        u = require_user(request, db)
        require_admin(u)
        return [public_user(x) for x in db.execute('SELECT * FROM users ORDER BY username')]


@app.post('/api/users')
def create_user(data: UserData, request: Request):
    with db_connect() as db:
        u = require_user(request, db)
        require_admin(u)
        name = data.username.strip().lower()
        if not re.fullmatch(r'[a-z0-9_.-]{3,40}', name):
            fail(422, 'Username chỉ được dùng a-z, 0-9, _, . và -')
        try:
            db.execute('INSERT INTO users(username,display_name,password_hash,is_admin,created_at) VALUES(?,?,?,?,?)',
                       (name,data.display_name.strip(),password_hash(data.password),0,now()))
        except sqlite3.IntegrityError:
            fail(409, 'Username đã tồn tại')
        return {'ok': True}


@app.get('/api/workspaces')
def workspaces(request: Request):
    with db_connect() as db:
        user = require_user(request, db)
        rows = db.execute('''SELECT w.*, COALESCE(m.role,'owner') role FROM workspaces w
            LEFT JOIN members m ON w.id=m.workspace_id AND m.user_id=?
            WHERE (?=1 OR m.user_id IS NOT NULL) ORDER BY w.created_at DESC, w.id DESC''',
            (user['id'], user['is_admin'])).fetchall()
        return [{**dict(row), 'projects': db.execute('SELECT count(*) FROM projects WHERE workspace_id=?', (row['id'],)).fetchone()[0]} for row in rows]


@app.post('/api/workspaces')
def create_workspace(data: NameData, request: Request):
    with db_connect() as db:
        user = require_user(request, db)
        cur = db.execute('INSERT INTO workspaces(name,created_by,created_at) VALUES(?,?,?)',
                         (data.name.strip(), user['id'], now()))
        db.execute('INSERT INTO members(workspace_id,user_id,role) VALUES(?,?,?)',
                   (cur.lastrowid, user['id'], 'owner'))
        return {'id': cur.lastrowid}


@app.get('/api/workspaces/{wid}/members')
def list_members(wid: int, request: Request):
    with db_connect() as db:
        user = require_user(request, db)
        require_workspace(db,user,wid)
        rows = db.execute('''SELECT u.id,u.username,u.display_name,m.role FROM members m
                             JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY m.role,u.username''', (wid,))
        return [dict(row) for row in rows]


@app.post('/api/workspaces/{wid}/members')
def add_member(wid: int, data: MemberData, request: Request):
    with db_connect() as db:
        user = require_user(request, db)
        _, role = require_workspace(db,user,wid,'manager')
        if data.role not in ('manager','editor','viewer'):
            fail(422,'Role phải là manager, editor hoặc viewer')
        if data.role == 'manager' and role not in ('owner',):
            fail(403, 'Chỉ owner có thể cấp quyền manager')
        target = db.execute('SELECT * FROM users WHERE username=?', (data.username.strip().lower(),)).fetchone()
        if not target:
            fail(404,'Không tìm thấy username; admin cần tạo tài khoản trước')
        current = db.execute('SELECT role FROM members WHERE workspace_id=? AND user_id=?', (wid,target['id'])).fetchone()
        if current and current['role'] == 'owner':
            fail(403, 'Không thể thay đổi quyền owner')
        db.execute('''INSERT INTO members(workspace_id,user_id,role) VALUES(?,?,?)
            ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=excluded.role''',
            (wid,target['id'],data.role))
        return {'ok': True}


@app.delete('/api/workspaces/{wid}/members/{uid}')
def remove_member(wid: int, uid: int, request: Request):
    with db_connect() as db:
        user = require_user(request, db)
        require_admin(user)
        row = db.execute('SELECT role FROM members WHERE workspace_id=? AND user_id=?', (wid, uid)).fetchone()
        if not row:
            fail(404, 'Member không tồn tại trong workspace')
        if row['role'] == 'owner':
            fail(403, 'Không thể xóa owner của workspace')
        db.execute('DELETE FROM members WHERE workspace_id=? AND user_id=?', (wid, uid))
        return {'ok': True}


@app.delete('/api/workspaces/{wid}')
def delete_workspace(wid: int, request: Request):
    with db_connect() as db:
        user = require_user(request, db)
        require_admin(user)
        if not db.execute('SELECT 1 FROM workspaces WHERE id=?', (wid,)).fetchone():
            fail(404, 'Workspace không tồn tại')
        db.execute('DELETE FROM workspaces WHERE id=?', (wid,))
        return {'ok': True}


@app.get('/api/workspaces/{wid}/projects')
def list_projects(wid: int, request: Request):
    with db_connect() as db:
        user = require_user(request, db)
        require_workspace(db,user,wid)
        rows = db.execute('''SELECT p.*, count(a.id) total,
               sum(CASE WHEN a.review_state='reviewed' THEN 1 ELSE 0 END) reviewed
               FROM projects p LEFT JOIN assets a ON a.project_id=p.id
               WHERE p.workspace_id=? GROUP BY p.id ORDER BY p.id DESC''', (wid,)).fetchall()
        return [{'id': r['id'], 'workspace_id': r['workspace_id'], 'name': r['name'],
                 'dataset_root': r['dataset_root'], 'total': r['total'] or 0,
                 'reviewed': r['reviewed'] or 0, 'classes': json.loads(r['classes_json'])} for r in rows]


@app.post('/api/workspaces/{wid}/projects')
def create_project(wid: int, data: ProjectData, request: Request):
    with db_connect() as db:
        user = require_user(request, db)
        require_workspace(db,user,wid,'manager')
        root = Path(data.dataset_path.strip().strip('"')).expanduser().resolve()
        if not root.is_dir():
            fail(422, 'Không tìm thấy thư mục dataset trên máy chủ')
        if ALLOWED_ROOTS and not any(root.is_relative_to(p) for p in ALLOWED_ROOTS):
            fail(403, 'Dataset nằm ngoài YOLO_ALLOWED_ROOTS trên server')
        if not ALLOWED_ROOTS and not user['is_admin']:
            fail(403, 'Admin cần đặt YOLO_ALLOWED_ROOTS để manager import dataset')
        if not os.access(root, os.R_OK):
            fail(403, 'Server không có quyền đọc dataset')
        assets = discover(root)
        if not assets:
            fail(422, 'Không tìm thấy cấu trúc images/ và labels/ tương ứng')
        if len(assets)>500000:
            fail(422, 'Dataset vượt quá 500.000 ảnh/project')
        classes = read_classes(root, assets)
        with db:
            cur = db.execute('INSERT INTO projects(workspace_id,name,dataset_root,classes_json,created_at) VALUES(?,?,?,?,?)',
                             (wid,data.name.strip(),str(root),json.dumps(classes,ensure_ascii=False),now()))
            pid = cur.lastrowid
            db.executemany('INSERT INTO assets(project_id,image_rel,label_rel,split) VALUES(?,?,?,?)',
                           [(pid,im,la,split) for im,la,split in assets])
        return {'id': pid, 'count': len(assets), 'classes': classes}


@app.delete('/api/projects/{pid}')
def delete_project(pid: int, request: Request):
    with db_connect() as db:
        user = require_user(request, db)
        require_admin(user)
        if not db.execute('SELECT 1 FROM projects WHERE id=?', (pid,)).fetchone():
            fail(404, 'Dataset/project không tồn tại')
        # Chỉ xóa project/index/review; giữ nguyên ảnh và nhãn gốc trên ổ đĩa.
        db.execute('DELETE FROM projects WHERE id=?', (pid,))
        return {'ok': True}


@app.post('/api/projects/{pid}/upload')
async def upload_project_images(pid: int, request: Request, files: list[UploadFile] = File(...)):
    """Upload local images into images/inbox and register them in the project."""
    with db_connect() as db:
        user = require_user(request, db)
        project, _ = project_access(db, user, pid, 'editor')
        root = Path(project['dataset_root']).resolve()
        image_dir = root / 'images' / 'inbox'
        label_dir = root / 'labels' / 'inbox'
        image_dir.mkdir(parents=True, exist_ok=True); label_dir.mkdir(parents=True, exist_ok=True)
        added = []
        for upload in files:
            suffix = Path(upload.filename or '').suffix.lower()
            if suffix not in IMG_EXT:
                continue
            name = Path(upload.filename).name
            target = image_dir / name
            if target.exists():
                target = image_dir / f'{target.stem}_{int(time.time())}{target.suffix}'
            with target.open('wb') as out:
                out.write(await upload.read())
            rel_image = target.relative_to(root).as_posix()
            rel_label = (label_dir / f'{target.stem}.txt').relative_to(root).as_posix()
            db.execute('INSERT OR IGNORE INTO assets(project_id,image_rel,label_rel,split) VALUES(?,?,?,?)', (pid, rel_image, rel_label, 'inbox'))
            added.append(rel_image)
        db.commit()
        return {'ok': True, 'added': added, 'count': len(added)}


@app.post('/api/projects/{pid}/models/upload')
async def upload_project_model(pid: int, request: Request, model: UploadFile = File(...)):
    """Store a model selected in the browser and return its server-side path."""
    with db_connect() as db:
        user = require_user(request, db)
        project_access(db, user, pid, 'editor')
    original_name = Path(model.filename or '').name
    suffix = Path(original_name).suffix.lower()
    if suffix not in {'.pt', '.onnx', '.engine'}:
        fail(422, 'Chỉ hỗ trợ model .pt, .onnx hoặc .engine')
    model_dir = DATA_DIR / 'models' / f'project_{pid}'
    model_dir.mkdir(parents=True, exist_ok=True)
    safe_stem = re.sub(r'[^A-Za-z0-9_.-]+', '_', Path(original_name).stem).strip('._') or 'model'
    target = model_dir / f'{safe_stem}_{int(time.time())}_{secrets.token_hex(3)}{suffix}'
    size = 0
    with target.open('wb') as output:
        while chunk := await model.read(1024 * 1024):
            size += len(chunk)
            output.write(chunk)
    if size == 0:
        target.unlink(missing_ok=True)
        fail(422, 'File model trống')
    print(f'[MODEL] uploaded project={pid} file={target} size={size}', flush=True)
    return {'ok': True, 'name': original_name, 'model_path': str(target), 'size': size}


@app.post('/api/projects/{pid}/infer')
def infer_project(pid: int, data: InferData, request: Request):
    print(f'[INFER] request project={pid} model={data.model_path!r} assets={len(data.asset_ids)} conf={data.confidence}', flush=True)
    """Run an Ultralytics model and save predictions as YOLO labels."""
    try:
        from ultralytics import YOLO
    except ImportError:
        print('[INFER] ERROR: ultralytics is not installed', flush=True)
        fail(503, 'Chưa cài Ultralytics. Chạy: python -m pip install ultralytics')
    with db_connect() as db:
        user = require_user(request, db)
        project, _ = project_access(db, user, pid, 'editor')
        model_path = Path(data.model_path).expanduser().resolve()
        if not model_path.is_file():
            print(f'[INFER] ERROR: model not found: {model_path}', flush=True)
            fail(404, f'Không tìm thấy model: {model_path}')
        rows = db.execute('SELECT * FROM assets WHERE project_id=?' + (' AND id IN (' + ','.join('?'*len(data.asset_ids)) + ')' if data.asset_ids else ''), [pid, *data.asset_ids]).fetchall()
        model = YOLO(str(model_path))
        print(f'[INFER] loaded model={model_path} images={len(rows)}', flush=True)
        names = model.names
        class_names = [names[i] for i in sorted(names)] if isinstance(names, dict) else list(names)
        results = []
        for row in rows:
            image, label = image_and_label_paths(project, row)
            prediction = model.predict(str(image), conf=data.confidence, verbose=False)[0]
            W, H = prediction.orig_shape[1], prediction.orig_shape[0]
            lines = []
            for box in prediction.boxes:
                cls = int(box.cls.item()); x1,y1,x2,y2 = box.xyxy[0].tolist()
                x=(x1+x2)/(2*W); y=(y1+y2)/(2*H); w=(x2-x1)/W; h=(y2-y1)/H
                lines.append(f'{cls} {x:.8f} {y:.8f} {w:.8f} {h:.8f}')
            label.parent.mkdir(parents=True, exist_ok=True); label.write_text('\n'.join(lines)+ ('\n' if lines else ''), encoding='utf-8')
            results.append({'asset_id': row['id'], 'boxes': len(lines)})
        if data.update_classes:
            db.execute('UPDATE projects SET classes_json=? WHERE id=?', (json.dumps(class_names, ensure_ascii=False), pid))
        db.commit()
        print(f'[INFER] completed project={pid} results={len(results)} classes={class_names}', flush=True)
        return {'ok': True, 'classes': class_names, 'results': results}


@app.get('/api/projects/{pid}')
def project_meta(pid: int, request: Request):
    with db_connect() as db:
        u = require_user(request,db)
        p, role = project_access(db,u,pid)
        total = db.execute('SELECT count(*) FROM assets WHERE project_id=?',(pid,)).fetchone()[0]
        return {'id':p['id'],'name':p['name'],'workspace_id':p['workspace_id'],
                'dataset_root':p['dataset_root'],'classes':json.loads(p['classes_json']),
                'role':role, 'total':total}


@app.get('/api/projects/{pid}/stats')
def project_stats(pid: int,request: Request):
    with db_connect() as db:
        u=require_user(request,db);project_access(db,u,pid)
        out = db.execute('''SELECT COUNT(*) total,
              SUM(CASE WHEN review_state='reviewed' THEN 1 ELSE 0 END) reviewed,
              SUM(CASE WHEN review_state='in_progress' THEN 1 ELSE 0 END) progress,
              SUM(CASE WHEN locked_by IS NOT NULL AND lock_until>? THEN 1 ELSE 0 END) locked
              FROM assets WHERE project_id=?''',(now(),pid)).fetchone()
        splits = db.execute('SELECT split,count(*) n FROM assets WHERE project_id=? GROUP BY split',(pid,))
        return {'total':out['total'] or 0,'reviewed':out['reviewed'] or 0,
                'in_progress':out['progress'] or 0,'locked':out['locked'] or 0,
                'splits':[dict(x) for x in splits]}


@app.get('/api/projects/{pid}/quality')
def project_quality(pid: int, request: Request):
    """Validate YOLO detection labels and summarize classes/splits."""
    with db_connect() as db:
        u = require_user(request, db)
        p, _ = project_access(db, u, pid)
        classes = json.loads(p['classes_json'])
        rows = db.execute('SELECT image_rel,label_rel,split FROM assets WHERE project_id=?', (pid,)).fetchall()
        errors = []
        class_counts = [0] * len(classes)
        split_counts = {}
        for row in rows:
            split_counts[row['split']] = split_counts.get(row['split'], 0) + 1
            _, label = image_and_label_paths(p, row)
            if not label.exists():
                errors.append({'image': row['image_rel'], 'error': 'missing label file'})
                continue
            try:
                for n, line in enumerate(label.read_text(encoding='utf-8-sig').splitlines(), 1):
                    if not line.strip():
                        continue
                    parts = line.split()
                    if len(parts) != 5:
                        raise ValueError(f'line {n}: expected 5 columns')
                    cls = int(parts[0]); values = [float(x) for x in parts[1:]]
                    x, y, w, h = values
                    if not (0 <= cls < len(classes) and 0 <= x <= 1 and 0 <= y <= 1 and 0 < w <= 1 and 0 < h <= 1 and x-w/2 >= -1e-5 and x+w/2 <= 1+1e-5 and y-h/2 >= -1e-5 and y+h/2 <= 1+1e-5):
                        raise ValueError(f'line {n}: invalid class or bbox')
                    class_counts[cls] += 1
            except (ValueError, OSError) as e:
                errors.append({'image': row['image_rel'], 'error': str(e)})
        return {'images': len(rows), 'classes': dict(zip(classes, class_counts)), 'splits': split_counts, 'error_count': len(errors), 'errors': errors[:500]}


@app.get('/api/projects/{pid}/export')
def export_project(pid: int, request: Request):
    """Export the current project as a YOLO ZIP without changing originals."""
    with db_connect() as db:
        u = require_user(request, db)
        p, _ = project_access(db, u, pid)
        root = Path(p['dataset_root']).resolve()
        classes = json.loads(p['classes_json'])
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
            for row in db.execute('SELECT image_rel,label_rel FROM assets WHERE project_id=?', (pid,)):
                image, label = image_and_label_paths(p, row)
                if image.exists(): z.write(image, row['image_rel'])
                if label.exists(): z.write(label, row['label_rel'])
            data = {'path': '.', 'train': 'images/train', 'val': 'images/val', 'test': 'images/test', 'names': {i: name for i, name in enumerate(classes)}}
            z.writestr('data.yaml', yaml.safe_dump(data, sort_keys=False, allow_unicode=True))
        buf.seek(0)
        return StreamingResponse(iter([buf.getvalue()]), media_type='application/zip', headers={'Content-Disposition': f'attachment; filename="yolo_project_{pid}.zip"'})


@app.get('/api/projects/{pid}/assets')
def assets(pid:int, request:Request, q:str='',split:str='',state:str='', page:int=1,limit:int=48):
    with db_connect() as db:
        u=require_user(request,db);project_access(db,u,pid)
        page=max(1,page);limit=max(1,min(limit,200))
        # Escape LIKE wildcard characters.
        search='%' + q.replace('\\','\\\\').replace('%','\\%').replace('_','\\_') + '%'
        cond='project_id=? AND image_rel LIKE ? ESCAPE "\\"'
        vals=[pid,search]
        if split:
            cond+=' AND split=?'; vals.append(split)
        if state:
            cond+=' AND review_state=?'; vals.append(state)
        total=db.execute(f'SELECT count(*) FROM assets WHERE {cond}',vals).fetchone()[0]
        rows=db.execute(f'SELECT * FROM assets WHERE {cond} ORDER BY image_rel LIMIT ? OFFSET ?',
                        [*vals,limit,(page-1)*limit]).fetchall()
        return {'total':total,'page':page,'items':[asset_dict(db,row) for row in rows]}


@app.get('/api/projects/{pid}/assets/{aid}')
def asset_detail(pid:int,aid:int,request:Request):
    with db_connect() as db:
        u=require_user(request,db);p,role,a=asset_access(db,u,pid,aid)
        img,lab=image_and_label_paths(p,a)
        try:
            with Image.open(img) as im: width,height=im.size
        except (OSError,ValueError):
            fail(422,'Không đọc được file ảnh')
        boxes=parse_labels(lab,len(json.loads(p['classes_json'])))
        return {**asset_dict(db,a),'boxes':boxes,'width':width,'height':height,
                'role':role,'label_rel':a['label_rel']}


@app.get('/api/projects/{pid}/assets/{aid}/image')
def image_file(pid:int,aid:int,request:Request):
    with db_connect() as db:
        u=require_user(request,db);p,_,a=asset_access(db,u,pid,aid)
        img,_=image_and_label_paths(p,a)
        if not img.is_file():fail(404,'Ảnh không còn trên ổ đĩa')
        return FileResponse(img,headers={'Cache-Control':'private, max-age=60'})


@app.get('/api/projects/{pid}/assets/{aid}/thumbnail')
def thumb(pid:int,aid:int,request:Request):
    with db_connect() as db:
        u=require_user(request,db);p,_,a=asset_access(db,u,pid,aid)
        img,_=image_and_label_paths(p,a)
        try:
            with Image.open(img) as im:
                im=ImageOps.exif_transpose(im)
                im.thumbnail((460,320))
                data=io.BytesIO(); im.convert('RGB').save(data,'JPEG',quality=76)
                data.seek(0)
        except (OSError,ValueError):fail(422,'Không tạo được thumbnail')
        return StreamingResponse(data,media_type='image/jpeg',headers={'Cache-Control':'private,max-age=180'})


def assert_lease(a, user):
    if a['locked_by']!=user['id'] or (a['lock_until'] or 0) < now():
        fail(423,'Ảnh chưa được khóa cho bạn hoặc khóa đã hết hạn')


@app.post('/api/projects/{pid}/assets/{aid}/lock')
def acquire_lock(pid:int,aid:int,request:Request):
    with db_connect() as db:
        u=require_user(request,db);asset_access(db,u,pid,aid,'editor')
        db.execute('BEGIN IMMEDIATE')
        a=db.execute('SELECT * FROM assets WHERE id=? AND project_id=?',(aid,pid)).fetchone()
        if a['locked_by'] and a['locked_by'] != u['id'] and (a['lock_until'] or 0)>now():
            db.rollback()
            locker=db.execute('SELECT display_name FROM users WHERE id=?',(a['locked_by'],)).fetchone()
            fail(423,f"Ảnh đang được {locker['display_name'] if locker else 'người khác'} chỉnh sửa")
        until=now()+LEASE_SECONDS
        db.execute('UPDATE assets SET locked_by=?,lock_until=? WHERE id=?',(u['id'],until,aid))
        db.commit()
        return {'ok':True,'until':until}


@app.post('/api/projects/{pid}/assets/{aid}/unlock')
def release_lock(pid:int,aid:int,request:Request):
    with db_connect() as db:
        u=require_user(request,db);asset_access(db,u,pid,aid,'editor')
        db.execute('UPDATE assets SET locked_by=NULL,lock_until=NULL WHERE id=? AND locked_by=?',(aid,u['id']))
        return {'ok':True}


@app.patch('/api/projects/{pid}/assets/{aid}/annotations')
def save_annotation(pid:int,aid:int,data:SaveData,request:Request):
    if data.state not in ('todo','in_progress','reviewed'):
        fail(422,'Trạng thái review không hợp lệ')
    with db_connect() as db:
        u=require_user(request,db);p,_,a=asset_access(db,u,pid,aid,'editor')
        count=len(json.loads(p['classes_json']))
        lines=[]
        import math
        for box_index, b in enumerate(data.boxes, 1):
            x,y,w,h=b.x,b.y,b.w,b.h
            if b.cls<0 or b.cls>=count or not all(math.isfinite(v) for v in (x,y,w,h)) or not (
                0<=x<=1 and 0<=y<=1 and 0<w<=1 and 0<h<=1 and
                x-w/2>=-1e-5 and x+w/2<=1+1e-5 and y-h/2>=-1e-5 and y+h/2<=1+1e-5):
                fail(422, f'BBox #{box_index} hoặc class không hợp lệ: cls={b.cls}, x={x}, y={y}, w={w}, h={h}, số class={count}')
            lines.append(f'{b.cls} {x:.8f} {y:.8f} {w:.8f} {h:.8f}')
        db.execute('BEGIN IMMEDIATE')
        a=db.execute('SELECT * FROM assets WHERE id=? AND project_id=?',(aid,pid)).fetchone()
        assert_lease(a,u)
        if a['revision']!=data.revision:
            db.rollback(); fail(409,'Revision đã thay đổi, cần tải lại ảnh trước khi sửa')
        _,lab=image_and_label_paths(p,a)
        previous=lab.read_text(encoding='utf-8-sig') if lab.exists() else ''
        content='\n'.join(lines) + ('\n' if lines else '')
        try:
            lab.parent.mkdir(parents=True,exist_ok=True)
            # Backup original once before a first successful edit.
            backup=lab.with_suffix('.txt.bak')
            if lab.exists() and not backup.exists():
                import shutil
                shutil.copy2(lab,backup)
            tmp=None
            try:
                with tempfile.NamedTemporaryFile('w',encoding='utf-8',dir=lab.parent,
                                                 prefix='.yws-',suffix='.tmp',delete=False) as f:
                    tmp=Path(f.name);f.write(content);f.flush();os.fsync(f.fileno())
                try:
                    os.replace(tmp, lab)
                except PermissionError:
                    # Windows can reject replacing an existing file while a
                    # viewer/indexer briefly holds it open. Fall back to a
                    # normal write so an edit is not lost.
                    lab.write_text(content, encoding='utf-8')
            finally:
                if tmp and tmp.exists():tmp.unlink()
            db.execute('''UPDATE assets SET revision=revision+1,review_state=?,updated_by=?,updated_at=?,
                          reviewed_by=?, reviewed_at=? WHERE id=?''',
                       (data.state,u['id'],now(),u['id'] if data.state=='reviewed' else None,
                        now() if data.state=='reviewed' else None,aid))
            db.execute('INSERT INTO changes(asset_id,user_id,revision,previous_json,current_json,changed_at) VALUES(?,?,?,?,?,?)',
                       (aid,u['id'],a['revision']+1,previous,content,now()))
            db.commit()
        except OSError as e:
            db.rollback(); fail(500,f'Không lưu được file nhãn: {e}')
        return {'ok':True,'revision':a['revision']+1,'state':data.state}


@app.get('/api/projects/{pid}/assets/{aid}/history')
def history(pid:int,aid:int,request:Request):
    with db_connect() as db:
        u=require_user(request,db);asset_access(db,u,pid,aid)
        rows=db.execute('''SELECT c.revision,c.changed_at,u.display_name AS author
                           FROM changes c JOIN users u ON u.id=c.user_id
                           WHERE c.asset_id=? ORDER BY c.id DESC LIMIT 25''',(aid,)).fetchall()
        return [dict(x) for x in rows]


def init_admin(username, display_name):
    init_db()
    if not re.fullmatch(r'[a-z0-9_.-]{3,40}',username):
        raise SystemExit('Username phải có 3-40 ký tự a-z, 0-9, . _ -')
    password=getpass.getpass('Mật khẩu admin (ít nhất 10 ký tự): ')
    again=getpass.getpass('Nhập lại mật khẩu: ')
    if password!=again or len(password)<10:
        raise SystemExit('Mật khẩu không khớp hoặc ngắn hơn 10 ký tự')
    with db_connect() as db:
        try:
            db.execute('INSERT INTO users(username,display_name,password_hash,is_admin,created_at) VALUES(?,?,?,?,?)',
                       (username,display_name,password_hash(password),1,now()))
        except sqlite3.IntegrityError:
            raise SystemExit('Username đã tồn tại')
    print(f'Đã tạo admin: {username}')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('command',nargs='?',default='run',choices=['run','init-admin'])
    parser.add_argument('--username',default='admin')
    parser.add_argument('--name',default='Administrator')
    parser.add_argument('--host',default='127.0.0.1')
    parser.add_argument('--port',type=int,default=8765)
    args=parser.parse_args()
    if args.command=='init-admin':
        init_admin(args.username.strip().lower(),args.name.strip())
    else:
        import uvicorn
        print(f'YOLO Workspace Studio => http://{args.host}:{args.port}')
        uvicorn.run(app,host=args.host,port=args.port,workers=1,proxy_headers=False)
