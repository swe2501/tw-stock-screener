/* Editable, explicit OHLC patterns expressed in the existing interpreted formula language.
 * These are site-defined research conditions, not promises of trend reversal or performance.
 * No new rule type or engine version: saved formulas remain executable by existing clients.
 */
(() => {
 'use strict';
 const patterns={
  'body-bull':{name:'長紅 K',direction:'long',hint:'收盤高於開盤，實體漲幅及實體占整根 K 棒的比例都達到門檻。',code:'param 最低實體漲幅 = 3\nparam 最低實體占比 = 60\n全幅 = MAX(high - low, 0.000001)\nclose > open AND (close - open) / open * 100 >= 最低實體漲幅 AND (close - open) / 全幅 * 100 >= 最低實體占比'},
  'body-bear':{name:'長黑 K',direction:'short',hint:'收盤低於開盤，實體跌幅及實體占整根 K 棒的比例都達到門檻。',code:'param 最低實體跌幅 = 3\nparam 最低實體占比 = 60\n全幅 = MAX(high - low, 0.000001)\nclose < open AND (open - close) / open * 100 >= 最低實體跌幅 AND (open - close) / 全幅 * 100 >= 最低實體占比'},
  'lower-wick':{name:'長下影 K',direction:'long',hint:'下影線占全幅達到門檻，實體占比不超過上限；不以型態名稱推定一定反轉。',code:'param 最低下影占比 = 60\nparam 最大實體占比 = 30\n全幅 = MAX(high - low, 0.000001)\nhigh > low AND (MIN(open, close) - low) / 全幅 * 100 >= 最低下影占比 AND ABS(close - open) / 全幅 * 100 <= 最大實體占比'},
  'upper-wick':{name:'長上影 K',direction:'short',hint:'上影線占全幅達到門檻，實體占比不超過上限；不以型態名稱推定一定反轉。',code:'param 最低上影占比 = 60\nparam 最大實體占比 = 30\n全幅 = MAX(high - low, 0.000001)\nhigh > low AND (high - MAX(open, close)) / 全幅 * 100 >= 最低上影占比 AND ABS(close - open) / 全幅 * 100 <= 最大實體占比'},
  'bull-engulf':{name:'紅 K 吞噬黑 K',direction:'long',hint:'前一根收黑，當根收紅；當根實體包住前根實體。比較實體，不要求影線也被包住。',code:'param 最低實體倍數 = 1\n前開 = REF(open, 1)\n前收 = REF(close, 1)\n前收 < 前開 AND close > open AND open <= 前收 AND close >= 前開 AND close - open >= (前開 - 前收) * 最低實體倍數'},
  'bear-engulf':{name:'黑 K 吞噬紅 K',direction:'short',hint:'前一根收紅，當根收黑；當根實體包住前根實體。比較實體，不要求影線也被包住。',code:'param 最低實體倍數 = 1\n前開 = REF(open, 1)\n前收 = REF(close, 1)\n前收 > 前開 AND close < open AND open >= 前收 AND close <= 前開 AND open - close >= (前收 - 前開) * 最低實體倍數'},
  'doji':{name:'十字 K',hint:'實體占全幅不超過設定比例；零振幅不算。十字 K 本身不代表多空，沿用你選的方向。',code:'param 最大實體占比 = 10\n全幅 = MAX(high - low, 0.000001)\nhigh > low AND ABS(close - open) / 全幅 * 100 <= 最大實體占比'}
 };
 function make(key,direction='long'){
  const E=window.AcademyStrategyEngine,p=patterns[key];
  if(!p&&key!=='volume-up'&&key!=='volume-down')return null;
  const s=E.template();s.direction=p?.direction||direction;s.name=p?p.name+'研究範例':key==='volume-up'?'放量確認範例':'量縮確認範例';
  s.entry=p?[{...E.rule('formula'),code:p.code,patternKey:key}]:[{...E.rule('volume',key==='volume-up'?'above':'below'),value:key==='volume-up'?1.5:.7}];
  s.exit=[E.rule('ma',s.direction==='short'?'above':'below')];E.validate(s);return s;
 }
 const options='<optgroup label="K 棒型態">'+Object.entries(patterns).map(([key,p])=>'<option value="'+key+'">'+p.name+'</option>').join('')+'</optgroup><optgroup label="成交量"><option value="volume-up">放量確認</option><option value="volume-down">量縮確認</option></optgroup>';
 function identify(r){return r?.type==='formula'?Object.entries(patterns).find(([,p])=>p.code===r.code)?.[0]:null;}
 function validate(strategy){for(const r of [...strategy.entry,...strategy.exit]){if(!identify(r))continue;const program=window.AcademyStrategyEngine.formula.compile(r.code,r.params||{});for(const p of program.parameters)if(p.value<0||p.value>100)throw Error(p.name+'請填寫 0～100，比例以百分比表示。');}return true;}
 window.AcademyStrategyPresets={make,patterns,options,identify,validate};
})();
