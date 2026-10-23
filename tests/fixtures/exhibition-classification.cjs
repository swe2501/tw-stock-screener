// Minimal classification fixture; never shipped in website assets.
const events=require('../../apps/web/assets/exhibitions.json').events;
const themes=Object.fromEntries(events.flatMap(e=>e.themes).map(t=>[t,[]]));
themes.CoWoS=['2330'];themes['生技醫療']=['6645'];
module.exports={themes,industries:{'2330':'半導體業','6645':'生技醫療業','2610':'航運業','2618':'航運業','2646':'航運業','6757':'航運業'},names:{'2330':'台積電','6645':'金萬林','2610':'華航','2618':'長榮航','2646':'星宇航空','6757':'台灣虎航'}};
