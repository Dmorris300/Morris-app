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
