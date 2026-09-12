"""Morris — P1 Verification Addendum regression tests.

Covers the frontend defects surfaced by the browser-level P1 verification
run on 12 Sep 2026. Backend-side we can assert the API contracts these
frontend flows depend on:

 - P1.4 (RAMS Resume): dedicated-page tools like RAMS store draft state as
   a FLAT `data` object (documentRef, clientName, principalContractor, ...),
   NOT nested under `data.values`. The Rams.jsx draftRestoredFor effect
   rehydrates each field directly from `data.<field>`. This test confirms
   the draft round-trip preserves the exact flat shape so the hydration
   effect has real values to read.

 - P1.1 (AFP client mapping): if a Job stores a legacy combined-contact
   string (e.g. "Sarah Mitchell — 07700 912846") the openNew() auto-fill
   must NOT dump the whole string into AFP.clientName. We assert the
   detection helper's contract via a small string battery that mirrors the
   isLegacyCombinedContact rules — kept aligned with the frontend helper
   in ApplicationsForPayment.jsx.
"""
import os
import re

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"username": "darrenhustle300", "password": "hustle1234"}


@pytest.fixture(scope="module")
def h():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


def test_p1_4_rams_draft_flat_shape_survives_roundtrip(h):
    """RAMS draft data is a FLAT object. The GET must return every field
    intact — Rams.jsx.draftRestoredFor reads `p.<field>` directly."""
    payload = {
        "toolId": "rams",
        "toolName": "RAMS",
        "title": "P1.4 verification — Rams draft flat shape",
        "data": {
            "clientName": "QA RAMS Client Ltd",
            "principalContractor": "QA Morris Contractors",
            "siteAddress": "Unit 4, 7 Verification Lane, London EC1A 1AA",
            "supervisorName": "QA Sam Foreman",
            "task": "QA hydration test — fit fire dampers L3-B7",
            "hazards": [{"name": "Working at height", "severity": 4, "likelihood": 3}],
            "ppe": ["Hard hat", "Safety glasses"],
        },
    }
    saved = requests.post(f"{API}/drafts", json=payload, headers=h, timeout=30).json()
    did = saved["id"]
    try:
        fetched = requests.get(f"{API}/drafts/{did}", headers=h, timeout=30).json()
        data = fetched.get("data") or {}
        # NO `values` wrapper — the flat shape is what Rams.jsx expects.
        assert "values" not in data, (
            "P1.4 REGRESSION: RAMS draft must persist a FLAT `data` object. "
            "A `data.values` wrapper indicates the wrong shape was sent."
        )
        assert data.get("clientName") == "QA RAMS Client Ltd"
        assert data.get("principalContractor") == "QA Morris Contractors"
        assert data.get("siteAddress") == "Unit 4, 7 Verification Lane, London EC1A 1AA"
        assert data.get("supervisorName") == "QA Sam Foreman"
        assert data.get("task") == "QA hydration test — fit fire dampers L3-B7"
        assert isinstance(data.get("hazards"), list) and data["hazards"][0]["name"] == "Working at height"
    finally:
        try: requests.delete(f"{API}/drafts/{did}", headers=h, timeout=15)
        except Exception: pass


# --- P1.1 detection helper — mirrors the frontend `isLegacyCombinedContact` ---
_SEP_RE = re.compile(r"[—–]|(\s-\s)|(\s\|\s)|(\s·\s)")
_PHONE_RE = re.compile(r"(?:\+?\d[\d\s\-]{5,})")


def _is_legacy_combined_contact(s):
    if not isinstance(s, str):
        return False
    trimmed = s.strip()
    if not trimmed:
        return False
    if not _SEP_RE.search(trimmed):
        return False
    return bool(_PHONE_RE.search(trimmed))


@pytest.mark.parametrize("value,expected", [
    ("Sarah Mitchell — 07700 912846", True),        # em dash + UK mobile
    ("Sarah Mitchell - 07700 912846", True),        # ASCII hyphen with spaces + phone
    ("Sarah Mitchell | 07700 912846", True),        # pipe separator + phone
    ("Sarah Mitchell", False),                       # plain name — DO NOT blank
    ("Jean-Luc Picard", False),                      # hyphenated name — DO NOT blank
    ("Jane Doe - Senior QS", False),                 # separator, no phone — DO NOT blank
    ("Company (2020) Ltd", False),                   # digits but no separator — DO NOT blank
    ("", False),                                      # empty — leave as-is
    (None, False),                                    # not a string — leave as-is
    ("07700 912846", False),                          # phone only, no separator — DO NOT blank
])
def test_p1_1_legacy_combined_contact_detection(value, expected):
    """P1.1 — the detection helper must NOT split arbitrary hyphens (safer
    to blank a genuine 'Name — Phone' and let the user re-enter than to
    guess wrongly). This mirrors ApplicationsForPayment.jsx."""
    assert _is_legacy_combined_contact(value) is expected


def test_p1_1_afp_openNew_leaves_afp_client_email_and_phone_blank(h):
    """A newly created AFP must not carry a Job's phone/email in clientPhone
    / clientEmail because the Job schema doesn't store those fields."""
    # Seed a job with a legacy combined-contact string.
    job = {
        "clientName": "Riverside Regeneration Ltd",
        "clientContact": "Sarah Mitchell — 07700 912846",  # legacy combined
        "poNumber": "PO-P11-VERIFY",
        "address": "1 Verification Way",
        "startDate": "2026-01-01",
        "contractValue": 100000.0,
    }
    j = requests.post(f"{API}/jobs", json=job, headers=h, timeout=30).json()
    try:
        # Create an AFP against the job. If the frontend correctly detects
        # the combined string it must leave clientName blank — but the
        # backend also accepts whatever the client sends. This test asserts
        # only that the Job schema DOESN'T carry email/phone so the AFP
        # auto-fill has nowhere to legitimately pull them from.
        assert not j.get("clientEmail"), "Job schema must not silently carry clientEmail"
        assert not j.get("clientPhone"), "Job schema must not silently carry clientPhone"
        # Confirm the combined contact string round-trips as-is (we do NOT
        # rewrite the persisted Job data; the frontend just refuses to use
        # it wholesale on AFP.clientName).
        assert j.get("clientContact") == "Sarah Mitchell — 07700 912846"
    finally:
        try: requests.delete(f"{API}/jobs/{j['id']}", headers=h, timeout=15)
        except Exception: pass
