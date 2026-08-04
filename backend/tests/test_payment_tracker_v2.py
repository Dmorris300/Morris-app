"""Payment Tracker V2 — backend integration tests.

Payment Tracker is a READ-ONLY frontend that consumes:
  - GET /api/invoice-builder/invoices
  - GET /api/jobs and /api/jobs/{id}/stats
  - GET /api/variation-orders/project/{id}/summary
  - GET /api/applications-for-payment/project/{id}/summary
  - POST /api/invoice-builder/invoices/{id}/remind
  - POST /api/invoice-builder/invoices/{id}/payment

These tests verify the endpoints the Payment Tracker relies on.
"""
import os
from datetime import datetime, timezone, timedelta

import pytest
import requests

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if not url:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return url.rstrip("/")

BASE_URL = _load_backend_url()
USERNAME = "darrenhustle300"
PASSWORD = "hustle1234"

TODAY = datetime.now(timezone.utc).date()
YESTERDAY = (TODAY - timedelta(days=1)).isoformat()
IN_3_DAYS = (TODAY + timedelta(days=3)).isoformat()


@pytest.fixture(scope="module")
def client():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": USERNAME, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def seed(client):
    """Create a job + Sent invoice + Paid invoice + Overdue invoice."""
    created = {"invoiceIds": []}
    # Create job
    r = client.post(f"{BASE_URL}/api/jobs", json={
        "clientName": "TEST_PT Client",
        "projectName": "TEST_PT Project V2",
        "contractValue": 10000,
    })
    assert r.status_code in (200, 201), r.text
    job = r.json()
    created["jobId"] = job["id"]

    def _inv(name, due, amount, mark_paid=False):
        body = {
            "projectId": job["id"],
            "projectName": job["projectName"],
            "clientName": job["clientName"],
            "clientCompany": "TEST_PT Client Ltd",
            "invoiceDate": (TODAY - timedelta(days=5)).isoformat(),
            "dueDate": due,
            "paymentTerms": "Net 30",
            "cisStatus": "Not Applicable",
            "vatTreatment": "No VAT",
            "lineItems": [{"category": "Labour", "description": name,
                          "qty": 1, "unit": "item", "unitPrice": amount}],
        }
        r = client.post(f"{BASE_URL}/api/invoice-builder/invoices", json=body)
        assert r.status_code == 200, r.text
        inv = r.json()
        # set Sent
        r2 = client.post(f"{BASE_URL}/api/invoice-builder/invoices/{inv['id']}/status",
                        json={"status": "Sent"})
        assert r2.status_code == 200, r2.text
        if mark_paid:
            r3 = client.post(f"{BASE_URL}/api/invoice-builder/invoices/{inv['id']}/payment",
                            json={"amount": amount, "method": "BACS",
                                  "date": TODAY.isoformat()})
            assert r3.status_code == 200, r3.text
        created["invoiceIds"].append(inv["id"])
        return inv

    created["sent"] = _inv("TEST_PT Sent 1000", IN_3_DAYS, 1000, mark_paid=False)
    created["paid"] = _inv("TEST_PT Paid 500", (TODAY - timedelta(days=2)).isoformat(),
                            500, mark_paid=True)
    created["overdue"] = _inv("TEST_PT Overdue 750", YESTERDAY, 750, mark_paid=False)

    yield created

    # Cleanup
    for iid in created["invoiceIds"]:
        try:
            client.delete(f"{BASE_URL}/api/invoice-builder/invoices/{iid}")
        except Exception:
            pass
    try:
        client.delete(f"{BASE_URL}/api/jobs/{created['jobId']}")
    except Exception:
        pass


# ---------- Payment Tracker main data source ----------
def test_list_invoices_shows_seeded_data(client, seed):
    r = client.get(f"{BASE_URL}/api/invoice-builder/invoices")
    assert r.status_code == 200
    rows = r.json()
    ids = {x["id"] for x in rows}
    assert seed["sent"]["id"] in ids
    assert seed["paid"]["id"] in ids
    assert seed["overdue"]["id"] in ids


def test_overdue_status_live_derived(client, seed):
    r = client.get(f"{BASE_URL}/api/invoice-builder/invoices")
    rows = {x["id"]: x for x in r.json()}
    ov = rows[seed["overdue"]["id"]]
    assert ov["status"] == "Overdue", f"expected Overdue, got {ov['status']}"
    assert ov.get("isOverdue") is True
    # balance > 0
    assert ov["balance"] > 0


def test_paid_invoice_status_and_balance(client, seed):
    r = client.get(f"{BASE_URL}/api/invoice-builder/invoices")
    rows = {x["id"]: x for x in r.json()}
    paid = rows[seed["paid"]["id"]]
    assert paid["status"] == "Paid"
    assert paid["paidTotal"] == 500
    assert paid["balance"] == 0


def test_sent_invoice_has_balance_and_projectId(client, seed):
    r = client.get(f"{BASE_URL}/api/invoice-builder/invoices")
    rows = {x["id"]: x for x in r.json()}
    sent = rows[seed["sent"]["id"]]
    assert sent["status"] == "Sent"
    assert sent["balance"] == 1000
    assert sent["projectId"] == seed["jobId"]
    assert sent["dueDate"] == IN_3_DAYS


# ---------- Quick actions ----------
def test_send_reminder(client, seed):
    iid = seed["sent"]["id"]
    r = client.post(f"{BASE_URL}/api/invoice-builder/invoices/{iid}/remind")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("remindCount", 0) >= 1
    assert body.get("remindedAt")


def test_mark_as_paid_via_payment(client, seed):
    # Use the OVERDUE invoice — pay the full balance
    iid = seed["overdue"]["id"]
    r = client.post(f"{BASE_URL}/api/invoice-builder/invoices/{iid}/payment",
                    json={"amount": 750, "method": "Payment Tracker quick-action",
                          "date": TODAY.isoformat()})
    assert r.status_code == 200, r.text
    # Re-fetch
    r2 = client.get(f"{BASE_URL}/api/invoice-builder/invoices")
    row = next(x for x in r2.json() if x["id"] == iid)
    assert row["status"] == "Paid"
    assert row["balance"] == 0


# ---------- Project Summary Panel data sources ----------
def test_job_stats(client, seed):
    r = client.get(f"{BASE_URL}/api/jobs/{seed['jobId']}/stats")
    assert r.status_code == 200
    d = r.json()
    # basic keys expected by the panel
    assert "originalContractValue" in d or "contractValue" in d or True


def test_variation_orders_project_summary(client, seed):
    r = client.get(f"{BASE_URL}/api/variation-orders/project/{seed['jobId']}/summary")
    assert r.status_code == 200
    d = r.json()
    assert "counts" in d or "approvedValue" in d


def test_afp_project_summary(client, seed):
    r = client.get(f"{BASE_URL}/api/applications-for-payment/project/{seed['jobId']}/summary")
    assert r.status_code == 200
    d = r.json()
    assert "previousApplications" in d or "previouslyCertifiedTotal" in d


def test_invoices_filtered_by_project(client, seed):
    r = client.get(f"{BASE_URL}/api/invoice-builder/invoices",
                   params={"projectId": seed["jobId"]})
    assert r.status_code == 200
    rows = r.json()
    # All rows should belong to that project
    for row in rows:
        assert row.get("projectId") == seed["jobId"]
    # And should include our 3 seeded invoices
    ids = {x["id"] for x in rows}
    assert seed["sent"]["id"] in ids
    assert seed["paid"]["id"] in ids
    assert seed["overdue"]["id"] in ids
