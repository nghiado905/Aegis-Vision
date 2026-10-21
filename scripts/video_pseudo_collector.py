"""Collect pseudo-labelled frames from videos, webcams or RTSP cameras.

One inference pass feeds three saving policies:
1. event: rare behavior events with temporal confirmation, IoU dedupe and TTL;
2. periodic: context/layout diversity against recently *saved* frames;
3. periodic_unfiltered: an unbiased frame every configured interval.
"""
from __future__ import annotations

import argparse
import json
import math
import threading
import time
import uuid
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import yaml
from ultralytics import YOLO


def norm(value: str) -> str:
    return str(value).strip().lower().replace('-', '_').replace(' ', '_')


def model_name(names: Any, index: int) -> str:
    return str(names[index] if isinstance(names, dict) else names[index])


def iou(a: list[float], b: list[float]) -> float:
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    return inter / max(area_a + area_b - inter, 1e-9)


def image_signature(frame: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.resize(gray, size, interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0


def image_distance(a: np.ndarray, b: np.ndarray) -> float:
    """Mean absolute pixel distance in [0, 1]; larger means more different."""
    return float(np.mean(np.abs(a - b)))


def layout_distance(current: list[list[float]], previous: list[list[float]]) -> float:
    """Order-independent bbox distance in [0, 1]; larger means more different."""
    if not current and not previous:
        return 0.0
    if not current or not previous:
        return 1.0
    forward = [max(iou(box, old) for old in previous) for box in current]
    backward = [max(iou(old, box) for box in current) for old in previous]
    return 1.0 - (sum(forward) + sum(backward)) / (len(forward) + len(backward))


@dataclass
class Candidate:
    behavior: str
    bbox: list[float]
    count: int
    last_seen: float


class Pipeline:
    def __init__(self, cfg: dict[str, Any], device: str | None = None):
        detector_cfg = cfg['detector']
        self.detector = YOLO(str(Path(detector_cfg['model']).expanduser()))
        self.detector_conf = float(detector_cfg.get('confidence', 0.25))
        self.device = device
        self.selected_detection = {norm(x): str(x) for x in detector_cfg.get('selected_classes', [])}
        self.person_classes = {norm(x) for x in cfg.get('person_classes', ['visible_person', 'person'])}
        self.groups: list[tuple[dict[str, Any], list[tuple[dict[str, Any], YOLO]]]] = []
        for group in cfg.get('classification_groups', []):
            classifiers = [(item, YOLO(str(Path(item['model']).expanduser()))) for item in group.get('classifiers', [])]
            self.groups.append((group, classifiers))
        self.priority = [str(x) for x in cfg.get('resolution', {}).get('priority', [])]
        self.model_version = str(cfg.get('model_version', 'unknown'))
        self.class_order = list(cfg.get('class_order', detector_cfg.get('selected_classes', [])))
        for _, classifiers in self.groups:
            for item, _ in classifiers:
                for name in item.get('selected_classes', []):
                    if name not in self.class_order:
                        self.class_order.append(name)
        self.class_ids = {name: index for index, name in enumerate(self.class_order)}
        self.inference_lock = threading.Lock()

    def infer(self, frame: np.ndarray) -> list[dict[str, Any]]:
        # Ultralytics model objects are shared to avoid loading one full model set
        # per camera. Serialize model calls; camera capture and save I/O remain parallel.
        with self.inference_lock:
            return self._infer(frame)

    def _infer(self, frame: np.ndarray) -> list[dict[str, Any]]:
        kwargs = {'conf': self.detector_conf, 'verbose': False}
        if self.device:
            kwargs['device'] = self.device
        result = self.detector.predict(frame, **kwargs)[0]
        height, width = frame.shape[:2]
        output = []
        for prediction in result.boxes:
            class_id = int(prediction.cls.item())
            raw_name = model_name(self.detector.names, class_id)
            detector_name = self.selected_detection.get(norm(raw_name))
            if detector_name is None:
                continue
            x1, y1, x2, y2 = map(float, prediction.xyxy[0].tolist())
            x1, y1 = max(0.0, x1), max(0.0, y1)
            x2, y2 = min(float(width), x2), min(float(height), y2)
            matched: dict[str, float] = {}
            for group, classifiers in self.groups:
                if norm(group.get('input_class', group.get('input', {}).get('class', ''))) != norm(detector_name):
                    continue
                crop = frame[int(y1):max(int(y1) + 1, int(y2)), int(x1):max(int(x1) + 1, int(x2))]
                if crop.size == 0:
                    continue
                for classifier_cfg, classifier in classifiers:
                    classify_kwargs = {'verbose': False}
                    if self.device:
                        classify_kwargs['device'] = self.device
                    classified = classifier.predict(crop, **classify_kwargs)[0]
                    if classified.probs is None:
                        continue
                    top1 = int(classified.probs.top1)
                    confidence = float(classified.probs.top1conf.item())
                    name = model_name(classifier.names, top1)
                    selected = {norm(x): str(x) for x in classifier_cfg.get('selected_classes', [])}
                    configured = selected.get(norm(name))
                    if configured and confidence >= float(classifier_cfg.get('confidence', 0.5)):
                        matched[configured] = confidence
            behavior = next((name for name in self.priority if name in matched), detector_name)
            behavior_conf = matched.get(behavior, 0.0)
            output.append({
                'bbox': [x1 / width, y1 / height, x2 / width, y2 / height],
                'bbox_pixels': [x1, y1, x2, y2],
                'person_conf': float(prediction.conf.item()),
                'detector_class': detector_name,
                'behavior': behavior,
                'behavior_conf': behavior_conf,
                'classifier_matches': matched,
            })
        return output


class CameraCollector:
    def __init__(self, camera_cfg: dict[str, Any], common: dict[str, Any], pipeline: Pipeline,
                 output: Path, write_lock: threading.Lock):
        self.cfg = {**common, **camera_cfg}
        self.camera = str(camera_cfg['id'])
        self.source = camera_cfg['source']
        self.pipeline = pipeline
        self.output = output
        self.write_lock = write_lock
        self.saved_events: list[dict[str, Any]] = []
        self.candidates: list[Candidate] = []
        self.periodic_buffer: deque[dict[str, Any]] = deque(maxlen=int(self.cfg['periodic']['buffer_size']))
        self.skipped = defaultdict(int)
        self.last_periodic = -math.inf
        self.last_unfiltered = 0.0

    def run(self) -> None:
        source = int(self.source) if isinstance(self.source, str) and self.source.isdigit() else self.source
        capture = cv2.VideoCapture(source)
        capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if not capture.isOpened():
            raise RuntimeError(f'Không mở được camera {self.camera}: {self.source}')
        fps = capture.get(cv2.CAP_PROP_FPS)
        fps = fps if fps and math.isfinite(fps) and fps > 0 else 25.0
        frame_index = 0
        started = time.time()
        try:
            while True:
                ok, frame = capture.read()
                if not ok:
                    if bool(self.cfg.get('reconnect', False)):
                        capture.release(); time.sleep(float(self.cfg.get('reconnect_delay_s', 3)))
                        capture = cv2.VideoCapture(source); continue
                    break
                frame_index += 1
                if frame_index % int(self.cfg.get('inference_stride', 1)):
                    continue
                video_ms = capture.get(cv2.CAP_PROP_POS_MSEC)
                elapsed = video_ms / 1000.0 if video_ms > 0 and not self.cfg.get('live', False) else time.time() - started
                boxes = self.pipeline.infer(frame)
                now_wall = datetime.now()
                trigger_indices = self.event_triggers(boxes, elapsed, now_wall)
                if trigger_indices:
                    self.save(frame, boxes, 'event', now_wall, trigger_indices)
                if elapsed - self.last_periodic >= float(self.cfg['periodic']['interval_s']):
                    self.last_periodic = elapsed
                    self.periodic(frame, boxes, now_wall)
                if elapsed - self.last_unfiltered >= float(self.cfg['unfiltered']['interval_s']):
                    self.last_unfiltered = elapsed
                    self.save(frame, boxes, 'periodic_unfiltered', now_wall, [])
        finally:
            capture.release()
            self.flush_skipped()

    def event_triggers(self, boxes: list[dict[str, Any]], elapsed: float, wall: datetime) -> list[int]:
        cfg = self.cfg['event']
        ttl = float(cfg['ttl_s'])
        iou_threshold = float(cfg['iou_threshold'])
        self.saved_events = [event for event in self.saved_events if elapsed - event['saved_at'] <= ttl]
        active = set()
        triggers = []
        event_behaviors = {norm(x) for x in cfg.get('behaviors', [])}
        for index, box in enumerate(boxes):
            behavior = str(box['behavior'])
            if event_behaviors and norm(behavior) not in event_behaviors:
                continue
            if float(box['behavior_conf']) < float(cfg['behavior_confidence']):
                continue
            best = None
            best_iou = 0.0
            for candidate_index, candidate in enumerate(self.candidates):
                if candidate_index in active:
                    continue
                score = iou(box['bbox'], candidate.bbox)
                if candidate.behavior == behavior and score > best_iou:
                    best, best_iou = candidate_index, score
            if best is not None and best_iou >= iou_threshold:
                candidate = self.candidates[best]
                candidate.count += 1; candidate.bbox = box['bbox']; candidate.last_seen = elapsed
                active.add(best)
            else:
                self.candidates.append(Candidate(behavior, box['bbox'], 1, elapsed))
                active.add(len(self.candidates) - 1)
                candidate = self.candidates[-1]
            if candidate.count < int(cfg['minimum_positive_frames']):
                continue
            duplicate = any(event['behavior'] == behavior and iou(event['bbox'], box['bbox']) >= iou_threshold
                            for event in self.saved_events)
            if duplicate:
                hour = wall.strftime('%Y-%m-%dT%H:00:00')
                self.skipped[(self.camera, behavior, hour)] += 1
            else:
                triggers.append(index)
                self.saved_events.append({'behavior': behavior, 'bbox': box['bbox'], 'saved_at': elapsed})
        stale = float(cfg.get('candidate_reset_s', 1.0))
        self.candidates = [c for c in self.candidates if elapsed - c.last_seen <= stale]
        return triggers

    def periodic(self, frame: np.ndarray, boxes: list[dict[str, Any]], wall: datetime) -> None:
        cfg = self.cfg['periodic']
        signature = image_signature(frame, tuple(cfg.get('signature_size', [160, 90])))
        person_boxes = [b['bbox'] for b in boxes if norm(b['detector_class']) in self.pipeline.person_classes]
        if not self.periodic_buffer:
            should_save = True
        else:
            image_diff = min(image_distance(signature, item['signature']) for item in self.periodic_buffer)
            layout_diff = min(layout_distance(person_boxes, item['boxes']) for item in self.periodic_buffer)
            count_diff = max(abs(len(person_boxes) - len(item['boxes'])) for item in self.periodic_buffer)
            should_save = (image_diff >= float(cfg['image_distance_threshold']) or
                           layout_diff >= float(cfg['layout_distance_threshold']) or
                           count_diff >= int(cfg['person_count_change']))
        if should_save:
            self.save(frame, boxes, 'periodic', wall, [])
            self.periodic_buffer.append({'signature': signature, 'boxes': person_boxes})

    def save(self, frame: np.ndarray, boxes: list[dict[str, Any]], stream: str,
             captured_at: datetime, trigger_indices: list[int]) -> None:
        frame_id = f'{self.camera}_{captured_at:%Y%m%d_%H%M%S_%f}_{uuid.uuid4().hex[:8]}'
        folder = self.output / self.camera / captured_at.strftime('%Y-%m-%d') / stream
        folder.mkdir(parents=True, exist_ok=True)
        image_path = folder / f'{frame_id}.jpg'
        label_path = folder / f'{frame_id}.txt'
        json_path = folder / f'{frame_id}.json'
        cv2.imwrite(str(image_path), frame, [cv2.IMWRITE_JPEG_QUALITY, int(self.cfg.get('jpeg_quality', 92))])
        yolo_lines = []
        for box in boxes:
            class_name = box['behavior'] if box['behavior'] in self.pipeline.class_ids else box['detector_class']
            class_id = self.pipeline.class_ids.get(class_name)
            if class_id is None:
                continue
            x1, y1, x2, y2 = box['bbox']
            yolo_lines.append(f'{class_id} {(x1+x2)/2:.8f} {(y1+y2)/2:.8f} {x2-x1:.8f} {y2-y1:.8f}')
        label_path.write_text('\n'.join(yolo_lines) + ('\n' if yolo_lines else ''), encoding='utf-8')
        metadata = {
            'frame_id': frame_id,
            'camera': self.camera,
            'timestamp': captured_at.strftime('%S:%M:%H_%d/%m/%Y'),
            'timestamp_iso': captured_at.isoformat(),
            'stream': stream,
            'model_version': self.pipeline.model_version,
            'image': str(image_path.relative_to(self.output)).replace('\\', '/'),
            'label': str(label_path.relative_to(self.output)).replace('\\', '/'),
            'image_size': {'width': int(frame.shape[1]), 'height': int(frame.shape[0])},
            'boxes': boxes,
            'trigger_box_idx': trigger_indices[0] if trigger_indices else None,
            'trigger_box_indices': trigger_indices,
            'neighbor_frames': [],
        }
        json_text = json.dumps(metadata, ensure_ascii=False)
        json_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
        with self.write_lock:
            with (self.output / 'metadata.jsonl').open('a', encoding='utf-8') as handle:
                handle.write(json_text + '\n')
        self.flush_skipped()

    def flush_skipped(self) -> None:
        records = [
            {'camera': camera, 'behavior': behavior, 'hour': hour, 'count': count}
            for (camera, behavior, hour), count in sorted(self.skipped.items())
        ]
        target = self.output / f'skipped_events_{self.camera}.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')


def main() -> None:
    parser = argparse.ArgumentParser(description='Collect diverse pseudo-labelled classroom frames')
    parser.add_argument('--config', required=True, type=Path)
    parser.add_argument('--camera', action='append', help='Run only selected camera id; repeatable')
    args = parser.parse_args()
    config = yaml.safe_load(args.config.read_text(encoding='utf-8'))
    output = Path(config['output_dir']).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    pipeline = Pipeline(config['pipeline'], config.get('device'))
    cameras = [camera for camera in config['cameras'] if not args.camera or str(camera['id']) in args.camera]
    if not cameras:
        raise SystemExit('Không có camera phù hợp trong config')
    write_lock = threading.Lock()
    workers = min(len(cameras), int(config.get('max_parallel_cameras', len(cameras))))
    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix='camera') as pool:
        futures = [pool.submit(CameraCollector(camera, config['defaults'], pipeline, output, write_lock).run)
                   for camera in cameras]
        for camera, future in zip(cameras, futures):
            try:
                future.result()
            except Exception as exc:
                print(f"[ERROR] camera={camera['id']}: {exc}", flush=True)


if __name__ == '__main__':
    main()
