"""Morris Command Centre V2 — /api/attention endpoint.

Computes the "what needs your attention today" feed from stored data only.
Never guesses. Every item is derived from concrete fields on user, jobs,
drafts, saved documents, media_items and compliance credentials.

Item shape returned to the client:
  {
    id: str,                          # stable within a compute cycle
    kind: str,                        # invoice_overdue | variation_awaiting | ...
    title: str,                       # bold headline
    subtitle: str,                    # project/context line
    projectId: Optional[str],
    projectName: Optional[str],
    actionLabel: str,                 # button text
    actionRoute: str,                 # SPA route to navigate to
    severity: "urgent"|"warning"|"info",
    dueAt: Optional[str],             # ISO date/datetime for sorting
  }
"""

from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Header


SEVERITY_ORDER = {"urgent": 0, "warning": 1, "info": 2}


def _iso_today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _parse_date(v) -> Optional[datetime]:
    """Accepts ISO date or datetime string. Returns tz-aware datetime or None."""
    if not v:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        s = str(v).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s) if "T" in s else datetime.fromisoformat(s + "T00:00:00+00:00")
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _days_between(future, now) -> int:
    return (future.date() - now.date()).days


def _next_sa_deadline(now: datetime) -> datetime:
    """31 January following the current tax year end."""
    this_year = datetime(now.year, 1, 31, tzinfo=timezone.utc)
    if now > this_year:
        return datetime(now.year + 1, 1, 31, tzinfo=timezone.utc)
    return this_year


async def compute_attention(db, user: dict) -> List[Dict[str, Any]]:
    now = datetime.now(timezone.utc)
    uid = user["id"]
    items: List[Dict[str, Any]] = []

    # Load everything we need in parallel-esque fashion (motor is async).
    jobs = await db.jobs.find({"userId": uid}).to_list(500)
    drafts = await db.drafts.find({"userId": uid}).to_list(500)
    media_stats_pipeline = [{"$match": {"userId": uid, "isDeleted": {"$ne": True}}}, {"$group": {"_id": "$jobId", "n": {"$sum": 1}}}]
    media_by_job = {r["_id"]: r["n"] for r in await db.media_items.aggregate(media_stats_pipeline).to_list(500)}

    jobs_by_id = {j["id"]: j for j in jobs}

    # --- 1. Overdue invoices (jobs with status=invoiced past dueDate) ---
    for j in jobs:
        if j.get("status") != "invoiced":
            continue
        due = _parse_date(j.get("dueDate") or j.get("invoiceDueDate"))
        if not due or due >= now:
            continue
        days_over = (now.date() - due.date()).days
        items.append({
            "id": f"invoice-{j['id']}",
            "kind": "invoice_overdue",
            "title": f"Invoice {j.get('ref') or j['id'][:6]} overdue by {days_over} day{'s' if days_over != 1 else ''}.",
            "subtitle": j.get("clientName") or j.get("projectName") or "Project",
            "projectId": j["id"],
            "projectName": j.get("clientName") or j.get("projectName"),
            "actionLabel": "Open Invoice",
            "actionRoute": f"/app/jobs/{j['id']}?tab=finance",
            "severity": "urgent" if days_over >= 7 else "warning",
            "dueAt": due.isoformat(),
        })

    # --- 2. Variations awaiting approval (drafts of variation-letter with status metadata) ---
    for d in drafts:
        data = d.get("data") or {}
        tool = d.get("toolId")
        if tool in ("variation-letter", "variation-instruction-log") and (data.get("status") or "").lower().startswith("await"):
            job_id = data.get("jobId") or d.get("jobId")
            job = jobs_by_id.get(job_id)
            items.append({
                "id": f"variation-{d['id']}",
                "kind": "variation_awaiting",
                "title": f"Variation {data.get('ref') or data.get('variationRef') or ''} awaiting client approval.".replace("  ", " ").strip(),
                "subtitle": (job or {}).get("clientName") or data.get("project") or "Variation",
                "projectId": job_id,
                "projectName": (job or {}).get("clientName"),
                "actionLabel": "Open Variation",
                "actionRoute": f"/app/tool/variation-letter?draft={d['id']}",
                "severity": "warning",
                "dueAt": None,
            })

    # --- 3. Payment chaser recommended (overdue invoice + no chase in last 14 days) ---
    for j in jobs:
        if j.get("status") != "invoiced":
            continue
        due = _parse_date(j.get("dueDate") or j.get("invoiceDueDate"))
        if not due or due >= now:
            continue
        # No chase in last 14 days = has no chaseHistory or latest chase > 14 days old
        last_chase = _parse_date((j.get("chaseHistory") or [{}])[-1].get("date")) if j.get("chaseHistory") else None
        if last_chase and (now - last_chase) < timedelta(days=14):
            continue
        days_over = (now.date() - due.date()).days
        items.append({
            "id": f"chase-{j['id']}",
            "kind": "chase_recommended",
            "title": "Payment chaser recommended.",
            "subtitle": f"{j.get('ref') or 'Invoice'} — {days_over} day{'s' if days_over != 1 else ''} overdue",
            "projectId": j["id"],
            "projectName": j.get("clientName"),
            "actionLabel": "Start Chase",
            "actionRoute": f"/app/payment-chaser?jobId={j['id']}",
            "severity": "warning",
            "dueAt": due.isoformat(),
        })

    # --- 4. Compliance credentials expiring in <=30 days ---
    for label, field, route in [
        ("Public liability insurance", "insuranceExpiry", "/app/compliance"),
        ("CSCS card", "cscsExpiry", "/app/compliance"),
        ("Employers liability insurance", "employersLiabilityExpiry", "/app/compliance"),
        ("Vehicle insurance", "vehicleInsuranceExpiry", "/app/compliance"),
        ("First aid certificate", "firstAidExpiry", "/app/compliance"),
        ("DBS check", "dbsExpiry", "/app/compliance"),
    ]:
        exp = _parse_date(user.get(field))
        if not exp:
            continue
        days = _days_between(exp, now)
        if days > 30:
            continue
        if days < 0:
            title = f"{label} expired {abs(days)} day{'s' if abs(days) != 1 else ''} ago."
            severity = "urgent"
        else:
            title = f"{label} expires in {days} day{'s' if days != 1 else ''}." if days > 0 else f"{label} expires today."
            severity = "urgent" if days <= 7 else "warning"
        items.append({
            "id": f"compliance-{field}",
            "kind": "compliance_expiring",
            "title": title,
            "subtitle": exp.date().strftime("%d %B %Y"),
            "projectId": None,
            "projectName": None,
            "actionLabel": "Renew",
            "actionRoute": route,
            "severity": severity,
            "dueAt": exp.isoformat(),
        })

    # --- 5. Self Assessment deadline < 60 days away ---
    sa = _next_sa_deadline(now)
    sa_days = _days_between(sa, now)
    if 0 <= sa_days <= 60:
        items.append({
            "id": "self-assessment",
            "kind": "sa_deadline",
            "title": f"Self Assessment due in {sa_days} day{'s' if sa_days != 1 else ''}." if sa_days > 0 else "Self Assessment due today.",
            "subtitle": sa.date().strftime("%d %B %Y"),
            "projectId": None,
            "projectName": None,
            "actionLabel": "Open Tax Hub",
            "actionRoute": "/app/finance",
            "severity": "urgent" if sa_days <= 14 else "warning",
            "dueAt": sa.isoformat(),
        })

    # --- 6. Unfinished RAMS drafts older than 24h ---
    for d in drafts:
        if d.get("toolId") != "rams":
            continue
        updated = _parse_date(d.get("updatedAt"))
        if not updated or (now - updated) < timedelta(hours=24):
            continue
        stage = ((d.get("data") or {}).get("stage") or 0)
        if isinstance(stage, str):
            try:
                stage = int(stage)
            except ValueError:
                stage = 0
        if stage >= 5:  # Assume 5+ means substantially complete
            continue
        job_id = (d.get("data") or {}).get("jobId")
        job = jobs_by_id.get(job_id)
        items.append({
            "id": f"rams-{d['id']}",
            "kind": "rams_incomplete",
            "title": f"RAMS incomplete on {(job or {}).get('clientName') or 'a project'}.",
            "subtitle": f"Started {updated.date().strftime('%d %b')}",
            "projectId": job_id,
            "projectName": (job or {}).get("clientName"),
            "actionLabel": "Resume RAMS",
            "actionRoute": f"/app/rams?draft={d['id']}",
            "severity": "info",
            "dueAt": None,
        })

    # --- 7. Site Diary missing for today (multi-user-site-diary) ---
    # Only surface after 17:00 local — we can only approximate via UTC hour of day.
    # Trigger for active jobs where no diary saved today.
    today_iso = now.date().isoformat()
    active_job_ids = [j["id"] for j in jobs if j.get("status") == "active"]
    # Fetch today's Site Diary V2 entries so we don't fire a duplicate alert
    # for the same project already covered by the new tool.
    sd_today_projects = set()
    try:
        sd_today = await db.site_diary_entries.find({
            "userId": user["id"], "date": today_iso, "isDeleted": {"$ne": True},
        }).to_list(500)
        sd_today_projects = {e.get("projectId") for e in sd_today if e.get("projectId")}
    except Exception:
        pass
    if active_job_ids and now.hour >= 16:  # 17:00 UK approx (safe range)
        # Look for a site diary draft or saved doc referencing today's date.
        for jid in active_job_ids:
            if jid in sd_today_projects:
                continue
            has_today = any(
                (d.get("toolId") in ("multiuser-site-diary", "site-diary"))
                and ((d.get("data") or {}).get("diaryDate") == today_iso or (d.get("data") or {}).get("jobId") == jid and _parse_date(d.get("updatedAt")) and _parse_date(d["updatedAt"]).date() == now.date())
                for d in drafts
            )
            if has_today:
                continue
            job = jobs_by_id.get(jid)
            items.append({
                "id": f"diary-{jid}-{today_iso}",
                "kind": "diary_missing",
                "title": "Site diary missing for today.",
                "subtitle": (job or {}).get("clientName") or "Project",
                "projectId": jid,
                "projectName": (job or {}).get("clientName"),
                "actionLabel": "Open Diary",
                "actionRoute": f"/app/site-diary?projectId={jid}",
                "severity": "warning",
                "dueAt": None,
            })

    # --- 8. Project older than 7 days with zero Photo Vault items ---
    for j in jobs:
        if j.get("status") != "active":
            continue
        created = _parse_date(j.get("createdAt"))
        if not created or (now - created).days < 7:
            continue
        if media_by_job.get(j["id"], 0) > 0:
            continue
        items.append({
            "id": f"photos-{j['id']}",
            "kind": "no_photos",
            "title": "No project photos yet.",
            "subtitle": j.get("clientName") or "Project",
            "projectId": j["id"],
            "projectName": j.get("clientName"),
            "actionLabel": "Open Vault",
            "actionRoute": f"/app/photo-vault?jobId={j['id']}",
            "severity": "info",
            "dueAt": None,
        })

    # --- 9. Drafts older than 3 days ---
    for d in drafts:
        if d.get("toolId") == "rams":
            continue  # already handled above
        updated = _parse_date(d.get("updatedAt"))
        if not updated or (now - updated) < timedelta(days=3):
            continue
        tool_name = (d.get("toolName") or d.get("toolId") or "Draft").replace("-", " ").title()
        job_id = (d.get("data") or {}).get("jobId")
        job = jobs_by_id.get(job_id)
        items.append({
            "id": f"draft-{d['id']}",
            "kind": "draft_stale",
            "title": f"Draft {tool_name} unfinished.",
            "subtitle": (job or {}).get("clientName") or f"Last edited {updated.date().strftime('%d %b')}",
            "projectId": job_id,
            "projectName": (job or {}).get("clientName"),
            "actionLabel": "Resume Draft",
            "actionRoute": f"/app/drafts",
            "severity": "info",
            "dueAt": None,
        })

    # --- Sort by severity then dueAt (nulls last) ---
    def _key(it):
        return (
            SEVERITY_ORDER.get(it["severity"], 3),
            it["dueAt"] or "9999-12-31",
        )
    items.sort(key=_key)
    return items


def build_router(db, get_user):
    router = APIRouter(prefix="/api", tags=["command-centre"])

    @router.get("/attention")
    async def attention(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        items = await compute_attention(db, user)
        # Merge compliance-expiry items from the Compliance Hub.
        try:
            from compliance import collect_compliance_attention
            comp = await collect_compliance_attention(db, user["id"], datetime.now(timezone.utc))
            items = items + comp
        except Exception:
            pass
        # Merge COSHH review-due items.
        try:
            from coshh import collect_coshh_attention
            coshh_items = await collect_coshh_attention(db, user["id"], datetime.now(timezone.utc))
            items = items + coshh_items
        except Exception:
            pass
        # Merge Incident Report attention (open high-priority + overdue CAPA).
        try:
            from incident_report import collect_incident_attention
            inc_items = await collect_incident_attention(db, user["id"], datetime.now(timezone.utc))
            items = items + inc_items
        except Exception:
            pass
        # Merge Risk Assessment attention (reviews due + high residuals).
        try:
            from risk_assessment import collect_risk_assessment_attention
            ra_items = await collect_risk_assessment_attention(db, user["id"], datetime.now(timezone.utc))
            items = items + ra_items
        except Exception:
            pass
        # Merge Quote Builder attention (expiring / stale quotes).
        try:
            from quote_builder import collect_quote_builder_attention
            qb_items = await collect_quote_builder_attention(db, user["id"], datetime.now(timezone.utc))
            items = items + qb_items
        except Exception:
            pass
        # Merge Variation Orders attention (submitted awaiting approval / in-progress idle).
        try:
            from variation_orders import collect_variation_orders_attention
            vo_items = await collect_variation_orders_attention(db, user["id"], datetime.now(timezone.utc))
            items = items + vo_items
        except Exception:
            pass
        # Merge AFP attention (overdue / awaiting certification).
        try:
            from applications_for_payment import collect_afp_attention
            afp_items = await collect_afp_attention(db, user["id"], datetime.now(timezone.utc))
            items = items + afp_items
        except Exception:
            pass
        # Merge Invoice Builder attention (overdue / due soon).
        try:
            from invoice_builder import collect_invoice_attention
            inv_items = await collect_invoice_attention(db, user["id"], datetime.now(timezone.utc))
            items = items + inv_items
        except Exception:
            pass
        # Merge Purchase Orders attention (delivery overdue / awaiting invoice / supplier invoice overdue).
        try:
            from purchase_orders import collect_purchase_order_attention
            po_items = await collect_purchase_order_attention(db, user["id"], datetime.now(timezone.utc))
            items = items + po_items
        except Exception:
            pass
        items.sort(key=lambda x: (SEVERITY_ORDER.get(x.get("severity"), 3), x.get("dueAt") or "9999"))
        return {"items": items, "count": len(items), "computedAt": datetime.now(timezone.utc).isoformat()}

    return router
