const fs=require('fs'),assert=require('assert');
const {chromium}=require('playwright');
(async()=>{
 const html=fs.readFileSync('apps/web/index.html','utf8');
 const start=html.indexOf('<div id="themesView"');
 const end=html.indexOf('</script>',start)+9;
 const fragment=html.slice(start,end);
 const member=i=>({code:String(1000+i),name:'測試成分',price:10,change:1,tradeValue:100});
 const row=(name,n)=>({name,memberCount:n,today:1,weightedToday:1,tradeValue:n*100,members:Array.from({length:n},(_,i)=>member(i))});
 const data={category_version:2,date:'2026-10-23',listed:Array.from({length:128},(_,i)=>row('題材'+i,i===0?45:1)),otc:[row('上櫃題材',1)]};
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:844}});
 await page.route('**/*',r=>r.abort());
 await page.setContent('<script>window.__API="";window._swrRT=function(k,u,paint){paint('+JSON.stringify(data)+')};window._rtStart=function(){};window._heatDetailStart=function(){};<\/script>'.replace('<\/script>','</script>')+fragment);
 await page.evaluate(()=>{document.getElementById('themesView').style.display='';window._themesShow();});
 assert.equal(await page.locator('.tmx-cell').count(),128);
 await page.locator('.tmx-cell').first().click();
 assert.equal(await page.locator('.tmx-mtbl tbody tr').count(),45);
 await page.locator('#tmxMarket [data-m="otc"]').click();
 assert.equal(await page.locator('.tmx-cell').count(),1);
 assert((await page.locator('.tmx-cell').innerText()).includes('上櫃題材'));
 await page.close();
 }console.log('PASS category browsing at mobile and desktop widths');}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
