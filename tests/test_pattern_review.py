import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
from lib.pattern_review import CASES, handle


class PatternReviewTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, VERCEL_ENV='preview', VERCEL_GIT_COMMIT_REF='uat')
        self.env.start()
        self.addCleanup(self.env.stop)
        self.case = CASES[0]
        self.body = dict(case_id=self.case['id'], status='forming', source_sha256=self.case['source_sha256'], expected_revision=None)

    def test_auth_handler_rejects_unverified_admin_before_any_review_access(self):
        spec = importlib.util.spec_from_file_location('review_auth',Path(__file__).resolve().parents[1]/'api/auth.py')
        auth = importlib.util.module_from_spec(spec);spec.loader.exec_module(auth)
        h = object.__new__(auth.handler)
        raw = json.dumps({'action':'admin_pattern_reviews'}).encode()
        h.headers = {'Content-Length':str(len(raw)), 'Authorization':'Bearer ordinary'}
        h.rfile = io.BytesIO(raw);h._json = Mock()
        with patch.object(auth,'_verify_admin',return_value=None),patch.object(auth,'_rest') as rest:
            h.do_POST()
        self.assertEqual(h._json.call_args.args[0],403);rest.assert_not_called()

    def test_prod_and_missing_admin_block_storage_access(self):
        for env,email in [('production','admin'),('preview','')]:
            rest=Mock()
            with patch.dict(os.environ,VERCEL_ENV=env):
                self.assertEqual(handle('admin_pattern_reviews',{},email,rest)[0],403)
            rest.assert_not_called()

    def test_get_has_four_cases_and_does_not_write(self):
        rest=Mock(return_value=(200,[]))
        st,data=handle('admin_pattern_reviews',{},'admin',rest)
        self.assertEqual(st,200);self.assertEqual(len(data['cases']),4)
        self.assertEqual(rest.call_count,1)

    def test_first_save_and_all_state_options(self):
        for state in ['pending','forming','breakout','rejected']:
            rest=Mock(side_effect=[(200,[]),(201,[{'key':'stored'}])])
            st,data=handle('admin_pattern_review_save',dict(self.body,status=state),'admin',rest)
            self.assertEqual(st,200);self.assertEqual(data['decision']['status'],state)
            self.assertFalse(data['public_patterns_changed'])
            self.assertIn('pattern_review_uat_v1_',str(rest.call_args))

    def test_invalid_case_state_and_source_never_write(self):
        for change in [dict(case_id='unknown'),dict(status='W'),dict(source_sha256='changed')]:
            rest=Mock(return_value=(200,[]))
            self.assertIn(handle('admin_pattern_review_save',dict(self.body,**change),'admin',rest)[0],[400,409])
            self.assertEqual(rest.call_count,1)

    def test_read_failure_never_creates_default_decision(self):
        rest=Mock(return_value=(503,{}))
        self.assertEqual(handle('admin_pattern_review_save',self.body,'admin',rest)[0],503)
        self.assertEqual(rest.call_count,1)

    def test_concurrent_update_uses_compare_and_swap(self):
        old=dict(status='pending',source_sha256=self.case['source_sha256'],revision='r1')
        row={'key':'pattern_review_uat_v1_'+self.case['id'],'value':json.dumps(old)}
        rest=Mock(side_effect=[(200,[row]),(200,[])])
        st,_=handle('admin_pattern_review_save',dict(self.body,expected_revision='r1'),'admin',rest)
        self.assertEqual(st,409);self.assertIn('&value=eq.',rest.call_args.args[0])
        self.assertEqual(rest.call_args.kwargs['method'],'PATCH')


if __name__ == '__main__':unittest.main()
