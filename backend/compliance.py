"""Morris Compliance Hub — credentials, insurance, personnel & vehicles.

Single generic `compliance_items` collection with 4 categories:
  - "insurance"   → Public Liability, Employers Liability, Professional Indemnity
  - "personnel"   → CSCS, First Aid, DBS, Training Certificate
  - "vehicle"     → MOT, Insurance, Tax, Service
  - "other"       → free-form

Every item carries an `expiryDate` — items within 30 days appear on the Command
Centre attention feed automatically (Compliance Hub reads the same source).

MongoDB document shape:
  {
    id, userId,
    category: "insurance"|"personnel"|"vehicle"|"other",
    type: "Public Liability"|"CSCS"|"MOT"|...,
    name,                      # subject name (person, policy holder, vehicle reg)
    issuer,                    # insurer / issuing body
    refNumber,
    issueDate, expiryDate,
    notes,
    createdAt, updatedAt,
    isDeleted: bool,
  }
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel


CATEGORIES = ("insurance", "personnel", "vehicle", "other")

# Canonical type suggestions per category (frontend uses these as datalist).
DEFAULT_TYPES = {
    "insurance": [
        "Public Liability", "Employers Liability", "Professional Indemnity",
        "Contract Works", "Tools Insurance", "Van Insurance",
    ],
    "personnel": [
        "CSCS", "First Aid", "DBS", "SSSTS", "SMSTS", "Asbestos Awareness",
        "IPAF", "PASMA", "Manual Handling", "Fire Warden", "Training Certificate",
    ],
    "vehicle": ["MOT", "Insurance", "Tax", "Service", "V5C"],
    "other": [],
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _iso_today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _days_until(iso_date: Optional[str]) -> Optional[int]:
    if not iso_date:
        return None
    try:
        d = datetime.fromisoformat(iso_date + "T00:00:00+00:00") if "T" not in iso_date else datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
        return (d.date() - datetime.now(timezone.utc).date()).days
    except Exception:
        return None


class ComplianceItemIn(BaseModel):
    category: str
    type: str
    name: str
    issuer: Optional[str] = ""
    refNumber: Optional[str] = ""
    issueDate: Optional[str] = ""
    expiryDate: Optional[str] = ""
    notes: Optional[str] = ""


class ComplianceItemUpdate(BaseModel):
    category: Optional[str] = None
    type: Optional[str] = None
    name: Optional[str] = None
    issuer: Optional[str] = None
    refNumber: Optional[str] = None
    issueDate: Optional[str] = None
    expiryDate: Optional[str] = None
    notes: Optional[str] = None


def build_router(db, get_user):
    router = APIRouter(prefix="/api/compliance", tags=["compliance"])

    def _shape(doc: dict) -> dict:
        d = dict(doc)
        d.pop("_id", None)
        d["daysUntilExpiry"] = _days_until(d.get("expiryDate"))
        return d

    @router.get("/types")
    async def get_types():
        return DEFAULT_TYPES

    @router.get("/items")
    async def list_items(
        category: Optional[str] = None,
        authorization: Optional[str] = Header(None),
    ):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        q = {"userId": user["id"], "isDeleted": {"$ne": True}}
        if category:
            if category not in CATEGORIES:
                raise HTTPException(status_code=400, detail="Invalid category")
            q["category"] = category
        rows = await db.compliance_items.find(q).sort("expiryDate", 1).to_list(1000)
        return [_shape(r) for r in rows]

    @router.get("/summary")
    async def summary(authorization: Optional[str] = Header(None)):
        """Dashboard counts for the Compliance Hub landing view."""
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        base = {"userId": user["id"], "isDeleted": {"$ne": True}}
        rows = await db.compliance_items.find(base).to_list(2000)
        today = _iso_today()
        buckets = {c: {"total": 0, "expiring30": 0, "expired": 0} for c in CATEGORIES}
        expiring_soon = []
        for r in rows:
            cat = r.get("category", "other")
            if cat not in buckets:
                cat = "other"
            buckets[cat]["total"] += 1
            exp = r.get("expiryDate") or ""
            if exp and exp < today:
                buckets[cat]["expired"] += 1
                expiring_soon.append(_shape(r))
                continue
            d = _days_until(exp)
            if d is not None and 0 <= d <= 30:
                buckets[cat]["expiring30"] += 1
                expiring_soon.append(_shape(r))
        expiring_soon.sort(key=lambda x: x.get("expiryDate") or "9999")
        return {"buckets": buckets, "expiringSoon": expiring_soon[:20]}

    @router.post("/items")
    async def create_item(
        body: ComplianceItemIn,
        authorization: Optional[str] = Header(None),
    ):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if body.category not in CATEGORIES:
            raise HTTPException(status_code=400, detail="Invalid category")
        if not body.name.strip():
            raise HTTPException(status_code=400, detail="Name is required")
        if not body.type.strip():
            raise HTTPException(status_code=400, detail="Type is required")
        doc = {
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "category": body.category,
            "type": body.type.strip(),
            "name": body.name.strip(),
            "issuer": (body.issuer or "").strip(),
            "refNumber": (body.refNumber or "").strip(),
            "issueDate": body.issueDate or "",
            "expiryDate": body.expiryDate or "",
            "notes": (body.notes or "").strip(),
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "isDeleted": False,
        }
        await db.compliance_items.insert_one(doc)
        return _shape(doc)

    @router.patch("/items/{item_id}")
    async def update_item(
        item_id: str,
        body: ComplianceItemUpdate,
        authorization: Optional[str] = Header(None),
    ):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.compliance_items.find_one({
            "id": item_id, "userId": user["id"], "isDeleted": {"$ne": True},
        })
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        if "category" in updates and updates["category"] not in CATEGORIES:
            raise HTTPException(status_code=400, detail="Invalid category")
        updates["updatedAt"] = _now_iso()
        await db.compliance_items.update_one({"id": item_id}, {"$set": updates})
        fresh = await db.compliance_items.find_one({"id": item_id})
        return _shape(fresh)

    @router.delete("/items/{item_id}")
    async def delete_item(
        item_id: str,
        authorization: Optional[str] = Header(None),
    ):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.compliance_items.find_one({
            "id": item_id, "userId": user["id"], "isDeleted": {"$ne": True},
        })
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.compliance_items.update_one(
            {"id": item_id}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}}
        )
        return {"ok": True}

    return router


# ---------------- Attention-feed integration ----------------
#
# Called from command_centre.py to add expiring credentials to the feed.
async def collect_compliance_attention(db, user_id: str, now: datetime, limit: int = 20) -> list:
    """Return attention-feed items for compliance records expiring within 60 days
    or already expired. Each item follows the Command Centre schema.
    """
    items = []
    rows = await db.compliance_items.find({
        "userId": user_id,
        "isDeleted": {"$ne": True},
        "expiryDate": {"$nin": [None, ""]},
    }).to_list(1000)
    for r in rows:
        exp_iso = r.get("expiryDate")
        if not exp_iso:
            continue
        try:
            exp_dt = datetime.fromisoformat(exp_iso + "T00:00:00+00:00")
        except Exception:
            continue
        days = (exp_dt.date() - now.date()).days
        if days > 60:
            continue
        severity = "urgent" if days < 0 else ("urgent" if days <= 14 else "warning")
        prefix = "Expired" if days < 0 else f"Expires in {days} day{'' if days == 1 else 's'}"
        items.append({
            "id": f"compliance-{r.get('id')}",
            "kind": "compliance_expiring",
            "title": f"{r.get('type', '')}: {r.get('name', '')}".strip().strip(":"),
            "subtitle": f"{prefix} · {r.get('category', 'other').title()}",
            "projectId": None,
            "projectName": None,
            "actionLabel": "Open Compliance Hub",
            "actionRoute": f"/app/compliance?open={r.get('id')}" if r.get("id") else "/app/compliance",
            "severity": severity,
            "dueAt": exp_iso,
        })
    items.sort(key=lambda x: x["dueAt"] or "9999")
    return items[:limit]
