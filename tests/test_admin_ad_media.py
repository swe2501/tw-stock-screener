import json
import unittest
from unittest import mock
from urllib.error import URLError
from lib import admin_ad_media as M


class AdUploadTests(unittest.TestCase):
    def test_invalid_files_never_request_upload_grant(self):
        for data in ({'content_type': 'image/svg+xml', 'size': 20},
                     {'content_type': 'image/png', 'size': 6 * 1024 * 1024},
                     {'content_type': 'video/mp4', 'size': 31 * 1024 * 1024},
                     {'content_type': 'image/png', 'size': -1},
                     {'content_type': 'image/png', 'size': True}):
            with mock.patch.object(M.urllib.request, 'urlopen') as request:
                self.assertEqual(M.signed_upload(data)[0], 400)
                request.assert_not_called()

    @mock.patch.dict(M.os.environ, {'SUPABASE_URL': 'https://storage.example.test', 'SUPABASE_SERVICE_KEY': 'test-only'})
    def test_signed_grant_stays_on_expected_storage_path(self):
        def reply(request, timeout):
            self.assertEqual(request.method, 'POST')
            relative = request.full_url.split('/storage/v1')[1] + '?token=test-only'
            response = mock.MagicMock()
            response.__enter__.return_value.read.return_value = json.dumps({'url': relative}).encode()
            return response
        with mock.patch.object(M.urllib.request, 'urlopen', side_effect=reply):
            status, result = M.signed_upload({'content_type': 'video/mp4', 'size': 1000})
        self.assertEqual(status, 200)
        self.assertTrue(result['upload_url'].startswith('https://storage.example.test/storage/v1/object/upload/sign/site-ad-media/'))
        self.assertTrue(result['public_url'].endswith('.mp4'))
        self.assertNotIn('test-only', result['public_url'])

    @mock.patch.dict(M.os.environ, {'SUPABASE_URL': 'https://storage.example.test', 'SUPABASE_SERVICE_KEY': 'test-only'})
    def test_foreign_grant_and_storage_failure_are_not_exposed(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"url":"https://other.example/upload?token=private"}'
        with mock.patch.object(M.urllib.request, 'urlopen', return_value=response):
            status, result = M.signed_upload({'content_type': 'image/png', 'size': 100})
        self.assertEqual(status, 503)
        self.assertNotIn('private', str(result))
        with mock.patch.object(M.urllib.request, 'urlopen', side_effect=URLError('storage unavailable')):
            self.assertEqual(M.signed_upload({'content_type': 'image/png', 'size': 100})[0], 503)


if __name__ == '__main__':
    unittest.main()
