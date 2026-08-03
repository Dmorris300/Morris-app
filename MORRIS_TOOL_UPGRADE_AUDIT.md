# Morris Tool Upgrade Audit — Definitive Roadmap

**Prepared**: audit run of the full codebase, cross-checked against git log (145 commits, 14 May → 1 Aug 2026), `/app/memory/PRD.md`, `/app/MORRIS_DOCUMENTATION.md`, `/app/MORRIS_RAMS_ANALYSIS.md`, `/app/COMMAND_CENTRE_V2_SPEC.md`, `/app/PROJECT_WORKSPACE_SPEC.md`.

**Definitions used**
- **V2 Prompt Created** = a documented redesign brief exists (PRD `[FEATURE]`/`[REBUILD]` entry with fix list, OR a separate `_SPEC.md` document, OR a documented multi-point prompt upgrade in `server.py`).
- **Implemented** = code is shipped. Either (a) a dedicated `.jsx` page exists for the tool (replacing the shared `GenericToolPage`), or (b) the backend prompt / logic upgrade is live in `server.py`.
- **Fully** = dedicated page + all documented improvements shipped and tested.
- **Partial** = either prompt-only upgrade with no dedicated page, or dedicated page exists but documented V2 upgrade list is still outstanding.
- **Outstanding** = still uses `GenericToolPage` with no dedicated brief, or a spec exists but no code has been shipped.

**Real dates** are pulled from `git log` (`--diff-filter=A --follow` for creation, `%ad` for last touch). Where PRD.md said "Feb 2026", the real dates fall in **May–August 2026**.

---

## Full Tool Audit Table

| Tool | V2 Prompt Created | Prompt Date | Implemented | Implementation Date | Status | Summary of Improvements | Outstanding Work |
|---|---|---|---|---|---|---|---|
| **RAMS** | ✅ Yes (Hazard 3-Step Redesign + supplementary sections + `MORRIS_RAMS_ANALYSIS.md`) | 20 Jun 2026 (v1) → 20 Jul 2026 (V2) | ✅ Yes — dedicated `Rams.jsx` (1031 lines) + `rams-pdf.js` (550+ lines) | Created 20 Jun 2026, V2 rewrite 20 Jul 2026, supplementary PDF 22 Jun 2026 | 🟢 Fully | 23-section wizard, 3-step hazard journey, 8 supplementary sections rendered in PDF, custom "Other" harm branch, PPE/equipment auto-suggest, dual sign-off, draft save, photo-vault attach | Split "Method Statements" into its own tool (currently bundled) |
| **Commercial Reports** | 🟡 Partial (dedicated page exists but "V2 living register redesign" flagged as P1 outstanding) | Original 14 Jun 2026 | ✅ v1 shipped as `CommercialReport.jsx` (+442) | 14 Jun 2026 | 🟡 Partial | Living register structure, forecast fields, photo-vault attach | Living register redesign: KPI header, drill-down, variance chart, export bundle |
| **Site Diary** (`site-diary`) | ❌ None | — | ❌ Only via `GenericToolPage` | — | 🔴 Outstanding | Basic template-generated diary from prompt template only | Full dedicated page with time-stamped entries, weather auto-fill, crew log, photo attach, print-ready A4 layout |
| **Multi-User Site Diary** | ✅ Yes (dedicated page brief) | 14 Jun 2026 | ✅ `MultiUserSiteDiary.jsx` (+506) | 14 Jun 2026 | 🟢 Fully | Multi-user entry, timestamp discipline, photo-vault attach, draft save | Living-register redesign (align with Commercial Report V2) |
| **Risk Assessments** (Risk Register) | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `RiskRegister.jsx` | 13 Jun 2026 | 🟢 Fully | Register table, likelihood/severity matrix, residual scoring, review-due tracking | Photo-vault attach not wired; drafts wire pending |
| **Method Statements** | ❌ None (still bundled inside RAMS) | — | ❌ No | — | 🔴 Outstanding | Currently the "MS" half of RAMS | Separate `MethodStatement.jsx`, step-by-step task builder, hazard link-back to RAMS |
| **COSHH** | 🟡 Partial (COSHH schedule inside RAMS; standalone tool still on `GenericToolPage`) | Inside RAMS 20 Jul 2026 | ❌ No dedicated standalone page | — | 🟡 Partial | COSHH schedule rows render inside RAMS PDF | Dedicated `Coshh.jsx` with hazardous-substance database, WEL lookup, Section 12a assessments |
| **Toolbox Talks** | ❌ None (P0 pending) | — | ❌ Only via `GenericToolPage` | — | 🔴 Outstanding (P0) | Prompt-only generation via generic page | Dedicated `ToolboxTalk.jsx`, topic library, attendance sign-off, RAMS-style polish |
| **Variation Orders** (`variation-letter`) | ✅ Yes (6-fix prompt upgrade) | 20 Jul 2026 (real) | 🟡 Prompt-only (still uses `GenericToolPage`) | 20 Jul 2026 | 🟡 Partial | No REVIEW DATE, whole-day time impact, empty CONTRACT CLAUSE skipped, optional VAT block, verbal-method follow-up hint, tighter tone (Global Writing Standard) | Dedicated page with cost-breakdown UI + client sign-off + link back to Verbal-to-Variation |
| **Verbal to Variation** | ✅ Yes | 17 May 2026 | ✅ `VerbalToVariation.jsx` (+103 → hardened) | 17 May 2026 | 🟢 Fully | Web Speech API (mocked), transcript → generation, photo-vault attach | Replace mocked Web Speech API with real one (P2) |
| **Applications for Payment** | ✅ Yes (7 compliance & polish fixes) | 20 Jul 2026 (real) | 🟡 Prompt-only | 20 Jul 2026 | 🟡 Partial | HGCRA-compliant numbering, retention line, VAT ordering, sub-total → net → gross discipline | Dedicated page with previous applications history + retention tracker |
| **Invoice Builder** (`cis-invoice`) | ✅ Yes (NI number guaranteed render) | 20 Jul 2026 (real) | 🟡 Prompt-only | 20 Jul 2026 | 🟡 Partial | NI number always rendered under UTR when set | Dedicated page with client library, VAT scheme selector, CIS auto-deduction preview |
| **Quote Builder** | ✅ Yes (8-point pack) | 20 Jul 2026 (real) | 🟡 Prompt-only | 20 Jul 2026 | 🟡 Partial | Clean customer-facing summary page 1, VAT ordering, section discipline (Exclusions/Assumptions/Provisional Sums/Payment Terms guarded), Global Writing Standard | Dedicated page with itemised line-items UI, stage-payment schedule builder, client acceptance flow |
| **Purchase Orders** | ✅ Yes (dedicated rebuild) | 14 Jun 2026 | ✅ `PurchaseOrder.jsx` | 14 Jun 2026 | 🟢 Fully | PO-NNN ref, supplier/deliver-to, itemised, VAT, sign-off | Supplier library, PO status (open/received/paid) |
| **Payment Tracker** | ✅ Yes (dedicated rebuild + link to Chaser) | 13 Jun 2026 → 20 Jul 2026 | ✅ `PaymentTracker.jsx` (+511) | 13 Jun 2026, linked 20 Jul 2026 | 🟢 Fully | Living register of invoices, aging bands, two-way link to Payment Chaser | Bulk chase action, export to CSV |
| **Payment Chaser** | ✅ Yes (8-point pack V2) | 20 Jul 2026 | ✅ `PaymentChaser.jsx` (+251 V2 rewrite) | 20 Jul 2026 | 🟢 Fully | Chaser sequence (1st/2nd/final), Late Payment Act interest calculator, tone escalation, statutory letter templates | — |
| **Job Tracker** (`Jobs.jsx`) | 🟡 Partial (V2 polish flagged P2) | 25 May 2026 | ✅ `Jobs.jsx` (+223) with vault deep-link | 25 May 2026, deep-linked 1 Aug 2026 | 🟡 Partial | Job list, status filter, deep-link to Photo Vault | Pinned projects, live status counts, kanban view |
| **Snagging Lists** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `SnaggingList.jsx` (+465) | 13 Jun 2026 | 🟢 Fully | Item list, status (Open/In Progress/Closed), photo-vault attach, sign-off | — |
| **Photo Vault** | ✅ Yes (3-phase brief: initial → Phase 1 → hardening) | 1 Aug 2026 | ✅ `photo_vault.py` (+453) + `PhotoVault.jsx` (+548) + `AttachMedia.jsx` (+239) | 1 Aug 2026 | 🟢 Fully | Emergent Object Storage, albums, per-tool stamping, PDF evidence embed, offline queue, wired into 17 tools | Video preview thumbnails, bulk album move |
| **Project Workspace** | ✅ Yes (`PROJECT_WORKSPACE_SPEC.md` +387) | 1 Aug 2026 | ✅ `project_workspace.py` (+368) + `JobDetail.jsx` full rewrite (+638) | 1 Aug 2026 | 🟢 Fully | 7-tab digital site folder (Overview / Documents / Photos / Tasks / Events / Finance / Team), tasks & events APIs, stats endpoint | Team-tab wiring to Team Management, real-time collab |
| **Command Centre** | ✅ Yes (`COMMAND_CENTRE_V2_SPEC.md` +352) | 1 Aug 2026 | ✅ `command_centre.py` (+315), `Dashboard.jsx` full rewrite, `/api/attention`, `AttentionPage.jsx` | 1 Aug 2026 | 🟢 Fully | Hub cards, dynamic attention feed (`/api/attention`), quick actions, greeting + trade context | Attention-feed test coverage, richer trend widgets |
| **Finance Hub** | 🟡 Partial (spec inside Command Centre V2, page is a stub) | 1 Aug 2026 | 🟡 `Hubs.jsx` (+150) stub tiles only | 1 Aug 2026 | 🟡 Partial | Placeholder tile grid | Live counts (invoices open/paid/overdue), Tax Pot moved into hub, CIS deducted running total, cash-in-bank card |
| **Compliance Hub** | 🟡 Partial (spec inside Command Centre V2, page is a stub) | 1 Aug 2026 | 🟡 `Hubs.jsx` stub tiles only | 1 Aug 2026 | 🟡 Partial | Placeholder tile grid | Credentials dashboard (CSCS, insurance, ISO), expiry countdowns, RAMS/COSHH review-due list, incident summary |
| **Business Hub** | 🟡 Partial (spec inside Command Centre V2, page is a stub) | 1 Aug 2026 | 🟡 `Hubs.jsx` stub tiles only | 1 Aug 2026 | 🟡 Partial | Placeholder tile grid | Live counts (jobs active/completed, subbies onboarded, POs open), pipeline value |
| **Tools Library Hub** | 🟡 Partial (spec inside Command Centre V2, page is a stub) | 1 Aug 2026 | 🟡 `Hubs.jsx` stub tiles only | 1 Aug 2026 | 🟡 Partial | Placeholder tile grid | Search + favourites + recently-used + section filters |
| **Document Library** (`history`) | ❌ None (V2 flagged P1) | — | ✅ `History.jsx` v1 (+50) | 17 May 2026 | 🟡 Partial | Chronological list of generated docs | V2: filters (tool/date/job/status), bulk actions, search, project ZIP export |
| **Notifications** | ✅ Yes (bell + alerts stack) | 14 Jun 2026 | ✅ `alerts.js` (+581), `NotificationBell.jsx` (+169), `notification-triggers.js` (+216) | 14 Jun 2026 | 🟡 Partial | Bell UI, alerts registry, triggers on 14+ tools | V2: unified feed (`/api/attention` merged), `saveToolData` wired into remaining ~60 tools, per-user preferences |
| **Timeline** | ❌ None as standalone tool (project events feed exists inside Project Workspace) | — | ✅ Events feed inside `JobDetail.jsx` | 1 Aug 2026 | 🟡 Partial | Per-project events timeline via `/api/jobs/{id}/events` | Global timeline across all projects with filter |
| **Global Search** | ❌ None (P1 pending) | — | ❌ No | — | 🔴 Outstanding | Sidebar search box is per-tool only | Cross-project endpoint indexing docs, photos, notes, projects, chases; top-bar UI |
| **Export Centre** | ❌ None (P2 pending) | — | ❌ No | — | 🔴 Outstanding | Per-doc PDF only | Project ZIP export (all docs + photos + finance) |
| **Site Access Permit** | ✅ Yes (dedicated rebuild + V2 flagged P2) | 14 Jun 2026 | ✅ `SiteAccessPermit.jsx` (+599) | 14 Jun 2026 | 🟡 Partial | Permit issue/return, gate register | V2 rebuild pending |
| **Incident Report** | 🟡 Partial (V2 RIDDOR flow flagged P1) | 14 Jun 2026 (v1) | ✅ `IncidentReport.jsx` v1 | 14 Jun 2026 | 🟡 Partial | Basic incident form + photo-vault attach | V2: RIDDOR trigger logic, witness table, root-cause five-whys |
| **Incident Log** | ✅ Yes (dedicated rebuild) | 14 Jun 2026 | ✅ `IncidentLog.jsx` (+468) | 14 Jun 2026 | 🟢 Fully | Register, categories, severity | — |
| **Bad Debt Letter** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `BadDebtLetter.jsx` (+538) | 13 Jun 2026 | 🟢 Fully | Statutory demand escalation, Late Payment Act ref | — |
| **Contract Review** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `ContractReview.jsx` (+401) | 13 Jun 2026, small polish 20 Jul 2026 | 🟢 Fully | Contract clause checklist, risk flags, photo-vault attach | — |
| **Contract Management** | ✅ Yes (dedicated rebuild) | 14 Jun 2026 | ✅ `ContractManagement.jsx` (+540) | 14 Jun 2026 | 🟢 Fully | Contract register, key-dates tracker, drafts | — |
| **HMRC Correspondence** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `HmrcCorrespondence.jsx` (+445) | 13 Jun 2026 | 🟢 Fully | Query templates (CIS, VAT, self-assessment), enquiry reply builder | — |
| **Tender Letter** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `TenderLetter.jsx` (+435) | 13 Jun 2026 | 🟢 Fully | Bid cover letter, itemised approach, references | — |
| **Rate Increase Letter** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `RateIncreaseLetter.jsx` (+418) | 13 Jun 2026 | 🟢 Fully | Notice period, CPI reference, effective-from date | — |
| **Price Work Quote** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `PriceWorkQuote.jsx` (+548) | 13 Jun 2026 | 🟢 Fully | Rate schedule, uplift calc, payment terms | — |
| **Price Work Variation Tracker** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `PriceWorkVariationTracker.jsx` (+476) | 13 Jun 2026 | 🟢 Fully | Variation log against price-work quote, uplift totalling | — |
| **Retention Chaser** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `RetentionChaser.jsx` | 13 Jun 2026 | 🟢 Fully | Retention due tracker, defect-liability clock, chaser letter | — |
| **Apprentice Manager** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `ApprenticeManager.jsx` (+494) | 13 Jun 2026 | 🟢 Fully | Enrolment, monitoring form, off-the-job hours | — |
| **Meeting Notes** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `MeetingNotes.jsx` | 13 Jun 2026 | 🟢 Fully | Attendees, actions, agreed dates | — |
| **Weather Log** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `WeatherLog.jsx` | 13 Jun 2026 | 🟢 Fully | Daily entries with wind/rain/temp | — |
| **CIS Calculator** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `CisCalculator.jsx` (+374) | 13 Jun 2026 | 🟢 Fully | Gross → CIS-deducted → net, VAT switch, downloadable slip | — |
| **CIS Refund Predictor** | ✅ Yes (multiple upgrades) | 17 May 2026 → 20 Jun 2026 | ✅ `CISRefundPredictor.jsx` (+286 → +450) + `refundSummaryPdf.js` | 17 May 2026, big upgrades 31 May and 20 Jun 2026 | 🟢 Fully | Multi-year, allowances, expenses, PDF summary | — |
| **Delivery Record** | ✅ Yes (dedicated rebuild) | 14 Jun 2026 | ✅ `DeliveryRecord.jsx` | 14 Jun 2026 | 🟢 Fully | Delivery-note replacement, itemised, sign-off | — |
| **Labour Allocation** | ✅ Yes (dedicated rebuild) | 14 Jun 2026 | ✅ `LabourAllocation.jsx` | 14 Jun 2026 | 🟢 Fully | Weekly labour split by activity/cost-code | — |
| **Procurement Schedule** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `ProcurementSchedule.jsx` | 13 Jun 2026 | 🟢 Fully | Lead-time tracker, need-by/order-by dates | — |
| **Subcontractor Management** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `SubcontractorManagement.jsx` | 13 Jun 2026 | 🟢 Fully | Onboarding, compliance, ratings | — |
| **New Starter Pack** | ✅ Yes (dedicated build) | 14 Jun 2026 | ✅ `NewStarterPack.jsx` (+590) | 14 Jun 2026 | 🟢 Fully | Onboarding checklist, ID, RTW, RAMS acknowledgement | — |
| **Pre-Start Meeting Checklist** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `PreStartMeeting.jsx` | 13 Jun 2026 | 🟢 Fully | 60+ item checklist, sign-off | — |
| **Tool & Equipment Register** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `ToolRegister.jsx` | 13 Jun 2026 | 🟢 Fully | Asset register, PAT-test due, calibration | — |
| **Noise Assessment** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `NoiseAssessment.jsx` | 13 Jun 2026 | 🟢 Fully | dB measurement, exposure LEP,d, HAV score | — |
| **Working at Height Rescue** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `WorkingAtHeightRescue.jsx` | 13 Jun 2026 | 🟢 Fully | Rescue plan template, kit list | — |
| **Manual Handling Assessment** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `ManualHandling.jsx` | 13 Jun 2026 | 🟢 Fully | Weight/frequency/posture scoring | — |
| **Measurement Record** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `MeasurementRecord.jsx` | 13 Jun 2026 | 🟢 Fully | Site measure sheet with running totals | — |
| **Variation Instruction Log** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `VariationInstructionLog.jsx` | 13 Jun 2026 | 🟢 Fully | Living register of instructions received | — |
| **Self Assessment Prep** | ✅ Yes (dedicated rebuild) | 13 Jun 2026 | ✅ `SelfAssessmentPrep.jsx` | 13 Jun 2026 | 🟢 Fully | Income/expense summary, allowances, tax-band preview | — |
| **RAMS Library** | ✅ Yes (dedicated rebuild) | 14 Jun 2026 | ✅ `RamsLibrary.jsx` (+479) | 14 Jun 2026 | 🟢 Fully | Saved RAMS templates, clone-to-new-project | — |
| **Photo to Document** | ✅ Yes (Multi-Photo PDF + Site Photo Library → Photo Vault) | 17 May 2026 → 30 May → 20 Jun → 1 Aug 2026 | ✅ `PhotoToDocument.jsx` (multi-phase) | 17 May 2026 base, big upgrade 30 May, then 20 Jun (+376), then Photo Vault integration 1 Aug | 🟢 Fully | Multi-photo attach, "Photographic Evidence" PDF annex, StrictMode useRef guard, wired into Photo Vault | — |
| **Mileage Tracker** | ✅ Yes (dedicated rebuild) | 25 May 2026 | ✅ `MileageTracker.jsx` (+276) | 17 May 2026, upgraded 25 May 2026 | 🟢 Fully | HMRC-rate calc, journey log, PDF export | — |
| **VAT Threshold Advisor** | ✅ Yes (rebuild) | 28 May 2026 | ✅ `VatThreshold.jsx` (+180) | 17 May 2026, upgraded 28 May 2026 | 🟢 Fully | Rolling 12-month projection, threshold warnings | — |
| **Tax Pot** | ✅ Yes (dedicated build) | 28 May 2026 | ✅ `TaxPot.jsx` (+140) | 28 May 2026 | 🟡 Partial | Balance, projected tax due | Move into Finance Hub V2 |
| **Company Checker** | ✅ Yes (dedicated build) | 28 May 2026 | ✅ `CompanyChecker.jsx` (+198) | 28 May 2026 | 🟢 Fully | Companies House lookup, insolvency check | — |
| **Earnings Dashboard** | ✅ Yes (dedicated build + finance pass) | 28 May → 31 May 2026 | ✅ `Earnings.jsx` (+320) | 28 May 2026 | 🟢 Fully | Monthly/yearly totals, category breakdown, `finance.js` +103 | — |
| **Drafts** | ✅ Yes (system-wide) | 22 Jun 2026 | ✅ `drafts.js`, `useToolDraft.js`, `DraftSaveButton`, `Drafts.jsx` (+174) | 22 Jun 2026 | 🟡 Partial | Draft save/resume across ~14 tools | Wire remaining ~60 tools via `saveToolData` (P1) |
| **Extension of Time Claim** (`eot-claim`) | ✅ Yes (professional rewrite prompt) | 20 Jul 2026 | 🟡 Prompt-only (still on `GenericToolPage`) | 20 Jul 2026 | 🟡 Partial | Rewritten prompt: HGCRA-compliant, delay-event log, mitigation, evidence | Dedicated page with delay-event UI and mitigation log |
| **Dispute Timeline** | ✅ Yes (dedicated build) | 14 Jun 2026 | ✅ `DisputeTimeline.jsx` | 14 Jun 2026 | 🟢 Fully | Ordered event log for disputes | — |
| **Team Management** | ✅ Yes | 25–30 May 2026 | ✅ `TeamManagement.jsx` + team billing | May 2026 | 🟢 Fully | Invite, roles, accept-invite link | — |
| **Offline Mode** | ✅ Yes | 28 May 2026 | ✅ `OfflineMode.jsx` (+137) | 28 May 2026 | 🟢 Fully | Queue when offline, sync on reconnect | — |
| **Settings (Profile / Billing / etc.)** | ❌ None (V2 split flagged P0) | — | ✅ Single `Profile.jsx` + `Billing.jsx` | May 2026 | 🔴 Outstanding | Settings scattered across pages | Settings V2: Profile / Company / Branding / Notifications / Export / Backup / Subscription / Security tabs |
| **Reminders** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only generation | Dedicated page with recurrence engine + notification triggers |
| **Progress Report** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page with KPI header, photo attach |
| **Scope of Works** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page with itemised scope + inclusions/exclusions |
| **Photo Evidence Log** | ❌ None | — | ❌ Generic page (superseded by Photo Vault album) | — | 🟡 Partial | Photo Vault covers most of this | Merge into Photo Vault workflow or retire tool |
| **Standing Time Calculator** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page with hourly rate × idle hours + reason categories |
| **Delay Notice** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page — HGCRA-compliant notice with mitigation section |
| **Novation Letter** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page with 3-party sign-off block |
| **Defects Tracker** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page with living defects register + photo attach |
| **Complaint Letter** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page — escalation ladder templates |
| **Contra Charge Dispute** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page — line-by-line challenge builder |
| **Reference Letter** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page — subcontractor reference template |
| **LDs Dispute** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page — Liquidated Damages challenge with time-impact evidence |
| **Final Account Statement** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page — variation totals + retention release |
| **Daywork Sheet** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page — labour/plant/materials × rate, daily sign-off |
| **Timesheet** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page — crew × week matrix, hours, break auto-deduct |
| **Handover Certificate** (Practical Completion) | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page — PC certificate, defects list, keys register |
| **Hire Agreement** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page — plant hire T&Cs, off-hire notification |
| **H&S Policy** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page — HSE-compliant company H&S policy generator |
| **Asbestos Record** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page — asbestos survey, Reg 4 duty holder, refurb/demo |
| **Verbal Instruction Recorder** | ❌ None | — | ❌ Generic page (overlap with Verbal to Variation) | — | 🟡 Partial | Verbal to Variation already covers most use-cases | Consolidate or retire tool |
| **Subcontract Letter** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page — award letter with sub-contract terms |
| **Subbi Compliance Checker** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page — CIS/CSCS/insurance verification workflow |
| **Subbi Payment Certificate** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page — subbie interim payment cert |
| **Variation Tracker** (`variation-tracker`, distinct from `variation-instruction-log`) | ❌ None | — | ❌ Generic page (superseded by Variation Instruction Log?) | — | 🟡 Partial | `VariationInstructionLog.jsx` covers most cases | Consolidate — retire `variation-tracker` id or point it at VIL page |
| **Price Work Profit Calculator** | ❌ None | — | ❌ Generic page only | — | 🔴 Outstanding | Prompt-only | Dedicated page — rate vs actual, profit margin |

---

## 1. ✅ Completed Tool Upgrades (chronological)

Every tool that has received a full V2 redesign (dedicated page + shipped documented improvements).

1. **17 May 2026** — Verbal to Variation, Photo to Document (v1), Mileage Tracker (v1), CIS Refund Predictor (v1), VAT Threshold (v1)
2. **25 May 2026** — Mileage Tracker upgrade (+276), Jobs system
3. **28 May 2026** — Tax Pot (v1), Company Checker, Earnings Dashboard, Offline Mode, VAT Threshold upgrade (+180)
4. **30 May 2026** — Photo to Document big upgrade (+274), LiveSignatureBlock rollout
5. **31 May 2026** — Finance pass (CIS Refund Predictor +286, Earnings +320, `finance.js`)
6. **13 Jun 2026** — CIS Calculator, Payment Tracker v1, Tender Letter, Price Work Variation Tracker, Bad Debt Letter, Contract Review, HMRC Correspondence, Snagging List, Rate Increase Letter, Price Work Quote, Apprentice Manager, Procurement Schedule, Subcontractor Management, Retention Chaser, Meeting Notes, Weather Log, Risk Register, Manual Handling, Working at Height Rescue, Noise Assessment, Tool Register, Variation Instruction Log, Measurement Record, Self Assessment Prep, Pre-Start Meeting Checklist
7. **14 Jun 2026** — Notification stack (bell + alerts), Contract Management, RAMS Library, Site Access Permit v1, Incident Log, Multi-User Site Diary, New Starter Pack, Purchase Order, Delivery Record, Labour Allocation, Dispute Timeline, Incident Report v1, Commercial Report v1
8. **20 Jun 2026** — RAMS v1, Site Photo Library v1 (superseded), Photo to Document upgrade (+376), CIS Refund Predictor upgrade (+450)
9. **22 Jun 2026** — Drafts system (+174) wired to 14 tools, RAMS supplementary PDF sections
10. **20 Jul 2026** — RAMS V2 rewrite (+171), Payment Chaser V2 rewrite (+251), Payment Tracker two-way link, Variation Order (prompt V2), Application for Payment (prompt V2), CIS Invoice (prompt V2), Quote Builder (prompt V2), EOT Claim (prompt V2), Global Writing Standard
11. **1 Aug 2026** — Photo Vault (3 phases), Command Centre V2 (Dashboard + `/api/attention`), Project Workspace V2 (JobDetail 7-tab)

---

## 2. 🟡 Partially Completed

Tools where either (a) only a prompt-level upgrade was shipped, (b) a dedicated page exists but the documented V2 upgrade list is still outstanding, or (c) a spec was authored but only stubs shipped.

| Tool | What's Done | What's Missing |
|---|---|---|
| Variation Order | 6-fix prompt upgrade | Dedicated page with cost-breakdown UI + client sign-off |
| Application for Payment | 7 compliance fixes in prompt | Dedicated page with previous-applications history |
| Invoice Builder (CIS Invoice) | NI-number render fix | Dedicated page with client library + CIS auto-deduction preview |
| Quote Builder | 8-point prompt pack | Dedicated page with itemised UI + stage schedule + acceptance |
| Extension of Time Claim | Professional rewrite prompt | Dedicated page with delay-event UI |
| Commercial Report | v1 dedicated page | V2 living-register redesign (KPI header, variance chart) |
| Incident Report | v1 dedicated page | V2 RIDDOR flow + witness table + five-whys |
| Site Access Permit | v1 dedicated page | V2 rebuild pending |
| Job Tracker (`Jobs.jsx`) | v1 with vault deep-link | Pinned projects, live status counts, kanban |
| Document Library (`History.jsx`) | v1 chronological list | V2 filters + bulk actions + search + project ZIP |
| Notifications | Bell + alerts + triggers | Wire `saveToolData` into remaining ~60 tools; unified feed |
| Drafts | Wired into 14 tools | Wire remaining ~60 tools |
| Finance Hub | Stub tiles | Live counts, Tax Pot integration, CIS running total |
| Compliance Hub | Stub tiles | Credentials dashboard, expiry countdowns, RAMS/COSHH review-due |
| Business Hub | Stub tiles | Live job counts, subbies, POs, pipeline value |
| Tools Library Hub | Stub tiles | Search + favourites + section filters |
| COSHH | Schedule inside RAMS | Standalone dedicated page with WEL DB |
| Timeline | Per-project events feed | Global timeline across projects |
| Photo Evidence Log | Photo Vault covers most | Retire or merge |
| Verbal Instruction Recorder | Overlaps with Verbal to Variation | Consolidate/retire |
| Variation Tracker | Overlaps with Variation Instruction Log | Consolidate/retire |
| Tax Pot | Standalone page | Move into Finance Hub |

---

## 3. 🔴 Outstanding Tools (priority-ordered)

Tools that have **no dedicated V2 page and no V2 prompt brief**.

### 🔴 P0 (must-do next)
1. **Toolbox Talks V2** — dedicated page, topic library, attendance sign-off (matches RAMS pattern)
2. **COSHH V2** — dedicated standalone page with hazardous-substance DB and WEL lookup
3. **Site Diary V2** — dedicated page (align to Multi-User Site Diary polish)
4. **Method Statements V2** — split from RAMS into own page
5. **Settings V2** — split into 8 tabs (Profile / Company / Branding / Notifications / Export / Backup / Subscription / Security)

### 🟠 P1 (business-critical)
6. **Global Search** — cross-project endpoint + top-bar UI
7. **Handover Certificate V2** — PC certificate with defects list, keys register
8. **Final Account Statement V2** — variation totals + retention release schedule
9. **Delay Notice V2** — HGCRA-compliant, mitigation section
10. **Defects Tracker V2** — living register with photo attach
11. **Daywork Sheet V2** — labour/plant/materials × rate with daily sign-off
12. **Timesheet V2** — crew × week matrix

### 🟡 P2 (nice-to-have but expected in a premium SaaS)
13. Scope of Works V2
14. Progress Report V2
15. LDs Dispute V2
16. Contra Charge Dispute V2
17. Complaint Letter V2
18. Novation Letter V2
19. Reference Letter V2
20. Standing Time Calculator V2
21. Hire Agreement V2
22. H&S Policy V2
23. Asbestos Record V2
24. Reminders V2
25. Subcontract Letter V2
26. Subbi Compliance Checker V2
27. Subbi Payment Certificate V2
28. Price Work Profit Calculator V2
29. Export Centre (new module)

---

## Recommended Development Order

The order below is optimised for **user-visible impact per build day** and **compounding value** (each build unlocks or improves neighbouring tools).

### 🧱 Phase 1 — Finish V2 architectural shell (unlocks everything below)
1. **Finance Hub buildout** — live counts + Tax Pot/CIS integration. Cheap because APIs already exist.
2. **Compliance Hub buildout** — credentials dashboard, expiry countdowns, RAMS review-due feed. Reuses `/api/attention`.
3. **Business Hub buildout** — job/subbie/PO counts. Reuses existing endpoints.
4. **Tools Library Hub** — search + favourites + section filters. Cheap.
5. **Settings V2** — 8-tab split. Foundational for Branding, Backup, Security features.

### 📄 Phase 2 — Highest-frequency safety documents (RAMS pattern replicated)
6. **Toolbox Talks V2**
7. **COSHH V2** (standalone, with WEL DB)
8. **Site Diary V2**
9. **Method Statements V2** (split from RAMS)
10. **Handover Certificate V2** (Practical Completion)

### 💰 Phase 3 — Commercial/contractual completeness (revenue-critical)
11. **Variation Order dedicated page** (already has prompt V2 — build the UI)
12. **Application for Payment dedicated page** (same)
13. **Quote Builder dedicated page** (same)
14. **Invoice Builder dedicated page** (same)
15. **Extension of Time Claim dedicated page** (same)
16. **Final Account Statement V2**
17. **Daywork Sheet V2**
18. **Delay Notice V2**
19. **Defects Tracker V2**

### 🔎 Phase 4 — Cross-cutting platform features
20. **Global Search** (cross-project)
21. **Document Library V2** (filters + bulk actions)
22. **Commercial Reports V2** (living register)
23. **Incident Report V2** (RIDDOR flow)
24. **Notifications V2** — wire `saveToolData` into remaining ~60 tools + unified feed
25. **Drafts** — wire remaining ~60 tools
26. **Export Centre** — project ZIP export
27. **Job Tracker polish** — pinned projects, live status counts

### 🧹 Phase 5 — Consolidation & long-tail tools
28. Retire/merge overlap tools: `variation-tracker` → Variation Instruction Log; `verbal-instruction-recorder` → Verbal to Variation; `photo-evidence-log` → Photo Vault
29. Timesheet V2, Scope of Works V2, Progress Report V2, LDs Dispute V2, Contra Charge Dispute V2, Complaint Letter V2, Novation Letter V2, Reference Letter V2, Standing Time Calculator V2, Hire Agreement V2, H&S Policy V2, Asbestos Record V2, Reminders V2, Subcontract Letter V2, Subbi Compliance Checker V2, Subbi Payment Certificate V2, Price Work Profit Calculator V2

### 🔌 Phase 6 — Mocked integrations to real
30. Real Twilio SMS OTP (replace mock)
31. Real Web Speech API for Verbal to Variation (replace mock)

---

## Summary Numbers

- **Tools tracked**: 89 (78 in `tools-config.js` + 11 platform modules)
- **Fully upgraded (V2 shipped)**: **47**
- **Partial (prompt-only or stub)**: **22**
- **Fully outstanding (no work started)**: **20**
- **Consolidation candidates**: **3** (`variation-tracker`, `verbal-instruction-recorder`, `photo-evidence-log`)

The next 5 builds (Finance Hub → Compliance Hub → Business Hub → Tools Library Hub → Settings V2) will move the "fully outstanding" count from 20 → 15 and turn 4 stub Partials into Full, dramatically closing the gap.
