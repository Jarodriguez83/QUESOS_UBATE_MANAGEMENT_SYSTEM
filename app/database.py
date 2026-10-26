"""Centralized SQLite connection and transaction handling."""

from contextlib import contextmanager
import sqlite3
from typing import Iterator

from .config import settings


@contextmanager
def get_db_connection() -> Iterator[sqlite3.Connection]:
    """Yield the configured SQLite connection and commit or roll back atomically."""
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(settings.database_path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
