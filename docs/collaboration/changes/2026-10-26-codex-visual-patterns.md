# 已保存的K線型態判讀與輔助線

網站原AI判定開啟時會呼叫即時推論。本次改為只讀已保存的視覺結果，依股票及日／週週期顯示型態核取方塊、轉折線與頸線；另一週期有型態時提供切換提示。還原行情、來源OHLC不同、座標未核對時不畫線。

本批固定抽100檔上市股票，行情截至2026-10-23，日K120根、週K取可取得的三年資料。200張均已由Codex逐張視覺檢查：120張有W、74張未見W、6張待複核；共83檔至少一個週期有W、125組W。這是新資料的模型判讀分布，沒有逐張人工正解，不是準確率。短歷史已標記，最早一週可能不完整。只做W，未聲稱其他型態已掃描。

## API與相容性

- 新增既有GET `/api/screen?stat=visual_patterns&code=1236` 分流，只讀 `page_cache` 中 `codex_visual_patterns@uat` 的最新附加版本。未新增Function入口。正式環境不讀UAT快照。
- JSON契約 `version=codex-visual-v1, scope=uat, records[]`；未覆寫既有API參數，舊App不受影響。舊aibuy後端保留相容，但新網站AI面板不呼叫它。
- 網站使用凍結JSON作讀取失敗時備援；不得將UAT靜態資料當正式站每日更新結果。
- iPhone／Android／iPad App程式沒有改動。沒有schema、RLS、Auth、OAuth、環境變數或排程變更。
- `scripts/publish_visual_patterns.py` 預設只檢查；明確 `--publish-uat --env-file ...` 才附加既有page_cache命名空間，不刪除其他快照，不呼叫付費模型。UAT與正式站共用實體資料庫，命名空間隔離並非獨立測試資料庫。

## 驗證與回復

已核對200張圖的SHA與原始OHLC、125組轉折精確日期價格及頸線。相關Python測試檢查環境隔離與無推論；瀏覽器測試檢查多型態checkbox、取消清線、日週切換、還原／行情不合拒絕畫線，並在完整網站與真實LightweightCharts重現。

回復可回退本次程式提交，保留資料快照。此批資料是一次性研究快照，不會自動每日刷新。待複核圖不顯示輔助線，後續需另行校正。
