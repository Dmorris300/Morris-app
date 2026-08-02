"""Morris — Method Statement work-sequence templates.

A user-scoped library of reusable work-sequence templates. Each template stores
an ordered list of numbered steps that can be dropped into the Method Statement
wizard at Step 3.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class StepIn(BaseModel):
    title: str
    description: Optional[str] = ""


class TemplateIn(BaseModel):
    name: str
    steps: List[StepIn]


def build_router(db, get_user):
    router = APIRouter(prefix="/api/method-statement", tags=["method-statement"])

    def _shape(doc: dict) -> dict:
        d = dict(doc)
        d.pop("_id", None)
        return d

    @router.get("/templates")
    async def list_templates(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.method_statement_templates.find(
            {"userId": user["id"], "isDeleted": {"$ne": True}}
        ).sort("updatedAt", -1).to_list(500)
        return [_shape(r) for r in rows]

    @router.post("/templates")
    async def create_template(body: TemplateIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not body.name.strip():
            raise HTTPException(status_code=400, detail="Name is required")
        if not body.steps:
            raise HTTPException(status_code=400, detail="At least one step is required")
        doc = {
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "name": body.name.strip(),
            "steps": [{"title": s.title.strip(), "description": (s.description or "").strip()} for s in body.steps if s.title.strip()],
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "isDeleted": False,
        }
        await db.method_statement_templates.insert_one(doc)
        return _shape(doc)

    @router.delete("/templates/{template_id}")
    async def delete_template(template_id: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.method_statement_templates.find_one({
            "id": template_id, "userId": user["id"], "isDeleted": {"$ne": True},
        })
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        await db.method_statement_templates.update_one(
            {"id": template_id}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}}
        )
        return {"ok": True}

    return router
