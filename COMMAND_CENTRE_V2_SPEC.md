# MORRIS COMMAND CENTRE V2 — Product Specification

## Objective

Redesign the Morris Command Centre so it becomes the heart of the application rather than a page of statistics.

The Command Centre is the user's **daily workspace and business assistant**. Within three seconds of opening Morris, a tradesperson should know:

1. What needs their attention today
2. What work they're currently doing
3. What projects they're working on
4. What they're owed
5. What they should continue working on
6. How to quickly start new work

The experience must feel **calm, premium, organised and mobile-first**. Do not try to place every Morris feature on the homepage. Surface only what is useful today; direct users into dedicated sub-hubs for detail.

---

## Design Philosophy

The Command Centre answers four questions, in this order:

1. **What needs my attention?**
2. **What am I working on today?**
3. **How is my business doing?**
4. **What would I like to do next?**

Every element displayed must either:

- Require an **action**, or
- Help the user **continue** work, or
- Help the user **start** work

If a card does none of the above, it does not belong on the Command Centre.

---

## Existing Codebase Anchors

- Route: `/app` (the current homepage). Component: `/app/frontend/src/pages/Dashboard.jsx` (or equivalent — audit before touching).
- Auth context: `useAuth()` from `/app/frontend/src/lib/auth.jsx` — exposes `user.fullName`, `user.firstName`, `user.email`, `user.trade`, `user.signature`.
- Brand tokens (must be used everywhere):
  - Background: `#0a0a0a` (deepest), `#0d0d0d` (cards), `#121212` (inputs)
  - Text: `#F0EDE8` (primary), `#A19D94` (secondary), `#706D66` (muted)
  - Gold accent: `#E8A020` (`hover:#F0B040`)
  - Alert red: `#E5635A`
  - Borders: `#F0EDE8/10`
- Font sizes follow the app-wide hierarchy: H1 `text-4xl sm:text-5xl lg:text-6xl`; body `text-sm`/`text-base`; muted `text-xs`.
- All interactive elements MUST have unique kebab-case `data-testid` attributes (e.g. `cc-attention-item-<id>`, `cc-quick-action-<id>`).
- Existing notification alert system: `/app/frontend/src/lib/alerts.js` + `alerts-seed.js`. Extend, don't duplicate.
- Existing Jobs API: `GET/POST/PATCH/DELETE /api/jobs`.
- Photo Vault API: `GET /api/media/*` (see `/app/backend/photo_vault.py`).

---

## Dynamic Personal Greeting

Replace the static `HELLO, DARREN.` heading with a dynamic greeting.

**Structure**
```
<time-of-day-greeting>, <first-name>.
<rotating sub-line>
```

**Examples**
```
Morning, James.
Here's what needs your attention today.
```
```
Afternoon, Sarah.
Ready to get stuck in?
```
```
Evening, Michael.
Here's what's happening across your business today.
```

**Rules**
- First name comes from `user.firstName`. If missing, fall back to the first token of `user.fullName`. If still missing, use `Welcome back.` (no name).
- Time of day is derived from the **user's local browser time**, not the server:
  - `05:00–11:59` → **Morning**
  - `12:00–16:59` → **Afternoon**
  - `17:00–23:59` and `00:00–04:59` → **Evening**
- Sub-line rotates deterministically per calendar day (not per render) — pick from a curated set of 4–6 professional phrases per time-of-day. Never repeat the same sub-line two days running for the same user.
- **Never** hard-code any name. Never mention a specific user in the codebase.

---

## Section 1 — Attention Required

The most important section on the page. Rendered **first**, above everything else.

**Content rules**
- Only items that require action. Completed work never appears here.
- Each item has: **title**, **short explanation**, **related project**, and **one primary action button**.
- Sorted by urgency (overdue > due today > due this week > future).
- Maximum 8 items visible; provide a "Show all attention items" link that navigates to `/app/attention` when the list exceeds 8.

**Alert catalogue (v1 scope)**

| Trigger | Title | Explanation | Action |
|---|---|---|---|
| Invoice past due date and status ≠ Paid | `Invoice <ref> overdue by <n> days.` | `<Project name>` | `Open Invoice` |
| Variation with `status = Awaiting Approval` and no client sign-off | `Variation Order <ref> awaiting client approval.` | `<Project name>` | `Open Variation` |
| Invoice overdue AND no payment chaser sent in last 14 days | `Payment chaser recommended.` | `Invoice <ref> — <n> days overdue` | `Start Chase` |
| Application for Payment due (based on job's payment cycle) | `Application for Payment due.` | `<Project name>` | `Create Application` |
| Compliance credential expires in ≤30 days | `<Credential> expires <in n days\|on <date>>.` | Only shown if user has uploaded that credential | `Renew` |
| Self-Assessment deadline < 60 days away (31 January) | `Self Assessment due <in n days>.` | — | `Open Tax Hub` |
| Active RAMS with `stage < completed` older than 24h | `RAMS incomplete on <project>.` | `Started <date>` | `Resume RAMS` |
| Multi-user Site Diary: no entry for today by 17:00 local time (dismissable for the day) | `Site diary missing for today.` | `<Project name>` | `Open Diary` |
| Snagging List with `unresolved > 0` and no updates in 7+ days | `<n> snagging items outstanding.` | `<Project name>` | `Open Snagging` |
| Project older than 7 days with zero Photo Vault items | `No project photos yet.` | `<Project name>` | `Open Vault` |
| Draft older than 3 days | `Draft <tool name> unfinished.` | `<Project name if linked>` | `Resume Draft` |

**Empty state**
```
Everything looks good today.
Enjoy the peace — or start something new below.
```

**Data sourcing rules — never guess**
- Only compute alerts from **stored data** (Jobs, Invoices, Variations, Applications, Drafts, Compliance credentials, Photo Vault, RAMS, Site Diaries).
- Compute on the backend in a single `GET /api/attention` endpoint that returns `[{ id, kind, title, subtitle, projectId, projectName, actionRoute, severity: 'urgent'|'warning'|'info', dueAt }]`. Sorting and severity live server-side so the client stays dumb.
- Cache per user for 60 seconds; invalidate on write mutations to invoices, variations, drafts, etc.

---

## Section 2 — Today's Work

Renders a compact list of "things I'm actively doing today". Distinct from Attention: this is **continuation**, not urgency.

**Content**
- Active jobs (status `active`) the user has touched in the last 3 days
- Any draft with `updatedAt` inside the last 7 days
- Any Multi-user Site Diary already started for today (resume link)
- Any AttachMedia session started but not saved (if we track that)

**Layout**
- Horizontally scrollable row of cards on mobile; 2–3 column grid on desktop.
- Card shows: project name, one-liner status (e.g. "Site diary started at 08:15", "Quote — 3 line items"), and a primary action button.

**Empty state**
```
No live work right now.
Start something below.
```

---

## Section 3 — Business Snapshot

Small, readable, single-glance metrics. **No large stat cards.**

**Display exactly these four**, side-by-side (2×2 on mobile, 4×1 on desktop):
- Outstanding Payments — sum of unpaid invoices, formatted `£12,345.67`
- Projects In Progress — count of jobs where `status = active`
- Open Documents — count of drafts + docs not yet exported
- Media Stored — total Photo Vault items (matches vault stats endpoint)

Each metric is a **link** to its full-detail page. Do NOT put Tax Pot, CIS Refund Estimate, or Earnings YTD here — they move to the Finance Hub (see below).

---

## Section 4 — Quick Actions

Retain the Quick Actions pattern but tighten spacing and iconography.

**Show exactly 10** (curated, not user-configurable in v1):
1. Jobs
2. Invoice (CIS Invoice)
3. Quote (Quote Builder)
4. Variation Order
5. RAMS
6. Site Diary
7. Toolbox Talk
8. Log Mileage
9. Commercial Report
10. Application for Payment

**Layout**
- 5 columns on desktop, 2 columns on mobile.
- Each button is icon + label. Uses `lucide-react` icons; never emojis.
- All 10 have unique `data-testid="cc-quick-<slug>"`.

For "everything else", the section header includes a small link: `See all tools →` navigating to `/app/tools-library` (see Section 7).

---

## Section 5 — Continue Working

Rename `Recent Documents` → **`Continue Working`**.

Display a mixed list of:
- Recently opened projects (last 5)
- Recently edited documents (last 5)
- Recent drafts (last 5)

Sort by `updatedAt` DESC; de-duplicate so a project doesn't appear twice via a draft + a doc.

Clicking an item returns the user to **exactly where they left off** — for drafts this means loading the draft into its tool page; for saved docs it means the History detail view.

---

## Section 6 — Recent Projects

Card grid (2 columns mobile, 3 desktop). Sections stacked:

1. **Pinned Projects** (user-pinned)
2. **Recently Active Projects** (touched in last 14 days)
3. **Projects Awaiting Attention** (any project surfacing an Attention item)
4. **Completed Projects** (collapsed by default — expandable)

Each project card:
- Project name (`text-lg text-[#F0EDE8]`)
- Client name (`text-xs text-[#A19D94]`)
- Status pill (existing colour system)
- Progress bar (0–100%) if the project has a computed progress
- Quick actions: `View`, `+ Diary`, `+ Photo` (opens Photo Vault deep-linked)

---

## Section 7 — Navigation Philosophy

The homepage does not contain every feature. It guides users into dedicated hubs.

**New top-level structure**

| Route | Hub | Contents |
|---|---|---|
| `/app` | 🏠 **Command Centre** | The redesigned homepage |
| `/app/business` | 💼 **Business** | Invoices, Quotes, Applications for Payment, Payment Chasers, Purchase Orders, Commercial Reports |
| `/app/finance` | 💷 **Finance** | Tax Pot, CIS Refund Estimate, Earnings YTD, P&L, Outstanding Payments, Payment Tracker, Log Mileage |
| `/app/projects` | 🏗 **Projects** | Active Projects, Completed Projects, Project Workspaces |
| `/app/documents` | 📂 **Documents** | Search, Recent Documents, Templates, Categories |
| `/app/photo-vault` | 📸 **Photo Vault** | (already built) — Photos, Videos, Albums, Projects, Clients, Favourites |
| `/app/compliance` | 🛡 **Compliance** | Insurance (Public Liability, Employers, Vehicle), CSCS, DBS, First Aid, Training, Self Assessment, other credentials |
| `/app/tools-library` | 🧰 **Tools Library** | Every Morris tool, grouped by category |
| `/app/settings` | ⚙ **Settings** | Profile, Company, Branding, Notifications, Export Data, Backup, Subscription, Security |

The AppShell sidebar reflects this — collapsed to 8 top-level items, each expandable to its sub-tools.

---

## Finance Hub (new route `/app/finance`)

Removed from Command Centre and centralised here:
- Tax Pot
- CIS Refund Estimate
- Earnings YTD
- Financial Reports / P&L
- Outstanding Payments
- Payment Tracker (already exists — moves under here)

Command Centre only shows the four small metrics in Section 3. Everything richer lives here.

---

## Compliance Hub (new route `/app/compliance`)

Remove the large green compliance cards from the current homepage. Centralise here.

**Cards for each credential**: expiry date, days remaining, upload/replace button, download button.

Credentials tracked (v1):
- Public Liability Insurance
- Employers Liability Insurance
- Vehicle Insurance
- CSCS Card
- DBS Check
- First Aid Certificate
- Training Certificates (multi-slot)
- Self Assessment status
- Other (user-defined)

**Any credential within ≤30 days of expiry automatically surfaces as an Attention item** (see Section 1). No duplicate rendering on the homepage.

---

## Tools Library (new route `/app/tools-library`)

Move the complete Morris tool catalogue here. Grouped by category (mirrors the existing `SECTIONS` in `tools-config.js`). Homepage only shows the 10 Quick Actions.

Includes: document generators, calculators, utilities, exports, templates, reports, admin tools. Every tool is one tap away.

---

## User Experience Principles

The Command Centre must feel:
- Clean
- Premium
- Professional
- Fast (first contentful paint under 1 second, LCP under 2.5s)
- Minimal
- Action-focused

**Never overcrowded.** Prioritise white space. Reduce unnecessary cards. Avoid showing information simply because it exists. Only show information that helps users make decisions.

**Mobile-first**
- Design at 375px width first, expand up to 1440px.
- Touch targets ≥44×44px.
- One column on mobile everywhere except Business Snapshot (2×2) and Quick Actions (2 columns).
- Horizontal scroll only for Today's Work; everything else stacks vertically on mobile.

---

## Acceptance Criteria (measurable)

- [ ] Greeting matches spec across three time windows and localises to the user's browser timezone.
- [ ] Greeting sub-line changes across days but not across renders of the same day.
- [ ] `GET /api/attention` returns correctly-sorted alerts for the seeded test account (admin `darrenhustle300`).
- [ ] Attention section shows correct counts of overdue invoices, variations awaiting approval, and expiring credentials.
- [ ] Empty state renders "Everything looks good today." when the endpoint returns `[]`.
- [ ] Quick Actions grid has exactly 10 buttons, each with a unique `data-testid`.
- [ ] Business Snapshot pulls live values from `/api/invoices`, `/api/jobs`, `/api/drafts`, `/api/media/stats`.
- [ ] Compliance credentials <30 days from expiry appear in Attention; do not double-render as their own homepage card.
- [ ] Tax Pot / CIS / P&L are **not** present on the homepage — accessible only via `/app/finance`.
- [ ] Sidebar navigation reorganised to the 8-hub structure; old direct-to-tool links preserved as redirects for one release.
- [ ] Every interactive element has a unique kebab-case `data-testid`.
- [ ] Lighthouse Performance ≥90 on the homepage.
- [ ] End-to-end pytest coverage on `/api/attention` — at least 5 scenarios (overdue invoice, awaiting variation, expiring credential, unfinished RAMS, all clear).
- [ ] Frontend automation coverage — greeting renders, at least one alert renders, quick actions clickable, snapshot metrics link out to correct hubs.

---

## Do NOT Build in V2

To keep the release lean:
- No AI suggestions ("Morris thinks you should…")
- No real-time notifications / websockets — polling on the 60-second cache is fine
- No user-configurable Quick Actions (the 10 are curated)
- No admin analytics on the homepage
- No custom dashboards

These are candidates for V3.

---

## Success Criteria — Human

When a user opens Morris they should instantly know:
- What requires attention
- What work they're continuing
- What projects they're managing
- What money they're owed
- What tasks they should complete today
- How to create new work

The Command Centre should feel less like a collection of widgets and more like a **personal business assistant** that helps tradespeople run their business efficiently.
