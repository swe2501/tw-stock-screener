"""Offline regression checks: generation failures must never reach upload/pruning."""
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import os

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
import run_codex_topics as runner
import upload_hot_topics as uploader


class SafetyTests(unittest.TestCase):
    def test_fresh_generation_reaches_uploader_and_propagates_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            def run(args, **kwargs):
                if '--model' in args:
                    (folder / 'hot_topics.json').write_text('[]')
                    return SimpleNamespace(returncode=0)
                return SimpleNamespace(returncode=9)
            with patch.object(runner, 'HERE', folder), patch.object(runner, 'find_cli', return_value=Path('codex.exe')), patch.object(runner.subprocess, 'run', side_effect=run) as call:
                self.assertEqual(runner.main(), 9)
                self.assertEqual(call.call_count, 2)

    def test_generation_failure_skips_upload(self):
        with patch.object(runner, 'find_cli', return_value=Path('codex.exe')), patch.object(runner.subprocess, 'run', return_value=SimpleNamespace(returncode=7)) as call:
            self.assertEqual(runner.main(), 7)
            self.assertEqual(call.call_count, 1)

    def test_success_without_new_file_skips_upload(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            output = folder / 'hot_topics.json'
            output.write_text('[]')
            os.utime(output, (time.time()-100, time.time()-100))
            with patch.object(runner, 'HERE', folder), patch.object(runner, 'find_cli', return_value=Path('codex.exe')), patch.object(runner.subprocess, 'run', return_value=SimpleNamespace(returncode=0)) as call:
                self.assertEqual(runner.main(), 1)
                self.assertEqual(call.call_count, 1)

    def test_capacity_error_retries_then_succeeds(self):
        # 2026-10-24：模型滿載要自動重試（等一下再跑），成功後照常進上傳
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            models = []
            def run(args, **kwargs):
                if '--model' in args:
                    models.append(args[args.index('--model') + 1])
                    if len(models) == 1:
                        return SimpleNamespace(returncode=1, stdout='ERROR: Selected model is at capacity. Please try a different model.\n')
                    (folder / 'hot_topics.json').write_text('[]')
                    return SimpleNamespace(returncode=0, stdout='done\n')
                return SimpleNamespace(returncode=0)
            with patch.object(runner, 'HERE', folder), patch.object(runner, 'RETRY_WAIT_S', 0), \
                    patch.object(runner, 'find_cli', return_value=Path('codex.exe')), \
                    patch.object(runner.subprocess, 'run', side_effect=run) as call:
                self.assertEqual(runner.main(), 0)
                self.assertEqual(models, ['gpt-6.1-sol', 'gpt-6.1-sol'])
                self.assertEqual(call.call_count, 3)          # 生成兩次＋上傳一次

    def test_unsupported_model_falls_back(self):
        with patch.object(runner, 'RETRY_WAIT_S', 0), patch.object(runner, 'find_cli', return_value=Path('codex.exe')), \
                patch.object(runner.subprocess, 'run', return_value=SimpleNamespace(
                    returncode=1, stdout="The 'x' model is not supported when using Codex with a ChatGPT account.\n")) as call:
            self.assertEqual(runner.main(), 1)                # 三個模型設定都試過仍失敗 → 不上傳
            self.assertEqual(call.call_count, len(runner.MODELS))

    def test_stale_json_exits_before_loading_credentials(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'topics.json'
            output.write_text('[]')
            os.utime(output, (time.time()-8000, time.time()-8000))
            with patch.object(sys, 'argv', ['upload_hot_topics.py', str(output)]), patch.object(uploader.bs, '_load_env') as load:
                with self.assertRaises(SystemExit) as exc:
                    uploader.main()
                self.assertEqual(exc.exception.code, 1)
                load.assert_not_called()

    def test_publication_dates(self):
        today = uploader.datetime.now(uploader.timezone(uploader.timedelta(hours=8))).date()
        row = {'topic':'test', 'source_urls':['https://example.com/news'], 'codes':[{'code':'2330'}], 'published_at':str(today)}
        self.assertIsNotNone(uploader._clean_record(row)[0])
        for value in [str(today-uploader.timedelta(days=8)), '2099-01-01', '', 'bad']:
            row['published_at'] = value
            self.assertIsNone(uploader._clean_record(row)[0])


if __name__ == '__main__':
    unittest.main()
