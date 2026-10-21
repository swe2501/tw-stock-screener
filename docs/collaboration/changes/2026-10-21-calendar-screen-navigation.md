# 選股日曆前往選股導覽修正

日曆「前往選股」原先先點會員返回鈕（history.back），再同步開啟 screen；稍後到來的 popstate 會覆寫新頁，回到會員總覽等前一頁。

改為單一 `_showView('screen')` 公開導覽，沿用現有會員關閉／歷史管理，下一影格捲至掏金篩選器。更新 script 版本參數。

`tests/navigation-history.browser.cjs` 涵蓋從會員總覽／個人資料進入日曆、點擊捷徑、延遲後仍為 screen、上一頁返回日曆及下一頁返回篩選器、直接日曆網址進入。既有 Logo／抽屜／彈窗導覽回歸通過。

僅網站跳轉修正，未修改選股保存日期政策、SQL、API、App；本機修改尚未推送。
