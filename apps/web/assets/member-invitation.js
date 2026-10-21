/* Invitation attribution is a suggestion until the member confirms it; this module never binds or awards. */
(() => {
 'use strict';
 const key='academy.invitation',ttl=7*86400000;
 const normalize=value=>{const code=String(value??'').trim().toUpperCase();return /^[A-Z0-9]{6,20}$/.test(code)?code:'';};
 function pending(){try{const p=JSON.parse(sessionStorage.getItem(key)||'null');if(normalize(p?.code)&&Number.isFinite(p.seen_at)&&p.seen_at<=Date.now()&&Date.now()-p.seen_at<ttl)return {code:normalize(p.code),seen_at:p.seen_at};sessionStorage.removeItem(key);}catch{}return null;}
 function remember(value){const code=normalize(value);if(!code)return false;try{const prior=pending();if(prior?.code!==code)sessionStorage.setItem(key,JSON.stringify({code,seen_at:Date.now()}));return true;}catch{return false;}}
 function capture(){const prior=pending();if(prior)return prior;const code=normalize(new URLSearchParams(location.search).get('ref'));if(code)remember(code);return pending();}
 function clear(){try{sessionStorage.removeItem(key);}catch{}const url=new URL(location.href);if(url.searchParams.has('ref')){url.searchParams.delete('ref');history.replaceState(history.state,'',url.pathname+url.search+url.hash);}}
 function link(value){const code=normalize(value);if(!code||!['https:','http:'].includes(location.protocol))return '';const url=new URL(location.pathname,location.origin);url.searchParams.set('ref',code);return url.href;}
 const copyIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="3"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/></svg>';
 window.AcademyInvitation={normalize,pending,remember,capture,clear,link,copyIcon};
 capture();
})();
