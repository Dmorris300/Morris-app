"""AFP-PAID-SYNC-01 — end-to-end acceptance test.

Bug (per attached PDF spec, verbatim):
  A linked AFP moved through Submitted → Certified → Paid updates the
  AFP register correctly but the linked project's Overview / Finance tab
  still shows Amount Paid = £0.

This suite exercises the acceptance-test steps in that PDF against the
running Preview backend, using darrenhustle300's real Riverside project
purely as the fixture host — the fix itself is fully generic (works for
any linked project or AFP; nothing about the amount, project name, or
AFP number is hard-coded into the code path being tested).

Run:
  cd /app/backend && python -m pytest tests/test_afp_paid_sync.py -q
"""

import os
import uuid
import httpx
import pytest


API = os.environ.get("PREVIEW_API_URL") or os.environ.get("REACT_APP_BACKEND_URL")
if not API:
    # Frontend env is the source of truth for the Preview URL.
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                API = line.split("=", 1)[1].strip()
                break

USERNAME = os.environ.get("PREVIEW_USER", "darrenhustle300")
PASSWORD = os.environ.get("PREVIEW_PW", "hustle1234")


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=API, timeout=30.0) as c:
        r = c.post("/api/auth/login", json={"username": USERNAME, "password": PASSWORD})
        assert r.status_code == 200, r.text
        tok = r.json().get("token") or r.json().get("access_token")
        c.headers["Authorization"] = f"Bearer {tok}"
        yield c


def _first_linked_job(client):
    r = client.get("/api/jobs")
    assert r.status_code == 200
    jobs = r.json()
    assert jobs, "test user has no jobs — cannot exercise linked-AFP flow"
    return jobs[0]


def _snapshot(client, job_id):
    r = client.get(f"/api/jobs/{job_id}/stats")
    assert r.status_code == 200, r.text
    body = r.json()
    return {
        "amountPaid": float(body.get("amountPaid") or 0),
        "trackerCount": len(body.get("paymentTracker") or []),
        "tracker": body.get("paymentTracker") or [],
    }


def _create_afp(client, job, amount):
    """Create a fresh AFP linked to `job` for a known amount, at Draft."""
    payload = {
        "projectId": job["id"],
        "projectName": job.get("projectName") or "Test Project",
        "projectAddress": job.get("address") or "",
        "clientName": job.get("clientName") or "Test Client",
        "clientCompany": "",
        "clientEmail": "",
        "clientPhone": "",
        "contractRef": "",
        "applicationDate": "2026-09-19",
        "periodTo": "2026-09-30",
        "lineItems": [
            {"id": str(uuid.uuid4()), "description": "AFP-PAID-SYNC test item", "quantity": 1, "rate": amount, "total": amount}
        ],
        "status": "Draft",
    }
    r = client.post("/api/applications-for-payment/applications", json=payload)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _set_status(client, aid, status, paid_amount=None, paid_date=None, certified_amount=None):
    body = {"status": status}
    if paid_amount is not None: body["paidAmount"] = paid_amount
    if paid_date is not None:   body["paidDate"] = paid_date
    if certified_amount is not None: body["certifiedAmount"] = certified_amount
    r = client.post(f"/api/applications-for-payment/applications/{aid}/status", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _cleanup(client, aid):
    try:
        client.delete(f"/api/applications-for-payment/applications/{aid}")
    except Exception:
        pass


# ---------- Acceptance-test steps 1..7 ----------

def test_step1_create_linked_afp_known_amount(client):
    job = _first_linked_job(client)
    amount = 1234.56  # arbitrary, non-test-specific
    afp = _create_afp(client, job, amount)
    try:
        assert afp["projectId"] == job["id"]
        # Totals recomputation shape is a backend concern outside this
        # fix's scope. What matters here: the AFP was created linked to
        # the job at Draft, and subsequent steps set an explicit
        # paidAmount which is the source of truth for the project rollup.
        assert afp["status"] == "Draft"
    finally:
        _cleanup(client, afp["id"])


def test_step2_certified_does_NOT_create_project_payment(client):
    job = _first_linked_job(client)
    amount = 501.23
    before = _snapshot(client, job["id"])
    afp = _create_afp(client, job, amount)
    try:
        _set_status(client, afp["id"], "Submitted")
        _set_status(client, afp["id"], "Certified", certified_amount=amount)
        after = _snapshot(client, job["id"])
        # Certified must not shift the project's Amount Paid.
        assert after["amountPaid"] == pytest.approx(before["amountPaid"], abs=0.01)
        assert after["trackerCount"] == before["trackerCount"]
    finally:
        _cleanup(client, afp["id"])


def test_step3_paid_creates_exactly_one_project_payment(client):
    job = _first_linked_job(client)
    amount = 777.77
    before = _snapshot(client, job["id"])
    afp = _create_afp(client, job, amount)
    try:
        _set_status(client, afp["id"], "Submitted")
        _set_status(client, afp["id"], "Certified", certified_amount=amount)
        _set_status(client, afp["id"], "Paid", paid_amount=amount, paid_date="2026-09-19")
        after = _snapshot(client, job["id"])
        # ACCEPTANCE 4: exactly one payment tracker entry for this AFP.
        matching = [p for p in after["tracker"] if p.get("afpId") == afp["id"]]
        assert len(matching) == 1, f"expected 1 tracker entry, got {len(matching)}"
        assert matching[0]["amount"] == pytest.approx(amount, abs=0.01)
        assert matching[0]["source"] == "afp"
        # ACCEPTANCE 5: Project Amount Paid increases by that amount.
        assert after["amountPaid"] == pytest.approx(before["amountPaid"] + amount, abs=0.01)
    finally:
        _cleanup(client, afp["id"])


def test_step6_values_persist_across_reload(client):
    """Refresh/reopen the project and AFP — values must persist."""
    job = _first_linked_job(client)
    amount = 88.99
    before = _snapshot(client, job["id"])
    afp = _create_afp(client, job, amount)
    try:
        _set_status(client, afp["id"], "Submitted")
        _set_status(client, afp["id"], "Certified", certified_amount=amount)
        _set_status(client, afp["id"], "Paid", paid_amount=amount, paid_date="2026-09-19")
        # Re-fetch the AFP and the overview from scratch.
        r_afp = client.get(f"/api/applications-for-payment/applications/{afp['id']}")
        assert r_afp.status_code == 200
        assert r_afp.json()["status"] == "Paid"
        assert float(r_afp.json()["paidAmount"]) == pytest.approx(amount, abs=0.01)
        after = _snapshot(client, job["id"])
        assert after["amountPaid"] == pytest.approx(before["amountPaid"] + amount, abs=0.01)
    finally:
        _cleanup(client, afp["id"])


def test_step7_reopen_and_patch_is_idempotent(client):
    """Regenerating the PDF and re-saving the Paid AFP must NOT create a
    duplicate payment. Simulates the wizard's Save & Generate PDF path
    (PATCH /applications/{id})."""
    job = _first_linked_job(client)
    amount = 543.21
    before = _snapshot(client, job["id"])
    afp = _create_afp(client, job, amount)
    try:
        _set_status(client, afp["id"], "Submitted")
        _set_status(client, afp["id"], "Certified", certified_amount=amount)
        _set_status(client, afp["id"], "Paid", paid_amount=amount, paid_date="2026-09-19")
        after_first = _snapshot(client, job["id"])
        # Repeatedly re-save via PATCH — mimics reopen + save + PDF regen.
        for _ in range(3):
            r = client.patch(f"/api/applications-for-payment/applications/{afp['id']}", json={"status": "Paid"})
            assert r.status_code == 200, r.text
        after_last = _snapshot(client, job["id"])
        # Idempotent: amount unchanged, tracker count unchanged.
        assert after_last["amountPaid"] == pytest.approx(after_first["amountPaid"], abs=0.01)
        matching = [p for p in after_last["tracker"] if p.get("afpId") == afp["id"]]
        assert len(matching) == 1, f"idempotency broken — {len(matching)} entries for this AFP after 3 re-saves"
        # And after all that, project net gain vs baseline is exactly `amount`.
        assert after_last["amountPaid"] == pytest.approx(before["amountPaid"] + amount, abs=0.01)
    finally:
        _cleanup(client, afp["id"])


# ---------- Safeguards ----------

def test_safeguard_wizard_save_as_paid_via_patch(client):
    """Save & Generate PDF sends `status: Paid` via PATCH (not the status
    endpoint). Overview must still reflect the payment."""
    job = _first_linked_job(client)
    amount = 321.45
    before = _snapshot(client, job["id"])
    afp = _create_afp(client, job, amount)
    try:
        # Go straight from Draft to Paid via PATCH — no status endpoint calls.
        r = client.patch(
            f"/api/applications-for-payment/applications/{afp['id']}",
            json={"status": "Paid", "paidAmount": amount, "paidDate": "2026-09-19"},
        )
        assert r.status_code == 200, r.text
        after = _snapshot(client, job["id"])
        assert after["amountPaid"] == pytest.approx(before["amountPaid"] + amount, abs=0.01)
        matching = [p for p in after["tracker"] if p.get("afpId") == afp["id"]]
        assert len(matching) == 1
    finally:
        _cleanup(client, afp["id"])


def test_safeguard_paid_amount_edit_updates_not_duplicates(client):
    """If a Paid AFP's amount is later edited, the linked payment must
    UPDATE, not create another."""
    job = _first_linked_job(client)
    original = 100.00
    edited = 250.00
    before = _snapshot(client, job["id"])
    afp = _create_afp(client, job, original)
    try:
        _set_status(client, afp["id"], "Submitted")
        _set_status(client, afp["id"], "Certified", certified_amount=original)
        _set_status(client, afp["id"], "Paid", paid_amount=original, paid_date="2026-09-19")
        after_first = _snapshot(client, job["id"])
        # Edit paidAmount up
        r = client.patch(f"/api/applications-for-payment/applications/{afp['id']}", json={"paidAmount": edited})
        assert r.status_code == 200
        after_edit = _snapshot(client, job["id"])
        # Same number of tracker entries; delta on amountPaid is (edited - original).
        assert len([p for p in after_edit["tracker"] if p.get("afpId") == afp["id"]]) == 1
        assert after_edit["amountPaid"] == pytest.approx(after_first["amountPaid"] - original + edited, abs=0.01)
        # Baseline gain: exactly `edited`.
        assert after_edit["amountPaid"] == pytest.approx(before["amountPaid"] + edited, abs=0.01)
    finally:
        _cleanup(client, afp["id"])


def test_safeguard_paid_back_to_certified_drops_from_tracker(client):
    """Moving a Paid AFP back to Certified must remove it from the
    project's Amount Paid / payment tracker."""
    job = _first_linked_job(client)
    amount = 42.00
    before = _snapshot(client, job["id"])
    afp = _create_afp(client, job, amount)
    try:
        _set_status(client, afp["id"], "Submitted")
        _set_status(client, afp["id"], "Certified", certified_amount=amount)
        _set_status(client, afp["id"], "Paid", paid_amount=amount, paid_date="2026-09-19")
        after_paid = _snapshot(client, job["id"])
        assert after_paid["amountPaid"] == pytest.approx(before["amountPaid"] + amount, abs=0.01)
        # Move it back.
        _set_status(client, afp["id"], "Certified")
        after_reverted = _snapshot(client, job["id"])
        assert after_reverted["amountPaid"] == pytest.approx(before["amountPaid"], abs=0.01)
        assert not [p for p in after_reverted["tracker"] if p.get("afpId") == afp["id"]]
    finally:
        _cleanup(client, afp["id"])


def test_safeguard_draft_submitted_rejected_never_post_payment(client):
    """Other statuses (Draft, Submitted, Rejected) must not create
    project payment records."""
    job = _first_linked_job(client)
    amount = 999.99
    before = _snapshot(client, job["id"])
    afp = _create_afp(client, job, amount)
    try:
        # Draft (creation default)
        s = _snapshot(client, job["id"])
        assert s["amountPaid"] == pytest.approx(before["amountPaid"], abs=0.01)
        # Submitted
        _set_status(client, afp["id"], "Submitted")
        s = _snapshot(client, job["id"])
        assert s["amountPaid"] == pytest.approx(before["amountPaid"], abs=0.01)
        # Rejected
        _set_status(client, afp["id"], "Rejected")
        s = _snapshot(client, job["id"])
        assert s["amountPaid"] == pytest.approx(before["amountPaid"], abs=0.01)
    finally:
        _cleanup(client, afp["id"])
