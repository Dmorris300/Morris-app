import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { toast } from "sonner";
import { Users, UserPlus, Trash2, Crown, Shield, Briefcase, User, Loader2, Mail, X, Clock, AlertCircle, ArrowRight } from "lucide-react";

const PLAN_LABEL = { solo: "Solo", business: "Business", pro: "Pro", enterprise: "Enterprise", free: "Free", trial: "Free trial", unlimited: "Admin" };

const ROLE_META = {
  owner:   { label: "Owner",   icon: Crown,     fg: "#E8A020", border: "rgba(232,160,32,0.4)", bg: "rgba(232,160,32,0.08)" },
  admin:   { label: "Admin",   icon: Shield,    fg: "#E8A020", border: "rgba(232,160,32,0.35)", bg: "rgba(232,160,32,0.06)" },
  manager: { label: "Manager", icon: Briefcase, fg: "#5BC97A", border: "rgba(91,201,122,0.35)", bg: "rgba(91,201,122,0.06)" },
  member:  { label: "Member",  icon: User,      fg: "#A19D94", border: "rgba(161,157,148,0.25)", bg: "rgba(161,157,148,0.04)" },
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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/team/members"); setData(r.data); }
    catch (e) {
      const d = e?.response?.data?.detail || "Could not load team";
      toast.error(typeof d === "string" ? d : "Could not load team");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const myRole = user?.teamRole || (user?.teamOwnerId ? "member" : "owner");
  const canManage = myRole === "owner" || myRole === "admin";
  const plan = data?.plan || "free";
  const seats = data?.seats || { used: 0, limit: 1 };
  const isEnterprise = plan === "enterprise" || plan === "unlimited";

  const onInvite = async (e) => {
    e?.preventDefault();
    if (!inviteEmail.trim()) { toast.error("Enter an email"); return; }
    setInviting(true);
    try {
      const r = await api.post("/team/invite", { email: inviteEmail.trim(), role: inviteRole });
      toast.success("Invite sent. They will receive an email with the join link.");
      if (r.data.demoInviteToken && !r.data.emailSent) {
        // Surface the demo link so the owner can copy it in dev
        console.info("Demo invite link:", r.data.inviteLink);
      }
      setInviteEmail("");
      await load();
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not send invite");
    } finally { setInviting(false); }
  };

  const onChangeRole = async (memberId, role) => {
    setBusy(memberId);
    try { await api.patch(`/team/members/${memberId}`, { role }); toast.success("Role updated"); await load(); }
    catch (err) { toast.error(err?.response?.data?.detail || "Could not change role"); }
    finally { setBusy(null); }
  };

  const onRemove = async (memberId, username) => {
    if (!window.confirm(`Remove ${username} from the team? Their account is preserved but they lose access to your subscription.`)) return;
    setBusy(memberId);
    try { await api.delete(`/team/members/${memberId}`); toast.success("Team member removed"); await load(); }
    catch (err) { toast.error(err?.response?.data?.detail || "Could not remove member"); }
    finally { setBusy(null); }
  };

  const onCancelInvite = async (token) => {
    try { await api.delete(`/team/invites/${token}`); toast.success("Invite cancelled"); await load(); }
    catch { toast.error("Could not cancel invite"); }
  };

  if (loading) return <div className="p-10 text-[#A19D94]" data-testid="team-loading">Loading team…</div>;

  // Block Solo / Free / Trial accounts with an upgrade prompt
  if (plan === "free" || plan === "trial" || plan === "solo") {
    return (
      <div className="p-6 md:p-10 max-w-3xl mx-auto" data-testid="page-team-locked">
        <div className="mb-8">
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Account</div>
          <h1 className="font-display text-4xl md:text-5xl flex items-center gap-3">
            <Users size={36} className="text-[#E8A020]" /> Team Management
          </h1>
        </div>
        <div className="card-dark p-6 md:p-8 text-center">
          <AlertCircle size={28} className="text-[#E8A020] mx-auto mb-3" />
          <h2 className="font-display text-3xl mb-2">Team Management is a Business plan feature.</h2>
          <p className="text-sm text-[#A19D94] mb-6">You're on the <strong className="text-[#F0EDE8]">{PLAN_LABEL[plan] || plan}</strong> plan. Upgrade to Business, Pro or Enterprise to invite your crew, assign roles and share access to every tool.</p>
          <Link to="/app/billing" className="btn-primary inline-flex items-center gap-2" data-testid="team-upgrade-cta">
            See plans <ArrowRight size={14}/>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto" data-testid="page-team">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Account</div>
        <h1 className="font-display text-4xl md:text-5xl flex items-center gap-3">
          <Users size={36} className="text-[#E8A020]" /> Team Management
        </h1>
        <p className="text-[#A19D94] mt-2">Invite your crew, assign roles, keep everyone on the same toolset.</p>
      </div>

      {/* Plan / seat usage card */}
      <div className="card-dark p-6 mb-6 flex items-center justify-between gap-4 flex-wrap" data-testid="team-plan-card">
        <div>
          <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">Current plan</div>
          <div className="font-display text-3xl">{PLAN_LABEL[plan] || plan}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">Seats used</div>
          <div className="font-display text-3xl text-[#E8A020]" data-testid="team-seats">
            {seats.used} / {seats.limit > 100 ? "∞" : seats.limit}
          </div>
        </div>
        <div className="ml-auto">
          <Link to="/app/billing" className="btn-secondary text-xs">Manage plan</Link>
        </div>
      </div>

      {/* Invite form */}
      {canManage && (
        <form onSubmit={onInvite} className="card-dark p-6 mb-6" data-testid="team-invite-form">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3 flex items-center gap-2"><UserPlus size={12}/> Invite a team member</div>
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-3">
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
              <input
                type="email"
                className="input-base pl-9"
                placeholder="email@yourcrew.co.uk"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                data-testid="invite-email-input"
                required
              />
            </div>
            <select className="input-base" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} data-testid="invite-role-select">
              <option value="member">Member</option>
              {(plan === "pro" || isEnterprise) && <option value="admin">Admin</option>}
              {isEnterprise && <option value="manager">Manager</option>}
            </select>
            <button type="submit" className="btn-primary flex items-center gap-2" disabled={inviting || seats.used >= seats.limit} data-testid="invite-send-btn">
              {inviting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Send invite
            </button>
          </div>
          {seats.used >= seats.limit && (
            <div className="mt-3 text-xs text-[#E5635A] flex items-center gap-2"><AlertCircle size={12}/> You've reached your seat limit. Upgrade your plan or remove a member to invite more.</div>
          )}
        </form>
      )}

      {/* Pending invites */}
      {(data?.pendingInvites || []).length > 0 && (
        <div className="card-dark divide-y divide-[#1a1a1a] mb-6" data-testid="team-pending-list">
          <div className="p-4 text-xs uppercase tracking-widest text-[#E8A020] flex items-center gap-2"><Clock size={12}/> Pending invites</div>
          {(data?.pendingInvites || []).map(inv => (
            <div key={inv.token || inv.email} className="p-4 flex items-center justify-between gap-3 flex-wrap" data-testid={`pending-invite-${inv.email}`}>
              <div>
                <div className="font-semibold text-[#F0EDE8]">{inv.email}</div>
                <div className="text-xs text-[#706D66] mt-1">Invited as {inv.role} · sent {new Date(inv.createdAt).toLocaleDateString("en-GB")}</div>
              </div>
              {canManage && (
                <button onClick={() => onCancelInvite(inv.token)} className="text-xs text-[#706D66] hover:text-[#E5635A] flex items-center gap-1" data-testid={`pending-cancel-${inv.email}`}>
                  <X size={12}/> Cancel invite
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Active members */}
      <div className="card-dark divide-y divide-[#1a1a1a]" data-testid="team-members-list">
        <div className="p-4 text-xs uppercase tracking-widest text-[#E8A020] flex items-center gap-2"><Users size={12}/> Active members</div>
        {(data?.members || []).map(m => {
          const role = m.teamRole || "owner";
          const meta = ROLE_META[role] || ROLE_META.member;
          const Icon = meta.icon;
          const isOwner = role === "owner";
          const me = user?.id === m.id;
          return (
            <div key={m.id} className="p-4 flex items-center justify-between gap-3 flex-wrap" data-testid={`team-member-${m.username}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.fg }}>
                  <Icon size={16}/>
                </div>
                <div>
                  <div className="font-semibold text-[#F0EDE8] flex items-center gap-2">
                    {m.fullName || m.username}{me && <span className="text-[10px] uppercase tracking-widest text-[#706D66]">(you)</span>}
                  </div>
                  <div className="text-xs text-[#706D66] mt-0.5">{m.email || m.username} · last active {fmtLastActive(m.lastActiveAt)}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {canManage && !isOwner ? (
                  <select
                    value={role}
                    onChange={(e) => onChangeRole(m.id, e.target.value)}
                    className="input-base py-1.5 text-xs w-32"
                    disabled={busy === m.id}
                    data-testid={`role-select-${m.username}`}
                  >
                    <option value="member">Member</option>
                    {(plan === "pro" || isEnterprise) && <option value="admin">Admin</option>}
                    {isEnterprise && <option value="manager">Manager</option>}
                  </select>
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-semibold"
                    style={{ color: meta.fg, background: meta.bg, border: `1px solid ${meta.border}` }}
                    data-testid={`role-badge-${m.username}`}
                  >
                    <Icon size={10}/> {meta.label}
                  </span>
                )}
                {canManage && !isOwner && (
                  <button
                    onClick={() => onRemove(m.id, m.username)}
                    className="text-xs text-[#706D66] hover:text-[#E5635A] flex items-center gap-1"
                    disabled={busy === m.id}
                    data-testid={`remove-member-${m.username}`}
                  >
                    <Trash2 size={12}/> Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Role legend */}
      <div className="mt-6 text-xs text-[#706D66] space-y-1.5" data-testid="team-role-legend">
        <div><strong className="text-[#F0EDE8]">Owner</strong> — pays the bill, owns the team. Full access.</div>
        <div><strong className="text-[#F0EDE8]">Admin</strong> — invite + remove members, manage roles, full tool access.</div>
        {isEnterprise && <div><strong className="text-[#F0EDE8]">Manager</strong> — view + edit team documents, full tool access. Cannot invite or remove.</div>}
        <div><strong className="text-[#F0EDE8]">Member</strong> — create + download own documents. Cannot manage the team.</div>
      </div>
    </div>
  );
}
