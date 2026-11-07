# Catálogo ficticio para pruebas de ventas

Este catálogo se genera con `scripts/load_test_catalog.py` y se carga exclusivamente en `.local/test-data/database.db`. No usa el archivo real `backend/database.db`. El script se puede ejecutar cuantas veces sea necesario: actualiza cada producto por su SKU, restaura precio, costo, unidad y existencias iniciales, y no crea filas duplicadas.

Para cargar o restaurar los datos:

```powershell
.\.venv\Scripts\python.exe scripts/load_test_catalog.py
```

Después se puede apuntar la app de prueba a esta base con `APP_ENV=test` y `DATABASE_PATH=.local/test-data/database.db` antes de iniciar FastAPI. El inicializador de la aplicación puede completar las demás tablas al arrancar.

## Registros generados

Precios y costos en COP. Los códigos SKU son EAN-13 válidos para uso interno de pruebas (prefijo 2); no corresponden a productos comerciales reales.

| Código de barras de prueba | Producto ficticio | Unidad | Precio | Costo | Existencias iniciales | Mínimo | Estado esperado |
|---|---|---:|---:|---:|---:|---:|---|
| `2000000000015` | Galletas de prueba | Unidad | $4.500 | $2.700 | 18 | 5 | Normal |
| `2000000000022` | Bebida ficticia 500 ml | Unidad | $3.200 | $1.800 | 2 | 5 | Bajo |
| `2000000000039` | Servilletas paquete de prueba | Paquete | $6.900 | $4.100 | 12 | 4 | Normal |
| `2000000000046` | Vasos paquete agotado | Paquete | $5.500 | $3.000 | 0 | 2 | En cero |
| `2000000000053` | Queso ficticio por kilogramo | Kg | $28.000 | $18.000 | 1,250 kg | 3 kg | Bajo |
| `2000000000060` | Bocadillo ficticio por kilogramo | Kg | $16.000 | $9.000 | 8,500 kg | 2 kg | Normal |

La categoría común es **Pruebas**. Los artículos por kilogramo permiten comprobar ventas fraccionadas hasta tres decimales según la regla actual. El SKU se guarda en el campo `products.sku`, que es el campo que usa la búsqueda por lector de código.

## Uso en pruebas

- Escanear cada código o buscarlo manualmente por SKU.
- Vender artículos por unidad y paquete con cantidades enteras.
- Vender queso/bocadillo por peso con cantidades como `0,350 kg` (ingresar `0.350` si el formulario usa punto decimal).
- Confirmar semáforo normal, stock crítico y agotado; el POS debe rechazar la venta de productos con stock cero.
- Volver a ejecutar el script para restablecer existencias, precios y costos sin duplicar productos.

## Seguridad de los datos

Los precios, costos, existencias y nombres son inventados. No importes este catálogo a una base productiva. El script se niega a ejecutarse con `APP_ENV=prod` o `APP_ENV=production` y su ruta de base está fijada al directorio local de pruebas.
