"""Deletion failures must never be reported to the client as success."""
import unittest
from unittest.mock import patch
from api import watchlist


class WatchlistDeleteTests(unittest.TestCase):
    def test_failure_is_forwarded(self):
        handler = object.__new__(watchlist.handler)
        handler.path = '/api/watchlist?code=2330'
        handler.headers = {'Authorization': 'Bearer fixture'}
        responses = []
        handler._json = lambda status, data: responses.append((status, data))
        with (
            patch.object(watchlist, '_verified_user_id', return_value=(200, '00000000-0000-0000-0000-000000000001')),
            patch('lib.member_phone.check', return_value=None),
            patch.object(watchlist, '_sb', return_value=(403, {'error': 'denied'})),
        ):
            handler.do_DELETE()
        self.assertEqual(responses, [(403, {'error': 'forbidden'})])


if __name__ == '__main__':
    unittest.main()
