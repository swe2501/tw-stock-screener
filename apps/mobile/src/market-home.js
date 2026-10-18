// App-only reading adapter. Financial calculations and permissions remain on the website.
const chapters = Object.freeze([
 {id:'summary',title:'今日判讀',hint:'市場摘要與觀察索引',selector:'#homeView .gs-hero'},
 {id:'history',title:'市場走勢',hint:'指數、週期與圖表',selector:'#homeView .hx-card'},
 {id:'report',title:'籌碼總覽',hint:'每日籌碼報告與國際指標',selector:'#cbSheet'},
 {id:'institutions',title:'三大法人',hint:'上市、上櫃買賣超',selector:'#hpInst'},
 {id:'margin',title:'融資融券',hint:'資券餘額與變化',selector:'#hpMargin'},
 {id:'breadth',title:'市場廣度',hint:'漲跌家數與市場參與',selector:'#hpBreadth'},
 {id:'structure',title:'資金結構',hint:'成交占比與期間比較',selector:'#hpStruct'},
 {id:'leverage',title:'融資槓桿',hint:'動能背離、維持率與歷史',selector:'#hpMaintSec'},
 {id:'futures',title:'期貨籌碼',hint:'法人留倉、散戶與結算成本',selector:'#hpFut'},
 {id:'options',title:'選擇權',hint:'法人策略矩陣與支撐壓力',selector:'#hpOpt'},
 {id:'notes',title:'資料說明',hint:'日期、來源與判讀限制',selector:'#hpNote'},
]);

function websiteOrigin(value){
 try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash)return u.origin;}catch{}
 throw new Error('網站位址須為 HTTPS 網站根網址。');
}
function routeKind(value,origin){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)return 'blocked';return u.origin===websiteOrigin(origin)?'internal':'external';}catch{return 'blocked';}
}
function bridgeScript(origin,dark,chapterId){
 const chapter=chapters.find(c=>c.id===chapterId);
 return `(function(){
  if(location.origin!==${JSON.stringify(websiteOrigin(origin))})return;
  var send=function(type,extra){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({type:type},extra||{})));};
  var home=document.getElementById('homeView');
  if(!home){send('unavailable');return;}
  var light=${dark?'false':'true'};
  if((document.documentElement.getAttribute('data-theme')==='light')!==light){
   if(typeof window._toggleTheme==='function')window._toggleTheme();
   else if(light)document.documentElement.setAttribute('data-theme','light');else document.documentElement.removeAttribute('data-theme');
  }
  if(!document.getElementById('academy-app-reading-style')){
   var style=document.createElement('style');style.id='academy-app-reading-style';
   style.textContent='html{scroll-behavior:smooth} .hp-sec{scroll-margin-top:16px} @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}';document.head.appendChild(style);
  }
  if(!window.__academyReadingObserver&&typeof window.addEventListener==='function'){
   window.__academyReadingObserver=true;
   var sections=${JSON.stringify(chapters.map(c=>({id:c.id,selector:c.selector})))},pending=false,last='';
   window.addEventListener('scroll',function(){if(pending)return;pending=true;window.requestAnimationFrame(function(){
    pending=false;if(!home.getClientRects().length)return;var current='summary';
    sections.forEach(function(s){var e=document.querySelector(s.selector);if(e&&e.getClientRects().length&&e.getBoundingClientRect().top<150)current=s.id;});
    if(last!==current){last=current;send('chapter',{id:current});}
   });},{passive:true});
  }
  ${chapter?`if(typeof window._showView==='function')window._showView('home');
  var target=document.querySelector(${JSON.stringify(chapter.selector)});
  if(target){target=target.closest('.hp-sec')||target;target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});send('chapter',{id:${JSON.stringify(chapter.id)}});}else send('missing',{id:${JSON.stringify(chapter.id)}});`:''}
  send('ready');
 })();true;`;
}
module.exports={chapters,websiteOrigin,routeKind,bridgeScript};
