import ast, math, unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
scope=dict(math=math,datetime=datetime,timezone=timezone,timedelta=timedelta)
tree=ast.parse((Path(__file__).parents[1]/'api/screen.py').read_text(encoding='utf-8'))
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('hidden_options','hidden_compare')],type_ignores=[]),'rules','exec'),scope)
options,compare=scope['hidden_options'],scope['hidden_compare']
class Rules(unittest.TestCase):
 def setUp(self):
  self.dates=[(datetime(2024,1,1)+timedelta(days=i)).strftime('%Y-%m-%d') for i in range(400)]
  self.up=[dict(trade_date=d,close=100+i) for i,d in enumerate(self.dates)]
  self.down=[dict(trade_date=d,close=600-i) for i,d in enumerate(self.dates)]
  self.flat=[dict(trade_date=d,close=100) for d in self.dates]
 def rule(self,side='strong',metrics=['ma','return'],**extra):return options(dict(enabled=True,side=side,metrics=metrics,days=20,**extra))
 def test_both_directions(self):
  self.assertTrue(compare(self.up,self.down,self.rule(),self.dates[-1])['matched'])
  self.assertTrue(compare(self.down,self.up,self.rule('weak'),self.dates[-1])['matched'])
  self.assertFalse(compare(self.up,self.down,self.rule('weak'),self.dates[-1])['matched'])
 def test_metrics_are_independent_and_combined_with_and(self):
  self.assertTrue(compare(self.up,self.flat,self.rule(metrics=['return']),self.dates[-1])['matched'])
  self.assertFalse(compare(self.up,self.flat,self.rule(metrics=['ma']),self.dates[-1])['matched'])
  self.assertFalse(compare(self.up,self.flat,self.rule(),self.dates[-1])['matched'])
 def test_equal_missing_and_warmup(self):
  self.assertFalse(compare(self.up,self.up,self.rule(),self.dates[-1])['matched'])
  self.assertIsNone(compare(self.up[:-2]+self.up[-1:],self.down,self.rule(),self.dates[-1]))
  self.assertIsNone(compare(self.up[-50:],self.down,self.rule(),self.dates[-1]))
  self.assertIsNotNone(compare(self.up[-50:],self.down,self.rule(metrics=['return']),self.dates[-1]))
 def test_period_and_no_lookahead(self):
  r=compare(self.up,self.down,self.rule(),self.dates[350]);self.assertEqual(r['days'],20);self.assertEqual(r['base_date'],self.dates[330]);self.assertEqual(r['end'],self.dates[350])
  self.assertAlmostEqual(r['stock_return'],(450/430-1)*100,places=4)
  dated=options(dict(enabled=True,side='strong',metrics=['return'],mode='dates',start=self.dates[340],end=self.dates[350]))
  self.assertEqual(compare(self.up,self.down,dated,self.dates[350])['days'],11)
 def test_validation(self):
  for value in [dict(side='both',metrics=['ma']),dict(side='strong',metrics=[]),dict(side='strong',metrics=['ma'],days=0),dict(side='strong',metrics=['ma'],days=761),dict(side='strong',metrics=['ma'],days=1.5)]:
   with self.assertRaises(ValueError):options(dict(enabled=True,**value))
  self.assertIsNone(options(None))
if __name__=='__main__':unittest.main()
