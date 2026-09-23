"""AFP-SELF-HISTORY-01 — backend acceptance tests.

Bug: the /project/{jobId}/summary endpoint returned ALL AFPs for the
project, including the one currently being edited. The wizard therefore
showed the AFP inside its own "Previous Applications" list (carrying a
stale status because that copy is snapshotted before the update), and
the header's `nextApplicationNumber` treated the current AFP as prior.

Fix: accept an optional `excludeAfpId` query param and skip the row
whose `id == excludeAfpId` from the whole aggregation.

Run:
  cd /app/backend && python -m pytest tests/test_afp_self_history.py -q
"""

import os
import httpx
import pytest


API = os.environ.get("PREVIEW_API_URL") or os.environ.get("REACT_APP_BACKEND_URL")
if not API:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                API = line.split("=", 1)[1].strip()
                break

USERNAME = os.environ.get("PREVIEW_USER", "darrenhustle300")
PASSWORD = os.environ.get("PREVIEW_PW", "hustle1234")


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=API, timeout=30.0) as c:
        r = c.post("/api/auth/login", json={"username": USERNAME, "password": PASSWORD})
        assert r.status_code == 200
        tok = r.json().get("token") or r.json().get("access_token")
        c.headers["Authorization"] = f"Bearer {tok}"
        yield c


@pytest.fixture(scope="module")
def sample_project(client):
    """Pick any project on the fixture user that has at least 2 AFPs."""
    r = client.get("/api/jobs")
    assert r.status_code == 200
    for job in r.json():
        summary = client.get(f"/api/applications-for-payment/project/{job['id']}/summary")
        if summary.status_code == 200 and len(summary.json().get("previousApplications") or []) >= 2:
            return {"project": job, "summary": summary.json()}
    pytest.skip("no project with 2+ AFPs on fixture user")


def test_baseline_no_exclusion_returns_all(client, sample_project):
    """Without excludeAfpId, every AFP is present (regression baseline)."""
    baseline = sample_project["summary"]
    assert len(baseline["previousApplications"]) >= 2


def test_excludeAfpId_drops_exactly_that_row(client, sample_project):
    baseline = sample_project["summary"]
    target = baseline["previousApplications"][0]
    r = client.get(
        f"/api/applications-for-payment/project/{sample_project['project']['id']}/summary",
        params={"excludeAfpId": target["id"]},
    )
    assert r.status_code == 200
    filtered = r.json()
    # Count drops by exactly 1
    assert len(filtered["previousApplications"]) == len(baseline["previousApplications"]) - 1
    # The excluded id is gone
    assert not any(p["id"] == target["id"] for p in filtered["previousApplications"])


def test_excludeAfpId_drops_certified_amount_from_running_total(client, sample_project):
    """Excluding a Certified/Paid AFP must remove its certifiedAmount
    from previouslyCertifiedTotal so the header numbers match the
    remaining history."""
    baseline = sample_project["summary"]
    # Find a Certified or Paid row with a non-zero certifiedAmount
    target = next(
        (p for p in baseline["previousApplications"]
         if p["status"] in ("Certified", "Paid") and p["certifiedAmount"] > 0),
        None,
    )
    if not target:
        pytest.skip("no Certified/Paid AFP with certifiedAmount on fixture project")
    r = client.get(
        f"/api/applications-for-payment/project/{sample_project['project']['id']}/summary",
        params={"excludeAfpId": target["id"]},
    )
    assert r.status_code == 200
    filtered = r.json()
    delta = baseline["previouslyCertifiedTotal"] - filtered["previouslyCertifiedTotal"]
    assert abs(delta - target["certifiedAmount"]) < 0.01, (
        f"expected running total to drop by £{target['certifiedAmount']} "
        f"but it dropped by £{delta}"
    )


def test_excludeAfpId_drops_nextApplicationNumber_when_excluding_highest(client, sample_project):
    """When editing the AFP with the highest application number, the
    header's next-application-number must fall back to that of the
    remaining highest + 1."""
    baseline = sample_project["summary"]
    highest = max(baseline["previousApplications"], key=lambda p: p["applicationNumber"] or 0)
    r = client.get(
        f"/api/applications-for-payment/project/{sample_project['project']['id']}/summary",
        params={"excludeAfpId": highest["id"]},
    )
    assert r.status_code == 200
    filtered = r.json()
    remaining_max = max(
        (p["applicationNumber"] or 0 for p in filtered["previousApplications"]),
        default=0,
    )
    assert filtered["nextApplicationNumber"] == remaining_max + 1


def test_bogus_excludeAfpId_is_a_noop(client, sample_project):
    """A random / unknown excludeAfpId must NOT drop any real row."""
    baseline = sample_project["summary"]
    r = client.get(
        f"/api/applications-for-payment/project/{sample_project['project']['id']}/summary",
        params={"excludeAfpId": "definitely-not-a-real-afp-id-9999"},
    )
    assert r.status_code == 200
    filtered = r.json()
    assert len(filtered["previousApplications"]) == len(baseline["previousApplications"])
    assert filtered["nextApplicationNumber"] == baseline["nextApplicationNumber"]
    assert filtered["previouslyCertifiedTotal"] == pytest.approx(baseline["previouslyCertifiedTotal"])


def test_omitting_excludeAfpId_is_backwards_compatible(client, sample_project):
    """The legacy call signature (no excludeAfpId) must still return
    the full, unfiltered list — this is what New AFP callers use."""
    baseline = sample_project["summary"]
    r = client.get(f"/api/applications-for-payment/project/{sample_project['project']['id']}/summary")
    assert r.status_code == 200
    fresh = r.json()
    assert len(fresh["previousApplications"]) == len(baseline["previousApplications"])
    assert fresh["nextApplicationNumber"] == baseline["nextApplicationNumber"]
