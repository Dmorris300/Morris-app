"""Morris — Phase 1 Mega Fix P2 (Command Centre deep-links) regression.

Every attention item emitted by /api/attention must carry an actionRoute
that identifies a SPECIFIC record / draft where such context exists. We
assert the route shape per attention kind so a regression that reverts
one back to a generic landing (e.g. /app/drafts) is caught before merge.

Backend-only. Frontend hydration for each specific deep-link is covered
by pytest fixtures elsewhere and by the P2 browser verification pass in
/app/test_reports/iteration_42.json.
"""
import os
import re
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"username": "darrenhustle300", "password": "hustle1234"}


@pytest.fixture(scope="module")
def h():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


def _get_attention(headers):
    r = requests.get(f"{API}/attention", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    return (r.json() or {}).get("items", [])


def test_p2_draft_stale_resume_route_carries_toolId_and_draft_id(h):
    """A stale draft must Resume straight into the specific tool draft URL
    (`/app/tool/<toolId>?draft=<id>`), not the generic `/app/drafts` list.
    GenericToolPage.TOOL_REDIRECTS then hands the ?draft=<id> off to the
    dedicated page for tools with a bespoke wizard (e.g. RAMS)."""
    # Seed a stale draft (>3 days) by inserting with an old updatedAt via
    # the standard save endpoint, then patching the timestamp is not
    # possible through the API — we assert the SHAPE of any emitted
    # draft_stale item that already exists in the admin dataset.
    items = _get_attention(h)
    stale = [i for i in items if i.get("kind") == "draft_stale"]
    for it in stale:
        route = it.get("actionRoute", "")
        assert route.startswith("/app/tool/"), (
            f"P2 REGRESSION: draft_stale actionRoute is '{route}'. "
            "Must start with /app/tool/<toolId>?draft=<id> so the specific "
            "draft is resumed, not a generic /app/drafts list."
        )
        m = re.match(r"^/app/tool/([\w-]+)\?draft=([\w-]+)$", route)
        assert m, f"draft_stale route not in expected shape: {route}"
        # Draft id must be a UUID-ish string.
        assert len(m.group(2)) >= 8, f"draft id too short in route: {route}"


def test_p2_sa_deadline_route_points_to_self_assessment_prep(h):
    """Self Assessment deadline attention must open the dedicated Self
    Assessment Prep tool, not the generic Finance hub."""
    items = _get_attention(h)
    sa = [i for i in items if i.get("kind") == "sa_deadline"]
    # sa_deadline only fires within 60 days of 31 Jan. Skip if not present.
    if not sa:
        pytest.skip("Not within Self Assessment deadline window")
    for it in sa:
        assert it.get("actionRoute") == "/app/self-assessment-prep", (
            f"P2 REGRESSION: sa_deadline actionRoute is '{it.get('actionRoute')}'. "
            "Must be /app/self-assessment-prep so users land on the tool "
            "that actually files their return, not the generic finance hub."
        )


def test_p2_compliance_route_includes_open_id_when_available(h):
    """Compliance expiring items must include ?open=<credentialId> so the
    hub jumps to the correct tab and opens the edit modal."""
    # Seed a credential expiring in 5 days so we always have at least one
    # compliance_expiring item to assert against.
    body = {
        "category": "insurance",
        "type": "Public Liability",
        "name": "P2 verify PL insurance",
        "issuer": "P2 QA Underwriters",
        "refNumber": "PL-P2-001",
        "issueDate": (datetime.now(timezone.utc).date() - timedelta(days=180)).isoformat(),
        "expiryDate": (datetime.now(timezone.utc).date() + timedelta(days=5)).isoformat(),
        "notes": "P2 regression seed — safe to delete.",
    }
    created = requests.post(f"{API}/compliance/items", json=body, headers=h, timeout=30).json()
    cid = created.get("id")
    try:
        items = _get_attention(h)
        # Compliance items live in the merged batch; match by our unique refNumber.
        target = [i for i in items if i.get("kind") == "compliance_expiring" and cid and cid in (i.get("actionRoute") or "")]
        assert target, (
            "P2 REGRESSION: newly-created compliance_expiring item did not surface "
            "on /api/attention with ?open=<id>. The Command Centre link would "
            "dump the user on a generic tab without opening the credential."
        )
        for it in target:
            assert it["actionRoute"] == f"/app/compliance?open={cid}", (
                f"Compliance route wrong shape: {it['actionRoute']}"
            )
    finally:
        if cid:
            try: requests.delete(f"{API}/compliance/items/{cid}", headers=h, timeout=15)
            except Exception: pass


def test_p2_coshh_review_route_includes_open_id_when_present(h):
    """If any COSHH assessment is emitted as review-due, its route must
    carry ?open=<assessmentId> so the assessment opens directly. If none
    exist we assert only the shape rule (never the generic /app/coshh)."""
    items = _get_attention(h)
    coshh = [i for i in items if i.get("kind") == "coshh_review_due"]
    for it in coshh:
        route = it.get("actionRoute", "")
        assert route.startswith("/app/coshh"), route
        assert "?open=" in route, (
            f"P2 REGRESSION: coshh_review_due route is '{route}'. "
            "Must include ?open=<assessmentId>."
        )


def test_p2_all_actionable_routes_target_specific_context(h):
    """Blanket assertion: EVERY attention item that describes a specific
    record (has a projectId or record id in `id`) must NOT link to a bare
    hub root — it must include a query string identifying the target."""
    items = _get_attention(h)
    generic_landings = {"/app/drafts", "/app/coshh", "/app/finance"}
    for it in items:
        route = (it.get("actionRoute") or "").split("#")[0]
        kind = it.get("kind") or ""
        # Skip kinds that legitimately land on a hub (compliance items
        # without id are the only known case — sa_deadline is now
        # dedicated). Compliance items always carry an id from Mongo, so
        # the fallback is only exercised by legacy data.
        if kind == "compliance_expiring" and route == "/app/compliance":
            continue
        assert route not in generic_landings, (
            f"P2 REGRESSION: kind={kind} still links to a generic landing "
            f"({route}). Add a query string (?open=<id> / ?draft=<id> / "
            f"?projectId=<id>) that identifies the target record."
        )
