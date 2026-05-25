"""Iteration 6: Phase 1A + 1B — admin unlimited bypass, refNumber, auto-save, no dashes, free-tier isolation."""
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://prompt-web-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"username": "darrenhustle300", "password": "hustle1234"}
FREE_USER = {"username": "sparky01", "password": "test1234"}


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- 1A: Plans shape still intact ----------
class TestPlansShape:
    def test_plans_unchanged_shape(self, s):
        r = s.get(f"{API}/billing/plans", timeout=15)
        assert r.status_code == 200
        body = r.json()
        # Solo/pro/business unchanged
        assert body["plans"]["solo"]["price"] == 12.99
        assert body["plans"]["pro"]["price"] == 24.99
        assert body["plans"]["business"]["price"] == 59.99
        assert body["free"]["toolLimit"] == 3
        assert body["free"]["docLimit"] == 5


# ---------- 1A: Admin bypass ----------
class TestAdminBypass:
    def test_admin_login_returns_token(self, s):
        r = s.post(f"{API}/auth/login", json=ADMIN, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body.get("token"), str) and len(body["token"]) > 10
        assert body["user"]["username"].lower() == "darrenhustle300"

    def test_admin_me_flags(self, s, admin_headers):
        r = s.get(f"{API}/auth/me", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        me = r.json()
        assert me.get("isAdmin") is True, f"isAdmin not True: {me}"
        assert me.get("isUnlimited") is True, f"isUnlimited not True: {me}"

    def test_admin_billing_status_unlimited(self, s, admin_headers):
        r = s.get(f"{API}/billing/status", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("plan") == "unlimited", f"expected plan=unlimited, got: {body}"
        assert body.get("isUnlimited") is True


# ---------- 1B: refNumber format + DATE/REVIEW DATE/ref header + no dashes + auto-save ----------
EM_DASH = "\u2014"
EN_DASH = "\u2013"
REF_PATTERN = re.compile(r"^[A-Z]+-[A-Z]{1,4}-\d{6}-\d{3}$")


class TestGenerateAdminPhase1B:
    def _gen(self, s, h, tool_id="rams"):
        return s.post(f"{API}/generate", json={
            "toolId": tool_id,
            "toolName": "RAMS",
            "promptTemplate": "Draft a brief 200-word risk assessment & method statement for an electrical first-fix on a small UK commercial site. Include hazards, controls and PPE.",
            "userInputs": {
                "project": "Office refurb 12 Hatton Wall, London",
                "task": "Electrical first-fix",
                "site": "12 Hatton Wall, London EC1",
                "duration": "5 days",
            },
            "trade": "Electrician",
        }, headers=h, timeout=180)

    def test_admin_generate_returns_refnumber_and_header(self, s, admin_headers):
        r = self._gen(s, admin_headers, "rams")
        assert r.status_code == 200, f"generate failed: {r.status_code} {r.text[:500]}"
        body = r.json()
        assert body.get("ok") is True

        # refNumber present & well-formed
        ref = body.get("refNumber")
        assert ref, f"refNumber missing: {body}"
        assert REF_PATTERN.match(ref), f"refNumber format wrong: {ref!r}"
        # Tool RAMS → prefix RAMS, initials DM (Darren Morris)
        assert ref.startswith("RAMS-"), f"expected RAMS- prefix: {ref}"
        parts = ref.split("-")
        assert parts[1] in ("DM", "D", "DAMO"), f"expected initials DM-ish, got: {parts[1]}"

        # Content contains DOCUMENT REFERENCE / DATE / REVIEW DATE header
        content = body.get("content", "")
        assert isinstance(content, str) and len(content) > 200, "content too short"
        head = content[:600].upper()
        assert "DOCUMENT REFERENCE" in head, f"missing DOCUMENT REFERENCE header. head={head[:300]!r}"
        assert "DATE" in head, "missing DATE header"
        assert "REVIEW DATE" in head, "missing REVIEW DATE header"

        # No em-dash or en-dash anywhere
        assert EM_DASH not in content, f"em-dash present in content"
        assert EN_DASH not in content, f"en-dash present in content"

    def test_admin_generation_auto_saved_to_vault(self, s, admin_headers):
        # Get initial doc count
        before_r = s.get(f"{API}/documents", headers=admin_headers, timeout=15)
        assert before_r.status_code == 200
        before_count = len(before_r.json())

        # Generate
        r = self._gen(s, admin_headers, "rams")
        assert r.status_code == 200
        gen_body = r.json()
        ref = gen_body["refNumber"]

        # Get docs again — should contain the new one with refNumber + autoSaved=true
        after_r = s.get(f"{API}/documents", headers=admin_headers, timeout=15)
        assert after_r.status_code == 200
        docs = after_r.json()
        assert len(docs) >= before_count + 1, f"expected ≥{before_count+1} docs after gen, got {len(docs)}"

        # Find the doc by refNumber
        matching = [d for d in docs if d.get("refNumber") == ref]
        assert matching, f"no document with refNumber={ref} found in /documents. fields seen: {set().union(*(d.keys() for d in docs[:3])) if docs else 'none'}"
        doc = matching[0]
        assert doc.get("autoSaved") is True, f"autoSaved not True: {doc}"


# ---------- 1A: Free-tier still enforced (admin bypass must not leak) ----------
class TestFreeTierIsolation:
    def _signup_and_verify(self, s, prefix="iso"):
        username = f"{prefix}_{uuid.uuid4().hex[:8]}"
        email = f"{username}@morrisapp.co.uk"
        r = s.post(f"{API}/auth/signup", json={
            "username": username, "email": email,
            "password": "Pass1234!", "phone": "07700900111",
        }, timeout=20)
        assert r.status_code == 200, r.text
        otp = r.json()["otp"]
        rv = s.post(f"{API}/auth/verify-otp", json={"username": username, "otp": otp}, timeout=15)
        assert rv.status_code == 200
        token = rv.json()["token"]
        s.post(f"{API}/profile/update", json={"trade": "Electrician"}, headers={"Authorization": f"Bearer {token}"}, timeout=15)
        return token

    def _gen(self, s, h, tid):
        return s.post(f"{API}/generate", json={
            "toolId": tid, "toolName": tid,
            "promptTemplate": "Write one short paragraph about UK construction safety.",
            "userInputs": {"x": "y"},
            "trade": "Electrician",
        }, headers=h, timeout=120)

    def test_fresh_free_user_status_has_limits(self, s):
        tok = self._signup_and_verify(s, "isolim")
        h = {"Authorization": f"Bearer {tok}"}
        r = s.get(f"{API}/billing/status", headers=h, timeout=15)
        assert r.status_code == 200
        b = r.json()
        assert b["plan"] == "free", f"expected free plan, got: {b}"
        assert b.get("isUnlimited") in (False, None), f"non-admin must NOT be unlimited: {b}"
        assert b["freeToolLimit"] == 3
        assert b["freeDocLimit"] == 5

    def test_fresh_free_user_hits_3_tool_cap(self, s):
        tok = self._signup_and_verify(s, "iso3t")
        h = {"Authorization": f"Bearer {tok}"}
        # 3 distinct tools succeed
        for tid in ["iso-a", "iso-b", "iso-c"]:
            r = self._gen(s, h, tid)
            assert r.status_code == 200, f"{tid}: {r.status_code} {r.text[:200]}"
        # 4th distinct tool blocked
        r4 = self._gen(s, h, "iso-d")
        assert r4.status_code == 402, f"expected 402 cap, got {r4.status_code}: {r4.text[:200]}"
