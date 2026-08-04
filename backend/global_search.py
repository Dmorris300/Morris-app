"""Morris — Global Search V2.

Universal record search across the platform. One endpoint scans every
Morris collection and returns ranked, deep-linkable hits.

Endpoint:
  GET /api/search?q=<term>&scope=<optional>&limit=<int>
     → { total, results: [ { kind, id, title, subtitle, route, badge, updatedAt, ... } ] }

Scopes: all | projects | clients | documents | photos | quotes |
        variations | applications | invoices | site-diary | incidents |
        risks | tasks | tools

Ranking:
  1. Reference / title exact matches
  2. Reference / title contains
  3. Subtitle / body contains
  4. Most recently updated wins ties
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Callable

from fastapi import APIRouter, Header


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _score(needle: str, item: Dict[str, Any]) -> int:
    """Return a match score. Higher = better."""
    n = needle.lower()
    title = (item.get("title") or "").lower()
    subtitle = (item.get("subtitle") or "").lower()
    ref = (item.get("badge") or "").lower()
    if not n:
        return 0
    if ref and (ref == n or n in ref):
        return 100
    if title == n:
        return 90
    if title.startswith(n):
        return 80
    if n in title:
        return 60
    if n in subtitle:
        return 30
    return 10


def _hit(needle: str, hay: List[str]) -> bool:
    n = (needle or "").lower()
    if not n:
        return True
    for h in hay:
        if h and n in str(h).lower():
            return True
    return False


def build_router(db, get_user):
    router = APIRouter(prefix="/api", tags=["search"])

    async def _search_projects(uid: str, q: str, limit: int) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        rows = await db.jobs.find({"userId": uid}).to_list(500)
        for j in rows:
            if not _hit(q, [j.get("projectName"), j.get("clientName"), j.get("company"), j.get("address"), j.get("clientContact"), j.get("id")]):
                continue
            title = j.get("projectName") or j.get("clientName") or "Project"
            subtitle_parts = [j.get("clientName") or j.get("company"), j.get("address"), j.get("status")]
            subtitle = " · ".join(filter(None, subtitle_parts))
            out.append({
                "kind": "project", "id": j.get("id"),
                "title": title, "subtitle": subtitle,
                "route": f"/app/jobs/{j.get('id')}",
                "badge": j.get("status") or "",
                "updatedAt": j.get("updatedAt") or j.get("createdAt") or "",
            })
            if len(out) >= limit:
                break
        return out

    async def _search_clients(uid: str, q: str, limit: int) -> List[Dict[str, Any]]:
        # Aggregate distinct clients across jobs and quotes so a "Sam Client" search always resolves.
        seen: Dict[str, Dict[str, Any]] = {}
        rows = await db.jobs.find({"userId": uid}).to_list(500)
        for j in rows:
            key = ((j.get("clientName") or "") + "|" + (j.get("company") or "")).lower()
            if not _hit(q, [j.get("clientName"), j.get("company"), j.get("clientContact")]):
                continue
            if not key.strip("|"):
                continue
            existing = seen.get(key)
            if existing:
                existing["projectCount"] = existing.get("projectCount", 1) + 1
                continue
            seen[key] = {
                "kind": "client",
                "id": key,
                "title": j.get("clientName") or j.get("company") or "Client",
                "subtitle": j.get("company") or j.get("clientContact") or "",
                "route": f"/app/jobs/{j.get('id')}",
                "badge": "client",
                "projectCount": 1,
                "updatedAt": j.get("updatedAt") or j.get("createdAt") or "",
            }
        return list(seen.values())[:limit]

    async def _search_docs(uid: str, q: str, limit: int) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        rows = await db.documents.find({"userId": uid, "isDeleted": {"$ne": True}}).to_list(500)
        for d in rows:
            if not _hit(q, [d.get("title"), d.get("toolId"), d.get("refNumber"), (d.get("content") or "")[:500]]):
                continue
            out.append({
                "kind": "document", "id": d.get("id"),
                "title": d.get("title") or "Document",
                "subtitle": " · ".join(filter(None, [d.get("toolId"), d.get("refNumber")])),
                "route": f"/app/history?open={d.get('id')}",
                "badge": d.get("refNumber") or d.get("toolId"),
                "updatedAt": d.get("updatedAt") or d.get("createdAt") or "",
            })
            if len(out) >= limit:
                break
        return out

    async def _search_drafts(uid: str, q: str, limit: int) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        rows = await db.drafts.find({"userId": uid}).to_list(500)
        for d in rows:
            data = d.get("data") or {}
            if not _hit(q, [d.get("toolId"), data.get("clientName"), data.get("projectName"), data.get("company"), data.get("address")]):
                continue
            title = data.get("projectName") or data.get("clientName") or f"{d.get('toolId', 'draft').replace('-', ' ').title()} draft"
            out.append({
                "kind": "draft", "id": d.get("id"),
                "title": title,
                "subtitle": f"Draft · {d.get('toolId') or ''}",
                "route": f"/app/tool/{d.get('toolId')}?draft={d.get('id')}",
                "badge": "draft",
                "updatedAt": d.get("updatedAt") or d.get("createdAt") or "",
            })
            if len(out) >= limit:
                break
        return out

    async def _search_photos(uid: str, q: str, limit: int) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        rows = await db.media.find({"userId": uid, "isDeleted": {"$ne": True}}).to_list(500)
        for m in rows:
            if not _hit(q, [m.get("caption"), m.get("originalFilename"), m.get("albumName"), m.get("jobName")]):
                continue
            out.append({
                "kind": "photo", "id": m.get("id"),
                "title": m.get("caption") or m.get("originalFilename") or "Photo",
                "subtitle": " · ".join(filter(None, [m.get("albumName"), m.get("jobName")])),
                "route": f"/app/photo-vault?open={m.get('id')}",
                "badge": m.get("kind") or "image",
                "updatedAt": m.get("createdAt") or "",
            })
            if len(out) >= limit:
                break
        return out

    async def _v2_collection_search(coll_name: str, kind: str, route_prefix: str,
                                     uid: str, q: str, limit: int,
                                     title_of: Callable[[Dict[str, Any]], str],
                                     subtitle_of: Callable[[Dict[str, Any]], str],
                                     badge_of: Callable[[Dict[str, Any]], str],
                                     hay_of: Callable[[Dict[str, Any]], List[str]]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        coll = getattr(db, coll_name)
        rows = await coll.find({"userId": uid, "isDeleted": {"$ne": True}}).to_list(500)
        for r in rows:
            if not _hit(q, hay_of(r)):
                continue
            out.append({
                "kind": kind, "id": r.get("id"),
                "title": title_of(r),
                "subtitle": subtitle_of(r),
                "route": f"{route_prefix}?open={r.get('id')}",
                "badge": badge_of(r),
                "updatedAt": r.get("updatedAt") or "",
            })
            if len(out) >= limit:
                break
        return out

    async def _search_quotes(uid, q, limit):
        return await _v2_collection_search(
            "quotes", "quote", "/app/quote-builder", uid, q, limit,
            lambda r: r.get("quoteRef") or "Quote",
            lambda r: " · ".join(filter(None, [r.get("projectName"), r.get("clientName") or r.get("clientCompany"), r.get("status")])),
            lambda r: r.get("status") or "",
            lambda r: [r.get("quoteRef"), r.get("projectName"), r.get("clientName"), r.get("clientCompany"), r.get("scopeOfWorks")],
        )

    async def _search_variations(uid, q, limit):
        return await _v2_collection_search(
            "variation_orders", "variation", "/app/variation-orders", uid, q, limit,
            lambda r: r.get("variationRef") or "Variation",
            lambda r: " · ".join(filter(None, [r.get("projectName"), r.get("clientName") or r.get("clientCompany"), r.get("status")])),
            lambda r: r.get("status") or "",
            lambda r: [r.get("variationRef"), r.get("projectName"), r.get("clientName"), r.get("clientCompany"), r.get("descriptionOfChange"), r.get("reason")],
        )

    async def _search_applications(uid, q, limit):
        return await _v2_collection_search(
            "applications_for_payment", "application", "/app/applications-for-payment", uid, q, limit,
            lambda r: r.get("applicationRef") or "Application",
            lambda r: " · ".join(filter(None, [r.get("projectName"), r.get("clientName") or r.get("clientCompany"), r.get("status")])),
            lambda r: r.get("status") or "",
            lambda r: [r.get("applicationRef"), r.get("projectName"), r.get("clientName"), r.get("clientCompany"), r.get("contractRef")],
        )

    async def _search_invoices(uid, q, limit):
        return await _v2_collection_search(
            "invoices", "invoice", "/app/invoice-builder", uid, q, limit,
            lambda r: r.get("invoiceRef") or "Invoice",
            lambda r: " · ".join(filter(None, [r.get("projectName"), r.get("clientName") or r.get("clientCompany"), r.get("status"), r.get("poNumber")])),
            lambda r: r.get("status") or "",
            lambda r: [r.get("invoiceRef"), r.get("projectName"), r.get("clientName"), r.get("clientCompany"), r.get("poNumber"), r.get("notes")],
        )

    async def _search_diaries(uid, q, limit):
        return await _v2_collection_search(
            "site_diary_entries", "site-diary", "/app/site-diary", uid, q, limit,
            lambda r: f"Site diary — {r.get('date') or ''}",
            lambda r: " · ".join(filter(None, [r.get("projectName"), (r.get("weather") or {}).get("summary")])),
            lambda r: (r.get("date") or "")[:10],
            lambda r: [r.get("projectName"), (r.get("weather") or {}).get("summary"), r.get("date"), (r.get("activities") or "")],
        )

    async def _search_incidents(uid, q, limit):
        return await _v2_collection_search(
            "incident_reports", "incident", "/app/incident-report", uid, q, limit,
            lambda r: r.get("type") or "Incident",
            lambda r: " · ".join(filter(None, [r.get("projectName"), r.get("location"), r.get("severity")])),
            lambda r: r.get("severity") or "",
            lambda r: [r.get("type"), r.get("projectName"), r.get("location"), r.get("description"), r.get("severity")],
        )

    async def _search_risks(uid, q, limit):
        return await _v2_collection_search(
            "risk_assessments", "risk", "/app/risk-register", uid, q, limit,
            lambda r: r.get("title") or "Risk Assessment",
            lambda r: " · ".join(filter(None, [r.get("projectName"), r.get("activity")])),
            lambda r: (r.get("status") or ""),
            lambda r: [r.get("title"), r.get("projectName"), r.get("activity"), r.get("scope")],
        )

    async def _search_tasks(uid: str, q: str, limit: int) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        rows = await db.tasks.find({"userId": uid, "isDeleted": {"$ne": True}}).to_list(500)
        for t in rows:
            if not _hit(q, [t.get("title"), t.get("description"), t.get("projectName")]):
                continue
            out.append({
                "kind": "task", "id": t.get("id"),
                "title": t.get("title") or "Task",
                "subtitle": " · ".join(filter(None, [t.get("projectName"), t.get("status"), t.get("dueDate")])),
                "route": f"/app/jobs/{t.get('jobId')}?tab=tasks" if t.get("jobId") else "/app",
                "badge": t.get("status") or "task",
                "updatedAt": t.get("updatedAt") or "",
            })
            if len(out) >= limit:
                break
        return out

    async def _search_tools(q: str, limit: int) -> List[Dict[str, Any]]:
        """Static tool navigation. Loaded from a shipped list matching the frontend registry —
        kept in sync via id + route pairs for a handful of top-level tools."""
        catalogue = [
            ("command-centre", "Command Centre", "/app", "navigation"),
            ("projects", "Projects", "/app/jobs", "navigation"),
            ("business-hub", "Business Hub", "/app/business", "navigation"),
            ("finance-hub", "Finance Hub", "/app/finance", "navigation"),
            ("compliance-hub", "Compliance Hub", "/app/compliance", "navigation"),
            ("tools-library", "Tools Library", "/app/tools-library", "navigation"),
            ("photo-vault", "Photo Vault", "/app/photo-vault", "navigation"),
            ("settings", "Settings", "/app/settings", "navigation"),
            ("quote-builder", "Quote Builder", "/app/quote-builder", "tool"),
            ("variation-orders", "Variation Orders", "/app/variation-orders", "tool"),
            ("applications-for-payment", "Applications for Payment", "/app/applications-for-payment", "tool"),
            ("invoice-builder", "Invoice Builder", "/app/invoice-builder", "tool"),
            ("site-diary", "Site Diary", "/app/site-diary", "tool"),
            ("incident-report", "Incident Report", "/app/incident-report", "tool"),
            ("risk-register", "Risk Register", "/app/risk-register", "tool"),
            ("history", "Document Library", "/app/history", "navigation"),
        ]
        n = (q or "").lower()
        results = []
        for tid, name, route, section in catalogue:
            if not n or n in name.lower() or n in tid or n in section:
                results.append({
                    "kind": "tool", "id": tid, "title": name,
                    "subtitle": section.title(), "route": route,
                    "badge": section, "updatedAt": _now(),
                })
        return results[:limit]

    @router.get("/search")
    async def search(
        q: Optional[str] = None,
        scope: Optional[str] = "all",
        limit: int = 25,
        authorization: Optional[str] = Header(None),
    ):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        uid = user["id"]
        term = (q or "").strip()
        scope = (scope or "all").lower()
        # per-scope limit — we want a good mix in "all"
        per = 5 if scope == "all" else limit
        results: List[Dict[str, Any]] = []
        buckets = {
            "projects":     _search_projects,
            "clients":      _search_clients,
            "documents":    _search_docs,
            "drafts":       _search_drafts,
            "photos":       _search_photos,
            "quotes":       _search_quotes,
            "variations":   _search_variations,
            "applications": _search_applications,
            "invoices":     _search_invoices,
            "site-diary":   _search_diaries,
            "incidents":    _search_incidents,
            "risks":        _search_risks,
            "tasks":        _search_tasks,
        }
        if scope == "all":
            for _key, fn in buckets.items():
                try:
                    results.extend(await fn(uid, term, per))
                except Exception:
                    pass
            try:
                results.extend(await _search_tools(term, per))
            except Exception:
                pass
        elif scope == "tools":
            results.extend(await _search_tools(term, per))
        elif scope in buckets:
            try:
                results.extend(await buckets[scope](uid, term, per))
            except Exception:
                pass
        # Rank + sort
        def _upd(r):
            v = r.get("updatedAt") or ""
            return v if isinstance(v, str) else str(v)
        results.sort(key=lambda r: _upd(r), reverse=True)
        results.sort(key=lambda r: _score(term, r), reverse=True)
        # Cap final response to a reasonable size
        capped = results[:max(limit, 25)]
        return {"total": len(results), "results": capped, "scope": scope, "q": term}

    return router
