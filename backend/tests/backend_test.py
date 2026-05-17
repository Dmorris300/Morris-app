"""Morris backend tests — auth, profile, generate (Claude), documents CRUD, CIS CRUD, auth-required."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://prompt-web-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# ---------- Shared session helper ----------
@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# Existing verified user (from /app/memory/test_credentials.md)
EXISTING_USER = {"username": "sparky01", "password": "test1234"}


@pytest.fixture(scope="session")
def existing_token(s):
    r = s.post(f"{API}/auth/login", json=EXISTING_USER, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture
def auth_headers(existing_token):
    return {"Authorization": f"Bearer {existing_token}", "Content-Type": "application/json"}


# ---------- Health ----------
def test_health(s):
    r = s.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "ok"


# ---------- Auth: signup + verify-otp + login ----------
class TestAuthFlow:
    def test_signup_verify_login_full_flow(self, s):
        username = f"test_{uuid.uuid4().hex[:8]}"
        email = f"{username}@morrisapp.co.uk"
        phone = "07700900222"
        password = "Pass1234!"

        # Signup
        r = s.post(f"{API}/auth/signup", json={"username": username, "email": email, "password": password, "phone": phone}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert "otp" in body and len(body["otp"]) == 6
        assert "userId" in body
        otp = body["otp"]

        # Duplicate signup
        r2 = s.post(f"{API}/auth/signup", json={"username": username, "email": email, "password": password, "phone": phone}, timeout=15)
        assert r2.status_code == 400

        # Verify OTP — wrong first
        rw = s.post(f"{API}/auth/verify-otp", json={"username": username, "otp": "000000"}, timeout=15)
        assert rw.status_code == 400

        # Verify OTP — correct
        rv = s.post(f"{API}/auth/verify-otp", json={"username": username, "otp": otp}, timeout=15)
        assert rv.status_code == 200, rv.text
        vb = rv.json()
        assert vb["ok"] is True
        assert isinstance(vb["token"], str) and len(vb["token"]) > 0
        assert vb["user"]["username"] == username
        assert vb["user"]["verified"] is True

        # Login
        rl = s.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=15)
        assert rl.status_code == 200, rl.text
        lb = rl.json()
        assert "token" in lb and "user" in lb
        token = lb["token"]

        # /auth/me
        rm = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert rm.status_code == 200
        mb = rm.json()
        assert mb["username"] == username

    def test_login_invalid_creds(self, s):
        r = s.post(f"{API}/auth/login", json={"username": "sparky01", "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_login_unverified_account(self, s):
        # Create a fresh unverified user
        username = f"unv_{uuid.uuid4().hex[:8]}"
        s.post(f"{API}/auth/signup", json={"username": username, "email": f"{username}@morrisapp.co.uk", "password": "Pass1234!", "phone": "07700900333"}, timeout=15)
        r = s.post(f"{API}/auth/login", json={"username": username, "password": "Pass1234!"}, timeout=15)
        assert r.status_code == 403


# ---------- Auth required ----------
class TestAuthRequired:
    def test_me_no_token(self, s):
        r = s.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401

    def test_me_invalid_token(self, s):
        r = s.get(f"{API}/auth/me", headers={"Authorization": "Bearer not-a-real-token"}, timeout=10)
        assert r.status_code == 401

    def test_documents_no_token(self, s):
        r = s.get(f"{API}/documents", timeout=10)
        assert r.status_code == 401

    def test_cis_no_token(self, s):
        r = s.get(f"{API}/cis/payments", timeout=10)
        assert r.status_code == 401

    def test_generate_no_token(self, s):
        r = s.post(f"{API}/generate", json={"toolId": "x", "toolName": "x", "promptTemplate": "x"}, timeout=10)
        assert r.status_code == 401


# ---------- Profile ----------
class TestProfile:
    def test_profile_update_persists(self, s, auth_headers):
        payload = {
            "trade": "Electrician",
            "companyName": "Sparks Electrical Ltd",
            "fullName": "Joe Sparks",
            "favourites": ["variation-letter", "rams"],
            "recentlyUsed": ["variation-letter"],
        }
        r = s.post(f"{API}/profile/update", json=payload, headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["trade"] == "Electrician"
        assert body["companyName"] == "Sparks Electrical Ltd"
        assert "variation-letter" in body["favourites"]

        # Verify via /auth/me
        rm = s.get(f"{API}/auth/me", headers=auth_headers, timeout=10)
        m = rm.json()
        assert m["companyName"] == "Sparks Electrical Ltd"
        assert "variation-letter" in m["favourites"]


# ---------- Documents CRUD ----------
class TestDocumentsCRUD:
    def test_doc_crud_flow(self, s, auth_headers):
        # Create
        payload = {"title": "TEST_Doc", "toolId": "variation-letter", "content": "Test content body"}
        r = s.post(f"{API}/documents/save", json=payload, headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["title"] == "TEST_Doc"
        assert "id" in doc
        doc_id = doc["id"]

        # List — should contain new doc
        rl = s.get(f"{API}/documents", headers=auth_headers, timeout=15)
        assert rl.status_code == 200
        ids = [d["id"] for d in rl.json()]
        assert doc_id in ids

        # Delete
        rd = s.delete(f"{API}/documents/{doc_id}", headers=auth_headers, timeout=15)
        assert rd.status_code == 200

        # Verify gone
        rl2 = s.get(f"{API}/documents", headers=auth_headers, timeout=15)
        ids2 = [d["id"] for d in rl2.json()]
        assert doc_id not in ids2


# ---------- CIS CRUD ----------
class TestCISCrud:
    def test_cis_crud_flow(self, s, auth_headers):
        payload = {"date": "2026-01-15", "contractor": "TEST_Contractor", "gross": 1000.0, "deduction": 200.0, "net": 800.0, "notes": "test"}
        r = s.post(f"{API}/cis/payments", json=payload, headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        item = r.json()
        assert item["gross"] == 1000.0
        assert item["net"] == 800.0
        pid = item["id"]

        rl = s.get(f"{API}/cis/payments", headers=auth_headers, timeout=15)
        assert rl.status_code == 200
        assert pid in [p["id"] for p in rl.json()]

        rd = s.delete(f"{API}/cis/payments/{pid}", headers=auth_headers, timeout=15)
        assert rd.status_code == 200

        rl2 = s.get(f"{API}/cis/payments", headers=auth_headers, timeout=15)
        assert pid not in [p["id"] for p in rl2.json()]


# ---------- Generate (Claude) ----------
class TestGenerate:
    def test_generate_variation_letter(self, s, auth_headers):
        payload = {
            "toolId": "variation-letter",
            "toolName": "Variation Letter",
            "promptTemplate": "Draft a formal variation letter to a UK main contractor requesting additional payment and time. Reference UK construction contract practice and the Housing Grants, Construction and Regeneration Act 1996 where appropriate.",
            "userInputs": {
                "project": "Office refurb, 12 Hatton Wall, London EC1",
                "contractor": "BigCo Construction Ltd",
                "variationDescription": "Client requested additional 20 socket outlets on first floor",
                "costImpact": "£1,850 plus VAT",
                "timeImpact": "2 additional days",
            },
            "trade": "Electrician",
            "companyName": "Sparks Electrical Ltd",
            "fullName": "Joe Sparks",
        }
        r = s.post(f"{API}/generate", json=payload, headers=auth_headers, timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        content = body.get("content", "")
        assert isinstance(content, str)
        assert len(content) >= 300, f"content too short ({len(content)}): {content[:200]}"
        low = content.lower()
        # at least one UK convention referenced
        uk_terms = ["variation", "contractor", "vat", "£", "uk", "hgcra", "housing grants", "construction"]
        assert any(t in low for t in uk_terms), "no UK convention referenced"
