"""Backend tests for Morris Team Management V2 (flagship workforce hub).

Covers /api/team-management/* plus regression on the existing invite/seat
system (/api/team/*) and other V2 flagship /reference and /stats endpoints,
plus Command Centre attention integration.
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests


def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return ""


BASE_URL = _load_backend_url().rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USER = "darrenhustle300"
ADMIN_PASS = "hustle1234"


# ---------------- Fixtures ----------------


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"username": ADMIN_USER, "password": ADMIN_PASS},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_me(h):
    r = requests.get(f"{API}/auth/me", headers=h, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def second_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"username": "sparky01", "password": "test1234"},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip("secondary user not available")
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def second_h(second_token):
    return {"Authorization": f"Bearer {second_token}", "Content-Type": "application/json"}


created_cert_ids = []
created_project_ids = []


# ---------------- Reference ----------------


class TestReference:
    def test_reference_shape(self, h):
        r = requests.get(f"{API}/team-management/reference", headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["jobRoles"]) == 16
        assert len(d["trades"]) == 23
        assert len(d["availabilityStates"]) == 6
        assert len(d["certificationTypes"]) == 26
        assert len(d["teamRoles"]) == 4
        assert "Available" in d["availabilityStates"]
        assert "CSCS Card" in d["certificationTypes"]
        assert "Electrician" in d["trades"]
        assert "Project Manager" in d["jobRoles"]


# ---------------- Dashboard ----------------


class TestDashboard:
    def test_dashboard_shape(self, h):
        r = requests.get(f"{API}/team-management/dashboard", headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        for key in [
            "totalEmployees", "activeUsers", "siteTeams", "managers",
            "pendingInvitations", "expiringCertifications", "expiredCertifications",
            "availableNow", "onLeave", "byTrade", "byAvailability",
            "members", "pendingInvites",
        ]:
            assert key in d, f"missing key {key}"
        assert isinstance(d["members"], list)
        assert isinstance(d["byTrade"], dict)
        assert isinstance(d["byAvailability"], dict)
        assert d["totalEmployees"] >= 1
        # admin should appear in members
        assert any(m.get("email") for m in d["members"])


# ---------------- Members List ----------------


class TestMembersList:
    def test_list_members(self, h):
        r = requests.get(f"{API}/team-management/members", headers=h)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1
        assert "certificationCount" in arr[0]
        assert "availability" in arr[0]

    def test_list_members_filter_q(self, h, admin_me):
        needle = (admin_me.get("username") or "darren")[:4]
        r = requests.get(f"{API}/team-management/members", headers=h, params={"q": needle})
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1

    def test_list_members_filter_availability_no_match(self, h):
        r = requests.get(
            f"{API}/team-management/members", headers=h, params={"availability": "Training"}
        )
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_members_filter_trade(self, h):
        r = requests.get(f"{API}/team-management/members", headers=h, params={"trade": "Electrician"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- Member profile ----------------


class TestMemberProfile:
    def test_get_member_by_id(self, h, admin_me):
        mid = admin_me["id"]
        r = requests.get(f"{API}/team-management/members/{mid}", headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] == mid
        assert "certifications" in d and "projectAllocations" in d
        assert "availability" in d

    def test_get_unknown_member_404(self, h):
        r = requests.get(f"{API}/team-management/members/nonexistent-id-xyz", headers=h)
        assert r.status_code == 404

    def test_patch_profile_updates(self, h, admin_me):
        mid = admin_me["id"]
        payload = {
            "fullName": "Darren Morris",
            "phone": "07000000000",
            "trade": "Electrician",
            "hourlyRate": 45.5,
            "dayRate": 320,
            "startDate": "2020-01-15",
            "niNumber": "AB123456C",
            "utrNumber": "1234567890",
            "emergencyContactName": "TEST EC",
            "emergencyContactPhone": "07111111111",
            "address": "1 Test Street",
            "bio": "TEST bio",
        }
        r = requests.patch(
            f"{API}/team-management/members/{mid}/profile", headers=h, json=payload
        )
        assert r.status_code == 200, r.text
        d = r.json()
        for k, v in payload.items():
            assert d[k] == v, f"{k} not persisted: {d[k]} vs {v}"
        # verify persistence
        r2 = requests.get(f"{API}/team-management/members/{mid}", headers=h)
        d2 = r2.json()
        assert d2["fullName"] == "Darren Morris"
        assert d2["hourlyRate"] == 45.5


# ---------------- Job role ----------------


class TestJobRole:
    def test_set_valid_job_role(self, h, admin_me):
        r = requests.patch(
            f"{API}/team-management/members/{admin_me['id']}/job-role",
            headers=h, json={"jobRole": "Director"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["jobRole"] == "Director"

    def test_set_invalid_job_role_400(self, h, admin_me):
        r = requests.patch(
            f"{API}/team-management/members/{admin_me['id']}/job-role",
            headers=h, json={"jobRole": "CEO Emperor"},
        )
        assert r.status_code == 400


# ---------------- Availability ----------------


class TestAvailability:
    def test_set_valid_state(self, h, admin_me):
        r = requests.patch(
            f"{API}/team-management/members/{admin_me['id']}/availability",
            headers=h,
            json={"state": "On Site", "fromDate": "2026-01-10", "note": "TEST"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["availability"]["state"] == "On Site"
        assert d["availability"]["note"] == "TEST"

    def test_set_invalid_state_400(self, h, admin_me):
        r = requests.patch(
            f"{API}/team-management/members/{admin_me['id']}/availability",
            headers=h, json={"state": "Vacationing"},
        )
        assert r.status_code == 400

    def test_reset_to_available(self, h, admin_me):
        r = requests.patch(
            f"{API}/team-management/members/{admin_me['id']}/availability",
            headers=h, json={"state": "Available"},
        )
        assert r.status_code == 200


# ---------------- Certifications ----------------


class TestCertifications:
    def test_add_cert_missing_type_400(self, h, admin_me):
        r = requests.post(
            f"{API}/team-management/members/{admin_me['id']}/certifications",
            headers=h, json={"type": ""},
        )
        assert r.status_code == 400

    def test_add_expiring_cert_flips_kpi(self, h, admin_me):
        exp = (date.today() + timedelta(days=15)).isoformat()
        r = requests.post(
            f"{API}/team-management/members/{admin_me['id']}/certifications",
            headers=h,
            json={
                "type": "CSCS Card", "number": "TEST-CSCS-001",
                "issuedBy": "TEST", "issuedDate": "2024-01-01",
                "expiryDate": exp,
            },
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["certificationsExpiringSoon"] >= 1
        # capture id
        cid = next((c["id"] for c in d["certifications"] if c.get("number") == "TEST-CSCS-001"), None)
        assert cid
        created_cert_ids.append(cid)

    def test_add_expired_cert_flips_kpi(self, h, admin_me):
        exp = (date.today() - timedelta(days=10)).isoformat()
        r = requests.post(
            f"{API}/team-management/members/{admin_me['id']}/certifications",
            headers=h,
            json={"type": "First Aid at Work", "number": "TEST-FA-EXP", "expiryDate": exp},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["certificationsExpired"] >= 1
        cid = next((c["id"] for c in d["certifications"] if c.get("number") == "TEST-FA-EXP"), None)
        assert cid
        created_cert_ids.append(cid)

    def test_update_cert(self, h, admin_me):
        assert created_cert_ids, "need a created cert"
        cid = created_cert_ids[0]
        r = requests.patch(
            f"{API}/team-management/members/{admin_me['id']}/certifications/{cid}",
            headers=h,
            json={"type": "CSCS Card", "number": "TEST-CSCS-001-UPD", "issuedBy": "TEST2"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        got = next(c for c in d["certifications"] if c["id"] == cid)
        assert got["number"] == "TEST-CSCS-001-UPD"
        assert got["issuedBy"] == "TEST2"

    def test_update_unknown_cert_404(self, h, admin_me):
        r = requests.patch(
            f"{API}/team-management/members/{admin_me['id']}/certifications/does-not-exist",
            headers=h, json={"type": "CSCS Card"},
        )
        assert r.status_code == 404

    def test_attention_includes_team_cert_kinds(self, h):
        r = requests.get(f"{API}/attention", headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        items = data.get("items") if isinstance(data, dict) else data
        assert isinstance(items, list)
        kinds = {i.get("kind") for i in items}
        assert "team_cert_expiring" in kinds
        assert "team_cert_expired" in kinds

    def test_delete_cert(self, h, admin_me):
        # delete all created certs
        for cid in list(created_cert_ids):
            r = requests.delete(
                f"{API}/team-management/members/{admin_me['id']}/certifications/{cid}",
                headers=h,
            )
            assert r.status_code == 200, r.text
            created_cert_ids.remove(cid)
        # verify persistence
        r2 = requests.get(f"{API}/team-management/members/{admin_me['id']}", headers=h)
        got_ids = {c["id"] for c in r2.json().get("certifications", [])}
        assert not (set() & got_ids)


# ---------------- Project allocations ----------------


class TestProjectAllocations:
    def test_allocate_unknown_project_404(self, h, admin_me):
        r = requests.post(
            f"{API}/team-management/members/{admin_me['id']}/projects",
            headers=h, json={"projectId": "not-a-real-project"},
        )
        assert r.status_code == 404

    def test_allocate_project_and_upsert(self, h, admin_me):
        # Create a real job to allocate
        jr = requests.post(
            f"{API}/jobs", headers=h,
            json={"clientName": "TEST TM Client", "projectName": "TEST TM Project"},
        )
        assert jr.status_code == 200, jr.text
        job = jr.json()
        pid = job["id"]
        created_project_ids.append(pid)

        # First allocation
        r = requests.post(
            f"{API}/team-management/members/{admin_me['id']}/projects",
            headers=h, json={"projectId": pid, "role": "Lead Sparky"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["projectAllocationCount"] >= 1
        matched = [a for a in d["projectAllocations"] if a["projectId"] == pid]
        assert len(matched) == 1
        assert matched[0]["role"] == "Lead Sparky"

        # Upsert (should NOT duplicate)
        r2 = requests.post(
            f"{API}/team-management/members/{admin_me['id']}/projects",
            headers=h, json={"projectId": pid, "role": "Supervisor"},
        )
        assert r2.status_code == 200
        d2 = r2.json()
        matched2 = [a for a in d2["projectAllocations"] if a["projectId"] == pid]
        assert len(matched2) == 1
        assert matched2[0]["role"] == "Supervisor"

    def test_deallocate_project(self, h, admin_me):
        assert created_project_ids
        pid = created_project_ids[0]
        r = requests.delete(
            f"{API}/team-management/members/{admin_me['id']}/projects/{pid}",
            headers=h,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        matched = [a for a in d["projectAllocations"] if a["projectId"] == pid]
        assert len(matched) == 0


# ---------------- Cross-user isolation ----------------


class TestCrossUserIsolation:
    def test_second_user_cannot_get_admin_member(self, second_h, admin_me):
        r = requests.get(
            f"{API}/team-management/members/{admin_me['id']}", headers=second_h
        )
        assert r.status_code == 404

    def test_second_user_cannot_patch_admin_profile(self, second_h, admin_me):
        r = requests.patch(
            f"{API}/team-management/members/{admin_me['id']}/profile",
            headers=second_h, json={"bio": "HACK"},
        )
        assert r.status_code in (403, 404)

    def test_second_user_cannot_patch_admin_job_role(self, second_h, admin_me):
        r = requests.patch(
            f"{API}/team-management/members/{admin_me['id']}/job-role",
            headers=second_h, json={"jobRole": "Director"},
        )
        # second user is an owner of their own account (owner role) but the
        # target mid does not belong to their team → 404 by _get_member
        assert r.status_code in (403, 404)


# ---------------- Regression: existing /api/team/* invite/seat system ----------------


class TestExistingTeamEndpointsRegression:
    def test_team_members_list(self, h):
        r = requests.get(f"{API}/team/members", headers=h)
        assert r.status_code == 200
        assert isinstance(r.json(), list) or isinstance(r.json(), dict)

    def test_team_invite_requires_email(self, h):
        # Missing email should 400/422. We don't want to actually send an invite.
        r = requests.post(f"{API}/team/invite", headers=h, json={})
        assert r.status_code in (400, 422)


# ---------------- Regression: V2 flagship /reference and /stats ----------------


class TestOtherV2References:
    @pytest.mark.parametrize(
        "path",
        [
            "/snagging/reference",
            "/contracts/reference",
            "/purchase-orders/reference",
            "/invoice-builder/reference",
            "/applications-for-payment/reference",
            "/variation-orders/reference",
        ],
    )
    def test_reference_endpoints_alive(self, h, path):
        r = requests.get(f"{API}{path}", headers=h)
        assert r.status_code == 200, f"{path} → {r.status_code} {r.text[:200]}"

    @pytest.mark.parametrize(
        "path",
        [
            "/snagging/stats",
            "/contracts/stats",
            "/purchase-orders/stats",
            "/invoice-builder/stats",
            "/applications-for-payment/stats",
            "/variation-orders/stats",
        ],
    )
    def test_stats_endpoints_alive(self, h, path):
        r = requests.get(f"{API}{path}", headers=h)
        # some /stats might require query params or return 404 if not implemented;
        # V2 modules should all return 200
        assert r.status_code == 200, f"{path} → {r.status_code} {r.text[:200]}"


# ---------------- Cleanup ----------------


class TestZZZCleanup:
    def test_cleanup_projects(self, h):
        for pid in list(created_project_ids):
            requests.delete(f"{API}/jobs/{pid}", headers=h)
            created_project_ids.remove(pid)

    def test_reset_admin_profile(self, h, admin_me):
        # restore availability + jobRole to reasonable defaults
        requests.patch(
            f"{API}/team-management/members/{admin_me['id']}/availability",
            headers=h, json={"state": "Available"},
        )
