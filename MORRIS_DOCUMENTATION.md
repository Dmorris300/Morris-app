# Morris — Complete Application Documentation

> **Product**: Morris — the construction admin app for UK tradesmen
> **Tagline**: "The paperwork sorted. You stay on the tools."
> **Live**: https://morrisapp.co.uk (production) · Preview environment used for development
> **Stack**: React (CRA) + FastAPI + MongoDB · Stripe · Resend · Anthropic Claude via Emergent LLM Key

---

## 1. Overall Purpose

Morris is a dark-themed SaaS platform that gives UK tradespeople (sole traders, subcontractors, and small-to-medium construction firms) a single mobile-first toolbox for every admin job that traditionally lives on scraps of paper or in messages.

**Core value proposition**
- 80+ trade-specific tools covering documents, finance, site records, price work, sole-trader tasks, and subcontractor management.
- Documents auto-generated in "plain construction English" (no consultant jargon) — powered by Claude but branded as Morris throughout the UI.
- UK statutory correctness baked in: CIS, HMRC, HSE, CDM 2015, Housing Grants Construction and Regeneration Act 1996 (HGCRA), Late Payment of Commercial Debts (Interest) Act 1998, Work at Height Regulations 2005, Control of Noise at Work Regulations 2005, Manual Handling Operations Regulations 1992.
- Every document exports as a Morris-branded PDF (jspdf) with a charcoal/gold identity, single- or dual-signature blocks, and unique reference numbers per document type.
- Auth, subscriptions, team management, drafts, notifications, offline mode and a photo library round out the platform.

**Personas served**
- Sole trader (e.g. Electrician, Plumber, Duct Fitter) doing his own invoices and RAMS.
- Site subcontractor tracking variations, delays, payments, retention.
- Small principal contractor managing a crew, subbie compliance, incidents and commercial reports.

---

## 2. Page-by-Page Breakdown

All routes are defined in `/app/frontend/src/App.js`.

### 2.1 Public Pages (no auth required)

| Route | File | Purpose |
|---|---|---|
| `/` | `Landing.jsx` | Marketing hero: brand promise, "Built by a tradesman, for tradesmen", 3 WOW-tool teasers (Verbal to Variation, Photo to Document, CIS Refund Predictor), sign-in CTAs. |
| `/login` | `Login.jsx` | Username OR email + password login. Link to Forgot Password + Sign up. |
| `/signup` | `Signup.jsx` | Username, email, password, phone. Returns OTP in response (mocked SMS). |
| `/verify-otp` | `VerifyOtp.jsx` | 6-digit OTP verification. Marks account `verified: true` and returns session token. |
| `/forgot-password` | `ForgotPassword.jsx` | Choose email (real Resend email) or phone (demo code) reset path. |
| `/reset-password` | `ResetPassword.jsx` | New password entry via token (email) or phone + code. |
| `/accept-invite` | `AcceptInvite.jsx` | New team member accepts a team invite link; sets their own username/password. |
| `/privacy` | `PrivacyPolicy.jsx` | Static privacy policy. |
| `/terms` | `TermsConditions.jsx` | Static T&Cs. |
| `/select-trade` | `SelectTrade.jsx` | Mandatory once after signup — user picks their trade from 32 options. |

### 2.2 Authenticated App Shell (`/app`)

Everything under `/app/*` renders inside `AppShell.jsx`, which provides:
- Left sidebar with logo, search box, notification bell, tool tree (6 sections + Account), recently used, favourites, trade switcher, log out.
- Top mobile bar for smaller screens (hamburger + bell).
- Global overlays: `Breadcrumbs`, `SessionTimeout`, `CommandPalette` (⌘K / Ctrl+K), `OnboardingTour`, `TradeSwitcher`, `CookieBanner`.
- Runs `runAlertChecks()` on mount to populate the notification bell with proactive alerts.

Nested routes inside the shell:

#### Command Centre / Dashboard
| Route | File | Purpose |
|---|---|---|
| `/app` | `Dashboard.jsx` | Personal "Command Centre": welcome header with trade line; 4 KPI cards; 3 expiry cards (Insurance, CSCS, Self Assessment) with amber/red state; 5 Quick Actions (Jobs, New Invoice, New Variation, New RAMS, Log Mileage); Recent Documents feed; "What Morris offers" WOW cards; Recommended-for-your-trade grid; Recently used; Favourites. |

#### Job Tracker
| Route | File | Purpose |
|---|---|---|
| `/app/jobs` | `Jobs.jsx` | Pipeline view of all jobs (active / invoiced / paid / completed / disputed). Create new job. |
| `/app/jobs/:jobId` | `JobDetail.jsx` | One job's details, notes, status, linked documents. Attach any generated PDF to a job via `jobId`. |

#### WOW Tools (dedicated flagship features)
| Route | File | Purpose |
|---|---|---|
| `/app/wow/verbal-to-variation` | `VerbalToVariation.jsx` | Record yourself describing a verbal instruction; produces a formal Variation Order. **NOTE: Web Speech API is MOCKED — falls back to text input.** |
| `/app/wow/photo-to-document` | `PhotoToDocument.jsx` | Snap a photo of a scribble; Claude Vision transcribes it; the transcription flows into your chosen tool. |
| `/app/site-photo-library` | `SitePhotoLibrary.jsx` | Every photo captured via Photo to Document is stored in localStorage with date/time/location. Search, filter by doctype, save/remove, full-screen viewer. |
| `/app/drafts` | `Drafts.jsx` | List of all mid-form saves across every tool. Resume picks up exact state via `?draftId=` query param. |

#### Finance
| Route | File | Purpose |
|---|---|---|
| `/app/cis-predictor` | `CISRefundPredictor.jsx` | Estimates your HMRC refund. Adds/edits CIS payments (`grossLabour`, `materials`, `cisRate`), auto-computes deduction/net; sums allowances, expenses, VAT; emails a PDF summary to your accountant via Resend. |
| `/app/mileage` | `MileageTracker.jsx` | Log business mileage at HMRC rate (45p/mile for first 10,000). PDF export. |
| `/app/vat` | `VatThreshold.jsx` | Rolling-12-month turnover check against the £90k threshold; VAT registration advisor. |
| `/app/earnings` | `Earnings.jsx` | Monthly & annual earnings breakdown (gross, CIS deducted, expenses, net). |
| `/app/taxpot` | `TaxPot.jsx` | Auto sets aside 8% of every CIS net payment for National Insurance. Countdown to 31 Jan Self Assessment deadline. |
| `/app/payment-chaser` | `PaymentChaser.jsx` | 3-stage escalation letter (polite → firm + statutory interest → Letter Before Action). |
| `/app/self-assessment-prep` | `SelfAssessmentPrep.jsx` | Roll-up of the tax year: gross, CIS, expenses, estimated refund. PDF for your accountant. |

#### Site Tools (dedicated)
| Route | File | Purpose |
|---|---|---|
| `/app/prestart-meeting` | `PreStartMeeting.jsx` | 7-section pre-start checklist with tri-state Yes/No/NA rows, attendees + actions. |
| `/app/tool-register` | `ToolRegister.jsx` | Live equipment register with PAT status + conditional PAT expiry + gold warnings. |
| `/app/noise-assessment` | `NoiseAssessment.jsx` | Per-source noise readings auto-classified to HSE bands (<80 / 80–84 / 85–86 / ≥87 dB). |
| `/app/working-at-height-rescue` | `WorkingAtHeightRescue.jsx` | Rescue plan with legally-required warning banner + 4 pre-filled scenarios (suspension trauma, fall, medical, below-ground). |
| `/app/manual-handling` | `ManualHandling.jsx` | HSE TILE assessment (Task/Individual/Load/Environment) with auto-classified load-weight bands and overall risk. |
| `/app/variation-instruction-log` | `VariationInstructionLog.jsx` | Live register with auto VI-001 refs + 8-metric summary panel (outstanding, disputed…). |
| `/app/retention-chaser` | `RetentionChaser.jsx` | 3-stage retention release chase, statutory interest calc, dual sign-off. |
| `/app/subbie-mgmt` | `SubcontractorManagement.jsx` | Compliance register (CIS verified, insurance, RAMS, induction) with Action-Required badges. |
| `/app/meeting-notes` | `MeetingNotes.jsx` | Attendees, decisions, actions, next meeting date. |
| `/app/weather-log` | `WeatherLog.jsx` | Daily weather log; totals days stopped/hours lost; supports EoT claims. |
| `/app/risk-register` | `RiskRegister.jsx` | Likelihood × Severity matrix with initial + residual ratings, gold matrix guide, red-warning banner on High. |
| `/app/apprentice-manager` | `ApprenticeManager.jsx` | Apprentice details, on-the-job skills log, off-the-job training log with 20% compliance check. |
| `/app/procurement-schedule` | `ProcurementSchedule.jsx` | Order-by-date auto-calc (working-days back-count), 6-status pipeline. |
| `/app/price-work-quote` | `PriceWorkQuote.jsx` | Itemised priced schedule with VAT toggle + Acceptance slip. |
| `/app/rate-increase-letter` | `RateIncreaseLetter.jsx` | Auto % increase calc, notice period, conditional ongoing-work paragraph. |
| `/app/snagging-list` | `SnaggingList.jsx` | Dynamic snag table with severity/status, closed-date conditional, live % complete. |
| `/app/contract-review` | `ContractReview.jsx` | Paste a contract → 15-section plain-English review with Favourable/Standard/Unfavourable ratings. |
| `/app/hmrc-correspondence` | `HmrcCorrespondence.jsx` | HMRC letter response with UTR + NI auto-fill, deadline-within-14-day banner. |
| `/app/bad-debt-letter` | `BadDebtLetter.jsx` | Final demand with auto statutory interest (BoE base + 8%) + compensation bands (£40/£70/£100). |
| `/app/pricework-variation-tracker` | `PriceWorkVariationTracker.jsx` | 4-status pipeline, revised contract total, outstanding amount. |
| `/app/tender-letter` | `TenderLetter.jsx` | Formal tender with programme, exclusions, attachments list. |
| `/app/payment-tracker` | `PaymentTracker.jsx` | 16-column payment register with CIS deduction, overdue detection, tax-year summary. |
| `/app/cis-calculator` | `CisCalculator.jsx` | Labour/materials/CIS/VAT breakdown with contractor + HMRC split. |
| `/app/delivery-record` | `DeliveryRecord.jsx` | Items received (short-quantity gold-highlight), driver + receiver dual sig. |
| `/app/labour-allocation` | `LabourAllocation.jsx` | Daily worker allocation; Week Commencing auto-calc to Monday; sites-covered dedupe. |
| `/app/purchase-order` | `PurchaseOrder.jsx` | Itemised order with auto line totals + VAT-aware totals. |
| `/app/dispute-timeline` | `DisputeTimeline.jsx` | Chronological dispute log for legal escalation. |
| `/app/incident-report` | `IncidentReport.jsx` | RIDDOR-friendly incident capture (single event). |
| `/app/incident-log` | `IncidentLog.jsx` | Rolling register of all incidents. |
| `/app/site-access-permit` | `SiteAccessPermit.jsx` | Permit-to-work / visitor access record. |
| `/app/rams-library` | `RamsLibrary.jsx` | Pre-built RAMS templates by trade. |
| `/app/contract-mgmt` | `ContractManagement.jsx` | Master log of every contract on the go. |
| `/app/multiuser-site-diary` | `MultiUserSiteDiary.jsx` | Shared site diary with contributor attribution. |
| `/app/commercial-report` | `CommercialReport.jsx` | Monthly QS-style commercial pack (values, variations, cash position). |
| `/app/new-starter-pack` | `NewStarterPack.jsx` | Induction pack for a new operative (contract + H&S + CSCS check). |
| `/app/rams` | `Rams.jsx` | **Flagship** — the biggest tool in the app. 23 sequentially numbered sections, dynamic hazard cards with L×S scoring, trade-aware placeholders, dual signature. |
| `/app/measurement-record` | `MeasurementRecord.jsx` | Dimensioned schedule of measured works — supports payment applications. |

#### Generic Tools (single-page form driven by `tools-config.js`)
| Route | File | Purpose |
|---|---|---|
| `/app/tool/:toolId` | `GenericToolPage.jsx` | Renders any tool in `TOOLS` array as a form (text / textarea / select / date / time / toggle / checkboxes) → sends to `/api/generate` → displays the LLM output → offers Save / Copy / Download PDF / Email / WhatsApp / SMS. Redirects legacy IDs to their dedicated pages. |

#### Account & Utilities
| Route | File | Purpose |
|---|---|---|
| `/app/profile` | `Profile.jsx` | Company details (name, address, contact, UTR, NI, VAT, CIS status, insurance/CSCS expiry, signature pad, CSCS card upload, bank details, company logo (Enterprise), share-bank-details toggle, delete account). |
| `/app/favourites` | `Favourites.jsx` | Starred tools grid. |
| `/app/history` | `History.jsx` | Every generated document (auto-saved via `/api/generate`). Re-download PDF, delete. |
| `/app/company-checker` | `CompanyChecker.jsx` | Look up UK contractors on Companies House. |
| `/app/offline-mode` | `OfflineMode.jsx` | Cache-first mode for out-of-signal document drafting. Syncs on reconnect. |
| `/app/team` | `TeamManagement.jsx` | Owner/Admin manage seats: invite (Resend email), assign role (admin/manager/member), remove, cancel invite. Manager role is Enterprise-only. |
| `/app/billing` | `Billing.jsx` | Current plan, usage counters (tools/docs this month), Stripe Checkout → Solo/Business/Pro/Enterprise, "Manage subscription" (Stripe Customer Portal), Start Free Trial. |
| `/app/billing/mock-checkout` | `MockCheckout.jsx` | Local dev-only mock Stripe checkout (triggered when `STRIPE_API_KEY=sk_test_emergent`). |
| `/app/privacy` `/app/terms` `/app/complaints` `/app/refund-policy` | corresponding `.jsx` | Static policy pages. |

---

## 3. Tools, Functions, Forms, Database Connections & APIs

### 3.1 Tool Registry (single source of truth)

Every tool is defined in **`/app/frontend/src/lib/tools-config.js`** — a `TOOLS[]` array of shape:
```js
{ id, name, section, info, fields[], promptTemplate, extras? }
```

The **6 tool sections** (plus Account) are declared in `SECTIONS`:
`documents · finance · site · pricework · soletrader · contractors · account`.

**Complete tool inventory (73 tools + 6 WOW + 10 Account = ~89 total items in the sidebar):**

**Documents (20)**
Variation Order · RAMS · Site Diary · Quote Builder · CIS Invoice · Delay Notice · Practical Completion Certificate · Subcontract Letter · Complaint Letter · Timesheet · Daywork Sheet · Application for Payment · Retention Chaser · Final Account Statement · Contra Charge Dispute · Extension of Time Claim · LDs Dispute · Progress Report · Novation Letter · Bad Debt Letter

**Finance (8)**
Payment Chaser · CIS Calculator · Self Assessment Prep · Price Work Quote · Earnings Dashboard · Mileage Tracker · VAT Threshold Advisor · CIS Refund Predictor

**Site Tools (22)**
Photo Evidence Log · Verbal Instruction Recorder · Contract Review · Dispute Timeline · Incident Report · Reminders · Toolbox Talk · Asbestos Record · Snagging List · Site Access Permit · Measurement Record · Weather Log · Pre-Start Meeting Checklist · Meeting Notes · Delivery Record · Tool and Equipment Register · Procurement Schedule · Risk Register · Variation Instruction Log · COSHH Assessment · Noise Assessment · Manual Handling Assessment · Working at Height Rescue Plan

**Price Work (4)**
Scope of Works · Price Work Variation Tracker · Standing Time Calculator · Price Work Profit Calculator

**Sole Trader (4)**
HMRC Correspondence · Reference Letter · Rate Increase Letter · Apprentice Manager

**Subcontractor Tools / Contractors (17)**
Subcontractor Management · Variation Tracker · RAMS Library · Contract Management · Multi-User Site Diary · Payment Tracker · Incident Log · Labour Allocation · Purchase Order · Subbie Payment Certificate · H&S Policy · Subbi Compliance Checker · Commercial Report · Defects Tracker · New Starter Pack · Hire Agreement · Tender Letter

**WOW Tools (6)** — routed to dedicated pages (not driven by `promptTemplate`)
Verbal to Variation · Photo to Document · Site Photo Library · Drafts · Tax Pot · Company Checker

**Account (10)**
Favourites · Document History · Plan & Billing · Team Management · My Profile · Privacy Policy · Terms & Conditions · Complaints · Refund Policy · Offline Mode

### 3.2 Form Field Types (`tools-config.js` helpers)

| Helper | Field Type | Notes |
|---|---|---|
| `f(name, label, type, placeholder)` | text/number/date/time/datetime-local | Required |
| `fo(...)` | same as `f` | Optional (Generate button does not gate) |
| `ta(...)` / `tao(...)` | textarea | Required / Optional |
| `sel(name, label, options)` | select dropdown | Options can be `["A","B"]` or `[{label,value}]` |
| `cbg(name, label, options)` | checkboxes | Multi-select group |
| `tgl(name, label)` | Yes/No toggle |  |
| `fp(name, label, prefill, type)` | text/date/time | Auto-prefills from `today`, `today+30d`, `profile:field`, etc. |
| `fpo(...)` | prefilled + optional |  |

Auto-prefill keys (handled in `GenericToolPage.jsx`): `today`, `today+7d`, `today+14d`, `today+30d`, `today+365d`, `profile:<fieldName>`.

### 3.3 Global Cross-Cutting Systems

| System | File | What it does |
|---|---|---|
| Auth context | `lib/auth.jsx` | React Context: `useAuth()` → `{user, token, persist, logout, loading}`. Reads token from localStorage on mount, calls `/api/auth/me`. |
| API client | `lib/api.js` | Axios instance targeting `REACT_APP_BACKEND_URL/api`. Injects Bearer token on every call. |
| Drafts | `lib/drafts.js` + `hooks/useToolDraft.js` | `saveDraft` / `fetchDraft` / `listDrafts` / `deleteDraft` — CRUD against `/api/drafts`. Every dedicated tool has a `<DraftSaveButton>` and reads `?draftId=` on mount. |
| PDF core | `lib/pdf.js` | Morris-branded jspdf renderer (header with logo, gold rule, single/dual sign-off boxes, footer with ref + author + page numbers, optional photo annex). |
| RAMS PDF | `lib/rams-pdf.js` | Bespoke RAMS renderer (23 sections, auto-numbered via `state.sectionNum`, risk-band colouring). |
| Profile PDF | `lib/profilePdf.js` | Shareable profile card. |
| Refund summary PDF | `lib/refundSummaryPdf.js` | CIS refund pack emailed to accountant. |
| Notifications | `lib/notifications.js` + `NotificationBell.jsx` | Bell UI + storage of `{id, title, body, ts, read}`. |
| Alerts engine | `lib/alerts.js` (+ `alerts-seed.js`) | Runs on app load — checks localStorage tool data for expiring insurance/CSCS/RAMS review dates, overdue payments, PAT expiry, etc. Fires notifications. |
| Tool persistence | `lib/tool-persistence.js` | `saveToolData(toolId, records)` — writes tool records to localStorage under `morris_tool_data_v1` so alerts.js can read them across sessions. |
| Trade recommendations | `lib/trade-recommendations.js` | Maps a trade to a curated list of tool IDs → drives the "Recommended for Electrician" dashboard grid. |
| Finance calcs | `lib/finance.js` | Pure calculators (CIS deduction, VAT, NI 8% tax pot, statutory interest). |
| Manual-handling placeholders | `lib/manual-handling-placeholders.js` | Trade → example lift text (Duct Fitter → "Carrying duct sections up stairs, two-person lift", Electrician → "Carrying cable drums…", etc.) |
| Session timeout | `components/SessionTimeout.jsx` | Logs the user out after inactivity; shows a warning modal first. |
| Command palette | `components/CommandPalette.jsx` | ⌘K / Ctrl+K global tool search + jump. |
| Onboarding tour | `components/OnboardingTour.jsx` | 6-step guided welcome overlay on first login. |
| Trade switcher | `components/TradeSwitcher.jsx` | Modal to change your active trade on the fly (updates personalisation everywhere). |

### 3.4 Database — MongoDB Collections

Configured via `MONGO_URL` + `DB_NAME` in `/app/backend/.env`.

| Collection | Key Fields | Populated by |
|---|---|---|
| `users` | `id, username, email, password (bcrypt), phone, verified, otp, token, trade, companyName, fullName, address, contactNumber, utr, nationalInsuranceNumber, companyRegNumber, vatNumber, vatRegistered, cisStatus, insuranceExpiry, cscsExpiry, vehicleReg, signature (base64 PNG), signatureRole, cscsCardFront, cscsCardBack, companyLogo, sortCode, accountNumber, bankName, shareBankDetails, stripeCustomerId, stripeSubscriptionId, plan, planExpiresAt, isAdmin, isUnlimited, favourites[], recentlyUsed[], docCounters{}, usageDocs, usageTools, usageMonth, jobCounter, teamOwnerId, teamRole, lastActiveAt, createdAt` | Signup / Profile Update / Login / Team Invite / Billing / any endpoint that touches user state |
| `password_reset_tokens` | `token, userId, method (email/phone), email/phone, code, expiresAt, used, usedAt` | `/api/auth/forgot-password` |
| `documents` | `id, userId, title, toolId, refNumber, jobId, content, metadata, autoSaved, createdAt` | `/api/generate` (auto-save) + `/api/documents/save` (manual) |
| `jobs` | `id, userId, ref (JOB-XX-NNNN), status, clientName, address, contractValue, startDate, expectedCompletion, notes, disputeNote, paidDate, createdAt` | `/api/jobs` endpoints |
| `drafts` | `id, userId, toolId, toolName, title, data{}, createdAt, updatedAt` | `/api/drafts` endpoints |
| `cis_payments` | `id, userId, date, contractor, grossLabour, materials, cisRate, deduction, gross, net, notes, createdAt, updatedAt` | `/api/cis/payments` endpoints |
| `expenses` | `id, userId, date, category, description, amount, notes, source, createdAt` | `/api/expenses` |
| `team_invites` | `token, ownerId, ownerUsername, email, role, expiresAt, accepted, acceptedAt, acceptedBy, createdAt` | `/api/team/invite` + `accept-invite` |
| `payment_transactions` | Stripe transaction log | `billing.py` webhook |

Indexes created on startup: `users.username` (unique), `users.email` (unique sparse), `password_reset_tokens.token`, etc.

### 3.5 Backend REST API (all prefixed `/api`)

Base file: `/app/backend/server.py` (main) + `/app/backend/billing.py` (Stripe).

#### Auth
- `POST /api/auth/signup` — creates a user, returns OTP in response body (demo mode).
- `POST /api/auth/verify-otp` — verifies OTP, issues Bearer token.
- `POST /api/auth/login` — accepts username OR email + password.
- `GET /api/auth/me` — returns current user profile.
- `POST /api/auth/forgot-password` — email path (sends Resend link) or phone path (returns demo code).
- `POST /api/auth/reset-password` — accepts token OR phone+code + newPassword.
- `POST /api/profile/update` — patch any profile field.
- `DELETE /api/account/delete` — GDPR delete (removes users + documents + cis_payments + reset tokens + payment_transactions).

#### AI & Vision
- `POST /api/vision/extract` — Claude Vision OCR + scene description of an uploaded photo (used by Photo to Document).
- `POST /api/generate` — the workhorse. Runs plan/usage gates via `check_can_generate`, resolves unique ref number via `next_ref_number` (per-user, per-tool, per-day counter with custom formats for QB, VO, INV, SNG, PR, EOT, PCC), builds a big system prompt including profile block + bank block (for allowlisted tools) + banned-word rules + mandatory sign-off block (single or dual), sends to `claude-sonnet-4-5-20250929`, post-processes to strip em/en-dashes and consultant phrases, forces NI number on CIS invoices, records usage via `record_usage`, auto-saves the doc to the vault.

#### Documents
- `POST /api/documents/save` — manual save.
- `GET /api/documents` — list current user's docs (newest first, 500 cap).
- `DELETE /api/documents/{doc_id}` — delete.

#### Jobs (Job Tracker)
- `POST /api/jobs` — create, auto-assigns `JOB-{initials}-{seq:04d}`.
- `GET /api/jobs` — list.
- `GET /api/jobs/{jobId}` — job + linked documents.
- `PATCH /api/jobs/{jobId}` — update (validates `status ∈ {active, invoiced, paid, completed, disputed}`).
- `DELETE /api/jobs/{jobId}` — deletes, orphans linked documents.

#### CIS Payments (used by CIS Refund Predictor)
- `POST /api/cis/payments` — server-authoritative recomputation of `deduction` = `grossLabour × cisRate`, `gross` = `grossLabour + materials`, `net` = `gross − deduction`.
- `GET /api/cis/payments` — list with backfill of legacy records.
- `PUT /api/cis/payments/{pid}` — edit (same server-side recomputation).
- `DELETE /api/cis/payments/{pid}` — delete.
- `POST /api/cis/refund-summary/email` — accepts base64 PDF (max 8MB), forwards to accountant via Resend.

#### Drafts
- `GET /api/drafts` — list (no `data` field to keep response small).
- `GET /api/drafts/{draftId}` — full draft with `data`.
- `POST /api/drafts` — create OR update (if `draftId` provided).
- `DELETE /api/drafts/{draftId}` — delete.

#### Expenses
- `POST /api/expenses` · `GET /api/expenses` · `DELETE /api/expenses/{eid}` — manual expense entries (categories: tools, fuel, ppe, training, insurance, accountant, phone, marketing, materials, mileage, other).

#### Team Management (Business+, Pro+, Enterprise)
- `POST /api/team/invite` — owner/admin only, honours plan seat limits + role restrictions (Manager = Enterprise only), sends Resend invite email.
- `POST /api/team/accept-invite` — invitee creates username/password, skips OTP.
- `GET /api/team/members` — list members + pending invites + seat usage.
- `PATCH /api/team/members/{memberId}` — change role (`admin/manager/member`).
- `DELETE /api/team/members/{memberId}` — remove (data preserved, session invalidated).
- `DELETE /api/team/invites/{inviteToken}` — cancel pending invite.

#### Billing (via `billing.py`)
- `POST /api/billing/checkout` — create Stripe Checkout Session for `{solo, business, pro, enterprise}`.
- `POST /api/billing/portal` — Stripe Customer Portal (manage/cancel subscription).
- `POST /api/billing/start-trial` — 3-day free trial (once per account).
- `GET /api/billing/status` — current plan + expiry + usage.
- `POST /api/billing/mock-complete?session_id=...&plan=...` — mock activation in dev.
- `POST /api/webhooks/stripe` — Stripe webhook (public route).

#### Health
- `GET /api/` — `{app: "Morris API", status: "ok"}`.

### 3.6 Third-Party Integrations

| Service | File | Purpose | Config |
|---|---|---|---|
| **Anthropic Claude** (`claude-sonnet-4-5-20250929`) | `emergentintegrations` (Emergent LLM Key) | Every document `POST /api/generate` + Photo-to-Document vision | `EMERGENT_LLM_KEY` in `backend/.env` |
| **Resend** | `email_helper.py` | Welcome email, password reset, admin signup alerts, subscription receipts, CIS refund PDF to accountant, team invites | `RESEND_API_KEY` in `backend/.env` |
| **Stripe** | `billing.py` | Live subscriptions (Solo £29 / Business £39 / Pro £59 / Enterprise POA), Customer Portal, webhooks | `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_*` |
| **MongoDB** | Motor driver | Persistence | `MONGO_URL`, `DB_NAME` |
| **Twilio SMS** | *not implemented* | OTP delivery **MOCKED** — OTP returned in signup response | — |
| **Web Speech API** | *not implemented* | Voice → text in Verbal-to-Variation **MOCKED** — falls back to text input | — |

---

## 4. Icons & Actions Reference

Morris uses the **lucide-react** icon library everywhere (never emoji as UI icons — emoji only appear as tool-badges inside the sidebar). Every interactive element has a `data-testid`.

### 4.1 Sidebar (`AppShell.jsx`)

| Icon | Element | Action |
|---|---|---|
| Morris Logo | `[data-testid="sidebar-home"]` link | Navigate to `/app` (Dashboard) |
| **Bell** (`Bell`) | `NotificationBell` — desktop + mobile | Opens notification drawer (unread alerts, mark-all-read) |
| **X** (`X`) | `[data-testid="sidebar-close-mobile"]` | Close mobile sidebar |
| **Search** (`Search`) | Search box | Filter tool list live by name |
| **⌘K** badge | Global keyboard shortcut hint | Cmd/Ctrl+K opens Command Palette |
| **Briefcase** (`Briefcase`) | `[data-testid="sidebar-jobs"]` | Navigate to `/app/jobs` (Job Tracker) |
| **Clock** (`Clock`) | "Recently Used" section header | (visual only) |
| **ChevronDown / ChevronRight** | Sidebar section headers | Collapse / expand section |
| **User** (`User`) | Footer identity block | Displays logged-in username |
| **LogOut** (`LogOut`) | `[data-testid="sidebar-logout"]` | Logs out, redirects to `/` |
| **HardHat** (`HardHat`) | `[data-testid="sidebar-trade-switch"]` | Opens TradeSwitcher modal to change active trade |
| Menu (`Menu`) | `[data-testid="mobile-menu-open"]` (mobile top bar) | Opens mobile sidebar drawer |

### 4.2 Dashboard (`Dashboard.jsx`)

| Icon | Card / Button | Action |
|---|---|---|
| **HardHat** | Welcome header + "Recommended for {trade}" section title | Personalisation cue |
| **TrendingUp** | KPI card + "Log mileage" Quick Action | Navigate to `/app/mileage` |
| **Wallet** | Earnings KPI | Navigate to `/app/earnings` |
| **PiggyBank** | Tax Pot KPI | Navigate to `/app/taxpot` |
| **Gauge** | VAT KPI | Navigate to `/app/vat` |
| **ShieldCheck** | Insurance expiry card | Navigate to `/app/profile` |
| **IdCard** | CSCS expiry card | Navigate to `/app/profile` |
| **AlertTriangle** | Self Assessment countdown card | Navigate to `/app/tool/self-assessment-prep` |
| **Briefcase** | "Jobs" Quick Action | `/app/jobs` |
| **Receipt** | "New invoice" Quick Action | `/app/tool/cis-invoice` |
| **Plus** | "New variation" Quick Action | `/app/tool/variation-letter` |
| **Hammer** | "New RAMS" Quick Action | `/app/tool/rams` |
| **FileText** | "Recent documents" section header | Navigate to `/app/history` (per row) |
| **ArrowRight** | Recent document row | Jump to `/app/history` |
| **Mic** | "Verbal to Variation" WOW card | `/app/wow/verbal-to-variation` |
| **Camera** | "Photo to Document" WOW card | `/app/wow/photo-to-document` |
| **Calculator** | "CIS Refund Predictor" WOW card | `/app/cis-predictor` |
| **Star** | Favourites section header | (visual) |

### 4.3 Tool Header (`ToolHeader.jsx`) — appears on every generic tool page

| Icon | Button | Action |
|---|---|---|
| **Info** | `[data-testid="tool-info-btn"]` | Opens the tool's Info popup (with disclaimer badge: H&S / Legal / Tax / Standard) |
| **Star** (filled when active) | `[data-testid="tool-fav-btn"]` | Toggle favourite → updates `user.favourites` server-side |
| **Save** | `[data-testid="action-save"]` | Manual save the generated document to History |
| **Copy** | `[data-testid="action-copy"]` | Copy full document text to clipboard |
| **Download** | `[data-testid="action-pdf"]` | Generate + download Morris-branded PDF (with photos annex if attached) |
| **Mail** | `[data-testid="action-email"]` | Open mailto: with subject + body pre-populated |
| **MessageCircle** ×2 | `[data-testid="action-wa-text"]` + `action-wa-pdf` | WhatsApp text share / WhatsApp with PDF attached |
| **MessageSquare** | `[data-testid="action-sms"]` | SMS text share |
| **Loader2** | (spinning) | Shown when a background action is in flight |
| **AlertTriangle** | Missing-fields banner | Tells user which required fields are blank |
| **HardHat** | "Personalised for {trade}" pill | (visual) |

### 4.4 Notification Bell (`NotificationBell.jsx`)

| Icon | Action |
|---|---|
| **Bell** | Toggle notification popover |
| Red dot | Unread count badge |
| **Check** | Mark single alert as read |
| **CheckCheck** | "Mark all as read" |
| **X** | Dismiss / close bell popover |
| **ExternalLink** | Jump to source tool for the alert |

### 4.5 Profile (`Profile.jsx`)

| Icon | Element | Action |
|---|---|---|
| **AlertTriangle** | Missing-mandatory-fields banner | Tells the user which profile fields still need filling |
| **PenTool** | Signature pad section | Draw + save signature (base64 PNG) |
| **Upload** | CSCS card / Company logo upload buttons | Uploads image → base64 → server |
| **IdCard** | CSCS card section header | (visual) |
| **Building2** | Company details section | (visual) |
| **Info** | Tooltip triggers next to sensitive fields | Explains why Morris needs the field |
| **Share2** | "Share profile" button | Generate a shareable profile PDF (`profilePdf.js`) |
| **Download** | Download signature / profile PDF | Client-side jspdf |
| **Mail** / **MessageCircle** / **MessageSquare** | Share profile via email / WhatsApp / SMS |  |
| **Trash2** | "Delete account" button | Confirms then calls `DELETE /api/account/delete` |

### 4.6 Landing (`Landing.jsx`)

| Icon | Section |
|---|---|
| **HardHat** | Hero anchor + section badges |
| **Mic** / **Camera** / **Calculator** | 3 WOW-tool teaser cards |
| **ShieldCheck** | UK compliance callout |
| **FileText** | "80+ tools" section |
| **PoundSterling** | Pricing tile |
| **CheckCircle2** | Feature bullet points |
| **ArrowRight** | CTA buttons ("Get started", "See tools") |

### 4.7 Common Interactive Elements (repeated across every tool page)

| Icon | Behaviour |
|---|---|
| **Plus** | Add row / add item / add hazard / add worker |
| **Trash2** | Remove row / delete draft / delete CIS payment |
| **ChevronDown / ChevronRight** | Collapse / expand a section |
| **Eye / EyeOff** | Password field show/hide toggle (`PasswordInput.jsx`) |
| **X** | Close a modal / dismiss a banner |
| **AlertTriangle** | Warning banners (gold) — e.g. deadline < 14 days, PAT expired, High residual risk |
| **ShieldAlert** | RAMS hazard section header |
| **Download** | Any PDF export |
| **Send / Mail** | Send / email actions |
| **Search** | Any filter box (Site Photo Library, History, Command Palette) |
| **Settings** (`SettingsIcon`) | Profile / preferences links |
| **ExternalLink** | External URLs (gov.uk, HSE, HMRC deep links) |

---

## 5. Notable Business Rules Encoded in the Product

- **UK statutory correctness**: Mileage 45p (never 55p), HMRC bank base rate + 8% interest, £40/£70/£100 statutory compensation bands, HSE noise bands (80/85/87 dB), HSE manual-handling bands (16 kg / 25 kg), Manager role gated to Enterprise plan, Solo plan single-user.
- **Plain construction English**: Global backend banned-word filter — `facilitate`, `utilise`, `endeavour`, `kinetic`, `prior to`, `operatives are advised`, etc. are stripped/replaced post-LLM.
- **Sign-off blocks**: Mandatory. Single (`SINGLE_SIGNOFF_TOOLS`) or Dual (`DUAL_SIGNOFF_TOOLS`) — enforced in the backend prompt.
- **Bank details** appear only on 10 allowlisted tools (invoicing, applications, retention, final account, bad debt, chaser, quote, subbie payment).
- **Free tier limits**: 3 different tools + 5 documents per calendar month; `/api/generate` returns HTTP 402 when exceeded.
- **Unique document refs**: Per-user, per-tool, per-day counter. Custom formats for Quotes (`QB-YYYY-NNN`), Variations (`VO-NNN`), Invoices (`INV-YYYY-NNN`), PCC, EOT, SNG, PR.
- **Auto-review dates**: RAMS/COSHH/H&S get today+365d; Site Diary is exempt (daily record only).
- **NI number safety net**: CIS Invoice always renders NI No under UTR — hard-coded post-processor.
- **Review-required tools**: 12 tools (RAMS, COSHH, Noise, Manual Handling, WAHR, HMRC Correspondence, H&S Policy, Hire Agreement, Subcontract Letter, New Starter Pack, Apprentice Manager, Subbie Compliance Checker) require the user to tick a "reviewed" checkbox before download/share.

---

## 6. Environment & Configuration

**Backend `.env`**
`MONGO_URL`, `DB_NAME`, `EMERGENT_LLM_KEY`, `RESEND_API_KEY`, `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_SOLO`, `STRIPE_PRICE_ID_BUSINESS`, `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_ENTERPRISE`, `APP_URL`, `CORS_ORIGINS`.

**Frontend `.env`**
`REACT_APP_BACKEND_URL` (Kubernetes ingress URL — all `/api/*` traffic routed to backend:8001).

**Colour palette**
- Ink: `#060606` (background), `#121212` (cards), `#F0EDE8` (primary text)
- Muted text: `#A19D94`, `#706D66`
- Signature gold: `#E8A020`
- Success green / gold warn / red alert bands (used in RAMS + risk registers).

**Typography**
- Body: system sans (`font-body`).
- Display: bespoke display font applied via `.font-display` class (used for headings like "Built by a tradesman, for tradesmen").

---

*Document generated Feb 2026 based on the current Morris codebase (preview environment).*
