"""Morris — Site Diary V2 (flagship daily site management).

Endpoints:
  • GET  /api/site-diary/entries         — list saved diary entries (dashboard)
  • POST /api/site-diary/entries         — save entry (also mirrored to /documents)
  • PATCH /api/site-diary/entries/{id}
  • DELETE /api/site-diary/entries/{id}
  • GET  /api/site-diary/templates       — user template library (day templates)
  • POST /api/site-diary/templates
  • DELETE /api/site-diary/templates/{id}
  • GET  /api/site-diary/stats?projectId=…

Site diary attention feed (missing diary today on an active project) is exposed
via `collect_site_diary_attention` which is merged into /api/attention by the
Command Centre router. Timeline events for `site_diary_created` are emitted by
server.py `documents/save` kind_map when saved against a project.
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel


WEATHER_CONDITIONS = ["Clear", "Partly Cloudy", "Overcast", "Light Rain", "Heavy Rain", "Snow", "Frost", "Fog", "Windy", "Storm"]
DELAY_CATEGORIES = ["Weather", "Design Change", "Late Delivery", "Client Instruction", "Access Restriction", "Labour Shortage", "Plant Breakdown", "Utility Strike", "Other"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class EntryIn(BaseModel):
    # Step 1 — Project
    projectId: Optional[str] = ""
    projectName: Optional[str] = ""
    clientName: Optional[str] = ""
    siteAddress: Optional[str] = ""
    principalContractor: Optional[str] = ""
    documentRef: Optional[str] = ""

    # Step 2 — Date & Weather
    date: Optional[str] = ""
    startTime: Optional[str] = ""
    endTime: Optional[str] = ""
    tempAM: Optional[str] = ""
    tempPM: Optional[str] = ""
    wind: Optional[str] = ""
    rain: Optional[str] = ""
    conditions: Optional[str] = ""
    weatherImpact: Optional[str] = ""

    # Step 3 — Labour / Crew
    supervisor: Optional[str] = ""
    crew: Optional[List[Dict[str, Any]]] = []
    subcontractorsOnSite: Optional[List[Dict[str, Any]]] = []
    totalOperatives: Optional[int] = 0

    # Step 4 — Works Completed
    worksCompleted: Optional[List[Dict[str, Any]]] = []
    worksTomorrow: Optional[str] = ""
    progressPercent: Optional[str] = ""

    # Step 5 — Deliveries
    deliveries: Optional[List[Dict[str, Any]]] = []

    # Step 6 — Plant & Equipment
    plant: Optional[List[Dict[str, Any]]] = []

    # Step 7 — Delays, Issues & Site Instructions
    delays: Optional[List[Dict[str, Any]]] = []
    issues: Optional[List[Dict[str, Any]]] = []
    instructions: Optional[List[Dict[str, Any]]] = []
    hsObservations: Optional[List[Dict[str, Any]]] = []
    visitors: Optional[List[Dict[str, Any]]] = []

    # Step 8 — Variations & Verbal Instructions
    variations: Optional[List[Dict[str, Any]]] = []

    # Step 9 — Photos (Photo Vault)
    photos: Optional[List[Dict[str, Any]]] = []

    # Step 10 — Actions (outstanding actions register)
    actions: Optional[List[Dict[str, Any]]] = []

    # Step 10 — Linked documents (kept for backwards compatibility, surfaced in sign-off)
    linkedDocuments: Optional[Dict[str, Any]] = {}

    # Step 11 — Sign-off (dual)
    notes: Optional[str] = ""
    completedBy: Optional[str] = ""
    completedSignature: Optional[str] = ""
    supervisorName: Optional[str] = ""
    supervisorSignature: Optional[str] = ""
    preparedBy: Optional[str] = ""       # retained for backwards compatibility with earlier drafts
    signature: Optional[str] = ""        # retained (maps to completedSignature)
    isFavourite: Optional[bool] = False


class EntryUpdate(BaseModel):
    projectId: Optional[str] = None
    projectName: Optional[str] = None
    clientName: Optional[str] = None
    siteAddress: Optional[str] = None
    principalContractor: Optional[str] = None
    documentRef: Optional[str] = None
    date: Optional[str] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    tempAM: Optional[str] = None
    tempPM: Optional[str] = None
    wind: Optional[str] = None
    rain: Optional[str] = None
    conditions: Optional[str] = None
    weatherImpact: Optional[str] = None
    supervisor: Optional[str] = None
    crew: Optional[List[Dict[str, Any]]] = None
    subcontractorsOnSite: Optional[List[Dict[str, Any]]] = None
    totalOperatives: Optional[int] = None
    worksCompleted: Optional[List[Dict[str, Any]]] = None
    worksTomorrow: Optional[str] = None
    progressPercent: Optional[str] = None
    deliveries: Optional[List[Dict[str, Any]]] = None
    plant: Optional[List[Dict[str, Any]]] = None
    delays: Optional[List[Dict[str, Any]]] = None
    issues: Optional[List[Dict[str, Any]]] = None
    instructions: Optional[List[Dict[str, Any]]] = None
    hsObservations: Optional[List[Dict[str, Any]]] = None
    visitors: Optional[List[Dict[str, Any]]] = None
    variations: Optional[List[Dict[str, Any]]] = None
    photos: Optional[List[Dict[str, Any]]] = None
    actions: Optional[List[Dict[str, Any]]] = None
    linkedDocuments: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    completedBy: Optional[str] = None
    completedSignature: Optional[str] = None
    supervisorName: Optional[str] = None
    supervisorSignature: Optional[str] = None
    preparedBy: Optional[str] = None
    signature: Optional[str] = None
    isFavourite: Optional[bool] = None


class TemplateIn(BaseModel):
    name: str
    payload: Dict[str, Any]


def build_router(db, get_user):
    router = APIRouter(prefix="/api/site-diary", tags=["site-diary"])

    def _shape(doc: dict) -> dict:
        d = dict(doc)
        d.pop("_id", None)
        return d

    @router.get("/reference")
    async def reference():
        """Static reference lists used by the wizard."""
        return {
            "conditions": WEATHER_CONDITIONS,
            "delayCategories": DELAY_CATEGORIES,
            "windOptions": ["None", "Light breeze", "Moderate", "Strong", "Gale", "Severe"],
            "rainOptions": ["None", "Light", "Heavy", "Snow", "Hail", "Fog"],
        }

    # ---- Entries ----
    @router.get("/entries")
    async def list_entries(
        projectId: Optional[str] = None,
        authorization: Optional[str] = Header(None),
    ):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        q: Dict[str, Any] = {"userId": user["id"], "isDeleted": {"$ne": True}}
        if projectId:
            q["projectId"] = projectId
        rows = await db.site_diary_entries.find(q).sort("date", -1).to_list(1000)
        return [_shape(r) for r in rows]

    @router.post("/entries")
    async def create_entry(body: EntryIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not (body.date or "").strip():
            raise HTTPException(status_code=400, detail="Diary date is required")
        doc = body.model_dump()
        doc.update({
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "toolId": "site-diary",
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "isDeleted": False,
        })
        await db.site_diary_entries.insert_one(doc)
        return _shape(doc)

    @router.patch("/entries/{eid}")
    async def update_entry(eid: str, body: EntryUpdate, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.site_diary_entries.find_one({"id": eid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        updates["updatedAt"] = _now_iso()
        await db.site_diary_entries.update_one({"id": eid}, {"$set": updates})
        fresh = await db.site_diary_entries.find_one({"id": eid})
        return _shape(fresh)

    @router.delete("/entries/{eid}")
    async def delete_entry(eid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.site_diary_entries.find_one({"id": eid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.site_diary_entries.update_one({"id": eid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    # ---- Templates (reusable day templates: standard crew, plant, checklists) ----
    @router.get("/templates")
    async def list_templates(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.site_diary_templates.find(
            {"userId": user["id"], "isDeleted": {"$ne": True}}
        ).sort("updatedAt", -1).to_list(500)
        return [_shape(r) for r in rows]

    @router.post("/templates")
    async def create_template(body: TemplateIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not body.name.strip():
            raise HTTPException(status_code=400, detail="Name is required")
        doc = {
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "name": body.name.strip(),
            "payload": body.payload or {},
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "isDeleted": False,
        }
        await db.site_diary_templates.insert_one(doc)
        return _shape(doc)

    @router.delete("/templates/{tid}")
    async def delete_template(tid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.site_diary_templates.find_one({"id": tid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.site_diary_templates.update_one({"id": tid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    # ---- Stats ----
    @router.get("/stats")
    async def stats(projectId: Optional[str] = None, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        q: Dict[str, Any] = {"userId": user["id"], "isDeleted": {"$ne": True}}
        if projectId:
            q["projectId"] = projectId
        rows = await db.site_diary_entries.find(q).to_list(2000)
        today = datetime.now(timezone.utc).date().isoformat()
        this_week_start = (datetime.now(timezone.utc).date() - timedelta(days=6)).isoformat()
        total = len(rows)
        entered_today = 0
        this_week = 0
        with_delays = 0
        outstanding_actions = 0
        recent = []
        for r in rows:
            d = r.get("date") or ""
            if d == today:
                entered_today += 1
            if d and d >= this_week_start:
                this_week += 1
            if (r.get("delays") or []):
                with_delays += 1
            for a in (r.get("actions") or []):
                st = (a.get("status") or "Open").lower()
                if st not in ("done", "complete", "completed", "closed"):
                    outstanding_actions += 1
            recent.append({
                "id": r.get("id"), "date": r.get("date"),
                "projectName": r.get("projectName"), "supervisor": r.get("supervisor"),
                "totalOperatives": r.get("totalOperatives"),
                "updatedAt": r.get("updatedAt"),
            })
        recent.sort(key=lambda x: x.get("date") or "", reverse=True)

        # Count active projects for missing-today calc
        active_jobs = await db.jobs.count_documents({
            "userId": user["id"],
            "status": {"$in": ["planning", "active", "on_hold", "awaiting_payment", "invoiced"]},
        })
        # Projects with a diary today
        projects_with_today = set()
        for r in rows:
            if (r.get("date") or "") == today and r.get("projectId"):
                projects_with_today.add(r.get("projectId"))
        missing_today = max(0, active_jobs - len(projects_with_today))

        return {
            "total": total,
            "enteredToday": entered_today,
            "thisWeek": this_week,
            "withDelays": with_delays,
            "missingToday": missing_today,
            "outstandingActions": outstanding_actions,
            "recent": recent[:10],
        }

    return router


async def collect_site_diary_attention(db, user_id: str, now: datetime, limit: int = 15) -> list:
    """Surface an alert for every active project that does NOT have a diary
    entry for today (after a sensible cutoff hour). Feeds /api/attention.
    """
    items = []
    # Only fire this alert after 17:00 local (proxy: after 17:00 UTC).
    if now.hour < 17:
        return items

    today = now.date().isoformat()

    active = await db.jobs.find({
        "userId": user_id,
        "status": {"$in": ["planning", "active", "on_hold", "awaiting_payment"]},
    }).to_list(200)
    if not active:
        return items

    entries_today = await db.site_diary_entries.find({
        "userId": user_id, "date": today, "isDeleted": {"$ne": True},
    }).to_list(1000)
    covered = {e.get("projectId") for e in entries_today if e.get("projectId")}

    for job in active:
        jid = job.get("id")
        if not jid or jid in covered:
            continue
        items.append({
            "id": f"site-diary-{jid}",
            "kind": "site_diary_missing",
            "title": f"Site Diary: {job.get('projectName') or job.get('clientName') or 'Project'}",
            "subtitle": "No diary entry yet for today",
            "projectId": jid,
            "projectName": job.get("projectName") or job.get("clientName"),
            "actionLabel": "Add today's diary",
            "actionRoute": f"/app/site-diary?projectId={jid}",
            "severity": "warning",
            "dueAt": today,
        })

    return items[:limit]
