"""Backend tests for Site Diary V2 (iteration 18)."""
import os
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or \
           open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].splitlines()[0].strip()

USERNAME = "darrenhustle300"
PASSWORD = "hustle1234"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": USERNAME, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="session")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


TODAY = datetime.now(timezone.utc).date().isoformat()


# ---- Reference ----
class TestReference:
    def test_reference_lists(self):
        r = requests.get(f"{BASE_URL}/api/site-diary/reference", timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ["conditions", "delayCategories", "windOptions", "rainOptions"]:
            assert k in d and isinstance(d[k], list) and len(d[k]) > 0


# ---- Entries CRUD ----
class TestEntries:
    eid = None

    def test_create_missing_date_400(self, h):
        r = requests.post(f"{BASE_URL}/api/site-diary/entries",
                          json={"projectName": "TEST_SD_P"}, headers=h, timeout=30)
        assert r.status_code == 400

    def test_create_entry(self, h):
        payload = {
            "projectName": "TEST_SD_Project",
            "clientName": "TEST_Client",
            "siteAddress": "1 Test Rd",
            "principalContractor": "TEST PC",
            "date": TODAY,
            "conditions": "Clear",
            "wind": "Light breeze",
            "rain": "None",
            "supervisor": "TEST Supervisor",
            "crew": [{"name": "John", "trade": "Electrician", "hours": "8"}],
            "subcontractorsOnSite": [{"company": "Sub A", "operatives": 2}],
            "worksCompleted": [{"activity": "First fix"}],
            "deliveries": [{"item": "Cable"}],
            "plant": [{"item": "Genny"}],
            "delays": [{"category": "Weather", "notes": "Rain 1hr"}],
            "issues": [],
            "instructions": [],
            "hsObservations": [],
            "visitors": [],
            "variations": [{"ref": "V1"}],
            "photos": [],
            "linkedDocuments": {"rams": []},
            "notes": "TEST notes",
            "preparedBy": "Darren",
        }
        r = requests.post(f"{BASE_URL}/api/site-diary/entries", json=payload, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["projectName"] == "TEST_SD_Project"
        assert d["isDeleted"] is False
        assert "id" in d and "_id" not in d
        TestEntries.eid = d["id"]

    def test_list_entries(self, h):
        r = requests.get(f"{BASE_URL}/api/site-diary/entries", headers=h, timeout=30)
        assert r.status_code == 200
        ids = [e["id"] for e in r.json()]
        assert TestEntries.eid in ids

    def test_patch_partial_favourite(self, h):
        r = requests.patch(f"{BASE_URL}/api/site-diary/entries/{TestEntries.eid}",
                           json={"isFavourite": True}, headers=h, timeout=30)
        assert r.status_code == 200
        assert r.json()["isFavourite"] is True

    def test_patch_unknown_404(self, h):
        r = requests.patch(f"{BASE_URL}/api/site-diary/entries/nonexistent-xyz",
                           json={"notes": "x"}, headers=h, timeout=30)
        assert r.status_code == 404

    def test_stats(self, h):
        r = requests.get(f"{BASE_URL}/api/site-diary/stats", headers=h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ["total", "enteredToday", "thisWeek", "withDelays", "missingToday", "recent"]:
            assert k in d
        assert d["total"] >= 1
        assert d["enteredToday"] >= 1
        assert d["withDelays"] >= 1

    def test_delete_soft(self, h):
        r = requests.delete(f"{BASE_URL}/api/site-diary/entries/{TestEntries.eid}",
                            headers=h, timeout=30)
        assert r.status_code == 200
        rl = requests.get(f"{BASE_URL}/api/site-diary/entries", headers=h, timeout=30)
        assert TestEntries.eid not in [e["id"] for e in rl.json()]

    def test_delete_missing_404(self, h):
        r = requests.delete(f"{BASE_URL}/api/site-diary/entries/nonexistent-xyz",
                            headers=h, timeout=30)
        assert r.status_code == 404


# ---- Templates ----
class TestTemplates:
    tid = None

    def test_create_template(self, h):
        r = requests.post(f"{BASE_URL}/api/site-diary/templates",
                          json={"name": "TEST_SD_Tpl",
                                "payload": {"supervisor": "Std", "crew": []}},
                          headers=h, timeout=30)
        assert r.status_code == 200, r.text
        TestTemplates.tid = r.json()["id"]

    def test_empty_name_400(self, h):
        r = requests.post(f"{BASE_URL}/api/site-diary/templates",
                          json={"name": "", "payload": {}}, headers=h, timeout=30)
        assert r.status_code == 400

    def test_list_templates(self, h):
        r = requests.get(f"{BASE_URL}/api/site-diary/templates", headers=h, timeout=30)
        assert r.status_code == 200
        assert TestTemplates.tid in [t["id"] for t in r.json()]

    def test_delete_template(self, h):
        r = requests.delete(f"{BASE_URL}/api/site-diary/templates/{TestTemplates.tid}",
                            headers=h, timeout=30)
        assert r.status_code == 200
        rl = requests.get(f"{BASE_URL}/api/site-diary/templates", headers=h, timeout=30)
        assert TestTemplates.tid not in [t["id"] for t in rl.json()]
