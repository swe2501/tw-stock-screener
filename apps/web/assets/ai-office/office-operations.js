/* Department responsibilities and evidence-based KPI comparisons. No AI calls or scheduler. */
(function(root){
'use strict';
const rows=[
 ['彙整全公司異常與待核准決策','每日決策摘要','待決策停留時間',20],
 ['比較產品價值、成本與經營假設','商業方案與依據','經核准方案的後續驗證率',4],
 ['整理使用需求與可核對的回饋','需求證據清單','具來源的需求覆蓋率',4],
 ['提出新功能構想及驗證方法','小型實驗方案','經驗證的假設比例',4],
 ['整理需求優先順序、規格及驗收標準','產品待辦與驗收規格','已驗收功能的使用率',5],
 ['檢查深淺色、排版與互動一致性','介面修正方案與原型','完成設計驗收的問題比例',6],
 ['核對服務錯誤與開發待辦，提出修復方案','修復規格與測試證據','回歸缺陷率',8],
 ['查核資料日期、來源及數值一致性','附來源的研究資料','應更新資料的準時率',24],
 ['檢查核准範圍內的功能與使用流程','測試結果與重現步驟','缺陷重開率',6],
 ['檢視已授權的健康與安全紀錄','異常分級與處理建議','異常確認及修復時間',6],
 ['分析既有內容表現與推廣機會','待核准推廣方案','內容帶來的有效註冊率',25],
 ['整理會員問題、追蹤處理結果','會員問題與改善摘要','首次回應與解決時間',4],
 ['研究合作需求與免費服務體驗','合作及服務方案草稿','已同意聯繫的商機進度',31],
 ['核對可取得的工具用量與預算','成本摘要與超支提醒','已核准預算使用率',0],
 ['初審內容措辭、來源、個資與授權','修訂建議及待專業確認事項','初審問題的處理率',0],
 ['整理交付成果與內容索引，維護去重紀錄','知識索引與交接說明','可追溯交付物比例',20],
 ['預留供應鏈與物流流程，維持停用','目前不派工','停用',null],
 ['比較公開競品資訊，記錄時間與來源','競品變化摘要','附證據的情報比例',1],
 ['檢查指標定義、樣本與推論限制','可重現分析與方法說明','可重現分析比例',1],
 ['整理任務依賴、卡點與執行端狀態','全公司巡檢及交接清單','阻塞任務等待時間',20],
 ['追蹤跨部門交付、期限與待決策事項','專案進度與風險摘要','里程碑準時驗收率',0],
 ['整理角色工作範例與錯誤修正','工作規範與評估案例','抽樣驗收通過率',15],
 ['比較工具方案、條款與成本','採購比較，不自行下單','核准工具的使用效益',13],
 ['核對決策、權限與驗收是否可追溯','內控缺口與改善紀錄','稽核問題完成處理率',0],
 ['維護教學選題與學習目標，核准後才寫正文','每週三個去重主題提案','經核准主題數與重複率',14],
 ['整理社群素材需求與回饋','待核准貼文與溝通方案','具有效回饋的內容比例',10],
 ['研究海外讀者需求與用詞差異','在地化方案及核對項目','在地化驗收通過率',4],
 ['核對素材及研究來源的使用條件','授權清單與缺漏提醒','可追溯授權的素材比例',14],
 ['提出受眾、素材、落地頁與投放實驗','待核准廣告文案與影片腳本','核准活動的有效轉換成本',14],
 ['整理已同意提供的諮詢與預約需求','待跟進需求摘要','已授權諮詢的回應時間',12],
 ['核對已授權取得的收支及憑證','差異清單，不自行付款','帳務核對差異處理率',13],
 ['整合需求、研究與成本，提出可比較方案','效益、限制及驗收方式','方案採用後的成效驗證率',0]
];
const rules=rows.map((r,id)=>({id,enabled:id!==16,daily:r[0],deliverable:r[1],businessKpi:r[2],next:r[3],mode:id===16?'disabled':'review-proposal'}));
const stamp=s=>{const t=Date.parse(s);return Number.isFinite(t)?t:null;};
function compare(tasks,department,now=Date.now()){
 const list=tasks.filter(t=>t.department===department),span=7*86400000;
 function period(start,end){
  const done=list.filter(t=>t.status==='approved').map(t=>({t,at:(t.history||[]).filter(h=>h.status==='approved').map(h=>stamp(h.at)).filter(x=>x!==null).sort((a,b)=>b-a)[0]})).filter(x=>x.at>=start&&x.at<end);
  const due=done.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.t.due_date||''));
  const ontime=due.filter(x=>new Date(x.at+8*3600000).toISOString().slice(0,10)<=x.t.due_date).length;
  return {approved:done.length,ontime:due.length?ontime/due.length:null,ontimeSample:due.length};
 }
 const current=period(now-span,now),previous=period(now-2*span,now-span);
 return {current,previous,delta:current.approved-previous.approved,ontimeDelta:current.ontime!==null&&previous.ontime!==null?current.ontime-previous.ontime:null,blocked:list.filter(t=>['blocked','failed'].includes(t.status)).length};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(id,tasks,{at='',limited=false,error='',departmentNames={}}={}){
 const r=rules[id];if(!r)return '';
 if(!r.enabled)return '<section class="wr-operations"><h4>每日工作與 KPI</h4><p>物流維持預留停用，不建立任務或啟動服務。</p></section>';
 const m=compare(tasks,id),loaded=!!at&&!error;
 const trend=n=>n>0?'增加 '+n:n<0?'減少 '+Math.abs(n):'持平';
 const value=loaded?m.current.approved+' 件':'尚未取得';
 return '<section class="wr-operations"><header><h4>每日工作與 KPI</h4><span>巡檢與提案階段</span></header><p>'+esc(r.daily)+'</p><dl class="wr-ops-plan"><div><dt>交付成果</dt><dd>'+esc(r.deliverable)+'</dd></div><div><dt>下一站</dt><dd>'+esc(departmentNames[r.next]||'部門 '+r.next)+'</dd></div></dl><div class="wr-ops-kpis"><article><span>近 7 日已驗收</span><b>'+value+'</b><small>'+(loaded?'對比前 7 日：'+trend(m.delta):'等待真實任務紀錄')+'</small></article><article><span>準時驗收率</span><b>'+(loaded&&m.current.ontime!==null?Math.round(m.current.ontime*100)+'%':'尚無可計算樣本')+'</b><small>'+(loaded?'有期限且已驗收 '+m.current.ontimeSample+' 件；'+(m.ontimeDelta===null?'前期比較不足':(m.ontimeDelta>0?'+':'')+(m.ontimeDelta*100).toFixed(1)+' 個百分點'):'未取得資料不視為達標')+'</small></article><article><span>待處理異常</span><b>'+(loaded?m.blocked+' 件':'尚未取得')+'</b><small>卡住或失敗的已載入任務</small></article></div><details><summary>部門業務指標與改善規則</summary><p>待串接業務指標：'+esc(r.businessKpi)+'。未取得相應資料前，不顯示成績或宣稱達標。</p><p>每天記錄卡點與改善提案，以近 7 日對比前 7 日觀察趨勢；交付量增加不代表品質提升。沒有工作需求時維持待命，不為填 KPI 製造任務。</p><p>正式修改、發布、投放、採購及法律定論均需相應授權。內容正文仍須先核准主題。</p></details><p class="wr-caption">'+(limited?'僅最近已載入任務，數據可能不完整。':'依目前已載入任務計算，非全量稽核。')+' 責任規劃不代表執行端已啟動；每日巡檢目前在本聊天交付，不會自動寫回工作室。</p></section>';
}
root.ForesightOfficeOperations={rules,compare,render};if(typeof module!=='undefined')module.exports=root.ForesightOfficeOperations;
})(typeof window==='undefined'?globalThis:window);
