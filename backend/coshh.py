"""Morris — COSHH V2 (hazardous substance management).

Endpoints:
  • GET  /api/coshh/hazards       — GHS pictogram/statement library
  • GET  /api/coshh/assessments   — list saved assessments (dashboard)
  • POST /api/coshh/assessments   — save assessment (also mirrored to /documents)
  • PATCH /api/coshh/assessments/{id}
  • DELETE /api/coshh/assessments/{id}
  • GET  /api/coshh/templates     — user template library
  • POST /api/coshh/templates
  • DELETE /api/coshh/templates/{id}
  • GET  /api/coshh/stats?projectId=…

Review-due assessments (reviewDate within 30 days or past) are surfaced by
compliance.collect_compliance_attention → /api/attention (Command Centre).
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel


# GHS pictograms — used in dashboard filters and displayed in the PDF as coloured badges.
GHS_PICTOGRAMS = [
    {"id": "GHS01", "name": "Explosive",         "label": "Explosive",        "colour": "#F27C7C"},
    {"id": "GHS02", "name": "Flammable",         "label": "Flammable",        "colour": "#F27C7C"},
    {"id": "GHS03", "name": "Oxidising",         "label": "Oxidising",        "colour": "#E8A020"},
    {"id": "GHS04", "name": "Compressed Gas",    "label": "Compressed Gas",   "colour": "#68D391"},
    {"id": "GHS05", "name": "Corrosive",         "label": "Corrosive",        "colour": "#F27C7C"},
    {"id": "GHS06", "name": "Toxic",             "label": "Acute Toxicity",   "colour": "#F27C7C"},
    {"id": "GHS07", "name": "Harmful",           "label": "Harmful / Irritant", "colour": "#E8A020"},
    {"id": "GHS08", "name": "Health Hazard",     "label": "Long-term Health", "colour": "#F27C7C"},
    {"id": "GHS09", "name": "Environmental",     "label": "Environmental",    "colour": "#68D391"},
]

# Common construction H- and P-statement suggestions offered as datalist chips.
COMMON_H_STATEMENTS = [
    "H225 Highly flammable liquid and vapour",
    "H302 Harmful if swallowed",
    "H314 Causes severe skin burns and eye damage",
    "H315 Causes skin irritation",
    "H317 May cause an allergic skin reaction",
    "H319 Causes serious eye irritation",
    "H332 Harmful if inhaled",
    "H335 May cause respiratory irritation",
    "H336 May cause drowsiness or dizziness",
    "H350 May cause cancer",
    "H351 Suspected of causing cancer",
    "H373 May cause damage to organs through prolonged or repeated exposure",
    "H400 Very toxic to aquatic life",
]

COMMON_P_STATEMENTS = [
    "P210 Keep away from heat, hot surfaces, sparks, open flames.",
    "P260 Do not breathe dust/fume/gas/mist/vapours/spray.",
    "P264 Wash thoroughly after handling.",
    "P280 Wear protective gloves/protective clothing/eye protection/face protection.",
    "P301+P310 IF SWALLOWED: Immediately call a POISON CENTER or doctor.",
    "P303+P361+P353 IF ON SKIN (or hair): Take off immediately all contaminated clothing. Rinse skin with water.",
    "P305+P351+P338 IF IN EYES: Rinse cautiously with water for several minutes.",
    "P501 Dispose of contents/container in accordance with local regulations.",
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AssessmentIn(BaseModel):
    projectId: Optional[str] = ""
    projectName: Optional[str] = ""
    clientName: Optional[str] = ""
    siteAddress: Optional[str] = ""
    assessmentDate: Optional[str] = ""
    reviewDate: Optional[str] = ""
    assessor: Optional[str] = ""
    productName: str
    manufacturer: Optional[str] = ""
    supplier: Optional[str] = ""
    productCode: Optional[str] = ""
    description: Optional[str] = ""
    quantityUsed: Optional[str] = ""
    sdsUrl: Optional[str] = ""
    hazardClassification: Optional[str] = ""
    signalWord: Optional[str] = ""
    pictograms: Optional[List[str]] = []
    hStatements: Optional[List[str]] = []
    pStatements: Optional[List[str]] = []
    hazardLevel: Optional[str] = "Medium"
    exposure: Optional[Dict[str, Any]] = {}
    controlMeasures: Optional[Dict[str, Any]] = {}
    ppe: Optional[Dict[str, Any]] = {}
    firstAid: Optional[Dict[str, Any]] = {}
    fireSpill: Optional[Dict[str, Any]] = {}
    photos: Optional[List[Dict[str, Any]]] = []
    linkedDocuments: Optional[Dict[str, Any]] = {}
    checkedBy: Optional[str] = ""
    approvedBy: Optional[str] = ""
    documentRef: Optional[str] = ""
    isFavourite: Optional[bool] = False


class AssessmentUpdate(BaseModel):
    __annotations__ = AssessmentIn.__annotations__
    productName: Optional[str] = None  # override to make it optional in patches


class TemplateIn(BaseModel):
    name: str
    productName: str
    payload: Dict[str, Any]


def build_router(db, get_user):
    router = APIRouter(prefix="/api/coshh", tags=["coshh"])

    def _shape(doc: dict) -> dict:
        d = dict(doc)
        d.pop("_id", None)
        return d

    @router.get("/hazards")
    async def hazards():
        return {
            "pictograms": GHS_PICTOGRAMS,
            "hStatements": COMMON_H_STATEMENTS,
            "pStatements": COMMON_P_STATEMENTS,
        }

    # ---- Assessments (dashboard rows) ----
    @router.get("/assessments")
    async def list_assessments(
        projectId: Optional[str] = None,
        authorization: Optional[str] = Header(None),
    ):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        q: Dict[str, Any] = {"userId": user["id"], "isDeleted": {"$ne": True}}
        if projectId:
            q["projectId"] = projectId
        rows = await db.coshh_assessments.find(q).sort("updatedAt", -1).to_list(1000)
        return [_shape(r) for r in rows]

    @router.post("/assessments")
    async def create_assessment(body: AssessmentIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not body.productName.strip():
            raise HTTPException(status_code=400, detail="Product name is required")
        doc = body.model_dump()
        doc.update({
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "toolId": "coshh",
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "isDeleted": False,
        })
        await db.coshh_assessments.insert_one(doc)
        return _shape(doc)

    @router.patch("/assessments/{aid}")
    async def update_assessment(aid: str, body: AssessmentUpdate, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.coshh_assessments.find_one({"id": aid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        updates["updatedAt"] = _now_iso()
        await db.coshh_assessments.update_one({"id": aid}, {"$set": updates})
        fresh = await db.coshh_assessments.find_one({"id": aid})
        return _shape(fresh)

    @router.delete("/assessments/{aid}")
    async def delete_assessment(aid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.coshh_assessments.find_one({"id": aid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.coshh_assessments.update_one({"id": aid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    # ---- Templates ----
    @router.get("/templates")
    async def list_templates(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.coshh_templates.find(
            {"userId": user["id"], "isDeleted": {"$ne": True}}
        ).sort("updatedAt", -1).to_list(500)
        return [_shape(r) for r in rows]

    @router.post("/templates")
    async def create_template(body: TemplateIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not body.name.strip():
            raise HTTPException(status_code=400, detail="Name is required")
        if not body.productName.strip():
            raise HTTPException(status_code=400, detail="Product name is required")
        doc = {
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "name": body.name.strip(),
            "productName": body.productName.strip(),
            "payload": body.payload or {},
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "isDeleted": False,
        }
        await db.coshh_templates.insert_one(doc)
        return _shape(doc)

    @router.delete("/templates/{tid}")
    async def delete_template(tid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.coshh_templates.find_one({"id": tid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.coshh_templates.update_one({"id": tid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    # ---- Stats ----
    @router.get("/stats")
    async def stats(projectId: Optional[str] = None, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        q: Dict[str, Any] = {"userId": user["id"], "isDeleted": {"$ne": True}}
        if projectId:
            q["projectId"] = projectId
        rows = await db.coshh_assessments.find(q).to_list(2000)
        today = datetime.now(timezone.utc).date().isoformat()
        total = len(rows)
        reviews_due = 0
        expired = 0
        high_risk = 0
        recent = []
        for r in rows:
            rd = r.get("reviewDate") or ""
            if rd:
                if rd < today:
                    expired += 1
                else:
                    # count as "due" if within 30 days
                    try:
                        d = datetime.fromisoformat(rd + "T00:00:00+00:00").date()
                        if (d - datetime.now(timezone.utc).date()).days <= 30:
                            reviews_due += 1
                    except Exception:
                        pass
            if (r.get("hazardLevel") or "").lower() == "high":
                high_risk += 1
            recent.append({
                "id": r.get("id"), "productName": r.get("productName"),
                "hazardLevel": r.get("hazardLevel"), "reviewDate": r.get("reviewDate"),
                "updatedAt": r.get("updatedAt"),
            })
        recent.sort(key=lambda x: x.get("updatedAt") or "", reverse=True)
        return {
            "total": total,
            "active": max(0, total - expired),
            "reviewsDue": reviews_due,
            "expired": expired,
            "highRisk": high_risk,
            "recent": recent[:10],
        }

    return router


# Compliance attention feed for review-due assessments.
async def collect_coshh_attention(db, user_id: str, now: datetime, limit: int = 15) -> list:
    items = []
    rows = await db.coshh_assessments.find({
        "userId": user_id, "isDeleted": {"$ne": True},
        "reviewDate": {"$nin": [None, ""]},
    }).to_list(500)
    for r in rows:
        rd = r.get("reviewDate")
        if not rd:
            continue
        try:
            dt = datetime.fromisoformat(rd + "T00:00:00+00:00")
        except Exception:
            continue
        days = (dt.date() - now.date()).days
        if days > 60:
            continue
        severity = "urgent" if days < 0 else ("urgent" if days <= 14 else "warning")
        prefix = "Review overdue" if days < 0 else f"Review in {days} day{'' if days == 1 else 's'}"
        items.append({
            "id": f"coshh-{r.get('id')}",
            "kind": "coshh_review_due",
            "title": f"COSHH: {r.get('productName', 'Substance')}",
            "subtitle": prefix,
            "projectId": r.get("projectId"),
            "projectName": r.get("projectName"),
            "actionLabel": "Open COSHH",
            "actionRoute": "/app/coshh",
            "severity": severity,
            "dueAt": rd,
        })
    items.sort(key=lambda x: x["dueAt"] or "9999")
    return items[:limit]
