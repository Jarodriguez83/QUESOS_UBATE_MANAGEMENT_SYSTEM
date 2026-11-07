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
from app.main import database, hash_password


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


class AuthenticationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with database() as db:
            db.execute("DELETE FROM users WHERE username IN ('auth_admin_test','auth_operator_test')")
            db.execute("""INSERT INTO users(username,password,role,name,cashierCode,status)
                VALUES(?,?,?,?,?,'Activo')""",
                ('auth_admin_test', hash_password('Admin-Test-873!'), 'ADMIN', 'Admin de prueba', 'AT-1'))
            db.execute("""INSERT INTO users(username,password,role,name,cashierCode,status)
                VALUES(?,?,?,?,?,'Activo')""",
                ('auth_operator_test', hash_password('Operator-Test-873!'), 'OPERATOR', 'Operador de prueba', 'OT-1'))

    def test_unauthenticated_user_cannot_open_protected_pages_or_mutate_catalog(self):
        with TestClient(app) as client:
            self.assertEqual(client.get('/inventory').status_code, 303)
            self.assertEqual(client.post('/inventory/create', data={
                'name': 'No autorizado', 'price': '1', 'cost': '1'
            }).status_code, 303)
            self.assertEqual(client.get('/workers').status_code, 303)

    def test_operator_can_use_pos_but_cannot_change_products_or_admin_settings(self):
        with TestClient(app) as client:
            login = client.post('/login', data={
                'cashier_code': 'OT-1', 'password': 'Operator-Test-873!', 'access_role': 'OPERATOR'
            })
            self.assertEqual(login.status_code, 303)
            self.assertEqual(client.get('/pos').status_code, 200)
            self.assertEqual(client.post('/inventory/create', data={
                'name': 'No autorizado', 'price': '1', 'cost': '1'
            }).status_code, 303)
            self.assertEqual(client.get('/workers').status_code, 303)
            self.assertEqual(client.get('/payment-confirmations').status_code, 303)

    def test_admin_can_open_administration_and_logout_invalidates_session(self):
        with TestClient(app) as client:
            login = client.post('/login', data={
                'cashier_code': 'AT-1', 'password': 'Admin-Test-873!', 'access_role': 'ADMIN'
            })
            self.assertEqual(login.status_code, 303)
            self.assertEqual(client.get('/workers').status_code, 200)
            self.assertEqual(client.get('/payment-confirmations').status_code, 200)
            self.assertEqual(client.post('/logout').status_code, 303)
            self.assertEqual(client.get('/workers').status_code, 303)

    def test_login_rejects_wrong_role_password_and_demo_credentials(self):
        with TestClient(app) as client:
            for data in (
                {'cashier_code': 'OT-1', 'password': 'Operator-Test-873!', 'access_role': 'ADMIN'},
                {'cashier_code': 'OT-1', 'password': 'wrong-password', 'access_role': 'OPERATOR'},
                {'cashier_code': 'ADMIN', 'password': 'ADMIN', 'access_role': 'ADMIN'},
            ):
                self.assertEqual(client.post('/login', data=data).status_code, 303)
                self.assertEqual(client.get('/workers').status_code, 303)


if __name__ == "__main__":
    unittest.main()
