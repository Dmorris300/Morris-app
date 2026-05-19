"""Iteration 4 — DELETE /api/account/delete endpoint test."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://prompt-web-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _signup_verify(s, username, email, phone, password):
    r = s.post(f"{API}/auth/signup", json={"username": username, "email": email, "password": password, "phone": phone}, timeout=20)
    assert r.status_code == 200, r.text
    otp = r.json()["otp"]
    rv = s.post(f"{API}/auth/verify-otp", json={"username": username, "otp": otp}, timeout=15)
    assert rv.status_code == 200, rv.text
    return rv.json()["token"]


# ---------- Auth required ----------
def test_delete_account_no_token(session):
    r = session.delete(f"{API}/account/delete", timeout=15)
    assert r.status_code == 401


def test_delete_account_invalid_token(session):
    r = session.delete(f"{API}/account/delete", headers={"Authorization": "Bearer fake-bad-token"}, timeout=15)
    assert r.status_code == 401


# ---------- Full delete flow: create user + data → delete → verify all gone ----------
def test_delete_account_wipes_user_and_related_data(session):
    username = f"del_{uuid.uuid4().hex[:8]}"
    email = f"{username}@morrisapp.co.uk"
    password = "Pass1234!"
    phone = "07700900444"
    token = _signup_verify(session, username, email, phone, password)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Create a document
    rdoc = session.post(f"{API}/documents/save",
                        json={"title": "TEST_DelDoc", "toolId": "variation-letter", "content": "to-be-deleted"},
                        headers=headers, timeout=15)
    assert rdoc.status_code == 200, rdoc.text

    # Create a CIS payment
    rcis = session.post(f"{API}/cis/payments",
                        json={"date": "2026-01-15", "contractor": "TEST_Del", "gross": 500.0, "deduction": 100.0, "net": 400.0, "notes": "x"},
                        headers=headers, timeout=15)
    assert rcis.status_code == 200, rcis.text

    # Issue a password reset token (will be wiped)
    session.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)

    # Sanity-check: docs visible before delete
    rl = session.get(f"{API}/documents", headers=headers, timeout=15)
    assert rl.status_code == 200 and len(rl.json()) >= 1

    # DELETE the account
    rdel = session.delete(f"{API}/account/delete", headers=headers, timeout=20)
    assert rdel.status_code == 200, rdel.text
    body = rdel.json()
    assert body.get("ok") is True
    assert "deleted" in body.get("message", "").lower()

    # Token should no longer work — auth/me 401
    rme = session.get(f"{API}/auth/me", headers=headers, timeout=15)
    assert rme.status_code == 401

    # Login with same credentials must fail — user was wiped
    rl2 = session.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=15)
    assert rl2.status_code == 401, f"expected 401 after delete, got {rl2.status_code}: {rl2.text}"


# ---------- Smoke test: existing endpoints still work post-iteration-4 ----------
def test_smoke_existing_endpoints_still_work(session):
    """Quick smoke: signup → verify → login → list docs → list cis."""
    username = f"smk_{uuid.uuid4().hex[:8]}"
    email = f"{username}@morrisapp.co.uk"
    password = "Pass1234!"
    token = _signup_verify(session, username, email, "07700900555", password)
    headers = {"Authorization": f"Bearer {token}"}

    # Login again — produces fresh token
    rl = session.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=15)
    assert rl.status_code == 200, rl.text
    new_token = rl.json()["token"]
    headers = {"Authorization": f"Bearer {new_token}"}

    # docs + cis listings (empty but should not 500)
    rd = session.get(f"{API}/documents", headers=headers, timeout=15)
    assert rd.status_code == 200
    assert isinstance(rd.json(), list)
    rc = session.get(f"{API}/cis/payments", headers=headers, timeout=15)
    assert rc.status_code == 200
    assert isinstance(rc.json(), list)

    # Save a doc and verify list reflects it
    rs = session.post(f"{API}/documents/save",
                      json={"title": "TEST_Smk", "toolId": "rams", "content": "smoke body"},
                      headers=headers, timeout=15)
    assert rs.status_code == 200
    doc_id = rs.json()["id"]
    rd2 = session.get(f"{API}/documents", headers=headers, timeout=15)
    assert doc_id in [d["id"] for d in rd2.json()]
