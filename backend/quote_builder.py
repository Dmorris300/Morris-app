"""Morris — Quote Builder V2 (flagship estimating & quotation system).

Endpoints:
  • GET  /api/quote-builder/reference
  • GET  /api/quote-builder/quotes
  • POST /api/quote-builder/quotes
  • PATCH /api/quote-builder/quotes/{id}
  • DELETE /api/quote-builder/quotes/{id}
  • GET  /api/quote-builder/clients
  • POST /api/quote-builder/clients
  • DELETE /api/quote-builder/clients/{id}
  • GET  /api/quote-builder/templates
  • POST /api/quote-builder/templates
  • DELETE /api/quote-builder/templates/{id}
  • GET  /api/quote-builder/stats

`collect_quote_builder_attention` surfaces quotes that are expiring soon or
have been sent but sat idle for more than 7 days.
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel


LINE_CATEGORIES = ["Labour", "Materials", "Plant & Equipment", "Subcontractor", "Other"]
STATUSES = ["Draft", "Sent", "Accepted", "Rejected", "Expired"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _totals(body: dict) -> dict:
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
    prov_total = sum(float(p.get("amount") or 0) for p in (body.get("provisionalSums") or []))
    prov_total = round(prov_total, 2)
    disc = body.get("discount") or {}
    d_val = float(disc.get("value") or 0)
    d_type = disc.get("type") or "percent"
    discount_amount = round(subtotal * d_val / 100, 2) if d_type == "percent" else round(d_val, 2)
    net = round(max(0, subtotal - discount_amount + prov_total), 2)
    vat_rate = float(body.get("vatRate") if body.get("vatRate") is not None else 20)
    vat_amount = round(net * vat_rate / 100, 2)
    total = round(net + vat_amount, 2)
    return {
        "subtotal": subtotal, "byCategory": by_cat, "provisionalSumTotal": prov_total,
        "discountAmount": discount_amount, "net": net, "vatAmount": vat_amount, "total": total,
    }


class QuoteIn(BaseModel):
    # Client
    clientId: Optional[str] = ""
    clientName: Optional[str] = ""
    clientCompany: Optional[str] = ""
    clientEmail: Optional[str] = ""
    clientPhone: Optional[str] = ""
    clientAddress: Optional[str] = ""

    # Project
    projectId: Optional[str] = ""
    projectName: Optional[str] = ""
    projectAddress: Optional[str] = ""
    projectDescription: Optional[str] = ""
    projectDuration: Optional[str] = ""
    startDate: Optional[str] = ""

    # Quote meta
    quoteRef: Optional[str] = ""
    quoteDate: Optional[str] = ""
    validUntil: Optional[str] = ""
    status: Optional[str] = "Draft"

    # Content
    scopeOfWorks: Optional[str] = ""
    lineItems: Optional[List[Dict[str, Any]]] = []
    exclusions: Optional[str] = ""
    assumptions: Optional[str] = ""
    provisionalSums: Optional[List[Dict[str, Any]]] = []
    stagePayments: Optional[List[Dict[str, Any]]] = []

    # Pricing meta
    discount: Optional[Dict[str, Any]] = {}   # {type: "percent"|"fixed", value}
    vatRate: Optional[float] = 20
    paymentTerms: Optional[str] = "Payment due 14 days from invoice"

    # Sign-off
    notes: Optional[str] = ""
    preparedBy: Optional[str] = ""
    preparedSignature: Optional[str] = ""
    clientAcceptanceName: Optional[str] = ""
    clientAcceptanceSignature: Optional[str] = ""
    acceptedDate: Optional[str] = ""

    isFavourite: Optional[bool] = False


class QuoteUpdate(BaseModel):
    clientId: Optional[str] = None
    clientName: Optional[str] = None
    clientCompany: Optional[str] = None
    clientEmail: Optional[str] = None
    clientPhone: Optional[str] = None
    clientAddress: Optional[str] = None
    projectId: Optional[str] = None
    projectName: Optional[str] = None
    projectAddress: Optional[str] = None
    projectDescription: Optional[str] = None
    projectDuration: Optional[str] = None
    startDate: Optional[str] = None
    quoteRef: Optional[str] = None
    quoteDate: Optional[str] = None
    validUntil: Optional[str] = None
    status: Optional[str] = None
    scopeOfWorks: Optional[str] = None
    lineItems: Optional[List[Dict[str, Any]]] = None
    exclusions: Optional[str] = None
    assumptions: Optional[str] = None
    provisionalSums: Optional[List[Dict[str, Any]]] = None
    stagePayments: Optional[List[Dict[str, Any]]] = None
    discount: Optional[Dict[str, Any]] = None
    vatRate: Optional[float] = None
    paymentTerms: Optional[str] = None
    notes: Optional[str] = None
    preparedBy: Optional[str] = None
    preparedSignature: Optional[str] = None
    clientAcceptanceName: Optional[str] = None
    clientAcceptanceSignature: Optional[str] = None
    acceptedDate: Optional[str] = None
    isFavourite: Optional[bool] = None


class ClientIn(BaseModel):
    name: str
    company: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""


class TemplateIn(BaseModel):
    name: str
    payload: Dict[str, Any]


def build_router(db, get_user):
    router = APIRouter(prefix="/api/quote-builder", tags=["quote-builder"])

    def _shape(doc: dict) -> dict:
        d = dict(doc); d.pop("_id", None); return d

    def _finalise(doc: dict) -> dict:
        doc["totals"] = _totals(doc)
        return doc

    @router.get("/reference")
    async def reference():
        return {"lineCategories": LINE_CATEGORIES, "statuses": STATUSES,
                "units": ["item", "hour", "day", "week", "m", "m²", "m³", "tonne", "kg", "each", "set", "load"]}

    @router.get("/quotes")
    async def list_quotes(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.quotes.find({"userId": user["id"], "isDeleted": {"$ne": True}}).sort("updatedAt", -1).to_list(1000)
        return [_shape(r) for r in rows]

    @router.post("/quotes")
    async def create_quote(body: QuoteIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not (body.clientName or "").strip() and not (body.clientCompany or "").strip():
            raise HTTPException(status_code=400, detail="Client name or company is required")
        doc = body.model_dump()
        _finalise(doc)
        doc.update({
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "toolId": "quote-builder",
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "isDeleted": False,
        })
        if not doc.get("quoteRef"):
            doc["quoteRef"] = f"Q-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{doc['id'][:6].upper()}"
        if not doc.get("quoteDate"):
            doc["quoteDate"] = datetime.now(timezone.utc).date().isoformat()
        await db.quotes.insert_one(doc)
        return _shape(doc)

    @router.patch("/quotes/{qid}")
    async def update_quote(qid: str, body: QuoteUpdate, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.quotes.find_one({"id": qid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        # Recompute totals if any pricing input changed
        pricing_keys = {"lineItems", "provisionalSums", "discount", "vatRate"}
        if pricing_keys & set(updates.keys()):
            merged = {**existing, **updates}
            updates["totals"] = _totals(merged)
            if "lineItems" in updates:
                updates["lineItems"] = merged["lineItems"]  # carry back computed lineTotal
        updates["updatedAt"] = _now_iso()
        await db.quotes.update_one({"id": qid}, {"$set": updates})
        fresh = await db.quotes.find_one({"id": qid})
        return _shape(fresh)

    @router.delete("/quotes/{qid}")
    async def delete_quote(qid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.quotes.find_one({"id": qid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.quotes.update_one({"id": qid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    # ---- Client library ----
    @router.get("/clients")
    async def list_clients(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.quote_clients.find({"userId": user["id"], "isDeleted": {"$ne": True}}).sort("name", 1).to_list(500)
        return [_shape(r) for r in rows]

    @router.post("/clients")
    async def create_client(body: ClientIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not body.name.strip():
            raise HTTPException(status_code=400, detail="Client name is required")
        doc = body.model_dump()
        doc.update({"id": str(uuid.uuid4()), "userId": user["id"], "createdAt": _now_iso(), "updatedAt": _now_iso(), "isDeleted": False})
        await db.quote_clients.insert_one(doc)
        return _shape(doc)

    @router.delete("/clients/{cid}")
    async def delete_client(cid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.quote_clients.find_one({"id": cid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.quote_clients.update_one({"id": cid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    # ---- Templates ----
    @router.get("/templates")
    async def list_templates(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.quote_templates.find({"userId": user["id"], "isDeleted": {"$ne": True}}).sort("updatedAt", -1).to_list(500)
        return [_shape(r) for r in rows]

    @router.post("/templates")
    async def create_template(body: TemplateIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not body.name.strip():
            raise HTTPException(status_code=400, detail="Template name required")
        doc = {"id": str(uuid.uuid4()), "userId": user["id"], "name": body.name.strip(),
               "payload": body.payload or {}, "createdAt": _now_iso(), "updatedAt": _now_iso(), "isDeleted": False}
        await db.quote_templates.insert_one(doc)
        return _shape(doc)

    @router.delete("/templates/{tid}")
    async def delete_template(tid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.quote_templates.find_one({"id": tid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.quote_templates.update_one({"id": tid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    @router.get("/stats")
    async def stats(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.quotes.find({"userId": user["id"], "isDeleted": {"$ne": True}}).to_list(2000)
        today = datetime.now(timezone.utc).date().isoformat()
        counts = {"Draft": 0, "Sent": 0, "Accepted": 0, "Rejected": 0, "Expired": 0}
        pipeline_value = 0.0
        accepted_value = 0.0
        expiring_soon = 0
        recent = []
        for r in rows:
            st = r.get("status") or "Draft"
            # Auto-expire based on validUntil
            vu = r.get("validUntil") or ""
            if st == "Sent" and vu and vu < today:
                st = "Expired"
            counts[st] = counts.get(st, 0) + 1
            total = float(((r.get("totals") or {}).get("total")) or 0)
            if st in ("Draft", "Sent"):
                pipeline_value += total
            if st == "Accepted":
                accepted_value += total
            if st == "Sent" and vu:
                days = (datetime.fromisoformat(vu).date() - datetime.now(timezone.utc).date()).days
                if 0 <= days <= 7:
                    expiring_soon += 1
            recent.append({
                "id": r.get("id"), "quoteRef": r.get("quoteRef"),
                "clientName": r.get("clientName") or r.get("clientCompany"),
                "projectName": r.get("projectName"),
                "status": st, "total": total,
                "validUntil": vu, "updatedAt": r.get("updatedAt"),
            })
        recent.sort(key=lambda x: x.get("updatedAt") or "", reverse=True)
        return {
            "total": len(rows),
            "draft": counts["Draft"], "sent": counts["Sent"],
            "accepted": counts["Accepted"], "rejected": counts["Rejected"], "expired": counts["Expired"],
            "pipelineValue": round(pipeline_value, 2),
            "acceptedValue": round(accepted_value, 2),
            "expiringSoon": expiring_soon,
            "recent": recent[:10],
        }

    return router


async def collect_quote_builder_attention(db, user_id: str, now: datetime, limit: int = 15) -> list:
    """Attention items:
      • Quote sent > 7 days ago with no update
      • Quote expiring within 7 days
    """
    items: List[Dict[str, Any]] = []
    today = now.date()
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    rows = await db.quotes.find({"userId": user_id, "isDeleted": {"$ne": True}, "status": "Sent"}).to_list(500)
    for r in rows:
        qid = r.get("id")
        vu = r.get("validUntil") or ""
        client = r.get("clientName") or r.get("clientCompany") or "client"
        total = float(((r.get("totals") or {}).get("total")) or 0)
        # Expiring soon
        try:
            if vu:
                days = (datetime.fromisoformat(vu).date() - today).days
                if 0 <= days <= 7:
                    items.append({
                        "id": f"quote-expiring-{qid}",
                        "kind": "quote_expiring",
                        "title": f"Quote expiring in {days} day{'s' if days != 1 else ''}",
                        "subtitle": f"{client} · £{total:,.2f}",
                        "projectId": r.get("projectId"),
                        "projectName": r.get("projectName"),
                        "actionLabel": "Open quote",
                        "actionRoute": f"/app/quote-builder?open={qid}",
                        "severity": "warning",
                        "dueAt": vu,
                    })
                elif days < 0:
                    items.append({
                        "id": f"quote-expired-{qid}",
                        "kind": "quote_expired",
                        "title": "Quote expired",
                        "subtitle": f"{client} · £{total:,.2f}",
                        "projectId": r.get("projectId"),
                        "projectName": r.get("projectName"),
                        "actionLabel": "Reissue quote",
                        "actionRoute": f"/app/quote-builder?open={qid}",
                        "severity": "danger",
                        "dueAt": vu,
                    })
        except Exception:
            pass
        # Sent > 7 days
        if (r.get("updatedAt") or "") < seven_days_ago:
            items.append({
                "id": f"quote-stale-{qid}",
                "kind": "quote_stale",
                "title": "Quote sent 7+ days ago — chase up?",
                "subtitle": f"{client} · £{total:,.2f}",
                "projectId": r.get("projectId"),
                "projectName": r.get("projectName"),
                "actionLabel": "Follow up",
                "actionRoute": f"/app/quote-builder?open={qid}",
                "severity": "info",
                "dueAt": r.get("updatedAt"),
            })
    return items[:limit]
