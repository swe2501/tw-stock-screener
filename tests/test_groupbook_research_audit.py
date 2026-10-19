import datetime
import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/"scripts"))
from audit_groupbook_research import audit,valid_reason,valid_exclusion

class AuditTests(unittest.TestCase):
    def reason(self):
        return dict(text="官方事實。研究觀察：核對需求與成本。",source_urls=["https://example.com/source"],fact_period="2026Q1",published_on="2026-01-15",reviewed_on="2026-10-17")
    def test_rejects_later_information_for_historical_quarter(self):
        self.assertTrue(valid_reason(self.reason(),"2026Q1"))
        self.assertFalse(valid_reason(dict(self.reason(),published_on="2026-04-16"),"2026Q1"))
    def test_summary_or_missing_source_does_not_count(self):
        self.assertFalse(valid_reason(dict(self.reason(),text="營收年增10%"),"2026Q1"))
        self.assertFalse(valid_reason(dict(self.reason(),source_urls=[]),"2026Q1"))
    def test_financial_summary_never_counts_even_with_observation_words(self):
        self.assertFalse(valid_reason(dict(self.reason(),kind="official_revenue"),"2026Q1"))
    def test_event_requires_verified_evidence_and_truthful_background_label(self):
        reason=dict(self.reason(),review_type="announcement_event_research",quarter="2026Q1",source_verified=True,source_sha256="a"*64,event_title="資本支出公告",available_as_of="2026-03-31",is_background=False)
        self.assertTrue(valid_reason(reason,"2026Q1"))
        self.assertFalse(valid_reason(dict(reason,source_verified=False),"2026Q1"))
        self.assertFalse(valid_reason(dict(reason,published_on="2025-12-01"),"2026Q1"))
        self.assertTrue(valid_reason(dict(reason,published_on="2025-12-01",is_background=True,text=reason["text"]+"歷史公告背景"),"2026Q1"))
    def test_pre_incorporation_exclusion_is_resolved_but_not_a_reason(self):
        reason=dict(text="該季公司尚未設立，不適用。",status="not_applicable",exclusion_basis="not_yet_incorporated",applicable_from="2026-09-03",published_on="2026-09-03",reviewed_on="2026-10-17",source_urls=["https://example.com/incorporation"])
        self.assertTrue(valid_exclusion(reason,"2026Q2"))
        self.assertFalse(valid_exclusion(reason,"2026Q3"))
        self.assertFalse(valid_reason(reason,"2026Q2"))
        result=audit([dict(name="new company",members=[dict(code="3718",name="A")],quarterlyReasons={"2026Q2":{"3718":reason}})],["2026Q2"])
        self.assertEqual((result["uniqueExpected"],result["uniqueCovered"],result["uniqueNotApplicable"],result["uniqueResolved"]),(1,0,1,1))
        self.assertTrue(result["complete"])
    def test_missing_quarters_and_members_remain_in_denominator(self):
        groups=[dict(name="group",members=[dict(code="2330",name="A"),dict(code="9999",name="B")],quarterlyReasons={"2026Q1":{"2330":self.reason()}})]
        result=audit(groups,["2026Q1","2026Q2"])
        self.assertEqual(result["uniqueExpected"],4)
        self.assertEqual(result["uniqueCovered"],1)
        self.assertFalse(result["complete"])

if __name__=="__main__":unittest.main()
