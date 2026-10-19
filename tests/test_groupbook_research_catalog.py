import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/"scripts"))
from groupbook_research_catalog import load_groups

class ResearchCatalogTests(unittest.TestCase):
    def fixture(self,root,data):
        root=Path(root);(root/"data").mkdir()
        groups=[dict(name="A",members=[dict(code="2330",name="台積電")],quarterlyReasons={"2026Q1":{"2330":{"text":"separately reviewed"}}}),dict(name="B",members=[dict(code="2330",name="台積電")])]
        (root/"group-catalog.json").write_text(json.dumps(dict(groups=groups)),encoding="utf-8")
        (root/"data"/"groupbook-quarterly-research.json").write_text(json.dumps(data),encoding="utf-8")
    def data(self):
        return dict(schemaVersion=1,complete=True,quarters={"2026Q1":{"2330":dict(code="2330",quarter="2026Q1",text="event research")}})
    def test_shared_stock_joins_both_groups_and_preserves_separate_review(self):
        with tempfile.TemporaryDirectory() as root:
            self.fixture(root,self.data());a,b=load_groups(root)
            self.assertEqual(a["quarterlyReasons"]["2026Q1"]["2330"]["text"],"separately reviewed")
            self.assertEqual(b["quarterlyReasons"]["2026Q1"]["2330"]["text"],"event research")
            b["quarterlyReasons"]["2026Q1"]["2330"]["text"]="changed"
            self.assertEqual(a["quarterlyReasons"]["2026Q1"]["2330"]["text"],"separately reviewed")
    def test_missing_dataset_cannot_silently_publish_only_legacy_notes(self):
        with tempfile.TemporaryDirectory() as root:
            Path(root,"group-catalog.json").write_text(json.dumps(dict(groups=[])),encoding="utf-8")
            with self.assertRaises(ValueError):load_groups(root)
    def test_draft_and_wrong_quarter_cannot_be_published(self):
        for mode in ("draft","wrong_quarter","unknown_code"):
            data=self.data()
            if mode=="draft":data["complete"]=False
            elif mode=="wrong_quarter":data["quarters"]["2026Q1"]["2330"]["quarter"]="2026Q2"
            else:data["quarters"]["2026Q1"]["FAKE"]=dict(code="FAKE",quarter="2026Q1")
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as root:
                self.fixture(root,data)
                with self.assertRaises(ValueError):load_groups(root)

if __name__=="__main__":unittest.main()
