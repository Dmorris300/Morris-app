"""Morris — Signature Vault.

Save reusable signatures against a user so they can pick one to apply on
Site Diary sign-off, Snag sign-off, Quote acceptance etc. without redrawing.

Endpoints (all /api/signatures/vault):
  • GET    /                  — list saved signatures (most recent first)
  • POST   /                  — save a new signature
  • DELETE /{sid}             — remove a saved signature

Stored inside the user document as `savedSignatures: [{id,label,dataUrl,createdAt}]`.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel


class VaultIn(BaseModel):
    label: Optional[str] = "My signature"
    dataUrl: str


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_router(db, get_user):
    router = APIRouter(prefix="/api/signatures/vault", tags=["signature-vault"])

    @router.get("")
    async def list_signatures(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.users.find_one({"id": user["id"]})
        sigs: List[Dict[str, Any]] = (row or {}).get("savedSignatures") or []
        sigs.sort(key=lambda s: s.get("createdAt") or "", reverse=True)
        return sigs

    @router.post("")
    async def save_signature(body: VaultIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not (body.dataUrl or "").startswith("data:image"):
            raise HTTPException(400, "Invalid signature data")
        if len(body.dataUrl) > 500_000:  # keep vault light — 500KB per sig max
            raise HTTPException(400, "Signature image too large (max 500KB)")
        row = await db.users.find_one({"id": user["id"]})
        sigs: List[Dict[str, Any]] = list((row or {}).get("savedSignatures") or [])
        if len(sigs) >= 10:
            raise HTTPException(400, "Vault full (max 10 saved signatures — delete one first)")
        sig = {
            "id": str(uuid.uuid4()),
            "label": (body.label or "My signature").strip()[:60],
            "dataUrl": body.dataUrl,
            "createdAt": _now_iso(),
        }
        sigs.insert(0, sig)
        await db.users.update_one({"id": user["id"]}, {"$set": {"savedSignatures": sigs, "updatedAt": _now_iso()}})
        return sig

    @router.delete("/{sid}")
    async def delete_signature(sid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.users.find_one({"id": user["id"]})
        sigs: List[Dict[str, Any]] = list((row or {}).get("savedSignatures") or [])
        new_sigs = [s for s in sigs if s.get("id") != sid]
        if len(new_sigs) == len(sigs):
            raise HTTPException(404, "Not found")
        await db.users.update_one({"id": user["id"]}, {"$set": {"savedSignatures": new_sigs, "updatedAt": _now_iso()}})
        return {"ok": True}

    return router
