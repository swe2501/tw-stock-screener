"""Decide deployment scope BEFORE contacting Vercel. No network or credentials."""
import argparse
import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def classify(paths):
    web = mobile = False
    for p in paths:
        if p.startswith(('apps/mobile/', 'docs/', 'tests/mobile/')):
            continue
        if p.startswith('apps/web/'):
            web = True
        elif p.startswith('services/mobile-preview/'):
            mobile = True
        else:
            # Shared/unknown changes conservatively update both services.
            web = mobile = True
    return {'web': web, 'mobile': mobile}


def plan(before, after, branch, git=subprocess.run):
    if branch != 'uat':
        return {'web': False, 'mobile': False, 'reason': 'not-uat'}
    if not re.fullmatch('[0-9a-f]{40}', after or ''):
        raise ValueError('invalid head SHA')
    if not re.fullmatch('[0-9a-f]{40}', before or '') or before == '0' * 40:
        return {'web': True, 'mobile': True, 'reason': 'no-baseline'}
    r = git(['git', 'diff', '--no-renames', '--name-only', '-z', before, after, '--'],
            cwd=ROOT, capture_output=True)
    if r.returncode:
        raise RuntimeError('Cannot determine changed files; refusing to silently skip deployment')
    result = classify(r.stdout.decode('utf-8').split('\0')[:-1])
    return {**result, 'reason': 'changed-paths'}


def main():
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument('--before', required=True)
    a.add_argument('--after', required=True)
    a.add_argument('--branch', required=True)
    args = a.parse_args()
    result = plan(args.before, args.after, args.branch)
    print(json.dumps(result))
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
            for name in ('web', 'mobile'):
                f.write(name + '=' + str(result[name]).lower() + '\n')


if __name__ == '__main__':
    main()
