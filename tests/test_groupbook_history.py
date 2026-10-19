"""Verify append-only persistence without a database connection."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('precompute',Path('scripts/groupbook_precompute.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class HistoryTests(unittest.TestCase):
    def test_repeated_publication_creates_distinct_versions_without_upsert(self):
        original=[{'kind':'groupbook_10','trade_date':'2026-10-16','payload':{'groups':[]}}]
        untouched=copy.deepcopy(original);requests=[]
        class Response:
            status=201
            def __enter__(self):return self
            def __exit__(self,*args):pass
        def send(request,**kwargs):requests.append(request);return Response()
        with patch.object(module.urllib.request,'urlopen',send):
            for _ in range(2):module.publish({'SUPABASE_URL':'https://example.com','SUPABASE_SERVICE_KEY':'test'},original)
        versions=[json.loads(r.data)[0] for r in requests]
        self.assertNotEqual(versions[0]['kind'],versions[1]['kind'])
        self.assertEqual(original,untouched)
        for request,version in zip(requests,versions):
            self.assertEqual(request.method,'POST')
            self.assertNotIn('on_conflict',request.full_url)
            self.assertEqual(request.get_header('Prefer'),'return=minimal')
            self.assertTrue(version['kind'].startswith('groupbook_10__'))
            self.assertEqual(version['payload']['snapshotId'],version['kind'])

if __name__=='__main__':unittest.main()
