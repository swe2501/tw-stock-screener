"""Admin-only upload grants. Media goes directly to Storage, outside the auth JSON limit."""
import datetime
import json
import os
import secrets
import urllib.error
import urllib.request
from urllib.parse import urlsplit

BUCKET = 'site-ad-media'
TYPES = {'image/jpeg': ('jpg', 5), 'image/png': ('png', 5),
         'image/webp': ('webp', 5), 'video/mp4': ('mp4', 30)}


def signed_upload(body):
    mime = body.get('content_type')
    size = body.get('size')
    if mime not in TYPES or type(size) is not int or not 0 < size <= TYPES[mime][1] * 1024 * 1024:
        return 400, {'error': '圖片限 JPG、PNG、WebP 5 MB；影片限 MP4 30 MB'}
    base = os.environ.get('SUPABASE_URL', '').rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_KEY', '')
    if not base or not key:
        return 503, {'error': '素材上傳服務尚未設定，請先使用 HTTPS 素材網址'}
    path = '%s/%s.%s' % (datetime.date.today().isoformat(), secrets.token_hex(16), TYPES[mime][0])
    storage = base + '/storage/v1'
    req = urllib.request.Request(storage + '/object/upload/sign/' + BUCKET + '/' + path,
                                 data=b'{}', method='POST', headers={
                                     'apikey': key, 'Authorization': 'Bearer ' + key,
                                     'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            result = json.loads(response.read())
        relative = result.get('url', '')
        expected = '/object/upload/sign/' + BUCKET + '/' + path
        parsed = urlsplit(relative)
        if parsed.scheme or parsed.netloc or parsed.path != expected or not parsed.query.startswith('token='):
            raise ValueError('invalid upload grant')
        return 200, {'upload_url': storage + relative,
                     'public_url': storage + '/object/public/' + BUCKET + '/' + path}
    except (urllib.error.URLError, ValueError, TypeError):
        return 503, {'error': '素材上傳暫時無法使用，請確認廣告素材儲存空間已啟用，或改用 HTTPS 素材網址'}
