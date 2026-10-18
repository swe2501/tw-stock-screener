const {test}=require('node:test'),assert=require('node:assert/strict');
const {searchNews,apiBase,articleUrl}=require('../packages/shared/news-api');
test('public App search preserves API contract, encodes query and sends no credentials',async()=>{
 let request;const data=await searchNews('https://fixture.test','台積電 & AI',{fetcher:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({items:[{title:'公告',url:'javascript:alert(1)'}],partial:true})}}});
 const url=new URL(request.url);assert.equal(url.pathname,'/api/prices');assert.equal(url.searchParams.get('action'),'site_search');assert.equal(url.searchParams.get('q'),'台積電 & AI');assert.equal(request.options.headers,undefined);assert.equal(data.items[0].url,null);assert.equal(data.partial,true);
});
test('invalid config, queries and response shapes fail explicitly',async()=>{
 assert.throws(()=>apiBase('http://fixture.test'));assert.throws(()=>apiBase('https://name:secret@fixture.test'));
 await assert.rejects(searchNews('https://fixture.test','x'),/2～80/);
 await assert.rejects(searchNews('https://fixture.test','有效',{fetcher:async()=>({ok:true,json:async()=>({})})}),/格式/);
 assert.equal(articleUrl('https://news.test/report'),'https://news.test/report');assert.equal(articleUrl('file:///private'),null);
});
