"""依環境載入網站後端程式，讓「prod 快照用 prod 的程式、uat 快照用 uat 的程式」各自產生（2026-10-21）。

背景：page_cache 快照存在 uat 與正式站共用的同一個 Supabase。以前不分環境、用同一個 kind，
結果 uat 的新邏輯要等推 prod 才看得到，或反過來 uat 的實驗結果被正式站讀到。
現在：
  - prod 快照 → kind 原名（例 overview），由 git 的 origin/prod 版 api/screen.py 計算
  - uat  快照 → kind + "@uat"（例 overview@uat），由 origin/uat 版 api/screen.py 計算
前端／後端讀取時依自己所在環境挑 kind；uat 版不存在時退回讀 prod 版。

用法：
    import env_screen as es
    screen = es.load_screen("uat", env)     # 回傳一個已設定 Supabase 的 screen 模組
    kind = es.kind_for("overview", "uat")   # overview@uat
"""
import importlib.util
import ssl
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENVS = {"prod": ("origin/prod", ""), "uat": ("origin/uat", "@uat")}
_fetched = False
_cache = {}


def kind_for(base, env_name):
    return base + ENVS[env_name][1]


def relax_local_ssl():
    """本機 Python 3.14 預設啟用 VERIFY_X509_STRICT，證交所／櫃買中心憑證缺 Subject Key Identifier 會被拒，
    導致行情退回 price_window（沒有成交值與股名）。只清掉這個嚴格旗標，憑證鏈與主機名稱照常驗證。"""
    ctx = ssl.create_default_context()
    if hasattr(ssl, "VERIFY_X509_STRICT"):
        ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
    ssl._create_default_https_context = lambda: ctx
    # 2026-10-24 同一支程式若之前已用 urllib 連過網（例：page_cache_push 先呼叫正式站 API），
    # urllib 會沿用當時建好的全域 opener，上面的設定不生效 → uat 版抓證交所失敗、默默退回 price_window（成交值全 0）。
    # 一併換掉全域 opener，確保之後所有 urlopen 都用放寬後的設定。
    import urllib.request
    urllib.request.install_opener(urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx)))


def _fetch_refs():
    global _fetched
    if _fetched:
        return
    _fetched = True
    try:
        subprocess.run(["git", "-C", str(ROOT), "fetch", "-q", "origin", "prod", "uat"],
                       timeout=120, check=False, capture_output=True)
    except Exception:
        pass


def load_screen(env_name, sb_env):
    """回傳指定環境版本的 api/screen.py 模組（同一次執行內快取）。取不到該分支時退回本機檔並印出警告。"""
    if env_name in _cache:
        return _cache[env_name]
    relax_local_ssl()
    _fetch_refs()
    ref = ENVS[env_name][0]
    path = ROOT / "api" / "screen.py"
    try:
        src = subprocess.run(["git", "-C", str(ROOT), "show", f"{ref}:api/screen.py"],
                             capture_output=True, timeout=60, check=True).stdout
        tmp = Path(tempfile.gettempdir()) / f"aistock_screen_{env_name}.py"
        tmp.write_bytes(src)
        path = tmp
    except Exception as e:
        print(f"[env_screen] 取不到 {ref}:api/screen.py（{type(e).__name__}），改用本機檔")
    spec = importlib.util.spec_from_file_location(f"aistock_screen_{env_name}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.SUPABASE_URL = sb_env.get("SUPABASE_URL", "")
    mod.SUPABASE_KEY = sb_env.get("SUPABASE_ANON_KEY") or sb_env.get("SUPABASE_SERVICE_KEY", "")
    _cache[env_name] = mod
    return mod
