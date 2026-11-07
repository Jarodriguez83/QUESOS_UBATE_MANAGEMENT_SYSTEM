# Revisión de autenticación y permisos

## Alcance

La aplicación principal desplegada con `npm start` es FastAPI (`app/main.py`). También existe una API Express heredada (`backend/server.js`), iniciable con `npm run start:legacy`. Se revisaron ambas superficies porque la segunda conserva operaciones administrativas y de negocio.

## Matriz de permisos de FastAPI

| Operación | Anónimo | Operador | Administrador |
|---|---:|---:|---:|
| Iniciar/cerrar sesión | Sí | Sí | Sí |
| POS, ventas, recibos, transacciones de ventas | No | Sí | Sí |
| Consultar inventario y detalle de productos | No | Sí | Sí |
| Crear, editar, eliminar productos y categorías | No | No | Sí |
| Proveedores, pagos/gastos, compras | No | No | Sí |
| Confirmaciones Gmail y configuración de pagos | No | No | Sí |
| Trabajadores, cuentas, turnos | No | No | Sí |
| Cierres de caja y panel administrativo | No | No | Sí |

La restricción se aplica en el servidor mediante `require_login` y `admin_only`; ocultar botones en la interfaz no se considera control de acceso.

## Hallazgos

### Corregido/cubierto en FastAPI

- La contraseña nueva se guarda con PBKDF2-HMAC-SHA256, sal aleatoria de 16 bytes y 240.000 iteraciones. La comparación del hash usa `hmac.compare_digest`.
- La cookie de sesión está firmada por Starlette, usa `SameSite=Lax` y exige `SESSION_SECRET` en producción. `COOKIE_HTTPS_ONLY=true` permite marcarla `Secure` detrás de HTTPS.
- El login compara el rol elegido con el rol de la cuenta y rechaza cuentas inactivas. `admin_only` vuelve a consultar rol y estado en la base de datos para evitar confiar en un rol antiguo de la sesión.
- Se rechaza el par demo `ADMIN` / `ADMIN`; no crea una sesión.
- Se añadieron pruebas de sesión, cierre de sesión y denegación por rol.

### Vulnerabilidades y tareas pendientes

1. **Crítica — API Express sin autenticación/autorización (`backend/server.js`).** El login compara contraseñas en texto plano y responde con un objeto de usuario, pero no crea sesión ni token. Las demás rutas REST, incluidas `/api/users`, `/api/products`, `/api/reset-data` y la configuración Gmail, operan sin comprobar identidad o rol. El WebSocket también envía pagos y configuración a cualquier conexión. `npm run start:legacy` sigue exponiendo esta superficie; el criterio de aceptación global NO se cumple mientras esa API pueda ejecutarse.
2. **Alta — contraseñas heredadas en texto plano en FastAPI.** `verify_password` acepta contraseñas no hasheadas comparando una versión normalizada. El login migra a hash después de validar, pero una cuenta aún no migrada sigue expuesta a lectura de la base de datos y normalización débil. Planear migración controlada a hashes antes de quitar compatibilidad.
3. **Media — política de cookies depende de despliegue.** `COOKIE_HTTPS_ONLY` vale `false` si no se configura. En producción debe activarse junto con HTTPS; `SESSION_SECRET` debe ser único, aleatorio y persistente entre reinicios.
4. **Alta — acceso alternativo de demostración en frontend heredado.** `frontend/src/components/LoginScreen.jsx` fabrica una sesión local y muestra contraseñas demo, sin autenticación del servidor. No usar esta UI como control de seguridad.
5. **Media — falta protección CSRF explícita para formularios con cookie.** `SameSite=Lax` reduce exposición, pero no sustituye un token CSRF en acciones con efectos.

## Pruebas añadidas

`tests/test_health.py` contiene casos para: acceso anónimo denegado; operador permitido en POS y denegado en productos, trabajadores y Gmail; administrador permitido; logout que invalida sesión; rechazo de rol incorrecto, clave incorrecta y credencial demo.

## Criterio de aceptación

FastAPI aplica las restricciones descritas. La aceptación integral sigue pendiente hasta cerrar la API Express (autenticación, roles para cada ruta y WebSocket, hash de contraseñas y pruebas de integración) y retirar el login simulado. No se debe habilitar `start:legacy` en ningún entorno accesible mientras siga abierto.
