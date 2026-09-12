"""Morris — Mega Fix P1.1 + P1.3 regression tests.

Covers:
  P1.1 — Project↔AFP semantic client mapping. When a project (Job) is picked
         while creating an AFP, the AFP's client contact / client company /
         contract reference must map to the correct Job fields:
             Job.clientContact  → AFP.clientName    (person)
             Job.clientName     → AFP.clientCompany (organisation)
             Job.poNumber       → AFP.contractRef
         The email, phone and contractDate are NOT on the Job schema, so they
         must not be silently guessed from another field.
  P1.3 — AFP signature persistence. Saving an AFP with a preparedSignature
         and a certifierSignature must survive close → reopen (i.e. GET on
         the list endpoint returns the exact same signature dataURLs).

We do NOT test the frontend openNew auto-fill path directly here (that is
frontend behaviour); we assert the Job schema shape and confirm the
backend list endpoint returns both clientName and clientCompany separately
so the frontend has the raw data to render correctly.
"""
import os
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"username": "darrenhustle300", "password": "hustle1234"}

# Tiny 4x4 PNG signature dataURL (opaque black) — deterministic content so we
# can compare identically before / after reopen without any lossy processing.
FAKE_SIG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFElEQVQIW2NkYGD4z4AF"
    "MDIwMPwHAAksAQe6qsucAAAAAElFTkSuQmCC"
)
FAKE_SIG_2 = FAKE_SIG  # certifier signature — identical bytes are fine for the test


@pytest.fixture(scope="module")
def h():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def rich_job(h):
    """Create a Job with the full client-mapping payload."""
    body = {
        "clientName": "Regression Client Ltd",          # organisation
        "company": "",                                    # never populated in-app
        "clientContact": "Jane Doe",                     # human contact
        "address": "1 Test Way, Testville",
        "poNumber": "PO-REGRESSION-99",
        "workType": "Refurb",
        "contractValue": 100000.00,
        "startDate": "2026-01-01",
    }
    r = requests.post(f"{API}/jobs", json=body, headers=h, timeout=30)
    assert r.status_code in (200, 201), r.text
    j = r.json()
    yield j
    try:
        requests.delete(f"{API}/jobs/{j['id']}", headers=h, timeout=15)
    except Exception:
        pass


def test_job_schema_carries_semantic_fields(rich_job):
    """The Job must expose clientContact, clientName and poNumber as SEPARATE
    fields — the frontend AFP auto-fill maps them by name."""
    assert rich_job.get("clientContact") == "Jane Doe"
    assert rich_job.get("clientName") == "Regression Client Ltd"
    assert rich_job.get("poNumber") == "PO-REGRESSION-99"
    # The unrelated fields must be null / empty — never auto-populated with
    # the contact person's name or a concatenation.
    assert not rich_job.get("clientEmail"), "Job should not carry clientEmail"
    assert not rich_job.get("clientPhone"), "Job should not carry clientPhone"


def test_afp_list_returns_client_name_and_company_separately(h, rich_job):
    """P1.1 — the AFP dashboard/summary must expose the human contact and
    the client organisation as separate fields so the frontend can label
    each correctly (no concatenated inference)."""
    body = {
        "projectId": rich_job["id"],
        "projectName": rich_job.get("projectName") or rich_job["clientName"],
        "clientName": "Jane Doe",             # contact
        "clientCompany": "Regression Client Ltd",
        "contractRef": "PO-REGRESSION-99",
        "applicationRef": "P11-AFP-001",
        "applicationDate": datetime.now(timezone.utc).date().isoformat(),
        "lineItems": [{"description": "Prelims", "valueToDate": 5000.00}],
    }
    r = requests.post(f"{API}/applications-for-payment/applications", json=body, headers=h, timeout=30)
    assert r.status_code in (200, 201), r.text
    aid = r.json()["id"]

    # Read back via the list endpoint (deterministic — the summary.recent
    # bucket is capped and may not include this AFP if the admin account
    # has many older records).
    lst = requests.get(f"{API}/applications-for-payment/applications", headers=h, timeout=30).json()
    match = [a for a in lst if a.get("id") == aid]
    assert match, "Newly-created AFP missing from list"
    afp = match[0]
    assert afp.get("clientName") == "Jane Doe", (
        f"P1.1 REGRESSION: AFP.clientName was '{afp.get('clientName')}'. "
        "Expected the CONTACT PERSON name — the earlier auto-fill mapped "
        "Job.clientName (an organisation) into the AFP contact-name field."
    )
    assert afp.get("clientCompany") == "Regression Client Ltd"
    assert afp.get("contractRef") == "PO-REGRESSION-99"


def test_afp_signature_persists_across_save_and_reopen(h, rich_job):
    """P1.3 — write both signatures on create, then reload via list endpoint
    and confirm they come back identical."""
    body = {
        "projectId": rich_job["id"],
        "projectName": rich_job["clientName"],
        "clientName": "Jane Doe",
        "clientCompany": "Regression Client Ltd",
        "applicationRef": "P13-AFP-SIG",
        "applicationDate": datetime.now(timezone.utc).date().isoformat(),
        "lineItems": [{"description": "Signed prelims", "valueToDate": 3000.00}],
        "preparedSignature": FAKE_SIG,
        "certifierSignature": FAKE_SIG_2,
    }
    r = requests.post(f"{API}/applications-for-payment/applications", json=body, headers=h, timeout=30)
    assert r.status_code in (200, 201), r.text
    aid = r.json()["id"]
    # Confirm the immediate response carries the signatures.
    assert r.json().get("preparedSignature") == FAKE_SIG
    assert r.json().get("certifierSignature") == FAKE_SIG_2

    # Reopen via list endpoint — this is the path the AFP dashboard uses.
    lst = requests.get(f"{API}/applications-for-payment/applications", headers=h, timeout=30).json()
    match = [a for a in lst if a.get("id") == aid]
    assert match, "Newly created AFP missing from list"
    fresh = match[0]
    assert fresh.get("preparedSignature") == FAKE_SIG, (
        "P1.3 REGRESSION: preparedSignature was lost between save and reopen. "
        "The list endpoint must return the signature dataURL intact."
    )
    assert fresh.get("certifierSignature") == FAKE_SIG_2

    # Also patch (edit) the AFP without touching the signature fields —
    # the signatures must survive a partial update.
    requests.patch(
        f"{API}/applications-for-payment/applications/{aid}",
        json={"notes": "Post-save edit — signature must survive"},
        headers=h, timeout=30,
    )
    after = requests.get(f"{API}/applications-for-payment/applications", headers=h, timeout=30).json()
    match2 = [a for a in after if a.get("id") == aid][0]
    assert match2.get("preparedSignature") == FAKE_SIG, (
        "P1.3 REGRESSION: a partial PATCH silently dropped the preparedSignature. "
        "Only fields the client sends should be updated; existing signatures must be preserved."
    )
    assert match2.get("certifierSignature") == FAKE_SIG_2
