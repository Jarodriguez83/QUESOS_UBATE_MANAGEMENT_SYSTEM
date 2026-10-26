"""Application package; keep ``uvicorn app:app`` as the deployment entry point."""

from .main import app

__all__ = ["app"]
