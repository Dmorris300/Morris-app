"""Backend tests for Morris Compliance Hub (iteration 13).

Covers:
  - GET /api/compliance/types
  - POST /api/compliance/items (create)
  - GET /api/compliance/items (list + filter)
  - GET /api/compliance/summary
  - PATCH /api/compliance/items/{id}
  - DELETE /api/compliance/items/{id} (soft delete)
  - Integration with /api/attention (compliance_expiring kind)
"""

import os
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://prompt-web-4.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "darrenhustle300", "password": "hustle1234"
    }, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_ids():
    return []


# ---------- /types ----------
def test_get_types(auth_headers):
    r = requests.get(f"{BASE_URL}/api/compliance/types", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    for cat in ("insurance", "personnel", "vehicle", "other"):
        assert cat in data
    assert "Employers Liability" in data["insurance"]
    assert "CSCS" in data["personnel"]
    assert "MOT" in data["vehicle"]


# ---------- POST /items ----------
def test_create_item_and_days_until_expiry(auth_headers, created_ids):
    expiry = (datetime.now(timezone.utc).date() + timedelta(days=40)).isoformat()
    body = {
        "category": "insurance",
        "type": "Employers Liability",
        "name": "TEST_Compliance Ltd",
        "issuer": "TestInsurer",
        "refNumber": "POL-TEST-001",
        "expiryDate": expiry,
    }
    r = requests.post(f"{BASE_URL}/api/compliance/items", headers=auth_headers, json=body, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["id"]
    assert data["category"] == "insurance"
    assert data["type"] == "Employers Liability"
    assert data["name"] == "TEST_Compliance Ltd"
    assert data["expiryDate"] == expiry
    # daysUntilExpiry should be ~40 (allow off-by-one for timezone)
    assert data.get("daysUntilExpiry") in (39, 40, 41)
    assert "_id" not in data
    created_ids.append(data["id"])


def test_create_item_invalid_category(auth_headers):
    r = requests.post(f"{BASE_URL}/api/compliance/items", headers=auth_headers,
                      json={"category": "bogus", "type": "X", "name": "Y"}, timeout=30)
    assert r.status_code == 400


def test_create_item_missing_name(auth_headers):
    r = requests.post(f"{BASE_URL}/api/compliance/items", headers=auth_headers,
                      json={"category": "insurance", "type": "Public Liability", "name": ""}, timeout=30)
    assert r.status_code == 400


# ---------- GET /items ----------
def test_list_items_returns_created(auth_headers, created_ids):
    r = requests.get(f"{BASE_URL}/api/compliance/items", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list)
    ids = [x["id"] for x in rows]
    assert created_ids[0] in ids
    # No _id leakage
    for row in rows:
        assert "_id" not in row


def test_list_items_filter_by_category(auth_headers, created_ids):
    r = requests.get(f"{BASE_URL}/api/compliance/items?category=insurance",
                     headers=auth_headers, timeout=30)
    assert r.status_code == 200
    rows = r.json()
    for row in rows:
        assert row["category"] == "insurance"
    assert created_ids[0] in [x["id"] for x in rows]


# ---------- GET /summary ----------
def test_summary_structure_and_counts(auth_headers, created_ids):
    r = requests.get(f"{BASE_URL}/api/compliance/summary", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "buckets" in data and "expiringSoon" in data
    for cat in ("insurance", "personnel", "vehicle", "other"):
        assert cat in data["buckets"]
        for k in ("total", "expiring30", "expired"):
            assert k in data["buckets"][cat]
    # Our 40-day item is NOT expiring30 (>30 days)
    # but ensure the total insurance bucket has at least 1
    assert data["buckets"]["insurance"]["total"] >= 1


# ---------- PATCH /items ----------
def test_patch_item(auth_headers, created_ids):
    item_id = created_ids[0]
    r = requests.patch(f"{BASE_URL}/api/compliance/items/{item_id}",
                       headers=auth_headers, json={"issuer": "UpdatedInsurer"}, timeout=30)
    assert r.status_code == 200
    assert r.json()["issuer"] == "UpdatedInsurer"


# ---------- Attention integration ----------
def test_attention_includes_soon_expiring_compliance(auth_headers, created_ids):
    # Create an item expiring in 10 days -> should appear in /api/attention
    expiry_soon = (datetime.now(timezone.utc).date() + timedelta(days=10)).isoformat()
    body = {
        "category": "personnel",
        "type": "CSCS",
        "name": "TEST_Attention User",
        "expiryDate": expiry_soon,
    }
    r = requests.post(f"{BASE_URL}/api/compliance/items", headers=auth_headers, json=body, timeout=30)
    assert r.status_code == 200
    soon_id = r.json()["id"]
    created_ids.append(soon_id)

    r2 = requests.get(f"{BASE_URL}/api/attention", headers=auth_headers, timeout=30)
    assert r2.status_code == 200
    payload = r2.json()
    # Response may be {items:[...]} or list — handle both
    items = payload.get("items", payload) if isinstance(payload, dict) else payload
    kinds = [it.get("kind") for it in items]
    assert "compliance_expiring" in kinds, f"kinds returned: {kinds}"
    match = [it for it in items if it.get("id") == f"compliance-{soon_id}"]
    assert match, "Newly-created soon-expiring compliance item not in attention feed"
    assert match[0]["actionRoute"] == "/app/compliance"


# ---------- DELETE /items (soft) ----------
def test_delete_item_soft(auth_headers, created_ids):
    item_id = created_ids[0]
    r = requests.delete(f"{BASE_URL}/api/compliance/items/{item_id}", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    assert r.json().get("ok") is True

    # It should no longer appear in list
    r2 = requests.get(f"{BASE_URL}/api/compliance/items", headers=auth_headers, timeout=30)
    ids = [x["id"] for x in r2.json()]
    assert item_id not in ids

    # Second delete → 404
    r3 = requests.delete(f"{BASE_URL}/api/compliance/items/{item_id}", headers=auth_headers, timeout=30)
    assert r3.status_code == 404


# ---------- Cleanup ----------
def test_cleanup(auth_headers, created_ids):
    for item_id in created_ids:
        requests.delete(f"{BASE_URL}/api/compliance/items/{item_id}", headers=auth_headers, timeout=30)


# ---------- Auth guard ----------
def test_items_requires_auth():
    r = requests.get(f"{BASE_URL}/api/compliance/items", timeout=30)
    assert r.status_code in (401, 403)
