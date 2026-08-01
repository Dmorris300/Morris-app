# Morris Development Audit & Upgrade Timeline

**Definitive single source of truth for Morris development history.**

Source of truth: **git log** (via `git log --format="%ai" --stat`). Any date that
disagrees with git is treated as inaccurate — including previous PRD notes that
carried hallucinated dates.

Development window (from git): **14 May 2026 → 1 Aug 2026** (145 commits).

_Update this file whenever a new tool receives a V2 upgrade — always cross-check the
new entry against `git log` before writing a date._

---

## Chronology of major upgrades (real git dates)

### 🟡 Foundation — May 2026

- **14 May 2026** — Initial commit / scaffold (`3bf61b9`).
- **17 May 2026** — First real production burst:
  - Password-reset flow (`ForgotPassword.jsx`, `ResetPassword.jsx`) + email helper + backend endpoints.
  - Core scaffold landing: `AppShell.jsx`, `ToolHeader.jsx`, `MorrisLogo.jsx`, `pdf.js`, `auth.jsx`, `api.js`, `tools-config.js` (256 lines), `Dashboard`, `Landing`, `Login`, `Signup`, `SelectTrade`, `Favourites`, `History`, `Earnings`, `Profile`, plus first tools: `CISRefundPredictor`, `MileageTracker`, `PhotoToDocument`, `VatThreshold`, `VerbalToVariation`.
- **18 May 2026** — Billing v1 (`billing.py`, `Billing.jsx`, `MockCheckout.jsx`), email helper, `TradeSwitcher`, trade recommendations, first tests (`test_billing_and_limits.py`), tools-config expansion.
- **19 May 2026** — Legal & UX layer: `AppFooter`, `CookieBanner`, `CinematicIntro`, `SessionTimeout`, `Complaints`, `PrivacyPolicy`, `RefundPolicy`, `TermsConditions`, account-delete flow.
- **20 May 2026** — Cinematic Intro polish (3 iterations), CIS Refund Predictor big upgrade (+109 lines).
- **25 May 2026** — **Big feature day (10 commits)**: Jobs system (`Jobs.jsx` +223, `JobDetail.jsx` +159, `/api/jobs` endpoints), Dashboard v2 (+229 lines), Mileage Tracker rebuild (+276 lines), Company Checker + Tax Pot + Offline Mode, tools-config +323 lines, Phase 1 admin + reference-number backend.
- **26–27 May 2026** — Billing tightening, `manifest.json` PWA scaffold.
- **28 May 2026** — Onboarding Tour, Command Palette, Breadcrumbs, Company Checker, Offline Mode page, Tax Pot page, VAT Threshold rework.
- **30 May 2026** — Photo-to-Document overhaul (+274 to −), `LiveSignatureBlock`, profile PDF, Landing polish, prompt hardening (16 commits).
- **31 May 2026** — Finance system pass: `lib/finance.js` (+103), CIS Refund Predictor (+286), Earnings (+320), TaxPot rework, JobDetail extended, tests (`test_finance.py` +256).

### 🟢 Tool build-out — June 2026

- **5 Jun 2026** — CIS Refund Summary PDF (`refundSummaryPdf.js` +249).
- **13 Jun 2026 (Mega Tool Day — 35 commits)** — dedicated pages built for: CIS Calculator, Payment Tracker (+511), Tender Letter (+435), Price Work Variation Tracker (+476), Bad Debt Letter (+538), Contract Review (+401), HMRC Correspondence (+445), Snagging List (+465), Rate Increase Letter (+418), Price Work Quote (+548), Apprentice Manager (+494), and more.
- **14 Jun 2026 (Notifications + Tools Day — 14 commits)** — Notification stack: `alerts.js` (+581), `alerts-seed.js`, `NotificationBell` (+169), `notifications.js`, `notification-triggers.js` (+216), `tool-persistence.js`. Tools: `NewStarterPack` (+590), `CommercialReport` (+442), `MultiUserSiteDiary` (+506), `ContractManagement` (+540), `RamsLibrary` (+479), `SiteAccessPermit` (+599), `IncidentLog` (+468).
- **20 Jun 2026** — Landing polish, password input UX, Site Photo Library v1 (+230), Photo to Document big update (+376), **RAMS v1** (`Rams.jsx` +782, `rams-pdf.js` +550), CIS Refund Predictor (+450).
- **21 Jun 2026** — RAMS + Profile tweaks.
- **22 Jun 2026** — **Drafts system**: `drafts.js`, `useToolDraft.js`, `DraftSaveButton`, `Drafts.jsx` (+174 lines) with draft-save wiring into ~14 tools. RAMS supplementary sections rendered in PDF (`rams-pdf.js` +186, tests iter_10 pass).

### 🟠 RAMS V2 + Payment Chaser V2 — July 2026

- **19 Jul 2026** — Site Photo Library big expansion (+414). `MORRIS_DOCUMENTATION.md` (+470) drafted.
- **20 Jul 2026 (Tools + RAMS + Chaser Day — 10 commits)**:
  - `5fcd78d` (02:14) — Emergent cron infrastructure; `MORRIS_RAMS_ANALYSIS.md` (+505) drafted.
  - `bd51143` (12:09) — **RAMS V2**: `Rams.jsx` (+171), `rams-pdf.js` refactor, backend endpoints, iter_11 tests pass.
  - `75f00ba` (12:10) — PRD note-only update.
  - `eecdd27`, `3cda797`, `c6d1209`, `cc0ceab` (13:32–15:34) — **Tool-wiring sweep**: cumulative +335 lines across `tools-config.js` with matching backend routes in `server.py`.
  - `4d6f8c8` (15:10) — Contract Review small fix.
  - `aef2712` (15:50) — **Payment Chaser V2** (+251).
  - `a7c2095` (16:08) — Payment Chaser polish + Payment Tracker link.

### 🔴 V2 Architectural Push — 1 Aug 2026 (11 commits)

- `99fec3c` — **Photo Vault Phase 1**: `photo_vault.py` (+453) with Emergent Object Storage, `AttachMedia.jsx` (+239) component wired into 8 tools (CommercialReport, ContractReview, GenericToolPage, IncidentReport, MultiUserSiteDiary, PaymentChaser, Rams, SiteAccessPermit, SnaggingList), `media.js` (+184), `media-offline-queue.js` (+110), `PhotoVault.jsx` (+548), `SitePhotoLibrary.jsx` retired (−592), tests iter_12.
- `1b86072` — PRD update.
- `b4113f4` — **Photo Vault Phase 2**: PDF Evidence Embedding + inline project creation; `ToolHeader.jsx` (+40), `media.js` (+37), `PhotoVault.jsx` (+43).
- `ddfaad1` — **Job Tracker → Vault deep-linking** in `JobDetail`, `Jobs`, `PhotoVault`.
- `95aea9a` — **Photo Vault Hardening**: albums, tool stamping, `getDocumentMedia`; `photo_vault.py` (+46), `PhotoVault.jsx` (+84).
- `0a9ae72` — `COMMAND_CENTRE_V2_SPEC.md` (+352) authored.
- `d8d436c` — **Command Centre V2**: `command_centre.py` (+315), `/api/attention`, `Dashboard.jsx` full rewrite (+623/−), `Hubs.jsx` (+150, stubs), `AttentionPage.jsx` (+61).
- `2fa4d13` — `PROJECT_WORKSPACE_SPEC.md` (+387) authored.
- `491f309` — **Project Workspace V2**: `project_workspace.py` (+368) with tasks/events/stats APIs, `JobDetail.jsx` full rewrite (+638) — 7-tab digital site folder.
- `92dde9f` — Initial audit doc (`MORRIS_AUDIT_TIMELINE.md`) created (this file — now corrected).

---

## Outstanding (priority-ordered)

### P0
1. Compliance Hub buildout (credentials dashboard replacing tile stubs)
2. Finance Hub buildout (live counts + tax pot/CIS integration)
3. Toolbox Talks V2 (dedicated rebuild)
4. COSHH V2 (dedicated page)
5. Settings V2 (Profile / Company / Branding / Notifications / Export / Backup / Subscription / Security tabs)

### P1
6. Global Search (cross-project)
7. Commercial Reports V2 (living register)
8. Incident Report V2 (RIDDOR flow)
9. Document Library V2 (filters + bulk actions)
10. Notifications V2 (unified alerts feed, `saveToolData` on remaining tools)
11. Business Hub live counts
12. Tools Library polish (search + favourites)

### P2
13. Site Access Permit V2
14. Method Statements (split from RAMS)
15. Job Tracker polish (pinned projects, live status counts)
16. Export Centre (project ZIP)
17. Real Twilio SMS OTP (replace mock)
18. Real Web Speech API for Verbal-to-Variation (replace mock)

---

## Note on prior date hallucinations

The previous revision of this file (and portions of `/app/memory/PRD.md`) carried
dates like "12 Feb 2026", "13 Feb 2026 (Rebuild Day)", "20 Feb 2026", "21 Feb 2026",
and "22 Feb 2026". Those dates were **inaccurate** — the corresponding work
actually landed in **June–August 2026** per git log. The correct mapping:

| Old (wrong) label      | Actual dates (git)                     |
|------------------------|----------------------------------------|
| "12 Feb — CIS Invoice" | Around 20 Jun 2026 (Rams + tools day)  |
| "13 Feb — Rebuild Day" | 13 Jun 2026 (35-commit mega day)       |
| "20 Feb — Prompt Day"  | Blends into 20 Jun & 20 Jul 2026 work  |
| "21 Feb — V2 Day"      | 1 Aug 2026 (V2 architectural push)     |
| "22 Feb — RAMS PDF"    | 22 Jun 2026 (RAMS supplementary PDF)   |

Always trust `git log` over any narrative dates in `PRD.md` chat history.
