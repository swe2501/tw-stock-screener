"""Attach group-specific research hypotheses; a catalog relationship is not ownership proof."""
import copy
import datetime as dt
import re
from urllib.parse import urlparse


def valid_review(review, code, quarter):
    if not isinstance(review,dict) or review.get("schema_version")!=1 or review.get("code")!=code or review.get("quarter")!=quarter:
        return False
    if review.get("status") not in ("operating_evidence_available","historical_operating_context","commercial_catalyst_unconfirmed"):
        return False
    if not review.get("observations") or not review.get("counter_evidence"):return False
    try:
        year,q=int(quarter[:4]),int(quarter[-1])
        start=dt.date(year,(q-1)*3+1,1)
        end=dt.date(year+1,1,1) if q==4 else dt.date(year,q*3+1,1)
        reviewed=dt.date.fromisoformat(review["reviewed_on"])
        cutoff=min(end-dt.timedelta(days=1),reviewed)
        def url(value):return urlparse(value).scheme in ("https","http") and bool(urlparse(value).netloc)
        def digest(value):return bool(re.fullmatch(r"[0-9a-f]{64}",value or ""))
        financial=review.get("financial")
        if financial:
            fy,fq=int(financial["period"][:4]),int(financial["period"][-1])
            fend=dt.date(fy+1,1,1) if fq==4 else dt.date(fy,fq*3+1,1)
            published=dt.date.fromisoformat(financial["published_on"])
            if not fend<=published<=cutoff or financial.get("basis")!="year_to_date" or not financial.get("version_note"):return False
            if not financial.get("sources") or not all(url(s["url"]) for s in financial["sources"]):return False
            if not digest(financial["sources"][0].get("sha256")):return False
        operating=review.get("operating_disclosure")
        if operating:
            if not start<=dt.date.fromisoformat(operating["published_on"])<=cutoff:return False
            if not url(operating["source_url"]) or not digest(operating.get("sha256")) or not operating.get("text"):return False
        for month in review.get("monthly",[]):
            if month.get("publication_date_verified") is not False or not month.get("version_note"):return False
            # Only fully elapsed calendar months may be used as retrospective context.
            if month["period"]>=cutoff.strftime("%Y-%m") or not url(month["source_url"]) or not digest(month.get("sha256")):return False
        return True
    except (KeyError,ValueError,TypeError):return False


def group_context(group, member):
    focus = group.get("focus", "")
    name = member["name"].rstrip("＊*")
    selected = member["code"] in focus or bool(re.search(
        r"(?<![\u4e00-\u9fff])" + re.escape(name) + r"(?=[、，：:（(。；\s]|$)", focus))
    relation = member.get("relation", "集團核心成員")
    if "聯盟" in relation or "化學材料" in relation:
        link = f"{group['name']}的文件分類為「{relation}」。研究傳導路徑是客戶投資／建廠需求到供應商出貨與驗收；客戶資本支出增加，仍不等於這家公司已取得訂單。"
    elif "轉投資" in relation:
        link = f"{group['name']}的文件分類為「{relation}」。應核對持股比例、認列方式及交易生效日期，再判斷營運成果如何傳導；不能用子公司市價漲幅直接推算母公司獲利。"
    else:
        link = f"{group['name']}將{member['name']}列為「{relation}」。這是文件名錄關係，尚不能單憑分類判斷共同控制、訂單互通或損益認列比例。"
    if selected:
        hypothesis = "Word原列核心觀察標的；本季是否仍值得追蹤，需以下列公司營運與事件證據重新檢驗，不能沿用文件結論。"
    elif focus:
        hypothesis = "Word收錄為集團成員，但未明列於核心挑選理由；本季不因同屬集團就自動升為核心標的。"
    else:
        hypothesis = "Word未提供這檔的獨立核心挑選理由；以下先檢驗個股營運與事件，不把集團的一般描述當成已證實的個股受惠。"
    paragraphs=[p.strip() for p in re.split(r"\n|(?<=[。；])",focus) if p.strip()]
    rationale=next((p for p in paragraphs if member["code"] in p), "")
    if not rationale and selected:
        rationale=next((p for p in paragraphs if name in p and re.search(r"：|:",p)), "")
    if len(rationale)>350:rationale=rationale[:350]+"…（完整文件理由見上方）"
    return dict(document_selected=selected, hypothesis=hypothesis, linkage=link,
                document_rationale=rationale,provenance="user_document_hypothesis", ownership_verified=False)


def attach(group):
    for reasons in group.get("quarterlyReasons", {}).values():
        for member in group["members"]:
            record = reasons.get(member["code"])
            if not record or record.get("status") == "not_applicable":
                continue
            record["group_selection_context"] = copy.deepcopy(group_context(group, member))
