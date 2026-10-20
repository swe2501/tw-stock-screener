import datetime
import math
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import chart_pattern_rules as rules


def candles(values):
    day=datetime.date(2026,1,1)
    return [dict(date=str(day+datetime.timedelta(days=i)),open=v,high=v+.2,low=v-.2,close=v,volume=1000) for i,v in enumerate(values)]


def finish(rows,close,volume=1500):
    result=[dict(r) for r in rows]
    result.append(dict(date=str(datetime.date.fromisoformat(rows[-1]['date'])+datetime.timedelta(days=1)),
                       open=close,high=close+.2,low=close-.2,close=close,volume=volume))
    return result


def anchors(points,n=60):
    values=[]
    for i in range(n):
        a,b=next((a,b) for a,b in zip(points,points[1:]) if a[0]<=i<=b[0])
        values.append(a[1]+(b[1]-a[1])*(i-a[0])/(b[0]-a[0]))
    return candles(values)


def channel(us,ls,n=40):
    rows=candles([110]*n)
    for i,r in enumerate(rows):
        wiggle=abs(i%6-2)*.5
        r['high']=120+us*i-wiggle;r['low']=100+ls*i+wiggle
        r['close']=r['open']=(r['high']+r['low'])/2
    return rows


class PatternTests(unittest.TestCase):
    def assert_signal(self,rows,kind,direction):
        signals=rules.evaluate(rows)
        self.assertTrue(any(s['type']==kind and s['direction']==direction for s in signals),(kind,signals))
        for s in signals:
            self.assertEqual(s['date'],rows[-1]['date'])
            self.assertEqual(s['rule_version'],rules.VERSION)
        return signals

    def test_double_bottom_top_and_volume_guard(self):
        w=anchors([(0,110),(20,100),(32,112),(45,101),(59,111)])
        rows=finish(w,114)
        before=self.assert_signal(rows,'w','up')
        self.assertFalse(any(s['type']=='w' for s in rules.evaluate(finish(w,114,1000))))
        self.assertFalse(any(s['type']=='w' for s in rules.evaluate(finish(w,111))))
        m=candles([220-r['close'] for r in w])
        self.assert_signal(finish(m,106),'m','down')
        # Later bars cannot alter what the detector knew at the confirmation date.
        extended=rows+candles([999]*10)
        self.assertEqual(rules.evaluate(extended,len(rows)-1),before)

    def test_head_shoulders_both_directions(self):
        top=anchors([(0,100),(12,108),(20,100),(28,117),(36,99),(44,109),(59,101)])
        self.assert_signal(finish(top,96),'head','down')
        bottom=candles([220-r['close'] for r in top])
        self.assert_signal(finish(bottom,124),'inverse-head','up')

    def test_wedges_and_triangles(self):
        for us,ls,kind,direction in [(-.25,-.05,'falling-wedge','up'),(.05,.25,'rising-wedge','down'),
            (-.15,.15,'triangle-up','up'),(-.15,.15,'triangle-down','down'),
            (0,.2,'ascending-triangle','up'),(-.2,0,'descending-triangle','down')]:
            with self.subTest(kind=kind):
                rows=channel(us,ls)
                boundary=120+us*40 if direction=='up' else 100+ls*40
                self.assert_signal(finish(rows,boundary*(1.02 if direction=='up' else .98)),kind,direction)

    def test_flag_requires_prior_impulse(self):
        rows=channel(-.1,-.1,20)
        # Strong preceding rise into a 20-day counter-trend parallel channel.
        prefix=candles([90+i*2 for i in range(10)])
        all_rows=prefix+rows
        for i,r in enumerate(all_rows):r['date']=str(datetime.date(2026,1,1)+datetime.timedelta(days=i))
        self.assert_signal(finish(all_rows,121),'flag','up')
        self.assertFalse(any(s['type']=='flag' for s in rules.evaluate(finish(rows,121))))

    def test_round_base_and_invalid_inputs(self):
        smooth=candles([100+10*((i-29.5)/29.5)**2 for i in range(60)])
        self.assert_signal(finish(smooth,112),'round','up')
        self.assertEqual(rules.evaluate(finish(candles([100]*60),100)),[])
        self.assertEqual(rules.evaluate(candles([100]*10)),[])
        for mutation in [lambda r:r.update(close=math.nan),lambda r:r.update(low=-1),lambda r:r.update(high=1),lambda r:r.update(volume=-1)]:
            rows=finish(smooth,112);mutation(rows[-1]);self.assertEqual(rules.evaluate(rows),[])
        rows=finish(smooth,112);rows[-1]['date']=rows[-2]['date'];self.assertEqual(rules.evaluate(rows),[])


if __name__=='__main__':unittest.main()
