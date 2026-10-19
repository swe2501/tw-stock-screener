# 九角色正式 3D 製作接續

最新狀態（2026-10-17）：135 份本機造型草稿已匯出，但美術風格未通過使用者確認。花園狐初階正在重塑比例與材質，不能將這批工作稿稱為九角色完成。新的來源、檢視方式及驗證邊界見 [精修狀態](companion-cast-review-status.md)。下列早期候選及工具準備紀錄保留為歷程。

2026-10-16：目前採 **免費 Blender 本機建模與動畫**，已製作小韭菜初階候選；正式模型尚未通過原畫美術驗收。Tripo 保留為備選，目前 API 餘額為 0，沒有送出付費生成。不能承諾自動建模直接達到原畫品質。

- [Tripo Auto Rig](https://developers.tripo3d.ai/en/docs/animations-rig)：區分人形與非人形骨架，列出四足、水生、鳥翼等類型；必須先 rig-check。類型支援不代表每個角色變形品質合格。
- [官方 CLI](https://developers.tripo3d.ai/en/docs/cli)：裝置授權、不需在聊天貼金鑰；make 支援 dry-run，生成會消耗點數。
- [Studio 價格／權利區分](https://www.tripo3d.ai/pricing)：免費方案列非商用與公開模型。CLI 使用開發者帳戶／API 點數，不能把 Studio 月費和 API 餘額當成同一筆。正式網站上線前記錄本批模型實際授權。
- [Blender glTF 輸出](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)：骨架與 shape key 動畫可匯出；尚未有正式模型可測。

## 已完成準備

官方 npm 套件 `tripo-cli@0.7.0` 已裝在本次 chat 工作區 `work/tripo-tooling/node_modules/tripo-cli`；使用 Node 24，不改 PowerShell policy、不裝全域命令。`--version` 和第一張小韭菜原畫 image-to-model 的 `--dry-run --json` 已通過；沒有上傳或消耗生成點數。

帳戶資料放本次 chat 工作區 `work/tripo-tooling/account`，透過 `TRIPO_HOME` 指定。**不可把帳戶目錄、金鑰、授權回傳或 npm 快取提交到 repo。** 裝置登入已完成並檢查餘額為 0；一次性驗證碼不寫入本文件。

`node scripts/prepare_companion_production.cjs <output.json>` 可從網站實際原畫區域及互動定義產出 **135 個製作需求**，包含九主題、女／男／中性、五階段、參考圖 UV、五個互動與十個 clip 名稱、交付路徑及限制；不產生模型、不連網、不自動審批。已於 chat 工作區 `work/tripo-production` 產出需求與 135 張逐格原畫參考，小韭菜初始／最終中性參考已看圖核對。這些 PNG 是建模輸入，不是 3D 成品。

## 下一步

1. 以免費本機 Blender 候選檢查造型、材質和骨架品質，維持正式 manifest 空白，直到美術驗收通過。
2. 先以小韭菜作品質基準；若日後改用付費生成，必須先核對方案與點數，不得默默批次跑 135 份。其他八個角色仍在完整範圍內。
3. 依原畫精修、分離角色與場景／持握道具，檢查拓撲和綁骨可用性。火車、植物、純晶石與跨物種成長需要自訂結構，不能硬套人形骨架。
4. 逐階段五種互動需有角色與道具接觸、不同動作、自然收尾及 idle；建立男女中性外觀，場景與運鏡隨階段漸進。動畫預設不等於已完成自訂動作。
5. 匯出含骨架與必要 clips 的 GLB，跑機械驗證、實機互動與美術驗收，再逐項填入正式 manifest。現有 manifest 仍 **0／135**；不得把 PNG、幾何試作或未驗收生成物登記為完成。

播放器與交付規格見 `assets/goal-models/README.md`，動作表見 `docs/companion-interactions.md`。此流程不新增網站 API，現有 12 支上限不變。

## 免費本機路線與第一份候選（2026-10-16）

使用者改採不儲值的免費路線。Tripo 裝置授權已成功，但開發者 API 餘額為 0；沒有提交付費生成。帳務頁沒有顯示免費領取入口。不要再把登入描述為尚未完成。

本機是 Windows ARM64、Qualcomm Adreno X1-85、16 GB RAM，不符合前述 Hunyuan3D 2.1 / TRELLIS.2 的 NVIDIA GPU 條件。已從 Blender 官方鏡像取得 **4.5.14 LTS Windows ARM64 可攜版**，對照官方 `.sha256` 校驗成功，只解壓於 chat 工作目錄；沒有變更系統安裝、檔案關聯或使用付費 API。

`scripts/create_blender_leek_candidate.py` 是原創 Blender 幾何／頂點色／骨架與動作來源，不使用原畫貼平面冒充立體模型。執行方式：

```text
blender --background --factory-startup -t 6 --python scripts/create_blender_leek_candidate.py -- <output-directory>
```

輸出：可編輯 `.blend`、內嵌資源 `.glb`、CPU Cycles 渲染 PNG 和 `report.json`。目前只製作 **immortal / neutral / stage 0** 候選，包含 10 段 clips：待機等 5 段與 pat/offer/play/care/cheer 5 段。水壺、水滴、太陽、音符、愛心為模型中的立體道具，透過各自骨架控制顯示、位置、旋轉和縮放。沒有製作或宣稱其他階段／性別／角色已完成。

候選檔案與本機可旋轉、可互動的檢視頁留在本次 chat 的 `work/blender-production`，未加入正式 manifest；美術品質與進階柔性變形仍需調整。**正式 readyStages 仍為 0/135**。GLB 播放測試只證明模型載入、五種 clips 與結束回 idle 正常，不代表達到原畫品質或通過全角色驗收。

官方下載：[Blender 4.5 官方 ARM 版](https://www.blender.org/releases/4-5/)、[官方鏡像](https://mirror.blender.org/release/Blender4.5/)。

## 韭菜辨識與接觸修正（2026-10-17）

使用者指出造型必須像韭菜。初階中性候選改為七片扁平、細長、有平行細脈的葉片；白色葉鞘縮窄，減少原先蔥頭／洋蔥般的肥大球莖。仍保留角色表情及細根，不把三片厚圓葉當作完成版本。

同步修正骨架局部座標：骨骼方向沿 world +Y，讓 local XYZ 與模型 XYZ 相符；上下位移不再誤變成前後位移。撫摸手掌會追蹤實際姿勢中的葉片表面；打氣先碰葉片，再由接觸位置出現回應。澆水先傾壺，再由傾斜後的壺嘴位置送出十顆獨立骨架水滴，落向葉叢基部；葉片在首批水滴到達後才開始回應。此為設計好的動畫軌跡，並非流體物理模擬。

已在 GLTFLoader 載入的匯出骨架網格量測三個指定時點：撫摸指尖與葉片最近頂點距離 0.0055、打氣接觸 0.0020、水滴與葉鞘 0.0291（模型單位）；五個互動均完成並返回 idle，瀏覽器未出現 pageerror。這是特定時間點的距離與播放驗證，不代表整段碰撞驗證或原畫品質驗收。新版預覽留在本機工作區，正式 manifest 仍不冒填未完成角色。
