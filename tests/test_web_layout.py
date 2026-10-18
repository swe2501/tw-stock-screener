"""Deployment contract checks, independent of live accounts or databases."""
import json
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'vercel.json').read_text())
BUILT = {p.relative_to(ROOT).as_posix() for b in CONFIG['builds'] for p in ROOT.glob(b['src']+'/*' if b['src'].endswith('/**') else b['src']) if p.is_file()}


def destination(url):
    path = urlsplit(url).path
    for route in CONFIG['routes']:
        if route.get('handle') == 'filesystem':
            if path.lstrip('/') in BUILT:
                return path
            continue
        match = re.fullmatch(route['src'], path)
        if match:
            if 'status' in route:
                return route['status']
            target = route['dest']
            for i, value in enumerate(match.groups(), 1):
                target = target.replace('$' + str(i), value or '')
            return target
    return 404


class AssetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        value = data.get('src') if tag in ('script', 'img') else data.get('href') if tag == 'link' else None
        if value and not urlsplit(value).scheme and not value.startswith('//'):
            self.urls.append(value)


class WebLayoutTests(unittest.TestCase):
    def test_original_local_entry_is_a_small_compatibility_launcher(self):
        entry = (ROOT / 'index.html').read_text(encoding='utf-8')
        self.assertLess(len(entry), 2500)
        self.assertIn("new URL('apps/web/index.html', location.href)", entry)
        self.assertIn('destination.search = location.search', entry)
        self.assertIn('destination.hash = location.hash', entry)
        self.assertNotIn('index.html', BUILT)

    def test_pages_keep_public_urls(self):
        for url in ['/', '/index.html', '/member/security', '/research/groupbook']:
            self.assertEqual(destination(url), '/apps/web/index.html')
        self.assertEqual(destination('/treasury-research.html'), '/apps/web/treasury-research.html')

    def test_all_declared_page_assets_resolve_to_built_files(self):
        for name in ['index.html', 'treasury-research.html']:
            parser = AssetParser()
            parser.feed((ROOT / 'apps/web' / name).read_text(encoding='utf-8'))
            for url in parser.urls:
                target = destination('/' + url.lstrip('/'))
                with self.subTest(page=name, asset=url):
                    self.assertIsInstance(target, str)
                    self.assertIn(urlsplit(target).path.lstrip('/'), BUILT)
                    self.assertNotEqual(target, '/apps/web/index.html')

    def test_each_python_api_keeps_extensionless_and_py_urls(self):
        for file in (ROOT / 'api').glob('*.py'):
            for suffix in ['', '.py']:
                self.assertEqual(destination('/api/' + file.stem + suffix), '/api/' + file.name)
        self.assertEqual(destination('/api/site_search?q=test'), '/api/prices.py?action=site_search')
        self.assertEqual(destination('/api/site_search.py?q=test'), '/api/prices.py?action=site_search')
        self.assertEqual(destination('/api/nested/not-an-api'), 404)
        self.assertNotEqual(destination('/api/unknown'), '/apps/web/index.html')

    def test_backend_and_mobile_do_not_become_static_build_outputs(self):
        self.assertNotIn('requirements.txt', BUILT)
        self.assertFalse(any(p.startswith(('apps/mobile/', 'lib/', 'data/')) for p in BUILT))
        self.assertIn('group-catalog.json', BUILT)
        self.assertEqual([b['src'] for b in CONFIG['builds'] if b['use'] == '@vercel/python'], ['api/*.py'])

    def test_scheduled_api_urls_are_preserved(self):
        self.assertEqual([c['path'] for c in CONFIG['crons']], ['/api/alert', '/api/alert?kind=sell'])


if __name__ == '__main__':
    unittest.main()
