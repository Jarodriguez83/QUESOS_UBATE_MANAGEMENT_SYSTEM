"""Create a consistent SQLite snapshot and copy the configured uploads folder."""

import argparse
from datetime import datetime, timezone
from contextlib import closing
import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]


def configured_path(key, default, values):
    raw = os.getenv(key) or values.get(key) or default
    path = Path(raw).expanduser()
    return path if path.is_absolute() else ROOT / path


def create_backup(database_path: Path, uploads_path: Path, destination: Path) -> Path:
    if not database_path.is_file():
        raise FileNotFoundError(f"No existe la base configurada: {database_path}")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup_dir = destination / f"quesos-backup-{stamp}"
    backup_dir.mkdir(parents=True, exist_ok=False)
    backup_db = backup_dir / "database.sqlite3"

    with closing(sqlite3.connect(database_path)) as source, closing(sqlite3.connect(backup_db)) as target:
        source.backup(target)
        result = target.execute("PRAGMA integrity_check").fetchone()[0]
        if result != "ok":
            raise sqlite3.DatabaseError(f"La copia no pasó integrity_check: {result}")

    backup_uploads = backup_dir / "uploads"
    if uploads_path.is_dir():
        shutil.copytree(uploads_path, backup_uploads)
    else:
        backup_uploads.mkdir()
    (backup_dir / "manifest.json").write_text(json.dumps({
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "database_source": str(database_path),
        "uploads_source": str(uploads_path),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    return backup_dir


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--destination", type=Path, default=ROOT / ".local" / "backups")
    args = parser.parse_args()

    values = dotenv_values(args.env_file) if args.env_file.is_file() else {}
    data_dir = configured_path("DATA_DIR", str(ROOT / ".local" / "dev-data"), values)
    database_path = configured_path("DATABASE_PATH", str(data_dir / "database.db"), values)
    uploads_path = configured_path("UPLOADS_DIR", str(data_dir / "uploads"), values)
    destination = args.destination.expanduser()
    if not destination.is_absolute():
        destination = ROOT / destination
    destination.mkdir(parents=True, exist_ok=True)

    try:
        backup_dir = create_backup(database_path, uploads_path, destination)
    except (OSError, sqlite3.Error) as error:
        print(f"Error al crear el respaldo: {error}", file=sys.stderr)
        return 1
    print(f"Respaldo creado y verificado: {backup_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
