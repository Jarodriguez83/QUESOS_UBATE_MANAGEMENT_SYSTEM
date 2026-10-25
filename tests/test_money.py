import unittest
from decimal import Decimal

from money import cop_amount, grams_to_kilograms, is_weight_unit, line_subtotal, sale_totals, valid_quantity_scale


class MoneyCalculationTests(unittest.TestCase):
    def test_normal_sale(self):
        self.assertEqual(line_subtotal("5000", "2"), Decimal("10000"))
        self.assertEqual(sale_totals([Decimal("10000")], "0"),
                         (Decimal("10000"), Decimal("0"), Decimal("10000")))

    def test_three_products_and_discount(self):
        lines = [line_subtotal("1990", "1") for _ in range(3)]
        self.assertEqual(sale_totals(lines, "500"),
                         (Decimal("5970"), Decimal("500"), Decimal("5470")))

    def test_weight_quantity_and_half_up_cop_rounding(self):
        self.assertEqual(line_subtotal("1990", "0.350"), Decimal("697"))
        self.assertEqual(cop_amount("2.5"), Decimal("3"))
        self.assertEqual(grams_to_kilograms("350"), Decimal("0.35"))
        self.assertTrue(is_weight_unit("Kg"))
        self.assertFalse(is_weight_unit("Paquete"))
        self.assertTrue(valid_quantity_scale("0.350", "Kg"))
        self.assertFalse(valid_quantity_scale("0.3501", "Kg"))
        self.assertTrue(valid_quantity_scale("3", "Paquete"))
        self.assertFalse(valid_quantity_scale("3.5", "Paquete"))
        self.assertTrue(valid_quantity_scale("0", "Kg", allow_zero=True))
        self.assertFalse(valid_quantity_scale("0", "Kg"))


if __name__ == "__main__":
    unittest.main()
