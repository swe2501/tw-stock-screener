"""Fail-closed hourly topic generation; no upload after failed/unchanged output."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
# 主模型＋備援（同一模型先等一下再試一次，仍不行才換備援；gpt-5.6-sol 為 10/19 前實際跑過的模型）
MODELS = ('gpt-6.1-sol', 'gpt-6.1-sol', 'gpt-5.6-sol')
RETRY_WAIT_S = 180


def find_cli():
    # The desktop binary supports this account's models; the old npm CLI does not.
    bins = Path(os.environ['LOCALAPPDATA']) / 'OpenAI' / 'Codex' / 'bin'
    choices = sorted(bins.glob('*/codex.exe'), key=lambda p: p.stat().st_mtime, reverse=True)
    if not choices:
        raise RuntimeError('Desktop Codex CLI not found; refusing old npm fallback')
    return choices[0]


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(errors='replace')   # Codex 輸出改經 Python 轉寫 log，遇到無法編碼的字元不可讓排程當掉
    print(time.strftime('==== %Y-%m-%d %H:%M:%S hot_topics run ===='), flush=True)
    started = time.time()
    prompt = ('Web-search live news from the last 7 days about Taiwan stock sectors. '
              'Follow scripts/codex_hot_topics.md exactly and regenerate scripts/hot_topics.json. '
              'Only write that JSON file. Read scripts/tw_listed_codes.json for valid codes. '
              'Do not upload, run Python/git, modify other files, or change schedules. '
              'Every news item needs a verified real source URL and its actual publication date. '
              'Do not invent dates or sources. Today in Asia/Taipei is ' + time.strftime('%Y-%m-%d') + '.')
    cli = find_cli()
    print('CLI:', cli, flush=True)
    # 2026-10-24：模型偶爾回「Selected model is at capacity」（10/23 10:00 整點因此失敗、沒重試）。
    # 遇到滿載／不支援這類「換模型或等一下就會好」的錯誤時，依序改用備援模型重跑；其他錯誤照舊直接失敗。
    retryable = ('at capacity', 'not supported', 'requires a newer version', 'try a different model')
    returncode = 1
    for attempt, model in enumerate(MODELS):
        if attempt:
            print(f'[retry] {RETRY_WAIT_S}s 後改用 {model} 重試', flush=True)
            time.sleep(RETRY_WAIT_S)
        print('MODEL:', model, flush=True)
        try:
            result = subprocess.run([str(cli), '--search', 'exec', '--model', model,
                                     '-C', str(HERE.parent), '--skip-git-repo-check',
                                     '--sandbox', 'workspace-write', prompt],
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                    text=True, encoding='utf-8', errors='replace', timeout=2700)
            returncode, output = result.returncode, getattr(result, 'stdout', None) or ''
        except subprocess.TimeoutExpired as exc:
            returncode, output = 124, (exc.output or '') if isinstance(exc.output, str) else ''
        print(output, end='' if output.endswith('\n') else '\n', flush=True)   # Codex 輸出照舊寫進 log
        if not returncode:
            break
        if not any(k in output[-6000:] for k in retryable):
            break
    if returncode:
        print('[error] Generation failed; upload and pruning skipped', flush=True)
        return returncode
    output = HERE / 'hot_topics.json'
    if not output.exists() or output.stat().st_mtime < started:
        print('[error] No freshly generated JSON; upload and pruning skipped', flush=True)
        return 1
    # Uploader independently checks file age, news dates and the valid code list.
    json.loads(output.read_text(encoding='utf-8-sig'))
    return subprocess.run([sys.executable, str(HERE / 'upload_hot_topics.py')], timeout=180).returncode


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as exc:
        print('[error]', type(exc).__name__, str(exc), flush=True)
        sys.exit(1)
