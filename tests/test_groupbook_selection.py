import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from enrich_groupbook_selection import financial_review,build_review,monthly_review,operating_review
from groupbook_selection import group_context,valid_review


class SelectionResearchTests(unittest.TestCase):
    def captures(self):
        return [dict(period="2025Q4",source_url="https://example.com/annual",sha256="a"*64,
                     rows={"2330":{"營業收入":"100,000","營業利益（損失）":"-10,000","稅前淨利（淨損）":"20,000","基本每股盈餘（元）":"0"}}),
                dict(period="2024Q4",source_url="https://example.com/prior",sha256="b"*64,
                     rows={"2330":{"營業收入":"80,000","營業利益（損失）":"8,000","基本每股盈餘（元）":"1"}})]

    def announcement(self,date="2026-03-10"):
        return {"2330":[dict(title="董事會通過114年度合併財務報告",published_on=date,source_url="https://example.com/approval")]}

    def test_later_approval_and_unpublished_reports_cannot_enter_historical_quarter(self):
        self.assertIsNone(financial_review("2330","2026Q1",self.captures(),self.announcement("2026-04-01")))
        self.assertIsNone(financial_review("2330","2026Q1",self.captures(),{}))

    def test_annual_basis_zero_eps_and_operating_loss_survive_comparison(self):
        f=financial_review("2330","2026Q1",self.captures(),self.announcement())
        self.assertEqual(f["basis"],"year_to_date")
        self.assertIn("2025全年",f["text"])
        self.assertIn("0.00元",f["text"])
        self.assertTrue(any("營業虧損" in s for s in f["risks"]))
        self.assertTrue(any("業外" in s for s in f["risks"]))

    def test_dividend_and_profit_growth_never_prove_order_catalyst(self):
        f=financial_review("2330","2026Q1",self.captures(),self.announcement())
        r=build_review("2330","2026Q1",dict(event_kind="distribution",review_type="announcement_event_research",published_on="2026-03-01"),f,None)
        self.assertEqual(r["status"],"commercial_catalyst_unconfirmed")
        self.assertTrue(valid_review(r,"2330","2026Q1"))
        broken=copy.deepcopy(r);broken["financial"]["published_on"]="2026-04-01"
        self.assertFalse(valid_review(broken,"2330","2026Q1"))

    def test_group_membership_and_similar_name_are_not_ownership_or_document_selection(self):
        g=dict(name="A",focus="華新科：高階元件。")
        context=group_context(g,dict(code="1605",name="華新",relation="集團核心成員"))
        self.assertFalse(context["document_selected"])
        self.assertFalse(context["ownership_verified"])
        self.assertTrue(group_context(g,dict(code="2492",name="華新科"))["document_selected"])

    def test_monthly_notes_are_retrospective_and_never_include_current_unfinished_month(self):
        capture=dict(period="2026-03",source_url="https://example.com/month",sha256="a"*64,
                     rows={"2330":dict(revenue_thousands="100",yoy="-20",note="客戶需求減少")})
        self.assertEqual(monthly_review("2330","2026Q1",[capture]),[])
        capture["period"]="2026-02"
        m=monthly_review("2330","2026Q1",[capture])
        self.assertFalse(m[0]["publication_date_verified"])
        r=build_review("2330","2026Q1",dict(event_kind="distribution",published_on="2026-03-01"),None,None,m)
        self.assertEqual(r["status"],"historical_operating_context")
        self.assertTrue(any("年減20.00%" in s for s in r["counter_evidence"]))
        self.assertTrue(valid_review(r,"2330","2026Q1"))

    def test_staff_change_and_meeting_notice_are_not_product_progress(self):
        for title in ("本公司研發主管異動","本公司召開營運說明會"):
            self.assertIsNone(operating_review(dict(verified=True,event=dict(code="2330",title=title,published_on="2026-02-01")),"2026Q1"))

    def test_bank_rows_do_not_receive_manufacturing_margin(self):
        captures=self.captures();captures[0]["rows"]["2330"]={"利息淨收益":"500","基本每股盈餘（元）":"1"}
        f=financial_review("2330","2026Q1",captures,self.announcement())
        self.assertNotIn("營業利益率",f["text"])
        self.assertTrue(any("資本適足性" in s for s in f["risks"]))


if __name__=="__main__":unittest.main()
