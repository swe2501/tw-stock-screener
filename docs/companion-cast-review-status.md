# 九角色 3D 工作稿與精修狀態

更新：2026-10-17。**135 份造型草稿已匯出，但使用者已指出粗稿不夠好看；美術工作尚未完成。正式 manifest 仍為 0/135，不得把數量或測試通過當作完成驗收。**

## 這一批的範圍

九主題 × 女／男／中性 × 五階段，共 135 個 GLB。每個包含真實封閉體積網格、骨架、五個 lifecycle clips 與五個互動 clips。是以共用建模／動畫框架製作的原創卡通工作稿，**不是 675 段逐一手工美術定稿，也尚未還原原畫的毛髮、刺繡和雕刻細節**。

階段變化包含：韭菜後期的人形仙者與袍服；花園的植栽與花朵；登山裝備；太空訓練裝備和飛船；龍的城堡／晶簇；小獸的羽翼；海龜珊瑚；火車車廂。外觀有紫金／藍金／青綠配色及不同飾物、眼部／髮型。這些是草稿中的實際差異，不代表每個設計已符合原畫。

使用者另指出韭菜側面太扁：新 cast 中的葉叢改成前後錯開和不同旋向的獨立厚度葉片，維持單片韭菜葉本身扁平；其他動物有完整後腦、軀幹和耳殼厚度。檢視頁加入正面／側面／背面及完整拖曳旋轉，仍需逐項確認解剖和柔性變形品質。

## 已開始的美術修正

先修 `garden/neutral/0`：連續白色臉頰與尖嘴、嵌入式棕色眼睛、連接軀幹和腳掌的前肢、耳殼、披風的內外面與金邊、耳飾、花盆內壁與紋飾。加入內嵌細纖維材質並降低過強刻紋。這一份仍標示 **refinement_in_progress**，沒有宣稱已達原畫品質。

粗稿曾使用的簡化球狀樹景不符合角色的原畫風格。現在檢視頁沿用 `assets/goal-art/world-atlas.png` 的九個背景，搭配透明的 3D 接觸陰影、主題光線和環境反射。**背景為原畫，不宣稱背景是完整 3D 場景；角色仍是可旋轉的骨架模型。** 另外保留的輕量 3D 景物程式是開發素材，非目前預設美術定稿。

正式網站仍保留原有插畫角色。本機工作稿沒有自動寫入正式 manifest，也沒有上傳至第三方、付費生成或變更部署 API。

## 可重現來源

```text
blender -b --factory-startup -t 6 --python scripts/create_blender_companion_cast.py -- OUTPUT

# 每次精修先只做單份，檢查造型後再繼續其餘階段。
blender -b --factory-startup -t 6 --python scripts/create_blender_companion_cast.py -- OUTPUT --themes garden --personas neutral --stages 0 --render

python scripts/serve_companion_cast.py --models OUTPUT --references REFERENCE_DIRECTORY --port 51763
node scripts/validate_companion_cast.cjs OUTPUT report.json
node tests/companion-cast-review.browser.cjs
```

`--render` 額外儲存可編輯 `.blend` 及 CPU Cycles PNG；GLB 內嵌資源。模型和參考裁圖位於本次 chat 的 `work/blender-production/cast`、`work/tripo-production/references`，不把大量未定稿二進位檔當作正式產品資產推送。建模不新增 Vercel Function；本機檢視伺服器只綁定 127.0.0.1，僅提供明確允許的模型、參考圖和檢視資源。

測試需設定 `PLAYWRIGHT_MODULE`、可選的 `QA_OUTPUT`，使用獨立 Edge 測試頁，沒有登入會員或改寫會員資料。

## 驗證的實際邊界

- 135/135 草稿通過 GLB 結構、內嵌資源、骨架與十個 clips 檢查。這批最大 2,002,948 bytes、43,464 triangles，均低於目前偏好預算。
- 實際 GLTFLoader 載入 135 組合，675 個互動姿勢有骨架變化且無非有限數值；九角色皆留存正側背截圖。
- 花園狐精修初階另外檢查撫摸、水滴、照料刷與碰手的匯出網格距離，並測試五個動作返回 idle、390px 版面與減少動態偏好。
- 檢查涵蓋載入、取樣姿勢和少數接觸時點，**不是完整碰撞檢查，也不是所有階段動作、美術或實機效能驗收**。

接續以花園狐的原畫辨識度、毛髮及披風品質為先，逐主題精修；不要再大量複製使用者已否定的粗稿風格後宣稱完成。
