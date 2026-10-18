"""
daily_slogan_rotate.py — 首頁大看板每日 slogan(不依賴 Claude 喚醒,純排程/確定性輪播)。
  以「日期序數 % 句庫長度」對映固定句子→每個日曆日永遠同一句、且逐日輪替。
  每次執行填 今日 起 HORIZON 天(滾動視窗),就算排程漏跑幾天、前面日子也早已寫好。
  句庫皆為原創兩段式(非名言/歌詞)。前端 loadSlogan 讀 date<=今日的最新一筆。
→ Supabase daily_slogan(date PK)。用法：python scripts/daily_slogan_rotate.py
"""
import sys, json, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

HORIZON = 120  # 一次寫未來幾天(滾動)

# 原創兩段式投資智慧句庫(非名言/歌詞)
POOL = [
    ("先看資金", "再看故事"), ("先數籌碼", "再談夢想"), ("跟著資金走", "別被情緒帶走"),
    ("先讀懂籌碼", "再相信趨勢"), ("看得懂的行情", "才是你的行情"), ("量先於價", "耐心先於貪心"),
    ("資金決定方向", "紀律決定結果"), ("別急著追高", "先想好退路"), ("趨勢是朋友", "過熱是提醒"),
    ("數字不騙人", "情緒才騙人"), ("順勢加碼", "逆勢保命"), ("籌碼會沉澱", "好股會發酵"),
    ("看清基本面", "也看懂人性面"), ("資金在哪", "機會就在哪"), ("風險先算", "報酬後談"),
    ("波動是常態", "恐慌才是意外"), ("看得夠遠", "才拿得夠穩"), ("買在無人問", "賣在人擠人"),
    ("行情是波動", "報酬是等待"), ("追高要謹慎", "佈局要趁靜"), ("量縮沉澱", "量增表態"),
    ("大戶看方向", "散戶看情緒"), ("先求不敗", "再求勝出"), ("看對趨勢", "更要熬過波動"),
    ("紀律是護城河", "耐心是複利源"), ("行情給機會", "紀律給結果"), ("別和趨勢作對", "也別和資金賭氣"),
    ("重點不是預測", "而是應對"), ("留得資金在", "不怕沒行情"), ("慢就是快", "穩就是贏"),
    ("題材會退潮", "基本面會留下"), ("怕的不是回檔", "是沒有計畫"), ("看懂籌碼流向", "少走許多冤枉"),
    ("資金是果", "耐心是因"), ("盤感靠紀律", "紀律靠複盤"), ("多空不重要", "對錯才重要"),
    ("先控制風險", "再放大報酬"), ("市場獎勵耐心", "懲罰衝動"), ("看數據做決定", "別靠感覺賭運氣"),
    ("行情總會來", "位置要先站"),
]


def _upsert(env, rows):
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/daily_slogan?on_conflict=date"
    req = urllib.request.Request(url, data=json.dumps(rows).encode(), method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    base = datetime.now(timezone(timedelta(hours=8))).date()
    n = len(POOL)
    rows = []
    for i in range(HORIZON):
        d = base + timedelta(days=i)
        l1, l2 = POOL[d.toordinal() % n]          # 確定性:每個日曆日固定對映一句
        rows.append({"date": d.strftime("%Y-%m-%d"), "line1": l1, "line2": l2})
    st = _upsert(env, rows)
    print(f"已輪播寫入 {len(rows)} 天 slogan {rows[0]['date']}..{rows[-1]['date']} "
          f"(今日 {rows[0]['line1']}，{rows[0]['line2']}。 status {st})")


if __name__ == "__main__":
    main()
