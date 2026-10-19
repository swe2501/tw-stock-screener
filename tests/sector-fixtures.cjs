// Deterministic synthetic trading sessions only; not actual market history.
function fixture(count=400){
 const dates=[];for(let d=new Date('2024-01-02T00:00:00Z');dates.length<count;d.setUTCDate(d.getUTCDate()+1))if(![0,6].includes(d.getUTCDay()))dates.push(d.toISOString().slice(0,10));
 const rows=dates.map((date,i)=>{const e=78+Math.sin(i/11)*4+(i>count-8?2:0),f=4+Math.cos(i/9),t=100-e-f,total=5e11+(i%13)*1e10;return {date,elec_pct:e,fin_pct:f,trad_pct:t,elec_amt:total*e/100,fin_amt:total*f/100,trad_amt:total*t/100,total_amt:total,updated_at:date+'T08:30:00Z',top_trad_name:'塑膠',top_trad_pct:5.5};});
 return {rows,taiex:dates.map((trade_date,i)=>({trade_date,close:20000+i*5+Math.sin(i/7)*70})),otc:dates.map((trade_date,i)=>({trade_date,close:240+i*.08+Math.sin(i/7)}))};
}
module.exports={fixture};
