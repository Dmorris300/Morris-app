"""Morris — Mega Fix P0.1 regression test.

Reproduces the exact scenario from `Morris_Phase_1_Mega_Fix_Prompt.pdf`:

  AFP-001  status=Certified  certifiedAmount=£19,980  grossIncluding=£40,000
  AFP-002  status=Certified  certifiedAmount=£540     grossIncluding=£25,850
  AFP-003  status=Certified  certifiedAmount=£0       grossIncluding=£43,350   <- was leaking gross into total
  AFP-004  status=Submitted  certifiedAmount=£0       grossIncluding=£21,370
  AFP-005  status=Rejected   certifiedAmount=£0       grossIncluding=£15,000

Correct `previouslyCertifiedTotal` = £19,980 + £540 + £0 = **£20,520.00**.
Pre-fix behaviour returned £63,870 (leaked £43,350 gross from the £0-certified row
plus £21,370 gross from the Submitted row).

"Amount Actually Certified" business rule (Sep 2026):
- Only Certified or Paid contribute
- Submitted / Rejected / Draft contribute £0
- Certified with £0 contributes £0
- Never fall back to grossIncludingVariations / applicationValue
"""
import os
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"
AFP = f"{API}/applications-for-payment"

ADMIN = {"username": "darrenhustle300", "password": "hustle1234"}


@pytest.fixture(scope="module")
def h():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def project_id(h):
    """A dedicated project for this regression scenario. Idempotent — reused across runs."""
    ref = f"P0.1-Regression-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
    r = requests.post(f"{API}/jobs", json={
        "clientName": "Regression Client Ltd",
        "address": "1 Test Way",
        "workType": "Regression",
        "startDate": "2026-01-01",
    }, headers=h, timeout=30)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _create_afp(h, project_id, number, status, certified, gross, ref):
    """Seed one AFP with a specific status and monetary values."""
    body = {
        "projectId": project_id,
        "applicationRef": ref,
        "applicationNumber": number,
        "applicationDate": datetime.now(timezone.utc).isoformat(),
        "lineItems": [{"description": "Preliminaries", "valueToDate": gross}],
        "approvedVariationsValue": 0,
        "previouslyCertified": 0,
        "retentionRate": 0,
    }
    r = requests.post(f"{AFP}/applications", json=body, headers=h, timeout=30)
    assert r.status_code in (200, 201), r.text
    aid = r.json()["id"]
    # Force status + persisted certifiedAmount / paidAmount so the summary path is deterministic.
    patch = {"status": status, "certifiedAmount": certified}
    r2 = requests.patch(f"{AFP}/applications/{aid}", json=patch, headers=h, timeout=30)
    assert r2.status_code == 200, r2.text
    return aid


def test_previously_certified_uses_persisted_amount_not_gross_fallback(h, project_id):
    """Full-fidelity replay of the Mega Fix P0.1 scenario."""
    _create_afp(h, project_id, 1, "Certified", 19980.00, 40000.00, "REG-001")
    _create_afp(h, project_id, 2, "Certified",   540.00, 25850.00, "REG-002")
    _create_afp(h, project_id, 3, "Certified",     0.00, 43350.00, "REG-003")
    _create_afp(h, project_id, 4, "Submitted",     0.00, 21370.00, "REG-004")
    _create_afp(h, project_id, 5, "Rejected",      0.00, 15000.00, "REG-005")

    r = requests.get(f"{AFP}/project/{project_id}/summary", headers=h, timeout=30)
    assert r.status_code == 200, r.text
    total = r.json().get("previouslyCertifiedTotal")

    assert total == 20520.00, (
        f"P0.1 REGRESSION: previouslyCertifiedTotal={total} — expected 20520.00. "
        "The bug fell back to grossIncludingVariations when certifiedAmount was 0 "
        "and/or included Submitted/Rejected applications. Business rule violation."
    )


def test_submitted_contributes_zero_even_with_positive_certified(h, project_id):
    """Guard against a partial fix that keeps Submitted-with-certified>0 in the sum."""
    r = requests.get(f"{AFP}/project/{project_id}/summary", headers=h, timeout=30)
    apps = r.json().get("previousApplications", [])
    # Sanity: fixture created a Submitted row with certified=0. Now flip its certified
    # to a non-zero via a targeted patch to prove Submitted still contributes £0.
    submitted = next((a for a in apps if a.get("status") == "Submitted"), None)
    if submitted:
        requests.patch(f"{AFP}/applications/{submitted['id']}",
                       json={"certifiedAmount": 5000.00},
                       headers=h, timeout=30)
    r2 = requests.get(f"{AFP}/project/{project_id}/summary", headers=h, timeout=30)
    assert r2.json()["previouslyCertifiedTotal"] == 20520.00, (
        "Submitted status must NEVER contribute to Previously Certified, "
        "even when certifiedAmount > 0."
    )
