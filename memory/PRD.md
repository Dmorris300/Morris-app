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
