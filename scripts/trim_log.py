"""
trim_log.py — 紀錄檔只保留最近 N 天（2026-10-29：codex_topics.log 每小時寫入 Codex 完整輸出，已長到 35MB）。

找每段開頭的「==== YYYY-MM-DD HH:MM:SS ... ====」，從 N 天內第一段開始保留，之前的刪掉。
以位元組處理（紀錄檔混有不同編碼），找不到合格段落開頭就不動檔案。
由批次檔在主程式之前呼叫（那時沒有其他程式開著這個檔）。

用法：python scripts/trim_log.py <紀錄檔> [天數=7]
"""
import datetime as dt
import re
import sys
from pathlib import Path

HEADER = re.compile(rb"^==== (\d{4}-\d{2}-\d{2}) ", re.M)


def main():
    path = Path(sys.argv[1])
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 7
    if not path.exists():
        return 0
    data = path.read_bytes()
    cutoff = (dt.date.today() - dt.timedelta(days=days)).isoformat().encode()
    for m in HEADER.finditer(data):
        if m.group(1) >= cutoff:
            if m.start() > 0:
                path.write_bytes(data[m.start():])
                print(f"[trim_log] {path.name} {len(data) // 1024}KB -> {(len(data) - m.start()) // 1024}KB（保留 {days} 天）")
            return 0
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:                                      # noqa: BLE001  修剪失敗不可擋住主排程
        print(f"[trim_log] 略過：{type(e).__name__}: {e}")
        sys.exit(0)
