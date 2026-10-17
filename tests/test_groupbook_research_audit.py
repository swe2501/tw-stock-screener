import datetime
import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/"scripts"))
from audit_groupbook_research import audit,valid_reason

class AuditTests(unittest.TestCase):
    def reason(self):
        return dict(text="官方事實。研究觀察：核對需求與成本。",source_urls=["https://example.com/source"],fact_period="2026Q1",published_on="2026-01-15",reviewed_on="2026-10-17")
    def test_rejects_later_information_for_historical_quarter(self):
        self.assertTrue(valid_reason(self.reason(),"2026Q1"))
        self.assertFalse(valid_reason(dict(self.reason(),published_on="2026-04-16"),"2026Q1"))
    def test_summary_or_missing_source_does_not_count(self):
        self.assertFalse(valid_reason(dict(self.reason(),text="營收年增10%"),"2026Q1"))
        self.assertFalse(valid_reason(dict(self.reason(),source_urls=[]),"2026Q1"))
    def test_missing_quarters_and_members_remain_in_denominator(self):
        groups=[dict(name="group",members=[dict(code="2330",name="A"),dict(code="9999",name="B")],quarterlyReasons={"2026Q1":{"2330":self.reason()}})]
        result=audit(groups,["2026Q1","2026Q2"])
        self.assertEqual(result["uniqueExpected"],4)
        self.assertEqual(result["uniqueCovered"],1)
        self.assertFalse(result["complete"])

if __name__=="__main__":unittest.main()
