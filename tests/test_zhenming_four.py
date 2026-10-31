import ast, math, unittest, copy
from pathlib import Path
from datetime import date, timedelta
scope={'math':math}
tree=ast.parse((Path(__file__).parents[1]/'api/screen.py').read_text(encoding='utf-8'))
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='zhenming4_at'],type_ignores=[]),'rules','exec'),scope)
rule=scope['zhenming4_at']
def fixture(count=2):
 bars=[['2026-01-%02d'%(i+1),100,101,99,100,100] for i in range(10)]
 bars += [['2026-01-11',100,105,99,104,200]]
 for i in range(1,count):bars.append(['2026-01-%02d'%(11+i),105,106,103,104,200+i*100])
 bars.append(['2026-01-%02d'%(11+count),105,107,104,106,150])
 return bars
class Four(unittest.TestCase):
 def test_black_later_bar_and_first_shrink(self):
  r=rule(fixture());self.assertEqual(r['rolling_bars'],2);self.assertEqual(r['day_n'],1);self.assertEqual(r['support_low'],103)
 def test_two_or_three_not_four(self):
  self.assertIsNotNone(rule(fixture(3)));self.assertIsNone(rule(fixture(4)));self.assertIsNone(rule(fixture(1)))
 def test_first_red_threshold_no_upper_cap(self):
  b=fixture();b[10][1]=101.5;self.assertIsNone(rule(b))
  b=fixture();b[10][1]=96;b[10][3]=95;self.assertIsNotNone(rule(b))
  b=fixture();b[10][1]=100.88;self.assertIsNotNone(rule(b))
  b=fixture();b[10][1]=104.5;self.assertIsNone(rule(b))
 def test_support_and_ma_both_required_with_reentry(self):
  b=fixture();b.append(['2026-01-14',106,108,102,107,120]);self.assertIsNone(rule(b))
  b.append(['2026-01-15',108,110,107,109,110]);r=rule(b);self.assertEqual(r['day_n'],3);self.assertEqual(r['anchor_date'],'2026-01-12')
  b=fixture();b[-1]=['2026-01-13',105,107,103,106,150];self.assertIsNotNone(rule(b))
  b[-1][4]=130;b[-1][2]=131;self.assertIsNone(rule(b))
 def test_day_twelve_included_thirteen_excluded(self):
  b=fixture()
  for age in range(2,14):
   c=106+age*2;b.append(['2026-02-%02d'%age,c-.5,c+1,c-1,c,150-age])
   self.assertEqual(rule(b) is not None,age<=12)
 def test_no_lookahead_or_stale_anchor_reset(self):
  b=fixture();t=len(b)-1;r=rule(b,t);b.append(['future',1,2,.5,1,999]);self.assertEqual(rule(b,t),r)
 def test_missing_nan_and_equal_volume_fail_closed(self):
  for value in (None,float('nan'),float('inf'),0):
   b=fixture();b[-1][3]=value;self.assertIsNone(rule(b))
  b=fixture();b[-1][5]=300;self.assertIsNone(rule(b))
if __name__=='__main__':unittest.main()
