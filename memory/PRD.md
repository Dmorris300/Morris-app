# Morris — Product Requirements Document

## Original problem statement
Dark-themed construction administration SaaS web application for UK tradespeople.
- Authentication (JWT + OTP, mocked SMS, real email via Resend)
- 88+ trades-specific tools (Site Tools, Documents, Finance, Compliance)
- AI document generation via Claude (Emergent LLM Key, claude-sonnet-4-5-20250929)
- PDF exports (jspdf), Live signature pads, dual sign-off
- Stripe live subscriptions (Solo / Business / Pro / Enterprise) + Customer Portal
- UK legal compliance: CIS, HMRC, HSE, CDM 2015, HGCRA 1996
- "Plain construction English" tone — no corporate jargon

## Architecture
```
/app/
├── backend/
│   ├── server.py        # AI generate, profile, refs (~1340 lines)
│   ├── billing.py       # Stripe live + Customer Portal
│   ├── email_helper.py  # Resend (incl. PDF attachments)
├── frontend/src/
│   ├── components/      # GenericToolPage, LiveSignatureBlock
│   ├── lib/tools-config.js   # 88+ tools (~1950 lines)
│   ├── pages/           # Profile, MeasurementRecord, SelfAssessmentPrep,
│                          PaymentChaser, MileageTracker, PreStartMeeting
│   └── App.js
```

## What's been implemented

### Feb 2026 (this session, after fork)
- ✅ **[FIX] CIS Invoice — National Insurance Number guaranteed render** (Feb 12, 2026)
  - Strict per-tool prompt instruction + backend post-processing safety net that auto-injects `NI No: {value}` under the UTR line if the LLM ever drops it.
  - Verified: 3/3 runs include NI when set; correctly omitted when blank.

- ✅ **[REBUILD] Pre-Start Meeting Checklist — dedicated page** (Feb 12, 2026)
  - New page `/app/frontend/src/pages/PreStartMeeting.jsx`, wired into `App.js` + `GenericToolPage` redirect + `tools-config.js`.
  - 7 sections: Project Details, Scope of Works, Health & Safety checklist (11 tri-state Yes/No/Not Applicable items), Site Logistics checklist (8 tri-state items), Programme (drawings tri-state, conditional "Which trades?" reveal), Attendees (dynamic add/remove with signature toggle), Actions (dynamic add/remove with due date).
  - Bug fixed: Date is now a true date picker defaulting to today (ISO YYYY-MM-DD internally), and rendered in document body as DD/MM/YYYY.
  - Auto-populates Trade and Meeting Held-by from profile.
  - Live signature pad for meeting chair.
  - Verified end-to-end: title, all sections, attendees, actions, conditional reveals, footer, sign-off all render correctly.

- ✅ **[REBUILD] Tool and Equipment Register — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/ToolRegister.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - 4 sections: Register Details (project, site, date, operative/company/trade auto-fill), Equipment List (dynamic table with description, make/model, serial, ownership, condition, PAT status, conditional PAT expiry, inspection due, notes), Summary (live totals + gold-highlighted PAT warnings), Declaration (verbatim text + signature pad).
  - PAT Expiry input only appears when PAT Tested = Yes.
  - Summary auto-calculates: total items, count with PAT expiring within 30 days (or overdue), count of hired items. Gold warning banner appears when any PAT is flagged.
  - DD/MM/YYYY format everywhere in document body; footer "Portable electrical equipment… 110v… retained for duration of project" verbatim.
  - Verified end-to-end: all 9 acceptance checks pass.

- ✅ **[REBUILD] Noise Assessment — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/NoiseAssessment.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - 6 sections: Assessment Details, Noise Sources (dynamic table with per-row auto-calculated risk band), Workers Affected (with conditional health-surveillance gold warning when "regularly above 85 dB(A)" = Yes), Control Measures (8-item tri-state checklist), Overall Assessment Outcome (auto rolls up to highest risk band), Sign Off (signature pad + auto-today + legal reference).
  - **Risk classification per Control of Noise at Work Regulations 2005**: <80 dB(A) green Low Risk, 80–84 gold Lower Action Value, 85–86 orange Upper Action Value, ≥87 red Exposure Limit Exceeded.
  - Overall Site Risk auto-rolls up to the highest band across all sources, shown prominently with matching colour.
  - Legal reference (80/85/87 dB(A) values) and disclaimer rendered verbatim in document body.
  - Verified end-to-end: all 11 acceptance checks pass.

- ✅ **[REBUILD] Working at Height Rescue Plan — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/WorkingAtHeightRescue.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - **Prominent gold warning banner at the top**: "A rescue plan is legally required before work at height begins. It is not the duty of emergency services to rescue a suspended worker — you must have your own plan in place. Suspension trauma can be fatal within minutes."
  - 8 sections: Job Details, Access Equipment (multi-select + Other), Rescue Personnel (primary + backup), Rescue Equipment (7-item tri-state checklist Yes/No/Not Required + location + emergency contact defaulting to "Emergency: 999"), Rescue Procedures (4 pre-filled scenarios — S4 hidden behind a toggle), Communication Plan (dropdown + conditional Other), Workers Briefed (dynamic table), Plan Authorised (signature pad + legal reference).
  - All 4 scenario textareas pre-fill with the exact suspension-trauma / fall / medical-emergency / below-ground-level procedures.
  - Document output preserves the critical warning verbatim at the top, all scenario steps as numbered lists, legal reference per Work at Height Regulations 2005, and the "readily available on site at all times" footer.
  - Verified end-to-end: all 12 acceptance checks pass.

- ✅ **[REBUILD] Manual Handling Assessment — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/ManualHandling.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - 8 sections following the HSE **TILE framework** (Task / Individual / Load / Environment) under the Manual Handling Operations Regulations 1992.
  - **Auto-classified HSE Guideline Check on Load weight**: <16 kg green "Within HSE guidelines", 16–25 kg gold "Caution — within guidelines for men only", >25 kg red "Above HSE guideline figures — mechanical assistance should be considered".
  - **Overall Risk Level auto-derived** from a weighted count of TILE risk factors (handling type, postures, distance, frequency, training, weight band, load attributes, environment). Green Low / gold Medium / red High with conditional red warning banner at High.
  - Multi-select checkboxes for Handling types, Postures, Mechanical Aids, Control Measures. Conditional reveal for "Describe the risk" and "Describe the hazard".
  - Legal reference verbatim: 25 kg / 16 kg HSE guideline figures + "no legal maximum weight limit, TILE individual merits".
  - Footer: "This assessment must be reviewed whenever the task or working conditions change, or following any manual handling injury."
  - Verified end-to-end: all 11 acceptance checks pass.

- ✅ **[REBUILD] Variation Instruction Log — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/VariationInstructionLog.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - Live register for a project: dynamic table with 11 columns per row. **Auto-generated sequential references** (VI-001, VI-002…).
  - **Date Submitted column conditionally renders** only when "Variation Order Submitted?" = Yes.
  - **Live summary panel** with 8 metrics: total count, total estimated, total agreed, total paid, pending, submitted-not-agreed, disputed, **outstanding amount (gold-highlighted)**. Outstanding = agreed-or-estimated for any row not Paid/Withdrawn.
  - Gold "Important Note" banner directs users to the Verbal-to-Variation tool, with a live in-app deep link.
  - Document output preserves all rows verbatim, summary verbatim, important note + footer ("Retain with the project file") verbatim.
  - Verified end-to-end: all 11 acceptance checks pass.

### Previous session (pre-fork, captured in handoff)
- Stripe live keys + price IDs + Customer Portal endpoint
- Resend integration with PDF attachments (`/api/refund-summary/email`)
- Finance overhaul: 8% NI tax pot, split labour/materials, itemised expenses, CIS refund maths
- Fixed `GenericToolPage` auto-prefill regex (date pickers incorrectly triggered)
- New form types: toggle, checkboxes, time, warningBanner, helperText
- Global AI prompt rewrite — "plain construction English" + banned word post-filter
- Rebuilt tools: LDs Dispute, Application for Payment, Final Account, Contra Charge,
  Price Work, Standing Time, Defects Tracker, Novation Letter, Delay Notice,
  Toolbox Talk, Mileage Log, Payment Chaser, Asbestos Record, Self Assessment Prep,
  Measurement Record

## Pending backlog

### P0 — Blockers
_None._

### P1 — High priority
- Replace mock SMS OTP with real Twilio integration
- Refactor `tools-config.js` (1950+ lines) — split into category files
- Refactor `server.py` (1340+ lines) — extract routes into `/app/backend/routes/`
- User sign-off on Measurement Record tool (code complete, visual review pending)
- User sign-off on Pre-Start Meeting Checklist (just rebuilt, awaiting review)

### P2 — Nice to have
- Real Web Speech API for Verbal-to-Variation tool (currently mocked)

## Key API endpoints
- `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`
- `POST /api/profile/update`
- `POST /api/generate` — Claude doc generation (with CIS-specific NI hardening)
- `POST /api/billing/portal` — Stripe Customer Portal
- `POST /api/refund-summary/email` — Resend PDF dispatch
- Job tracker: `POST/GET /api/jobs`
- Documents: `POST /api/documents/save`, `GET /api/documents`, `DELETE /api/documents/{id}`

## Key DB schema (`users`)
`{_id, username, email, phone, plan, isAdmin, isUnlimited, trade, companyName,
fullName, address, contactNumber, utr, vatRegistered, vatNumber, cisStatus,
nationalInsuranceNumber, companyRegNumber, vehicleReg, signature, signatureRole,
cscsCardFront, cscsCardBack, companyLogo, sortCode, accountNumber, bankName,
shareBankDetails, stripeCustomerId, stripeSubscriptionId, planExpiresAt,
favourites, recentlyUsed, docCounters, usageDocs, usageTools, usageMonth}`

## 3rd-party integrations
- Anthropic Claude — via Emergent LLM Key (text generation)
- Resend — user-provided API key (emails + PDF attachments)
- Stripe — live keys (subscriptions + Customer Portal)

## Health
- Broken: none
- Mocked: Twilio SMS OTP, Web Speech API

## Critical notes
- **Production**: deployed to `morrisapp.co.uk`. Preview ≠ Production until user explicitly redeploys.
- **HMRC integrity**: NEVER override UK statutory figures with user typos (e.g. mileage stays 45p, NOT 55p).
- **Tone**: STRICT "plain construction English" — no `facilitate`, `utilise`, `kinetic`, etc. Backend has a banned-word post-filter and per-prompt instruction.
- **Date format**: dedicated tools must render dates in **DD/MM/YYYY** in document output. ISO YYYY-MM-DD is only used internally for `<input type="date">`.
