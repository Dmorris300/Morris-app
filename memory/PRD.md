# Morris — Product Requirements Document

## Original Problem Statement
Dark-themed construction administration SaaS for UK tradespeople and sole traders. Built by Darren Morris, a UK duct fitter. Company: Morris Construction Tech Ltd (ICO C1923529). Slogan: "Built on the Tools." Tagline: "Built by a tradesman. For tradesmen." Brand: gold #E8A020 on near-black #060606 with off-white #F0EDE8 text. Bebas Neue wordmark + DM Sans body. 90+ tools across Documents / Finance / Site Tools / Price Work / Sole Trader / Contractors / Account. Three wow features: Verbal to Variation, Photo to Document, CIS Refund Predictor. AI document generation via Claude. Pricing tiers: Free / Solo £12.99 / Pro £24.99 / Business £59.99 / Enterprise £299+.

## Stack (adapted from Vite+Vercel → CRA+FastAPI+MongoDB)
- Frontend: React (CRA), Tailwind, lucide-react, sonner, jspdf, react-router-dom v7
- Backend: FastAPI + Motor (MongoDB)
- LLM: Claude Sonnet 4.5 via `emergentintegrations` + EMERGENT_LLM_KEY
- Payments: Stripe Checkout via `emergentintegrations.payments.stripe.checkout` (currently MOCK MODE until real Stripe key provided)
- Email: Resend (live, key configured)
- Auth: bcrypt + opaque session token (uuid) on user doc; session stored in localStorage on client

## User Personas
1. Sole-trader UK tradesman (32 trades) — on-site, on a phone. Wants to produce paperwork fast and get paid.
2. Small contractor (2–10 staff) — managing subbies, RAMS, payment cycles.
3. Apprentice / new starter — needs admin scaffolding to look professional.

## What's Implemented
### Iteration 1 (initial build)
- Landing page (hero, wow features, 90+ tool grid, 5-tier pricing, founder section, footer ICO C1923529)
- Auth: signup/OTP-verify/login/trade selection
- App shell: collapsible sidebar (search, Recently Used, 7 accordion sections)
- Generic tool framework (~75 form-driven tools) calling Claude
- 3 wow features: Verbal to Variation, Photo to Document, CIS Refund Predictor
- Finance widgets: Earnings, Mileage (45p/25p HMRC), VAT (£90k progress)
- Action buttons: Save / Copy / PDF (branded letterhead) / Email / WhatsApp text / WhatsApp PDF
- Profile, Favourites, History

### Iteration 2 (auth additions)
- Email field on signup (unique-indexed)
- Password reset via email link (mocked) or phone code
- Login by username OR email
- 81 punctuation dashes stripped for cleaner copy

### Iteration 3 (Stripe + Resend + free-tier)
- Stripe billing (Mock mode while `STRIPE_API_KEY='sk_test_emergent'`)
- 3-day free trial (no card needed)
- 4 paid tiers self-serve, Enterprise via mailto
- Mock checkout page for demos; real Stripe checkout activated on real key swap
- Free-tier enforcement on `/api/generate`: 3 different tools + 5 docs per month → 402
- Real password-reset emails via Resend with branded HTML template
- Welcome email on signup
- Subscription receipt email after payment
- Trade switcher available on every tool page header + sidebar footer
- "Recommended for [Trade]" section on dashboard
- Founder photo removed from landing
- "Favourite" label (was "Starred")
- Tool emojis next to every tool name

### Iteration 10 (Feb 2026 — Live Stripe Subscriptions)
- Switched `/app/backend/.env` from mock-Stripe placeholder to **real live keys** (`sk_live_…`, `pk_live_…`) plus the 4 live price IDs (Solo / Pro / Business / Enterprise). All keys are in `.env` only — never hard-coded.
- Fixed env-var precedence bug: `STRIPE_API_KEY=sk_test_emergent` was hard-baked into the pod's shell environment and was overriding `.env`. `billing.py` now uses `dotenv_values()` to read Stripe keys directly from the `.env` file so it always wins. Other env vars (Mongo, LLM key, Resend) untouched.
- The `emergentintegrations.payments.stripe.checkout` helper hard-codes `mode='payment'` (one-off) and cannot do subscriptions. Switched checkout creation to use the **official `stripe` SDK directly** (`stripe.checkout.Session.create` with `mode='subscription'`) for proper recurring billing. The helper is still used for status polling and webhook signature verification.
- Added 4th plan **Enterprise £199.99** as a subscribable plan (was previously "Contact us"). Removed `contact: true` so the Enterprise card shows a real "Choose Enterprise" button.
- Hard-block on `darrenhustle300`: `is_unlimited_admin()` check in `create_checkout` returns 400 with "Your account already has unlimited access. No subscription required." — the admin can never create a Stripe session and can never be charged.
- Verified end-to-end on live preview: all 4 plans return real `cs_live_…` session IDs and `checkout.stripe.com` URLs. Webhook handler already wired at `POST /api/webhook/stripe` for `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.

### Iteration 9 (Feb 2026 — Priority Tools deep field overhaul: 9 tools)
- **Backend**: extended Profile with `vehicleReg` and `bankDetails` fields. Both injected into Claude system prompt's Author Profile block so all generated documents auto-populate without placeholders. Bank details are now pulled into CIS invoices and Payment Chasers automatically.
- **tools-config.js**: introduced new field helpers — `fo()` for optional fields, `sel()` for dropdowns, `fp()` for prefilled date-style fields with patterns (`today`, `today+30d`, `today+7d`). `GenericToolPage` now renders selects natively and prefills any field declared with a `prefill` pattern.
- **8 priority tools rewritten with full new field lists + auto-calculation + signature blocks**:
  1. **Variation Letter** — 15 fields: contract ref + date, instructor name + role (dropdown), instruction datetime + location, original scope, variation, labour/materials cost breakdown, time impact, instruction method (dropdown), clause ref (optional). Issued-by block from profile + client acceptance block + HGCRA 1996 footer reference + "sign and return" close.
  2. **CIS Invoice** — 13 fields: invoice date + tax point auto-prefilled, client legal name + address, works description, labour + materials (separate as HMRC requires), CIS rate dropdown (20% / 30% / 0% gross), VAT applicable (conditional on profile), domestic reverse charge (conditional on profile), PO number (optional), payment terms (dropdown), bank details (auto from profile). Issued-by block with UTR from profile.
  3. **Payment Chaser** — 7 fields: client, invoice number / date / amount, outstanding amount, previous chase attempts (optional), payment deadline (defaults to today + 7d). Days overdue calculated by Claude. Late Payment of Commercial Debts (Interest) Act 1998 + 8% above base rate interest + £40-£100 fixed compensation language embedded in prompt. Issued-by block.
  4. **Site Diary** — 16 fields: date prefilled, site, weather (3 dropdowns for Temperature / Wind / Rain), site manager, operative count, visitors, plant, works today, works tomorrow, delays (yes/no + reason), instructions received, issues, photos attached. Completed-by block from profile.
  5. **Daywork Sheet** — 12 fields: daywork date prefilled, contract ref, labour rate, uplift %, plant rate, start + finish times, works description, materials list + total, plant list + total, PO. Operative + Site Manager signature blocks + payment caveat close.
  6. **Timesheet** — 22 fields: week commencing prefilled, project, site, job ref, per-day Mon-Fri start/finish/break times, overtime hours + rate, day or hourly rate + basis, PO, payment terms. CIS rate auto-applied to labour only from profile. Operative + Supervisor signature blocks + CIS-rate-from-profile note baked into the document.
  7. **Quote Builder** — 13 fields: client, valid-until (defaults to today + 30d), payment terms (dropdown), labour/materials/preliminaries breakdowns + subtotals, CIS applicable, exclusions, assumptions. VAT line conditional on profile. Prepared-by + Client acceptance signature blocks.
  8. **Subcontract Letter** — 18 fields: subcontractor name/company/address/UTR, contract dates, site + project, scope, fixed price vs day rate selector, payment frequency (dropdown), CIS rate (dropdown), retention %, defects period, insurance min, termination notice. Mandatory **Right of Substitution** clause baked into prompt. Already in REVIEW_REQUIRED_TOOLS so review checkbox blocks Send/Download.
- **9th tool — Mileage Tracker**: complete rebuild. New required-input form: date prefilled, journey purpose (with HMRC compliance check that rejects generic words like "site" or "work"), start address, end address, miles, round-trip toggle (doubles mileage), vehicle reg (auto-prefilled from profile). Live tax-year detection (6 April → 5 April). Automatic threshold split between 45p/mile (first 10,000 in tax year) and 25p/mile (above). 3 stat cards: Miles YTD, Claim YTD, This journey at current rate. **Annual Report (PDF)** button generates a complete tax-year report with monthly breakdown + individual journeys + HMRC compliance note, ready for accountant. HMRC contemporaneous-record warning displayed at top.

### Iteration 8 (Feb 2026 — Job Tracker)
- **Backend**: `db.jobs` collection + 5 routes — POST `/api/jobs` (auto-issues `JOB-{INITIALS}-{NNNN}` ref via per-user counter), GET `/api/jobs`, GET `/api/jobs/:id` (returns job + linked documents), PATCH `/api/jobs/:id` (status enum: active|invoiced|completed|disputed), DELETE `/api/jobs/:id` (orphans linked docs rather than deleting them).
- **Documents** schema: added `jobId` field. `/api/generate` and `/api/documents/save` both accept an optional `jobId` and link the doc automatically.
- **Frontend pages**:
  - `/app/jobs` — list with 5 status filter chips (All / Active / Invoiced / Completed / Disputed) showing counts, empty state, gold "New job" button opening a modal form with required client name + optional address/value/dates.
  - `/app/jobs/:jobId` — detail page with status pill, job metadata (site/value/started/expected), 4-button status switcher, list of linked documents, delete with confirm.
- **AppShell sidebar**: pinned "Job Tracker" link at the very top of the navigation (above Recently Used).
- **Command Centre**: Outstanding Invoices card now wired to real data — sums contract values of jobs in `invoiced` status. New "Jobs" quick-action button added (now 5 quick-actions: Jobs / New invoice / New variation / New RAMS / Log mileage).
- Both pages are wrapped in `ProfileGate` so incomplete-profile users are redirected to /app/profile first.

### Iteration 7 (Feb 2026 — Command Centre Dashboard + lint cleanup)
**Command Centre (Prompt 7's first feature):**
- Replaced the basic Dashboard top section with a full Command Centre block. New blocks rendered above the existing "What Morris Offers"/Recommended/Favourites:
  1. **Top stats grid (4 cards)** — Tax pot to set aside (23% of net CIS payments), CIS refund estimate (totalDeduction − basic-rate tax on profit over PA £12,570), Outstanding invoices (Coming soon — placeholder until Payment Tracker is built), Earnings YTD (sum of all logged CIS gross).
  2. **Expiry traffic-light strip (3 cards)** — Public liability insurance, CSCS card, Self Assessment deadline (next 31 Jan). Status colours: green > 60 days, amber 30–60 days, red < 30 / expired, grey if unset. Each card is tappable and links to Profile or Self Assessment Prep tool.
  3. **Quick actions (4 buttons)** — New invoice → /app/tool/cis-invoice; New variation → /app/tool/variation-letter; New RAMS → /app/tool/rams; Log mileage → /app/mileage. Per Prompt 7's "four most used tools available in one tap".
  4. **Recent documents** — Last 5 documents from the Vault. Each shows its refNumber + ISO date. Tap to open History.
- All cards live-update from `/api/documents` + `/api/cis/payments` + the user profile fields. Greeting now displays "Hello, {firstName}" with trade + company subline.

**Lint / code-review cleanup:**
- Replaced `random.randint` → `secrets.randbelow(900000) + 100000` for OTP and SMS reset code (server.py:185, 295). Removed unused `random` import. Real cryptographic security improvement.
- Empty `catch {}` blocks → `catch (e) { console.error(...) }` in CISRefundPredictor.jsx and Billing.jsx for debuggability.
- Pushed back on the rest of the code-review report (hardcoded test secrets / localStorage / hook deps / complexity / type hints in tests) as either false positives or out-of-scope refactors.

### Iteration 6 (Feb 2026 — Global Rules Phase 1A + 1B + 1C)
**Phase 1A:**
- Enterprise tier price updated £199 → £199.99 on Landing & Billing pages.
- NO DASHES rule added to Claude system prompt + server-side post-process safety net stripping any em-dash/en-dash from output.
- Strict PLACEHOLDER RULE added to system prompt (no [Your Company] / TBC / square-bracketed placeholders).
- `darrenhustle300` is now an admin / unlimited account: `is_unlimited_admin()` helper bypasses `check_can_generate` and `record_usage`. `/api/billing/status` returns `plan='unlimited'`, `isUnlimited=true`. `/api/auth/me` returns `isAdmin=true`, `isUnlimited=true`. The account was promoted via a one-off DB update (`isAdmin: true`, password reset to `hustle1234`).
- Global disclaimer wording on ResultActions footer replaced with the required "This tool is for guidance and estimation purposes only. It does not constitute legal, tax or financial advice…" copy.
- SMS button added to every generated document's action row (data-testid='action-sms') alongside Email + WhatsApp text/PDF — uses `sms:?body=` URL scheme so the native messages app opens with body pre-filled.

**Phase 1B:**
- Backend Unique Reference Number system: per-user per-tool per-day counter in MongoDB. `/api/generate` issues a refNumber in format `{TYPE}-{INITIALS}-{YYMMDD}-{NNN}` (e.g. `RAMS-DM-260525-001`), injects it into the Claude prompt as a mandatory document header, and returns it in the response payload. System prompt now requires every document to start with `DOCUMENT REFERENCE: …`, `DATE: …`, and `REVIEW DATE: …` (compliance docs).
- Auto date population: GenericToolPage auto-fills any date-style field on mount. Defensive matching by both `field.type === 'date'` and field name pattern (`date|review|valid|start|end|expir|handover|taxpoint|completion`). Review-style fields default to today + 12 months.
- Yellow asterisk + required validation: every tool field defaults to required unless explicitly flagged `optional: true`. Generate button is disabled while any required field is empty. Missing-fields toast + inline red border + red message list shown on submit.
- Auto-save to Document Vault: every successful `/api/generate` call now writes the document directly into `db.documents` with `autoSaved=true` + the refNumber, so nothing is ever lost.
- Result panel shows the `REF: <number>` badge top-right; toast on success now reads "Document generated. Saved to your Vault."

**Phase 1C:**
- Profile model extended with `contactNumber`, `vatRegistered` (bool), `insuranceExpiry` (date), `cscsExpiry` (date). All mandatory fields on the Profile page marked with yellow asterisk.
- New `ProfileGate` route wrapper in `App.js`. Any tool route (Generic, all 3 wow features, CIS Predictor, Mileage, VAT, Earnings) is wrapped — if the user's profile is incomplete (any of fullName/companyName/address/contactNumber/utr/trade/cisStatus/insuranceExpiry/cscsExpiry missing), they're auto-redirected to `/app/profile?complete=1` with a gold "Complete your profile to unlock the tools" banner. Admin / unlimited users bypass.
- Claude system prompt now receives a full Author Profile block (Name, Trade, Company, Address, Contact, Email, UTR, CIS status, VAT). Documents are auto-populated with real values; "[Your Company]" / "TBC" / square-bracket placeholders are explicitly forbidden in the prompt. Verified end-to-end: a generated CIS Invoice now contains the real company name, address, contact, UTR and VAT number.
- Mandatory review checkbox on 12 high-risk tools (`requiresReview()` in tools-config): RAMS, COSHH, Noise, Manual Handling, Working at Height Rescue, HMRC Correspondence, Subbi Compliance Checker, H&S Policy, Hire Agreement, Subcontract Letter, New Starter Pack, Apprentice Manager. All 7 action buttons (Save/Copy/PDF/Email/WhatsApp text/WhatsApp PDF/SMS) are disabled until the user ticks "I have reviewed this document". Gold-bordered alert box with checkbox renders above the actions.
- 88+ tool count standardised everywhere — Landing hero strip, tools section H2, Billing Solo features, trial CTA.

### Iteration 5 (Feb 2026 — Cinematic intro + CIS disclaimer)
- Cinematic intro overlay on Landing (CinematicIntro.jsx): two-line gold shimmer sweep — "Built By A Tradesman, For Tradesmen" (large, 2s sweep) + "The Paperwork Sorted. You Stay On The Tools." (smaller, sweeps in at 2.2s). ~5.4s total runtime, scroll-locked then released. Replays only once per session via `sessionStorage.morris_intro_shown`. (User reverted from the alternate 4.5s "MORRIS / slogan / rule / mark" design back to this original 2-line shimmer intro.)
- Fixed critical timer-restart bug in CinematicIntro: useEffect dep changed to `[]` with an `onDoneRef` so parent re-renders no longer clear the dismiss timer.
- "Wow Features" → "What Morris Offers" rename across nav + footer.
- CIS Refund Predictor: added Info `i` + Favourite star buttons in header. Info opens a modal popup overlay (#0D0D0D bg, gold border) with "What this tool does" copy and a blue-bordered Tax Notice box (🧮 calculator emoji) clarifying the estimate-only nature of the prediction. Favourite toggle wired to `/api/profile/update`.

## Verified (Testing Agent iterations 1+2+3)
- Backend: 36/36 pytest pass (auth + generate + documents + CIS + billing + free-tier + email)
- Frontend: full E2E happy path verified — signup → OTP → trade → tool generation → mock checkout → plan activation → free-tier 402 cascade

## Mocked / Deferred
- **OTP via SMS** — still mocked (returned in response). Twilio integration pending.
- **Stripe** — currently MOCK MODE. Swap `STRIPE_API_KEY` env var to a real `sk_test_...` or `sk_live_...` to activate. No code changes needed.
- **Domain for Resend** — using `onboarding@resend.dev` until DNS verified for `morrisapp.co.uk`.
- **Multi-user invites** for Pro/Business/Enterprise seats — deferred.
- **Offline Mode** — listed in sidebar as "(Coming soon)".
- **Real OCR on Photo-to-Document** — currently user describes the photo and Claude formats.

## Prioritised Backlog
- **P0**: Real Stripe key swap when founder has a Stripe account
- **P0**: Verify Morris domain on Resend (DKIM records) → enables sending to any address from `hello@morrisapp.co.uk`
- **P1**: Twilio for real SMS OTP
- **P1**: Multi-user invites
- **P1**: Real OCR (Tesseract or Claude vision) on Photo-to-Document
- **P2**: Custom company logo upload onto branded PDF letterhead
- **P2**: Stripe Customer Portal link for self-serve cancel/update card
- **P2**: Annual billing option (20% discount)
- **P3**: PWA + offline mode (IndexedDB queue)
- **P3**: Marketing SEO / blog
