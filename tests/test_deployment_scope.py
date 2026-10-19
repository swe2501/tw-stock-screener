import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('scope',Path(__file__).resolve().parents[1]/'scripts/deployment_scope.py')
scope=importlib.util.module_from_spec(spec);spec.loader.exec_module(scope)
class ScopeTests(unittest.TestCase):
    def test_pure_app_and_docs_never_deploy(self):
        self.assertEqual(scope.classify(['apps/mobile/src/App.tsx','docs/app/info.md','tests/mobile/a.cjs']),{'web':False,'mobile':False})
    def test_services_are_independent(self):
        self.assertEqual(scope.classify(['apps/web/index.html']),{'web':True,'mobile':False})
        self.assertEqual(scope.classify(['services/mobile-preview/api/prices.py']),{'web':False,'mobile':True})
    def test_shared_and_unknown_are_not_missed(self):
        for p in ['api/prices.py','lib/auth.py','packages/shared/api.js','requirements.txt','vercel.json','.github/workflows/filtered-uat-deployment.yml','new-root-file']:
            self.assertEqual(scope.classify([p]),{'web':True,'mobile':True})
    def test_feature_and_prod_do_not_deploy(self):
        for branch in ['app/andrew/mobile-foundation','prod','Andrew','Duke']:
            self.assertFalse(scope.plan('', '',branch)['web'])
    def test_first_push_and_manual_request_build_both(self):
        self.assertTrue(scope.plan('0'*40,'a'*40,'uat')['web'])
    def test_full_push_range_and_renames(self):
        def git(args,**kwargs):
            self.assertIn('--no-renames',args);self.assertIn('b'*40,args);self.assertIn('a'*40,args)
            return SimpleNamespace(returncode=0,stdout=b'apps/mobile/App.tsx\0apps/web/deleted.html\0')
        self.assertEqual(scope.plan('b'*40,'a'*40,'uat',git),{'web':True,'mobile':False,'reason':'changed-paths'})
    def test_comparison_failure_is_visible(self):
        with self.assertRaises(RuntimeError):scope.plan('b'*40,'a'*40,'uat',lambda *a,**kw:SimpleNamespace(returncode=128))
if __name__=='__main__':unittest.main()
