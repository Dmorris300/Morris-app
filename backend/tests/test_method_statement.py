"""Backend tests for Method Statement templates + document save event emission."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fall back to reading frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

USERNAME = "darrenhustle300"
PASSWORD = "hustle1234"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": USERNAME, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---- Method Statement templates CRUD ----
class TestMethodStatementTemplates:
    def test_list_initial(self, headers):
        r = requests.get(f"{BASE_URL}/api/method-statement/templates", headers=headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_valid(self, headers):
        payload = {
            "name": "TEST_MS_Template_1",
            "steps": [
                {"title": "Site induction", "description": "Sign in"},
                {"title": "PPE check", "description": "Verify PPE"},
            ],
        }
        r = requests.post(f"{BASE_URL}/api/method-statement/templates", json=payload, headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == payload["name"]
        assert len(data["steps"]) == 2
        assert "id" in data
        assert "_id" not in data
        pytest.template_id = data["id"]

        # Verify shows up in GET
        r2 = requests.get(f"{BASE_URL}/api/method-statement/templates", headers=headers)
        ids = [t["id"] for t in r2.json()]
        assert data["id"] in ids

    def test_create_empty_name_400(self, headers):
        r = requests.post(
            f"{BASE_URL}/api/method-statement/templates",
            json={"name": "  ", "steps": [{"title": "x"}]},
            headers=headers,
        )
        assert r.status_code == 400

    def test_create_empty_steps_400(self, headers):
        r = requests.post(
            f"{BASE_URL}/api/method-statement/templates",
            json={"name": "TEST_MS_empty", "steps": []},
            headers=headers,
        )
        assert r.status_code == 400

    def test_delete_soft(self, headers):
        tid = getattr(pytest, "template_id", None)
        assert tid, "create test must run first"
        r = requests.delete(f"{BASE_URL}/api/method-statement/templates/{tid}", headers=headers)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/method-statement/templates", headers=headers)
        ids = [t["id"] for t in r2.json()]
        assert tid not in ids

    def test_delete_nonexistent_404(self, headers):
        r = requests.delete(f"{BASE_URL}/api/method-statement/templates/nonexistent-id", headers=headers)
        assert r.status_code == 404

    def test_unauthorized(self):
        r = requests.get(f"{BASE_URL}/api/method-statement/templates")
        assert r.status_code in (401, 403)


# ---- documents/save integration & project event emission ----
class TestMethodStatementDocumentSave:
    def test_save_without_job(self, headers):
        payload = {
            "title": "TEST_MS Document",
            "toolId": "method-statement",
            "refNumber": "MS-TEST-1",
            "content": "test content",
            "metadata": {},
        }
        r = requests.post(f"{BASE_URL}/api/documents/save", json=payload, headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["toolId"] == "method-statement"
        assert "_id" not in data

    def test_save_with_job_emits_event(self, headers):
        # Create a job first
        job_payload = {"title": "TEST_MS Job", "clientName": "Test Client", "siteAddress": "1 Test St"}
        rj = requests.post(f"{BASE_URL}/api/jobs", json=job_payload, headers=headers)
        assert rj.status_code == 200, rj.text
        job_id = rj.json()["id"]

        save_payload = {
            "title": "TEST_MS with job",
            "toolId": "method-statement",
            "refNumber": "MS-JOB-1",
            "jobId": job_id,
            "content": "linked",
            "metadata": {},
        }
        rs = requests.post(f"{BASE_URL}/api/documents/save", json=save_payload, headers=headers)
        assert rs.status_code == 200, rs.text

        # Check events
        re = requests.get(f"{BASE_URL}/api/jobs/{job_id}/events", headers=headers)
        assert re.status_code == 200, re.text
        events = re.json()
        kinds = [e.get("kind") for e in events]
        assert "method_statement_created" in kinds, f"kinds={kinds}"

        # cleanup
        requests.delete(f"{BASE_URL}/api/jobs/{job_id}", headers=headers)
