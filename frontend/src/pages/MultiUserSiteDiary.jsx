import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, Users, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { drawHeader, addFooter, appendPhotographicEvidence } from "../lib/pdf";
import { mediaListToPdfPhotos } from "../lib/media";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import AttachMedia, { recordDocMediaUsage } from "../components/AttachMedia";
import DraftSaveButton from "../components/DraftSaveButton";
import useToolDraft from "../hooks/useToolDraft";

const TOOL_ID   = "multiuser-site-diary";
const TOOL_NAME = "Multi-User Site Diary";
const TOOL_INFO =
  "Daily site diary for subcontractor bosses running multiple gangs or teams on the same site. Each gang's activities are recorded separately, producing a structured daily record covering labour, progress, hours, materials and any issues across the whole operation.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const N = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const WEATHER_OPTIONS = [
  "Fine",
  "Overcast",
  "Light rain",
  "Heavy rain",
  "Cold",
  "Icy",
  "Hot",
  "Windy",
];

const SITE_STATUS_OPTIONS = [
  "Full operation",
  "Reduced operation",
  "Severely disrupted",
  "Site stopped",
];

const PROGRESS_OPTIONS = [
  "Ahead of programme",
  "On programme",
  "Slightly behind",
  "Significantly behind",
  "No progress today",
];

function makeGang() {
  return {
    id: crypto.randomUUID(),
    name: "",
    leader: "",
    workerCount: "",
    location: "",
    workDone: "",
    progress: "On programme",
    hoursWorked: "",
    issues: "",
    materials: "",
  };
}

export default function MultiUserSiteDiary() {
  const { user, refresh } = useAuth();

  // SECTION 1 — SITE DETAILS
  const [jobs, setJobs]               = useState([]);
  const [jobId, setJobId]             = useState("");
  const [project, setProject]         = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [diaryDate, setDiaryDate]     = useState(isoToday());
  const [weather, setWeather]         = useState("Fine");
  const [siteStatus, setSiteStatus]   = useState("Full operation");

  // Load existing Job Tracker projects — read-only, reuses the same endpoint
  // Job Tracker and Photo Vault already trust. Never creates or modifies jobs.
  useEffect(() => {
    api.get("/jobs").then((r) => setJobs(Array.isArray(r.data) ? r.data : [])).catch(() => setJobs([]));
  }, []);

  // When the user picks a job, populate project + site address from the
  // existing record. Keeps fields editable as overrides — same UX as
  // SiteDiary.jsx. Choosing "— Unlinked —" clears jobId only, so any typed
  // overrides remain untouched (users on ad-hoc sites keep the old behaviour).
  const onSelectJob = (id) => {
    setJobId(id);
    if (!id) return;
    const j = jobs.find((x) => x.id === id);
    if (!j) return;
    setProject(j.projectName || j.clientName || "");
    setSiteAddress(j.address || "");
  };

  // Photo Vault attachments
  const [attachedMedia, setAttachedMedia] = useState([]);

  // SECTION 2 — GANGS
  const [gangs, setGangs] = useState([makeGang()]);

  // SECTION 4 — OVERALL NOTES
  const [visitors, setVisitors]                 = useState("");
  const [instructions, setInstructions]         = useState("");
  const [overallNotes, setOverallNotes]         = useState("");

  // Output / sign-off
  const [infoOpen, setInfoOpen]         = useState(false);
  const [generating, setGenerating]     = useState(false);
  const [result, setResult]             = useState("");
  const [refNumber, setRefNumber]       = useState("");
  const [liveSignature, setLiveSignature] = useState("");

  // ---------- Draft save/resume ----------
  const getDraftData = () => ({
    jobId, project, siteAddress, diaryDate, weather, siteStatus, gangs,
    visitors, instructions, overallNotes, result, refNumber, liveSignature,
    attachedMedia,
  });
  useToolDraft(TOOL_ID, (p) => {
    if (p.jobId !== undefined) setJobId(p.jobId);
    if (p.project !== undefined) setProject(p.project);
    if (p.siteAddress !== undefined) setSiteAddress(p.siteAddress);
    if (p.diaryDate !== undefined) setDiaryDate(p.diaryDate);
    if (p.weather !== undefined) setWeather(p.weather);
    if (p.siteStatus !== undefined) setSiteStatus(p.siteStatus);
    if (Array.isArray(p.gangs)) setGangs(p.gangs);
    if (p.visitors !== undefined) setVisitors(p.visitors);
    if (p.instructions !== undefined) setInstructions(p.instructions);
    if (p.overallNotes !== undefined) setOverallNotes(p.overallNotes);
    if (p.result !== undefined) setResult(p.result);
    if (p.refNumber !== undefined) setRefNumber(p.refNumber);
    if (p.liveSignature !== undefined) setLiveSignature(p.liveSignature);
    if (Array.isArray(p.attachedMedia)) setAttachedMedia(p.attachedMedia);
  });

  const isFav = (user?.favourites || []).includes(TOOL_ID);
  const toggleFav = async () => {
    const cur = user?.favourites || [];
    const next = isFav ? cur.filter((x) => x !== TOOL_ID) : [...cur, TOOL_ID];
    try {
      await api.post("/profile/update", { favourites: next });
      await refresh();
      toast.success(isFav ? "Removed from favourites" : "Added to favourites");
    } catch { toast.error("Could not update favourites"); }
  };

  const updateGang = (id, field, value) =>
    setGangs((gs) => gs.map((g) => (g.id === id ? { ...g, [field]: value } : g)));
  const removeGang = (id) =>
    setGangs((gs) => gs.filter((g) => g.id !== id));
  const addGang = () => setGangs((gs) => [...gs, makeGang()]);

  const decorated = useMemo(
    () => gangs.map((g, i) => ({ ...g, gangNumber: i + 1 })),
    [gangs]
  );

  // Summary
  const summary = useMemo(() => {
    const totalGangs = decorated.length;
    const totalWorkers = decorated.reduce((s, g) => s + N(g.workerCount), 0);
    const totalHours = decorated.reduce((s, g) => s + N(g.hoursWorked), 0);
    return { totalGangs, totalWorkers, totalHours };
  }, [decorated]);

  const onGenerate = async () => {
    if (!project.trim()) { toast.error("Add the project name"); return; }
    const populated = decorated.filter((g) => (g.name || "").trim().length > 0 || (g.workDone || "").trim().length > 0);
    if (populated.length === 0) { toast.error("Add at least one gang with work carried out"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const gangsBlock = populated.map((g) => {
      return [
        `Gang ${g.gangNumber}.`,
        `Gang Name or Reference: ${g.name || "—"}`,
        `Gang Leader or Supervisor: ${g.leader || "—"}`,
        `Number of Workers: ${g.workerCount || "—"}`,
        `Location on Site: ${g.location || "—"}`,
        `Work Carried Out: ${g.workDone || "—"}`,
        `Progress Made: ${g.progress}`,
        `Hours Worked: ${g.hoursWorked || "—"}`,
        `Issues or Delays: ${g.issues || "—"}`,
        `Materials Used: ${g.materials || "—"}`,
      ].join(" | ");
    }).join("\n");

    const summaryBlock = [
      `Total Gangs on Site Today: ${summary.totalGangs}`,
      `Total Workers on Site Today: ${summary.totalWorkers}`,
      `Total Hours Worked Across All Gangs: ${summary.totalHours}`,
    ].join("\n   ");

    const overallNotesBlock = [
      `Visitors to Site Today: ${visitors || "—"}`,
      `Instructions Received Today: ${instructions || "—"}`,
      `Overall Site Notes: ${overallNotes || "—"}`,
    ].join("\n   ");

    const promptTemplate = `Produce a UK MULTI-USER SITE DIARY for one day. Plain direct construction English. No padding. No banned consultant words. Full words only — never use abbreviations such as 'N/A', 'TBC', 'qty', '&', 'inc.', 'excl.', 'approx.' or 'etc.'. This document is a contemporaneous daily record covering every gang or team on site.

1. HEADER — DOCUMENT REFERENCE: site diary. DATE: {diaryDateUk} in DD/MM/YYYY format.

2. TITLE — exactly: 'MULTI-USER SITE DIARY — {project} — {diaryDateUk}'.

3. SITE DETAILS — list on separate lines:
   Project Name: {project}
   Site Address: {siteAddress}
   Date: {diaryDateUk}
   Diary Completed by: {compiledByName}
   Position: {compiledByRole}
   Company: {companyName}
   Trade: {trade}
   Weather Conditions: {weather}
   Overall Site Status: {siteStatus}

4. GANG ACTIVITY LOG — print this header line then each gang entry below verbatim on its own line, preserving the pipe-delimited structure exactly as supplied. Separate gangs with a blank line:
{gangsBlock}

5. SITE SUMMARY — print on separate lines (use the values supplied — never recalculate):
   {summaryBlock}

6. OVERALL NOTES — print on separate lines:
   {overallNotesBlock}

7. COMPLETED BY — sign-off block:
   Diary Completed by: {compiledByName}
   Position: {compiledByRole}
   Company: {companyName}
   Date: {diaryDateUk}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

8. FOOTER — print verbatim on its own line:
   This site diary is a contemporaneous record of activities on site. It should be completed daily and retained for the duration of the project.

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent gangs, workers, hours or activities. Use only the supplied gangs and the supplied summary block.
- Full words only — write every word out in full. Never abbreviate.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct. Reads as a real daily diary from a subcontractor boss to a principal contractor.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          diaryDateUk: ukDate(diaryDate),
          jobId: jobId || null,
          project,
          siteAddress: siteAddress || "—",
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          weather,
          siteStatus,
          gangsBlock,
          summaryBlock,
          overallNotesBlock,
          compiledByName: user?.fullName || "—",
          compiledByRole: user?.signatureRole || "Director",
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      // Record which Photo Vault items were used in this document so the
      // Vault can surface "Referenced by" back to the user. Mirrors the
      // exact pattern used in GenericToolPage.jsx (line 240-246).
      if (attachedMedia.length > 0 && r.data.refNumber) {
        recordDocMediaUsage(attachedMedia, {
          docId: r.data.refNumber,
          docType: TOOL_ID,
          docTitle: `${TOOL_NAME} — ${r.data.refNumber}`,
        }).catch(() => {});
      }
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Multi-User Site Diary generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = async () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    const title = `Multi-User Site Diary — ${project || "project"} — ${ukDate(diaryDate)}`;
    const populated = decorated.filter((g) => (g.name || "").trim().length > 0 || (g.workDone || "").trim().length > 0);

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth  = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 48;
    const usable = pageWidth - margin * 2;
    const today = new Date().toLocaleDateString("en-GB");
    const userName = userWithSig?.fullName || userWithSig?.username || "";
    const company  = userWithSig?.companyName || userName;
    const ref = refNumber || "";

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    drawHeader(doc, pageWidth, margin, userWithSig, company, today, title);

    let y = 150;
    const bottom = pageHeight - 70;

    const pageBreak = (continuedTitle) => {
      addFooter(doc, pageWidth, pageHeight, userWithSig, ref, today, userName);
      doc.addPage();
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, "F");
      drawHeader(doc, pageWidth, margin, userWithSig, company, today, continuedTitle || null);
      y = 150;
    };
    const ensureSpace = (needed) => { if (y + needed > bottom) pageBreak(); };

    const sectionHead = (label) => {
      ensureSpace(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(232, 160, 32);
      doc.text(label.toUpperCase(), margin, y);
      doc.setDrawColor(232, 160, 32);
      doc.setLineWidth(0.7);
      doc.line(margin, y + 4, margin + 70, y + 4);
      y += 18;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 20);
    };

    const kvBlock = (rows) => {
      const labelW = 170;
      rows.forEach(([k, v]) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(80, 80, 80);
        const valLines = doc.splitTextToSize(String(v || "—"), usable - labelW);
        const rowH = Math.max(14, valLines.length * 12 + 4);
        ensureSpace(rowH);
        doc.text(k, margin, y + 8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(20, 20, 20);
        valLines.forEach((l, i) => doc.text(l, margin + labelW, y + 8 + i * 12));
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.3);
        doc.line(margin, y + rowH, margin + usable, y + rowH);
        y += rowH;
      });
      y += 8;
    };

    // --- SITE DETAILS ---
    sectionHead("Site Details");
    kvBlock([
      ["Project Name", project],
      ["Site Address", siteAddress || "—"],
      ["Date", ukDate(diaryDate)],
      ["Diary Completed by", user?.fullName || "—"],
      ["Position", user?.signatureRole || "Director"],
      ["Company", user?.companyName || "—"],
      ["Trade", user?.trade || "—"],
      ["Weather Conditions", weather],
      ["Overall Site Status", siteStatus],
    ]);

    // --- GANG ACTIVITY LOG (structured table per gang) ---
    sectionHead("Gang Activity Log");
    populated.forEach((g, idx) => {
      // Gang header bar
      ensureSpace(30);
      doc.setFillColor(20, 20, 20);
      doc.rect(margin, y, usable, 20, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(232, 160, 32);
      doc.text(`GANG ${idx + 1}${g.name ? "  ·  " + g.name : ""}`, margin + 8, y + 14);
      y += 26;

      const rows = [
        ["Gang Leader or Supervisor", g.leader || "—"],
        ["Number of Workers", g.workerCount || "—"],
        ["Hours Worked", g.hoursWorked || "—"],
        ["Location on Site", g.location || "—"],
        ["Progress Made", g.progress || "—"],
        ["Work Carried Out", g.workDone || "—"],
        ["Issues or Delays", g.issues || "—"],
        ["Materials Used", g.materials || "—"],
      ];
      const labelW = 170;
      rows.forEach(([k, v], rIdx) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(90, 90, 90);
        const valLines = doc.splitTextToSize(String(v || "—"), usable - labelW - 12);
        const rowH = Math.max(14, valLines.length * 12 + 4);
        ensureSpace(rowH);
        // Zebra fill for readability
        if (rIdx % 2 === 0) {
          doc.setFillColor(250, 249, 246);
          doc.rect(margin, y, usable, rowH, "F");
        }
        doc.text(k, margin + 8, y + 10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(20, 20, 20);
        valLines.forEach((l, i) => doc.text(l, margin + labelW, y + 10 + i * 12));
        y += rowH;
      });
      // Bottom border for this gang table
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.4);
      doc.line(margin, y, margin + usable, y);
      y += 14;
    });

    // --- SITE SUMMARY (KPI blocks) ---
    ensureSpace(90);
    sectionHead("Site Summary");
    const kpiW = (usable - 20) / 3;
    const kpiH = 56;
    const kpis = [
      ["Total Gangs on Site Today",   summary.totalGangs],
      ["Total Workers on Site Today", summary.totalWorkers],
      ["Total Hours Worked",          summary.totalHours],
    ];
    ensureSpace(kpiH + 10);
    kpis.forEach(([label, val], i) => {
      const x = margin + i * (kpiW + 10);
      doc.setFillColor(250, 246, 235);
      doc.setDrawColor(232, 160, 32);
      doc.setLineWidth(0.5);
      doc.roundedRect(x, y, kpiW, kpiH, 4, 4, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(120, 100, 40);
      const lbl = doc.splitTextToSize(String(label).toUpperCase(), kpiW - 16);
      lbl.forEach((l, i2) => doc.text(l, x + 8, y + 14 + i2 * 9));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(232, 160, 32);
      doc.text(String(val), x + 8, y + kpiH - 12);
    });
    y += kpiH + 16;

    // --- OVERALL NOTES ---
    sectionHead("Overall Notes");
    kvBlock([
      ["Visitors to Site Today", visitors || "—"],
      ["Instructions Received Today", instructions || "—"],
      ["Overall Site Notes", overallNotes || "—"],
    ]);

    // --- SINGLE SIGN-OFF BLOCK ---
    ensureSpace(150);
    sectionHead("Diary Completed by");

    const sigX = margin + 70;
    const sigMaxW = 220;
    const sigMaxH = 46;
    const sigLineY = y + sigMaxH + 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text("Signature:", margin, sigLineY - 4);

    if (userWithSig?.signature) {
      try {
        const props = doc.getImageProperties(userWithSig.signature);
        const ar = props.width / props.height;
        let sw = sigMaxW, sh = sw / ar;
        if (sh > sigMaxH) { sh = sigMaxH; sw = sh * ar; }
        doc.addImage(userWithSig.signature, props.fileType || "PNG", sigX, sigLineY - sh - 2, sw, sh, undefined, "FAST");
      } catch (e) {
        if (process.env.NODE_ENV !== "production") console.error("Diary signature embed failed", e);
      }
    }
    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.6);
    doc.line(sigX, sigLineY, sigX + sigMaxW, sigLineY);
    y = sigLineY + 12;

    const signOffLines = [
      ["Name",     user?.fullName || "—"],
      ["Position", user?.signatureRole || "Director"],
      ["Company",  user?.companyName || "—"],
      ["Date",     ukDate(diaryDate)],
    ];
    signOffLines.forEach(([k, v]) => {
      ensureSpace(14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(80, 80, 80);
      doc.text(k + ":", margin, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(20, 20, 20);
      doc.text(String(v || "—"), margin + 70, y);
      y += 14;
    });

    // Contemporaneous-record footer note
    ensureSpace(28);
    y += 8;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    const footerNote = "This site diary is a contemporaneous record of activities on site. It should be completed daily and retained for the duration of the project.";
    doc.splitTextToSize(footerNote, usable).forEach((l) => { ensureSpace(12); doc.text(l, margin, y); y += 12; });

    addFooter(doc, pageWidth, pageHeight, userWithSig, ref, today, userName);

    // --- PHOTOGRAPHIC EVIDENCE ANNEX ---
    let photos = [];
    if (Array.isArray(attachedMedia) && attachedMedia.length > 0) {
      try { photos = await mediaListToPdfPhotos(attachedMedia); } catch { photos = []; }
    }
    if (photos.length > 0) {
      appendPhotographicEvidence(doc, pageWidth, pageHeight, margin, photos, userWithSig, company, today, ref, userName);
    }

    const safe = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    doc.save(`${safe}.pdf`);
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-multiuser-site-diary">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Contractors</div>
          <h1 className="font-display text-4xl md:text-5xl">Multi-User Site Diary</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="msd-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="msd-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
          <DraftSaveButton tool={{ id: TOOL_ID, name: TOOL_NAME }} getDraftData={getDraftData} />
        </div>
      </div>

      {infoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={() => setInfoOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="card-dark max-w-xl w-full p-6" style={{ borderColor: "#E8A020" }}>
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-display text-2xl text-[#F0EDE8]">About this tool</h3>
              <button onClick={() => setInfoOpen(false)} className="text-[#A19D94]"><X size={18}/></button>
            </div>
            <p className="text-sm text-[#A19D94] leading-relaxed">{TOOL_INFO}</p>
          </div>
        </div>
      )}

      {/* SECTION 1 — SITE DETAILS */}
      <Section title="Site Details" testId="msd-section-1" icon={<ClipboardList size={14}/>}>
        {/* Link to an existing Job Tracker project — reuses the same jobs
            the Photo Vault filters by. Selecting a job pre-fills project +
            site address; the fields below remain editable as overrides.
            "— Unlinked —" keeps the free-text behaviour for ad-hoc sites. */}
        <div className="mb-4">
          <label className="block">
            <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">Link to Job / Project</div>
            <select
              value={jobId}
              onChange={(e) => onSelectJob(e.target.value)}
              className="input-base"
              data-testid="msd-job-select"
            >
              <option value="">— Unlinked —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {(j.projectName || j.clientName || j.ref || "Untitled")}
                  {j.address ? ` — ${j.address}` : ""}
                </option>
              ))}
            </select>
            <div className="text-[10px] text-[#706D66] mt-1">
              Optional. Linking uses your existing Job Tracker project and shows its Vault photos below.
            </div>
          </label>
        </div>
        <Grid>
          <Inp label="Project Name" value={project} onChange={setProject} testId="msd-project" />
          <Inp label="Site Address" value={siteAddress} onChange={setSiteAddress} testId="msd-site" />
          <Inp label="Date" type="date" value={diaryDate} onChange={setDiaryDate} testId="msd-date" helper="Defaults to today" />
          <ReadOnly label="Diary completed by" value={user?.fullName || "—"} testId="msd-completed-by" />
          <Drop label="Weather Conditions" value={weather} onChange={setWeather} options={WEATHER_OPTIONS} testId="msd-weather" />
          <Drop label="Overall Site Status" value={siteStatus} onChange={setSiteStatus} options={SITE_STATUS_OPTIONS} testId="msd-site-status" />
        </Grid>
      </Section>

      {/* SECTION 2 — GANG ACTIVITY LOG */}
      <Section title="Gang Activity Log" testId="msd-section-2" icon={<Users size={14}/>}>
        <div className="grid gap-4">
          {decorated.map((g, idx) => (
            <div
              key={g.id}
              className="rounded p-4 md:p-5"
              style={{
                background: "rgba(15,15,15,0.5)",
                border: "1px solid rgba(160,157,148,0.18)",
              }}
              data-testid={`msd-gang-${idx}`}
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className="text-xs uppercase tracking-widest text-[#E8A020] font-mono"
                  data-testid={`msd-gang-${idx}-label`}
                >
                  Gang {g.gangNumber}
                  {g.name ? <span className="text-[#706D66] ml-2 normal-case">— {g.name}</span> : null}
                </div>
                <button
                  onClick={() => removeGang(g.id)}
                  className="text-[#706D66] hover:text-red-400 flex items-center gap-1 text-xs"
                  data-testid={`msd-gang-${idx}-remove`}
                >
                  <Trash2 size={14}/> Remove
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2 lg:col-span-3">
                  <Inp
                    label="Gang Name or Reference"
                    value={g.name}
                    onChange={(v) => updateGang(g.id, "name", v)}
                    placeholder='e.g. "Gang 1 — First Fix", "Ductwork Team"'
                    testId={`msd-gang-${idx}-name`}
                  />
                </div>
                <Inp label="Gang Leader or Supervisor" value={g.leader} onChange={(v) => updateGang(g.id, "leader", v)} testId={`msd-gang-${idx}-leader`} />
                <Inp label="Number of Workers" type="number" value={g.workerCount} onChange={(v) => updateGang(g.id, "workerCount", v)} testId={`msd-gang-${idx}-workers`} />
                <Inp label="Hours Worked" type="number" value={g.hoursWorked} onChange={(v) => updateGang(g.id, "hoursWorked", v)} testId={`msd-gang-${idx}-hours`} />
                <div className="sm:col-span-2 lg:col-span-3">
                  <Inp
                    label="Location on Site"
                    value={g.location}
                    onChange={(v) => updateGang(g.id, "location", v)}
                    placeholder="Where did this gang work today?"
                    testId={`msd-gang-${idx}-location`}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Area
                    label="Work Carried Out"
                    value={g.workDone}
                    onChange={(v) => updateGang(g.id, "workDone", v)}
                    placeholder="Describe what was done"
                    testId={`msd-gang-${idx}-work`}
                  />
                </div>
                <Drop label="Progress Made" value={g.progress} onChange={(v) => updateGang(g.id, "progress", v)} options={PROGRESS_OPTIONS} testId={`msd-gang-${idx}-progress`} />
                <div className="sm:col-span-2 lg:col-span-3">
                  <Area
                    label="Issues or Delays (optional)"
                    value={g.issues}
                    onChange={(v) => updateGang(g.id, "issues", v)}
                    placeholder="Any problems, delays, or matters to note"
                    testId={`msd-gang-${idx}-issues`}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Inp label="Materials Used (optional)" value={g.materials} onChange={(v) => updateGang(g.id, "materials", v)} testId={`msd-gang-${idx}-materials`} />
                </div>
              </div>

              <div
                className="mt-4 pt-4 flex items-center justify-between"
                style={{ borderTop: "1px solid rgba(160,157,148,0.18)" }}
              >
                <div className="text-[10px] uppercase tracking-widest text-[#706D66]">Progress</div>
                <div className="font-display text-lg text-[#E8A020]" data-testid={`msd-gang-${idx}-progress-label`}>
                  {g.progress}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addGang} className="btn-secondary flex items-center gap-2 text-xs mt-4" data-testid="msd-add-gang">
          <Plus size={12}/> Add Gang
        </button>
      </Section>

      {/* SECTION 3 — SITE SUMMARY */}
      <Section title="Site Summary" testId="msd-section-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SummaryStat label="Total Gangs on Site Today"           value={summary.totalGangs}   testId="msd-sum-gangs" />
          <SummaryStat label="Total Workers on Site Today"         value={summary.totalWorkers} testId="msd-sum-workers" />
          <SummaryStat label="Total Hours Worked Across All Gangs" value={summary.totalHours}   testId="msd-sum-hours" highlight />
        </div>
      </Section>

      {/* SECTION 4 — OVERALL NOTES */}
      <Section title="Overall Notes" testId="msd-section-4">
        <Inp label="Visitors to Site Today (optional)" value={visitors} onChange={setVisitors} placeholder="Any client, contractor, or inspector visits" testId="msd-visitors" />
        <div className="mt-4 grid gap-4">
          <Area label="Instructions Received Today (optional)" value={instructions} onChange={setInstructions} placeholder="Any verbal or written instructions received" testId="msd-instructions" />
          <Area label="Overall Site Notes (optional)" value={overallNotes} onChange={setOverallNotes} testId="msd-overall-notes" />
        </div>
      </Section>

      {/* SIGN OFF */}
      <Section title="Diary completed by — Sign Off" testId="msd-section-5">
        <AttachMedia toolId="multiuser-site-diary" toolLabel="Site Diary" jobId={jobId || null} category="Progress" value={attachedMedia} onChange={setAttachedMedia} testIdPrefix="msd-media" />
        <LiveSignatureBlock
          label="Diary completed by"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="msd-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="msd-sig-date">
          Date: {ukDate(diaryDate) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="msd-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Multi-User Site Diary</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="msd-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated diary</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Multi-User Site Diary — ${project} — ${ukDate(diaryDate)}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="msd-output">{result}</pre>
        </div>
      )}
    </div>
  );
}

// ---------- bits ----------
function Section({ title, children, testId, icon }) {
  return (
    <div className="card-dark p-6 mb-5" data-testid={testId}>
      <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4 flex items-center gap-2">
        {icon}{title}
      </div>
      {children}
    </div>
  );
}
function Grid({ children }) {
  return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
}
function Inp({ label, value, onChange, type = "text", testId, helper, placeholder }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} className="input-base" placeholder={placeholder} data-testid={testId} />
      {helper && <div className="text-[10px] text-[#706D66] mt-1">{helper}</div>}
    </label>
  );
}
function Drop({ label, value, onChange, options, testId }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="input-base" data-testid={testId}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
function Area({ label, value, onChange, placeholder, testId, rows = 3 }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="input-base"
        data-testid={testId}
      />
    </label>
  );
}
function ReadOnly({ label, value, testId }) {
  return (
    <div data-testid={testId}>
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <div
        className="input-base flex items-center"
        style={{ color: "#F0EDE8", background: "rgba(15,15,15,0.4)" }}
      >
        {value}
      </div>
    </div>
  );
}
function SummaryStat({ label, value, testId, highlight }) {
  return (
    <div
      data-testid={testId}
      className="p-4 rounded"
      style={{
        background: highlight ? "rgba(232,160,32,0.10)" : "rgba(15,15,15,0.6)",
        border: `1px solid ${highlight ? "#E8A020" : "rgba(160,157,148,0.18)"}`,
      }}
    >
      <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">{label}</div>
      <div className="font-display text-3xl" style={{ color: highlight ? "#E8A020" : "#F0EDE8" }}>{value}</div>
    </div>
  );
}
