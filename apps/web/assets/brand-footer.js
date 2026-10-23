/* Public brand information, with existing member service destinations. */
(()=>{'use strict';const footer=document.getElementById('foresightFooter');if(!footer)return;
const dialog=document.createElement('dialog');dialog.className='fs-info-dialog';dialog.setAttribute('aria-labelledby','fs-info-title');dialog.innerHTML='<div><h2 id="fs-info-title"></h2><button type="button" aria-label="關閉網站資訊">×</button></div><section></section>';document.body.append(dialog);let opener=null;
const info={about:{title:'關於先見',html:`<div class="fs-about-intro"><span>OUR STORY</span><h3>陪認真生活的你，<br>把研究這條路走得更踏實。</h3></div>
<p>每個人走進市場，都有自己的理由。也許是想讓生活多一點餘裕，為孩子的未來做些準備，或替退休後的日子多留一份從容。每一分累積的背後，都是認真生活的心意。</p>
<p>但資訊愈多，有時反而愈難判斷。忙了一整天，還得面對看不完的消息與行情起伏；想好好了解，卻常常不知道該從哪裡開始。這份心情，正是我們想做「先見」的起點。</p>
<p>我們希望，把複雜的市場資訊整理得清楚一點，讓願意學習的人，有一個可以慢慢看、反覆核對，也能留下自己想法的地方。</p>
<p>從資料來源、圖表到研究紀錄，我們在意的，是資訊是否透明、理解是否有依據，以及你能不能逐步建立自己的研究習慣。</p>
<p>「先見」這個名字，寄託的是一份心意：在做決定之前，多一點了解，也多一點思考的空間。</p>
<p>市場始終有不確定性，也有需要承擔的風險。我們會持續做好資訊整理與研究工具，陪你保持好奇、練習判斷；每個人的步調與選擇，都值得被尊重。</p>
<p class="fs-about-closing">願每一次研究，都讓你更了解自己的選擇。<span>先見 FORESIGHT · 盤後研究院</span></p>`},help:{title:'使用說明',html:'<h3>從哪裡開始？</h3><p>先從首頁查看市場摘要，再到「選股」的掏金篩選器設定條件，點選股票開啟個股圖表。</p><h3>研究紀錄在哪裡？</h3><p>觀察清單可編輯備註，也可透過「前往我的自選」查看詳細資料；保存的選股結果可在選股日曆查看。</p><h3>遇到問題怎麼辦？</h3><p>使用「聯絡我們」前往回饋頁，說明遇到的情況；提交結果以頁面顯示為準。</p>'}};
footer.addEventListener('click',e=>{const member=e.target.closest('[data-footer-member]');if(member&&typeof window.openMemberCenter==='function'){e.preventDefault();window.openMemberCenter(member.dataset.footerMember);return;}const b=e.target.closest('[data-footer-info]');const item=b&&info[b.dataset.footerInfo];if(!item)return;opener=b;dialog.querySelector('h2').textContent=item.title;dialog.querySelector('section').innerHTML=item.html;dialog.showModal();});
dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>opener?.focus({preventScroll:true}));dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
})();
