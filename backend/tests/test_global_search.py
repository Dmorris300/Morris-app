"""Backend tests for Morris V2 Global Search (/api/search)."""
import os
import time
import pytest
import requests

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

ADMIN_USER = "darrenhustle300"
ADMIN_PASS = "hustle1234"
SECOND_USER = "sparky01"
SECOND_PASS = "test1234"


def _login(username, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_USER, ADMIN_PASS)


@pytest.fixture(scope="module")
def second_token():
    return _login(SECOND_USER, SECOND_PASS)


@pytest.fixture(scope="module")
def seeded(admin_token):
    """Create a project + invoice for admin under a unique client name."""
    h = {"Authorization": f"Bearer {admin_token}"}
    client_name = "Alice Contractor TESTGS"
    project_name = "Search Test Project TESTGS"
    # Create project
    r = requests.post(f"{BASE_URL}/api/jobs", headers=h, json={
        "clientName": client_name,
        "projectName": project_name,
        "company": "Alice Ltd",
        "address": "1 Test Lane"
    }, timeout=15)
    assert r.status_code == 200, f"create job: {r.status_code} {r.text}"
    project = r.json()
    # Create invoice linked to that project
    r2 = requests.post(f"{BASE_URL}/api/invoice-builder/invoices", headers=h, json={
        "projectId": project["id"],
        "projectName": project_name,
        "clientName": client_name,
        "clientCompany": "Alice Ltd",
        "lineItems": [{"category": "Labour", "description": "day-rate", "qty": 1, "unit": "day", "unitPrice": 250}],
        "cisStatus": "Not applicable",
        "vatTreatment": "Standard 20%",
    }, timeout=15)
    assert r2.status_code == 200, f"create invoice: {r2.status_code} {r2.text}"
    invoice = r2.json()
    # Slight wait for updatedAt consistency
    time.sleep(0.2)
    yield {"project": project, "invoice": invoice, "clientName": client_name, "projectName": project_name}
    # Cleanup
    try:
        requests.delete(f"{BASE_URL}/api/invoice-builder/invoices/{invoice['id']}", headers=h, timeout=10)
        requests.delete(f"{BASE_URL}/api/jobs/{project['id']}", headers=h, timeout=10)
    except Exception:
        pass


def _search(token, q=None, scope=None):
    params = {}
    if q is not None:
        params["q"] = q
    if scope:
        params["scope"] = scope
    r = requests.get(f"{BASE_URL}/api/search", headers={"Authorization": f"Bearer {token}"}, params=params, timeout=20)
    return r


# ------------- Basic response shape -------------
class TestShape:
    def test_search_endpoint_reachable(self, admin_token):
        r = _search(admin_token, q="alice")
        assert r.status_code == 200, r.text
        j = r.json()
        assert set(["total", "results", "scope", "q"]).issubset(j.keys())
        assert isinstance(j["results"], list)

    def test_result_item_shape(self, admin_token, seeded):
        r = _search(admin_token, q="alice")
        assert r.status_code == 200
        results = r.json()["results"]
        assert len(results) > 0
        for item in results:
            for key in ("kind", "id", "title", "subtitle", "route", "badge", "updatedAt"):
                assert key in item, f"missing '{key}' in {item}"


# ------------- Cross-collection matching -------------
class TestCrossCollection:
    def test_alice_returns_client_project_invoice(self, admin_token, seeded):
        r = _search(admin_token, q="alice")
        assert r.status_code == 200
        results = r.json()["results"]
        kinds = {x["kind"] for x in results}
        # We must have client + project + invoice at minimum for "alice"
        assert "project" in kinds, f"missing project kind, got {kinds}"
        assert "client" in kinds, f"missing client kind, got {kinds}"
        assert "invoice" in kinds, f"missing invoice kind, got {kinds}"

    def test_scope_projects_returns_only_project(self, admin_token, seeded):
        r = _search(admin_token, q="Search Test", scope="projects")
        assert r.status_code == 200
        results = r.json()["results"]
        assert len(results) >= 1
        assert all(x["kind"] == "project" for x in results), [x["kind"] for x in results]
        titles = [x["title"] for x in results]
        assert any("Search Test" in t for t in titles), titles

    def test_scope_invoices_returns_invoice(self, admin_token, seeded):
        r = _search(admin_token, q="INV", scope="invoices")
        assert r.status_code == 200
        results = r.json()["results"]
        assert len(results) >= 1
        assert all(x["kind"] == "invoice" for x in results)


# ------------- Ranking -------------
class TestRanking:
    def test_exact_title_ranks_first(self, admin_token, seeded):
        # Search exact project name — that project should be at or near top of project results
        r = _search(admin_token, q=seeded["projectName"], scope="projects")
        assert r.status_code == 200
        results = r.json()["results"]
        assert results, "no project results"
        assert results[0]["title"] == seeded["projectName"], f"first title: {results[0]['title']}"


# ------------- Scopes (empty q) -------------
class TestScopesEmpty:
    @pytest.mark.parametrize("scope", [
        "projects", "documents", "quotes", "variations",
        "applications", "invoices", "site-diary", "incidents",
        "risks", "photos", "drafts", "tasks",
    ])
    def test_empty_q_scope_returns_list(self, admin_token, scope, seeded):
        r = _search(admin_token, q="", scope=scope)
        assert r.status_code == 200, r.text
        results = r.json()["results"]
        assert isinstance(results, list)
        # All results should be of the correct kind (may be empty for some collections)
        expected_kind = {
            "projects": "project", "documents": "document", "quotes": "quote",
            "variations": "variation", "applications": "application", "invoices": "invoice",
            "site-diary": "site-diary", "incidents": "incident", "risks": "risk",
            "photos": "photo", "drafts": "draft", "tasks": "task",
        }[scope]
        for x in results:
            assert x["kind"] == expected_kind, f"scope={scope} unexpected kind {x['kind']}"

    def test_scope_tools_returns_catalogue(self, admin_token):
        r = _search(admin_token, q="", scope="tools")
        assert r.status_code == 200
        results = r.json()["results"]
        assert len(results) >= 5
        assert all(x["kind"] == "tool" for x in results)

    def test_scope_all_empty_q_includes_tools(self, admin_token):
        r = _search(admin_token, q="", scope="all")
        assert r.status_code == 200
        kinds = {x["kind"] for x in r.json()["results"]}
        assert "tool" in kinds


# ------------- Auth / user isolation -------------
class TestIsolation:
    def test_missing_token_401(self):
        r = requests.get(f"{BASE_URL}/api/search", params={"q": "alice"}, timeout=10)
        assert r.status_code == 401

    def test_no_leak_between_users(self, second_token, seeded):
        """Login as sparky01 — must NOT see admin's Alice Contractor project/invoice."""
        r = _search(second_token, q="alice")
        assert r.status_code == 200
        results = r.json()["results"]
        # No result should reference our admin-created records
        leaked = [x for x in results if seeded["project"]["id"] == x.get("id") or seeded["invoice"]["id"] == x.get("id")]
        assert not leaked, f"user leak: {leaked}"
        # And no result titled with the unique test client name
        assert not [x for x in results if "TESTGS" in (x.get("title") or "") or "TESTGS" in (x.get("subtitle") or "")]
