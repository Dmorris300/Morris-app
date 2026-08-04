// Morris — Team Management V2 (flagship workforce management hub)
// Dashboard-first: KPI cards + member cards with role/trade/availability +
// invite flow + certifications tracker + project allocations.
// Layers on top of the existing /api/team/* invite/seat system.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { useSearchParams } from "react-router-dom";
import api from "../lib/api";
import { toast } from "sonner";
import {
  Users, UserPlus, Trash2, Crown, Shield, Briefcase, User,
  Mail, X, AlertTriangle, CheckCircle2, Clock, Edit2, Plus,
  Calendar as CalIcon, Award, FolderKanban, Search, RefreshCw,
} from "lucide-react";

const inputClass = "w-full bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none";
const Label = ({ children }) => <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">{children}</label>;
const Field = ({ label, children, hint }) => (
  <div><Label>{label}</Label><div className="mt-1">{children}</div>{hint && <div className="text-[11px] text-[#706D66] mt-1">{hint}</div>}</div>
);

const TEAM_ROLE_META = {
  owner: { label: "Owner", icon: Crown, cls: "border-[#E8A020]/40 text-[#E8A020]" },
  admin: { label: "Admin", icon: Shield, cls: "border-[#E8A020]/40 text-[#E8A020]" },
  manager: { label: "Manager", icon: Briefcase, cls: "border-[#68D391]/40 text-[#68D391]" },
  member: { label: "Member", icon: User, cls: "border-[#2a2620] text-[#A19D94]" },
};
const AVAIL_CLASS = {
  Available: "border-[#68D391]/40 text-[#68D391]",
  "On Site": "border-[#68D391]/40 text-[#68D391]",
  "On Leave": "border-[#c8b464]/40 text-[#c8b464]",
  Sick: "border-[#F27C7C]/40 text-[#F27C7C]",
  Training: "border-[#A0A0F0]/40 text-[#A0A0F0]",
  Unavailable: "border-[#2a2620] text-[#A19D94]",
};

function fmtLastActive(iso) {
  if (!iso) return "Never";
  try {
    const d = new Date(iso);
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMin < 2) return "Just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)} hr ago`;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
}

export default function TeamManagement() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const openParamId = params.get("open") || "";
  const [dashboard, setDashboard] = useState(null);
  const [teamMeta, setTeamMeta] = useState(null); // /api/team/members payload (for seats+plan+invites+role management)
  const [reference, setReference] = useState({ jobRoles: [], trades: [], availabilityStates: [], certificationTypes: [] });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterTrade, setFilterTrade] = useState("");
  const [filterJobRole, setFilterJobRole] = useState("");
  const [filterAvailability, setFilterAvailability] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [openMember, setOpenMember] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [dRes, mRes, rRes] = await Promise.allSettled([
        api.get("/team-management/dashboard"),
        api.get("/team/members"),
        api.get("/team-management/reference"),
      ]);
      if (dRes.status === "fulfilled") setDashboard(dRes.value.data);
      if (mRes.status === "fulfilled") setTeamMeta(mRes.value.data);
      if (rRes.status === "fulfilled") setReference(rRes.value.data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not load team"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (openParamId && dashboard?.members?.length > 0 && !openMember) {
      const m = dashboard.members.find(x => x.id === openParamId);
      if (m) setOpenMember(m);
    }
  }, [openParamId, dashboard, openMember]);

  const myRole = user?.teamRole || (user?.teamOwnerId ? "member" : "owner");
  const canManage = myRole === "owner" || myRole === "admin";
  const plan = teamMeta?.plan || "free";
  const seats = teamMeta?.seats || { used: 0, limit: 1 };

  const filtered = useMemo(() => {
    const list = dashboard?.members || [];
    const s = query.trim().toLowerCase();
    return list.filter(m => {
      if (s) {
        const hay = `${m.fullName || ""} ${m.email || ""} ${m.trade || ""} ${m.jobRole || ""} ${m.phone || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (filterTrade && m.trade !== filterTrade) return false;
      if (filterJobRole && m.jobRole !== filterJobRole) return false;
      if (filterAvailability && (m.availability || {}).state !== filterAvailability) return false;
      return true;
    });
  }, [dashboard, query, filterTrade, filterJobRole, filterAvailability]);

  const invite = async () => {
    if (!inviteEmail.trim()) return toast.error("Enter an email");
    setInviting(true);
    try {
      await api.post("/team/invite", { email: inviteEmail.trim(), role: inviteRole });
      toast.success("Invitation sent");
      setInviteEmail(""); setInviteRole("member");
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Invite failed"); }
    finally { setInviting(false); }
  };
  const cancelInvite = async (token) => {
    if (!window.confirm("Cancel this invitation?")) return;
    try { await api.delete(`/team/invites/${token}`); toast.success("Invitation cancelled"); await load(); }
    catch { toast.error("Failed"); }
  };
  const changeTeamRole = async (memberId, newRole) => {
    try { await api.patch(`/team/members/${memberId}`, { role: newRole }); toast.success("Access role updated"); await load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const removeMember = async (memberId) => {
    if (!window.confirm("Remove this member from the team?")) return;
    try { await api.delete(`/team/members/${memberId}`); toast.success("Member removed"); await load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="team-page">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Workforce</div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#F0EDE8]">Team Management</h1>
          <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">Every person in your business, on one screen — access, trade, availability, certifications, and project allocations. Everything a professional operating system needs to run the crew.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={load} className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1" data-testid="team-refresh"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh</button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total employees" value={dashboard?.totalEmployees ?? 0} testId="team-stat-total" />
        <StatCard label="Active users" value={dashboard?.activeUsers ?? 0} tone="green" testId="team-stat-active" />
        <StatCard label="Site teams" value={dashboard?.siteTeams ?? 0} tone="gold" testId="team-stat-site" />
        <StatCard label="Managers" value={dashboard?.managers ?? 0} tone="amber" testId="team-stat-managers" />
        <StatCard label="Pending invitations" value={dashboard?.pendingInvitations ?? 0} tone="gold" icon={Mail} testId="team-stat-pending" />
        <StatCard label="Expiring certs" value={(dashboard?.expiringCertifications ?? 0) + (dashboard?.expiredCertifications ?? 0)} tone="red" icon={AlertTriangle} testId="team-stat-certs" />
      </div>

      {canManage && plan !== "free" && plan !== "solo" && plan !== "trial" && (
        <div className="card-dark p-4 mb-4" data-testid="team-invite-panel">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020]">Invite team member</div>
              <div className="text-[11px] text-[#A19D94]">Plan: {plan} · Seats used {seats.used}/{seats.limit}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2"><Field label="Email"><input type="email" className={inputClass} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="worker@company.co.uk" data-testid="team-invite-email" /></Field></div>
            <Field label="Access role">
              <select className={inputClass} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} data-testid="team-invite-role">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                {(plan === "enterprise" || plan === "unlimited") && <option value="manager">Manager</option>}
              </select>
            </Field>
            <div className="flex items-end"><button onClick={invite} disabled={inviting || seats.used >= seats.limit} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-40" data-testid="team-invite-btn"><UserPlus size={14} /> {inviting ? "Sending…" : "Send invitation"}</button></div>
          </div>
        </div>
      )}

      {(dashboard?.pendingInvites || []).length > 0 && (
        <div className="card-dark p-4 mb-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Pending invitations · {(dashboard?.pendingInvites || []).length}</div>
          <div className="space-y-2">
            {(dashboard?.pendingInvites || []).map(inv => (
              <div key={inv.token} className="flex items-center justify-between text-sm" data-testid={`team-pending-${inv.token}`}>
                <div><span className="text-[#F0EDE8]">{inv.email}</span> <span className="text-[11px] text-[#A19D94]">· {inv.role} · invited {fmtLastActive(inv.invitedAt)}</span></div>
                {canManage && <button onClick={() => cancelInvite(inv.token)} className="text-[#A19D94] hover:text-[#F27C7C]" data-testid={`team-pending-cancel-${inv.token}`}><X size={14} /></button>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-dark p-4 mb-4" data-testid="team-filters">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, trade…" className={`${inputClass} pl-9`} data-testid="team-search" />
          </div>
          <select value={filterTrade} onChange={(e) => setFilterTrade(e.target.value)} className={inputClass} data-testid="team-filter-trade">
            <option value="">All trades</option>
            {(reference.trades || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterJobRole} onChange={(e) => setFilterJobRole(e.target.value)} className={inputClass} data-testid="team-filter-jobrole">
            <option value="">All job roles</option>
            {(reference.jobRoles || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterAvailability} onChange={(e) => setFilterAvailability(e.target.value)} className={inputClass} data-testid="team-filter-availability">
            <option value="">All availability</option>
            {(reference.availabilityStates || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card-dark p-8 text-center text-sm text-[#A19D94]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card-dark p-10 text-center" data-testid="team-empty">
          <Users size={28} className="mx-auto text-[#E8A020] mb-3" />
          <div className="text-base text-[#F0EDE8]">No team members match your filters</div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(m => (
            <MemberRow key={m.id} m={m} canManage={canManage} onOpen={() => setOpenMember(m)}
              onChangeTeamRole={(r) => changeTeamRole(m.id, r)} onRemove={() => removeMember(m.id)}
              isSelf={m.id === user?.id} />
          ))}
        </div>
      )}

      {openMember && (
        <MemberEditor key={openMember.id} member={openMember} user={user} canManage={canManage}
          reference={reference} jobs={teamMeta?.jobs || []}
          onClose={() => setOpenMember(null)}
          onChanged={async () => { await load(); }}
          onSaved={(next) => setOpenMember(next)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone, icon: Icon, testId }) {
  const t = tone === "red" ? "text-[#F27C7C]" : tone === "green" ? "text-[#68D391]" : tone === "gold" ? "text-[#E8A020]" : tone === "amber" ? "text-[#c8b464]" : "text-[#F0EDE8]";
  return (<div className="card-dark p-3" data-testid={testId}><div className="flex items-center justify-between mb-1"><Label>{label}</Label>{Icon ? <Icon size={12} className="text-[#706D66]" /> : null}</div><div className={`mt-1 font-display text-2xl ${t}`}>{value}</div></div>);
}

function MemberRow({ m, canManage, onOpen, onChangeTeamRole, onRemove, isSelf }) {
  const roleMeta = TEAM_ROLE_META[m.teamRole] || TEAM_ROLE_META.member;
  const RoleIcon = roleMeta.icon;
  const availState = (m.availability || {}).state || "Available";
  const availCls = AVAIL_CLASS[availState] || AVAIL_CLASS.Available;
  const certAlert = (m.certificationsExpired || 0) + (m.certificationsExpiringSoon || 0);
  return (
    <div className="card-dark p-4 flex items-start gap-3" data-testid={`team-row-${m.id}`}>
      <button onClick={onOpen} className="text-left flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base text-[#F0EDE8] font-medium truncate">{m.fullName || m.email}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${roleMeta.cls} inline-flex items-center gap-1`}><RoleIcon size={10} /> {roleMeta.label}</span>
          {m.jobRole && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#A19D94]">{m.jobRole}</span>}
          {m.trade && m.trade !== "Not applicable" && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#A19D94]">{m.trade}</span>}
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${availCls}`}>{availState}</span>
          {certAlert > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#F27C7C]/40 text-[#F27C7C]">{certAlert} cert{certAlert > 1 ? "s" : ""} due</span>}
        </div>
        <div className="text-xs text-[#A19D94] mt-1 truncate">
          {[m.email, m.phone, m.projectAllocationCount ? `${m.projectAllocationCount} project${m.projectAllocationCount > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ")}
          <span className="ml-2">· Last active {fmtLastActive(m.lastActiveAt)}</span>
        </div>
      </button>
      <div className="flex gap-1 shrink-0">
        {canManage && m.teamRole !== "owner" && !isSelf && (
          <select value={m.teamRole} onChange={(e) => onChangeTeamRole(e.target.value)} className="bg-[#0f0d09] border border-[#2a2620] rounded-md px-2 py-1 text-xs text-[#F0EDE8]" data-testid={`team-role-select-${m.id}`}>
            <option value="member">Member</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        )}
        <button onClick={onOpen} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`team-row-edit-${m.id}`}><Edit2 size={14} /></button>
        {canManage && m.teamRole !== "owner" && !isSelf && (
          <button onClick={onRemove} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" data-testid={`team-row-remove-${m.id}`}><Trash2 size={14} /></button>
        )}
      </div>
    </div>
  );
}

// ================================================================
// MEMBER EDITOR (profile / certifications / availability / projects)
// ================================================================
function MemberEditor({ member, user, canManage, reference, jobs, onClose, onChanged, onSaved }) {
  const [tab, setTab] = useState("profile");
  const [data, setData] = useState(member);
  const isSelf = member.id === user?.id;
  const canEditProfile = canManage || isSelf;

  const patch = (partial) => setData(d => ({ ...d, ...partial }));

  const saveProfile = async () => {
    try {
      const r = await api.patch(`/team-management/members/${member.id}/profile`, {
        fullName: data.fullName, phone: data.phone,
        emergencyContactName: data.emergencyContactName, emergencyContactPhone: data.emergencyContactPhone,
        address: data.address, trade: data.trade, hourlyRate: Number(data.hourlyRate || 0),
        dayRate: Number(data.dayRate || 0), startDate: data.startDate,
        niNumber: data.niNumber, utrNumber: data.utrNumber, bio: data.bio,
      });
      onSaved(r.data);
      toast.success("Profile saved");
      await onChanged();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const setJobRole = async (jobRole) => {
    try { const r = await api.patch(`/team-management/members/${member.id}/job-role`, { jobRole }); onSaved(r.data); toast.success("Job role updated"); await onChanged(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const setAvailability = async (payload) => {
    try { const r = await api.patch(`/team-management/members/${member.id}/availability`, payload); onSaved(r.data); toast.success("Availability updated"); await onChanged(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const [certDraft, setCertDraft] = useState(null);
  const saveCert = async () => {
    if (!certDraft) return;
    if (!certDraft.type) return toast.error("Type required");
    try {
      const isNew = !((data.certifications || []).find(c => c.id === certDraft.id));
      const r = isNew
        ? await api.post(`/team-management/members/${member.id}/certifications`, certDraft)
        : await api.patch(`/team-management/members/${member.id}/certifications/${certDraft.id}`, certDraft);
      onSaved(r.data);
      setCertDraft(null);
      toast.success(isNew ? "Certification added" : "Certification updated");
      await onChanged();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const delCert = async (cid) => {
    if (!window.confirm("Delete this certification?")) return;
    try { const r = await api.delete(`/team-management/members/${member.id}/certifications/${cid}`); onSaved(r.data); await onChanged(); }
    catch { toast.error("Failed"); }
  };

  const [projDraft, setProjDraft] = useState(null);
  const allocate = async () => {
    if (!projDraft) return;
    if (!projDraft.projectId) return toast.error("Select a project");
    try {
      const r = await api.post(`/team-management/members/${member.id}/projects`, projDraft);
      onSaved(r.data);
      setProjDraft(null);
      toast.success("Project allocated");
      await onChanged();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const deallocate = async (pid) => {
    if (!window.confirm("Remove this project allocation?")) return;
    try { const r = await api.delete(`/team-management/members/${member.id}/projects/${pid}`); onSaved(r.data); await onChanged(); }
    catch { toast.error("Failed"); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto" data-testid="team-editor">
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-4xl mx-auto card-dark p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-1">Team member</div>
              <h2 className="font-display text-2xl text-[#F0EDE8] truncate">{data.fullName || data.email}</h2>
              <div className="text-[11px] text-[#A19D94] mt-1">{data.email} · {data.jobRole || "No job role set"} · {(data.availability || {}).state || "Available"}</div>
            </div>
            <button onClick={onClose} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="team-editor-close"><X size={20} /></button>
          </div>

          <div className="flex gap-1 mb-4 overflow-x-auto" data-testid="team-editor-tabs">
            {[
              { k: "profile", l: "Profile" },
              { k: "role", l: "Role & access" },
              { k: "certs", l: `Certifications (${(data.certifications || []).length})` },
              { k: "availability", l: "Availability" },
              { k: "projects", l: `Projects (${(data.projectAllocations || []).length})` },
            ].map(t => (
              <button key={t.k} onClick={() => setTab(t.k)} data-testid={`team-tab-${t.k}`}
                className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${tab === t.k ? "bg-[#E8A020] text-black" : "bg-[#0f0d09] text-[#A19D94] border border-[#2a2620]"}`}>{t.l}</button>
            ))}
          </div>

          {tab === "profile" && (
            <div className="space-y-3" data-testid="team-tab-panel-profile">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Full name"><input className={inputClass} value={data.fullName || ""} onChange={(e) => patch({ fullName: e.target.value })} disabled={!canEditProfile} data-testid="team-profile-name" /></Field>
                <Field label="Phone"><input className={inputClass} value={data.phone || ""} onChange={(e) => patch({ phone: e.target.value })} disabled={!canEditProfile} data-testid="team-profile-phone" /></Field>
                <Field label="Trade">
                  <select className={inputClass} value={data.trade || ""} onChange={(e) => patch({ trade: e.target.value })} disabled={!canEditProfile}>
                    <option value="">Select trade</option>
                    {(reference.trades || []).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Start date"><input type="date" className={inputClass} value={data.startDate || ""} onChange={(e) => patch({ startDate: e.target.value })} disabled={!canEditProfile} /></Field>
                <Field label="Hourly rate (£)"><input type="number" step="0.01" className={inputClass} value={data.hourlyRate || 0} onChange={(e) => patch({ hourlyRate: e.target.value })} disabled={!canEditProfile} /></Field>
                <Field label="Day rate (£)"><input type="number" step="0.01" className={inputClass} value={data.dayRate || 0} onChange={(e) => patch({ dayRate: e.target.value })} disabled={!canEditProfile} /></Field>
                <Field label="NI number"><input className={inputClass} value={data.niNumber || ""} onChange={(e) => patch({ niNumber: e.target.value })} disabled={!canEditProfile} /></Field>
                <Field label="UTR (if self-employed)"><input className={inputClass} value={data.utrNumber || ""} onChange={(e) => patch({ utrNumber: e.target.value })} disabled={!canEditProfile} /></Field>
                <Field label="Emergency contact name"><input className={inputClass} value={data.emergencyContactName || ""} onChange={(e) => patch({ emergencyContactName: e.target.value })} disabled={!canEditProfile} /></Field>
                <Field label="Emergency contact phone"><input className={inputClass} value={data.emergencyContactPhone || ""} onChange={(e) => patch({ emergencyContactPhone: e.target.value })} disabled={!canEditProfile} /></Field>
                <div className="md:col-span-2"><Field label="Home address"><textarea className={`${inputClass} min-h-[60px]`} value={data.address || ""} onChange={(e) => patch({ address: e.target.value })} disabled={!canEditProfile} /></Field></div>
                <div className="md:col-span-2"><Field label="Notes / bio"><textarea className={`${inputClass} min-h-[60px]`} value={data.bio || ""} onChange={(e) => patch({ bio: e.target.value })} disabled={!canEditProfile} /></Field></div>
              </div>
              {canEditProfile && <button onClick={saveProfile} className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="team-profile-save">Save profile</button>}
            </div>
          )}

          {tab === "role" && (
            <div className="space-y-3" data-testid="team-tab-panel-role">
              <div className="card-dark p-4">
                <Label>Job role</Label>
                <div className="text-[11px] text-[#706D66] mb-2">The person&apos;s on-site role (Site Manager, Operative, QS…) — shown across projects and reports.</div>
                <div className="flex flex-wrap gap-2">
                  {(reference.jobRoles || []).map(r => (
                    <button key={r} onClick={() => canManage && setJobRole(r)} disabled={!canManage}
                      className={`px-3 py-1.5 rounded-md text-xs border ${data.jobRole === r ? "bg-[#E8A020] text-black border-[#E8A020]" : "border-[#2a2620] text-[#F0EDE8] hover:border-[#E8A020]"} disabled:opacity-40`}
                      data-testid={`team-jobrole-${r}`}>{r}</button>
                  ))}
                </div>
              </div>
              <div className="card-dark p-4">
                <Label>Access role</Label>
                <div className="text-[11px] text-[#706D66] mb-2">Determines what the person can see and change inside Morris. Owner &gt; Admin &gt; Manager &gt; Member.</div>
                <div className="text-sm text-[#F0EDE8]">Current access: <span className="text-[#E8A020]">{data.teamRole}</span></div>
                <div className="text-[11px] text-[#A19D94] mt-1">Update via the role dropdown on the member list. Access changes require the account owner or an admin.</div>
              </div>
            </div>
          )}

          {tab === "certs" && (
            <div className="space-y-3" data-testid="team-tab-panel-certs">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Certifications · {(data.certifications || []).length}</div>
                {canEditProfile && <button onClick={() => setCertDraft({ type: "CSCS Card", number: "", issuedBy: "", issuedDate: "", expiryDate: "", documentUrl: "", notes: "" })} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="team-cert-add"><Plus size={12} /> Add certification</button>}
              </div>
              {(data.certifications || []).length === 0 ? (
                <div className="card-dark p-4 text-center text-sm text-[#A19D94]">No certifications yet.</div>
              ) : (
                <div className="space-y-2">
                  {(data.certifications || []).map(c => {
                    const today = new Date().toISOString().slice(0, 10);
                    const expired = (c.expiryDate || "") && c.expiryDate < today;
                    const expiring = !expired && (c.expiryDate || "") && c.expiryDate <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
                    const cls = expired ? "border-[#F27C7C]/40 text-[#F27C7C]" : expiring ? "border-[#c8b464]/40 text-[#c8b464]" : "border-[#68D391]/40 text-[#68D391]";
                    return (
                      <div key={c.id} className="card-dark p-3 flex items-start gap-3" data-testid={`team-cert-row-${c.id}`}>
                        <Award size={16} className="text-[#E8A020] mt-1" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-[#F0EDE8] font-medium truncate">{c.type}</span>
                            {c.number && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#A19D94]">#{c.number}</span>}
                            {c.expiryDate && <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cls}`}>{expired ? "Expired" : expiring ? "Expiring" : "Valid"} · {c.expiryDate}</span>}
                          </div>
                          <div className="text-[11px] text-[#A19D94] mt-1">{[c.issuedBy, c.issuedDate ? `Issued ${c.issuedDate}` : ""].filter(Boolean).join(" · ") || "No details"}</div>
                        </div>
                        {canEditProfile && (
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => setCertDraft(c)} className="p-2 text-[#A19D94] hover:text-[#E8A020]"><Edit2 size={12} /></button>
                            <button onClick={() => delCert(c.id)} className="p-2 text-[#A19D94] hover:text-[#F27C7C]"><Trash2 size={12} /></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "availability" && (
            <div className="space-y-3" data-testid="team-tab-panel-availability">
              <div className="text-[11px] text-[#A19D94]">Current availability: <span className="text-[#F0EDE8]">{(data.availability || {}).state || "Available"}</span></div>
              <div className="flex flex-wrap gap-2">
                {(reference.availabilityStates || []).map(s => (
                  <button key={s} onClick={() => canEditProfile && setAvailability({ state: s })} disabled={!canEditProfile}
                    className={`px-3 py-1.5 rounded-md text-xs border ${(data.availability || {}).state === s ? "bg-[#E8A020] text-black border-[#E8A020]" : "border-[#2a2620] text-[#F0EDE8] hover:border-[#E8A020]"} disabled:opacity-40`}
                    data-testid={`team-avail-${s.replace(/ /g, "-")}`}>{s}</button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <Field label="From date"><input type="date" className={inputClass} value={(data.availability || {}).fromDate || ""} onChange={(e) => canEditProfile && setAvailability({ state: (data.availability || {}).state || "Available", fromDate: e.target.value, toDate: (data.availability || {}).toDate, note: (data.availability || {}).note })} disabled={!canEditProfile} /></Field>
                <Field label="To date"><input type="date" className={inputClass} value={(data.availability || {}).toDate || ""} onChange={(e) => canEditProfile && setAvailability({ state: (data.availability || {}).state || "Available", fromDate: (data.availability || {}).fromDate, toDate: e.target.value, note: (data.availability || {}).note })} disabled={!canEditProfile} /></Field>
                <div className="md:col-span-2"><Field label="Note"><textarea className={`${inputClass} min-h-[60px]`} value={(data.availability || {}).note || ""} onChange={(e) => canEditProfile && setAvailability({ state: (data.availability || {}).state || "Available", fromDate: (data.availability || {}).fromDate, toDate: (data.availability || {}).toDate, note: e.target.value })} disabled={!canEditProfile} /></Field></div>
              </div>
            </div>
          )}

          {tab === "projects" && (
            <div className="space-y-3" data-testid="team-tab-panel-projects">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Project allocations · {(data.projectAllocations || []).length}</div>
                {canManage && <button onClick={() => setProjDraft({ projectId: "", role: "", fromDate: "", toDate: "" })} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="team-project-add"><Plus size={12} /> Allocate project</button>}
              </div>
              {(data.projectAllocations || []).length === 0 ? (
                <div className="card-dark p-4 text-center text-sm text-[#A19D94]">Not allocated to any projects.</div>
              ) : (
                <div className="space-y-2">
                  {(data.projectAllocations || []).map(a => (
                    <div key={a.id || a.projectId} className="card-dark p-3 flex items-start gap-3" data-testid={`team-alloc-row-${a.projectId}`}>
                      <FolderKanban size={16} className="text-[#E8A020] mt-1" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[#F0EDE8] truncate">{a.projectName || a.projectId}</div>
                        <div className="text-[11px] text-[#A19D94] mt-1">{[a.role, a.fromDate ? `from ${a.fromDate}` : "", a.toDate ? `to ${a.toDate}` : ""].filter(Boolean).join(" · ") || "No dates set"}</div>
                      </div>
                      {canManage && <button onClick={() => deallocate(a.projectId)} className="p-2 text-[#A19D94] hover:text-[#F27C7C]"><Trash2 size={12} /></button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {certDraft && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="team-cert-modal">
            <div className="card-dark p-5 max-w-xl w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-xl text-[#F0EDE8]">{certDraft.id ? "Edit" : "Add"} certification</h3><button onClick={() => setCertDraft(null)} className="text-[#A19D94]"><X size={18} /></button></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Type">
                  <select className={inputClass} value={certDraft.type} onChange={(e) => setCertDraft({ ...certDraft, type: e.target.value })} data-testid="team-cert-type">
                    {(reference.certificationTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Card / cert number"><input className={inputClass} value={certDraft.number} onChange={(e) => setCertDraft({ ...certDraft, number: e.target.value })} data-testid="team-cert-number" /></Field>
                <Field label="Issued by"><input className={inputClass} value={certDraft.issuedBy} onChange={(e) => setCertDraft({ ...certDraft, issuedBy: e.target.value })} /></Field>
                <Field label="Issued date"><input type="date" className={inputClass} value={certDraft.issuedDate} onChange={(e) => setCertDraft({ ...certDraft, issuedDate: e.target.value })} /></Field>
                <Field label="Expiry date"><input type="date" className={inputClass} value={certDraft.expiryDate} onChange={(e) => setCertDraft({ ...certDraft, expiryDate: e.target.value })} data-testid="team-cert-expiry" /></Field>
                <Field label="Document URL"><input className={inputClass} value={certDraft.documentUrl} onChange={(e) => setCertDraft({ ...certDraft, documentUrl: e.target.value })} /></Field>
                <div className="md:col-span-2"><Field label="Notes"><textarea className={`${inputClass} min-h-[60px]`} value={certDraft.notes} onChange={(e) => setCertDraft({ ...certDraft, notes: e.target.value })} /></Field></div>
              </div>
              <div className="flex gap-2 mt-4"><button onClick={() => setCertDraft(null)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={saveCert} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="team-cert-save">Save</button></div>
            </div>
          </div>
        )}

        {projDraft && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="team-project-modal">
            <div className="card-dark p-5 max-w-lg w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-xl text-[#F0EDE8]">Allocate project</h3><button onClick={() => setProjDraft(null)} className="text-[#A19D94]"><X size={18} /></button></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2"><Field label="Project">
                  <select className={inputClass} value={projDraft.projectId} onChange={(e) => setProjDraft({ ...projDraft, projectId: e.target.value })} data-testid="team-project-select">
                    <option value="">Select a project</option>
                    {(jobs || []).map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName}</option>)}
                  </select>
                </Field></div>
                <Field label="Role on this project"><input className={inputClass} value={projDraft.role} onChange={(e) => setProjDraft({ ...projDraft, role: e.target.value })} placeholder="e.g. Site Manager" /></Field>
                <Field label="From"><input type="date" className={inputClass} value={projDraft.fromDate} onChange={(e) => setProjDraft({ ...projDraft, fromDate: e.target.value })} /></Field>
                <Field label="To"><input type="date" className={inputClass} value={projDraft.toDate} onChange={(e) => setProjDraft({ ...projDraft, toDate: e.target.value })} /></Field>
              </div>
              <div className="flex gap-2 mt-4"><button onClick={() => setProjDraft(null)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={allocate} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="team-project-save">Allocate</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
