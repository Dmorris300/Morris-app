import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { toast } from "sonner";
import { ArrowLeft, FileText, Trash2, MapPin, Calendar, Wallet, AlertCircle, Save, Images } from "lucide-react";

const STATUSES = ["active", "invoiced", "paid", "completed", "disputed"];
const STATUS_COLORS = {
  active:    { fg: "#E8A020", bg: "rgba(232,160,32,0.08)", border: "rgba(232,160,32,0.3)" },
  invoiced:  { fg: "#5B9BFF", bg: "rgba(91,155,255,0.08)", border: "rgba(91,155,255,0.3)" },
  paid:      { fg: "#5BC97A", bg: "rgba(91,201,122,0.08)", border: "rgba(91,201,122,0.3)" },
  completed: { fg: "#9AA0A6", bg: "rgba(154,160,166,0.08)", border: "rgba(154,160,166,0.3)" },
  disputed:  { fg: "#E5635A", bg: "rgba(229,99,90,0.08)",  border: "rgba(229,99,90,0.3)" },
};

export default function JobDetail() {
  const { jobId } = useParams();
  const nav = useNavigate();
  const [job, setJob] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/jobs/${jobId}`);
      setJob(r.data.job);
      setDocs(r.data.documents || []);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error("Job load failed", e);
      toast.error("Could not load job");
      nav("/app/jobs");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [jobId]);

  const setStatus = async (status) => {
    // Disputed → ask for a note up front if there isn't one already
    let extra = {};
    if (status === "disputed" && !job.disputeNote) {
      const note = window.prompt("What is the dispute about? (kept on the job so you remember why)");
      if (note === null) return; // user cancelled
      extra.disputeNote = note.trim();
    }
    if (status === "paid" && !job.paidDate) {
      extra.paidDate = new Date().toISOString().slice(0, 10);
    }
    setSavingStatus(true);
    try {
      const r = await api.patch(`/jobs/${jobId}`, { status, ...extra });
      setJob(r.data);
      toast.success(`Status set to ${status}`);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error("Status update failed", e);
      toast.error("Could not update status");
    } finally { setSavingStatus(false); }
  };

  const saveDisputeNote = async (note) => {
    setSavingStatus(true);
    try {
      const r = await api.patch(`/jobs/${jobId}`, { disputeNote: note });
      setJob(r.data);
      toast.success("Dispute note saved");
    } catch {
      toast.error("Could not save note");
    } finally { setSavingStatus(false); }
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this job? Linked documents stay in your Vault but lose their job link.")) return;
    try {
      await api.delete(`/jobs/${jobId}`);
      toast.success("Job deleted");
      nav("/app/jobs");
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error("Delete failed", e);
      toast.error("Could not delete");
    }
  };

  if (loading || !job) {
    return <div className="p-10 text-[#A19D94]">Loading…</div>;
  }

  const s = STATUS_COLORS[job.status] || STATUS_COLORS.active;

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto" data-testid="page-job-detail">
      <Link to="/app/jobs" className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1 mb-6" data-testid="job-back">
        <ArrowLeft size={12} /> Back to all jobs
      </Link>

      <div className="card-dark p-6 mb-6">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#706D66] mb-2">{job.ref}</div>
            <h1 className="font-display text-4xl md:text-5xl">{job.clientName}</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/app/photo-vault?jobId=${encodeURIComponent(job.id)}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs uppercase tracking-widest text-[#E8A020] border border-[#E8A020]/40 hover:bg-[#E8A020]/10"
              data-testid="job-view-photos"
            >
              <Images size={13} /> View project photos
            </Link>
            <span
              className="text-xs uppercase tracking-[0.25em] px-3 py-1 rounded-full"
              style={{ color: s.fg, background: s.bg, border: `1px solid ${s.border}` }}
              data-testid="job-status-pill"
            >
              {job.status}
            </span>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-6">
          {job.address && <Meta icon={<MapPin size={14} />} label="Site" value={job.address} />}
          {job.contractValue ? <Meta icon={<Wallet size={14} />} label="Contract value" value={`£${Number(job.contractValue).toLocaleString("en-GB")}`} /> : null}
          {job.startDate && <Meta icon={<Calendar size={14} />} label="Started" value={new Date(job.startDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} />}
          {job.expectedCompletion && <Meta icon={<Calendar size={14} />} label="Expected" value={new Date(job.expectedCompletion).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} />}
        </div>
      </div>

      <div className="card-dark p-6 mb-6">
        <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-3">Update status</div>
        <div className="flex flex-wrap gap-2" data-testid="job-status-buttons">
          {STATUSES.map(st => {
            const active = job.status === st;
            const c = STATUS_COLORS[st];
            return (
              <button
                key={st}
                onClick={() => setStatus(st)}
                disabled={savingStatus || active}
                className="px-4 py-2 rounded text-xs uppercase tracking-widest transition disabled:opacity-50"
                style={{
                  border: `1px solid ${active ? c.fg : "rgba(160,157,148,0.2)"}`,
                  background: active ? c.bg : "transparent",
                  color: active ? c.fg : "#A19D94",
                }}
                data-testid={`job-status-${st}`}
              >
                {st}
              </button>
            );
          })}
        </div>
        {job.status === "invoiced" && (
          <p className="text-xs text-[#A19D94] mt-3">This invoice value feeds into Outstanding Invoices on your Command Centre. Mark it Paid when the cash lands.</p>
        )}
        {job.status === "paid" && job.paidDate && (
          <p className="text-xs text-[#5BC97A] mt-3">Paid on {new Date(job.paidDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}. Added to Earnings YTD.</p>
        )}
      </div>

      {job.status === "disputed" && (
        <DisputeBlock job={job} onSave={saveDisputeNote} saving={savingStatus} />
      )}

      <div className="mb-10">
        <h2 className="font-display text-2xl mb-4 flex items-center gap-2"><FileText size={18} className="text-[#E8A020]" /> Documents on this job ({docs.length})</h2>
        {docs.length === 0 ? (
          <div className="card-dark p-6 text-sm text-[#706D66]" data-testid="job-no-docs">
            No documents linked yet. When you generate a quote, variation or invoice you'll be able to attach it to this job.
          </div>
        ) : (
          <div className="card-dark divide-y divide-[#1a1a1a]" data-testid="job-docs-list">
            {docs.map(d => (
              <Link key={d.id} to="/app/history" className="flex items-center justify-between p-4 hover:bg-[#0e0e0e] transition" data-testid={`job-doc-${d.id}`}>
                <div>
                  <div className="text-sm font-semibold text-[#F0EDE8]">{d.title}</div>
                  <div className="text-xs text-[#706D66] mt-1">{d.refNumber ? `${d.refNumber} · ` : ""}{new Date(d.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={onDelete} className="btn-secondary flex items-center gap-2 text-xs" style={{ color: "#E5635A", borderColor: "rgba(229,99,90,0.4)" }} data-testid="job-delete">
          <Trash2 size={14} /> Delete job
        </button>
      </div>
    </div>
  );
}

function Meta({ icon, label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#706D66] mb-1 flex items-center gap-1">{icon}{label}</div>
      <div className="text-sm text-[#F0EDE8]">{value}</div>
    </div>
  );
}

function DisputeBlock({ job, onSave, saving }) {
  const [note, setNote] = useState(job.disputeNote || "");
  return (
    <div className="card-dark p-6 mb-6" style={{ borderColor: "rgba(229,99,90,0.4)" }} data-testid="job-dispute-block">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-[#E5635A] mb-3">
        <AlertCircle size={14}/> Dispute note
      </div>
      <p className="text-xs text-[#A19D94] mb-3">Write down what the dispute is about. Kept on the job so you can chase it without trying to remember the detail.</p>
      <textarea
        rows={4}
        className="input-base resize-y w-full mb-3"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Client says the extra sockets weren't agreed. Variation letter sent 12 May, no reply."
        data-testid="job-dispute-note-input"
      />
      <button
        onClick={() => onSave(note)}
        disabled={saving || note === (job.disputeNote || "")}
        className="btn-primary flex items-center gap-2 disabled:opacity-50"
        data-testid="job-dispute-save"
      >
        <Save size={14}/> {saving ? "Saving…" : "Save note"}
      </button>
    </div>
  );
}
