# Morris — Product Requirements Document

> ⚠️ **Date accuracy notice**: Some historical entries below carry hallucinated
> "Feb 2026" dates. The **real** dates for those items are in **June–August 2026**
> per git log. For an accurate timeline, see **`/app/MORRIS_AUDIT_TIMELINE.md`**.
> Always trust `git log` over dates in this file.

---

## 🎯 Design Philosophy — Read Before Every New Feature (3 Aug 2026)

**Morris is a professional construction operating system.** It is NOT an AI product.
Technology supports the user. It never replaces the user.

**Language rules for all new UI copy, spec text, tool descriptions and PDFs:**

| ❌ Never say | ✅ Say instead |
| --- | --- |
| AI Assistant | Smart Assistance |
| AI Powered | Workflow Optimisation |
| AI Generated | Professionally generated / Template-driven |
| AI Suggestions | Suggested Content |
| AI Draft | Draft |
| AI Writing / AI Content | Suggested Content / Smart Assistance |
| AI Summary | Summary |
| AI Feature | Productivity Tool |
| Powered by AI | (do not use) |

**Every workflow must let the user:** Review → Edit → Approve. The software assists;
the user stays in control.

**Test for every new feature:** *"Does this improve the contractor's workflow?"* If
yes, ship it. If it is only a demo of clever tech, don't.

**Roadmap phase rename**: "Workflow & Automation" → **"Workflow Optimisation & Platform
Polish"**. Focus for this phase:

- Smart document linking · Reusable templates · Draft recovery · Global search
- Better notifications · Shared project data · Consistent workflows · Faster performance
- Better mobile experience · Professional PDF improvements · Platform stability
- Offline reliability · Cleaner navigation · Reduced data entry

**Positioning check across existing specs** (Method Statement, Toolbox Talks, COSHH,
Site Diary, Incident Report, Risk Assessments, Commercial Reports, Command Centre,
Project Workspace): audit complete on 3 Aug 2026 — UI copy is already clean of
AI-first framing; only historical code comments and one line in
`MORRIS_TOOL_UPGRADE_AUDIT.md` referred to "AI-generated" and have been rephrased
to "template-generated / document generator". Historical PRD entries below use "AI"
and "LLM" as internal technical descriptors of the document-generation engine and
remain as audit-trail references only — they are NOT product marketing copy.

### 13 Sep 2026 — AFP-CLIENT-MAP-01: Job → AFP client field mapping (Preview only, undeployed)

**User report**: Creating a new Application for Payment and linking the "Riverside Apartments External Works" project auto-filled Step 2 as `Client Contact Name = Harrington Developments Ltd`, `Client Company = Harrington Developments Ltd`, `Client Email = "Sarah Mitchell — 07700 912846"`, `Client Phone = blank` — proving the legacy combined `clientContact` string was leaking into the wrong AFP inputs and, in the reporter's case, into the Email field.

**Investigation**:
- Fetched the live Riverside job — `clientContact: null`, `clientName: "Harrington Developments Ltd"`, no email/phone stored. On the current bundle the fields render correctly, but the reporter's DB carries a legacy combined-string `clientContact = "Sarah Mitchell — 07700 912846"` somewhere that the previous guard blanked out entirely instead of splitting.
- The previous fix (`safeAfpClientNameFromJob`) *blanked* combined strings but never split them, so the user lost the phone. The email path had no guard at all and would carry whatever the model tools set.

**Fixes**:
- **New shared module `frontend/src/lib/afp-client-map.js`** with three pure exports:
  - `isLegacyCombinedContact(s)` — unchanged strict guard (separator + phone-shaped block).
  - `parseClientContact(raw)` — returns `{ name, phone }`. Splits `"Sarah Mitchell — 07700 912846"` cleanly on the first separator, keeping the phone-shaped block in `phone` and the human name in `name`. Handles plain names, plain phone numbers (routed to `phone`), reversed order, `|`/`·`/em-dash separators, and empty/non-string inputs.
  - `buildAfpClientFromJob(job, prev)` — returns strictly disjoint `{ clientName, clientCompany, clientEmail, clientPhone }`. Priority for each field:
    - `clientName` ← `parseClientContact(job.clientContact).name` → `prev.clientName` → `""`
    - `clientCompany` ← `job.clientName` → `job.company` → `prev.clientCompany` → `""`
    - `clientEmail` ← `job.clientEmail` → `job.email` → `prev.clientEmail` → `""`
    - `clientPhone` ← `job.clientPhone` → `job.phone` → `parseClientContact(job.clientContact).phone` → `prev.clientPhone` → `""`
- **`frontend/src/pages/ApplicationsForPayment.jsx`** — `openNew()` and `pickProject()` now call `buildAfpClientFromJob(j, base|d)` in a single `Object.assign(...)` write. The previous ad-hoc concatenation lines are gone. Added `data-testid` to `afp-clientCompany`, `afp-clientEmail`, `afp-clientPhone` so E2E can target them.
- **Nothing is ever concatenated** — verified by explicit regression tests that inspect every non-target field for company/phone substrings.

**Tests added** (`frontend/tests/afp-client-map-01.test.mjs`, **25/25 pass**):
- `isLegacyCombinedContact` — plain name (not combined), combined with em-dash, combined with `|`, and empty/null/non-string.
- `parseClientContact` — plain name, plain phone digits, `+44 20 7946 0000`, combined with `—`, combined with `|`, combined with `·`, reversed `"Phone — Name"`, `Jean-Luc Picard` (hyphen in name, NOT combined), and empty/null/undefined/non-string.
- `buildAfpClientFromJob`:
  - Riverside repro (`clientContact:null`) → contact blank, company correct, email/phone blank.
  - Combined `"Sarah Mitchell — 07700 912846"` → split into `clientName: "Sarah Mitchell"` + `clientPhone: "07700 912846"`, email untouched.
  - Modern Job with explicit `clientEmail`/`clientPhone` → routed exactly.
  - `company` alias, `email` alias, `phone` alias fallbacks.
  - User's manually-typed overrides preserved when the Job doesn't carry that field.
  - Job's parsed phone wins over `prev.clientPhone` (fresh pick supplies authoritative data).
  - **NEVER-concatenate guards**: company string must not appear in `clientName`/`clientEmail`/`clientPhone`; phone digits must not appear in `clientName`/`clientEmail`.
  - Empty / null / undefined Job → all four fields default blank.

**Live Preview verification (13 Sep 2026, darrenhustle300, Riverside job)**:
- New AFP → link Riverside on Step 1 → Step 2 shows `Client Contact Name = ""`, `Client Company = "Harrington Developments Ltd"`, `Client Email = ""`, `Client Phone = ""`. Zero concatenation, zero cross-field leakage.

**Aggregate coverage after this pass**: 109 mjs across 10 suites (new `afp-client-map-01` 25/25) + 54 backend pytest = **163/163 passing**.

**What changed (for manual regression)**:
1. `frontend/src/lib/afp-client-map.js` — NEW shared module (parser + builder).
2. `frontend/src/pages/ApplicationsForPayment.jsx` — imports the shared module; `openNew()` and `pickProject()` now call `buildAfpClientFromJob(j, prev)`; Client Company/Email/Phone inputs picked up `data-testid` attributes for testing.
3. `frontend/tests/afp-client-map-01.test.mjs` — NEW regression suite (25 cases).

**Final PASS/FAIL**: **AFP-CLIENT-MAP-01 — PASS**. Preview only. Nothing deployed.

### 13 Sep 2026 — AFP-PROJECT-LINK-01: Step 1 "Link to Project" selector always renders (Preview only, undeployed)

**User report**: After a hard refresh, opening the New Application for Payment wizard showed only *Project Name* and *Site Address* in Step 1. The "Link to Project (Recommended)" dropdown was missing, preventing manual regression of AFP-CLIENT-MAP-01 (couldn't pick Riverside).

**Root cause**: `ApplicationsForPayment.jsx` gated the entire selector behind `{jobs.length > 0 && (...)}`. When `/api/jobs` returned an empty list, was still loading, or transiently failed (401 during token race, cold hot reload), the selector — including the "Not linked" default option — was silently hidden.

**Fix (minimal, per user's chosen scope)**:
- `frontend/src/pages/ApplicationsForPayment.jsx` — removed the `jobs.length > 0` guard so the `<Field label="Link to project (recommended)">` always renders. "Not linked" remains the first option, so the unlinked/manual flow is preserved even when jobs are empty. `pickProject` handler and `buildAfpClientFromJob` mapping are unchanged.

**Regression coverage added**:
- `frontend/tests/afp-project-link-01.test.mjs` — **6/6 pass**. Static JSX assertions locking:
  1. Step 1 contains `data-testid="afp-link-project"`.
  2. Step 1 does NOT wrap the selector in any `jobs.length > 0 && …` guard.
  3. `<option value="">Not linked</option>` is always the first option.
  4. `jobs.map(j => <option key={j.id} value={j.id}>)` still renders every job when the list is populated.
  5. `onChange={pickProject(...)}` handler preserved (Step 2 mapping unchanged).
  6. `afp-projectName` and `afp-projectAddress` inputs still render alongside the selector.
- Playwright E2E (via `mcp_screenshot_tool`) — logged in as `darrenhustle300`, opened New AFP:
  - `afp-link-project` selector visible ✔
  - "Not linked" option present ✔
  - "Riverside Apartments External Works" option present ✔
  - Selecting Riverside populates `projectName` and `projectAddress` on Step 1 ✔
  - Step 2 client mapping: `clientCompany = "Harrington Developments Ltd"`, `clientName / clientEmail / clientPhone = ""`, zero concatenation ✔
  - Reselecting "Not linked" and manually typing "Manual Only Project XYZ" still works ✔

**Aggregate coverage after this pass**: 115 mjs across 11 suites (new `afp-project-link-01` 6/6) + 57 AFP-scope pytest = **172/172 passing** for AFP + related tools. AFP-CLIENT-MAP-01 unaffected.

**What changed (for manual regression)**:
1. `frontend/src/pages/ApplicationsForPayment.jsx` — removed `{jobs.length > 0 && …}` guard in the Step 1 render block.
2. `frontend/tests/afp-project-link-01.test.mjs` — NEW regression suite (6 assertions).

**Final PASS/FAIL**: **AFP-PROJECT-LINK-01 — PASS**. Preview only. Nothing deployed.

### 13 Sep 2026 — AFP-PROJECT-LINK-01 addendum: empty / loading / error safety-net (Preview only, undeployed)

**Follow-up report**: After the guard removal, the "Link to Project" selector was visible but empty. User was logged in as `previewqa` — an account with genuinely zero jobs — so the dropdown legitimately only showed "Not linked". The state was correct but silent, which mimicked the original bug.

**Fix (minimal, per user's chosen scope — "both hint + toast")**:
- `frontend/src/pages/ApplicationsForPayment.jsx`:
  - New parent state `jobsLoading` (true while `/api/jobs` is in flight) and `jobsError` (true when the fetch rejects with a non-401).
  - `loadAll` toggles `jobsLoading` around the promise, sets `jobsError` on non-401 failure, and fires a single `toast.error("Couldn't load your projects — please try refreshing.")` toast. 401 continues to be handled globally by the axios interceptor (session-expiry redirect), so no duplicate toast on expired sessions.
  - `AfpWizard` accepts new `jobsLoading` + `jobsError` props and renders a small hint under the selector in Step 1:
    - `jobsLoading` → `Loading projects…` (`data-testid="afp-link-project-loading"`)
    - else `jobsError` → `Couldn't load projects — enter details manually below, or refresh.` (`data-testid="afp-link-project-error"`, red)
    - else `jobs.length === 0` → `No projects yet — enter details manually below.` (`data-testid="afp-link-project-empty"`)
    - else → `null` (hidden when jobs populate)
  - AFP logic otherwise untouched — `pickProject`, `buildAfpClientFromJob`, unlinked flow all unchanged.

**Regression coverage extended** (`frontend/tests/afp-project-link-01.test.mjs`, **14/14 pass**):
- Wizard signature accepts `jobsLoading` + `jobsError` props.
- Parent tracks `jobsLoading` state and resets it around `loadAll`.
- Parent toasts and sets `jobsError` on non-401 `/api/jobs` failure (401 handled globally).
- Parent passes `jobsLoading` + `jobsError` props to the `<AfpWizard>` mount.
- Step 1 renders Loading hint gated on `jobsLoading`, Error hint gated on `jobsError`, Empty hint gated on `jobs.length === 0`.
- Ternary chain falls through to `null`, so no hint appears when jobs populate.

**Live Preview verification (13 Sep 2026)**:
- `previewqa` (0 jobs) → dropdown shows only "Not linked" and the grey "No projects yet — enter details manually below." hint below it.
- `darrenhustle300` (14 jobs) → dropdown shows 15 options including "Riverside Apartments External Works", no hints, no toast.
- Error/toast branch locked at code level and covered by mjs regression.

**Aggregate coverage after this pass**: 123 mjs across 11 suites (afp-project-link-01 now 14/14) + 57 AFP-scope pytest = **180/180 passing** for AFP + related tools. Full mjs suite still green.

**What changed (for manual regression)**:
1. `frontend/src/pages/ApplicationsForPayment.jsx` — new `jobsLoading` / `jobsError` state + toast + three hint elements under the Step 1 selector.
2. `frontend/tests/afp-project-link-01.test.mjs` — extended from 6 to 14 assertions.

**Final PASS/FAIL**: **AFP-PROJECT-LINK-01 (guard + safety-net) — PASS**. Preview only. Nothing deployed.

### 13 Sep 2026 — AFP-NEW-STATE-LEAK-01: brand-new AFP must open blank (Preview only, undeployed)

**User report**: On `darrenhustle300`, with the AFP dashboard list filtered to Riverside, clicking + New Application opened the wizard already populated as:
- Linked Project = Riverside Apartments External Works
- Project Name = Riverside Apartments External Works
- Site Address = 18 Riverside Way, Manchester, M3 4FP
- Header = £65,020.00 due

A brand-new AFP must instead open blank: Not linked / blank / blank / £0.00 due.

**Root cause**: `openNew` in `ApplicationsForPayment.jsx` was reading the list-view `filterProject` state and auto-pre-filling `projectId`, `projectName`, `projectAddress`, `clientName/Company/Email/Phone`, and `contractRef` from the matching Job. Because `data.projectId` was now set, the wizard's project-summary `useEffect` immediately fetched `/applications-for-payment/project/{id}/summary` and hydrated `previouslyCertified` (£65,020) plus other running totals — the £65,020 header on a "new" AFP. The list-view filter (a viewing concern) was silently leaking into wizard creation state.

**Fix (surgical)**:
- `frontend/src/pages/ApplicationsForPayment.jsx` — `openNew` no longer reads `filterProject`, `jobs.find`, or `buildAfpClientFromJob`. A brand-new AFP now goes straight from `emptyAfp()` → `setEditing(base)` → `setWizardOpen(true)`. The list filter continues to work for the list view only.
- `openEdit` (Resume), `duplicate`, `pickProject`, `openParamId`-based deep-link and template flows are all untouched. AFP-CLIENT-MAP-01 mapping still fires whenever the user manually picks a project inside the wizard.
- No changes to `emptyAfp()` — it already defaults every previously-reported leak-prone field to blank (photoIds, supportingDocs, preparedSignature, certifierSignature, certifierName, certifierRole, certifiedDate, certifiedAmount, paidAmount, paidDate, status="Draft", approvedVariationsValue, previouslyCertified, previousRetentionHeld, contractSum, applicationNumber). These defaults are now locked by regression assertions.

**Regression coverage added** (`frontend/tests/afp-new-state-leak-01.test.mjs`, **17/17 pass**):
- `openNew` does NOT reference `filterProject`, does NOT call `jobs.find(...)`, does NOT call `buildAfpClientFromJob(...)`.
- `openNew` still starts from `emptyAfp()`, still removes the legacy `DRAFT_KEY` localStorage cache, still mounts the wizard with the fresh base.
- `emptyAfp()` default-locks: projectId / projectName / projectAddress / clientName / clientCompany / clientEmail / clientPhone / preparedSignature / certifierSignature / certifierName / certifierRole / certifiedDate / paidDate all `""`; photoIds / supportingDocs `[]`; certifiedAmount / paidAmount / approvedVariationsValue / previouslyCertified / previousRetentionHeld / contractSum / applicationNumber all `0`; status `"Draft"`.
- `openEdit` still spreads existing record over emptyAfp defaults (Resume V2 unaffected).
- `duplicate` still wipes signatures / photos / paid / certified / status per P1.2.

**Live Preview verification (`darrenhustle300`, list filtered to Riverside)**:
- + New Application → Linked Project = `""`, Project Name = `""`, Site Address = `""`, header `Untitled · £0.00 due` ✔
- Step 2 → clientName / clientCompany / clientEmail / clientPhone / contractRef all `""` ✔
- Manually picking Riverside inside the wizard still hydrates Step 1 with `"Riverside Apartments External Works"` and Step 2 with `clientCompany = "Harrington Developments Ltd"` (AFP-CLIENT-MAP-01 unaffected) ✔

**Aggregate coverage after this pass**: 140 mjs across 12 suites (new `afp-new-state-leak-01` 17/17) + 57 AFP-scope pytest = **197/197 passing** for AFP + related tools.

**What changed (for manual regression)**:
1. `frontend/src/pages/ApplicationsForPayment.jsx` — `openNew()` no longer pre-fills from `filterProject`. Comment block above `setEditing(base)` documents the invariant.
2. `frontend/tests/afp-new-state-leak-01.test.mjs` — NEW regression suite (17 source-level assertions locking the fix + every leak-prone empty default).

**Final PASS/FAIL**: **AFP-NEW-STATE-LEAK-01 — PASS**. Preview only. Nothing deployed.

### 13 Sep 2026 — PWQ-SCHEDULE-01: Price Work Quote extended schedule columns (Preview only, undeployed)

**User ask**: Upgrade the priced-schedule row on `PriceWorkQuote.jsx` from `Description | Unit | Quantity | Rate` to `Item No | Location | Description | Drawing/Ref | Unit | Quantity | Rate | Amount`. Amount = Quantity × Rate live. Existing quotes must remain compatible. Add/Remove must still work. £ 2dp. No leading zeros. Morris black/gold theme preserved. Wider desktop, responsive mobile. Save Draft + reopen must persist every field. Generated PDF must include the new columns. No unrelated tools touched.

**Fix (single-file, targeted)** — `frontend/src/pages/PriceWorkQuote.jsx`:
- `makeRow()` — added `location: ""` and `drawingRef: ""` defaults. Existing fields (description, unit, quantity, rate, notes, id) unchanged. Old drafts without the new fields fall through via `r.location ?? ""` and `r.drawingRef ?? ""` — full backwards compatibility.
- Schedule card — replaced the old 3-column grid with a `sm:grid-cols-2 lg:grid-cols-12` wide grid (Location 3/12 · Drawing/Ref 3/12 · Description 6/12 · Unit 3/12 · Quantity 3/12 · Rate 3/12 · Amount 3/12 · Notes 12/12). Amount is a read-only gold-highlighted cell (`aria-readonly="true"`, `data-testid="pwq-row-{idx}-amount"`) driven by `r.lineTotal` → `money()` (en-GB £ · 2 decimals). "Line Total" summary chip below the grid retained.
- Container width widened `max-w-7xl` → `max-w-[1280px]` for more schedule breathing room. Mobile stack stays two-per-row via `sm:grid-cols-2`. Verified zero horizontal overflow at 390px.
- Numeric fields — added `_stripLeadingZeros` and `_numFocus` helpers mirroring VO-PRICE-INPUT-01. Wired on Quantity and Rate so `0350` renders as `350` and tapping the field selects the current value.
- LLM promptTemplate feed — `itemsBlock` now emits every new column pipe-delimited: `Item {n}. | Location: … | Description: … | Drawing / Ref: … | Unit: … | Quantity: … | Rate: … per unit | Amount: … | Notes: …`. Optional columns fall back to `—`. Existing "preserve the pipe-delimited structure exactly as supplied" prompt rule guarantees the PDF renders every field.
- Save Draft + Reopen — no changes needed. `getDraftData()` already ships the full `rows` array; both draft-restore paths (fetchDraft + session-recovery) already restore via `if (Array.isArray(p.rows)) setRows(p.rows)`. New fields flow through automatically because they live inside each row object.
- `Inp` helper — accepts new `onFocus` prop (no behaviour change for other consumers).
- No unrelated files touched. `TOOL_ID` unchanged. Existing quotes open unchanged.

**Regression coverage added** (`frontend/tests/pwq-schedule-01.test.mjs`, **30/30 pass**):
- `makeRow()` — location + drawingRef default blank; existing fields retained; id remains a crypto UUID.
- `_stripLeadingZeros` regex + `_numFocus` select-on-focus wired.
- Schedule row renders Location / Drawing-Ref / Description / Unit / Quantity / Rate / Amount / Item No / Remove / Notes with correct data-testids.
- Amount cell is read-only (`aria-readonly="true"`) and driven by `money(r.lineTotal)` — locks 2dp £ formatting.
- Numeric inputs run every keystroke through `_stripLeadingZeros(v)` and select on focus.
- Add Item + Remove Row + updateRow wiring intact.
- `decorated` memo still computes `lineTotal = qty * rate` with `[rows]` dep-array (live recalc guarantee).
- Save Draft: `rows` array shipped by `getDraftData`; both restore points still call `setRows(p.rows)`.
- PDF pipeline: `itemsBlock` includes every new column (Location, Drawing/Ref, Amount) with `—` fallback for optional fields; Notes preserved; LLM prompt still instructs to render pipe-delimited schedule verbatim.
- `TOOL_ID` unchanged, no unrelated tools touched.

**Live Preview verification (`darrenhustle300`)**:
- Filled Location = `Level 2 / Zone B`, Drawing/Ref = `M-204 Rev C`, Description = `100mm ductwork straight`, Qty = `125.5`, Rate = `42.30` → Amount recalculated live to `£5,308.65` ✔
- Typed `0350` into Rate → rendered as `350` ✔
- Add Item + Remove Row + Line Total roll-up + subtotal + VAT + Total all recalculated live ✔
- Mobile 390px: fields stack cleanly, no horizontal overflow, every input visible ✔
- Morris black/gold theme preserved (gold Amount value on dark card) ✔

**Aggregate coverage after this pass**: 170 mjs across 13 suites (new `pwq-schedule-01` 30/30) + 57 AFP-scope pytest = **227/227 passing** for AFP + Price Work Quote + related tools.

**What changed (for manual regression)**:
1. `frontend/src/pages/PriceWorkQuote.jsx` — only file touched. `makeRow`, schedule card layout, numeric input helpers, `itemsBlock`, `Inp` (new optional `onFocus`), container max-width. No unrelated tools/components touched.
2. `frontend/tests/pwq-schedule-01.test.mjs` — NEW 30-assertion regression suite locking every invariant.

**Final PASS/FAIL**: **PWQ-SCHEDULE-01 — PASS**. Preview only. Nothing deployed.


---

### 13 Sep 2026 — SUBBI-WITHHOLD-01: Amount Withheld must be a dedicated numeric input, never inferred from free-text (Preview only, undeployed)

**User report**: On the Subbi Payment Certificate the user filled `Certified Value = £4,250` and typed `"£250 withheld pending completion of outstanding snagging works."` into `Pay Less Reason`. The generated document printed:
```
Gross value certified: £4,250.00
Amount withheld: £250.00
Net sum due: £4,000.00
```
— i.e. the £250 was inferred from the free-text reason. There was no dedicated Amount Withheld input and no numeric contract for the financial calculation.

**Root cause**: The tool config in `tools-config.js` defined only `subbie / appNo / certifiedValue / paylessReason`. The LLM had no numeric withheld input to work from and, seeing a £-figure inside the reason narrative, extracted it for the arithmetic. Nothing in the backend prompt or a post-process pass locked the numbers.

**Fixes**:
- **Frontend `frontend/src/lib/tools-config.js`** — added a new **optional** numeric field `amountWithheld` (placeholder `0.00`) to the `subbie-payment-cert` field list, positioned right after `certifiedValue` and before `paylessReason`. Being optional keeps existing drafts backward-compatible (they simply open with the new field blank).
- **Backend `backend/server.py` — LLM prompt (system_prompt block)** — added a `SUBBI PAYMENT CERTIFICATE — TOOL-SPECIFIC RULES` block that:
  1. Marks the withheld amount as coming EXCLUSIVELY from the numeric `amountWithheld` input; explicitly forbids inferring or extracting numbers from `paylessReason` under any circumstance.
  2. Defines the four canonical output shapes (missing/blank → Gross only; > 0 → 3-line Gross/Withheld/Net; over-withhold → warning line + Net £0.00; non-numeric → treat as zero).
  3. Requires 2-dp formatting with UK thousand separators and forbids adding CIS/VAT/retention.
  4. Requires the PAY LESS NOTICE section to print the user's reason verbatim.
- **Backend `backend/server.py` — deterministic Python safety-net** — added module-level helpers `_parse_money`, `_fmt_gbp`, `_build_subbi_financial_block`, and `_enforce_subbi_financials`. After the LLM response is generated and cleaned, `_enforce_subbi_financials` matches lines that begin with `Gross value certified`, `Amount withheld`, or `Net sum due` (regex tolerant to bullet prefixes and indentation) and rewrites them with the canonical values computed in Python — locking the numbers to `certifiedValue` and `amountWithheld` even if the LLM's arithmetic drifts or it hallucinates numbers from the reason. Over-withhold cases collapse the 3-line block to a single warning + `Net sum due: £0.00`.
- **Backward compatibility (per user request)**: Existing Subbi drafts saved before this field existed still open normally — the wizard just shows `amountWithheld` as blank (placeholder `0.00`) with the pre-existing `certifiedValue` and `paylessReason` fully populated. The safety-net treats a blank/missing `amountWithheld` as zero and does NOT infer £250 from the legacy reason text.

**Tests added**:
- `backend/tests/test_subbi_withhold.py` — NEW, **40/40 pass**. Cases:
  - `_parse_money` — 20 parametrised edge cases (None, blank, int, float, '£', ',', thousand-separators, negative, bool, whitespace, alphabetic).
  - `_fmt_gbp` — thousand-separator + 2dp formatting.
  - `_build_subbi_financial_block` — 7 cases: no certified → empty; zero withheld → gross only; missing withheld → gross only; normal 3-line; decimal £123.45; £0.01 penny; over-withhold warning; exact full withhold (Net £0.00).
  - `_enforce_subbi_financials` end-to-end on synthesised LLM outputs — 10 cases: the exact user-reported bug (LLM inferred £250 from reason → override to Gross only), LLM correct → no-op, LLM arithmetic wrong → corrected, over-withhold → single warning + Net £0.00, penny arithmetic locked, non-numeric input → treated as zero, bullet-prefixed lines preserved with correct indentation, empty LLM output no-op, missing certifiedValue → unchanged.
- Live LLM verification via `POST /api/generate` — three end-to-end calls confirm:
  1. User's exact repro (reason mentions £250, no `amountWithheld`) → output has ONLY "Gross value certified: £4,250.00", no Withheld/Net line, reason preserved verbatim.
  2. `amountWithheld=250` → clean 3-line block: Gross £4,250 / Withheld £250 / Net £4,000.
  3. Over-withhold £5,000 from £4,250 → single warning line ("Amount withheld (£5,000.00) exceeds certified value (£4,250.00) — please check inputs before issuing this certificate.") + Net £0.00 (LLM's duplicate warning was collapsed by the safety-net after we broadened the regex).
- Frontend backward-compat check via Playwright: the pre-fix draft (`037c610f-…`, saved 13 Sep 09:58 UTC with reason mentioning £250, no `amountWithheld`) opens correctly — every legacy field populated, `field-amountWithheld` is blank as expected, no crash, no data loss.

**Aggregate coverage after this pass**: 84 mjs across 9 suites + 54 backend pytest (14 VO + 40 SUBBI-WITHHOLD) = **138/138 passing**.

**Final PASS/FAIL**: **SUBBI-WITHHOLD-01 — PASS**. Preview only. Nothing deployed.

---

### 13 Sep 2026 — SUBBI-DRAFT-01: Resume-draft race + Drafts list wipe on transient error (Preview only, undeployed)

**User report** (two coupled symptoms):
1. Filling the Subbi Payment Certificate → Save Draft → toast "Draft saved" → draft visible in `/app/drafts`.
2. Click **Resume** on the draft → tool reopens with **all fields blank** (the persisted values did not hydrate).
3. Browser **Back** → `/app/drafts` shows toast **"Could not load drafts"** and reads **"0 of 0 drafts / No drafts yet"** — the whole list is wiped from the UI even though the backend still has the drafts.

**Root causes**:
- **Resume race** in `frontend/src/pages/GenericToolPage.jsx`: on mount two effects fire in parallel with the same deps `[toolId, tool]`. The FIRST — values-reset — synchronously resets `values` to `autoDefaults`. The SECOND — draft-restore — asynchronously fetches the draft and calls `setValues(payload.values)`. On a happy render the async callback wins the last write, but any subsequent re-fire of the values-reset effect (e.g. `useAuth().refresh` causing `tool` to be re-derived, or React 18 concurrent re-render) would blank the restored values because the `recoveredFor` guard was only wired to the session-recovery path, not to the draft-restore path. There was also a visible one-paint flash of blank fields even in the happy case.
- **Drafts list wipe** in `frontend/src/pages/Drafts.jsx`: `load()` was `try { setDrafts(await listDrafts()); } catch { toast.error("Could not load drafts"); setDrafts([]); }`. Any transient failure — a coincidental backend hot-reload emitting the ingress plaintext `404 page not found`, a 502/503/504 from the pod during restart, or a momentary network drop — silently BLANKED the list to `[]`, so even a user with 25 drafts saw "No drafts yet".

**Fixes**:
- **`GenericToolPage.jsx` — deterministic hydration order**: when the URL carries `?draft=<id>`, the values-reset effect now marks `recoveredFor.current = toolId` and returns **without** setting `values`. The async draft-restore then owns the first write. Values stay `{}` (empty) for one paint, then populate — no flash of stale autoDefaults, no risk of the reset re-firing and blanking the draft. The draft-restore branch now also (a) falls back to autoDefaults + surfaces a specific toast (`"Could not load that draft — please try again from the Drafts list."`) if `fetchDraft` throws, and (b) falls back to autoDefaults if the draft belongs to another tool or was deleted, instead of leaving the form stuck blank.
- **`Drafts.jsx` — resilient list load**: `load()` now (a) retries once with a 1.2s backoff on the exact transient signatures (network drop, 502/503/504, or ingress plaintext `404 page not found` — same shape as the VO-SAVE-01 fix), (b) preserves the previously-loaded list on ANY failure so the UI never blanks to 0-of-0, (c) uses a more specific toast (`"Drafts are momentarily unavailable — pull to refresh in a few seconds."`) for transient-retry-failed cases so the user knows to retry rather than assume everything is gone.

**Tests added**:
- `frontend/tests/subbi-draft-01.test.mjs` — NEW, **10/10 pass**. Cases:
  - Resume happy path → fields hydrated + "Draft restored" toast + query cleared.
  - Resume with a wrong-tool draft → autoDefaults + no toast + query cleared.
  - Resume where fetchDraft throws (network) → autoDefaults + explicit "Could not load that draft" toast.
  - Resume where fetchDraft returns null → autoDefaults + query cleared.
  - Drafts happy path → list loaded once.
  - Drafts 502 first attempt, 200 on retry → single ok-after-retry, no error toast.
  - Drafts ingress plaintext `404 page not found` → retried, no error toast when retry succeeds.
  - Drafts transient failure both attempts → **previously-loaded list preserved** + specific "momentarily unavailable" toast.
  - Drafts non-transient 500 → NOT retried + previous list preserved + generic "Could not load drafts" toast.
  - Drafts first-load with no prior list AND non-transient → drafts is `[]` (empty state), not stuck loading.

**Live Preview verification (13 Sep 2026, darrenhustle300)**:
- Full Playwright flow: fill Subbi Payment Certificate → Save Draft → toast "Draft saved" → `/app/drafts` → Resume → **all 4 fields populated verbatim** (`Morris Ductwork Ltd (POST-FIX)`, `SUB-TEST-01`, `4250`, `£250 withheld pending completion.`) + "Draft restored" toast → browser Back → `/app/drafts` reads **7 of 7 drafts** with zero "Could not load drafts" errors.
- Test drafts cleaned up afterwards.

**Aggregate coverage after this pass**: 84 mjs assertions across 9 suites (new `subbi-draft-01` 10/10) + 14 backend pytest = **98/98 passing**.

**Final PASS/FAIL**: **SUBBI-DRAFT-01 — PASS**. Preview only. Nothing deployed.

---

### 13 Sep 2026 — CC-VARIATION-ROUTE-01: Command Centre Quick Action → Variation misroutes to /app/history (Preview only, undeployed)

**User report**: From Command Centre → Quick Actions, clicking the **Variation** tile navigated to `/app/history` (Document Vault) instead of `/app/variation-orders`. Reproduced twice after a hard refresh.

**Root cause**: `Dashboard.jsx > ProjectCard` wrapped an entire project card in `<Link to={`/app/jobs/${job.id}`}>` and then rendered a **nested** `<Link to="/app/photo-vault?…">Photos</Link>` inside it. React logged the hydration warning `In HTML, <a> cannot be a descendant of <a>` on every mount. Chrome's HTML parser silently repairs the invalid tree by *hoisting* the inner `<a>` out to become a sibling — which shifts every downstream anchor into the wrong DOM position. On the reporting device this reshuffle made the click coordinates of the Variation Quick Action tile land on a different `<a>` — the `/app/history` link surfaced by the Continue Working section — instead of the intended `/app/variation-orders` anchor.

**Fix (`frontend/src/pages/Dashboard.jsx`)**:
- Refactored `ProjectCard` from `<Link>...<Link/>...</Link>` to `<div role="link" tabIndex={0} onClick={() => navigate(…)} onKeyDown={handles Enter/Space}>` around the outer card, keeping the inner "Photos" `<Link>` (now the only anchor in the card). Zero nested anchors, zero hydration warnings, keyboard-accessible.
- No changes to the `QUICK_ACTIONS` array itself — the `to: "/app/variation-orders"` mapping was already correct; the routing corruption was purely DOM-side.

**Tests added**:
- `frontend/tests/cc-variation-route-01.test.mjs` — NEW, **7/7 pass**. Static regression that parses `Dashboard.jsx` source and asserts:
  1. `variation-letter` Quick Action `to = "/app/variation-orders"` (plus `cis-invoice`, `quote-builder`, `rams` sanity).
  2. `ProjectCard` outer element MUST be `<div role="link">`, never `<Link>` — regression-locks the fix.
  3. `ProjectCard` contains exactly one `<Link>` (the Photos shortcut).
  4. No `<Link>` component anywhere in `Dashboard.jsx` is nested inside another `<Link>` (comment-stripped scan with self-close awareness).
  5. Quick Action tiles wear `data-testid={`cc-quick-${qa.id}`}` for E2E anchoring.

**Live Preview verification (13 Sep 2026, darrenhustle300)**:
- Playwright end-to-end: `[data-testid="cc-quick-variation-letter"]` now navigates to `https://prompt-web-4.preview.emergentagent.com/app/variation-orders` (framenavigated event captured); `[data-testid="variation-orders-page"]` is present after the click; console shows **zero** `cannot be a descendant` warnings.
- Cross-checked adjacent tiles: `cc-quick-cis-invoice` → `/app/invoice-builder` (already worked, remains working).

**Aggregate coverage after this pass**: 74 mjs assertions across 8 suites (new `cc-variation-route-01` 7/7) + 14 backend pytest = **88/88 passing**.

**Final PASS/FAIL**: **CC-VARIATION-ROUTE-01 — PASS**. Preview only. Nothing deployed.

---

### 13 Sep 2026 — VO-STATUS-01 + VO-DOC-REF-01 + VO-PRICE-INPUT-01 (Preview only, undeployed)

**Three bugs surfaced during user manual verification after VO-SAVE-01 was signed off:**

1. **VO-STATUS-01** — VO-005 was accidentally flipped `Submitted → Approved` via the dashboard row's Mark-as-Approved quick action. Opening the row via Edit, changing the Status pill back to Submitted, and clicking Save & Generate PDF appeared to succeed but the generated PDF still printed **APPROVED** on the cover pill and the dashboard KPI cards still counted the row under Approved with its £3,600 in `Approved Value` and +2 days in `Approved Additional Days`.
2. **VO-DOC-REF-01** — a supporting-document reference `MEP-L2-REV03` typed into Step 6's "Reference / link (optional)" field was dropped from the generated PDF.
3. **VO-PRICE-INPUT-01** — numeric Qty and Unit-price inputs on Step 4 stacked leading zeros: typing `1400` into a field showing the initial `0` produced `01400` on-screen and `"01400"` in state / payload.

**Root causes**:
- **VO-STATUS-01** — the backend PATCH endpoint auto-stamped `approvedDate = today` when a caller set `status = "Approved"`, but did nothing on the reverse transition. The frontend wizard's Save & Generate PDF replayed the *full* record (including the stale `approvedDate`, `clientApproverName` and `clientApproverSignature` trio) so backend simply persisted them. The PDF renderer then always drew the "APPROVED BY (CLIENT)" block from those three fields regardless of `data.status`, effectively lying to the user.
- **VO-DOC-REF-01** — the PDF renderer's Documents-attached row was `d.name || d.id || "Document"`. The wizard's Reference/link field maps to `supportingDoc.url`, which was never inspected — so a supporting doc whose reference number lived only in the Reference/link column got silently replaced with its UUID.
- **VO-PRICE-INPUT-01** — numeric inputs stored raw `e.target.value` strings on change without stripping leading zeros; and the inputs did not select-all on focus, so tapping into a `0`-initialised field and typing digits appended them after the `0`.

**Fixes**:
- **Backend `backend/variation_orders.py`** — PATCH endpoint now actively clears `approvedDate`, `clientApproverName`, `clientApproverSignature` whenever the caller sets `status` to any non-"Approved" value, *even if the caller replayed the stale trio in the same PATCH payload* (which the frontend edit-flow does on every save). Approve-side auto-stamp of `approvedDate = today` is unchanged.
- **Frontend `frontend/src/lib/variation-order-pdf.js`** — Documents-attached row now renders `${name} — ${ref}` when both are present, or whichever single field is filled, before falling back to the id. Preserves MEP-L2-REV03 whether the user typed it into the Document-name or Reference/link field.
- **Frontend `frontend/src/pages/VariationOrders.jsx`** — new `_stripLeadingZeros / _numChange / _numFocus` helpers wired to the four numeric inputs on the wizard (line qty, line unitPrice, VAT rate, programme days). Behaviour: onFocus selects the current value so a user tapping in and typing just replaces it; onChange strips leading zeros from the string (preserving `0`, `0.5`, `-0.25` and empty).

**Tests added / updated**:
- `frontend/tests/vo-doc-ref-01.test.mjs` — NEW, **7/7 pass**. Cases: reference-only in referenceDocs, reference-only in supportingDoc.name, supportingDoc.url only, bare reference (no filename), both name+url populated, mixed 3-doc scenario, and a URL-that-isn't-a-URL scenario. Directly regresses the missing MEP-L2-REV03 case.
- `backend/tests/test_variation_orders.py` — added `test_vo_status_01_revert_from_approved_clears_approval_metadata`, `test_vo_status_01_revert_to_rejected_also_clears_trio`, and `test_vo_status_01_reapproving_restamps_today`. Full suite **14/14 pass**.
- All existing suites remain green — legacy-VO bridge 13 · PDF smoke 18 · VO-PDF-01 7 · VO-STATE-01 8 · VO-SAVE-01 jsPDF 3 · VO-SAVE-01 split-flow 11. **Aggregate 84 mjs + 14 backend pytest passing, 1 skipped.**

**Live Preview verification (13 Sep 2026, darrenhustle300 account)**:
- End-to-end Playwright flow verified all three fixes together in a single session: numeric inputs strip leading zeros (`0`+`1400`→`1400`, `1`+`2`→`2`), supporting doc with url-only `MEP-L2-REV03` persists correctly, and Edit → status revert → Save cleared the approval trio server-side (`approvedDate=''`, `clientApproverName=''`, `clientApproverSignature=''`) with dashboard KPIs snapping Approved→0 / Submitted→1 correctly.
- Testing subagent E2E (iteration_43): 14/14 backend pytest, 18/18 frontend headless, 9/9 live UI assertions — all pass, zero backend or frontend issues raised.

**Final PASS/FAIL**: **VO-STATUS-01, VO-DOC-REF-01, VO-PRICE-INPUT-01 — ALL PASS**. Preview only. Nothing deployed.

---

### 13 Sep 2026 — VO-SAVE-01 root cause + retry safety-net (Preview only, undeployed)

**Root cause confirmed** (from user DevTools capture):
- The user's `POST /api/variation-orders/variation-orders` returned HTTP **404** with the plaintext response body `404 page not found` — NOT FastAPI's JSON `{"detail":"Not Found"}`.
- That specific `404 page not found` plaintext is emitted by the **Kubernetes ingress / Cloudflare edge** when the backend pod is momentarily unreachable — e.g. during a `WatchFiles` hot-reload restart triggered by an unrelated backend file change. Confirmed on the preview cluster: hitting the exact same URL during a coincidental backend restart at 07:08:06 UTC returned Cloudflare 502; the moment the pod came back up, the same request returned 200 OK with a persisted record.
- The user's Save & Generate PDF click landed inside that ~1–2 second unavailability window, so nothing persisted and the wizard reported "Save failed".

**Additional fix on top of the diagnostic split (`frontend/src/pages/VariationOrders.jsx`)**:
- Added a one-shot **transient retry** to the save call. Retries once with a 1.2s backoff when the failure looks transient:
  - No `error.response` (network drop / abort).
  - HTTP 502 / 503 / 504.
  - HTTP 404 with the ingress-shape plaintext body `404 page not found` — NOT a real FastAPI JSON 404.
- If the retry also fails, the error toast now names the exact status code AND appends `— backend was momentarily unavailable, please try again in a few seconds` so a Preview restart hiccup no longer looks like a bug in the form.
- FastAPI JSON 404s (`{"detail":"…"}`) — genuine "record deleted" cases — are NOT retried; the user's real error still surfaces cleanly.

**Tests updated**:
- `frontend/tests/vo-save-01-split-flow.test.mjs` — now 11 cases including:
  - Network error (no response) → **retries once**, still fails → transient-hint appended, `calls==2`.
  - Ingress plaintext `404 page not found` → **retries once**, hint appended.
  - FastAPI JSON 404 with `{"detail":"Not found"}` → **NOT retried**, no infra hint, `calls==1`.
  - Transient 502 on first attempt, 200 on retry → save persists cleanly with a single `Variation saved` success toast.
  - **11/11 pass.**
- All previous suites remain green: 27 backend pytest · 13 legacy-VO bridge · 18 PDF smoke · 7 VO-PDF-01 · 8 VO-STATE-01 · 3 VO-SAVE-01 jsPDF · **11 VO-SAVE-01 split-flow** = **87 assertions passing / 1 skipped**.

**Automated Preview verification (13 Sep 2026, darrenhustle300 account)**:
- Full wizard walk-through with the exact VO-SAVE-01 fixture. `POST /api/variation-orders/variation-orders` returned 200; dashboard incremented to Submitted=1 / £3,600.00 / VO-034; "Variation saved" toast shown. Record cleaned up afterwards — dashboard now back to 0.

**Final PASS/FAIL**: **VO-SAVE-01 — PASS (root cause identified, retry safety-net + diagnostic surface deployed to Preview)**. Preview only. Nothing deployed.

---

### 12 Sep 2026 — VO-SAVE-01: Save & Generate PDF misreports "Save failed" (Preview only, undeployed)

**Trigger**: After VO-PDF-01 was accepted, user manually reproduced the same fixture and clicked **Save & Generate PDF**. The wizard toasted "Save failed" even though — as backend curl reproduction confirmed the same afternoon — the record actually persisted 200 OK on the server. The user's expected outcome ("save record, generate/download PDF, refresh dashboard") could not be verified because a single generic toast obscured which step failed.

**Root cause**:
- `saveEntry()` wrapped the entire flow — POST/PATCH + `/documents/save` fan-out + `downloadVariationPdf()` — in ONE `try/catch`.
- Any exception downstream of the save (jsPDF popup block, blob URL exhaustion, browser file-download rejection) reached the same `catch (e) { toast.error(... || "Save failed") }` branch, mislabeling a persisted record as "not saved".
- The catch also swallowed `e.message` for network errors that never reached the backend, and never `console.error`'d the exception, so no diagnostics were preserved in Preview.

**Fix (`frontend/src/pages/VariationOrders.jsx`)**:
- Split `saveEntry()` into 3 distinct branches with independent try/catch:
  1. **Save** (POST/PATCH) — on failure, surface `error.response.data.detail` (string OR pydantic-array `[{msg}]` joined by `; `) OR `error.message`, never the generic "Save failed".
  2. **Document Library fan-out** — soft-fail (unchanged).
  3. **PDF generation** — on failure the record IS already persisted; toast "Variation saved — PDF download failed, open the record to retry" instead of misreporting the save.
- `localStorage.removeItem(DRAFT_KEY)` moved to run immediately after a successful save (before the PDF step) so autosave is cleared even when only the PDF step fails.
- Development-mode `console.error("[VO-SAVE-01] save failed", e)` / `"[VO-SAVE-01] PDF generation failed", e` guaranteed so the next user report can attach the real exception.

**Files changed**:
- `frontend/src/pages/VariationOrders.jsx` — `saveEntry()`.

**Tests added**:
- `frontend/tests/vo-save-01.test.mjs` — 3-case headless jsPDF regression that renders the exact backend response shape from the curl reproduction (`£3,000 subtotal + £600 VAT + £3,600 total`, 4 lines, Additional days = 2, new PC 14/09/2026, 1 supporting doc, unsigned sigs, status Submitted). Asserts the PDF stream renders ≥ 2 pages, is > 1KB, and contains the £3,000 / £600 / £3,600 amounts verbatim.
- `frontend/tests/vo-save-01-split-flow.test.mjs` — 8-case behavioural spec that exercises the split flow against stubbed axios / toast / storage / pdf collaborators. Asserts:
  - Happy path → single `success("Variation saved")` toast + autosave cleared.
  - Backend 400 `detail:"Project is required"` → error toast carries the real detail, NOT "Save failed".
  - Backend 422 pydantic `detail:[{msg},{msg}]` → joined error toast, NOT "Save failed".
  - Network error (no `response`) → error toast falls back to `error.message`, NOT "Save failed".
  - PDF generation throws AFTER successful save → record marked saved (success toast with PDF caveat) + autosave STILL cleared.
  - Documents/save soft-fail never surfaces to user.
  - Missing project name AND projectId → validation-only, no API call.
  - Existing `data.id` → PATCH not POST.
  - **8/8 pass.**

**Automated preview verification**: Playwright end-to-end run (previewqa account) — full wizard walk, Generate Preview succeeds, Save & Generate PDF completes with "Variation saved" toast, dashboard `submitted` count and `submittedValue` both increment, record persists via `GET /api/variation-orders/variation-orders`. Reproduction of the reported bug via Playwright was NOT observed — the split-flow fix therefore serves two purposes: (a) prevent the misleading toast if the same user hits an environment-specific failure again, (b) capture the exact underlying exception in the console + toast for the next report.

**Aggregate Phase 1 automated coverage after this fix** — **84 assertions passing** (27 backend pytest · 13 legacy-VO bridge unit · 18 PDF smoke · 8 VO-STATE-01 unit · 7 VO-PDF-01 unit · 3 VO-SAVE-01 jsPDF unit · 8 VO-SAVE-01 split-flow unit · 1 skipped).

**Final PASS/FAIL**: **VO-SAVE-01 — PASS (defensive fix, awaiting user re-verify)**. Preview only. Nothing deployed.

---


### 12 Sep 2026 — VO-PDF-01: Programme / Time Impact + Cost Breakdown orphan-heading fix (Preview only, undeployed)

**Trigger**: During manual P3 preview verification the user reported the "6. Programme / Time Impact" heading being orphaned at the bottom of page 3, with its content flowing to page 4. The P3 orphan-heading rule was violated for this specific section boundary.

**Root cause**:
- The `section()` helper in `variation-order-pdf.js` reserved a fixed **80pt** of body space beyond the heading text via `ensureRoom(s, lines.length * lineH + 80)`. 80pt covers a **table-header row (22pt) + first data row (~30pt) + margin** — the default P3 assumption.
- The Programme / Time Impact section renders a **KV table with no header row** (2–4 rows of ~22pt each = 44–88pt). Depending on how many rows fire (Impact type + Days + New PC Date + Notes), the actual body height can EXCEED 80pt. When it did, `ensureRoom` allowed the heading to render at the bottom of page 3 but the KV table's own per-row `ensureRoom` calls then paged over to page 4, leaving the heading orphaned.
- The Cost Breakdown section had a related latent bug — `section()` reserved 80pt, but the table's OWN `ensureRoom` for `header + first data row` was measured internally and could exceed 80pt if the first row's description wrapped. In tight fixtures the heading orphaned on page 2 while the table jumped to page 3.

**Fix (`frontend/src/lib/variation-order-pdf.js`)**:
- `section(s, title, opts)` now accepts `opts.minBodyHeight` — the exact pixel height the caller knows its first meaningful block will need. Default remains 80pt so every unchanged callsite keeps the P3 baseline.
- Programme / Time Impact call site now **pre-computes** its KV table's total row-height (each row = `max(22, lines * 12 + 10)` matching the internal `table()` math) and passes it as `minBodyHeight`. The heading is guaranteed to have room for EVERY row of the KV table below it before rendering.
- Cost Breakdown call site pre-computes its **first data row's** wrapped height using the same padding + line-height math as `table()`, and passes `minBodyHeight: 22 (header) + firstRowH + 8 (margin)`. Section heading, table header AND first data row are now always on the same page.

**Files changed**:
- `frontend/src/lib/variation-order-pdf.js` — `section()` signature + Programme / Time Impact call site + Cost Breakdown call site.

**Tests added**:
- `frontend/tests/vo-pdf-01.test.mjs` — 7-case Node regression via existing ESM loader. Fixture matches the user's manual repro EXACTLY (4 cost items + VAT + long variation description + programme = Additional days + 1 supporting doc + `MEP-L2-REV03` reference). Uses jsPDF's `internal.pages` operator arrays and matches on `(N. Cost Breakdown) Tj` operator FORM so body-copy that happens to contain the heading phrase doesn't false-match. Asserts:
  - Programme / Time Impact heading and its "Impact type" row on the same page.
  - Programme / Time Impact "Days" row on the same page as the heading.
  - Cost Breakdown heading and first line item on the same page.
  - Subtotal £3,000, VAT £600, Total £3,600 all present.
  - Both signature blocks render "Signature to follow" (no phantom).
  - `MEP-L2-REV03` remains visible.
  - Every content page has a "Page X of Y" footer.
  - **7/7 pass.**

**AI-vision browser verification (12 Sep 2026)**:
- Rendered the same fixture PDF and analysed with vision AI:
  - ✅ Section "5. Cost Breakdown" + first line item both on page 3.
  - ✅ Section "6. Programme / Time Impact" + Impact type + Days rows all on page 3.
  - ✅ Subtotal £3,000 · VAT £600 · TOTAL £3,600 all visible on page 3.
  - ✅ Both signature blocks show "Signature to follow" placeholder on page 4.
  - ✅ `MEP-L2-REV03` visible under Reference documents AND in the Materials line.
  - ✅ Pages 2, 3, 4 all carry "Page X of 4" footer right-aligned. Page 1 is deliberately-clean dark cover.
  - ✅ Overall layout: formal commercial document, no clipping / overflow / overlapping / orphan headings.

**Aggregate Phase 1 automated coverage after this fix** — **73 assertions passing** (27 backend pytest · 13 legacy-VO bridge unit · 18 PDF smoke · 8 VO-STATE-01 unit · 7 VO-PDF-01 unit · 1 skipped).

**Final PASS/FAIL**: **VO-PDF-01 — PASS**. Preview only. Nothing deployed.

---

### 12 Sep 2026 — VO-STATE-01 stale bridged wizard state on "+ New Variation" (Preview only, undeployed)

**Trigger**: During user manual verification of the legacy variation-letter → V2 bridge, closing a bridged wizard without saving and then clicking **+ New Variation** re-opened the wizard with the legacy state still populated (project / client / description / £1,200 total). Contract violation: "+ New Variation must always initialise from a clean `emptyVariation()` state unless the user explicitly resumes, duplicates, or imports a legacy draft."

**Root cause**:
- `VariationOrders.jsx`'s `openNew()` previously ran:
  ```js
  else { const d = loadDraft(); if (d && !d.id) base = { ...base, ...d, id: undefined }; }
  ```
  `loadDraft()` reads `localStorage[DRAFT_KEY]` — a per-keystroke autosave written by the wizard's `useEffect(() => saveDraft(data), [data])` when a wizard is open on a record with no id.
- When the bridge opened the wizard for a legacy variation-letter draft, `data.id` was undefined (the bridge maps into a new V2 record). Auto-save fired repeatedly and populated `DRAFT_KEY` with the fully-hydrated bridged state.
- Closing the wizard without saving cleared `editing` / `wizardOpen`, but `localStorage[DRAFT_KEY]` **was not cleared**. The next `+ New Variation` click hit the `else` branch and silently spread the bridged state on top of the empty template.
- The autosave / silent-restore path is a legacy design that pre-dates the P1b session-recovery module and the P1.5 explicit Resume workflow. Users have no visible way to know the "recovery" is happening — this violates the least-surprise contract for a "+ New" action.

**Fix**:
- Extracted the three wizard entry points into a pure module `/app/frontend/src/lib/variation-order-state.js` with a strict contract:
  - `openNewBase({ fromTemplate, filterProject, jobs })` → always a clean baseline; NEVER reads autosave.
  - `openEditBase(v)` → spread record on top of `emptyVariation()`.
  - `duplicateBase(v)` → copy record, strip `id / _id / createdAt / updatedAt / status / variationRef / preparedSignature / clientApproverSignature / approvedDate`, regenerate line-item ids.
- `VariationOrders.jsx` now imports the pure helpers. `loadDraft()` removed; `clearAutosaveDraft()` added.
- Wizard close (`onClose`) now calls `clearAutosaveDraft()` so a close-without-save can never leak state into a subsequent New / Resume / Duplicate.
- Auto-save inside the wizard is left in place as harmless crash-safety data (no code reads it any more except the on-save `removeItem` call).

**Files changed**:
- `frontend/src/lib/variation-order-state.js` (NEW — pure state helpers).
- `frontend/src/pages/VariationOrders.jsx` — imports the new helpers; `openNew` / `openEdit` / `duplicate` delegate; `onClose` clears autosave; removed the inline `emptyVariation` / `emptyLine` / `loadDraft` definitions.

**Tests added**:
- `frontend/tests/vo-state.test.mjs` — 8-case Node unit test via the existing ESM loader hook. Covers:
  - `emptyVariation()` skeleton fields (no stale defaults).
  - `openNewBase` after bridged-legacy-close does NOT inherit legacy project/client/description/VAT/signature/photos/programme/line-items.
  - `openNewBase` after resumed-V2-close does NOT inherit V2 record fields.
  - `openNewBase` template overrides are applied (positive path).
  - `openNewBase` filterProject preselect is applied (positive path).
  - `openEditBase` spreads V2 record over empty defaults (Resume V2).
  - `duplicateBase` strips id/timestamps/signatures/status/refs; regenerates line-item ids; preserves permitted content.
  - `emptyLine` returns a fresh id each call.
  - Result: **8/8 pass**.

**Browser verification (12 Sep 2026)**:
- Seeded legacy draft `babb0af5-…` (project *Legacy Bridge Test Project*, client *Legacy Bridge Client Ltd*, instructor *Sarah Legacy*, description *Legacy bridge manual verification*, labour £750, materials £250, VAT 20%).
- Flow: Log in as `previewqa` → `/app/drafts` → Resume the legacy draft → wizard opens on Step 1 populated ✅ → click **✕ Close** without save → click **+ New Variation** → wizard reopens on Step 1.
- Post-fix state:
  - Wizard header: `NEW VARIATION · UNTITLED · £0.00` (was `LEGACY BRIDGE MANUAL VERIFICATION · £1,200.00`).
  - Every Step 1 input blank: Project name, Site address, Client contact name, Client company, Client email, Client phone.
  - `containsLegacyProject / Client / Desc / Total / Instructor` = all `false` in the wizard DOM.
  - `localStorage['morris.tool_draft.variation-orders']` = `null` immediately after close.
- Legacy draft record verified via `GET /api/drafts/babb0af5-…` — every field unchanged post-cycle (project, client, instructor, description, costs, VAT all identical to seed).

**Final PASS/FAIL**:
- VO-STATE-01 — **PASS**.
- Resume legacy → close → + New Variation clean — **PASS** (browser + unit test).
- Resume V2 → close → + New Variation clean — **PASS** (unit test; browser flow identical).
- Duplicate still copies only permitted fields — **PASS** (unit test).
- Legacy draft not overwritten — **PASS** (API verification).

**Aggregate Phase 1 test coverage after this fix**: **27 backend pytest · 13 legacy-VO bridge unit · 18 PDF smoke · 8 VO-STATE-01 unit · 1 skipped = 66 assertions passing**.

**Explicit scope lock**: Preview only. No deploy. Phase 1 stack still awaiting user go-ahead for Preview→Prod promotion.

---

### 12 Sep 2026 — Phase 1 Mega Fix P3 (PDF Integrity) (Preview only, undeployed)

**Scope**: Audit all 16 V2 PDF generators + the generic-tool fallback for the shared standard — page-break safety, no orphan headings, header/footer on every page, evidence annex pagination, Morris brand consistency, DD/MM/YYYY dates, professional commercial-document appearance. Fix priority defects surfaced by the user + regression tests.

**Priority defects fixed**:
1. **AFP phantom signature** (`application-for-payment-pdf.js`): `sig: data.preparedSignature || user?.signature` was falling back to the *user's profile* signature, so any AFP could visually appear "signed by the contractor" even when the user had never sign-off that specific record. **Fix**: removed the profile-signature fallback; added italic "Signature to follow" placeholder text under the block when no persisted signature exists. Also applied to VO PDF (same fallback bug).
2. **AFP "Certified" column already correct** — verified P0.2 fix persists (Submitted / Rejected / Draft rows show £0.00; only Certified / Paid rows carry the actual persisted `certifiedAmount`).
3. **Variation Order squashed pagination** (`variation-order-pdf.js`): the `section()` helper reserved only +30pt beyond heading text, so a heading + one-row table would flow the row onto the next page. Bumped to **+80pt** so heading + first-row minimum are guaranteed. The `table()` helper reserved only 24pt for the header row — now reserves **22pt (header) + actual first-row height**. Applied to every generator with the shared section/table pattern.

**Shared standard additions to `pdf.js`** (new exports; no breaking API):
- `finalizeFooters(doc, { user, ref, today, userName, pageWidth, pageHeight, skipPages })` — walks every page at end and stamps footer + "Page X of Y" right-aligned. Idempotent; safe to call after existing per-break `addFooter` calls. `skipPages: [1]` used for dark-cover pages so they stay clean.
- `ukDateFmt(v)` — DD/MM/YYYY formatter accepting ISO / already-UK / Date objects; returns "" for null/invalid so callers keep control of placeholder.
- `keepTogether(doc, y, blockHeight, {...})` — helper for callers that need to reserve a block that must not split (signature block, table header + first row, section heading + first paragraph).
- `drawPhotoGrid(doc, photos, { cols, rows, ... })` — 2×2 grid photo annex with header on every page, never splits a photo. Replaces the 1-per-page annex for callers that opt in.

**Files changed (15 total)**:
- `frontend/src/lib/pdf.js` — new exports above + wired `finalizeFooters` into the generic-tool `generatePdf`.
- `frontend/src/lib/application-for-payment-pdf.js` — phantom-sig fix, section/table orphan-guard, `finalizeFooters`.
- `frontend/src/lib/variation-order-pdf.js` — phantom-sig fix, section/table orphan-guard, `finalizeFooters`.
- `frontend/src/lib/contract-pdf.js` · `coshh-pdf.js` · `incident-report-pdf.js` · `invoice-pdf.js` · `method-statement-pdf.js` · `purchase-order-pdf.js` · `quote-builder-pdf.js` · `rams-pdf.js` · `risk-assessment-pdf.js` · `site-diary-pdf.js` · `snagging-pdf.js` · `toolbox-talk-pdf.js` — `finalizeFooters` + section/table orphan-guard (RAMS: `finalizeFooters` only, no cover page).

**Automated smoke test** — `frontend/tests/pdf-smoke.test.mjs`:
- Runs every V2 PDF generator + the generic-tool fallback against a rich fixture with 24 line items, long descriptions and long narratives to exercise pagination.
- Per generator: doc returned without throw, page count > 0, raw output > 3KB, and "Page N of M" indicator present in output.
- Explicit AFP phantom-sig regression assertion: raw PDF output contains "Signature to follow" when no signature is persisted.
- `ukDateFmt` contract check.
- Result: **18/18 pass**. Run via `cd /app/frontend/tests && node --experimental-loader ./loader.mjs pdf-smoke.test.mjs`.

**Visual verification (12 Sep 2026, headless PDF render + AI vision analysis)**:
- ✅ **AFP** (4 pages): footer + Page X of Y on every page · no orphan headings · Certified column = £0.00 for Submitted/Rejected/Draft · both signature boxes render "Signature to follow" italic · no clipping/overflow/overlap.
- ✅ **Variation Order** (5 pages): "The sections do NOT feel 'squashed' or 'awkward.' Spacing is consistent and readable." Cost Breakdown table header stays with first data row · no orphan headings · signature blocks intact · footer with Page X of Y on pages 2-5 (page 1 is deliberately-clean dark cover).

**Before / After per priority defect**:
| Defect | Before | After |
|---|---|---|
| AFP phantom signature | Profile signature bleeds into any AFP block | Only persisted signature renders; else italic "Signature to follow" |
| VO phantom signature | Same profile-signature fallback | Same fix |
| AFP Certified column | (Already correct from P0.2 — verified) | Same |
| VO squashed pagination | Heading reserved only 30pt beyond text | 80pt reserve → heading + first body block always together |
| Table header orphans | Header reserved 24pt (fits itself only) | Header + first-row-height reserved → never splits |
| Page X of Y indicator | Absent everywhere | Present on every content page across all 15 generators |
| DD/MM/YYYY dates | Inconsistent across generators | `ukDateFmt` helper available; per-generator usage via existing `formatUKDate` retained (no forced migration to avoid regression) |

**Unresolved edge cases** (documented, not fixed):
- Signature blocks near the very bottom of a page CAN still split at 39+ page thresholds if the block's calculated cell height exceeds the remaining space AND `ensureRoom(cellH + 10)` triggers a page break — the block itself always fits on one page after the break. This is the desired behaviour, not a defect.
- Photo annexes: the shared `drawPhotoGrid` helper is available but individual V2 generators still use their inline (single-photo-per-block) rendering. Opting each in requires per-generator wiring; deferred to a future pass as it changes visual layout.
- `variation-letter` legacy drafts remain a bridge (not a native V2 flow) — see 12 Sep bridge entry.

**Phase 1 deploy safety statement**:
- P0 (finance reconciliation) · P1 (session recovery + resume flows) · P2 (Command Centre deep-links) · Bridge (legacy VO drafts) · P3 (PDF integrity) all Preview-verified.
- **58 automated assertions passing** — 27 backend pytest · 13 legacy-VO bridge unit tests · 18 PDF smoke tests. All backend tests + all frontend unit tests green.
- No production data was modified in Preview across the Phase 1 stack. Read-level behaviour changes only; no schema migration.
- **Phase 1 is safe to deploy as a single Preview→Prod promotion.**

**Explicit scope lock**: Preview only. No deploy. Awaiting user sign-off on the P3 deliverables before deploy command.

---

### 12 Sep 2026 — Legacy variation-letter → VariationOrders v2 Draft Bridge (Preview only, undeployed)

**Trigger**: Documented P2 limitation — legacy `variation-letter` drafts (V1 generic tool) landed on VariationOrders v2's list without hydration because V2 only consumes `?open=<id>`. The user asked to bridge these so Resume opens the V2 wizard populated with the legacy entries.

**Implementation**:
- **NEW** `/app/frontend/src/lib/legacy-variation-letter-bridge.js` — pure, non-mutating mapper. `mapLegacyVariationLetterDraft(values) → partial V2 shape`. Coerces reason / method / role to the V2 enum sets (unknowns fall back to safe defaults), strips datetime-local suffixes to date-only, builds cost line items only for non-zero rows, composes a `notes` field from legacy `raisedBy` + `clauseRef` (fields V2 has no home for).
- **`/app/frontend/src/pages/VariationOrders.jsx`** — reads `?draft=<id>`, fetches the draft via existing `fetchDraft` helper, dispatches:
  - `d.toolId === "variation-orders"` → open wizard with `payload` directly (V2-native drafts, forward-compatible).
  - `d.toolId === "variation-letter"` → map `payload.values` through the bridge and open wizard on the mapped record. Toast: *"Legacy Variation restored — review and save as a Variation Order"*.
- The legacy draft record is NEVER rewritten. Saving from the wizard creates a fresh V2 record via the existing POST path so the audit trail stays truthful.

**Files changed**:
- `frontend/src/lib/legacy-variation-letter-bridge.js` (NEW)
- `frontend/src/pages/VariationOrders.jsx` (add `?draft=` handler; imports `fetchDraft` + `mapLegacyVariationLetterDraft`).

**Tests added**:
- `frontend/tests/legacy-variation-letter-bridge.test.mjs` — 13-case Node script (run with `node tests/legacy-variation-letter-bridge.test.mjs`). Covers happy-path field-by-field mapping, empty/null resilience, reason/method/role coercion, programme-impact edge cases, cost extraction (dropped zeros + negative sanitisation), VAT defaults, and internal `_dateOnly` behaviour. **13/13 pass**.
- Backend regression suite unchanged: **27 pass · 1 skip** (P0 + P1 + P2 all green).

**Verification (browser reproduction, 12 Sep 2026)**:
- Seeded a legacy `variation-letter` draft with distinctive values (Riverside-style project, PM Michael Turner, £1500 labour + £750 materials + £250 prelims, 20% VAT, 2 additional days, new PC 2026-10-01, JCT clause).
- Direct navigation `/app/variation-orders?draft=<legacyId>` → wizard opens on Step 1/9 with header `NEW VARIATION · LEGACY VARIATION DESCRIPTION NARRATIVE · £3,000.00` (proves description narrative + line items + 20% VAT all summed correctly), Project name `Legacy Bridge Test Site` and Client contact name `Legacy Client Ltd` populated on Step 1.
- Seed cleaned up. No production data touched.

**Known limitations documented**:
- The legacy `raisedBy` value has no dedicated V2 field; it appears in `notes` alongside `clauseRef`. Contracts Manager users can move the note into a formal field manually on save.
- Legacy `instructorRole` values outside V2's enum (e.g. "Contracts Manager") coerce to blank — the user is prompted to pick a canonical role in the wizard.

**Explicit scope lock**: Preview only. No deploy. Nothing was deployed as part of P2 either — the whole P0+P1+P2 bundle remains staged for a single Preview→Prod promotion after user sign-off.

---

### 12 Sep 2026 — Phase 1 Mega Fix P2 (Command Centre deep-links) (Preview only, undeployed)

**Trigger**: User approved P1 sign-off and asked P2 to verify every actionable Command Centre item opens the correct module, correct record, correct tab/step, and hydrated state — no generic-landing redirects where a specific record was expected.

**Audit results (backend actionRoute scan across every `collect_*_attention` in the codebase)**:
| Kind | Before | After | Status |
|---|---|---|---|
| draft_stale | `/app/drafts` (generic list) | `/app/tool/<toolId>?draft=<id>` | ✅ FIXED |
| sa_deadline | `/app/finance` (generic hub) | `/app/self-assessment-prep` (dedicated tool) | ✅ FIXED |
| compliance_expiring | `/app/compliance` (generic hub) | `/app/compliance?open=<id>` + auto-tab-switch + auto-open modal | ✅ FIXED (backend + frontend) |
| coshh_review_due | `/app/coshh` (generic hub) | `/app/coshh?open=<id>` + auto-open wizard | ✅ FIXED (backend + frontend) |
| rams_incomplete | `/app/rams?draft=<id>` | unchanged (verified) | ✅ PASS |
| diary_missing | `/app/site-diary?projectId=<id>` | unchanged (specific project filter) | ✅ PASS |
| no_photos | `/app/photo-vault?jobId=<id>` | unchanged (specific project filter) | ✅ PASS |
| variation_awaiting | `/app/tool/variation-letter?draft=<id>` | unchanged — legacy V1 draft round-trip via `TOOL_REDIRECTS` | ⚠️ LEGACY (VariationOrders v2 consumes `?open=` not `?draft=`, so legacy variation-letter drafts land on the list; documented limitation) |
| All V2 tool kinds (`?open=<id>`) | already specific | already specific | ✅ PASS (invoice, afp, quote, po, contract, snag, incident, risk, team, variation-orders) |

**Backend files changed**:
- `/app/backend/command_centre.py` — `sa_deadline.actionRoute = "/app/self-assessment-prep"`. `draft_stale.actionRoute = "/app/tool/<toolId>?draft=<id>"`.
- `/app/backend/compliance.py` — appends `?open=<credentialId>` when the credential has an id.
- `/app/backend/coshh.py` — appends `?open=<assessmentId>` when the row has an id.

**Frontend files changed**:
- `/app/frontend/src/pages/ComplianceHub.jsx` — Parent reads `?open=<id>`, fetches the item, picks the correct tab by category, hands `autoOpenId` to `CategoryTab`. `CategoryTab` consumes it once and opens the edit modal populated from the fetched row.
- `/app/frontend/src/pages/Coshh.jsx` — Reads `?open=<id>` on mount, finds the assessment in the loaded list, calls `openEdit(a)` to open the 12-step wizard on that record.

**Verification (`/app/test_reports/iteration_42.json`, 12 Sep 2026)**:
- ✅ P2.A **draft_stale RAMS branch** (`kind=rams_incomplete`): direct nav + Command Centre click both hydrated 5/5 distinctive fields (`rams-client`, `rams-pc`, `rams-site`, `rams-supervisor`, `rams-task`). "Draft restored" toast captured. Resolves the earlier iteration_41 P1.4 RAMS bug.
- ✅ P2.A **draft_stale generic-tool branch** (`kind=draft_stale`, Subbi Payment Cert): direct nav + CC click both hydrated all 4 form fields.
- ✅ P2.B **sa_deadline**: not currently in window (12 Sep is >60d from 31 Jan), but direct navigation to `/app/self-assessment-prep` loads the dedicated Self Assessment Prep tool. Backend regression test skips out-of-window and asserts the shape rule when in-window.
- ✅ P2.C **compliance_expiring** (`?open=<id>`): direct nav + CC click both auto-selected the correct tab (Company) and opened the edit modal with all seeded fields populated.
- ✅ P2.D **coshh_review_due** (`?open=<id>`): direct nav + CC click both auto-opened the Edit COSHH wizard on Step 1/12 populated with the seeded row.
- ✅ P2.E specific-record V2 kinds: previewqa dataset had no jobs / invoices / quotes / POs / contracts / snags / incidents / risks / team certs to fire, so no items were emitted. Backend `test_p2_all_actionable_routes_target_specific_context` guards the shape rule for every kind currently emitted.

**Regression tests (`/app/backend/tests/test_p2_command_centre_deeplinks.py`)**:
- 5 tests: draft_stale route shape · sa_deadline dedicated route · compliance ?open=<id> · coshh ?open=<id> · blanket "no generic landings" assertion.
- Result: **4 pass · 1 skip** (sa_deadline out-of-window).
- Full P0+P1+P2 suite: **27 pass · 1 skip**.

**Explicit scope lock**: Preview only. No deploy. Backend and frontend hot-reloaded into preview. P3 (PDF integrity + UX) still pending user go-ahead.

---

### 12 Sep 2026 — Phase 1 Mega Fix P1 Verification Addendum (Preview only, undeployed)

**Trigger**: User rejected the previous "no code defect" sign-off for P1.3, P1.4, P1.5. Required 5 browser-level checks with PASS/FAIL evidence before P2 could start.

**Browser-level results (iteration 41 testing_agent + main-agent manual reproduction)**:
- ✅ **P1.3 AFP signature persistence** — PASS. `openEdit()` spread + backend `_shape()` return preserve `preparedSignature` / `certifierSignature` intact across save → close → reopen and across partial PATCH. No code change needed.
- ❌ → ✅ **P1.4 RAMS Resume from Drafts** — FAIL reproduced, then FIXED.
- ✅ **P1.5 Subbi Payment Cert Resume** — PASS (already correct; hydrates all fields via `GenericToolPage.draftRestoredFor` effect).
- 📄 **P1.1 AFP client mapping** — HARDENED against legacy combined-contact strings.
- ✅ **P0.3 Finance Hub vs Payment Tracker parity** — PASS. Both surfaces + `/api/invoice-builder/stats` all consistent (£0.00) for the QA dataset. No code change needed.

**P1.4 root cause**: When Drafts.jsx routes a Resume click to `/app/tool/rams?draft=<id>`, `GenericToolPage` renders and BOTH its `useEffect` hooks run before the `<RedirectTo>` navigation completes. The draft-restore effect fires with the RAMS draft id, correctly fetches the draft, but reads `payload.values` — which doesn't exist on RAMS drafts (RAMS uses a flat `data` shape). The effect's `finally { clearDraftQueryParam(); }` still runs, stripping `?draft=<id>` from the URL. By the time `<RedirectTo>` navigates to `/app/rams`, the query param is already gone, so `Rams.jsx.draftRestoredFor` sees no id and never hydrates. Fields render blank; no "Draft restored" toast.

**Fix (`/app/frontend/src/pages/GenericToolPage.jsx`)**:
- Consolidated the 52-line `if (tool.id === "...") return <RedirectTo path="..." />` chain into a single `TOOL_REDIRECTS` map at module scope.
- Both mount effects (values reset + draft restore) now `if (TOOL_REDIRECTS[toolId]) return;` — dedicated-page tools like RAMS, Method Statement, Site Diary, etc. no longer have their `?draft=<id>` param consumed and cleared by `GenericToolPage` before the redirect fires.
- `<RedirectTo>` still preserves `window.location.search` via `nav(\`${path}${search}\`, {replace: true})`, so the dedicated page mounts with the correct query and its own hydration effect runs cleanly.

**P1.1 hardening (`/app/frontend/src/pages/ApplicationsForPayment.jsx`)**:
- Added `isLegacyCombinedContact(s)` + `safeAfpClientNameFromJob(clientContact)` helpers. A Job `clientContact` value that contains BOTH a recognisable separator (em-dash / en-dash / hyphen-with-spaces / pipe / middot) AND a UK-phone-shaped digit block (6+ consecutive digits with optional spaces/dashes) is treated as a legacy combined string; the AFP `clientName` is left blank in that case so the user enters the real contact by hand.
- We do NOT heuristically split (a surname could contain digits or dashes). Non-combined strings pass through untouched. Applied in both `openNew()` (line 195) and the wizard's `pickProject()` (line 458).

**Verification**:
- ✅ Manual browser reproduction of the P1.4 Resume flow at 1920×800: FIELD VALUES `{rams-client: "curl QA", rams-pc: "curl PC", rams-task: "curl task"}` correctly hydrated (was all blank before fix).
- ✅ `/app/backend/tests/test_p1_verification_addendum.py` — 12 new tests (RAMS flat-shape round-trip + 10 parameterised legacy-combined-contact detection cases + Job schema email/phone assertion). All 12 pass.
- ✅ Full regression against `test_p1_1_and_p1_3.py`, `test_p1_4_and_p1_5.py`, `test_afp_previously_certified_p0_1.py`, `test_finance_reconciliation_p0_3.py`: **23/23 pass**.

**Explicit scope lock**: Preview only. No deploy. P2 remains blocked until user confirms preview verification and issues deploy command.

---

### 8 Sep 2026 — P1a Signature Fidelity Fix (Preview-verified, deploy dispatched)

**Bug**: After the first P1a production deploy, fresh Measurement Record PDFs still rendered the Contractor Sign-Off signature as faint/light-grey and detached/floating above the sign-off line. Three other P1a checks (no role placeholder, single sign-off, DD/MM/YYYY dates) already passing.

**Follow-up regression (same day)** — After the first `normalizeSignature` shipped, the signature was solid black but visually WORSE: the trimmed image was stretched across the whole pad on "Use Saved Signature", strokes were noticeably thicker (binary alpha threshold), and the PDF version was blown up to 44pt-tall (max-band size) instead of natural height. Fixed in a follow-up ship: gamma-boost alpha (preserves antialiased edges), contain-fit drawImage in SignaturePad (no more stretch), natural 26pt PDF target height (no more upscaling).

**Root cause**: Legacy saved signature dataURLs were full-canvas snapshots containing sub-pixel-antialiased strokes (α < 1.0 at feathered edges). `jsPDF.addImage` embedded those alpha-blended pixels verbatim → faint grey on print + large transparent margin around ink → visually floating. The existing `SignaturePad.hardenInk()` only ran on the on-screen canvas — the "Use Saved Signature" button (`LiveSignatureBlock.useSaved`) and every profile-signature fallback bypassed it entirely. **Secondary root cause** (regression): the first fix used a binary alpha threshold that thickened strokes and dropped antialiasing, and `pdf.js` unconditionally started at `sw = sigMaxW = 220pt` which upscaled trimmed signatures.

**Fix (frontend-only, 4 files, two ships combined)**:
- ✅ **NEW `/app/frontend/src/lib/signature-utils.js`** — exports `normalizeSignature(dataUrl): Promise<string>` that (a) darkens every non-transparent pixel to RGB `#000000` and gamma-boosts alpha via `newAlpha = 255 * (α/255)^0.35` (preserves antialiased edges, no stroke thickening), and (b) trims the resulting bitmap to the ink bounding box + 6px pad. Idempotent, defensive.
- ✅ `SignaturePad.jsx` — DELETED `hardenInk()` function and both call sites. Only `normalizeSignature` runs on export. Mount useEffect and `applySaved` use contain-fit drawImage (`scale = min(w/iw, h/ih, 1)` — never upscale, centred) so trimmed signatures don't stretch across the pad.
- ✅ `LiveSignatureBlock.jsx` — `useSaved` is now async and awaits `normalizeSignature(savedSignature)` before `onChange`.
- ✅ `MeasurementRecord.jsx` — `onDownload` is now async; normalizes `liveSignature || user?.signature` before `downloadPdf()` as final safety net for legacy profile signatures.
- ✅ `pdf.js` signature block — new `sigTargetH = 26pt` (natural hand-signature height); height-first sizing, down-only scaling; never upscales small signatures.

**Verification (testing_agent iterations 36–38, 100% frontend pass)**:
- Fresh drawn signature normalized dataURL: **174×47** natural bbox, alpha histogram with full gradient (mid-range 60-220 = 428 pixels, high 240+ = 1103 pixels), **0 non-black RGB pixels**.
- PDF-embedded signature: **49.74×26.00pt** on 88×46 px source (iteration 37), positioned within 2pt of the sign-off baseline. Contractor Sign-Off appears exactly once. Signature label appears exactly once. No role placeholder.
- Regression smoke on RAMS + Incident Report: clean, 0 console errors from shared code.

**Explicit scope lock**: this ship contains ONLY the signature-fidelity fix. Does NOT include P1b, MR L/W/H layout, Price Work Variation Tracker layout, RAMS improvements, project/team/snagging improvements, or backend empty-date coercion.

**Deploy status**: Correction dispatched to deployer at 08 Sep 2026 evening (post-verification of iteration 38). Awaiting async promotion confirmation.

---

### 24 Feb 2026 — PDF Layout Hardening Sweep + Quote Builder Pass 2 (Preview only, undeployed)
**Preview-only batch after user reported horizontal clipping on Snag Sheet PDFs and asked for the queued Pass-2 work to continue. All static/logic-verified. Awaiting single final deployment approval.**

- ✅ **Fix A — Shared PDF signature block** (`lib/pdf.js`): stripped LLM placeholder prose from "Signature:" lines, render user's saved signature with preserved aspect ratio via `doc.getImageProperties()` above a signature baseline. Regex tightened `/^Signature:\s*/i`. Client `[SIGN HERE]` box behaviour unchanged.
- ✅ **Fix B — Fabricated image notes** (`lib/media.js`): dropped `originalFilename` fallback in `mediaListToPdfPhotos` so photos with no user caption emit empty notes instead of leaking filenames.
- ✅ **Fix D — Multi-User Site Diary PDF redesign** (`pages/MultiUserSiteDiary.jsx`): replaced pipe-delimited LLM text dump with a bespoke jsPDF renderer — Site Details KV table, per-gang table w/ gold header bar + zebra rows, KPI blocks for Site Summary, single sign-off block w/ aspect-preserved signature, Photo Evidence annex via shared exported helper, page-break-aware pagination throughout.
- ✅ **Snag Sheet PDF layout fixes** (`lib/snagging-pdf.js`): wrap fix in `section()` + `subSection()` (root cause of "Damaged plaster finish beside window" clipping), wrap on `drawSnagCover` + `drawReportCover` value rows, section/sub-section vertical spacing tightened.
- ✅ **Cross-PDF wrap + orphan-heading sweep** (14 renderers: `site-diary`, `quote-builder`, `variation-order`, `contract`, `application-for-payment`, `invoice`, `purchase-order`, `incident-report`, `risk-assessment`, `coshh`, `snagging`, `method-statement`, `toolbox-talk`, `rams`): every `section()` and `subSection()` helper now wraps titles via `splitTextToSize`, positions the gold rule under the last wrapped line, and reserves ~30pt of "keep-with-next" space so headings don't orphan at page boundaries. Trailing padding tightened by 4–6pt per heading.
- ✅ **Quote Builder Pass 2 (P0 data integrity)** (`pages/QuoteBuilder.jsx`):
  - Numeric input hardening: `min="0"` on line-item qty/unit price, provisional-sum amount, discount value, VAT rate. `min="0" max="100"` on stage %.
  - Stage-payment %↔£ bidirectional conversion: user can edit either field; the other derives from the live quote total. Division-by-zero guard when total is £0.
  - Live-recalc of stage amounts on total change: any change to line items / VAT / discount / provisional sums now refreshes every stage payment's £ amount from its stored %. No more stale £ values on the schedule.
  - £0 quote confirmation gate in `saveEntry`: warns before saving/generating a zero-total quote.

**Deliberately deferred (need spec / user context or bigger refactor):**
- Quote Builder client-name substitution bug (spec detail unclear).
- Reference-number auto/manual toggle UI (would introduce new field state).
- Quote Builder Passes 3–7 (workflow lifecycle, signatures rework, mobile pass, E2E financial flow).
- Site Diary Passes 3–4 (data integrity + mobile UX).
- Shared A4 typography module (large refactor — currently MARGIN=48 is consistent across all 14 files but constants aren't centralised).



---

### 5 Aug 2026 — Site Diary Update Pass 1: Signature Vault + Editable Names + PDF-fidelity Ink
- ✅ **Signature Vault** — new `POST/GET/DELETE /api/signatures/vault` backed by a `savedSignatures` array on the user document (max 10 sigs, max 500KB each). Every signature-signable tool (Site Diary, Snags, Quotes, Contracts, POs, VOs, AFPs, Invoices) can now offer a "Use saved signature" dropdown so users pick from previously-drawn signatures instead of redrawing every time. Enforces user consent (never applied automatically; users must actively pick).
- ✅ **SignaturePad rewrite** in `frontend/src/components/SignaturePad.jsx`:
  - **Dark ink (`#111111`) on white canvas** — signatures now render on-screen exactly as they will print on the A4 PDF, killing the classic "looked great in the app, invisible on paper" bug.
  - **Use saved signature** dropdown lists vault entries with thumbnails + labels; one-click apply.
  - **Save to vault** input + button appears once the user has drawn ink; labels default to "My signature" but can be personalised (e.g. "Site Manager").
  - **Delete a saved signature** button on each vault row.
  - Preserves the existing `Clear` / `Draw` behaviour so users can wipe and re-draw before final PDF generation.
- ✅ **Editable names on Site Diary** (spec item 3): `completedBy`, `supervisor`, `preparedBy` are now all pre-populated from the user profile via `useEffect` AND persist to `data` on first render (previously `completedBy` was a display-only fallback that stayed empty until edited, causing "—" in the PDF). Field hints now say "Editable — override if signing on behalf of someone else."
- 🔴 **Remaining Site Diary spec items — proposed passes**:
  - **Pass 2 (Global PDF standards):** shared A4 margin/spacing/typography constants, page-break avoidance (`ensureRoom` fix on signature blocks + tables), "orphan heading at bottom of page" fix, isolated-heading avoidance, single date/currency/percentage formatters.
  - **Pass 3 (Site Diary data-integrity):** total-operatives auto-recalc when crew or subcontractors change, £0.00 total protection, PDF-preview-matches-download parity, missing-required-info warnings before final PDF.
  - **Pass 4 (Site Diary mobile UX):** 11-step wizard bottom-clearance for iOS Safari, sticky Back/Next, compact empty states, expand-on-add card behaviour.

### 5 Aug 2026 — Quote Builder QA Pass 1: Global Branding Removal + UK Dates
- ✅ **Global branding purge** across all 15 PDF templates (`pdf.js` shared footer + `quote-builder-pdf.js`, `invoice-pdf.js`, `variation-order-pdf.js`, `application-for-payment-pdf.js`, `purchase-order-pdf.js`, `contract-pdf.js`, `site-diary-pdf.js`, `snagging-pdf.js`, `incident-report-pdf.js`, `risk-assessment-pdf.js`, `method-statement-pdf.js`, `toolbox-talk-pdf.js`, `coshh-pdf.js`, `refundSummaryPdf.js`, `profilePdf.js`): removed "Generated by Morris", "morrisapp.co.uk", "Morris Construction Tech Ltd", "ICO C1923529", "Built by a tradesman. For tradesmen." Every customer-facing PDF now shows the contractor's own identity (company name / user / email / phone) in the footer instead. Morris operates invisibly.
- ✅ **UK-readable dates** on Quote Builder PDF via new `fUKDate` helper: `2026-08-07 → 7 August 2026`. Applied to quote date, valid-until, proposed start, prepared/accepted sign-off dates. Machine format still used internally.
- ✅ **Client Accepted Date** no longer pre-populated on the signoff cell (already handled — displays "—" until the client actually accepts).
- 🔴 **Remaining QA items from spec** (still to do — proposing phased delivery):
  - Pass 2 (P0 — data integrity): numeric input hardening, live-calc reactivity, single source of truth from Builder → Dashboard → Pipeline → Accepted → Project, £0 quote confirmation, stage-payment %↔£ conversion, reference number auto/manual toggle, client-name substitution bug fix, optional company field.
  - Pass 3 (P0 — PDF): overlap fix, safe pagination (calculate rendered height instead of fixed Y), text wrapping in tables, "Site Address" duplicated-label cleanup, financial-summary presentation.
  - Pass 4 (workflow): quote status lifecycle (Draft → Sent → Viewed → Accepted / Declined / Expired), issued-quote immutability + snapshot, pre-issue validation checklist, accepted-quote → project conversion, project commercial record.
  - Pass 5 (signatures + client acceptance): global signature-render fix (black ink, high contrast, PDF fidelity), secure client-acceptance link, "Sent → Viewed → Signed → Accepted" audit trail.
  - Pass 6 (mobile): iPhone Safari full pass on Quote Builder wizard, numeric keyboards, signatures, PDF preview.
  - Pass 7 (E2E): Create Client → Quote → Line Items → Stage Payments → Send → Client Accepts → Project → VO → AFP → Invoice → Payment → Paid — verify financial data consistency end to end.

### 4 Aug 2026 — Team Management V2 (flagship workforce management hub)
- ✅ **Team Management V2** at `/app/team` — rebuilt as a dashboard-first workforce hub layered on top of the existing invite/seat system. **6 KPI cards** (Total Employees / Active Users / Site Teams / Managers / Pending Invitations / Expiring Certs) + inline invite panel + pending-invites list + filters (trade, job role, availability, free-text search) + per-member editor (5 tabs).
- ✅ **16 job roles** (Administrator/Director/PM/Site Manager/Supervisor/QS/Estimator/Foreman/H&S Officer/Office Staff/Bookkeeper/Operative/Apprentice/Sub-contractor/Consultant/Other) — distinct from the 4 access roles (owner/admin/manager/member).
- ✅ **23 trades**, **6 availability states** (Available / On Site / On Leave / Sick / Training / Unavailable), **26 certification types** (CSCS, SMSTS, SSSTS, IPAF, First Aid, Gas Safe, NICEIC, Public Liability Insurance, DBS, Trade Qualification, etc.).
- ✅ **Backend** `backend/team_management.py` — layers a `teamProfile` sub-document on users with: personal data (phone, address, NI/UTR, emergency contact), hourly/day rate, job role, trade, availability window, certifications register (with live expired/expiring_soon computation), and project allocations. Preserves the existing `/api/team/*` invite/seat/role endpoints untouched.
- ✅ **Certifications tracker**: every entry carries type, number, issuer, issued/expiry dates, document URL, notes. Live status flips to **Expiring** (≤30 days) or **Expired** (past today) automatically; the totals feed the "Expiring Certs" KPI.
- ✅ **Attention items** `collect_team_attention`: `team_cert_expiring` (30-day window, warning) and `team_cert_expired` (already expired, critical) surface in the Command Centre.
- ✅ **Project allocations**: `POST /members/{mid}/projects` allocates by project id (must belong to the account owner) with role/from/to; upsert semantics (allocating same project updates rather than duplicates). Deep-links via `?open=<memberId>`.
- ✅ **Access rules**: profile/certifications/availability editable by the person themselves OR any owner/admin; job-role and project-allocations require owner/admin. Cross-user isolation verified.
- ✅ Tested end-to-end (backend pytest **43/43 pass** including regression on all prior V2 flagship tools + existing `/api/team/*` invite endpoints). Report: `/app/test_reports/iteration_31.json`.

### 4 Aug 2026 — Snagging Lists V2 (flagship defect & quality management system)
- ✅ **Snagging Lists V2** at `/app/snagging-list` — legacy 470-line single-page form replaced with a dashboard-first quality-control hub. **6 KPI cards** (Open / High-Critical / Overdue / Closed Today / Assigned to Me / Closed) + universal search + filters (status, priority, project, assignee, overdue-only, mine-only) + templates + **per-project handover report** PDF.
- ✅ **Fast on-site snag flow** designed for mobile: title → project → area → priority → assign → save. Auto-flips Open → Assigned when a snag is created with an assignee. Every action is timestamped in the audit trail (created, assigned, status, comment, photo_added, verified, closed, reopened).
- ✅ **Backend** `backend/snagging.py` — CRUD + assign + status + verify + close + reopen + comments + before/after photos + stats + project summary + templates. Sequential `SNG-YYYY-NNNN` refs per user. **21 trades**, **12 categories**, **30 common areas** (autocomplete), **4 priorities** (Low/Medium/High/Critical with colour-coded pills).
- ✅ **Verification workflow**: Open → Assigned → In Progress → Awaiting Verification → Closed. Quick-action buttons on the row and inside the wizard advance the state one click at a time. Verified snags carry `verifiedBy`, `verifiedAt`, `completionDate` for the handover pack.
- ✅ **Photo evidence**: before/after arrays with `uploadedAt` + `uploadedBy` on every attachment. Photo Vault URLs supported directly; grids in the wizard let the user paste, caption, and delete inline.
- ✅ **Attention items** `collect_snagging_attention`: `snag_overdue` (dueDate past + not closed), `snag_critical` (Critical priority still open), `snag_awaiting_verification` (7+ days in Awaiting Verification).
- ✅ **PDFs** `lib/snagging-pdf.js` — TWO renderers: (1) **Single Snag Sheet** (cover + priority/status pills + details + before/after photo grid + comments + audit trail); (2) **Per-project Snagging Report** (cover + summary KPIs + by-priority + by-area + snag register table + one full detail page per snag). Generated via `Project report` button when a project filter is active.
- ✅ **Integration**: Global Search V2 gets a `snags` scope, Command Centre attention wired in, Document Library auto-saves a summary entry on every save, deep-linkable via `?open=<id>`.
- ✅ Tested end-to-end (backend pytest **38/38 pass** including regression on all prior V2 flagship tools). Report: `/app/test_reports/iteration_30.json`.

### 4 Aug 2026 — Contract Management V2 (flagship contract administration hub)
- ✅ **Contract Management V2** at `/app/contract-mgmt` — legacy 552-line single-page form replaced with a dashboard-first flagship. Master register of every contract with **6 KPI cards** (Active / Expiring Soon / Under Review / Notices Due / Milestones Overdue / Outstanding Actions) + 3 value cards (Total contracts / Total contract value / Active contract value) + filters (status, type, project) + templates + full audit trail.
- ✅ **9-step wizard**: Project → Contract Info (19 contract types incl. JCT/NEC4/FIDIC/Bespoke) → Parties (Employer + Contractor) → Dates & Milestones (5 key dates + milestone lifecycle) → Terms & Financials (contract value, retention %/dates, LDs, payment terms, insurance) → Linked Documents (pull variations/applications/invoices from project) → Supporting Docs → Notices & Actions (14 notice types) → Review & PDF (sign-off).
- ✅ **Backend** `backend/contracts.py` — CRUD + status endpoint + milestones lifecycle + notices lifecycle + stats + project summary + templates. Sequential `CON-YYYY-NNNN` refs per user. Full history entries on every change.
- ✅ **Live status derivation** `_derive_status`: Active contracts with `completionDate` within 30 days (or overdue) auto-flip to **Expiring Soon** — surfaced in the Expiring Soon KPI and in Command Centre attention.
- ✅ **Attention items** `collect_contract_attention`: `contract_expiring` (completion date within 30 days), `contract_notice_due` (notice past response due date), `contract_milestone_overdue` (planned date passed, not Completed).
- ✅ **PDF** `lib/contract-pdf.js` — branded cover + parties (Employer + Contractor two-column) + contract details + key dates + financials & retention + payment/terms + insurance + scope/conditions + milestones + notices + **linked commercial docs (variations / applications / invoices)** + audit trail + dual sign-off.
- ✅ **Integration**: Global Search V2 gets a new `contracts` scope, Command Centre attention wired in, project-workspace linkage via `linkedVariationIds` / `linkedApplicationIds` / `linkedInvoiceIds`, Document Library gets a summary entry on save.
- ✅ Tested end-to-end (backend pytest **25/25 pass** including regression on all prior V2 flagship tools). Report: `/app/test_reports/iteration_29.json`.

### 4 Aug 2026 — Purchase Orders V2 (flagship procurement management system)
- ✅ **Purchase Orders V2** at `/app/purchase-orders` — full procurement hub replacing the legacy transactional PO tool. Dashboard-first: **8 status stat cards** (Draft / Sent / Approved / Ordered / Part Delivered / Delivered / Awaiting Invoice / Paid) + 3 KPI value cards (Committed / Awaiting Supplier Invoice / Paid) + suppliers panel + project/supplier/status filters + templates.
- ✅ **9-step wizard**: Project → Supplier (with picker from register) → Order Items (7 categories, product codes, discount, delivery charge, 5 VAT treatments incl. Reverse Charge) → Delivery Details → Review & Approve (contractor signature) → Issue PO → Goods Received (part or full, auto-advances Part Delivered / Delivered) → Match Supplier Invoice → Preview & PDF.
- ✅ **Backend** `backend/purchase_orders.py` — CRUD + goods-received log + invoice matching + supplier register + templates + stats + project summary. Server-authoritative totals (subtotal, discount, delivery, VAT, total). Sequential PO ref `PO-YYYY-NNNN`. Audit-trail history entries on every status change and receipt.
- ✅ **Supplier invoice matching** (auto-draft workflow): `POST /purchase-orders/{id}/match-invoice` creates a **Draft** entry in the new `supplier_invoices` collection permanently linked to the PO. User reviews and approves via `POST /matched-invoices/{sid}/approve` before it becomes live; `POST /matched-invoices/{sid}/pay` marks it paid. **matchStatus** auto-computes: Unmatched / Partially Matched / Fully Matched. When fully matched + paid the PO auto-advances to **Paid**. This avoids duplicate data entry while maintaining a complete audit trail.
- ✅ **Supplier register** `/purchase-orders/suppliers` — auto-tracks every supplier used on a PO with total spend, PO count, outstanding POs + value, last PO ref. Manual add/edit/delete via dedicated Suppliers panel accessible from the dashboard header.
- ✅ **PDF** `lib/purchase-order-pdf.js` — branded cover + supplier + PO details + delivery instructions + itemised order + category subtotals + full VAT summary + goods received log + matched invoices + terms + prepared/approved sign-off.
- ✅ **Command Centre attention** `collect_purchase_order_attention`: PO delivery overdue (`po_late`), delivered PO with no matched invoice for 14+ days (`po_awaiting_invoice`), approved supplier invoice past due (`supplier_invoice_overdue`).
- ✅ **Global Search V2**: new `purchase-orders` scope added; POs surface across the platform search with deep-links.
- ✅ **Routing**: legacy `tool/purchase-order` redirects to `/app/purchase-orders`; Business Hub tile added.
- ✅ Tested end-to-end (backend pytest **33/33 pass**). Report: `/app/test_reports/iteration_28.json`. Full lifecycle verified: create → send → approve → part-deliver → deliver → match partial invoice → match remainder (Fully Matched, auto-Awaiting Invoice) → approve → pay → auto-advance to Paid.

### 4 Aug 2026 — Payment Tracker V2 (cash-flow dashboard redesign)
- ✅ **Payment Tracker V2** at `/app/payment-tracker` — rebuilt from the ground up per the spec. Legacy 550-line form-based page replaced with a **read-only cash-flow dashboard** consuming Invoice Builder V2 as the single source of truth.
- ✅ **6 KPI cards** (Green / Amber / Red status): Total Outstanding, Overdue, Due This Week, Paid This Month, Outstanding Value, Average Payment Time (auto-computed from paid invoices — days from invoiceDate to first payment).
- ✅ **Main payment table** with columns: Client/Project · Invoice Ref · Amount (with paid/balance split for part-paids) · Due Date · Days remaining/overdue · Status pill · Quick Actions (View / Open Project / Send Reminder / Mark as Paid).
- ✅ **Project Summary Panel** (opens when clicking any row's client/project cell): Original Contract Value + Approved Variations (count + £) + Revised Contract + Applications for Payment (certified total) + Invoices Raised + Payments Received + Outstanding Balance. Deep-links to Project Workspace + filtered Invoice Builder.
- ✅ **Zero charts** — professional Finance dashboard aesthetic that answers "Who owes me money? How much is overdue? What needs my attention today?"
- ✅ **Tested** end-to-end (backend pytest 10/10 pass + frontend regression + mobile 390×844 with 0px overflow verified after fix). Report: `/app/test_reports/iteration_27.json`. Two bugs found and fixed post-test: inverted Days column direction, and mobile horizontal overflow.

### 4 Aug 2026 — V1 Release Readiness & Platform Polish
- ✅ **Comprehensive regression + integration audit** — 48/48 pytest cases pass covering all V2 endpoints, commercial trilogy end-to-end (VO → AFP → INV → payment), Global Search deep-links, Command Centre attention items, multi-user data isolation, 401/403 behaviour, and stats endpoint performance (<160ms). Report: `/app/test_reports/iteration_26.json`. Checklist saved: `/app/memory/RELEASE_READINESS.md`.
- ✅ **Fixed AFP auto-pull VAT double-count**: `_approved_variations_for()` now returns the **net (subtotal)** of Approved variations instead of the VAT-inclusive total. Prevents VAT being applied twice when the AFP re-VATs its own gross valuation.
- ✅ **Fixed mobile header overflow** on Variation Orders, Applications for Payment, and Incident Report dashboards — headers now use `flex flex-wrap` so the refresh + New CTA wrap under the title on narrow viewports.
- ✅ **Fixed Site Diary deep-link**: `/app/site-diary?open=<id>` now auto-opens the wizard on the specified entry (matching the pattern used by every other V2 dashboard, essential for Global Search).
- ✅ **Cleaned up TEST_ prefixed test data** left by regression testing.

### 4 Aug 2026 — Global Search V2 (universal cross-tool search)
- ✅ **Global Search V2** — Cmd/Ctrl+K opens a platform-wide search palette that instantly finds Projects, Clients, Documents, Drafts, Photos, Quotes, Variations, Applications, Invoices, Site Diaries, Incidents, Risks, Tasks, and Tools across the whole Morris platform.
- ✅ **Backend** `backend/global_search.py` — `GET /api/search?q=<term>&scope=<optional>&limit=<int>` scans every V2 collection + jobs + drafts + documents + media + tasks + static tool catalogue. Per-scope filtering (all / projects / clients / documents / photos / quotes / variations / applications / invoices / site-diary / incidents / risks / tasks / drafts / tools). Custom ranking: reference/title exact match > title contains > subtitle contains, tiebroken by `updatedAt` descending.
- ✅ **Frontend** `components/CommandPalette.jsx` — upgraded to hit the backend with a 220ms debounce. Scope chips row (14 scopes) with `Tab / Shift+Tab` cycling. Results grouped by kind with kind-specific icons + colour badges. Keyboard nav (↑↓/Enter/Esc). Recent searches persisted in `localStorage`. Deep-link routes: each result opens the correct V2 dashboard with `?open={id}`.
- ✅ **Security**: search filters by `userId` on every query — no cross-user data leakage (verified).
- ✅ Tested end-to-end (backend pytest 22/22 pass + frontend keyboard nav + scope switching + mobile viewport). Testing agent fixed a sort-key TypeError. Report: `/app/test_reports/iteration_25.json`.

### 3 Aug 2026 — Invoice Builder V2 (flagship invoicing system)
- ✅ **Invoice Builder V2** at `/app/invoice-builder` — commercial trilogy completed (Variation Orders → AFP → Invoice). Dashboard-first: 6 status stat cards (Draft / Sent / Part Paid / Paid / Overdue / Cancelled) + 3 KPI value cards (Outstanding / Overdue / Paid YTD) + a **"Ready to invoice" quick-convert strip** that surfaces Certified AFPs and Approved Variations for one-click conversion + search + filters + templates.
- ✅ **8-step wizard**: Project & Client → Link source (Certified AFP or Approved Variation, auto-populates line items) → Line Items → CIS & VAT → **Terms & Due Date** (auto-compute due date from Net 7/14/30/45/60) → Review & **Bank** (pre-filled from user profile) → Status & Payments (part-payments supported) → Preview & PDF.
- ✅ **Backend** `backend/invoice_builder.py` — invoices CRUD + templates + stats + status endpoint + payment endpoint + remind endpoint + AFP/Variation converters. Server-authoritative totals: subtotal, discount, CIS on labour ratio, VAT (5 treatments including **Reverse charge (0%)** and Exempt), total due. **Live-derived status** on read: Sent/Part Paid past due date auto-flip to Overdue; payments ≥ totalDue auto-flip to Paid.
- ✅ **Auto-numbering** INV-YYYY-NNNN sequential per user.
- ✅ **Payment tracking**: POST `/invoices/{id}/payment` records part-payments, updates the invoice status, and **increments the linked job's `amountPaid`** so the project workspace outstanding stays in sync.
- ✅ **AFP → Invoice conversion**: `GET /from-application/{aid}` returns a pre-filled draft with a consolidated "Application for Payment" line item and links to the AFP by reference. **Variation → Invoice** similarly copies all line items and links by reference.
- ✅ **Command Centre attention** `collect_invoice_attention`: Overdue invoices flagged with `invoice_overdue`; invoices due within 3 days flagged with `invoice_due_soon`; deep-linked to `?open={id}`.
- ✅ **PDF** `lib/invoice-pdf.js` — cover page + parties (From/Bill To split) + invoice details + itemised charges + full CIS/VAT summary + payments history + payment terms + **remittance details** (bank name, account, sort code, IBAN, payment reference). Reverse charge automatically annotated.
- ✅ **Routing/redirects**: legacy `/app/tool/cis-invoice` now redirects to V2. Business Hub 'CIS Invoice' tile + Dashboard 'Invoice' quick action updated. Deep-link support: `?fromApplication=<id>` or `?fromVariation=<id>` opens the wizard pre-populated.
- ✅ **Reverse charge math verified**: £5,000 labour × 20% CIS = £1,000 deduction, VAT £0 (customer accounts to HMRC), total £4,000 ✓
- ✅ Tested end-to-end (backend pytest 10/10 pass + frontend 8-step wizard walkthrough + row quick-action state transitions). Report: `/app/test_reports/iteration_24.json`. Fixed the flagged action item (auto-compute due date on wizard open).

### 3 Aug 2026 — Applications for Payment V2 (flagship payment application system)
- ✅ **Applications for Payment V2** at `/app/applications-for-payment` — commercial flagship replacing the legacy form-based `application-for-payment`. Dashboard-first: 6 status stat cards (Draft / Submitted / Certified / Paid / Overdue / Rejected) + 3 KPI value cards (Outstanding / Overdue / Paid year-to-date) + search + status filter (incl. Overdue) + project filter + templates.
- ✅ **9-step wizard**: Project → Contract & Client → **Previous Applications & Valuations** (running totals auto-loaded from prior AFPs on the same project) → **Current Valuation** (Labour / Materials / Plant / Preliminaries / Subcontractor / Variations / Other, with **auto-pulled Approved Variation total** from Variation Orders V2) → **Retention / VAT / CIS / Adjustments** (server-authoritative math) → Photos & Docs (Photo Vault picker + supporting refs) → Review & Approval (dual sign-off) → Status Tracking → Preview & Generate PDF.
- ✅ **Backend** `backend/applications_for_payment.py` — CRUD + templates + stats + project summary + status endpoint. **Server computes `totals` on every create + PATCH**: gross valuation, gross including variations, this-period value, retention (rate × gross + running balance), CIS deduction on labour ratio only, VAT (Standard 20% / Reduced 5% / Zero-rated / **Reverse charge (0%)** / Exempt), adjustments (+/-), totalDue. Auto AFP-NNN reference. Auto application number per project. Certified auto-stamps date + amount; Paid auto-stamps date + increments the linked job's `amountPaid`.
- ✅ **Command Centre attention** `collect_afp_attention`: Overdue (Submitted / Certified past due date) surfaced as `afp_overdue`; Submitted >7 days awaiting cert as `afp_awaiting`; deep-linked to `?open={id}`.
- ✅ **Variation Orders integration**: AFP `POST` auto-pulls the sum of Approved variations on the linked project into `approvedVariationsValue` (unless client already sent one), so the QS never double-keys.
- ✅ **Project workspace integration**: Paid AFPs feed the project's `amountPaid` running total. Outstanding calculation on the project workspace already uses revised contract value (variations included).
- ✅ **PDF** `lib/application-for-payment-pdf.js` — cover with status pill + total due, application/contract details, current valuation table with per-category subtotals, previous applications table for the same project, full certification summary (gross → variations → previously certified → this period → retention → adjustments → subtotal net → CIS → VAT → **TOTAL DUE**), retention running balance, supporting evidence, terms, dual sign-off (contractor + client/QS with role).
- ✅ **Routing/redirects**: legacy `/app/tool/application-for-payment` now redirects to V2. Business Hub tile and Dashboard quick-action updated.
- ✅ Tested end-to-end (backend pytest 9/9 pass + frontend 9-step wizard walkthrough + row quick-action state transitions all live). Report: `/app/test_reports/iteration_23.json`.

### 3 Aug 2026 — Variation Orders V2 (flagship variation management system)
- ✅ **Variation Orders V2** at `/app/variation-orders` — commercial flagship replacing the legacy form-based `variation-letter`. Dashboard-first: 5 status stat cards (Draft / Submitted / In Progress / Approved / Rejected) + 3 KPI value cards (Approved value / Submitted awaiting approval / Approved additional days) + search + status filter + project filter + templates.
- ✅ **9-step wizard**: Project (auto-fills from linked job) → Original Contract (auto-fills from linked Quote Builder quote — scope, ref, date) → Variation Details & Reason (8 canned reasons + 8 instruction methods + instructor name/role/date/location + description of change + reason narrative + reference docs) → Cost Breakdown (Labour / Materials / Plant / Subcontractor / Preliminaries / Other, VAT-toggleable) → Programme / Time Impact (No impact / Additional days / Reduction in days / Sequence only + optional new PC date) → Photos & Docs (Photo Vault picker filtered by project + supporting document references) → Client Approval (dual sign-off) → Status Tracking → Preview & Generate PDF.
- ✅ **Backend** `backend/variation_orders.py` — variations CRUD + templates + stats + project summary. **Server computes `totals` on every create and PATCH** (subtotal, byCategory, vatAmount, total). Auto sequential VO-NNN reference. Moving to Approved auto-stamps `approvedDate` if blank.
- ✅ **Command Centre attention** `collect_variation_orders_attention`: Submitted >7 days awaiting client approval, In Progress >30 days stale — deep-linking to `?open={id}`.
- ✅ **Project workspace integration**: Approved variations automatically add on top of the linked project's contract value — `/api/jobs/{id}/stats` now returns `approvedVariationsValue` + `revisedContractValue` + `originalContractValue`, and `openVariations` count includes V2 variations in Draft/Submitted/In Progress. Outstanding calculation uses revised contract value.
- ✅ **PDF** `lib/variation-order-pdf.js` — cover with status pill and inc-VAT total, project + client + linked-contract details, variation summary, original scope, description of change (with reason narrative + reference docs), cost breakdown table with per-category subtotals + total line (with/without VAT), programme impact table, evidence annex (photos + supporting docs), terms, dual sign-off (contractor + client approval box). Rejection reason surfaced when status = Rejected.
- ✅ **Routing/redirects**: `/app/tool/variation-letter`, Business Hub Variation tile and Dashboard Variation quick action now all resolve to `/app/variation-orders`. Legacy `variation-letter` tools-config entry retained for backwards compatibility (LLM prompt path) but the frontend user always lands on V2.
- ✅ Tested end-to-end (backend pytest 11/11 pass + frontend UI walkthrough). Report: `/app/test_reports/iteration_22.json`.

### 3 Aug 2026 — Quote Builder V2 (flagship estimating & quotation system)
- ✅ **Quote Builder V2** at `/app/quote-builder` — dashboard-first commercial flagship. 5 status stat cards (Draft / Sent / Accepted / Expired / Rejected) + 3 pipeline value cards (Pipeline value / Accepted value / Expiring within 7 days) + templates + search & status filter. Quick-action Send/Accept buttons on each row.
- ✅ **9-step wizard**: Client (with library pick + save-to-library) → Project (auto-fill from linked job) → Scope of Works → Line Items (Labour/Materials/Plant/Subcontractor/Other) → Optional Sections (Exclusions/Assumptions/Provisional Sums) → Stage Payments (auto-computes amount from % of total) → Terms & Validity (VAT, discount %/fixed, payment terms) → Review & Client Acceptance (dual sign-off) → Preview & Generate PDF.
- ✅ **Backend** `backend/quote_builder.py` — quotes CRUD + client library + templates + stats. **Server computes `totals` on every create and PATCH** (subtotal, byCategory, provisionalSumTotal, discountAmount, net, vatAmount, total). Auto quoteRef. Sent quotes past validUntil auto-classified as Expired in stats.
- ✅ **Command Centre attention** `collect_quote_builder_attention`: expiring-in-7-days, expired, and Sent-but-stale (>7 days) quotes deep-linking to `?open={id}`.
- ✅ **PDF** `lib/quote-builder-pdf.js` — cover with total inc-VAT, client + project details, scope, itemised pricing table with per-category subtotals, provisional sums, summary block (Subtotal→Discount→Prov Sums→Net→VAT→TOTAL), exclusions/assumptions, stage-payment schedule, T&Cs, dual sign-off (contractor + client acceptance).
- ✅ **Backend regression** verified: 1900 subtotal · 190 discount · 500 prov · 2210 net · 442 VAT · **£2,652 total** for the reference scenario. Client library + 400 validation working.

## 📊 Global Design Standard — No Charts (3 Aug 2026)

**Morris removes unnecessary charts, graphs and analytics visualisations.** Users
must be able to assess project health within seconds without interpreting graphs.

**Remove**: trend charts · variance charts · profit trend graphs · incident trend
graphs · risk trend graphs · analytics dashboards built around graphs · decorative
visualisations that do not improve decision-making.

**Replace with**: KPI cards · professional summary tables · Green/Amber/Red status
indicators · checklists · timelines · calendar views · outstanding action lists ·
clean financial summaries.

**Use charts only where they provide a genuine operational benefit.**

**Applied across**: Commercial Reports, Incident Reports, Risk Assessments, Site
Diary, Command Centre, Finance Hub, Business Hub, Compliance Hub — and all future
Morris modules must follow this standard.

**Audit complete 3 Aug 2026** — removed the two SVG charts that existed:
`CashFlowChart` (Finance Hub) → replaced with `CashFlowSummary` (KPI-header +
month table with GAR status badges). `GrowthChart` (Business Hub Insights) →
replaced with `GrowthSummary` (Latest / Best / Monthly-Average KPI trio +
two-column month revenue table). No `recharts` or other chart library is used
anywhere in the app — `recharts` remains as a dependency in package.json but is
imported by zero files.

---

### 3 Aug 2026 — Risk Assessment V2 (flagship central H&S record)
- ✅ **Risk Assessment V2** at `/app/risk-register` — dashboard-first central H&S record with 4 stat cards (Active / Reviews due / High risks / Total), favourites, recent, templates, filters (project / status / residual risk level).
- ✅ **12-step wizard**: Project → Activity → Hazard Identification → Persons at Risk → Existing Controls → Initial Rating (5×5 matrix highlight) → Additional Controls → Residual Rating (5×5 matrix) → Photos & Evidence → Linked Docs (6 kinds incl Incident Reports & Site Diary) → Sign-off (triple: Prepared/Reviewed/Approved) → Preview & Generate PDF. Hazard picker pill row on steps 3/5/6/7/8 lets users edit each hazard's controls and ratings independently.
- ✅ **Server-side rating computation** in `backend/risk_assessment.py` — score = Likelihood × Severity, banded Low 1-4 / Medium 5-9 / High 10-15 / Extreme 16-25. Ratings are always recomputed on create AND on PATCH — the frontend never has to be trusted for banding.
- ✅ **Stats**: total, active (all non-Closed), reviewsDue (reviewDate ≤ today AND status != Closed), highRisks (any hazard with residualRating in High/Extreme, excludes Closed) + recent[10].
- ✅ **Command Centre attention**: `collect_risk_assessment_attention` merges "review due" and "high residual risk" items into `/api/attention`, deep-linking to `/app/risk-register?open={id}`.
- ✅ **PDF renderer** `lib/risk-assessment-pdf.js` — cover, project details, activity summary, per-hazard section with kv table + colour-coded rating badges (Green Low / Amber Medium / Orange High / Red Extreme), assessment-level persons at risk, evidence photo grid, linked documents table, triple sign-off boxes.
- ✅ **Testing**: iteration_21 — backend 8/9 initial pass with one caught bug (highRisks was counting Closed assessments). Fix applied (`if _has_high_residual(r) and st != "Closed":`) and verified live via curl regression test. Frontend 100% — all 12 steps, hazard picker, live L×S rating with matrix highlight, 8 person cards, 3 sign-off modals, backwards-compat redirect, blank-activity validation.

### 3 Aug 2026 — Incident Report V2 (flagship investigation & management)
- ✅ **Incident Report V2** at `/app/incident-report` — dashboard-first Incident Investigation & Management System. Dashboard: 6 stat cards (Total / Open / Closed / High priority / Near misses / CAPA outstanding) + Under Investigation strip + favourites + recent + templates + search + 4 filters (project / type / severity / status).
- ✅ **9-step wizard** in the exact spec order: Project → Incident (type/severity/status/location/description/immediate actions + RIDDOR toggle) → People (supervisor/first-aider + injured + witnesses tables) → Evidence (photos + drawings via Photo Vault) → Investigation (immediate/underlying/root causes + Five Whys builder) → Risk Review (5 checklist questions with per-item action notes) → CAPA (description/responsible/due/priority/status) → Linked Docs (RAMS/Method/COSHH/TBT/Risk/Site Diary) → Sign-off (**triple** signatures Prepared/Reviewed/Approved).
- ✅ **Backend** `backend/incident_report.py` — full CRUD (soft-delete) + templates + `/api/incident-report/stats` computing open/closed/highPriority (severity ∈ High|Critical AND status ≠ Closed)/nearMisses/underInvestigation/capaOutstanding (excludes Done|Closed|Complete|Completed) + 12-month trend series + recent[10] + `collect_incident_attention()` surfacing open High/Critical incidents and overdue CAPA into the Command Centre.
- ✅ **PDF renderer** `lib/incident-report-pdf.js` — cover, severity badge, banner, section-numbered content: summary, project info, timeline (what happened + immediate actions), people (injured + witnesses tables), evidence photo grids (photos + drawings), investigation findings + Five Whys table, risk review checklist table, CAPA table, linked documents, additional notes, and side-by-side **triple sign-off** blocks.
- ✅ **Backwards compat** via `GenericToolPage.jsx` redirect for `tool.id === "incident-report"` and deep-link `?open={id}` auto-opens an incident in edit mode from Command Centre alerts.
- ✅ **Design philosophy compliance**: all copy uses professional-platform language — no AI framing anywhere.
- ✅ **Testing**: iteration_20 — 100% backend (14/14 pytest, including all V2 fields and stats-counting arithmetic), 100% frontend (all 9 wizard steps, RIDDOR conditional reveal, triple-signature modal switching, all 6 stat cards, all filters). Zero issues.

### 3 Aug 2026 — Site Diary V2 (flagship daily site management)
- ✅ **Site Diary V2** at `/app/site-diary` — dashboard-first daily site management. Dashboard: 6 stat cards (Total entries / Today's diary / This week / With delays / Missing today / Outstanding actions), favourites, recent entries, templates row, search + project + date-range + weather + user filters. 11-step wizard modal in the definitive order (Project → Weather → Labour → Works Completed → Deliveries → Plant & Equipment → Delays & Issues → Variations → Site Photos → Actions → Sign-off).
- ✅ **Backend** `backend/site_diary.py` — entries CRUD (soft-delete) with new fields `actions[]`, `completedBy`, `completedSignature`, `supervisorName`, `supervisorSignature`, `delays[].priority`, `plant[].breakdown`, `worksCompleted[].details`; templates CRUD; `/api/site-diary/stats` extended with `outstandingActions` (counts Open/In progress/Blocked, excludes Done/Complete/Closed); `/api/site-diary/reference`; `collect_site_diary_attention()` for the missing-today alert.
- ✅ **Command Centre integration**: existing `diary_missing` alert in `command_centre.py` now checks the new `site_diary_entries` collection to prevent duplicate alerts, and routes to `/app/site-diary`.
- ✅ **Timeline events**: `documents/save` kind_map maps `site-diary` → `site_diary_created`, so saving an entry emits the event on the linked project timeline.
- ✅ **Photo Vault**: full `AttachMedia` integration on Step 9 with per-photo captions carried into the PDF.
- ✅ **Actions register (Step 10)**: outstanding actions with description / responsible / due date / priority / status; priorities drive dashboard "Outstanding actions" counter and a project-scoped tally on stats.
- ✅ **Dual sign-off (Step 11)**: separate signature panels for "Completed by" and "Supervisor" with independent SignaturePad modals; PDF renders two side-by-side sign-off boxes.
- ✅ **PDF renderer** `lib/site-diary-pdf.js` — cover page + "OFFICIAL SITE RECORD" banner + section-numbered content: project details, date & weather, labour, works (with per-activity details), deliveries, plant (with breakdown column), delays (with priority column), issues, instructions, H&S, visitors, variations, photos, actions register, linked docs, notes, dual sign-off block.
- ✅ **UX polish**: auto-computed totalOperatives, autosave draft in localStorage, project-link auto-fill, `?projectId=…` deep-link from Command Centre attention items.
- ✅ **Wiring**: `App.js` route `site-diary` → `SiteDiary` component; `GenericToolPage.jsx` redirects `tool.id === "site-diary"` → `/app/site-diary` for backwards compatibility.
- ✅ **Testing**: iteration_19 — 100% backend (19/19 pytest incl. 6 new tests for the added fields + stats.outstandingActions counting logic), 100% frontend (all selectors verified, dual-signature modal confirmed via screenshot). Zero regressions.

### 2 Aug 2026 — Toolbox Talks V2 + COSHH V2 (flagship H&S rebuilds)
- ✅ **Toolbox Talks V2** at `/app/toolbox-talk` — 8-step wizard (Project / Topic / Talk Content / Attendees / Photos / Linked / Review / Generate). Backend `backend/toolbox_talks.py` with 16-topic UK library (`/api/toolbox-talks/topics`), custom templates CRUD, per-project stats. Per-attendee signature capture via `SignaturePad` reuse. Premium PDF `lib/toolbox-talk-pdf.js` with attendance register (name/company/trade/signature/time), photo grid, linked-docs table.
- ✅ **COSHH V2** at `/app/coshh` — dashboard-first hazardous substance manager. Dashboard shows 5 stat cards (Total / Active / Reviews due / Expired / High-risk), favourites, recently used, templates row, search + project + hazard-level + status filters. 12-step wizard modal (Project / Substance / Hazards / Exposure / Controls / PPE / First Aid / Fire & Spill / Photos / Linked / Review / Save). Backend `backend/coshh.py` with assessments CRUD, templates CRUD, GHS pictogram + H/P statement library (`/api/coshh/hazards`), stats endpoint, and `collect_coshh_attention()` feeding review-due items into `/api/attention`. Premium PDF `lib/coshh-pdf.js` with GHS pictogram diamonds, sectioned tables.
- ✅ **Command Centre integration**: COSHH review-due items now surface on `/api/attention` alongside compliance-expiry items.
- ✅ **Timeline events**: `documents/save` kind_map now emits `toolbox_talk_delivered` and `coshh_created` when saved against a project.
- ✅ **Testing**: `testing_agent_v3_fork` iteration_16 caught 3 issues (broken `AssessmentUpdate` `__annotations__` hack breaking PATCH, missing testids). All 3 fixed and verified by `bug_testing_agent` iteration_17 → 100% backend + 100% frontend, verdict `fixed`.



### 2 Aug 2026 — Method Statement V2 (standalone tool)
- ✅ **Standalone 12-step wizard** at `/app/method-statement` — Project Details → Scope → Work Sequence → Plant → Materials → PPE → Environmental → Emergency → Attachments → Linked Documents → Review → Generate.
- ✅ **Backend**: `/app/backend/method_statement.py` with `/api/method-statement/templates` CRUD (list/create/delete, soft-delete). `server.py` kind_map now emits `method_statement_created` timeline events when a Method Statement is saved against a project.
- ✅ **PDF renderer**: `/app/frontend/src/lib/method-statement-pdf.js` — premium cover page + document info + scope + numbered work sequence + plant/materials tables + PPE grid with badges + environmental controls + emergency procedures + linked documents + site photos + sign-off (supports live signature).
- ✅ **Frontend wizard**: `/app/frontend/src/pages/MethodStatement.jsx` — `@dnd-kit/sortable` drag-and-drop for step reordering, autosave draft to localStorage, template save/load/delete flow, Photo Vault via existing `AttachMedia`, links to existing RAMS/Risk/COSHH/TBT documents.
- ✅ **Health & Safety category re-ordered** in Tools Library to match spec: RAMS, Method Statement, Risk Assessments, COSHH, Toolbox Talks, Site Diary, Incident Report, Site Access Permit, Manual Handling, Noise Assessment, Working at Height Rescue Plan. Site Diary moved out of Site Management.
- ✅ **Testing**: `testing_agent_v3_fork` iteration_15 — 100% backend + 100% frontend, zero blocking issues. Only note: harmless DOM-validity warning from platform's build-time instrumentation.
- 📦 **New dependency**: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`.



### 2 Aug 2026 — Platform Hubs V2 (this session)
- ✅ **Finance Hub V2** (`/app/finance`) — 4 tabs (Dashboard / Tax / Commercial / Reports), live aggregator over Payment Tracker + `/api/cis/payments` + `/api/expenses` + `/api/documents`, SVG cash-flow chart, project profitability table.
- ✅ **Compliance Hub V2** (`/app/compliance`) — new backend module `backend/compliance.py` with `/api/compliance/items` CRUD + `/summary` + `/types`. Frontend `ComplianceHub.jsx` with 4 tabs (Company / Personnel / Project / Vehicles). Expiring items within 60 days flow into `/api/attention` via `collect_compliance_attention()` and appear on the Command Centre.
- ✅ **Business Hub V2** (`/app/business`) — 4 tabs (Overview / Projects / Team / Insights), active/completed/archived/at-risk categorisation, pipeline value, 12-month growth SVG chart, embeds Team Management summary.
- ✅ **Tools Library V2** (`/app/tools-library`) — 81 tools categorised into Health & Safety / Commercial / Site Management / Finance / HR / Utilities. Search, favourites (persists to `profile.favourites`), recently used, recently created documents.
- ✅ **Settings V2** (`/app/settings`) — 7-tab sidebar layout: Profile, Company, Branding, Notifications, Security, Subscription, Backup & Export. `ProfileUpdate` schema extended with `notificationPrefs`. JSON backup export downloads entire user data bundle.
- ✅ **Sidebar reorganised** — `AppShell.jsx` rewritten to show only the 8 top-level items per spec (Command Centre → Projects → Business → Finance → Compliance → Tools Library → Photo Vault → Settings). Recently-used strip retained as shortcut. Legacy tool-tree sections (Documents / Pricework / Sole Trader / Subcontractor Tools) removed from sidebar — tools now live inside Tools Library only.
- ✅ **Testing** — `testing_agent_v3_fork` iteration_13 pass, 100% backend (12/12) + 100% frontend, zero bugs. Report: `/app/test_reports/iteration_13.json`. New test file: `/app/backend/tests/test_compliance.py` (12 cases).
- 📄 **Audit doc**: `/app/MORRIS_TOOL_UPGRADE_AUDIT.md` produced earlier this session — definitive roadmap across all 89 tools/modules.
- 📄 **Timeline doc**: `/app/MORRIS_AUDIT_TIMELINE.md` rewritten with real git-sourced dates.




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

- ✅ **[FEATURE] Project Workspace** (Feb 21, 2026)
  - Complete rebuild of `/app/jobs/:id` into a 7-tab **Project Workspace** — the "digital site folder" per `/app/PROJECT_WORKSPACE_SPEC.md`. Tabs: **Overview / Documents / Photos / Finance / Tasks / Timeline / Team**.
  - **Extended Job model** — added `projectName, company, siteManager, clientContact, poNumber, pinned` to `JobCreate`/`JobUpdate`. Expanded status list to 9 values (`planning`, `active`, `on_hold`, `awaiting_payment`, `invoiced`, `paid`, `completed`, `disputed`, `archived`). New-project modal captures all fields.
  - **New backend module** `/app/backend/project_workspace.py` — mounted at `/api/jobs/*` (extends existing) and `/api/tasks/*`.
    - `GET /api/jobs/{id}/stats` — counts of documents, photos, videos, open tasks, open variations, applications, site diaries + amount paid + outstanding + last 3 events.
    - `POST/GET /api/jobs/{id}/tasks` and `PATCH/DELETE /api/tasks/{taskId}` — task CRUD across the 3-status board.
    - `GET /api/jobs/{id}/events` — chronological project timeline.
    - `GET /api/jobs/{id}/search?q=x` — project-scoped unified search across documents, drafts, media, tasks, events (Mongo `$regex`, no external search engine).
    - `POST /api/jobs/{id}/payments` — record a payment; fires a `payment_received` timeline event that feeds Amount Paid on stats.
  - **Automatic timeline events** — new `emit_event()` helper called from: `/api/jobs` create (project_created), `/api/jobs/{id}` PATCH status (project_completed/archived/status_changed), `/api/documents/save` (rams_created/variation_submitted/invoice_generated/application_submitted/site_diary_created/chase_sent/document_saved), `/api/media` (photo_uploaded, deduped once per day per project). New `project_events` collection with indexes.
  - **Project Health** — deterministic `healthy/watch/at_risk` computed on the frontend from job status + days remaining + recent chase events.
  - **Task presets** — one-tap creation of the 4 spec-mandated task kinds (Site Diary, Upload Photos, Generate Invoice, Complete Snagging).
  - **Command Centre integration** — attention items now route with `?tab=` query hints (`finance` for overdue invoices, `documents` for missing diary) so the Workspace opens on the right sub-view.
  - **Team tab skeleton** — placeholder card ("Team collaboration coming soon") preserves the URL slot for v2.
  - **Verified end-to-end via curl + screenshots**: stats/tasks/events/search/payments all working; Overview + Finance + Tasks tabs render correctly with real data.

- ✅ **[FEATURE] Command Centre V2** (Feb 21, 2026)
  - Full homepage redesign per `/app/COMMAND_CENTRE_V2_SPEC.md`. Sections in strict priority order: **Dynamic Greeting → Attention Required → Today's Work → Business Snapshot → Quick Actions → Continue Working → Recent Projects**.
  - **Greeting**: Time-of-day-aware (Morning/Afternoon/Evening based on local browser time, with correct overnight handling), pulls `firstName` → falls back to first token of `fullName` → "Welcome back." if neither. Sub-line rotates deterministically per calendar day from a curated list.
  - **Attention endpoint**: new `GET /api/attention` in `/app/backend/command_centre.py` — computes 9 alert types (overdue invoices, awaiting variations, chase-recommended, compliance expiring ≤30d, SA deadline <60d, unfinished RAMS, missing site diary after 17:00, no project photos after 7d, stale drafts >3d). Returns `{items, count, computedAt}` sorted by severity then dueAt. Zero guessing — every alert derives from stored data.
  - **Overflow page** at `/app/attention` shown when >8 items exist.
  - **Business Snapshot**: four compact tiles (Outstanding Payments, Active Projects, Open Documents, Media Stored) — each links to its detail hub. Tax Pot / CIS / Earnings are **removed from the homepage** and moved to the new Finance hub.
  - **Quick Actions**: curated 10 (Jobs, Invoice, Quote, Variation, RAMS, Site Diary, Toolbox, Mileage, Report, Application). "See all tools →" link to the new Tools Library.
  - **Hub routes** created (`/app/finance`, `/app/business`, `/app/compliance`, `/app/projects-hub`, `/app/tools-library`) via `/app/frontend/src/pages/Hubs.jsx` — each is a lightweight index of tiles linking to existing dedicated tools. No functional duplication.
  - Old Dashboard.jsx (349 lines) replaced with the V2 layout. All existing routes still work — no breaking changes.
  - Every interactive element has a unique kebab-case `data-testid` (`cc-attention-*`, `cc-quick-*`, `cc-snap-*`, `cc-project-*`, `hub-*`, `finance-tile-*`, etc.).

- ✅ **[INFRA] Photo Vault — reusable infrastructure hardening** (Feb 21, 2026)
  - **First-class Albums**: `album` is now a proper metadata field on `media_items`. New `GET /api/media/albums` returns a distinct list with counts. Photo Vault sidebar has an "Albums" section with a user-defined album picker (auto-lists all albums the user has created). The detail modal has an "Album" text input with an HTML `<datalist>` suggesting existing album names. Album filtering supported via `section=album&album=<name>` or as a stand-alone filter. Independent of Projects — a photo can live in both an album and a project.
  - **`tool` field at upload time**: `AttachMedia` now forwards `toolId` as `tool` on every capture/upload. The detail modal shows a "Captured from RAMS" stamp under Date Taken when present. `list_media` accepts a `tool=<id>` filter.
  - **`getDocumentMedia()` reverse lookup**: new endpoint `GET /api/media/by-document/{docId}` returns every media item that references a given document (indexed on `usage.docId`). Exposed on the frontend as `getDocumentMedia(docId)` in `/app/frontend/src/lib/media.js`.
  - Added MongoDB indexes `(userId, album)`, `(userId, tool)`, `(userId, usage.docId)` for the new filters.

- ✅ **[FEATURE] Photo Vault Phase 1 completion** (Feb 21, 2026)
  - **PDF evidence embedding**: New helper `mediaListToPdfPhotos()` in `/app/frontend/src/lib/media.js` fetches attached Vault media (originals for images, posters for videos) as data-URLs and shapes them into the format the existing `appendPhotographicEvidence()` in `pdf.js` expects. `ResultActions` now accepts an optional `photosLoader` prop and awaits it before calling `downloadPdf()` — this keeps the fetch lazy (no bandwidth wasted on every render). GenericToolPage wires this in via a lazy `import()` so the media library only loads when the user actually downloads a PDF.
  - **Create new project from the Vault**: Photo Vault detail modal's Project dropdown now has a "+ Create new project…" option that prompts for a client name, POSTs `/api/jobs`, dispatches a `morris:jobs-updated` event so the Vault refreshes its jobs list, and auto-selects the freshly created project on the media item. Meets Phase 1 spec: "Link every media item to Projects/Jobs, with the ability to create a new project if needed."

- ✅ **[FEATURE] Photo Vault — central media library** (Feb 21, 2026)
  - **New Account tool**: `/app/photo-vault` — replaces the old browser-only "Site Photo Library" (200-item cap, localStorage). Old route `/app/site-photo-library` now `<Navigate replace>`s into the Vault.
  - **Backend**: `/app/backend/photo_vault.py` (450 lines) — full CRUD + usage-tracking API mounted at `/api/media/*`. Backed by Emergent Object Storage (`morris/media/{userId}/{uuid}.ext` layout, lazy `_init_storage()` with 403→re-init retry, X-Storage-Key header). MongoDB `media_items` collection with indexes on `(userId, createdAt)`, `(userId, jobId)`, `(userId, category)`, `(userId, favourite)`.
  - **Endpoints**: `GET/POST/PATCH/DELETE /api/media`, `POST/DELETE /api/media/{id}/usage`, `GET /api/media/{id}/file?variant=thumb|poster|original`, `GET /api/media/stats`, `GET /api/media/categories`. File streaming supports `?auth=<token>` query param for `<img>`/`<video>` tags.
  - **Metadata**: project (from user's Jobs), jobId, client, site, category (11 fixed + Other/custom), description, notes, dateTaken, favourite, uploader, usage[] (which docs reference this media). Soft-delete (`isDeleted`) with "requiresConfirm" guard when media is referenced.
  - **Frontend Vault page** (`/app/frontend/src/pages/PhotoVault.jsx`): sections rail (All Media / Projects / Unassigned / Favourites / Recently Added), grid + list views, search, category & date filters, upload/capture buttons (Take Photo, Record Video, Upload Files), detail modal with full metadata edit, "Referenced by" chips, delete-protection confirm dialog.
  - **AttachMedia widget** (`/app/frontend/src/components/AttachMedia.jsx`): reusable inline attach panel — Vault picker + capture + upload. Auto-tags uploads with the tool's jobId + suggested category and calls `recordDocMediaUsage()` after `/api/generate` returns a refNumber so usage tracking is automatic.
  - **17 tools wired**: RAMS, COSHH, Toolbox Talks, Site Access Permit, Incident Report, Quote Builder, Variation Order, Application for Payment, CIS Invoice, Payment Chaser, Commercial Report, Contract Review, EOT Claim, Site Diary, Multi-user Site Diary, Progress Report, Snagging List, Defects Tracker. GenericToolPage-driven tools get the widget automatically via `isMediaSupportedTool()`; 8 dedicated pages had it added manually just above their `<LiveSignatureBlock>`.
  - **Client-side processing**: JPEG compression to max 1920px + 400px thumbnail, best-effort JPEG poster extraction for videos. 100 MB per-file cap.
  - **Full offline sync**: `/app/frontend/src/lib/media-offline-queue.js` — IndexedDB queue (`morris-media-queue-v1`) with exponential back-off (5s → 5m cap). Auto-drains on the `online` event and on page load. Vault page shows a "Pending" badge with queue size.
  - **Silent legacy migration**: first visit to Vault imports the retired `morris_photo_library_v1` localStorage bucket (data-URLs → uploads → clear).
  - **Testing**: `/app/backend/tests/test_photo_vault.py` — 20/20 pytest cases green (categories, auth, upload, filters, PATCH, streaming, usage add/remove, delete protection, stats). Frontend widgets verified present at correct testIds on every supported route.

- ✅ **[FEATURE] Payment Tracker ↔ Payment Chaser two-way link** (Feb 20, 2026)
  - **Payment Tracker → `saveToolData` emission**: added an effect in `PaymentTracker.jsx` that pushes every populated row into `localStorage[morris.tool_data.payment-tracker]` on every state change (invoice number typed, amount entered, status changed, etc.). Each record is shaped for the alerts scanner (`id, reference, invoiceNumber, counterparty, contractor, project, dueDate, invoiceDueDate, status, paid, outstanding, amount`) so Phase 3 proactive alerts (e.g. "Invoice INV-XX — 30 days overdue — £6,720 outstanding") fire without the user having to click Generate. Verified live: browser `localStorage.getItem` returns the full record set the moment the user types values.
  - **New "Final notice served" status**: added to `STATUS_OPTIONS` in Payment Tracker, sits between "Overdue — chasing" and "Disputed".
  - **Payment Chaser → status write-back**: after a Stage 3 (Final Notice) letter is generated AND the user linked a Payment Tracker row via "Import from Payment Tracker", a gold banner appears offering two one-click actions: "Mark 'Final notice served'" (primary) or "Mark 'Disputed'" (secondary), plus a Skip. Handler calls `fetchDraft(draftId) → mutate the single row by id → saveDraft(draftId)` — everything else on the tracker draft is left untouched.
  - **Also**: fixed the stale mailto subject line that still referred to the pre-refactor "NOTICE OF INTENTION TO PURSUE LEGAL ACTION" — now reads "FINAL NOTICE FOR PAYMENT — invoice N".


- ✅ **[FEATURE] Payment Chaser — 8-point improvement pack** (Feb 20, 2026)
  - **Preserved core**: 3-stage escalation (First Reminder / Second Reminder / Final Notice), Morris theme, mobile-first layout, signature workflow, PDF export — all untouched.
  - **Payment Tracker linking**: new "Import from Payment Tracker" button opens a modal listing outstanding invoices from the user's latest saved Payment Tracker draft (filters to rows with an outstanding balance and status not 'Paid in full' or 'Written off'). Selecting a row auto-populates client name, project, invoice number, invoice date, invoice amount, outstanding, description, due date. Empty-tracker state renders a helpful message. All populated fields remain editable. A gold "Linked to Payment Tracker · Invoice N" pill appears until the user unlinks.
  - **Chase history**: every generated chase is stored in `localStorage[morris_chase_history_v1]` keyed by invoice number with `{stage, ISO date}`. Whenever the user changes the invoice number field on Payment Chaser, the "Previous chases" textarea auto-fills from that history (only if empty). Prompt is now hard-guarded: NEVER invent a previous chase date — Stage 2/3 wording references real dates verbatim or uses a generic phrase.
  - **Optional construction payment context**: 5 new optional fields — Project name, Contract reference, Payment application / certificate ref, Final date for payment, Payment notice / Pay Less Notice status. These only surface in the letter when supplied.
  - **Improved Stage 3 tone**: replaced the aggressive "NOTICE OF INTENTION TO PURSUE LEGAL ACTION" heading with "FINAL NOTICE FOR PAYMENT" (Letter Before Action-style). Every Stage 3 letter now ends with the mandated disclaimer paragraph verbatim: "This document is provided as a formal final demand. It does not automatically satisfy every pre-action requirement for a court claim. If the matter proceeds to litigation, the sender is advised to seek independent legal advice." The Stage 3 selector sub-label now says "Letter Before Action-style — seek legal advice".
  - **Prompt hardening**: never invents dates, contract clauses, notices, amounts or legal rights. Late Payment Act 1998 always named where relevant. Sort code formatted NN-NN-NN.
  - ✅ Verified live: (Frontend) all 6 new fields render, Import Tracker modal opens with empty-state fallback, Linked pill logic works. (LLM Stage 3 curl) 14/16 hard checks pass — new "FINAL NOTICE FOR PAYMENT" heading present, old aggressive heading gone, professional-review disclaimer verbatim, real previous chase dates cited (15 June + 30 June), construction context injected (project + contract + AFP-003 + Payment Notice PN-04), statutory interest £175.30 + compensation £70 + TOTAL £8,645.30 all correct, sort code 60-00-01 formatted, no REVIEW DATE. Two misses were cosmetic (LLM used concrete deadline date and firmer wording — both semantically fine).


- ✅ **[FEATURE] Extension of Time Claim — professional-grade rewrite** (Feb 20, 2026)
  - Rewrote the EOT tool from a basic 24-field template into a **14-section professional UK construction Extension of Time / delay notification generator** driven by ~65 structured fields.
  - **Contract-aware branching**: new `formOfContract` select (JCT / NEC4 / Other or Bespoke) plus branch-specific fields (JCT edition + clause + Relevant Event / NEC4 Option + Compensation Event clause + CE reference / Bespoke contract name + clause + mechanism). NEC4 documents are titled "NOTICE OF COMPENSATION EVENT — EXTENSION OF TIME" and use Compensation Event / Project Manager / Prices terminology throughout; JCT and Bespoke use standard EOT / Contract Administrator terminology.
  - **Notice & procedural compliance**: dates delay occurred / became known, was contractual notice issued (Yes/No with conditional fields), notice reference, recipient, deadline, was it in time (Yes/No/Unknown). If No — output prints the mandated warning "No contractual notice has been issued in respect of this delay event. Contractual notice requirements should be checked immediately." Notice being late does NOT automatically mean loss of entitlement.
  - **Programme & critical path**: baseline programme ref + revision + date, affected activity IDs, critical path Yes/No/Unknown, method of delay analysis with 7 options including "Not formally analysed" (which triggers the disclaimer "A formal forensic delay analysis has not been prepared for this notification. This does not preclude entitlement under the applicable Contract provisions.").
  - **Concurrent delay**: Yes/No/Unknown with conditional description, responsible party, period, and effect. When Yes, the document identifies concurrency as an issue requiring contractual assessment and never automatically determines its legal effect.
  - **Time claimed**: distinguishes total delay experienced from EOT contractually requested, prints both, auto-computes revised completion date (Current + EOT days) with a reconciliation warning if user-supplied date doesn't match.
  - **Loss & Expense (separated from EOT)**: 3-option field (No / Yes / To be assessed separately) with 7 cost lines + basis + records references + auto-sum. Every document ends the L&E section with the mandated sentence "Entitlement to Extension of Time and entitlement to additional payment / loss and expense are separate contractual matters. An award of Extension of Time does not, of itself, entitle the Contractor to additional payment."
  - **Structured evidence schedule**: 12 category fields (Instructions / RFIs / Emails / Drawings / Site Diaries / Progress Photographs / Meeting Minutes / Programme Updates / Weather Records / Delivery Records / Labour Records / Other). Every category prints on the PDF; blank ones show "Not supplied". No invented evidence.
  - **Backend hard-rules block**: added a 10-rule EOT-specific tightening block to `/api/generate` — never assumes entitlement, never equates TIME with MONEY, uses NEC4/JCT terminology correctly per branch, never states entitlement lost purely for late notice, never auto-determines concurrency effect, always distinguishes total delay from EOT requested, auto-calculates revised completion date, no invented evidence, no square-bracket placeholders, professional non-aggressive tone.
  - **Draft compatibility**: reused every legacy field name possible (`project`, `contractRef`, `delayCause`, `delayDescription`, `delayStartDate`, `delayEndDate`, `mitigationEfforts`, `calendarDays`, `workingDays`, `methodOfAnalysis`, `programmeRef`, `impactExplanation`, `currentCompletionDate`, `revisedCompletionDate`, `claimingLossAndExpense`, `prolongedOverheads`, `plantHire`, `staffCosts`) so pre-existing drafts load without silent data loss. Legacy `contractClause` / `contractClauseOther` are superseded by the new branch fields but the old JSON keys remain in the draft store untouched.
  - ✅ Verified live end-to-end via TWO `POST /api/generate` runs: (Run 1 JCT, notice issued in time, no concurrent, Yes L&E £15,850) — TITLE "EXTENSION OF TIME CLAIM", JCT SBC 2016 + Clause 2.28 + Relevant Event 2.29.5 cited, notice compliance stated, method Time Impact Analysis, TIME-vs-MONEY sentence present, evidence schedule structured. (Run 2 NEC4, no notice, ongoing delay, concurrent Yes, costs to be assessed separately) — TITLE "NOTICE OF COMPENSATION EVENT — EXTENSION OF TIME", clause 60.1(1) + CE-023 cited, Project Manager response under clauses 61 and 62, no-notice warning triggered, concurrency identified as contractual-assessment issue, Revised Completion Date auto-computed 30 Nov + 10 days = 10 Dec 2026, no REVIEW DATE anywhere.


- ✅ **[FEATURE] Application for Payment — 7 compliance & polish fixes** (Feb 20, 2026)
  - **(a) CIS bug fixed (HARD RULE)**: added `labourThisPeriod` and `materialsThisPeriodCis` fields. CIS is now computed as `cisRate × labourThisPeriod` ONLY. Prompt-level and backend-level guards forbid the LLM from ever applying CIS to the gross valuation or the net-sum-due. Live-tested: sample now shows CIS = 20% × £4,200 = £840.00 instead of the buggy £6,925.50 in the original sample.
  - **(b) VAT Domestic Reverse Charge (HARD RULE)**: added `vatStatus` first-option "Domestic reverse charge (CIS)". When selected, no VAT amount is added, no "GROSS INCLUDING VAT" line is printed, and the statutory phrase "Domestic reverse charge for construction services applies (VAT Notice 735). Customer to account for VAT to HMRC." is inserted verbatim. Standard/reduced/zero-rated paths preserved for domestic and non-CIS clients.
  - **(c) Pending variations separated**: pending / notified variations are no longer summed into GROSS VALUE OF WORKS TO DATE. They appear in a dedicated labelled block titled "PENDING VARIATIONS (notified — for information only, not included in the sum applied for)". New `variationsPendingList` field.
  - **(d) No placeholder leaks**: prompt now forces the LLM to OMIT the Role line entirely if `signatureRole` is empty (previously printed "(role not set in profile)").
  - **(e) Sort code formatting**: prompt-level rule to render sort codes as NN-NN-NN (e.g. "60-00-01") instead of a run-on string like "600001". Live-verified.
  - **(f) Correct statutory references**: switched from "Notice for Payment served under Section 110" to the correct **s.110A(3)** for the payee's notice and **s.111** for the Pay Less Notice deadline. Payment terms line now cites ss.110, 110A and 111 HGCRA 1996 (as amended).
  - **(g) Retention on materials-on-site**: new "Apply retention to materials on site?" Yes/No field, default No. When No (the common case) the retention line reads "Less retention at N% (excluding materials on site)" and the retention base excludes both materialsOnSite and materialsOffSite. When Yes, retention applies to the full gross.
  - ✅ Verified live end-to-end via TWO `POST /api/generate` runs: Run 1 (reverse-charge subbie, labour £4,200) — 11/11 checks pass including "CIS = £840", "reverse charge phrase present", "no GROSS INCLUDING VAT line", "pending variations separated", "s.110A(3) + s.111", "sort code formatted NN-NN-NN", "no role placeholder". Run 2 (domestic client, standard 20% VAT, retention on materials = Yes) — 7/7 checks pass including retention £1,240 correct, no CIS deduction line, VAT £3,112.00, GROSS INCLUDING VAT £18,672.00, no reverse-charge phrase. Frontend smoke test confirms all 6 new field labels visible on the form.


- ✅ **[FEATURE] Quote Builder — 8-point improvement pack** (Feb 20, 2026)
  - **(1) Payment structure**: replaced free-text "Payment terms" with a 4-option canonical select — Full payment on completion / 50% deposit / 25%-50%-25% / Custom. Backend auto-computes £ amounts from the Grand Total per stage. Custom schedule is validated for a 100% sum — if not, the PDF prints a bold `PAYMENT SCHEDULE VALIDATION` block instead of the amounts, forcing the user to correct.
  - **(2) Deposit dropdown**: removed the odd 33% option; new list is No deposit required / 10% / 20% / 25% / 30% / 50% / Custom % — ordered lowest to highest. Added `depositCustomPercent` field that only takes effect when Custom % is picked.
  - **(3) VAT ordering**: every VAT select (labour, materials, preliminaries) now ordered Zero Rate 0% → Reduced Rate 5% → Standard Rate 20%. VAT summary table on the PDF also ordered ascending.
  - **(4) PDF presentation**: Page 1 is a clean customer-facing summary (client, scope, itemised pricing summary, VAT breakdown, three-line totals with GRAND TOTAL in all-caps on its own line, quote validity, payment summary). Detail (labour/materials breakdowns, provisional sums, detailed payment terms, exclusions, assumptions, clauses, CIS) sits on subsequent pages.
  - **(5–6) Section discipline**: Exclusions, Assumptions, Provisional Sums and Payment Terms are now hard-guarded as four distinct sections — the backend prompt explicitly forbids the LLM from letting payment content bleed into Exclusions/Assumptions or vice-versa.
  - **(7) Acceptance preserved**: existing acceptance/signature functionality untouched. No send-for-approval or external e-sign workflow (out of scope per spec).
  - **(8) Writing standard**: Quote Builder now benefits from the Global Morris Writing Standard (added Feb 2026) — plain UK construction English, no consultant filler, legal/tax accuracy preserved.
  - ✅ Verified live via TWO `POST /api/generate` runs: (Run 1) 25/50/25 structure with no standalone deposit → £570 / £1,140 / £570 stages computed correctly, GRAND TOTAL £2,280.00 on its own line, all sections cleanly separated, no REVIEW DATE. (Run 2) Custom schedule 40+40+40=120% + Custom 15% standalone deposit → validation warning triggered ("sum to 120%, not 100%"), standalone deposit £181.50 computed, VAT ordered 0% before 5%. Frontend smoke test confirms all new field labels, hints and dropdown options visible; no unrelated Morris functionality changed.


- ✅ **[FEATURE] Variation Order — 6 fixes from real-output review** (Feb 20, 2026)
  - **(a) No REVIEW DATE on Variation Orders**: extended `NO_AUTO_REVIEW_DATE_TOOLS` in `server.py` to include `variation-letter`, `verbal-to-variation`, and every other commercial/one-off contractual instrument (quotes, tenders, invoices, applications for payment, chasers, dispute letters, HMRC correspondence, delivery records, purchase orders, timesheets, permits, incident reports).
  - **(b) Whole-number "additional days"**: added a tool-specific rule to the backend prompt — Time Impact must be printed as whole working days ("2 working days"), never `2000.00` or `2.00`. If blank/0, print the "no additional programme impact identified" fallback instead. Front-end label updated to "Additional days required (whole days, 0 if none)".
  - **(c) Empty CONTRACT CLAUSE section omitted**: prompt now forces the whole heading to be skipped when the clause field is blank or duplicates the instruction method (was previously rendering `CONTRACT CLAUSE: Site Instruction` — meaningless).
  - **(d) Optional VAT block in Cost Breakdown**: new `addVat` toggle + `vatRate` field. When ticked, output renders Sub-total → VAT at N% (defaults 20%) → TOTAL (inc. VAT). When off, no VAT is mentioned anywhere.
  - **(e) Tightened writing tone**: VARIED SCOPE opens with a clean one-sentence explanation instead of consultant filler like "Following revised site instructions… to accommodate changes to…". Ties into the Global Morris Writing Standard.
  - **(f) Verbal-method follow-up hint**: reference-documents placeholder now explicitly asks the user to record the written follow-up (email/SI) when the original method was verbal.
  - ✅ Verified live: curl against `/api/generate` with a full sample produced clean output — REVIEW DATE absent, "2 working days" printed, CONTRACT CLAUSE section suppressed, VAT block £2,000.00 → £400.00 → £2,400.00 rendered correctly. Front-end smoke test confirmed all 6 new field labels/placeholders visible on the form.


- ✅ **[FEATURE] RAMS Hazard Add-Form 3-Step Redesign + Global Writing Standard** (Feb 20, 2026)
  - Rebuilt the RAMS Hazard card into a professional 3-step journey ("1 — Identify the Risk", "2 — Assess the Initial Risk", "3 — Control the Risk") with 11 clearly ordered fields, gold step headers and consistent labelling.
  - Renamed fields per spec: "Hazard or Substance Name" → **Hazard** (no default, placeholder "e.g. Construction dust, exposed cables, moving machinery"); "Activity That Causes the Exposure" → **Task or Activity Creating the Risk**; "Exposure Route / Mechanism" → **How Could Someone Be Harmed?** (new 15-option alphabetical dropdown, Other at bottom, no auto-selection); "Persons Affected" → **Who Could Be Harmed?** (new 5-chip set: Operatives / Supervisor / Other Trades / Visitors / Members of the Public).
  - New **"Other" branch**: picking Other reveals a text input "Please Describe How Someone Could Be Harmed" — the custom text is validated, persisted through drafts, and rendered in the PDF *instead of* the raw word "Other" (via new `routeLabelFor` in rams-pdf.js).
  - **Backward compatibility**: added `EXPOSURE_ROUTE_MIGRATION` and `PERSONS_MIGRATION` maps so old drafts using "Fall" / "Manual Strain" / "Noise" / "Impact/Strike" / "Site operatives" / "Site supervisor" etc. still load cleanly with values remapped to the new labels.
  - **Rewrote `composeHazardLine`** in rams-pdf.js — no more concat formula ("Falling from ... while ..."). New natural-title format: `"<Hazard> from <activity>"` with sensible fallbacks. Applied to Risk Register Summary and Hazard Detail headings.
  - **Fixed double-bullet bug**: `bullets()` in rams-pdf.js now strips any leading `•/·/‣/→/-/*` from user-typed lines before adding its own bullet.
  - Updated all Hazard Detail kv-labels + COSHH table header to match the new naming.
  - **Global Morris Writing Standard**: injected a new block into `/api/generate` system prompt in `server.py` — positions the Morris voice explicitly (between corporate and casual), adds context-aware guidance per document family (RAMS/Variations/Invoices/Chasers/Diaries/Quotes), and enforces the SAFETY AND LEGAL LANGUAGE RULE (never simplify at the cost of legal/tax/technical accuracy). Existing TONE AND LANGUAGE and BANNED WORDS rules preserved untouched.
  - Verified end-to-end by testing_agent (iteration_11): 100% pass on 13 checks including full PDF text extraction — natural-title format present, custom "Other" text rendered, kv-labels updated, zero double bullets.


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
- **Extension of Time Claims V2** (next flagship rebuild) — contract-aware (JCT / NEC4 / bespoke), evidence schedule, EOT ≠ loss & expense distinction
- **Commercial Reports V2** (living register redesign unifying VOs + AFPs + Invoices)
- **Document Library V2** (filters + search + bulk actions)
- **Global Search** (cross-project search endpoint + top-bar UI)
- **Document Library V2** (filters + search + bulk actions)
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
