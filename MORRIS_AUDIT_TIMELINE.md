# Morris Development Audit & Upgrade Timeline

**Definitive single source of truth for Morris development history.**

Source: `/app/memory/PRD.md` · `/app/COMMAND_CENTRE_V2_SPEC.md` · `/app/PROJECT_WORKSPACE_SPEC.md` · `/app/MORRIS_DOCUMENTATION.md` · `/app/MORRIS_RAMS_ANALYSIS.md` · git log.

_(This document mirrors the audit produced on 21 Feb 2026. Update whenever a new tool receives a V2 upgrade.)_

## Chronology of major upgrades

- **Pre-fork Feb 2026** — Stripe live keys, Resend integration, Finance overhaul, GenericToolPage regex fix, Global AI prompt rewrite, 15 tool rebuilds (LDs Dispute, Application for Payment, Final Account, Contra Charge, Price Work, Standing Time, Defects Tracker, Novation Letter, Delay Notice, Toolbox Talk, Mileage Log, Payment Chaser, Asbestos Record, Self Assessment Prep, Measurement Record).
- **12 Feb 2026** — CIS Invoice NI-number hardening; Pre-Start Meeting Checklist rebuild.
- **13 Feb 2026 (Rebuild Day)** — 20 dedicated tool page rebuilds: Snagging List, Contract Review, HMRC Correspondence, Bad Debt Letter, Purchase Order, Delivery Record, Labour Allocation, CIS Calculator, Payment Tracker, Tender Letter, Rate Increase Letter, Price Work Quote, Procurement Schedule, Apprentice Manager, Risk Register, Weather Log, Meeting Notes, Subcontractor Management, Retention Chaser, Variation Instruction Log, Working at Height Rescue Plan, Manual Handling Assessment, Noise Assessment, Tool Register.
- **20 Feb 2026 (Prompt Day)** — Global Writing Standard, RAMS Hazard 3-step redesign, Variation Order 6 fixes, Quote Builder 8-point pack, Application for Payment 7 compliance fixes, Extension of Time professional rewrite, Payment Chaser 8-point pack, Payment Tracker ↔ Chaser two-way link, Photo-to-Document multi-photo + Site Photo Library.
- **21 Feb 2026 (V2 Day)** — Photo Vault (3 iterations: initial → Phase 1 → Reusable Infrastructure hardening), Job Tracker → Vault deep-link, **Command Centre V2**, **Project Workspace**.
- **22 Feb 2026** — RAMS 8 supplementary PDF sections rendered.

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

See the full per-tool audit table in the chat transcript from 21 Feb 2026.
