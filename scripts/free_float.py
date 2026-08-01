"""
free_float.py — 計算臺灣「上市普通股」兩個籌碼指標，寫入本機 SQLite（stock_free_float 表），
供 broker_highwin 計算「占自由流通比」用。排除上櫃／興櫃／TDR。找不到→NULL（不當 0）。

兩指標：
  outstanding_common  = 已發行普通股數 − 母公司暨子公司庫藏股數
  free_float          = outstanding − 可確認的策略/受限股（董監內部人[去重] + 受限私募）

資料來源（皆 TWSE/TDCC openapi，公開）：
  已發行普通股  t187ap03_L                （欄：已發行普通股數或TDR原股發行股數；本身已排除特別股）
  母子庫藏股數  t187ap07_L_{ci,fh,basi,bd,ins,mim}（六產業別互斥；欄：母公司暨子公司所持有之母公司庫藏股股數）
  董監內部人    t187ap11_L                （欄：姓名/職稱/目前持股）→ 依姓名去重，同一人多職稱只計一次
  受限私募      TDCC 1-9                  （欄：證券代號/登錄數額）→ 私募普通股受限，free float 扣除
  逾10%大股東   t187ap02_L                （只有名字無股數）→ 僅供信心判斷：若逾10%大股東不在內部人名單，
                                            代表有未解析策略股 → confidence 降級、列 unresolved（不擅自扣除）

用法：python scripts/free_float.py
"""
import html as _html
import json
import re
import sqlite3
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_analysis as ba

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
_HDR = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}

AP03 = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L"
AP11 = "https://openapi.twse.com.tw/v1/opendata/t187ap11_L"
AP02 = "https://openapi.twse.com.tw/v1/opendata/t187ap02_L"
TDCC_PP = "https://openapi.tdcc.com.tw/v1/opendata/1-9"
# 庫藏股改用 MOPS 季報彙總資產負債表（可指定季別、單次回全部上市公司，換季期間仍取得完整上一季）
MOPS_BS = "https://mopsov.twse.com.tw/mops/web/ajax_t163sb05"
TREASURY_KEY = "母公司暨子公司所持有之母公司庫藏股股數"  # openapi 欄名（保留備參）


def _recent_quarters():
    """回傳最近兩個『已結束』的季 (民國年, 季別)，新→舊。"""
    today = date.today()
    y, q = today.year, (today.month - 1) // 3 + 1
    q -= 1                                   # 退到最近已結束季
    if q == 0:
        q, y = 4, y - 1
    res = []
    for _ in range(2):
        res.append((y - 1911, q))
        q -= 1
        if q == 0:
            q, y = 4, y - 1
    return res


def _mops_treasury(year_roc, season):
    """MOPS 季報彙總資產負債表 → {code: 母子庫藏股股數(股)}（該季全部上市普通股）。"""
    body = urllib.parse.urlencode({
        "encodeURIComponent": "1", "step": "1", "firstin": "1", "off": "1",
        "TYPEK": "sii", "year": str(year_roc), "season": str(season).zfill(2)}).encode()
    req = urllib.request.Request(MOPS_BS, data=body, headers={
        "User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded"})
    page = urllib.request.urlopen(req, timeout=90, context=_CTX).read().decode("utf-8", "replace")

    def cells(tr):
        return [_html.unescape(re.sub(r"<[^>]+>", "", c)).strip()
                for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", tr, re.S)]

    out = {}
    for tbl in re.findall(r"<table.*?</table>", page, re.S):
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tbl, re.S)
        hdr = hi = None
        for idx, r in enumerate(rows):
            cs = cells(r)
            if "公司代號" in cs:
                hdr, hi = cs, idx
                break
        if not hdr:
            continue
        i_code = hdr.index("公司代號")
        i_t = next((k for k, h in enumerate(hdr) if "庫藏股股數" in h and "母公司" in h), None)
        if i_t is None:
            continue
        for r in rows[hi + 1:]:
            td = cells(r)
            if len(td) <= i_t:
                continue
            code = td[i_code].strip()
            if re.match(r"^\d{4}$", code):
                out[code] = _num(td[i_t]) or 0
    return out


def _get(url):
    req = urllib.request.Request(url, headers=_HDR)
    return json.loads(urllib.request.urlopen(req, timeout=60, context=_CTX).read())


def _num(x):
    try:
        return float(str(x).replace(",", "").strip() or 0)
    except (ValueError, TypeError):
        return None


def _roc(s):
    """民國 '1150730' → '2026-07-30'。"""
    s = str(s).strip()
    if len(s) == 7 and s.isdigit():
        return f"{int(s[:3]) + 1911}-{s[3:5]}-{s[5:7]}"
    return None


def _quarter_end(year_roc, q):
    """民國年+季別 → 該季底 ISO。"""
    try:
        y = int(year_roc) + 1911
        return {"1": f"{y}-03-31", "2": f"{y}-06-30", "3": f"{y}-09-30", "4": f"{y}-12-31"}.get(str(q).strip())
    except (ValueError, TypeError):
        return None


def _norm(name):
    return "".join(str(name).split()).replace("股份有限公司", "").replace("(", "（").replace(")", "）")


def main():
    print("抓 已發行普通股（t187ap03_L）...")
    ap03 = _get(AP03)
    issued, issued_as_of, names = {}, {}, {}
    for r in ap03:
        c = str(r.get("公司代號", "")).strip()
        if not c:
            continue
        issued[c] = _num(r.get("已發行普通股數或TDR原股發行股數"))
        issued_as_of[c] = _roc(r.get("出表日期"))
        names[c] = str(r.get("公司簡稱") or r.get("公司名稱") or "").strip()

    print("抓 母子庫藏股（MOPS 季報彙總資產負債表）...")
    # 跨季持久化：先讀既有值當底，再用 MOPS 由舊季→新季覆蓋（新季只含早鳥、覆蓋其上；
    # 完整上一季當底），未申報者沿用上一季庫藏。絕不把已知值洗成 null。
    conn0 = sqlite3.connect(str(ba.DB_PATH)); conn0.execute("pragma busy_timeout=60000")
    treasury, tre_as_of = {}, {}
    try:
        for c, t, ta in conn0.execute(
                "select code, treasury, treasury_as_of from stock_free_float where treasury is not null"):
            treasury[c] = t; tre_as_of[c] = ta
    except sqlite3.OperationalError:
        pass  # 表尚未建立（首次執行）
    conn0.close()
    for yr, q in reversed(_recent_quarters()):        # 舊季先、新季後覆蓋
        try:
            m = _mops_treasury(yr, q)
        except Exception as e:
            print(f"  MOPS {yr}Q{q} 抓取失敗：{e}"); continue
        if not m:
            print(f"  MOPS {yr}Q{q}：無資料，略過"); continue
        qe = _quarter_end(yr, q)
        for c, v in m.items():
            treasury[c] = v; tre_as_of[c] = qe
        print(f"  MOPS {yr}Q{q}：套用 {len(m)} 檔")
    print(f"  庫藏股合計 {len(treasury)} 檔有值")

    print("抓 董監內部人（t187ap11_L）...")
    # 只把「董監事／經理人／法人代表人／內部人」當可排除策略股；
    # 純「大股東」列(持股逾10%但未進董事會)依規則不自動排除 → 併入 unresolved。
    ap11 = _get(AP11)
    board_shares, board_names, big_only, ins_as_of = {}, {}, {}, {}
    for r in ap11:
        c = str(r.get("公司代號", "")).strip()
        if not c:
            continue
        nm = _norm(r.get("姓名"))
        sh = _num(r.get("目前持股")) or 0
        title = str(r.get("職稱", ""))
        if "大股東" in title:                     # 純大股東列：不扣，先記著
            big_only.setdefault(c, {})[nm] = max(big_only.get(c, {}).get(nm, 0), sh)
        else:                                     # 董監/經理/法代/內部人：可排除
            board_shares.setdefault(c, {})[nm] = max(board_shares.get(c, {}).get(nm, 0), sh)
            board_names.setdefault(c, set()).add(nm)
        ym = str(r.get("資料年月", "")).strip()    # 11506 → 2026-06
        if len(ym) == 5 and ym.isdigit():
            ins_as_of[c] = f"{int(ym[:3]) + 1911}-{ym[3:5]}"

    print("抓 受限私募（TDCC 1-9）...")
    private_pp = {}
    for r in _get(TDCC_PP):
        c = str(r.get("證券代號", "")).strip()
        if c:
            private_pp[c] = _num(r.get("登錄數額")) or 0

    print("抓 逾10%大股東（t187ap02_L，判信心用）...")
    big10 = {}
    for r in _get(AP02):
        c = str(r.get("公司代號", "")).strip()
        if c:
            big10.setdefault(c, []).append(_norm(r.get("大股東名稱")))

    # ── 計算並寫入本機 ──
    conn = sqlite3.connect(str(ba.DB_PATH))
    conn.execute("pragma busy_timeout = 60000")
    conn.execute("""
        create table if not exists stock_free_float (
            code text primary key, name text,
            issued_common integer, treasury integer, outstanding_common integer,
            insider_shares integer, restricted_pp integer,
            free_float integer, free_float_pct real,
            confidence text, unresolved text,
            issued_as_of text, treasury_as_of text, insider_as_of text, updated_at text
        )""")

    now = datetime.now().isoformat(timespec="seconds")
    rows, n_ff, n_unknown = [], 0, 0
    for c, iss in issued.items():
        if c.startswith("91") or len(c) > 4:      # 排除 TDR/DR（91xxxx、六碼）
            continue
        tre = treasury.get(c)                      # 不在 MOPS→None（未知，不當0）
        out = (iss - tre) if (iss is not None and tre is not None) else None
        ins = sum(board_shares.get(c, {}).values())   # 只扣董監/經理/法代
        pp = private_pp.get(c, 0)
        ff = (out - ins - pp) if out is not None else None
        # 未解析策略股：純大股東列 + t187ap02 逾10%大股東，凡「不在董監名單」者（不扣、標記）
        bn = board_names.get(c, set())
        unresolved = sorted({b for b in list(big_only.get(c, {})) + big10.get(c, [])
                             if b and b not in bn})
        if out is None:
            conf = "unknown"; n_unknown += 1
        elif ff is not None and ff < 0:
            # 交叉持股/重疊致負值 → 無法可靠估計，標低信心、free_float 設未知（不輸出負值）
            ff = None; conf = "low"
        elif unresolved:
            conf = "medium"
        else:
            conf = "high"
        if ff is not None:
            n_ff += 1
        rows.append((c, names.get(c, ""),
                     int(iss) if iss is not None else None,
                     int(tre) if tre is not None else None,
                     int(out) if out is not None else None,
                     int(ins), int(pp),
                     int(ff) if ff is not None else None,
                     round(ff / out * 100, 2) if (ff is not None and out) else None,
                     conf, "、".join(unresolved) or None,
                     issued_as_of.get(c), tre_as_of.get(c), ins_as_of.get(c), now))

    conn.executemany("""insert or replace into stock_free_float
        (code,name,issued_common,treasury,outstanding_common,insider_shares,restricted_pp,
         free_float,free_float_pct,confidence,unresolved,issued_as_of,treasury_as_of,insider_as_of,updated_at)
        values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", rows)
    conn.commit()
    print(f"完成：寫入 {len(rows)} 檔上市普通股；free_float 可算 {n_ff}、outstanding 未知 {n_unknown}")


if __name__ == "__main__":
    main()
