// Mechanical importer for the user-supplied Word/HTML research catalog.
// Usage: node tools/build_group_catalog.mjs "C:\\path\\catalog.doc"
import fs from 'node:fs';
import path from 'node:path';

const source = process.argv[2];
if (!source) throw new Error('catalog .doc path is required');
const html = fs.readFileSync(source, 'utf8');
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const categoryOf = (heading) => {
  if (heading.includes('電子、半導體')) return '電子';
  if (heading.includes('電腦系統')) return '電子';
  if (heading.includes('鋼鐵、傳產')) return '傳產';
  if (heading.includes('生技醫療')) return '生技';
  if (heading.includes('金融、證券')) return '金融';
  if (heading.includes('機械精密')) return '汽車機械';
  if (heading.includes('營建、地產')) return '建設';
  if (heading.includes('食品、零售')) return '消費航運';
  return '綠能紡織';
};
const catalog = [];
let heading = '';
for (const part of html.split(/(<h2[^>]*>[\s\S]*?<\/h2>)/i)) {
  if (/^<h2/i.test(part)) { heading = strip(part); continue; }
  for (const match of part.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => strip(m[1]));
    if (cells.length < 3) continue;
    const rawName = cells[0];
    const order = Number((rawName.match(/^\s*(\d+)\./) || [])[1]);
    if (!order) continue;
    const name = rawName.replace(/^\s*\d+\.\s*/, '').replace(/\s*（[^）]*）\s*$/, '').trim();
    const members = [];
    const seen = new Set();
    for (const m of cells[1].matchAll(/([^、，（）]+?)（(?:[^（）]*?，\s*)?(\d{4,6})）/g)) {
      const code = m[2];
      if (!seen.has(code)) { members.push({ code, name: m[1].trim() }); seen.add(code); }
    }
    catalog.push({ order, name, category: categoryOf(heading), section: heading.replace(/^.*?、\s*/, '').replace(/（集團.*$/, '').trim(), members, thesis: cells[2] || '', focus: cells[3] || '' });
  }
}
if (catalog.length < 100) throw new Error(`expected 100+ groups, got ${catalog.length}`);
// 文件標示 102+，但沒有涵蓋專案原先已整理的部分公開關係企業；保留這些補充名錄。
const supplements = [
  ['台積電集團','電子',[['2330','台積電'],['3443','創意']]],
  ['和泰集團','汽車機械',[['2207','和泰車'],['6592','和潤企業']]],
  ['義聯集團','傳產',[['2007','燁興'],['2023','燁輝'],['2069','運錩']]],
  ['威京集團','建設',[['2515','中工'],['2540','愛山林']]],
  ['群光藍天集團','電子',[['2362','藍天'],['2385','群光'],['3617','碩天']]],
  ['大聯大集團','電子',[['3702','大聯大']]],
  ['全家集團','消費航運',[['5903','全家']]],
  ['大亞集團','綠能紡織',[['1609','大亞']]],
  ['震旦集團','消費航運',[['2373','震旦行']]],
  ['南紡集團','綠能紡織',[['1440','南紡'],['2101','南港']]],
  ['炎洲集團','傳產',[['4306','炎洲']]],
];
for (const [name, category, members] of supplements) if (!catalog.some((g) => g.name === name)) {
  catalog.push({ order: catalog.length + 1, name, category, section: '補充公開關係企業', members: members.map(([code, stockName]) => ({ code, name: stockName })), thesis: '補充自專案既有公開關係企業名錄，待後續逐筆複核與擴充。', focus: '' });
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (m) => m.slice(1))), '..');
fs.writeFileSync(path.join(root, 'group-catalog.json'), JSON.stringify({ version: 1, source: path.basename(source), groups: catalog }, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'group-catalog.js'), `window.GROUP_BOOK_CATALOG=${JSON.stringify(catalog)};\n`);
console.log(`Generated ${catalog.length} groups / ${catalog.reduce((n, g) => n + g.members.length, 0)} listed stocks.`);
