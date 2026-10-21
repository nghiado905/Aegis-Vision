# Thu ảnh video và tạo pseudo-label

## Cách hiểu luồng

Mỗi camera được đọc trong một worker riêng. Một lần inference tạo toàn bộ box rồi cấp kết quả cho ba chính sách lưu:

- `event`: xác nhận hành vi qua nhiều frame, lọc trùng theo hành vi + IoU + TTL.
- `periodic`: mỗi 30 giây so với buffer 5 frame **đã lưu** gần nhất.
- `periodic_unfiltered`: mỗi 3 phút lưu vô điều kiện để đo phân bố thật và recall.

`image_distance` là **distance**: `0` là giống nhau, số càng lớn càng khác. Frame được lưu khi distance lớn hơn hoặc bằng ngưỡng.

## Chạy thử với một video/camera

Sao chép và sửa `configs/video_collection.example.yaml`, đặc biệt là đường dẫn model, nguồn camera và `output_dir`.

```powershell
conda activate dots_ocr
cd D:\SDS\pipeline_training\yolo_workspace_studio\yolo_workspace_studio
python scripts\video_pseudo_collector.py --config configs\video_collection.example.yaml --camera class_03
```

Chạy tất cả camera bằng cách bỏ `--camera class_03`.

## Đầu ra

Mỗi frame tạo ba file cùng tên:

- `.jpg`: toàn bộ frame.
- `.txt`: pseudo-label YOLO detection.
- `.json`: metadata đầy đủ và mọi box.

`metadata.jsonl` gom metadata của tất cả frame. `skipped_events_<camera>.json` lưu số sự kiện bị lọc theo camera, hành vi và giờ.

## Hiệu chỉnh

Chạy thử từng camera trước. Xem phân bố `image_distance` rồi mới chốt `image_distance_threshold`. Nếu thiếu hành vi hiếm, giảm `behavior_confidence` hoặc `minimum_positive_frames`; nếu ảnh trùng nhiều, tăng TTL hoặc giảm ngưỡng IoU. `max_parallel_cameras` nên tăng dần theo VRAM.
