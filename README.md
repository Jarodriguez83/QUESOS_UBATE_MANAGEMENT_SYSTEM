# Quesos Ubaté Management System

La interfaz nueva está migrando a FastAPI, SQLite, Jinja, HTML, CSS y JavaScript sin framework. El archivo SQLite existente (`backend/database.db`) se conserva y FastAPI crea solamente las tablas que falten.

## Ejecutar la versión FastAPI

En Windows PowerShell, desde la carpeta raíz:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:SESSION_SECRET = "cambia-esto-por-un-secreto-largo"
python -m uvicorn app:app --reload
```

Abre `http://127.0.0.1:8000`. Si ya tienes un entorno virtual `venv`, puedes activarlo en vez de crear `.venv`.

## Acceso inicial

En una base de datos nueva, se crean dos cuentas de demostración:

- Administrador: `ADM-001` / `ADM - 999`
- Caja: `CJ-101` / `OPE - 123`

Las cuentas solo se agregan cuando la tabla de usuarios está vacía. La contraseña del usuario se compara en el mismo formato normalizado que el sistema anterior.

## Alcance actual de la migración

- Inicio y cierre de sesión con cookie firmada y rol guardado en sesión.
- Caja con búsqueda de productos, carrito y registro transaccional de venta.
- Descuento de existencias, facturas `FV-xxxxx` y registro de auditoría al vender.
- Consulta de inventario y alta de productos para el administrador.
- Resumen de ventas para el administrador.
- La API Express y la interfaz React anteriores siguen disponibles como `npm run dev:legacy` y `npm run start:legacy` durante la migración.

La integración Gmail/OAuth, configuración de parsers, pagos en vivo, proveedores/compras, gestión de empleados/turnos, reportes completos y sus funciones de voz aún deben trasladarse. En particular, las contraseñas heredadas son texto plano; esta primera etapa las conserva para no bloquear el acceso a las cuentas existentes. Antes de desplegar en internet, configura `SESSION_SECRET` con un valor secreto propio y migra las contraseñas a hashes seguros.
