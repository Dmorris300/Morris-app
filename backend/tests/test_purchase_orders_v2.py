"""Morris Purchase Orders V2 — backend endpoint tests.

Covers reference / CRUD / status / goods-received / match-invoice / approve /
pay / stats / project summary / suppliers register / templates / cross-user
isolation. Also verifies previous tool endpoints remain accessible.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://prompt-web-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USER = "darrenhustle300"
ADMIN_PASS = "hustle1234"
SECOND_USER = "sparky01"
SECOND_PASS = "test1234"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def second_token():
    r = requests.post(f"{API}/auth/login", json={"username": SECOND_USER, "password": SECOND_PASS}, timeout=15)
    if r.status_code != 200:
        pytest.skip("second user auth failed")
    return r.json()["token"]


@pytest.fixture(scope="session")
def hdr(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def hdr2(second_token):
    return {"Authorization": f"Bearer {second_token}", "Content-Type": "application/json"}


def _create_po(hdr, **overrides):
    payload = {
        "projectId": overrides.get("projectId") or f"proj-{uuid.uuid4().hex[:6]}",
        "projectName": overrides.get("projectName") or "TEST_Site A",
        "supplierName": overrides.get("supplierName") or "TEST_ACME Supplies",
        "supplierCompany": overrides.get("supplierCompany") or "TEST_ACME Ltd",
        "supplierEmail": "acme@test.local",
        "requiredDate": overrides.get("requiredDate") or "2030-01-01",
        "lineItems": overrides.get("lineItems") or [
            {"description": "Cement bag", "qty": 10, "unitPrice": 5.0, "category": "Materials"},
            {"description": "Sand", "qty": 4, "unitPrice": 12.5, "category": "Materials"},
        ],
        "vatTreatment": "Standard 20%",
        "deliveryCharge": 10.0,
    }
    payload.update({k: v for k, v in overrides.items() if k not in ("lineItems", "projectId", "projectName", "supplierName", "supplierCompany", "requiredDate")})
    r = requests.post(f"{API}/purchase-orders/purchase-orders", headers=hdr, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- reference ----------
class TestReference:
    def test_reference_shape(self, hdr):
        r = requests.get(f"{API}/purchase-orders/reference", headers=hdr, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert len(d["statuses"]) == 9
        assert "Draft" in d["statuses"] and "Paid" in d["statuses"]
        assert len(d["matchStatuses"]) == 3
        assert d["categories"] and d["vatTreatments"] and d["units"] and d["paymentTerms"]


# ---------- create + totals ----------
class TestCreate:
    def test_create_ok_and_totals(self, hdr):
        po = _create_po(hdr)
        # 10*5 + 4*12.5 = 100; +delivery 10 = 110; VAT 20% = 22; total = 132
        t = po["totals"]
        assert t["subtotal"] == 100.0
        assert t["deliveryCharge"] == 10.0
        assert t["vatAmount"] == 22.0
        assert t["total"] == 132.0
        assert po["poRef"].startswith("PO-")
        assert po["matchStatus"] == "Unmatched"
        assert po["status"] == "Draft"

    def test_create_requires_project(self, hdr):
        r = requests.post(f"{API}/purchase-orders/purchase-orders", headers=hdr, json={
            "supplierName": "TEST_x", "lineItems": []}, timeout=15)
        assert r.status_code == 400

    def test_create_requires_supplier(self, hdr):
        r = requests.post(f"{API}/purchase-orders/purchase-orders", headers=hdr, json={
            "projectName": "TEST_no supplier", "lineItems": []}, timeout=15)
        assert r.status_code == 400

    def test_po_ref_auto_sequential(self, hdr):
        a = _create_po(hdr)
        b = _create_po(hdr)
        assert a["poRef"] != b["poRef"]
        assert a["poRef"].startswith("PO-") and b["poRef"].startswith("PO-")


# ---------- list ----------
class TestList:
    def test_list_and_filter(self, hdr):
        po = _create_po(hdr, projectId="proj-filter-x", supplierName="TEST_Filter Co")
        r = requests.get(f"{API}/purchase-orders/purchase-orders", headers=hdr,
                         params={"projectId": "proj-filter-x"}, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert any(x["id"] == po["id"] for x in rows)
        assert all(x["projectId"] == "proj-filter-x" for x in rows)

    def test_list_free_text_q(self, hdr):
        po = _create_po(hdr, supplierName="TEST_UniqueNeedleXYZ")
        r = requests.get(f"{API}/purchase-orders/purchase-orders", headers=hdr,
                         params={"q": "UniqueNeedleXYZ"}, timeout=15)
        assert r.status_code == 200
        assert any(x["id"] == po["id"] for x in r.json())

    def test_list_by_status(self, hdr):
        r = requests.get(f"{API}/purchase-orders/purchase-orders", headers=hdr,
                         params={"status": "Draft"}, timeout=15)
        assert r.status_code == 200
        assert all(x["status"] == "Draft" for x in r.json())


# ---------- get / update / delete ----------
class TestReadUpdate:
    def test_get_returns_matched_and_delivery(self, hdr):
        po = _create_po(hdr)
        r = requests.get(f"{API}/purchase-orders/purchase-orders/{po['id']}", headers=hdr, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["matchedInvoices"] == []
        assert d["delivery"]["qtyOrdered"] == 14
        assert d["delivery"]["percent"] == 0.0

    def test_patch_recomputes_totals(self, hdr):
        po = _create_po(hdr)
        r = requests.patch(f"{API}/purchase-orders/purchase-orders/{po['id']}", headers=hdr,
                           json={"lineItems": [{"description": "x", "qty": 2, "unitPrice": 50}], "deliveryCharge": 0}, timeout=15)
        assert r.status_code == 200
        t = r.json()["totals"]
        assert t["subtotal"] == 100.0
        assert t["vatAmount"] == 20.0
        assert t["total"] == 120.0

    def test_get_404(self, hdr):
        r = requests.get(f"{API}/purchase-orders/purchase-orders/does-not-exist", headers=hdr, timeout=15)
        assert r.status_code == 404


# ---------- status transitions ----------
class TestStatus:
    def test_status_change_audit(self, hdr):
        po = _create_po(hdr)
        r = requests.post(f"{API}/purchase-orders/purchase-orders/{po['id']}/status", headers=hdr,
                         json={"status": "Sent", "note": "sent to supplier"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "Sent"
        assert any(h.get("kind") == "status" and h.get("to") == "Sent" for h in d.get("history") or [])

    def test_status_invalid(self, hdr):
        po = _create_po(hdr)
        r = requests.post(f"{API}/purchase-orders/purchase-orders/{po['id']}/status", headers=hdr,
                         json={"status": "Bogus"}, timeout=15)
        assert r.status_code == 400


# ---------- delivery flow ----------
class TestDelivery:
    def test_part_then_full_delivery(self, hdr):
        po = _create_po(hdr)
        # move to Ordered first
        requests.post(f"{API}/purchase-orders/purchase-orders/{po['id']}/status", headers=hdr,
                     json={"status": "Ordered"}, timeout=10)
        items = po["lineItems"]
        # partial: 5 of first line
        r = requests.post(f"{API}/purchase-orders/purchase-orders/{po['id']}/goods-received", headers=hdr,
                         json={"lines": [{"lineItemId": items[0].get("id", ""), "qty": 5, "description": items[0]["description"]}]}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Part Delivered"
        assert d["delivery"]["qtyReceived"] == 5
        assert d["delivery"]["percent"] < 100
        # full: remaining 5 + 4
        r = requests.post(f"{API}/purchase-orders/purchase-orders/{po['id']}/goods-received", headers=hdr,
                         json={"lines": [
                             {"qty": 5, "description": "line1 rest"},
                             {"qty": 4, "description": "line2 all"},
                         ]}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "Delivered"
        assert d["delivery"]["percent"] == 100.0

    def test_goods_received_requires_lines(self, hdr):
        po = _create_po(hdr)
        r = requests.post(f"{API}/purchase-orders/purchase-orders/{po['id']}/goods-received", headers=hdr,
                         json={"lines": []}, timeout=15)
        assert r.status_code == 400


# ---------- match invoice + approve + pay ----------
class TestMatchInvoice:
    def test_partial_then_full_and_auto_advance(self, hdr):
        po = _create_po(hdr)
        pid = po["id"]
        # Bring to Delivered so match should push to Awaiting Invoice
        requests.post(f"{API}/purchase-orders/purchase-orders/{pid}/goods-received", headers=hdr,
                     json={"lines": [{"qty": 10, "description": "cement"}, {"qty": 4, "description": "sand"}]}, timeout=15)
        # Partial invoice
        r = requests.post(f"{API}/purchase-orders/purchase-orders/{pid}/match-invoice", headers=hdr,
                        json={"invoiceNumber": "INV-TEST-001", "amount": 50.0}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["matchStatus"] == "Partially Matched"
        assert d["status"] == "Awaiting Invoice"  # auto advance
        sid1 = d["createdInvoice"]["id"]
        assert d["createdInvoice"]["status"] == "Draft"

        # Second invoice for remaining balance (total was 132, need 82 more)
        r = requests.post(f"{API}/purchase-orders/purchase-orders/{pid}/match-invoice", headers=hdr,
                        json={"invoiceNumber": "INV-TEST-002", "amount": 82.0, "dueDate": "2030-06-01"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["matchStatus"] == "Fully Matched"
        sid2 = d["createdInvoice"]["id"]

        # Approve both
        for sid in (sid1, sid2):
            r = requests.post(f"{API}/purchase-orders/matched-invoices/{sid}/approve", headers=hdr, timeout=15)
            assert r.status_code == 200
            assert r.json()["status"] == "Approved"

        # Pay both -> PO should become Paid
        for sid in (sid1, sid2):
            r = requests.post(f"{API}/purchase-orders/matched-invoices/{sid}/pay", headers=hdr, timeout=15)
            assert r.status_code == 200
            assert r.json()["status"] == "Paid"

        r = requests.get(f"{API}/purchase-orders/purchase-orders/{pid}", headers=hdr, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "Paid"

    def test_match_invoice_rejects_zero_or_negative(self, hdr):
        po = _create_po(hdr)
        r = requests.post(f"{API}/purchase-orders/purchase-orders/{po['id']}/match-invoice", headers=hdr,
                        json={"invoiceNumber": "INV-BAD", "amount": 0}, timeout=15)
        assert r.status_code == 400
        r = requests.post(f"{API}/purchase-orders/purchase-orders/{po['id']}/match-invoice", headers=hdr,
                        json={"invoiceNumber": "INV-BAD", "amount": -10}, timeout=15)
        assert r.status_code == 400

    def test_unlink_matched_recomputes(self, hdr):
        po = _create_po(hdr)
        pid = po["id"]
        r = requests.post(f"{API}/purchase-orders/purchase-orders/{pid}/match-invoice", headers=hdr,
                        json={"invoiceNumber": "INV-UNLINK", "amount": 132.0}, timeout=15)
        assert r.status_code == 200
        sid = r.json()["createdInvoice"]["id"]
        assert r.json()["matchStatus"] == "Fully Matched"
        r = requests.delete(f"{API}/purchase-orders/purchase-orders/{pid}/matched-invoice/{sid}", headers=hdr, timeout=15)
        assert r.status_code == 200
        assert r.json()["matchStatus"] == "Unmatched"


# ---------- stats + project summary ----------
class TestStats:
    def test_stats_shape(self, hdr):
        _create_po(hdr)
        r = requests.get(f"{API}/purchase-orders/stats", headers=hdr, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("total", "draft", "sent", "approved", "ordered", "partDelivered",
                  "delivered", "awaitingInvoice", "paid", "cancelled",
                  "committedValue", "paidValue", "awaitingInvoiceValue", "recent"):
            assert k in d, f"missing {k}"
        assert isinstance(d["recent"], list)

    def test_project_summary(self, hdr):
        jid = f"proj-summary-{uuid.uuid4().hex[:6]}"
        _create_po(hdr, projectId=jid)
        _create_po(hdr, projectId=jid)
        r = requests.get(f"{API}/purchase-orders/project/{jid}/summary", headers=hdr, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["projectId"] == jid
        assert d["totalPurchaseOrders"] >= 2


# ---------- suppliers register ----------
class TestSuppliers:
    def test_suppliers_aggregate_from_po(self, hdr):
        unique = f"TEST_Aggr_{uuid.uuid4().hex[:5]}"
        po = _create_po(hdr, supplierName=unique, supplierCompany=unique + " Ltd")
        r = requests.get(f"{API}/purchase-orders/suppliers", headers=hdr, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        match = [x for x in rows if x.get("name") == unique or x.get("company") == unique + " Ltd"]
        assert match, f"supplier not aggregated. sample: {rows[:2]}"
        s = match[0]
        assert s["poCount"] >= 1
        assert "totalSpend" in s and "outstandingPOs" in s and "outstandingValue" in s
        assert s.get("lastPORef") == po["poRef"]

    def test_supplier_crud(self, hdr):
        name = f"TEST_Manual_{uuid.uuid4().hex[:5]}"
        r = requests.post(f"{API}/purchase-orders/suppliers", headers=hdr,
                        json={"name": name, "email": "m@t.local"}, timeout=15)
        assert r.status_code == 200
        sid = r.json()["id"]
        r = requests.delete(f"{API}/purchase-orders/suppliers/{sid}", headers=hdr, timeout=15)
        assert r.status_code == 200

    def test_supplier_requires_name(self, hdr):
        r = requests.post(f"{API}/purchase-orders/suppliers", headers=hdr,
                        json={"name": "", "company": ""}, timeout=15)
        assert r.status_code == 400


# ---------- templates ----------
class TestTemplates:
    def test_template_roundtrip(self, hdr):
        r = requests.post(f"{API}/purchase-orders/templates", headers=hdr,
                        json={"name": "TEST_Tpl", "payload": {"lineItems": [{"description": "brick", "qty": 100, "unitPrice": 0.4}]}}, timeout=15)
        assert r.status_code == 200
        tid = r.json()["id"]
        r = requests.get(f"{API}/purchase-orders/templates", headers=hdr, timeout=15)
        assert r.status_code == 200
        assert any(x["id"] == tid for x in r.json())
        r = requests.delete(f"{API}/purchase-orders/templates/{tid}", headers=hdr, timeout=15)
        assert r.status_code == 200


# ---------- cross-user isolation ----------
class TestIsolation:
    def test_second_user_cannot_read_admin_po(self, hdr, hdr2):
        po = _create_po(hdr)
        r = requests.get(f"{API}/purchase-orders/purchase-orders/{po['id']}", headers=hdr2, timeout=15)
        assert r.status_code == 404


# ---------- global search + command centre ----------
class TestGlobalSearchAndAttention:
    def test_global_search_finds_po(self, hdr):
        po = _create_po(hdr)
        ref = po["poRef"]
        r = requests.get(f"{API}/search", headers=hdr, params={"q": ref, "scope": "purchase-orders"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # response shape may vary; look for any hit that references the PO id or ref
        raw = str(data).lower()
        assert ref.lower() in raw or po["id"] in raw
        assert "/app/purchase-orders?open=" in raw or "purchase-orders" in raw

    def test_command_centre_attention_shape(self, hdr):
        # Create an overdue PO and move to Sent so collect_purchase_order_attention picks it up
        po = _create_po(hdr, requiredDate="2020-01-01")
        r = requests.post(f"{API}/purchase-orders/purchase-orders/{po['id']}/status", headers=hdr,
                         json={"status": "Sent"}, timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{API}/attention", headers=hdr, timeout=15)
        assert r.status_code == 200, r.text
        raw = str(r.json()).lower()
        # Just verify po attention kinds are wired
        assert "po_late" in raw or "po_awaiting_invoice" in raw or "purchase-orders" in raw


# ---------- previous tools regressions ----------
class TestPrevToolsUnbroken:
    @pytest.mark.parametrize("path", [
        "/variation-orders/reference",
        "/applications-for-payment/reference",
        "/invoice-builder/reference",
        "/variation-orders/stats",
        "/applications-for-payment/stats",
        "/invoice-builder/stats",
    ])
    def test_prev_tools(self, hdr, path):
        r = requests.get(f"{API}{path}", headers=hdr, timeout=15)
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
