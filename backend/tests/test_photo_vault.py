"""Backend tests for Morris Photo Vault (/api/media/*)."""
import io
import os
import struct
import zlib
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://prompt-web-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USER = "darrenhustle300"
ADMIN_PASS = "hustle1234"


# ---- helpers ----

def _make_png(w=8, h=8):
    """Return minimal valid PNG bytes."""
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * w for _ in range(h))
    idat = chunk(b"IDAT", zlib.compress(raw))
    iend = chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"No token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def uploaded_media(auth_headers):
    """Upload one image, yield the returned doc. Cleanup at module end."""
    png = _make_png()
    files = {"file": ("test_vault.png", png, "image/png")}
    data = {"description": "TEST_photo_vault upload", "notes": "unit test"}
    r = requests.post(f"{API}/media", headers=auth_headers, files=files, data=data, timeout=60)
    assert r.status_code == 200, f"Upload failed: {r.status_code} {r.text}"
    doc = r.json()
    yield doc
    # cleanup — force delete
    try:
        requests.delete(f"{API}/media/{doc['id']}?force=true", headers=auth_headers, timeout=30)
    except Exception:
        pass


# ---- Tests ----

class TestCategories:
    def test_categories_public(self):
        r = requests.get(f"{API}/media/categories", timeout=15)
        assert r.status_code == 200
        cats = r.json()["categories"]
        assert len(cats) == 11
        for expected in ["Before Works", "Completed Works", "Damage", "Defects",
                         "Deliveries", "Health & Safety", "Materials", "Progress",
                         "Snagging", "Variations", "Other"]:
            assert expected in cats


class TestAuthProtection:
    @pytest.mark.parametrize("method,path", [
        ("GET", "/media"),
        ("GET", "/media/stats"),
        ("GET", "/media/does-not-exist"),
        ("DELETE", "/media/does-not-exist"),
    ])
    def test_unauth_returns_401(self, method, path):
        r = requests.request(method, f"{API}{path}", timeout=15)
        assert r.status_code == 401, f"{method} {path} expected 401, got {r.status_code}"

    def test_patch_unauth(self):
        r = requests.patch(f"{API}/media/does-not-exist", json={"favourite": True}, timeout=15)
        assert r.status_code == 401

    def test_post_unauth(self):
        # Send a real (empty) file so FastAPI passes body validation and reaches auth check
        r = requests.post(f"{API}/media", files={"file": ("x.png", b"", "image/png")}, timeout=15)
        assert r.status_code == 401


class TestUploadAndList:
    def test_upload_response_shape(self, uploaded_media):
        d = uploaded_media
        assert d.get("id")
        assert d.get("kind") == "image"
        assert d.get("storagePath")
        assert isinstance(d.get("size"), int) and d["size"] > 0
        assert d.get("isDeleted") is False
        assert d.get("favourite") is False
        assert d.get("usage") == []
        assert d.get("uploader")

    def test_list_contains_upload(self, auth_headers, uploaded_media):
        r = requests.get(f"{API}/media", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        ids = [m["id"] for m in r.json()]
        assert uploaded_media["id"] in ids

    def test_list_recent(self, auth_headers, uploaded_media):
        r = requests.get(f"{API}/media?section=recent", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert uploaded_media["id"] in [m["id"] for m in r.json()]

    def test_list_unassigned(self, auth_headers, uploaded_media):
        r = requests.get(f"{API}/media?section=unassigned", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert uploaded_media["id"] in [m["id"] for m in r.json()]

    def test_search_q(self, auth_headers, uploaded_media):
        r = requests.get(f"{API}/media?q=TEST_photo_vault", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert uploaded_media["id"] in [m["id"] for m in r.json()]


class TestPatchAndFavourites:
    def test_patch_updates(self, auth_headers, uploaded_media):
        mid = uploaded_media["id"]
        r = requests.patch(f"{API}/media/{mid}", headers=auth_headers, json={
            "favourite": True, "category": "Damage",
            "description": "TEST_updated desc", "notes": "TEST_updated notes",
        }, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["favourite"] is True
        assert d["category"] == "Damage"
        assert d["description"] == "TEST_updated desc"

        # GET verifies persistence
        r2 = requests.get(f"{API}/media/{mid}", headers=auth_headers, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["favourite"] is True
        assert r2.json()["category"] == "Damage"

    def test_favourites_section(self, auth_headers, uploaded_media):
        r = requests.get(f"{API}/media?section=favourites", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert uploaded_media["id"] in [m["id"] for m in r.json()]

    def test_category_filter(self, auth_headers, uploaded_media):
        r = requests.get(f"{API}/media?category=Damage", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert uploaded_media["id"] in [m["id"] for m in r.json()]


class TestFileStream:
    def test_stream_original_with_query_token(self, token, uploaded_media):
        mid = uploaded_media["id"]
        r = requests.get(f"{API}/media/{mid}/file?variant=original&auth={token}", timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("image/")
        assert len(r.content) > 0

    def test_stream_requires_auth(self, uploaded_media):
        r = requests.get(f"{API}/media/{uploaded_media['id']}/file", timeout=15)
        assert r.status_code == 401


class TestUsage:
    def test_add_and_remove_usage(self, auth_headers, uploaded_media):
        mid = uploaded_media["id"]
        r = requests.post(f"{API}/media/{mid}/usage", headers=auth_headers, json={
            "docId": "TEST_doc_1", "docType": "RAMS", "docTitle": "TEST RAMS doc"
        }, timeout=15)
        assert r.status_code == 200

        # verify in GET
        r2 = requests.get(f"{API}/media/{mid}", headers=auth_headers, timeout=15)
        assert r2.status_code == 200
        usage = r2.json().get("usage", [])
        assert any(u["docId"] == "TEST_doc_1" for u in usage)

        # remove
        r3 = requests.delete(f"{API}/media/{mid}/usage/TEST_doc_1", headers=auth_headers, timeout=15)
        assert r3.status_code == 200
        r4 = requests.get(f"{API}/media/{mid}", headers=auth_headers, timeout=15)
        assert not any(u["docId"] == "TEST_doc_1" for u in r4.json().get("usage", []))


class TestDeleteProtection:
    def test_delete_with_usage_requires_confirm(self, auth_headers):
        # Create fresh upload for this scenario
        png = _make_png()
        r = requests.post(f"{API}/media", headers=auth_headers,
                          files={"file": ("TEST_del.png", png, "image/png")},
                          data={"description": "TEST_delete protection"}, timeout=60)
        assert r.status_code == 200
        mid = r.json()["id"]

        # add usage
        requests.post(f"{API}/media/{mid}/usage", headers=auth_headers,
                      json={"docId": "TEST_del_doc", "docType": "RAMS"}, timeout=15)

        # try delete — should require confirm
        r2 = requests.delete(f"{API}/media/{mid}", headers=auth_headers, timeout=15)
        assert r2.status_code == 200
        body = r2.json()
        assert body.get("requiresConfirm") is True
        assert isinstance(body.get("usage"), list) and len(body["usage"]) >= 1

        # still present
        r3 = requests.get(f"{API}/media/{mid}", headers=auth_headers, timeout=15)
        assert r3.status_code == 200

        # force delete
        r4 = requests.delete(f"{API}/media/{mid}?force=true", headers=auth_headers, timeout=15)
        assert r4.status_code == 200
        assert r4.json().get("ok") is True

        # now soft-deleted -> 404
        r5 = requests.get(f"{API}/media/{mid}", headers=auth_headers, timeout=15)
        assert r5.status_code == 404


class TestStats:
    def test_stats_shape(self, auth_headers, uploaded_media):
        r = requests.get(f"{API}/media/stats", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("total", "unassigned", "favourites", "recent"):
            assert k in d and isinstance(d[k], int)
        assert d["total"] >= 1
        assert d["favourites"] >= 1  # we set favourite=true on uploaded_media
