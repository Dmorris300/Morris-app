"""Morris — Applications for Payment V2 (flagship payment application system).

Complete workflow from valuation preparation → submission → certification →
payment, with full audit trail. Auto-pulls approved variations from the linked
project so QS never double-keys.

Endpoints (all prefixed /api/applications-for-payment):
  • GET  /reference                             — dropdowns
  • GET  /applications                          — list with filter/search
  • POST /applications                          — create
  • GET  /applications/{id}                     — read one
  • PATCH /applications/{id}                    — update (recomputes totals)
  • DELETE /applications/{id}                   — soft delete
  • POST /applications/{id}/status              — status flow (Submitted/Certified/Paid/Rejected)
  • GET  /stats                                 — dashboard KPIs
  • GET  /project/{jobId}/summary               — previous apps + running totals for wizard step 3
  • GET  /templates                             — templates
  • POST /templates                             — create template
  • DELETE /templates/{id}                      — delete

`collect_afp_attention` surfaces:
  • Submitted for >7 days awaiting certification
  • Certified but unpaid > dueDate (Overdue)
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel


STATUSES = ["Draft", "Submitted", "Certified", "Paid", "Rejected"]
CATEGORIES = ["Labour", "Materials", "Plant & Equipment", "Preliminaries", "Subcontractor", "Variations", "Other"]
VAT_TREATMENTS = ["Standard 20%", "Reduced 5%", "Zero-rated", "Reverse charge (0%)", "Exempt"]
CIS_STATUSES = ["Not applicable", "Gross (0%)", "Standard (20%)", "Higher (30%)"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_labour_categories() -> set:
    return {"Labour", "Subcontractor"}


def _compute_totals(body: dict) -> dict:
    """Certification math:
      grossValuation = sum(lineItems.valueToDate)
      lessPrevious   = previouslyCertified
      thisPeriod     = grossValuation - previouslyCertified
      retention      = grossValuation * retentionRate / 100
      retentionThis  = retention - previousRetentionHeld
      subtotalNet    = thisPeriod - retentionThis - lessOther (adjustments)
      cisApplicable  = subtotalNet * (labour%/materials% mix) — computed from category ratio
      cisDeduction   = cisApplicable * cisRate / 100
      vat            = (subtotalNet - cisDeduction) * vatRate / 100 (unless reverse charge)
      totalDue       = subtotalNet - cisDeduction + vat
    """
    items = body.get("lineItems") or []
    gross_valuation = 0.0
    by_category: Dict[str, float] = {}
    labour_valuation = 0.0
    for it in items:
        vtd = float(it.get("valueToDate") or 0)
        cat = it.get("category") or "Other"
        by_category[cat] = round(by_category.get(cat, 0) + vtd, 2)
        gross_valuation += vtd
        if cat in _default_labour_categories():
            labour_valuation += vtd
    gross_valuation = round(gross_valuation, 2)

    # Add approved variations (server-side pulled by the frontend; stored as approvedVariationsValue)
    approved_var_value = float(body.get("approvedVariationsValue") or 0)
    gross_including_variations = round(gross_valuation + approved_var_value, 2)

    previously_certified = float(body.get("previouslyCertified") or 0)
    this_period = round(gross_including_variations - previously_certified, 2)

    retention_rate = float(body.get("retentionRate") or 0)
    total_retention = round(gross_including_variations * retention_rate / 100, 2)
    previous_retention_held = float(body.get("previousRetentionHeld") or 0)
    retention_this_period = round(total_retention - previous_retention_held, 2)

    adjustments = float(body.get("adjustments") or 0)  # +/- ad-hoc adjustment (contra, damages, etc.)

    subtotal_net = round(this_period - retention_this_period + adjustments, 2)

    # CIS on labour portion of this period only
    cis_status = body.get("cisStatus") or "Not applicable"
    cis_rate_map = {"Gross (0%)": 0.0, "Standard (20%)": 20.0, "Higher (30%)": 30.0}
    cis_rate = cis_rate_map.get(cis_status, 0.0)
    # Labour ratio of the current period (fall back to full when the whole app is labour)
    if gross_valuation > 0:
        labour_ratio = labour_valuation / gross_valuation
    else:
        labour_ratio = 0.0
    cis_applicable = round(max(0.0, subtotal_net) * labour_ratio, 2) if cis_status != "Not applicable" else 0.0
    cis_deduction = round(cis_applicable * cis_rate / 100, 2)

    vat_treatment = body.get("vatTreatment") or "Standard 20%"
    vat_rate_map = {"Standard 20%": 20.0, "Reduced 5%": 5.0, "Zero-rated": 0.0, "Reverse charge (0%)": 0.0, "Exempt": 0.0}
    vat_rate = vat_rate_map.get(vat_treatment, 0.0)
    vat_base = round(subtotal_net - cis_deduction, 2)
    vat_amount = round(max(0.0, vat_base) * vat_rate / 100, 2)

    total_due = round(subtotal_net - cis_deduction + vat_amount, 2)

    return {
        "grossValuation": gross_valuation,
        "approvedVariationsValue": round(approved_var_value, 2),
        "grossIncludingVariations": gross_including_variations,
        "byCategory": by_category,
        "previouslyCertified": round(previously_certified, 2),
        "thisPeriod": this_period,
        "retentionRate": retention_rate,
        "totalRetention": total_retention,
        "previousRetentionHeld": round(previous_retention_held, 2),
        "retentionThisPeriod": retention_this_period,
        "adjustments": round(adjustments, 2),
        "subtotalNet": subtotal_net,
        "labourValuation": round(labour_valuation, 2),
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


class AFPIn(BaseModel):
    projectId: Optional[str] = ""
    projectName: Optional[str] = ""
    projectAddress: Optional[str] = ""
    clientName: Optional[str] = ""
    clientCompany: Optional[str] = ""
    clientEmail: Optional[str] = ""
    clientPhone: Optional[str] = ""
    contractRef: Optional[str] = ""
    contractDate: Optional[str] = ""
    contractSum: Optional[float] = 0
    applicationRef: Optional[str] = ""
    applicationNumber: Optional[int] = 0
    applicationDate: Optional[str] = ""
    periodFrom: Optional[str] = ""
    periodTo: Optional[str] = ""
    dueDate: Optional[str] = ""
    status: Optional[str] = "Draft"
    lineItems: Optional[List[Dict[str, Any]]] = []
    approvedVariationsValue: Optional[float] = 0
    previouslyCertified: Optional[float] = 0
    retentionRate: Optional[float] = 5
    previousRetentionHeld: Optional[float] = 0
    adjustments: Optional[float] = 0
    adjustmentNote: Optional[str] = ""
    cisStatus: Optional[str] = "Not applicable"
    vatTreatment: Optional[str] = "Standard 20%"
    supportingDocs: Optional[List[Dict[str, Any]]] = []
    photoIds: Optional[List[str]] = []
    preparedBy: Optional[str] = ""
    preparedSignature: Optional[str] = ""
    certifierName: Optional[str] = ""
    certifierRole: Optional[str] = ""
    certifierSignature: Optional[str] = ""
    certifiedDate: Optional[str] = ""
    certifiedAmount: Optional[float] = 0
    paidDate: Optional[str] = ""
    paidAmount: Optional[float] = 0
    rejectionReason: Optional[str] = ""
    notes: Optional[str] = ""
    paymentTerms: Optional[str] = "Payment due within 30 days of certification. Interest may be charged under the Late Payment of Commercial Debts (Interest) Act 1998."
    isFavourite: Optional[bool] = False


class AFPUpdate(BaseModel):
    projectId: Optional[str] = None
    projectName: Optional[str] = None
    projectAddress: Optional[str] = None
    clientName: Optional[str] = None
    clientCompany: Optional[str] = None
    clientEmail: Optional[str] = None
    clientPhone: Optional[str] = None
    contractRef: Optional[str] = None
    contractDate: Optional[str] = None
    contractSum: Optional[float] = None
    applicationRef: Optional[str] = None
    applicationNumber: Optional[int] = None
    applicationDate: Optional[str] = None
    periodFrom: Optional[str] = None
    periodTo: Optional[str] = None
    dueDate: Optional[str] = None
    status: Optional[str] = None
    lineItems: Optional[List[Dict[str, Any]]] = None
    approvedVariationsValue: Optional[float] = None
    previouslyCertified: Optional[float] = None
    retentionRate: Optional[float] = None
    previousRetentionHeld: Optional[float] = None
    adjustments: Optional[float] = None
    adjustmentNote: Optional[str] = None
    cisStatus: Optional[str] = None
    vatTreatment: Optional[str] = None
    supportingDocs: Optional[List[Dict[str, Any]]] = None
    photoIds: Optional[List[str]] = None
    preparedBy: Optional[str] = None
    preparedSignature: Optional[str] = None
    certifierName: Optional[str] = None
    certifierRole: Optional[str] = None
    certifierSignature: Optional[str] = None
    certifiedDate: Optional[str] = None
    certifiedAmount: Optional[float] = None
    paidDate: Optional[str] = None
    paidAmount: Optional[float] = None
    rejectionReason: Optional[str] = None
    notes: Optional[str] = None
    paymentTerms: Optional[str] = None
    isFavourite: Optional[bool] = None


class StatusChange(BaseModel):
    status: str
    certifiedAmount: Optional[float] = None
    certifiedDate: Optional[str] = None
    paidAmount: Optional[float] = None
    paidDate: Optional[str] = None
    rejectionReason: Optional[str] = None


class TemplateIn(BaseModel):
    name: str
    payload: Dict[str, Any]


def build_router(db, get_user):
    router = APIRouter(prefix="/api/applications-for-payment", tags=["applications-for-payment"])

    def _shape(doc: dict) -> dict:
        d = dict(doc); d.pop("_id", None); return d

    def _is_overdue(row: dict, now: datetime) -> bool:
        if (row.get("status") or "") not in ("Submitted", "Certified"):
            return False
        due = row.get("dueDate")
        if not due:
            return False
        try:
            return datetime.fromisoformat(due).date() < now.date()
        except ValueError:
            return False

    async def _next_app_number(user_id: str, project_id: str) -> int:
        cnt = await db.applications_for_payment.count_documents({
            "userId": user_id, "projectId": project_id, "isDeleted": {"$ne": True},
        })
        return cnt + 1

    async def _seq_ref(user: dict) -> str:
        res = await db.users.find_one_and_update(
            {"id": user["id"]}, {"$inc": {"afpCounter": 1}}, return_document=True,
        )
        seq = (res or {}).get("afpCounter", 1)
        return f"AFP-{seq:03d}"

    async def _approved_variations_for(user_id: str, project_id: str) -> float:
        # Returns the NET total of Approved variations (subtotal only, no VAT) because
        # the AFP applies its own VAT/CIS at the whole-valuation level — using gross
        # here would double-count VAT.
        if not project_id:
            return 0.0
        total = 0.0
        async for r in db.variation_orders.find({
            "userId": user_id, "projectId": project_id, "status": "Approved", "isDeleted": {"$ne": True},
        }):
            totals = r.get("totals") or {}
            total += float(totals.get("subtotal") or totals.get("total") or 0)
        return round(total, 2)

    @router.get("/reference")
    async def reference():
        return {
            "statuses": STATUSES,
            "categories": CATEGORIES,
            "vatTreatments": VAT_TREATMENTS,
            "cisStatuses": CIS_STATUSES,
        }

    @router.get("/applications")
    async def list_applications(
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
        if status and status != "Overdue":
            query["status"] = status
        rows = await db.applications_for_payment.find(query).sort("updatedAt", -1).to_list(1000)
        now = datetime.now(timezone.utc)
        if status == "Overdue":
            rows = [r for r in rows if _is_overdue(r, now)]
        if q:
            needle = q.lower()
            def _hay(r):
                return " ".join(str(r.get(k, "") or "") for k in (
                    "applicationRef", "projectName", "clientName", "clientCompany", "contractRef", "notes",
                )).lower()
            rows = [r for r in rows if needle in _hay(r)]
        # Enrich with computed isOverdue flag for the UI
        enriched = []
        for r in rows:
            s = _shape(r)
            s["isOverdue"] = _is_overdue(r, now)
            enriched.append(s)
        return enriched

    @router.post("/applications")
    async def create_application(body: AFPIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not (body.projectName or "").strip() and not (body.projectId or "").strip():
            raise HTTPException(status_code=400, detail="Project is required")
        doc = body.model_dump()
        # Auto-pull approved variations for the linked project if the client did not send an override
        if (doc.get("projectId") or "") and (doc.get("approvedVariationsValue") in (None, 0, 0.0)):
            doc["approvedVariationsValue"] = await _approved_variations_for(user["id"], doc["projectId"])
        doc["totals"] = _compute_totals(doc)
        doc.update({
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "toolId": "applications-for-payment",
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "isDeleted": False,
        })
        if not doc.get("applicationRef"):
            doc["applicationRef"] = await _seq_ref(user)
        if not doc.get("applicationNumber"):
            doc["applicationNumber"] = await _next_app_number(user["id"], doc.get("projectId") or "")
        if not doc.get("applicationDate"):
            doc["applicationDate"] = datetime.now(timezone.utc).date().isoformat()
        await db.applications_for_payment.insert_one(doc)
        return _shape(doc)

    @router.get("/applications/{aid}")
    async def get_application(aid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.applications_for_payment.find_one({"id": aid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        return _shape(row)

    @router.patch("/applications/{aid}")
    async def update_application(aid: str, body: AFPUpdate, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.applications_for_payment.find_one({"id": aid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        # Recompute totals if any pricing input changes
        pricing_keys = {"lineItems", "approvedVariationsValue", "previouslyCertified", "retentionRate",
                        "previousRetentionHeld", "adjustments", "cisStatus", "vatTreatment"}
        if pricing_keys & set(updates.keys()):
            merged = {**existing, **updates}
            updates["totals"] = _compute_totals(merged)
            if "lineItems" in updates:
                updates["lineItems"] = merged["lineItems"]
        updates["updatedAt"] = _now_iso()
        await db.applications_for_payment.update_one({"id": aid}, {"$set": updates})
        fresh = await db.applications_for_payment.find_one({"id": aid})
        return _shape(fresh)

    @router.delete("/applications/{aid}")
    async def delete_application(aid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.applications_for_payment.find_one({"id": aid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.applications_for_payment.update_one({"id": aid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    @router.post("/applications/{aid}/status")
    async def change_status(aid: str, body: StatusChange, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.applications_for_payment.find_one({"id": aid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        if body.status not in STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        upd: Dict[str, Any] = {"status": body.status, "updatedAt": _now_iso()}
        if body.status == "Certified":
            upd["certifiedDate"] = body.certifiedDate or datetime.now(timezone.utc).date().isoformat()
            if body.certifiedAmount is not None:
                upd["certifiedAmount"] = float(body.certifiedAmount)
            else:
                upd["certifiedAmount"] = float(((row.get("totals") or {}).get("totalDue")) or 0)
        elif body.status == "Paid":
            upd["paidDate"] = body.paidDate or datetime.now(timezone.utc).date().isoformat()
            if body.paidAmount is not None:
                upd["paidAmount"] = float(body.paidAmount)
            else:
                upd["paidAmount"] = float(row.get("certifiedAmount") or ((row.get("totals") or {}).get("totalDue")) or 0)
        elif body.status == "Rejected":
            if body.rejectionReason is not None:
                upd["rejectionReason"] = body.rejectionReason
        await db.applications_for_payment.update_one({"id": aid}, {"$set": upd})
        # Auto-record the payment against the linked job
        if body.status == "Paid" and row.get("projectId"):
            try:
                await db.jobs.update_one(
                    {"id": row["projectId"], "userId": user["id"]},
                    {"$inc": {"amountPaid": float(upd.get("paidAmount") or 0)}, "$set": {"updatedAt": _now_iso()}},
                )
            except Exception:
                pass
        fresh = await db.applications_for_payment.find_one({"id": aid})
        return _shape(fresh)

    @router.get("/stats")
    async def stats(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.applications_for_payment.find({"userId": user["id"], "isDeleted": {"$ne": True}}).to_list(2000)
        now = datetime.now(timezone.utc)
        counts = {s: 0 for s in STATUSES}
        counts["Overdue"] = 0
        submitted_value = 0.0
        certified_value = 0.0
        paid_value = 0.0
        overdue_value = 0.0
        outstanding_value = 0.0
        recent: List[Dict[str, Any]] = []
        for r in rows:
            st = r.get("status") or "Draft"
            counts[st] = counts.get(st, 0) + 1
            due = float(((r.get("totals") or {}).get("totalDue")) or 0)
            certified = float(r.get("certifiedAmount") or 0)
            paid = float(r.get("paidAmount") or 0)
            if st == "Submitted":
                submitted_value += due
                outstanding_value += due
            elif st == "Certified":
                certified_value += certified
                outstanding_value += max(0.0, certified - paid)
            elif st == "Paid":
                paid_value += paid
            if _is_overdue(r, now):
                counts["Overdue"] += 1
                overdue_value += max(0.0, (certified if st == "Certified" else due) - paid)
            recent.append({
                "id": r.get("id"),
                "applicationRef": r.get("applicationRef"),
                "projectName": r.get("projectName"),
                "clientName": r.get("clientName") or r.get("clientCompany"),
                "status": st,
                "totalDue": due,
                "certifiedAmount": certified,
                "paidAmount": paid,
                "dueDate": r.get("dueDate"),
                "isOverdue": _is_overdue(r, now),
                "updatedAt": r.get("updatedAt"),
            })
        recent.sort(key=lambda x: x.get("updatedAt") or "", reverse=True)
        return {
            "total": len(rows),
            "draft": counts.get("Draft", 0),
            "submitted": counts.get("Submitted", 0),
            "certified": counts.get("Certified", 0),
            "paid": counts.get("Paid", 0),
            "rejected": counts.get("Rejected", 0),
            "overdue": counts.get("Overdue", 0),
            "submittedValue": round(submitted_value, 2),
            "certifiedValue": round(certified_value, 2),
            "paidValue": round(paid_value, 2),
            "overdueValue": round(overdue_value, 2),
            "outstandingValue": round(outstanding_value, 2),
            "recent": recent[:10],
        }

    @router.get("/project/{job_id}/summary")
    async def project_summary(job_id: str, authorization: Optional[str] = Header(None)):
        """Backs step 3 of the wizard: previous applications for the same project."""
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.applications_for_payment.find({
            "userId": user["id"], "projectId": job_id, "isDeleted": {"$ne": True},
        }).sort("applicationDate", 1).to_list(500)
        previous_apps = []
        previously_certified_total = 0.0
        previous_retention_held = 0.0
        highest_number = 0
        for r in rows:
            certified = float(r.get("certifiedAmount") or 0)
            paid = float(r.get("paidAmount") or 0)
            gross_incl = float(((r.get("totals") or {}).get("grossIncludingVariations")) or 0)
            retention = float(((r.get("totals") or {}).get("retentionThisPeriod")) or 0)
            status = r.get("status") or "Draft"
            num = int(r.get("applicationNumber") or 0)
            if num > highest_number:
                highest_number = num
            # P0.1 (Sep 2026) — "Amount Actually Certified" is defined as the
            # explicit persisted `certifiedAmount` field. Only applications
            # that have GENUINELY reached Certified or Paid may contribute to
            # cumulative "Previously Certified". Submitted / Rejected / Draft
            # contribute £0. A Certified application with certifiedAmount = £0
            # contributes £0. We NEVER fall back to grossIncludingVariations,
            # applicationValue or any other monetary field.
            if status in ("Certified", "Paid"):
                previously_certified_total += certified
                previous_retention_held += retention
            previous_apps.append({
                "id": r.get("id"),
                "applicationRef": r.get("applicationRef"),
                "applicationNumber": r.get("applicationNumber"),
                "applicationDate": r.get("applicationDate"),
                "status": status,
                "grossIncludingVariations": gross_incl,
                "certifiedAmount": certified,
                "paidAmount": paid,
                "dueDate": r.get("dueDate"),
            })
        approved_variations_value = await _approved_variations_for(user["id"], job_id)
        return {
            "projectId": job_id,
            "previousApplications": previous_apps,
            "previouslyCertifiedTotal": round(previously_certified_total, 2),
            "previousRetentionHeld": round(previous_retention_held, 2),
            "nextApplicationNumber": highest_number + 1,
            "approvedVariationsValue": approved_variations_value,
        }

    @router.get("/templates")
    async def list_templates(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.afp_templates.find({"userId": user["id"], "isDeleted": {"$ne": True}}).sort("updatedAt", -1).to_list(500)
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
        await db.afp_templates.insert_one(doc)
        return _shape(doc)

    @router.delete("/templates/{tid}")
    async def delete_template(tid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.afp_templates.find_one({"id": tid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.afp_templates.update_one({"id": tid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    return router


async def collect_afp_attention(db, user_id: str, now: datetime, limit: int = 15) -> list:
    items: List[Dict[str, Any]] = []
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    today_iso = now.date().isoformat()
    rows = await db.applications_for_payment.find({
        "userId": user_id, "isDeleted": {"$ne": True},
        "status": {"$in": ["Submitted", "Certified"]},
    }).to_list(500)
    for r in rows:
        aid = r.get("id"); ref = r.get("applicationRef") or ""
        project = r.get("projectName") or r.get("clientName") or "project"
        status = r.get("status") or ""
        due_date = r.get("dueDate") or ""
        total = float(((r.get("totals") or {}).get("totalDue")) or 0)
        certified = float(r.get("certifiedAmount") or 0)
        paid = float(r.get("paidAmount") or 0)
        updated = r.get("updatedAt") or ""
        overdue = status in ("Submitted", "Certified") and due_date and due_date < today_iso
        outstanding = certified - paid if status == "Certified" else total
        if overdue:
            items.append({
                "id": f"afp-overdue-{aid}",
                "kind": "afp_overdue",
                "title": f"Application {ref} overdue — {status.lower()}",
                "subtitle": f"{project} · £{outstanding:,.2f} due {due_date}",
                "projectId": r.get("projectId"), "projectName": r.get("projectName"),
                "actionLabel": "Open application",
                "actionRoute": f"/app/applications-for-payment?open={aid}",
                "severity": "warning", "dueAt": due_date,
            })
        elif status == "Submitted" and updated < seven_days_ago:
            items.append({
                "id": f"afp-await-{aid}",
                "kind": "afp_awaiting",
                "title": f"Application {ref} awaiting certification",
                "subtitle": f"{project} · £{total:,.2f}",
                "projectId": r.get("projectId"), "projectName": r.get("projectName"),
                "actionLabel": "Open application",
                "actionRoute": f"/app/applications-for-payment?open={aid}",
                "severity": "info", "dueAt": updated,
            })
    return items[:limit]
