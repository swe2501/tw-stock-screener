const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const script=fs.readFileSync(path.join(__dirname,'../apps/web/assets/member-invitation.js'),'utf8');
const values=new Map(),location=new URL('https://example.test/?ref=realname828448&keep=1#member/referrals');let now=Date.now();
class Clock extends Date{static now(){return now;}}
const context={window:{},Date:Clock,URL,URLSearchParams,location,sessionStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},history:{state:{},replaceState:(_,__,url)=>{location.href=new URL(url,location.origin).href;}}};vm.createContext(context);
const run=()=>{vm.runInContext(script,context);return context.window.AcademyInvitation;};let api=run();
assert.equal(api.pending().code,'REALNAME828448');const seen=api.pending().seen_at;now+=1000;api=run();assert.equal(api.pending().seen_at,seen,'reload does not restart attribution window');
location.search='?ref=DIFFERENT999&keep=1';api=run();assert.equal(api.pending().code,'REALNAME828448','another landing link cannot silently overwrite retained code');
assert.equal(api.link('realname828448'),'https://example.test/?ref=REALNAME828448','share URL excludes unrelated query/hash');
assert.equal(api.remember('bad!'),false);assert.equal(api.normalize('<script>'),'');assert.equal(api.remember('DIFFERENT999'),true,'explicit member choice may replace an unconfirmed suggestion');
api.clear();assert.equal(api.pending(),null);assert.equal(location.search,'?keep=1');assert.equal(location.hash,'#member/referrals');api=run();assert.equal(api.pending(),null,'confirmed code does not reappear on reload');
api.remember('REALNAME828448');now+=7*86400000;assert.equal(api.pending(),null,'expired suggestions are rejected');
values.set('academy.invitation',JSON.stringify({code:'REALNAME828448',seen_at:now+1000}));assert.equal(api.pending(),null,'future timestamps rejected');
location.protocol='file:';assert.equal(api.link('REALNAME828448'),'');
console.log('PASS invitation suggestions: normalize, no sliding expiry or silent overwrite, explicit selection, callback query/hash preservation, confirmed cleanup, expiry, future date and protocol validation; no binding/award calls.');
