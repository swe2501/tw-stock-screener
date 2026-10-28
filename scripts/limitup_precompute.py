"""上漲下跌亮燈區快照（2026-10-28）：由 page_cache_push.py 在每晚股價上傳後呼叫。

原本網頁每次打開都即時呼叫 /api/screen?stat=limitup，後端要翻 14 天 price_window 全市場，正式站約 28 秒。
改為每晚先算好存 page_cache（kind=limitup／limitup@uat，跟 focus 一樣依環境用各自分支的程式算），
後端 stat=limitup 先讀快照；快照不存在或格式不對才退回即時計算。算法完全沿用 _fetch_limitup。

用法：python scripts/limitup_precompute.py [prod|uat]   （不給＝兩個都算）
"""
import datetime
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from groupbook_precompute import publish  # noqa: E402


def run(env, env_name="prod"):
    if not env.get("SUPABASE_SERVICE_KEY"):
        raise ValueError("SUPABASE_SERVICE_KEY required")
    import env_screen as es
    screen = es.load_screen(env_name, env)
    original = getattr(screen, "_orig_cache_sb", None) or screen._cache_sb
    screen._orig_cache_sb = original

    def strict_read(*args, **kwargs):            # 讀股價中途失敗就整個放棄，不寫半套快照
        status, rows = original(*args, **kwargs)
        if status != 200 or not isinstance(rows, list):
            raise RuntimeError("Incomplete price read; previous snapshot retained")
        return status, rows
    screen._cache_sb = strict_read
    try:
        data = screen._fetch_limitup()
    finally:
        screen._cache_sb = original
    if (not isinstance(data, dict) or data.get("error") or not data.get("date")
            or not isinstance(data.get("up"), list) or not isinstance(data.get("down"), list)):
        raise ValueError("Invalid limitup snapshot; previous snapshot retained")
    row = dict(kind=es.kind_for("limitup", env_name), trade_date=data["date"], payload=data,
               updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
    publish(env, [row])
    print(f"[limitup:{env_name}] saved date={data['date']} up={data['up_count']} down={data['down_count']}")
    return data


if __name__ == "__main__":
    import broker_signals as bs
    e = bs._load_env()
    for name in (sys.argv[1:] or ["prod", "uat"]):
        run(e, name)
