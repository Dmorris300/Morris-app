"""Morris — Invoice Builder V2 (flagship invoicing system).

Complete invoicing workflow with CIS + VAT (incl. reverse charge), payment
tracking, reminders, and full integration with Applications for Payment and
Variation Orders. Paid invoices automatically update the linked project.

Endpoints (all prefixed /api/invoice-builder):
  • GET  /reference                             — dropdowns
  • GET  /invoices                              — list with filter/search
  • POST /invoices                              — create
  • GET  /invoices/{id}                         — read one
  • PATCH /invoices/{id}                        — update (recomputes totals)
  • DELETE /invoices/{id}                       — soft delete
  • POST /invoices/{id}/status                  — status change (Draft/Sent/Paid/Part Paid/Cancelled)
  • POST /invoices/{id}/payment                 — record a payment (part-pay supported)
  • POST /invoices/{id}/remind                  — mark last-reminded timestamp
  • GET  /stats                                 — dashboard KPIs
  • GET  /from-application/{aid}                — build a draft invoice from a Certified AFP
  • GET  /from-variation/{vid}                  — build a draft invoice from an Approved variation
  • GET  /templates                             — templates
  • POST /templates                             — create template
  • DELETE /templates/{id}                      — delete template

`collect_invoice_attention` surfaces overdue + due-soon invoices.
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel


STATUSES = ["Draft", "Sent", "Paid", "Part Paid", "Overdue", "Cancelled"]
CATEGORIES = ["Labour", "Materials", "Plant & Equipment", "Preliminaries", "Subcontractor", "Variations", "Application for Payment", "Other"]
VAT_TREATMENTS = ["Standard 20%", "Reduced 5%", "Zero-rated", "Reverse charge (0%)", "Exempt"]
CIS_STATUSES = ["Not applicable", "Gross (0%)", "Standard (20%)", "Higher (30%)"]

LABOUR_CATS = {"Labour", "Subcontractor"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _compute_totals(body: dict) -> dict:
    items = body.get("lineItems") or []
    subtotal = 0.0
    labour = 0.0
    by_cat: Dict[str, float] = {}
    for it in items:
        qty = float(it.get("qty") or 1)
        price = float(it.get("unitPrice") or 0)
        line = round(qty * price, 2)
        it["lineTotal"] = line
        cat = it.get("category") or "Other"
        by_cat[cat] = round(by_cat.get(cat, 0) + line, 2)
        subtotal += line
        if cat in LABOUR_CATS:
            labour += line
    subtotal = round(subtotal, 2)

    discount = float(body.get("discount") or 0)  # absolute £
    subtotal_after_discount = round(subtotal - discount, 2)

    labour_ratio = labour / subtotal if subtotal > 0 else 0.0
    cis_status = body.get("cisStatus") or "Not applicable"
    cis_rate_map = {"Gross (0%)": 0.0, "Standard (20%)": 20.0, "Higher (30%)": 30.0}
    cis_rate = cis_rate_map.get(cis_status, 0.0)
    cis_applicable = round(max(0.0, subtotal_after_discount) * labour_ratio, 2) if cis_status != "Not applicable" else 0.0
    cis_deduction = round(cis_applicable * cis_rate / 100, 2)

    vat_treatment = body.get("vatTreatment") or "Standard 20%"
    vat_rate_map = {"Standard 20%": 20.0, "Reduced 5%": 5.0, "Zero-rated": 0.0, "Reverse charge (0%)": 0.0, "Exempt": 0.0}
    vat_rate = vat_rate_map.get(vat_treatment, 0.0)
    # VAT is applied to the amount after CIS deduction (HMRC guidance: VAT is on the amount actually payable to the sub)
    vat_base = max(0.0, subtotal_after_discount - cis_deduction)
    vat_amount = round(vat_base * vat_rate / 100, 2)

    total_due = round(subtotal_after_discount - cis_deduction + vat_amount, 2)

    return {
        "subtotal": subtotal,
        "byCategory": by_cat,
        "discount": round(discount, 2),
        "subtotalAfterDiscount": subtotal_after_discount,
        "labourValuation": round(labour, 2),
        "labourRatio": round(labour_ratio, 4),
        "cisStatus": cis_status,
        "cisRate": cis_rate,
        "cisApplicable": cis_applicable,
        "cisDeduction": cis_deduction,
        "vatTreatment": vat_treatment,
        "vatRate": vat_rate,
        "vatAmount": vat_amount,
        "totalDue": total_due,
    }


def _is_overdue(row: dict, now: datetime) -> bool:
    if (row.get("status") or "") not in ("Sent", "Part Paid"):
        return False
    due = row.get("dueDate")
    if not due:
        return False
    try:
        return datetime.fromisoformat(due).date() < now.date()
    except ValueError:
        return False


class LineItem(BaseModel):
    id: Optional[str] = None
    category: Optional[str] = "Labour"
    description: Optional[str] = ""
    qty: Optional[float] = 1
    unit: Optional[str] = "item"
    unitPrice: Optional[float] = 0


class InvoiceIn(BaseModel):
    projectId: Optional[str] = ""
    projectName: Optional[str] = ""
    projectAddress: Optional[str] = ""
    clientName: Optional[str] = ""
    clientCompany: Optional[str] = ""
    clientEmail: Optional[str] = ""
    clientPhone: Optional[str] = ""
    clientAddress: Optional[str] = ""
    clientVatNumber: Optional[str] = ""
    clientUtr: Optional[str] = ""
    linkedApplicationId: Optional[str] = ""
    linkedApplicationRef: Optional[str] = ""
    linkedVariationId: Optional[str] = ""
    linkedVariationRef: Optional[str] = ""
    linkedQuoteId: Optional[str] = ""
    linkedQuoteRef: Optional[str] = ""
    invoiceRef: Optional[str] = ""
    invoiceDate: Optional[str] = ""
    dueDate: Optional[str] = ""
    paymentTerms: Optional[str] = "Net 30"
    paymentTermsNote: Optional[str] = "Payment due within 30 days of invoice date. Interest may be charged under the Late Payment of Commercial Debts (Interest) Act 1998."
    poNumber: Optional[str] = ""
    status: Optional[str] = "Draft"
    lineItems: Optional[List[Dict[str, Any]]] = []
    discount: Optional[float] = 0
    cisStatus: Optional[str] = "Not applicable"
    vatTreatment: Optional[str] = "Standard 20%"
    bankName: Optional[str] = ""
    bankAccountName: Optional[str] = ""
    bankAccountNumber: Optional[str] = ""
    bankSortCode: Optional[str] = ""
    bankIban: Optional[str] = ""
    bankReference: Optional[str] = ""
    notes: Optional[str] = ""
    payments: Optional[List[Dict[str, Any]]] = []
    supportingDocs: Optional[List[Dict[str, Any]]] = []
    photoIds: Optional[List[str]] = []
    preparedBy: Optional[str] = ""
    preparedSignature: Optional[str] = ""
    remindedAt: Optional[str] = ""
    remindCount: Optional[int] = 0
    isFavourite: Optional[bool] = False


class InvoiceUpdate(BaseModel):
    projectId: Optional[str] = None
    projectName: Optional[str] = None
    projectAddress: Optional[str] = None
    clientName: Optional[str] = None
    clientCompany: Optional[str] = None
    clientEmail: Optional[str] = None
    clientPhone: Optional[str] = None
    clientAddress: Optional[str] = None
    clientVatNumber: Optional[str] = None
    clientUtr: Optional[str] = None
    linkedApplicationId: Optional[str] = None
    linkedApplicationRef: Optional[str] = None
    linkedVariationId: Optional[str] = None
    linkedVariationRef: Optional[str] = None
    linkedQuoteId: Optional[str] = None
    linkedQuoteRef: Optional[str] = None
    invoiceRef: Optional[str] = None
    invoiceDate: Optional[str] = None
    dueDate: Optional[str] = None
    paymentTerms: Optional[str] = None
    paymentTermsNote: Optional[str] = None
    poNumber: Optional[str] = None
    status: Optional[str] = None
    lineItems: Optional[List[Dict[str, Any]]] = None
    discount: Optional[float] = None
    cisStatus: Optional[str] = None
    vatTreatment: Optional[str] = None
    bankName: Optional[str] = None
    bankAccountName: Optional[str] = None
    bankAccountNumber: Optional[str] = None
    bankSortCode: Optional[str] = None
    bankIban: Optional[str] = None
    bankReference: Optional[str] = None
    notes: Optional[str] = None
    supportingDocs: Optional[List[Dict[str, Any]]] = None
    photoIds: Optional[List[str]] = None
    preparedBy: Optional[str] = None
    preparedSignature: Optional[str] = None
    isFavourite: Optional[bool] = None


class StatusChange(BaseModel):
    status: str


class PaymentIn(BaseModel):
    amount: float
    date: Optional[str] = ""
    method: Optional[str] = ""
    reference: Optional[str] = ""
    note: Optional[str] = ""


class TemplateIn(BaseModel):
    name: str
    payload: Dict[str, Any]


def build_router(db, get_user):
    router = APIRouter(prefix="/api/invoice-builder", tags=["invoice-builder"])

    def _shape(doc: dict) -> dict:
        d = dict(doc); d.pop("_id", None); return d

    async def _seq_ref(user: dict) -> str:
        """Sequential INV-YYYY-NNNN reference per user."""
        year = datetime.now(timezone.utc).year
        res = await db.users.find_one_and_update(
            {"id": user["id"]}, {"$inc": {"invoiceCounter": 1}}, return_document=True,
        )
        seq = (res or {}).get("invoiceCounter", 1)
        return f"INV-{year}-{seq:04d}"

    def _paid_total(row: dict) -> float:
        return round(sum(float(p.get("amount") or 0) for p in (row.get("payments") or [])), 2)

    def _resolve_status(row: dict, now: datetime) -> str:
        st = row.get("status") or "Draft"
        if st in ("Draft", "Cancelled"):
            return st
        paid = _paid_total(row)
        total = float(((row.get("totals") or {}).get("totalDue")) or 0)
        if total > 0 and paid + 0.005 >= total:
            return "Paid"
        if paid > 0.005:
            # Part paid, may still be overdue
            if _is_overdue(row, now):
                return "Overdue"
            return "Part Paid"
        # nothing paid
        if _is_overdue(row, now):
            return "Overdue"
        return st  # Sent

    @router.get("/reference")
    async def reference():
        return {
            "statuses": STATUSES,
            "categories": CATEGORIES,
            "vatTreatments": VAT_TREATMENTS,
            "cisStatuses": CIS_STATUSES,
            "paymentTerms": ["Net 7", "Net 14", "Net 30", "Net 45", "Net 60", "Due on receipt", "Custom"],
            "units": ["item", "hour", "day", "week", "m", "m²", "m³", "tonne", "kg", "each", "set", "load"],
        }

    @router.get("/invoices")
    async def list_invoices(
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
        rows = await db.invoices.find(query).sort("updatedAt", -1).to_list(1000)
        now = datetime.now(timezone.utc)
        out = []
        for r in rows:
            s = _shape(r)
            live_status = _resolve_status(r, now)
            s["status"] = live_status
            s["paidTotal"] = _paid_total(r)
            s["balance"] = round(float(((r.get("totals") or {}).get("totalDue")) or 0) - s["paidTotal"], 2)
            s["isOverdue"] = live_status == "Overdue"
            if status and status != live_status:
                continue
            if q:
                needle = q.lower()
                hay = " ".join(str(s.get(k, "") or "") for k in ("invoiceRef", "projectName", "clientName", "clientCompany", "notes", "poNumber")).lower()
                if needle not in hay:
                    continue
            out.append(s)
        return out

    @router.post("/invoices")
    async def create_invoice(body: InvoiceIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not (body.projectName or "").strip() and not (body.projectId or "").strip() and not (body.clientCompany or "").strip() and not (body.clientName or "").strip():
            raise HTTPException(status_code=400, detail="Project or client is required")
        doc = body.model_dump()
        doc["totals"] = _compute_totals(doc)
        doc.update({
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "toolId": "invoice-builder",
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "isDeleted": False,
        })
        if not doc.get("invoiceRef"):
            doc["invoiceRef"] = await _seq_ref(user)
        if not doc.get("invoiceDate"):
            doc["invoiceDate"] = datetime.now(timezone.utc).date().isoformat()
        # Auto-fill due date from paymentTerms if not provided
        if not doc.get("dueDate") and doc.get("paymentTerms"):
            days_map = {"Net 7": 7, "Net 14": 14, "Net 30": 30, "Net 45": 45, "Net 60": 60, "Due on receipt": 0}
            days = days_map.get(doc["paymentTerms"])
            if days is not None:
                base = datetime.fromisoformat(doc["invoiceDate"]).date()
                doc["dueDate"] = (base + timedelta(days=days)).isoformat()
        await db.invoices.insert_one(doc)
        return _shape(doc)

    @router.get("/invoices/{iid}")
    async def get_invoice(iid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.invoices.find_one({"id": iid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        return _shape(row)

    @router.patch("/invoices/{iid}")
    async def update_invoice(iid: str, body: InvoiceUpdate, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.invoices.find_one({"id": iid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        pricing_keys = {"lineItems", "discount", "cisStatus", "vatTreatment"}
        if pricing_keys & set(updates.keys()):
            merged = {**existing, **updates}
            updates["totals"] = _compute_totals(merged)
            if "lineItems" in updates:
                updates["lineItems"] = merged["lineItems"]
        updates["updatedAt"] = _now_iso()
        await db.invoices.update_one({"id": iid}, {"$set": updates})
        fresh = await db.invoices.find_one({"id": iid})
        return _shape(fresh)

    @router.delete("/invoices/{iid}")
    async def delete_invoice(iid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.invoices.find_one({"id": iid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.invoices.update_one({"id": iid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    @router.post("/invoices/{iid}/status")
    async def change_status(iid: str, body: StatusChange, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.invoices.find_one({"id": iid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        if body.status not in STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        upd: Dict[str, Any] = {"status": body.status, "updatedAt": _now_iso()}
        if body.status == "Sent" and not row.get("sentAt"):
            upd["sentAt"] = _now_iso()
        if body.status == "Cancelled":
            upd["cancelledAt"] = _now_iso()
        await db.invoices.update_one({"id": iid}, {"$set": upd})
        fresh = await db.invoices.find_one({"id": iid})
        return _shape(fresh)

    @router.post("/invoices/{iid}/payment")
    async def record_payment(iid: str, body: PaymentIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.invoices.find_one({"id": iid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        if body.amount <= 0:
            raise HTTPException(status_code=400, detail="Payment amount must be > 0")
        payment = {
            "id": str(uuid.uuid4()),
            "amount": round(float(body.amount), 2),
            "date": body.date or datetime.now(timezone.utc).date().isoformat(),
            "method": body.method or "",
            "reference": body.reference or "",
            "note": body.note or "",
            "recordedAt": _now_iso(),
        }
        payments = (row.get("payments") or []) + [payment]
        paid = round(sum(float(p.get("amount") or 0) for p in payments), 2)
        total = float(((row.get("totals") or {}).get("totalDue")) or 0)
        new_status = "Paid" if total > 0 and paid + 0.005 >= total else ("Part Paid" if paid > 0.005 else row.get("status") or "Sent")
        upd = {"payments": payments, "updatedAt": _now_iso(), "status": new_status}
        if new_status == "Paid":
            upd["paidAt"] = _now_iso()
        await db.invoices.update_one({"id": iid}, {"$set": upd})
        # Auto-update the linked project's amountPaid
        if row.get("projectId"):
            try:
                await db.jobs.update_one(
                    {"id": row["projectId"], "userId": user["id"]},
                    {"$inc": {"amountPaid": float(body.amount)}, "$set": {"updatedAt": _now_iso()}},
                )
            except Exception:
                pass
        fresh = await db.invoices.find_one({"id": iid})
        return _shape(fresh)

    @router.post("/invoices/{iid}/remind")
    async def mark_reminded(iid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.invoices.find_one({"id": iid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        upd = {
            "remindedAt": _now_iso(),
            "remindCount": int(row.get("remindCount") or 0) + 1,
            "updatedAt": _now_iso(),
        }
        await db.invoices.update_one({"id": iid}, {"$set": upd})
        fresh = await db.invoices.find_one({"id": iid})
        return _shape(fresh)

    @router.get("/stats")
    async def stats(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.invoices.find({"userId": user["id"], "isDeleted": {"$ne": True}}).to_list(2000)
        now = datetime.now(timezone.utc)
        counts = {s: 0 for s in STATUSES}
        outstanding_value = 0.0
        overdue_value = 0.0
        paid_value = 0.0
        billed_value = 0.0
        recent: List[Dict[str, Any]] = []
        for r in rows:
            live_status = _resolve_status(r, now)
            counts[live_status] = counts.get(live_status, 0) + 1
            total = float(((r.get("totals") or {}).get("totalDue")) or 0)
            paid = _paid_total(r)
            balance = round(total - paid, 2)
            billed_value += total
            paid_value += paid
            if live_status in ("Sent", "Part Paid", "Overdue"):
                outstanding_value += max(0.0, balance)
            if live_status == "Overdue":
                overdue_value += max(0.0, balance)
            recent.append({
                "id": r.get("id"),
                "invoiceRef": r.get("invoiceRef"),
                "projectName": r.get("projectName"),
                "clientName": r.get("clientName") or r.get("clientCompany"),
                "status": live_status,
                "totalDue": total,
                "paidTotal": paid,
                "balance": balance,
                "dueDate": r.get("dueDate"),
                "updatedAt": r.get("updatedAt"),
            })
        recent.sort(key=lambda x: x.get("updatedAt") or "", reverse=True)
        return {
            "total": len(rows),
            "draft": counts.get("Draft", 0),
            "sent": counts.get("Sent", 0),
            "partPaid": counts.get("Part Paid", 0),
            "paid": counts.get("Paid", 0),
            "overdue": counts.get("Overdue", 0),
            "cancelled": counts.get("Cancelled", 0),
            "outstandingValue": round(outstanding_value, 2),
            "overdueValue": round(overdue_value, 2),
            "paidValue": round(paid_value, 2),
            "billedValue": round(billed_value, 2),
            "recent": recent[:10],
        }

    @router.get("/from-application/{aid}")
    async def draft_from_afp(aid: str, authorization: Optional[str] = Header(None)):
        """Return a pre-filled invoice draft from a Certified AFP."""
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        afp = await db.applications_for_payment.find_one({"id": aid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not afp:
            raise HTTPException(status_code=404, detail="Application not found")
        totals = afp.get("totals") or {}
        # One consolidated line item for the AFP so the invoice matches the certified amount cleanly.
        certified = float(afp.get("certifiedAmount") or totals.get("totalDue") or 0)
        # Reverse-engineer a pre-tax subtotal so the invoice re-calc matches (before adding CIS/VAT again)
        subtotal = float(totals.get("subtotalNet") or (certified))
        line = {
            "id": str(uuid.uuid4()),
            "category": "Application for Payment",
            "description": f"Value of works — Application for Payment {afp.get('applicationRef')} (#{afp.get('applicationNumber')})",
            "qty": 1, "unit": "item", "unitPrice": subtotal,
        }
        return {
            "projectId": afp.get("projectId"),
            "projectName": afp.get("projectName"),
            "projectAddress": afp.get("projectAddress"),
            "clientName": afp.get("clientName"),
            "clientCompany": afp.get("clientCompany"),
            "clientEmail": afp.get("clientEmail"),
            "clientPhone": afp.get("clientPhone"),
            "linkedApplicationId": afp.get("id"),
            "linkedApplicationRef": afp.get("applicationRef"),
            "lineItems": [line],
            "cisStatus": (afp.get("totals") or {}).get("cisStatus") or "Not applicable",
            "vatTreatment": (afp.get("totals") or {}).get("vatTreatment") or "Standard 20%",
            "notes": f"Invoice raised against Application for Payment {afp.get('applicationRef')}.",
        }

    @router.get("/from-variation/{vid}")
    async def draft_from_variation(vid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        vo = await db.variation_orders.find_one({"id": vid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not vo:
            raise HTTPException(status_code=404, detail="Variation not found")
        totals = vo.get("totals") or {}
        line_items = []
        for it in (vo.get("lineItems") or []):
            line_items.append({
                "id": str(uuid.uuid4()),
                "category": it.get("category") or "Other",
                "description": it.get("description") or "",
                "qty": it.get("qty") or 1, "unit": it.get("unit") or "item",
                "unitPrice": it.get("unitPrice") or 0,
            })
        return {
            "projectId": vo.get("projectId"),
            "projectName": vo.get("projectName"),
            "projectAddress": vo.get("projectAddress"),
            "clientName": vo.get("clientName"),
            "clientCompany": vo.get("clientCompany"),
            "clientEmail": vo.get("clientEmail"),
            "clientPhone": vo.get("clientPhone"),
            "linkedVariationId": vo.get("id"),
            "linkedVariationRef": vo.get("variationRef"),
            "lineItems": line_items,
            "vatTreatment": "Standard 20%" if vo.get("addVat") else "Zero-rated",
            "notes": f"Invoice raised against Variation Order {vo.get('variationRef')}.",
        }

    @router.get("/templates")
    async def list_templates(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.invoice_templates.find({"userId": user["id"], "isDeleted": {"$ne": True}}).sort("updatedAt", -1).to_list(500)
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
        await db.invoice_templates.insert_one(doc)
        return _shape(doc)

    @router.delete("/templates/{tid}")
    async def delete_template(tid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.invoice_templates.find_one({"id": tid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.invoice_templates.update_one({"id": tid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    return router


async def collect_invoice_attention(db, user_id: str, now: datetime, limit: int = 15) -> list:
    items: List[Dict[str, Any]] = []
    today_iso = now.date().isoformat()
    soon_iso = (now + timedelta(days=3)).date().isoformat()
    rows = await db.invoices.find({
        "userId": user_id, "isDeleted": {"$ne": True},
        "status": {"$in": ["Sent", "Part Paid"]},
    }).to_list(500)
    for r in rows:
        iid = r.get("id"); ref = r.get("invoiceRef") or ""
        project = r.get("projectName") or r.get("clientName") or "client"
        due = r.get("dueDate") or ""
        total = float(((r.get("totals") or {}).get("totalDue")) or 0)
        paid = round(sum(float(p.get("amount") or 0) for p in (r.get("payments") or [])), 2)
        balance = round(total - paid, 2)
        if due and due < today_iso:
            items.append({
                "id": f"invoice-overdue-{iid}",
                "kind": "invoice_overdue",
                "title": f"Invoice {ref} overdue",
                "subtitle": f"{project} · £{balance:,.2f} due {due}",
                "projectId": r.get("projectId"), "projectName": r.get("projectName"),
                "actionLabel": "Open invoice",
                "actionRoute": f"/app/invoice-builder?open={iid}",
                "severity": "warning", "dueAt": due,
            })
        elif due and due <= soon_iso:
            items.append({
                "id": f"invoice-duesoon-{iid}",
                "kind": "invoice_due_soon",
                "title": f"Invoice {ref} due within 3 days",
                "subtitle": f"{project} · £{balance:,.2f} due {due}",
                "projectId": r.get("projectId"), "projectName": r.get("projectName"),
                "actionLabel": "Open invoice",
                "actionRoute": f"/app/invoice-builder?open={iid}",
                "severity": "info", "dueAt": due,
            })
    return items[:limit]
