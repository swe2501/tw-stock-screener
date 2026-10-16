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
        with patch.object(watchlist, '_sb', return_value=(403, {'error': 'denied'})):
            handler.do_DELETE()
        self.assertEqual(responses, [(403, {'error': 'denied'})])


if __name__ == '__main__':
    unittest.main()
