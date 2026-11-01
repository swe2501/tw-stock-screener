# 通知 JUSTY：App 股名改讀 security_catalog（2026-11-01，Andrew）

## 發生了什麼
資料庫已正規化（見 `2026-11-01-claude-normalization-contract.md`、`docs/database/normalization-contract-2026-11-01.sql`）：

- 股名唯一來源＝`security_master`，公開唯讀 view＝`security_catalog`（code, name, market, instrument_type, industry），目前 2,377 筆：上市股 1087、上櫃股 897、上市 ETF 275、上櫃 ETF 118。
- `otc_names` 原表已刪，改成從 `security_master` 讀的**唯讀 view**（只含上櫃股票）。不能再寫入。
- 網站已不呼叫 `/api/screen?stat=otcetf`；後端 `stat=names` 也改由主檔產生。prod／uat 已上線。

## 對 App 的影響
`apps/mobile/src/hero-api.ts` 的 `stockNames()` 目前併讀 4 個來源：
`/api/screen?stat=names`、`otc_names`、`etf_products`、`/api/screen?stat=otcetf`。

**現在仍可用**（舊路徑全部保留相容），但請改成單一來源，原因：

1. 4 次請求 → 1 次，省 Supabase 傳輸量（本期已逼近方案上限）。
2. `stat=otcetf` 只為 App 保留，App 切換後會移除。
3. 市場別直接由主檔給，不必再靠「哪個來源先加入」判斷。

## 建議改法
二選一（建議 A，走網站共用快取，與網站同一份）：

- A. `GET /api/prices?action=security_catalog` → `{version:1, source:'security_catalog', items:[{code,name,market,instrument_type,...}]}`
- B. PostgREST `security_catalog?select=code,name,market,instrument_type`（注意每次最多 1000 列，需 `Range`／`offset` 分頁）

對照：`market` 為 `tse`／`otc`，`instrument_type` 為 `stock`／`etf`：

| market | instrument_type | App 顯示 |
|---|---|---|
| tse | stock | 上市 |
| otc | stock | 上櫃 |
| tse | etf | 上市 ETF |
| otc | etf | 上櫃 ETF |

```ts
const r=await read('/api/prices?action=security_catalog',signal);
const label=(m:string,t:string)=>(m==='otc'?'上櫃':'上市')+(t==='etf'?' ETF':'');
(r?.items||[]).forEach((x:any)=>add(x.code,x.name,label(x.market,x.instrument_type)));
```

## 過渡安排
- `otc_names` view 與 `stat=otcetf` 會保留到 JUSTY 確認 App 已切換後才移除，屆時另附相容性紀錄。
- JUSTY 分支（app/justy/*、shared/justy/app-market-data）裡的 `api/chart.py` 仍讀 `otc_names`；合併最新 uat 時會帶入改讀 `security_catalog` 的版本，衝突請逐段處理。
- 規劃新表請一律正規化：股名只從 `security_master`／`security_catalog` 取，不另存股名、不存 JSON 鏡像。
