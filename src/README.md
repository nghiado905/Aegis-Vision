# YOLO Studio modular source

Mã nguồn chính của ứng dụng. `server.py` ở thư mục gốc chỉ là launcher tương
thích cho lệnh chạy cũ; frontend được phục vụ trực tiếp từ `src/frontend`.

- `backend/`: API, nghiệp vụ, database và phân quyền.
- `frontend/`: API client, state, component dùng lại và các page.

Quyền truy cập được quyết định ở backend theo membership của từng workspace.
Các class YOLO như `Human`, `Head` hoặc `Visible Person` là dữ liệu của project,
không phải class phân quyền của hệ thống.
