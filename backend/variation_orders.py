"""Morris — Variation Orders V2 (flagship variation management system).

Protects contractors by giving them a complete audit trail from instruction
through valuation to client approval. Approved variations automatically roll
up into the linked project's commercial value.

Endpoints (all prefixed /api/variation-orders):
  • GET  /reference                             — dropdown options + status list
  • GET  /variation-orders                      — list with search/status/project filters
  • POST /variation-orders                      — create
  • GET  /variation-orders/{id}                 — read one
  • PATCH /variation-orders/{id}                — update (recomputes totals)
  • DELETE /variation-orders/{id}               — soft delete
  • GET  /stats                                 — dashboard KPIs + status counts
  • GET  /project/{jobId}/summary               — approved value + counts by status
  • GET  /templates                             — variation templates
  • POST /templates                             — save template
  • DELETE /templates/{id}                      — delete template

`collect_variation_orders_attention` surfaces variations that are:
  • Submitted for > 7 days with no client response
  • In Progress but idle > 30 days
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel


STATUSES = ["Draft", "Submitted", "Approved", "Rejected", "In Progress"]
REASONS = [
    "Client Request", "Unforeseen Site Condition", "Design Error",
    "Scope Change", "Material Substitution", "Instruction on Site",
    "Access / Sequence Change", "Other",
]
INSTRUCTION_METHODS = ["Verbal", "Written", "Email", "Site Instruction", "WhatsApp", "Text message", "Drawing revision", "Other"]
COST_CATEGORIES = ["Labour", "Materials", "Plant & Equipment", "Subcontractor", "Preliminaries", "Other"]
IMPACT_KIND = ["No impact", "Additional days", "Reduction in days", "Sequence only"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _totals(body: dict) -> dict:
    """Recompute cost roll-up from lineItems. Every entry rolls into byCategory
    plus subtotal, then optional VAT."""
    items = body.get("lineItems") or []
    subtotal = 0.0
    by_cat: Dict[str, float] = {}
    for it in items:
        qty = float(it.get("qty") or 0)
        price = float(it.get("unitPrice") or 0)
        line = round(qty * price, 2)
        it["lineTotal"] = line
        cat = it.get("category") or "Other"
        by_cat[cat] = round(by_cat.get(cat, 0) + line, 2)
        subtotal += line
    subtotal = round(subtotal, 2)
    add_vat = bool(body.get("addVat"))
    vat_rate = float(body.get("vatRate") if body.get("vatRate") is not None else 20)
    vat_amount = round(subtotal * vat_rate / 100, 2) if add_vat else 0.0
    total = round(subtotal + vat_amount, 2)
    return {
        "subtotal": subtotal,
        "byCategory": by_cat,
        "vatAmount": vat_amount,
        "vatRate": vat_rate if add_vat else 0,
        "total": total,
    }


class VariationIn(BaseModel):
    # Project link
    projectId: Optional[str] = ""
    projectName: Optional[str] = ""
    projectAddress: Optional[str] = ""
    clientName: Optional[str] = ""
    clientCompany: Optional[str] = ""
    clientEmail: Optional[str] = ""
    clientPhone: Optional[str] = ""

    # Original quote/contract link (optional)
    originalQuoteId: Optional[str] = ""
    originalQuoteRef: Optional[str] = ""
    originalContractRef: Optional[str] = ""
    originalContractDate: Optional[str] = ""

    # Variation meta
    variationRef: Optional[str] = ""
    variationDate: Optional[str] = ""
    status: Optional[str] = "Draft"
    reason: Optional[str] = ""
    instructionMethod: Optional[str] = ""
    instructorName: Optional[str] = ""
    instructorRole: Optional[str] = ""
    instructionDate: Optional[str] = ""
    instructionLocation: Optional[str] = ""

    # Content
    scopeSummary: Optional[str] = ""
    descriptionOfChange: Optional[str] = ""
    reasonNarrative: Optional[str] = ""
    referenceDocs: Optional[str] = ""

    # Cost breakdown
    lineItems: Optional[List[Dict[str, Any]]] = []
    addVat: Optional[bool] = False
    vatRate: Optional[float] = 20

    # Programme impact
    programmeImpact: Optional[Dict[str, Any]] = {}
    # e.g. { kind: "Additional days", days: 3, newPCDate: "2026-05-12", notes: "..." }

    # Evidence
    photoIds: Optional[List[str]] = []
    supportingDocs: Optional[List[Dict[str, Any]]] = []
    # e.g. [{ id, name, url }]

    # Approval / sign-off
    preparedBy: Optional[str] = ""
    preparedSignature: Optional[str] = ""
    clientApproverName: Optional[str] = ""
    clientApproverSignature: Optional[str] = ""
    approvedDate: Optional[str] = ""
    rejectionReason: Optional[str] = ""

    # Terms
    paymentTerms: Optional[str] = "Payment for this variation will be included in the next Application for Payment."
    notes: Optional[str] = ""

    isFavourite: Optional[bool] = False


class VariationUpdate(BaseModel):
    projectId: Optional[str] = None
    projectName: Optional[str] = None
    projectAddress: Optional[str] = None
    clientName: Optional[str] = None
    clientCompany: Optional[str] = None
    clientEmail: Optional[str] = None
    clientPhone: Optional[str] = None
    originalQuoteId: Optional[str] = None
    originalQuoteRef: Optional[str] = None
    originalContractRef: Optional[str] = None
    originalContractDate: Optional[str] = None
    variationRef: Optional[str] = None
    variationDate: Optional[str] = None
    status: Optional[str] = None
    reason: Optional[str] = None
    instructionMethod: Optional[str] = None
    instructorName: Optional[str] = None
    instructorRole: Optional[str] = None
    instructionDate: Optional[str] = None
    instructionLocation: Optional[str] = None
    scopeSummary: Optional[str] = None
    descriptionOfChange: Optional[str] = None
    reasonNarrative: Optional[str] = None
    referenceDocs: Optional[str] = None
    lineItems: Optional[List[Dict[str, Any]]] = None
    addVat: Optional[bool] = None
    vatRate: Optional[float] = None
    programmeImpact: Optional[Dict[str, Any]] = None
    photoIds: Optional[List[str]] = None
    supportingDocs: Optional[List[Dict[str, Any]]] = None
    preparedBy: Optional[str] = None
    preparedSignature: Optional[str] = None
    clientApproverName: Optional[str] = None
    clientApproverSignature: Optional[str] = None
    approvedDate: Optional[str] = None
    rejectionReason: Optional[str] = None
    paymentTerms: Optional[str] = None
    notes: Optional[str] = None
    isFavourite: Optional[bool] = None


class TemplateIn(BaseModel):
    name: str
    payload: Dict[str, Any]


def build_router(db, get_user):
    router = APIRouter(prefix="/api/variation-orders", tags=["variation-orders"])

    def _shape(doc: dict) -> dict:
        d = dict(doc); d.pop("_id", None); return d

    async def _seq_ref(user: dict) -> str:
        """Sequential per-user VO reference — VO-<seq:03d>."""
        res = await db.users.find_one_and_update(
            {"id": user["id"]},
            {"$inc": {"variationCounter": 1}},
            return_document=True,
        )
        seq = (res or {}).get("variationCounter", 1)
        return f"VO-{seq:03d}"

    @router.get("/reference")
    async def reference():
        return {
            "statuses": STATUSES,
            "reasons": REASONS,
            "instructionMethods": INSTRUCTION_METHODS,
            "costCategories": COST_CATEGORIES,
            "impactKinds": IMPACT_KIND,
            "units": ["item", "hour", "day", "week", "m", "m²", "m³", "tonne", "kg", "each", "set", "load"],
        }

    @router.get("/variation-orders")
    async def list_variations(
        projectId: Optional[str] = None,
        status: Optional[str] = None,
        q: Optional[str] = None,
        authorization: Optional[str] = Header(None),
    ):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        query: Dict[str, Any] = {"userId": user["id"], "isDeleted": {"$ne": True}}
        if projectId:
            query["projectId"] = projectId
        if status:
            query["status"] = status
        rows = await db.variation_orders.find(query).sort("updatedAt", -1).to_list(1000)
        if q:
            needle = q.lower()
            def _hay(r):
                return " ".join(str(r.get(k, "") or "") for k in (
                    "variationRef", "projectName", "clientName", "clientCompany",
                    "descriptionOfChange", "reason",
                )).lower()
            rows = [r for r in rows if needle in _hay(r)]
        return [_shape(r) for r in rows]

    @router.post("/variation-orders")
    async def create_variation(body: VariationIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not (body.projectName or "").strip() and not (body.projectId or "").strip():
            raise HTTPException(status_code=400, detail="Project is required")
        doc = body.model_dump()
        doc["totals"] = _totals(doc)
        doc.update({
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "toolId": "variation-orders",
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "isDeleted": False,
        })
        if not doc.get("variationRef"):
            doc["variationRef"] = await _seq_ref(user)
        if not doc.get("variationDate"):
            doc["variationDate"] = datetime.now(timezone.utc).date().isoformat()
        await db.variation_orders.insert_one(doc)
        return _shape(doc)

    @router.get("/variation-orders/{vid}")
    async def get_variation(vid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.variation_orders.find_one({"id": vid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        return _shape(row)

    @router.patch("/variation-orders/{vid}")
    async def update_variation(vid: str, body: VariationUpdate, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.variation_orders.find_one({"id": vid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        pricing_keys = {"lineItems", "addVat", "vatRate"}
        if pricing_keys & set(updates.keys()):
            merged = {**existing, **updates}
            updates["totals"] = _totals(merged)
            if "lineItems" in updates:
                updates["lineItems"] = merged["lineItems"]
        # If moving to Approved and no approvedDate given, stamp today
        if updates.get("status") == "Approved" and not (existing.get("approvedDate") or updates.get("approvedDate")):
            updates["approvedDate"] = datetime.now(timezone.utc).date().isoformat()
        updates["updatedAt"] = _now_iso()
        await db.variation_orders.update_one({"id": vid}, {"$set": updates})
        fresh = await db.variation_orders.find_one({"id": vid})
        return _shape(fresh)

    @router.delete("/variation-orders/{vid}")
    async def delete_variation(vid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.variation_orders.find_one({"id": vid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.variation_orders.update_one({"id": vid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    # ---- Stats (dashboard) ----
    @router.get("/stats")
    async def stats(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.variation_orders.find({"userId": user["id"], "isDeleted": {"$ne": True}}).to_list(2000)
        counts = {s: 0 for s in STATUSES}
        approved_value = 0.0
        submitted_value = 0.0
        approved_days = 0.0
        recent: List[Dict[str, Any]] = []
        for r in rows:
            st = r.get("status") or "Draft"
            counts[st] = counts.get(st, 0) + 1
            total = float(((r.get("totals") or {}).get("total")) or 0)
            if st == "Approved":
                approved_value += total
                impact = r.get("programmeImpact") or {}
                if (impact.get("kind") or "") == "Additional days":
                    try:
                        approved_days += float(impact.get("days") or 0)
                    except (ValueError, TypeError):
                        pass
            if st in ("Submitted", "In Progress"):
                submitted_value += total
            recent.append({
                "id": r.get("id"),
                "variationRef": r.get("variationRef"),
                "projectName": r.get("projectName"),
                "clientName": r.get("clientName") or r.get("clientCompany"),
                "status": st,
                "total": total,
                "updatedAt": r.get("updatedAt"),
            })
        recent.sort(key=lambda x: x.get("updatedAt") or "", reverse=True)
        return {
            "total": len(rows),
            "draft": counts.get("Draft", 0),
            "submitted": counts.get("Submitted", 0),
            "approved": counts.get("Approved", 0),
            "rejected": counts.get("Rejected", 0),
            "inProgress": counts.get("In Progress", 0),
            "approvedValue": round(approved_value, 2),
            "submittedValue": round(submitted_value, 2),
            "approvedDays": approved_days,
            "recent": recent[:10],
        }

    # ---- Project summary (drives contractValue + approved variations roll-up) ----
    @router.get("/project/{job_id}/summary")
    async def project_summary(job_id: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.variation_orders.find({
            "userId": user["id"], "projectId": job_id, "isDeleted": {"$ne": True},
        }).to_list(500)
        counts = {s: 0 for s in STATUSES}
        approved_value = 0.0
        submitted_value = 0.0
        approved_days = 0.0
        for r in rows:
            st = r.get("status") or "Draft"
            counts[st] = counts.get(st, 0) + 1
            total = float(((r.get("totals") or {}).get("total")) or 0)
            if st == "Approved":
                approved_value += total
                impact = r.get("programmeImpact") or {}
                if (impact.get("kind") or "") == "Additional days":
                    try:
                        approved_days += float(impact.get("days") or 0)
                    except (ValueError, TypeError):
                        pass
            elif st in ("Submitted", "In Progress"):
                submitted_value += total
        job = await db.jobs.find_one({"id": job_id, "userId": user["id"]}) or {}
        original = float(job.get("contractValue") or 0)
        return {
            "projectId": job_id,
            "counts": counts,
            "totalVariations": len(rows),
            "approvedValue": round(approved_value, 2),
            "submittedValue": round(submitted_value, 2),
            "approvedDays": approved_days,
            "originalContractValue": round(original, 2),
            "revisedContractValue": round(original + approved_value, 2),
        }

    # ---- Templates ----
    @router.get("/templates")
    async def list_templates(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.variation_templates.find({"userId": user["id"], "isDeleted": {"$ne": True}}).sort("updatedAt", -1).to_list(500)
        return [_shape(r) for r in rows]

    @router.post("/templates")
    async def create_template(body: TemplateIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not body.name.strip():
            raise HTTPException(status_code=400, detail="Template name required")
        doc = {
            "id": str(uuid.uuid4()), "userId": user["id"], "name": body.name.strip(),
            "payload": body.payload or {},
            "createdAt": _now_iso(), "updatedAt": _now_iso(), "isDeleted": False,
        }
        await db.variation_templates.insert_one(doc)
        return _shape(doc)

    @router.delete("/templates/{tid}")
    async def delete_template(tid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.variation_templates.find_one({"id": tid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.variation_templates.update_one({"id": tid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    return router


async def collect_variation_orders_attention(db, user_id: str, now: datetime, limit: int = 15) -> list:
    """Attention items:
      • Submitted > 7 days ago — no client response
      • In Progress > 30 days without update
    """
    items: List[Dict[str, Any]] = []
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    thirty_days_ago = (now - timedelta(days=30)).isoformat()

    rows = await db.variation_orders.find({
        "userId": user_id, "isDeleted": {"$ne": True},
        "status": {"$in": ["Submitted", "In Progress"]},
    }).to_list(500)
    for r in rows:
        vid = r.get("id")
        ref = r.get("variationRef") or ""
        project = r.get("projectName") or r.get("clientName") or "project"
        total = float(((r.get("totals") or {}).get("total")) or 0)
        updated = r.get("updatedAt") or ""
        status = r.get("status") or ""
        if status == "Submitted" and updated < seven_days_ago:
            items.append({
                "id": f"variation-order-await-{vid}",
                "kind": "variation_awaiting",
                "title": f"Variation {ref} awaiting client approval",
                "subtitle": f"{project} · £{total:,.2f}",
                "projectId": r.get("projectId"),
                "projectName": r.get("projectName"),
                "actionLabel": "Open variation",
                "actionRoute": f"/app/variation-orders?open={vid}",
                "severity": "warning",
                "dueAt": updated,
            })
        elif status == "In Progress" and updated < thirty_days_ago:
            items.append({
                "id": f"variation-order-stale-{vid}",
                "kind": "variation_stale",
                "title": f"Variation {ref} in progress — no update for 30+ days",
                "subtitle": f"{project} · £{total:,.2f}",
                "projectId": r.get("projectId"),
                "projectName": r.get("projectName"),
                "actionLabel": "Review variation",
                "actionRoute": f"/app/variation-orders?open={vid}",
                "severity": "info",
                "dueAt": updated,
            })
    return items[:limit]
