"""Morris — Risk Assessment V2 (flagship central H&S record).

Endpoints:
  • GET  /api/risk-assessment/reference
  • GET  /api/risk-assessment/entries
  • POST /api/risk-assessment/entries
  • PATCH /api/risk-assessment/entries/{id}
  • DELETE /api/risk-assessment/entries/{id}
  • GET  /api/risk-assessment/templates
  • POST /api/risk-assessment/templates
  • DELETE /api/risk-assessment/templates/{id}
  • GET  /api/risk-assessment/stats?projectId=…

`collect_risk_assessment_attention` surfaces:
  • reviews due (reviewDate ≤ today) that are not Closed
  • assessments with any residual High/Extreme hazard
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel


PERSONS_AT_RISK = ["Operatives", "Subcontractors", "Visitors", "Members of Public", "Emergency Services", "Young Persons", "New/Expectant Mothers", "Others"]
STATUSES = ["Draft", "Active", "Under Review", "Closed"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def rating_from_score(score: int) -> str:
    if score >= 16: return "Extreme"
    if score >= 10: return "High"
    if score >= 5:  return "Medium"
    return "Low"


class AssessmentIn(BaseModel):
    # Step 1 — Project
    projectId: Optional[str] = ""
    projectName: Optional[str] = ""
    clientName: Optional[str] = ""
    siteAddress: Optional[str] = ""
    principalContractor: Optional[str] = ""
    documentRef: Optional[str] = ""

    # Step 2 — Activity
    activity: Optional[str] = ""
    activityDescription: Optional[str] = ""
    assessmentDate: Optional[str] = ""
    reviewDate: Optional[str] = ""
    assessor: Optional[str] = ""
    status: Optional[str] = "Active"

    # Step 3-8 — Hazards (each hazard carries persons/existing/rating/additional/residual)
    hazards: Optional[List[Dict[str, Any]]] = []

    # Step 4 (assessment-level persons at risk selection also allowed here)
    personsAtRisk: Optional[List[str]] = []

    # Step 9 — Photos / evidence
    photos: Optional[List[Dict[str, Any]]] = []

    # Step 10 — Linked documents
    linkedDocuments: Optional[Dict[str, Any]] = {}

    # Step 11 — Sign-off (triple)
    notes: Optional[str] = ""
    preparedBy: Optional[str] = ""
    preparedSignature: Optional[str] = ""
    reviewedBy: Optional[str] = ""
    reviewedSignature: Optional[str] = ""
    approvedBy: Optional[str] = ""
    approvedSignature: Optional[str] = ""

    isFavourite: Optional[bool] = False


class AssessmentUpdate(BaseModel):
    projectId: Optional[str] = None
    projectName: Optional[str] = None
    clientName: Optional[str] = None
    siteAddress: Optional[str] = None
    principalContractor: Optional[str] = None
    documentRef: Optional[str] = None
    activity: Optional[str] = None
    activityDescription: Optional[str] = None
    assessmentDate: Optional[str] = None
    reviewDate: Optional[str] = None
    assessor: Optional[str] = None
    status: Optional[str] = None
    hazards: Optional[List[Dict[str, Any]]] = None
    personsAtRisk: Optional[List[str]] = None
    photos: Optional[List[Dict[str, Any]]] = None
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
    router = APIRouter(prefix="/api/risk-assessment", tags=["risk-assessment"])

    def _shape(doc: dict) -> dict:
        d = dict(doc); d.pop("_id", None); return d

    def _has_high_residual(row: dict) -> bool:
        for h in (row.get("hazards") or []):
            rr = (h.get("residualRating") or "").lower()
            if rr in ("high", "extreme"):
                return True
        return False

    @router.get("/reference")
    async def reference():
        # Standard 5×5 UK construction matrix
        return {
            "likelihood": [
                {"value": 1, "label": "1 · Rare"},
                {"value": 2, "label": "2 · Unlikely"},
                {"value": 3, "label": "3 · Possible"},
                {"value": 4, "label": "4 · Likely"},
                {"value": 5, "label": "5 · Almost certain"},
            ],
            "severity": [
                {"value": 1, "label": "1 · Insignificant"},
                {"value": 2, "label": "2 · Minor"},
                {"value": 3, "label": "3 · Moderate"},
                {"value": 4, "label": "4 · Major"},
                {"value": 5, "label": "5 · Catastrophic"},
            ],
            "personsAtRisk": PERSONS_AT_RISK,
            "statuses": STATUSES,
            "bands": [
                {"min": 1,  "max": 4,  "label": "Low"},
                {"min": 5,  "max": 9,  "label": "Medium"},
                {"min": 10, "max": 15, "label": "High"},
                {"min": 16, "max": 25, "label": "Extreme"},
            ],
        }

    @router.get("/entries")
    async def list_entries(projectId: Optional[str] = None, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        q: Dict[str, Any] = {"userId": user["id"], "isDeleted": {"$ne": True}}
        if projectId:
            q["projectId"] = projectId
        rows = await db.risk_assessments.find(q).sort("updatedAt", -1).to_list(1000)
        return [_shape(r) for r in rows]

    @router.post("/entries")
    async def create_entry(body: AssessmentIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not (body.activity or "").strip():
            raise HTTPException(status_code=400, detail="Activity is required")
        if not (body.assessmentDate or "").strip():
            raise HTTPException(status_code=400, detail="Assessment date is required")
        doc = body.model_dump()
        # Normalise hazard ratings server-side so bands are always consistent
        for h in (doc.get("hazards") or []):
            il, isv = int(h.get("initialLikelihood") or 0), int(h.get("initialSeverity") or 0)
            rl, rsv = int(h.get("residualLikelihood") or 0), int(h.get("residualSeverity") or 0)
            h["initialScore"] = il * isv
            h["residualScore"] = rl * rsv
            if h["initialScore"] > 0:
                h["initialRating"] = rating_from_score(h["initialScore"])
            if h["residualScore"] > 0:
                h["residualRating"] = rating_from_score(h["residualScore"])
        doc.update({
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "toolId": "risk-register",
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "isDeleted": False,
        })
        await db.risk_assessments.insert_one(doc)
        return _shape(doc)

    @router.patch("/entries/{eid}")
    async def update_entry(eid: str, body: AssessmentUpdate, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.risk_assessments.find_one({"id": eid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        if "hazards" in updates:
            for h in updates["hazards"]:
                il, isv = int(h.get("initialLikelihood") or 0), int(h.get("initialSeverity") or 0)
                rl, rsv = int(h.get("residualLikelihood") or 0), int(h.get("residualSeverity") or 0)
                h["initialScore"] = il * isv
                h["residualScore"] = rl * rsv
                if h["initialScore"] > 0:
                    h["initialRating"] = rating_from_score(h["initialScore"])
                if h["residualScore"] > 0:
                    h["residualRating"] = rating_from_score(h["residualScore"])
        updates["updatedAt"] = _now_iso()
        await db.risk_assessments.update_one({"id": eid}, {"$set": updates})
        fresh = await db.risk_assessments.find_one({"id": eid})
        return _shape(fresh)

    @router.delete("/entries/{eid}")
    async def delete_entry(eid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.risk_assessments.find_one({"id": eid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.risk_assessments.update_one({"id": eid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    @router.get("/templates")
    async def list_templates(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.risk_assessment_templates.find(
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
        await db.risk_assessment_templates.insert_one(doc)
        return _shape(doc)

    @router.delete("/templates/{tid}")
    async def delete_template(tid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.risk_assessment_templates.find_one({"id": tid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.risk_assessment_templates.update_one({"id": tid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    @router.get("/stats")
    async def stats(projectId: Optional[str] = None, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        q: Dict[str, Any] = {"userId": user["id"], "isDeleted": {"$ne": True}}
        if projectId:
            q["projectId"] = projectId
        rows = await db.risk_assessments.find(q).to_list(2000)

        today = datetime.now(timezone.utc).date().isoformat()
        total = len(rows)
        active = 0
        reviews_due = 0
        high_risks = 0
        recent = []
        for r in rows:
            st = r.get("status") or "Active"
            if st != "Closed":
                active += 1
            rv = r.get("reviewDate") or ""
            if rv and rv <= today and st != "Closed":
                reviews_due += 1
            if _has_high_residual(r):
                high_risks += 1
            hazards = r.get("hazards") or []
            recent.append({
                "id": r.get("id"),
                "activity": r.get("activity"),
                "projectName": r.get("projectName"),
                "assessmentDate": r.get("assessmentDate"),
                "reviewDate": r.get("reviewDate"),
                "status": st,
                "hazardCount": len(hazards),
                "highResiduals": sum(1 for h in hazards if (h.get("residualRating") or "").lower() in ("high", "extreme")),
                "updatedAt": r.get("updatedAt"),
            })
        recent.sort(key=lambda x: x.get("updatedAt") or "", reverse=True)
        return {
            "total": total,
            "active": active,
            "reviewsDue": reviews_due,
            "highRisks": high_risks,
            "recent": recent[:10],
        }

    return router


async def collect_risk_assessment_attention(db, user_id: str, now: datetime, limit: int = 20) -> list:
    items: List[Dict[str, Any]] = []
    today = now.date().isoformat()
    rows = await db.risk_assessments.find({
        "userId": user_id, "isDeleted": {"$ne": True},
    }).to_list(500)
    for r in rows:
        st = r.get("status") or "Active"
        rid = r.get("id")
        rv = r.get("reviewDate") or ""
        if rv and rv <= today and st != "Closed":
            items.append({
                "id": f"risk-assess-review-{rid}",
                "kind": "risk_assessment_review_due",
                "title": "Risk assessment review due",
                "subtitle": f"{r.get('activity') or 'Activity'} · {r.get('projectName') or 'Unlinked'}",
                "projectId": r.get("projectId"),
                "projectName": r.get("projectName"),
                "actionLabel": "Open assessment",
                "actionRoute": f"/app/risk-register?open={rid}",
                "severity": "warning",
                "dueAt": rv,
            })
        # High residual hazard alert (single per assessment)
        high = sum(1 for h in (r.get("hazards") or []) if (h.get("residualRating") or "").lower() in ("high", "extreme"))
        if high > 0 and st != "Closed":
            items.append({
                "id": f"risk-assess-high-{rid}",
                "kind": "risk_assessment_high_residual",
                "title": f"{high} high residual risk{'s' if high > 1 else ''}",
                "subtitle": f"{r.get('activity') or 'Activity'} · {r.get('projectName') or 'Unlinked'}",
                "projectId": r.get("projectId"),
                "projectName": r.get("projectName"),
                "actionLabel": "Review controls",
                "actionRoute": f"/app/risk-register?open={rid}",
                "severity": "warning",
                "dueAt": None,
            })
    return items[:limit]
