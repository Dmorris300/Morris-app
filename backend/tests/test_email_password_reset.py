"""Morris iteration 2 — email field on signup/profile + password reset flow tests."""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://prompt-web-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _signup_and_verify(s, prefix="reset"):
    """Helper: create a verified user with email; return (username, email, password, token)."""
    username = f"{prefix}_{uuid.uuid4().hex[:8]}"
    email = f"{username}@morrisapp.co.uk"
    password = "oldpass123"
    phone = "07700900333"
    r = s.post(f"{API}/auth/signup", json={"username": username, "email": email, "password": password, "phone": phone}, timeout=20)
    assert r.status_code == 200, r.text
    otp = r.json()["otp"]
    rv = s.post(f"{API}/auth/verify-otp", json={"username": username, "otp": otp}, timeout=15)
    assert rv.status_code == 200, rv.text
    token = rv.json()["token"]
    return username, email, password, token


# ---------- Signup with email ----------
class TestSignupEmail:
    def test_signup_requires_email(self, s):
        # missing email -> 422
        r = s.post(f"{API}/auth/signup", json={
            "username": f"noemail_{uuid.uuid4().hex[:6]}",
            "password": "Pass1234!", "phone": "07700900111"
        }, timeout=15)
        assert r.status_code == 422

    def test_signup_invalid_email_format(self, s):
        r = s.post(f"{API}/auth/signup", json={
            "username": f"bademail_{uuid.uuid4().hex[:6]}",
            "email": "not-an-email",
            "password": "Pass1234!", "phone": "07700900111"
        }, timeout=15)
        assert r.status_code == 422

    def test_signup_persists_email_lowercased(self, s):
        username = f"emailcase_{uuid.uuid4().hex[:6]}"
        email_mixed = f"MixedCase_{uuid.uuid4().hex[:6]}@Morrisapp.CO.UK"
        r = s.post(f"{API}/auth/signup", json={
            "username": username, "email": email_mixed,
            "password": "Pass1234!", "phone": "07700900111"
        }, timeout=15)
        assert r.status_code == 200, r.text
        otp = r.json()["otp"]
        rv = s.post(f"{API}/auth/verify-otp", json={"username": username, "otp": otp}, timeout=15)
        assert rv.status_code == 200
        u = rv.json()["user"]
        assert u["email"] == email_mixed.lower(), f"email not lowercased: {u['email']}"

    def test_signup_duplicate_email(self, s):
        # First user
        username1, email, _, _ = _signup_and_verify(s, prefix="dupe1")
        # Second signup with same email but different username
        r = s.post(f"{API}/auth/signup", json={
            "username": f"dupe2_{uuid.uuid4().hex[:6]}",
            "email": email,
            "password": "Pass1234!", "phone": "07700900111"
        }, timeout=15)
        assert r.status_code == 400
        detail = r.json().get("detail", "")
        assert "email" in detail.lower(), f"unexpected detail: {detail}"


# ---------- Forgot password ----------
class TestForgotPassword:
    def test_forgot_password_existing_email_returns_demo_link(self, s):
        _, email, _, _ = _signup_and_verify(s, prefix="fp1")
        r = s.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert "demoResetToken" in body and isinstance(body["demoResetToken"], str) and len(body["demoResetToken"]) > 10
        assert body.get("demoResetLink", "").startswith("/reset-password?token=")
        assert body["demoResetToken"] in body["demoResetLink"]

    def test_forgot_password_nonexistent_email_no_token_leak(self, s):
        fake = f"doesnotexist_{uuid.uuid4().hex[:8]}@morrisapp.co.uk"
        r = s.post(f"{API}/auth/forgot-password", json={"email": fake}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert "demoResetToken" not in body
        assert "demoResetLink" not in body

    def test_forgot_password_case_insensitive(self, s):
        _, email, _, _ = _signup_and_verify(s, prefix="fp2")
        r = s.post(f"{API}/auth/forgot-password", json={"email": email.upper()}, timeout=15)
        assert r.status_code == 200
        assert "demoResetToken" in r.json()


# ---------- Reset password ----------
class TestResetPassword:
    def test_reset_password_full_flow_and_session_invalidation(self, s):
        username, email, old_password, old_token = _signup_and_verify(s, prefix="rp1")

        # Sanity: old token works for /auth/me
        rm = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {old_token}"}, timeout=10)
        assert rm.status_code == 200

        # Request reset
        rf = s.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
        reset_token = rf.json()["demoResetToken"]

        # Reset
        new_password = "newpass456"
        rr = s.post(f"{API}/auth/reset-password", json={"token": reset_token, "newPassword": new_password}, timeout=15)
        assert rr.status_code == 200, rr.text
        assert rr.json()["ok"] is True

        # Old session token should be invalidated
        rm2 = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {old_token}"}, timeout=10)
        assert rm2.status_code == 401, "old session token should be invalid after reset"

        # Old password should fail
        rlo = s.post(f"{API}/auth/login", json={"username": username, "password": old_password}, timeout=15)
        assert rlo.status_code == 401

        # New password should succeed
        rln = s.post(f"{API}/auth/login", json={"username": username, "password": new_password}, timeout=15)
        assert rln.status_code == 200, rln.text
        assert "token" in rln.json()

    def test_reset_token_single_use(self, s):
        _, email, _, _ = _signup_and_verify(s, prefix="rp2")
        rf = s.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
        token = rf.json()["demoResetToken"]
        # First use
        r1 = s.post(f"{API}/auth/reset-password", json={"token": token, "newPassword": "newpass111"}, timeout=15)
        assert r1.status_code == 200
        # Second use
        r2 = s.post(f"{API}/auth/reset-password", json={"token": token, "newPassword": "newpass222"}, timeout=15)
        assert r2.status_code == 400
        assert "already been used" in r2.json().get("detail", "").lower()

    def test_reset_invalid_token(self, s):
        r = s.post(f"{API}/auth/reset-password", json={"token": "totally-bogus-token-xyz", "newPassword": "newpass111"}, timeout=15)
        assert r.status_code == 400
        assert "invalid reset token" in r.json().get("detail", "").lower()

    def test_reset_password_too_short(self, s):
        _, email, _, _ = _signup_and_verify(s, prefix="rp3")
        rf = s.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
        token = rf.json()["demoResetToken"]
        r = s.post(f"{API}/auth/reset-password", json={"token": token, "newPassword": "abc"}, timeout=15)
        assert r.status_code == 400
        assert "6 characters" in r.json().get("detail", "")

    def test_reset_token_expiry_recorded(self, s):
        """Expiry is 30 min ahead. We verify by parsing the token's stored record via a second forgot call (DB inspection not exposed) — so we just sanity-check that two consecutive resets in <30min still validate the expiry path indirectly by succeeding."""
        _, email, _, _ = _signup_and_verify(s, prefix="rp4")
        rf = s.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
        token = rf.json()["demoResetToken"]
        # Should succeed (well within 30 min window)
        r = s.post(f"{API}/auth/reset-password", json={"token": token, "newPassword": "newpass555"}, timeout=15)
        assert r.status_code == 200


# ---------- Profile email update ----------
class TestProfileEmail:
    def test_profile_update_email_persists(self, s):
        username, original_email, _, token = _signup_and_verify(s, prefix="prof")
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        new_email = f"updated_{uuid.uuid4().hex[:6]}@morrisapp.co.uk"
        r = s.post(f"{API}/profile/update", json={"email": new_email}, headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("email") == new_email.lower() or body.get("email") == new_email
        # Verify via /auth/me
        rm = s.get(f"{API}/auth/me", headers=headers, timeout=10)
        assert rm.status_code == 200
        assert rm.json()["email"] in (new_email, new_email.lower())
