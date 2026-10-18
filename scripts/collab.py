"""Safe web/App workspaces and UAT integration. Never reset, force, or deploy prod."""
import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROTECTED = {'uat', 'prod', 'Andrew', 'Duke'}


class CollaborationError(RuntimeError):
    pass


def git(root, *args):
    result = subprocess.run(['git', '-C', str(root), *args], capture_output=True, text=True,
                            encoding='utf-8', errors='replace')
    if result.returncode:
        raise CollaborationError(result.stderr.strip() or result.stdout.strip() or 'Git operation failed')
    return result.stdout.strip()


def clean(root):
    if git(root, 'status', '--porcelain', '--untracked-files=normal'):
        raise CollaborationError('Workspace has unfinished changes. Commit the intended work first; no reset or stash was performed.')


def branch_name(root):
    branch = git(root, 'branch', '--show-current')
    if not branch or branch in PROTECTED:
        raise CollaborationError('Use your own app/web/shared feature branch, not a protected or detached branch.')
    return branch


def start(root, lane, owner, task):
    for value in (owner, task):
        if not re.fullmatch(r'[a-z][a-z0-9-]{0,47}', value):
            raise CollaborationError('Owner/task must use lowercase letters, numbers and hyphens, starting with a letter.')
    if lane not in {'app', 'web', 'shared'}:
        raise CollaborationError('Unknown work lane')
    clean(root)
    target = (root.parent / (root.name + '-' + lane + '-' + owner + '-' + task)).resolve()
    if target.parent != root.resolve().parent or target == root.resolve() or target.exists():
        raise CollaborationError('The new sibling workspace must not already exist. Existing workspaces are never replaced.')
    git(root, 'fetch', 'origin')
    branch = '/'.join((lane, owner, task))
    git(root, 'worktree', 'add', '-b', branch, str(target), 'origin/uat')
    return target, branch


def sync(root):
    clean(root)
    branch = branch_name(root)
    git(root, 'fetch', 'origin')
    # A conflict is deliberately left for a developer to resolve file by file.
    git(root, 'merge', '--no-edit', 'origin/uat')
    return branch


def run_checks(root):
    commands = [
        [sys.executable, str(ROOT / 'scripts/check_api_budget.py'), '--root', str(root)],
        [sys.executable, str(ROOT / 'scripts/check_collaboration.py'), '--repo', str(root),
         '--base', 'origin/uat', '--head', 'HEAD', '--branch', branch_name(root)],
    ]
    for command in commands:
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if result.returncode:
            raise CollaborationError(result.stdout.strip() + '\n' + result.stderr.strip())
    git(root, 'diff', '--check')


def integrate(root, publish=False):
    branch = sync(root)
    run_checks(root)
    clean(root)
    git(root, 'merge-base', '--is-ancestor', 'origin/uat', 'HEAD')
    if publish:
        # Normal fast-forward protection plus an atomic two-ref update. If a
        # partner publishes while checks run, reject everything; retry sync.
        git(root, 'push', '--atomic', 'origin', 'HEAD:refs/heads/' + branch, 'HEAD:refs/heads/uat')
    return branch


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=ROOT)
    commands = parser.add_subparsers(dest='command', required=True)
    new = commands.add_parser('start', help='Create a separate sibling workspace from latest origin/uat')
    new.add_argument('--lane', choices=['app', 'web', 'shared'], required=True)
    new.add_argument('--owner', required=True)
    new.add_argument('--task', required=True)
    commands.add_parser('sync', help='Merge latest UAT into the current clean feature branch')
    integration = commands.add_parser('integrate', help='Merge latest UAT and check before publishing')
    integration.add_argument('--publish-uat', action='store_true', help='Atomically publish own branch and UAT after checks')
    commands.add_parser('status', help='Read current branch/workspace status without fetching')
    args = parser.parse_args()
    root = args.repo.resolve()
    try:
        if args.command == 'start':
            target, branch = start(root, args.lane, args.owner, args.task)
            print('Workspace:', target)
            print('Branch:', branch)
        elif args.command == 'sync':
            print('Synced:', sync(root))
        elif args.command == 'integrate':
            branch = integrate(root, args.publish_uat)
            print(('Published to UAT: ' if args.publish_uat else 'Ready for UAT: ') + branch)
        else:
            print(git(root, 'status', '-sb'))
    except CollaborationError as error:
        parser.exit(1, str(error) + '\nStopped. No force/reset was used. Resolve conflicts or sync again before retrying.\n')


if __name__ == '__main__':
    main()
