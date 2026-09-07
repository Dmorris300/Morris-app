"""
Backend verification for Measurement Record sign-off / role placeholder /
date-format fixes (P1a follow-up).

Assertions (from review_request):
  1. When signatureRole is EMPTY -> no placeholder role text, no empty Role: line
  2. When signatureRole is 'Director' -> 'Role: Director' appears exactly once in CONTRACTOR SIGN-OFF
  3. Exactly one sign-off panel (single CONTRACTOR SIGN-OFF, no MEASURED BY sign-off panel)
  4. All dates numeric DD/MM/YYYY; sign-off date-time is DD/MM/YYYY HH:MM (no long-form months)
  5. Frontend scrubber (pdf.js) covered by an inspection-based check

Runs each generate call twice to catch non-deterministic LLM drift.
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback (dev): read frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass
assert BASE_URL, "REACT_APP_BACKEND_URL not set"

ADMIN_USER = {"username": "darrenhustle300", "password": "hustle1234"}

# The MeasurementRecord.jsx promptTemplate is embedded in the frontend. For a
# backend-only test we build an equivalent (minimal, deductions off, no notes)
# so /api/generate produces the same document family.
def build_prompt_template(deductions=False):
    return (
        "Produce a UK MEASUREMENT RECORD sheet. Plain direct construction English. "
        "This is a site record.\n\n"
        "1. HEADER — DOCUMENT REFERENCE, DATE ({date}).\n"
        "2. TITLE — exactly: 'MEASUREMENT RECORD — {project} — {date}'.\n"
        "3. RECORD DETAILS — list on separate lines:\n"
        "   Project: {project}\n"
        "   Site address: {siteAddress}\n"
        "   Date measured: {date}\n"
        "   Measured by: {measuredByName}\n"
        "   Unit of measurement: {unitLabel}\n"
        "   Purpose: {purpose}\n"
        "4. MEASUREMENTS — render the measurements table cleanly.\n"
        "{measurementsTable}\n"
        "5. MAIN TOTALS — print on separate lines, skip zero:\n"
        "   Total linear: {linearTotal} {unitSuffix}\n"
        "   Number of items measured: {itemCount}\n"
        "6. DISCLAIMER — print verbatim:\n"
        "   These measurements were taken on site and are the responsibility of the person named above.\n\n"
        "Rules: never invent rows. Do NOT add a Measured-By signature block or any other signature/sign-off panel — "
        "the global CONTRACTOR SIGN-OFF is the ONLY signature block on this document."
    )


USER_INPUTS = {
    "project": "TEST_MeasRec Project",
    "siteAddress": "12 Site Lane, London",
    "date": "2026-01-15",
    "measuredByName": "Darren Morris",
    "unitLabel": "metres",
    "unitSuffix": "m",
    "purpose": "Pricing / quoting",
    "measurementsTable": "1. Wall run — L: 10  Qty: 1 — TOTAL 10.00 m",
    "deductionsTable": "",
    "linearTotal": "10.00",
    "areaTotal": "0.00",
    "volumeTotal": "0.000",
    "itemCount": "1",
    "netLinear": "10.00",
    "netArea": "0.00",
    "netVolume": "0.000",
    "additionalNotes": "",
}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def original_role(token):
    """Snapshot original signatureRole so we can restore it after tests."""
    me = requests.get(f"{BASE_URL}/api/auth/me",
                      headers={"Authorization": f"Bearer {token}"}, timeout=30).json()
    yield me.get("signatureRole") or ""
    # Teardown: restore original
    requests.post(f"{BASE_URL}/api/profile/update",
                  headers={"Authorization": f"Bearer {token}"},
                  json={"signatureRole": me.get("signatureRole") or ""},
                  timeout=30)


def set_role(token, role_value):
    r = requests.post(f"{BASE_URL}/api/profile/update",
                      headers={"Authorization": f"Bearer {token}"},
                      json={"signatureRole": role_value}, timeout=30)
    assert r.status_code == 200, f"Profile update failed: {r.text}"
    # verify
    assert (r.json().get("signatureRole") or "") == role_value, \
        f"signatureRole not persisted: got {r.json().get('signatureRole')!r}"


def call_generate(token):
    payload = {
        "toolId": "measurement-record",
        "toolName": "Measurement Record",
        "promptTemplate": build_prompt_template(),
        "userInputs": USER_INPUTS,
    }
    r = requests.post(f"{BASE_URL}/api/generate",
                      headers={"Authorization": f"Bearer {token}"},
                      json=payload, timeout=180)
    assert r.status_code == 200, f"/api/generate failed: {r.status_code} {r.text}"
    data = r.json()
    content = data.get("content") or data.get("data", {}).get("content") or ""
    assert content, f"Empty content in response: {data}"
    return content


# ---------- Assertion helpers ----------

PLACEHOLDER_RES = [
    re.compile(r"\(role not set in profile\)", re.I),
    re.compile(r"\[SIGNATORY ROLE\]", re.I),
    re.compile(r"\[Role\]", re.I),
    re.compile(r"\[insert role\]", re.I),
]
LONG_DATE_RE = re.compile(
    r"\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{4}\b",
    re.I,
)
SIGNOFF_DT_RE = re.compile(r"Date and time:\s*(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2})")
EMPTY_ROLE_LINE = re.compile(r"(?mi)^\s*Role\s*:\s*$")


def assert_no_placeholders(content):
    for pat in PLACEHOLDER_RES:
        m = pat.search(content)
        assert not m, f"Placeholder found: {pat.pattern} -> {m.group(0)!r}"
    m = EMPTY_ROLE_LINE.search(content)
    assert not m, f"Empty 'Role:' line found: {m.group(0)!r}"


def assert_single_signoff(content):
    n = len(re.findall(r"CONTRACTOR SIGN[- ]OFF", content))
    assert n == 1, f"Expected exactly 1 CONTRACTOR SIGN-OFF block, found {n}"
    # No secondary MEASURED BY signature panel. A factual 'Measured by: <name>'
    # line is fine — a panel would have 'MEASURED BY' as a heading.
    assert not re.search(r"(?m)^\s*MEASURED BY\s*$", content), \
        "Found a standalone 'MEASURED BY' heading (duplicate sign-off panel)"
    # Also flag a 'Measured by:' followed within 3 lines by Signature:
    lines = content.splitlines()
    for i, ln in enumerate(lines):
        if re.match(r"\s*Measured by\s*:", ln, re.I):
            window = "\n".join(lines[i:i + 4])
            assert "Signature:" not in window, \
                f"Found a Measured-by mini sign-off panel at line {i}: {window!r}"


def assert_numeric_dates(content):
    m = LONG_DATE_RE.search(content)
    assert not m, f"Long-form UK date found (should be DD/MM/YYYY): {m.group(0)!r}"
    m = SIGNOFF_DT_RE.search(content)
    assert m, "CONTRACTOR SIGN-OFF 'Date and time:' line missing or not DD/MM/YYYY HH:MM"


# ---------- Tests ----------

@pytest.mark.parametrize("run", [1, 2])
def test_bug1_role_empty_no_placeholder(token, original_role, run):
    """Bug 1: empty signatureRole -> no placeholder, Role line omitted."""
    set_role(token, "")
    content = call_generate(token)
    print(f"\n[run {run}] === EMPTY ROLE — content excerpt ===\n{content[-800:]}\n===")
    assert_no_placeholders(content)
    # Role line must not appear inside CONTRACTOR SIGN-OFF block
    signoff_idx = content.find("CONTRACTOR SIGN-OFF")
    assert signoff_idx >= 0, "CONTRACTOR SIGN-OFF block missing"
    signoff_block = content[signoff_idx:signoff_idx + 500]
    assert not re.search(r"(?mi)^Role\s*:", signoff_block), \
        f"Role: line present in CONTRACTOR SIGN-OFF despite empty role:\n{signoff_block}"


@pytest.mark.parametrize("run", [1, 2])
def test_bug2_role_set_director(token, original_role, run):
    """Bug 2: signatureRole=Director -> 'Role: Director' appears once in sign-off."""
    set_role(token, "Director")
    content = call_generate(token)
    print(f"\n[run {run}] === ROLE=DIRECTOR — content excerpt ===\n{content[-800:]}\n===")
    role_hits = re.findall(r"(?mi)^Role\s*:\s*Director\b", content)
    assert len(role_hits) == 1, f"Expected 'Role: Director' exactly once, got {len(role_hits)}"
    # And it must be inside the CONTRACTOR SIGN-OFF block
    signoff_idx = content.find("CONTRACTOR SIGN-OFF")
    assert signoff_idx >= 0
    assert "Role: Director" in content[signoff_idx:signoff_idx + 500], \
        "Role: Director not inside CONTRACTOR SIGN-OFF"


@pytest.mark.parametrize("run", [1, 2])
def test_bug3_single_signoff(token, original_role, run):
    """Bug 3: exactly one sign-off panel, no duplicate MEASURED BY panel."""
    set_role(token, "Director")
    content = call_generate(token)
    print(f"\n[run {run}] === SINGLE SIGN-OFF CHECK — full content ===\n{content}\n===")
    assert_single_signoff(content)
    # Factual 'Measured by:' line must still be present in RECORD DETAILS
    assert re.search(r"(?mi)^\s*Measured by\s*:\s*\S", content), \
        "Factual 'Measured by: <name>' line missing from RECORD DETAILS"


@pytest.mark.parametrize("run", [1, 2])
def test_bug4_numeric_dates_only(token, original_role, run):
    """Bug 4: DD/MM/YYYY only, and sign-off Date-time as DD/MM/YYYY HH:MM."""
    set_role(token, "Director")
    content = call_generate(token)
    print(f"\n[run {run}] === DATE CHECK — full content ===\n{content}\n===")
    assert_numeric_dates(content)


def test_bug5_frontend_scrubber_inspection():
    """Bug 5: inspect scrubContent() in /app/frontend/src/lib/pdf.js:
       (a) removes '(role not set in profile)' and drops empty 'Role:' line
       (b) converts long-form dates to DD/MM/YYYY
       (c) leaves numeric/ISO dates untouched
    """
    with open("/app/frontend/src/lib/pdf.js") as f:
        src = f.read()
    assert "export function scrubContent" in src, "scrubContent not exported"
    # (a) placeholder removal
    assert "role not set in profile" in src.lower(), "placeholder regex missing"
    assert re.search(r"Role\s*\\s\*:\s*\\s\*\$", src) or "^\\s*Role\\s*:\\s*$" in src, \
        "Empty-Role-line drop regex missing"
    # (b) long-date regex
    assert "January|February|March" in src, "long-date regex missing months"
    assert "September" in src
    # (c) ensure the regex requires a 4-digit year -> ISO date '2026-01-15' won't match
    #     because there's a `-` not a space before the year.
    long_pat = re.compile(
        r"\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{4})\b",
        re.I,
    )
    assert long_pat.search("07 September 2026"), "regex should match long-form date"
    assert not long_pat.search("2026-01-15"), "regex must not match ISO date"
    assert not long_pat.search("07/09/2026"), "regex must not match numeric date"
    print("scrubContent inspection PASSED")
