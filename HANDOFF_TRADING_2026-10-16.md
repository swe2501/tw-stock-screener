> **最新欄位順序**：依使用者最後調整，費稅列後先放「市場分析面向」，再放下排「交易策略／本筆交易理由／補充」三欄；仍在同一個選填區。取代下方較早位置描述。

> **商品乘數更新（優先於下方較早的手填描述）**：九個指數期貨及 TXO 已核對期交所當前規格並自動帶入乘數，股票期貨維持既有標準股數帶入。僅自動帶乘數，成交價格維持手填；年月不猜測。乘數可修改且草稿重開保留；未知商品不填假預設值，歷史成交不改。規格來源、核對日與維護限制見 `docs/derivatives-catalog.md`。商品切換、十個指數商品乘數、手填成交價保留、自訂乘數持久化及既有流程已通過瀏覽器測試。API 仍 12/12。

> **選擇權介面更新**：先選紅色「買方 Buyer」／綠色「賣方 Seller」按鈕，再選 Call／Put，另有開倉／平倉動作。選擇權隱藏原本多空動作選單，內部仍映射既有 `side=long/short` 和 `action=open/close`；買方／賣方是持倉身分，平倉成交方向會反轉，例如賣方平倉 Buy Put。不把 Put 買方稱為看多；列表、詳情與時間軸也使用相應文字。草稿沿用 operation，無新增 API 或 DB 欄位。四種組合和平倉、Call/Put/買賣方部位隔離與損益已驗證。

> **本次最新 UX／期貨更新**：市場分析面向是獨立選填欄（八個固定面向），依使用者最後要求放在下方「費稅、理由與策略」同區，沒有替換或混入交易策略。逐筆保存 `marketAspect`，編輯／平倉／詳情／Excel 匯入匯出／草稿／既有 journal 雲端文件皆支援，舊紀錄不推測面向。理由、策略與市場面向可調順序，重用收藏分類的拖曳／鍵盤排序，保存後立即更新選單；關閉視窗清理監聽，保存失敗還原排序。小型新增／管理按鈕不再繼承全站 CTA 光暈，只保留個別 hover 與鍵盤焦點提示。
>
> 期貨與選擇權只顯示可用的「口」單位，現股只列整張／零股。商品改用期交所本地目錄（320 股票／ETF 標準期貨、九個指數期貨、TXO）；2330／台積電列 CDF、QFF，不再把現股代碼假裝期貨。切換不相容交易方式清空舊標的與價量；標準股票期貨帶入可修改的參考股數乘數，年月須另填，指數乘數仍手填核對。完整來源、更新方式與調整型限制見 `docs/derivatives-catalog.md`。未新增 SQL 或 API，部署入口仍 12/12。瀏覽器測試包含商品篩選、單位、乘數、草稿、排序、獨立面向、樣式及既有記帳流程。

> **最新狀態，取代下文舊阻礙**：使用者已確認允許在共用 PRODUCTION 專案套用四份會員 SQL；四份已成功執行。線上驗證 13 RLS 表、9 函式、7 圖片 policy；CAS／跨會員隔離／直接刪除拒絕通過且測試寫入已回滾。詳細端到端驗收界限與尚缺寄信 worker 見 `docs/member-db-status.md`。九角色初始裁切已改精確取圖；小韭菜新增可選真 3D 造型試作（原創程式幾何），三種節奏、連續待機／成長／拖曳運鏡，未取代原插畫，其他角色仍為插畫互動。不得宣稱九角色高品質 3D 素材已完成。

> **後續權限核對更新**：已可用 Chrome 的 GitHub 登入會話操作 `Taiwan stock2 / bruqrbvbjxntgoljxsne` SQL Editor，只讀 catalog 成功。新會員物件／圖片 bucket／storage policy 皆無。Run 遷移被自動核准審查拒絕，原因是共用專案標示 PRODUCTION、包含 Auth trigger 與權限，尚缺對這個具體正式目標的確認；已發出確認待回覆。**不得繞路執行；目前未套用任何 schema。** 待接續頁及詳細證據見 `docs/member-db-status.md`。這取代下段「無可用管理連線」的較早狀態。

> **2026-10-16 追加交接（優先於下文舊狀態）**：先讀 `docs/member-db-status.md` 最新節。使用者已授權今日會員功能與既有未串接功能接資料庫。新增 `member-cloud.js` 已接交易／目標／研究／筆記／草稿／私房偏好與私有圖片，支援離線、CAS 與明確版本選擇；12 項同步測試、隔離 PostgreSQL 四份 SQL 與整合瀏覽器測試通過。線上表本輪只讀仍 404，**尚未啟用跨裝置**。缺的是可管理專案的 Supabase 連線；GitHub 登入不等於這個對話已取得該連線。已建議 Supabase 外掛，尚未確認連線。不得再以舊 AGENTS 限制要求重複授權，也不得盲目重跑非冪等 SQL。圖片備份與 3D 素材／寄信 worker 等剩餘內容見最新盤點。

> **成仙試作修正**：`assets/member-leek-3d.js` 不再只增加韭菜配飾；成長後半段連續縮小初始韭菜、浮現人形仙袍角色，滿進度顯示人形，三種外觀有不同配色／髮色。新增真實 3D 山巒、亭子、花樹、雲層與日月，背景隨成長轉色；依然是原創程式幾何造型試作，尚未通過使用者最終美術驗收，也未代表其餘八角色已完成 3D。預覽時間軸不寫會員目標進度。搜尋下拉另縮減列高與總高度，增加一次性 hover／鍵盤選取滑光，遵守 reduced-motion。

> **最新角色品質／互動更新**：使用者明確認為幾何 3D 成仙造型不符合原畫；入口改預設原畫 2.5D，原畫為美術驗收依據，不得聲稱九角色 3D 完成。九角色五階段已加縮圖選擇、逐段停留、各階段五種互動；直接點角色隨機袋輪換，舞蹈／道具／局部變形各有模板。不是 225 段手工骨架動畫。正式 GLB contract 擴充為五 lifecycle 加五 interact_* clips，模型仍 0/135；詳細動作矩陣與缺件見 `docs/companion-interactions.md`。交易理由欄與清單改清楚名稱；未選擇不記理由，預設範例不是成交資料。

> **策略／理由 UX 更新**：已移除工具列的理由管理按鈕，統一由本筆理由旁的新增／管理開啟同一視窗，均列現有理由、選用／改名／移除，再提供新增欄。策略新增預設只有名稱與文字邏輯，可存為記帳用 `journalStrategies`（journal 文件，沿用既有雲端同步及備份）；不把未量化內容送入篩選／回測。選填規則編輯器從空白開始，範例只是帶入工具，標示「進場規則（回測買進）／出場規則（回測賣出）」；目前引擎仍只支援做多，做空文字紀錄不等於可做空回測。補齊規則後沿用相同 ID 移至 research.strategies，原成交快照不改。首頁主連結改用站內切換，不再整頁重新載入，並平滑回頂，其他頁面維持原定位；尊重 reduced-motion，使用者操作或再次導覽會取消舊動畫。未增加 API 或 SQL。

# 交易紀錄與目標交接 — 2026-10-16

> 本文件含時序更新，舊段落中的 SVG／簡易月曆／混合淡入淡出說明已被後續版本取代。最新「已完成／未完成」以 [完成度盤點](docs/member-completion-status-2026-10-16.md) 為準。真正 GLB 播放器已加入，正式角色模型仍缺；個人研究雲端與會員服務資料庫仍未啟用。

## 已實作
- 研究與學習：新增「交易紀錄」「我的目標」。交易工作台包含批次成交、代號／名稱建議、草稿、複製列、快捷鍵、整股／零股、融資／融券、期貨／選擇權、多空開平倉。
- FIFO 分攤開倉費稅、部分出場、完整結束、重新開倉分成不同交易週期。不同帳戶、實際／模擬、合約月、買賣權及履約價分開。
- 成交編號重試防重複；相同內容不同編號提醒；整批驗證後才寫入。修改／刪除重新核對後續部位；跨分頁 revision 衝突及儲存空間錯誤不假報成功。
- 交易計畫、目標價／停損、平倉後覆盤、自評遵守、情緒與錯誤自由標籤。自訂交易理由可改名、歷史快照不變。
- 帳戶資金異動、利息／股息、策略已結束樣本統計、交易日期月檢視、週報實際交易摘要、研究筆記入口。
- 參考價可手動核對；股票可從既有 chart API 帶入帶日期日線。期貨不拿現貨冒充合約報價。持倉缺價則顯示待補，不產假估值。
- PNG/JPEG/WebP 圖片限 2 MB，存 IndexedDB；詳情另存圖片。JSON 明示不含圖片。
- SheetJS 0.20.3 官方本地 vendor + Apache 授權，按需載入；Excel/CSV 工作表／欄位對照、預覽、去重、日期與合約驗證。支援原 Excel 開倉＋平倉列及本站匯出格式。未知合約年月／乘數須補，不執行公式及外部連結。
- JSON 完整備份可合併原會員資料；既有目標與覆盤不覆寫；資料格式與資金／目標驗證。Excel 匯出逐筆成交與分組交易回顧。
- 帳戶獲利、單筆價格、紀律三種目標。獲利扣已填費稅與利息、排除入金，費稅未確認不授予獲利目標。觸價不當作成交；單筆多空以已平倉加權均價核對。里程碑日期保留，現行進度仍重算。
- 九種程式原生 SVG 場景：韭菜成仙、花園、登峰、星際、城堡、小獸、海洋、晶石、列車。韭菜按目標進度縮小、仙人顯現；角色髮型／衣袍／面部／祥雲細節。男女／中性外觀獨立選擇，深淺背景、全／輕／靜態，尊重 reduced motion。
- 個資新增性別（選填）：女性、男性、非二元、不透露、暫不提供。Auth user_metadata 白名單與 enum 驗證；不改角色性別、不公開。

## 檔案
- assets/member-trade-engine.js：純計算、驗證、FIFO、目標；tests/member-trade-engine.test.cjs。
- assets/member-trade-ui.js：工作台／匯入／目標，資料 key academy.journal.v1.<userId>，draft 子 key。圖片 DB academy-journal-images，owner 前綴。
- assets/member-goal-art.js、assets/member-trade.css：場景及介面。
- index.html：樣式／script 註冊；member-center.js：導航、生命週期、個資；member-identity.js：gender；member-features.js：週報／隱私匯出。
- tests/member-trade-ui.browser.cjs：Playwright 虛構站台整合驗證，設 PLAYWRIGHT_MODULE 指向安裝套件，可用 QA_OUTPUT 指定截圖資料夾。

## 實際限制／後續
- **交易、目標、研究資料目前僅此瀏覽器，各會員分 key；尚未雲端同步。** 此變更不建立／修改 Supabase schema、實際會員資料或 .env。依 AGENTS.md 禁令未擅自啟用資料庫。
- 沒有券商委託／成交自動同步、沒有背景到價通知。頁面載入時計算目標；歷史里程碑代表系統觀察到達標之日，不推算未觀察日期。
- 融資維持率、券商保證金追繳與選擇權風險不估算；權益僅依填寫資金、部位、費稅、參考價估算，並非可用購買力。
- 期貨合約清單為通用代號建議＋手填年月／乘數，尚未串完整交易所合約規格。不可靜默猜乘數／稅率。
- 月曆目前是有交易日的卡片清單，可後續擴完整月曆格。交易理由目前每筆一個常用理由＋自由補充；可擴多標籤。
- 動畫為可縮放向量，不是生成式影片或精靈圖；各主題細節仍可按使用者喜好細修。
- 本機 storage 是信任邊界內的個人資料，非不可竄改後台帳本；未提供商業獎勵授權，會員權益不可由目標進度核發。

## 驗證
- Node 純測試：member-trade-engine、member-identity、member-strategy-engine 共 27 項通過。
- 新 UI：批次、搜尋、部分／全平倉、計畫、資金、覆盤、九主題、外觀性別、里程碑、Excel 缺合約阻擋、配對匯入、quota 失敗、深淺／手機通過。
- 截圖在本機聊天 work/journal-qa（虛構測試會員與行情，非真實績效），不納入 repo。
- 原自選／策略整合回歸另執行。

## 2026-10-16 follow-up corrections
- All trading dialogs explicitly restore `inset:0; margin:auto`, correcting host global CSS resets that placed dialogs at top-left.
- Strategy picker has inline add/manage: guided multiple entry/exit rules with independent indicator parameters, all/any and risk. Shares the existing research strategy store; historical snapshots unchanged. Reason add/rename/remove adjacent to its picker; two-click removal, retained historical labels.
- Clear-draft control reduced to secondary text-sized action plus explicit confirm dialog; cancel preserves input.
- Position detail now labels average entry / realized PnL in TWD and pending fee status. Derivatives show month and multiplier. New derivative multiplier starts blank and is required; existing contracts have an explicit confirmed batch multiplier correction that updates all matching fills and revalidates ledger.
- Replaced simple SVG characters with original imagegen illustrated atlases (see assets/goal-art/README.md, full prompts). Direct nine-companion gallery, stage and appearance preview, create-goal from preview. Immortal five-stage blend and female/male/neutral rows. CSS motion is explicitly illustrated breathing/particles/mist, not a fully rigged film clip.
- Extended browser fixture validates centering, inline strategy creation/parameters, reason create/remove, clear cancellation, nine companion previews and blank required futures multiplier.

## 2026-10-16 living evolution scenes
- All nine companions now have five actual illustrated growth stages. A: garden fox, red panda explorer, astronaut, castle dragon. B: magical fox pet, sea turtle/coral, crystal dragon, locomotive. Immortal retains female/male/neutral sequences.
- Nine authored environment backgrounds (celestial courtyard, woodland garden, alpine ridge, cosmic observatory, castle grounds, woodland glade, underwater reef, crystal cavern, railway valley). Background light/saturation, atmosphere and small environmental particles increase with progress.
- Browser scene renderer: five layered frames with continuous progress blending, 30-second linear full preview, pause, 1% scrub, return-to-actual-progress with 1.8-second easing. Preview state stays separate from goal and ledger state. Previously observed actual progress transitions over 2.4 seconds, using transient in-memory goal identity.
- Every scene supports keyboard-accessible touch interaction and short text response: gather aura, water plants, wave, thrust, wake dragon, pet, bubbles, crystal light and steam. No sound is played and no points/progress are awarded.
- Full/lite/static and reduced motion honored; offscreen CSS animations pause, playback stops when hidden/offscreen, all RAF/timers/listeners/observers disposed on route/dialog removal.
- Materials/prompts: assets/goal-art/EVOLUTION-PROMPTS.md. Full browser fixture checks all nine × five stages, backgrounds, intermediate blend, play/pause pacing, interactions, reduced motion and existing journal. These are layered illustrated browser animations, not rigged skeletal limb animation or prerecorded videos.

## 2026-10-16 lots, returns, interactive calendar and five actions
- New equity entry uses whole lots in **張**; 1 張 converts to 1,000 canonical shares at submit. Odd lots remain 股 and derivatives remain 口. Dynamic labels, per-share price, live notional hint, compatible copy/save; legacy drafts without quantityVersion migrate 1,000-share entries to 1 張 for display. Existing committed fills stay in shares and are never multiplied on read. Close/edit dialogs provide 張／股 conversions for partial fills.
- FIFO realization events now expose allocated opening notional + opening fee basis, nominal return %. Cycles, date reports, strategy summary and Excel grouped export include nominal return. Holdings show reference-price nominal return. Clearly not margin/self-funded cash ROI; unallocated interest and estimated exit fees excluded, unconfirmed fee estimates labeled.
- Real full-month calendar: Mon–Sun grid, explicit year/month, prior/next/current navigation, empty dates, today/selected indicators, monthly counts/PnL, daily fill/PnL/nominal-return detail, actionable fill open and selected-date batch entry, arrow-key navigation, leap-month test, dark/mobile overflow check. Merely choosing a date creates no trade.
- Every companion exposes five visual actions: entrance, idle, interaction, evolution, achievement. Entrance occurs on first visible scene; upward stage changes invoke evolution and final-stage achievement. CSS perspective and three rotating 3D planes/rings, light column, flash and sparks; parallax pointer response. These are **3D visual effects on layered illustrations, not rigged 3D character models**. Motion preferences, hidden/offscreen pause and timer cleanup retained.
- Gallery thumbnails now all use first-stage baby/scallion images from evolution atlases, with visible 初始型態 labels.
- Pure tests cover nominal return basis and contract-unit validation in addition to existing FIFO cases. UI fixture covers 1 張→1,000 shares, partial 500-share close, legacy draft migration, clickable daily calendar and leap month, five action controls and 3D ring effect per companion.

## 2026-10-16 follow-up: all appearances, contract entry and navigation search

- Futures/options unit selector is enabled with only 口 selectable. The editable quantity field stays enabled; reselecting the contract unit preserves quantity. Equity↔derivative switches still clear quantity to avoid reusing shares as contracts. Browser fixture explicitly inputs 3 contracts, changes the unit and checks it remains 3.
- Split ambiguous 帳戶與理由 toolbar entry into 管理帳戶 and 交易理由. Accounts separate broker/portfolio bookkeeping and PnL, without broker connectivity; account dialog lists names/fill counts and adds accounts. Reason dialog supports add/rename/remove; historical fill text remains intact.
- All nine themes now support female/male/neutral appearances and five growth stages. Eight new transparent 5×3 atlases are in assets/goal-art/*-genders-v2.png; immortal retains its existing 5×3 atlas. Gallery uses the initial neutral stage. Art prompt/provenance is in GENDER-PROMPTS-v2.md. The interrupted first three generations were recovered from local generated output; their exact prompts were unavailable, so that document clearly labels the reconstructed specification.
- New member-companion-rig.js renders a subtle locally deformed **2D WebGL mesh** with damped pointer response, breathing and gesture envelopes, instead of spinning the whole image plane. Stage changes use sequential fade-out/fade-in (no prolonged double-image blend). Five actions remain; evolution preview advances to the next stage. Existing environment progression and effects remain. Lazy visible initialization, hidden/offscreen pause, reduced motion, lightweight/static settings, observer/RAF/context disposal, CSS fallback on unsupported WebGL.
- **This is not game-quality true 3D.** There are no GLB models, bones, authored skeletal motion, facial rigs or depth-aware occlusion. User explicitly requests those; this remains an outstanding visual requirement. Next production step: obtain nine approved character model families with three persona variants and five growth forms each (or compatible morph/attachment progression), named entrance/idle/interact/evolve/celebrate clips, texture/LOD budgets and common anchors, then integrate a genuine 3D renderer and validate mobile performance. Do not describe this mesh renderer as full 3D.
- New site-search.js/.css adds a compact navigation-right search. Stock/ETF autocomplete reuses the homepage names/ranking and market/industry metadata; stock activation opens native openChart directly. Site results index actual navigation links, member feature routes and already loaded public news links. All/stock/content scopes, keyboard selection, Enter/Escape, slash shortcut, focus management, outside close, HTML escaping and light/dark/mobile styling.
- Search is **not a full historical article search**. For all news/history, add a server-backed public content index with stable IDs, titles, excerpts, route/URL, date, permissions, ranking and pagination. Do not search private profile/journal data. Current UI explicitly labels loaded-news scope.
- Validation: 30 engine/identity/strategy tests; member-trade-ui.browser.cjs covers journal, enabled futures inputs, nine × three appearances with live WebGL initialization, all stages/actions, reduced motion and dark/mobile. site-search.browser.cjs covers stock/ETF, member routes, loaded news, scopes, escaping, keyboard, repeated open/close and mobile bounds. Screenshots are in the chat workspace work/journal-qa.

## 2026-10-16 follow-up: actual 3D player and saved-news search

- Added local Three.js / GLTFLoader and a genuine skinned GLB companion player. Approved theme/gender stage manifests select it; the production manifest is empty, so existing users retain the illustrated fallback. Source, asset delivery contract and `validate_companion_models.cjs` are ready. Browser tests use a synthetic skinned tetrahedron solely to verify actual bone motion, five clips, crossfade/idle return, stage replacement, invalid-model fallback, reduced motion and GPU lifecycle. The 135 production stage slots are still missing; do not call the characters game-quality 3D finished.
- Search now queries all dates in existing public news/topic tables through read-only same-origin `/api/site_search`. Results show date/source/snippet and source links, with specified-date news navigation for linkless topics. Includes partial-source errors/retry, stale request cancellation, debouncing, bounded cache and selection preservation. No new DB objects needed. Search covers saved titles/excerpts/summaries, not publisher article full text.
- Prepared source-only SQL supplements for missing member services plus optimistic-concurrency research documents. No database connection/migration, live records, provider settings, scheduler or bucket changes. Frontend cloud migration/queue/conflict UI, private image upload and isolated PostgreSQL/RLS tests remain undone. See completion-status document for exact remaining work.
