"""Backend tests for Toolbox Talks V2 & COSHH V2 (iteration 16)."""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta

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


# ---------------- Toolbox Talks ----------------
class TestToolboxTopics:
    def test_topics_returns_16(self):
        r = requests.get(f"{BASE_URL}/api/toolbox-talks/topics", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 16, f"expected 16 topics, got {len(data)}"
        # each topic shape
        for t in data:
            assert "id" in t and "title" in t and "category" in t and "duration" in t
            s = t["sections"]
            for k in ["introduction", "hazards", "controlMeasures", "bestPractice",
                      "emergencyProcedures", "keyMessages", "questions"]:
                assert k in s, f"missing {k} in {t['id']}"

    def test_topics_include_specified_ids(self):
        r = requests.get(f"{BASE_URL}/api/toolbox-talks/topics", timeout=30)
        ids = {t["id"] for t in r.json()}
        for expected in ["working-at-height", "ladders", "manual-handling",
                         "fire-safety", "electrical", "confined-spaces"]:
            assert expected in ids, f"missing topic {expected}"


class TestToolboxTemplates:
    tid = None

    def test_create_template(self, h):
        payload = {
            "name": "TEST_TBT_Template",
            "topicTitle": "Custom Site Induction",
            "sections": {
                "introduction": "Intro", "hazards": ["h1"], "controlMeasures": ["c1"],
                "bestPractice": ["b1"], "emergencyProcedures": ["e1"],
                "keyMessages": ["k1"], "questions": ["q1"],
            },
        }
        r = requests.post(f"{BASE_URL}/api/toolbox-talks/templates", json=payload, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_TBT_Template"
        assert "id" in d
        TestToolboxTemplates.tid = d["id"]

    def test_list_templates_contains(self, h):
        r = requests.get(f"{BASE_URL}/api/toolbox-talks/templates", headers=h, timeout=30)
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert TestToolboxTemplates.tid in ids

    def test_create_template_empty_name_400(self, h):
        r = requests.post(f"{BASE_URL}/api/toolbox-talks/templates",
                          json={"name": "", "topicTitle": "X", "sections": {}}, headers=h, timeout=30)
        assert r.status_code == 400

    def test_delete_template(self, h):
        assert TestToolboxTemplates.tid
        r = requests.delete(f"{BASE_URL}/api/toolbox-talks/templates/{TestToolboxTemplates.tid}",
                            headers=h, timeout=30)
        assert r.status_code == 200
        # verify soft-deleted (not in list)
        rl = requests.get(f"{BASE_URL}/api/toolbox-talks/templates", headers=h, timeout=30)
        assert TestToolboxTemplates.tid not in [t["id"] for t in rl.json()]


class TestToolboxStats:
    def test_stats_shape(self, h):
        r = requests.get(f"{BASE_URL}/api/toolbox-talks/stats", headers=h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ["completed", "due", "lastTalkAt", "nextReviewAt", "overdueDays"]:
            assert k in d


# ---------------- COSHH ----------------
class TestCoshhHazards:
    def test_hazards_library(self):
        r = requests.get(f"{BASE_URL}/api/coshh/hazards", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert len(d["pictograms"]) == 9
        assert len(d["hStatements"]) > 0
        assert len(d["pStatements"]) > 0
        picto_ids = {p["id"] for p in d["pictograms"]}
        for x in ["GHS01", "GHS02", "GHS03", "GHS09"]:
            assert x in picto_ids


class TestCoshhAssessments:
    aid = None
    review_aid = None

    def test_create_assessment(self, h):
        r = requests.post(f"{BASE_URL}/api/coshh/assessments",
                          json={"productName": "TEST_CT1 Adhesive",
                                "hazardLevel": "High",
                                "pictograms": ["GHS02", "GHS07"],
                                "hStatements": ["H315"], "pStatements": ["P280"]},
                          headers=h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["productName"] == "TEST_CT1 Adhesive"
        assert "id" in d
        assert "_id" not in d
        TestCoshhAssessments.aid = d["id"]

    def test_list_and_get_persisted(self, h):
        r = requests.get(f"{BASE_URL}/api/coshh/assessments", headers=h, timeout=30)
        assert r.status_code == 200
        ids = [a["id"] for a in r.json()]
        assert TestCoshhAssessments.aid in ids

    def test_create_empty_productname_400(self, h):
        r = requests.post(f"{BASE_URL}/api/coshh/assessments",
                          json={"productName": ""}, headers=h, timeout=30)
        assert r.status_code == 400

    def test_patch_assessment(self, h):
        r = requests.patch(f"{BASE_URL}/api/coshh/assessments/{TestCoshhAssessments.aid}",
                           json={"manufacturer": "TEST_Mfr"}, headers=h, timeout=30)
        assert r.status_code == 200
        assert r.json()["manufacturer"] == "TEST_Mfr"

    def test_stats(self, h):
        r = requests.get(f"{BASE_URL}/api/coshh/stats", headers=h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ["total", "active", "reviewsDue", "expired", "highRisk", "recent"]:
            assert k in d
        assert d["total"] >= 1
        assert d["highRisk"] >= 1

    def test_review_due_attention(self, h):
        # create assessment with reviewDate within 20 days -> should be 'warning'
        rev_date = (datetime.now(timezone.utc) + timedelta(days=20)).date().isoformat()
        r = requests.post(f"{BASE_URL}/api/coshh/assessments",
                          json={"productName": "TEST_ReviewDue", "reviewDate": rev_date,
                                "hazardLevel": "Medium"},
                          headers=h, timeout=30)
        assert r.status_code == 200
        TestCoshhAssessments.review_aid = r.json()["id"]
        att = requests.get(f"{BASE_URL}/api/attention", headers=h, timeout=30)
        assert att.status_code == 200
        items = att.json() if isinstance(att.json(), list) else att.json().get("items", [])
        matching = [i for i in items if i.get("kind") == "coshh_review_due"
                    and TestCoshhAssessments.review_aid in i.get("id", "")]
        assert matching, f"no coshh_review_due item found. Got kinds: {[i.get('kind') for i in items][:10]}"
        assert matching[0]["severity"] in ("warning", "urgent")

    def test_delete_assessment(self, h):
        r = requests.delete(f"{BASE_URL}/api/coshh/assessments/{TestCoshhAssessments.aid}",
                            headers=h, timeout=30)
        assert r.status_code == 200
        # verify soft delete: not in list
        rl = requests.get(f"{BASE_URL}/api/coshh/assessments", headers=h, timeout=30)
        assert TestCoshhAssessments.aid not in [a["id"] for a in rl.json()]
        # cleanup review one
        if TestCoshhAssessments.review_aid:
            requests.delete(f"{BASE_URL}/api/coshh/assessments/{TestCoshhAssessments.review_aid}",
                            headers=h, timeout=30)

    def test_delete_missing_404(self, h):
        r = requests.delete(f"{BASE_URL}/api/coshh/assessments/nonexistent-id",
                            headers=h, timeout=30)
        assert r.status_code == 404


class TestCoshhTemplates:
    tid = None

    def test_create_template(self, h):
        r = requests.post(f"{BASE_URL}/api/coshh/templates",
                          json={"name": "TEST_COSHH_Tpl", "productName": "Acetone",
                                "payload": {"hazardLevel": "High"}},
                          headers=h, timeout=30)
        assert r.status_code == 200, r.text
        TestCoshhTemplates.tid = r.json()["id"]

    def test_delete_template(self, h):
        r = requests.delete(f"{BASE_URL}/api/coshh/templates/{TestCoshhTemplates.tid}",
                            headers=h, timeout=30)
        assert r.status_code == 200


class TestUnauth:
    def test_templates_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/coshh/templates", timeout=30)
        assert r.status_code in (401, 403)
