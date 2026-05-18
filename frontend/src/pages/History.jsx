import { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { downloadPdf } from "../lib/pdf";
import { Download, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function History() {
  const { user } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);

  const load = () => api.get("/documents").then(r => setDocs(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const del = async (id) => { await api.delete(`/documents/${id}`); load(); };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-history">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Account</div>
        <h1 className="font-display text-4xl md:text-5xl">Document History</h1>
        <p className="text-[#A19D94] mt-2">Everything you've generated and saved.</p>
      </div>
      {loading ? <div className="text-[#706D66]">Loading…</div> : (
        docs.length === 0 ? <div className="card-dark p-6 text-sm text-[#706D66]">Nothing saved yet. generate a document and hit Save.</div> :
        <div className="space-y-3">
          {docs.map(d => (
            <div key={d.id} className="card-dark p-4" data-testid={`history-item-${d.id}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold">{d.title}</div>
                  <div className="text-xs text-[#706D66] mt-1">{new Date(d.createdAt).toLocaleString("en-GB")}</div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => downloadPdf({ title: d.title, content: d.content, user })}><Download size={12}/> PDF</button>
                  <button className="btn-secondary text-xs flex items-center gap-1" onClick={async () => { await navigator.clipboard.writeText(d.content); toast.success("Copied"); }}><Copy size={12}/> Copy</button>
                  <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => del(d.id)}><Trash2 size={12}/> Delete</button>
                  <button className="btn-secondary text-xs" onClick={() => setOpen(open === d.id ? null : d.id)}>{open === d.id ? "Hide" : "View"}</button>
                </div>
              </div>
              {open === d.id && <div className="mt-4 pt-4 border-t border-[#F0EDE8]/5 tool-result text-sm">{d.content}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
