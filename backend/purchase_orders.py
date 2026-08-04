"""Morris — Purchase Orders V2 (flagship procurement management system).

Transforms Purchase Orders from a transactional tool into the procurement hub
for Morris. Manages the entire lifecycle:
  Draft → Sent → Approved → Ordered → Part Delivered / Delivered
        → Awaiting Invoice → Paid → (Closed)

Endpoints (all prefixed /api/purchase-orders):
  • GET  /reference                              — dropdown options
  • GET  /purchase-orders                        — list with filters/search
  • POST /purchase-orders                        — create
  • GET  /purchase-orders/{id}                   — read one (with linked invoices)
  • PATCH /purchase-orders/{id}                  — update (recomputes totals)
  • DELETE /purchase-orders/{id}                 — soft delete
  • POST /purchase-orders/{id}/status            — status change (validated transition)
  • POST /purchase-orders/{id}/goods-received    — record delivery (part or full)
  • POST /purchase-orders/{id}/match-invoice     — create draft matched supplier invoice
  • DELETE /purchase-orders/{id}/matched-invoice/{sid}  — unlink a matched invoice
  • POST /matched-invoices/{sid}/approve         — approve a draft supplier invoice
  • POST /matched-invoices/{sid}/pay             — mark supplier invoice paid
  • GET  /stats                                  — dashboard KPIs
  • GET  /project/{jobId}/summary                — project-level roll-up
  • GET  /suppliers                              — supplier register (aggregate + saved)
  • POST /suppliers                              — save/upsert supplier record
  • DELETE /suppliers/{id}                       — remove saved supplier
  • GET  /templates / POST /templates / DELETE /templates/{id}

`collect_purchase_order_attention` surfaces POs awaiting delivery / invoice.
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel


STATUSES = [
    "Draft", "Sent", "Approved", "Ordered",
    "Part Delivered", "Delivered", "Awaiting Invoice", "Paid", "Cancelled",
]
MATCH_STATUSES = ["Unmatched", "Partially Matched", "Fully Matched"]
CATEGORIES = ["Materials", "Plant / Equipment Hire", "Consumables", "Services", "Subcontract Labour", "Delivery / Haulage", "Other"]
VAT_TREATMENTS = ["Standard 20%", "Reduced 5%", "Zero-rated", "Reverse charge (0%)", "Exempt"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _compute_totals(body: dict) -> dict:
    items = body.get("lineItems") or []
    subtotal = 0.0
    by_cat: Dict[str, float] = {}
    for it in items:
        qty = float(it.get("qty") or 0)
        price = float(it.get("unitPrice") or 0)
        line = round(qty * price, 2)
        it["lineTotal"] = line
        cat = it.get("category") or "Materials"
        by_cat[cat] = round(by_cat.get(cat, 0) + line, 2)
        subtotal += line
    subtotal = round(subtotal, 2)
    discount = float(body.get("discount") or 0)
    subtotal_after = round(subtotal - discount, 2)
    delivery = float(body.get("deliveryCharge") or 0)
    vat_treatment = body.get("vatTreatment") or "Standard 20%"
    vat_map = {"Standard 20%": 20.0, "Reduced 5%": 5.0, "Zero-rated": 0.0, "Reverse charge (0%)": 0.0, "Exempt": 0.0}
    vat_rate = vat_map.get(vat_treatment, 0.0)
    vat_base = max(0.0, subtotal_after + delivery)
    vat_amount = round(vat_base * vat_rate / 100, 2)
    total = round(vat_base + vat_amount, 2)
    return {
        "subtotal": subtotal,
        "byCategory": by_cat,
        "discount": round(discount, 2),
        "subtotalAfterDiscount": subtotal_after,
        "deliveryCharge": round(delivery, 2),
        "vatTreatment": vat_treatment,
        "vatRate": vat_rate,
        "vatAmount": vat_amount,
        "total": total,
    }


def _match_status_from_invoices(po_total: float, invoices: List[Dict[str, Any]]) -> str:
    """Compute match status from live invoices excluding cancelled."""
    live = [i for i in invoices if (i.get("status") or "") not in ("Cancelled", "Rejected")]
    if not live:
        return "Unmatched"
    total = round(sum(float(i.get("amount") or 0) for i in live), 2)
    if po_total <= 0:
        return "Fully Matched" if total > 0 else "Unmatched"
    if total + 0.005 >= po_total:
        return "Fully Matched"
    return "Partially Matched"


def _delivery_state(po: dict) -> Dict[str, Any]:
    """Compute delivery totals from receipts. Returns qtyOrdered / qtyReceived / percent."""
    items = po.get("lineItems") or []
    ordered = sum(float(it.get("qty") or 0) for it in items)
    receipts = po.get("goodsReceived") or []
    received = 0.0
    for r in receipts:
        for rl in (r.get("lines") or []):
            received += float(rl.get("qty") or 0)
    pct = round((received / ordered * 100), 2) if ordered > 0 else 0.0
    return {"qtyOrdered": ordered, "qtyReceived": received, "percent": pct}


class LineItem(BaseModel):
    id: Optional[str] = None
    category: Optional[str] = "Materials"
    description: Optional[str] = ""
    productCode: Optional[str] = ""
    qty: Optional[float] = 1
    unit: Optional[str] = "each"
    unitPrice: Optional[float] = 0
    notes: Optional[str] = ""


class PurchaseOrderIn(BaseModel):
    # Project link
    projectId: Optional[str] = ""
    projectName: Optional[str] = ""
    projectAddress: Optional[str] = ""

    # Supplier
    supplierId: Optional[str] = ""
    supplierName: Optional[str] = ""
    supplierCompany: Optional[str] = ""
    supplierContact: Optional[str] = ""
    supplierEmail: Optional[str] = ""
    supplierPhone: Optional[str] = ""
    supplierAddress: Optional[str] = ""
    supplierVatNumber: Optional[str] = ""
    supplierAccountNumber: Optional[str] = ""

    # Meta
    poRef: Optional[str] = ""
    poDate: Optional[str] = ""
    requiredDate: Optional[str] = ""
    reference: Optional[str] = ""  # internal PO reference / job code
    status: Optional[str] = "Draft"

    # Delivery
    deliveryAddress: Optional[str] = ""
    deliveryContact: Optional[str] = ""
    deliveryPhone: Optional[str] = ""
    deliveryInstructions: Optional[str] = ""
    deliveryDate: Optional[str] = ""
    deliveryCharge: Optional[float] = 0

    # Lines
    lineItems: Optional[List[Dict[str, Any]]] = []
    discount: Optional[float] = 0
    vatTreatment: Optional[str] = "Standard 20%"

    # Terms
    paymentTerms: Optional[str] = "30 days from invoice date"
    terms: Optional[str] = "Goods must be delivered in accordance with this Purchase Order. Any variation must be agreed in writing before delivery."
    notes: Optional[str] = ""

    # Approval / sign-off
    preparedBy: Optional[str] = ""
    preparedSignature: Optional[str] = ""
    approvedBy: Optional[str] = ""
    approvedDate: Optional[str] = ""

    # Delivery + invoice tracking (populated by endpoints — client may pass an empty list on create)
    goodsReceived: Optional[List[Dict[str, Any]]] = []
    matchedInvoiceIds: Optional[List[str]] = []

    # Photos / docs
    photoIds: Optional[List[str]] = []
    supportingDocs: Optional[List[Dict[str, Any]]] = []

    isFavourite: Optional[bool] = False


class PurchaseOrderUpdate(BaseModel):
    projectId: Optional[str] = None
    projectName: Optional[str] = None
    projectAddress: Optional[str] = None
    supplierId: Optional[str] = None
    supplierName: Optional[str] = None
    supplierCompany: Optional[str] = None
    supplierContact: Optional[str] = None
    supplierEmail: Optional[str] = None
    supplierPhone: Optional[str] = None
    supplierAddress: Optional[str] = None
    supplierVatNumber: Optional[str] = None
    supplierAccountNumber: Optional[str] = None
    poRef: Optional[str] = None
    poDate: Optional[str] = None
    requiredDate: Optional[str] = None
    reference: Optional[str] = None
    status: Optional[str] = None
    deliveryAddress: Optional[str] = None
    deliveryContact: Optional[str] = None
    deliveryPhone: Optional[str] = None
    deliveryInstructions: Optional[str] = None
    deliveryDate: Optional[str] = None
    deliveryCharge: Optional[float] = None
    lineItems: Optional[List[Dict[str, Any]]] = None
    discount: Optional[float] = None
    vatTreatment: Optional[str] = None
    paymentTerms: Optional[str] = None
    terms: Optional[str] = None
    notes: Optional[str] = None
    preparedBy: Optional[str] = None
    preparedSignature: Optional[str] = None
    approvedBy: Optional[str] = None
    approvedDate: Optional[str] = None
    photoIds: Optional[List[str]] = None
    supportingDocs: Optional[List[Dict[str, Any]]] = None
    isFavourite: Optional[bool] = None


class StatusChange(BaseModel):
    status: str
    note: Optional[str] = ""


class GoodsReceiptLine(BaseModel):
    lineItemId: Optional[str] = ""
    description: Optional[str] = ""
    qty: float


class GoodsReceipt(BaseModel):
    date: Optional[str] = ""
    receivedBy: Optional[str] = ""
    deliveryNoteRef: Optional[str] = ""
    lines: List[Dict[str, Any]]  # [{ lineItemId, qty, description }]
    notes: Optional[str] = ""


class InvoiceMatchIn(BaseModel):
    invoiceNumber: str
    invoiceDate: Optional[str] = ""
    amount: float
    dueDate: Optional[str] = ""
    fileUrl: Optional[str] = ""
    fileName: Optional[str] = ""
    notes: Optional[str] = ""


class SupplierIn(BaseModel):
    id: Optional[str] = None
    name: str
    company: Optional[str] = ""
    contact: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    vatNumber: Optional[str] = ""
    accountNumber: Optional[str] = ""
    paymentTerms: Optional[str] = ""
    notes: Optional[str] = ""


class TemplateIn(BaseModel):
    name: str
    payload: Dict[str, Any]


def build_router(db, get_user):
    router = APIRouter(prefix="/api/purchase-orders", tags=["purchase-orders"])

    def _shape(doc: dict) -> dict:
        d = dict(doc); d.pop("_id", None); return d

    async def _seq_ref(user: dict) -> str:
        """Sequential PO reference — PO-YYYY-NNNN per user."""
        year = datetime.now(timezone.utc).year
        res = await db.users.find_one_and_update(
            {"id": user["id"]}, {"$inc": {"purchaseOrderCounter": 1}}, return_document=True,
        )
        seq = (res or {}).get("purchaseOrderCounter", 1)
        return f"PO-{year}-{seq:04d}"

    async def _load_matched_invoices(user_id: str, invoice_ids: List[str]) -> List[Dict[str, Any]]:
        if not invoice_ids:
            return []
        rows = await db.supplier_invoices.find(
            {"userId": user_id, "id": {"$in": invoice_ids}, "isDeleted": {"$ne": True}}
        ).to_list(200)
        return [_shape(r) for r in rows]

    async def _refresh_match_status(user_id: str, po_id: str) -> Optional[str]:
        po = await db.purchase_orders.find_one({"id": po_id, "userId": user_id, "isDeleted": {"$ne": True}})
        if not po:
            return None
        invoices = await _load_matched_invoices(user_id, po.get("matchedInvoiceIds") or [])
        po_total = float(((po.get("totals") or {}).get("total")) or 0)
        match_status = _match_status_from_invoices(po_total, invoices)
        updates: Dict[str, Any] = {"matchStatus": match_status, "updatedAt": _now_iso()}
        # Auto-advance PO status when fully matched + paid
        paid_total = sum(float(i.get("paidAmount") or 0) for i in invoices if (i.get("status") or "") == "Paid")
        if match_status == "Fully Matched" and paid_total + 0.005 >= po_total and po_total > 0:
            if (po.get("status") or "") not in ("Cancelled", "Paid"):
                updates["status"] = "Paid"
        elif match_status in ("Fully Matched", "Partially Matched") and (po.get("status") or "") in ("Delivered", "Part Delivered"):
            updates["status"] = "Awaiting Invoice"
        await db.purchase_orders.update_one({"id": po_id}, {"$set": updates})
        return match_status

    @router.get("/reference")
    async def reference():
        return {
            "statuses": STATUSES,
            "matchStatuses": MATCH_STATUSES,
            "categories": CATEGORIES,
            "vatTreatments": VAT_TREATMENTS,
            "units": ["each", "item", "box", "bag", "pallet", "hour", "day", "week", "m", "m²", "m³", "tonne", "kg", "L", "roll", "set", "load"],
            "paymentTerms": ["Payment on delivery", "7 days from invoice date", "14 days from invoice date", "30 days from invoice date", "45 days from invoice date", "60 days from invoice date", "End of month following invoice"],
        }

    @router.get("/purchase-orders")
    async def list_pos(
        projectId: Optional[str] = None,
        supplierId: Optional[str] = None,
        status: Optional[str] = None,
        q: Optional[str] = None,
        authorization: Optional[str] = Header(None),
    ):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        query: Dict[str, Any] = {"userId": user["id"], "isDeleted": {"$ne": True}}
        if projectId:
            query["projectId"] = projectId
        if supplierId:
            query["supplierId"] = supplierId
        if status:
            query["status"] = status
        rows = await db.purchase_orders.find(query).sort("updatedAt", -1).to_list(1000)
        if q:
            needle = q.lower()
            def _hay(r):
                return " ".join(str(r.get(k, "") or "") for k in (
                    "poRef", "projectName", "supplierName", "supplierCompany",
                    "reference", "notes", "deliveryAddress",
                )).lower()
            rows = [r for r in rows if needle in _hay(r)]
        return [_shape(r) for r in rows]

    @router.post("/purchase-orders")
    async def create_po(body: PurchaseOrderIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not (body.projectName or "").strip() and not (body.projectId or "").strip():
            raise HTTPException(status_code=400, detail="Project is required")
        if not (body.supplierName or body.supplierCompany or "").strip():
            raise HTTPException(status_code=400, detail="Supplier is required")
        doc = body.model_dump()
        doc["totals"] = _compute_totals(doc)
        doc.update({
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "toolId": "purchase-orders",
            "matchStatus": "Unmatched",
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "isDeleted": False,
        })
        if not doc.get("poRef"):
            doc["poRef"] = await _seq_ref(user)
        if not doc.get("poDate"):
            doc["poDate"] = datetime.now(timezone.utc).date().isoformat()
        await db.purchase_orders.insert_one(doc)
        # Upsert supplier register from PO
        await _upsert_supplier_from_po(db, user["id"], doc)
        return _shape(doc)

    @router.get("/purchase-orders/{pid}")
    async def get_po(pid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.purchase_orders.find_one({"id": pid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        out = _shape(row)
        out["matchedInvoices"] = await _load_matched_invoices(user["id"], row.get("matchedInvoiceIds") or [])
        out["delivery"] = _delivery_state(row)
        return out

    @router.patch("/purchase-orders/{pid}")
    async def update_po(pid: str, body: PurchaseOrderUpdate, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.purchase_orders.find_one({"id": pid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        pricing_keys = {"lineItems", "discount", "vatTreatment", "deliveryCharge"}
        if pricing_keys & set(updates.keys()):
            merged = {**existing, **updates}
            updates["totals"] = _compute_totals(merged)
            if "lineItems" in updates:
                updates["lineItems"] = merged["lineItems"]
        updates["updatedAt"] = _now_iso()
        await db.purchase_orders.update_one({"id": pid}, {"$set": updates})
        fresh = await db.purchase_orders.find_one({"id": pid})
        # Sync supplier register if supplier fields changed
        if any(k.startswith("supplier") for k in updates.keys()):
            await _upsert_supplier_from_po(db, user["id"], fresh)
        # If totals changed, refresh match status
        if pricing_keys & set(updates.keys()):
            await _refresh_match_status(user["id"], pid)
            fresh = await db.purchase_orders.find_one({"id": pid})
        return _shape(fresh)

    @router.delete("/purchase-orders/{pid}")
    async def delete_po(pid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.purchase_orders.find_one({"id": pid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.purchase_orders.update_one({"id": pid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    @router.post("/purchase-orders/{pid}/status")
    async def change_status(pid: str, body: StatusChange, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.purchase_orders.find_one({"id": pid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        if body.status not in STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        upd: Dict[str, Any] = {"status": body.status, "updatedAt": _now_iso()}
        if body.status == "Sent" and not row.get("sentAt"):
            upd["sentAt"] = _now_iso()
        if body.status == "Approved" and not row.get("approvedAt"):
            upd["approvedAt"] = _now_iso()
            if not row.get("approvedDate"):
                upd["approvedDate"] = datetime.now(timezone.utc).date().isoformat()
        if body.status == "Cancelled":
            upd["cancelledAt"] = _now_iso()
        # Audit trail entry
        history = row.get("history") or []
        history.append({
            "id": str(uuid.uuid4()),
            "at": _now_iso(),
            "by": user.get("fullName") or user.get("username"),
            "kind": "status",
            "from": row.get("status"),
            "to": body.status,
            "note": body.note or "",
        })
        upd["history"] = history
        await db.purchase_orders.update_one({"id": pid}, {"$set": upd})
        fresh = await db.purchase_orders.find_one({"id": pid})
        return _shape(fresh)

    @router.post("/purchase-orders/{pid}/goods-received")
    async def record_goods(pid: str, body: GoodsReceipt, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.purchase_orders.find_one({"id": pid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        if not body.lines:
            raise HTTPException(status_code=400, detail="At least one receipt line is required")
        receipt = {
            "id": str(uuid.uuid4()),
            "date": body.date or datetime.now(timezone.utc).date().isoformat(),
            "receivedBy": body.receivedBy or user.get("fullName") or user.get("username") or "",
            "deliveryNoteRef": body.deliveryNoteRef or "",
            "lines": body.lines,
            "notes": body.notes or "",
            "createdAt": _now_iso(),
        }
        receipts = (row.get("goodsReceived") or []) + [receipt]
        # Compute delivery status
        merged_row = {**row, "goodsReceived": receipts}
        d = _delivery_state(merged_row)
        current_status = row.get("status") or "Draft"
        new_status = current_status
        if d["percent"] > 0 and d["percent"] < 100:
            new_status = "Part Delivered"
        elif d["percent"] >= 100:
            new_status = "Delivered"
        history = row.get("history") or []
        history.append({
            "id": str(uuid.uuid4()), "at": _now_iso(),
            "by": user.get("fullName") or user.get("username"),
            "kind": "goods_received",
            "note": f"{d['qtyReceived']} of {d['qtyOrdered']} received ({d['percent']}%)",
        })
        await db.purchase_orders.update_one({"id": pid}, {"$set": {
            "goodsReceived": receipts, "status": new_status,
            "history": history, "updatedAt": _now_iso(),
        }})
        fresh = await db.purchase_orders.find_one({"id": pid})
        out = _shape(fresh)
        out["delivery"] = _delivery_state(fresh)
        return out

    @router.post("/purchase-orders/{pid}/match-invoice")
    async def match_invoice(pid: str, body: InvoiceMatchIn, authorization: Optional[str] = Header(None)):
        """Create a draft supplier invoice permanently linked to this PO.
        The user must approve it before it flows to Commercial Reports."""
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.purchase_orders.find_one({"id": pid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        if body.amount <= 0:
            raise HTTPException(status_code=400, detail="Invoice amount must be > 0")
        inv = {
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "purchaseOrderId": pid,
            "poRef": row.get("poRef"),
            "projectId": row.get("projectId"),
            "projectName": row.get("projectName"),
            "supplierId": row.get("supplierId"),
            "supplierName": row.get("supplierName"),
            "supplierCompany": row.get("supplierCompany"),
            "invoiceNumber": body.invoiceNumber,
            "invoiceDate": body.invoiceDate or datetime.now(timezone.utc).date().isoformat(),
            "dueDate": body.dueDate or "",
            "amount": round(float(body.amount), 2),
            "paidAmount": 0.0,
            "status": "Draft",  # user must review + approve
            "fileUrl": body.fileUrl or "",
            "fileName": body.fileName or "",
            "notes": body.notes or "",
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "isDeleted": False,
        }
        await db.supplier_invoices.insert_one(inv)
        matched_ids = list(row.get("matchedInvoiceIds") or []) + [inv["id"]]
        history = row.get("history") or []
        history.append({
            "id": str(uuid.uuid4()), "at": _now_iso(),
            "by": user.get("fullName") or user.get("username"),
            "kind": "invoice_matched",
            "note": f"Supplier invoice {body.invoiceNumber} matched (£{body.amount:.2f}) — pending approval",
        })
        await db.purchase_orders.update_one({"id": pid}, {"$set": {
            "matchedInvoiceIds": matched_ids,
            "history": history,
            "updatedAt": _now_iso(),
        }})
        # Refresh match status now that we have an invoice
        await _refresh_match_status(user["id"], pid)
        fresh = await db.purchase_orders.find_one({"id": pid})
        out = _shape(fresh)
        out["matchedInvoices"] = await _load_matched_invoices(user["id"], fresh.get("matchedInvoiceIds") or [])
        out["delivery"] = _delivery_state(fresh)
        out["createdInvoice"] = _shape(inv)
        return out

    @router.delete("/purchase-orders/{pid}/matched-invoice/{sid}")
    async def unlink_matched(pid: str, sid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.purchase_orders.find_one({"id": pid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        matched_ids = [x for x in (row.get("matchedInvoiceIds") or []) if x != sid]
        await db.purchase_orders.update_one({"id": pid}, {"$set": {
            "matchedInvoiceIds": matched_ids, "updatedAt": _now_iso(),
        }})
        await db.supplier_invoices.update_one({"id": sid, "userId": user["id"]},
            {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        await _refresh_match_status(user["id"], pid)
        fresh = await db.purchase_orders.find_one({"id": pid})
        out = _shape(fresh)
        out["matchedInvoices"] = await _load_matched_invoices(user["id"], fresh.get("matchedInvoiceIds") or [])
        out["delivery"] = _delivery_state(fresh)
        return out

    @router.post("/matched-invoices/{sid}/approve")
    async def approve_matched(sid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        inv = await db.supplier_invoices.find_one({"id": sid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not inv:
            raise HTTPException(status_code=404, detail="Not found")
        await db.supplier_invoices.update_one({"id": sid}, {"$set": {
            "status": "Approved", "approvedAt": _now_iso(), "updatedAt": _now_iso(),
        }})
        if inv.get("purchaseOrderId"):
            await _refresh_match_status(user["id"], inv["purchaseOrderId"])
        return _shape(await db.supplier_invoices.find_one({"id": sid}))

    @router.post("/matched-invoices/{sid}/pay")
    async def mark_paid(sid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        inv = await db.supplier_invoices.find_one({"id": sid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not inv:
            raise HTTPException(status_code=404, detail="Not found")
        await db.supplier_invoices.update_one({"id": sid}, {"$set": {
            "status": "Paid", "paidAt": _now_iso(),
            "paidAmount": float(inv.get("amount") or 0),
            "updatedAt": _now_iso(),
        }})
        if inv.get("purchaseOrderId"):
            await _refresh_match_status(user["id"], inv["purchaseOrderId"])
        return _shape(await db.supplier_invoices.find_one({"id": sid}))

    # ---- Stats ----
    @router.get("/stats")
    async def stats(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.purchase_orders.find({"userId": user["id"], "isDeleted": {"$ne": True}}).to_list(2000)
        counts = {s: 0 for s in STATUSES}
        committed_value = 0.0
        paid_value = 0.0
        awaiting_invoice_value = 0.0
        recent: List[Dict[str, Any]] = []
        for r in rows:
            st = r.get("status") or "Draft"
            counts[st] = counts.get(st, 0) + 1
            total = float(((r.get("totals") or {}).get("total")) or 0)
            if st not in ("Cancelled", "Draft"):
                committed_value += total
            if st == "Paid":
                paid_value += total
            if st in ("Delivered", "Part Delivered", "Awaiting Invoice"):
                awaiting_invoice_value += total
            recent.append({
                "id": r.get("id"),
                "poRef": r.get("poRef"),
                "projectName": r.get("projectName"),
                "supplierName": r.get("supplierName") or r.get("supplierCompany"),
                "status": st,
                "matchStatus": r.get("matchStatus") or "Unmatched",
                "total": total,
                "updatedAt": r.get("updatedAt"),
            })
        recent.sort(key=lambda x: x.get("updatedAt") or "", reverse=True)
        return {
            "total": len(rows),
            "draft": counts.get("Draft", 0),
            "sent": counts.get("Sent", 0),
            "approved": counts.get("Approved", 0),
            "ordered": counts.get("Ordered", 0),
            "partDelivered": counts.get("Part Delivered", 0),
            "delivered": counts.get("Delivered", 0),
            "awaitingInvoice": counts.get("Awaiting Invoice", 0),
            "paid": counts.get("Paid", 0),
            "cancelled": counts.get("Cancelled", 0),
            "committedValue": round(committed_value, 2),
            "paidValue": round(paid_value, 2),
            "awaitingInvoiceValue": round(awaiting_invoice_value, 2),
            "recent": recent[:10],
        }

    @router.get("/project/{job_id}/summary")
    async def project_summary(job_id: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.purchase_orders.find({
            "userId": user["id"], "projectId": job_id, "isDeleted": {"$ne": True},
        }).to_list(500)
        counts = {s: 0 for s in STATUSES}
        committed = 0.0
        paid = 0.0
        awaiting = 0.0
        for r in rows:
            st = r.get("status") or "Draft"
            counts[st] = counts.get(st, 0) + 1
            total = float(((r.get("totals") or {}).get("total")) or 0)
            if st not in ("Cancelled", "Draft"):
                committed += total
            if st == "Paid":
                paid += total
            if st in ("Delivered", "Part Delivered", "Awaiting Invoice"):
                awaiting += total
        return {
            "projectId": job_id,
            "counts": counts,
            "totalPurchaseOrders": len(rows),
            "committedValue": round(committed, 2),
            "paidValue": round(paid, 2),
            "awaitingInvoiceValue": round(awaiting, 2),
        }

    # ---- Suppliers register ----
    async def _upsert_supplier_from_po_stub(user_id: str, po: dict) -> None:
        """Auto-upserts a supplier record from PO. Alias kept for testability."""
        await _upsert_supplier_from_po(db, user_id, po)

    @router.get("/suppliers")
    async def list_suppliers(q: Optional[str] = None, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        saved = await db.suppliers.find({"userId": user["id"], "isDeleted": {"$ne": True}}).to_list(500)
        pos = await db.purchase_orders.find({"userId": user["id"], "isDeleted": {"$ne": True}}).to_list(2000)
        # Build stats per supplier from PO history
        by_key: Dict[str, Dict[str, Any]] = {}
        for s in saved:
            key = s.get("id")
            by_key[key] = {**_shape(s), "poCount": 0, "totalSpend": 0.0, "outstandingPOs": 0, "outstandingValue": 0.0, "lastPOAt": None, "lastPORef": None, "lastPOStatus": None, "avgDeliveryDays": None, "isSaved": True}
        for p in pos:
            key = p.get("supplierId") or f"__inline::{(p.get('supplierName') or p.get('supplierCompany') or '').lower()}"
            entry = by_key.get(key)
            if not entry:
                entry = {
                    "id": key,
                    "name": p.get("supplierName") or "",
                    "company": p.get("supplierCompany") or "",
                    "contact": p.get("supplierContact") or "",
                    "email": p.get("supplierEmail") or "",
                    "phone": p.get("supplierPhone") or "",
                    "address": p.get("supplierAddress") or "",
                    "vatNumber": p.get("supplierVatNumber") or "",
                    "accountNumber": p.get("supplierAccountNumber") or "",
                    "poCount": 0, "totalSpend": 0.0, "outstandingPOs": 0, "outstandingValue": 0.0,
                    "lastPOAt": None, "lastPORef": None, "lastPOStatus": None,
                    "avgDeliveryDays": None, "isSaved": False,
                }
                by_key[key] = entry
            total = float(((p.get("totals") or {}).get("total")) or 0)
            entry["poCount"] = int(entry.get("poCount") or 0) + 1
            if (p.get("status") or "") not in ("Cancelled", "Draft"):
                entry["totalSpend"] = round(float(entry.get("totalSpend") or 0) + total, 2)
            if (p.get("status") or "") in ("Sent", "Approved", "Ordered", "Part Delivered", "Delivered", "Awaiting Invoice"):
                entry["outstandingPOs"] = int(entry.get("outstandingPOs") or 0) + 1
                entry["outstandingValue"] = round(float(entry.get("outstandingValue") or 0) + total, 2)
            po_at = p.get("updatedAt") or p.get("createdAt")
            if po_at and (not entry.get("lastPOAt") or entry["lastPOAt"] < po_at):
                entry["lastPOAt"] = po_at
                entry["lastPORef"] = p.get("poRef")
                entry["lastPOStatus"] = p.get("status")
        out = list(by_key.values())
        if q:
            needle = q.lower()
            out = [x for x in out if any(needle in str(x.get(k) or "").lower() for k in ("name", "company", "email", "phone", "contact"))]
        out.sort(key=lambda x: (x.get("lastPOAt") or ""), reverse=True)
        return out

    @router.post("/suppliers")
    async def upsert_supplier(body: SupplierIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not body.name.strip() and not (body.company or "").strip():
            raise HTTPException(status_code=400, detail="Supplier name or company is required")
        doc = body.model_dump(exclude_none=True)
        sid = body.id
        if sid:
            existing = await db.suppliers.find_one({"id": sid, "userId": user["id"]})
            if existing:
                doc.pop("id", None)
                doc["updatedAt"] = _now_iso()
                await db.suppliers.update_one({"id": sid}, {"$set": doc})
                return _shape(await db.suppliers.find_one({"id": sid}))
        doc["id"] = str(uuid.uuid4())
        doc["userId"] = user["id"]
        doc["createdAt"] = _now_iso()
        doc["updatedAt"] = _now_iso()
        doc["isDeleted"] = False
        await db.suppliers.insert_one(doc)
        return _shape(doc)

    @router.delete("/suppliers/{sid}")
    async def delete_supplier(sid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.suppliers.find_one({"id": sid, "userId": user["id"]})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.suppliers.update_one({"id": sid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    # ---- Templates ----
    @router.get("/templates")
    async def list_templates(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.purchase_order_templates.find({"userId": user["id"], "isDeleted": {"$ne": True}}).sort("updatedAt", -1).to_list(500)
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
        await db.purchase_order_templates.insert_one(doc)
        return _shape(doc)

    @router.delete("/templates/{tid}")
    async def delete_template(tid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.purchase_order_templates.find_one({"id": tid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.purchase_order_templates.update_one({"id": tid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    return router


async def _upsert_supplier_from_po(db, user_id: str, po: dict) -> None:
    """When a PO is created/updated, upsert a lightweight supplier register entry.
    Uses supplierId if present, else the case-insensitive company/name as the key."""
    name = (po.get("supplierName") or "").strip()
    company = (po.get("supplierCompany") or "").strip()
    if not name and not company:
        return
    sid = po.get("supplierId")
    query = {"userId": user_id, "isDeleted": {"$ne": True}}
    if sid:
        query["id"] = sid
    else:
        query["$or"] = []
        if name:
            query["$or"].append({"nameLower": name.lower()})
        if company:
            query["$or"].append({"companyLower": company.lower()})
        if not query["$or"]:
            return
    existing = await db.suppliers.find_one(query)
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "name": name,
        "company": company,
        "contact": po.get("supplierContact") or "",
        "email": po.get("supplierEmail") or "",
        "phone": po.get("supplierPhone") or "",
        "address": po.get("supplierAddress") or "",
        "vatNumber": po.get("supplierVatNumber") or "",
        "accountNumber": po.get("supplierAccountNumber") or "",
        "nameLower": name.lower(),
        "companyLower": company.lower(),
        "updatedAt": now,
    }
    if existing:
        await db.suppliers.update_one({"id": existing["id"]}, {"$set": doc})
    else:
        doc.update({
            "id": str(uuid.uuid4()),
            "userId": user_id,
            "createdAt": now,
            "isDeleted": False,
            "isSaved": False,
        })
        await db.suppliers.insert_one(doc)


async def collect_purchase_order_attention(db, user_id: str, now: datetime, limit: int = 15) -> list:
    """Attention items:
      • Required delivery date has passed but PO not marked Delivered
      • Delivered > 14 days ago but no supplier invoice matched
      • Approved supplier invoice unpaid > 7 days past due date
    """
    items: List[Dict[str, Any]] = []
    today = now.date().isoformat()
    fourteen_days_ago = (now - timedelta(days=14)).isoformat()

    rows = await db.purchase_orders.find({
        "userId": user_id, "isDeleted": {"$ne": True},
        "status": {"$in": ["Sent", "Approved", "Ordered", "Part Delivered", "Delivered", "Awaiting Invoice"]},
    }).to_list(500)
    for r in rows:
        pid = r.get("id")
        ref = r.get("poRef") or ""
        supplier = r.get("supplierName") or r.get("supplierCompany") or "supplier"
        total = float(((r.get("totals") or {}).get("total")) or 0)
        status = r.get("status") or ""
        required = r.get("requiredDate") or ""
        updated = r.get("updatedAt") or ""
        if required and required < today and status not in ("Delivered", "Awaiting Invoice", "Paid"):
            items.append({
                "id": f"po-late-{pid}", "kind": "po_late",
                "title": f"PO {ref} delivery overdue",
                "subtitle": f"{supplier} · £{total:,.2f} · required {required}",
                "projectId": r.get("projectId"), "projectName": r.get("projectName"),
                "actionLabel": "Open PO",
                "actionRoute": f"/app/purchase-orders?open={pid}",
                "severity": "warning", "dueAt": required,
            })
        elif status == "Delivered" and updated < fourteen_days_ago and not (r.get("matchedInvoiceIds") or []):
            items.append({
                "id": f"po-awaiting-inv-{pid}", "kind": "po_awaiting_invoice",
                "title": f"PO {ref} delivered — no supplier invoice matched",
                "subtitle": f"{supplier} · £{total:,.2f}",
                "projectId": r.get("projectId"), "projectName": r.get("projectName"),
                "actionLabel": "Match invoice",
                "actionRoute": f"/app/purchase-orders?open={pid}",
                "severity": "info", "dueAt": updated,
            })
    # Unpaid approved supplier invoices past due
    invs = await db.supplier_invoices.find({
        "userId": user_id, "isDeleted": {"$ne": True},
        "status": {"$in": ["Approved"]},
    }).to_list(500)
    for i in invs:
        due = i.get("dueDate") or ""
        if due and due < today:
            items.append({
                "id": f"po-inv-overdue-{i.get('id')}", "kind": "supplier_invoice_overdue",
                "title": f"Supplier invoice {i.get('invoiceNumber')} overdue",
                "subtitle": f"{i.get('supplierName') or i.get('supplierCompany') or 'Supplier'} · £{float(i.get('amount') or 0):,.2f} · due {due}",
                "projectId": i.get("projectId"),
                "actionLabel": "Open PO",
                "actionRoute": f"/app/purchase-orders?open={i.get('purchaseOrderId')}",
                "severity": "warning", "dueAt": due,
            })
    return items[:limit]
