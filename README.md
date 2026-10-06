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

El acceso administrativo principal también acepta `ADMIN` / `ADMIN`, únicamente al seleccionar el modo **ADMINISTRADOR** en el login.

Las cuentas solo se agregan cuando la tabla de usuarios está vacía. La contraseña del usuario se compara en el mismo formato normalizado que el sistema anterior.

## Alcance actual de la migración

- Inicio y cierre de sesión con cookie firmada y rol guardado en sesión.
- Caja con búsqueda de productos, carrito y registro transaccional de venta.
- Caja con secciones de productos configurables por el administrador, diálogo táctil de cobro, teclado numérico para efectivo, cálculo de cambio y recibo imprimible de 80 mm. El recibo conserva el subtotal, descuento, total, medio de pago, cajero, fecha y hora.
- Libro de Transacciones para el administrador: ventas automáticas, salidas de proveedor y pagos, filtros, resumen de entradas/salidas, detalle en ventana, edición de salidas y anulación auditada. Anular una venta revierte existencias y la excluye de los indicadores de ventas.
- Apartado de Proveedores con creación, consulta, edición y desactivación de empresas, productos suministrados, detalles y teléfono de contacto. Apartado Pagados para registrar pagos a un proveedor activo o pagos por otro concepto; ambos se reflejan como egresos en Transacciones.
- Escaneo de códigos de barras desde la cámara de la caja, emparejando el valor leído con el SKU del producto; incluye ingreso manual de SKU.
- Descuento de existencias, facturas `FV-xxxxx` y registro de auditoría al vender.
- CRUD de productos desde Inventario: lectura para usuarios autenticados; creación, edición y eliminación lógica solo para administrador.
- Secciones/categorías administrables para agrupar productos en Caja. Las categorías existentes se copian a la tabla de secciones al iniciar, conservando los productos.
- Panel administrativo de trabajadores: creación, edición, carga de foto, identificación, contacto, fecha de nacimiento, contrato, estado y creación de cuenta OPERATOR vinculada al trabajador. Las cuentas nuevas guardan contraseñas con PBKDF2; el inicio de sesión mantiene compatibilidad con las cuentas existentes.
- Calendario semanal de trabajadores con los tres turnos configurados (09:00–18:00, 13:00–21:00 y 09:00–21:00), días libres y conservación del historial.
- Consulta del resumen de ventas para el administrador.
- Resumen de ventas para el administrador.
- La API Express y la interfaz React anteriores siguen disponibles como `npm run dev:legacy` y `npm run start:legacy` durante la migración.

La integración Gmail/OAuth, configuración de parsers, pagos en vivo, proveedores/compras, reportes completos y sus funciones de voz aún deben trasladarse. Las cuentas heredadas pueden conservar contraseñas en texto plano; las cuentas de trabajadores nuevas usan hash PBKDF2. Antes de desplegar en internet, configura `SESSION_SECRET` con un valor secreto propio.

El lector solicita permiso explícito para la cámara. Los navegadores requieren un contexto seguro: usa `localhost` durante desarrollo o HTTPS al abrir el sistema desde otro dispositivo. El decodificador se sirve como un archivo local del proyecto; si el navegador no puede leer el código, queda disponible la búsqueda manual por SKU.
