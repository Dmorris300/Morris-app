#!/usr/bin/env python3
"""Focused backend verification for iteration 17 COSHH PATCH/CRUD retest."""

import json
import os
import sys
import time
from urllib.parse import urljoin

import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://prompt-web-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
USERNAME = os.environ.get("MORRIS_TEST_USERNAME", "darrenhustle300")
PASSWORD = os.environ.get("MORRIS_TEST_PASSWORD", "hustle1234")


def fail(msg, details=None):
    print(json.dumps({"ok": False, "error": msg, "details": details}, indent=2))
    sys.exit(1)


def req(session, method, path, **kwargs):
    url = urljoin(API + "/", path.lstrip("/"))
    r = session.request(method, url, timeout=30, **kwargs)
    print(f"{method} {path} -> {r.status_code}")
    try:
        body = r.json()
    except Exception:
        body = r.text[:500]
    if r.status_code >= 400:
        print(json.dumps(body, indent=2) if isinstance(body, (dict, list)) else body)
    return r, body


def main():
    unique = f"BUG17-{int(time.time())}"
    s = requests.Session()

    r, body = req(s, "POST", "/auth/login", json={"username": USERNAME, "password": PASSWORD})
    if r.status_code != 200 or not body.get("token"):
        fail("login failed", body)
    s.headers.update({"Authorization": f"Bearer {body['token']}"})

    payload_a = {
        "projectId": f"project-{unique}-A",
        "projectName": f"Project {unique} A",
        "productName": f"COSHH Patch Retest A {unique}",
        "manufacturer": "QA Manufacturer",
        "hazardLevel": "High",
        "assessmentDate": "2026-07-01",
        "reviewDate": "2026-08-01",
    }
    payload_b = {
        "projectId": f"project-{unique}-B",
        "projectName": f"Project {unique} B",
        "productName": f"COSHH Filter Retest B {unique}",
        "hazardLevel": "Low",
    }

    r, a = req(s, "POST", "/coshh/assessments", json=payload_a)
    if r.status_code != 200 or not a.get("id"):
        fail("POST assessment A did not create a document", a)
    aid = a["id"]

    r, b = req(s, "POST", "/coshh/assessments", json=payload_b)
    if r.status_code != 200 or not b.get("id"):
        fail("POST assessment B did not create a document", b)
    bid = b["id"]

    # Exact regression: partial PATCH body must not 422 and should return updated doc.
    r, patched = req(s, "PATCH", f"/coshh/assessments/{aid}", json={"hazardLevel": "Medium"})
    if r.status_code != 200:
        fail("partial PATCH did not return 200", {"status": r.status_code, "body": patched})
    if patched.get("hazardLevel") != "Medium" or patched.get("productName") != payload_a["productName"]:
        fail("PATCH response did not preserve/update expected document fields", patched)

    r, filtered = req(s, "GET", f"/coshh/assessments?projectId={payload_a['projectId']}")
    if r.status_code != 200 or not isinstance(filtered, list):
        fail("GET projectId filter failed", filtered)
    ids = {x.get("id") for x in filtered}
    if aid not in ids:
        fail("GET projectId filter omitted matching assessment", filtered)
    if bid in ids:
        fail("GET projectId filter included non-matching assessment", filtered)

    r, del_body = req(s, "DELETE", f"/coshh/assessments/{aid}")
    if r.status_code != 200 or del_body.get("ok") is not True:
        fail("DELETE assessment A failed", del_body)

    r, after_delete = req(s, "GET", f"/coshh/assessments?projectId={payload_a['projectId']}")
    if r.status_code != 200 or any(x.get("id") == aid for x in after_delete):
        fail("soft-deleted assessment still appears in list/filter", after_delete)

    # Cleanup second assessment too.
    r, del_b = req(s, "DELETE", f"/coshh/assessments/{bid}")
    if r.status_code != 200 or del_b.get("ok") is not True:
        fail("cleanup DELETE assessment B failed", del_b)

    print(json.dumps({
        "ok": True,
        "base_url": BASE_URL,
        "created_ids": [aid, bid],
        "patch_status": 200,
        "patched_hazardLevel": patched.get("hazardLevel"),
        "filter_count_for_project_a_before_delete": len(filtered),
        "soft_delete_hidden_after_delete": True,
    }, indent=2))


if __name__ == "__main__":
    main()