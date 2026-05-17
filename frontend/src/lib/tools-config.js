// Central registry of all Morris tools
// Each tool: id, name, section, info, fields[], promptTemplate

export const TRADES = [
  "Bricklayer", "Carpenter and Joiner", "Crane Operator", "Drainage Engineer",
  "Dry Liner", "Duct Fitter", "Electrician", "EV Charger Installer",
  "Fire Alarm Engineer", "Fire Stopper", "Floor Layer and Screeder", "Gas Engineer",
  "General Builder", "Glazier", "Groundworker", "Lagger",
  "Painter and Decorator", "Pipefitter", "Plant Operator", "Plasterer",
  "Plumber", "Refrigeration Engineer", "Roofer", "Scaffolder",
  "Solar and Renewables Installer", "Stonemason", "Structural Steel Erector",
  "Suspended Ceiling Fitter", "Telecoms Engineer", "Traffic Marshal",
  "Wall and Floor Tiler", "Welder and Fabricator"
];

export const SECTIONS = [
  { id: "documents", label: "Documents" },
  { id: "finance", label: "Finance" },
  { id: "site", label: "Site Tools" },
  { id: "pricework", label: "Price Work" },
  { id: "soletrader", label: "Sole Trader" },
  { id: "contractors", label: "Contractors" },
  { id: "account", label: "Account" },
];

// Common field types
const f = (name, label, type = "text", placeholder = "") => ({ name, label, type, placeholder });
const ta = (name, label, placeholder = "") => ({ name, label, type: "textarea", placeholder });

// Helper for tool definition
const t = (id, name, section, info, fields, promptTemplate) => ({
  id, name, section, info, fields, promptTemplate,
});

export const TOOLS = [
  // ---------- DOCUMENTS ----------
  t("variation-letter", "Variation Letter", "documents",
    "A formal letter notifying a client or main contractor of variation works on site. Covers scope, cost and time impact. Crucial for getting paid for changes outside your original scope.",
    [f("project", "Project / Site"), f("client", "To (Client / Main Contractor)"), ta("variation", "Variation details", "Describe the work change requested..."), f("cost", "Additional cost (£)"), f("timeImpact", "Time impact (days)")],
    "Write a formal UK variation letter from the trade to the client/main contractor. Reference Housing Grants Construction & Regeneration Act 1996 if relevant. Confirm the variation, cost, time impact, and request written instruction to proceed."
  ),
  t("rams", "RAMS", "documents",
    "Risk Assessment and Method Statement — a legal requirement on most UK sites under HSE / CDM 2015. Identifies hazards, controls and a safe method of work.",
    [f("task", "Task / Activity"), f("location", "Location"), ta("hazards", "Known hazards"), ta("ppe", "PPE required")],
    "Produce a UK RAMS document with sections: Scope, Persons at Risk, Hazard / Risk Matrix (likelihood x severity 1–5), Control Measures, PPE, Step-by-Step Method, Emergency Procedures. CDM 2015 and HSE compliant."
  ),
  t("site-diary", "Site Diary", "documents",
    "A daily record of works carried out — weather, labour, plant, deliveries, delays, instructions. Vital evidence for disputes and payment claims.",
    [f("date", "Date"), f("site", "Site"), f("weather", "Weather"), ta("works", "Works carried out today"), ta("labour", "Labour on site"), ta("delays", "Delays / issues")],
    "Produce a professional site diary entry with date, weather, labour, works completed, plant on site, delays, visitors, and notes. Trade-specific language."
  ),
  t("quote-builder", "Quote Builder", "documents",
    "A professional written quote / estimate covering labour, materials and timescales. Sets clear payment terms to avoid disputes.",
    [f("client", "Client"), f("project", "Project"), ta("scope", "Scope of works"), f("price", "Total price (£)"), f("validUntil", "Quote valid until")],
    "Produce a professional UK trade quote with cover letter, itemised scope, exclusions, payment terms (30% deposit, balance on completion, late payment under the Late Payment of Commercial Debts Act), and quote validity period."
  ),
  t("cis-invoice", "CIS Invoice", "documents",
    "An invoice formatted correctly for the Construction Industry Scheme — showing gross labour, materials, and 20% (or 30%) CIS deduction.",
    [f("invNo", "Invoice number"), f("client", "Contractor name & UTR"), f("labour", "Labour amount (£)"), f("materials", "Materials amount (£)"), f("cisRate", "CIS rate (%)", "text", "20")],
    "Produce a CIS-compliant invoice: header with invoice number, date, your UTR and (if applicable) VAT, contractor's details. Itemise labour and materials separately. Calculate CIS deduction on labour only. Show gross, deduction, net payable. Bank details placeholder."
  ),
  t("delay-notice", "Delay Notice", "documents",
    "A formal written notice that the project has been delayed by matters outside your control. Protects your right to claim an Extension of Time and avoid Liquidated Damages.",
    [f("project", "Project"), f("cause", "Cause of delay"), f("daysLost", "Days lost so far"), ta("impact", "Impact")],
    "Produce a formal Delay Notice under JCT/NEC principles. State cause, days lost, mitigation taken, and reserve the right to claim EoT and loss & expense."
  ),
  t("handover-certificate", "Handover Certificate", "documents",
    "A document confirming works are complete and handed over. Starts the defects liability period and (usually) the retention release clock.",
    [f("project", "Project"), f("date", "Handover date"), ta("worksComplete", "Works completed"), f("client", "Client representative")],
    "Produce a formal Practical Completion / Handover Certificate stating works complete, defects liability period (typically 12 months), and triggering retention release schedule."
  ),
  t("subcontract-letter", "Subcontract Letter", "documents",
    "A short subcontract / letter of intent setting out the works, price, programme and payment terms between you and a sub-trader.",
    [f("subbie", "Subcontractor"), ta("scope", "Scope"), f("price", "Price (£)"), f("startDate", "Start date")],
    "Produce a UK subcontract letter referencing the main contract, scope, price, programme, payment schedule (interim valuations), CIS treatment, and notice periods."
  ),
  t("complaint-letter", "Complaint Letter", "documents",
    "A firm, professional letter raising a complaint — late payment, defective materials, poor management. The first formal step before escalation.",
    [f("recipient", "To"), ta("complaint", "What happened"), f("remedy", "Remedy sought")],
    "Write a firm, professional UK complaint letter. State facts, breach, remedy required, and reserve the right to escalate (adjudication / small claims)."
  ),
  t("timesheet", "Timesheet", "documents",
    "A weekly timesheet broken down by day, site, hours and tasks — used for invoicing day work or proving labour for payment applications.",
    [f("weekEnding", "Week ending"), f("site", "Site"), ta("days", "Days worked + hours (e.g. Mon 8hrs)"), ta("tasks", "Tasks performed")],
    "Produce a clean weekly timesheet table with Day / Date / Start / Finish / Break / Hours / Tasks. Total at the bottom."
  ),
  t("daywork-sheet", "Daywork Sheet", "documents",
    "A sheet for recording daywork (time and materials) on instructed extra work. Must be signed by the client's rep on the day.",
    [f("date", "Date"), f("site", "Site"), ta("works", "Daywork carried out"), ta("labour", "Labour"), ta("materials", "Materials"), ta("plant", "Plant")],
    "Produce a UK daywork sheet with labour, materials, plant on hire, overheads & profit %, and a signature box for the client's rep."
  ),
  t("application-for-payment", "Application for Payment", "documents",
    "A formal interim payment application under HGCRA 1996. Sets the value of works done and starts the statutory payment timeline.",
    [f("appNo", "Application number"), f("project", "Project"), f("valuationDate", "Valuation date"), f("grossValue", "Gross value of works (£)"), f("previouslyPaid", "Previously paid (£)")],
    "Produce a UK interim Application for Payment under HGCRA 1996. Show contract sum, value of works to date, variations, retention, previously certified, net due. State the final date for payment and that this is a Notice under the Act."
  ),
  t("retention-chaser", "Retention Chaser", "documents",
    "Three escalating letters chasing your retention release. Many tradesmen never get retention back — these letters get it moving.",
    [f("project", "Project"), f("retentionAmount", "Retention amount (£)"), f("dueDate", "Originally due"), f("stage", "Stage (1 polite / 2 firm / 3 final notice)", "text", "1")],
    "Produce a UK retention release chase letter at the requested escalation stage (1 polite reminder, 2 firm with HGCRA reference, 3 final notice before adjudication / small claims). Personalise to the trade."
  ),
  t("final-account", "Final Account Statement", "documents",
    "A statement bringing together original contract sum, variations, dayworks and credits into a final agreed total.",
    [f("project", "Project"), f("originalSum", "Original contract sum (£)"), ta("variations", "Variations summary"), f("finalSum", "Proposed final sum (£)")],
    "Produce a UK Final Account Statement. Table: Original Sum, Variations (list), Dayworks, Omissions, Final Sum. Request agreement and release of remaining payment & retention."
  ),
  t("contra-charge-dispute", "Contra Charge Dispute", "documents",
    "A letter disputing an unfair or undocumented contra charge / back-charge deducted from your payment.",
    [f("project", "Project"), f("chargeAmount", "Contra charge amount (£)"), ta("reasonStated", "Reason stated by payer"), ta("yourResponse", "Your position")],
    "Produce a UK letter disputing a contra charge. Reference HGCRA 1996 pay-less notice requirements, request substantiation, and reserve the right to adjudicate."
  ),
  t("eot-claim", "Extension of Time Claim", "documents",
    "A formal Extension of Time claim — protects you from Liquidated Damages when delays are not your fault.",
    [f("project", "Project"), f("eotDaysRequested", "EoT days requested"), ta("cause", "Cause of delay"), ta("evidence", "Evidence (instructions, RFIs, weather etc.)")],
    "Produce a UK EoT claim referencing JCT/NEC contract principles, the relevant event, days lost, mitigation, and supporting evidence."
  ),
  t("lds-dispute", "LDs Dispute", "documents",
    "A letter rejecting or disputing the application of Liquidated Damages against you.",
    [f("project", "Project"), f("ldAmount", "LDs being applied (£)"), ta("yourPosition", "Why LDs should not apply")],
    "Produce a UK letter disputing Liquidated Damages — argue grounds (no Non-Completion Certificate, prevention principle, granted EoT, etc.) and request withdrawal."
  ),
  t("progress-report", "Progress Report", "documents",
    "A weekly or monthly progress report — % complete, programme position, risks, requests. Keeps you in control of the narrative on site.",
    [f("project", "Project"), f("period", "Period (week ending)"), ta("progress", "Progress achieved"), ta("risks", "Risks / blockers"), ta("nextWeek", "Plan for next period")],
    "Produce a professional Progress Report: Period, % Complete, Works Achieved, Risks / Blockers, Programme Position, Next Period Plan, Requests."
  ),
  t("novation-letter", "Novation Letter", "documents",
    "A letter handling the novation of an order or contract from one party to another.",
    [f("originalParty", "Original party"), f("newParty", "New party"), f("project", "Project"), ta("scope", "Scope being novated")],
    "Produce a UK Novation Letter formally transferring rights and obligations under a specified contract from one party to another, with effective date."
  ),
  t("bad-debt-letter", "Bad Debt Letter", "documents",
    "Final demand letter before legal action — small claims, statutory demand, or instructing a debt recovery solicitor.",
    [f("debtor", "Debtor"), f("amount", "Amount owed (£)"), f("originalDate", "Original invoice date")],
    "Produce a UK final demand 'Letter Before Action' threatening Small Claims / statutory demand. Reference Late Payment of Commercial Debts (Interest) Act 1998 — include 8% + base rate interest and £40–£100 fixed compensation per invoice."
  ),
  // ---------- FINANCE ----------
  t("payment-chaser", "Payment Chaser", "finance",
    "A short, firm payment chase email — saves the awkwardness, gets results.",
    [f("client", "Client"), f("invNo", "Invoice number"), f("amount", "Amount (£)"), f("daysOverdue", "Days overdue")],
    "Produce a short, firm but professional payment chase email referencing the Late Payment of Commercial Debts (Interest) Act 1998."
  ),
  t("cis-calculator", "CIS Calculator", "finance",
    "Quickly works out CIS deduction at 20% or 30% on a labour amount and what your net payment will be.",
    [f("labour", "Labour amount (£)"), f("materials", "Materials amount (£)"), f("rate", "CIS rate (%)", "text", "20")],
    "Show CIS calculation: Gross labour, materials (excluded), CIS rate, deduction amount, net payable. Explain briefly how the deduction is reported to HMRC and offset against tax."
  ),
  t("self-assessment-prep", "Self Assessment Prep", "finance",
    "A prep pack summarising income, allowable expenses and CIS deductions for your accountant or your own SA100/103.",
    [f("taxYear", "Tax year (e.g. 2024/25)"), f("grossIncome", "Gross self-employed income (£)"), f("expenses", "Allowable expenses (£)"), f("cisDeducted", "CIS deducted (£)")],
    "Produce a Self Assessment prep summary for a UK sole trader: turnover, allowable expenses, taxable profit, CIS already deducted at source, estimated tax/NI position."
  ),
  t("price-work-quote", "Price Work Quote", "finance",
    "A quote built on price work (per-metre / per-unit) rates — typical for ductwork, ceilings, decorating, plastering.",
    [f("project", "Project"), ta("ratesAndQty", "Rates × quantities (e.g. 200m² ceiling @ £18/m²)"), f("totalPrice", "Total quote (£)")],
    "Produce a professional Price Work quote with itemised rates and quantities, total value, and clear payment terms."
  ),
  t("earnings-dashboard", "Earnings Dashboard", "finance",
    "Year-to-date earnings, expenses, CIS suffered and estimated take-home.",
    [],
    ""
  ),
  t("mileage-tracker", "Mileage Tracker", "finance",
    "Log site mileage at HMRC's 45p/mile rate (first 10,000 miles). Builds an allowable expense claim.",
    [],
    ""
  ),
  t("vat-threshold", "VAT Threshold Advisor", "finance",
    "Tracks your rolling 12-month turnover towards the £90,000 VAT registration threshold.",
    [],
    ""
  ),
  t("cis-refund-predictor", "CIS Refund Predictor", "finance",
    "Log every CIS deduction taken from you throughout the year. See a real-time running prediction of how much HMRC owes you at year end.",
    [],
    ""
  ),
  // ---------- SITE TOOLS ----------
  t("photo-evidence-log", "Photo Evidence Log", "site", "A timestamped photo evidence log of site conditions, defects, deliveries. Critical for disputes.", [ta("entries", "Entries (date, location, what the photo shows)")], "Produce a Photo Evidence Log table: Date / Time / Location / Description / Reference Number / Notes."),
  t("verbal-instruction-recorder", "Verbal Instruction Recorder", "site", "Records verbal instructions received on site — converts to a Confirmation of Verbal Instruction (CVI) letter so you get paid for it.", [f("issuer", "Who gave the instruction"), f("date", "Date / time"), ta("instruction", "Verbal instruction received")], "Produce a UK Confirmation of Verbal Instruction (CVI) letter confirming the instruction in writing and requesting written authorisation if not provided within 48 hours."),
  t("contract-review", "Contract Review", "site", "Plain-English review of a construction contract — flags the dodgy clauses, onerous terms and payment risks.", [ta("contractText", "Paste relevant contract text")], "Review the supplied UK construction contract text. Flag onerous clauses (pay-when-paid, set-off, indemnities, time-bar), payment terms, retention, LDs, and notice provisions. Plain English summary with risk rating."),
  t("dispute-timeline", "Dispute Timeline", "site", "Builds a chronological timeline of a dispute from your bullet points — essential for adjudication.", [ta("events", "Events (one per line: date — what happened)")], "Convert the supplied events into a clean chronological dispute timeline with dates, parties, and document references."),
  t("incident-report", "Incident Report", "site", "RIDDOR-aware incident report — near misses, injuries, dangerous occurrences.", [f("date", "Date / time"), f("location", "Location"), f("persons", "Persons involved"), ta("description", "What happened"), ta("actions", "Immediate actions taken")], "Produce a HSE / RIDDOR-aware Incident Report with sections: Incident Details, Persons Involved, Description, Immediate Actions, Root Cause, Lessons Learned, Reportable under RIDDOR? (yes/no/possibly)."),
  t("reminders", "Reminders", "site", "Custom reminders for inspections, certificates, calibrations, insurance renewals.", [ta("items", "Items to remind (one per line)")], "Produce a Reminders Register with Item / Frequency / Last Done / Next Due / Owner / Status."),
  t("toolbox-talk", "Toolbox Talk", "site", "A short, trade-specific toolbox talk briefing — 5–10 minutes, signed by the crew.", [f("topic", "Topic")], "Produce a UK toolbox talk briefing for the user's trade on the supplied topic. 5–10 minute read, HSE-aligned, with key points, do's, don'ts, and a sign-off sheet."),
  t("asbestos-record", "Asbestos Record", "site", "A record entry for asbestos awareness — refurbishment & demolition survey reference, suspected ACMs, actions.", [f("location", "Location"), ta("suspect", "Suspect material / location"), ta("action", "Action taken")], "Produce an Asbestos Awareness Record entry, referencing CAR 2012 and the requirement for a Refurbishment & Demolition Survey before intrusive works."),
  t("snagging-list", "Snagging List", "site", "A snag list with item, location, photo ref, priority and status. Used at handover.", [ta("items", "Snags (one per line)")], "Produce a snagging list table: Ref / Location / Description / Priority (H/M/L) / Owner / Status / Date Closed."),
  t("site-access-permit", "Site Access Permit", "site", "Permit-to-work for restricted areas or high-risk activity (hot works, confined space).", [f("permitType", "Permit type"), f("location", "Location"), ta("controls", "Controls in place"), f("validity", "Valid from / to")], "Produce a Permit to Work form for the supplied activity — controls, isolation, gas tests if applicable, sign-on / sign-off."),
  t("measurement-record", "Measurement Record", "site", "A site measurement sheet — sketch references, dimensions, notes. Essential for price-work valuations.", [f("area", "Area / location"), ta("measurements", "Measurements (one per line)")], "Produce a clean Measurement Record sheet with Location / Reference / Dimensions / Quantity / Unit / Notes."),
  t("weather-log", "Weather Log", "site", "A weather log entry — temperature, wind, rain. Critical evidence for weather-related EoT claims.", [f("date", "Date"), f("conditions", "Conditions"), ta("impact", "Impact on works")], "Produce a Weather Log entry with date, conditions (temp / wind / rain / visibility), and impact on works (e.g. could not lift / could not paint externally)."),
  t("prestart-meeting", "Pre-Start Meeting Checklist", "site", "A pre-start meeting agenda and checklist — programme, RAMS, welfare, deliveries, key risks.", [f("project", "Project"), f("date", "Date")], "Produce a Pre-Start Meeting Checklist & Agenda for a UK construction project."),
  t("meeting-notes", "Meeting Notes", "site", "Convert your scribbled notes into a clean, distributable meeting minutes document.", [f("meeting", "Meeting subject"), f("date", "Date"), ta("attendees", "Attendees"), ta("rough", "Rough notes")], "Convert the rough notes into clean minutes: Attendees, Apologies, Items Discussed, Actions (with owner and date), Next Meeting."),
  t("delivery-record", "Delivery Record", "site", "A goods received record — supplier, items, condition, signed for.", [f("date", "Date"), f("supplier", "Supplier"), ta("items", "Items received"), f("condition", "Condition")], "Produce a Delivery Record table with Date / Supplier / Delivery Note No / Items / Quantity / Condition / Received By."),
  t("tool-register", "Tool and Equipment Register", "site", "Asset register of your tools and equipment — calibration, PAT, who has it. Helps insurance claims.", [ta("items", "Items (one per line)")], "Produce a Tool & Equipment Register: Asset ID / Description / Serial No / Owner / Last Cal/PAT / Next Due / Location."),
  t("procurement-schedule", "Procurement Schedule", "site", "A procurement schedule listing key materials, lead times, order-by dates.", [ta("items", "Items + lead times")], "Produce a Procurement Schedule: Item / Required On Site / Lead Time / Order By / Supplier / Status."),
  t("risk-register", "Risk Register", "site", "A live risk register with probability × impact scoring (risk matrix).", [ta("risks", "Risks (one per line)")], "Produce a Risk Register: Ref / Risk Description / Probability (1–5) / Impact (1–5) / Score / Owner / Mitigation / Status."),
  t("variation-instruction-log", "Variation Instruction Log", "site", "A live log of every variation instruction received — date, source, status, value.", [ta("variations", "Variations (one per line)")], "Produce a Variation Instruction Log: VO No / Date / Source / Description / Estimated £ / Status / Approved By."),
  t("coshh", "COSHH Assessment", "site", "Control of Substances Hazardous to Health assessment for a specific substance you use.", [f("substance", "Substance"), ta("use", "How it's used")], "Produce a UK COSHH Assessment under COSHH Regs 2002: Substance, Hazard Class, Exposure Route, Persons at Risk, Controls, PPE, First Aid, Disposal, Review Date."),
  t("noise-assessment", "Noise Assessment", "site", "Noise at Work assessment — exposure, hearing protection required.", [f("activity", "Activity"), f("estimatedDb", "Estimated dB(A)")], "Produce a Control of Noise at Work Regulations 2005 assessment — exposure action values 80/85 dB(A), hearing protection required, signage."),
  t("manual-handling", "Manual Handling Assessment", "site", "A TILE / LITE manual handling risk assessment.", [f("load", "Load / item"), f("weight", "Weight"), ta("task", "Task description")], "Produce a Manual Handling Operations Regulations 1992 assessment using the TILE method (Task, Individual, Load, Environment) for the supplied task."),
  t("working-at-height-rescue", "Working at Height Rescue Plan", "site", "Mandatory Working at Height rescue plan — what happens if someone falls into a harness.", [f("activity", "Activity"), f("height", "Working height"), ta("rescueMethod", "Rescue method available")], "Produce a Working at Height Regulations 2005 Rescue Plan — fall arrest equipment, rescue method, suspension trauma considerations, emergency contacts."),
  // ---------- PRICE WORK ----------
  t("scope-of-works", "Scope of Works", "pricework", "A precise written scope of works — what's included, what's not. Stops scope creep.", [f("project", "Project"), ta("inclusions", "Inclusions"), ta("exclusions", "Exclusions")], "Produce a tight UK Scope of Works document with Inclusions and Exclusions clearly delineated."),
  t("pricework-variation-tracker", "Price Work Variation Tracker", "pricework", "Tracks every variation on a price-work job — extra rates, extra metres, extra units.", [ta("variations", "Variations (date, description, qty, rate, total)")], "Produce a Price Work Variation Tracker table."),
  t("standing-time-calculator", "Standing Time Calculator", "pricework", "Calculates standing time you are owed when the site can't let you work.", [f("hoursStanding", "Hours standing"), f("dayRate", "Day rate (£)"), ta("reason", "Reason for standing time")], "Produce a Standing Time claim letter / calculation: hours lost × rate, reason, with a request for written approval."),
  t("pricework-profit", "Price Work Profit Calculator", "pricework", "Quickly works out your profit / £ per hour on a price-work job.", [f("priceWorkValue", "Price work value (£)"), f("hoursOnJob", "Hours on the job"), f("materialsCost", "Materials cost (£)")], "Produce a Price Work Profit summary: Revenue, Materials, Net, Hours, £/hr, vs. day rate benchmark."),
  // ---------- SOLE TRADER ----------
  t("hmrc-correspondence", "HMRC Correspondence", "soletrader", "A polite, correctly-phrased reply to a letter from HMRC.", [ta("hmrcLetter", "Their letter (paste the gist)"), ta("yourPosition", "Your position")], "Produce a professional UK reply to HMRC correspondence — courteous, factual, referencing your UTR and the matter at hand."),
  t("reference-letter", "Reference Letter", "soletrader", "A professional reference for a colleague, apprentice or labourer.", [f("name", "Person's name"), ta("worked", "What they did / for how long")], "Produce a UK professional reference letter for a tradesperson — skills, attitude, reliability."),
  t("rate-increase-letter", "Rate Increase Letter", "soletrader", "A short, professional letter notifying a client that your rate is going up.", [f("oldRate", "Old rate"), f("newRate", "New rate"), f("effective", "Effective from")], "Produce a UK rate increase letter — reference rising costs (materials, fuel, insurance) and effective date."),
  t("apprentice-manager", "Apprentice Manager", "soletrader", "Progress, training and competency tracker for your apprentice.", [f("apprenticeName", "Apprentice"), ta("progress", "Recent progress / skills")], "Produce an Apprentice Progress Report — units of competence covered, skills gained, areas to develop, next steps."),
  // ---------- CONTRACTORS ----------
  t("subbie-mgmt", "Subcontractor Management", "contractors", "A subcontractor management dossier — contact, scope, payment status, compliance.", [f("subbie", "Subcontractor"), ta("notes", "Status / notes")], "Produce a Subcontractor Management summary: Contact, Trade, Scope, Order Value, Paid To Date, Compliance (insurance, CSCS, RAMS), Status."),
  t("variation-tracker", "Variation Tracker", "contractors", "A multi-job variation tracker.", [ta("variations", "Variations across jobs")], "Produce a multi-project Variation Tracker table."),
  t("rams-library", "RAMS Library", "contractors", "Index of your RAMS documents by trade / activity.", [ta("entries", "RAMS in library")], "Produce a RAMS Library index: Reference / Activity / Trade / Version / Date / Review Due."),
  t("contract-mgmt", "Contract Management", "contractors", "Contract register — parties, value, dates, key clauses.", [ta("contracts", "Contracts (one per line)")], "Produce a Contract Register: Ref / Parties / Value / Start / End / Retention / Key Clauses / Status."),
  t("multiuser-site-diary", "Multi-user Site Diary", "contractors", "A consolidated daily diary across multiple gangs / sub-trades.", [f("date", "Date"), ta("gangs", "Gangs and their works")], "Produce a consolidated multi-gang Site Diary for the supplied date."),
  t("payment-tracker", "Payment Tracker", "contractors", "Tracks money in and money out across all live jobs.", [ta("entries", "Payment entries")], "Produce a Payment Tracker: Job / Application / Date / Net / Due Date / Status / Notes."),
  t("incident-log", "Incident Log", "contractors", "Master incident & near-miss log across jobs.", [ta("incidents", "Incidents")], "Produce an Incident & Near Miss Log: Date / Site / Type / Description / Action / RIDDOR? / Closed."),
  t("labour-allocation", "Labour Allocation", "contractors", "Daily labour allocation across multiple sites.", [f("date", "Date"), ta("allocation", "Labour allocation")], "Produce a Labour Allocation sheet: Operative / Trade / Site / Hours / Task."),
  t("purchase-order", "Purchase Order", "contractors", "A formal Purchase Order to a supplier or subcontractor.", [f("supplier", "Supplier"), ta("items", "Items"), f("total", "Total (£)")], "Produce a formal UK Purchase Order with PO number, supplier, line items, total, delivery address, payment terms."),
  t("subbie-payment-cert", "Subbi Payment Certificate", "contractors", "A payment certificate to a subcontractor under HGCRA 1996.", [f("subbie", "Subcontractor"), f("appNo", "Application number"), f("certifiedValue", "Certified value (£)"), f("paylessReason", "Pay less reason (if any)")], "Produce a UK Payment Certificate / Pay Less Notice to a subcontractor under HGCRA 1996 — including final date for payment."),
  t("hs-policy", "H&S Policy", "contractors", "A short, signed Health & Safety policy statement.", [], "Produce a UK Health & Safety Policy statement (under HSWA 1974) — commitments, responsibilities, signed by director / proprietor."),
  t("subbie-compliance", "Subbi Compliance Checker", "contractors", "Checklist of compliance documents you should hold for each subbie.", [f("subbie", "Subcontractor")], "Produce a Subcontractor Compliance Checklist — Public Liability Insurance, Employers Liability, CSCS, CIS status, RAMS, Method Statements, references, etc."),
  t("commercial-report", "Commercial Report", "contractors", "A weekly / monthly commercial position report — earned value, cost, margin, risk.", [f("project", "Project"), f("period", "Period"), f("earnedValue", "Earned value (£)"), f("costToDate", "Cost to date (£)"), ta("risks", "Commercial risks")], "Produce a Commercial Report: Earned Value, Cost, Margin, Cash Position, Risks, Forecast Final Cost vs Final Value."),
  t("defects-tracker", "Defects Tracker", "contractors", "Defects log during liability period.", [ta("defects", "Defects (one per line)")], "Produce a Defects Tracker: Ref / Date Reported / Location / Description / Owner / Status / Date Closed."),
  t("new-starter-pack", "New Starter Pack", "contractors", "A new-starter induction pack — site rules, emergency procedures, sign-in.", [f("site", "Site")], "Produce a UK New Starter / Site Induction Pack — site rules, PPE, welfare, emergency procedures, sign-in form."),
  t("hire-agreement", "Hire Agreement", "contractors", "A simple plant / equipment hire agreement.", [f("hirer", "Hirer"), f("equipment", "Equipment"), f("rate", "Rate"), f("startDate", "Start date")], "Produce a UK Plant Hire Agreement — parties, equipment, rate, hire period, insurance, off-hire procedure."),
  t("tender-letter", "Tender Letter", "contractors", "A professional tender submission cover letter.", [f("client", "Client"), f("project", "Project"), f("tenderSum", "Tender sum (£)")], "Produce a professional UK tender cover letter — confirming sum, basis, validity (typically 90 days), and key exclusions."),
];

// Pseudo tools with custom routes (not generic form-based)
export const WOW_TOOLS = [
  { id: "verbal-to-variation", name: "Verbal to Variation", section: "documents", route: "/app/wow/verbal-to-variation",
    info: "Record yourself describing a verbal instruction you received on site. Morris converts it instantly into a formal variation letter — ready to send." },
  { id: "photo-to-document", name: "Photo to Document", section: "documents", route: "/app/wow/photo-to-document",
    info: "Snap a photo of a scribbled note, drawing or scrap of paper. Morris turns it into a clean professional document." },
];

export function getToolById(id) {
  return TOOLS.find(t => t.id === id) || WOW_TOOLS.find(t => t.id === id);
}

// Emoji per tool — single source of truth so every render site is consistent
export const TOOL_EMOJI = {
  // Documents
  "variation-letter": "✉️", "rams": "🛡️", "site-diary": "📔", "quote-builder": "💷",
  "cis-invoice": "🧾", "delay-notice": "⏰", "handover-certificate": "🤝", "subcontract-letter": "📑",
  "complaint-letter": "⚠️", "timesheet": "⏱️", "daywork-sheet": "📋", "application-for-payment": "💰",
  "retention-chaser": "🔒", "final-account": "📊", "contra-charge-dispute": "⚔️", "eot-claim": "📅",
  "lds-dispute": "🛑", "progress-report": "📈", "novation-letter": "🔄", "bad-debt-letter": "🚨",
  // Finance
  "payment-chaser": "📮", "cis-calculator": "🧮", "self-assessment-prep": "📒", "price-work-quote": "💵",
  "earnings-dashboard": "📊", "mileage-tracker": "🚐", "vat-threshold": "📏", "cis-refund-predictor": "💸",
  // Site tools
  "photo-evidence-log": "📷", "verbal-instruction-recorder": "🎙️", "contract-review": "🔍",
  "dispute-timeline": "🗓️", "incident-report": "🚑", "reminders": "🔔", "toolbox-talk": "🛠️",
  "asbestos-record": "☣️", "snagging-list": "✅", "site-access-permit": "🪪", "measurement-record": "📐",
  "weather-log": "☁️", "prestart-meeting": "🗒️", "meeting-notes": "📝", "delivery-record": "📦",
  "tool-register": "🧰", "procurement-schedule": "🛒", "risk-register": "⚠️", "variation-instruction-log": "🗂️",
  "coshh": "🧪", "noise-assessment": "🔊", "manual-handling": "💪", "working-at-height-rescue": "🪜",
  // Price work
  "scope-of-works": "📜", "pricework-variation-tracker": "📊", "standing-time-calculator": "⏳", "pricework-profit": "💹",
  // Sole trader
  "hmrc-correspondence": "🏛️", "reference-letter": "⭐", "rate-increase-letter": "📈", "apprentice-manager": "🎓",
  // Contractors
  "subbie-mgmt": "👷", "variation-tracker": "📊", "rams-library": "📚", "contract-mgmt": "📂",
  "multiuser-site-diary": "👥", "payment-tracker": "💳", "incident-log": "🚨", "labour-allocation": "🗺️",
  "purchase-order": "🛒", "subbie-payment-cert": "🧾", "hs-policy": "🦺", "subbie-compliance": "✔️",
  "commercial-report": "📊", "defects-tracker": "🔧", "new-starter-pack": "🆕", "hire-agreement": "🏗️",
  "tender-letter": "📨",
  // Wow
  "verbal-to-variation": "🎙️", "photo-to-document": "📸",
  // Account
  "favourites": "⭐", "history": "🗃️", "profile": "👤", "offline-mode": "📴",
};

export function emojiFor(id) {
  return TOOL_EMOJI[id] || "🔧";
}

export function getToolsBySection(sectionId) {
  if (sectionId === "account") {
    return [
      { id: "favourites", name: "Favourites", section: "account", route: "/app/favourites", info: "Your starred tools, one click away." },
      { id: "history", name: "Document History", section: "account", route: "/app/history", info: "Every document you've generated, saved and ready to re-download." },
      { id: "profile", name: "My Profile", section: "account", route: "/app/profile", info: "Your company details — used to personalise every document Morris generates." },
      { id: "offline-mode", name: "Offline Mode", section: "account", info: "Generate documents offline — synced when you're back in signal. (Coming soon.)" },
    ];
  }
  const docTools = TOOLS.filter(x => x.section === sectionId);
  const wowInSection = WOW_TOOLS.filter(x => x.section === sectionId);
  return [...docTools, ...wowInSection];
}
