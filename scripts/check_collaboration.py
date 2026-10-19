"""Check new lane boundaries and shared-change notes without writing anything."""
import argparse
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def violations(paths, branch):
    result = []
    if any(Path(p).name == '.env.local' for p in paths):
        result.append('Do not commit .env.local credentials.')
    if branch.startswith('app/'):
        outside = [p for p in paths if not p.startswith(('apps/mobile/', 'tests/mobile/', 'docs/app/'))]
        if outside:
            result.append('App lane touches shared/website files; use a separate shared branch: ' + ', '.join(outside))
    if branch.startswith('web/'):
        if any(p.startswith('apps/mobile/') for p in paths):
            result.append('Website lane also changes App code; split the App work into its own branch.')
    shared = any(p.startswith(('api/', 'lib/', 'packages/shared/')) or p == 'vercel.json' for p in paths)
    note = any(p.startswith('docs/collaboration/changes/') and p.endswith('.md') for p in paths)
    if branch.startswith('shared/') and shared and not note:
        result.append('Shared changes need a change note describing website/App impact, compatibility and validation.')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=ROOT)
    parser.add_argument('--base', required=True)
    parser.add_argument('--head', default='HEAD')
    parser.add_argument('--branch', required=True)
    args = parser.parse_args()
    result = subprocess.run(['git', '-C', str(args.repo), 'diff', '--no-renames', '--name-only', '-z',
                             args.base + '...' + args.head, '--'], capture_output=True)
    if result.returncode:
        parser.exit(1, 'Cannot compare base/head. Fetch the target branch before checking.\n')
    paths = [p for p in result.stdout.decode('utf-8').split('\0') if p]
    errors = violations(paths, args.branch)
    if errors:
        parser.exit(1, '\n'.join(errors) + '\n')
    print('PASS collaboration boundaries:', args.branch, '(' + str(len(paths)) + ' changed paths)')


if __name__ == '__main__':
    main()
