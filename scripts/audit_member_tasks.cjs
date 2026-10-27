const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'apps/web/assets/member-task-guide.js'),'utf8'),context);
vm.runInNewContext(fs.readFileSync(path.join(root,'apps/web/assets/member-journey.js'),'utf8').replace(' const icon=',' window.__taskAudit=tasks; const icon='),context);
const tasks=context.window.__taskAudit,rules=context.window.AcademyTaskGuide.rules;
assert.equal(tasks.length,46);assert.equal(new Set(tasks.map(t=>t[0])).size,tasks.length);
for(const task of tasks){const r=rules[task[0]];assert.ok(r?.where&&r?.how,'Missing plain-language contract: '+task[0]);}
const doc='# 會員任務逐項核對（2026-10-22，準備中）\n\n原有 41 項＋新增 5 項。下表和畫面共用同一份完成指引；以 `node scripts/audit_member_tasks.cjs --check` 核對覆蓋。\n\n| 任務 | 在哪裡完成 | 正確完成方式 |\n|---|---|---|\n'+tasks.map(t=>'| '+t[2]+' | '+rules[t[0]].where.replaceAll('|','／')+' | '+rules[t[0]].how.replaceAll('|','／')+' |').join('\n')+'\n\n## 已找到的原有缺口\n\n- 多個每日／每週／模擬任務只列卡片，ready() 最後直接回 false，沒有對應完成判定。\n- 交易資料實際保存在 fills／reviews，舊任務卻讀 trades；選股策略實際為 strategies 陣列，舊判定讀 strategy，且只讀本機紀錄。\n- 本週回顧原本只有統計與下載，沒有提交回顧的入口。\n- 個人已讀標記與獎勵核驗分成兩個操作，容易以為讀完就已完成獎勵。\n\n## 這次的判定邊界\n\n- 任務紀錄另外由伺服器保存，驗證必要欄位／字數／來源，不接受 caller-supplied 完成旗標、點數、完成日期。個人雲端備份仍不直接作為點數資格統計。\n- 日／週任務採台北時間；週一至週日。同日多篇只算一個週任務日期，同週挑戰／回顧只計一次。相同內容或相同模擬案例不重複累計。\n- 筆記與覆盤保存成功後再同步任務；同步失敗會保留原資料，舊筆記可按同步資格。補同步記錄為當下，不偽造／回填歷史完成日期。\n- 獎勵影片尚未接通、活動使用券、人工審核、尚未開放、上限已滿分別顯示，不冒充尚未完成。\n- 單筆與批次領取共用同一個伺服器判定及錢包鎖。批次保留單號與結果，重送同單號不再發點；可領任務每次重新核對，不只處理目前畫面分類。\n- 新增五項的建議獎勵為 40／80／30／150／30 點，SQL 預設 active=false（未開放）。本次準備不代表批准正式資料庫 migration 或活動啟用。\n';
const target=path.join(root,'docs/member-task-audit-2026-10-22.md');
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(target,'utf8').replaceAll('\r\n','\n'),doc);else fs.writeFileSync(target,doc);
console.log('PASS task audit: all 46 tasks have an explicit location and completion contract');
