"""Assemble a reviewable atomic migration. Writes a local artifact; NEVER executes SQL."""
import argparse
import hashlib
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
FILES=('member-share-unlock.sql','member-share-vouchers.sql','member-voucher-levels.sql',
       'member-vip-read-access.sql','member-task-wallet.sql')


def assemble():
    sections=['-- REVIEW ARTIFACT ONLY. Requires explicit shared-PRODUCTION approval.\n'
              '-- Atomic: any preflight or policy failure rolls the entire batch back.\n'
              '-- No campaign, task or exchange definitions are activated.\nbegin;\n'
              "do $$ begin\n"
              " if to_regclass('public.member_rewards') is null or to_regclass('public.member_point_ledger') is null then raise exception 'MEMBER_BASE_MIGRATION_REQUIRED'; end if;\n"
              " if to_regclass('public.member_share_campaign') is not null or to_regclass('public.member_feature_catalog') is not null then raise exception 'MEMBER_MIGRATION_ALREADY_PRESENT_REVIEW_REQUIRED'; end if;\n"
              "end $$;\n"]
    for filename in FILES:
        source=(ROOT/'docs/database'/filename).read_text(encoding='utf-8-sig')
        digest=hashlib.sha256(source.encode()).hexdigest()
        sections.append(f'\n-- SOURCE {filename} SHA256 {digest}\n'+re.sub(r'^(begin;|commit;)\s*$', '',source,flags=re.MULTILINE))
    sections.append('\ncommit;\n')
    return '\n'.join(sections)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(assemble(),encoding='utf-8')
    print(str(args.output.resolve()))
