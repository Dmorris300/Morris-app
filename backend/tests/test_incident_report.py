"""Backend tests for Incident Report V2 (iteration 20)."""
import os
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or \
           open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].splitlines()[0].strip()

USERNAME = "darrenhustle300"
PASSWORD = "hustle1234"
TODAY = datetime.now(timezone.utc).date().isoformat()


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": USERNAME, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="session")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


class TestReference:
    def test_reference_lists(self):
        r = requests.get(f"{BASE_URL}/api/incident-report/reference", timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ["incidentTypes", "severities", "statuses", "riddorCategories", "riskReviewKeys"]:
            assert k in d and isinstance(d[k], list) and len(d[k]) > 0
        assert "Near Miss" in d["incidentTypes"]
        assert "Critical" in d["severities"]
        assert "Closed" in d["statuses"]
        # riskReviewKeys should be list of {key,label}
        keys = [item["key"] for item in d["riskReviewKeys"]]
        for k in ("ramsUpdate", "methodStatementUpdate", "coshhUpdate", "toolboxTalkRequired", "riskAssessmentReview"):
            assert k in keys


class TestEntries:
    eid = None

    def test_create_missing_date_400(self, h):
        r = requests.post(f"{BASE_URL}/api/incident-report/entries",
                          json={"incidentType": "Injury"}, headers=h, timeout=30)
        assert r.status_code == 400

    def test_create_missing_type_400(self, h):
        r = requests.post(f"{BASE_URL}/api/incident-report/entries",
                          json={"date": TODAY}, headers=h, timeout=30)
        assert r.status_code == 400

    def test_create_full_payload(self, h):
        payload = {
            "projectName": "TEST_IR_Project",
            "clientName": "TEST Client",
            "siteAddress": "1 Test Rd",
            "date": TODAY,
            "time": "10:30",
            "incidentType": "Injury",
            "severity": "High",
            "status": "Open",
            "location": "Roof zone A",
            "description": "TEST desc",
            "immediateActions": "Cordoned area",
            "riddorReportable": True,
            "riddorCategory": "Specified injury",
            "riddorReference": "RIDDOR-1",
            "injuredPersons": [{"name": "Alice", "trade": "Electrician"}],
            "witnesses": [{"name": "Bob", "statement": "Saw fall"}],
            "supervisor": "Sup",
            "firstAider": "FA",
            "photos": [{"url": "x"}],
            "drawings": [{"url": "y"}],
            "immediateCause": "Slip",
            "underlyingCause": "Wet surface",
            "rootCause": "No mat",
            "fiveWhys": [{"q": "Why?", "a": "Because"}],
            "riskReview": {"ramsUpdate": True, "notes": {"ramsUpdate": "Update RAMS"}},
            "capa": [
                {"description": "Order mats", "responsible": "PM", "dueDate": "2026-02-01", "priority": "High", "status": "Open"},
                {"description": "TBT", "responsible": "SM", "priority": "Medium", "status": "Done"},
            ],
            "linkedDocuments": {"rams": [{"name": "R1"}]},
            "preparedBy": "Darren",
            "preparedSignature": "data:image/png;base64,AAA",
            "reviewedBy": "Jane",
            "reviewedSignature": "data:image/png;base64,BBB",
            "approvedBy": "Boss",
            "approvedSignature": "data:image/png;base64,CCC",
        }
        r = requests.post(f"{BASE_URL}/api/incident-report/entries", json=payload, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["projectName"] == "TEST_IR_Project"
        assert d["fiveWhys"][0]["q"] == "Why?"
        assert d["riskReview"]["notes"]["ramsUpdate"] == "Update RAMS"
        assert d["drawings"][0]["url"] == "y"
        assert d["preparedSignature"].startswith("data:image/png")
        assert d["reviewedSignature"].startswith("data:image/png")
        assert d["approvedSignature"].startswith("data:image/png")
        assert d["riddorReportable"] is True
        assert d["riddorCategory"] == "Specified injury"
        assert "id" in d and "_id" not in d
        TestEntries.eid = d["id"]

    def test_list_entries(self, h):
        r = requests.get(f"{BASE_URL}/api/incident-report/entries", headers=h, timeout=30)
        assert r.status_code == 200
        assert TestEntries.eid in [e["id"] for e in r.json()]

    def test_patch_status_and_fav(self, h):
        r = requests.patch(f"{BASE_URL}/api/incident-report/entries/{TestEntries.eid}",
                           json={"status": "Closed", "isFavourite": True}, headers=h, timeout=30)
        assert r.status_code == 200
        assert r.json()["status"] == "Closed"
        assert r.json()["isFavourite"] is True

    def test_patch_unknown_404(self, h):
        r = requests.patch(f"{BASE_URL}/api/incident-report/entries/nonexistent-xyz",
                           json={"notes": "x"}, headers=h, timeout=30)
        assert r.status_code == 404

    def test_delete_soft(self, h):
        r = requests.delete(f"{BASE_URL}/api/incident-report/entries/{TestEntries.eid}",
                            headers=h, timeout=30)
        assert r.status_code == 200
        rl = requests.get(f"{BASE_URL}/api/incident-report/entries", headers=h, timeout=30)
        assert TestEntries.eid not in [e["id"] for e in rl.json()]

    def test_delete_missing_404(self, h):
        r = requests.delete(f"{BASE_URL}/api/incident-report/entries/nonexistent-xyz",
                            headers=h, timeout=30)
        assert r.status_code == 404


class TestStats:
    ids = []

    def _create(self, h, **kw):
        base = {"date": TODAY, "incidentType": "Injury", "projectName": "TEST_IR_STATS"}
        base.update(kw)
        r = requests.post(f"{BASE_URL}/api/incident-report/entries", json=base, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        i = r.json()["id"]
        TestStats.ids.append(i)
        return i

    def test_stats_counting(self, h):
        # Baseline
        b = requests.get(f"{BASE_URL}/api/incident-report/stats", headers=h, timeout=30).json()

        # 1) Open High severity → highPriority + open
        self._create(h, severity="High", status="Open")
        # 2) Critical + Under Investigation → highPriority + underInvestigation
        self._create(h, severity="Critical", status="Under Investigation")
        # 3) Near Miss + Closed → closed, nearMisses, NOT highPriority
        self._create(h, incidentType="Near Miss", severity="High", status="Closed")
        # 4) Medium open with CAPA: 1 Open + 1 Done + 1 Closed → capaOutstanding contributes 1
        self._create(h, severity="Medium", status="Open", capa=[
            {"description": "A", "status": "Open"},
            {"description": "B", "status": "Done"},
            {"description": "C", "status": "Closed"},
            {"description": "D", "status": "In Progress"},  # counts as outstanding
        ])

        s = requests.get(f"{BASE_URL}/api/incident-report/stats", headers=h, timeout=30).json()
        assert s["total"] - b.get("total", 0) == 4
        assert s["open"] - b.get("open", 0) == 3  # 3 non-closed
        assert s["closed"] - b.get("closed", 0) == 1
        assert s["highPriority"] - b.get("highPriority", 0) == 2  # High-Open + Critical-UI  (Closed excluded)
        assert s["nearMisses"] - b.get("nearMisses", 0) == 1
        assert s["underInvestigation"] - b.get("underInvestigation", 0) == 1
        # CAPA outstanding: entry 4 → Open + In Progress = 2
        assert s["capaOutstanding"] - b.get("capaOutstanding", 0) == 2
        # trend + recent structure
        assert isinstance(s["trend"], list)
        assert isinstance(s["recent"], list)
        assert len(s["recent"]) <= 10

    def test_cleanup_stats(self, h):
        for i in TestStats.ids:
            requests.delete(f"{BASE_URL}/api/incident-report/entries/{i}", headers=h, timeout=30)


class TestTemplates:
    tid = None

    def test_create_template(self, h):
        r = requests.post(f"{BASE_URL}/api/incident-report/templates",
                          json={"name": "TEST_IR_Tpl", "payload": {"severity": "High"}},
                          headers=h, timeout=30)
        assert r.status_code == 200, r.text
        TestTemplates.tid = r.json()["id"]

    def test_list_templates(self, h):
        r = requests.get(f"{BASE_URL}/api/incident-report/templates", headers=h, timeout=30)
        assert r.status_code == 200
        assert TestTemplates.tid in [t["id"] for t in r.json()]

    def test_delete_template(self, h):
        r = requests.delete(f"{BASE_URL}/api/incident-report/templates/{TestTemplates.tid}",
                            headers=h, timeout=30)
        assert r.status_code == 200
        rl = requests.get(f"{BASE_URL}/api/incident-report/templates", headers=h, timeout=30)
        assert TestTemplates.tid not in [t["id"] for t in rl.json()]
