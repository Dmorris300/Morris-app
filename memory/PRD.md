# Morris — Product Requirements Document

## Original Problem Statement
Dark-themed construction administration SaaS web app for UK tradespeople and sole traders. Built by Darren Morris, a UK duct fitter. Company: Morris Construction Tech Ltd (ICO C1923529). Slogan: "Built on the Tools." Tagline: "Built by a tradesman. For tradesmen." Brand: gold #E8A020 on near-black #060606 with off-white #F0EDE8 text. Bebas Neue wordmark + DM Sans body. 90+ tools across Documents / Finance / Site Tools / Price Work / Sole Trader / Contractors / Account. Three wow features: Verbal to Variation, Photo to Document, CIS Refund Predictor. AI document generation via Claude (originally Vercel `/api/generate`). Pricing tiers: Free / Solo £12.99 / Pro £24.99 / Business £59.99 / Enterprise £299+.

## Stack (adapted from Vite+Vercel → CRA+FastAPI+MongoDB)
- Frontend: React (CRA), Tailwind, lucide-react, sonner, jspdf, react-router-dom v7
- Backend: FastAPI + Motor (MongoDB)
- LLM: Claude Sonnet 4.5 via `emergentintegrations` + EMERGENT_LLM_KEY
- Auth: bcrypt + opaque token (stored on user doc); session via localStorage on client

## User Personas
1. Sole-trader UK tradesman (32 trades) — on-site, on a phone, in a hi-vis pocket. Wants to produce paperwork fast and get paid.
2. Small contractor (2–10 staff) — managing subbies, RAMS, payment cycles.
3. Apprentice / new starter — needs admin scaffolding to look professional.

## What's Implemented (built 2026-12)
- Marketing landing page (`/`) — hero "PAPERWORK. SORTED.", 3 wow features, 7-section tool grid, 5-tier pricing, founder section (Darren Morris), footer with ICO C1923529
- Auth flow: signup (username/password/phone) → OTP verification (**DEMO MODE** — OTP returned in API response and shown on screen) → login → trade selection (32 UK trades)
- App shell with collapsible dark sidebar — global search, Recently Used (last 5), 7 accordion sections, mobile drawer
- Generic tool framework — 75+ tools driven by `tools-config.js` with id/name/section/info/fields/promptTemplate
- 3 wow features:
  - Verbal to Variation (Web Speech API + typed fallback → Claude → variation letter)
  - Photo to Document (camera/upload + description → Claude → clean document)
  - CIS Refund Predictor (live running total + predicted refund)
- Finance widgets: Earnings Dashboard, Mileage Tracker (45p/25p HMRC rates), VAT Threshold (£90k progress)
- Document actions: Save / Copy / Download PDF (branded letterhead) / Email (mailto) / WhatsApp text / WhatsApp PDF
- Profile (trade, name, company, address, UTR, VAT, CIS status), Favourites, Document History
- Claude prompts hard-wired for UK English, CIS, HMRC, HSE, CDM 2015, HGCRA 1996

## Verified (Testing Agent iteration 1)
- Backend: 13/13 pytest tests pass (health, auth, profile, generate, documents CRUD, CIS CRUD, auth enforcement)
- Frontend: full E2E happy path verified — signup → OTP → trade → dashboard → Claude doc generation → CIS log → Mileage → VAT → wow features → profile persistence → mobile drawer

## Mocked / Deferred
- **OTP via SMS** — currently DEMO MODE. Real SMS needs Twilio.
- **Stripe subscriptions** for the 5 pricing tiers — deferred.
- **Multi-user invites** (Pro/Business/Enterprise seats) — deferred.
- **Offline Mode** — listed in sidebar as "(Coming soon)".
- **Real OCR on Photo-to-Document** — currently user describes the photo and Claude formats; deferred to optional add-on.

## Prioritised Backlog
- **P0**: Stripe subscription gating (Free vs paid limits — currently no limits enforced)
- **P0**: Twilio (or alternative) real SMS for OTP
- **P1**: Multi-user invites for Pro/Business/Enterprise
- **P1**: Real OCR (Tesseract / Claude vision) on Photo-to-Document
- **P1**: Offline Mode (IndexedDB queue + sync)
- **P2**: Custom company logo upload onto branded PDF letterhead
- **P2**: Email delivery (Resend) — currently uses `mailto:`
- **P2**: Dashboard widgets — chart of earnings over time
- **P3**: Marketing site SEO / blog
- **P3**: Mobile native wrapper (PWA → app store)
