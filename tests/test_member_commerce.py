import copy
import json
import unittest
from lib import member_commerce as C, payments as P
from unittest.mock import patch


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.config = C.defaults()
        self.config['revision'] = 1
        for p in self.config['products']:
            p['plan_code'] = 'test_' + p['id']

    def rest(self, path, *args):
        return 200, [{'value': json.dumps(self.config)}]

    def test_closed_catalog_never_contains_prices_or_plan_codes(self):
        out = C.public_catalog(self.rest, 'sandbox')
        self.assertFalse(out['payments_enabled'])
        for p in out['products']:
            self.assertNotIn('price_twd', p)
            self.assertNotIn('plan_code', p)
        with patch.object(P, 'enabled', return_value='sandbox'):
            status, value = P.handle('pay_linepay_request', {}, {'id': 'member'}, self.rest)
            self.assertEqual((status, value['code']), (503, 'PAY_DISABLED'))

    def test_dynamic_listing_and_environment_filter(self):
        self.config['payments_enabled'] = True
        extra = copy.deepcopy(self.config['products'][1])
        extra.update(id='fifth', name='第五方案', plan_code='fifth')
        self.config['products'].append(extra)
        self.assertEqual(len(C.public_catalog(self.rest, 'sandbox')['products']), 5)
        self.config['products'][1]['active'] = False
        self.config['products'][2]['active'] = False
        out = C.public_catalog(self.rest, 'sandbox')
        self.assertEqual(len(out['products']), 3)
        self.assertTrue(out['products'][-1]['purchasable'])
        prod = C.public_catalog(self.rest, 'production')
        self.assertTrue(all('price_twd' not in p for p in prod['products']))

    def test_reject_unimplemented_features_and_invalid_types(self):
        for key, value in [('features', ['member_ai']), ('days', True), ('price_twd', -1), ('active', 'true'), ('icon', '<svg>')]:
            bad = copy.deepcopy(self.config)
            bad['products'][1][key] = value
            with self.subTest(key=key), self.assertRaises(C.CatalogError):
                C.validate(bad)

    def test_admin_conflict_is_explicit(self):
        status, out = C.handle_admin('admin_commerce_save', {'config': self.config, 'revision': 1},
                                    lambda *args: (400, {'message': 'COMMERCE_CONFLICT'}))
        self.assertEqual(status, 409)

    def test_expired_access_is_server_resolved(self):
        self.assertEqual(C.access({'id': 'member'}, lambda *args: (200, {'configured': True, 'features': []}))['features'], [])
        with self.assertRaises(C.CatalogError):
            C.access({'id': 'member'}, lambda *args: (404, {}))


if __name__ == '__main__':
    unittest.main()
