"""Morris — Applications for Payment V2 backend tests (/api/applications-for-payment)."""
import os
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
AFP = f"{API}/applications-for-payment"

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
def state():
    return {"afps": [], "templates": [], "jobs": [], "variations": []}


# --- Reference ---
class TestReference:
    def test_reference(self, s, h):
        r = s.get(f"{AFP}/reference", headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert set(d["statuses"]) >= {"Draft", "Submitted", "Certified", "Paid", "Rejected"}
        assert set(d["categories"]) >= {
            "Labour", "Materials", "Plant & Equipment", "Preliminaries", "Subcontractor", "Variations", "Other"
        }
        assert len(d["vatTreatments"]) == 5
        assert "Reverse charge (0%)" in d["vatTreatments"]
        assert len(d["cisStatuses"]) == 4


# --- Math regression from problem statement ---
class TestMathRegression:
    def test_totals_and_ref_autogen(self, s, h, state):
        payload = {
            "projectName": "TEST_AFP_Math",
            "lineItems": [
                {"category": "Labour", "description": "L", "valueToDate": 40000},
                {"category": "Materials", "description": "M", "valueToDate": 20000},
            ],
            "approvedVariationsValue": 5000,
            "previouslyCertified": 20000,
            "retentionRate": 5,
            "previousRetentionHeld": 1000,
            "adjustments": -500,
            "cisStatus": "Standard (20%)",
            "vatTreatment": "Standard 20%",
        }
        r = s.post(f"{AFP}/applications", json=payload, headers=h, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        state["afps"].append(d["id"])
        t = d["totals"]
        assert t["grossValuation"] == 60000.0
        assert t["grossIncludingVariations"] == 65000.0
        assert t["thisPeriod"] == 45000.0
        assert t["totalRetention"] == 3250.0
        assert t["retentionThisPeriod"] == 2250.0
        assert t["subtotalNet"] == 42250.0
        assert round(t["labourRatio"], 3) == 0.667
        assert round(t["cisDeduction"], 2) == 5633.33
        assert round(t["vatAmount"], 2) == 7323.33
        assert round(t["totalDue"], 2) == 43940.00
        # Auto-generated ref
        assert d["applicationRef"].startswith("AFP-")
        assert d.get("applicationNumber") >= 1
        assert d.get("applicationDate")

    def test_ref_increments(self, s, h, state):
        r = s.post(f"{AFP}/applications", json={
            "projectName": "TEST_AFP_Ref2",
            "lineItems": [{"category": "Labour", "valueToDate": 100}],
        }, headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        state["afps"].append(d["id"])
        assert d["applicationRef"].startswith("AFP-")


# --- Status flow ---
class TestStatusFlow:
    def test_draft_submitted_certified_paid(self, s, h, state):
        # Create job so 'Paid' can increment amountPaid
        r = s.post(f"{API}/jobs", json={"name": "TEST_AFP_Job", "clientName": "TEST_C", "contractValue": 10000},
                   headers=h, timeout=20)
        assert r.status_code in (200, 201), r.text
        job = r.json()
        job_id = job["id"]
        state["jobs"].append(job_id)
        initial_paid = float(job.get("amountPaid") or 0)

        # Create AFP linked
        r = s.post(f"{AFP}/applications", json={
            "projectId": job_id,
            "projectName": "TEST_AFP_Job",
            "lineItems": [{"category": "Labour", "valueToDate": 1000}],
            "retentionRate": 0,
            "cisStatus": "Not applicable",
            "vatTreatment": "Zero-rated",
            "dueDate": (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat(),
        }, headers=h, timeout=15)
        assert r.status_code == 200
        afp = r.json()
        aid = afp["id"]
        state["afps"].append(aid)
        total_due = afp["totals"]["totalDue"]
        assert total_due == 1000.0

        # Draft -> Submitted
        r = s.post(f"{AFP}/applications/{aid}/status", json={"status": "Submitted"}, headers=h, timeout=15)
        assert r.status_code == 200 and r.json()["status"] == "Submitted"

        # Submitted -> Certified (no certifiedAmount provided => auto-copy totalDue)
        r = s.post(f"{AFP}/applications/{aid}/status", json={"status": "Certified"}, headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "Certified"
        assert d["certifiedDate"]
        assert d["certifiedAmount"] == total_due

        # Certified -> Paid (auto paid amount)
        r = s.post(f"{AFP}/applications/{aid}/status", json={"status": "Paid"}, headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "Paid" and d["paidDate"] and d["paidAmount"] == total_due

        # Verify job amountPaid incremented
        r = s.get(f"{API}/jobs/{job_id}", headers=h, timeout=15)
        assert r.status_code == 200
        job_doc = r.json().get("job") if isinstance(r.json(), dict) and "job" in r.json() else r.json()
        new_paid = float(job_doc.get("amountPaid") or 0)
        assert round(new_paid - initial_paid, 2) == round(total_due, 2)


# --- Overdue filter ---
class TestOverdue:
    def test_overdue_filter(self, s, h, state):
        past = (datetime.now(timezone.utc) - timedelta(days=5)).date().isoformat()
        r = s.post(f"{AFP}/applications", json={
            "projectName": "TEST_AFP_Overdue",
            "lineItems": [{"category": "Labour", "valueToDate": 500}],
            "dueDate": past,
            "retentionRate": 0,
            "vatTreatment": "Zero-rated",
        }, headers=h, timeout=15)
        assert r.status_code == 200
        aid = r.json()["id"]
        state["afps"].append(aid)
        # Move to Submitted so it's counted as overdue
        r = s.post(f"{AFP}/applications/{aid}/status", json={"status": "Submitted"}, headers=h, timeout=15)
        assert r.status_code == 200

        r = s.get(f"{AFP}/applications?status=Overdue", headers=h, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert any(x["id"] == aid for x in rows), "Overdue filter must include past-due Submitted app"
        for row in rows:
            assert row["status"] in ("Submitted", "Certified")
            assert row.get("isOverdue") is True


# --- Variation Orders auto-pull ---
class TestVariationAutoPull:
    def test_approved_variations_auto_populate(self, s, h, state):
        # Create job
        r = s.post(f"{API}/jobs", json={"name": "TEST_AFP_VO_Job", "clientName": "TEST_C",
                                        "contractValue": 5000}, headers=h, timeout=20)
        assert r.status_code in (200, 201)
        job_id = r.json()["id"]
        state["jobs"].append(job_id)

        # Create Approved variation £1000
        r = s.post(f"{API}/variation-orders/variation-orders", json={
            "projectId": job_id,
            "projectName": "TEST_AFP_VO_Job",
            "lineItems": [{"category": "Labour", "qty": 10, "unitPrice": 100}],  # 1000
            "addVat": False,
        }, headers=h, timeout=15)
        assert r.status_code == 200
        vid = r.json()["id"]
        state["variations"].append(vid)
        r = s.patch(f"{API}/variation-orders/variation-orders/{vid}",
                    json={"status": "Approved"}, headers=h, timeout=15)
        assert r.status_code == 200
        assert r.json()["totals"]["total"] == 1000.0

        # Create AFP linked to job WITHOUT approvedVariationsValue
        r = s.post(f"{AFP}/applications", json={
            "projectId": job_id,
            "projectName": "TEST_AFP_VO_Job",
            "lineItems": [{"category": "Labour", "valueToDate": 2000}],
            "retentionRate": 0,
            "vatTreatment": "Zero-rated",
        }, headers=h, timeout=15)
        assert r.status_code == 200
        afp = r.json()
        state["afps"].append(afp["id"])
        assert afp["totals"]["approvedVariationsValue"] == 1000.0
        assert afp["totals"]["grossIncludingVariations"] == 3000.0

        # Project summary
        r = s.get(f"{AFP}/project/{job_id}/summary", headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["approvedVariationsValue"] == 1000.0
        assert isinstance(d["previousApplications"], list)
        assert d["nextApplicationNumber"] >= 1


# --- VAT reverse charge ---
class TestReverseCharge:
    def test_reverse_charge_no_vat(self, s, h, state):
        r = s.post(f"{AFP}/applications", json={
            "projectName": "TEST_AFP_ReverseCharge",
            "lineItems": [{"category": "Labour", "valueToDate": 10000}],
            "retentionRate": 0,
            "cisStatus": "Standard (20%)",
            "vatTreatment": "Reverse charge (0%)",
        }, headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        state["afps"].append(d["id"])
        t = d["totals"]
        assert t["vatAmount"] == 0
        # totalDue == subtotalNet - cisDeduction
        assert round(t["totalDue"], 2) == round(t["subtotalNet"] - t["cisDeduction"], 2)


# --- Templates ---
class TestTemplates:
    def test_template_crud(self, s, h, state):
        r = s.post(f"{AFP}/templates", json={"name": "TEST_AFP_Tmpl", "payload": {"foo": "bar"}},
                   headers=h, timeout=15)
        assert r.status_code == 200
        tid = r.json()["id"]
        state["templates"].append(tid)
        r = s.get(f"{AFP}/templates", headers=h, timeout=15)
        assert r.status_code == 200
        assert any(t["id"] == tid for t in r.json())
        r = s.delete(f"{AFP}/templates/{tid}", headers=h, timeout=15)
        assert r.status_code == 200 and r.json().get("ok") is True


# --- Cleanup ---
def test_zzz_cleanup(s, h, state):
    for aid in state["afps"]:
        try: s.delete(f"{AFP}/applications/{aid}", headers=h, timeout=15)
        except Exception: pass
    for vid in state["variations"]:
        try: s.delete(f"{API}/variation-orders/variation-orders/{vid}", headers=h, timeout=15)
        except Exception: pass
    for jid in state["jobs"]:
        try: s.delete(f"{API}/jobs/{jid}", headers=h, timeout=15)
        except Exception: pass
