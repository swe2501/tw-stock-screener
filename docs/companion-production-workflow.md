# 九角色正式 3D 製作接續

2026-10-16：使用者確認沒有建模工具帳號或既有模型，要求協助選工具。已比較官方能力，建議 **Tripo 生成基礎模型＋Blender 精修與特殊動作**。本機沒有 Blender，尚未安裝。不能承諾自動生成直接達到原畫品質。

- [Tripo Auto Rig](https://developers.tripo3d.ai/en/docs/animations-rig)：區分人形與非人形骨架，列出四足、水生、鳥翼等類型；必須先 rig-check。類型支援不代表每個角色變形品質合格。
- [官方 CLI](https://developers.tripo3d.ai/en/docs/cli)：裝置授權、不需在聊天貼金鑰；make 支援 dry-run，生成會消耗點數。
- [Studio 價格／權利區分](https://www.tripo3d.ai/pricing)：免費方案列非商用與公開模型。CLI 使用開發者帳戶／API 點數，不能把 Studio 月費和 API 餘額當成同一筆。正式網站上線前記錄本批模型實際授權。
- [Blender glTF 輸出](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)：骨架與 shape key 動畫可匯出；尚未有正式模型可測。

## 已完成準備

官方 npm 套件 `tripo-cli@0.7.0` 已裝在本次 chat 工作區 `work/tripo-tooling/node_modules/tripo-cli`；使用 Node 24，不改 PowerShell policy、不裝全域命令。`--version` 和第一張小韭菜原畫 image-to-model 的 `--dry-run --json` 已通過；沒有上傳或消耗生成點數。

帳戶資料放本次 chat 工作區 `work/tripo-tooling/account`，透過 `TRIPO_HOME` 指定。**不可把帳戶目錄、金鑰、授權回傳或 npm 快取提交到 repo。** 裝置登入正在等人類自行註冊／授權；一次性驗證碼會到期，不把它寫入本文件。

`node scripts/prepare_companion_production.cjs <output.json>` 可從網站實際原畫區域及互動定義產出 **135 個製作需求**，包含九主題、女／男／中性、五階段、參考圖 UV、五個互動與十個 clip 名稱、交付路徑及限制；不產生模型、不連網、不自動審批。已於 chat 工作區 `work/tripo-production` 產出需求與 135 張逐格原畫參考，小韭菜初始／最終中性參考已看圖核對。這些 PNG 是建模輸入，不是 3D 成品。

## 下一步

1. 使用者完成國際站 Tripo 裝置登入後，以官方 CLI 檢查認證、網路與餘額，不輸出金鑰。
2. 先以小韭菜作品質基準，核對生成方案及點數，再生成單一候選；不得默默批次跑 135 份。其他八個角色仍在完整範圍內。
3. 依原畫精修、分離角色與場景／持握道具，檢查拓撲和綁骨可用性。火車、植物、純晶石與跨物種成長需要自訂結構，不能硬套人形骨架。
4. 逐階段五種互動需有角色與道具接觸、不同動作、自然收尾及 idle；建立男女中性外觀，場景與運鏡隨階段漸進。動畫預設不等於已完成自訂動作。
5. 匯出含骨架與必要 clips 的 GLB，跑機械驗證、實機互動與美術驗收，再逐項填入正式 manifest。現有 manifest 仍 **0／135**；不得把 PNG、幾何試作或未驗收生成物登記為完成。

播放器與交付規格見 `assets/goal-models/README.md`，動作表見 `docs/companion-interactions.md`。此流程不新增網站 API，現有 12 支上限不變。
