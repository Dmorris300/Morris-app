"""Morris Project Workspace — tasks, events, stats, project-scoped search.

Backed by two new MongoDB collections:
  project_tasks:  { id, userId, jobId, title, description?, status, kind?,
                    dueDate?, createdAt, updatedAt, completedAt? }
  project_events: { id, userId, jobId, kind, title, subtitle?,
                    refDocId?, refDraftId?, createdAt }

emit_event() is called from other server routes on major project actions.
Photo-upload events are deduped to once-per-day-per-project to avoid spam.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

TASK_STATUSES = ["not_started", "in_progress", "completed"]

# Event kinds — kept flat and stable. Frontend renders icons/labels from this list.
EVENT_KINDS = {
    "project_created": "Project created",
    "project_updated": "Project updated",
    "status_changed":  "Status changed",
    "rams_created":    "RAMS created",
    "rams_updated":    "RAMS updated",
    "site_diary_created": "Site diary logged",
    "variation_submitted": "Variation submitted",
    "variation_approved":  "Variation approved",
    "invoice_generated": "Invoice generated",
    "application_submitted": "Application for payment submitted",
    "payment_received": "Payment received",
    "photo_uploaded":   "Photos uploaded",
    "task_created":     "Task created",
    "task_completed":   "Task completed",
    "chase_sent":       "Payment chase sent",
    "document_saved":   "Document saved",
    "project_completed": "Project completed",
    "project_archived":  "Project archived",
}


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    status: Optional[str] = "not_started"
    kind: Optional[str] = None
    dueDate: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    kind: Optional[str] = None
    dueDate: Optional[str] = None


async def emit_event(
    db,
    user: dict,
    job_id: str,
    kind: str,
    title: str,
    subtitle: str = "",
    ref_doc_id: Optional[str] = None,
    ref_draft_id: Optional[str] = None,
    dedupe_per_day: bool = False,
) -> Optional[str]:
    """Write a project_events row. No-op if job_id is missing.

    When dedupe_per_day is True we skip if an event of the same kind was
    already written for this project on the current UTC day (used for
    'photos uploaded' so we don't get 40 events from a single upload burst).
    """
    if not job_id:
        return None
    now = datetime.now(timezone.utc)
    if dedupe_per_day:
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        existing = await db.project_events.find_one({
            "userId": user["id"],
            "jobId": job_id,
            "kind": kind,
            "createdAt": {"$gte": day_start},
        })
        if existing:
            return existing.get("id")
    doc = {
        "id": str(uuid.uuid4()),
        "userId": user["id"],
        "jobId": job_id,
        "kind": kind,
        "title": title,
        "subtitle": subtitle or "",
        "refDocId": ref_doc_id,
        "refDraftId": ref_draft_id,
        "createdAt": now.isoformat(),
    }
    await db.project_events.insert_one(doc)
    return doc["id"]


def build_router(db, get_user):
    router = APIRouter(prefix="/api", tags=["project-workspace"])

    def _shape(d: dict) -> dict:
        out = dict(d)
        out.pop("_id", None)
        return out

    # ---------- Tasks ----------

    @router.post("/jobs/{job_id}/tasks")
    async def create_task(job_id: str, body: TaskCreate, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        # Confirm the user owns the job
        job = await db.jobs.find_one({"id": job_id, "userId": user["id"]})
        if not job:
            raise HTTPException(404, "Project not found")
        status = body.status or "not_started"
        if status not in TASK_STATUSES:
            raise HTTPException(400, f"Status must be one of {TASK_STATUSES}")
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "jobId": job_id,
            "title": body.title.strip(),
            "description": (body.description or "").strip(),
            "status": status,
            "kind": body.kind,
            "dueDate": body.dueDate,
            "createdAt": now,
            "updatedAt": now,
            "completedAt": now if status == "completed" else None,
        }
        await db.project_tasks.insert_one(doc)
        await emit_event(db, user, job_id, "task_created", f"Task added: {doc['title']}")
        return _shape(doc)

    @router.get("/jobs/{job_id}/tasks")
    async def list_tasks(job_id: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.project_tasks.find({"userId": user["id"], "jobId": job_id}).sort("createdAt", -1).to_list(500)
        return [_shape(r) for r in rows]

    @router.patch("/tasks/{task_id}")
    async def update_task(task_id: str, body: TaskUpdate, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        existing = await db.project_tasks.find_one({"id": task_id, "userId": user["id"]})
        if not existing:
            raise HTTPException(404, "Task not found")
        upd = {k: v for k, v in body.model_dump().items() if v is not None}
        if "status" in upd and upd["status"] not in TASK_STATUSES:
            raise HTTPException(400, f"Status must be one of {TASK_STATUSES}")
        upd["updatedAt"] = datetime.now(timezone.utc).isoformat()
        was_completed = existing.get("status") == "completed"
        will_be_completed = upd.get("status") == "completed" if "status" in upd else was_completed
        if will_be_completed and not was_completed:
            upd["completedAt"] = upd["updatedAt"]
        await db.project_tasks.update_one({"id": task_id, "userId": user["id"]}, {"$set": upd})
        # Fire completed event once
        if will_be_completed and not was_completed:
            await emit_event(db, user, existing["jobId"], "task_completed", f"Task completed: {existing['title']}")
        updated = await db.project_tasks.find_one({"id": task_id, "userId": user["id"]})
        return _shape(updated)

    @router.delete("/tasks/{task_id}")
    async def delete_task(task_id: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        result = await db.project_tasks.delete_one({"id": task_id, "userId": user["id"]})
        if result.deleted_count == 0:
            raise HTTPException(404, "Task not found")
        return {"ok": True}

    # ---------- Events ----------

    @router.get("/jobs/{job_id}/events")
    async def list_events(job_id: str, limit: int = 200, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.project_events.find({"userId": user["id"], "jobId": job_id}).sort("createdAt", -1).to_list(limit)
        return [_shape(r) for r in rows]

    # ---------- Stats ----------

    @router.get("/jobs/{job_id}/stats")
    async def stats(job_id: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        uid = user["id"]
        job = await db.jobs.find_one({"id": job_id, "userId": uid})
        if not job:
            raise HTTPException(404, "Project not found")

        # Media split by kind
        media_pipeline = [
            {"$match": {"userId": uid, "jobId": job_id, "isDeleted": {"$ne": True}}},
            {"$group": {"_id": "$kind", "n": {"$sum": 1}}},
        ]
        media_counts = {r["_id"]: r["n"] for r in await db.media_items.aggregate(media_pipeline).to_list(20)}

        # Documents
        documents = await db.documents.count_documents({"userId": uid, "jobId": job_id})
        # Drafts related to this job (via data.jobId)
        drafts = await db.drafts.count_documents({"userId": uid, "$or": [{"data.jobId": job_id}, {"jobId": job_id}]})
        # Site diaries — count via drafts + saved docs with the diary tool ids
        diary_docs = await db.documents.count_documents({
            "userId": uid, "jobId": job_id,
            "toolId": {"$in": ["site-diary", "multiuser-site-diary"]},
        })
        # Open variations = variation-letter drafts linked to this job
        open_variations = await db.drafts.count_documents({
            "userId": uid, "toolId": "variation-letter",
            "$or": [{"data.jobId": job_id}, {"jobId": job_id}],
        })
        # Include V2 variation-orders that are open (Draft / Submitted / In Progress)
        try:
            v2_open = await db.variation_orders.count_documents({
                "userId": uid, "projectId": job_id, "isDeleted": {"$ne": True},
                "status": {"$in": ["Draft", "Submitted", "In Progress"]},
            })
            open_variations += v2_open
        except Exception:
            pass
        # Approved variation orders — added onto the linked project's commercial value
        approved_variations_value = 0.0
        try:
            async for r in db.variation_orders.find({
                "userId": uid, "projectId": job_id, "isDeleted": {"$ne": True},
                "status": "Approved",
            }):
                approved_variations_value += float(((r.get("totals") or {}).get("total")) or 0)
        except Exception:
            pass
        # Applications submitted
        applications = await db.documents.count_documents({
            "userId": uid, "jobId": job_id, "toolId": "application-for-payment",
        })

        # Tasks
        completed_tasks = await db.project_tasks.count_documents({"userId": uid, "jobId": job_id, "status": "completed"})
        open_tasks = await db.project_tasks.count_documents({"userId": uid, "jobId": job_id, "status": {"$in": ["not_started", "in_progress"]}})

        # Financial roll-up
        contract_value = float(job.get("contractValue") or 0)
        # Approved variations extend the effective commercial value of the project
        revised_contract_value = round(contract_value + approved_variations_value, 2)
        # Payments received — sum of payment_received event subtitles that parse to numbers
        received = 0.0
        async for ev in db.project_events.find({"userId": uid, "jobId": job_id, "kind": "payment_received"}):
            try:
                received += float((ev.get("subtitle") or "").replace("£", "").replace(",", "").split()[0])
            except (ValueError, IndexError):
                pass
        outstanding = revised_contract_value - received if job.get("status") not in ("paid", "completed") else 0.0
        outstanding = max(0.0, outstanding)

        # Recent activity (last 3 events)
        recent = await db.project_events.find({"userId": uid, "jobId": job_id}).sort("createdAt", -1).to_list(3)

        return {
            "documents": documents + drafts,
            "photos": media_counts.get("image", 0),
            "videos": media_counts.get("video", 0),
            "outstanding": outstanding,
            "amountPaid": received,
            "completedTasks": completed_tasks,
            "openTasks": open_tasks,
            "openVariations": open_variations,
            "approvedVariationsValue": round(approved_variations_value, 2),
            "originalContractValue": round(contract_value, 2),
            "revisedContractValue": revised_contract_value,
            "applications": applications,
            "siteDiaries": diary_docs,
            "recentActivity": [_shape(r) for r in recent],
        }

    # ---------- Search (project-scoped) ----------

    @router.get("/jobs/{job_id}/search")
    async def search(job_id: str, q: str = "", limit: int = 50, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        uid = user["id"]
        if not q.strip():
            return []
        rx = {"$regex": q.strip(), "$options": "i"}
        results = []

        # Documents
        async for d in db.documents.find({
            "userId": uid, "jobId": job_id,
            "$or": [{"title": rx}, {"content": rx}, {"toolId": rx}],
        }).sort("createdAt", -1).limit(limit):
            content = (d.get("content") or "")[:120]
            results.append({
                "kind": "document",
                "id": d["id"],
                "title": d.get("title") or "Document",
                "snippet": content,
                "route": f"/app/history?doc={d['id']}",
            })

        # Drafts
        async for d in db.drafts.find({
            "userId": uid,
            "$or": [
                {"data.jobId": job_id, "toolName": rx},
                {"data.jobId": job_id, "toolId": rx},
            ],
        }).sort("updatedAt", -1).limit(limit):
            results.append({
                "kind": "draft",
                "id": d["id"],
                "title": d.get("toolName") or d.get("toolId"),
                "snippet": "Draft in progress",
                "route": "/app/drafts",
            })

        # Media
        async for m in db.media_items.find({
            "userId": uid, "jobId": job_id, "isDeleted": {"$ne": True},
            "$or": [
                {"description": rx}, {"notes": rx}, {"originalFilename": rx},
                {"category": rx}, {"album": rx},
            ],
        }).sort("createdAt", -1).limit(limit):
            results.append({
                "kind": "media",
                "id": m["id"],
                "title": m.get("description") or m.get("originalFilename") or "Media",
                "snippet": m.get("category") or m.get("album") or "",
                "route": f"/app/photo-vault?jobId={job_id}",
            })

        # Tasks
        async for t in db.project_tasks.find({
            "userId": uid, "jobId": job_id,
            "$or": [{"title": rx}, {"description": rx}],
        }).sort("updatedAt", -1).limit(limit):
            results.append({
                "kind": "task",
                "id": t["id"],
                "title": t["title"],
                "snippet": t.get("description") or "",
                "route": f"/app/jobs/{job_id}?tab=tasks",
            })

        # Events
        async for e in db.project_events.find({
            "userId": uid, "jobId": job_id,
            "$or": [{"title": rx}, {"subtitle": rx}],
        }).sort("createdAt", -1).limit(limit):
            results.append({
                "kind": "event",
                "id": e["id"],
                "title": e["title"],
                "snippet": e.get("subtitle") or "",
                "route": f"/app/jobs/{job_id}?tab=timeline",
            })

        return results[:limit]

    # ---------- Payments (manual record) ----------

    class PaymentIn(BaseModel):
        amount: float
        note: Optional[str] = ""
        date: Optional[str] = None

    @router.post("/jobs/{job_id}/payments")
    async def record_payment(job_id: str, body: PaymentIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        job = await db.jobs.find_one({"id": job_id, "userId": user["id"]})
        if not job:
            raise HTTPException(404, "Project not found")
        subtitle = f"£{body.amount:,.2f}"
        if body.note:
            subtitle += f" — {body.note}"
        await emit_event(db, user, job_id, "payment_received", "Payment received", subtitle)
        return {"ok": True}

    return router
