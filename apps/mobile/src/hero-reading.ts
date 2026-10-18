// Same public reading rules as the website dailyResearchDeck; parity-tested against its source.
const valid=(n:any)=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n));
const fmt=(n:any,d=1)=>(Number(n)>0?'+':'')+Number(n).toFixed(d);
const sign=(n:any)=>!valid(n)||Math.abs(Number(n))<.0001?0:Number(n)>0?1:-1;
export function researchReading(s:any){
      if(!s||!valid(s.chg)||!valid(s.upRatio))return null;
      let trend=0,breadth=0,funds=0,support:string[]=[],counter:string[]=[],dataCount=0;
      const add=(bucket:number,score:number,text:string)=>{if(!score)return bucket;dataCount++;(score>0?support:counter).push(text);return bucket+score;};
      trend=add(trend,s.chg>=.7?2:s.chg>=.2?1:s.chg<=-.7?-2:s.chg<=-.2?-1:0,'大盤當日 '+fmt(s.chg,2)+'%');
      if(valid(s.ret5))trend=add(trend,s.ret5>=2?2:s.ret5>=.5?1:s.ret5<=-2?-2:s.ret5<=-.5?-1:0,'五日報酬 '+fmt(s.ret5,2)+'%');
      if(valid(s.close)&&valid(s.ma20))trend=add(trend,s.close>s.ma20?1:-1,'指數'+(s.close>s.ma20?'站上':'跌破')+'月線');
      if(valid(s.ma5)&&valid(s.ma20))trend=add(trend,s.ma5>s.ma20?1:-1,'短均線'+(s.ma5>s.ma20?'領先':'落後')+'月線');
      breadth=add(breadth,s.upRatio>=65?2:s.upRatio>=55?1:s.upRatio<=35?-2:s.upRatio<45?-1:0,'上漲家數占比 '+Math.round(s.upRatio)+'%');
      breadth=add(breadth,s.breadthDiff>=20?1:s.breadthDiff<=-20?-1:0,'廣度差 '+fmt(s.breadthDiff,1)+' pp');
      const fs=valid(s.instStrength)?s.instStrength:(valid(s.instYi)?s.instYi/200:null);
      if(valid(fs))funds=add(funds,fs>=1.5?2:fs>=.4?1:fs<=-1.5?-2:fs<=-.4?-1:0,valid(s.instStrength)?'法人當日強度 '+fmt(s.instStrength,2)+'%':'法人當日買賣超 '+fmt(s.instYi,1)+' 億');
      if(valid(s.inst3Strength))funds=add(funds,s.inst3Strength>=.25?1:s.inst3Strength<=-.25?-1:0,'法人三日強度 '+fmt(s.inst3Strength,2)+'%');
      if(valid(s.inst5Strength))funds=add(funds,s.inst5Strength>=.2?1:s.inst5Strength<=-.2?-1:0,'法人五日強度 '+fmt(s.inst5Strength,2)+'%');
      const marketScore=trend+breadth,market=marketScore>=6?'強勢多頭':marketScore>=3?'偏多擴張':marketScore<=-6?'明顯空方':marketScore<=-3?'偏空收縮':'區間整理';
      const fundState=funds>=3?'強力流入':funds>=1?'溫和流入':funds<=-3?'強力流出':funds<=-1?'溫和流出':'資金中性';
      const divergence=sign(trend)&&sign(breadth)&&sign(trend)!==sign(breadth);
      const fundConflict=sign(s.instStrength)&&((sign(s.inst3Strength)&&sign(s.instStrength)!==sign(s.inst3Strength))||(sign(s.inst5Strength)&&sign(s.instStrength)!==sign(s.inst5Strength)));
      let leverage='槓桿穩定';
      if(valid(s.leverage)){if(s.leverage>2)leverage=valid(s.ret5)&&s.ret5<0?'弱勢加碼':'槓桿升溫';else if(s.leverage<-2)leverage='去槓桿';}
      const volume=!valid(s.volumeRatio)?'量能待確認':s.volumeRatio>=1.25?'明顯放量':s.volumeRatio<=.75?'量能收縮':'量能平穩';
      const first=market==='強勢多頭'?'多方結構持續擴張':market==='偏多擴張'?'指數結構偏多':market==='明顯空方'?'空方結構持續擴散':market==='偏空收縮'?'市場結構轉弱':'指數仍在整理';
      let second='等待有效方向確認';
      if(fundConflict)second=sign(s.instStrength)<0?'法人短線賣壓與波段流入分歧':'法人短線買盤與波段流出分歧';
      else if(fundState==='強力流入')second='法人買盤率先升高';
      else if(fundState==='強力流出')second='法人賣壓率先升高';
      else if(divergence)second='指數與市場廣度出現分歧';
      else if(leverage==='弱勢加碼')second='弱勢融資仍在增加';
      else if(leverage==='槓桿升溫')second='追價槓桿正在升溫';
      else if(fundState==='溫和流入')second='資金溫和回流';
      else if(fundState==='溫和流出')second='資金動能轉弱';
      const axes=[sign(trend),sign(breadth),sign(funds)].filter(Boolean),same=axes.length?Math.max(axes.filter(x=>x>0).length,axes.filter(x=>x<0).length):0;
      const confidence=(dataCount>=5&&axes.length>=3&&same===axes.length)?'高':(dataCount>=3&&same>=2)?'中':'低';
      const supports=support.slice(0,4),warnings=counter.slice(0,4);
      if(trend>0)supports.push('趨勢綜合 '+trend+' 分');else if(trend<0)warnings.push('趨勢綜合 '+trend+' 分');
      if(breadth>0)supports.push('廣度綜合 '+breadth+' 分');else if(breadth<0)warnings.push('廣度綜合 '+breadth+' 分');
      if(funds>0)supports.push('資金綜合 '+funds+' 分');else if(funds<0)warnings.push('資金綜合 '+funds+' 分');
      if(divergence)warnings.push('指數與廣度不同步');
      if(fundConflict)warnings.push('法人當日與3／5日方向不同步');
      if(/升溫|弱勢/.test(leverage))warnings.push(leverage);
      if(volume==='明顯放量')supports.push('量能提供確認');else if(volume==='量能收縮')warnings.push('量能尚未確認');
      if(!supports.length)supports.push('目前沒有足夠的同向強勢證據');
      if(!warnings.length)warnings.push('未出現明顯反向訊號');
      return {market,fundState,leverage,volume,confidence,first,second,supports,warnings,headline:first+'，'+second+'。',trend,breadth,funds};
    }
