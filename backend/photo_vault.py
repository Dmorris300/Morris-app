"""Morris Photo Vault — object-storage-backed media library.

Storage layout in Emergent Object Storage:
  morris/media/{user_id}/{uuid}.{ext}          # original
  morris/media/{user_id}/{uuid}.thumb.jpg      # small thumbnail (~400px square, images only)
  morris/media/{user_id}/{uuid}.poster.jpg     # video first-frame poster (frontend-generated)

MongoDB `media_items` document (source of truth — storage has no list/rename/delete):
  {
    id, userId,
    originalFilename, mimeType, kind: "image"|"video",
    size,                                   # bytes of original
    storagePath, thumbPath, posterPath,
    project, jobId, client, site,           # linkage
    category,                               # one of MEDIA_CATEGORIES or "Other"
    customCategory,                         # free text when category == "Other"
    description, notes,
    favourite: bool,
    uploader,                               # user's display name at upload time
    dateTaken,                              # ISO date (from EXIF if provided, else upload date)
    createdAt, updatedAt,
    isDeleted: bool,
    usage: [ { docId, docType, docTitle, addedAt } ]  # cross-doc reference tracking
  }
"""

import os
import uuid
import io
import logging
import mimetypes
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

import requests
from fastapi import APIRouter, HTTPException, Header, UploadFile, File, Form, Query, Response
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "morris"

_storage_key: Optional[str] = None


def _emergent_key() -> str:
    # Read lazily so load_dotenv() has a chance to fire before we check.
    return os.environ.get("EMERGENT_LLM_KEY", "")

MEDIA_CATEGORIES = [
    "Before Works", "Completed Works", "Damage", "Defects", "Deliveries",
    "Health & Safety", "Materials", "Progress", "Snagging", "Variations", "Other",
]

IMAGE_MIMES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"}
VIDEO_MIMES = {"video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/x-msvideo"}


def _init_storage() -> str:
    """Call once. Returns a session-scoped storage_key."""
    global _storage_key
    if _storage_key:
        return _storage_key
    key_val = _emergent_key()
    if not key_val:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": key_val}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _put_object(path: str, data: bytes, content_type: str) -> Dict[str, Any]:
    key = _init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=180,
    )
    if resp.status_code == 403:
        # Force re-init on expired key and retry once.
        global _storage_key
        _storage_key = None
        key = _init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=180,
        )
    resp.raise_for_status()
    return resp.json()


def _get_object(path: str) -> tuple[bytes, str]:
    key = _init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=120,
    )
    if resp.status_code == 403:
        global _storage_key
        _storage_key = None
        key = _init_storage()
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=120,
        )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def _classify(mime: str) -> str:
    m = (mime or "").lower()
    if m in IMAGE_MIMES or m.startswith("image/"):
        return "image"
    if m in VIDEO_MIMES or m.startswith("video/"):
        return "video"
    return "other"


def _uploader_name(user: dict) -> str:
    return user.get("fullName") or user.get("username") or "Unknown"


# -------------------- Pydantic models --------------------

class MediaUpdate(BaseModel):
    project: Optional[str] = None
    jobId: Optional[str] = None
    client: Optional[str] = None
    site: Optional[str] = None
    category: Optional[str] = None
    customCategory: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    favourite: Optional[bool] = None
    dateTaken: Optional[str] = None


class MediaUsage(BaseModel):
    docId: str
    docType: str
    docTitle: Optional[str] = ""


# -------------------- Router --------------------

def build_router(db, get_user):
    router = APIRouter(prefix="/api/media", tags=["media"])

    def _shape(doc: dict) -> dict:
        """Return a JSON-safe copy suitable for API responses."""
        d = dict(doc)
        d.pop("_id", None)
        return d

    @router.get("/categories")
    async def list_categories():
        return {"categories": MEDIA_CATEGORIES}

    @router.get("/stats")
    async def stats(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        base = {"userId": user["id"], "isDeleted": {"$ne": True}}
        total = await db.media_items.count_documents(base)
        unassigned = await db.media_items.count_documents({**base, "$or": [{"jobId": None}, {"jobId": ""}, {"jobId": {"$exists": False}}]})
        favourites = await db.media_items.count_documents({**base, "favourite": True})
        # Recently added = last 30 days
        thirty_days_ago = (datetime.now(timezone.utc) - _td(30)).isoformat()
        recent = await db.media_items.count_documents({**base, "createdAt": {"$gte": thirty_days_ago}})
        return {"total": total, "unassigned": unassigned, "favourites": favourites, "recent": recent}

    @router.get("")
    async def list_media(
        authorization: Optional[str] = Header(None),
        section: str = Query("all"),          # all | unassigned | favourites | recent | project
        jobId: Optional[str] = Query(None),
        category: Optional[str] = Query(None),
        q: Optional[str] = Query(None),
        dateFrom: Optional[str] = Query(None),
        dateTo: Optional[str] = Query(None),
        limit: int = Query(500, ge=1, le=2000),
    ):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        filt: Dict[str, Any] = {"userId": user["id"], "isDeleted": {"$ne": True}}

        if section == "unassigned":
            filt["$or"] = [{"jobId": None}, {"jobId": ""}, {"jobId": {"$exists": False}}]
        elif section == "favourites":
            filt["favourite"] = True
        elif section == "recent":
            filt["createdAt"] = {"$gte": (datetime.now(timezone.utc) - _td(30)).isoformat()}
        elif section == "project" and jobId:
            filt["jobId"] = jobId

        if category:
            filt["category"] = category
        if jobId and section != "project":
            filt["jobId"] = jobId
        if dateFrom or dateTo:
            dt: Dict[str, Any] = {}
            if dateFrom:
                dt["$gte"] = dateFrom
            if dateTo:
                dt["$lte"] = dateTo
            filt["dateTaken"] = dt
        if q:
            rx = {"$regex": q, "$options": "i"}
            filt["$and"] = filt.get("$and", []) + [{
                "$or": [
                    {"description": rx}, {"notes": rx}, {"originalFilename": rx},
                    {"project": rx}, {"client": rx}, {"site": rx}, {"category": rx},
                ]
            }]

        items = await db.media_items.find(filt).sort("createdAt", -1).to_list(limit)
        return [_shape(x) for x in items]

    @router.get("/{media_id}")
    async def get_media(media_id: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        doc = await db.media_items.find_one({"id": media_id, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not doc:
            raise HTTPException(404, "Media not found")
        return _shape(doc)

    @router.post("")
    async def upload_media(
        authorization: Optional[str] = Header(None),
        file: UploadFile = File(...),
        thumbnail: Optional[UploadFile] = File(None),   # optional pre-generated thumbnail from frontend
        poster: Optional[UploadFile] = File(None),      # optional video poster from frontend
        project: Optional[str] = Form(None),
        jobId: Optional[str] = Form(None),
        client: Optional[str] = Form(None),
        site: Optional[str] = Form(None),
        category: Optional[str] = Form(None),
        customCategory: Optional[str] = Form(None),
        description: Optional[str] = Form(""),
        notes: Optional[str] = Form(""),
        dateTaken: Optional[str] = Form(None),
    ):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)

        raw = await file.read()
        if not raw:
            raise HTTPException(400, "Empty file")

        # Cap uploads at 100 MB. Anything larger should use the chunked flow (future).
        if len(raw) > 100 * 1024 * 1024:
            raise HTTPException(413, "File too large — maximum 100 MB")

        mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
        kind = _classify(mime)
        if kind == "other":
            raise HTTPException(415, "Only images and videos are supported")

        media_id = str(uuid.uuid4())
        ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else (
            "jpg" if kind == "image" else "mp4"
        )
        # Sanitise: keep only alphanumeric
        ext = "".join(ch for ch in ext if ch.isalnum())[:6] or ("jpg" if kind == "image" else "mp4")

        base_path = f"{APP_NAME}/media/{user['id']}/{media_id}"
        original_path = f"{base_path}.{ext}"
        thumb_path = f"{base_path}.thumb.jpg"
        poster_path = f"{base_path}.poster.jpg"

        try:
            put_original = _put_object(original_path, raw, mime)
        except requests.HTTPError as e:
            logger.error(f"Storage upload failed: {e}")
            raise HTTPException(502, f"Storage upload failed")

        thumb_uploaded = False
        if thumbnail is not None:
            try:
                t_raw = await thumbnail.read()
                if t_raw:
                    _put_object(thumb_path, t_raw, thumbnail.content_type or "image/jpeg")
                    thumb_uploaded = True
            except Exception as e:
                logger.warning(f"Thumbnail upload failed (non-fatal): {e}")

        poster_uploaded = False
        if poster is not None and kind == "video":
            try:
                p_raw = await poster.read()
                if p_raw:
                    _put_object(poster_path, p_raw, poster.content_type or "image/jpeg")
                    poster_uploaded = True
            except Exception as e:
                logger.warning(f"Poster upload failed (non-fatal): {e}")

        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": media_id,
            "userId": user["id"],
            "originalFilename": file.filename or f"upload.{ext}",
            "mimeType": mime,
            "kind": kind,
            "size": put_original.get("size", len(raw)),
            "storagePath": put_original.get("path", original_path),
            "thumbPath": thumb_path if thumb_uploaded else None,
            "posterPath": poster_path if poster_uploaded else None,
            "project": (project or "").strip() or None,
            "jobId": (jobId or "").strip() or None,
            "client": (client or "").strip() or None,
            "site": (site or "").strip() or None,
            "category": (category or "").strip() or None,
            "customCategory": (customCategory or "").strip() or None,
            "description": (description or "").strip(),
            "notes": (notes or "").strip(),
            "favourite": False,
            "uploader": _uploader_name(user),
            "dateTaken": (dateTaken or now.split("T")[0]),
            "createdAt": now,
            "updatedAt": now,
            "isDeleted": False,
            "usage": [],
        }
        await db.media_items.insert_one(doc)
        return _shape(doc)

    @router.patch("/{media_id}")
    async def update_media(media_id: str, patch: MediaUpdate, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        upd = {k: v for k, v in patch.model_dump().items() if v is not None}
        # Empty-string handling for clearing linkage fields.
        for k in ("project", "jobId", "client", "site", "category", "customCategory"):
            if k in upd and upd[k] == "":
                upd[k] = None
        upd["updatedAt"] = datetime.now(timezone.utc).isoformat()
        result = await db.media_items.update_one(
            {"id": media_id, "userId": user["id"], "isDeleted": {"$ne": True}},
            {"$set": upd},
        )
        if result.matched_count == 0:
            raise HTTPException(404, "Media not found")
        doc = await db.media_items.find_one({"id": media_id, "userId": user["id"]})
        return _shape(doc)

    @router.delete("/{media_id}")
    async def delete_media(media_id: str, force: bool = Query(False), authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        doc = await db.media_items.find_one({"id": media_id, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not doc:
            raise HTTPException(404, "Media not found")
        usage = doc.get("usage") or []
        if usage and not force:
            return {
                "requiresConfirm": True,
                "usageCount": len(usage),
                "usage": usage,
                "message": f"This media is used in {len(usage)} document(s). Confirm deletion with ?force=true.",
            }
        await db.media_items.update_one(
            {"id": media_id, "userId": user["id"]},
            {"$set": {"isDeleted": True, "deletedAt": datetime.now(timezone.utc).isoformat()}},
        )
        return {"ok": True}

    @router.post("/{media_id}/usage")
    async def add_usage(media_id: str, usage: MediaUsage, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        entry = {
            "docId": usage.docId,
            "docType": usage.docType,
            "docTitle": usage.docTitle or "",
            "addedAt": datetime.now(timezone.utc).isoformat(),
        }
        result = await db.media_items.update_one(
            {"id": media_id, "userId": user["id"], "isDeleted": {"$ne": True}, "usage.docId": {"$ne": usage.docId}},
            {"$push": {"usage": entry}, "$set": {"updatedAt": entry["addedAt"]}},
        )
        if result.matched_count == 0:
            # Either not found OR already recorded — check which
            exists = await db.media_items.find_one({"id": media_id, "userId": user["id"], "isDeleted": {"$ne": True}})
            if not exists:
                raise HTTPException(404, "Media not found")
        return {"ok": True}

    @router.delete("/{media_id}/usage/{doc_id}")
    async def remove_usage(media_id: str, doc_id: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        await db.media_items.update_one(
            {"id": media_id, "userId": user["id"]},
            {"$pull": {"usage": {"docId": doc_id}}, "$set": {"updatedAt": datetime.now(timezone.utc).isoformat()}},
        )
        return {"ok": True}

    @router.get("/{media_id}/file")
    async def stream_file(
        media_id: str,
        variant: str = Query("original"),   # original | thumb | poster
        authorization: Optional[str] = Header(None),
        auth: Optional[str] = Query(None),
    ):
        token = authorization.replace("Bearer ", "") if authorization else (auth or None)
        if token and token.startswith("Bearer "):
            token = token.replace("Bearer ", "")
        user = await get_user(token)
        doc = await db.media_items.find_one({"id": media_id, "userId": user["id"], "isDeleted": {"$ne": True}})
        if not doc:
            raise HTTPException(404, "Media not found")

        if variant == "thumb" and doc.get("thumbPath"):
            path = doc["thumbPath"]
            content_type = "image/jpeg"
        elif variant == "poster" and doc.get("posterPath"):
            path = doc["posterPath"]
            content_type = "image/jpeg"
        else:
            path = doc["storagePath"]
            content_type = doc.get("mimeType") or "application/octet-stream"

        try:
            data, ct = _get_object(path)
        except requests.HTTPError as e:
            logger.error(f"Storage fetch failed for {path}: {e}")
            raise HTTPException(502, "Media temporarily unavailable")
        return Response(content=data, media_type=content_type or ct)

    return router


def _td(days: int):
    from datetime import timedelta
    return timedelta(days=days)


def try_init_storage() -> bool:
    try:
        _init_storage()
        logger.info("Photo Vault: object storage initialised")
        return True
    except Exception as e:
        logger.warning(f"Photo Vault: storage init deferred ({e})")
        return False
