/* Route local four-style scans only to a backend that explicitly supports them. */
(function(){'use strict';
async function endpoint(){
 const local=location.protocol==='file:'||['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname);
 if(!local)return window.__API||'';
 for(const base of ['http://127.0.0.1:49675','http://127.0.0.1:49676']){try{const response=await fetch(base+'/api/screen?stat=hidden-capability',{signal:AbortSignal.timeout(5000)}),data=await response.json();if(!response.ok||data.zhenming4!==true)throw Error();return base;}
 catch{} }
 throw Error('本機四式篩選服務尚未更新或未啟動，請重新啟動專案的本機預覽後再試。');
}
window.AcademyZhenmingFour={endpoint};
})();
