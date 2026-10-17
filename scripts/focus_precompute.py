"""Daily focus snapshot, run after price uploads by page_cache_push.py."""
import datetime
import importlib.util
from pathlib import Path
from groupbook_precompute import publish
ROOT = Path(__file__).resolve().parent.parent

def run(env):
    if not env.get("SUPABASE_SERVICE_KEY"):
        raise ValueError("SUPABASE_SERVICE_KEY required")
    spec = importlib.util.spec_from_file_location("focus_screen", ROOT / "api/screen.py")
    screen = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(screen)
    screen.SUPABASE_URL = env["SUPABASE_URL"]
    screen.SUPABASE_KEY = env.get("SUPABASE_ANON_KEY") or env["SUPABASE_SERVICE_KEY"]
    original = screen._cache_sb
    def strict_read(*args, **kwargs):
        status, rows = original(*args, **kwargs)
        if status != 200 or not isinstance(rows, list):
            raise RuntimeError("Incomplete price read; previous snapshot retained")
        return status, rows
    screen._cache_sb = strict_read
    data = screen._fetch_focus(50)
    if data.get("error") or not data.get("date") or not data.get("gainers") or not data.get("losers") or not isinstance(data.get("volume_surge"), list):
        raise ValueError("Invalid focus snapshot; previous snapshot retained")
    row = dict(kind="focus", trade_date=data["date"], payload=data,
               updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
    publish(env, [row])
    print(f"[focus] saved date={data['date']} gainers={len(data['gainers'])} losers={len(data['losers'])} surge={len(data['volume_surge'])}")
    return data
