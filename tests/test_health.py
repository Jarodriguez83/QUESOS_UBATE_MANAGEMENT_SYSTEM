import os
import secrets
import tempfile
import unittest
from pathlib import Path


# Import the application against an isolated SQLite file so the smoke test never
# initializes or mutates the developer's working database.
_test_data = tempfile.TemporaryDirectory(
    prefix=".quesos-fastapi-test-", dir=Path(__file__).resolve().parent,
)
_test_root = Path(_test_data.name)
os.environ["APP_ENV"] = "test"
os.environ["DATA_DIR"] = str(_test_root / "data")
os.environ["DATABASE_PATH"] = str(_test_root / "data" / "health-test.db")
os.environ["UPLOADS_DIR"] = str(_test_root / "uploads")
os.environ["SESSION_SECRET"] = secrets.token_urlsafe(32)

from fastapi.testclient import TestClient

from app import app
from app.config import settings


class HealthRouteTests(unittest.TestCase):
    def test_fastapi_starts_and_health_route_responds(self):
        with TestClient(app) as client:
            response = client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "status": "ok",
            "database": str(settings.database_path),
        })
        self.assertTrue(settings.database_path.exists())


if __name__ == "__main__":
    unittest.main()
