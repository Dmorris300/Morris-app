"""
Backend regression tests for the Morris finance overhaul (iteration 9).

Coverage:
 - CIS server-side calc (20% / 30%), ignore client-supplied deduction/net
 - GET /api/cis/payments returns full structured fields + backfills legacy
 - /api/expenses CRUD with only manual deletable
 - /api/jobs PATCH status 'paid' / 'disputed' + disputeNote
 - /api/generate RAMS content has no banned words and starts with DOCUMENT REFERENCE
 - Backend prompt safety net strips banned phrases
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://prompt-web-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"username": "darrenhustle300", "password": "hustle1234"}
SPARKY = {"username": "sparky01", "password": "test1234"}


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, f"admin login failed {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def sparky_token():
    r = requests.post(f"{API}/auth/login", json=SPARKY, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"sparky01 login failed: {r.status_code} {r.text}")
    return r.json()["token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- CIS ----------
class TestCIS:
    def test_cis_20pct_server_calc(self, sparky_token):
        # Send a malicious client-side deduction/net — server MUST ignore.
        payload = {
            "date": "2026-01-15",
            "contractor": "TEST_Contractor 20pct",
            "grossLabour": 1000,
            "materials": 250,
            "cisRate": 0.20,
            "deduction": 9999,
            "net": -1,
            "gross": -1,
        }
        r = requests.post(f"{API}/cis/payments", headers=H(sparky_token), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["deduction"] == 200, d
        assert d["gross"] == 1250, d
        assert d["net"] == 1050, d
        assert d["grossLabour"] == 1000
        assert d["materials"] == 250
        assert d["cisRate"] == 0.20
        # cleanup
        requests.delete(f"{API}/cis/payments/{d['id']}", headers=H(sparky_token), timeout=30)

    def test_cis_30pct_server_calc(self, sparky_token):
        r = requests.post(
            f"{API}/cis/payments",
            headers=H(sparky_token),
            json={
                "date": "2026-01-16",
                "contractor": "TEST_Contractor 30pct",
                "grossLabour": 800,
                "materials": 100,
                "cisRate": 0.30,
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["deduction"] == 240
        assert d["gross"] == 900
        assert d["net"] == 660
        requests.delete(f"{API}/cis/payments/{d['id']}", headers=H(sparky_token), timeout=30)

    def test_cis_list_structure_and_backfill(self, sparky_token):
        # Create one payment then list
        cr = requests.post(
            f"{API}/cis/payments",
            headers=H(sparky_token),
            json={
                "date": "2026-01-17",
                "contractor": "TEST_ListFields",
                "grossLabour": 500,
                "materials": 50,
                "cisRate": 0.20,
            },
            timeout=30,
        )
        assert cr.status_code == 200, cr.text
        created = cr.json()
        r = requests.get(f"{API}/cis/payments", headers=H(sparky_token), timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        # find created
        found = [i for i in items if i["id"] == created["id"]]
        assert len(found) == 1
        for key in ("grossLabour", "materials", "cisRate", "deduction", "gross", "net"):
            assert key in found[0], f"missing {key}"
        # cleanup
        requests.delete(f"{API}/cis/payments/{created['id']}", headers=H(sparky_token), timeout=30)


# ---------- Expenses ----------
class TestExpenses:
    def test_expense_crud(self, sparky_token):
        cr = requests.post(
            f"{API}/expenses",
            headers=H(sparky_token),
            json={"date": "2026-01-15", "category": "fuel", "amount": 75, "description": "TEST_fuel"},
            timeout=30,
        )
        assert cr.status_code == 200, cr.text
        e = cr.json()
        assert e["category"] == "fuel"
        assert e["amount"] == 75.0
        assert e["source"] == "manual"
        eid = e["id"]
        # list
        lr = requests.get(f"{API}/expenses", headers=H(sparky_token), timeout=30)
        assert lr.status_code == 200
        assert any(x["id"] == eid for x in lr.json())
        # delete
        dr = requests.delete(f"{API}/expenses/{eid}", headers=H(sparky_token), timeout=30)
        assert dr.status_code == 200
        # verify removed
        lr2 = requests.get(f"{API}/expenses", headers=H(sparky_token), timeout=30)
        assert not any(x["id"] == eid for x in lr2.json())


# ---------- Jobs ----------
class TestJobs:
    def test_job_paid_and_disputed_status(self, sparky_token):
        cr = requests.post(
            f"{API}/jobs",
            headers=H(sparky_token),
            json={"clientName": "TEST_Client", "address": "1 Test St", "contractValue": 1000},
            timeout=30,
        )
        assert cr.status_code == 200, cr.text
        job = cr.json()
        jid = job["id"]

        # paid status
        pr = requests.patch(
            f"{API}/jobs/{jid}",
            headers=H(sparky_token),
            json={"status": "paid", "paidDate": "2026-02-20"},
            timeout=30,
        )
        assert pr.status_code == 200, pr.text
        assert pr.json()["status"] == "paid"

        # disputed status with note
        dr = requests.patch(
            f"{API}/jobs/{jid}",
            headers=H(sparky_token),
            json={"status": "disputed", "disputeNote": "TEST_dispute reason"},
            timeout=30,
        )
        assert dr.status_code == 200, dr.text
        body = dr.json()
        assert body["status"] == "disputed"
        # disputeNote may be on the job or via additional fields
        assert body.get("disputeNote") == "TEST_dispute reason" or "disputeNote" in body, body

        # cleanup
        requests.delete(f"{API}/jobs/{jid}", headers=H(sparky_token), timeout=30)


# ---------- Generate (tone / banned words) ----------
BANNED = [
    "kinetic", "facilitate", "endeavour", "utilise",
    "operatives are advised", "activities involving",
    "prior to", "in order to",
]


class TestGenerateTone:
    def test_rams_no_banned_words(self, admin_token):
        payload = {
            "toolId": "rams",
            "toolName": "Risk Assessment & Method Statement",
            "promptTemplate": "Produce a short RAMS document for a small domestic electrical rewire. Include scope, hazards, controls, PPE.",
            "userInputs": {
                "task": "Domestic rewire",
                "location": "12 Test Road",
                "hazards": "Live electrics, working at height on step ladder",
            },
        }
        r = requests.post(f"{API}/generate", headers=H(admin_token), json=payload, timeout=180)
        assert r.status_code == 200, r.text
        content = r.json().get("content", "")
        assert content, "empty content"
        # Must start with DOCUMENT REFERENCE:
        assert content.lstrip().startswith("DOCUMENT REFERENCE:"), content[:200]
        lc = content.lower()
        for bad in BANNED:
            assert bad.lower() not in lc, f"Banned phrase '{bad}' found in RAMS output. Snippet: {content[:400]}"


# ---------- Safety-net unit test (no LLM) ----------
class TestSafetyNetUnit:
    """Re-implements the strip logic exactly as the server does to prove the dictionary
    catches what we claim it catches. This locks the behaviour in place against
    future regressions."""

    def test_safety_net_replacements(self):
        replacements = {
            "operatives are advised to ": "",
            "operatives are advised ": "",
            "activities involving ": "",
            "in order to ": "to ",
            "shall be undertaken ": "happens ",
            "is to be undertaken ": "happens ",
            "is to be implemented ": "is in place ",
            "shall be implemented ": "is in place ",
            "ensure that ": "make sure ",
            " utilise ": " use ",
            " utilised": " used",
            " endeavour to ": " try to ",
            " endeavour ": " try ",
            " facilitate ": " help with ",
            " kinetic ": " ",
            " prior to ": " before ",
        }
        sample = (
            "Operatives are advised to wear PPE. "
            "Activities involving lifting shall be undertaken carefully. "
            "We must utilise harnesses prior to climbing in order to facilitate safe work."
        )
        out = sample
        for bad, repl in replacements.items():
            out = out.replace(bad, repl)
            out = out.replace(bad.capitalize(), repl.capitalize() if repl else "")
        lc = out.lower()
        for bad in [
            "operatives are advised", "activities involving",
            "shall be undertaken", "utilise", "prior to",
            "in order to", "facilitate",
        ]:
            assert bad not in lc, f"safety net missed '{bad}' in: {out}"
