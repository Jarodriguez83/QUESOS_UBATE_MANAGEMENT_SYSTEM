# Prototipo y compatibilidad del lector de códigos

## Resultado de inspección

No se detectó un modelo de lector físico disponible en el entorno de desarrollo, por lo que no fue posible confirmar el modo, distribución de teclado o sufijo configurado del dispositivo del negocio. El POS acepta el patrón común de lector USB/Bluetooth en modo **teclado (keyboard wedge)**: escribe los dígitos en el campo enfocado y envía **Enter**. El sufijo del lector debe configurarse como Enter/CR (o CR+LF que el navegador interpreta como envío del formulario). Se debe confirmar el modelo y probar el prefijo/sufijo en el equipo de caja antes de comprar o desplegar.

## Prototipo

En `templates/pos.html`, el botón **Escanear** abre un panel con un campo grande, estado accesible y alternativa de cámara. El panel enfoca automáticamente el campo para poder escanear de inmediato. La cámara ya no se activa sola; el usuario la inicia explícitamente. El código se compara normalizado contra `products.sku`, sin recargar la página.

El comportamiento está implementado en `static/js/app.js`:

1. Enter envía el formulario del campo de código.
2. Si encuentra el SKU, agrega una unidad al carrito o incrementa la cantidad de la línea existente.
3. Si no encuentra el código, conserva el carrito y presenta el código leído y el mensaje de que no existe un producto asociado.
4. Si el SKU existe, pero no quedan existencias, informa que el producto no tiene stock y no cambia el carrito.
5. El panel permanece abierto y vuelve a enfocar el campo para permitir lecturas consecutivas. El total se recalcula inmediatamente.

Los productos por peso se agregan inicialmente con una unidad de producto (`1 Kg`); se debe ajustar el peso en el control de cantidad antes de pagar. El código de barras identifica el artículo, no calcula el peso de una etiqueta variable.

## Códigos de prueba

Con el catálogo descrito en `docs/catalogo-productos-prueba.md`, probar:

| Entrada escaneada | Resultado esperado |
|---|---|
| `2000000000015` | Agrega Galletas de prueba, cantidad 1, al carrito. |
| `2000000000015` otra vez | Conserva una sola línea y sube cantidad a 2. |
| `2000000000046` | Avisa que Vasos paquete agotado no tiene existencias; no lo agrega. |
| `9999999999999` | Muestra “No hay un producto con ese SKU”; el carrito no cambia. |
| `2000000000053` | Agrega Queso ficticio por kilogramo como 1 Kg; el peso se puede editar después. |

La simulación puede hacerse con teclado: abrir **Escanear**, escribir/pegar el código en el campo y pulsar Enter. Para verificar hardware real, repetir la secuencia con el lector conectado y observar que el código no se queda concatenado con el siguiente.

## Requisitos y compatibilidad esperada

- Lector configurado como teclado HID/keyboard wedge; no necesita driver ni API especial del navegador.
- Prefijo desactivado y sufijo Enter recomendado. El lector debe entregar el SKU completo como texto (en códigos EAN-13, conservar todos los ceros iniciales).
- El cursor debe estar en el campo del panel. Al abrirlo se enfoca automáticamente; si se hace clic en otro control, volver a enfocar el campo antes de escanear.
- También funciona con cámara en navegador compatible y con ingreso manual. La cámara requiere permiso y contexto seguro (localhost o HTTPS).
- Los campos SKU de productos deben ser únicos; SQLite define `products.sku` como `UNIQUE`.

## Pendiente de validación física

Registrar marca/modelo/interfaz (USB, Bluetooth o serial), modo de emulación, distribución de teclado, prefijo y sufijo del lector del negocio. Confirmar especialmente si el sufijo es Enter, Tab o ninguno. El prototipo procesa Enter; si el dispositivo termina solo en Tab habrá que adaptar el listener al dispositivo para evitar enviar el formulario de la página. No se afirma compatibilidad física verificada hasta realizar esa prueba en caja.
