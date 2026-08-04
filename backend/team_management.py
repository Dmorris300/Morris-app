"""Morris — Team Management V2 (flagship workforce management hub).

Layers profile data, certifications/training, availability, and project
allocations on top of the existing `/api/team/*` invite/seat system. The
underlying users collection remains the source of truth for identity + access;
V2 adds a rich `teamProfile` sub-document per member for HR/workforce needs.

Endpoints (all prefixed /api/team-management):
  • GET  /reference                           — dropdown options
  • GET  /dashboard                           — KPIs + members list
  • GET  /members                             — enriched member list
  • GET  /members/{mid}                       — full profile
  • PATCH /members/{mid}/profile              — update profile fields
  • PATCH /members/{mid}/job-role             — set job role
  • PATCH /members/{mid}/availability         — set availability state + notes
  • POST /members/{mid}/certifications        — add certification record
  • PATCH /members/{mid}/certifications/{cid} — update
  • DELETE /members/{mid}/certifications/{cid}— remove
  • POST /members/{mid}/projects              — allocate project
  • DELETE /members/{mid}/projects/{pid}      — remove allocation

Members are identified by `id` (a Morris user id) OR by the pending-invite
token for members who haven't accepted yet. `collect_team_attention` surfaces
expiring certifications for the Command Centre.
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel


JOB_ROLES = [
    "Administrator", "Director", "Project Manager", "Site Manager",
    "Supervisor", "Quantity Surveyor", "Estimator", "Foreman",
    "Health & Safety Officer", "Office Staff", "Bookkeeper",
    "Operative", "Apprentice", "Sub-contractor", "Consultant", "Other",
]
TRADES = [
    "General Builder", "Bricklayer", "Carpenter / Joiner", "Plumber",
    "Electrician", "Plasterer", "Painter & Decorator", "Roofer", "Tiler",
    "Flooring", "Kitchen Fitter", "Bathroom Fitter", "Landscaper",
    "Groundworker", "Heating Engineer", "Glazier", "Renderer", "Dryliner",
    "Steel Fixer", "Scaffolder", "Plant Operator", "Labourer", "Not applicable",
]
AVAILABILITY_STATES = ["Available", "On Site", "On Leave", "Sick", "Training", "Unavailable"]
CERT_TYPES = [
    "CSCS Card", "SMSTS", "SSSTS", "IPAF", "PASMA", "Asbestos Awareness",
    "First Aid at Work", "Emergency First Aid", "Manual Handling",
    "Working at Height", "Confined Spaces", "Fire Marshal",
    "Face-fit Test", "CPCS", "NPORS", "18th Edition Wiring",
    "Gas Safe", "OFTEC", "NICEIC", "MCS", "Public Liability Insurance",
    "Employer's Liability Insurance", "Professional Indemnity", "DBS Check",
    "Trade Qualification", "Other",
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


class ProfileUpdate(BaseModel):
    fullName: Optional[str] = None
    phone: Optional[str] = None
    emergencyContactName: Optional[str] = None
    emergencyContactPhone: Optional[str] = None
    address: Optional[str] = None
    trade: Optional[str] = None
    hourlyRate: Optional[float] = None
    dayRate: Optional[float] = None
    startDate: Optional[str] = None
    niNumber: Optional[str] = None
    utrNumber: Optional[str] = None
    bio: Optional[str] = None


class JobRoleUpdate(BaseModel):
    jobRole: str


class AvailabilityUpdate(BaseModel):
    state: str
    fromDate: Optional[str] = None
    toDate: Optional[str] = None
    note: Optional[str] = None


class CertificationIn(BaseModel):
    id: Optional[str] = None
    type: str
    number: Optional[str] = ""
    issuedBy: Optional[str] = ""
    issuedDate: Optional[str] = ""
    expiryDate: Optional[str] = ""
    documentUrl: Optional[str] = ""
    notes: Optional[str] = ""


class ProjectAllocationIn(BaseModel):
    projectId: str
    projectName: Optional[str] = ""
    role: Optional[str] = ""  # site role on this project
    fromDate: Optional[str] = ""
    toDate: Optional[str] = ""


def _member_shape(u: dict, jobs_by_id: Dict[str, dict] | None = None) -> Dict[str, Any]:
    """Project a users doc into a workforce-facing shape."""
    prof = u.get("teamProfile") or {}
    today = _today()
    certs = prof.get("certifications") or []
    expiring = [c for c in certs if _cert_status(c, today) == "expiring_soon"]
    expired = [c for c in certs if _cert_status(c, today) == "expired"]
    allocs = prof.get("projectAllocations") or []
    if jobs_by_id:
        for a in allocs:
            j = jobs_by_id.get(a.get("projectId"))
            if j and not a.get("projectName"):
                a["projectName"] = j.get("projectName") or j.get("clientName") or ""
    return {
        "id": u.get("id"),
        "fullName": prof.get("fullName") or u.get("fullName") or u.get("username") or "",
        "email": u.get("email"),
        "phone": prof.get("phone") or u.get("phone") or "",
        "companyName": u.get("companyName"),
        "teamRole": u.get("teamRole") or ("owner" if not u.get("teamOwnerId") else "member"),
        "jobRole": prof.get("jobRole") or "",
        "trade": prof.get("trade") or "",
        "hourlyRate": prof.get("hourlyRate") or 0,
        "dayRate": prof.get("dayRate") or 0,
        "startDate": prof.get("startDate") or "",
        "niNumber": prof.get("niNumber") or "",
        "utrNumber": prof.get("utrNumber") or "",
        "emergencyContactName": prof.get("emergencyContactName") or "",
        "emergencyContactPhone": prof.get("emergencyContactPhone") or "",
        "address": prof.get("address") or "",
        "bio": prof.get("bio") or "",
        "availability": prof.get("availability") or {"state": "Available", "fromDate": "", "toDate": "", "note": ""},
        "certifications": certs,
        "certificationCount": len(certs),
        "certificationsExpiringSoon": len(expiring),
        "certificationsExpired": len(expired),
        "projectAllocations": allocs,
        "projectAllocationCount": len(allocs),
        "lastActiveAt": u.get("lastActiveAt") or "",
        "createdAt": u.get("createdAt") or "",
        "isActive": bool(u.get("lastActiveAt")),
        "status": "Active" if u.get("lastActiveAt") else "Invited",
    }


def _cert_status(cert: dict, today: str) -> str:
    exp = cert.get("expiryDate") or ""
    if not exp:
        return "valid"
    if exp < today:
        return "expired"
    # within 30 days
    try:
        exp_d = datetime.strptime(exp, "%Y-%m-%d").date()
        today_d = datetime.strptime(today, "%Y-%m-%d").date()
        if (exp_d - today_d).days <= 30:
            return "expiring_soon"
    except Exception:
        return "valid"
    return "valid"


def build_router(db, get_user):
    router = APIRouter(prefix="/api/team-management", tags=["team-management"])

    def _team_owner_id(user: dict) -> str:
        return user.get("teamOwnerId") or user["id"]

    async def _require_admin(user: dict):
        role = user.get("teamRole") or ("owner" if not user.get("teamOwnerId") else "member")
        if role not in ("owner", "admin"):
            raise HTTPException(403, "Only the account owner or admins can manage the team.")

    async def _load_members(owner_id: str) -> List[dict]:
        return await db.users.find({"$or": [{"id": owner_id}, {"teamOwnerId": owner_id}]}).to_list(500)

    async def _load_pending_invites(owner_id: str) -> List[dict]:
        # Existing invite records live under db.team_invites (see server.py invite flow).
        try:
            invites = await db.team_invites.find({"ownerId": owner_id, "status": "pending"}).to_list(200)
            return invites
        except Exception:
            return []

    async def _load_jobs_by_id(user_id: str) -> Dict[str, dict]:
        jobs = await db.jobs.find({"userId": user_id}).to_list(500)
        return {j["id"]: j for j in jobs}

    @router.get("/reference")
    async def reference():
        return {
            "jobRoles": JOB_ROLES,
            "trades": TRADES,
            "availabilityStates": AVAILABILITY_STATES,
            "certificationTypes": CERT_TYPES,
            "teamRoles": ["owner", "admin", "manager", "member"],
        }

    @router.get("/dashboard")
    async def dashboard(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        owner_id = _team_owner_id(user)
        members_raw = await _load_members(owner_id)
        jobs_by_id = await _load_jobs_by_id(owner_id)
        members = [_member_shape(m, jobs_by_id) for m in members_raw]
        pending = await _load_pending_invites(owner_id)

        # KPIs
        today = _today()
        total = len(members)
        active_users = sum(1 for m in members if m["isActive"])
        managers = sum(1 for m in members if m["teamRole"] in ("owner", "admin", "manager") or m["jobRole"] in ("Project Manager", "Site Manager", "Director"))
        site_teams = sum(1 for m in members if m["jobRole"] in ("Site Manager", "Supervisor", "Foreman", "Operative", "Sub-contractor", "Apprentice"))
        expiring_certs = sum(m["certificationsExpiringSoon"] for m in members)
        expired_certs = sum(m["certificationsExpired"] for m in members)
        available_now = sum(1 for m in members if (m["availability"] or {}).get("state") in ("Available", "On Site"))
        on_leave = sum(1 for m in members if (m["availability"] or {}).get("state") in ("On Leave", "Sick"))

        # By trade breakdown
        by_trade: Dict[str, int] = {}
        for m in members:
            t = m["trade"] or "Not set"
            by_trade[t] = by_trade.get(t, 0) + 1
        # By availability
        by_availability: Dict[str, int] = {}
        for m in members:
            state = (m["availability"] or {}).get("state") or "Available"
            by_availability[state] = by_availability.get(state, 0) + 1

        return {
            "totalEmployees": total,
            "activeUsers": active_users,
            "siteTeams": site_teams,
            "managers": managers,
            "pendingInvitations": len(pending),
            "expiringCertifications": expiring_certs,
            "expiredCertifications": expired_certs,
            "availableNow": available_now,
            "onLeave": on_leave,
            "byTrade": by_trade,
            "byAvailability": by_availability,
            "members": members,
            "pendingInvites": [
                {"token": inv.get("token"), "email": inv.get("email"),
                 "role": inv.get("role"), "invitedAt": inv.get("createdAt"),
                 "invitedBy": inv.get("invitedBy")} for inv in pending
            ],
        }

    @router.get("/members")
    async def list_members(
        q: Optional[str] = None,
        trade: Optional[str] = None,
        jobRole: Optional[str] = None,
        availability: Optional[str] = None,
        authorization: Optional[str] = Header(None),
    ):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        owner_id = _team_owner_id(user)
        members_raw = await _load_members(owner_id)
        jobs_by_id = await _load_jobs_by_id(owner_id)
        members = [_member_shape(m, jobs_by_id) for m in members_raw]
        if q:
            needle = q.lower()
            def _hay(m):
                return " ".join(str(m.get(k, "") or "") for k in (
                    "fullName", "email", "phone", "trade", "jobRole", "companyName",
                )).lower()
            members = [m for m in members if needle in _hay(m)]
        if trade: members = [m for m in members if m["trade"] == trade]
        if jobRole: members = [m for m in members if m["jobRole"] == jobRole]
        if availability: members = [m for m in members if (m["availability"] or {}).get("state") == availability]
        return members

    async def _get_member(user: dict, mid: str) -> dict:
        owner_id = _team_owner_id(user)
        member = await db.users.find_one({"id": mid, "$or": [{"id": owner_id}, {"teamOwnerId": owner_id}]})
        if not member:
            raise HTTPException(status_code=404, detail="Team member not found")
        return member

    @router.get("/members/{mid}")
    async def get_member(mid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        member = await _get_member(user, mid)
        jobs_by_id = await _load_jobs_by_id(_team_owner_id(user))
        return _member_shape(member, jobs_by_id)

    @router.patch("/members/{mid}/profile")
    async def update_profile(mid: str, body: ProfileUpdate, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        # Owner/admin can update anyone; members can update themselves
        role = user.get("teamRole") or ("owner" if not user.get("teamOwnerId") else "member")
        if user["id"] != mid and role not in ("owner", "admin"):
            raise HTTPException(403, "You can only edit your own profile.")
        member = await _get_member(user, mid)
        prof = dict(member.get("teamProfile") or {})
        updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        prof.update(updates)
        await db.users.update_one({"id": mid}, {"$set": {"teamProfile": prof, "updatedAt": _now_iso()}})
        member = await db.users.find_one({"id": mid})
        return _member_shape(member)

    @router.patch("/members/{mid}/job-role")
    async def set_job_role(mid: str, body: JobRoleUpdate, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        await _require_admin(user)
        if body.jobRole not in JOB_ROLES:
            raise HTTPException(400, "Invalid job role")
        member = await _get_member(user, mid)
        prof = dict(member.get("teamProfile") or {})
        prof["jobRole"] = body.jobRole
        await db.users.update_one({"id": mid}, {"$set": {"teamProfile": prof, "updatedAt": _now_iso()}})
        return _member_shape(await db.users.find_one({"id": mid}))

    @router.patch("/members/{mid}/availability")
    async def set_availability(mid: str, body: AvailabilityUpdate, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        role = user.get("teamRole") or ("owner" if not user.get("teamOwnerId") else "member")
        if user["id"] != mid and role not in ("owner", "admin"):
            raise HTTPException(403, "You can only update your own availability.")
        if body.state not in AVAILABILITY_STATES:
            raise HTTPException(400, "Invalid availability state")
        member = await _get_member(user, mid)
        prof = dict(member.get("teamProfile") or {})
        prof["availability"] = {
            "state": body.state,
            "fromDate": body.fromDate or "",
            "toDate": body.toDate or "",
            "note": body.note or "",
            "updatedAt": _now_iso(),
        }
        await db.users.update_one({"id": mid}, {"$set": {"teamProfile": prof, "updatedAt": _now_iso()}})
        return _member_shape(await db.users.find_one({"id": mid}))

    @router.post("/members/{mid}/certifications")
    async def add_cert(mid: str, body: CertificationIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        role = user.get("teamRole") or ("owner" if not user.get("teamOwnerId") else "member")
        if user["id"] != mid and role not in ("owner", "admin"):
            raise HTTPException(403, "You can only add certifications to your own profile.")
        if not body.type.strip():
            raise HTTPException(400, "Certification type required")
        member = await _get_member(user, mid)
        prof = dict(member.get("teamProfile") or {})
        cert = {**body.model_dump(exclude_none=True), "id": str(uuid.uuid4()), "createdAt": _now_iso()}
        certs = list(prof.get("certifications") or []) + [cert]
        prof["certifications"] = certs
        await db.users.update_one({"id": mid}, {"$set": {"teamProfile": prof, "updatedAt": _now_iso()}})
        return _member_shape(await db.users.find_one({"id": mid}))

    @router.patch("/members/{mid}/certifications/{cid}")
    async def update_cert(mid: str, cid: str, body: CertificationIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        role = user.get("teamRole") or ("owner" if not user.get("teamOwnerId") else "member")
        if user["id"] != mid and role not in ("owner", "admin"):
            raise HTTPException(403, "You can only edit your own certifications.")
        member = await _get_member(user, mid)
        prof = dict(member.get("teamProfile") or {})
        certs = list(prof.get("certifications") or [])
        idx = next((i for i, c in enumerate(certs) if c.get("id") == cid), -1)
        if idx == -1:
            raise HTTPException(404, "Certification not found")
        certs[idx] = {**certs[idx], **body.model_dump(exclude_none=True), "id": cid}
        prof["certifications"] = certs
        await db.users.update_one({"id": mid}, {"$set": {"teamProfile": prof, "updatedAt": _now_iso()}})
        return _member_shape(await db.users.find_one({"id": mid}))

    @router.delete("/members/{mid}/certifications/{cid}")
    async def del_cert(mid: str, cid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        role = user.get("teamRole") or ("owner" if not user.get("teamOwnerId") else "member")
        if user["id"] != mid and role not in ("owner", "admin"):
            raise HTTPException(403, "You can only remove your own certifications.")
        member = await _get_member(user, mid)
        prof = dict(member.get("teamProfile") or {})
        certs = [c for c in (prof.get("certifications") or []) if c.get("id") != cid]
        prof["certifications"] = certs
        await db.users.update_one({"id": mid}, {"$set": {"teamProfile": prof, "updatedAt": _now_iso()}})
        return _member_shape(await db.users.find_one({"id": mid}))

    @router.post("/members/{mid}/projects")
    async def allocate_project(mid: str, body: ProjectAllocationIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        await _require_admin(user)
        if not body.projectId.strip():
            raise HTTPException(400, "projectId required")
        member = await _get_member(user, mid)
        # Verify project belongs to the team owner
        job = await db.jobs.find_one({"id": body.projectId, "userId": _team_owner_id(user)})
        if not job:
            raise HTTPException(404, "Project not found on this account")
        prof = dict(member.get("teamProfile") or {})
        allocs = list(prof.get("projectAllocations") or [])
        # avoid duplicate allocation to the same project
        existing = next((a for a in allocs if a.get("projectId") == body.projectId), None)
        if existing:
            existing.update({
                "projectName": body.projectName or job.get("projectName") or "",
                "role": body.role or existing.get("role") or "",
                "fromDate": body.fromDate or existing.get("fromDate") or "",
                "toDate": body.toDate or existing.get("toDate") or "",
                "updatedAt": _now_iso(),
            })
        else:
            allocs.append({
                "id": str(uuid.uuid4()),
                "projectId": body.projectId,
                "projectName": body.projectName or job.get("projectName") or job.get("clientName") or "",
                "role": body.role or "",
                "fromDate": body.fromDate or "",
                "toDate": body.toDate or "",
                "createdAt": _now_iso(),
            })
        prof["projectAllocations"] = allocs
        await db.users.update_one({"id": mid}, {"$set": {"teamProfile": prof, "updatedAt": _now_iso()}})
        return _member_shape(await db.users.find_one({"id": mid}), await _load_jobs_by_id(_team_owner_id(user)))

    @router.delete("/members/{mid}/projects/{pid}")
    async def deallocate_project(mid: str, pid: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        await _require_admin(user)
        member = await _get_member(user, mid)
        prof = dict(member.get("teamProfile") or {})
        allocs = [a for a in (prof.get("projectAllocations") or []) if a.get("projectId") != pid and a.get("id") != pid]
        prof["projectAllocations"] = allocs
        await db.users.update_one({"id": mid}, {"$set": {"teamProfile": prof, "updatedAt": _now_iso()}})
        return _member_shape(await db.users.find_one({"id": mid}), await _load_jobs_by_id(_team_owner_id(user)))

    return router


async def collect_team_attention(db, user_id: str, now: datetime, limit: int = 15) -> list:
    """Attention items surfaced in Command Centre:
      • Certification expired or expiring within 30 days (team_cert_expiring)
    """
    items: List[Dict[str, Any]] = []
    today = now.date().isoformat()
    thirty = (now + timedelta(days=30)).date().isoformat()

    # Get team owner id for the querying user
    me = await db.users.find_one({"id": user_id})
    if not me:
        return items
    owner_id = me.get("teamOwnerId") or user_id
    members = await db.users.find({"$or": [{"id": owner_id}, {"teamOwnerId": owner_id}]}).to_list(500)
    for m in members:
        mid = m.get("id")
        name = ((m.get("teamProfile") or {}).get("fullName")) or m.get("fullName") or m.get("username") or "Team member"
        certs = ((m.get("teamProfile") or {}).get("certifications") or [])
        for c in certs:
            exp = c.get("expiryDate") or ""
            if not exp:
                continue
            if exp < today:
                items.append({
                    "id": f"team-cert-expired-{mid}-{c.get('id')}",
                    "kind": "team_cert_expired",
                    "title": f"{c.get('type')} expired for {name}",
                    "subtitle": f"Expired {exp}",
                    "actionLabel": "Open team",
                    "actionRoute": f"/app/team?open={mid}",
                    "severity": "critical", "dueAt": exp,
                })
            elif exp <= thirty:
                items.append({
                    "id": f"team-cert-expiring-{mid}-{c.get('id')}",
                    "kind": "team_cert_expiring",
                    "title": f"{c.get('type')} expiring for {name}",
                    "subtitle": f"Expires {exp}",
                    "actionLabel": "Open team",
                    "actionRoute": f"/app/team?open={mid}",
                    "severity": "warning", "dueAt": exp,
                })
    return items[:limit]
