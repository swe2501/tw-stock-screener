"""補某天首頁櫃買指數分時小圖（mini_OTC）：盤中排程沒跑的日子，改用永豐 Shioaji 櫃買指數 1 分 K。

2026-11-13 盤中排程視窗被誤關（0xC000013A），當天沒有 MIS 記錄 → 首頁櫃買卡「分時暫無資料」。
做法：永豐 kbars(櫃買指數) 取當天 09:00–13:30 一分鐘收盤 → 寫 D:\\stock_data\\home_intraday\\otc_YYYYMMDD.json
（跟盤中排程同格式 [[epoch, price], ...]）→ 沿用 home_intraday 的 5 分鐘取樣與 push 寫 page_cache mini_OTC。
注意：mini_OTC 只存一天，補舊日期會蓋掉較新的資料，所以只在「要補的那天就是最新交易日」時才寫網站（--force 例外）。

用法：python scripts/backfill_otc_mini.py --date 2026-11-13 [--force]
"""
import argparse
import datetime as dt
import json
import sys

import broker_signals as bs
import home_intraday as hi
import sj_daily

sys.stdout.reconfigure(encoding="utf-8")
TZ = dt.timezone(dt.timedelta(hours=8))


def otc_contract(api):
    """永豐的櫃買指數代號是 IX0043（2026-11-14 查）；名稱要完全等於「櫃買指數」，
    不可用「含櫃買」——OTC 底下有 45 檔（勞工就業88、富櫃50…），第一檔是 EMP88。"""
    for c in api.Contracts.Indexs.OTC:
        if getattr(c, "code", "") == "IX0043" or (getattr(c, "name", "") or "").strip() == "櫃買指數":
            return c
    raise SystemExit("找不到永豐櫃買指數合約（IX0043）")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    d = dt.date.fromisoformat(a.date)

    api = sj_daily.login()
    try:
        c = otc_contract(api)
        kb = dict(api.kbars(c, start=d.isoformat(), end=d.isoformat()))
    finally:
        api.logout()
    pts = []
    for j, ts in enumerate(kb.get("ts") or []):
        t = dt.datetime.fromtimestamp(ts / 1e9, dt.timezone.utc)      # 永豐 ts 是台灣時間標成 UTC
        if t.date() != d or not (900 <= t.hour * 100 + t.minute <= 1330):
            continue
        epoch = int(dt.datetime(t.year, t.month, t.day, t.hour, t.minute, tzinfo=TZ).timestamp())
        pts.append([epoch, float(kb["Close"][j])])
    print(f"永豐櫃買指數 {getattr(c, 'code', '?')} {d}：{len(pts)} 根 1 分 K"
          + (f"，{pts[0][1]}→{pts[-1][1]}" if pts else ""))
    if len(pts) < 10:
        raise SystemExit("資料太少，不寫入")

    f = hi.OTC_LOG_DIR / f"otc_{d:%Y%m%d}.json"
    if f.exists() and not a.force:
        print(f"{f} 已存在（盤中排程有記錄），不覆蓋；要覆蓋加 --force")
    else:
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(pts), encoding="utf-8")
        print(f"寫入 {f}")

    latest = hi.latest_trade_date()
    if d != latest and not a.force:
        print(f"{d} 不是最新交易日（{latest}），不寫網站 mini_OTC（避免蓋掉較新的）")
        return
    data = hi.otc_series(d)
    st = hi.push(bs._load_env(), "mini_OTC", d, data, "永豐櫃買指數 1 分 K（盤中排程未執行，事後補）")
    print(f"mini_OTC {d} {len(data)} 點 {data[0]['close']}→{data[-1]['close']} 寫入 status={st}")


if __name__ == "__main__":
    main()
