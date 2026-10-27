"""
office_step.py - 排程打卡包裝（AI 研究室用，2026-10-27）

用法（批次檔裡）：python office_step.py <角色> <腳本路徑> [腳本參數...]
  角色：news / chip / tech / macro / risk / etf / data
執行前後打卡（office_report.record），中間照常執行原腳本：輸出直接沿用批次檔的轉向，
回傳原腳本的結束碼。打卡失敗不影響原腳本。
"""
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def main():
    if len(sys.argv) < 3:
        print("usage: office_step.py <agent> <script> [args...]")
        return 2
    agent, script, args = sys.argv[1], sys.argv[2], sys.argv[3:]
    step = Path(script).stem
    try:
        import office_report as office
    except Exception as e:                                  # noqa: BLE001
        office = None
        print(f"[office] 載入失敗（照常執行）：{type(e).__name__}", flush=True)
    if office:
        office.record(agent, step, "start")
    t0 = time.time()
    try:
        code = subprocess.call([sys.executable, script] + args)
    except Exception as e:                                  # noqa: BLE001
        print(f"[office] 執行 {script} 失敗：{type(e).__name__} {e}", flush=True)
        code = 1
    if office:
        office.record(agent, step, "end", ok=(code == 0), secs=time.time() - t0,
                      detail=None if code == 0 else f"exit {code}")
    return code


if __name__ == "__main__":
    sys.exit(main())
