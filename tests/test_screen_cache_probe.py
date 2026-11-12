"""暫時診斷 probe（卡片 t207s782）：只在 diag_probe=1 且 by-job_id 0 列時做 1 次唯讀 SELECT，只印筆數／UUID／created_at。"""
import io, json, unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit
from tests.test_screen_cache_diag_log import load, SERVICE_JWT, Response, http, RESULT

UID = "3f2a9c1e-1111-4222-8333-444455556666"
TS = "2026-11-12T09:40:01.123456+00:00"


class Backend:
    def __init__(self):
        self.calls = []

    def __call__(self, req, timeout=None):
        q = parse_qs(urlsplit(req.full_url).query); self.calls.append((req.get_method(), q))
        if "job_id" in q:
            return Response([], 200)
        return Response([{"job_id": UID, "created_at": TS}, {"job_id": "member-secret-sentinel", "created_at": "x"}], 200)


class Probe(unittest.TestCase):
    def run_get(self, query):
        m, be, out = load(SERVICE_JWT), Backend(), io.StringIO()
        with patch.object(m.urllib.request, "urlopen", side_effect=be), patch.object(m._CACHE_DIAG.handlers[0], "stream", out):
            res = http(m, "GET", query=query)
        return res, be.calls, out.getvalue()

    def test_no_probe_without_flag(self):
        res, calls, log = self.run_get("?job_id=" + UID)
        self.assertEqual(res, (200, {"pending": True})); self.assertEqual(len(calls), 1); self.assertNotIn("probe", log)

    def test_probe_once_read_only(self):
        res, calls, log = self.run_get("?job_id=" + UID + "&diag_probe=1")
        self.assertEqual(res, (200, {"pending": True}))
        self.assertEqual([c[0] for c in calls], ["GET", "GET"])
        self.assertEqual(calls[1][1], {"select": ["job_id,created_at"], "order": ["created_at.desc"], "limit": ["5"]})
        line = [l for l in log.splitlines() if "probe" in l][0]
        self.assertEqual(line, f"[screen_cache] probe recent status=200 rows=2 ids={UID},non-uuid created_at={TS},bad-ts key=service")
        self.assertNotIn("member-secret-sentinel", log); self.assertNotIn(SERVICE_JWT, log); self.assertNotIn("result", line)


if __name__ == "__main__":
    unittest.main()
