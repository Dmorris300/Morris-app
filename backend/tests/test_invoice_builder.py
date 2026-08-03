"""Invoice Builder V2 — backend tests."""
import os
import time
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://prompt-web-4.preview.emergentagent.com").rstrip("/")
USERNAME = "darrenhustle300"
PASSWORD = "hustle1234"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": USERNAME, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="session")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ---------------- Reference ----------------
def test_reference(client):
    r = client.get(f"{BASE_URL}/api/invoice-builder/reference")
    assert r.status_code == 200
    d = r.json()
    for s in ["Draft", "Sent", "Paid", "Part Paid", "Overdue", "Cancelled"]:
        assert s in d["statuses"]
    assert len(d["vatTreatments"]) == 5
    assert len(d["cisStatuses"]) == 4
    assert "Net 30" in d["paymentTerms"]
    assert "Labour" in d["categories"]


# ---------------- CRUD + math ----------------
@pytest.fixture(scope="session")
def created_invoice(client):
    body = {
        "projectName": "TEST_InvBuilder Project",
        "clientName": "TEST_Client",
        "clientCompany": "TEST_ClientCo",
        "invoiceDate": "2026-08-03",
        "paymentTerms": "Net 30",
        "cisStatus": "Standard (20%)",
        "vatTreatment": "Standard 20%",
        "lineItems": [
            {"category": "Labour", "description": "Labour L1", "qty": 3, "unit": "day", "unitPrice": 1000},
            {"category": "Materials", "description": "Mat", "qty": 1, "unit": "item", "unitPrice": 2000},
        ],
    }
    r = client.post(f"{BASE_URL}/api/invoice-builder/invoices", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_totals_and_defaults(created_invoice):
    inv = created_invoice
    t = inv["totals"]
    assert t["subtotal"] == 5000
    assert t["labourRatio"] == 0.6
    assert t["cisDeduction"] == 600
    assert t["vatAmount"] == 880
    assert t["totalDue"] == 5280
    assert inv["dueDate"] == "2026-09-02"
    assert inv["invoiceRef"].startswith("INV-2026-")
    assert inv["status"] == "Draft"


def test_get_persists(client, created_invoice):
    r = client.get(f"{BASE_URL}/api/invoice-builder/invoices/{created_invoice['id']}")
    assert r.status_code == 200
    assert r.json()["invoiceRef"] == created_invoice["invoiceRef"]


# ---------------- Reverse charge ----------------
def test_reverse_charge(client):
    body = {
        "projectName": "TEST_RCharge",
        "clientCompany": "TEST_RCClient",
        "cisStatus": "Standard (20%)",
        "vatTreatment": "Reverse charge (0%)",
        "invoiceDate": "2026-08-03",
        "paymentTerms": "Net 30",
        "lineItems": [{"category": "Labour", "description": "labour only", "qty": 1, "unit": "item", "unitPrice": 5000}],
    }
    r = client.post(f"{BASE_URL}/api/invoice-builder/invoices", json=body)
    assert r.status_code == 200
    t = r.json()["totals"]
    assert t["vatAmount"] == 0
    assert t["cisDeduction"] == 1000
    assert t["totalDue"] == 4000


# ---------------- Status flow ----------------
def test_status_and_payments(client, created_invoice):
    iid = created_invoice["id"]
    # Draft -> Sent
    r = client.post(f"{BASE_URL}/api/invoice-builder/invoices/{iid}/status", json={"status": "Sent"})
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "Sent"
    assert d.get("sentAt")

    # Part payment
    r = client.post(f"{BASE_URL}/api/invoice-builder/invoices/{iid}/payment", json={"amount": 1000, "method": "BACS"})
    assert r.status_code == 200
    assert r.json()["status"] == "Part Paid"

    # Pay remainder
    r = client.post(f"{BASE_URL}/api/invoice-builder/invoices/{iid}/payment", json={"amount": 4280, "method": "BACS"})
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "Paid"
    assert d.get("paidAt")


# ---------------- Overdue ----------------
def test_overdue_derived(client):
    yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    body = {
        "projectName": "TEST_Overdue",
        "clientCompany": "TEST_OverdueCo",
        "invoiceDate": (datetime.now(timezone.utc).date() - timedelta(days=40)).isoformat(),
        "dueDate": yesterday,
        "paymentTerms": "Net 30",
        "status": "Sent",
        "lineItems": [{"category": "Labour", "description": "x", "qty": 1, "unit": "item", "unitPrice": 1000}],
    }
    r = client.post(f"{BASE_URL}/api/invoice-builder/invoices", json=body)
    assert r.status_code == 200
    inv = r.json()
    iid = inv["id"]

    # list should show it as Overdue
    r = client.get(f"{BASE_URL}/api/invoice-builder/invoices")
    assert r.status_code == 200
    rows = r.json()
    matching = [x for x in rows if x["id"] == iid]
    assert matching, "created overdue invoice not in list"
    assert matching[0]["status"] == "Overdue"
    assert matching[0]["isOverdue"] is True

    # filter status=Overdue
    r = client.get(f"{BASE_URL}/api/invoice-builder/invoices", params={"status": "Overdue"})
    assert r.status_code == 200
    assert any(x["id"] == iid for x in r.json())

    # remind endpoint
    r = client.post(f"{BASE_URL}/api/invoice-builder/invoices/{iid}/remind")
    assert r.status_code == 200
    d = r.json()
    assert d["remindCount"] >= 1
    assert d.get("remindedAt")


# ---------------- From AFP ----------------
def test_from_application(client):
    # Create a project + AFP with Certified status
    afp_body = {
        "projectName": "TEST_AFPForInv",
        "clientCompany": "TEST_AFPClient",
        "vatTreatment": "Standard 20%",
        "cisStatus": "Standard (20%)",
        "lineItems": [{"category": "Labour", "description": "wk1", "qty": 1, "unit": "item", "unitPrice": 3000}],
    }
    r = client.post(f"{BASE_URL}/api/applications-for-payment/applications", json=afp_body)
    if r.status_code != 200:
        pytest.skip(f"AFP module unavailable: {r.status_code}")
    afp = r.json()
    aid = afp["id"]
    # Mark as Certified with a certified amount
    cert_amt = float((afp.get("totals") or {}).get("totalDue") or 3000)
    r = client.post(f"{BASE_URL}/api/applications-for-payment/applications/{aid}/status",
                    json={"status": "Certified", "certifiedAmount": cert_amt})
    # Might not include certifiedAmount in payload — try patch
    if r.status_code != 200:
        client.patch(f"{BASE_URL}/api/applications-for-payment/applications/{aid}",
                     json={"certifiedAmount": cert_amt, "status": "Certified"})

    r = client.get(f"{BASE_URL}/api/invoice-builder/from-application/{aid}")
    assert r.status_code == 200, r.text
    draft = r.json()
    assert draft["linkedApplicationId"] == aid
    assert draft["linkedApplicationRef"]
    assert len(draft["lineItems"]) == 1
    assert draft["lineItems"][0]["category"] == "Application for Payment"


# ---------------- From Variation ----------------
def test_from_variation(client):
    vo_body = {
        "projectName": "TEST_VOForInv",
        "clientCompany": "TEST_VOClient",
        "lineItems": [
            {"category": "Labour", "description": "extra", "qty": 2, "unit": "day", "unitPrice": 500},
            {"category": "Materials", "description": "mat", "qty": 1, "unit": "item", "unitPrice": 300},
        ],
        "addVat": True,
    }
    r = client.post(f"{BASE_URL}/api/variation-orders/variation-orders", json=vo_body)
    if r.status_code != 200:
        pytest.skip(f"VO module unavailable: {r.status_code}")
    vo = r.json()
    vid = vo["id"]
    r = client.get(f"{BASE_URL}/api/invoice-builder/from-variation/{vid}")
    assert r.status_code == 200
    draft = r.json()
    assert draft["linkedVariationId"] == vid
    assert draft["linkedVariationRef"]
    assert len(draft["lineItems"]) == 2


# ---------------- Templates ----------------
def test_templates_crud(client):
    r = client.post(f"{BASE_URL}/api/invoice-builder/templates", json={"name": "TEST_Tpl", "payload": {"vatTreatment": "Standard 20%"}})
    assert r.status_code == 200
    tid = r.json()["id"]

    r = client.get(f"{BASE_URL}/api/invoice-builder/templates")
    assert r.status_code == 200
    assert any(t["id"] == tid for t in r.json())

    r = client.delete(f"{BASE_URL}/api/invoice-builder/templates/{tid}")
    assert r.status_code == 200


# ---------------- Stats ----------------
def test_stats(client):
    r = client.get(f"{BASE_URL}/api/invoice-builder/stats")
    assert r.status_code == 200
    d = r.json()
    for k in ["draft", "sent", "partPaid", "paid", "overdue", "cancelled",
              "outstandingValue", "overdueValue", "paidValue", "billedValue", "recent"]:
        assert k in d
