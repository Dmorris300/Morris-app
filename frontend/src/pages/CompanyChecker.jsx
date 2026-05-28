import { useState } from "react";
import { Search, Building2, Loader2, AlertTriangle, CheckCircle2, ExternalLink, Calendar, XCircle, Info } from "lucide-react";
import { toast } from "sonner";

// Companies House public Search API (no auth) wraps GOV.UK data and is fine for client-side calls.
// We call the official Companies House public search via a proxy-friendly approach:
// the search endpoint is at https://find-and-update.company-information.service.gov.uk/
// but it's HTML. For structured JSON we use Companies House REST API which requires an API key.
// For the purposes of this MVP we use the public "search" page lookup pattern by querying
// the official search URL and letting the user open the official page for full details.
// We avoid storing any API key client-side.
//
// For credit-flag style data we surface basic warnings: dissolved status from the open dataset
// via the official Companies House public REST endpoint (no key required for search hits in dev,
// will return 401 in production — fall back to a graceful "open on Companies House" link).

const CH_HOST = "https://api.company-information.service.gov.uk";

export default function CompanyChecker() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState(null); // selected company details
  const [detailsLoading, setDetailsLoading] = useState(false);

  const onSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setResults([]); setDetails(null);
    try {
      // Public Companies House search endpoint. CORS may block in some browsers — we degrade gracefully.
      const r = await fetch(`${CH_HOST}/search/companies?q=${encodeURIComponent(query)}&items_per_page=10`);
      if (!r.ok) throw new Error("Companies House lookup failed");
      const data = await r.json();
      setResults(data.items || []);
      if (!data.items || data.items.length === 0) toast.message("No matches. Try a different name or number.");
    } catch (e) {
      // CORS / blocked — fall back to opening the official search page in a new tab
      window.open(`https://find-and-update.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(query)}`, "_blank");
      toast.message("Opening Companies House search in a new tab.");
    } finally { setLoading(false); }
  };

  const openCompany = async (item) => {
    setDetails(null); setDetailsLoading(true);
    try {
      const r = await fetch(`${CH_HOST}/company/${item.company_number}`);
      if (r.ok) {
        const d = await r.json();
        setDetails(d);
      } else {
        // Fall back to redirecting to Companies House page
        window.open(item.links?.self ? `https://find-and-update.company-information.service.gov.uk${item.links.self.replace(/^\/company/, "/company")}` : `https://find-and-update.company-information.service.gov.uk/company/${item.company_number}`, "_blank");
      }
    } catch {
      window.open(`https://find-and-update.company-information.service.gov.uk/company/${item.company_number}`, "_blank");
    } finally { setDetailsLoading(false); }
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto" data-testid="page-company-checker">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Sole Trader</div>
        <h1 className="font-display text-4xl md:text-5xl flex items-center gap-3">
          <Building2 size={36} className="text-[#E8A020]" />
          Company Checker
        </h1>
        <p className="text-[#A19D94] mt-2">Before you take on a job, check the contractor or main contractor at Companies House. Look for dissolved status, recent filings and history.</p>
      </div>

      {/* Search */}
      <div className="card-dark p-6 mb-6">
        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Search by company name or number</div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
          <input
            className="input-base"
            placeholder="e.g. Acme Construction Ltd OR 12345678"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            data-testid="company-search-input"
          />
          <button onClick={onSearch} className="btn-primary flex items-center gap-2" disabled={loading} data-testid="company-search-btn">
            {loading ? <Loader2 size={14} className="animate-spin"/> : <Search size={14}/>}
            Search
          </button>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="card-dark divide-y divide-[#1a1a1a] mb-6" data-testid="company-results">
          {results.map(item => {
            const dissolved = item.company_status === "dissolved";
            const active = item.company_status === "active";
            return (
              <button
                key={item.company_number}
                onClick={() => openCompany(item)}
                className="w-full text-left p-4 hover:bg-[#0e0e0e] transition flex items-start justify-between gap-3"
                data-testid={`company-result-${item.company_number}`}
              >
                <div>
                  <div className="font-semibold text-[#F0EDE8] flex items-center gap-2">
                    {item.title}
                    {dissolved && <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ color: "#E5635A", background: "rgba(229,99,90,0.1)", border: "1px solid rgba(229,99,90,0.35)" }}><XCircle size={10}/>Dissolved</span>}
                    {active && <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ color: "#5BC97A", background: "rgba(91,201,122,0.07)", border: "1px solid rgba(91,201,122,0.35)" }}><CheckCircle2 size={10}/>Active</span>}
                  </div>
                  <div className="text-xs text-[#A19D94] mt-1">No. {item.company_number} · {item.address_snippet || ""}</div>
                </div>
                <ExternalLink size={14} className="text-[#706D66] mt-1 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {/* Detail panel */}
      {detailsLoading && <div className="card-dark p-6 text-sm text-[#A19D94] flex items-center gap-2"><Loader2 size={14} className="animate-spin"/> Loading company details…</div>}
      {details && <CompanyDetailPanel details={details} />}

      {/* Why this matters */}
      <div className="card-dark p-4 mt-6 text-xs text-[#A19D94] flex items-start gap-3" data-testid="company-checker-tip">
        <Info size={14} className="text-[#E8A020] mt-0.5 flex-shrink-0"/>
        <div>
          <span className="text-[#F0EDE8] font-semibold">Why this matters: </span>
          A dissolved contractor cannot lawfully pay you. A recently dissolved-and-restored company is a red flag. Outstanding accounts late by more than 6 months indicate financial trouble. Always check before committing labour and materials.
        </div>
      </div>
    </div>
  );
}

function CompanyDetailPanel({ details }) {
  const status = details.company_status;
  const statusMap = {
    active:   { fg: "#5BC97A", bg: "rgba(91,201,122,0.07)", border: "rgba(91,201,122,0.35)", icon: <CheckCircle2 size={14}/> },
    dissolved:{ fg: "#E5635A", bg: "rgba(229,99,90,0.07)",  border: "rgba(229,99,90,0.4)",   icon: <XCircle size={14}/> },
  };
  const s = statusMap[status] || { fg: "#E8A020", bg: "rgba(232,160,32,0.07)", border: "rgba(232,160,32,0.35)", icon: <AlertTriangle size={14}/> };

  const accountsOverdue = details.accounts?.overdue;
  const cs01Overdue = details.confirmation_statement?.overdue;

  return (
    <div className="card-dark p-6" data-testid="company-detail-panel">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="font-display text-3xl text-[#F0EDE8]">{details.company_name}</h2>
          <div className="text-xs text-[#A19D94] mt-1">No. {details.company_number} · Incorporated {details.date_of_creation || "—"}</div>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ color: s.fg, background: s.bg, border: `1px solid ${s.border}` }}>
          {s.icon} {status?.toUpperCase().replace(/_/g, " ")}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3 text-xs">
        <Detail label="Type" value={details.type || "—"}/>
        <Detail label="SIC codes" value={(details.sic_codes || []).join(", ") || "—"}/>
        <Detail label="Registered office" value={Object.values(details.registered_office_address || {}).filter(Boolean).join(", ") || "—"}/>
        <Detail label="Last accounts" value={details.accounts?.last_accounts?.made_up_to || "—"} flag={accountsOverdue ? "Overdue" : null}/>
        <Detail label="Next accounts due" value={details.accounts?.next_due || "—"} flag={accountsOverdue ? "Overdue" : null}/>
        <Detail label="Confirmation statement due" value={details.confirmation_statement?.next_due || "—"} flag={cs01Overdue ? "Overdue" : null}/>
      </div>

      {(accountsOverdue || cs01Overdue) && (
        <div className="mt-4 p-3 rounded flex items-start gap-2" style={{ border: "1px solid rgba(229,99,90,0.4)", background: "rgba(229,99,90,0.07)" }} data-testid="company-overdue-warning">
          <AlertTriangle size={14} className="text-[#E5635A] mt-0.5"/>
          <div className="text-xs text-[#F0EDE8]">
            <span className="font-semibold text-[#E5635A]">Red flag: </span>
            {accountsOverdue && "Accounts overdue. "} {cs01Overdue && "Confirmation statement overdue. "} A history of late filings often precedes insolvency. Consider asking for payment up-front or a personal guarantee before committing labour.
          </div>
        </div>
      )}

      <a
        href={`https://find-and-update.company-information.service.gov.uk/company/${details.company_number}`}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center gap-2 text-xs text-[#E8A020] hover:text-[#F0EDE8]"
        data-testid="company-detail-ch-link"
      >
        Full record on Companies House <ExternalLink size={12}/>
      </a>
    </div>
  );
}

function Detail({ label, value, flag }) {
  return (
    <div className="p-3 rounded bg-[#0a0a0a] border border-[#1a1a1a]">
      <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">{label}</div>
      <div className="text-[#F0EDE8] flex items-center gap-2">
        {value}
        {flag && <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded text-[#E5635A] border border-[#E5635A]/40">{flag}</span>}
      </div>
    </div>
  );
}
