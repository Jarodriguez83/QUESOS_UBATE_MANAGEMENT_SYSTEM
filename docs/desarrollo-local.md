# Instalación, ejecución y respaldo local

Esta guía usa una base de desarrollo independiente. No copies una base productiva a tu equipo: usa los datos de ejemplo creados por la aplicación o un respaldo anonimizado autorizado.

## Requisitos

- Python **3.12** (el repositorio fija el parche recomendado en `.python-version`).
- `pip` y soporte para crear entornos virtuales (`venv`).
- Dependencias de ejecución de `requirements.txt`: FastAPI `>=0.115,<1.0`, Uvicorn `>=0.30,<1.0`, Jinja2 `>=3.1,<4.0`, `python-multipart >=0.0.9,<1.0`, `itsdangerous >=2.2,<3.0` y `python-dotenv >=1.0,<2.0`.
- Para las pruebas, `httpx >=0.27,<1.0`, incluido en `requirements-dev.txt`.

## Preparar el entorno

Desde la raíz del repositorio, en PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

En macOS/Linux:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-dev.txt
cp .env.example .env
```

Edita el archivo local `.env` (ignorado por Git):

1. Conserva `APP_ENV=development`, `DATA_DIR=.local/dev-data`, `DATABASE_PATH=.local/dev-data/database.db` y `UPLOADS_DIR=.local/dev-data/uploads` para mantener aislados la base y los archivos locales.
2. Genera `SESSION_SECRET` con `python -c "import secrets; print(secrets.token_urlsafe(32))"` y pega el resultado solo en `.env`.
3. Define una contraseña fuerte y exclusiva para pruebas en `INITIAL_ADMIN_PASSWORD`. Si necesitas una cuenta de caja inicial, define también `INITIAL_OPERATOR_PASSWORD`. No guardes contraseñas reales en `.env.example` ni las compartas.

La base de datos local se crea automáticamente al iniciar. Si `DATABASE_PATH` se omite en modo desarrollo, el valor predeterminado también apunta a `.local/dev-data/database.db`, no a `backend/database.db`. `.local/`, `.env` y los archivos SQLite están excluidos de Git.

## Iniciar, probar y detener

Con `.venv` activado, desde la raíz:

```powershell
python -m uvicorn app:app --reload --env-file .env
```

Abre <http://127.0.0.1:8000>. La ruta `GET /health` debe responder con estado `ok` y mostrar la ruta de la base de desarrollo. Las pruebas se ejecutan con:

```powershell
python -m unittest discover -s tests
```

Detén el servidor con `Ctrl+C`. Después puedes salir del entorno virtual con `deactivate`.

## Crear un respaldo

Detén el servidor para que la base y las fotos queden en un mismo punto temporal. Guarda los respaldos fuera del repositorio (y preferiblemente en un disco o almacenamiento de equipo autorizado):

```powershell
python scripts/backup_local_data.py --env-file .env --destination D:\quesos-backups
```

El script usa la API de respaldo de SQLite, verifica `PRAGMA integrity_check` y copia la carpeta configurada en `UPLOADS_DIR`. Cada respaldo queda en una carpeta con marca UTC e incluye `database.sqlite3`, `uploads/` y `manifest.json`. Conserva varias generaciones y protege el destino de respaldo con los controles de acceso y cifrado del equipo.

## Restaurar un respaldo

Detén el servidor y verifica que elegiste el respaldo correcto. Primero crea un respaldo de la instalación actual con el procedimiento anterior. Con `.env` estándar, en PowerShell:

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$data = '.local/dev-data'
$backup = 'D:\quesos-backups\quesos-backup-AAAAMMDDTHHMMSSffffffZ'
if (Test-Path "$data\database.db") { Move-Item "$data\database.db" "$data\database.before-restore-$stamp.db" }
if (Test-Path "$data\database.db-wal") { Move-Item "$data\database.db-wal" "$data\database.before-restore-$stamp.db-wal" }
if (Test-Path "$data\database.db-shm") { Move-Item "$data\database.db-shm" "$data\database.before-restore-$stamp.db-shm" }
if (Test-Path "$data\uploads") { Move-Item "$data\uploads" "$data\uploads.before-restore-$stamp" }
Copy-Item "$backup\database.sqlite3" "$data\database.db"
Copy-Item "$backup\uploads" "$data\uploads" -Recurse
```

Sustituye el nombre de respaldo por una carpeta existente. Si personalizaste las rutas en `.env`, ajusta `$data` y restaura los archivos en sus rutas configuradas. No borres los archivos `before-restore`: permiten volver a la base anterior si la verificación posterior falla. Inicia la app y confirma `/health`, el acceso y datos conocidos antes de reanudar el trabajo. Para un entorno productivo, sigue además la política de respaldos y recuperación de la organización; esta guía solo cubre el entorno local.
