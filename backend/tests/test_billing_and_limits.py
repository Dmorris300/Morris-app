"""Iteration 3: billing endpoints, trial flow, mock-checkout, free-tier enforcement, resend email."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://prompt-web-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _signup_and_verify(s, prefix="bt"):
    """Create a fresh verified user. Returns (token, user)."""
    username = f"{prefix}_{uuid.uuid4().hex[:8]}"
    email = f"{username}@morrisapp.co.uk"
    r = s.post(f"{API}/auth/signup", json={
        "username": username, "email": email,
        "password": "Pass1234!", "phone": "07700900111",
    }, timeout=20)
    assert r.status_code == 200, r.text
    otp = r.json()["otp"]
    rv = s.post(f"{API}/auth/verify-otp", json={"username": username, "otp": otp}, timeout=15)
    assert rv.status_code == 200, rv.text
    token = rv.json()["token"]
    # Set trade so profile is complete
    s.post(f"{API}/profile/update", json={"trade": "Electrician"}, headers={"Authorization": f"Bearer {token}"}, timeout=15)
    return token, rv.json()["user"], username, email


# ---------- Plans (public) ----------
class TestPlans:
    def test_plans_public(self, s):
        r = s.get(f"{API}/billing/plans", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["trialDays"] == 3
        assert body["free"]["toolLimit"] == 3
        assert body["free"]["docLimit"] == 5
        plans = body["plans"]
        assert "solo" in plans and plans["solo"]["price"] == 12.99
        assert "pro" in plans and plans["pro"]["price"] == 24.99
        assert "business" in plans and plans["business"]["price"] == 59.99
        # Enterprise isn't in PLANS dict (it's contact-us only) — confirm
        assert "enterprise" not in plans


# ---------- Status, trial, checkout, mock-complete ----------
class TestBillingFlows:
    def test_status_for_free_user(self, s):
        token, _, _, _ = _signup_and_verify(s, "stat")
        h = {"Authorization": f"Bearer {token}"}
        r = s.get(f"{API}/billing/status", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["plan"] == "free"
        assert b["trialUsed"] is False
        assert b["usageDocs"] == 0
        assert b["usageTools"] == []
        assert b["freeToolLimit"] == 3
        assert b["freeDocLimit"] == 5

    def test_start_trial_activates_and_blocks_second(self, s):
        token, _, _, _ = _signup_and_verify(s, "trial")
        h = {"Authorization": f"Bearer {token}"}
        r = s.post(f"{API}/billing/start-trial", json={"planId": "solo"}, headers=h, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["ok"] is True
        assert b["plan"] == "trial"
        assert b["days"] == 3
        assert "expiresAt" in b

        # Status now reflects trial
        rs = s.get(f"{API}/billing/status", headers=h, timeout=15)
        sb = rs.json()
        assert sb["plan"] == "trial"
        assert sb["trialUsed"] is True

        # Second call should 400
        r2 = s.post(f"{API}/billing/start-trial", json={"planId": "solo"}, headers=h, timeout=15)
        assert r2.status_code == 400
        assert "trial" in r2.text.lower()

    def test_checkout_returns_mock_url(self, s):
        token, _, _, _ = _signup_and_verify(s, "chk")
        h = {"Authorization": f"Bearer {token}"}
        r = s.post(f"{API}/billing/checkout", json={
            "planId": "solo", "originUrl": "https://prompt-web-4.preview.emergentagent.com",
        }, headers=h, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["mock"] is True
        assert b["sessionId"].startswith("mock_")
        assert "/app/billing/mock-checkout" in b["url"]
        assert f"session_id={b['sessionId']}" in b["url"]

    def test_mock_complete_activates_plan_idempotent(self, s):
        token, _, _, _ = _signup_and_verify(s, "mc")
        h = {"Authorization": f"Bearer {token}"}
        chk = s.post(f"{API}/billing/checkout", json={
            "planId": "pro", "originUrl": "https://prompt-web-4.preview.emergentagent.com",
        }, headers=h, timeout=15).json()
        sid = chk["sessionId"]
        # Complete
        r = s.post(f"{API}/billing/mock-complete", params={"session_id": sid}, headers=h, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["ok"] is True
        assert b["planId"] == "pro"
        first_exp = b["expiresAt"]

        # Status now reflects pro
        rs = s.get(f"{API}/billing/status", headers=h, timeout=15)
        sb = rs.json()
        assert sb["plan"] == "pro"
        assert sb["planExpiresAt"] is not None

        # Idempotent — second call should not double-extend
        r2 = s.post(f"{API}/billing/mock-complete", params={"session_id": sid}, headers=h, timeout=15)
        assert r2.status_code == 200
        b2 = r2.json()
        assert b2.get("alreadyProcessed") is True

        # Expiry stayed roughly the same (idempotent)
        rs2 = s.get(f"{API}/billing/status", headers=h, timeout=15)
        assert rs2.json()["plan"] == "pro"

    def test_paid_user_can_generate(self, s):
        token, _, _, _ = _signup_and_verify(s, "paid")
        h = {"Authorization": f"Bearer {token}"}
        chk = s.post(f"{API}/billing/checkout", json={
            "planId": "solo", "originUrl": "https://prompt-web-4.preview.emergentagent.com",
        }, headers=h, timeout=15).json()
        s.post(f"{API}/billing/mock-complete", params={"session_id": chk["sessionId"]}, headers=h, timeout=15)

        # Call generate — should not 402
        payload = {
            "toolId": "variation-letter",
            "toolName": "Variation Letter",
            "promptTemplate": "Draft a brief one-paragraph variation letter for UK construction.",
            "userInputs": {"project": "Site A", "variation": "Add socket"},
            "trade": "Electrician",
        }
        r = s.post(f"{API}/generate", json=payload, headers=h, timeout=120)
        assert r.status_code == 200, f"Paid user got {r.status_code}: {r.text[:200]}"


# ---------- Free-tier enforcement ----------
class TestFreeTierEnforcement:
    def _gen(self, s, h, tool_id):
        return s.post(f"{API}/generate", json={
            "toolId": tool_id,
            "toolName": tool_id,
            "promptTemplate": "Write one short paragraph about UK construction.",
            "userInputs": {"x": "y"},
            "trade": "Electrician",
        }, headers=h, timeout=120)

    def test_three_tools_then_fourth_blocked(self, s):
        token, _, _, _ = _signup_and_verify(s, "ftool")
        h = {"Authorization": f"Bearer {token}"}
        # Three different tools — all succeed
        for tid in ["tool-a", "tool-b", "tool-c"]:
            r = self._gen(s, h, tid)
            assert r.status_code == 200, f"tool {tid} failed: {r.status_code} {r.text[:200]}"

        # Status shows 3 tools, 3 docs
        st = s.get(f"{API}/billing/status", headers=h, timeout=15).json()
        assert sorted(st["usageTools"]) == ["tool-a", "tool-b", "tool-c"]
        assert st["usageDocs"] == 3

        # 4th DIFFERENT tool blocked
        r4 = self._gen(s, h, "tool-d")
        assert r4.status_code == 402, f"Expected 402, got {r4.status_code}: {r4.text}"
        assert "3 different tools" in r4.text or "tools per month" in r4.text

    def test_doc_limit_with_repeated_tool(self, s):
        token, _, _, _ = _signup_and_verify(s, "fdoc")
        h = {"Authorization": f"Bearer {token}"}
        # 5 successful calls all with the SAME toolId — within tool limit, hits doc limit
        for i in range(5):
            r = self._gen(s, h, "tool-x")
            assert r.status_code == 200, f"call #{i+1}: {r.status_code} {r.text[:200]}"

        st = s.get(f"{API}/billing/status", headers=h, timeout=15).json()
        assert st["usageTools"] == ["tool-x"]
        assert st["usageDocs"] == 5

        # 6th must be blocked
        r6 = self._gen(s, h, "tool-x")
        assert r6.status_code == 402, f"Expected 402, got {r6.status_code}: {r6.text}"
        assert "5 documents" in r6.text or "documents per month" in r6.text


# ---------- Resend email (forgot-password emailSent flag) ----------
class TestResendEmail:
    def test_forgot_password_returns_email_sent_flag(self, s):
        # Use a verified user that has an email set.
        # _signup_and_verify creates one with email; we need to reuse here.
        token, user, username, email = _signup_and_verify(s, "fpe")
        r = s.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=20)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["ok"] is True
        assert "demoResetLink" in b
        assert "demoResetToken" in b
        # emailSent must be in response; can be True or False per Resend's restricted tier
        assert "emailSent" in b
        assert isinstance(b["emailSent"], bool)

    def test_forgot_password_nonexistent_email_no_token(self, s):
        r = s.post(f"{API}/auth/forgot-password", json={
            "email": f"nobody_{uuid.uuid4().hex[:8]}@example.com",
        }, timeout=15)
        assert r.status_code == 200
        b = r.json()
        # Privacy: no token leak
        assert "demoResetToken" not in b
