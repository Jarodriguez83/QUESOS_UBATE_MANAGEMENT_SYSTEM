"""Exact decimal helpers for the point-of-sale calculations.

SQLite still stores the existing REAL columns; values are kept as Decimal until
the database boundary and passed as decimal strings there.
"""

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re
import unicodedata

COP_QUANTUM = Decimal("1")
ZERO = Decimal("0")


def decimal_value(value) -> Decimal:
    """Convert user/database values without importing binary float artifacts."""
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as error:
        raise ValueError("Valor decimal inválido") from error
    if not result.is_finite():
        raise ValueError("Valor decimal inválido")
    return result


def cop_amount(value) -> Decimal:
    """Round a COP payable amount to whole pesos, with ties away from zero."""
    try:
        return decimal_value(value).quantize(COP_QUANTUM, rounding=ROUND_HALF_UP)
    except InvalidOperation as error:
        raise ValueError("Valor monetario fuera de rango") from error


def line_subtotal(unit_price, quantity) -> Decimal:
    """Extend unit price by quantity, then round that line to whole pesos."""
    return cop_amount(decimal_value(unit_price) * decimal_value(quantity))


def grams_to_kilograms(grams) -> Decimal:
    """Convert grams to the product's kilogram stock/sale unit exactly."""
    value = decimal_value(grams)
    if value < ZERO:
        raise ValueError("Los gramos no pueden ser negativos")
    return value / Decimal("1000")


def is_weight_unit(unit) -> bool:
    normalized = unicodedata.normalize("NFKD", str(unit or "")).encode("ascii", "ignore").decode().lower()
    normalized = re.sub(r"[^a-z]", "", normalized)
    return normalized in {"g", "gr", "gramo", "gramos", "kg", "kilo", "kilos", "kilogramo", "kilogramos"}


def valid_quantity_scale(quantity, unit, *, allow_zero=False) -> bool:
    value = decimal_value(quantity)
    if value < ZERO or (value == ZERO and not allow_zero):
        return False
    if is_weight_unit(unit):
        return value.as_tuple().exponent >= -3
    return value == value.to_integral_value()


def sale_totals(line_subtotals, discount=ZERO):
    subtotal = sum((cop_amount(value) for value in line_subtotals), ZERO)
    discount_value = cop_amount(discount)
    if discount_value < ZERO or discount_value > subtotal:
        raise ValueError("El descuento debe estar entre cero y el subtotal")
    return subtotal, discount_value, cop_amount(subtotal - discount_value)
