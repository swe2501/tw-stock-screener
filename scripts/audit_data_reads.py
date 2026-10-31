"""Offline source inventory. Finds static candidate reads, not live traffic volume."""
import argparse
import json
import re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PATTERNS=[re.compile(r'/rest/v1/(?P<rpc>rpc/)?(?P<name>[A-Za-z_][A-Za-z0-9_]*)'),re.compile(r'''(?:_cache_sb|_sb)\([^\n]{0,60}?["']/([A-Za-z_][A-Za-z0-9_]*)''')]
def inventory(root=ROOT):
 rows=[]
 for area in ['apps/web','api','lib']:
  for path in sorted((root/area).rglob('*')):
   if path.suffix not in ('.html','.js','.py'):continue
   for number,line in enumerate(path.read_text(encoding='utf-8-sig',errors='replace').splitlines(),1):
    for pattern in PATTERNS:
     for match in pattern.finditer(line):
      name=match.groupdict().get('name') or match.group(1)
      rows.append({'file':path.relative_to(root).as_posix(),'line':number,'source':name,'kind':'rpc' if match.groupdict().get('rpc') else 'relation','browser':area=='apps/web'})
 return sorted({(r['file'],r['line'],r['source'],r['kind']):r for r in rows}.values(),key=lambda r:(r['source'],r['file'],r['line']))
def markdown(rows):
 lines=['# 網站資料讀取靜態盤點','日期：2026-11-01。只記錄來源名稱、檔案與行號，不讀雲端資料或輸出密鑰。','此為靜態候選讀取；字串出現在註解、寫入路徑或動態 SQL 時，需人工分類確認。不是線上呼叫次數／傳輸量排名，也未宣稱涵蓋所有動態路徑。','| 來源 | 類型 | 層級 | 位置 |','|---|---|---|---|']
 for r in rows:lines.append(f"| `{r['source']}` | {r['kind']} | {'browser' if r['browser'] else 'server'} | `{r['file']}:{r['line']}` |")
 return '\n'.join(lines)+'\n'
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path);args=parser.parse_args();rows=inventory();report=markdown(rows)
 if args.output:args.output.write_text(report,encoding='utf-8');print(json.dumps({'candidate_reads':len(rows),'distinct_sources':len({r['source'] for r in rows})}))
 else:print(report)
