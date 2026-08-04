# Morris — V1 Release Readiness Checklist

Last audited: **4 Aug 2026** — Report: `/app/test_reports/iteration_26.json` (48/48 pytest pass)

## ✅ Backend health
- Every V2 flagship endpoint responds 200 for authenticated users (Site Diary, Incident Report, Risk Assessment, Quote Builder, Variation Orders, Applications for Payment, Invoice Builder, Global Search, Command Centre, Jobs, Documents).
- Stats endpoints for every V2 tool return under 160ms for typical users.
- 401/403 responses without auth on protected endpoints (never 500).

## ✅ Multi-user data isolation
- `sparky01` cannot see any of `darrenhustle300`'s projects, variations, applications, invoices, documents, or search results.
- All V2 collections queried with `userId` filter; verified.

## ✅ UI Standards (across all V2 dashboards)
- Header: sector pill → H1 → description → refresh + primary CTA (top-right). All wrap on mobile (`flex flex-wrap`).
- Stat cards: `grid-cols-2 lg:grid-cols-N` — stacks 2-wide on mobile.
- KPI value cards: `grid-cols-1 md:grid-cols-3` — stacks single-column on mobile.
- Filters bar: card-dark, single row on desktop, wraps on mobile.
- No charts (banned) — professional tables + KPI blocks only.
- No AI-first language ("Generate with AI", "AI Assistant") — replaced with "Smart Assistance" / "Professional Templates".

## ✅ Workflow consistency
Every V2 flagship follows the pattern:
1. Dashboard first (status stat cards + KPI value cards + templates + filters + rows)
2. Multi-step wizard (3-11 steps depending on tool)
3. Preview PDF then Save & Generate PDF
4. Saves a record in Document Library (`/api/documents/save`)
5. Links to the project workspace (`projectId` foreign key + optional deep-link with `?open=<id>` on the dashboard)

## ✅ PDF standards
- Morris branded cover page (charcoal + gold).
- Header/footer on every content page (contractor, project, ref, date, page number).
- Dual signature blocks where applicable (contractor + client/QS/certifier).
- Reverse charge VAT automatically annotated on Invoices & AFPs.
- Section numbering + gold underlines throughout.

## ✅ Integrations verified end-to-end
- **Variation Orders → Applications for Payment**: Approved variations auto-pull into AFP `approvedVariationsValue` (NET / subtotal — VAT applied at AFP level to avoid double-counting).
- **Applications for Payment → Invoice Builder**: `GET /invoice-builder/from-application/{aid}` pre-fills invoice draft with linked ref + certified amount + one consolidated line item.
- **Variation Orders → Invoice Builder**: `GET /invoice-builder/from-variation/{vid}` pre-fills invoice draft with linked ref + copied line items.
- **Invoice payment → Project workspace**: Recording a payment increments `job.amountPaid` via `$inc`.
- **Approved Variations → Project revised contract value**: `/api/jobs/{id}/stats` returns `originalContractValue` + `approvedVariationsValue` + `revisedContractValue`.
- **Command Centre**: Overdue AFPs, awaiting-cert AFPs, submitted-VOs >7 days, in-progress-VOs >30 days, overdue invoices, due-soon invoices all surface with deep-link `actionRoute`.
- **Global Search**: 14 scope chips, deep-links open the exact record in the V2 dashboard via `?open=<id>`.

## ✅ Global Search deep-links (verified on every page)
- `/app/site-diary?open=<id>` — supported (fixed in this iteration)
- `/app/incident-report?open=<id>` — supported
- `/app/risk-register?open=<id>` — supported
- `/app/quote-builder?open=<id>` — supported
- `/app/variation-orders?open=<id>` — supported
- `/app/applications-for-payment?open=<id>` — supported
- `/app/invoice-builder?open=<id>` — supported

## ✅ Mobile (390×844 viewport)
- All 7 V2 dashboards load without horizontal overflow.
- Wizard steppers scroll horizontally (intentional — 9 steps don't fit at 390px).
- Header CTAs wrap under title on narrow widths (fixed for VO / AFP / IR in this iteration).
- No console errors on load.

## ✅ Live/mocked services
- **Claude AI**: LIVE via `EMERGENT_LLM_KEY` (emergentintegrations, claude-sonnet-4-5).
- **Resend email**: LIVE via `RESEND_API_KEY`.
- **Stripe**: LIVE-ready with `sk_test_emergent` (mock mode) — swap to `sk_test_*` or `sk_live_*` for real.
- **Twilio SMS OTP**: MOCKED (OTP returned in signup response for demo).
- **Web Speech API (Verbal-to-Variation)**: MOCKED.

## 🟡 Known minor items (non-blocking for release)
- One React hydration warning from a shadcn Select somewhere on RiskRegister page — pre-existing, does not affect functionality.

## 🔄 Post-release polish backlog
- Extension of Time Claims V2 (next flagship)
- Commercial Reports V2 (unified register)
- Document Library V2 (filters + bulk actions)
- Real Twilio SMS OTP (replace mock)
- Real Web Speech API (replace mock)
