# YOLO Workspace Studio — collaborative local labeling

Web-based YOLO **detection (bbox)** review tool (FastAPI + SQLite + HTML/CSS/JS). Stores images and YOLO `.txt` labels on the server machine. Not a cloud hosting service; you run the server yourself.

## 1. Start server

Python 3.10+ on the PC/Linux machine which **stores the dataset**:

```bash
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux:
# source .venv/bin/activate
pip install -r requirements.txt
python server.py init-admin --username admin --name Administrator
python server.py run --host 127.0.0.1 --port 8765
```

Open **http://127.0.0.1:8765** in browser; log in with the admin account you created.

### Collaboration via Tailscale

Install Tailscale on the host and all team members' machines; join the same tailnet, with access allowed by the tailnet ACL / grants. On the host, run:

```bash
python server.py run --host 0.0.0.0 --port 8765
```

Find its Tailscale IP using `tailscale ip -4`, e.g. `100.x.y.z`, then users open **http://100.x.y.z:8765**. The example IP is a placeholder, not the actual server IP. Scope host firewall access for port 8765 **only to the Tailscale interface / permitted team**; do not forward the router's port or expose this HTTP service on the public Internet. For additional HTTPS protection, put it behind Tailscale Serve with appropriate policy rather than opening a public port. Run the service on a trusted host, and create separate strong passwords per collaborator.

If teammates access via another computer, the dataset path is an **absolute path on the server**, not on the teammate's device. No upload is needed.

## 2. Review workflow

1. **Create Workspace** (e.g. AI Team).
2. **Import Project** with the server's dataset root, e.g. `D:\SDS\datasets\v10`.
3. The importer pairs `images/train/a.jpg` with `labels/train/a.txt` automatically; also works for `val`, `test`, and split-first datasets.
4. Admin creates users under **Members → Create account**; assign them to the workspace as Editor or Viewer.
5. An editor opens an image to acquire a short-lived editing lock. Drag/move/resize boxes, add/delete boxes and adjust classes.
6. Choose **Save** for a draft or click **Hoàn thành ✓** to save the YOLO txt, mark the image `reviewed`, attribute the reviewer and completion time, and go to the next image. All users can see ✓ reviewer from project cards/asset list after refreshing.
7. The **Review status** dropdown supports `To do`, `In progress`, `Reviewed`; **Version history** shows previous save authors/timestamps. Lock prevents simultaneous saves; the revision number detects conflicts.

YOLO label content is `class x_center y_center width height` with values normalized to 0–1. The original label is backed up once as `.txt.bak` before changes. Changes are saved directly to the dataset on disk; avoid external editing of `.txt` files during reviews.

## Notes / limitations

- Single Uvicorn worker (SQLite and filesystem coordination). Don't run multiple independent server instances pointing to the same dataset/database.
- Manual refresh to see teammates' newest statuses; no real-time push/websocket in this version.
- Annotation history records who saved, at what revision/time; it is not a complete file restore UI.
- Supported YOLO bounding boxes only. Not segmentation, pose or oriented boxes.
- Review status is a human workflow marker, not independent quality validation. Admin/editor can change a previously reviewed image, so use an additional QA process for verified datasets.
- Back up your dataset and `.studio_data/workspace.db` periodically.
