import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { toast } from "sonner";
import { Briefcase, Plus, ArrowRight, X, Images } from "lucide-react";

const STATUS_CHIPS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "invoiced", label: "Invoiced" },
  { id: "paid", label: "Paid" },
  { id: "completed", label: "Completed" },
  { id: "disputed", label: "Disputed" },
];

const STATUS_COLORS = {
  active:    { fg: "#E8A020", bg: "rgba(232,160,32,0.08)", border: "rgba(232,160,32,0.3)" },
  invoiced:  { fg: "#5B9BFF", bg: "rgba(91,155,255,0.08)", border: "rgba(91,155,255,0.3)" },
  paid:      { fg: "#5BC97A", bg: "rgba(91,201,122,0.08)", border: "rgba(91,201,122,0.3)" },
  completed: { fg: "#9AA0A6", bg: "rgba(154,160,166,0.08)", border: "rgba(154,160,166,0.3)" },
  disputed:  { fg: "#E5635A", bg: "rgba(229,99,90,0.08)",  border: "rgba(229,99,90,0.3)" },
};

const isoToday = () => new Date().toISOString().slice(0, 10);

export default function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/jobs");
      setJobs(r.data || []);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error("Jobs load failed", e);
      toast.error("Could not load jobs");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === "all" ? jobs : jobs.filter(j => j.status === filter);
  const countBy = (s) => jobs.filter(j => j.status === s).length;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-jobs">
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Job Tracker</div>
          <h1 className="font-display text-4xl md:text-5xl">My Jobs</h1>
          <p className="text-[#A19D94] mt-2 text-sm">Every quote, contract, variation and invoice — connected to a job.</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2" data-testid="jobs-new-btn">
          <Plus size={16} /> New job
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6" data-testid="jobs-filter-chips">
        {STATUS_CHIPS.map(c => {
          const active = filter === c.id;
          const count = c.id === "all" ? jobs.length : countBy(c.id);
          return (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className="px-4 py-1.5 rounded-full text-xs uppercase tracking-widest transition"
              style={{
                border: `1px solid ${active ? "#E8A020" : "rgba(160,157,148,0.25)"}`,
                background: active ? "rgba(232,160,32,0.08)" : "transparent",
                color: active ? "#E8A020" : "#A19D94",
              }}
              data-testid={`jobs-filter-${c.id}`}
            >
              {c.label} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-[#706D66] text-sm">Loading jobs…</div>
      ) : filtered.length === 0 ? (
        <div className="card-dark p-10 text-center" data-testid="jobs-empty">
          <Briefcase size={32} className="text-[#E8A020] mx-auto mb-3" />
          <div className="text-[#F0EDE8] font-semibold mb-2">{jobs.length === 0 ? "No jobs yet" : `No ${filter} jobs`}</div>
          <p className="text-sm text-[#A19D94] mb-5 max-w-md mx-auto">
            {jobs.length === 0
              ? "Create your first job to track quotes, variations, invoices and payments all in one thread."
              : "Try a different status filter or create a new job."}
          </p>
          {jobs.length === 0 && (
            <button onClick={() => setCreateOpen(true)} className="btn-primary inline-flex items-center gap-2" data-testid="jobs-empty-create">
              <Plus size={14} /> Create your first job
            </button>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="jobs-grid">
          {filtered.map(j => <JobCard key={j.id} job={j} />)}
        </div>
      )}

      {createOpen && <NewJobModal onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />}
    </div>
  );
}

function JobCard({ job }) {
  const navigate = useNavigate();
  const s = STATUS_COLORS[job.status] || STATUS_COLORS.active;
  const openPhotos = (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/app/photo-vault?jobId=${encodeURIComponent(job.id)}`);
  };
  return (
    <Link to={`/app/jobs/${job.id}`} className="card-dark p-5 hover:border-[#E8A020]/40 transition block" data-testid={`job-card-${job.id}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-[0.2em] text-[#706D66]">{job.ref}</span>
        <span
          className="text-[10px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-full"
          style={{ color: s.fg, background: s.bg, border: `1px solid ${s.border}` }}
        >
          {job.status}
        </span>
      </div>
      <div className="font-display text-xl text-[#F0EDE8] mb-1 leading-tight">{job.clientName}</div>
      {job.address && <div className="text-xs text-[#A19D94] mb-3 line-clamp-1">{job.address}</div>}
      <div className="flex items-center justify-between text-xs text-[#706D66] pt-3 border-t border-[#1a1a1a]">
        <span>{job.contractValue ? `£${Number(job.contractValue).toLocaleString("en-GB")}` : "No value set"}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openPhotos}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] uppercase tracking-widest text-[#E8A020] border border-[#E8A020]/30 hover:bg-[#E8A020]/10"
            title="View project photos in the Vault"
            data-testid={`job-photos-${job.id}`}
          >
            <Images size={11} /> Photos
          </button>
          <ArrowRight size={12} />
        </div>
      </div>
    </Link>
  );
}

function NewJobModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    projectName: "",
    clientName: "",
    company: "",
    address: "",
    siteManager: "",
    clientContact: "",
    contractValue: "",
    poNumber: "",
    startDate: isoToday(),
    expectedCompletion: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  const valid = form.clientName.trim().length > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) { toast.error("Client name is required"); return; }
    setBusy(true);
    try {
      const r = await api.post("/jobs", {
        ...form,
        contractValue: form.contractValue ? Number(form.contractValue) : 0,
      });
      toast.success(`Job created: ${r.data.ref}`);
      onCreated();
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.error("Job create failed", err);
      toast.error("Could not create job");
    } finally { setBusy(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      data-testid="job-create-overlay"
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card-dark p-6 max-w-lg w-full"
        style={{ borderColor: "#E8A020" }}
        data-testid="job-create-form"
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] mb-1">New job</div>
            <div className="font-display text-2xl text-[#F0EDE8]">Start tracking a project</div>
          </div>
          <button type="button" onClick={onClose} className="text-[#706D66] hover:text-[#F0EDE8]" data-testid="job-create-close"><X size={18} /></button>
        </div>
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <Field label="Project name">
            <input className="input-base" value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} placeholder="e.g. Chelsea Office Fit-Out" data-testid="job-project-name" />
          </Field>
          <Field label="Client name" required>
            <input className="input-base" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} data-testid="job-client" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company"><input className="input-base" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} data-testid="job-company" /></Field>
            <Field label="Site manager"><input className="input-base" value={form.siteManager} onChange={(e) => setForm({ ...form, siteManager: e.target.value })} data-testid="job-site-manager" /></Field>
          </div>
          <Field label="Site address">
            <textarea rows={2} className="input-base resize-y" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="job-address" />
          </Field>
          <Field label="Client contact (name + phone/email)">
            <input className="input-base" value={form.clientContact} onChange={(e) => setForm({ ...form, clientContact: e.target.value })} placeholder="e.g. Sarah — 07700 900123" data-testid="job-client-contact" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contract value (£)">
              <input type="number" className="input-base" value={form.contractValue} onChange={(e) => setForm({ ...form, contractValue: e.target.value })} placeholder="0" data-testid="job-value" />
            </Field>
            <Field label="PO number"><input className="input-base" value={form.poNumber} onChange={(e) => setForm({ ...form, poNumber: e.target.value })} data-testid="job-po" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input type="date" className="input-base" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} data-testid="job-start" />
            </Field>
            <Field label="Expected completion">
              <input type="date" className="input-base" value={form.expectedCompletion} onChange={(e) => setForm({ ...form, expectedCompletion: e.target.value })} data-testid="job-end" />
            </Field>
          </div>
          <Field label="Project notes">
            <textarea rows={3} className="input-base resize-y" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything else worth remembering about this project…" data-testid="job-notes" />
          </Field>
        </div>
        <div className="flex gap-2 mt-6">
          <button type="button" onClick={onClose} className="btn-secondary flex-1" data-testid="job-cancel">Cancel</button>
          <button type="submit" disabled={!valid || busy} className="btn-primary flex-1" data-testid="job-submit">
            {busy ? "Creating…" : "Create job"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2 flex items-center gap-1">
        <span>{label}</span>
        {required && <span className="text-[#E8A020]">*</span>}
      </div>
      {children}
    </div>
  );
}
