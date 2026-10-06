import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const catalogPath = path.join(root, 'group-catalog.json');
const outputDir = path.join(root, 'assets', 'group-logos');
const manifestPath = path.join(root, 'group-logos.js');
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));

const officialDomains = {
  '華新麗華集團':'https://www.walsin.com/','聯電集團':'https://www.umc.com/','泛鴻海集團':'https://www.foxconn.com/','台塑集團':'https://www.fpg.com.tw/','長榮集團':'https://www.evergreen.com.tw/','統一集團':'https://www.uni-president.com.tw/','遠東集團':'https://www.feg.com.tw/','裕隆集團':'https://www.yulon-group.com/','富邦集團':'https://www.fubon.com/','國泰集團':'https://www.cathayholdings.com/','潤泰集團':'https://www.ruentex.com.tw/','中鋼集團':'https://www.csc.com.tw/','台灣鋼鐵集團':'https://www.tsgh.com.tw/','聯發科集團':'https://www.mediatek.com/','宏碁集團':'https://www.acer.com/','華碩／和碩集團':'https://www.asus.com/','明基友達集團':'https://www.benq.com/','緯創集團':'https://www.wistron.com/','國巨集團':'https://www.yageo.com/','台積電集團':'https://www.tsmc.com/','台達電集團':'https://www.deltaww.com/','光寶集團':'https://www.liteon.com/','廣達集團':'https://www.quantatw.com/','英業達集團':'https://www.inventec.com/','大聯大集團':'https://www.wpgholdings.com/','元大集團':'https://www.yuanta.com/','中信集團':'https://www.ctbcholding.com/','永豐餘集團':'https://www.yfy.com/'
};

const headers = {'user-agent':'Mozilla/5.0 (compatible; GroupBookLogoAudit/1.0)','accept':'text/html,image/avif,image/webp,image/png,image/svg+xml,image/*,*/*'};
const timeout = ms => AbortSignal.timeout(ms);
const safeName = name => name.replace(/[\\/:*?"<>|]/g, '-');
const contentExt = type => type.includes('svg')?'svg':type.includes('png')?'png':type.includes('webp')?'webp':type.includes('jpeg')||type.includes('jpg')?'jpg':type.includes('icon')?'ico':'';

async function json(url){const r=await fetch(url,{headers,signal:timeout(20000)});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json()}
const [listed, otc] = await Promise.all([
  json('https://openapi.twse.com.tw/v1/opendata/t187ap03_L'),
  json('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O')
]);
const normalizedOtc=otc.map(x=>({...x,'公司代號':x.SecuritiesCompanyCode,'公司名稱':x.CompanyName,'公司簡稱':x.CompanyAbbreviation,'網址':x.WebAddress}));
const companies = new Map([...listed,...normalizedOtc].map(x=>[String(x['公司代號']||'').trim(),x]));
const normalizeSite=value=>{if(!value)return'';value=String(value).trim();return /^https?:\/\//i.test(value)?value:`https://${value}`};

function iconCandidates(html, base){
  const out=[];
  for(const m of html.matchAll(/<link\b[^>]*>/gi)){
    const tag=m[0], rel=(tag.match(/\brel=["']([^"']+)/i)||[])[1]||'';
    if(!/icon/i.test(rel))continue;
    const href=(tag.match(/\bhref=["']([^"']+)/i)||[])[1];
    if(href)try{out.push(new URL(href,base).href)}catch{}
  }
  for(const m of html.matchAll(/<img\b[^>]*>/gi)){
    const tag=m[0]; if(!/logo/i.test(tag))continue;
    const src=(tag.match(/\b(?:src|data-src|data-lazy-src)=["']([^"']+)/i)||[])[1]||(tag.match(/\bsrcset=["']([^"', ]+)/i)||[])[1];
    if(src)try{out.push(new URL(src,base).href)}catch{}
  }
  try{out.push(new URL('/favicon.ico',base).href)}catch{}
  return [...new Set(out)];
}

async function fetchLogo(site){
  site=normalizeSite(site);
  let response,finalUrl=site,html='';
  try{response=await fetch(site,{headers,redirect:'follow',signal:timeout(15000)});finalUrl=response.url||site;if(response.ok)html=await response.text()}catch{}
  for(const url of iconCandidates(html,finalUrl)){
    try{
      const r=await fetch(url,{headers:{...headers,referer:finalUrl},redirect:'follow',signal:timeout(12000)});
      if(!r.ok)continue;
      const type=(r.headers.get('content-type')||'').toLowerCase();
      const bytes=new Uint8Array(await r.arrayBuffer());
      if(bytes.length<100||bytes.length>2_000_000)continue;
      const ext=contentExt(type)||path.extname(new URL(r.url).pathname).slice(1).toLowerCase();
      if(!['svg','png','webp','jpg','jpeg','ico'].includes(ext))continue;
      return {bytes,ext:ext==='jpeg'?'jpg':ext,source:r.url,site:finalUrl};
    }catch{}
  }
  throw new Error('no usable official icon');
}

await fs.mkdir(outputDir,{recursive:true});
let manifest={};
try{manifest=JSON.parse((await fs.readFile(manifestPath,'utf8')).replace(/^window\.GROUP_LOGOS=/,'').replace(/;\s*$/,''))}catch{}
for(const [i,group] of catalog.groups.entries()){
  if(manifest[group.name]){console.log(`[${i+1}/${catalog.groups.length}] KEEP ${group.name}`);continue}
  const core=group.members?.[0];
  const company=core&&companies.get(String(core.code));
  const site=normalizeSite(officialDomains[group.name]||company?.['網址']);
  if(!site){console.log(`[${i+1}/${catalog.groups.length}] MISS ${group.name}: no official site`);continue}
  try{
    const logo=await fetchLogo(site);
    const file=`${safeName(group.name)}.${logo.ext}`;
    await fs.writeFile(path.join(outputDir,file),logo.bytes);
    manifest[group.name]={path:`assets/group-logos/${file}`,source:logo.source,site:logo.site,coreCode:core?.code||''};
    console.log(`[${i+1}/${catalog.groups.length}] OK   ${group.name}`);
  }catch(e){console.log(`[${i+1}/${catalog.groups.length}] MISS ${group.name}: ${e.message}`)}
}
await fs.writeFile(manifestPath,`window.GROUP_LOGOS=${JSON.stringify(manifest,null,2)};\n`,'utf8');
console.log(`Saved ${Object.keys(manifest).length}/${catalog.groups.length} official-site logos.`);
