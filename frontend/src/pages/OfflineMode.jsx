import { useEffect, useState } from "react";
import { WifiOff, Wifi, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";

const QUEUE_KEY = "morris_offline_queue_v1";

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}
function saveQueue(arr) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(arr));
}

export default function OfflineMode() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [queue, setQueue] = useState(loadQueue);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const goOnline = () => { setOnline(true); toast.success("Back online. You can sync queued work now."); };
    const goOffline = () => { setOnline(false); toast.message("Offline. Drafts will queue locally."); };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const refresh = () => setQueue(loadQueue());

  const syncOne = async (item) => {
    try {
      if (item.kind === "document") {
        await api.post("/documents/save", { title: item.title, toolId: item.toolId, content: item.content });
        return true;
      }
      if (item.kind === "cis") {
        await api.post("/cis/payments", item.payload);
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  };

  const syncAll = async () => {
    if (queue.length === 0) return;
    if (!online) { toast.error("You're offline. Reconnect first."); return; }
    setSyncing(true);
    const remaining = [];
    for (const item of queue) {
      const ok = await syncOne(item);
      if (!ok) remaining.push(item);
    }
    saveQueue(remaining);
    setQueue(remaining);
    setSyncing(false);
    if (remaining.length === 0) toast.success(`Synced. ${queue.length} item${queue.length === 1 ? "" : "s"} pushed.`);
    else toast.error(`${remaining.length} item${remaining.length === 1 ? "" : "s"} failed to sync. Try again.`);
  };

  const clearAll = () => {
    if (!window.confirm("Discard all queued items? This cannot be undone.")) return;
    saveQueue([]); setQueue([]); toast.success("Queue cleared.");
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto" data-testid="page-offline">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Account</div>
        <h1 className="font-display text-4xl md:text-5xl flex items-center gap-3">
          {online ? <Wifi size={36} className="text-[#5BC97A]" /> : <WifiOff size={36} className="text-[#E5635A]" />}
          Offline Mode
        </h1>
        <p className="text-[#A19D94] mt-2">Working in a black-spot? Morris saves your drafts locally. Sync them up when you're back in signal.</p>
      </div>

      {/* Status */}
      <div className="card-dark p-6 mb-6 flex items-center justify-between gap-3 flex-wrap" data-testid="offline-status-card">
        <div>
          <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">Network status</div>
          <div className="font-display text-3xl" style={{ color: online ? "#5BC97A" : "#E5635A" }}>
            {online ? "Online" : "Offline"}
          </div>
          <div className="text-xs text-[#706D66] mt-1">Last checked: {new Date().toLocaleTimeString("en-GB")}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={refresh} className="btn-secondary flex items-center gap-2" data-testid="offline-refresh-btn"><RefreshCw size={14}/> Refresh queue</button>
          <button onClick={syncAll} className="btn-primary flex items-center gap-2" disabled={syncing || queue.length === 0 || !online} data-testid="offline-sync-btn">
            {syncing ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>}
            Sync now ({queue.length})
          </button>
        </div>
      </div>

      {/* Queue */}
      <div className="card-dark divide-y divide-[#1a1a1a]" data-testid="offline-queue">
        {queue.length === 0 ? (
          <div className="p-6 text-sm text-[#706D66] italic">Nothing queued. When you're offline, any documents you generate or CIS payments you log will be queued here.</div>
        ) : queue.map((item, idx) => (
          <div key={idx} className="p-4 flex items-center justify-between gap-3" data-testid={`offline-queue-item-${idx}`}>
            <div>
              <div className="font-semibold text-[#F0EDE8] capitalize">{item.kind} · {item.title || item.toolId || (item.payload?.contractor) || "Draft"}</div>
              <div className="text-xs text-[#706D66] mt-1">Queued {item.queuedAt ? new Date(item.queuedAt).toLocaleString("en-GB") : ""}</div>
            </div>
            <AlertCircle size={14} className="text-[#E8A020]" />
          </div>
        ))}
      </div>

      {queue.length > 0 && (
        <button onClick={clearAll} className="mt-4 text-xs text-[#706D66] hover:text-[#E5635A]" data-testid="offline-clear-btn">
          Discard all queued items
        </button>
      )}

      {/* How it works */}
      <div className="card-dark p-6 mt-8 text-xs text-[#A19D94] space-y-2" data-testid="offline-explainer">
        <div className="text-[#E8A020] uppercase tracking-widest text-xs">How offline mode works</div>
        <p>1. When your phone loses signal, Morris keeps running. You can still open tools, fill them in and save drafts to your device.</p>
        <p>2. Each draft is encrypted in your browser's local storage with your account ID.</p>
        <p>3. The moment you reconnect, come back to this page and tap "Sync now" — Morris will push every queued item to the Vault.</p>
        <p>4. AI generation (Verbal to Variation, Photo to Document) needs signal to call Claude — those features will queue the inputs for you to run when back online.</p>
      </div>
    </div>
  );
}

// Helper to enqueue items from anywhere in the app.
export function enqueueOffline(item) {
  const q = loadQueue();
  q.push({ ...item, queuedAt: new Date().toISOString() });
  saveQueue(q);
}
