from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class Settings:
    project_root: Path = Path(__file__).resolve().parents[3]
    data_dir: Path = Path(
        os.environ.get("YOLO_STUDIO_DATA", Path(__file__).resolve().parents[3] / ".studio_data")
    ).expanduser().resolve()
    session_seconds: int = 60 * 60 * 24 * 7
    lease_seconds: int = 180


settings = Settings()
