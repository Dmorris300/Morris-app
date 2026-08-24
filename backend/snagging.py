"""Morris — Snagging Lists V2 (flagship defect & quality management system).

Every snag is a first-class item: raised → assigned → in progress →
awaiting verification → closed. Each snag carries before/after photos,
supporting docs, comments, and a full audit trail. Filter by project
to generate a per-project handover snagging report PDF.

Endpoints (all prefixed /api/snagging):
  • GET  /reference                             — dropdown options
  • GET  /snags                                 — list with filters/search
  • POST /snags                                 — create
  • GET  /snags/{id}                            — read one
  • PATCH /snags/{id}                           — update
  • DELETE /snags/{id}                          — soft delete
  • POST /snags/{id}/status                     — status change with audit
  • POST /snags/{id}/assign                     — assign to person
  • POST /snags/{id}/comment                    — add comment
  • DELETE /snags/{id}/comment/{cid}            — remove own comment
  • POST /snags/{id}/verify                     — mark verified (moves to Awaiting Verification → Closed via /status)
  • POST /snags/{id}/close                      — force close (bypasses verification)
  • POST /snags/{id}/reopen                     — reopen a closed snag
  • POST /snags/{id}/photos                     — attach photo urls (before/after)
  • DELETE /snags/{id}/photos/{pid}             — remove photo
  • GET  /stats                                 — dashboard KPIs
  • GET  /project/{jobId}/summary               — per-project roll-up
  • GET  /templates / POST /templates / DELETE /templates/{id}

`collect_snagging_attention` surfaces overdue snags / critical priorities
in the Command Centre.
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel


PRIORITIES = ["Low", "Medium", "High", "Critical"]
STATUSES = ["Open", "Assigned", "In Progress", "Awaiting Verification", "Closed", "Cancelled"]
TRADES = [
    "General Builder", "Bricklayer", "Carpenter / Joiner", "Plumber", "Electrician",
    "Plasterer", "Painter & Decorator", "Roofer", "Tiler", "Flooring",
    "Kitchen Fitter", "Bathroom Fitter", "Landscaper", "Groundworker",
    "Heating Engineer", "Glazier", "Renderer", "Dryliner", "Cleaner",
    "Client / End User", "Other",
]
CATEGORIES = [
    "Cosmetic / Finish", "Damage", "Missing Item", "Snag / Rework",
    "Fault / Defect", "Safety Issue", "Non-Conformance", "Commissioning",
    "Cleaning", "Health & Safety", "Building Regs / Compliance", "Warranty",
]
COMMON_AREAS = [
    "External", "Front Elevation", "Rear Elevation", "Side Elevation", "Roof",
    "Garden", "Driveway", "Garage",
    "Hallway", "Landing", "Stairwell",
    "Kitchen", "Utility", "Living Room", "Dining Room", "Snug", "Study",
    "Bedroom 1", "Bedroom 2", "Bedroom 3", "Bedroom 4", "Bedroom 5",
    "Bathroom", "Ensuite", "WC", "Cloakroom",
    "Loft", "Basement", "Plant Room", "Communal",
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


class SnagIn(BaseModel):
    projectId: Optional[str] = ""
    projectName: Optional[str] = ""
    projectAddress: Optional[str] = ""

    snagRef: Optional[str] = ""
    title: str
    description: Optional[str] = ""
    location: Optional[str] = ""  # detailed spot within the area (e.g. "under the sink")
    area: Optional[str] = ""      # room / zone
    trade: Optional[str] = "General Builder"
    category: Optional[str] = "Cosmetic / Finish"

    priority: Optional[str] = "Medium"
    status: Optional[str] = "Open"

    assignedTo: Optional[str] = ""
    assignedEmail: Optional[str] = ""
    assignedCompany: Optional[str] = ""
    dueDate: Optional[str] = ""

    photosBefore: Optional[List[Dict[str, Any]]] = []
    photosAfter: Optional[List[Dict[str, Any]]] = []
    supportingDocs: Optional[List[Dict[str, Any]]] = []

    linkedContractId: Optional[str] = ""
    linkedSiteDiaryId: Optional[str] = ""

    signedOffBy: Optional[str] = ""
    signedOffDate: Optional[str] = ""


class SnagUpdate(BaseModel):
    projectId: Optional[str] = None
    projectName: Optional[str] = None
    projectAddress: Optional[str] = None
    snagRef: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    area: Optional[str] = None
    trade: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    assignedTo: Optional[str] = None
    assignedEmail: Optional[str] = None
    assignedCompany: Optional[str] = None
    dueDate: Optional[str] = None
    photosBefore: Optional[List[Dict[str, Any]]] = None
    photosAfter: Optional[List[Dict[str, Any]]] = None
    supportingDocs: Optional[List[Dict[str, Any]]] = None
    linkedContractId: Optional[str] = None
    linkedSiteDiaryId: Optional[str] = None
    signedOffBy: Optional[str] = None
    signedOffDate: Optional[str] = None


class StatusChange(BaseModel):
    status: str
    note: Optional[str] = ""


class AssignIn(BaseModel):
    assignedTo: str
    assignedEmail: Optional[str] = ""
    assignedCompany: Optional[str] = ""
    dueDate: Optional[str] = ""


class CommentIn(BaseModel):
    text: str


class PhotoIn(BaseModel):
    kind: str  # "before" | "after"
    url: str
    caption: Optional[str] = ""
    thumbnailUrl: Optional[str] = ""


class VerifyIn(BaseModel):
    verifiedBy: Optional[str] = ""
    completionDate: Optional[str] = ""
    verificationNote: Optional[str] = ""
    verifierSignature: Optional[str] = ""
    # legacy alias — older clients may still send `note`
    note: Optional[str] = ""


class TemplateIn(BaseModel):
    name: str
    payload: Dict[str, Any]


def _shape(doc: dict) -> dict:
    d = dict(doc); d.pop("_id", None); return d


def _live_view(s: dict, today: str) -> dict:
    d = _shape(s)
    due = d.get("dueDate") or ""
    st = d.get("status") or "Open"
    d["isOverdue"] = bool(due and due < today and st not in ("Closed", "Cancelled"))
    d["photosBeforeCount"] = len(d.get("photosBefore") or [])
    d["photosAfterCount"] = len(d.get("photosAfter") or [])
    d["commentsCount"] = len(d.get("comments") or [])
    return d


def build_router(db, get_user):
    router = APIRouter(prefix="/api/snagging", tags=["snagging"])

    async def _seq_ref(user: dict) -> str:
        year = datetime.now(timezone.utc).year
        res = await db.users.find_one_and_update(
            {"id": user["id"]}, {"$inc": {"snagCounter": 1}}, return_document=True,
        )
        seq = (res or {}).get("snagCounter", 1)
        return f"SNG-{year}-{seq:04d}"

    def _history_entry(user, kind: str, note: str = "", **extra) -> dict:
        return {"id": str(uuid.uuid4()), "at": _now_iso(),
                "by": (user or {}).get("fullName") or (user or {}).get("username"),
                "kind": kind, "note": note, **extra}

    @router.get("/reference")
    async def reference():
        return {
            "priorities": PRIORITIES,
            "statuses": STATUSES,
            "trades": TRADES,
            "categories": CATEGORIES,
            "commonAreas": COMMON_AREAS,
        }

    @router.get("/snags")
    async def list_snags(
        projectId: Optional[str] = None,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        assignedTo: Optional[str] = None,
        overdue: Optional[bool] = None,
        assignedToMe: Optional[bool] = None,
        q: Optional[str] = None,
        authorization: Optional[str] = Header(None),
    ):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        query: Dict[str, Any] = {"userId": user["id"], "isDeleted": {"$ne": True}}
        if projectId: query["projectId"] = projectId
        if status: query["status"] = status
        if priority: query["priority"] = priority
        if assignedTo: query["assignedTo"] = assignedTo
        rows = await db.snags.find(query).sort("updatedAt", -1).to_list(2000)
        today = _today()
        if q:
            needle = q.lower()
            def _hay(r):
                return " ".join(str(r.get(k, "") or "") for k in (
                    "snagRef", "title", "description", "location", "area",
                    "projectName", "assignedTo", "trade", "category",
                )).lower()
            rows = [r for r in rows if needle in _hay(r)]
        if overdue:
            rows = [r for r in rows if (r.get("dueDate") or "") and r.get("dueDate") < today
                    and (r.get("status") or "") not in ("Closed", "Cancelled")]
        if assignedToMe:
            me = (user.get("fullName") or user.get("username") or user.get("email") or "").lower()
            rows = [r for r in rows if (r.get("assignedTo") or "").lower() == me
                    or (r.get("assignedEmail") or "").lower() == (user.get("email") or "").lower()]
        return [_live_view(r, today) for r in rows]

    @router.post("/snags")
    async def create_snag(body: SnagIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not (body.projectName or "").strip() and not (body.projectId or "").strip():
            raise HTTPException(status_code=400, detail="Project is required")
        if not body.title.strip():
            raise HTTPException(status_code=400, detail="Snag title is required")
        doc = body.model_dump()
        doc.update({
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "toolId": "snagging",
            "createdBy": user.get("fullName") or user.get("username"),
            "createdByEmail": user.get("email"),
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "verifiedAt": "",
            "verifiedBy": "",
            "closedAt": "",
            "reopenedAt": "",
            "completionDate": "",
            "comments": [],
            "history": [_history_entry(user, "created", f"Snag raised: {body.title}")],
            "isDeleted": False,
        })
        if not doc.get("snagRef"):
            doc["snagRef"] = await _seq_ref(user)
        # Auto-move status if assigned on creation
        if doc.get("assignedTo") and doc.get("status") == "Open":
            doc["status"] = "Assigned"
            doc["history"].append(_history_entry(user, "assigned", f"Assigned to {doc.get('assignedTo')}"))
        await db.snags.insert_one(doc)
        return _live_view(doc, _today())

    @router.get("/snags/{sid}")
    async def get_snag(sid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.snags.find_one({"id": sid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        return _live_view(row, _today())

    @router.patch("/snags/{sid}")
    async def update_snag(sid: str, body: SnagUpdate, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.snags.find_one({"id": sid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        updates["updatedAt"] = _now_iso()
        await db.snags.update_one({"id": sid}, {"$set": updates})
        return _live_view(await db.snags.find_one({"id": sid}), _today())

    @router.delete("/snags/{sid}")
    async def delete_snag(sid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.snags.find_one({"id": sid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.snags.update_one({"id": sid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    @router.post("/snags/{sid}/status")
    async def change_status(sid: str, body: StatusChange, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.snags.find_one({"id": sid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        if body.status not in STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        history = row.get("history") or []
        history.append(_history_entry(user, "status", body.note or "",
                                      **{"from": row.get("status"), "to": body.status}))
        upd: Dict[str, Any] = {"status": body.status, "history": history, "updatedAt": _now_iso()}
        if body.status == "Closed" and not row.get("closedAt"):
            upd["closedAt"] = _now_iso()
            upd["completionDate"] = row.get("completionDate") or _today()
        if body.status in ("Open", "Assigned") and row.get("closedAt"):
            upd["reopenedAt"] = _now_iso()
            upd["closedAt"] = ""
        await db.snags.update_one({"id": sid}, {"$set": upd})
        return _live_view(await db.snags.find_one({"id": sid}), _today())

    @router.post("/snags/{sid}/assign")
    async def assign(sid: str, body: AssignIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.snags.find_one({"id": sid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        if not body.assignedTo.strip():
            raise HTTPException(status_code=400, detail="assignedTo required")
        history = (row.get("history") or []) + [_history_entry(user, "assigned", f"Assigned to {body.assignedTo}")]
        new_status = row.get("status") or "Open"
        if new_status == "Open":
            new_status = "Assigned"
        upd = {
            "assignedTo": body.assignedTo, "assignedEmail": body.assignedEmail or "",
            "assignedCompany": body.assignedCompany or "",
            "status": new_status, "history": history, "updatedAt": _now_iso(),
        }
        if body.dueDate:
            upd["dueDate"] = body.dueDate
        await db.snags.update_one({"id": sid}, {"$set": upd})
        return _live_view(await db.snags.find_one({"id": sid}), _today())

    @router.post("/snags/{sid}/comment")
    async def add_comment(sid: str, body: CommentIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.snags.find_one({"id": sid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        if not body.text.strip():
            raise HTTPException(status_code=400, detail="Comment text required")
        c = {"id": str(uuid.uuid4()), "text": body.text.strip(), "at": _now_iso(),
             "by": user.get("fullName") or user.get("username"),
             "byEmail": user.get("email")}
        comments = list(row.get("comments") or []) + [c]
        history = (row.get("history") or []) + [_history_entry(user, "comment", body.text.strip()[:120])]
        await db.snags.update_one({"id": sid}, {"$set": {"comments": comments, "history": history, "updatedAt": _now_iso()}})
        return _live_view(await db.snags.find_one({"id": sid}), _today())

    @router.delete("/snags/{sid}/comment/{cid}")
    async def del_comment(sid: str, cid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.snags.find_one({"id": sid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        comments = [c for c in (row.get("comments") or []) if c.get("id") != cid]
        await db.snags.update_one({"id": sid}, {"$set": {"comments": comments, "updatedAt": _now_iso()}})
        return _live_view(await db.snags.find_one({"id": sid}), _today())

    @router.post("/snags/{sid}/verify")
    async def verify(sid: str, body: VerifyIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.snags.find_one({"id": sid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        # --- Required verification info -----------------------------------
        # Verifier name, signature and at least one "after" photo must be
        # supplied before a snag can be closed. Missing fields return a
        # clear 400 so the UI can surface exactly what is missing.
        missing: List[str] = []
        if not (body.verifiedBy or "").strip():
            missing.append("verifier name")
        if not (body.verifierSignature or "").strip():
            missing.append("signature")
        if not (row.get("photosAfter") or []):
            missing.append("at least one 'after' photo")
        if missing:
            raise HTTPException(
                status_code=400,
                detail="Cannot close: missing " + ", ".join(missing) + ".",
            )
        verification_note = (body.verificationNote or body.note or "Snag verified as complete").strip()
        completion_date = (body.completionDate or "").strip() or row.get("completionDate") or _today()
        history = (row.get("history") or []) + [
            _history_entry(
                user, "verified", verification_note,
                completionDate=completion_date,
                verifiedBy=body.verifiedBy,
            )
        ]
        upd = {
            "verifiedAt": _now_iso(),
            "verifiedBy": (body.verifiedBy or "").strip(),
            "verifierSignature": body.verifierSignature or "",
            "verificationNote": verification_note,
            "status": "Closed",
            "closedAt": _now_iso(),
            "completionDate": completion_date,
            "history": history,
            "updatedAt": _now_iso(),
        }
        await db.snags.update_one({"id": sid}, {"$set": upd})
        return _live_view(await db.snags.find_one({"id": sid}), _today())

    @router.post("/snags/{sid}/close")
    async def close(sid: str, authorization: Optional[str] = Header(None)):
        return await change_status(sid, StatusChange(status="Closed", note="Snag closed"), authorization)

    @router.post("/snags/{sid}/reopen")
    async def reopen(sid: str, authorization: Optional[str] = Header(None)):
        # Reopen preserves prior verification history & signature. The
        # per-status handler already appends a status audit event, but we
        # add a dedicated "reopened" entry that records who reopened the
        # snag alongside the previous verifier — so nothing is lost.
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.snags.find_one({"id": sid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        prev_verifier = row.get("verifiedBy") or ""
        note = f"Snag reopened. Previous verifier: {prev_verifier}" if prev_verifier else "Snag reopened"
        history = (row.get("history") or []) + [_history_entry(user, "reopened", note)]
        await db.snags.update_one({"id": sid}, {"$set": {"history": history, "updatedAt": _now_iso()}})
        return await change_status(sid, StatusChange(status="Open", note=note), authorization)

    @router.post("/snags/{sid}/photos")
    async def add_photo(sid: str, body: PhotoIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.snags.find_one({"id": sid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        if body.kind not in ("before", "after"):
            raise HTTPException(status_code=400, detail="kind must be 'before' or 'after'")
        photo = {"id": str(uuid.uuid4()), "url": body.url,
                 "caption": body.caption or "", "thumbnailUrl": body.thumbnailUrl or "",
                 "uploadedAt": _now_iso(),
                 "uploadedBy": user.get("fullName") or user.get("username")}
        key = "photosBefore" if body.kind == "before" else "photosAfter"
        photos = list(row.get(key) or []) + [photo]
        history = (row.get("history") or []) + [_history_entry(user, "photo_added", f"{body.kind.capitalize()} photo attached")]
        await db.snags.update_one({"id": sid}, {"$set": {key: photos, "history": history, "updatedAt": _now_iso()}})
        return _live_view(await db.snags.find_one({"id": sid}), _today())

    @router.delete("/snags/{sid}/photos/{pid}")
    async def del_photo(sid: str, pid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.snags.find_one({"id": sid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        b = [p for p in (row.get("photosBefore") or []) if p.get("id") != pid]
        a = [p for p in (row.get("photosAfter") or []) if p.get("id") != pid]
        await db.snags.update_one({"id": sid}, {"$set": {"photosBefore": b, "photosAfter": a, "updatedAt": _now_iso()}})
        return _live_view(await db.snags.find_one({"id": sid}), _today())

    @router.get("/stats")
    async def stats(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.snags.find({"userId": user["id"], "isDeleted": {"$ne": True}}).to_list(5000)
        today = _today()
        counts = {s: 0 for s in STATUSES}
        pri = {p: 0 for p in PRIORITIES}
        overdue = 0
        closed_today = 0
        my_assigned = 0
        me = (user.get("fullName") or user.get("username") or "").lower()
        my_email = (user.get("email") or "").lower()
        recent: List[Dict[str, Any]] = []
        for r in rows:
            st = r.get("status") or "Open"
            counts[st] = counts.get(st, 0) + 1
            p = r.get("priority") or "Medium"
            pri[p] = pri.get(p, 0) + 1
            due = r.get("dueDate") or ""
            if due and due < today and st not in ("Closed", "Cancelled"):
                overdue += 1
            closed_at = r.get("closedAt") or ""
            if closed_at.startswith(today):
                closed_today += 1
            if st not in ("Closed", "Cancelled") and (
                (r.get("assignedTo") or "").lower() == me
                or (r.get("assignedEmail") or "").lower() == my_email and my_email != ""
            ):
                my_assigned += 1
            recent.append({
                "id": r.get("id"), "snagRef": r.get("snagRef"),
                "title": r.get("title"),
                "projectName": r.get("projectName"),
                "area": r.get("area"),
                "priority": p, "status": st,
                "assignedTo": r.get("assignedTo"),
                "dueDate": due, "updatedAt": r.get("updatedAt"),
                "isOverdue": bool(due and due < today and st not in ("Closed", "Cancelled")),
            })
        recent.sort(key=lambda x: x.get("updatedAt") or "", reverse=True)
        open_total = counts.get("Open", 0) + counts.get("Assigned", 0) + counts.get("In Progress", 0) + counts.get("Awaiting Verification", 0)
        return {
            "total": len(rows),
            "open": open_total,
            "assigned": counts.get("Assigned", 0),
            "inProgress": counts.get("In Progress", 0),
            "awaitingVerification": counts.get("Awaiting Verification", 0),
            "closed": counts.get("Closed", 0),
            "highPriority": pri.get("High", 0) + pri.get("Critical", 0),
            "critical": pri.get("Critical", 0),
            "overdue": overdue,
            "closedToday": closed_today,
            "assignedToMe": my_assigned,
            "byPriority": pri,
            "byStatus": counts,
            "recent": recent[:10],
        }

    @router.get("/project/{job_id}/summary")
    async def project_summary(job_id: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.snags.find({"userId": user["id"], "projectId": job_id, "isDeleted": {"$ne": True}}).to_list(2000)
        total = len(rows)
        closed = sum(1 for r in rows if (r.get("status") or "") == "Closed")
        open_ = total - closed
        pct = round((closed / total * 100), 1) if total > 0 else 0.0
        pri = {p: 0 for p in PRIORITIES}
        by_area: Dict[str, int] = {}
        by_trade: Dict[str, int] = {}
        for r in rows:
            pri[r.get("priority") or "Medium"] = pri.get(r.get("priority") or "Medium", 0) + 1
            a = (r.get("area") or "Unassigned").strip() or "Unassigned"
            by_area[a] = by_area.get(a, 0) + 1
            t = (r.get("trade") or "Unassigned").strip() or "Unassigned"
            by_trade[t] = by_trade.get(t, 0) + 1
        today = _today()
        snags_out = [_live_view(r, today) for r in rows]
        return {
            "projectId": job_id,
            "totalSnags": total, "openSnags": open_, "closedSnags": closed,
            "percentComplete": pct,
            "byPriority": pri,
            "byArea": by_area, "byTrade": by_trade,
            "snags": snags_out,
        }

    # ---- Templates ----
    @router.get("/templates")
    async def list_templates(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.snag_templates.find({"userId": user["id"], "isDeleted": {"$ne": True}}).sort("updatedAt", -1).to_list(500)
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
        await db.snag_templates.insert_one(doc)
        return _shape(doc)

    @router.delete("/templates/{tid}")
    async def delete_template(tid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.snag_templates.find_one({"id": tid, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        await db.snag_templates.update_one({"id": tid}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}})
        return {"ok": True}

    return router


async def collect_snagging_attention(db, user_id: str, now: datetime, limit: int = 15) -> list:
    """Attention items:
      • Snag overdue (dueDate past, not closed) — snag_overdue
      • Critical priority snag still open — snag_critical
      • Snag in Awaiting Verification for 7+ days — snag_awaiting_verification
    """
    items: List[Dict[str, Any]] = []
    today = now.date().isoformat()
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    rows = await db.snags.find({"userId": user_id, "isDeleted": {"$ne": True},
                                "status": {"$in": ["Open", "Assigned", "In Progress", "Awaiting Verification"]}}).to_list(500)
    for r in rows:
        sid = r.get("id")
        ref = r.get("snagRef") or ""
        title = r.get("title") or "Snag"
        st = r.get("status") or ""
        pri = r.get("priority") or "Medium"
        due = r.get("dueDate") or ""
        if due and due < today:
            items.append({
                "id": f"snag-overdue-{sid}", "kind": "snag_overdue",
                "title": f"Snag overdue: {title}",
                "subtitle": f"{ref} · {pri} priority · due {due}",
                "projectId": r.get("projectId"), "projectName": r.get("projectName"),
                "actionLabel": "Open snag",
                "actionRoute": f"/app/snagging-list?open={sid}",
                "severity": "warning" if pri != "Critical" else "critical", "dueAt": due,
            })
        elif pri == "Critical":
            items.append({
                "id": f"snag-critical-{sid}", "kind": "snag_critical",
                "title": f"Critical snag: {title}",
                "subtitle": f"{ref} · {r.get('projectName') or ''}",
                "projectId": r.get("projectId"), "projectName": r.get("projectName"),
                "actionLabel": "Open snag",
                "actionRoute": f"/app/snagging-list?open={sid}",
                "severity": "critical", "dueAt": due or r.get("updatedAt", ""),
            })
        elif st == "Awaiting Verification" and (r.get("updatedAt") or "") < seven_days_ago:
            items.append({
                "id": f"snag-awaiting-{sid}", "kind": "snag_awaiting_verification",
                "title": f"Verify snag: {title}",
                "subtitle": f"{ref} · awaiting sign-off",
                "projectId": r.get("projectId"), "projectName": r.get("projectName"),
                "actionLabel": "Open snag",
                "actionRoute": f"/app/snagging-list?open={sid}",
                "severity": "info", "dueAt": r.get("updatedAt", ""),
            })
    return items[:limit]
