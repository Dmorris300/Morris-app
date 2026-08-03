"""Morris — Incident Report V2 (flagship incident investigation & management).

Endpoints:
  • GET  /api/incident-report/reference          — static enum lists
  • GET  /api/incident-report/entries            — list saved incidents
  • POST /api/incident-report/entries            — create incident
  • PATCH /api/incident-report/entries/{id}
  • DELETE /api/incident-report/entries/{id}
  • GET  /api/incident-report/templates          — user templates
  • POST /api/incident-report/templates
  • DELETE /api/incident-report/templates/{id}
  • GET  /api/incident-report/stats?projectId=…

`collect_incident_attention` surfaces overdue corrective actions and open
high-priority incidents into the Command Centre /api/attention feed.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel


INCIDENT_TYPES = [
    "Injury", "Near Miss", "Property Damage", "Environmental",
    "Dangerous Occurrence", "Vehicle", "Security", "Other",
]
SEVERITIES = ["Low", "Medium", "High", "Critical"]
STATUSES = ["Open", "Under Investigation", "Corrective Actions", "Closed"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class IncidentIn(BaseModel):
    # Step 1 — Project
    projectId: Optional[str] = ""
    projectName: Optional[str] = ""
    clientName: Optional[str] = ""
    siteAddress: Optional[str] = ""
    principalContractor: Optional[str] = ""
    documentRef: Optional[str] = ""

    # Step 2 — Incident details
    incidentType: Optional[str] = ""
    severity: Optional[str] = "Medium"
    status: Optional[str] = "Open"
    date: Optional[str] = ""
    time: Optional[str] = ""
    location: Optional[str] = ""
    description: Optional[str] = ""
    immediateActions: Optional[str] = ""
    reportedBy: Optional[str] = ""

    # RIDDOR
    riddorReportable: Optional[bool] = False
    riddorCategory: Optional[str] = ""
    riddorReference: Optional[str] = ""

    # Step 3 — People
    injuredPersons: Optional[List[Dict[str, Any]]] = []
    witnesses: Optional[List[Dict[str, Any]]] = []
    supervisor: Optional[str] = ""
    firstAider: Optional[str] = ""

    # Step 4 — Evidence
    photos: Optional[List[Dict[str, Any]]] = []
    drawings: Optional[List[Dict[str, Any]]] = []

    # Step 5 — Investigation
    immediateCause: Optional[str] = ""
    underlyingCause: Optional[str] = ""
    rootCause: Optional[str] = ""
    fiveWhys: Optional[List[Dict[str, Any]]] = []  # [{q,a}]

    # Step 6 — Risk review checklist
    riskReview: Optional[Dict[str, Any]] = {}     # {ramsUpdate:bool, notes:str, ...}

    # Step 7 — CAPA
    capa: Optional[List[Dict[str, Any]]] = []     # [{description, responsible, dueDate, priority, status}]

    # Step 8 — Linked documents
    linkedDocuments: Optional[Dict[str, Any]] = {}

    # Step 9 — Sign-off (triple)
    notes: Optional[str] = ""
    preparedBy: Optional[str] = ""
    preparedSignature: Optional[str] = ""
    reviewedBy: Optional[str] = ""
    reviewedSignature: Optional[str] = ""
    approvedBy: Optional[str] = ""
    approvedSignature: Optional[str] = ""

    isFavourite: Optional[bool] = False


class IncidentUpdate(BaseModel):
    projectId: Optional[str] = None
    projectName: Optional[str] = None
    clientName: Optional[str] = None
    siteAddress: Optional[str] = None
    principalContractor: Optional[str] = None
    documentRef: Optional[str] = None
    incidentType: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    immediateActions: Optional[str] = None
    reportedBy: Optional[str] = None
    riddorReportable: Optional[bool] = None
    riddorCategory: Optional[str] = None
    riddorReference: Optional[str] = None
    injuredPersons: Optional[List[Dict[str, Any]]] = None
    witnesses: Optional[List[Dict[str, Any]]] = None
    supervisor: Optional[str] = None
    firstAider: Optional[str] = None
    photos: Optional[List[Dict[str, Any]]] = None
    drawings: Optional[List[Dict[str, Any]]] = None
    immediateCause: Optional[str] = None
    underlyingCause: Optional[str] = None
    rootCause: Optional[str] = None
    fiveWhys: Optional[List[Dict[str, Any]]] = None
    riskReview: Optional[Dict[str, Any]] = None
    capa: Optional[List[Dict[str, Any]]] = None
    linkedDocuments: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    preparedBy: Optional[str] = None
    preparedSignature: Optional[str] = None
    reviewedBy: Optional[str] = None
    reviewedSignature: Optional[str] = None
    approvedBy: Optional[str] = None
    approvedSignature: Optional[str] = None
    isFavourite: Optional[bool] = None


class TemplateIn(BaseModel):
    name: str
    payload: Dict[str, Any]


def build_router(db, get_user):
    router = APIRouter(prefix="/api/incident-report", tags=["incident-report"])

    def _shape(doc: dict) -> dict:
        d = dict(doc); d.pop("_id", None); return d

    def _capa_open(row: dict) -> int:
        n = 0
        for a in (row.get("capa") or []):
            st = (a.get("status") or "Open").lower()
            if st not in ("done", "complete", "completed", "closed"):
                n += 1
        return n

    @router.get("/reference")
    async def reference():
        return {
            "incidentTypes": INCIDENT_TYPES,
            "severities": SEVERITIES,
            "statuses": STATUSES,
            "riddorCategories": [
                "Fatality", "Specified injury", "Over-7-day incapacitation",
                "Occupational disease", "Dangerous occurrence", "Gas incident", "Not RIDDOR reportable",
            ],
            "riskReviewKeys": [
                {"key": "ramsUpdate", "label": "Does the RAMS require updating?"},
                {"key": "methodStatementUpdate", "label": "Does the Method Statement require updating?"},
                {"key": "coshhUpdate", "label": "Is a COSHH Assessment affected?"},
                {"key": "toolboxTalkRequired", "label": "Is a Toolbox Talk required?"},
                {"key": "riskAssessmentReview", "label": "Does the Risk Assessment need reviewing?"},
            ],
        }

    @router.get("/entries")
    async def list_entries(projectId: Optional[str] = None, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        q: Dict[str, Any] = {"userId": user["id"], "isDeleted": {"$ne": True}}
        if projectId:
            q["projectId"] = projectId
        rows = await db.incident_reports.find(q).sort("date", -1).to_list(1000)
        return [_shape(r) for r in rows]

    @router.post("/entries")
    async def create_entry(body: IncidentIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not (body.date or "").strip():
            raise HTTPException(status_code=400, detail="Incident date is required")
        if not (body.incidentType or "").strip():
            raise HTTPException(status_code=400, detail="Incident type is required")
        doc = body.model_dump()
        doc.update({
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "toolId": "incident-report",
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "isDeleted": False,
        })
        await db.incident_reports.insert_one(doc)
        return _shape(doc)

    @router.patch("/entries/{eid}")
    async def update_entry(eid: str, body: IncidentUpdate, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.incident_reports.find_one({"id": eid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        updates["updatedAt"] = _now_iso()
        await db.incident_reports.update_one({"id": eid}, {"$set": updates})
        fresh = await db.incident_reports.find_one({"id": eid})
        return _shape(fresh)

    @router.delete("/entries/{eid}")
    async def delete_entry(eid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.incident_reports.find_one({"id": eid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.incident_reports.update_one({"id": eid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    @router.get("/templates")
    async def list_templates(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.incident_templates.find(
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
            "id": str(uuid.uuid4()), "userId": user["id"],
            "name": body.name.strip(), "payload": body.payload or {},
            "createdAt": _now_iso(), "updatedAt": _now_iso(), "isDeleted": False,
        }
        await db.incident_templates.insert_one(doc)
        return _shape(doc)

    @router.delete("/templates/{tid}")
    async def delete_template(tid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.incident_templates.find_one({"id": tid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.incident_templates.update_one({"id": tid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    @router.get("/stats")
    async def stats(projectId: Optional[str] = None, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        q: Dict[str, Any] = {"userId": user["id"], "isDeleted": {"$ne": True}}
        if projectId:
            q["projectId"] = projectId
        rows = await db.incident_reports.find(q).to_list(2000)

        total = len(rows)
        open_n = 0
        closed = 0
        high_priority = 0
        near_misses = 0
        under_investigation = 0
        capa_outstanding = 0
        trends: Dict[str, int] = {}   # YYYY-MM → count
        recent = []
        for r in rows:
            st = r.get("status") or "Open"
            sev = r.get("severity") or ""
            ityp = r.get("incidentType") or ""
            if st == "Closed":
                closed += 1
            else:
                open_n += 1
            if sev in ("High", "Critical") and st != "Closed":
                high_priority += 1
            if ityp == "Near Miss":
                near_misses += 1
            if st == "Under Investigation":
                under_investigation += 1
            capa_outstanding += _capa_open(r)
            month = (r.get("date") or "")[:7]
            if month:
                trends[month] = trends.get(month, 0) + 1
            recent.append({
                "id": r.get("id"), "date": r.get("date"),
                "projectName": r.get("projectName"),
                "incidentType": ityp, "severity": sev, "status": st,
                "capaOpen": _capa_open(r),
                "updatedAt": r.get("updatedAt"),
            })
        recent.sort(key=lambda x: x.get("date") or "", reverse=True)
        trend_series = [{"month": k, "count": v} for k, v in sorted(trends.items())][-12:]

        return {
            "total": total,
            "open": open_n,
            "closed": closed,
            "highPriority": high_priority,
            "nearMisses": near_misses,
            "underInvestigation": under_investigation,
            "capaOutstanding": capa_outstanding,
            "trend": trend_series,
            "recent": recent[:10],
        }

    return router


async def collect_incident_attention(db, user_id: str, now: datetime, limit: int = 20) -> list:
    """Surface (a) open high-priority incidents older than 3 days, and
    (b) overdue corrective actions from any open incident. Feeds /api/attention.
    """
    items: List[Dict[str, Any]] = []
    today = now.date().isoformat()
    rows = await db.incident_reports.find({
        "userId": user_id, "isDeleted": {"$ne": True},
    }).to_list(500)
    for r in rows:
        st = r.get("status") or "Open"
        sev = r.get("severity") or ""
        iid = r.get("id")
        if st != "Closed" and sev in ("High", "Critical"):
            items.append({
                "id": f"incident-open-{iid}",
                "kind": "incident_open_high",
                "title": f"{sev} priority incident open",
                "subtitle": f"{r.get('incidentType') or 'Incident'} · {r.get('projectName') or 'Unlinked'}",
                "projectId": r.get("projectId"),
                "projectName": r.get("projectName"),
                "actionLabel": "Open incident",
                "actionRoute": f"/app/incident-report?open={iid}",
                "severity": "danger" if sev == "Critical" else "warning",
                "dueAt": r.get("date"),
            })
        for a in (r.get("capa") or []):
            due = (a.get("dueDate") or "")
            ast = (a.get("status") or "Open").lower()
            if due and due < today and ast not in ("done", "complete", "completed", "closed"):
                items.append({
                    "id": f"incident-capa-{iid}-{a.get('id') or a.get('description', '')[:8]}",
                    "kind": "incident_capa_overdue",
                    "title": "Corrective action overdue",
                    "subtitle": (a.get("description") or "")[:120],
                    "projectId": r.get("projectId"),
                    "projectName": r.get("projectName"),
                    "actionLabel": "Open incident",
                    "actionRoute": f"/app/incident-report?open={iid}",
                    "severity": "danger",
                    "dueAt": due,
                })
    return items[:limit]
