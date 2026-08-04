"""
Morris V1 Release Readiness — cross-tool regression + integration tests.

Covers:
  1) Regression: all V2 flagship endpoints respond 200 for admin.
  2) Integration: commercial trilogy (VO → AFP → INV → payment).
  3) Global Search deep-link URLs (verifies each result carries the right route).
  4) Command Centre backdated variation surfaces in /api/attention.
  5) Multi-user isolation (sparky01 cannot see admin data).
  6) Unauth 401/403 (not 500).
  7) Performance timing (<500ms informational).
"""
import os
import time
import uuid
import asyncio
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

ADMIN_USER = {"username": "darrenhustle300", "password": "hustle1234"}
SPARKY_USER = {"username": "sparky01", "password": "test1234"}


def _login(user):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=user, timeout=20)
    assert r.status_code == 200, f"login failed for {user['username']}: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok, f"no token for {user['username']}"
    return tok


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_USER)


@pytest.fixture(scope="module")
def sparky_token():
    return _login(SPARKY_USER)


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- 1. REGRESSION: all V2 endpoints respond 200 ----------
V2_ENDPOINTS = [
    # site diary
    "/api/site-diary/entries",
    "/api/site-diary/stats",
    "/api/site-diary/templates",
    "/api/site-diary/reference",
    # incident report
    "/api/incident-report/entries",
    "/api/incident-report/stats",
    "/api/incident-report/templates",
    "/api/incident-report/reference",
    # risk assessment (singular)
    "/api/risk-assessment/entries",
    "/api/risk-assessment/stats",
    "/api/risk-assessment/templates",
    "/api/risk-assessment/reference",
    # quote builder
    "/api/quote-builder/quotes",
    "/api/quote-builder/stats",
    "/api/quote-builder/templates",
    "/api/quote-builder/reference",
    "/api/quote-builder/clients",
    # variation orders
    "/api/variation-orders/variation-orders",
    "/api/variation-orders/stats",
    "/api/variation-orders/templates",
    "/api/variation-orders/reference",
    # applications for payment
    "/api/applications-for-payment/applications",
    "/api/applications-for-payment/stats",
    "/api/applications-for-payment/templates",
    "/api/applications-for-payment/reference",
    # invoice builder
    "/api/invoice-builder/invoices",
    "/api/invoice-builder/stats",
    "/api/invoice-builder/templates",
    "/api/invoice-builder/reference",
    # cross-cutting
    "/api/search?q=test",
    "/api/attention",
    "/api/jobs",
    "/api/documents",
]


@pytest.mark.parametrize("path", V2_ENDPOINTS)
def test_v2_endpoint_responds_200(admin_token, path):
    t0 = time.time()
    r = requests.get(f"{BASE_URL}{path}", headers=H(admin_token), timeout=30)
    elapsed = (time.time() - t0) * 1000
    assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:200]}"
    # informational perf log
    if elapsed > 500:
        print(f"[perf] SLOW {path} took {elapsed:.0f}ms")


# ---------- 2. INTEGRATION: commercial trilogy ----------
@pytest.fixture(scope="module")
def commercial_flow(admin_token):
    """Create project → approved VO → AFP → certified → invoice → paid."""
    created = {}
    h = H(admin_token)

    # 1. Create project
    proj = {
        "clientName": "TEST_ReleaseReadiness Client",
        "projectName": "TEST_RR Commercial Trilogy",
        "address": "1 Test St, EC1A 1AA",
        "contractValue": 50000,
    }
    r = requests.post(f"{BASE_URL}/api/jobs", headers=h, json=proj, timeout=20)
    assert r.status_code in (200, 201), f"create job: {r.status_code} {r.text}"
    job = r.json()
    created["job"] = job
    job_id = job["id"]

    # 2. Create + Approve VO
    vo_body = {
        "projectId": job_id,
        "projectName": job.get("projectName"),
        "clientName": job.get("clientName"),
        "descriptionOfChange": "TEST_RR extra socket circuits",
        "reason": "Client request",
        "lineItems": [
            {"id": str(uuid.uuid4()), "description": "Additional circuits", "qty": 1, "unit": "item", "unitPrice": 3000, "category": "Labour"}
        ],
        "addVat": True,
        "vatRate": 20,
    }
    r = requests.post(f"{BASE_URL}/api/variation-orders/variation-orders", headers=h, json=vo_body, timeout=20)
    assert r.status_code == 200, f"create VO: {r.status_code} {r.text}"
    vo = r.json()
    created["vo"] = vo

    # Approve it
    r = requests.patch(
        f"{BASE_URL}/api/variation-orders/variation-orders/{vo['id']}",
        headers=h, json={"status": "Approved"}, timeout=20,
    )
    assert r.status_code == 200, f"approve VO: {r.status_code} {r.text}"
    vo_approved = r.json()
    assert vo_approved["status"] == "Approved"
    assert vo_approved.get("approvedDate"), "approvedDate should be stamped on approval"
    vo_total_inc = float((vo_approved.get("totals") or {}).get("total") or 0)

    # 3. Create AFP for the project — must auto-pull approvedVariationsValue
    afp_body = {
        "projectId": job_id,
        "projectName": job.get("projectName"),
        "clientName": job.get("clientName"),
        "lineItems": [
            {"id": str(uuid.uuid4()), "description": "Contract work to date", "qty": 1, "unit": "item", "unitPrice": 10000, "category": "Labour"}
        ],
        "addVat": True,
        "vatRate": 20,
    }
    r = requests.post(f"{BASE_URL}/api/applications-for-payment/applications", headers=h, json=afp_body, timeout=20)
    assert r.status_code == 200, f"create AFP: {r.status_code} {r.text}"
    afp = r.json()
    created["afp"] = afp
    # approvedVariationsValue should equal the VO's totals.total (VAT-inclusive per backend impl)
    apv = float(afp.get("approvedVariationsValue") or 0)
    assert apv > 0, f"AFP approvedVariationsValue should auto-pull, got {apv}"
    assert abs(apv - vo_total_inc) < 0.5, f"AFP auto-pull {apv} != VO approved total {vo_total_inc}"

    # 4. Certify the AFP
    r = requests.post(
        f"{BASE_URL}/api/applications-for-payment/applications/{afp['id']}/status",
        headers=h, json={"status": "Certified"}, timeout=20,
    )
    assert r.status_code == 200, f"certify AFP: {r.status_code} {r.text}"
    afp_cert = r.json()
    assert afp_cert["status"] == "Certified"
    assert afp_cert.get("certifiedAmount"), "certifiedAmount must be stamped"
    certified_amount = float(afp_cert["certifiedAmount"])
    assert certified_amount > 0

    # 5. Pre-fill invoice draft from AFP
    r = requests.get(f"{BASE_URL}/api/invoice-builder/from-application/{afp['id']}", headers=h, timeout=20)
    assert r.status_code == 200, f"draft from AFP: {r.status_code} {r.text}"
    draft = r.json()
    assert draft.get("linkedApplicationRef") == afp_cert.get("applicationRef")
    assert draft.get("projectId") == job_id
    assert len(draft.get("lineItems") or []) >= 1

    # Create the invoice from the draft
    inv_body = {
        "projectId": draft.get("projectId"),
        "projectName": draft.get("projectName"),
        "clientName": draft.get("clientName"),
        "linkedApplicationId": draft.get("linkedApplicationId"),
        "linkedApplicationRef": draft.get("linkedApplicationRef"),
        "lineItems": draft.get("lineItems"),
        "cisStatus": draft.get("cisStatus"),
        "vatTreatment": draft.get("vatTreatment"),
        "notes": draft.get("notes"),
    }
    r = requests.post(f"{BASE_URL}/api/invoice-builder/invoices", headers=h, json=inv_body, timeout=20)
    assert r.status_code == 200, f"create invoice: {r.status_code} {r.text}"
    inv = r.json()
    created["invoice"] = inv
    assert inv.get("linkedApplicationRef") == afp_cert.get("applicationRef"), "invoice must carry linkedApplicationRef"
    inv_total = float(((inv.get("totals") or {}).get("totalDue")) or 0)
    assert inv_total > 0, "invoice totalDue > 0"

    # 6. Record a full payment
    r = requests.post(
        f"{BASE_URL}/api/invoice-builder/invoices/{inv['id']}/payment",
        headers=h, json={"amount": inv_total, "method": "BACS"}, timeout=20,
    )
    assert r.status_code == 200, f"record payment: {r.status_code} {r.text}"
    inv_paid = r.json()
    assert inv_paid["status"] == "Paid", f"expected Paid, got {inv_paid['status']}"

    # 7. Verify job.amountPaid incremented
    r = requests.get(f"{BASE_URL}/api/jobs/{job_id}", headers=h, timeout=20)
    assert r.status_code == 200
    job_wrap = r.json()
    job_after = job_wrap.get("job") if isinstance(job_wrap, dict) and "job" in job_wrap else job_wrap
    assert float(job_after.get("amountPaid") or 0) >= inv_total - 0.01, \
        f"job.amountPaid ({job_after.get('amountPaid')}) should be >= invoice total ({inv_total})"

    yield created

    # ---- cleanup ----
    try:
        requests.delete(f"{BASE_URL}/api/invoice-builder/invoices/{created['invoice']['id']}", headers=h, timeout=10)
    except Exception: pass
    try:
        requests.delete(f"{BASE_URL}/api/applications-for-payment/applications/{created['afp']['id']}", headers=h, timeout=10)
    except Exception: pass
    try:
        requests.delete(f"{BASE_URL}/api/variation-orders/variation-orders/{created['vo']['id']}", headers=h, timeout=10)
    except Exception: pass
    try:
        requests.delete(f"{BASE_URL}/api/jobs/{created['job']['id']}", headers=h, timeout=10)
    except Exception: pass


def test_commercial_trilogy_end_to_end(commercial_flow):
    """Fixture already asserts. This test simply asserts non-empty."""
    assert commercial_flow["job"]["id"]
    assert commercial_flow["vo"]["id"]
    assert commercial_flow["afp"]["id"]
    assert commercial_flow["invoice"]["id"]


# ---------- 3. Global Search deep-links ----------
def test_search_deeplinks_contain_open_param(commercial_flow, admin_token):
    h = H(admin_token)
    # search for the VO by variationRef
    vo = commercial_flow["vo"]
    r = requests.get(f"{BASE_URL}/api/search", params={"q": vo["variationRef"]}, headers=h, timeout=20)
    assert r.status_code == 200
    items = r.json().get("items") or r.json().get("results") or []
    # Find the variation row
    vo_row = next((x for x in items if x.get("id") == vo["id"] or (x.get("route") or "").endswith(f"open={vo['id']}")), None)
    assert vo_row, f"search did not return the VO; got {[i.get('route') for i in items][:5]}"
    route = vo_row.get("route") or vo_row.get("actionRoute") or ""
    assert f"open={vo['id']}" in route, f"VO route missing open= deep-link: {route}"

    # AFP
    afp = commercial_flow["afp"]
    r = requests.get(f"{BASE_URL}/api/search", params={"q": afp.get("applicationRef", "")}, headers=h, timeout=20)
    items = r.json().get("items") or r.json().get("results") or []
    afp_row = next((x for x in items if x.get("id") == afp["id"]), None)
    if afp_row:
        route = afp_row.get("route") or ""
        assert f"open={afp['id']}" in route, f"AFP route missing deep-link: {route}"

    # Invoice
    inv = commercial_flow["invoice"]
    r = requests.get(f"{BASE_URL}/api/search", params={"q": inv.get("invoiceRef", "")}, headers=h, timeout=20)
    items = r.json().get("items") or r.json().get("results") or []
    inv_row = next((x for x in items if x.get("id") == inv["id"]), None)
    if inv_row:
        route = inv_row.get("route") or ""
        assert f"open={inv['id']}" in route, f"Invoice route missing deep-link: {route}"


# ---------- 4. Command Centre — backdated variation surfaces ----------
def test_command_centre_surfaces_stale_variation(admin_token):
    """Create Submitted VO, backdate updatedAt >7d directly in Mongo, GET /attention."""
    h = H(admin_token)
    # need a project first
    r = requests.post(f"{BASE_URL}/api/jobs", headers=h, json={
        "clientName": "TEST_RR CC Client", "projectName": "TEST_RR CC Attention", "contractValue": 1000
    }, timeout=15)
    assert r.status_code in (200, 201), r.text
    job = r.json()
    job_id = job["id"]

    vo_body = {
        "projectId": job_id, "projectName": job["projectName"], "clientName": job["clientName"],
        "descriptionOfChange": "TEST_RR attention", "status": "Submitted",
        "lineItems": [{"id": str(uuid.uuid4()), "description": "x", "qty": 1, "unit": "item", "unitPrice": 100, "category": "Labour"}],
    }
    r = requests.post(f"{BASE_URL}/api/variation-orders/variation-orders", headers=h, json=vo_body, timeout=15)
    assert r.status_code == 200
    vo = r.json()

    # Backdate updatedAt directly
    async def _backdate():
        from motor.motor_asyncio import AsyncIOMotorClient
        mc = AsyncIOMotorClient(os.environ.get("MONGO_URL"))
        db = mc[os.environ.get("DB_NAME")]
        await db.variation_orders.update_one(
            {"id": vo["id"]},
            {"$set": {"updatedAt": "2026-01-01T00:00:00+00:00", "status": "Submitted"}},
        )
        mc.close()
    try:
        asyncio.run(_backdate())
    except Exception as e:
        pytest.skip(f"cannot backdate via motor: {e}")

    # GET attention
    r = requests.get(f"{BASE_URL}/api/attention", headers=h, timeout=20)
    assert r.status_code == 200
    items = r.json().get("items") or []
    match = [i for i in items if f"open={vo['id']}" in (i.get("actionRoute") or "")]
    assert match, f"backdated variation not surfaced in /api/attention. sample routes: {[i.get('actionRoute') for i in items[:5]]}"
    it = match[0]
    assert it.get("actionRoute") == f"/app/variation-orders?open={vo['id']}"

    # cleanup
    requests.delete(f"{BASE_URL}/api/variation-orders/variation-orders/{vo['id']}", headers=h, timeout=10)
    requests.delete(f"{BASE_URL}/api/jobs/{job_id}", headers=h, timeout=10)


# ---------- 5. Multi-user isolation ----------
def test_sparky_cannot_see_admin_projects(commercial_flow, sparky_token):
    """sparky01 should not see any of admin's TEST_RR records."""
    admin_project_name = commercial_flow["job"]["projectName"]
    admin_vo_id = commercial_flow["vo"]["id"]
    h = H(sparky_token)

    # jobs list
    r = requests.get(f"{BASE_URL}/api/jobs", headers=h, timeout=15)
    assert r.status_code == 200
    jobs = r.json()
    for j in jobs:
        assert j.get("projectName") != admin_project_name, "sparky saw admin project"

    # variations
    r = requests.get(f"{BASE_URL}/api/variation-orders/variation-orders", headers=h, timeout=15)
    assert r.status_code == 200
    for v in r.json():
        assert v.get("id") != admin_vo_id

    # applications
    r = requests.get(f"{BASE_URL}/api/applications-for-payment/applications", headers=h, timeout=15)
    assert r.status_code == 200

    # invoices
    r = requests.get(f"{BASE_URL}/api/invoice-builder/invoices", headers=h, timeout=15)
    assert r.status_code == 200
    for inv in r.json():
        assert inv.get("id") != commercial_flow["invoice"]["id"]

    # search
    r = requests.get(f"{BASE_URL}/api/search", params={"q": "TEST_RR"}, headers=h, timeout=15)
    assert r.status_code == 200
    items = r.json().get("items") or r.json().get("results") or []
    for it in items:
        assert admin_vo_id not in (it.get("route") or ""), "sparky's search returned admin's VO"


# ---------- 6. Unauth requests -> 401/403 not 500 ----------
@pytest.mark.parametrize("path", [
    "/api/variation-orders/variation-orders",
    "/api/invoice-builder/invoices",
    "/api/applications-for-payment/applications",
    "/api/attention",
])
def test_no_auth_returns_401_or_403(path):
    r = requests.get(f"{BASE_URL}{path}", timeout=15)
    assert r.status_code in (401, 403), f"{path} expected 401/403, got {r.status_code}: {r.text[:200]}"


# ---------- 7. Performance informational ----------
@pytest.mark.parametrize("path", [
    "/api/site-diary/stats",
    "/api/incident-report/stats",
    "/api/risk-assessment/stats",
    "/api/quote-builder/stats",
    "/api/variation-orders/stats",
    "/api/applications-for-payment/stats",
    "/api/invoice-builder/stats",
])
def test_stats_endpoint_perf(admin_token, path):
    t0 = time.time()
    r = requests.get(f"{BASE_URL}{path}", headers=H(admin_token), timeout=30)
    elapsed_ms = (time.time() - t0) * 1000
    assert r.status_code == 200
    print(f"[perf] {path} -> {elapsed_ms:.0f}ms")
    # informational only — do not fail
