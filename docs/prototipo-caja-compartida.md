# Prototipo de caja compartida

Prototipo navegable: [prototypes/caja-compartida.html](../prototypes/caja-compartida.html). Abra el archivo en un navegador moderno; no necesita servidor ni escribe datos en la base.

## Información y acciones por rol

| Rol | Información visible | Acciones del prototipo |
|---|---|---|
| Operador | Estado de la caja, base de efectivo, ventas totales, efectivo, transferencias, tarjetas, movimientos recientes de todos los operadores y actividad del equipo. | Registrar venta con valor y medio de pago; consultar la actividad compartida. No abre ni cierra la caja ni cambia la base inicial. |
| Administrador | Lo anterior, más filtros por operador/medio, desglose consolidado por forma de pago, quién abrió la caja y efectivo esperado. | Consultar y filtrar movimientos, abrir caja definiendo una nueva base, revisar el efectivo contado y cerrar el turno. |

## Estados navegables

- **Caja abierta:** permite registrar ventas; el resumen distingue efectivo, transferencia y tarjeta.
- **Venta registrada:** agrega un movimiento a la lista compartida sin recargar, actualizado en las vistas del prototipo.
- **Caja cerrada:** bloquea el registro de ventas y conserva la consulta de movimientos.
- **Diferencia de cierre:** el administrador introduce el efectivo contado y el prototipo muestra la diferencia frente al efectivo esperado.
- **Nueva apertura:** el administrador define el efectivo inicial; inicia un turno de ejemplo con movimientos limpios.

Los botones de cambio de vista son selectores de demostración, no autenticación. Las ventas iniciales y operadores son datos ficticios. El cambio de pantalla y los movimientos nuevos existen solo en memoria de navegador; no sincronizan entre dispositivos ni sustituyen controles de permisos del servidor.

## Propuesta de visibilidad compartida

El efectivo inicial pertenece a la caja/turno y se registra una sola vez. Cada venta lleva operador, hora, número de factura, valor y medio de pago; todas las terminales del turno consultan la misma secuencia y totales. La expectativa de efectivo se calcula como base + ventas en efectivo − retiros/egresos en efectivo. Transferencias y tarjetas se reportan aparte y no incrementan el efectivo físico.

Para convertir el prototipo a operación multi-dispositivo, la fuente de verdad debe ser el servidor y su base de datos: las terminales deben leer la caja abierta y sus movimientos; cada registro requiere control de autorización y una transacción atómica; la interfaz debe refrescar tras registrar o recibir actualización del servidor. El prototipo no define cómo resolver concurrencia, desconexión o cierres simultáneos, que requieren diseño backend antes de implementar.
