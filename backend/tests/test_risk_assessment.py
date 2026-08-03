"""Morris — Risk Assessment V2 backend tests.

Covers:
  - GET  /api/risk-assessment/reference (bands, matrix, personsAtRisk[8], statuses[4])
  - POST /api/risk-assessment/entries with server-side L×S computation
  - Validation (400 when activity or assessmentDate missing)
  - PATCH recomputes ratings when hazards updated
  - DELETE soft-deletes; list excludes deleted
  - GET /stats — active, reviewsDue, highRisks counts (Closed excluded)
  - Templates CRUD
  - 404 handling on missing ids
"""

import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

USERNAME = "darrenhustle300"
PASSWORD = "hustle1234"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": USERNAME, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def cleanup(headers):
    """Remove any TEST_ prefixed entries after tests."""
    yield
    try:
        r = requests.get(f"{BASE_URL}/api/risk-assessment/entries", headers=headers, timeout=30)
        for row in r.json():
            if str(row.get("activity", "")).startswith("TEST_") or str(row.get("projectName", "")).startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/risk-assessment/entries/{row['id']}", headers=headers, timeout=30)
        r = requests.get(f"{BASE_URL}/api/risk-assessment/templates", headers=headers, timeout=30)
        for row in r.json():
            if str(row.get("name", "")).startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/risk-assessment/templates/{row['id']}", headers=headers, timeout=30)
    except Exception:
        pass


# ---------------- Reference ----------------
class TestReference:
    def test_reference_shape(self, headers):
        r = requests.get(f"{BASE_URL}/api/risk-assessment/reference", headers=headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data["likelihood"]) == 5
        assert len(data["severity"]) == 5
        assert len(data["personsAtRisk"]) == 8
        assert len(data["statuses"]) == 4
        assert len(data["bands"]) == 4
        band_labels = [b["label"] for b in data["bands"]]
        assert band_labels == ["Low", "Medium", "High", "Extreme"]
        # verify likelihood/severity values are 1..5
        assert [x["value"] for x in data["likelihood"]] == [1, 2, 3, 4, 5]
        assert [x["value"] for x in data["severity"]] == [1, 2, 3, 4, 5]


# ---------------- Rating computation ----------------
class TestRatingComputation:
    RATING_CASES = [
        (4, 5, 20, "Extreme"),
        (2, 3, 6, "Medium"),
        (3, 3, 9, "Medium"),
        (1, 2, 2, "Low"),
        (4, 4, 16, "Extreme"),
        (3, 4, 12, "High"),
    ]

    def test_ratings_all_cases(self, headers):
        hazards = []
        for l, s, _score, _band in self.RATING_CASES:
            hazards.append({
                "name": f"Hazard L{l}S{s}",
                "initialLikelihood": l, "initialSeverity": s,
                "residualLikelihood": 1, "residualSeverity": 1,
            })
        payload = {
            "activity": "TEST_ratings",
            "projectName": "TEST_project",
            "assessmentDate": "2026-01-15",
            "reviewDate": "2026-02-15",
            "hazards": hazards,
        }
        r = requests.post(f"{BASE_URL}/api/risk-assessment/entries",
                          json=payload, headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        for idx, (l, s, score, band) in enumerate(self.RATING_CASES):
            h = body["hazards"][idx]
            assert h["initialScore"] == score, f"case {l}x{s}: got {h}"
            assert h["initialRating"] == band, f"case {l}x{s}: got {h['initialRating']}"
            # residual: 1x1=1 -> Low
            assert h["residualScore"] == 1
            assert h["residualRating"] == "Low"


# ---------------- Validation ----------------
class TestValidation:
    def test_missing_activity_returns_400(self, headers):
        r = requests.post(f"{BASE_URL}/api/risk-assessment/entries",
                          json={"assessmentDate": "2026-01-15"}, headers=headers, timeout=30)
        assert r.status_code == 400
        assert "activity" in r.text.lower()

    def test_missing_assessment_date_returns_400(self, headers):
        r = requests.post(f"{BASE_URL}/api/risk-assessment/entries",
                          json={"activity": "TEST_x"}, headers=headers, timeout=30)
        assert r.status_code == 400
        assert "date" in r.text.lower()


# ---------------- PATCH / DELETE ----------------
class TestPatchDelete:
    def _create(self, headers):
        r = requests.post(f"{BASE_URL}/api/risk-assessment/entries",
                          json={"activity": "TEST_patch", "projectName": "TEST_patch",
                                "assessmentDate": "2026-01-10",
                                "hazards": [{"name": "H", "initialLikelihood": 1,
                                             "initialSeverity": 1, "residualLikelihood": 1,
                                             "residualSeverity": 1}]},
                          headers=headers, timeout=30)
        assert r.status_code == 200
        return r.json()

    def test_patch_recomputes_ratings(self, headers):
        entry = self._create(headers)
        eid = entry["id"]
        r = requests.patch(f"{BASE_URL}/api/risk-assessment/entries/{eid}",
                           json={"hazards": [{"name": "H1",
                                              "initialLikelihood": 5, "initialSeverity": 4,
                                              "residualLikelihood": 2, "residualSeverity": 2}]},
                           headers=headers, timeout=30)
        assert r.status_code == 200
        h = r.json()["hazards"][0]
        assert h["initialScore"] == 20
        assert h["initialRating"] == "Extreme"
        assert h["residualScore"] == 4
        assert h["residualRating"] == "Low"

    def test_patch_missing_returns_404(self, headers):
        r = requests.patch(f"{BASE_URL}/api/risk-assessment/entries/does-not-exist-{uuid.uuid4()}",
                           json={"activity": "x"}, headers=headers, timeout=30)
        assert r.status_code == 404

    def test_delete_soft_deletes(self, headers):
        entry = self._create(headers)
        eid = entry["id"]
        r = requests.delete(f"{BASE_URL}/api/risk-assessment/entries/{eid}",
                            headers=headers, timeout=30)
        assert r.status_code == 200
        # Confirm not in list
        r = requests.get(f"{BASE_URL}/api/risk-assessment/entries", headers=headers, timeout=30)
        ids = [row["id"] for row in r.json()]
        assert eid not in ids
        # Second delete returns 404
        r = requests.delete(f"{BASE_URL}/api/risk-assessment/entries/{eid}",
                            headers=headers, timeout=30)
        assert r.status_code == 404


# ---------------- Stats ----------------
class TestStats:
    def test_stats_counts(self, headers):
        # Clean-slate: capture baseline then add known rows
        base = requests.get(f"{BASE_URL}/api/risk-assessment/stats", headers=headers, timeout=30).json()

        yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
        future = (datetime.now(timezone.utc).date() + timedelta(days=30)).isoformat()
        today = datetime.now(timezone.utc).date().isoformat()

        # 1) Active + review due + high residual
        e1 = requests.post(f"{BASE_URL}/api/risk-assessment/entries", headers=headers, timeout=30,
                           json={"activity": "TEST_stats_1", "projectName": "TEST_stats",
                                 "assessmentDate": today, "reviewDate": yesterday,
                                 "status": "Active",
                                 "hazards": [{"name": "h", "initialLikelihood": 5,
                                              "initialSeverity": 5,
                                              "residualLikelihood": 4, "residualSeverity": 5}]}).json()
        # 2) Closed with review due & high residual → must NOT count as active/reviewsDue/highRisks
        e2 = requests.post(f"{BASE_URL}/api/risk-assessment/entries", headers=headers, timeout=30,
                           json={"activity": "TEST_stats_2", "projectName": "TEST_stats",
                                 "assessmentDate": today, "reviewDate": yesterday,
                                 "status": "Closed",
                                 "hazards": [{"name": "h", "initialLikelihood": 5,
                                              "initialSeverity": 5,
                                              "residualLikelihood": 5, "residualSeverity": 5}]}).json()
        # 3) Active, review in future, low residual — active only
        e3 = requests.post(f"{BASE_URL}/api/risk-assessment/entries", headers=headers, timeout=30,
                           json={"activity": "TEST_stats_3", "projectName": "TEST_stats",
                                 "assessmentDate": today, "reviewDate": future,
                                 "status": "Active",
                                 "hazards": [{"name": "h", "initialLikelihood": 1,
                                              "initialSeverity": 1,
                                              "residualLikelihood": 1, "residualSeverity": 1}]}).json()
        try:
            after = requests.get(f"{BASE_URL}/api/risk-assessment/stats", headers=headers, timeout=30).json()
            assert after["total"] == base["total"] + 3
            assert after["active"] == base["active"] + 2  # e1, e3 only
            assert after["reviewsDue"] == base["reviewsDue"] + 1  # e1 only (e2 is Closed)
            assert after["highRisks"] == base["highRisks"] + 1  # e1 only (e2 is Closed)
            assert isinstance(after["recent"], list)
            assert len(after["recent"]) <= 10
        finally:
            for e in (e1, e2, e3):
                requests.delete(f"{BASE_URL}/api/risk-assessment/entries/{e['id']}", headers=headers, timeout=30)


# ---------------- Templates ----------------
class TestTemplates:
    def test_template_crud(self, headers):
        r = requests.post(f"{BASE_URL}/api/risk-assessment/templates",
                          json={"name": "TEST_tmpl", "payload": {"activity": "Roofing"}},
                          headers=headers, timeout=30)
        assert r.status_code == 200
        tid = r.json()["id"]

        r = requests.get(f"{BASE_URL}/api/risk-assessment/templates", headers=headers, timeout=30)
        assert r.status_code == 200
        assert any(t["id"] == tid for t in r.json())

        r = requests.delete(f"{BASE_URL}/api/risk-assessment/templates/{tid}",
                            headers=headers, timeout=30)
        assert r.status_code == 200

        r = requests.delete(f"{BASE_URL}/api/risk-assessment/templates/{tid}",
                            headers=headers, timeout=30)
        assert r.status_code == 404
