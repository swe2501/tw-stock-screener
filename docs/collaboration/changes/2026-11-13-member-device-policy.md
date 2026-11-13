# 會員同時使用裝置

**最新狀態（2026-11-13）：使用者明確核准後，已在 Taiwan stock2 部署資料表、RPC、Data API 閘道及 Storage restrictive 政策；真實資料庫驗證通過，enabled=false。網站/API 本批尚未發布，故未啟用。**

使用者明確同意：見習／市場 1 台、趨勢 2 台、領航 3 台；要求完整可啟用。

## 實作

- 商品 `device_limit` 可設 1–10 台；公開卡片和詳細說明讀取同一設定。尚未啟用時如實顯示狀態，和其他規劃額度分開。
- 以 Supabase JWT 的 `session_id` 和仍存在的 `auth.sessions` 為身分。一個瀏覽器登入工作階段算一台，多分頁共用；不同瀏覽器／無痕視窗分別計算。不使用 IP 或侵入式指紋。
- 前景頁面每 60 秒續租，5 分鐘未續租釋放名額。電腦休眠或背景頁面節流時，可能需重新取得名額；這是「同時使用」而非永久登記裝置。
- 會員「登入與安全」可列出裝置、移除裝置或確認在這台接續使用。移除是立即撤回本站會員資料存取權，不刪研究資料、不宣稱已撤銷所有第三方登入。
- SQL 以每會員交易鎖保護名額，依實際授權／期間查上限；付費方案保存裝置數快照，商品下架不取消既有付費期間。使用券不增加裝置數。授權過期或降額時依入場順序限制多出裝置。
- Data API 透過唯讀 pre-request gate 拒絕沒有有效名額的 authenticated 請求，GET 不寫資料；裝置管理本身可在超限時使用，且只准操作本人工作階段。
- 網站 API 以呼叫者 JWT 驗證裝置，涵蓋 auth 會員服務、watchlist／broker watch、通知、alert、AI buy。仍使用原 `/api/auth`，API 入口維持 12/12。
- 部署環境開關 `MEMBER_DEVICE_POLICY_ENABLED` 和資料庫開關雙重控管；後台必須確認兩邊與閘道均已就緒才可開啟。

## 部署與啟用（尚未執行）

目前沒有 Supabase 管理連線；沒有在雲端執行 SQL、改 Auth、開啟限制或推送 UAT。

1. 連接對應 Supabase，先盤點既有函式、資料表、Auth hook、Data API pre-request 與會員資料使用途徑。舊 `member_device_limit_hook` 是固定兩台的歷史方案，不可和本方案同時啟用；若仍掛載必須先確認恢復正常登入再切換。
2. 確認 `member-commerce-settings.sql` 所需依賴已存在。既有資料庫的升級執行 `member-device-policy.sql`；它會一併更新商品儲存函式以保留裝置數快照，預設限制關閉。不修改既有 Auth session 或研究資料。
3. 執行 `member-device-gateway.sql`。若已有 pre-request，它會停止而不覆蓋。須人工合成既有閘道並補相容測試；後台 readiness 邏輯也須對應合成函式更新。
4. 部署本次網站/API，設定 `MEMBER_DEVICE_POLICY_ENABLED=true`，資料庫限制仍關閉。比較卡片不能宣稱已啟用。
5. 實際確認 Data API 已載入 pre-request、舊 Auth hook 不擋登入，並確認現行其他客戶端能呼叫裝置 claim。此閘道涵蓋共用 Data API，舊 App 必須先由其負責人完成相容接入；本次未修改 App。
6. 後台先儲存商品 1／1／2／3，核對公開設定，再開裝置限制。用隔離測試帳號／多瀏覽器測試各級、同分頁、超限、移除、接續、過期、API直接呼叫及帶舊 JWT 的拒絕。驗證成功才能回報正式啟用。
7. 回復：後台關閉或以管理 SQL `update public.member_device_policy_control set enabled=false where singleton;`；資料保留。停用伺服器環境旗標前先停資料庫政策，避免前端不續租而 Data API 仍擋存取。

Storage／Realtime 不會執行 Data API pre-request；目前這個閘道不能被宣稱涵蓋它們。啟用前若盤點到私人研究內容透過這些管道提供，須在其 RLS 加入相同 session 驗證並測試，不能只靠前端阻擋。公開行情與訪客可看的內容仍為公開。

## 驗證

隔離 PGlite 測試：1／1／2／3、初次關閉不占名額、同 session 重用、超限、接續、撤回的 JWT、閒置釋放、Auth session 到期、不同帳號與權限隔離、付費快照與到期回復。

瀏覽器模擬：超限請求不送至資料端、接續及移除、裝置名稱跳脫、未部署時相容、桌機／手機無橫向溢出。另跑會員商品與整站回歸及 Python 相關 API 測試。真實雲端多人測試仍待連線。

參考：Supabase [Sessions](https://supabase.com/docs/guides/auth/sessions)、[Securing your API](https://supabase.com/docs/guides/api/securing-your-api)。JWT 登出後未到期仍可能有效，因此不能只靠瀏覽器清除 token。

## 已登入 Dashboard 的唯讀盤點

已透過使用者現有 Chrome SQL Editor，在網站相同 project ref `bruqrbvbjxntgoljxsne`（Taiwan stock2 / stock filter）成功執行唯讀 SELECT；執行角色 postgres。MCP OAuth 仍未接通，但 Dashboard 可查詢，不再以「完全沒有資料庫入口」描述。

確認新 device policy/control 尚未存在、舊 recovery control 也不存在；舊固定兩台 `member_device_limit_hook` 函式存在（尚未確認是否實際掛載）。商品儲存 RPC 與訂閱期間表存在，但 `member_commerce_v1` 尚未設定。未設定 Data API pre-request。私人 bucket 為 member-trade-images，使用本人路徑政策；沒有 public schema 表加入 supabase_realtime publication。

本機已補 `member-device-storage.sql`：對研究圖片與頭像的 authenticated 存取新增 restrictive 裝置政策，保留原本人 ownership 政策；私人研究圖片現行程式用 authenticated object request，沒有改成永久公開 URL。隔離資料庫已驗證允許／移除立即拒絕、關閉限制維持原 ownership 邊界。未在雲端執行此 SQL。

任何雲端寫入尚未執行。透過 Windows UI 執行含新函式 GRANT 的 migration 前，須完成 Computer Use 規範要求的執行當下確認；先維持開關關閉。不要跳過資料庫實際盤點結果，把本機測試當成雲端已啟用。

## 2026-11-13 已授權部署與真實驗證

使用者明確要求「直接在 Taiwan stock2 執行…先保持開關關閉，確認沒問題再啟用」。已透過既有 Chrome SQL Editor，在同一 transaction 部署 policy/gateway/storage；回傳 `ready=true, gate_ready=true, enabled=false`。未修改舊 Auth hook，未啟用付款，未修改會員授權或研究資料。

部署前另修正並驗證：pre-request 必須允許 anon/service_role 執行（內部仍只檢查 authenticated），避免閘道安裝後誤擋公開訪客或伺服器；商品 saver 對舊 API 沒有 device_limit 的請求保留現有名額／依原等級預設，不因新欄位讓舊管理端無法儲存。

真實 Dashboard 驗證（全部測試 DML 以 ROLLBACK 回復）：RLS、表權限、內部／管理 RPC EXECUTE 隔離、anon/service callback 權限、Storage restrictive policy、1/1/2/3 付費快照、舊 API 儲存保留名額、拒絕不存在的 Auth session。結果 PASS；結束後實際開關仍 false。未建立真正 Auth 測試帳號、未留下測試方案或改動會員資料。

以網站既有公開 anon key 實際 HTTP 驗證：`/rpc/member_device_policy` 200 且 ready=true/enabled=false；匿名讀取 member_device_leases 為 401（拒絕）。沒有記錄金鑰或會員識別資料。

**啟用剩餘條件**：網站/API 仍是尚未發布的本機變更；需要依專案發布指令整合並部署，設定網站端 MEMBER_DEVICE_POLICY_ENABLED，並確保所有使用共用資料庫的正式站／既有客戶端能取得 lease。只有 UAT 更新而正式站仍舊版時不能開共用 DB 全域開關。仍須確認舊 Auth hook 的掛載狀態、在正確切換時處理固定兩台規則，並完成真正多瀏覽器工作階段的端到端驗證。資料庫權限／快照測試通過不等於這些條件已完成。
