"""Exercise real local bare repositories; never contact the shared GitHub repo."""
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


collab = module('collab')
check = module('check_collaboration')


class CollaborationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='market-academy-collab-')
        self.area = Path(self.temp.name).resolve()
        self.assertTrue(self.area.is_relative_to(Path(tempfile.gettempdir()).resolve()))
        self.remote = self.area / 'origin.git'
        self.root = self.area / 'project'
        self.partner = self.area / 'partner'
        self.g(self.area, 'init', '--bare', str(self.remote))
        self.g(self.area, 'init', '--initial-branch=uat', str(self.root))
        self.identity(self.root)
        (self.root / 'api').mkdir()
        (self.root / 'api' / 'example.py').write_text('# fixture\n', encoding='utf-8')
        (self.root / 'vercel.json').write_text(json.dumps({'builds': [{'src': 'api/*.py', 'use': '@vercel/python'}]}), encoding='utf-8')
        self.commit(self.root, 'index.html', 'base\n')
        self.g(self.root, 'remote', 'add', 'origin', str(self.remote))
        self.g(self.root, 'push', '-u', 'origin', 'uat')
        self.g(self.area, 'clone', '--branch', 'uat', str(self.remote), str(self.partner))
        self.identity(self.partner)
        self.g(self.root, 'checkout', '-b', 'app/test/editor')

    def tearDown(self):
        # Only the generated, verified per-test directory is recursively cleaned.
        self.assertTrue(self.area.is_relative_to(Path(tempfile.gettempdir()).resolve()))
        self.assertTrue(self.area.name.startswith('market-academy-collab-'))
        self.temp.cleanup()

    @staticmethod
    def g(root, *args):
        return collab.git(root, *args)

    def identity(self, root):
        self.g(root, 'config', 'user.name', 'Collaboration fixture')
        self.g(root, 'config', 'user.email', 'fixture@example.test')

    def commit(self, root, path, text):
        target = root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding='utf-8')
        self.g(root, 'add', '.')
        self.g(root, 'commit', '-m', 'fixture change')

    def test_new_app_workspace_keeps_existing_checkout_and_refuses_replacement(self):
        target, branch = collab.start(self.root, 'app', 'justy', 'foundation')
        self.assertEqual(self.g(self.root, 'branch', '--show-current'), 'app/test/editor')
        self.assertEqual(self.g(target, 'branch', '--show-current'), branch)
        self.assertEqual(self.g(target, 'rev-parse', 'HEAD'), self.g(self.root, 'rev-parse', 'origin/uat'))
        with self.assertRaises(collab.CollaborationError):
            collab.start(self.root, 'app', 'justy', 'foundation')

    def test_dirty_workspace_is_preserved(self):
        target = self.root / 'unfinished.txt'
        target.write_text('keep this', encoding='utf-8')
        with self.assertRaises(collab.CollaborationError):
            collab.sync(self.root)
        self.assertEqual(target.read_text(encoding='utf-8'), 'keep this')

    def test_real_merge_conflict_stops_without_publishing(self):
        self.commit(self.root, 'index.html', 'my change\n')
        self.commit(self.partner, 'index.html', 'partner change\n')
        self.g(self.partner, 'push', 'origin', 'uat')
        expected = self.g(self.partner, 'rev-parse', 'HEAD')
        with self.assertRaises(collab.CollaborationError):
            collab.integrate(self.root, publish=True)
        self.assertEqual(self.g(self.remote, 'rev-parse', 'uat'), expected)
        self.assertTrue(self.g(self.root, 'diff', '--name-only', '--diff-filter=U'))

    def test_concurrent_publish_rejects_atomically_then_safe_retry_preserves_both(self):
        self.commit(self.root, 'apps/mobile/fixture.md', 'app work\n')
        original_checks = collab.run_checks

        def concurrent_update(root):
            original_checks(root)
            self.commit(self.partner, 'website.md', 'partner work\n')
            self.g(self.partner, 'push', 'origin', 'uat')

        with patch.object(collab, 'run_checks', concurrent_update):
            with self.assertRaises(collab.CollaborationError):
                collab.integrate(self.root, publish=True)
        self.assertEqual(self.g(self.remote, 'rev-parse', 'uat'), self.g(self.partner, 'rev-parse', 'HEAD'))
        missing = subprocess.run(['git', '-C', str(self.remote), 'show-ref', '--verify', 'refs/heads/app/test/editor'], capture_output=True)
        self.assertNotEqual(missing.returncode, 0, 'Failed atomic push must not partially publish the feature branch')
        collab.integrate(self.root, publish=True)
        self.assertEqual(self.g(self.remote, 'rev-parse', 'uat'), self.g(self.root, 'rev-parse', 'HEAD'))
        self.assertEqual((self.root / 'website.md').read_text(encoding='utf-8'), 'partner work\n')
        self.assertEqual((self.root / 'apps/mobile/fixture.md').read_text(encoding='utf-8'), 'app work\n')

    def test_protected_branch_is_not_used_as_feature_branch(self):
        self.g(self.root, 'checkout', 'uat')
        with self.assertRaises(collab.CollaborationError):
            collab.sync(self.root)

    def test_lane_rules_and_shared_compatibility_note(self):
        self.assertFalse(check.violations(['apps/mobile/screen.tsx'], 'app/justy/home'))
        self.assertTrue(check.violations(['api/auth.py'], 'app/justy/home'))
        self.assertTrue(check.violations(['apps/mobile/screen.tsx'], 'web/partner/home'))
        self.assertTrue(check.violations(['api/chart.py'], 'shared/justy/chart'))
        self.assertFalse(check.violations(['api/chart.py', 'docs/collaboration/changes/chart.md'], 'shared/justy/chart'))
        self.assertTrue(check.violations(['.env.local'], 'justy-layout'))

    def prepare_justy(self):
        self.g(self.root, 'branch', '-m', 'web/justy/fixture')
        target = self.area / 'JUSTY local checkout'
        self.g(self.root, 'worktree', 'add', '-b', 'justy-layout', str(target), 'origin/uat')
        self.g(self.root, 'push', 'origin', 'justy-layout')
        return target

    def test_justy_publication_updates_three_remote_refs_and_local_files(self):
        target = self.prepare_justy()
        self.commit(self.root, 'apps/web/fixture.html', 'new website\n')
        self.commit(self.partner, 'partner.md', 'keep partner update\n')
        self.g(self.partner, 'push', 'origin', 'uat')
        branch, actual, commit = collab.publish_justy(self.root)
        self.assertEqual(actual, target)
        for ref in (branch, 'uat', 'justy-layout'):
            self.assertEqual(self.g(self.remote, 'rev-parse', ref), commit)
        self.assertEqual(self.g(target, 'rev-parse', 'HEAD'), commit)
        self.assertEqual(self.g(target, 'branch', '--show-current'), 'justy-layout')
        self.assertEqual((target / 'apps/web/fixture.html').read_text(), 'new website\n')
        self.assertEqual((target / 'partner.md').read_text(), 'keep partner update\n')
        self.assertEqual(collab.publish_justy(self.root)[2], commit)

    def test_justy_dirty_local_checkout_stops_before_push(self):
        target = self.prepare_justy()
        before = self.g(self.remote, 'rev-parse', 'uat')
        self.commit(self.root, 'apps/web/fixture.html', 'website\n')
        (target / 'draft.txt').write_text('keep my draft')
        with self.assertRaises(collab.CollaborationError):
            collab.publish_justy(self.root)
        self.assertEqual(self.g(self.remote, 'rev-parse', 'uat'), before)
        self.assertEqual((target / 'draft.txt').read_text(), 'keep my draft')

    def test_justy_local_unpublished_commits_are_not_published_implicitly(self):
        target = self.prepare_justy()
        self.commit(target, 'private-draft.md', 'unpublished local work\n')
        local = self.g(target, 'rev-parse', 'HEAD')
        before = self.g(self.remote, 'rev-parse', 'uat')
        with self.assertRaisesRegex(collab.CollaborationError, 'unpublished'):
            collab.publish_justy(self.root)
        self.assertEqual(self.g(target, 'rev-parse', 'HEAD'), local)
        self.assertEqual(self.g(self.remote, 'rev-parse', 'uat'), before)

    def test_justy_command_rejects_app_and_other_owners(self):
        self.prepare_justy()
        for branch in ('app/justy/preview', 'web/andrew/website'):
            self.g(self.root, 'branch', '-m', branch)
            with self.assertRaisesRegex(collab.CollaborationError, 'never App or another owner'):
                collab.publish_justy(self.root)

    def test_justy_rechecks_local_changes_after_checks(self):
        target = self.prepare_justy()
        self.commit(self.root, 'apps/web/fixture.html', 'website\n')
        before = self.g(self.remote, 'rev-parse', 'uat')
        checks = collab.run_checks
        def local_edit(root):
            checks(root)
            (target / 'draft.txt').write_text('started while checking')
        with patch.object(collab, 'run_checks', local_edit):
            with self.assertRaises(collab.CollaborationError):
                collab.publish_justy(self.root)
        self.assertEqual(self.g(self.remote, 'rev-parse', 'uat'), before)
        self.assertTrue((target / 'draft.txt').exists())

    def test_justy_race_rejects_all_remote_updates_then_retry_preserves_both(self):
        target = self.prepare_justy()
        self.commit(self.root, 'apps/web/fixture.html', 'website\n')
        before = self.g(self.remote, 'rev-parse', 'uat')
        self.g(self.partner, 'fetch', 'origin')
        self.g(self.partner, 'checkout', '-b', 'justy-layout', 'origin/justy-layout')
        checks = collab.run_checks
        def concurrent_update(root):
            checks(root)
            self.commit(self.partner, 'partner-justy.md', 'parallel update\n')
            self.g(self.partner, 'push', 'origin', 'justy-layout')
        with patch.object(collab, 'run_checks', concurrent_update):
            with self.assertRaises(collab.CollaborationError):
                collab.publish_justy(self.root)
        self.assertEqual(self.g(self.remote, 'rev-parse', 'uat'), before)
        self.assertEqual(self.g(target, 'rev-parse', 'HEAD'), before)
        collab.publish_justy(self.root)
        self.assertEqual((target / 'partner-justy.md').read_text(), 'parallel update\n')
        self.assertEqual((target / 'apps/web/fixture.html').read_text(), 'website\n')

    def test_justy_reports_when_remote_publish_succeeds_but_local_edit_blocks_sync(self):
        target = self.prepare_justy()
        self.commit(self.root, 'apps/web/fixture.html', 'website\n')
        original = collab.git
        def edit_after_push(root, *args):
            result = original(root, *args)
            if args[:2] == ('push', '--atomic'):
                (target / 'draft.txt').write_text('keep new local work')
            return result
        with patch.object(collab, 'git', edit_after_push):
            with self.assertRaisesRegex(collab.CollaborationError, 'Remote UAT.*local synchronization did not complete'):
                collab.publish_justy(self.root)
        self.assertEqual(self.g(self.remote, 'rev-parse', 'uat'), self.g(self.root, 'rev-parse', 'HEAD'))
        self.assertNotEqual(self.g(target, 'rev-parse', 'HEAD'), self.g(self.root, 'rev-parse', 'HEAD'))
        self.assertEqual((target / 'draft.txt').read_text(), 'keep new local work')


if __name__ == '__main__':
    unittest.main()
