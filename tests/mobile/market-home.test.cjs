const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {chapters,websiteOrigin,routeKind,bridgeScript}=require('../../apps/mobile/src/market-home');
const origin='https://research.example.test';

test('reading adapter rejects non-HTTPS, credentials and non-root configuration',()=>{
 for(const value of ['http://research.example.test','https://user:secret@research.example.test','https://research.example.test/private','javascript:alert(1)','https://research.example.test/?token=x'])assert.throws(()=>websiteOrigin(value));
 assert.equal(websiteOrigin(origin+'/'),origin);
 assert.equal(routeKind(origin+'/?view=home#hpFut',origin),'internal');
 assert.equal(routeKind('https://research.example.test.attacker.test/',origin),'external');
 assert.equal(routeKind('https://vercel.com/login',origin),'external');
 for(const url of ['file:///secret','javascript:alert(1)','http://research.example.test','academy-mobile://auth/callback','https://user:pass@research.example.test'])assert.equal(routeKind(url,origin),'blocked');
});

function page({host=origin,home=true,target=true,reduced=false}={}){
 const messages=[],calls=[],attributes={};
 const section={scrollIntoView:options=>calls.push(['scroll',options])};
 const document={
  getElementById:id=>id==='homeView'?(home?{}:null):null,
  documentElement:{getAttribute:key=>attributes[key]||null,setAttribute:(k,v)=>{attributes[k]=v;},removeAttribute:k=>{delete attributes[k];}},
  head:{appendChild:style=>calls.push(['style',style.textContent])},createElement:()=>({}),
  querySelector:selector=>{calls.push(['selector',selector]);return target?{closest:()=>section,scrollIntoView:section.scrollIntoView}:null;},
 };
 const window={ReactNativeWebView:{postMessage:json=>messages.push(JSON.parse(json))},matchMedia:()=>({matches:reduced}),_showView:view=>calls.push(['view',view])};
 return {context:{document,window,location:{origin:host}},messages,calls,attributes};
}
test('chapter jump reopens home, scrolls to section and respects reduced motion',()=>{
 const p=page({reduced:true});vm.runInNewContext(bridgeScript(origin,false,'futures'),p.context);
 assert.deepEqual(p.calls.find(c=>c[0]==='view'),['view','home']);
 assert.deepEqual(p.calls.find(c=>c[0]==='selector'),['selector','#hpFut']);
 assert.equal(p.calls.find(c=>c[0]==='scroll')[1].behavior,'auto');
 assert.equal(p.attributes['data-theme'],'light');
 assert.deepEqual(p.messages,[{type:'chapter',id:'futures'},{type:'ready'}]);
});
test('bridge never executes on an external authorization page or accepts arbitrary selector input',()=>{
 const p=page({host:'https://vercel.com'});vm.runInNewContext(bridgeScript(origin,true,'summary'),p.context);
 assert.equal(p.calls.length,0);assert.equal(p.messages.length,0);
 const q=page();vm.runInNewContext(bridgeScript(origin,true,"');fetch('/private');('"),q.context);
 assert.equal(q.calls.filter(c=>c[0]==='selector').length,0);
});
test('missing page and moved chapter report an explicit unavailable state',()=>{
 const p=page({home:false});vm.runInNewContext(bridgeScript(origin,true),p.context);assert.deepEqual(p.messages,[{type:'unavailable'}]);
 const q=page({target:false});vm.runInNewContext(bridgeScript(origin,true,'structure'),q.context);assert.ok(q.messages.some(m=>m.type==='missing'&&m.id==='structure'));assert.equal(q.calls.some(c=>c[0]==='scroll'),false);
});
test('all report chapters map to actual homepage targets in the website baseline',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../apps/web/index.html'),'utf8');
 assert.equal(new Set(chapters.map(c=>c.id)).size,chapters.length);
 for(const chapter of chapters){const selector=chapter.selector;if(selector.startsWith('#homeView .'))assert.ok(html.includes('class="'+selector.split(' .')[1]+'"'),selector);else assert.ok(html.includes('id="'+selector.slice(1)+'"'),selector);}
 assert.deepEqual(chapters.map(c=>c.id),['summary','history','report','institutions','margin','breadth','structure','leverage','futures','options','notes']);
});
