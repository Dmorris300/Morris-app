// Hub landing pages for the Command Centre V2 navigation.
// Each hub is a lightweight index that links to the existing dedicated tools
// (no functional duplication). Full custom hub layouts are a later iteration —
// these unblock the redesigned navigation without breaking any existing route.

import { Link } from "react-router-dom";
import {
  Wallet, Receipt, PiggyBank, TrendingUp, Truck, ShieldCheck,
  IdCard, HardHat, HeartPulse, FileCheck, Briefcase, FileText,
  Hammer, Calculator, ArrowRight,
} from "lucide-react";
import { TOOLS, WOW_TOOLS, SECTIONS } from "../lib/tools-config";

function Hub({ title, subtitle, tiles, testId }) {
  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid={testId}>
      <header className="mb-8">
        <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Hub</div>
        <h1 className="font-display text-4xl sm:text-5xl text-[#F0EDE8]">{title}</h1>
        {subtitle && <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">{subtitle}</p>}
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to} className="card-dark p-5 hover:border-[#E8A020]/40 transition block group" data-testid={t.testId}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-md bg-[#1e1a12] text-[#E8A020] flex items-center justify-center shrink-0">
                  <Icon size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-base text-[#F0EDE8] font-medium">{t.label}</div>
                  {t.desc && <div className="text-xs text-[#A19D94] mt-1 line-clamp-2">{t.desc}</div>}
                </div>
                <ArrowRight size={14} className="ml-auto text-[#706D66] group-hover:text-[#E8A020]" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function FinanceHub() {
  return (
    <Hub
      title="Finance"
      subtitle="Your money in one place — tax pot, refunds, mileage, invoicing overview and forecasting."
      testId="hub-finance"
      tiles={[
        { to: "/app/taxpot", label: "Tax Pot", desc: "Set aside 8% of net cash automatically.", icon: PiggyBank, testId: "finance-tile-taxpot" },
        { to: "/app/cis-predictor", label: "CIS Refund Estimate", desc: "See where you stand for your CIS refund this tax year.", icon: Receipt, testId: "finance-tile-cis" },
        { to: "/app/earnings", label: "Earnings YTD", desc: "Your year-to-date earnings across jobs and CIS receipts.", icon: TrendingUp, testId: "finance-tile-earnings" },
        { to: "/app/mileage", label: "Log Mileage", desc: "Business mileage records for HMRC.", icon: Truck, testId: "finance-tile-mileage" },
        { to: "/app/vat", label: "VAT Threshold", desc: "Track your VAT rolling 12-month turnover.", icon: Calculator, testId: "finance-tile-vat" },
        { to: "/app/self-assessment-prep", label: "Self Assessment", desc: "Prepare and file your annual return.", icon: FileText, testId: "finance-tile-sa" },
        { to: "/app/retention-chaser", label: "Retention Chaser", desc: "Track and chase held-back retentions.", icon: Wallet, testId: "finance-tile-retention" },
        { to: "/app/payment-chaser", label: "Payment Chaser", desc: "Escalate overdue invoices in three stages.", icon: Receipt, testId: "finance-tile-chaser" },
      ]}
    />
  );
}

export function BusinessHub() {
  return (
    <Hub
      title="Business"
      subtitle="Everything you send to clients — quotes, invoices, applications and commercial reports."
      testId="hub-business"
      tiles={[
        { to: "/app/invoice-builder", label: "CIS Invoice", icon: Receipt, testId: "biz-tile-invoice" },
        { to: "/app/tool/quote-builder", label: "Quote Builder", icon: FileText, testId: "biz-tile-quote" },
        { to: "/app/applications-for-payment", label: "Application for Payment", icon: FileText, testId: "biz-tile-application" },
        { to: "/app/variation-orders", label: "Variation Order", icon: FileText, testId: "biz-tile-variation" },
        { to: "/app/payment-chaser", label: "Payment Chaser", icon: Receipt, testId: "biz-tile-chaser" },
        { to: "/app/commercial-report", label: "Commercial Report", icon: FileText, testId: "biz-tile-report" },
        { to: "/app/tool/eot-claim", label: "Extension of Time", icon: FileText, testId: "biz-tile-eot" },
        { to: "/app/tool/contract-review", label: "Contract Review", icon: FileCheck, testId: "biz-tile-contract" },
      ]}
    />
  );
}

export function ComplianceHub() {
  return (
    <Hub
      title="Compliance"
      subtitle="Your credentials, insurances and safety records. Any item expiring within 30 days surfaces on the Command Centre automatically."
      testId="hub-compliance"
      tiles={[
        { to: "/app/profile", label: "Public Liability Insurance", desc: "Upload expiry date and certificate.", icon: ShieldCheck, testId: "comp-tile-public-liability" },
        { to: "/app/profile", label: "Employers Liability Insurance", icon: ShieldCheck, testId: "comp-tile-employers" },
        { to: "/app/profile", label: "Vehicle Insurance", icon: Truck, testId: "comp-tile-vehicle" },
        { to: "/app/profile", label: "CSCS Card", icon: IdCard, testId: "comp-tile-cscs" },
        { to: "/app/profile", label: "DBS Check", icon: IdCard, testId: "comp-tile-dbs" },
        { to: "/app/profile", label: "First Aid Certificate", icon: HeartPulse, testId: "comp-tile-first-aid" },
        { to: "/app/profile", label: "Training Certificates", icon: HardHat, testId: "comp-tile-training" },
        { to: "/app/self-assessment-prep", label: "Self Assessment", icon: FileText, testId: "comp-tile-sa" },
      ]}
    />
  );
}

export function ProjectsHub() {
  return (
    <Hub
      title="Projects"
      subtitle="Every job you're running or have run. Deep-link into any project workspace."
      testId="hub-projects"
      tiles={[
        { to: "/app/jobs", label: "Active Projects", icon: Briefcase, testId: "proj-tile-active" },
        { to: "/app/jobs", label: "Completed Projects", icon: Briefcase, testId: "proj-tile-completed" },
        { to: "/app/photo-vault", label: "Photo Vault", desc: "Central media library across every project.", icon: HardHat, testId: "proj-tile-vault" },
        { to: "/app/history", label: "Document History", icon: FileText, testId: "proj-tile-history" },
        { to: "/app/drafts", label: "Drafts", icon: FileText, testId: "proj-tile-drafts" },
      ]}
    />
  );
}

export function ToolsLibrary() {
  const bySection = SECTIONS.reduce((acc, s) => { acc[s.id] = { section: s, tools: [] }; return acc; }, {});
  [...TOOLS, ...WOW_TOOLS].forEach((t) => {
    if (bySection[t.section]) bySection[t.section].tools.push(t);
  });

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="hub-tools-library">
      <header className="mb-8">
        <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Hub</div>
        <h1 className="font-display text-4xl sm:text-5xl text-[#F0EDE8]">Tools Library</h1>
        <p className="text-sm text-[#A19D94] mt-2">Every Morris tool, grouped by category. Use the search on the top bar to jump straight to anything.</p>
      </header>
      {Object.values(bySection).filter((g) => g.tools.length > 0).map((g) => (
        <section key={g.section.id} className="mb-8" data-testid={`tools-section-${g.section.id}`}>
          <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-3">{g.section.name}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {g.tools.map((t) => (
              <Link key={t.id} to={t.route} className="card-dark p-3 hover:border-[#E8A020]/40 transition block" data-testid={`tool-${t.id}`}>
                <div className="text-sm text-[#F0EDE8]">{t.name}</div>
                {t.info && <div className="text-[11px] text-[#A19D94] mt-1 line-clamp-2">{t.info}</div>}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
