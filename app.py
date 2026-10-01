"""FastAPI entry point for the server-rendered Quesos Ubaté application."""

from __future__ import annotations

import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from fastapi import FastAPI, Form, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "backend" / "database.db"
app = FastAPI(title="Quesos Ubaté | Punto de venta")
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", "change-this-secret-before-deployment"),
    same_site="lax",
    https_only=os.getenv("COOKIE_HTTPS_ONLY", "false").lower() == "true",
)
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
            CREATE TABLE IF NOT EXISTS payments (
                id TEXT PRIMARY KEY, bank_name TEXT NOT NULL, client_name TEXT NOT NULL,
                amount REAL NOT NULL, reference TEXT, payment_date TEXT,
                received_at TEXT NOT NULL, raw_body TEXT, status TEXT DEFAULT 'PROCESADO'
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
            CREATE TABLE IF NOT EXISTS suppliers (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
                nit TEXT, phone TEXT, email TEXT, contact_name TEXT
            );
            CREATE TABLE IF NOT EXISTS sales (
                id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_number TEXT UNIQUE NOT NULL,
                client_name TEXT DEFAULT 'Cliente General', client_document TEXT,
                total REAL NOT NULL, payment_method TEXT NOT NULL,
                payment_reference TEXT, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sale_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id), quantity REAL NOT NULL,
                unit_price REAL NOT NULL, subtotal REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS purchases (
                id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_id INTEGER REFERENCES suppliers(id),
                total REAL NOT NULL, created_at TEXT NOT NULL
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
        if db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            today = datetime.now().date().isoformat()
            db.executemany(
                """INSERT INTO users
                   (username,password,role,name,cashierCode,document,phone,status,createdDate)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                [
                    ("admin_queuba", "ADM - 999", "ADMIN", "Carlos Gómez (Admin)", "ADM-001", "80.123.456", "320 998 7766", "Activo", today),
                    ("caja_queuba", "OPE - 123", "OPERATOR", "Juan Rodríguez", "CJ-101", "1.069.452.880", "314 589 2244", "Activo", today),
                ],
            )
        if db.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
            db.executemany(
                """INSERT INTO products (name,sku,category,price,cost,stock,min_stock,unit)
                   VALUES (?,?,?,?,?,?,?,?)""",
                [("Queso Campesino Ubaté", "Q001", "Quesos", 14000, 9500, 24, 5, "Bloque"),
                 ("Colaciones de Ubaté Caja", "A001", "Acompañantes", 10000, 6500, 14, 4, "Caja")],
            )


@app.on_event("startup")
def on_startup() -> None:
    initialize_database()


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
    if not user or normalize_password(user["password"]) != normalize_password(password):
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
        recent_sales = db.execute("SELECT * FROM sales ORDER BY id DESC LIMIT 8").fetchall()
    return render(request, "pos.html", products=products, recent_sales=recent_sales, message=message)


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
        with database() as db:
            db.execute("BEGIN IMMEDIATE")
            total = 0.0
            normalized = []
            for item in cart:
                product = db.execute("SELECT * FROM products WHERE id=? AND is_active=1", (int(item["id"]),)).fetchone()
                quantity = float(item["quantity"])
                if not product or quantity <= 0:
                    raise ValueError("Producto o cantidad inválidos")
                price = float(product["price"])
                subtotal = price * quantity
                total += subtotal
                normalized.append((product, quantity, price, subtotal))
            number = db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] + 1
            invoice = f"FV-{number:05d}"
            created_at = datetime.now(timezone.utc).isoformat()
            cursor = db.execute(
                """INSERT INTO sales(invoice_number,client_name,client_document,total,payment_method,payment_reference,created_at)
                   VALUES(?,?,?,?,?,?,?)""",
                (invoice, str(form.get("client_name") or "Cliente General"), str(form.get("client_document") or "") or None,
                 total, str(form.get("payment_method") or "Efectivo"), str(form.get("payment_reference") or "") or None, created_at),
            )
            for product, quantity, price, subtotal in normalized:
                db.execute("INSERT INTO sale_items(sale_id,product_id,quantity,unit_price,subtotal) VALUES(?,?,?,?,?)",
                           (cursor.lastrowid, product["id"], quantity, price, subtotal))
                db.execute("UPDATE products SET stock=MAX(0,stock-?) WHERE id=?", (quantity, product["id"]))
            db.execute("INSERT INTO audit_logs(timestamp,level,message) VALUES(?,?,?)",
                       (created_at, "INFO", f"Venta facturada: {invoice}, total {total:.2f}"))
        return RedirectResponse(f"/pos?message=Venta%20{invoice}%20registrada", status_code=303)
    except (ValueError, KeyError, TypeError) as error:
        return RedirectResponse(f"/pos?message={str(error).replace(' ', '%20')}", status_code=303)


@app.get("/inventory")
def inventory_page(request: Request, message: str | None = None):
    redirect = require_login(request)
    if redirect:
        return redirect
    with database() as db:
        products = db.execute("SELECT * FROM products WHERE is_active=1 ORDER BY name").fetchall()
    return render(request, "inventory.html", products=products, message=message)


def admin_only(request: Request):
    if not current_user(request):
        return RedirectResponse("/login", status_code=303)
    if current_user(request)["role"] != "ADMIN":
        return RedirectResponse("/inventory?message=Solo%20el%20administrador%20puede%20modificar%20productos", status_code=303)
    return None


@app.get("/inventory/new")
def new_product_page(request: Request):
    redirect = require_login(request)
    if redirect:
        return redirect
    redirect = admin_only(request)
    if redirect:
        return redirect
    return render(request, "product_form.html", product=None, mode="create")


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
    if not product:
        return RedirectResponse("/inventory?message=Producto%20no%20encontrado", status_code=303)
    return render(request, "product_form.html", product=product, mode="edit")


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


@app.get("/dashboard")
def dashboard_page(request: Request):
    redirect = require_login(request)
    if redirect:
        return redirect
    if current_user(request)["role"] != "ADMIN":
        return RedirectResponse("/pos", status_code=303)
    with database() as db:
        stats = db.execute("SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total FROM sales").fetchone()
        low_stock = db.execute("SELECT COUNT(*) FROM products WHERE is_active=1 AND stock<=min_stock").fetchone()[0]
        sales = db.execute("SELECT * FROM sales ORDER BY id DESC LIMIT 12").fetchall()
    return render(request, "dashboard.html", stats=stats, low_stock=low_stock, sales=sales)


@app.get("/health")
def health():
    return {"status": "ok", "database": str(DB_PATH)}
