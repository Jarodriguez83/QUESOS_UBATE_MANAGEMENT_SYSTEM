"""Runtime configuration loaded from environment variables."""

from dataclasses import dataclass
import os
from pathlib import Path
import secrets


@dataclass(frozen=True)
class Settings:
    root: Path
    data_dir: Path
    database_path: Path
    uploads_dir: Path
    session_secret: str
    cookie_https_only: bool


def load_settings() -> Settings:
    root = Path(__file__).resolve().parent.parent
    app_env = os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "")).strip().lower()
    default_data_dir = root / "backend" if app_env in {"production", "prod"} else root / ".local" / "dev-data"
    data_dir = Path(os.getenv("DATA_DIR", default_data_dir)).expanduser()
    database_path = Path(os.getenv("DATABASE_PATH", data_dir / "database.db")).expanduser()
    uploads_dir = Path(os.getenv("UPLOADS_DIR", data_dir / "uploads")).expanduser()
    session_secret = os.getenv("SESSION_SECRET")
    if app_env in {"production", "prod"} and not session_secret:
        raise RuntimeError("SESSION_SECRET must be set in production")
    return Settings(
        root=root,
        data_dir=data_dir,
        database_path=database_path,
        uploads_dir=uploads_dir,
        session_secret=session_secret or secrets.token_urlsafe(32),
        cookie_https_only=os.getenv("COOKIE_HTTPS_ONLY", "false").lower() == "true",
    )


settings = load_settings()
