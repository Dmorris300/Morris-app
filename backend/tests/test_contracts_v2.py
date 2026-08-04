"""Contract Management V2 (flagship) — backend tests.

Covers all endpoints in /api/contracts/* plus cross-user isolation, live status
derivation, global search integration, command centre attention items, and
regression on the other V2 flagship tools (purchase-orders, invoice-builder,
applications-for-payment, variation-orders).
"""

import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

def _load_backend_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        try:
            with open("/app/frontend/.env") as fh:
                for line in fh:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert url, "REACT_APP_BACKEND_URL is not set"
    return url.rstrip("/")


BASE_URL = _load_backend_url()

ADMIN_USER = "darrenhustle300"
ADMIN_PASS = "hustle1234"


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _iso_plus(days: int) -> str:
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


# ---------------- Fixtures ----------------

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def second_user_headers():
    """Sign up an isolated second user so we can verify cross-user isolation."""
    uname = f"contractisouser{uuid.uuid4().hex[:8]}"
    email = f"{uname}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/signup", json={
        "username": uname, "email": email, "password": "Password123!", "phone": "+441234567890",
    }, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"could not create isolation user: {r.status_code} {r.text}")
    data = r.json()
    otp = data.get("otp") or data.get("demoOtp") or data.get("demoCode")
    if otp:
        requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "username": uname, "otp": str(otp)
        }, timeout=30)
    lr = requests.post(f"{BASE_URL}/api/auth/login", json={"username": uname, "password": "Password123!"}, timeout=30)
    if lr.status_code != 200:
        pytest.skip(f"second user cannot log in: {lr.status_code} {lr.text}")
    return {"Authorization": f"Bearer {lr.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_ids():
    return {"contracts": [], "templates": []}


# ---------------- Reference ----------------

class TestReference:
    def test_reference_returns_all_lists(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/contracts/reference", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert len(d["statuses"]) == 7
        assert len(d["types"]) == 19
        assert isinstance(d["milestoneStatuses"], list) and len(d["milestoneStatuses"]) >= 3
        assert len(d["noticeTypes"]) == 14
        assert isinstance(d["noticeStatuses"], list) and "Actioned" in d["noticeStatuses"]
        assert isinstance(d["paymentTerms"], list) and len(d["paymentTerms"]) >= 3


# ---------------- CRUD ----------------

class TestContractCRUD:
    def test_create_requires_project(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/contracts/contracts", headers=admin_headers,
                          json={"title": "No project"}, timeout=30)
        assert r.status_code == 400

    def test_create_requires_title_or_employer(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/contracts/contracts", headers=admin_headers,
                          json={"projectName": "P", "title": "", "employerName": "", "employerCompany": ""}, timeout=30)
        assert r.status_code == 400

    def test_create_contract_auto_ref(self, admin_headers, created_ids):
        payload = {
            "projectName": "TEST_Project_Alpha",
            "projectId": "TEST_PROJ_ALPHA",
            "title": "TEST_Contract Alpha",
            "contractType": "JCT Minor Works",
            "employerName": "Alpha Employer",
            "contractValue": 125000,
            "completionDate": _iso_plus(90),
        }
        r = requests.post(f"{BASE_URL}/api/contracts/contracts", headers=admin_headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["contractRef"].startswith("CON-") and len(d["contractRef"].split("-")[-1]) == 4
        assert d["title"] == payload["title"]
        assert d["status"] == "Draft"
        assert d["liveStatus"] == "Draft"
        assert isinstance(d.get("history"), list) and d["history"][0]["kind"] == "created"
        assert d.get("createdAt") and d.get("updatedAt")
        created_ids["contracts"].append(d["id"])

    def test_list_contains_created_with_live_fields(self, admin_headers, created_ids):
        r = requests.get(f"{BASE_URL}/api/contracts/contracts", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert any(c["id"] == created_ids["contracts"][0] for c in rows)
        one = next(c for c in rows if c["id"] == created_ids["contracts"][0])
        assert "liveStatus" in one and "milestoneOverdue" in one and "noticesDue" in one

    def test_list_filter_by_project_and_q(self, admin_headers, created_ids):
        r = requests.get(f"{BASE_URL}/api/contracts/contracts?projectId=TEST_PROJ_ALPHA",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert all(c["projectId"] == "TEST_PROJ_ALPHA" for c in r.json())

        r2 = requests.get(f"{BASE_URL}/api/contracts/contracts?q=Alpha", headers=admin_headers, timeout=30)
        assert r2.status_code == 200
        assert any(c["id"] == created_ids["contracts"][0] for c in r2.json())

    def test_get_one_has_linked_and_rollup(self, admin_headers, created_ids):
        cid = created_ids["contracts"][0]
        r = requests.get(f"{BASE_URL}/api/contracts/contracts/{cid}", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "linked" in d and set(["variations", "applications", "invoices"]).issubset(d["linked"].keys())
        assert "projectRollup" in d
        assert "liveStatus" in d

    def test_patch_updates_fields(self, admin_headers, created_ids):
        cid = created_ids["contracts"][0]
        r = requests.patch(f"{BASE_URL}/api/contracts/contracts/{cid}", headers=admin_headers,
                           json={"scopeSummary": "Updated scope", "contractValue": 200000}, timeout=30)
        assert r.status_code == 200
        assert r.json()["scopeSummary"] == "Updated scope"
        assert r.json()["contractValue"] == 200000

    def test_get_unknown_returns_404(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/contracts/contracts/does-not-exist", headers=admin_headers, timeout=30)
        assert r.status_code == 404


# ---------------- Status lifecycle ----------------

class TestStatus:
    def test_invalid_status_400(self, admin_headers, created_ids):
        cid = created_ids["contracts"][0]
        r = requests.post(f"{BASE_URL}/api/contracts/contracts/{cid}/status", headers=admin_headers,
                          json={"status": "BOGUS"}, timeout=30)
        assert r.status_code == 400

    def test_activate_records_history_and_timestamp(self, admin_headers, created_ids):
        cid = created_ids["contracts"][0]
        r = requests.post(f"{BASE_URL}/api/contracts/contracts/{cid}/status", headers=admin_headers,
                          json={"status": "Active", "note": "kickoff"}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "Active"
        assert d.get("activatedAt")
        assert any(h.get("kind") == "status" and h.get("to") == "Active" and h.get("note") == "kickoff"
                   for h in d["history"])

    def test_live_status_flips_to_expiring_soon(self, admin_headers, created_ids):
        """Active + completion within 30 days must flip to Expiring Soon."""
        # Update completion to 10 days from now
        cid = created_ids["contracts"][0]
        requests.patch(f"{BASE_URL}/api/contracts/contracts/{cid}", headers=admin_headers,
                       json={"completionDate": _iso_plus(10)}, timeout=30)
        r = requests.get(f"{BASE_URL}/api/contracts/contracts/{cid}", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["liveStatus"] == "Expiring Soon"

        # Overdue completion also returns Expiring Soon
        requests.patch(f"{BASE_URL}/api/contracts/contracts/{cid}", headers=admin_headers,
                       json={"completionDate": _iso_plus(-5)}, timeout=30)
        r2 = requests.get(f"{BASE_URL}/api/contracts/contracts/{cid}", headers=admin_headers, timeout=30)
        assert r2.json()["liveStatus"] == "Expiring Soon"


# ---------------- Milestones ----------------

class TestMilestones:
    def test_add_update_delete_milestone_and_overdue_count(self, admin_headers, created_ids):
        cid = created_ids["contracts"][0]
        # Add overdue milestone
        r = requests.post(f"{BASE_URL}/api/contracts/contracts/{cid}/milestones", headers=admin_headers,
                          json={"name": "First fix complete", "plannedDate": _iso_plus(-10),
                                "status": "In Progress"}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["milestoneOverdue"] == 1
        mid = d["milestones"][0]["id"]

        # Update to Completed → overdue drops to 0
        r2 = requests.patch(f"{BASE_URL}/api/contracts/contracts/{cid}/milestones/{mid}", headers=admin_headers,
                            json={"name": "First fix complete", "status": "Completed"}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["milestoneOverdue"] == 0

        # Unknown milestone id → 404
        r3 = requests.patch(f"{BASE_URL}/api/contracts/contracts/{cid}/milestones/nope", headers=admin_headers,
                            json={"name": "x"}, timeout=30)
        assert r3.status_code == 404

        # Delete
        r4 = requests.delete(f"{BASE_URL}/api/contracts/contracts/{cid}/milestones/{mid}",
                             headers=admin_headers, timeout=30)
        assert r4.status_code == 200
        assert all(m.get("id") != mid for m in r4.json()["milestones"])


# ---------------- Notices ----------------

class TestNotices:
    def test_notice_lifecycle_and_due_count(self, admin_headers, created_ids):
        cid = created_ids["contracts"][0]
        # Notice with responseDueDate <= today, status Issued
        r = requests.post(f"{BASE_URL}/api/contracts/contracts/{cid}/notices", headers=admin_headers,
                          json={"type": "Early Warning (NEC)", "responseDueDate": _today_iso(),
                                "status": "Issued", "description": "Delay risk"}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["noticesDue"] == 1
        nid = d["notices"][0]["id"]

        # Update to Actioned → no longer due
        r2 = requests.patch(f"{BASE_URL}/api/contracts/contracts/{cid}/notices/{nid}", headers=admin_headers,
                            json={"type": "Early Warning (NEC)", "status": "Actioned"}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["noticesDue"] == 0

        # Unknown id
        r3 = requests.patch(f"{BASE_URL}/api/contracts/contracts/{cid}/notices/bad", headers=admin_headers,
                            json={"type": "General Notice"}, timeout=30)
        assert r3.status_code == 404

        # Delete
        r4 = requests.delete(f"{BASE_URL}/api/contracts/contracts/{cid}/notices/{nid}",
                             headers=admin_headers, timeout=30)
        assert r4.status_code == 200
        assert all(n.get("id") != nid for n in r4.json()["notices"])


# ---------------- Stats ----------------

class TestStatsAndProjectSummary:
    def test_stats_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/contracts/stats", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for key in ["total", "draft", "underReview", "active", "expiringSoon", "completed",
                    "terminated", "onHold", "noticesDue", "milestonesOverdue", "outstandingActions",
                    "totalContractValue", "activeContractValue", "recent"]:
            assert key in d, f"missing {key}"
        assert isinstance(d["recent"], list)
        assert d["total"] >= 1
        # Our contract's completionDate is in the past, so it should register as expiringSoon
        assert d["expiringSoon"] >= 1

    def test_project_summary(self, admin_headers, created_ids):
        r = requests.get(f"{BASE_URL}/api/contracts/project/TEST_PROJ_ALPHA/summary",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["projectId"] == "TEST_PROJ_ALPHA"
        assert d["count"] >= 1
        assert d["totalValue"] >= 200000
        assert any(c["id"] == created_ids["contracts"][0] for c in d["contracts"])


# ---------------- Templates ----------------

class TestTemplates:
    def test_template_roundtrip(self, admin_headers, created_ids):
        r = requests.post(f"{BASE_URL}/api/contracts/templates", headers=admin_headers,
                          json={"name": "TEST_Bespoke Template", "payload": {"paymentTerms": "Bespoke schedule"}},
                          timeout=30)
        assert r.status_code == 200
        tid = r.json()["id"]
        created_ids["templates"].append(tid)

        r2 = requests.get(f"{BASE_URL}/api/contracts/templates", headers=admin_headers, timeout=30)
        assert r2.status_code == 200
        assert any(t["id"] == tid for t in r2.json())

        r3 = requests.delete(f"{BASE_URL}/api/contracts/templates/{tid}", headers=admin_headers, timeout=30)
        assert r3.status_code == 200

        r4 = requests.get(f"{BASE_URL}/api/contracts/templates", headers=admin_headers, timeout=30)
        assert all(t["id"] != tid for t in r4.json())


# ---------------- Global search + Command Centre ----------------

class TestSearchAndAttention:
    def test_global_search_by_contract_ref(self, admin_headers, created_ids):
        cid = created_ids["contracts"][0]
        # Fetch its ref
        one = requests.get(f"{BASE_URL}/api/contracts/contracts/{cid}", headers=admin_headers, timeout=30).json()
        ref = one["contractRef"]
        r = requests.get(f"{BASE_URL}/api/search", params={"q": ref}, headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # try a couple of shapes
        rows = data.get("results") or data.get("items") or data.get("contracts") or []
        if isinstance(data, dict) and "buckets" in data:
            for b in data["buckets"]:
                rows.extend(b.get("items") or b.get("results") or [])
        # Fallback: scan any lists inside dict
        if not rows and isinstance(data, dict):
            for v in data.values():
                if isinstance(v, list):
                    rows.extend(v)
        assert any((ref in str(x)) or (cid in str(x)) for x in rows), f"contract ref {ref} not in search results: {data}"

    def test_attention_includes_contract_kinds(self, admin_headers, created_ids):
        # Need Active contract with completion within 30 days (or overdue) — currently overdue.
        # Also add an overdue milestone and a due notice to trigger all 3 kinds.
        cid = created_ids["contracts"][0]
        # Ensure completion still within 30 days for expiring
        requests.patch(f"{BASE_URL}/api/contracts/contracts/{cid}", headers=admin_headers,
                       json={"completionDate": _iso_plus(10)}, timeout=30)
        # Add overdue milestone
        requests.post(f"{BASE_URL}/api/contracts/contracts/{cid}/milestones", headers=admin_headers,
                      json={"name": "Snag list", "plannedDate": _iso_plus(-3), "status": "In Progress"}, timeout=30)
        # Add due notice
        requests.post(f"{BASE_URL}/api/contracts/contracts/{cid}/notices", headers=admin_headers,
                      json={"type": "General Notice", "responseDueDate": _today_iso(), "status": "Issued"}, timeout=30)

        r = requests.get(f"{BASE_URL}/api/attention", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        items = data.get("items") if isinstance(data, dict) else data
        if items is None and isinstance(data, dict):
            # Look inside nested keys
            for v in data.values():
                if isinstance(v, list):
                    items = v
                    break
        kinds = {(i.get("kind") if isinstance(i, dict) else None) for i in (items or [])}
        assert "contract_expiring" in kinds, f"missing contract_expiring in {kinds}"
        assert "contract_notice_due" in kinds, f"missing contract_notice_due in {kinds}"
        assert "contract_milestone_overdue" in kinds, f"missing contract_milestone_overdue in {kinds}"


# ---------------- Cross-user isolation ----------------

class TestCrossUserIsolation:
    def test_other_user_cannot_see_contracts_or_templates(self, second_user_headers, created_ids):
        cid = created_ids["contracts"][0]
        # list
        r = requests.get(f"{BASE_URL}/api/contracts/contracts", headers=second_user_headers, timeout=30)
        assert r.status_code == 200
        assert all(c["id"] != cid for c in r.json())
        # get one
        r2 = requests.get(f"{BASE_URL}/api/contracts/contracts/{cid}", headers=second_user_headers, timeout=30)
        assert r2.status_code == 404
        # templates
        r3 = requests.get(f"{BASE_URL}/api/contracts/templates", headers=second_user_headers, timeout=30)
        assert r3.status_code == 200
        # any template belonging to admin should not appear
        # (templates get soft-deleted in TestTemplates, so list may be empty — that's fine)
        assert isinstance(r3.json(), list)


# ---------------- Regression on prior V2 flagship tools ----------------

class TestRegressionOtherFlagshipTools:
    @pytest.mark.parametrize("prefix", [
        "/api/purchase-orders",
        "/api/invoice-builder",
        "/api/applications-for-payment",
        "/api/variation-orders",
    ])
    def test_reference_and_stats(self, admin_headers, prefix):
        r1 = requests.get(f"{BASE_URL}{prefix}/reference", headers=admin_headers, timeout=30)
        assert r1.status_code == 200, f"{prefix}/reference -> {r1.status_code} {r1.text}"
        r2 = requests.get(f"{BASE_URL}{prefix}/stats", headers=admin_headers, timeout=30)
        assert r2.status_code == 200, f"{prefix}/stats -> {r2.status_code} {r2.text}"


# ---------------- Cleanup ----------------

class TestZCleanup:
    def test_soft_delete_contract(self, admin_headers, created_ids):
        for cid in created_ids["contracts"]:
            r = requests.delete(f"{BASE_URL}/api/contracts/contracts/{cid}", headers=admin_headers, timeout=30)
            assert r.status_code == 200
            g = requests.get(f"{BASE_URL}/api/contracts/contracts/{cid}", headers=admin_headers, timeout=30)
            assert g.status_code == 404
