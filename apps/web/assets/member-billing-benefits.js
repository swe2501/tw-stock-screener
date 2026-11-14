/* Reading a plan never changes membership or starts payment. */
(()=>{'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const quotas={free:[3,2,50,50],observation:[6,4,150,100],research:[15,10,500,300],advanced:[15,10,500,300],vip:[40,30,1500,600]};
 const features={chart_tools:['K 圖分析工具','在 K 圖畫線、加入圖形註解，並計算指定區間的統計。'],breadth:['大盤多空廣度','查看市場多空分布與均線廣度，了解整體盤面結構。'],fhedge:['外資空單溫度計','比較外資避險比率與歷史位置，整理觀察線索。'],themes:['題材與產業地圖','整理題材族群、相關標的與資料日期。'],etfsim:['ETF 相似度','比較 ETF 持股的重疊程度。'],etfx:['主動 ETF 分析','觀察 ETF 持股集中與變化。'],screen:['篩選工具','依條件整理標的，資料日期依各功能標示。'],learning:['學習中心','閱讀工具教學與研究方法。'],favorites:['自選與研究筆記','保存自選標的與個人研究紀錄。']};
 function dialog(title,opener){
   document.querySelectorAll('.mp-benefits-dialog').forEach(d=>d.close());
   const d=document.createElement('dialog');d.className='mp-benefits-dialog';d.setAttribute('aria-labelledby','mpBenefitsTitle');
   d.innerHTML='<header><span class="mc-kicker">FORESIGHT · MEMBERSHIP</span><button type="button" data-detail-close aria-label="關閉權益說明">×</button><h2 id="mpBenefitsTitle">'+esc(title)+'</h2></header><section data-detail-body></section><footer data-detail-footer></footer>';
   document.body.append(d);d.querySelector('[data-detail-close]').onclick=()=>d.close();
   d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});
   d.addEventListener('close',()=>{d.remove();if(opener?.isConnected)opener.focus({preventScroll:true});},{once:true});
   return d;
 }
 function open(product,opener){
   const d=dialog(product.name+'｜會員權益',opener),q=quotas[product.tier],fs=(product.features||[]).filter(f=>features[f]);let page=0;
   const overview='<h3>方案總覽</h3><p>'+esc(product.description)+'</p><p class="mp-detail-copy">'+esc(product.details||'詳細功能依下頁及各工具說明為準。')+'</p>'+(q?'<p class="mp-detail-note">以下為規劃額度，實際開放依帳號與後台設定。</p><dl><div><dt>真名／隱藏式／私房系列</dt><dd>每週合計 '+q[0]+' 次</dd></div><div><dt>企業價值進階篩選</dt><dd>每週 '+q[1]+' 次</dd></div><div><dt>研究筆記總容量</dt><dd>'+q[2].toLocaleString()+' 篇</dd></div><div><dt>自選標的合計</dt><dd>'+q[3]+' 檔</dd></div></dl>':'')+'<p>同時使用裝置：'+esc(product.device_limit??({free:1,observation:1,research:2,advanced:2,vip:3}[product.tier]||1))+' 台；是否啟用依帳號設定。</p>';
   const detail='<h3>功能怎麼使用</h3>'+(fs.length?fs.map(f=>'<article><h4>'+esc(features[f][0])+'</h4><p>'+esc(features[f][1])+'</p></article>').join(''):'<p>此商品尚未設定詳細工具清單，請以後台已儲存的方案說明為準。</p>')+'<p>共用次數是各系列合計使用，不是每種功能各有一份次數。每次執行前，以工具顯示的剩餘次數及扣抵提示為準。</p>';
   const rules='<h3>次數、容量與方案變更</h3><article><h4>週次數與總容量不同</h4><p>週次數是每週可使用的額度，重設時間依工具提示。筆記與自選是保存總量，不會每週清空。</p></article><article><h4>額度用完怎麼辦</h4><p>可等待下一週、使用適用的使用券，或查看任務是否能兌換對應權益；需升級時，先確認新方案涵蓋的功能與額度。</p></article><article><h4>升級、降級與取消</h4><p>升級付款成功後生效，按本期剩餘時間補差額，到期日不變；降級下期生效，本期權益保留。取消自動續訂後，用到本期結束，下期不再扣款。</p><p>降級後筆記與自選會保留；若超過新方案容量，新增前需整理到額度內。升級不會重新發放本週已用次數。</p></article><p class="mp-detail-note">查看權益不會訂閱、付款或改變會員身分。</p>';
   const pages=[overview,detail,rules];function paint(){const body=d.querySelector('[data-detail-body]');body.innerHTML=pages[page];body.scrollTop=0;d.querySelector('footer').innerHTML='<button type="button" data-detail-prev '+(!page?'disabled':'')+'>上一頁</button><span role="status">第 '+(page+1)+'／3 頁</span><button type="button" data-detail-next>'+(page===2?'返回選擇方案':'下一頁 →')+'</button>';d.querySelector('[data-detail-prev]').onclick=()=>{page--;paint();};d.querySelector('[data-detail-next]').onclick=()=>{if(page===2)d.close();else{page++;paint();}};}
   paint();d.showModal();
 }
 function confirmCancel(end){return new Promise(resolve=>{const d=dialog('取消自動續訂',document.activeElement);let confirmed=false;d.querySelector('[data-detail-body]').innerHTML='<p>取消後仍可使用至 <b>'+esc(new Date(end).toLocaleDateString('zh-TW'))+'</b>，下期不再扣款。</p><p>這是模擬操作，不會變更正式訂閱。正式服務需收到金流商確認，才會顯示取消成功；失敗時保留原狀並可重試。</p>';d.querySelector('footer').innerHTML='<button type="button" data-keep>保留訂閱</button><button type="button" data-confirm-cancel>確認取消續訂（測試）</button>';d.querySelector('[data-keep]').onclick=()=>d.close();d.querySelector('[data-confirm-cancel]').onclick=()=>{confirmed=true;d.close();};d.addEventListener('close',()=>resolve(confirmed),{once:true});d.showModal();});}
 window.AcademyBillingBenefits={open,confirmCancel};
})();
