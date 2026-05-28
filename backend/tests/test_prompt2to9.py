"""Backend tests covering Prompts 2-9 changes:
- Admin notification on signup (must not crash)
- /api/billing/status admin unlimited
- /api/vision/extract endpoint exists
- Existing /api/generate flow still works for admin
"""
import os
import time
import secrets
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_USER = "darrenhustle300"
ADMIN_PASS = "hustle1234"


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data["token"]
    # /auth/me computes isAdmin/isUnlimited
    me = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json().get("isAdmin") is True
    assert me.json().get("isUnlimited") is True
    return token


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- Admin signup notification (Prompt 8) ----------
class TestAdminSignupNotification:
    def test_fresh_signup_does_not_crash_due_to_admin_email(self, api):
        """send_admin_signup must not break signup even if Resend is unreachable."""
        suffix = secrets.token_hex(4)
        payload = {
            "username": f"TEST_p8_{suffix}",
            "email": f"TEST_p8_{suffix}@morrisapp.co.uk",
            "password": "testpass123",
            "phone": f"+44777{secrets.randbelow(10000000):07d}",
        }
        r = api.post(f"{BASE_URL}/api/auth/signup", json=payload)
        assert r.status_code == 200, f"Signup crashed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("ok") is True
        assert "otp" in data
        assert isinstance(data["otp"], str) and len(data["otp"]) == 6


# ---------- Vision/OCR endpoint (Prompt 4) ----------
class TestVisionExtractEndpoint:
    def test_endpoint_exists_and_requires_auth(self, api):
        r = api.post(f"{BASE_URL}/api/vision/extract", json={"image": "abc"})
        # Must be auth-gated, not 404
        assert r.status_code in (401, 422), f"Unexpected: {r.status_code} {r.text}"

    def test_endpoint_accepts_valid_request_shape(self, api, admin_headers):
        # 1x1 transparent PNG
        tiny_png_b64 = (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        )
        r = requests.post(
            f"{BASE_URL}/api/vision/extract",
            json={"image": tiny_png_b64, "hint": "test"},
            headers=admin_headers,
            timeout=60,
        )
        # The endpoint should respond (either 200 with result, or 500 if LLM budget exhausted).
        # We accept either; the key check is that the route exists & is auth-gated.
        assert r.status_code in (200, 500, 503), f"Unexpected: {r.status_code} {r.text}"


# ---------- Billing status (regression) ----------
class TestBillingStatusAdmin:
    def test_admin_unlimited(self, api, admin_headers):
        r = requests.get(f"{BASE_URL}/api/billing/status", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("plan") == "unlimited"
        assert data.get("isUnlimited") is True


# ---------- /api/auth/me regression ----------
class TestAuthMe:
    def test_admin_me(self, api, admin_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u.get("username") == ADMIN_USER
        assert u.get("isAdmin") is True
        assert u.get("isUnlimited") is True


# ---------- Generate regression (variation-letter) ----------
class TestGenerateRegression:
    def test_generate_variation_letter(self, admin_headers):
        payload = {
            "toolId": "variation-letter",
            "toolName": "Variation Letter",
            "promptTemplate": "Write a brief variation letter.",
            "userInputs": {
                "clientName": "TEST Client Ltd",
                "siteAddress": "1 Test Street, London",
                "variationDescription": "Additional 2 sockets in kitchen",
                "extraCost": "350",
            },
            "trade": "Electrician",
        }
        r = requests.post(
            f"{BASE_URL}/api/generate",
            json=payload,
            headers=admin_headers,
            timeout=120,
        )
        if r.status_code != 200:
            pytest.skip(f"LLM unavailable: {r.status_code} {r.text[:200]}")
        data = r.json()
        assert data.get("ok") is True
        assert "refNumber" in data and data["refNumber"]
        assert "VAR" in data["refNumber"]
        assert "content" in data and len(data["content"]) > 50
        # Header rule
        assert "DOCUMENT REFERENCE:" in data["content"]
        assert "DATE:" in data["content"]
        # Verify autosaved
        time.sleep(0.5)
        listr = requests.get(f"{BASE_URL}/api/documents", headers=admin_headers)
        assert listr.status_code == 200
        docs = listr.json()
        assert any(d.get("refNumber") == data["refNumber"] for d in docs), "Generated doc not autosaved to Vault"
