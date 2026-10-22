"""Daily focus snapshot, run after price uploads by page_cache_push.py."""
import datetime
import importlib.util
from pathlib import Path
from groupbook_precompute import publish
ROOT = Path(__file__).resolve().parent.parent

def run(env, env_name="prod"):
    """env_name：prod＝用 origin/prod 的程式寫 kind=focus；uat＝用 origin/uat 的程式寫 focus@uat（2026-10-21 依環境分開）。"""
    if not env.get("SUPABASE_SERVICE_KEY"):
        raise ValueError("SUPABASE_SERVICE_KEY required")
    import env_screen as es
    screen = es.load_screen(env_name, env)
    original = getattr(screen, "_orig_cache_sb", None) or screen._cache_sb
    screen._orig_cache_sb = original
    def strict_read(*args, **kwargs):
        status, rows = original(*args, **kwargs)
        if status != 200 or not isinstance(rows, list):
            raise RuntimeError("Incomplete price read; previous snapshot retained")
        return status, rows
    screen._cache_sb = strict_read
    data = screen._fetch_focus(50)
    if data.get("error") or not data.get("date") or not data.get("gainers") or not data.get("losers") or not isinstance(data.get("volume_surge"), list):
        raise ValueError("Invalid focus snapshot; previous snapshot retained")
    row = dict(kind=es.kind_for("focus", env_name), trade_date=data["date"], payload=data,
               updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
    publish(env, [row])
    print(f"[focus:{env_name}] saved date={data['date']} gainers={len(data['gainers'])} losers={len(data['losers'])} surge={len(data['volume_surge'])}")
    return data
