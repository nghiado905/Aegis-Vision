"""Dataset import progress helpers."""
import os
import threading
import time
from pathlib import Path

SPLITS = {'train', 'val', 'valid', 'test'}


def collect_assets(root, image_dir, label_dir, mode, extensions, update):
    assets = []
    scanned = paired = missing = 0
    last = 0

    def report(current, force=False):
        nonlocal last
        if force or time.monotonic() - last >= .25:
            update(stage='scanning', message='Đang quét ảnh và ghép nhãn',
                   scanned=scanned, paired=paired, missing=missing, current=str(current))
            last = time.monotonic()

    def walk_error(exc):
        raise OSError(f'Không đọc được thư mục: {exc.filename}') from exc

    for directory, dirs, files in os.walk(image_dir, onerror=walk_error, followlinks=False):
        dirs[:] = sorted(d for d in dirs if not (Path(directory) / d).is_symlink())
        report(directory)
        for name in sorted(files):
            file = Path(directory) / name
            if file.suffix.lower() not in extensions or not file.resolve().is_relative_to(image_dir):
                continue
            relative = file.relative_to(image_dir)
            if mode == 'separate':
                label = label_dir / relative.with_suffix('.txt')
            elif mode == 'same_folder':
                label = file.with_suffix('.txt')
            else:
                parts = list(file.relative_to(root).parts)
                positions = [i for i, part in enumerate(parts[:-1]) if part.lower() == 'images']
                if positions:
                    parts[positions[-1]] = 'labels'
                    label = root / Path(*parts).with_suffix('.txt')
                elif mode == 'images':
                    label = root / 'labels' / 'inbox' / relative.with_suffix('.txt')
                else:
                    continue
            if not label.resolve().is_relative_to(label_dir if mode == 'separate' else root):
                raise ValueError(f'Nhãn nằm ngoài thư mục cho phép: {label}')
            scanned += 1
            exists = label.is_file()
            paired += int(exists)
            missing += int(not exists)
            split = next((p.lower() for p in relative.parts[:-1] if p.lower() in SPLITS), 'unsplit')
            if image_dir.name.lower() in SPLITS:
                split = image_dir.name.lower()
            assets.append((file.relative_to(root).as_posix(), label.relative_to(root).as_posix(), split))
            report(file)
            if scanned > 500000:
                raise ValueError('Dataset vượt quá 500.000 ảnh/project')
    report(image_dir, True)
    if not assets:
        raise ValueError('Không tìm thấy ảnh phù hợp. Kiểm tra thư mục và chế độ import.')
    if mode in ('labeled', 'split', 'separate') and missing:
        raise ValueError(f'Thiếu {missing}/{scanned} file nhãn YOLO. Tên và thư mục con phải khớp với ảnh.')
    splits = {'val' if s == 'valid' else s for _, _, s in assets if s in SPLITS}
    if mode == 'split' and len(splits) < 2:
        raise ValueError('Dataset split cần ít nhất hai tập, ví dụ train và val.')
    return assets


class ImportJobs:
    def __init__(self):
        self.lock = threading.Lock()
        self.jobs = {}

    def update(self, key, **values):
        with self.lock:
            self.jobs[key].update(values, updated_at=time.time())

    def snapshot(self, key):
        with self.lock:
            job = self.jobs.get(key)
            return dict(job) if job else None

    def start(self, key, owner, workspace, work):
        with self.lock:
            cutoff = time.time() - 86400
            self.jobs = {k: j for k, j in self.jobs.items()
                         if j['status'] == 'running' or j['updated_at'] >= cutoff}
            if sum(j['status'] == 'running' for j in self.jobs.values()) >= 2:
                raise ValueError('Đang có hai lượt import. Hãy chờ một lượt hoàn tất.')
            self.jobs[key] = dict(id=key, owner=owner, workspace=workspace, status='running',
                                  stage='queued', scanned=0, paired=0, missing=0, inserted=0,
                                  total=None, current='', message='Đang chuẩn bị import', updated_at=time.time())

        def run():
            try:
                result = work(lambda **values: self.update(key, **values))
                self.update(key, status='completed', stage='completed', result=result,
                            message='Import hoàn tất')
            except Exception as exc:
                detail = getattr(exc, 'detail', None) or str(exc)
                self.update(key, status='failed', stage='failed', message=str(detail))
        threading.Thread(target=run, name=f'dataset-import-{key}', daemon=True).start()
