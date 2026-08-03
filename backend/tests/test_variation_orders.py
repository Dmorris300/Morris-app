"""Morris — Variation Orders V2 backend tests (all under /api/variation-orders)."""
import os
import time
from datetime import datetime, timezone, timedelta
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"username": "darrenhustle300", "password": "hustle1234"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def token(s):
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_ids():
    return {"variations": [], "templates": [], "jobs": []}


def _cleanup(s, h, created_ids):
    for vid in created_ids["variations"]:
        try:
            s.delete(f"{API}/variation-orders/variation-orders/{vid}", headers=h, timeout=15)
        except Exception:
            pass
    for tid in created_ids["templates"]:
        try:
            s.delete(f"{API}/variation-orders/templates/{tid}", headers=h, timeout=15)
        except Exception:
            pass


# --- Reference / stats ---
class TestReferenceAndStats:
    def test_reference(self, s, h):
        r = s.get(f"{API}/variation-orders/reference", headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("statuses", "reasons", "instructionMethods", "costCategories", "impactKinds", "units"):
            assert k in d and isinstance(d[k], list) and len(d[k]) > 0
        assert "Draft" in d["statuses"] and "Approved" in d["statuses"]

    def test_stats_shape(self, s, h):
        r = s.get(f"{API}/variation-orders/stats", headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("total", "draft", "submitted", "approved", "rejected", "inProgress",
                  "approvedValue", "submittedValue", "approvedDays", "recent"):
            assert k in d, f"missing {k}"
        assert isinstance(d["recent"], list)


# --- CRUD ---
class TestCrud:
    def test_create_computes_totals_and_ref(self, s, h, created_ids):
        payload = {
            "projectName": "TEST_VO Project",
            "clientName": "TEST_Client",
            "descriptionOfChange": "TEST_add extra sockets",
            "reason": "Client Request",
            "lineItems": [
                {"category": "Labour", "description": "Electrician", "qty": 8, "unit": "hour", "unitPrice": 45},
                {"category": "Materials", "description": "Sockets", "qty": 10, "unit": "each", "unitPrice": 12},
            ],
            "addVat": True,
            "vatRate": 20,
            "programmeImpact": {"kind": "Additional days", "days": 2},
        }
        r = s.post(f"{API}/variation-orders/variation-orders", json=payload, headers=h, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        created_ids["variations"].append(d["id"])
        assert d["variationRef"].startswith("VO-")
        assert d["totals"]["subtotal"] == 480.0  # 8*45 + 10*12 = 360+120
        assert d["totals"]["vatAmount"] == 96.0
        assert d["totals"]["total"] == 576.0
        assert d["totals"]["byCategory"]["Labour"] == 360.0
        assert d["totals"]["byCategory"]["Materials"] == 120.0
        assert d["status"] == "Draft"
        # GET verify persistence
        r2 = s.get(f"{API}/variation-orders/variation-orders/{d['id']}", headers=h, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["variationRef"] == d["variationRef"]

    def test_patch_status_and_approved_date_autostamped(self, s, h, created_ids):
        vid = created_ids["variations"][0]
        # Submit
        r = s.patch(f"{API}/variation-orders/variation-orders/{vid}",
                    json={"status": "Submitted"}, headers=h, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "Submitted"
        assert not r.json().get("approvedDate")
        # Approve — approvedDate should auto-stamp
        r = s.patch(f"{API}/variation-orders/variation-orders/{vid}",
                    json={"status": "Approved"}, headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "Approved"
        assert d.get("approvedDate"), "approvedDate must auto-stamp on Approved"
        today = datetime.now(timezone.utc).date().isoformat()
        assert d["approvedDate"] == today

    def test_list_filters_and_search(self, s, h, created_ids):
        # Create a second variation for filter/search tests
        payload = {
            "projectName": "TEST_Other Project",
            "clientName": "TEST_Other Client",
            "descriptionOfChange": "TEST_signage",
            "lineItems": [{"category": "Materials", "qty": 1, "unitPrice": 100}],
            "status": "Draft",
        }
        r = s.post(f"{API}/variation-orders/variation-orders", json=payload, headers=h, timeout=15)
        assert r.status_code == 200
        vid2 = r.json()["id"]
        created_ids["variations"].append(vid2)
        # Filter by status=Approved
        r = s.get(f"{API}/variation-orders/variation-orders?status=Approved", headers=h, timeout=15)
        assert r.status_code == 200
        for row in r.json():
            assert row["status"] == "Approved"
        # Search
        r = s.get(f"{API}/variation-orders/variation-orders?q=signage", headers=h, timeout=15)
        assert r.status_code == 200
        hits = [row for row in r.json() if row.get("id") == vid2]
        assert len(hits) == 1

    def test_delete_soft(self, s, h, created_ids):
        # Add a third to delete
        r = s.post(f"{API}/variation-orders/variation-orders",
                   json={"projectName": "TEST_ToDelete", "lineItems": []}, headers=h, timeout=15)
        assert r.status_code == 200
        vid = r.json()["id"]
        r = s.delete(f"{API}/variation-orders/variation-orders/{vid}", headers=h, timeout=15)
        assert r.status_code == 200 and r.json().get("ok") is True
        r = s.get(f"{API}/variation-orders/variation-orders/{vid}", headers=h, timeout=15)
        assert r.status_code == 404


# --- Project roll-up ---
class TestProjectRollup:
    def test_project_summary_and_job_stats(self, s, h, created_ids):
        # Create a job
        job_payload = {"name": "TEST_VO Job", "clientName": "TEST_Client", "contractValue": 10000}
        r = s.post(f"{API}/jobs", json=job_payload, headers=h, timeout=20)
        assert r.status_code in (200, 201), r.text
        job = r.json()
        job_id = job["id"]
        created_ids["jobs"].append(job_id)

        # Create a variation linked to the job
        vo_payload = {
            "projectId": job_id,
            "projectName": "TEST_VO Job",
            "lineItems": [{"category": "Labour", "qty": 4, "unitPrice": 50}],  # 200
            "addVat": False,
            "programmeImpact": {"kind": "Additional days", "days": 3},
        }
        r = s.post(f"{API}/variation-orders/variation-orders", json=vo_payload, headers=h, timeout=15)
        assert r.status_code == 200
        vid = r.json()["id"]
        created_ids["variations"].append(vid)
        # Approve
        r = s.patch(f"{API}/variation-orders/variation-orders/{vid}", json={"status": "Approved"}, headers=h, timeout=15)
        assert r.status_code == 200
        assert r.json()["totals"]["total"] == 200.0

        # Project summary
        r = s.get(f"{API}/variation-orders/project/{job_id}/summary", headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["originalContractValue"] == 10000.0
        assert d["approvedValue"] == 200.0
        assert d["revisedContractValue"] == 10200.0
        assert d["approvedDays"] == 3

        # jobs/{id}/stats
        r = s.get(f"{API}/jobs/{job_id}/stats", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        js = r.json()
        assert js.get("approvedVariationsValue") == 200.0
        assert js.get("revisedContractValue") == 10200.0

    def test_open_variations_count(self, s, h, created_ids):
        # Create another variation linked to same job in Submitted status
        job_id = created_ids["jobs"][0]
        r = s.post(f"{API}/variation-orders/variation-orders",
                   json={"projectId": job_id, "projectName": "TEST_VO Job",
                         "lineItems": [{"category": "Labour", "qty": 1, "unitPrice": 100}]},
                   headers=h, timeout=15)
        assert r.status_code == 200
        vid = r.json()["id"]
        created_ids["variations"].append(vid)
        s.patch(f"{API}/variation-orders/variation-orders/{vid}", json={"status": "Submitted"}, headers=h, timeout=15)

        r = s.get(f"{API}/jobs/{job_id}/stats", headers=h, timeout=15)
        assert r.status_code == 200
        js = r.json()
        assert js.get("openVariations", 0) >= 1


# --- Templates ---
class TestTemplates:
    def test_template_crud(self, s, h, created_ids):
        r = s.post(f"{API}/variation-orders/templates",
                   json={"name": "TEST_tpl", "payload": {"projectName": "TEST_tpl proj",
                                                           "lineItems": [{"category": "Labour", "qty": 2, "unitPrice": 30}]}},
                   headers=h, timeout=15)
        assert r.status_code == 200
        tid = r.json()["id"]
        created_ids["templates"].append(tid)
        # List
        r = s.get(f"{API}/variation-orders/templates", headers=h, timeout=15)
        assert r.status_code == 200
        assert any(t["id"] == tid for t in r.json())


# --- Attention wiring ---
class TestAttention:
    def test_attention_endpoint_no_error(self, s, h):
        r = s.get(f"{API}/attention", headers=h, timeout=20)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), (list, dict))


def test_cleanup(s, h, created_ids):
    _cleanup(s, h, created_ids)
    for job_id in created_ids["jobs"]:
        try:
            s.delete(f"{API}/jobs/{job_id}", headers=h, timeout=15)
        except Exception:
            pass
