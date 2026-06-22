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

- ✅ **[FEATURE] RAMS — 8 new supplementary sections render in PDF** (Feb 22, 2026)
  - Added the 8 new RAMS sections (Site Induction, Manual Handling, Noise and Vibration, Keeping the Site Tidy, Fire and Emergency Evacuation, Who This RAMS Has Been Shared With, Client / Principal Contractor Sign-Off, Reviewing This RAMS) to the PDF renderer at `/app/frontend/src/lib/rams-pdf.js`. UI form blocks in `Rams.jsx` were already in place from the previous step; this completes the round-trip into the exported PDF.
  - Refactored `section()` helper in `rams-pdf.js` to use a `state.sectionNum` auto-incrementing counter (matches the `sn()` pattern in the UI). Removed all hardcoded section numbers from the renderer so additions/removals stay sequential. Added `noIncrement` + `suffix` options for the 12a sub-section (Substances Requiring a Separate Licensed Assessment).
  - Wired through the 8 new fields in `Rams.jsx` `onDownload` data payload (`siteInduction`, `manualHandling`, `noiseAndVibration`, `keepingSiteTidy`, `fireEvacuation`, `sharedWith`, `clientSignOffName/Role/Date/Signature`, `reviewSchedule`).
  - `sharedWith` is parsed into a "Name / Company / Role" table. Client Sign-Off renders the kvTable + the drawn signature image. Site Induction has a sensible default if left blank.
  - Verified end-to-end via testing_agent (iteration_10): UI sections numbered 1-23 sequentially, all 9 distinctive test snippets and all 8 section titles appear in the exported PDF (5 pages, 120KB). 100% pass.


### Feb 2026 (this session, after fork)
- ✅ **[FEATURE] Photo to Document — Multi-Photo PDF + Site Photo Library** (Feb 20, 2026)
  - Updated `pdf.js` to accept a `photos` array (alongside legacy single `photo`). When photos are attached, a new "Photographic Evidence" annex is appended on its own page with: per-photo header ("Photo N of M"), date/time/location stamp line, the embedded image, and an optional Note block. Each photo block is rendered with proper page-break logic so long notes don't overflow.
  - Updated `ResultActions` in `ToolHeader.jsx` to pass the `photos` array through to `downloadPdf` (Download PDF + WhatsApp PDF actions).
  - Updated `GenericToolPage.jsx` banner to display all attached photos as 64×64 thumbnails plus a count ("3 photos attached via Photo to Document").
  - **Bug fix**: React.StrictMode was running the photo-intent useEffect twice — the first pass consumed the localStorage entry and the second pass reset state to null, losing all attached photos. Fixed with a `intentProcessedFor` useRef guard that's stable across StrictMode's double-invocation.
  - New page `/app/frontend/src/pages/SitePhotoLibrary.jsx`, wired through `App.js` route `/app/site-photo-library` and into `tools-config.js` (WOW_TOOLS + emoji 🖼️). Pulls from `morris_photo_library_v1` localStorage. Features: responsive grid (2/3/4 cols), free-text search across notes/locations/dates, document-type dropdown filter, count label, per-photo Save (downloads JPEG), Remove, full-screen viewer modal with same actions, Clear all (with confirm).
  - Verified end-to-end: library renders 2 injected photos correctly with doctype labels, search filter "cracked" narrows to 1 result, multi-photo banner reads "3 PHOTOS ATTACHED VIA PHOTO TO DOCUMENT" on the target tool, navigating to a different tool shows zero banner (intent properly consumed and cleared).

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

- ✅ **[REBUILD] Rate Increase Letter — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/RateIncreaseLetter.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - 5 sections: Letter Details (Addressed To, Your Trade / Rate Description, Date of Letter defaulting to today), Rates (Current rate £, New rate £, **auto-calculated Percentage Increase live** displayed verbatim "This represents a X% increase", Effective From date picker), Reason for Increase (6 multi-select checkbox tiles + free-text "Other"), Notice and Ongoing Work (Notice Period dropdown 4 options defaulting to "4 weeks", Yes/No toggle on Does this affect ongoing jobs — conditional gold reminder when No), Sign Off (signature pad + auto-today).
  - **Conditional document note** when Ongoing = No: inserts verbatim "This rate applies to new works only. Current ongoing projects will be completed at the existing agreed rate." When Yes, the section is skipped cleanly.
  - Document output: formal letter — sender block, To recipient line, Subject line, opening paragraph, rate-change block (5 lines including percentage increase), numbered reasons block, conditional ongoing-work paragraph, optional additional comments, closing paragraph inviting discussion, sign-off block. Reads as a justified business notification.
  - Verified end-to-end: UI percentage math (£250 → £275 = 10% ✓), conditional banner toggles correctly, and AI generation returns a clean professional letter with reference `RIL-DM-260613-001`.

- ✅ **[REBUILD] Snagging List — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/SnaggingList.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - Existing inspection-detail fields preserved verbatim (Project Name, Project Address, Unit / Plot Number, Inspection Date and Time, Inspected by, Inspector Role dropdown, Contractor Representative).
  - **Replaces the old freetext box with a dynamic snag table**: auto-generated Snag Number `S-001…`, Location, Item / Element, Defect Description (textarea), 3-option Severity dropdown (verbatim spec strings), 3-option Status dropdown (Open / In Progress / Closed), Target Completion Date, **conditional Date Closed picker (only visible when Status = Closed)**, Notes / Photo Reference. Add/remove rows freely.
  - **Live summary panel** (6 cards): Total snags raised, **High severity snags open (red when > 0)**, **Medium severity snags open (gold when > 0)**, Low severity snags open, Snags closed / completed, Percentage complete shown as "X% of snags resolved" (green when 100%).
  - Document output: title, inspection details, full snag table preserved (with Date Closed line on closed items), verbatim severity key, full 6-line summary including the "X% of snags resolved" text, verbatim statement in capitals, verbatim Next Actions paragraph, inspector sign-off, contractor representative acknowledgement block.
  - Verified end-to-end: UI summary math (1 High open / 1 Medium open / 0 Low open / 1 Closed → 33% resolved), conditional Date Closed field appears correctly, and AI generation returns the full structured snagging list with reference `SNG-001`.

- ✅ **[REBUILD] Contract Review — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/ContractReview.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - 2 input sections + sign off: Contract Details (7-option Contract Type dropdown with conditional Other, Main Contractor / Client, Project Name, optional Contract Value £), Contract Text (large paste box with live character counter + optional Specific Concerns textarea).
  - **Permanent disclaimer banner** at the top: "This review is a general guide only and does not constitute legal advice. For contracts of significant value or complexity, always seek independent legal advice before signing."
  - AI prompt restructured to produce a 15-section plain English review with mandatory `Rating: Favourable / Standard / Unfavourable / Missing / Unclear` lines on every numbered finding — Plain English Summary (first for quick reading), Payment Terms (auto-flags pay-when-paid clauses with HGCRA 1996 citation), Retention, Variations (flags short time bars), Termination, Liability & Insurance, Dispute Resolution (flags removed adjudication rights — Scheme for Construction Contracts), Programme & Delays (LDs / EoT), **Key Red Flags** section, Specific User Concerns, verbatim Disclaimer, Reviewed By sign-off.
  - **On-screen colour-coding**: the generated output is parsed live in React and every `Rating: <word>` line is tinted (green Favourable / gold Standard / red Unfavourable / grey Missing-Unclear). Legend swatch shown under the output.
  - Verified: UI renders cleanly with disclaimer banner + conditional Other field. End-to-end AI generation could not complete in the test run because the Emergent LLM key daily budget was exhausted (`Current cost: 1.4058, Max budget: 1.4`). Wiring is identical to every other working tool — top up the Universal Key to verify the AI output, or wait until the daily budget resets.

- ✅ **[REBUILD] HMRC Correspondence — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/HmrcCorrespondence.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - 4 sections + sign off: Your References (Full Name, UTR, NI number — auto-populated from profile), HMRC Letter Details (HMRC Reference Number, Date of HMRC Letter, Deadline for Response, 10-option Issue Type dropdown with conditional Other), The Matter (renamed "Summary of HMRC Letter" + "Your Response / Position" — existing textareas with new placeholders), Outcome and Supporting Documents (7-option Outcome dropdown with conditional Other, 6 multi-select checkbox tiles for Supporting Documents + free-text Other).
  - **Live deadline warning** (gold banner) when the response deadline is within 14 days, with messaging shifting to "deadline has passed" when negative.
  - Document output: HMRC-correct header layout (sender + UTR + NI all printed exactly, recipient block, subject referencing the HMRC letter date and reference), opening, the matter, the response, outcome requested, numbered supporting documents list, deadline acknowledgement, closing with email + telephone, verbatim disclaimer about seeking accountant / tax adviser advice, sign-off.
  - Verified UI: deadline-within-14d warning fires correctly; supporting document tiles toggle on/off.

- ✅ **[REBUILD] Bad Debt Letter — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/BadDebtLetter.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - 4 sections + sign off: Letter Details (Date of Letter, Debtor, Original Invoice Date, Invoice Number, Description of Works), Amounts (Original Invoice Amount, Amount Outstanding, **auto-calculated Days Overdue** from original invoice date to today, Statutory Interest with Auto/Manual toggle, Statutory Compensation with Auto/Manual toggle, **live Total Amount Now Due**), Previous Recovery Attempts (textarea with multi-line placeholder), Deadline and Next Step (Final Payment Deadline + 5-option Next Step dropdown, gold warning if deadline <7 days from today).
  - **Auto-calculated statutory interest** — 8% above the Bank of England base rate (`BANK_BASE_RATE_PCT` constant currently set to 4.75%, giving 12.75% p.a.) applied pro-rata to the outstanding amount over the days overdue.
  - **Auto-banded statutory compensation** under the Late Payment of Commercial Debts (Interest) Act 1998: under £1,000 → £40, £1,000–£9,999 → £70, £10,000 or more → £100 — banded against the **original invoice amount**.
  - Document output: title "NOTICE OF BAD DEBT — FINAL DEMAND" in capitals, sender + recipient blocks, subject referencing invoice number, opening, full account summary, verbatim previous-recovery-attempts list, statutory entitlement paragraph + figures (interest + compensation + total now due), firm payment deadline, consequences-of-non-payment paragraph with the chosen Next Step verbatim, invitation to resolve, verbatim "without prejudice" disclaimer, sign-off.
  - Verified end-to-end UI math: original date 13/01/2026 → today 13/06/2026 = **151 days overdue ✓**, statutory interest on £3,500 over 151 days at 12.75% p.a. = **£184.61 ✓**, compensation bands (£500→£40, £5,000→£70, £15,000→£100) **all correct ✓**, total £3,500 + £184.61 + £70 = **£3,754.61 ✓**, <7-day deadline warning fires correctly.

- ✅ **[REBUILD] Price Work Variation Tracker — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/PriceWorkVariationTracker.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - 4 sections + sign off: Job Details (Project Name, Main Contractor / Client, optional Original Contract Reference, optional Original Contract Value, Date Tracker Started defaulting to today), Variation Tracker table (dynamic rows with auto-generated `PV-001…`, Date, Description, Instructed by, 7-option Unit dropdown, Quantity, Rate, **auto-calculated Line Total live**, 5-option Status dropdown, Notes), Tracker Summary, Important Note banner (gold, verbatim spec text), Sign Off.
  - **Live summary panel** (8 metrics): Total variations logged, Total value of all variations, Agreed / Pending / **Disputed (red when > 0)** / Paid, **Revised Contract Total = Original Contract Value + Total Variations (gold)**, **Outstanding Amount = Total − Paid (gold when > 0)**.
  - Document output: title `PRICE WORK VARIATION TRACKER — {project} — {date}`, job details, full pipe-delimited variation table preserved verbatim, 10-line summary including Original Contract Value / Revised Contract Total / Outstanding, verbatim Important Note paragraph, verbatim footer "All variations should be agreed in writing before inclusion in a payment application. This tracker should be retained with the project file.", sign-off.
  - Verified end-to-end UI math: 4 rows totalling £3,550 (£900 Agreed + £450 Pending + £1,200 Disputed + £1,000 Paid) → Original £50,000 + £3,550 = **Revised £53,550 ✓**, Outstanding £3,550 − £1,000 = **£2,550 ✓**, Disputed card shown in red, Revised + Outstanding cards highlighted in gold.

- ✅ **[REBUILD] Tender Letter — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/TenderLetter.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - 5 sections + sign off: Tender Details (Date, auto-suggested Reference `TL-001`, Client, Project, Tender Sum, Tender Valid Until defaulting to +30 days), Scope of Works (scope + What is Included + optional What is Excluded), Programme and Commercial (Proposed Programme, optional Proposed Start, Payment Terms dropdown with conditional Other, 4-option Price Status dropdown), Key Points / Why Choose Us (optional), Attachments Enclosed (7 multi-select tiles — Priced Schedule, Programme, Company Profile, Insurance Certificates, RAMS, CSCS Cards, References — plus free-text Other), Sign Off.
  - Document output: formal cover letter — sender block, recipient line, subject referencing reference number, opening, full tender-details block (including Status of Price line), Scope of Works, Inclusions / Exclusions, Programme + Proposed Start, Payment Terms, optional Key Points paragraph, numbered Attachments list, closing paragraph inviting queries, sign-off with email + phone, verbatim footer about the tender being submitted in good faith and the company reserving the right to withdraw or amend prior to acceptance.

- ✅ **[REBUILD] Payment Tracker — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/PaymentTracker.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - 4 sections + sign off: Tracker Details (Company Name auto-populated read-only, 3-option Tax Year dropdown defaulting to current UK tax year boundary 6 April, Date Last Updated read-only today), Payment Tracker table (dynamic rows with auto `PT-001…`, Project, Main Contractor / Client, Invoice Number, Invoice Date, Invoice Amount, **3-option CIS Deduction Rate dropdown (0% / 20% / 30%)**, **auto CIS Amount Deducted**, **auto Net Amount Due = Invoice − CIS**, Payment Due Date, Amount Received, Date Received, Retention Held, **auto Outstanding Balance = Net − Received (gold when > 0)**, 6-option Status dropdown, Notes), Financial Summary (8 cards live), gold CIS Note banner (verbatim), Sign Off.
  - **Live summary** (8 metrics): Total invoiced this tax year, **Total CIS deducted** (the Self Assessment reclaim figure), Total net amount due, Total received, Total retention held, **Total outstanding (gold when > 0)**, **Number of invoices overdue (red when > 0 — counts explicit "Overdue — chasing" status OR any row past Payment Due Date with outstanding > 0, excluding Paid in full / Written off)**, Number of invoices disputed (gold).
  - Document output: title `PAYMENT TRACKER — {taxYear} — {date}`, tracker details, full pipe-delimited 16-column table preserved verbatim, 9-line financial summary, verbatim CIS Note paragraph, verbatim footer about retaining for 5 years and reconciling against CIS payment statements, sign-off.
  - Verified end-to-end UI math (3 rows): Row1 £5k @ 20% → CIS £1k / Net £4k / Outstanding £0 (paid); Row2 £3k @ 30% → CIS £900 / Net £2.1k / Outstanding £2.1k (overdue); Row3 £2k @ 0% → CIS £0 / Net £2k / Outstanding £2k (disputed). Totals: **Invoiced £10,000 ✓ / CIS £1,900 ✓ / Net £8,100 ✓ / Received £4,000 ✓ / Retention £150 ✓ / Outstanding £4,100 (gold) ✓ / Overdue 2 (red) ✓ / Disputed 1 (gold) ✓**.

- ✅ **[REBUILD] CIS Calculator — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/CisCalculator.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - 3 sections + sign off: Invoice Inputs (Labour £, Materials £, **3-option CIS Rate dropdown — 20% Registered / 30% Unregistered / 0% Gross payment status**, Yes/No VAT toggle, conditional VAT Rate dropdown 20/5/0% + the verbatim note "VAT is calculated on the full invoice value including materials. CIS is deducted from labour only."), Live Calculated Breakdown (11-row panel — Labour, Materials, Gross before VAT, VAT amount, Total invoice, divider, **CIS deduction (labour only)**, **Net payment to subcontractor (gold highlighted)**, divider, Amount contractor pays subbie, Amount contractor pays HMRC), Sign Off.
  - **Live math** end-to-end: Gross = Labour + Materials; VAT = Gross × VAT% (only if VAT registered); Total Invoice = Gross + VAT; CIS Deduction = Labour × CIS%; Net to subbie = Total Invoice − CIS Deduction; HMRC payment = CIS Deduction.
  - Document output: title `CIS CALCULATION — {date}`, calculation details with the CIS rate label spelled out (e.g. "20% — Registered subcontractor (standard rate)"), VAT status line, full breakdown preserved verbatim, verbatim CIS note paragraph, verbatim 5-year retention footer, sign-off.
  - Verified end-to-end across 4 scenarios: (1) £1k labour + £500 mat, VAT off, 20% → CIS £200 / Net £1,300 ✓ (2) +VAT 20% → VAT £300 / Total £1,800 / Net £1,600 ✓ (3) 30% rate → CIS £300 / Net £1,500 ✓ (4) 0% gross payment status → CIS £0 / Net £1,800 ✓.

- ✅ **[REBUILD] Delivery Record — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/DeliveryRecord.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - 4 sections + sign off: Delivery Details (Project / Site, Site Address, **Date of Delivery proper date picker defaulting to today, rendered as DD/MM/YYYY** — bug fix for the previous text-format issue, Time of Delivery, Supplier, Delivery Note Number, optional Purchase Order Reference, optional Driver Name + Vehicle Registration), Items Received table (dynamic rows — Item Description, Quantity Ordered, Quantity Received with **gold-highlight when short**, 8-option Unit dropdown, 5-option Condition dropdown with **gold-highlight when not Good**, Notes), Delivery Status (**auto-calculated Overall Status** — green "Delivery Complete — Accepted" when all rows Good and not short, gold "Delivery Incomplete or Disputed — See Notes" otherwise + Yes/No/Accepted with reservations acceptance toggle, **conditional Action Taken textarea** when acceptance != Yes, optional Follow-Up Required, gold discrepancy reminder banner when items have issues), Sign Off with auto-populated Receiver name + today's date and **dual signature pads** (Receiver Signature + optional Driver / Delivery Agent Signature).
  - Document output: title `DELIVERY RECORD — {supplier} — {date}`, full delivery details, full pipe-delimited items table preserved verbatim, **overall status printed in capitals on its own line**, acceptance + Action Taken + Follow-Up if applicable, verbatim footer "This delivery record should be retained with the relevant purchase order and invoice. Any discrepancies should be notified to the supplier in writing within 24 hours.", dual sign-off block.
  - Verified end-to-end: date input is `type="date"` ✓, status flips correctly when condition changes or qty short, conditional Action Taken + Discrepancy banner appear when acceptance != Yes, dual signature pads render.

- ✅ **[REBUILD] Labour Allocation — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/LabourAllocation.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - 3 sections + sign off: Allocation Details (**Date of Allocation proper date picker defaulting to today** — bug fix for the previous text-format issue, **Week Commencing read-only auto-calculated to the Monday of the current week**, Allocated by auto-populated from profile), dynamic Labour Allocation table (Worker Name, Trade / Role, Job / Project, optional Site Address, Reporting To, Start Time defaulting to 07:30, Finish Time defaulting to 16:30, **auto-calculated Hours**, Task / Scope for the Day, Notes), Allocation Summary, Sign Off.
  - **Live summary** (3 metrics): Total workers allocated today, Total hours allocated across all workers, **Number of different sites covered (de-duplicated by Job / Project name)**.
  - Document output: title `DAILY LABOUR ALLOCATION — {date}`, allocation details including Week Commencing line, full pipe-delimited worker table preserved verbatim, 3-line summary, verbatim footer "This allocation has been issued by {name} on {date}. Workers should report any issues or changes directly to the number above.", sign-off.
  - Verified end-to-end: date input `type="date"` ✓; Week Commencing auto-calc — Wed 17/06/2026 → Mon **15/06/2026** ✓; hours auto-calc — 07:30→16:30 = **9.00h**, 06:00→14:00 = **8.00h** ✓; summary — 3 workers / 26.00 hours / 2 unique sites (Riverside counted once despite 2 workers on it) ✓.

- ✅ **[REBUILD] Purchase Order — dedicated page** (Feb 13, 2026)
  - New page `/app/frontend/src/pages/PurchaseOrder.jsx`, wired through `App.js`, `GenericToolPage`, `tools-config.js`.
  - 7 sections + sign off: Order Details (auto-suggested PO Number `PO-001`, Date of Order proper date picker defaulting to today, Required Delivery Date, Project / Job Reference), Supplier Details (Name + optional Address / Contact / Phone or Email), Delivery Details (Address defaulting to site address if held + optional Delivery Instructions), Order Items table (auto Item Number, Description, optional Catalogue / Product Reference, Quantity, 9-option Unit dropdown, Unit Price, **auto-calculated Line Total live**, Notes), Totals (Yes/No VAT toggle + 20/5/0% rate dropdown, live Subtotal / VAT / **Total Order Value gold-highlighted**), Terms (Payment Terms dropdown with conditional Other + Special Instructions textarea), auto-populated Ordered by + today's Sign Off date + signature pad.
  - Document output: title `PURCHASE ORDER — {poNumber} — {date}`, supplier details + delivery details + full pipe-delimited items table preserved verbatim, VAT-aware totals block, terms, sign-off, verbatim footer "This purchase order is subject to the terms stated above. Please quote the purchase order number on all correspondence, delivery notes, and invoices. Delivery to the address stated by the required date."
  - Verified end-to-end UI math: 50 × £18 = **£900** ✓, 10 × £45 = **£450** ✓, Subtotal **£1,350** ✓, VAT 20% = **£270** ✓, Total with VAT **£1,620** ✓, Total without VAT **£1,350** ✓, Ordered by auto-populated from profile.

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
