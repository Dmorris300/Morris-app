"""Morris — Contract Management V2 (flagship contract administration hub).

Central register of every contract you're working under. Tracks parties, key
dates, contract value, milestones, retention, notices, linked Variations /
EOT Claims / Applications for Payment / Invoices, and supporting documents —
with a full audit trail on every change.

Endpoints (all prefixed /api/contracts):
  • GET  /reference                                — dropdown options
  • GET  /contracts                                — list with filters/search
  • POST /contracts                                — create
  • GET  /contracts/{id}                           — read one (with linked items rolled up)
  • PATCH /contracts/{id}                          — update
  • DELETE /contracts/{id}                         — soft delete
  • POST /contracts/{id}/status                    — status change + audit
  • POST /contracts/{id}/milestones                — add milestone
  • PATCH /contracts/{id}/milestones/{mid}         — update milestone
  • DELETE /contracts/{id}/milestones/{mid}        — remove milestone
  • POST /contracts/{id}/notices                   — add notice
  • PATCH /contracts/{id}/notices/{nid}            — update notice
  • DELETE /contracts/{id}/notices/{nid}           — remove notice
  • GET  /stats                                    — dashboard KPIs
  • GET  /project/{jobId}/summary                  — project-level roll-up
  • GET  /templates / POST /templates / DELETE /templates/{id}

`collect_contract_attention` surfaces contracts expiring / notices due /
milestones overdue for Command Centre.
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel


CONTRACT_STATUSES = ["Draft", "Under Review", "Active", "Expiring Soon", "Completed", "Terminated", "On Hold"]
CONTRACT_TYPES = [
    "JCT Standard Building Contract",
    "JCT Intermediate Building Contract",
    "JCT Minor Works",
    "JCT Design and Build",
    "NEC4 ECC Option A (Priced with Activity Schedule)",
    "NEC4 ECC Option B (Priced with BoQ)",
    "NEC4 ECC Option C (Target with Activity Schedule)",
    "NEC4 ECC Option D (Target with BoQ)",
    "NEC4 ECC Option E (Cost Reimbursable)",
    "NEC4 ECS (Engineering & Construction Subcontract)",
    "NEC4 ECSC (Short Subcontract)",
    "FIDIC Red Book",
    "FIDIC Yellow Book",
    "Domestic / Household Contract",
    "Consumer Contract",
    "Letter of Intent",
    "Purchase Order Only",
    "Bespoke Contract",
    "Other",
]
MILESTONE_STATUSES = ["Not Started", "In Progress", "Completed", "Delayed", "At Risk"]
NOTICE_TYPES = [
    "Compensation Event (NEC)",
    "Early Warning (NEC)",
    "Extension of Time Claim",
    "Loss & Expense Claim",
    "Variation Instruction",
    "Practical Completion",
    "Making Good Defects",
    "Payment Notice",
    "Pay Less Notice",
    "Payless Notice",
    "Termination Notice",
    "Default Notice",
    "Non-Conformance Notice",
    "General Notice",
]
NOTICE_STATUSES = ["Issued", "Acknowledged", "Actioned", "Rejected", "Withdrawn", "Overdue"]
PAYMENT_TERMS = [
    "Interim monthly (valuation)",
    "Milestone / stage payments",
    "Payment on practical completion",
    "50% deposit, balance on completion",
    "Bespoke schedule",
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


class MilestoneIn(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    plannedDate: Optional[str] = ""
    actualDate: Optional[str] = ""
    status: Optional[str] = "Not Started"
    value: Optional[float] = 0
    notes: Optional[str] = ""


class NoticeIn(BaseModel):
    id: Optional[str] = None
    type: str
    reference: Optional[str] = ""
    issuedDate: Optional[str] = ""
    responseDueDate: Optional[str] = ""
    description: Optional[str] = ""
    status: Optional[str] = "Issued"
    respondedAt: Optional[str] = ""
    responseNote: Optional[str] = ""


class ContractIn(BaseModel):
    # Project link
    projectId: Optional[str] = ""
    projectName: Optional[str] = ""
    projectAddress: Optional[str] = ""

    # Contract identity
    contractRef: Optional[str] = ""  # auto-generated if empty
    title: Optional[str] = ""
    contractType: Optional[str] = "JCT Minor Works"
    contractNumber: Optional[str] = ""  # external / client's own reference

    # Parties
    employerName: Optional[str] = ""
    employerCompany: Optional[str] = ""
    employerAddress: Optional[str] = ""
    employerContact: Optional[str] = ""
    employerEmail: Optional[str] = ""
    employerPhone: Optional[str] = ""

    contractorName: Optional[str] = ""
    contractorCompany: Optional[str] = ""
    contractorAddress: Optional[str] = ""

    # Key dates
    dateOfContract: Optional[str] = ""
    startDate: Optional[str] = ""
    completionDate: Optional[str] = ""
    practicalCompletionDate: Optional[str] = ""
    defectsLiabilityEndDate: Optional[str] = ""
    finalCertificateDate: Optional[str] = ""

    # Financials
    contractValue: Optional[float] = 0
    retentionPercent: Optional[float] = 0
    retentionReleaseHalfDate: Optional[str] = ""
    retentionReleaseFullDate: Optional[str] = ""
    liquidatedDamagesPerWeek: Optional[float] = 0
    liquidatedDamagesCap: Optional[float] = 0

    # Terms
    paymentTerms: Optional[str] = "Interim monthly (valuation)"
    paymentDaysNet: Optional[int] = 30
    interestOnLatePaymentPct: Optional[float] = 8.0
    variationsProcedure: Optional[str] = "All variations to be instructed in writing before work commences."
    disputeResolution: Optional[str] = "Adjudication under the Housing Grants, Construction & Regeneration Act 1996 (as amended)."
    governingLaw: Optional[str] = "Laws of England & Wales"

    # Insurance
    publicLiabilityInsurance: Optional[float] = 2000000
    employersLiabilityInsurance: Optional[float] = 10000000
    contractWorksInsurance: Optional[float] = 0
    professionalIndemnityInsurance: Optional[float] = 0

    # Scope + special conditions
    scopeSummary: Optional[str] = ""
    specialConditions: Optional[str] = ""
    exclusions: Optional[str] = ""

    # Milestones / Notices / Linked items
    milestones: Optional[List[Dict[str, Any]]] = []
    notices: Optional[List[Dict[str, Any]]] = []

    linkedVariationIds: Optional[List[str]] = []
    linkedApplicationIds: Optional[List[str]] = []
    linkedInvoiceIds: Optional[List[str]] = []
    linkedEotIds: Optional[List[str]] = []

    # Documents
    supportingDocs: Optional[List[Dict[str, Any]]] = []
    photoIds: Optional[List[str]] = []

    # Sign-off
    signedByEmployer: Optional[str] = ""
    signedByEmployerDate: Optional[str] = ""
    signedByContractor: Optional[str] = ""
    signedByContractorDate: Optional[str] = ""
    contractorSignature: Optional[str] = ""

    # Meta
    status: Optional[str] = "Draft"
    isFavourite: Optional[bool] = False


class ContractUpdate(BaseModel):
    projectId: Optional[str] = None
    projectName: Optional[str] = None
    projectAddress: Optional[str] = None
    contractRef: Optional[str] = None
    title: Optional[str] = None
    contractType: Optional[str] = None
    contractNumber: Optional[str] = None
    employerName: Optional[str] = None
    employerCompany: Optional[str] = None
    employerAddress: Optional[str] = None
    employerContact: Optional[str] = None
    employerEmail: Optional[str] = None
    employerPhone: Optional[str] = None
    contractorName: Optional[str] = None
    contractorCompany: Optional[str] = None
    contractorAddress: Optional[str] = None
    dateOfContract: Optional[str] = None
    startDate: Optional[str] = None
    completionDate: Optional[str] = None
    practicalCompletionDate: Optional[str] = None
    defectsLiabilityEndDate: Optional[str] = None
    finalCertificateDate: Optional[str] = None
    contractValue: Optional[float] = None
    retentionPercent: Optional[float] = None
    retentionReleaseHalfDate: Optional[str] = None
    retentionReleaseFullDate: Optional[str] = None
    liquidatedDamagesPerWeek: Optional[float] = None
    liquidatedDamagesCap: Optional[float] = None
    paymentTerms: Optional[str] = None
    paymentDaysNet: Optional[int] = None
    interestOnLatePaymentPct: Optional[float] = None
    variationsProcedure: Optional[str] = None
    disputeResolution: Optional[str] = None
    governingLaw: Optional[str] = None
    publicLiabilityInsurance: Optional[float] = None
    employersLiabilityInsurance: Optional[float] = None
    contractWorksInsurance: Optional[float] = None
    professionalIndemnityInsurance: Optional[float] = None
    scopeSummary: Optional[str] = None
    specialConditions: Optional[str] = None
    exclusions: Optional[str] = None
    linkedVariationIds: Optional[List[str]] = None
    linkedApplicationIds: Optional[List[str]] = None
    linkedInvoiceIds: Optional[List[str]] = None
    linkedEotIds: Optional[List[str]] = None
    supportingDocs: Optional[List[Dict[str, Any]]] = None
    photoIds: Optional[List[str]] = None
    signedByEmployer: Optional[str] = None
    signedByEmployerDate: Optional[str] = None
    signedByContractor: Optional[str] = None
    signedByContractorDate: Optional[str] = None
    contractorSignature: Optional[str] = None
    status: Optional[str] = None
    isFavourite: Optional[bool] = None


class StatusChange(BaseModel):
    status: str
    note: Optional[str] = ""


class TemplateIn(BaseModel):
    name: str
    payload: Dict[str, Any]


def _shape(doc: dict) -> dict:
    d = dict(doc); d.pop("_id", None); return d


def _derive_status(contract: dict, now_iso: str) -> str:
    """Live-derive status: Active contracts within 30 days of completion flip to Expiring Soon."""
    stored = contract.get("status") or "Draft"
    if stored not in ("Active",):
        return stored
    completion = contract.get("completionDate") or ""
    if not completion:
        return stored
    today_str = now_iso[:10]
    try:
        completion_dt = datetime.strptime(completion, "%Y-%m-%d").date()
        today_dt = datetime.strptime(today_str, "%Y-%m-%d").date()
    except Exception:
        return stored
    delta = (completion_dt - today_dt).days
    if delta < 0:
        return "Expiring Soon"  # overdue completion still highlights as expiring
    if delta <= 30:
        return "Expiring Soon"
    return stored


def _live_view(contract: dict, now_iso: str) -> dict:
    """Return a shaped copy with liveStatus applied."""
    d = _shape(contract)
    d["liveStatus"] = _derive_status(contract, now_iso)
    # counts
    d["milestoneCount"] = len(d.get("milestones") or [])
    d["milestoneOverdue"] = sum(1 for m in (d.get("milestones") or [])
        if (m.get("plannedDate") or "") and (m.get("plannedDate") < now_iso[:10])
        and (m.get("status") or "") not in ("Completed", ))
    d["noticeCount"] = len(d.get("notices") or [])
    d["noticesDue"] = sum(1 for n in (d.get("notices") or [])
        if (n.get("responseDueDate") or "") and (n.get("responseDueDate") <= now_iso[:10])
        and (n.get("status") or "") not in ("Actioned", "Rejected", "Withdrawn"))
    return d


def build_router(db, get_user):
    router = APIRouter(prefix="/api/contracts", tags=["contracts"])

    async def _seq_ref(user: dict) -> str:
        year = datetime.now(timezone.utc).year
        res = await db.users.find_one_and_update(
            {"id": user["id"]}, {"$inc": {"contractCounter": 1}}, return_document=True,
        )
        seq = (res or {}).get("contractCounter", 1)
        return f"CON-{year}-{seq:04d}"

    async def _load_linked(user_id: str, contract: dict) -> Dict[str, Any]:
        """Pull linked variations / applications / invoices / eot claims for display."""
        result: Dict[str, Any] = {"variations": [], "applications": [], "invoices": [], "eotClaims": []}
        var_ids = contract.get("linkedVariationIds") or []
        if var_ids:
            rows = await db.variation_orders.find({"userId": user_id, "id": {"$in": var_ids}, "isDeleted": {"$ne": True}}).to_list(200)
            result["variations"] = [_shape(r) for r in rows]
        app_ids = contract.get("linkedApplicationIds") or []
        if app_ids:
            rows = await db.applications_for_payment.find({"userId": user_id, "id": {"$in": app_ids}, "isDeleted": {"$ne": True}}).to_list(200)
            result["applications"] = [_shape(r) for r in rows]
        inv_ids = contract.get("linkedInvoiceIds") or []
        if inv_ids:
            rows = await db.invoices.find({"userId": user_id, "id": {"$in": inv_ids}, "isDeleted": {"$ne": True}}).to_list(200)
            result["invoices"] = [_shape(r) for r in rows]
        return result

    async def _project_linked_totals(user_id: str, project_id: str) -> Dict[str, Any]:
        """Auto-roll-up variations / applications / invoices from the linked project."""
        if not project_id:
            return {"variationCount": 0, "variationApprovedValue": 0.0, "applicationCount": 0, "applicationCertified": 0.0, "invoiceCount": 0, "invoicePaid": 0.0}
        vars_ = await db.variation_orders.find({"userId": user_id, "projectId": project_id, "isDeleted": {"$ne": True}}).to_list(500)
        apps_ = await db.applications_for_payment.find({"userId": user_id, "projectId": project_id, "isDeleted": {"$ne": True}}).to_list(500)
        invs_ = await db.invoices.find({"userId": user_id, "projectId": project_id, "isDeleted": {"$ne": True}}).to_list(500)
        var_approved = sum(float((v.get("approvedValue") or ((v.get("totals") or {}).get("subtotal") or 0)))
                          for v in vars_ if (v.get("status") or "") == "Approved")
        app_cert = sum(float(((a.get("totals") or {}).get("netPayment")) or 0) for a in apps_ if (a.get("status") or "") in ("Certified", "Paid"))
        inv_paid = sum(float(i.get("amountPaid") or 0) for i in invs_)
        return {
            "variationCount": len(vars_),
            "variationApprovedValue": round(var_approved, 2),
            "applicationCount": len(apps_),
            "applicationCertified": round(app_cert, 2),
            "invoiceCount": len(invs_),
            "invoicePaid": round(inv_paid, 2),
        }

    # ---- Reference ----
    @router.get("/reference")
    async def reference():
        return {
            "statuses": CONTRACT_STATUSES,
            "types": CONTRACT_TYPES,
            "milestoneStatuses": MILESTONE_STATUSES,
            "noticeTypes": NOTICE_TYPES,
            "noticeStatuses": NOTICE_STATUSES,
            "paymentTerms": PAYMENT_TERMS,
        }

    # ---- CRUD ----
    @router.get("/contracts")
    async def list_contracts(
        projectId: Optional[str] = None,
        contractType: Optional[str] = None,
        status: Optional[str] = None,
        q: Optional[str] = None,
        authorization: Optional[str] = Header(None),
    ):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        query: Dict[str, Any] = {"userId": user["id"], "isDeleted": {"$ne": True}}
        if projectId: query["projectId"] = projectId
        if contractType: query["contractType"] = contractType
        if status: query["status"] = status
        rows = await db.contracts.find(query).sort("updatedAt", -1).to_list(1000)
        if q:
            needle = q.lower()
            def _hay(r):
                return " ".join(str(r.get(k, "") or "") for k in (
                    "contractRef", "title", "projectName", "employerName", "employerCompany",
                    "contractNumber", "contractType", "scopeSummary",
                )).lower()
            rows = [r for r in rows if needle in _hay(r)]
        now_iso = _now_iso()
        return [_live_view(r, now_iso) for r in rows]

    @router.post("/contracts")
    async def create_contract(body: ContractIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not (body.projectName or "").strip() and not (body.projectId or "").strip():
            raise HTTPException(status_code=400, detail="Project is required")
        if not (body.title or body.employerName or body.employerCompany or "").strip():
            raise HTTPException(status_code=400, detail="Contract title or employer is required")
        doc = body.model_dump()
        # Prep milestones/notices with ids
        doc["milestones"] = [{**m, "id": m.get("id") or str(uuid.uuid4())} for m in (doc.get("milestones") or [])]
        doc["notices"] = [{**n, "id": n.get("id") or str(uuid.uuid4())} for n in (doc.get("notices") or [])]
        doc.update({
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "toolId": "contract-mgmt",
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "isDeleted": False,
            "history": [{
                "id": str(uuid.uuid4()), "at": _now_iso(),
                "by": user.get("fullName") or user.get("username"),
                "kind": "created", "note": "Contract created",
            }],
        })
        if not doc.get("contractRef"):
            doc["contractRef"] = await _seq_ref(user)
        if not doc.get("dateOfContract"):
            doc["dateOfContract"] = _today()
        await db.contracts.insert_one(doc)
        return _live_view(doc, _now_iso())

    @router.get("/contracts/{cid}")
    async def get_contract(cid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.contracts.find_one({"id": cid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        out = _live_view(row, _now_iso())
        out["linked"] = await _load_linked(user["id"], row)
        out["projectRollup"] = await _project_linked_totals(user["id"], row.get("projectId") or "")
        return out

    @router.patch("/contracts/{cid}")
    async def update_contract(cid: str, body: ContractUpdate, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.contracts.find_one({"id": cid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        updates["updatedAt"] = _now_iso()
        await db.contracts.update_one({"id": cid}, {"$set": updates})
        return _live_view(await db.contracts.find_one({"id": cid}), _now_iso())

    @router.delete("/contracts/{cid}")
    async def delete_contract(cid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.contracts.find_one({"id": cid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.contracts.update_one({"id": cid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    @router.post("/contracts/{cid}/status")
    async def change_status(cid: str, body: StatusChange, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.contracts.find_one({"id": cid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        if body.status not in CONTRACT_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        history = row.get("history") or []
        history.append({
            "id": str(uuid.uuid4()), "at": _now_iso(),
            "by": user.get("fullName") or user.get("username"),
            "kind": "status", "from": row.get("status"), "to": body.status,
            "note": body.note or "",
        })
        upd: Dict[str, Any] = {"status": body.status, "history": history, "updatedAt": _now_iso()}
        if body.status == "Active" and not row.get("activatedAt"):
            upd["activatedAt"] = _now_iso()
        if body.status == "Completed" and not row.get("completedAt"):
            upd["completedAt"] = _now_iso()
        if body.status == "Terminated" and not row.get("terminatedAt"):
            upd["terminatedAt"] = _now_iso()
        await db.contracts.update_one({"id": cid}, {"$set": upd})
        return _live_view(await db.contracts.find_one({"id": cid}), _now_iso())

    # ---- Milestones ----
    @router.post("/contracts/{cid}/milestones")
    async def add_milestone(cid: str, body: MilestoneIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.contracts.find_one({"id": cid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        mid = str(uuid.uuid4())
        m = {**body.model_dump(exclude_none=True), "id": mid, "createdAt": _now_iso()}
        milestones = list(row.get("milestones") or []) + [m]
        history = (row.get("history") or []) + [{
            "id": str(uuid.uuid4()), "at": _now_iso(), "by": user.get("fullName") or user.get("username"),
            "kind": "milestone_added", "note": f"Milestone added: {m.get('name')}",
        }]
        await db.contracts.update_one({"id": cid}, {"$set": {"milestones": milestones, "history": history, "updatedAt": _now_iso()}})
        return _live_view(await db.contracts.find_one({"id": cid}), _now_iso())

    @router.patch("/contracts/{cid}/milestones/{mid}")
    async def update_milestone(cid: str, mid: str, body: MilestoneIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.contracts.find_one({"id": cid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        milestones = list(row.get("milestones") or [])
        idx = next((i for i, m in enumerate(milestones) if m.get("id") == mid), -1)
        if idx == -1:
            raise HTTPException(status_code=404, detail="Milestone not found")
        milestones[idx] = {**milestones[idx], **body.model_dump(exclude_none=True), "id": mid}
        await db.contracts.update_one({"id": cid}, {"$set": {"milestones": milestones, "updatedAt": _now_iso()}})
        return _live_view(await db.contracts.find_one({"id": cid}), _now_iso())

    @router.delete("/contracts/{cid}/milestones/{mid}")
    async def delete_milestone(cid: str, mid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.contracts.find_one({"id": cid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        milestones = [m for m in (row.get("milestones") or []) if m.get("id") != mid]
        await db.contracts.update_one({"id": cid}, {"$set": {"milestones": milestones, "updatedAt": _now_iso()}})
        return _live_view(await db.contracts.find_one({"id": cid}), _now_iso())

    # ---- Notices ----
    @router.post("/contracts/{cid}/notices")
    async def add_notice(cid: str, body: NoticeIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.contracts.find_one({"id": cid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        n = {**body.model_dump(exclude_none=True), "id": str(uuid.uuid4()), "createdAt": _now_iso()}
        notices = list(row.get("notices") or []) + [n]
        history = (row.get("history") or []) + [{
            "id": str(uuid.uuid4()), "at": _now_iso(), "by": user.get("fullName") or user.get("username"),
            "kind": "notice_added", "note": f"Notice logged: {n.get('type')}",
        }]
        await db.contracts.update_one({"id": cid}, {"$set": {"notices": notices, "history": history, "updatedAt": _now_iso()}})
        return _live_view(await db.contracts.find_one({"id": cid}), _now_iso())

    @router.patch("/contracts/{cid}/notices/{nid}")
    async def update_notice(cid: str, nid: str, body: NoticeIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.contracts.find_one({"id": cid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        notices = list(row.get("notices") or [])
        idx = next((i for i, n in enumerate(notices) if n.get("id") == nid), -1)
        if idx == -1:
            raise HTTPException(status_code=404, detail="Notice not found")
        notices[idx] = {**notices[idx], **body.model_dump(exclude_none=True), "id": nid}
        await db.contracts.update_one({"id": cid}, {"$set": {"notices": notices, "updatedAt": _now_iso()}})
        return _live_view(await db.contracts.find_one({"id": cid}), _now_iso())

    @router.delete("/contracts/{cid}/notices/{nid}")
    async def delete_notice(cid: str, nid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.contracts.find_one({"id": cid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        notices = [n for n in (row.get("notices") or []) if n.get("id") != nid]
        await db.contracts.update_one({"id": cid}, {"$set": {"notices": notices, "updatedAt": _now_iso()}})
        return _live_view(await db.contracts.find_one({"id": cid}), _now_iso())

    # ---- Stats ----
    @router.get("/stats")
    async def stats(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.contracts.find({"userId": user["id"], "isDeleted": {"$ne": True}}).to_list(2000)
        now_iso = _now_iso(); today = now_iso[:10]
        counts = {s: 0 for s in CONTRACT_STATUSES}
        expiring = 0
        notices_due = 0
        outstanding_actions = 0
        milestones_overdue = 0
        total_value = 0.0
        active_value = 0.0
        recent: List[Dict[str, Any]] = []
        for r in rows:
            live = _derive_status(r, now_iso)
            counts[live] = counts.get(live, 0) + 1
            if live in ("Expiring Soon",):
                expiring += 1
            total_value += float(r.get("contractValue") or 0)
            if live in ("Active", "Expiring Soon"):
                active_value += float(r.get("contractValue") or 0)
            for n in (r.get("notices") or []):
                if (n.get("responseDueDate") or "") and n.get("responseDueDate") <= today \
                    and (n.get("status") or "") not in ("Actioned", "Rejected", "Withdrawn"):
                    notices_due += 1
                    outstanding_actions += 1
            for m in (r.get("milestones") or []):
                if (m.get("plannedDate") or "") and m.get("plannedDate") < today \
                    and (m.get("status") or "") not in ("Completed", ):
                    milestones_overdue += 1
                    outstanding_actions += 1
            recent.append({
                "id": r.get("id"), "contractRef": r.get("contractRef"),
                "title": r.get("title") or r.get("projectName"),
                "projectName": r.get("projectName"),
                "employer": r.get("employerName") or r.get("employerCompany"),
                "status": live,
                "contractValue": float(r.get("contractValue") or 0),
                "completionDate": r.get("completionDate") or "",
                "updatedAt": r.get("updatedAt"),
            })
        recent.sort(key=lambda x: x.get("updatedAt") or "", reverse=True)
        return {
            "total": len(rows),
            "draft": counts.get("Draft", 0),
            "underReview": counts.get("Under Review", 0),
            "active": counts.get("Active", 0),
            "expiringSoon": expiring,
            "completed": counts.get("Completed", 0),
            "terminated": counts.get("Terminated", 0),
            "onHold": counts.get("On Hold", 0),
            "noticesDue": notices_due,
            "milestonesOverdue": milestones_overdue,
            "outstandingActions": outstanding_actions,
            "totalContractValue": round(total_value, 2),
            "activeContractValue": round(active_value, 2),
            "recent": recent[:10],
        }

    @router.get("/project/{job_id}/summary")
    async def project_summary(job_id: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.contracts.find({"userId": user["id"], "projectId": job_id, "isDeleted": {"$ne": True}}).to_list(500)
        return {
            "projectId": job_id,
            "count": len(rows),
            "totalValue": round(sum(float(r.get("contractValue") or 0) for r in rows), 2),
            "contracts": [_live_view(r, _now_iso()) for r in rows],
        }

    # ---- Templates ----
    @router.get("/templates")
    async def list_templates(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.contract_templates.find({"userId": user["id"], "isDeleted": {"$ne": True}}).sort("updatedAt", -1).to_list(500)
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
        await db.contract_templates.insert_one(doc)
        return _shape(doc)

    @router.delete("/templates/{tid}")
    async def delete_template(tid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.contract_templates.find_one({"id": tid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.contract_templates.update_one({"id": tid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    return router


async def collect_contract_attention(db, user_id: str, now: datetime, limit: int = 15) -> list:
    """Attention items surfaced in the Command Centre:
      • Active contract with completion date within 30 days (contract_expiring)
      • Notice with responseDueDate <= today and not yet actioned (contract_notice_due)
      • Milestone with plannedDate in past and not completed (contract_milestone_overdue)
    """
    items: List[Dict[str, Any]] = []
    today = now.date().isoformat()
    soon = (now + timedelta(days=30)).date().isoformat()

    rows = await db.contracts.find({"userId": user_id, "isDeleted": {"$ne": True}}).to_list(500)
    for r in rows:
        cid = r.get("id")
        ref = r.get("contractRef") or ""
        title = r.get("title") or r.get("projectName") or "Contract"
        status = r.get("status") or ""
        completion = r.get("completionDate") or ""
        if status == "Active" and completion and completion <= soon:
            items.append({
                "id": f"contract-expiring-{cid}", "kind": "contract_expiring",
                "title": f"{title} nearing completion",
                "subtitle": f"{ref} · completes {completion}",
                "projectId": r.get("projectId"), "projectName": r.get("projectName"),
                "actionLabel": "Open contract",
                "actionRoute": f"/app/contract-mgmt?open={cid}",
                "severity": "info" if completion >= today else "warning",
                "dueAt": completion,
            })
        for n in (r.get("notices") or []):
            due = n.get("responseDueDate") or ""
            if due and due <= today and (n.get("status") or "") not in ("Actioned", "Rejected", "Withdrawn"):
                items.append({
                    "id": f"contract-notice-{cid}-{n.get('id')}",
                    "kind": "contract_notice_due",
                    "title": f"{n.get('type', 'Notice')} response due",
                    "subtitle": f"{title} · {ref} · due {due}",
                    "projectId": r.get("projectId"), "projectName": r.get("projectName"),
                    "actionLabel": "Open contract",
                    "actionRoute": f"/app/contract-mgmt?open={cid}",
                    "severity": "warning", "dueAt": due,
                })
        for m in (r.get("milestones") or []):
            planned = m.get("plannedDate") or ""
            if planned and planned < today and (m.get("status") or "") not in ("Completed", ):
                items.append({
                    "id": f"contract-milestone-{cid}-{m.get('id')}",
                    "kind": "contract_milestone_overdue",
                    "title": f"Milestone overdue: {m.get('name', 'Milestone')}",
                    "subtitle": f"{title} · {ref} · planned {planned}",
                    "projectId": r.get("projectId"), "projectName": r.get("projectName"),
                    "actionLabel": "Open contract",
                    "actionRoute": f"/app/contract-mgmt?open={cid}",
                    "severity": "warning", "dueAt": planned,
                })
    return items[:limit]
