# Quesos Ubaté Management System

La interfaz nueva está migrando a FastAPI, SQLite, Jinja, HTML, CSS y JavaScript sin framework. La aplicación vive en `app/main.py`; la configuración y el proveedor de conexiones SQLite están en `app/config.py` y `app/database.py`. El comando `uvicorn app:app` se conserva. En desarrollo local la base se crea en `.local/dev-data/database.db`; producción debe configurar su propio `DATA_DIR` persistente.

## Ejecutar la versión FastAPI

Para instalación local aislada, configuración de variables, ejecución y respaldos, sigue la [guía de desarrollo local](docs/desarrollo-local.md). Resumen en Windows PowerShell, desde la raíz:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
# Edita .env con secretos locales y una contraseña inicial de pruebas.
python -m uvicorn app:app --reload --env-file .env
```

Abre `http://127.0.0.1:8000`. El modo local usa `.local/dev-data/database.db`; no usa `backend/database.db`.

## Acceso inicial

En una base de datos nueva, se crea la cuenta inicial de administración solo si defines `INITIAL_ADMIN_PASSWORD`. Opcionalmente, `INITIAL_OPERATOR_PASSWORD` crea la cuenta inicial de caja. Ambas contraseñas se guardan como hash PBKDF2; no hay claves predeterminadas ni acceso `ADMIN` / `ADMIN`.

Las cuentas solo se agregan cuando la tabla de usuarios está vacía. Las contraseñas antiguas en texto claro siguen autenticándose para permitir la migración sin bloquear usuarios; después de un inicio válido se transforman automáticamente a PBKDF2. En producción, `SESSION_SECRET` y `APP_ENV=production` son obligatorios.

## Cálculos monetarios y cantidades

- El servidor calcula con `Decimal`, sin convertir precios, cantidades ni pagos a `float` durante la operación de venta.
- La regla del punto de venta es COP en pesos enteros: cada subtotal de línea se redondea al peso más cercano usando `ROUND_HALF_UP`; los subtotales de línea se suman y el descuento se expresa en pesos enteros. El total es subtotal menos descuento (los impuestos aún no están configurados). El cambio usa la misma escala.
- La caja permite editar la cantidad. Unidades y paquetes deben ser cantidades enteras. Productos cuyo campo `unit` sea `g`, `gr`, `gramo(s)`, `kg`, `kilo(s)` o `kilogramo(s)` admiten hasta tres decimales. La cantidad y las existencias deben usar la misma unidad base configurada en el producto: para un producto con precio y stock por kilogramo, 350 g se ingresan como `0.350 kg` (equivalente exacto a `350 / 1000`). Los paquetes se cuentan como paquetes completos; su contenido no cambia la unidad de inventario.
- SQLite conserva las columnas existentes `REAL`: los cálculos se mantienen como `Decimal` en Python y se pasan como cadenas decimales al límite de SQLite, que continúa almacenando esos campos como `REAL`. El precio y subtotal aplicados también se copian a `sale_items` para conservar el importe histórico aunque cambie el catálogo.
- Las pruebas de cálculo se ejecutan con `python -m unittest discover -s tests`. Una futura migración a PostgreSQL debe usar columnas `NUMERIC` explícitas (por ejemplo, importes `NUMERIC(18,2)` y cantidades `NUMERIC(18,3)`) y verificar las escalas con el esquema vigente de facturación electrónica DIAN antes de activar impuestos o facturación fiscal. La regla de redondeo de esta caja no sustituye esa validación.

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
- Sesión administrativa **CONFIRMACIÓN PAGOS**: conecta por OAuth una cuenta Gmail de solo lectura y analiza todos los correos entrantes de los últimos dos días cada 30 segundos, sin filtrar por remitente. Clasifica los mensajes como pago confirmado, pago por revisar o no es pago. Cada pago confirmado se guarda una sola vez en el historial y como ingreso por transferencia en Resumen, Transacciones y Cierre de caja.
- La API Express y la interfaz React anteriores siguen disponibles como `npm run dev:legacy` y `npm run start:legacy` durante la migración.

La integración Gmail/OAuth de la sesión nueva requiere crear credenciales OAuth en Google Cloud, habilitar Gmail API y autorizar la URI de redirección mostrada en pantalla. Las reglas de lectura se configuran según el formato real de los comprobantes del banco. Las cuentas heredadas pueden conservar contraseñas en texto plano; las cuentas de trabajadores nuevas usan hash PBKDF2. Antes de desplegar en internet, configura `SESSION_SECRET` con un valor secreto propio.

El lector solicita permiso explícito para la cámara. Los navegadores requieren un contexto seguro: usa `localhost` durante desarrollo o HTTPS al abrir el sistema desde otro dispositivo. El decodificador se sirve como un archivo local del proyecto; si el navegador no puede leer el código, queda disponible la búsqueda manual por SKU.

## Pruebas

Instala las dependencias de prueba con `python -m pip install -r requirements-dev.txt` y ejecuta `python -m unittest discover -s tests`. La prueba de salud inicia FastAPI contra una base SQLite temporal y comprueba `GET /health` sin tocar la base local.

## Despliegue de pruebas en Render

El archivo `render.yaml` define un servicio web FastAPI con un disco persistente de 1 GB. La base SQLite y las fotos de trabajadores se guardan en ese disco para que los cambios realizados desde varios computadores compartan el mismo estado y sobrevivan reinicios y despliegues. El servicio con disco requiere un plan de Render de pago; revisa el precio que Render muestre antes de crear el Blueprint.

Para desplegar, sube esta rama a GitHub, inicia sesión en Render, crea un **Blueprint** desde el repositorio y confirma los recursos indicados por `render.yaml`. Render genera `SESSION_SECRET` y las contraseñas iniciales de administrador y caja; consúltalas en **Environment** dentro del Dashboard de Render. Los nombres de usuario iniciales son `admin_queuba` y `caja_queuba`. El despliegue empieza con una base de datos nueva: `backend/database.db` no se versiona, por lo que los datos locales no se copian al servicio. Cambia las contraseñas antes de compartir la URL. Esta configuración es para pruebas preliminares, no una puesta en producción.
