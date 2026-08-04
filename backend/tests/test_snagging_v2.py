"""Backend tests for Morris Snagging Lists V2 (flagship defect / QA management)."""
import os
import time
import uuid
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v: return v
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
    r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"No token in {r.json()}"
    return tok


@pytest.fixture(scope="module")
def h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def second_user_token():
    """Second user for isolation tests."""
    r = requests.post(f"{API}/auth/login", json={"username": "sparky01", "password": "test1234"}, timeout=30)
    if r.status_code != 200:
        pytest.skip("secondary user not available")
    return r.json().get("token") or r.json().get("access_token")


created_snag_ids = []
created_template_ids = []


# ---------------- Reference ----------------

class TestReference:
    def test_reference(self, h):
        r = requests.get(f"{API}/snagging/reference", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert len(d["priorities"]) == 4
        assert len(d["statuses"]) == 6
        assert len(d["trades"]) == 21
        assert len(d["categories"]) == 12
        assert len(d["commonAreas"]) == 30
        assert "Critical" in d["priorities"]
        assert "Awaiting Verification" in d["statuses"]


# ---------------- Create / Validate ----------------

class TestCreateAndValidate:
    def test_create_missing_project(self, h):
        r = requests.post(f"{API}/snagging/snags", headers=h, json={"title": "TEST No Project"})
        assert r.status_code == 400

    def test_create_missing_title(self, h):
        r = requests.post(f"{API}/snagging/snags", headers=h, json={"projectName": "TEST Proj", "title": ""})
        assert r.status_code == 400

    def test_create_basic_snag_and_ref_format(self, h):
        payload = {
            "projectName": "TEST Handover Site",
            "projectId": f"proj-test-{uuid.uuid4().hex[:6]}",
            "title": "TEST Cracked skirting board",
            "description": "Cracked skirting in bedroom 1",
            "area": "Bedroom 1",
            "trade": "Carpenter / Joiner",
            "category": "Damage",
            "priority": "High",
        }
        r = requests.post(f"{API}/snagging/snags", headers=h, json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == payload["title"]
        assert d["status"] == "Open"  # no assignedTo → stays Open
        assert d["snagRef"].startswith("SNG-")
        parts = d["snagRef"].split("-")
        assert len(parts) == 3 and len(parts[2]) == 4 and parts[2].isdigit()
        assert d["photosBeforeCount"] == 0
        assert d["commentsCount"] == 0
        assert isinstance(d.get("history"), list) and len(d["history"]) >= 1
        assert d["history"][0]["kind"] == "created"
        created_snag_ids.append(d["id"])
        # verify persistence
        g = requests.get(f"{API}/snagging/snags/{d['id']}", headers=h)
        assert g.status_code == 200
        assert g.json()["snagRef"] == d["snagRef"]

    def test_create_assigned_auto_moves_to_assigned(self, h):
        payload = {
            "projectName": "TEST Auto-Assign Site",
            "projectId": "proj-test-auto",
            "title": "TEST Auto assigned on create",
            "assignedTo": "Bob Builder",
            "priority": "Medium",
        }
        r = requests.post(f"{API}/snagging/snags", headers=h, json=payload)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "Assigned"
        assert any(hst["kind"] == "assigned" for hst in d["history"])
        created_snag_ids.append(d["id"])


# ---------------- Filters / List ----------------

class TestListFilters:
    def test_list_with_filters(self, h):
        r = requests.get(f"{API}/snagging/snags", headers=h, params={"priority": "High"})
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert all(x["priority"] == "High" for x in rows)
        assert all("isOverdue" in x for x in rows)

    def test_list_search_by_ref(self, h):
        assert created_snag_ids
        # get one snagRef
        one = requests.get(f"{API}/snagging/snags/{created_snag_ids[0]}", headers=h).json()
        ref = one["snagRef"]
        r = requests.get(f"{API}/snagging/snags", headers=h, params={"q": ref})
        assert r.status_code == 200
        rows = r.json()
        assert any(x["snagRef"] == ref for x in rows)

    def test_list_overdue_filter(self, h):
        # Create a snag with dueDate in the past
        payload = {
            "projectName": "TEST Overdue Site", "projectId": "proj-overdue",
            "title": "TEST overdue snag", "dueDate": "2020-01-01", "priority": "Critical",
        }
        r = requests.post(f"{API}/snagging/snags", headers=h, json=payload)
        assert r.status_code == 200
        sid = r.json()["id"]
        created_snag_ids.append(sid)
        assert r.json()["isOverdue"] is True
        r2 = requests.get(f"{API}/snagging/snags", headers=h, params={"overdue": "true"})
        assert r2.status_code == 200
        assert any(x["id"] == sid for x in r2.json())


# ---------------- Update / Delete ----------------

class TestUpdateDelete:
    def test_patch_snag(self, h):
        sid = created_snag_ids[0]
        r = requests.patch(f"{API}/snagging/snags/{sid}", headers=h, json={"description": "Updated desc"})
        assert r.status_code == 200
        assert r.json()["description"] == "Updated desc"

    def test_patch_unknown(self, h):
        r = requests.patch(f"{API}/snagging/snags/nope-xxx", headers=h, json={"description": "x"})
        assert r.status_code == 404

    def test_soft_delete(self, h):
        # Make a throwaway snag
        r = requests.post(f"{API}/snagging/snags", headers=h,
                          json={"projectName": "TEST del", "title": "TEST delete me"})
        sid = r.json()["id"]
        d = requests.delete(f"{API}/snagging/snags/{sid}", headers=h)
        assert d.status_code == 200
        # not returned in list
        rows = requests.get(f"{API}/snagging/snags", headers=h).json()
        assert not any(x["id"] == sid for x in rows)
        # 404 on GET
        g = requests.get(f"{API}/snagging/snags/{sid}", headers=h)
        assert g.status_code == 404


# ---------------- Status / Assign / Comment / Photos / Verify ----------------

class TestLifecycle:
    @pytest.fixture(scope="class")
    def snag_id(self, h):
        r = requests.post(f"{API}/snagging/snags", headers=h, json={
            "projectName": "TEST Lifecycle", "projectId": "proj-lifecycle",
            "title": "TEST Lifecycle snag", "priority": "High",
        })
        assert r.status_code == 200
        sid = r.json()["id"]
        created_snag_ids.append(sid)
        return sid

    def test_assign(self, h, snag_id):
        r = requests.post(f"{API}/snagging/snags/{snag_id}/assign", headers=h, json={
            "assignedTo": "Alice Fixer", "assignedEmail": "alice@example.com",
            "assignedCompany": "AF Ltd", "dueDate": "2030-12-31",
        })
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "Assigned"
        assert d["assignedTo"] == "Alice Fixer"
        assert d["dueDate"] == "2030-12-31"
        assert any(hst["kind"] == "assigned" for hst in d["history"])

    def test_status_invalid(self, h, snag_id):
        r = requests.post(f"{API}/snagging/snags/{snag_id}/status", headers=h, json={"status": "Bogus"})
        assert r.status_code == 400

    def test_status_in_progress(self, h, snag_id):
        r = requests.post(f"{API}/snagging/snags/{snag_id}/status", headers=h,
                          json={"status": "In Progress", "note": "started"})
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "In Progress"
        # history has from/to
        last = [x for x in d["history"] if x["kind"] == "status"][-1]
        assert last["from"] == "Assigned" and last["to"] == "In Progress"

    def test_comment_add_and_delete(self, h, snag_id):
        # empty comment 400
        r0 = requests.post(f"{API}/snagging/snags/{snag_id}/comment", headers=h, json={"text": "  "})
        assert r0.status_code == 400
        r = requests.post(f"{API}/snagging/snags/{snag_id}/comment", headers=h, json={"text": "First comment"})
        assert r.status_code == 200
        d = r.json()
        assert d["commentsCount"] == 1
        c = d["comments"][-1]
        assert c["text"] == "First comment" and c["by"] and c["at"]
        cid = c["id"]
        # delete
        d2 = requests.delete(f"{API}/snagging/snags/{snag_id}/comment/{cid}", headers=h)
        assert d2.status_code == 200
        assert d2.json()["commentsCount"] == 0

    def test_photos_before_after(self, h, snag_id):
        r = requests.post(f"{API}/snagging/snags/{snag_id}/photos", headers=h,
                          json={"kind": "before", "url": "https://x.example/b.jpg", "caption": "Before"})
        assert r.status_code == 200
        d = r.json()
        assert d["photosBeforeCount"] == 1 and d["photosAfterCount"] == 0
        pid = d["photosBefore"][0]["id"]
        assert d["photosBefore"][0]["uploadedAt"]
        assert d["photosBefore"][0]["uploadedBy"]

        r2 = requests.post(f"{API}/snagging/snags/{snag_id}/photos", headers=h,
                           json={"kind": "after", "url": "https://x.example/a.jpg"})
        assert r2.status_code == 200
        assert r2.json()["photosAfterCount"] == 1

        # invalid kind
        r3 = requests.post(f"{API}/snagging/snags/{snag_id}/photos", headers=h,
                           json={"kind": "side", "url": "https://x/x.jpg"})
        assert r3.status_code == 400

        # delete photo
        rd = requests.delete(f"{API}/snagging/snags/{snag_id}/photos/{pid}", headers=h)
        assert rd.status_code == 200
        assert rd.json()["photosBeforeCount"] == 0

        # delete unknown photo -> current impl returns 200 idempotently; just ensure not 500
        rd2 = requests.delete(f"{API}/snagging/snags/{snag_id}/photos/nonexistent", headers=h)
        assert rd2.status_code in (200, 404)

    def test_awaiting_then_verify_closes(self, h, snag_id):
        r = requests.post(f"{API}/snagging/snags/{snag_id}/status", headers=h,
                          json={"status": "Awaiting Verification"})
        assert r.status_code == 200
        assert r.json()["status"] == "Awaiting Verification"
        v = requests.post(f"{API}/snagging/snags/{snag_id}/verify", headers=h,
                         json={"verifiedBy": "QA Manager", "note": "All good"})
        assert v.status_code == 200
        d = v.json()
        assert d["status"] == "Closed"
        assert d["verifiedAt"] and d["verifiedBy"] == "QA Manager"
        assert d["closedAt"] and d["completionDate"]

    def test_reopen_clears_closedAt(self, h, snag_id):
        r = requests.post(f"{API}/snagging/snags/{snag_id}/reopen", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "Open"
        assert d["closedAt"] == ""
        assert d["reopenedAt"]

    def test_close_shortcut(self, h, snag_id):
        r = requests.post(f"{API}/snagging/snags/{snag_id}/close", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "Closed"
        assert d["closedAt"]

    def test_unknown_snag_404s(self, h):
        for path in ["/status", "/assign", "/comment", "/photos", "/verify", "/close", "/reopen"]:
            r = requests.post(f"{API}/snagging/snags/nope-999{path}", headers=h,
                              json={"status": "Open", "assignedTo": "x", "text": "x",
                                    "kind": "before", "url": "http://x"})
            assert r.status_code == 404, f"{path} → {r.status_code}"


# ---------------- Stats / Project Summary ----------------

class TestStats:
    def test_stats(self, h):
        r = requests.get(f"{API}/snagging/stats", headers=h)
        assert r.status_code == 200
        d = r.json()
        for k in ["total", "open", "highPriority", "overdue", "closedToday",
                  "assignedToMe", "byPriority", "byStatus", "recent"]:
            assert k in d, f"missing {k}"
        assert d["open"] == (d["byStatus"].get("Open", 0)
                             + d["byStatus"].get("Assigned", 0)
                             + d["byStatus"].get("In Progress", 0)
                             + d["byStatus"].get("Awaiting Verification", 0))
        assert isinstance(d["recent"], list)

    def test_project_summary(self, h):
        # Create isolated project with 2 snags, close 1
        pid = f"proj-sum-{uuid.uuid4().hex[:6]}"
        s1 = requests.post(f"{API}/snagging/snags", headers=h, json={
            "projectId": pid, "projectName": "TEST Sum", "title": "TEST s1",
            "priority": "Low", "area": "Kitchen", "trade": "Plumber",
        }).json()
        s2 = requests.post(f"{API}/snagging/snags", headers=h, json={
            "projectId": pid, "projectName": "TEST Sum", "title": "TEST s2",
            "priority": "Critical", "area": "Bathroom", "trade": "Tiler",
        }).json()
        created_snag_ids.extend([s1["id"], s2["id"]])
        requests.post(f"{API}/snagging/snags/{s1['id']}/close", headers=h)
        r = requests.get(f"{API}/snagging/project/{pid}/summary", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert d["totalSnags"] == 2
        assert d["closedSnags"] == 1 and d["openSnags"] == 1
        assert d["percentComplete"] == 50.0
        assert d["byArea"].get("Kitchen") == 1 and d["byArea"].get("Bathroom") == 1
        assert d["byTrade"].get("Plumber") == 1 and d["byTrade"].get("Tiler") == 1
        assert len(d["snags"]) == 2


# ---------------- Templates ----------------

class TestTemplates:
    def test_template_crud(self, h):
        r = requests.post(f"{API}/snagging/templates", headers=h,
                          json={"name": "TEST Template A", "payload": {"trade": "Plumber"}})
        assert r.status_code == 200
        tid = r.json()["id"]
        created_template_ids.append(tid)
        lst = requests.get(f"{API}/snagging/templates", headers=h).json()
        assert any(t["id"] == tid for t in lst)
        d = requests.delete(f"{API}/snagging/templates/{tid}", headers=h)
        assert d.status_code == 200
        # 404 second time
        d2 = requests.delete(f"{API}/snagging/templates/{tid}", headers=h)
        assert d2.status_code == 404

    def test_template_name_required(self, h):
        r = requests.post(f"{API}/snagging/templates", headers=h, json={"name": " ", "payload": {}})
        assert r.status_code == 400


# ---------------- Global search ----------------

class TestGlobalSearch:
    def test_search_by_snag_ref(self, h):
        # ensure at least one snag exists
        s = requests.post(f"{API}/snagging/snags", headers=h,
                          json={"projectName": "TEST Search", "title": "TEST search me"}).json()
        created_snag_ids.append(s["id"])
        ref = s["snagRef"]
        r = requests.get(f"{API}/search", headers=h, params={"q": ref})
        assert r.status_code == 200, r.text
        data = r.json()
        # Response could be list or dict with buckets — inspect flexibly
        items = []
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            for v in data.values():
                if isinstance(v, list):
                    items.extend(v)
        assert items, "search returned no items"
        matched = [x for x in items if isinstance(x, dict) and (
            (x.get("route") or "").startswith("/app/snagging-list")
            or "snag" in ((x.get("kind") or x.get("bucket") or "") + "").lower()
        )]
        assert matched, f"no snag results in search response: {data}"


# ---------------- Command Centre attention ----------------

class TestAttention:
    def test_attention_includes_snag_kinds(self, h):
        # create an overdue + a critical snag to guarantee items
        requests.post(f"{API}/snagging/snags", headers=h, json={
            "projectName": "TEST Attn Overdue", "title": "TEST overdue attn",
            "dueDate": "2020-01-01", "priority": "High",
        })
        requests.post(f"{API}/snagging/snags", headers=h, json={
            "projectName": "TEST Attn Crit", "title": "TEST critical attn",
            "priority": "Critical",
        })
        r = requests.get(f"{API}/attention", headers=h)
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else (data.get("items") or [])
        kinds = {x.get("kind") for x in items}
        assert "snag_overdue" in kinds, f"no snag_overdue in kinds {kinds}"
        assert "snag_critical" in kinds, f"no snag_critical in kinds {kinds}"


# ---------------- Cross-user isolation ----------------

class TestIsolation:
    def test_other_user_cannot_see(self, h, second_user_token):
        # create snag as admin
        r = requests.post(f"{API}/snagging/snags", headers=h, json={
            "projectName": "TEST Iso", "title": "TEST isolation snag"})
        sid = r.json()["id"]
        created_snag_ids.append(sid)
        h2 = {"Authorization": f"Bearer {second_user_token}"}
        g = requests.get(f"{API}/snagging/snags/{sid}", headers=h2)
        assert g.status_code == 404
        lst = requests.get(f"{API}/snagging/snags", headers=h2).json()
        assert not any(x["id"] == sid for x in lst)
        # templates isolation
        t = requests.post(f"{API}/snagging/templates", headers=h,
                          json={"name": "TEST Iso T", "payload": {}}).json()
        created_template_ids.append(t["id"])
        lst_t = requests.get(f"{API}/snagging/templates", headers=h2).json()
        assert not any(x["id"] == t["id"] for x in lst_t)


# ---------------- Regression on other V2 endpoints ----------------

class TestRegression:
    @pytest.mark.parametrize("path", [
        "/contracts/reference", "/contracts/stats",
        "/purchase-orders/reference", "/purchase-orders/stats",
        "/invoice-builder/reference", "/invoice-builder/stats",
        "/applications-for-payment/reference", "/applications-for-payment/stats",
        "/variation-orders/reference", "/variation-orders/stats",
    ])
    def test_endpoint_ok(self, h, path):
        r = requests.get(f"{API}{path}", headers=h)
        assert r.status_code == 200, f"{path} → {r.status_code} {r.text[:200]}"


# ---------------- Cleanup ----------------

def test_zzz_cleanup(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    for sid in set(created_snag_ids):
        requests.delete(f"{API}/snagging/snags/{sid}", headers=h)
    for tid in set(created_template_ids):
        requests.delete(f"{API}/snagging/templates/{tid}", headers=h)
