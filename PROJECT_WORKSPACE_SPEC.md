# MORRIS PROJECT WORKSPACE — Product Specification

## Objective

Build a dedicated **Project Workspace** that becomes the central hub for every construction project in Morris.

The mental shift we're driving: users stop thinking *"I'm opening a RAMS"* or *"I'm opening an invoice"* and start thinking *"I'm opening my job."* Every document, photo, payment, report and task belongs to a project first, and to a tool second.

The Project Workspace is the **third pillar** of Morris after the Command Centre and the Photo Vault. It replaces `/app/jobs/:id` (Job Detail) as the deep-project experience.

---

## Terminology reconciliation

The codebase already uses **`Job`** as the primary entity (`/api/jobs`, `Jobs.jsx`, `JobDetail.jsx`, `db.jobs`, `job.id`, `jobId` on media items). The spec uses **"Project"**. **These are the same thing.**

**Decision**: keep the backend `Job` model and route as-is (no rename churn), but relabel the user-facing surface as **"Project"** and **"Project Workspace"**. Existing routes stay live; the enriched detail experience takes over `/app/jobs/:id`.

Any new API additions live under `/api/jobs/{id}/...` (not `/api/projects/...`) to stay consistent.

---

## Existing Codebase Anchors

- Backend Job model: `/app/backend/server.py` around line 152. Current fields: `id, userId, ref, clientName, address, status, contractValue, createdAt, updatedAt` (and increasingly: `dueDate`, `chaseHistory`).
- Job Detail page: `/app/frontend/src/pages/JobDetail.jsx`. Photo Vault chip is already in place there.
- Photo Vault: fully live — media items already link to jobs via `jobId`.
- Command Centre V2: live — homepage sections + `/api/attention` endpoint. Attention items already include `projectId` and `actionRoute`.
- Drafts: `/api/drafts` — every draft can carry `jobId` inside `data.jobId`.
- Saved documents: `/api/documents` collection. Currently no `jobId` linkage — needs it.
- Brand tokens and testid conventions: identical to Command Centre V2 spec.

---

## Project Creation

The existing job creation modal in `Jobs.jsx` collects `clientName` + `address` only. Expand it to capture the full project intake used by the Workspace.

**Required fields**
- Project Name (`projectName` — displayed as the primary card title; falls back to `clientName` if blank for backward compatibility)
- Client Name
- Company (client's company; optional)
- Site Address
- Site Manager (free text)
- Client Contact (name + phone/email — one line, flexible)
- Start Date
- Expected Completion Date
- Project Status (see status list below)
- Contract Value (£, integer)
- Purchase Order Number (optional)
- Project Notes (multi-line free text)

**Optional at creation, editable later**
- Retention % held
- Payment terms (Net 30, Net 14, etc.)
- Pin project (surfaces in Command Centre Recent Projects → Pinned)

**Data migration**
- Existing jobs without the new fields render as normal — every new field is optional at the DB level. No back-fill required.

---

## Project Overview (default view when you open the workspace)

Rendered at `/app/jobs/:id` (upgrade the current JobDetail.jsx). Layout:

**Header row**
- Project Name (H1) + client name (below, muted)
- Status pill
- Actions: `View project photos`, `Add document`, `Edit`, `Archive`

**Summary tiles (4-column on desktop, 2×2 on mobile)**
- Contract Value
- Amount Paid (sum of `payment_received` events)
- Outstanding Balance (Contract Value + open variations − Amount Paid)
- Duration and Days Remaining (from Start/Expected Completion)

**Two sub-tiles**
- Progress (see calculation below)
- Project Health (see calculation below)

**Latest activity** — last 3 timeline events in a compact list.

### Progress calculation

- If Completed → 100%
- Else if Expected Completion Date is set → `(days_elapsed / total_days) * 100`, clamped 0–100
- Else if no dates → derived from tasks: `completed_tasks / total_tasks * 100`
- Else → hidden

### Project Health calculation (deterministic — never guessed)

`Health = "healthy" | "watch" | "at_risk"` computed from:

- **at_risk** if any of:
  - Invoice on this job overdue > 14 days
  - `days_remaining < 0` (past expected completion) and status is `Active`
  - Any compliance certificate for this project expired
- **watch** if any of:
  - Invoice overdue by 1–14 days
  - `days_remaining` between 0 and 7 while status is `Active`
  - Variation awaiting approval > 14 days
- **healthy** otherwise

Displayed as a pill in the Overview.

---

## Workspace Navigation

Rendered as a horizontal tab bar under the Overview header. On mobile, tabs collapse into a sticky segmented control. Tabs:

1. **Overview** — the summary described above
2. **Documents** — every generated + saved doc linked to this project
3. **Photo Vault** — inline embed of `<PhotoVault jobId={id} />` (or deep-link to `/app/photo-vault?jobId=<id>` which we already support)
4. **Finance** — the financial breakdown for this project
5. **Tasks** — the task board
6. **Timeline** — chronological event stream
7. **Team** — future-ready skeleton (see below)

### Documents tab

Filtered feed of:
- Saved documents (from `/api/documents`) where `jobId = <id>`
- Drafts (from `/api/drafts`) where `data.jobId = <id>`
- Grouped by tool category (Safety / Commercial / Site records / Financial)
- Click a doc → opens the History detail view (already exists)
- Click a draft → resumes it in its tool page
- Empty state: `No documents yet. Create one from Quick Actions or the Tools Library.`

### Photo Vault tab

- Iframe-style embed OR full-page link that opens `/app/photo-vault?jobId=<id>` and returns via back-button (simpler v1).
- The Vault already scopes to jobId, so no new work here.

### Finance tab

- Contract Value (editable inline)
- Amount Paid (auto-computed from timeline `payment_received` events; users can also record a payment via a button)
- Outstanding Balance (auto)
- Retention held (from project fields)
- Open Variations count + total value (sum of variation-letter drafts + saved docs with `data.jobId`)
- Applications for Payment issued (count + total)
- Payment History (chronological list of received payments)
- Payment Chasers issued (count + last chase date)
- Button: `Chase this invoice` → opens Payment Chaser pre-linked

### Tasks tab (new concept — needs a data model)

**New MongoDB collection: `project_tasks`**
```
{ id, userId, jobId, title, description?, status, createdAt, updatedAt, dueDate?, completedAt?, kind? }
```

- `status`: `not_started` | `in_progress` | `completed`
- `kind`: optional preset (`site_diary`, `upload_photos`, `generate_invoice`, `complete_snagging`, `other`) — enables one-tap prefilled tasks
- Board layout: three columns on desktop (Not Started / In Progress / Completed), stacked on mobile
- Drag-and-drop between columns updates status
- Buttons: `+ Add task`, `+ Site Diary`, `+ Upload Photo`, `+ Generate Invoice`, `+ Complete Snagging` — preset shortcuts create the task AND deep-link to the corresponding tool

**API endpoints (new)**
- `POST /api/jobs/{id}/tasks` — create
- `GET /api/jobs/{id}/tasks` — list
- `PATCH /api/tasks/{taskId}` — update (status, title, dueDate)
- `DELETE /api/tasks/{taskId}` — remove

### Timeline tab

Chronological event feed, oldest → newest OR newest → oldest (user-toggleable).

**Event catalogue** — events written automatically on the following actions:
- `project_created` (on job creation)
- `project_updated` (only on status change — not every edit, to avoid noise)
- `rams_created` / `rams_updated`
- `site_diary_created`
- `variation_submitted` / `variation_approved`
- `invoice_generated`
- `application_submitted`
- `payment_received` (manual entry)
- `photo_uploaded` (fired at first upload of the day per project, not per photo — to prevent spam)
- `task_created` / `task_completed`
- `chase_sent` (stage 1/2/3)
- `project_completed`
- `project_archived`

**New MongoDB collection: `project_events`**
```
{ id, userId, jobId, kind, title, subtitle?, refDocId?, refDraftId?, createdAt }
```

- Rendered as a vertical rail with icon per kind
- Empty state: `Timeline starts when you take your first action on this project.`

**Where events are emitted**: a helper `emit_event(db, user, job_id, kind, title, subtitle?, ...)` in a new `/app/backend/project_events.py`, invoked from `/api/generate`, `/api/drafts`, `/api/media` (first upload per job per day), and payment/chase endpoints.

### Team tab (skeleton only for v1)

**v1**: display a placeholder card:
```
Team collaboration coming soon.
Invite colleagues, assign tasks, and share this workspace.
```

**Data model, ready to power v2:**
```
project_members: { id, userId (owner), jobId, memberEmail, role, invitedAt, acceptedAt }
```
Roles: `owner` | `manager` | `viewer`. Do NOT build the invitation flow in v1. Just the empty tab + the DB collection with an index on `jobId`.

---

## Smart Integration (the "auto-link" behaviour)

**Goal**: when a user starts a tool from within a project, the tool arrives pre-linked to that project. When they start a tool from outside a project, they get a lightweight nudge to pick one.

### Mechanism (concrete)

1. Add `jobId` to the URL query when navigating from the Workspace into any tool.
   - Every Quick Action inside the Workspace navigates like `<Link to={`/app/rams?jobId=${id}`} />`.
2. `GenericToolPage` + each dedicated tool page reads `jobId` from `useSearchParams` on mount and:
   - Sets `data.jobId` on the draft
   - Passes `jobId` into `AttachMedia` (already supported)
   - Includes `jobId` in `POST /api/generate` and in saved documents
3. **Project picker prompt**: if a user hits a supported tool without `jobId` and has 1+ active projects, show a single-select modal:
   ```
   Link this to a project?
   [ Skip ]   [ Select project ▾ ]
   ```
   - `Skip` is always available; not everything must be project-linked.
   - Dismissible per-tool for a session (localStorage flag).
4. **Saved documents get `jobId`**: extend `POST /api/documents/save` to accept `jobId` and store it on the document row.
5. **Media**: already supported via AttachMedia — no change.

### Rule: never silently attach

Auto-link only happens when a `jobId` is present in the URL. Never guess based on client name matching or timing — matches the "never guess" principle from the Command Centre spec.

---

## Project Status (canonical list)

`planning` · `active` · `on_hold` · `awaiting_payment` · `completed` · `archived`

- **planning** — created but not yet started (no site work)
- **active** — currently running (default after creation if start date is today or in the past)
- **on_hold** — paused (site closure, dispute, etc.)
- **awaiting_payment** — practical completion + invoice issued but not paid
- **completed** — signed off + paid (client relationship closed)
- **archived** — removed from active lists but data retained (see Completion below)

Status is set manually via a dropdown on the Overview. `completed` and `archived` never revert — user gets a confirmation prompt.

---

## Project Dashboard (quick statistics)

Rendered at the top of the Overview tab as small chips (not tiles). Six chips:

- `<n>` Documents
- `<n>` Photos
- `<n>` Videos
- `£<amount>` Outstanding
- `<n>` Completed Tasks
- `<n>` Open Variations

All counts are computed backend-side in a single endpoint:

**New endpoint** `GET /api/jobs/{id}/stats`
```json
{
  "documents": 12,
  "photos": 34,
  "videos": 2,
  "outstanding": 15000,
  "completedTasks": 5,
  "openTasks": 3,
  "openVariations": 2,
  "applications": 4,
  "siteDiaries": 12,
  "recentActivity": [ ...last 3 timeline events... ]
}
```

Cached per project for 30 seconds; invalidated on write to documents, drafts, tasks, media_items, or events for that job.

---

## Search (project-scoped unified search)

Search input at the top of the workspace (right of the tab bar). Queries across:
- Saved documents (`title`, `content` text)
- Drafts (`toolName`, `data.*` text fields)
- Media (`description`, `notes`, `originalFilename`, `category`, `album`)
- Tasks (`title`, `description`)
- Timeline events (`title`, `subtitle`)

**Endpoint** `GET /api/jobs/{id}/search?q=<text>&limit=50`

Returns a flat array of results, each with `{ kind, title, snippet, route }`. Kinds: `document`, `draft`, `media`, `task`, `event`.

**Backend**: use MongoDB `$regex` case-insensitive on the fields above (indexes already exist for `jobId` on each collection). No text search engine for v1.

**Not in v1**: fuzzy matching, operators (AND/OR/NOT), spell correction, global cross-project search (that's a v2).

---

## Project Completion & Archiving

- **Completing** a project (status → `completed`):
  - Emits `project_completed` event
  - Moves the project out of the "Active Projects" filter
  - Retains 100% of documents, drafts, media, tasks, events, timeline
  - Card gets a green "Completed" pill; shown under Recent Projects → Completed on the Command Centre
- **Archiving** a project (status → `archived`):
  - Same retention rules — nothing is deleted
  - Hidden from all default lists (Command Centre snapshot, Jobs list default view)
  - Accessible via `/app/jobs?status=archived`

Neither action deletes anything. Delete is a separate (hard) action that is intentionally NOT in v1 scope.

---

## Command Centre V2 Integration

The Command Centre attention items already carry `projectId` and route to project-specific pages. Update:

- `actionRoute` for project-related items points to `/app/jobs/<projectId>` (Workspace) with a query hint indicating which tab to open:
  - Overdue invoice: `?tab=finance`
  - RAMS incomplete: `?tab=documents`
  - Missing site diary: `?tab=documents`
  - No project photos: `?tab=photos`
- Continue Working feed on the Command Centre resolves any `jobId` on a draft/doc and shows the project name as the subtitle: `"RAMS — School Refurbishment"` rather than `"RAMS Draft"`.
- Recent Projects cards already deep-link to `/app/jobs/:id` — becomes the Workspace automatically.

---

## User Experience Principles

The workspace should feel like a **digital site folder** — you open it and everything for that job is right there.

- Fast: `<800ms` from click on a project card to Overview interactive
- Never overcrowded: max 4 summary tiles at the top; anything else lives in tabs
- Mobile-first: tabs collapse to segmented control at 375px width
- Every empty state must tell the user how to fill it
- Every card action is one tap deep (never nested modals)
- Icons: `lucide-react` only. No emojis (per app-wide standard)

---

## Acceptance Criteria (measurable)

- [ ] Job Detail page at `/app/jobs/:id` becomes the Workspace with 7 tabs. Old JobDetail content lives in the Overview tab.
- [ ] Project creation modal captures all 12 fields from the spec.
- [ ] `GET /api/jobs/{id}/stats` returns correct counts for a seeded test job.
- [ ] `GET /api/jobs/{id}/search?q=x` returns matches across documents, drafts, media, tasks, events.
- [ ] Tasks CRUD works (`POST/GET/PATCH/DELETE`).
- [ ] Timeline events are written automatically on: job creation, generation of a doc via `/api/generate`, first photo upload per day, payment recording, task completion, status change to completed/archived.
- [ ] Every Command Centre attention item that has `projectId` routes into the Workspace with the correct `?tab=` query hint.
- [ ] Starting a tool from inside the Workspace pre-populates `data.jobId` on the resulting draft/doc.
- [ ] Completed and archived projects retain every document, draft, media item, task and event. No data deletion.
- [ ] Every interactive element carries a unique `data-testid`.
- [ ] Lighthouse Performance ≥85 on the Workspace Overview.
- [ ] pytest coverage on `/api/jobs/{id}/stats`, `/api/jobs/{id}/tasks`, `/api/jobs/{id}/search` — at least 5 scenarios per endpoint.

---

## Do NOT Build in V1

To keep the release lean:
- ❌ Team member invitations, permission granularity, role-based access — skeleton tab only
- ❌ Global cross-project search — project-scoped only
- ❌ Custom analytics or reporting (beyond the stats chips)
- ❌ Export project bundle (ZIP of everything) — nice-to-have for v2
- ❌ Drag-and-drop reordering of tabs — fixed order
- ❌ Automatic status transitions ("if all tasks done → mark completed") — always manual
- ❌ Task assignment to teammates (needs Team, which is v2)
- ❌ Text-search engine (Elasticsearch/Meili/etc.) — Mongo `$regex` is fine

---

## Success Criteria — Human

When a user opens Morris, they think about their **projects**, not their documents. When they open a project, everything is there — documents, photos, money, tasks, history. The workspace **is** the site folder.

Every tool feels like it's part of the project, not a standalone form. And the moment a project needs attention, the Command Centre points straight to it.

That's the win.
