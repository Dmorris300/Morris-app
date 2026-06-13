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

- ✅ **[REBUILD] Retention Chaser — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/RetentionChaser.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - Three bold selectable stage buttons matching Payment Chaser style (replaces the broken numeric "1" input).
  - New fields added: Main Contractor / Client Name, Original Contract Value, Retention Percentage (3% / 5% / Other), Which retention release (First half / Second half / Full — second half conditionally reveals Defects Liability End Date), Practical Completion Date, Days Overdue auto-calc, Previous Chase Attempts (Stage 2+), Statutory Interest Yes/No (Stage 2+), Total Now Due auto-calc, Bank details auto-pulled from profile.
  - Stage 1: polite reminder. Stage 2: firm + statutory interest (8% + BoE base). Stage 3: "NOTICE OF INTENTION TO PURSUE LEGAL ACTION" with Late Payment Act 1998, Scheme for Construction Contracts 1998, HGCRA 1996 references, 7-day deadline, dual sign-off.
  - Verified end-to-end: all 11 acceptance checks pass.

- ✅ **[REBUILD] Subcontractor Management — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/SubcontractorManagement.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - **Live compliance register** for subbies engaged. Card-based dynamic list with 14 fields per subbie: Name/Company, Trade/Scope, Phone, Email, UTR, CIS Verified toggle (green when Yes), CIS Deduction Rate dropdown, Public Liability Insurance (Yes/No/Expired), Insurance Expiry date, RAMS (Yes/No/Pending), Induction (Yes/No), Payment Terms (with Other free text), Current Status, Notes.
  - **Live compliance summary** with 6 metrics — Not Verified / Insurance Bad / No RAMS / No Induction all **gold-highlighted with "Action Required" badge** when count > 0. Insurance-bad also catches "Yes" but expired-by-date.
  - **Static gold CIS warning banner**: HMRC verification requirement with live gov.uk deep link + helpline 0300 200 3210.
  - Document output: full register verbatim, compliance summary, CIS warning, footer about keeping the register up to date.
  - Verified end-to-end: 9 of 9 substantive checks pass.

- ✅ **[REBUILD] Meeting Notes — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/MeetingNotes.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - Bug fixed: Date is now a true date picker (defaulting to today, rendered in DD/MM/YYYY throughout the document).
  - Added: Project/Job Reference (before subject), Time of Meeting, Location dropdown with conditional Other free text, Chaired By auto-fill, dynamic Attendees table (Name | Company | Role), renamed "Rough Notes" → "Points Discussed", added Decisions Made textarea, dynamic Actions table (Action | Responsible | Due Date), Next Meeting Date + Format.
  - Document output: clean minute set with all sections plus footer "These notes are a record of the meeting and should be circulated to all attendees within 24 hours. Any corrections should be notified within 5 working days."
  - Verified end-to-end: all 13 acceptance checks pass.

- ✅ **[REBUILD] Weather Log — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/WeatherLog.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - Bug fixed: Date is now a true date picker defaulting today, rendered in DD/MM/YYYY throughout.
  - **Live daily log** — card-based dynamic rows with: Date, Temperature, Wind (5-option dropdown), Rainfall (6), Visibility (4), Overall Conditions (6), Did Work Proceed (4), Hours Lost, Impact on Works, Works Affected. "+ Add Day" / per-row remove.
  - **Live summary panel**: Total days logged, Days fully stopped (gold when >0), Days partially stopped (gold), Total hours lost (gold), Date range covered (first → last entry, auto-derived).
  - **Gold "Important Note" banner**: contemporaneous evidence guidance + Delay Notice / EoT support reference.
  - Document output: full table per row, summary panel, footer "This log has been maintained on a daily basis as a contemporaneous record of weather conditions affecting the works. It is available for inspection upon request." + sign-off.
  - Verified end-to-end: all 11 acceptance checks pass.

- ✅ **[REBUILD] Risk Register — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/RiskRegister.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - **Standard risk matrix scoring** (Likelihood × Severity = Risk Rating): 1–4 green Low / 5–12 gold Medium / 13–25 red High.
  - 5 sections: Register Details (project/site/date/assessor/trade/review-date), collapsible Risk Matrix Guide with band swatches, dynamic Risk Register cards (R-001/R-002/… auto-generated refs, 1–5 pip buttons for Likelihood and Severity, **auto-calculated Initial and Residual Risk Rating badges colour-coded live**), Overall Risk Summary (6 live stats colour-coded, including Overall Project Risk Level + red banner when High residual risks remain), Sign Off with signature pad + verbatim legal reference (MHSW Regulations 1999 + HSAW Act 1974).
  - Document output: full register with all 12 columns preserved verbatim including the "Initial Risk Rating: 15 (High Risk)" / "Residual Risk Rating: 2 (Low Risk)" text exactly. Summary + High residual warning + Acts cited + footer about communicating to workers + retaining in H&S file.
  - Verified end-to-end: all 13 acceptance checks pass.

- ✅ **[REBUILD] Apprentice Manager — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/ApprenticeManager.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - 5 sections: Apprentice Details (name, DOB, standard, training provider, start/end dates, year, weekly wage), Progress Review (review date, period, supervisor), On the Job Skills Log (dynamic add/remove rows: skill, date achieved, competent dropdown, notes), Off the Job Training Log (dynamic rows: date, activity, hours, delivered by), Sign Off.
  - **Live OTJ compliance**: auto-calculates `% of working hours in off-the-job training` against the 30-hour standard week; gold warning when below the 20% legal minimum.
  - Document output: title + apprentice details + review period + verbatim skills/training blocks + OTJ summary block + compliance paragraph + footer "This review should be retained with the apprenticeship file and shared with the training provider".

- ✅ **[REBUILD] Procurement Schedule — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/ProcurementSchedule.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - 4 sections: Project Details (auto-filled Created By + Date Created), Procurement Schedule table (dynamic rows with auto-generated Reference Number P-001…, Item, Supplier, Quantity, Unit dropdown, Date Required, Lead Time in working days, **auto-calculated Order By Date = Date Required minus Lead Time counted Mon–Fri only**, Date Placed, Expected & Actual Delivery, Status dropdown 6 options, Notes), Schedule Summary panel (live), Important Note banner (gold, verbatim spec text).
  - **Order By Date highlights in gold** when today has passed it and the item is still "Not yet ordered".
  - **Live summary**: total / not yet ordered (with count past Order By Date) / awaiting delivery / delivered complete / overdue or issues (red) / next order deadline (gold).
  - Document output: title `PROCUREMENT SCHEDULE — {project} — {date}` + full schedule preserved + summary + important note verbatim + footer + sign-off.
  - Verified end-to-end: UI calculations correct (20/03/2026 − 10 working days = 06/03/2026; 25/02/2026 − 3 working days = 20/02/2026), and AI generation returns the full structured document with reference number saved to Vault.

- ✅ **[REBUILD] Price Work Quote — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/PriceWorkQuote.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - 7 sections: Quote Details (auto-suggested ref PW-001, date today, valid until +30 days), Scope of Works (brief + drawing ref), Priced Schedule (dynamic table with auto Item Number, Description, Unit dropdown 9 options, Quantity, Rate, **auto-calculated Line Total live**, Notes), Totals (Yes/No VAT toggle + 20/5/0% rate dropdown, live Subtotal / VAT / Total Quote Value gold-highlighted), Terms (payment terms dropdown with conditional Other, Included / Excluded / Additional Notes textareas), Quoted By signature pad, Generated Quote output.
  - **Live currency math**: VAT toggle ON → Total = Subtotal × (1 + VAT%); VAT OFF → Total = Subtotal. All values in `£X,XXX.XX` UK format.
  - Document output: title `PRICE WORK SCHEDULE — {project} — {ref}`, full itemised schedule preserved, totals block, terms, quoted-by sign-off, **detachable Acceptance slip** with the verbatim heading "ACCEPTANCE OF PRICE WORK QUOTE", verbatim statement and signature lines for Name / Position / Company / Date / Signature, plus footer "This quote is valid until {validUntil}. All prices exclude any variations instructed after the date of this document."
  - Verified end-to-end: UI math (200 × £18 = £3,600; 15 × £45 = £675; Subtotal £4,275; VAT 20% £855; Total £5,130) and AI generation returns the full structured quote document including the acceptance slip with five signature lines and the valid-until footer.

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
