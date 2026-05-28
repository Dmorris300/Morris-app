import { useLocation, Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { TOOLS, WOW_TOOLS, SECTIONS } from "../lib/tools-config";

// Map of static routes → display label
const STATIC_LABELS = {
  "/app": "Command Centre",
  "/app/jobs": "Job Tracker",
  "/app/profile": "Profile",
  "/app/favourites": "Favourites",
  "/app/history": "Document Vault",
  "/app/billing": "Plan & Billing",
  "/app/earnings": "Earnings Dashboard",
  "/app/mileage": "Mileage Tracker",
  "/app/vat": "VAT Threshold Advisor",
  "/app/cis-predictor": "CIS Refund Predictor",
  "/app/taxpot": "Tax Pot",
  "/app/company-checker": "Company Checker",
  "/app/offline-mode": "Offline Mode",
  "/app/privacy": "Privacy Policy",
  "/app/terms": "Terms and Conditions",
  "/app/complaints": "Complaints",
  "/app/refund-policy": "Refund Policy",
  "/app/wow/verbal-to-variation": "Verbal to Variation",
  "/app/wow/photo-to-document": "Photo to Document",
};

const SECTION_LABEL = Object.fromEntries(SECTIONS.map(s => [s.id, s.label]));

function findToolMeta(toolId) {
  const all = [...TOOLS, ...WOW_TOOLS];
  return all.find(t => t.id === toolId);
}

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  if (pathname === "/app" || pathname === "/app/") return null;

  const crumbs = [];
  // Tool route → Command Centre · Section · Tool name
  if (pathname.startsWith("/app/tool/")) {
    const toolId = pathname.split("/").pop();
    const meta = findToolMeta(toolId);
    crumbs.push({ to: "/app", label: "Command Centre" });
    if (meta?.section) crumbs.push({ to: "/app", label: SECTION_LABEL[meta.section] || meta.section });
    crumbs.push({ to: pathname, label: meta?.name || toolId });
  } else if (pathname.startsWith("/app/jobs/")) {
    crumbs.push({ to: "/app", label: "Command Centre" });
    crumbs.push({ to: "/app/jobs", label: "Job Tracker" });
    crumbs.push({ to: pathname, label: "Job detail" });
  } else if (pathname.startsWith("/app/wow/")) {
    crumbs.push({ to: "/app", label: "Command Centre" });
    crumbs.push({ to: "/app", label: "Documents" });
    crumbs.push({ to: pathname, label: STATIC_LABELS[pathname] || "Tool" });
  } else if (pathname.startsWith("/app/billing/")) {
    crumbs.push({ to: "/app", label: "Command Centre" });
    crumbs.push({ to: "/app/billing", label: "Plan & Billing" });
    crumbs.push({ to: pathname, label: "Checkout" });
  } else {
    crumbs.push({ to: "/app", label: "Command Centre" });
    crumbs.push({ to: pathname, label: STATIC_LABELS[pathname] || pathname.replace("/app/", "") });
  }

  return (
    <nav
      className="px-6 md:px-10 pt-4 flex items-center gap-1.5 text-xs text-[#706D66] flex-wrap"
      data-testid="breadcrumbs"
      aria-label="Breadcrumb"
    >
      <Link to="/app" className="flex items-center gap-1 hover:text-[#E8A020] transition" data-testid="bc-home">
        <Home size={11} /> Home
      </Link>
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <ChevronRight size={11} className="text-[#3d3d3d]" />
          {i === crumbs.length - 1 ? (
            <span className="text-[#F0EDE8] font-semibold" data-testid={`bc-${i}`}>{c.label}</span>
          ) : (
            <Link to={c.to} className="hover:text-[#E8A020] transition" data-testid={`bc-${i}`}>{c.label}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}
