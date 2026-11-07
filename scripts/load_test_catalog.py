"""Load deterministic fictional products into an isolated SQLite test database."""

from __future__ import annotations

import os
from pathlib import Path
import sqlite3
import sys


ROOT = Path(__file__).resolve().parents[1]
DATABASE = ROOT / ".local" / "test-data" / "database.db"


def ean13(base12: str) -> str:
    if len(base12) != 12 or not base12.isdigit():
        raise ValueError("EAN base must contain exactly 12 digits")
    weighted_sum = sum(int(digit) * (1 if index % 2 == 0 else 3)
                       for index, digit in enumerate(base12))
    return f"{base12}{(10 - weighted_sum % 10) % 10}"


PRODUCTS = [
    ("TEST-UNIT-01", "Galletas de prueba", "Pruebas", 4_500, 2_700, 18, 5, "Unidad"),
    ("TEST-UNIT-02", "Bebida ficticia 500 ml", "Pruebas", 3_200, 1_800, 2, 5, "Unidad"),
    ("TEST-PACK-01", "Servilletas paquete de prueba", "Pruebas", 6_900, 4_100, 12, 4, "Paquete"),
    ("TEST-PACK-02", "Vasos paquete agotado", "Pruebas", 5_500, 3_000, 0, 2, "Paquete"),
    ("TEST-WEIGHT-01", "Queso ficticio por kilogramo", "Pruebas", 28_000, 18_000, 1.250, 3, "Kg"),
    ("TEST-WEIGHT-02", "Bocadillo ficticio por kilogramo", "Pruebas", 16_000, 9_000, 8.500, 2, "Kg"),
]


def main() -> int:
    if os.getenv("APP_ENV", "").strip().casefold() in {"prod", "production"}:
        print("Refusing to load test products when APP_ENV is production.", file=sys.stderr)
        return 2
    if DATABASE.resolve() == (ROOT / "backend" / "database.db").resolve():
        print("Refusing to write to the legacy/production database.", file=sys.stderr)
        return 2

    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE)
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("""CREATE TABLE IF NOT EXISTS product_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL COLLATE NOCASE UNIQUE,
            is_active INTEGER NOT NULL DEFAULT 1
        )""")
        connection.execute("""CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            sku TEXT UNIQUE,
            category TEXT,
            price REAL NOT NULL,
            cost REAL NOT NULL,
            stock REAL NOT NULL DEFAULT 0,
            min_stock REAL DEFAULT 2,
            unit TEXT DEFAULT 'Unidad',
            is_active INTEGER DEFAULT 1
        )""")

        with connection:
            connection.execute(
                "INSERT OR IGNORE INTO product_categories(name) VALUES (?)", ("Pruebas",)
            )
            for index, product in enumerate(PRODUCTS, start=1):
                sku = ean13(f"200000000{index:03d}")
                name, category, price, cost, stock, min_stock, unit = product[1:]
                connection.execute("""INSERT INTO products
                    (name, sku, category, price, cost, stock, min_stock, unit, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                    ON CONFLICT(sku) DO UPDATE SET
                        name=excluded.name, category=excluded.category,
                        price=excluded.price, cost=excluded.cost, stock=excluded.stock,
                        min_stock=excluded.min_stock, unit=excluded.unit, is_active=1""",
                    (name, sku, category, price, cost, stock, min_stock, unit))

        print(f"Loaded {len(PRODUCTS)} fictional products into {DATABASE}")
        for product in connection.execute(
            "SELECT sku,name,unit,stock,min_stock FROM products WHERE sku LIKE '200000000%' ORDER BY sku"
        ):
            print(f"{product[0]} | {product[1]} | {product[2]} | stock {product[3]} / min {product[4]}")
    finally:
        connection.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
