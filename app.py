"""FastAPI entry point for the server-rendered Quesos Ubaté application."""

from __future__ import annotations

import os
import re
import json
import base64
import asyncio
import html as html_lib
import urllib.parse
import urllib.request
import hashlib
import hmac
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator
from zoneinfo import ZoneInfo

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware


ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("DATA_DIR", ROOT / "backend")).expanduser()
DB_PATH = Path(os.getenv("DATABASE_PATH", DATA_DIR / "database.db")).expanduser()
UPLOADS_DIR = Path(os.getenv("UPLOADS_DIR", ROOT / "static" / "uploads")).expanduser()
app = FastAPI(title="Quesos Ubaté | Punto de venta")
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", "change-this-secret-before-deployment"),
    same_site="lax",
    https_only=os.getenv("COOKIE_HTTPS_ONLY", "false").lower() == "true",
)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
templates = Jinja2Templates(directory=ROOT / "templates")


@contextmanager
def database() -> Iterator[sqlite3.Connection]:
    """Open the existing SQLite file and commit or roll back as one unit."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
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


def initialize_database() -> None:
    """Create compatible tables without replacing existing application data."""
    with database() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL, role TEXT NOT NULL, name TEXT NOT NULL,
                cashierCode TEXT, document TEXT, phone TEXT,
                status TEXT DEFAULT 'Activo', createdDate TEXT
            );
            CREATE TABLE IF NOT EXISTS workers (
                id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT NOT NULL,
                middle_name TEXT, last_name TEXT NOT NULL, second_last_name TEXT,
                identification_type TEXT NOT NULL, identification_number TEXT NOT NULL UNIQUE,
                phone TEXT, photo TEXT, email TEXT, birth_date TEXT,
                contract_type TEXT, status TEXT NOT NULL DEFAULT 'Activo',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS worker_shifts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
                shift_date TEXT NOT NULL, shift_type TEXT NOT NULL,
                UNIQUE(worker_id, shift_date)
            );
            CREATE TABLE IF NOT EXISTS payments (
                id TEXT PRIMARY KEY, bank_name TEXT NOT NULL, client_name TEXT NOT NULL,
                amount REAL NOT NULL, reference TEXT, payment_date TEXT,
                received_at TEXT NOT NULL, raw_body TEXT, status TEXT DEFAULT 'PROCESADO'
            );
            CREATE TABLE IF NOT EXISTS payment_email_settings (
                id INTEGER PRIMARY KEY CHECK(id=1), gmail_email TEXT NOT NULL,
                sender_email TEXT NOT NULL, regex_client TEXT NOT NULL,
                regex_amount TEXT NOT NULL, client_id TEXT NOT NULL,
                client_secret TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS parsers (
                id INTEGER PRIMARY KEY AUTOINCREMENT, bank_name TEXT UNIQUE NOT NULL,
                sender_email TEXT NOT NULL, subject_pattern TEXT NOT NULL,
                regex_client TEXT NOT NULL, regex_amount TEXT NOT NULL,
                regex_reference TEXT NOT NULL, regex_date TEXT NOT NULL,
                is_active INTEGER DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS gmail_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL,
                level TEXT NOT NULL, message TEXT NOT NULL, details TEXT
            );
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sku TEXT UNIQUE,
                category TEXT, price REAL NOT NULL, cost REAL NOT NULL,
                stock REAL NOT NULL DEFAULT 0, min_stock REAL DEFAULT 2,
                unit TEXT DEFAULT 'Unidad', is_active INTEGER DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS product_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                is_active INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS suppliers (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
                nit TEXT, phone TEXT, email TEXT, contact_name TEXT,
                products_supplied TEXT, details TEXT, is_active INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS sales (
                id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_number TEXT UNIQUE NOT NULL,
                client_name TEXT DEFAULT 'Cliente General', client_document TEXT,
                total REAL NOT NULL, payment_method TEXT NOT NULL,
                payment_reference TEXT, created_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Activa'
            );
            CREATE TABLE IF NOT EXISTS sale_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id), quantity REAL NOT NULL,
                unit_price REAL NOT NULL, subtotal REAL NOT NULL,
                tax_rate REAL NOT NULL DEFAULT 0, tax_amount REAL NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS purchases (
                id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_id INTEGER REFERENCES suppliers(id),
                total REAL NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cash_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                concept TEXT NOT NULL CHECK(concept IN ('VENTA','PROVEEDOR','PAGADO')),
                amount REAL NOT NULL CHECK(amount >= 0),
                description TEXT NOT NULL,
                supplier_name TEXT,
                occurred_at TEXT NOT NULL,
                source_sale_id INTEGER UNIQUE REFERENCES sales(id),
                source_purchase_id INTEGER UNIQUE REFERENCES purchases(id),
                supplier_id INTEGER REFERENCES suppliers(id),
                paid_name TEXT,
                paid_detail TEXT,
                deleted_at TEXT
            );
            CREATE TABLE IF NOT EXISTS cash_closures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_number TEXT UNIQUE NOT NULL,
                period_start TEXT NOT NULL,
                closed_at TEXT NOT NULL,
                cashier_name TEXT NOT NULL,
                total_cash REAL NOT NULL,
                net_sales REAL NOT NULL,
                paid_total REAL NOT NULL,
                cash_on_hand REAL NOT NULL,
                cash_income REAL NOT NULL,
                transfer_income REAL NOT NULL,
                total_income REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS purchase_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                purchase_id INTEGER REFERENCES purchases(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id), quantity REAL NOT NULL,
                unit_price REAL NOT NULL
            );
            """
        )
        user_columns = {row["name"] for row in db.execute("PRAGMA table_info(users)")}
        for column, definition in {
            "cashierCode": "TEXT",
            "document": "TEXT",
            "phone": "TEXT",
            "status": "TEXT DEFAULT 'Activo'",
            "createdDate": "TEXT",
        }.items():
            if column not in user_columns:
                db.execute(f"ALTER TABLE users ADD COLUMN {column} {definition}")
        if "worker_id" not in user_columns:
            db.execute("ALTER TABLE users ADD COLUMN worker_id INTEGER REFERENCES workers(id)")
        sale_columns = {row["name"] for row in db.execute("PRAGMA table_info(sales)")}
        for column, definition in {
            "discount": "REAL NOT NULL DEFAULT 0",
            "amount_paid": "REAL NOT NULL DEFAULT 0",
            "change_due": "REAL NOT NULL DEFAULT 0",
            "cashier_name": "TEXT",
            "status": "TEXT NOT NULL DEFAULT 'Activa'",
        }.items():
            if column not in sale_columns:
                db.execute(f"ALTER TABLE sales ADD COLUMN {column} {definition}")
        item_columns = {row["name"] for row in db.execute("PRAGMA table_info(sale_items)")}
        for column, definition in {"tax_rate": "REAL NOT NULL DEFAULT 0", "tax_amount": "REAL NOT NULL DEFAULT 0"}.items():
            if column not in item_columns:
                db.execute(f"ALTER TABLE sale_items ADD COLUMN {column} {definition}")
        supplier_columns = {row["name"] for row in db.execute("PRAGMA table_info(suppliers)")}
        for column, definition in {
            "products_supplied": "TEXT",
            "details": "TEXT",
            "is_active": "INTEGER NOT NULL DEFAULT 1",
        }.items():
            if column not in supplier_columns:
                db.execute(f"ALTER TABLE suppliers ADD COLUMN {column} {definition}")
        transaction_columns = {row["name"] for row in db.execute("PRAGMA table_info(cash_transactions)")}
        for column, definition in {
            "supplier_id": "INTEGER REFERENCES suppliers(id)",
            "paid_name": "TEXT",
            "paid_detail": "TEXT",
            "payment_id": "TEXT REFERENCES payments(id)",
        }.items():
            if column not in transaction_columns:
                db.execute(f"ALTER TABLE cash_transactions ADD COLUMN {column} {definition}")
        db.execute("""INSERT OR IGNORE INTO cash_transactions(concept,amount,description,occurred_at,source_sale_id)
            SELECT 'VENTA',total,'Factura ' || invoice_number,created_at,id FROM sales WHERE status!='Anulada'""")
        db.execute("""INSERT OR IGNORE INTO cash_transactions(concept,amount,description,supplier_name,occurred_at,source_purchase_id,supplier_id)
            SELECT 'PROVEEDOR',p.total,'Compra a proveedor',s.name,p.created_at,p.id,p.supplier_id
            FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id""")
        for row in db.execute("SELECT DISTINCT category FROM products WHERE TRIM(COALESCE(category,'')) != ''"):
            db.execute("INSERT OR IGNORE INTO product_categories(name) VALUES(?)", (row["category"].strip(),))
        if db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            today = datetime.now().date().isoformat()
            db.executemany(
                """INSERT INTO users
                   (username,password,role,name,cashierCode,document,phone,status,createdDate)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                [
                    ("admin_queuba", os.getenv("INITIAL_ADMIN_PASSWORD", "ADM - 999"), "ADMIN", "Carlos Gómez (Admin)", "ADM-001", "80.123.456", "320 998 7766", "Activo", today),
                    ("caja_queuba", os.getenv("INITIAL_OPERATOR_PASSWORD", "OPE - 123"), "OPERATOR", "Juan Rodríguez", "CJ-101", "1.069.452.880", "314 589 2244", "Activo", today),
                ],
            )
        legacy_accounts = db.execute("""SELECT * FROM users WHERE worker_id IS NULL
            AND UPPER(role) IN ('OPERATOR','OPERADOR','CAJERO','OPERARIO')""").fetchall()
        for account in legacy_accounts:
            parts = (account["name"] or account["username"]).split()
            first_name = parts[0] if parts else account["username"]
            last_name = parts[-1] if len(parts) > 1 else "Pendiente"
            middle_name = " ".join(parts[1:-1]) or None
            document = account["document"] or f"LEGACY-{account['id']}"
            if db.execute("SELECT 1 FROM workers WHERE identification_number=?", (document,)).fetchone():
                document = f"LEGACY-{account['id']}"
            cursor = db.execute("""INSERT INTO workers(first_name,middle_name,last_name,identification_type,
                identification_number,phone,email,birth_date,contract_type,status,created_at)
                VALUES(?,?,?,'Otro',?,?,NULL,'','Pendiente',?,?)""",
                (first_name, middle_name, last_name, document,
                 account["phone"], account["status"] or "Activo", account["createdDate"] or datetime.now(timezone.utc).isoformat()))
            db.execute("UPDATE users SET worker_id=? WHERE id=?", (cursor.lastrowid, account["id"]))
        if db.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
            db.executemany(
                """INSERT INTO products (name,sku,category,price,cost,stock,min_stock,unit)
                   VALUES (?,?,?,?,?,?,?,?)""",
                [("Queso Campesino Ubaté", "Q001", "Quesos", 14000, 9500, 24, 5, "Bloque"),
                 ("Colaciones de Ubaté Caja", "A001", "Acompañantes", 10000, 6500, 14, 4, "Caja")],
            )
        for row in db.execute("SELECT DISTINCT category FROM products WHERE TRIM(COALESCE(category,'')) != ''"):
            db.execute("INSERT OR IGNORE INTO product_categories(name) VALUES(?)", (row["category"].strip(),))


@app.on_event("startup")
async def on_startup() -> None:
    initialize_database()
    asyncio.create_task(gmail_poll_loop())


def google_request(url: str, *, data: dict | None = None, token: str | None = None):
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    headers = {"Content-Type": "application/x-www-form-urlencoded"} if data is not None else {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode())


def gmail_access_token():
    with database() as db:
        settings = db.execute("SELECT * FROM payment_email_settings WHERE id=1").fetchone()
        saved = db.execute("SELECT value FROM gmail_config WHERE key='oauth_token'").fetchone()
    if not settings or not saved:
        return None
    tokens = json.loads(saved["value"])
    if tokens.get("expires_at", 0) < int(datetime.now(timezone.utc).timestamp()) + 60:
        if not tokens.get("refresh_token"):
            return None
        refreshed = google_request("https://oauth2.googleapis.com/token", data={
            "client_id": settings["client_id"], "client_secret": settings["client_secret"],
            "refresh_token": tokens["refresh_token"], "grant_type": "refresh_token"})
        tokens.update(refreshed)
        tokens["expires_at"] = int(datetime.now(timezone.utc).timestamp()) + int(refreshed.get("expires_in", 3600))
        with database() as db:
            db.execute("INSERT OR REPLACE INTO gmail_config(key,value) VALUES('oauth_token',?)", (json.dumps(tokens),))
    return tokens.get("access_token")


def decode_gmail_body(payload):
    texts = []
    def walk(part):
        if part.get("mimeType") in {"text/plain", "text/html"} and part.get("body", {}).get("data"):
            raw = part["body"]["data"]
            decoded = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)).decode("utf-8", "replace")
            if part.get("mimeType") == "text/html":
                decoded = re.sub(r"<(style|script)[^>]*>[\s\S]*?</\1>", " ", decoded, flags=re.I)
                decoded = re.sub(r"<\s*(br|/p|/div|/li)[^>]*>", "\n", decoded, flags=re.I)
                decoded = re.sub(r"<[^>]+>", " ", decoded)
                decoded = html_lib.unescape(decoded)
            texts.append(decoded)
        for child in part.get("parts", []):
            walk(child)
    walk(payload)
    return "\n".join(texts)


def extract_group(text: str, pattern: str):
    match = re.search(pattern, text, re.IGNORECASE)
    return (match.group(1) if match and match.lastindex else match.group(0) if match else "").strip()


def amount_from_email(value: str) -> float:
    cleaned = re.sub(r"[^0-9.,]", "", value)
    if not cleaned:
        return 0
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".") if cleaned.rfind(",") > cleaned.rfind(".") else cleaned.replace(",", "")
    elif "," in cleaned or "." in cleaned:
        sep = "," if "," in cleaned else "."
        chunks = cleaned.split(sep)
        cleaned = "".join(chunks) if len(chunks[-1]) == 3 else ".".join(chunks)
    try:
        return float(cleaned)
    except ValueError:
        return 0


def interpret_payment_email(subject: str, body: str, settings):
    """Classify from message meaning and extract likely customer and transfer amount."""
    text = f"{subject}\n{body}"
    normalized = text.casefold()
    positive = re.search(r"\b(recibiste|recibió|recibimos|has recibido|te llegó|te enviaron|te transfirieron|te consignaron|recibiste una transferencia|transferencia recibida|transferencia exitosa|transferencia a tu cuenta|pago recibido|pago exitoso|pago confirmado|abono recibido|abono a tu cuenta|consignación recibida|se acreditó|dinero recibido)\b", normalized)
    negative = re.search(r"\b(enviaste|envió|transferiste|pagaste|compra realizada|pago enviado|transferencia enviada|transferencia rechazada|pago rechazado|operación fallida|transacción fallida|no se pudo|pendiente de pago|solicitud de pago)\b", normalized)
    if not positive or negative:
        return {"is_payment": False, "client": "No aplica", "amount": 0}

    raw_amount = extract_group(text, settings["regex_amount"]) if settings["regex_amount"].strip() else ""
    if not raw_amount:
        amount_patterns = (
            r"(?:valor|monto|total recibido|importe|abono|por valor de|recibiste)\s*(?:del?|de)?\s*[:\-]?\s*(?:COP|COL\$|\$)?\s*([0-9][0-9.,]*)",
            r"(?:COP|COL\$|\$)\s*([0-9][0-9.,]*)",
        )
        for pattern in amount_patterns:
            raw_amount = extract_group(text, pattern)
            if raw_amount:
                break
    amount = amount_from_email(raw_amount)
    if amount <= 0:
        return {"is_payment": True, "client": "Cliente por identificar", "amount": 0}

    client = extract_group(text, settings["regex_client"]) if settings["regex_client"].strip() else ""
    if not client:
        client_pattern = r"(?:de parte de|remitente|nombre del cliente|cliente|te envió|te envio|recibiste de)\s*[:\-]?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+){0,4})"
        client = extract_group(text, client_pattern)
    if client:
        client = re.split(r"\s+(?:por|el día|a tu cuenta|desde tu cuenta)\b", client, maxsplit=1, flags=re.I)[0].strip(" .,:;-\n")
    return {"is_payment": True, "client": client or "Cliente por identificar", "amount": amount}


async def poll_gmail_once():
    try:
        token = await asyncio.to_thread(gmail_access_token)
        if not token:
            return
        with database() as db:
            settings = db.execute("SELECT * FROM payment_email_settings WHERE id=1").fetchone()
        if not settings:
            return
        query = urllib.parse.quote("newer_than:2d -in:sent -in:trash -in:spam")
        messages = []
        page_token = None
        for _ in range(5):
            page_url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages?q={query}&maxResults=100"
            if page_token:
                page_url += "&pageToken=" + urllib.parse.quote(page_token)
            listing = await asyncio.to_thread(google_request, page_url, token=token)
            messages.extend(listing.get("messages", []))
            page_token = listing.get("nextPageToken")
            if not page_token:
                break
        for item in messages:
            with database() as db:
                if db.execute("SELECT 1 FROM payments WHERE id=?", (item["id"],)).fetchone():
                    continue
            msg = await asyncio.to_thread(google_request, f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{item['id']}?format=full", token=token)
            headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
            body = decode_gmail_body(msg.get("payload", {}))
            interpreted = interpret_payment_email(headers.get("subject", ""), body, settings)
            received = datetime.fromtimestamp(int(msg.get("internalDate", 0))/1000, ZoneInfo("America/Bogota")).isoformat()
            status = "PROCESADO" if interpreted["is_payment"] and interpreted["amount"] > 0 else "PAGO_POR_REVISAR" if interpreted["is_payment"] else "NO_ES_PAGO"
            amount = interpreted["amount"]
            client = interpreted["client"]
            with database() as db:
                db.execute("INSERT OR IGNORE INTO payments(id,bank_name,client_name,amount,reference,payment_date,received_at,raw_body,status) VALUES(?,?,?,?,?,?,?,?,?)",
                    (item["id"], headers.get("from", "Remitente desconocido")[:160], client, amount, headers.get("subject", "")[:160], received, datetime.now(timezone.utc).isoformat(), body, status))
                if db.execute("SELECT changes()").fetchone()[0]:
                    if status == "PROCESADO":
                        db.execute("INSERT INTO cash_transactions(concept,amount,description,occurred_at,payment_id) VALUES('VENTA',?,?,?,?)",
                            (amount, f"Transferencia confirmada · {client}", received, item["id"]))
                    db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)", (datetime.now(timezone.utc).isoformat(), "INFO", f"Correo clasificado {status}: {client} · {amount:.2f}"))
    except Exception as exc:
        with database() as db:
            db.execute("INSERT INTO audit_logs(timestamp,level,message,details) VALUES(?,?,?,?)", (datetime.now(timezone.utc).isoformat(), "ERROR", "Error al revisar Gmail para confirmación de pagos", str(exc)[:500]))


async def gmail_poll_loop():
    while True:
        try:
            await poll_gmail_once()
        except Exception:
            pass
        await asyncio.sleep(30)


def current_user(request: Request):
    return request.session.get("user")


def render(request: Request, page: str, **context):
    return templates.TemplateResponse(
        request=request,
        name=page,
        context={"user": current_user(request), **context},
    )


def require_login(request: Request):
    if not current_user(request):
        return RedirectResponse("/login", status_code=303)
    return None


@app.get("/")
def home(request: Request):
    if not current_user(request):
        return RedirectResponse("/login", status_code=303)
    if current_user(request)["role"] == "ADMIN":
        return RedirectResponse("/dashboard", status_code=303)
    return RedirectResponse("/pos", status_code=303)


@app.get("/login")
def login_page(request: Request, error: str | None = None):
    if current_user(request):
        return RedirectResponse("/", status_code=303)
    return render(request, "login.html", error=error)


def normalize_password(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", value.strip().upper())


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 240_000)
    return f"pbkdf2_sha256${salt.hex()}${digest.hex()}"


def verify_password(stored: str, supplied: str) -> bool:
    if stored.startswith("pbkdf2_sha256$"):
        try:
            _, salt_hex, digest_hex = stored.split("$", 2)
            digest = hashlib.pbkdf2_hmac("sha256", supplied.encode("utf-8"), bytes.fromhex(salt_hex), 240_000)
            return hmac.compare_digest(digest.hex(), digest_hex)
        except (ValueError, TypeError):
            return False
    return normalize_password(stored) == normalize_password(supplied)


def normalize_role(value: str | None) -> str | None:
    role = (value or "").strip().upper()
    if role in {"ADMIN", "ADMINISTRADOR", "ADMINISTRATOR"}:
        return "ADMIN"
    if role in {"OPERATOR", "OPERADOR", "CAJERO", "OPERARIO"}:
        return "OPERATOR"
    return None


@app.post("/login")
def login(
    request: Request,
    cashier_code: str = Form(...),
    password: str = Form(...),
    access_role: str = Form("OPERATOR"),
):
    selected_role = normalize_role(access_role)
    if selected_role is None:
        return RedirectResponse("/login?error=Selecciona%20un%20tipo%20de%20acceso%20válido", status_code=303)
    # The requested ADMIN/ADMIN credentials are accepted only in administrator mode.
    if (
        selected_role == "ADMIN"
        and cashier_code.strip().upper() == "ADMIN"
        and password.strip().upper() == "ADMIN"
    ):
        request.session["user"] = {
            "id": 0, "name": "ADMINISTRADOR", "username": "ADMIN",
            "cashierCode": "ADMIN", "role": "ADMIN",
        }
        with database() as db:
            db.execute(
                "INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                (datetime.now(timezone.utc).isoformat(), "INFO", "Inicio de sesión del administrador principal"),
            )
        return RedirectResponse("/dashboard", status_code=303)
    with database() as db:
        user = db.execute(
            "SELECT * FROM users WHERE UPPER(username)=UPPER(?) OR UPPER(cashierCode)=UPPER(?)",
            (cashier_code.strip(), cashier_code.strip()),
        ).fetchone()
    if not user or not verify_password(user["password"], password):
        return RedirectResponse("/login?error=Credenciales%20incorrectas", status_code=303)
    if user["status"] == "Inactivo":
        return RedirectResponse("/login?error=La%20cuenta%20está%20inactiva", status_code=303)
    account_role = normalize_role(user["role"])
    if account_role != selected_role:
        return RedirectResponse(
            "/login?error=El%20tipo%20de%20acceso%20no%20coincide%20con%20tu%20cuenta",
            status_code=303,
        )
    request.session["user"] = {
        "id": user["id"], "name": user["name"], "username": user["username"],
        "cashierCode": user["cashierCode"], "role": account_role,
    }
    with database() as db:
        db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                   (datetime.now(timezone.utc).isoformat(), "INFO", f"Inicio de sesión: {user['name']}"))
    return RedirectResponse("/", status_code=303)


@app.post("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/login", status_code=303)


@app.get("/pos")
def pos_page(request: Request, message: str | None = None):
    redirect = require_login(request)
    if redirect:
        return redirect
    with database() as db:
        products = db.execute("SELECT * FROM products WHERE is_active=1 ORDER BY name").fetchall()
        recent_sales = db.execute("SELECT * FROM sales WHERE status!='Anulada' ORDER BY id DESC LIMIT 8").fetchall()
        categories = db.execute("SELECT name FROM product_categories WHERE is_active=1 ORDER BY name COLLATE NOCASE").fetchall()
    return render(request, "pos.html", products=products, categories=categories, recent_sales=recent_sales, message=message)


@app.post("/sales")
async def create_sale(request: Request):
    redirect = require_login(request)
    if redirect:
        return redirect
    form = await request.form()
    try:
        cart = __import__("json").loads(str(form.get("cart", "[]")))
        if not cart:
            raise ValueError("Agrega productos a la venta")
        payment_method = str(form.get("payment_method") or "Efectivo")
        if payment_method not in {"Efectivo", "Transferencia", "Tarjeta", "Nequi", "Daviplata"}:
            raise ValueError("Selecciona una forma de pago válida")
        with database() as db:
            db.execute("BEGIN IMMEDIATE")
            total = 0.0
            normalized = []
            for item in cart:
                product = db.execute("SELECT * FROM products WHERE id=? AND is_active=1", (int(item["id"]),)).fetchone()
                quantity = float(item["quantity"])
                if not product or quantity <= 0 or quantity > float(product["stock"]):
                    raise ValueError("Producto o cantidad inválidos")
                price = float(product["price"])
                subtotal = price * quantity
                total += subtotal
                normalized.append((product, quantity, price, subtotal))
            discount = round(float(form.get("discount") or 0), 2)
            if discount < 0 or discount > total:
                raise ValueError("El descuento debe estar entre cero y el subtotal")
            tax = 0.0
            final_total = round(total - discount + tax, 2)
            try:
                amount_paid = round(float(form.get("amount_paid") or 0), 2)
            except ValueError:
                raise ValueError("Ingresa un valor de pago válido")
            if payment_method != "Efectivo" and amount_paid <= 0:
                amount_paid = final_total
            if amount_paid < final_total:
                raise ValueError("El valor recibido no alcanza a cubrir el total")
            change_due = round(amount_paid - final_total, 2) if payment_method == "Efectivo" else 0
            number = db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] + 1
            invoice = f"FV-{number:05d}"
            created_at = datetime.now(ZoneInfo("America/Bogota")).isoformat()
            cashier_name = current_user(request)["name"]
            cursor = db.execute(
                """INSERT INTO sales(invoice_number,client_name,client_document,total,payment_method,payment_reference,created_at,
                   discount,amount_paid,change_due,cashier_name) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                (invoice, str(form.get("client_name") or "Cliente General"), str(form.get("client_document") or "") or None,
                 final_total, payment_method, str(form.get("payment_reference") or "") or None, created_at,
                 discount, amount_paid, change_due, cashier_name),
            )
            db.execute("""INSERT INTO cash_transactions(concept,amount,description,occurred_at,source_sale_id)
                VALUES('VENTA',?,?,?,?)""",
                (final_total, f"Factura {invoice} · {str(form.get('client_name') or 'Cliente General').strip()}", created_at, cursor.lastrowid))
            for product, quantity, price, subtotal in normalized:
                db.execute("""INSERT INTO sale_items(sale_id,product_id,quantity,unit_price,subtotal,tax_rate,tax_amount)
                    VALUES(?,?,?,?,?,0,0)""", (cursor.lastrowid, product["id"], quantity, price, subtotal))
                db.execute("UPDATE products SET stock=stock-? WHERE id=?", (quantity, product["id"]))
            db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                       (created_at, "INFO", f"Venta facturada: {invoice}, total {final_total:.2f}"))
        return RedirectResponse(f"/sales/{cursor.lastrowid}/receipt", status_code=303)
    except (ValueError, KeyError, TypeError) as error:
        return RedirectResponse(f"/pos?message={str(error).replace(' ', '%20')}", status_code=303)


@app.get("/sales/{sale_id}/receipt")
def sale_receipt(request: Request, sale_id: int):
    redirect = require_login(request)
    if redirect:
        return redirect
    with database() as db:
        sale = db.execute("SELECT * FROM sales WHERE id=?", (sale_id,)).fetchone()
        items = db.execute("""SELECT si.*,p.name,p.unit FROM sale_items si
            LEFT JOIN products p ON p.id=si.product_id WHERE si.sale_id=? ORDER BY si.id""", (sale_id,)).fetchall()
    if not sale:
        return RedirectResponse("/pos?message=Factura%20no%20encontrada", status_code=303)
    try:
        sold_at = datetime.fromisoformat(sale["created_at"])
    except (TypeError, ValueError):
        sold_at = datetime.now(ZoneInfo("America/Bogota"))
    subtotal = sum(float(item["subtotal"]) for item in items)
    taxes = sum(float(item["tax_amount"] or 0) for item in items)
    return render(request, "receipt.html", sale=sale, items=items, subtotal=subtotal, taxes=taxes,
                  sold_date=sold_at.strftime("%d/%m/%Y"), sold_time=sold_at.strftime("%I:%M %p"))


@app.get("/suppliers")
def suppliers_page(request: Request, message: str | None = None):
    redirect = admin_only(request)
    if redirect:
        return redirect
    with database() as db:
        suppliers = db.execute("SELECT * FROM suppliers ORDER BY is_active DESC,name COLLATE NOCASE").fetchall()
    return render(request, "suppliers.html", suppliers=suppliers, message=message)


@app.post("/suppliers/create")
def create_supplier(request: Request, name: str = Form(...), products_supplied: str = Form(""),
                    details: str = Form(""), phone: str = Form("")):
    redirect = admin_only(request)
    if redirect:
        return redirect
    name = name.strip()
    if not name or len(name) > 140:
        return RedirectResponse("/suppliers?message=El%20nombre%20de%20la%20empresa%20es%20obligatorio", status_code=303)
    with database() as db:
        if db.execute("SELECT 1 FROM suppliers WHERE UPPER(name)=UPPER(?)", (name,)).fetchone():
            return RedirectResponse("/suppliers?message=Ya%20existe%20un%20proveedor%20con%20ese%20nombre", status_code=303)
        db.execute("INSERT INTO suppliers(name,products_supplied,details,phone) VALUES(?,?,?,?)",
                   (name, products_supplied.strip() or None, details.strip() or None, phone.strip() or None))
        db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                   (datetime.now(timezone.utc).isoformat(), "INFO", f"Proveedor registrado: {name}"))
    return RedirectResponse("/suppliers?message=Proveedor%20registrado", status_code=303)


@app.post("/suppliers/{supplier_id}/edit")
def update_supplier(request: Request, supplier_id: int, name: str = Form(...),
                    products_supplied: str = Form(""), details: str = Form(""), phone: str = Form("")):
    redirect = admin_only(request)
    if redirect:
        return redirect
    name = name.strip()
    if not name or len(name) > 140:
        return RedirectResponse("/suppliers?message=El%20nombre%20de%20la%20empresa%20es%20obligatorio", status_code=303)
    with database() as db:
        duplicate = db.execute("SELECT id FROM suppliers WHERE UPPER(name)=UPPER(?) AND id!=?", (name, supplier_id)).fetchone()
        if duplicate:
            return RedirectResponse("/suppliers?message=Ya%20existe%20un%20proveedor%20con%20ese%20nombre", status_code=303)
        result = db.execute("""UPDATE suppliers SET name=?,products_supplied=?,details=?,phone=?
            WHERE id=? AND is_active=1""", (name, products_supplied.strip() or None, details.strip() or None,
                                                 phone.strip() or None, supplier_id))
        if not result.rowcount:
            return RedirectResponse("/suppliers?message=Proveedor%20no%20encontrado%20o%20inactivo", status_code=303)
        db.execute("UPDATE cash_transactions SET supplier_name=? WHERE supplier_id=? AND deleted_at IS NULL", (name, supplier_id))
        db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                   (datetime.now(timezone.utc).isoformat(), "INFO", f"Proveedor actualizado: ID {supplier_id}"))
    return RedirectResponse("/suppliers?message=Proveedor%20actualizado", status_code=303)


@app.post("/suppliers/{supplier_id}/delete")
def deactivate_supplier(request: Request, supplier_id: int):
    redirect = admin_only(request)
    if redirect:
        return redirect
    with database() as db:
        result = db.execute("UPDATE suppliers SET is_active=0 WHERE id=? AND is_active=1", (supplier_id,))
        if result.rowcount:
            db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                       (datetime.now(timezone.utc).isoformat(), "INFO", f"Proveedor desactivado: ID {supplier_id}"))
    return RedirectResponse("/suppliers?message=Proveedor%20desactivado", status_code=303)


@app.post("/suppliers/{supplier_id}/activate")
def activate_supplier(request: Request, supplier_id: int):
    redirect = admin_only(request)
    if redirect:
        return redirect
    with database() as db:
        db.execute("UPDATE suppliers SET is_active=1 WHERE id=?", (supplier_id,))
    return RedirectResponse("/suppliers?message=Proveedor%20reactivado", status_code=303)


@app.get("/paid")
def paid_page(request: Request, message: str | None = None):
    redirect = admin_only(request)
    if redirect:
        return redirect
    with database() as db:
        suppliers = db.execute("SELECT id,name,products_supplied FROM suppliers WHERE is_active=1 ORDER BY name COLLATE NOCASE").fetchall()
        transactions = db.execute("""SELECT t.*,s.name AS linked_supplier FROM cash_transactions t
            LEFT JOIN suppliers s ON s.id=t.supplier_id
            WHERE t.concept IN ('PROVEEDOR','PAGADO') AND t.deleted_at IS NULL
            ORDER BY t.occurred_at DESC,t.id DESC""").fetchall()
    paid_transactions = []
    for row in transactions:
        transaction = dict(row)
        moment = datetime.fromisoformat(transaction["occurred_at"])
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=ZoneInfo("America/Bogota"))
        transaction["local_datetime"] = moment.astimezone(ZoneInfo("America/Bogota")).strftime("%Y-%m-%dT%H:%M")
        transaction["date_label"] = moment.astimezone(ZoneInfo("America/Bogota")).strftime("%d/%m/%Y %I:%M %p")
        paid_transactions.append(transaction)
    return render(request, "paid.html", suppliers=suppliers, transactions=paid_transactions, message=message,
                  now_local=datetime.now(ZoneInfo("America/Bogota")).strftime("%Y-%m-%dT%H:%M"))


@app.post("/paid/create")
def create_paid(request: Request, payment_type: str = Form(...), amount: float = Form(...),
                paid_detail: str = Form(...), supplier_id: int | None = Form(None), paid_name: str = Form("")):
    redirect = admin_only(request)
    if redirect:
        return redirect
    payment_type = payment_type.strip().upper()
    paid_detail = paid_detail.strip()
    paid_name = paid_name.strip()
    if amount <= 0 or not paid_detail:
        return RedirectResponse("/paid?message=Ingresa%20un%20detalle%20y%20un%20monto%20mayor%20a%20cero", status_code=303)
    now = datetime.now(ZoneInfo("America/Bogota")).isoformat()
    with database() as db:
        if payment_type == "PROVEEDOR":
            supplier = db.execute("SELECT * FROM suppliers WHERE id=? AND is_active=1", (supplier_id,)).fetchone()
            if not supplier:
                return RedirectResponse("/paid?message=Selecciona%20un%20proveedor%20activo", status_code=303)
            purchase_id = db.execute("INSERT INTO purchases(supplier_id,total,created_at) VALUES(?,?,?)",
                                     (supplier["id"], amount, now)).lastrowid
            description = f"Pago a proveedor: {supplier['name']}"
            db.execute("""INSERT INTO cash_transactions(concept,amount,description,supplier_name,occurred_at,
                source_purchase_id,supplier_id,paid_detail) VALUES('PROVEEDOR',?,?,?,?,?,?,?)""",
                (amount, description, supplier["name"], now, purchase_id, supplier["id"], paid_detail))
        elif payment_type == "OTRO_CONCEPTO":
            if not paid_name:
                return RedirectResponse("/paid?message=Ingresa%20el%20nombre%20del%20pagado", status_code=303)
            db.execute("""INSERT INTO cash_transactions(concept,amount,description,occurred_at,paid_name,paid_detail)
                VALUES('PAGADO',?,?,?,?,?)""", (amount, paid_name, now, paid_name, paid_detail))
        else:
            return RedirectResponse("/paid?message=Selecciona%20un%20tipo%20de%20pagado%20válido", status_code=303)
        db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                   (now, "INFO", f"Pagado registrado: {payment_type}, {amount:.2f}"))
    return RedirectResponse("/paid?message=Pagado%20registrado%20y%20agregado%20a%20Transacciones", status_code=303)


@app.post("/paid/{transaction_id}/edit")
def update_paid(request: Request, transaction_id: int, amount: float = Form(...),
                paid_detail: str = Form(...), supplier_id: int | None = Form(None), paid_name: str = Form("")):
    redirect = admin_only(request)
    if redirect:
        return redirect
    paid_detail = paid_detail.strip()
    paid_name = paid_name.strip()
    if amount <= 0 or not paid_detail:
        return RedirectResponse("/paid?message=El%20detalle%20es%20obligatorio%20y%20el%20monto%20debe%20ser%20mayor%20a%20cero", status_code=303)
    with database() as db:
        transaction = db.execute("SELECT * FROM cash_transactions WHERE id=? AND deleted_at IS NULL AND concept IN ('PROVEEDOR','PAGADO')", (transaction_id,)).fetchone()
        if not transaction:
            return RedirectResponse("/paid?message=Pagado%20no%20encontrado", status_code=303)
        if transaction["concept"] == "PROVEEDOR":
            supplier = db.execute("SELECT * FROM suppliers WHERE id=? AND is_active=1", (supplier_id,)).fetchone()
            if not supplier:
                return RedirectResponse("/paid?message=Selecciona%20un%20proveedor%20activo", status_code=303)
            description = f"Pago a proveedor: {supplier['name']}"
            db.execute("UPDATE purchases SET total=?,supplier_id=? WHERE id=?",
                       (amount, supplier["id"], transaction["source_purchase_id"]))
            db.execute("""UPDATE cash_transactions SET amount=?,description=?,supplier_name=?,supplier_id=?,paid_detail=?
                WHERE id=?""", (amount, description, supplier["name"], supplier["id"], paid_detail, transaction_id))
        else:
            if not paid_name:
                return RedirectResponse("/paid?message=Ingresa%20el%20nombre%20del%20pagado", status_code=303)
            db.execute("""UPDATE cash_transactions SET amount=?,description=?,paid_name=?,paid_detail=? WHERE id=?""",
                       (amount, paid_name, paid_name, paid_detail, transaction_id))
        db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                   (datetime.now(timezone.utc).isoformat(), "INFO", f"Pagado actualizado: ID {transaction_id}"))
    return RedirectResponse("/paid?message=Pagado%20actualizado", status_code=303)


@app.post("/paid/{transaction_id}/delete")
def delete_paid(request: Request, transaction_id: int):
    redirect = admin_only(request)
    if redirect:
        return redirect
    now = datetime.now(ZoneInfo("America/Bogota")).isoformat()
    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        transaction = db.execute("""SELECT * FROM cash_transactions WHERE id=? AND deleted_at IS NULL
            AND concept IN ('PROVEEDOR','PAGADO')""", (transaction_id,)).fetchone()
        if not transaction:
            return RedirectResponse("/paid?message=Pagado%20no%20encontrado", status_code=303)
        db.execute("UPDATE cash_transactions SET deleted_at=? WHERE id=?", (now, transaction_id))
        if transaction["payment_id"]:
            db.execute("UPDATE payments SET status='ANULADO' WHERE id=?", (transaction["payment_id"],))
        db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                   (now, "INFO", f"Pagado eliminado: ID {transaction_id}"))
    return RedirectResponse("/paid?message=Pagado%20eliminado%20y%20reflejado%20en%20Transacciones", status_code=303)


@app.get("/transactions")
def transactions_page(request: Request, concept: str | None = None, show_deleted: bool = False, message: str | None = None):
    redirect = admin_only(request)
    if redirect:
        return redirect
    if concept not in {None, "VENTA", "PROVEEDOR", "PAGADO"}:
        concept = None
    where = []
    params = []
    if not show_deleted:
        where.append("t.deleted_at IS NULL")
    if concept:
        where.append("t.concept=?")
        params.append(concept)
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    with database() as db:
        transactions = db.execute(f"""SELECT t.*,s.invoice_number,s.status AS sale_status
            FROM cash_transactions t LEFT JOIN sales s ON s.id=t.source_sale_id
            {where_sql} ORDER BY t.occurred_at DESC,t.id DESC""", params).fetchall()
        totals = db.execute("""SELECT COALESCE(SUM(CASE WHEN concept='VENTA' AND deleted_at IS NULL THEN amount ELSE 0 END),0) AS income,
            COALESCE(SUM(CASE WHEN concept IN ('PROVEEDOR','PAGADO') AND deleted_at IS NULL THEN amount ELSE 0 END),0) AS expense
            FROM cash_transactions""").fetchone()
    now_local = datetime.now(ZoneInfo("America/Bogota")).strftime("%Y-%m-%dT%H:%M")
    local_transactions = []
    for row in transactions:
        item = dict(row)
        try:
            moment = datetime.fromisoformat(item["occurred_at"])
            if moment.tzinfo is None:
                moment = moment.replace(tzinfo=ZoneInfo("America/Bogota"))
            moment = moment.astimezone(ZoneInfo("America/Bogota"))
        except (TypeError, ValueError):
            moment = datetime.now(ZoneInfo("America/Bogota"))
        item["local_datetime"] = moment.strftime("%Y-%m-%dT%H:%M")
        item["date_label"] = moment.strftime("%d/%m/%Y")
        item["time_label"] = moment.strftime("%I:%M %p")
        local_transactions.append(item)
    return render(request, "transactions.html", transactions=local_transactions, totals=totals, concept=concept,
                  show_deleted=show_deleted, message=message, now_local=now_local)


@app.post("/transactions/{transaction_id}/delete")
def delete_cash_transaction(request: Request, transaction_id: int):
    redirect = admin_only(request)
    if redirect:
        return redirect
    now = datetime.now(ZoneInfo("America/Bogota")).isoformat()
    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        transaction = db.execute("SELECT * FROM cash_transactions WHERE id=? AND deleted_at IS NULL", (transaction_id,)).fetchone()
        if not transaction:
            return RedirectResponse("/transactions?message=Movimiento%20no%20encontrado%20o%20ya%20eliminado", status_code=303)
        if transaction["concept"] == "VENTA" and transaction["source_sale_id"]:
            sale = db.execute("SELECT status,invoice_number FROM sales WHERE id=?", (transaction["source_sale_id"],)).fetchone()
            if sale and sale["status"] != "Anulada":
                for item in db.execute("SELECT product_id,quantity FROM sale_items WHERE sale_id=?", (transaction["source_sale_id"],)):
                    if item["product_id"]:
                        db.execute("UPDATE products SET stock=stock+? WHERE id=?", (item["quantity"], item["product_id"]))
                db.execute("UPDATE sales SET status='Anulada' WHERE id=?", (transaction["source_sale_id"],))
        db.execute("UPDATE cash_transactions SET deleted_at=? WHERE id=?", (now, transaction_id))
        db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                   (now, "INFO", f"Movimiento de caja eliminado/anulado: ID {transaction_id}"))
    return RedirectResponse("/transactions?message=Movimiento%20eliminado%20del%20libro%20de%20caja", status_code=303)


@app.get("/inventory")
def inventory_page(request: Request, message: str | None = None):
    redirect = require_login(request)
    if redirect:
        return redirect
    with database() as db:
        products = db.execute("SELECT * FROM products WHERE is_active=1 ORDER BY name").fetchall()
        categories = db.execute("SELECT * FROM product_categories ORDER BY is_active DESC, name COLLATE NOCASE").fetchall()
        active_categories = [category for category in categories if category["is_active"]]
    return render(request, "inventory.html", products=products, categories=categories,
                  active_categories=active_categories, message=message)


def admin_only(request: Request):
    if not current_user(request):
        return RedirectResponse("/login", status_code=303)
    if current_user(request)["role"] != "ADMIN":
        return RedirectResponse("/inventory?message=Solo%20el%20administrador%20puede%20modificar%20productos", status_code=303)
    return None


@app.get("/payment-confirmations")
def payment_confirmations_page(request: Request, message: str | None = None):
    redirect = admin_only(request)
    if redirect:
        return redirect
    with database() as db:
        settings = db.execute("SELECT * FROM payment_email_settings WHERE id=1").fetchone()
        connected = db.execute("SELECT 1 FROM gmail_config WHERE key='oauth_token'").fetchone() is not None
        payments = db.execute("SELECT * FROM payments ORDER BY received_at DESC LIMIT 300").fetchall()
        total = db.execute("SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='PROCESADO'").fetchone()[0]
    return render(request, "payment_confirmations.html", settings=settings, connected=connected,
                  payments=payments, total=total, message=message)


@app.post("/payment-confirmations/connect")
def payment_confirmations_connect(request: Request, gmail_email: str = Form(...), sender_email: str = Form(""),
        regex_client: str = Form(""), regex_amount: str = Form(""), client_id: str = Form(...), client_secret: str = Form(...)):
    redirect = admin_only(request)
    if redirect:
        return redirect
    gmail_email = gmail_email.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", gmail_email):
        return RedirectResponse("/payment-confirmations?message=Revisa%20el%20correo%20que%20se%20conectará", status_code=303)
    try:
        if regex_client.strip(): re.compile(regex_client, re.I)
        if regex_amount.strip(): re.compile(regex_amount, re.I)
    except re.error:
        return RedirectResponse("/payment-confirmations?message=Las%20reglas%20de%20lectura%20no%20son%20válidas", status_code=303)
    with database() as db:
        db.execute("INSERT OR REPLACE INTO payment_email_settings(id,gmail_email,sender_email,regex_client,regex_amount,client_id,client_secret) VALUES(1,?,?,?,?,?,?)",
            (gmail_email, sender_email.strip().lower(), regex_client.strip(), regex_amount.strip(), client_id.strip(), client_secret.strip()))
        db.execute("DELETE FROM gmail_config WHERE key='oauth_token'")
    state = secrets.token_urlsafe(24)
    request.session["gmail_oauth_state"] = state
    with database() as db:
        config = db.execute("SELECT client_id FROM payment_email_settings WHERE id=1").fetchone()
    callback = str(request.url_for("gmail_callback"))
    params = urllib.parse.urlencode({"client_id": config["client_id"], "redirect_uri": callback,
        "response_type": "code", "scope": "https://www.googleapis.com/auth/gmail.readonly",
        "access_type": "offline", "prompt": "consent", "state": state})
    return RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth?" + params, status_code=303)


@app.get("/gmail/callback", name="gmail_callback")
def gmail_callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None):
    redirect = admin_only(request)
    if redirect:
        return redirect
    if error or not code or not state or not hmac.compare_digest(state, request.session.pop("gmail_oauth_state", "")):
        return RedirectResponse("/payment-confirmations?message=No%20se%20pudo%20autorizar%20Gmail", status_code=303)
    with database() as db:
        settings = db.execute("SELECT * FROM payment_email_settings WHERE id=1").fetchone()
    try:
        tokens = google_request("https://oauth2.googleapis.com/token", data={"code": code, "client_id": settings["client_id"],
            "client_secret": settings["client_secret"], "redirect_uri": str(request.url_for("gmail_callback")), "grant_type": "authorization_code"})
        tokens["expires_at"] = int(datetime.now(timezone.utc).timestamp()) + int(tokens.get("expires_in", 3600))
        profile = google_request("https://gmail.googleapis.com/gmail/v1/users/me/profile", token=tokens["access_token"])
        if profile.get("emailAddress", "").lower() != settings["gmail_email"]:
            raise ValueError("La cuenta Google autorizada no coincide con el correo configurado")
        with database() as db:
            db.execute("INSERT OR REPLACE INTO gmail_config(key,value) VALUES('oauth_token',?)", (json.dumps(tokens),))
    except Exception as exc:
        return RedirectResponse("/payment-confirmations?message=" + urllib.parse.quote(str(exc)[:180]), status_code=303)
    return RedirectResponse("/payment-confirmations?message=Correo%20conectado%20y%20verificado", status_code=303)


@app.post("/payment-confirmations/disconnect")
def payment_confirmations_disconnect(request: Request):
    redirect = admin_only(request)
    if redirect:
        return redirect
    with database() as db:
        db.execute("DELETE FROM gmail_config WHERE key='oauth_token'")
    return RedirectResponse("/payment-confirmations?message=Correo%20desconectado", status_code=303)


@app.post("/categories/create")
def create_category(request: Request, name: str = Form(...)):
    redirect = admin_only(request)
    if redirect:
        return redirect
    name = name.strip()
    if not name or len(name) > 60:
        return RedirectResponse("/inventory?message=El%20nombre%20de%20sección%20debe%20tener%20entre%201%20y%2060%20caracteres", status_code=303)
    try:
        with database() as db:
            db.execute("INSERT INTO product_categories(name) VALUES(?)", (name,))
    except sqlite3.IntegrityError:
        return RedirectResponse("/inventory?message=Ya%20existe%20una%20sección%20con%20ese%20nombre", status_code=303)
    return RedirectResponse("/inventory?message=Sección%20creada", status_code=303)


@app.post("/categories/{category_id}/delete")
def delete_category(request: Request, category_id: int):
    redirect = admin_only(request)
    if redirect:
        return redirect
    with database() as db:
        category = db.execute("SELECT name FROM product_categories WHERE id=?", (category_id,)).fetchone()
        if category:
            if category["name"].casefold() == "otros":
                return RedirectResponse("/inventory?message=La%20sección%20Otros%20no%20se%20puede%20eliminar", status_code=303)
            db.execute("INSERT OR IGNORE INTO product_categories(name) VALUES('Otros')")
            db.execute("UPDATE products SET category='Otros' WHERE category=? COLLATE NOCASE", (category["name"],))
            db.execute("DELETE FROM product_categories WHERE id=?", (category_id,))
    return RedirectResponse("/inventory?message=Sección%20eliminada%3B%20sus%20productos%20se%20movieron%20a%20Otros", status_code=303)


@app.get("/inventory/new")
def new_product_page(request: Request):
    redirect = require_login(request)
    if redirect:
        return redirect
    redirect = admin_only(request)
    if redirect:
        return redirect
    with database() as db:
        categories = db.execute("SELECT name FROM product_categories WHERE is_active=1 ORDER BY name COLLATE NOCASE").fetchall()
    return render(request, "product_form.html", product=None, mode="create", categories=categories)


@app.post("/inventory/create")
def create_product(request: Request, name: str = Form(...), price: float = Form(...), cost: float = Form(...),
                   sku: str = Form(""), category: str = Form("Otros"), stock: float = Form(0),
                   min_stock: float = Form(2), unit: str = Form("Unidad")):
    redirect = admin_only(request)
    if redirect:
        return redirect
    if price < 0 or cost < 0 or stock < 0 or min_stock < 0:
        return RedirectResponse("/inventory?message=Los%20valores%20no%20pueden%20ser%20negativos", status_code=303)
    try:
        with database() as db:
            if not db.execute("SELECT 1 FROM product_categories WHERE name=? COLLATE NOCASE AND is_active=1", (category.strip(),)).fetchone():
                return RedirectResponse("/inventory?message=Selecciona%20una%20sección%20activa", status_code=303)
            db.execute("INSERT INTO products(name,sku,category,price,cost,stock,min_stock,unit) VALUES(?,?,?,?,?,?,?,?)",
                       (name.strip(), sku.strip() or None, category.strip() or "Otros", price, cost, stock, min_stock, unit.strip() or "Unidad"))
            db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                       (datetime.now(timezone.utc).isoformat(), "INFO", f"Producto registrado: {name.strip()}"))
    except sqlite3.IntegrityError:
        return RedirectResponse("/inventory?message=El%20SKU%20ya%20está%20en%20uso", status_code=303)
    return RedirectResponse("/inventory?message=Producto%20guardado", status_code=303)


@app.get("/inventory/{product_id}")
def product_detail(request: Request, product_id: int):
    redirect = require_login(request)
    if redirect:
        return redirect
    with database() as db:
        product = db.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
    if not product:
        return RedirectResponse("/inventory?message=Producto%20no%20encontrado", status_code=303)
    return render(request, "product_detail.html", product=product)


@app.get("/inventory/{product_id}/edit")
def edit_product_page(request: Request, product_id: int):
    redirect = admin_only(request)
    if redirect:
        return redirect
    with database() as db:
        product = db.execute("SELECT * FROM products WHERE id=? AND is_active=1", (product_id,)).fetchone()
        categories = db.execute("SELECT name FROM product_categories WHERE is_active=1 ORDER BY name COLLATE NOCASE").fetchall()
    if not product:
        return RedirectResponse("/inventory?message=Producto%20no%20encontrado", status_code=303)
    return render(request, "product_form.html", product=product, mode="edit", categories=categories)


@app.post("/inventory/{product_id}/edit")
def update_product(request: Request, product_id: int, name: str = Form(...), price: float = Form(...), cost: float = Form(...),
                   sku: str = Form(""), category: str = Form("Otros"), stock: float = Form(0),
                   min_stock: float = Form(2), unit: str = Form("Unidad")):
    redirect = admin_only(request)
    if redirect:
        return redirect
    if price < 0 or cost < 0 or stock < 0 or min_stock < 0:
        return RedirectResponse("/inventory?message=Los%20valores%20no%20pueden%20ser%20negativos", status_code=303)
    try:
        with database() as db:
            if not db.execute("SELECT 1 FROM product_categories WHERE name=? COLLATE NOCASE AND is_active=1", (category.strip(),)).fetchone():
                return RedirectResponse("/inventory?message=Selecciona%20una%20sección%20activa", status_code=303)
            result = db.execute(
                """UPDATE products SET name=?,sku=?,category=?,price=?,cost=?,stock=?,min_stock=?,unit=?
                   WHERE id=? AND is_active=1""",
                (name.strip(), sku.strip() or None, category.strip() or "Otros", price, cost, stock, min_stock,
                 unit.strip() or "Unidad", product_id),
            )
            if result.rowcount == 0:
                return RedirectResponse("/inventory?message=Producto%20no%20encontrado", status_code=303)
            db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                       (datetime.now(timezone.utc).isoformat(), "INFO", f"Producto actualizado: {name.strip()} (ID {product_id})"))
    except sqlite3.IntegrityError:
        return RedirectResponse("/inventory?message=El%20SKU%20ya%20está%20en%20uso", status_code=303)
    return RedirectResponse("/inventory?message=Producto%20actualizado", status_code=303)


@app.post("/inventory/{product_id}/delete")
def delete_product(request: Request, product_id: int):
    redirect = admin_only(request)
    if redirect:
        return redirect
    with database() as db:
        product = db.execute("SELECT name FROM products WHERE id=? AND is_active=1", (product_id,)).fetchone()
        if product:
            db.execute("UPDATE products SET is_active=0 WHERE id=?", (product_id,))
            db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                       (datetime.now(timezone.utc).isoformat(), "INFO", f"Producto desactivado: {product['name']} (ID {product_id})"))
    return RedirectResponse("/inventory?message=Producto%20eliminado%20del%20catálogo", status_code=303)


SHIFT_OPTIONS = {
    "09:00-18:00": "09:00 AM - 06:00 PM",
    "13:00-21:00": "01:00 PM - 09:00 PM",
    "09:00-21:00": "09:00 AM - 09:00 PM",
}
IDENTIFICATION_TYPES = ("CC", "CE", "Pasaporte", "NIT", "Otro")
CONTRACT_TYPES = ("Indefinido", "Fijo", "Obra o labor", "Prestación de servicios", "Aprendizaje")


def worker_redirect(request: Request):
    return admin_only(request)


@app.get("/workers")
def workers_page(request: Request, message: str | None = None):
    redirect = worker_redirect(request)
    if redirect:
        return redirect
    with database() as db:
        workers = db.execute("""SELECT w.*, u.username FROM workers w
            LEFT JOIN users u ON u.worker_id=w.id ORDER BY w.status='Inactivo', w.last_name, w.first_name""").fetchall()
    return render(request, "workers.html", workers=workers, message=message,
        identification_types=IDENTIFICATION_TYPES, contract_types=CONTRACT_TYPES,
    )


@app.get("/workers/new")
def new_worker_page(request: Request):
    redirect = worker_redirect(request)
    if redirect:
        return redirect
    return render(request, "worker_form.html", worker=None, mode="create",
                  identification_types=IDENTIFICATION_TYPES, contract_types=CONTRACT_TYPES, today=date.today().isoformat())


async def save_worker_photo(photo: UploadFile | None) -> str | None:
    if not photo or not photo.filename:
        return None
    extensions = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
    extension = extensions.get(photo.content_type or "")
    if not extension:
        raise ValueError("La foto debe ser JPG, PNG o WEBP")
    content = await photo.read(3 * 1024 * 1024 + 1)
    if len(content) > 3 * 1024 * 1024:
        raise ValueError("La foto no puede superar 3 MB")
    folder = UPLOADS_DIR / "workers"
    folder.mkdir(parents=True, exist_ok=True)
    filename = f"{secrets.token_hex(16)}{extension}"
    (folder / filename).write_bytes(content)
    return f"/static/uploads/workers/{filename}"


def validate_worker(first_name: str, last_name: str, identification_type: str,
                    identification_number: str, birth_date: str, contract_type: str) -> str | None:
    if not first_name.strip() or not last_name.strip() or not identification_number.strip():
        return "Completa los campos obligatorios del trabajador"
    if identification_type not in IDENTIFICATION_TYPES or contract_type not in CONTRACT_TYPES:
        return "Selecciona un tipo de identificación y contrato válido"
    try:
        born = date.fromisoformat(birth_date)
        if born >= date.today():
            return "La fecha de nacimiento debe ser anterior a hoy"
    except ValueError:
        return "Ingresa una fecha de nacimiento válida"
    return None


@app.post("/workers/create")
async def create_worker(request: Request, first_name: str = Form(...), middle_name: str = Form(""),
                        last_name: str = Form(...), second_last_name: str = Form(""),
                        identification_type: str = Form(...), identification_number: str = Form(...),
                        phone: str = Form(""), email: str = Form(""), birth_date: str = Form(...),
                        contract_type: str = Form(...), photo: UploadFile | None = File(None)):
    redirect = worker_redirect(request)
    if redirect:
        return redirect
    error = validate_worker(first_name, last_name, identification_type, identification_number, birth_date, contract_type)
    if error:
        return RedirectResponse(f"/workers?message={error.replace(' ', '%20')}", status_code=303)
    try:
        photo_path = await save_worker_photo(photo)
    except ValueError as error:
        return RedirectResponse(f"/workers?message={str(error).replace(' ', '%20')}", status_code=303)
    full_name = " ".join(part.strip() for part in (first_name, middle_name, last_name, second_last_name) if part.strip())
    try:
        with database() as db:
            db.execute("""INSERT INTO workers(first_name,middle_name,last_name,second_last_name,
                identification_type,identification_number,phone,photo,email,birth_date,contract_type,created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                (first_name.strip(), middle_name.strip() or None, last_name.strip(), second_last_name.strip() or None,
                 identification_type, identification_number.strip(), phone.strip() or None, photo_path,
                 email.strip() or None, birth_date, contract_type, datetime.now(timezone.utc).isoformat()))
            db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                       (datetime.now(timezone.utc).isoformat(), "INFO", f"Trabajador registrado: {full_name}"))
    except sqlite3.IntegrityError:
        return RedirectResponse("/workers?message=El%20número%20de%20identificación%20ya%20está%20registrado", status_code=303)
    return RedirectResponse("/workers?message=Trabajador%20registrado", status_code=303)


@app.get("/workers/{worker_id}/edit")
def edit_worker_page(request: Request, worker_id: int):
    redirect = worker_redirect(request)
    if redirect:
        return redirect
    with database() as db:
        worker = db.execute("SELECT * FROM workers WHERE id=?", (worker_id,)).fetchone()
    if not worker:
        return RedirectResponse("/workers?message=Trabajador%20no%20encontrado", status_code=303)
    return render(request, "worker_form.html", worker=worker, mode="edit",
                  identification_types=IDENTIFICATION_TYPES, contract_types=CONTRACT_TYPES, today=date.today().isoformat())


@app.post("/workers/{worker_id}/edit")
async def update_worker(request: Request, worker_id: int, first_name: str = Form(...), middle_name: str = Form(""),
                        last_name: str = Form(...), second_last_name: str = Form(""),
                        identification_type: str = Form(...), identification_number: str = Form(...),
                        phone: str = Form(""), email: str = Form(""), birth_date: str = Form(...),
                        contract_type: str = Form(...), photo: UploadFile | None = File(None)):
    redirect = worker_redirect(request)
    if redirect:
        return redirect
    error = validate_worker(first_name, last_name, identification_type, identification_number, birth_date, contract_type)
    if error:
        return RedirectResponse(f"/workers?message={error.replace(' ', '%20')}", status_code=303)
    try:
        photo_path = await save_worker_photo(photo)
    except ValueError as error:
        return RedirectResponse(f"/workers?message={str(error).replace(' ', '%20')}", status_code=303)
    try:
        with database() as db:
            params = [first_name.strip(), middle_name.strip() or None, last_name.strip(), second_last_name.strip() or None,
                      identification_type, identification_number.strip(), phone.strip() or None,
                      email.strip() or None, birth_date, contract_type, worker_id]
            photo_sql = ",photo=?" if photo_path else ""
            if photo_path:
                params.insert(-1, photo_path)
            result = db.execute(f"""UPDATE workers SET first_name=?,middle_name=?,last_name=?,second_last_name=?,
                identification_type=?,identification_number=?,phone=?,email=?,birth_date=?,contract_type=?{photo_sql}
                WHERE id=?""", params)
            if not result.rowcount:
                return RedirectResponse("/workers?message=Trabajador%20no%20encontrado", status_code=303)
            db.execute("UPDATE users SET name=? WHERE worker_id=?", (" ".join(x for x in (first_name.strip(), middle_name.strip(), last_name.strip(), second_last_name.strip()) if x), worker_id))
    except sqlite3.IntegrityError:
        return RedirectResponse("/workers?message=El%20número%20de%20identificación%20ya%20está%20registrado", status_code=303)
    return RedirectResponse("/workers?message=Trabajador%20actualizado", status_code=303)


@app.post("/workers/{worker_id}/delete")
def delete_worker(request: Request, worker_id: int):
    redirect = worker_redirect(request)
    if redirect:
        return redirect
    with database() as db:
        result = db.execute("UPDATE workers SET status='Inactivo' WHERE id=? AND status='Activo'", (worker_id,))
        db.execute("UPDATE users SET status='Inactivo' WHERE worker_id=?", (worker_id,))
        if result.rowcount:
            db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                       (datetime.now(timezone.utc).isoformat(), "INFO", f"Trabajador desactivado: ID {worker_id}"))
    return RedirectResponse("/workers?message=Trabajador%20desactivado", status_code=303)


@app.post("/workers/{worker_id}/activate")
def activate_worker(request: Request, worker_id: int):
    redirect = worker_redirect(request)
    if redirect:
        return redirect
    with database() as db:
        result = db.execute("UPDATE workers SET status='Activo' WHERE id=? AND status='Inactivo'", (worker_id,))
        if result.rowcount:
            db.execute("UPDATE users SET status='Activo' WHERE worker_id=?", (worker_id,))
            db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                       (datetime.now(timezone.utc).isoformat(), "INFO", f"Trabajador reactivado: ID {worker_id}"))
    return RedirectResponse("/workers?message=Trabajador%20reactivado", status_code=303)


@app.post("/workers/{worker_id}/account")
def create_worker_account(request: Request, worker_id: int, username: str = Form(...),
                          password: str = Form(...), confirm_password: str = Form(...)):
    redirect = worker_redirect(request)
    if redirect:
        return redirect
    username = username.strip()
    if not re.fullmatch(r"[A-Za-z0-9._-]{3,40}", username):
        return RedirectResponse("/workers?message=El%20usuario%20debe%20tener%203%20a%2040%20caracteres%20válidos", status_code=303)
    if len(password) < 8:
        return RedirectResponse("/workers?message=La%20contraseña%20debe%20tener%20al%20menos%208%20caracteres", status_code=303)
    if password != confirm_password:
        return RedirectResponse("/workers?message=Las%20contraseñas%20no%20coinciden", status_code=303)
    with database() as db:
        worker = db.execute("SELECT * FROM workers WHERE id=? AND status='Activo'", (worker_id,)).fetchone()
        existing = db.execute("SELECT id FROM users WHERE worker_id=?", (worker_id,)).fetchone()
        if not worker:
            return RedirectResponse("/workers?message=El%20trabajador%20no%20existe%20o%20está%20inactivo", status_code=303)
        if existing:
            return RedirectResponse("/workers?message=Este%20trabajador%20ya%20tiene%20una%20cuenta", status_code=303)
        username_exists = db.execute("SELECT id FROM users WHERE UPPER(username)=UPPER(?)", (username,)).fetchone()
        if username_exists:
            return RedirectResponse("/workers?message=El%20nombre%20de%20usuario%20ya%20está%20en%20uso", status_code=303)
        full_name = " ".join(x for x in (worker["first_name"], worker["middle_name"], worker["last_name"], worker["second_last_name"]) if x)
        try:
            db.execute("""INSERT INTO users(username,password,role,name,document,phone,status,createdDate,worker_id)
                VALUES(?,?,'OPERATOR',?,?,?,?,?,?)""",
                (username, hash_password(password), full_name, worker["identification_number"], worker["phone"],
                 "Activo", date.today().isoformat(), worker_id))
        except sqlite3.IntegrityError:
            return RedirectResponse("/workers?message=El%20nombre%20de%20usuario%20ya%20está%20en%20uso", status_code=303)
    return RedirectResponse("/workers?message=Cuenta%20de%20operario%20creada", status_code=303)


@app.get("/workers/shifts")
def worker_shifts_page(request: Request, week: str | None = None, worker_id: int | None = None, message: str | None = None):
    redirect = worker_redirect(request)
    if redirect:
        return redirect
    try:
        selected = date.fromisoformat(week) if week else date.today()
    except ValueError:
        selected = date.today()
    start = selected - timedelta(days=selected.weekday())
    end = start + timedelta(days=6)
    with database() as db:
        workers = db.execute("SELECT * FROM workers WHERE status='Activo' ORDER BY last_name,first_name").fetchall()
        shifts = db.execute("""SELECT s.*,w.first_name,w.middle_name,w.last_name,w.second_last_name
            FROM worker_shifts s JOIN workers w ON w.id=s.worker_id
            WHERE s.shift_date BETWEEN ? AND ? ORDER BY w.last_name,w.first_name,s.shift_date""",
            (start.isoformat(), end.isoformat())).fetchall()
        assigned = db.execute("""SELECT shift_date,shift_type FROM worker_shifts
            WHERE worker_id=? AND shift_date BETWEEN ? AND ?""", (worker_id, start.isoformat(), end.isoformat())).fetchall() if worker_id else []
    days = [{"date": start + timedelta(days=i), "label": (start + timedelta(days=i)).strftime("%A %d/%m")} for i in range(7)]
    labels = {"Monday":"Lunes", "Tuesday":"Martes", "Wednesday":"Miércoles", "Thursday":"Jueves", "Friday":"Viernes", "Saturday":"Sábado", "Sunday":"Domingo"}
    for day in days:
        day["label"] = f"{labels[day['date'].strftime('%A')]} {day['date'].strftime('%d/%m')}"
    previous = (start - timedelta(days=7)).isoformat()
    following = (start + timedelta(days=7)).isoformat()
    return render(request, "worker_shifts.html", workers=workers, shifts=shifts, assigned={s["shift_date"]:s["shift_type"] for s in assigned},
                  days=days, week_start=start.isoformat(), week_end=end.isoformat(), previous=previous,
                  following=following, selected_worker=worker_id, shift_options=SHIFT_OPTIONS, message=message)


@app.post("/workers/shifts")
async def save_worker_shifts(request: Request):
    redirect = worker_redirect(request)
    if redirect:
        return redirect
    form = await request.form()
    try:
        worker_id = int(str(form.get("worker_id", "")))
        start = date.fromisoformat(str(form.get("week_start", "")))
        if start.weekday() != 0:
            raise ValueError
    except ValueError:
        return RedirectResponse("/workers/shifts?message=Selecciona%20un%20trabajador%20y%20una%20semana%20válidos", status_code=303)
    with database() as db:
        worker = db.execute("SELECT id FROM workers WHERE id=? AND status='Activo'", (worker_id,)).fetchone()
        if not worker:
            return RedirectResponse("/workers/shifts?message=Selecciona%20un%20trabajador%20activo", status_code=303)
        for offset in range(7):
            shift_date = (start + timedelta(days=offset)).isoformat()
            shift_type = str(form.get(f"shift_{shift_date}", ""))
            if shift_type and shift_type not in SHIFT_OPTIONS:
                return RedirectResponse("/workers/shifts?message=El%20turno%20seleccionado%20no%20es%20válido", status_code=303)
            if shift_type:
                db.execute("""INSERT INTO worker_shifts(worker_id,shift_date,shift_type) VALUES(?,?,?)
                    ON CONFLICT(worker_id,shift_date) DO UPDATE SET shift_type=excluded.shift_type""",
                    (worker_id, shift_date, shift_type))
            else:
                db.execute("DELETE FROM worker_shifts WHERE worker_id=? AND shift_date=?", (worker_id, shift_date))
    return RedirectResponse(f"/workers/shifts?week={start.isoformat()}&worker_id={worker_id}&message=Turnos%20semanales%20guardados", status_code=303)


@app.get("/dashboard")
def dashboard_page(request: Request):
    redirect = require_login(request)
    if redirect:
        return redirect
    if current_user(request)["role"] != "ADMIN":
        return RedirectResponse("/pos", status_code=303)
    with database() as db:
        stats = db.execute("SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total FROM sales WHERE status!='Anulada'").fetchone()
        low_stock = db.execute("SELECT COUNT(*) FROM products WHERE is_active=1 AND stock<=min_stock").fetchone()[0]
        sales = db.execute("SELECT * FROM sales WHERE status!='Anulada' ORDER BY id DESC LIMIT 12").fetchall()
        confirmed_total = db.execute("SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='PROCESADO'").fetchone()[0]
        confirmed_payments = db.execute("SELECT * FROM payments WHERE status='PROCESADO' ORDER BY received_at DESC LIMIT 10").fetchall()
    return render(request, "dashboard.html", stats=stats, low_stock=low_stock, sales=sales,
                  confirmed_total=confirmed_total, confirmed_payments=confirmed_payments)


@app.get("/cash-closures")
def cash_closures_page(request: Request, message: str | None = None):
    redirect = admin_only(request)
    if redirect:
        return redirect
    now = datetime.now(ZoneInfo("America/Bogota"))
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    with database() as db:
        last_close = db.execute("SELECT closed_at FROM cash_closures ORDER BY id DESC LIMIT 1").fetchone()
        period_start = last_close["closed_at"] if last_close else today_start
        summary = db.execute("""SELECT
            COALESCE(SUM(CASE WHEN t.concept='VENTA' AND (t.source_sale_id IS NULL OR s.status!='Anulada') THEN t.amount ELSE 0 END),0) AS net_sales,
            COALESCE(SUM(CASE WHEN t.concept IN ('PROVEEDOR','PAGADO') THEN t.amount ELSE 0 END),0) AS paid_total,
            COALESCE(SUM(CASE WHEN t.concept='VENTA' AND s.status!='Anulada' AND s.payment_method='Efectivo' THEN t.amount ELSE 0 END),0) AS cash_income,
            COALESCE(SUM(CASE WHEN t.concept='VENTA' AND (t.source_sale_id IS NULL OR (s.status!='Anulada' AND s.payment_method!='Efectivo')) THEN t.amount ELSE 0 END),0) AS transfer_income
            FROM cash_transactions t LEFT JOIN sales s ON s.id=t.source_sale_id
            WHERE t.deleted_at IS NULL AND t.occurred_at>? AND t.occurred_at<=?""", (period_start, now.isoformat())).fetchone()
        closures = db.execute("SELECT * FROM cash_closures ORDER BY id DESC LIMIT 30").fetchall()
    values = dict(summary)
    values["total_income"] = values["cash_income"] + values["transfer_income"]
    values["cash_on_hand"] = values["cash_income"] - values["paid_total"]
    values["total_cash"] = values["total_income"] - values["paid_total"]
    return render(request, "cash_closures.html", summary=values, period_start=period_start,
                  now_local=now.strftime("%Y-%m-%dT%H:%M"), closures=closures, message=message)


@app.post("/cash-closures")
def create_cash_closure(request: Request):
    redirect = admin_only(request)
    if redirect:
        return redirect
    now = datetime.now(ZoneInfo("America/Bogota"))
    closed_at = now.isoformat()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        last_close = db.execute("SELECT closed_at FROM cash_closures ORDER BY id DESC LIMIT 1").fetchone()
        period_start = last_close["closed_at"] if last_close else today_start
        summary = db.execute("""SELECT
            COALESCE(SUM(CASE WHEN t.concept='VENTA' AND (t.source_sale_id IS NULL OR s.status!='Anulada') THEN t.amount ELSE 0 END),0) AS net_sales,
            COALESCE(SUM(CASE WHEN t.concept IN ('PROVEEDOR','PAGADO') THEN t.amount ELSE 0 END),0) AS paid_total,
            COALESCE(SUM(CASE WHEN t.concept='VENTA' AND s.status!='Anulada' AND s.payment_method='Efectivo' THEN t.amount ELSE 0 END),0) AS cash_income,
            COALESCE(SUM(CASE WHEN t.concept='VENTA' AND (t.source_sale_id IS NULL OR (s.status!='Anulada' AND s.payment_method!='Efectivo')) THEN t.amount ELSE 0 END),0) AS transfer_income
            FROM cash_transactions t LEFT JOIN sales s ON s.id=t.source_sale_id
            WHERE t.deleted_at IS NULL AND t.occurred_at>? AND t.occurred_at<=?""", (period_start, closed_at)).fetchone()
        sales_sum, paid_sum, cash_sum, transfer_sum = (float(summary[k]) for k in ("net_sales", "paid_total", "cash_income", "transfer_income"))
        total_income = cash_sum + transfer_sum
        number = db.execute("SELECT COUNT(*) FROM cash_closures").fetchone()[0] + 1
        invoice = f"CC-{number:05d}"
        db.execute("""INSERT INTO cash_closures(invoice_number,period_start,closed_at,cashier_name,total_cash,net_sales,
            paid_total,cash_on_hand,cash_income,transfer_income,total_income) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (invoice, period_start, closed_at, current_user(request)["name"], total_income-paid_sum,
             sales_sum, paid_sum, cash_sum-paid_sum, cash_sum, transfer_sum, total_income))
        db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                   (closed_at, "INFO", f"Cierre de caja generado: {invoice}"))
    return RedirectResponse(f"/cash-closures/{invoice}", status_code=303)


@app.get("/cash-closures/{invoice_number}")
def cash_closure_receipt(request: Request, invoice_number: str):
    redirect = admin_only(request)
    if redirect:
        return redirect
    with database() as db:
        closure = db.execute("SELECT * FROM cash_closures WHERE invoice_number=?", (invoice_number,)).fetchone()
    if not closure:
        return RedirectResponse("/cash-closures?message=Cierre%20de%20caja%20no%20encontrado", status_code=303)
    closure = dict(closure)
    start = datetime.fromisoformat(closure["period_start"]).astimezone(ZoneInfo("America/Bogota"))
    end = datetime.fromisoformat(closure["closed_at"]).astimezone(ZoneInfo("America/Bogota"))
    return render(request, "cash_closure_receipt.html", closure=closure,
                  period_start_label=start.strftime("%d/%m/%Y %I:%M %p"),
                  closed_date=end.strftime("%d/%m/%Y"), closed_time=end.strftime("%I:%M %p"))


@app.get("/health")
def health():
    return {"status": "ok", "database": str(DB_PATH)}
