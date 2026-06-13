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
  { id: "contractors", label: "Subcontractor Tools" },
  { id: "account", label: "Account" },
];

// Common field types
const f = (name, label, type = "text", placeholder = "") => ({ name, label, type, placeholder });
const ta = (name, label, placeholder = "") => ({ name, label, type: "textarea", placeholder });
// Optional field — Generate button does not gate on this
const fo = (name, label, type = "text", placeholder = "") => ({ name, label, type, placeholder, optional: true });
const tao = (name, label, placeholder = "") => ({ name, label, type: "textarea", placeholder, optional: true });
// Select dropdown — options = ["A","B"] or [{label,value}]
const sel = (name, label, options, opts = {}) => ({ name, label, type: "select", options, ...opts });
// Field that auto-prefills from a value generator (handled in GenericToolPage)
// prefill: 'today' | 'today+30d' | 'profile:field' — populated on tool mount
const fp = (name, label, prefill, type = "text") => ({ name, label, type, prefill });
// Optional prefill variant — won't trigger required validation
const fpo = (name, label, prefill, type = "text") => ({ name, label, type, prefill, optional: true });

// Helper for tool definition (now supports optional 5th arg: compute function for derived totals)
const t = (id, name, section, info, fields, promptTemplate, extras = {}) => ({
  id, name, section, info, fields, promptTemplate, ...extras,
});

export const TOOLS = [
  // ---------- DOCUMENTS ----------
  t("variation-letter", "Variation Order", "documents",
    "A formal Variation Order notifying a client or main contractor of changes to the original scope. Covers scope, cost and time impact. Crucial for getting paid for changes outside your original scope.",
    [
      f("project", "Project / Site"),
      f("client", "To (Client / Main Contractor)"),
      f("contractRef", "Original contract reference number"),
      fp("contractDate", "Date of original contract", "today", "date"),
      sel("raisedBy", "Raised by", ["Contractor", "Client", "Architect", "Engineer", "Project Manager"]),
      f("instructorName", "Name of person who gave the instruction"),
      sel("instructorRole", "Their role", ["Site Manager", "Project Manager", "Client", "Engineer", "Foreman", "Other"]),
      fp("instructionDate", "Date and time instruction was given", "today", "datetime-local"),
      f("instructionLocation", "Location on site where instruction was given"),
      sel("reasonForVariation", "Reason for variation", ["Client Request", "Unforeseen Site Condition", "Design Error", "Scope Change", "Material Substitution", "Other"]),
      tao("referenceDocuments", "Reference documents (drawings, RFIs, emails — one per line)"),
      ta("originalScope", "Description of original agreed scope"),
      ta("variation", "Description of what the variation adds or changes"),
      f("labourCost", "Labour cost (£)", "number"),
      f("materialsCost", "Materials cost (£)", "number"),
      fo("plantEquipmentCost", "Plant and equipment cost (£)", "number"),
      fo("prelimsOverheads", "Preliminaries and overheads (£)", "number"),
      f("timeImpact", "Time impact (additional days required)", "number"),
      fpo("newPCDate", "New Practical Completion date", "today", "date"),
      sel("instructionMethod", "Method of original instruction", ["Verbal", "Email", "WhatsApp", "Text message", "Written", "Other"]),
      fo("clauseRef", "Reference to original contract clause being varied"),
    ],
    `Write a formal UK Variation Order from the trade to the client/main contractor. Use VO-NNN format for the variation number (taken from the provided document reference). Reference the Housing Grants, Construction and Regeneration Act 1996 in the footer. Format:
1. HEADER — VARIATION ORDER {ref}, today's date, project/site, raised by (use the value supplied), to (client/main contractor), original contract reference and date.
2. INSTRUCTION DETAILS — instructor name + role, date/time, location, method.
3. REASON FOR VARIATION — use the value supplied (Client Request / Unforeseen Site Condition / Design Error / Scope Change / Material Substitution / Other).
4. REFERENCE DOCUMENTS — list every supplied document reference (drawing numbers, RFIs, email refs) as a numbered list. If none, state 'None'.
5. ORIGINAL SCOPE — use the value supplied.
6. VARIED SCOPE — use the value supplied.
7. COST BREAKDOWN — produce a table with rows for: Labour, Materials, Plant and Equipment (if supplied), Preliminaries and Overheads (if supplied). Auto-calculate and clearly state TOTAL VARIATION COST = sum of all rows. Show in £ to two decimals.
8. TIME IMPACT — additional days, new Practical Completion date (use the picker value if supplied).
9. CONTRACT CLAUSE — reference clause if supplied.
10. AUTHORISATION REQUEST — request a written instruction or counter-signature within 7 days. Reference HGCRA 1996.
Close with: 'To confirm acceptance of this variation please sign and return a copy or reply in writing.'`
  ),
  t("rams", "RAMS", "documents",
    "Risk Assessment and Method Statement. a legal requirement on most UK sites under HSE / CDM 2015. Identifies hazards, controls and a safe method of work.",
    [
      f("clientName", "Client name"),
      f("principalContractor", "Principal Contractor name"),
      ta("siteAddress", "Full site address (including postcode)"),
      f("task", "Task / activity"),
      f("operativesCount", "Number of operatives", "number"),
      f("supervisorName", "Supervisor / Competent Person name"),
      fo("documentRevision", "Document revision number", "text"),
      f("firstAiderName", "First Aider name on site"),
      f("assemblyPoint", "Assembly point location"),
      ta("emergencyContacts", "Emergency contact numbers (one per line, e.g. Site Manager, First Aider, A&E)"),
      ta("plantEquipment", "Plant and equipment being used"),
      tao("hazardousSubstances", "Any hazardous substances in use (leave blank if none)"),
      sel("workAtHeight", "Work at height", ["No", "Yes"]),
      f("estimatedDuration", "Estimated duration of works"),
      ta("hazards", "Known hazards (one per line — Morris will produce a risk-rated row for each)"),
      sel("overallRiskRating", "Overall risk rating for this task", ["Low", "Medium", "High"]),
      ta("sequenceOfOperations", "Sequence of operations (step by step method statement)"),
      ta("ppe", "PPE required"),
    ],
    `Produce a full UK RAMS (Risk Assessment and Method Statement) document. Use the user's profile for company name, address, contact and trade (auto-populated). Include all of the following sections, each clearly labelled:
1. DOCUMENT CONTROL — document reference (use the supplied reference), document revision number (use the value supplied, or default to 'Rev 1' if blank), issue date (today), review date (today + 12 months), prepared by (full name from profile), supervisor / competent person (use the value supplied), client name, principal contractor name, full site address.
2. SCOPE OF WORKS — task, estimated duration, number of operatives, work at height yes/no, overall risk rating (use the value supplied).
3. LEGISLATION — explicitly cite ALL of: Management of Health and Safety at Work Regulations 1999; Manual Handling Operations Regulations 1992; COSHH Regulations 2002; PUWER 1998; Personal Protective Equipment at Work Regulations 1992; Work at Height Regulations 2005; Control of Noise at Work Regulations 2005; CDM 2015.
4. PERSONS AT RISK.
5. HAZARD AND RISK MATRIX — for EACH hazard supplied produce a row with columns: Hazard / Likelihood (1-5) / Severity (1-5) / Risk Score (LxS) / Risk Rating (Low/Medium/High) / Control Measures / Residual Score / Residual Rating. Use the overall risk rating supplied as guidance for the inherent rating before controls.
6. CONTROL MEASURES AND PPE — list the PPE required.
7. SEQUENCE OF OPERATIONS — produce the supplied step-by-step method statement as a numbered list. Each step on its own line. If the user did not supply one, leave a placeholder line stating 'To be completed by supervisor before works commence.'
8. PLANT AND EQUIPMENT — list every item to be used. State: 'All plant and equipment listed above has been inspected and is in date.'
9. COSHH — list any hazardous substances in use and state: 'COSHH assessments are available on request.' If none, write 'No hazardous substances in use on this task.'
10. WORK AT HEIGHT — if yes, summarise rescue plan, harness inspection regime and reference to a separate Working at Height Rescue Plan document. If no, write 'No work at height activities on this task.'
11. WELFARE ARRANGEMENTS — toilets, washing facilities, rest area, drinking water location on site.
12. ENVIRONMENTAL CONSIDERATIONS — waste disposal method, dust and noise impact, working hours, spill management.
13. EMERGENCY PROCEDURES — first aider name on site, assembly point location, nearest A&E, 999 contact. Also list every emergency contact number supplied by the user in a clean two-column table (Role / Number).
14. BRIEFING AND SIGN-OFF — table for each operative to print name, sign and date confirming they have been briefed on this RAMS.
Close with a 'PREPARED BY' block (full name from profile, company, signature line, today's date) and a 'REVIEWED BY' block.
Use only UK English. Do not use placeholder text. Use today's date and the auto-populated profile values throughout.`
  ),
  t("site-diary", "Site Diary", "documents",
    "A daily record of works carried out. weather, labour, plant, deliveries, delays, instructions. Vital evidence for disputes and payment claims.",
    [
      fp("date", "Date", "today", "date"),
      f("site", "Site name and address"),
      sel("temperature", "Temperature", ["Below 0°C", "0-5°C", "5-10°C", "10-15°C", "15-20°C", "20-25°C", "Above 25°C"]),
      sel("wind", "Wind", ["None", "Light", "Moderate", "Strong", "Severe"]),
      sel("rain", "Rain", ["None", "Light", "Heavy", "Snow", "Hail"]),
      f("siteManager", "Site manager present on the day"),
      f("operativeCount", "Number of operatives on site", "number"),
      fo("visitors", "Visitors to site that day"),
      tao("plant", "Plant and equipment on site that day"),
      tao("subcontractorsOnSite", "Subcontractors on site today (company name, trade, number of operatives)"),
      tao("materialsDelivered", "Materials delivered today (item, supplier, quantity)"),
      ta("works", "Work completed today (specific description)"),
      ta("worksTomorrow", "Work planned for tomorrow"),
      sel("delaysToggle", "Delays experienced", ["No", "Yes"]),
      tao("delaysReason", "If yes, reason for delays"),
      tao("instructions", "Instructions received today (from whom and what)"),
      tao("issues", "Issues or problems encountered"),
      sel("hsObservations", "Health and Safety observations to record?", ["No", "Yes"]),
      tao("hsObservationsDetail", "If Yes, describe the H&S observations (near misses, incidents, hazards spotted)"),
      sel("photosAttached", "Photos attached", ["No", "Yes"]),
    ],
    `Produce a professional UK site diary entry. Format as follows:
1. OPENING STATEMENT — at the very top of the document, in bold capitals on its own line, print: 'THIS IS AN OFFICIAL SITE RECORD AND MAY BE USED IN THE EVENT OF A CONTRACTUAL DISPUTE.'
2. HEADER — DATE, SITE.
3. WEATHER — Temperature, Wind, Rain.
4. SITE TEAM — SITE MANAGER, OPERATIVES ON SITE, VISITORS.
5. SUBCONTRACTORS ON SITE TODAY — if supplied, list each one; otherwise state 'None'.
6. PLANT AND EQUIPMENT.
7. MATERIALS DELIVERED TODAY — if supplied, list each delivery on its own line; otherwise state 'None'.
8. WORKS COMPLETED.
9. WORKS PLANNED TOMORROW.
10. DELAYS — if yes, include the supplied reason; otherwise state 'No delays today'.
11. INSTRUCTIONS RECEIVED.
12. ISSUES.
13. HEALTH AND SAFETY OBSERVATIONS — if yes, include the supplied detail in full. If no, state 'No H&S incidents, near misses or observations to record.'
14. PHOTOS ATTACHED.
End with a COMPLETED BY block auto-populated from the user profile (full name, company, signature line, today's date).`
  ),
  t("quote-builder", "Quote Builder", "documents",
    "A professional written quote / estimate covering labour, materials and timescales. Sets clear payment terms to avoid disputes.",
    [
      f("client", "Client full name and address"),
      fp("validUntil", "Quote valid until", "today+30d", "date"),
      sel("paymentTerms", "Payment terms", ["30 days", "14 days", "On completion", "50% deposit, 50% on completion"]),
      ta("labourBreakdown", "Labour breakdown — one item per line: description, hours, rate"),
      sel("labourVatRate", "VAT rate applied to labour", ["Standard Rate 20%", "Reduced Rate 5%", "Zero Rated 0%"]),
      ta("materialsBreakdown", "Materials breakdown — one item per line: description, quantity, cost"),
      sel("materialsVatRate", "VAT rate applied to materials", ["Standard Rate 20%", "Reduced Rate 5%", "Zero Rated 0%"]),
      tao("preliminaries", "Preliminaries (travel, parking, waste disposal)"),
      sel("prelimsVatRate", "VAT rate applied to preliminaries", ["Standard Rate 20%", "Reduced Rate 5%", "Zero Rated 0%"]),
      tao("provisionalSums", "Provisional Sums — items priced provisionally and subject to adjustment"),
      tao("paymentSchedule", "Payment schedule (e.g. 25% on order, 50% on first fix, 25% on completion)"),
      sel("depositRequirement", "Deposit requirement", ["No deposit required", "25%", "33%", "50%"]),
      f("subtotalLabour", "Subtotal labour (£)", "number"),
      f("subtotalMaterials", "Subtotal materials (£)", "number"),
      fo("subtotalPrelims", "Subtotal preliminaries (£)", "number"),
      sel("cisApplicable", "CIS applicable", ["No", "Yes"]),
      tao("exclusions", "Exclusions — what is not included"),
      tao("assumptions", "Assumptions the quote is based on"),
    ],
    `Produce a professional UK trade Quote. Use the user's profile for company name, address, contact number, email and UTR (auto-populated). Format the document as follows:
1. HEADER — Quote reference (use the provided document reference, format QB-YYYY-NNN). Today's date. Valid until date.
2. CLIENT DETAILS — full name and address supplied.
3. ITEMISED BREAKDOWN — produce a table with these columns: Item / Description / Qty or hours / Rate / Net / VAT rate / VAT £ / Line total inc VAT. Use the supplied labour, materials and preliminaries breakdown. For EACH line item apply the VAT rate the user selected for that section (Labour, Materials, Preliminaries) — Standard Rate 20%, Reduced Rate 5% or Zero Rated 0%.
4. VAT BREAKDOWN SUMMARY — show a small summary table at the bottom of the items with columns: Rate / Net subtotal / VAT amount, with rows for each rate applied (20%, 5%, 0%).
5. PROVISIONAL SUMS — if any were supplied, list them clearly under a 'Provisional Sums' heading and state: 'These items are priced provisionally and are subject to a variation upon final selection or measurement.' If none, omit this section.
6. GRAND TOTAL — auto-calculate and clearly state: Subtotal (sum of all line nets), Total VAT (sum of all VAT amounts across rates), GRAND TOTAL (Subtotal + Total VAT). All values shown in £ to two decimal places.
7. DEPOSIT — if a deposit percentage was selected, calculate and display: 'Deposit required: {percentage} of GRAND TOTAL = £{amount}. Balance of £{remainder} due as per payment schedule.' If 'No deposit required', omit.
8. PAYMENT SCHEDULE — produce the supplied payment schedule as a numbered list under a 'Payment Schedule' heading. If blank, state 'Payment terms: {paymentTerms}'.
9. EXCLUSIONS — bullet the supplied exclusions.
10. ASSUMPTIONS — bullet the supplied assumptions.
11. VARIATIONS CLAUSE — always append the following statement: 'Any variations to the scope of works set out above will be priced and agreed in writing before being carried out. The client is responsible for paying for any agreed variations in addition to the quoted price.'
12. ACCESS CLAUSE — always append: 'The client is responsible for providing safe and reasonable access to the working area, including parking where applicable, power and welfare facilities. Any delay caused by lack of access may incur additional charges.'
13. TERMS OF ACCEPTANCE — always append: 'Acceptance of this quote constitutes a binding agreement between the parties on the terms, exclusions and assumptions stated. This quote is valid until the date shown above. After this date the quote may be subject to a revision.'
14. CIS — if applicable, state 'CIS deductions will be made from the labour element of the final invoice as per HMRC rules.'
End with a PREPARED BY block auto-populated from the user profile (full name, company, today's date) and a CLIENT ACCEPTANCE block (client full name printed, company, signature line, date).`
  ),
  t("cis-invoice", "CIS Invoice", "documents",
    "An invoice formatted correctly for the Construction Industry Scheme. showing gross labour, materials, and 20% (or 30%) CIS deduction.",
    [
      fp("invDate", "Invoice date", "today", "date"),
      fp("taxPointDate", "Tax point date", "today", "date"),
      f("clientName", "Client full legal name"),
      ta("clientAddress", "Client address"),
      ta("worksDescription", "Description of works (specific, not generic)"),
      fo("companyRegNumber", "Company registration number (optional)"),
      f("labour", "Labour amount (£) — CIS deductible", "number"),
      f("materials", "Materials amount (£) — exempt from CIS deduction", "number"),
      sel("cisRate", "CIS deduction rate", [{ label: "20% (Net)", value: "20" }, { label: "30% (Unregistered)", value: "30" }, { label: "0% (Gross status)", value: "0" }]),
      sel("vatApplicable", "VAT applicable (only if VAT registered in profile)", ["No", "Yes"]),
      sel("reverseCharge", "Domestic reverse charge applicable (only if VAT registered)", ["No", "Yes"]),
      fo("poNumber", "Purchase order number"),
      sel("paymentTerms", "Payment terms", ["30 days", "14 days", "7 days", "On receipt"]),
    ],
    `Produce a UK CIS-compliant invoice. Use the user's profile for subcontractor full name, company name, address, UTR number (auto-populated, never use placeholders). Also auto-populate National Insurance number from the profile if available. The invoice reference comes from the document reference provided — format INV-YYYY-NNN.
1. HEADER — Invoice number (use the provided ref), Invoice date, Tax point date.
2. FROM — subcontractor's full name, company, address, UTR number (always shown), National Insurance number (if on profile, shown on its own line labelled 'NI No:'), Company registration number (if supplied), VAT number (if VAT registered).
3. TO — client's full legal name and address.
4. DESCRIPTION OF WORKS — use the value supplied.
5. CIS DEDUCTION CALCULATION — produce a clearly labelled table with these rows:
   Gross Labour Amount: £{labour}
   CIS Deduction Rate: {cisRate}%
   CIS Deduction Amount: £{labour * cisRate/100}
   Net Labour After Deduction: £{labour - cis deduction}
   Materials Amount (exempt from CIS): £{materials}
   TOTAL AMOUNT DUE: £{(labour - cis deduction) + materials} (or + VAT if applicable below)
6. VAT — if VAT applicable AND reverse charge is 'No', show a VAT line at 20% on labour only and a new total inc VAT. If reverse charge is 'Yes', do NOT add VAT to the total and append a clearly bold line immediately under the totals: 'Reverse charge: Customer to pay the VAT to HMRC.'
7. PO NUMBER and PAYMENT TERMS — display each on its own line.
8. PAYMENT DETAILS — appended automatically by Morris under the global Payment Details block (do not repeat).
End with an ISSUED BY block auto-populated from the user profile (full name printed, company name, UTR number, today's date, signature line).`
  ),
  t("delay-notice", "Delay Notice", "documents",
    "A formal written notice that the project has been delayed by matters outside your control. Protects your right to claim an Extension of Time and avoid Liquidated Damages.",
    [f("project", "Project"), f("cause", "Cause of delay"), f("daysLost", "Days lost so far"), ta("impact", "Impact")],
    "Produce a formal Delay Notice under JCT/NEC principles. State cause, days lost, mitigation taken, and reserve the right to claim EoT and loss & expense."
  ),
  t("handover-certificate", "Practical Completion Certificate", "documents",
    "Practical Completion / Handover Certificate. Starts the defects liability period and (usually) the retention release clock.",
    [
      f("project", "Project name"),
      ta("projectAddress", "Full project address"),
      f("client", "Client legal name"),
      f("contractRef", "Contract reference number"),
      fp("pcDate", "Date of Practical Completion", "today", "date"),
      f("retentionPercent", "Retention percentage (free text, e.g. 5%, 2.5%)"),
      f("defectsLiabilityPeriod", "Defects liability period (free text, e.g. 3 months, 6 months, 12 months, 24 months)"),
      f("originalContractSum", "Original contract sum (£)", "number"),
      f("approvedVariations", "Approved variations total (£)", "number"),
      sel("snaggingListAttached", "Snagging list attached?", ["Yes", "No", "Not Applicable"]),
      sel("oandmManuals", "O&M manuals provided?", ["Yes", "No", "Not Applicable"]),
      sel("hsFile", "Health and Safety file provided?", ["Yes", "No", "Not Applicable"]),
      sel("gasSafeCert", "Gas Safe certificate provided?", ["Yes", "No", "Not Applicable"]),
      sel("niceicCert", "NICEIC electrical sign-off provided?", ["Yes", "No", "Not Applicable"]),
      sel("buildingControlNotice", "Building control completion notice provided?", ["Yes", "No", "Not Applicable"]),
      sel("keyHandoverLog", "Key handover log provided?", ["Yes", "No", "Not Applicable"]),
      tao("outstandingItems", "Agreed minor outstanding items (one per line)"),
    ],
    `Produce a Practical Completion Certificate (UK construction). Use PCC-NNN format for the certificate number (taken from the provided document reference). Use the user's profile for the contractor name (auto-populated). Format:
1. HEADER — Certificate number {ref}, Date of issue (today).
2. PROJECT — Project name, full project address, Client legal name, Contract reference.
3. CONTRACTOR — auto-populated from profile (full name, company, address).
4. DATE OF PRACTICAL COMPLETION — use the supplied date.
5. LEGAL STATEMENT — print verbatim, in bold capitals on its own line: 'THIS CERTIFICATE CONFIRMS THAT THE WORKS DESCRIBED HAVE BEEN EXECUTED AND COMPLETED IN ACCORDANCE WITH THE CONTRACT DOCUMENTS SAVE FOR ANY AGREED MINOR OUTSTANDING ITEMS.'
6. AGREED MINOR OUTSTANDING ITEMS — list each supplied item as a numbered bullet. If none, state 'None outstanding.'
7. APPENDED DOCUMENTS CHECKLIST — produce a clean table with two columns (Document / Status) showing each of the supplied checklist items: Snagging list, O&M manuals, Health and Safety file, Gas Safe certificate, NICEIC electrical sign-off, Building control completion notice, Key handover log. Use the Yes / No / Not Applicable value supplied.
8. FINANCIAL SUMMARY — produce a clearly labelled summary:
   Original contract sum: £{originalContractSum}
   Approved variations: £{approvedVariations}
   Final adjusted contract value: £{originalContractSum + approvedVariations} (auto-calculated to 2 decimals)
   Retention percentage: {retentionPercent}
   Retention released on PC: 50% of retention = £{(final * percent/100) / 2} (auto-calculated)
   Retention held until end of defects liability: £{(final * percent/100) / 2} (auto-calculated)
9. DEFECTS LIABILITY PERIOD — use the supplied value verbatim. State: 'The Defects Liability Period commences from the Date of Practical Completion stated above.'
10. RELEASE OF RETENTION — first half released on issue of this certificate. Second half released on the issue of the Making Good Defects Certificate at the end of the Defects Liability Period.
End with two signature blocks: CONTRACTOR (auto-populated from profile — full name, company, signature line, today's date) and CLIENT / CONTRACT ADMINISTRATOR (full name printed, company, signature line, date).`
  ),
  t("subcontract-letter", "Subcontract Letter", "documents",
    "A short subcontract / letter of intent setting out the works, price, programme and payment terms between you and a sub-trader.",
    [
      f("subbieName", "Full legal name of subcontractor"),
      fo("subbieCompany", "Subcontractor company name (if applicable)"),
      ta("subbieAddress", "Subcontractor address"),
      f("subbieUtr", "Subcontractor UTR number"),
      fp("startDate", "Contract start date", "today", "date"),
      f("endDate", "Contract end date or anticipated duration"),
      ta("siteAndProject", "Site address and project name"),
      ta("scope", "Scope of works (detailed description of what is included)"),
      sel("priceBasis", "Contract sum basis", ["Fixed price", "Day rate"]),
      f("contractValue", "Contract sum or day rate value (£)", "number"),
      fo("estDuration", "If day rate — estimated duration (days)", "number"),
      sel("paymentFrequency", "Payment terms (frequency and method)", ["Weekly", "Monthly", "On completion"]),
      sel("cisRate", "CIS deduction rate applicable", [{ label: "20% (Net)", value: "20" }, { label: "30% (Unregistered)", value: "30" }, { label: "0% (Gross status)", value: "0" }]),
      fo("retention", "Retention percentage (if applicable)", "number"),
      f("defectsLiability", "Defects liability period (e.g. 12 months)"),
      f("insuranceMin", "Public liability insurance minimum (£)"),
      f("noticePeriod", "Termination clause — notice period required (days)", "number"),
    ],
    "Produce a UK subcontract letter (legally binding once signed). Use the user's profile for the engaging party's full name, company name, address and UTR (auto-populated). Include sections: parties, site and project, scope of works, contract sum (fixed price or day rate as selected — show estimated duration if day rate), payment frequency and method, CIS deduction rate, retention if applicable, defects liability period, insurance requirements (public liability minimum), a MANDATORY 'RIGHT OF SUBSTITUTION' clause stating the subcontractor may provide a suitably qualified substitute to perform the works (critical for establishing genuine self-employed status), termination notice period, dispute resolution via adjudication under the Housing Grants, Construction and Regeneration Act 1996, governing law: England and Wales. End with two signature blocks (CONTRACTOR and SUBCONTRACTOR) each with full name printed, company, signature line, date, position. Close with: 'This agreement becomes legally binding once signed by both parties. Both parties should retain a signed copy.'"
  ),
  t("complaint-letter", "Complaint Letter", "documents",
    "A firm, professional Formal Complaint letter. late payment, defective materials, poor management. The first formal step before escalation to adjudication.",
    [
      f("recipientName", "Recipient business / company name"),
      ta("recipientAddress", "Recipient address"),
      fo("recipientContactName", "Recipient contact name (if known)"),
      ta("projectAddress", "Project address"),
      fp("contractDate", "Original contract date", "today", "date"),
      sel("complaintType", "Complaint type", ["Late payment", "Defective workmanship", "Defective materials", "Breach of contract", "Health & Safety failure", "Project mismanagement", "Other"]),
      ta("issues", "Issues. One per line in this format: date | location | description | impact | evidence reference (e.g. photo P-001, email dated, RFI 003)"),
      fo("contractValue", "Contract value (£)", "number"),
      fo("outstandingAmount", "Outstanding amount owed / loss incurred (£)", "number"),
      ta("priorContact", "Prior contact / correspondence already made (dates and outcome)"),
      ta("whatYouRequire", "What you require — specific remedy sought (payment, rectification, etc.)"),
      f("responseDeadline", "Response deadline (free text — your specific number of days, e.g. 7 days, 14 days, 21 days)"),
    ],
    `Write a firm, professional UK Formal Complaint letter. Use the user's profile for the sender block (auto-populated). Format:
1. AT THE VERY TOP — print on its own line in bold capitals: 'FORMAL COMPLAINT'.
2. SENDER BLOCK — auto-populated from profile (full name, company, address, contact, email).
3. RECIPIENT BLOCK — recipient company, address, attention of (contact name if supplied).
4. DATE — today's date.
5. SUBJECT LINE — 'Re: Formal complaint relating to {projectAddress}.'
6. OPENING STATEMENT — open with: 'I am writing to formally raise a complaint relating to the contract entered into on {contractDate} concerning the above project.'
7. COMPLAINT TYPE — clearly state the type of complaint.
8. ISSUES — list each supplied issue as a numbered item with columns Date / Location / Description / Impact / Evidence. Render as a clean numbered list, not a comma-separated string.
9. CONTRACTUAL AND FINANCIAL CONTEXT — state contract value and outstanding amount / loss incurred (£) if supplied. Reference any prior contact / correspondence.
10. WHAT I REQUIRE — list the specific remedy sought.
11. RESPONSE DEADLINE — state: 'I require a written response within {responseDeadline} of the date of this letter.'
12. CLOSING STATEMENT — finish with a clear warning: 'If a satisfactory resolution is not reached within the timescale stated above, I reserve the right to refer this matter to adjudication under the Housing Grants, Construction and Regeneration Act 1996 and/or to commence legal proceedings to recover any sums owed and damages incurred. All correspondence and documentation will be retained as evidence.'
End with an ISSUED BY block auto-populated from profile (full name printed, company, signature line, today's date).`
  ),
  t("timesheet", "Timesheet", "documents",
    "A weekly timesheet broken down by day, site, hours and tasks. used for invoicing day work or proving labour for payment applications.",
    [
      fp("weekCommencing", "Week commencing date", "today", "date"),
      f("projectName", "Project name and reference"),
      ta("siteAddress", "Site address"),
      fo("jobRef", "Job reference or site name"),
      f("monStart", "Mon — start time", "time"), f("monFinish", "Mon — finish time", "time"), fo("monBreak", "Mon — break (mins)", "number"),
      f("tueStart", "Tue — start time", "time"), f("tueFinish", "Tue — finish time", "time"), fo("tueBreak", "Tue — break (mins)", "number"),
      f("wedStart", "Wed — start time", "time"), f("wedFinish", "Wed — finish time", "time"), fo("wedBreak", "Wed — break (mins)", "number"),
      f("thuStart", "Thu — start time", "time"), f("thuFinish", "Thu — finish time", "time"), fo("thuBreak", "Thu — break (mins)", "number"),
      f("friStart", "Fri — start time", "time"), f("friFinish", "Fri — finish time", "time"), fo("friBreak", "Fri — break (mins)", "number"),
      fo("overtimeHours", "Overtime hours (if applicable)", "number"),
      fo("overtimeRate", "Overtime rate (£/hour)", "number"),
      f("dayOrHourlyRate", "Day rate or hourly rate (£)", "number"),
      sel("rateBasis", "Rate basis", ["Hourly", "Day rate"]),
      fo("poNumber", "Purchase order number (if applicable)"),
      sel("paymentTerms", "Payment terms", ["7 days", "14 days", "30 days"]),
    ],
    "Produce a clean weekly Timesheet. Use the user's profile for operative full name, company name, address, UTR number and CIS deduction rate (auto-populated). Show: week commencing, project, site address, a Mon-Fri table with Day / Start / Finish / Break / Hours (auto-calculated), total hours for the week, overtime hours and rate if any, day or hourly rate, total gross earnings, CIS deduction rate from profile applied to LABOUR ONLY, CIS deduction amount, net amount due after CIS, PO number, payment terms. Add this exact note in the body: 'CIS deduction of X% has been applied in accordance with the subcontractor's registered CIS status. This rate has been auto populated from the Morris user profile. If this rate is incorrect please update your CIS status in your profile before generating this document.' (substitute X with the actual rate from profile). End with two signature blocks: an OPERATIVE block (full name printed, signature line, date submitted) and a SUPERVISOR / AUTHORISING block (full name printed, company name, signature line, date authorised). Close with: 'Operative signature confirms hours worked are accurate. Supervisor signature authorises the timesheet for payment.'"
  ),
  t("daywork-sheet", "Daywork Sheet", "documents",
    "A sheet for recording daywork (time and materials) on instructed extra work. Must be signed by the client's rep on the day.",
    [
      fp("dayworkDate", "Date of daywork", "today", "date"),
      f("contractRef", "Contract reference"),
      f("labourRate", "Agreed daywork labour rate (£/hour)", "number"),
      f("uplift", "Agreed uplift % on materials and plant", "number"),
      fo("plantRate", "Agreed plant rate (£/day or £/hour)"),
      f("startTime", "Hours worked — start time", "time"),
      f("finishTime", "Hours worked — finish time", "time"),
      ta("worksDescription", "Daywork carried out (description)"),
      ta("materialsList", "Materials used — itemised list with individual costs"),
      ta("plantList", "Plant used — itemised list with individual costs"),
      fo("totalMaterialsCost", "Total materials cost (£)", "number"),
      fo("totalPlantCost", "Total plant cost (£)", "number"),
      fo("poNumber", "Purchase order number (if applicable)"),
    ],
    "Produce a UK Daywork Sheet. Use the user's profile for operative name, company name, address and UTR (auto-populated). Show: daywork reference (use document reference), contract reference, date, agreed daywork rates (labour rate, uplift %, plant rate), start and finish times, total hours worked (calculate from start/finish), labour cost (= hours × rate), itemised materials with total, itemised plant with total, the agreed uplift applied to materials and plant, total daywork value including uplift, PO number. End with two signature blocks: an OPERATIVE block (full name printed, signature line, date signed) and a SITE MANAGER CONFIRMATION block (full name printed, company name, signature line, date signed). Close with: 'Site manager signature confirms the hours, materials and plant listed on this sheet are agreed. Unsigned daywork sheets may not be accepted for payment.'"
  ),
  t("application-for-payment", "Application for Payment", "documents",
    "A formal interim Application for Payment under the Housing Grants Construction and Regeneration Act 1996 (as amended). Sets the value of works done, calculates the net sum due, and starts the statutory payment timeline. Every field a UK quantity surveyor or contract administrator expects to see is captured here.",
    [
      f("project", "Project / Site name"),
      f("siteAddress", "Site address"),
      f("contractRef", "Contract reference number"),
      sel("contractForm", "Contract form", ["JCT Design and Build", "JCT Standard Building Contract", "JCT Intermediate", "JCT Minor Works", "NEC4 ECC", "NEC4 ECSC", "Bespoke / Other"]),
      f("clientName", "To (Client / Employer / Main contractor)"),
      f("clientAddress", "Their address"),
      fo("clientReference", "Their reference / payment order"),
      f("appNo", "Application number (e.g. 7)"),
      fp("valuationDate", "Valuation date (works valued up to)", "today", "date"),
      fp("applicationDate", "Application date", "today", "date"),
      fp("dueDate", "Due date for payment (typically 7 days after application)", "today+7d", "date"),
      fp("finalDateForPayment", "Final date for payment (typically valuation + 30 days)", "today+30d", "date"),
      f("originalContractSum", "Original contract sum (£)", "number"),
      f("variationsApproved", "Approved variations to date (£)", "number"),
      fo("variationsPending", "Pending variations submitted (£)", "number"),
      f("dayworks", "Dayworks claimed this period (£)", "number"),
      f("materialsOnSite", "Materials on site not yet fixed (£)", "number"),
      f("materialsOffSite", "Materials off site (with vesting certificate) (£)", "number"),
      f("grossValueToDate", "Gross value of works completed to date (£)", "number"),
      sel("retentionPercent", "Retention rate", ["0%", "3%", "5%", "10%"]),
      f("previouslyApplied", "Previously applied for cumulative (£)", "number"),
      f("previouslyCertified", "Previously certified / paid cumulative (£)", "number"),
      sel("vatStatus", "VAT status", ["Standard rate 20%", "Reduced rate 5%", "Zero rated", "Domestic reverse charge (CIS)", "Not VAT registered"]),
      sel("cisApplicable", "CIS deduction applies?", ["Yes — 20%", "Yes — 30%", "Yes — Gross", "No"]),
      tao("worksDescription", "Brief description of works completed this period (multi-line)"),
      tao("variationsList", "List of variations included (one per line: VO ref — description — £value)"),
      tao("notes", "Any other notes (optional)"),
    ],
    `Produce a UK interim Application for Payment under the Housing Grants Construction and Regeneration Act 1996 (as amended). Plain direct construction English. No padding. No banned consultant words.

1. HEADER — DOCUMENT REFERENCE, DATE.

2. APPLICATION TITLE — exactly: 'APPLICATION FOR PAYMENT No. {appNo}'. Underneath: 'Valuation date: {valuationDate}   Application date: {applicationDate}'.

3. TO — Client / Employer / Main contractor name and address.

4. FROM — Issued-by block from profile (Name, Company, Address, Contact, UTR if CIS applies, VAT number if VAT-registered).

5. PROJECT REFERENCE — three lines:
   Project: {project}
   Site: {siteAddress}
   Contract reference: {contractRef}
   Contract form: {contractForm}

6. VALUATION — a clear money table, one line per row, with £ values right-aligned. Use ONLY the fields the user supplied (skip any blank cleanly). Build it in this exact order, then auto-calculate the totals where indicated:

   Original contract sum                          £{originalContractSum}
   Approved variations to date                  + £{variationsApproved}
   Pending variations submitted                 + £{variationsPending}
   Dayworks this period                         + £{dayworks}
   Materials on site (not yet fixed)            + £{materialsOnSite}
   Materials off site (vesting certificate)     + £{materialsOffSite}
   ___________________________________________________________
   GROSS VALUE OF WORKS TO DATE                   £{grossValueToDate}
   Less retention at {retentionPercent}            - £[calc: gross × retention%]
   ___________________________________________________________
   NET VALUE AFTER RETENTION                      £[calc: gross - retention]
   Less previously certified / paid             - £{previouslyCertified}
   ___________________________________________________________
   NET SUM DUE THIS APPLICATION                   £[calc: net after retention - previously certified]

   If CIS applies, add a CIS deduction line on labour only and show the cash payable after CIS.
   If VAT is standard or reduced rated, add a VAT line and show the gross amount payable.
   If 'Domestic reverse charge (CIS)' is selected, add a single line: 'VAT: Domestic reverse charge — VAT to be accounted for by the customer.'
   Show all calculation working transparently so the QS can audit it.

7. WORKS COMPLETED THIS PERIOD — short paragraph from {worksDescription}. If blank, omit.

8. VARIATIONS INCLUDED — numbered list from {variationsList}. If blank, write 'None this period'.

9. PAYMENT TIMELINE — three lines, exactly:
   Due date for payment: {dueDate}
   Final date for payment: {finalDateForPayment}
   Payment terms: Section 110 Housing Grants Construction and Regeneration Act 1996 (as amended).

10. STATUTORY NOTICE BLOCK — one short paragraph: 'This is a Notice for Payment served under Section 110 of the Housing Grants Construction and Regeneration Act 1996 (as amended). If a Pay Less Notice is not served by the prescribed period before the final date for payment, the sum applied for becomes the notified sum and is payable in full.'

11. INTEREST WARNING — one short line: 'Late Payment of Commercial Debts (Interest) Act 1998 applies. Interest accrues at 8% above the Bank of England base rate plus £40 to £100 fixed compensation per debt.'

12. NOTES — only if {notes} is supplied. Print verbatim under a 'NOTES' label.

13. SIGN-OFF — single contractor sign-off block (auto from profile).

Rules: never invent figures. Always show the maths. If a field is blank, drop the line entirely — do not write £0 unless the user typed 0. No square-bracket placeholders. No 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised'. Short sentences. Read it out loud and it should sound like a QS, not a consultant.`
  ),
  t("retention-chaser", "Retention Chaser", "documents",
    "Three escalating letters chasing your retention release. Many tradesmen never get retention back. these letters get it moving.",
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
    "A formal Extension of Time claim. protects you from Liquidated Damages when delays are not your fault.",
    [
      f("project", "Project name"),
      ta("projectAddress", "Project address"),
      f("contractRef", "Contract reference"),
      f("contractorLegalName", "Contractor legal name"),
      f("clientLegalName", "Client legal name"),
      sel("contractClause", "Relevant contract clause", ["JCT Section 2.28", "NEC4 Clause 60.1", "Other"]),
      fo("contractClauseOther", "If Other, specify clause"),
      sel("delayCause", "Cause of delay", ["Variation", "Late instruction", "Late information", "Adverse weather", "Strike / industrial action", "Force majeure", "Unforeseen ground conditions", "Client default", "Other"]),
      ta("delayDescription", "Detailed description of the delay event"),
      fp("delayStartDate", "Delay event start date", "today", "date"),
      f("delayEndDate", "Delay event end date"),
      ta("mitigationEfforts", "Mitigation efforts undertaken by the contractor"),
      f("calendarDays", "Calendar days lost", "number"),
      f("workingDays", "Working days lost", "number"),
      sel("methodOfAnalysis", "Method of delay analysis", ["Time Impact Analysis", "As-Planned vs As-Built", "Impacted As-Planned", "Collapsed As-Built", "Window Analysis"]),
      f("programmeRef", "Programme reference (e.g. P-001 rev 03)"),
      ta("impactExplanation", "Critical path impact explanation"),
      fp("currentCompletionDate", "Current contract completion date", "today", "date"),
      f("revisedCompletionDate", "Revised completion date requested"),
      sel("claimingLossAndExpense", "Also claiming Loss and Expense?", ["No", "Yes"]),
      fo("prolongedOverheads", "If yes — prolonged overheads (£)", "number"),
      fo("plantHire", "If yes — additional plant hire (£)", "number"),
      fo("staffCosts", "If yes — additional staff / supervision costs (£)", "number"),
      tao("evidenceReferences", "Evidence references (instructions, RFIs, emails, drawings, weather reports — one per line)"),
    ],
    `Produce a UK Extension of Time Claim. Use EOT-NNN format for the claim reference (taken from the provided document reference). Use the user's profile for the contractor block (auto-populated). Format:
1. HEADER — Claim reference {ref}, today's date.
2. PROJECT DETAILS — Project name, address, contract reference, contractor legal name, client legal name.
3. CONTRACT CLAUSE — quote the relevant clause (use the value supplied, with the 'Other' free text if specified).
4. DELAY EVENT — cause, detailed description, start date and end date.
5. CRITICAL PATH ANALYSIS — calendar days lost, working days lost, method of analysis, programme reference, impact explanation showing how the event affects the critical path.
6. MITIGATION — describe mitigation efforts as supplied.
7. EXTENSION REQUESTED — current contract completion date, revised completion date requested, total days requested.
8. LOSS AND EXPENSE (only if Yes was supplied) — show a clean financial summary table:
   Prolonged overheads: £{prolongedOverheads}
   Additional plant hire: £{plantHire}
   Additional staff / supervision costs: £{staffCosts}
   Auto-calculated TOTAL LOSS AND EXPENSE: £{sum}
9. EVIDENCE — list every evidence reference supplied as a numbered list. If none, state 'Available on request'.
10. DECISION REQUESTED — request the client / contract administrator's written decision on the extension within 14 days.
APPENDED STATEMENT — print verbatim on its own line as the final paragraph before the signature blocks: 'Under JCT contracts an Extension of Time does not automatically grant financial compensation. A separate Loss and Expense claim must be submitted.'`
  ),
  t("lds-dispute", "LDs Dispute", "documents",
    "A formal letter disputing Liquidated Damages applied against you. Captures every detail needed to challenge the deduction under UK construction contract law (JCT / NEC / common law). Use this when a client or main contractor has notified you of LDs and you believe they should not apply.",
    [
      f("project", "Project / Site name"),
      f("siteAddress", "Site address"),
      f("contractRef", "Contract reference number"),
      sel("contractForm", "Contract form", ["JCT Design and Build", "JCT Standard Building Contract", "JCT Intermediate", "JCT Minor Works", "NEC4 ECC", "NEC4 ECSC", "Bespoke / Other"]),
      f("clientName", "Client / Employer / Main contractor name (the party applying LDs)"),
      f("clientAddress", "Their address"),
      f("clientReference", "Their reference / notice number (if quoted)"),
      fp("contractCompletionDate", "Original contract completion date", "today", "date"),
      fp("actualCompletionDate", "Actual or current completion date", "today", "date"),
      f("ldRatePerDay", "LD rate per day (£)", "number"),
      sel("ldPeriodBasis", "LD period basis", ["Per calendar day", "Per working day", "Per week"]),
      fp("ldPeriodStart", "Period LDs applied — start date", "today", "date"),
      fp("ldPeriodEnd", "Period LDs applied — end date", "today", "date"),
      f("ldDaysClaimed", "Total days / weeks claimed by the client", "number"),
      f("ldTotalClaimed", "Total LD amount claimed (£)", "number"),
      fpo("ldNotifiedDate", "Date LDs were notified to you", "today", "date"),
      sel("nonCompletionCertIssued", "Has a Non-Completion Certificate / equivalent been issued?", ["Yes", "No", "Not sure"]),
      sel("withholdingNoticeGiven", "Has a Pay Less / Withholding Notice been served?", ["Yes", "No", "Not sure"]),
      sel("eotPosition", "Extension of Time position", ["EOT granted that covers the period", "EOT applied for, awaiting decision", "EOT refused but grounds exist", "No EOT applied for yet"]),
      sel("primaryGround", "Primary ground for dispute", [
        "No Non-Completion Certificate issued",
        "Prevention principle — delay caused by the client",
        "Relevant Event entitles us to an EOT",
        "LDs are a penalty (not a genuine pre-estimate of loss)",
        "Pay Less Notice not served in time",
        "Practical Completion already achieved",
        "LD rate or calculation is wrong",
        "Other (set out in grounds below)"
      ]),
      ta("groundsForDispute", "Grounds for dispute — set out the facts and contract clauses you rely on (one point per line)"),
      ta("eventsCausingDelay", "Events causing delay that are NOT your fault (one per line, with dates if known)"),
      ta("supportingEvidence", "Supporting evidence summary (e.g. Site Diary entries, emails, RFIs, programme records, weather logs — one per line)"),
      sel("requestedOutcome", "Requested outcome", [
        "Full withdrawal of the LDs and repayment of any sum already withheld",
        "Withdrawal of the LDs",
        "Reduction of the LDs to the correct sum",
        "Suspension of the LDs pending EOT decision",
        "Referral to adjudication if not resolved"
      ]),
      f("amountToBeRepaid", "Amount to be withdrawn or repaid (£)", "number"),
      fp("responseDeadline", "Date by which a written response is required", "today+14d", "date"),
      tao("additionalNotes", "Anything else you want included (optional)"),
    ],
    `Produce a UK Liquidated Damages dispute letter. Plain direct construction English. No padding. No banned consultant words. Format:

1. HEADER — DOCUMENT REFERENCE, DATE (auto-populated). REVIEW DATE not required.

2. TO — Client / Employer / Main contractor name and address.

3. FROM — Issued-by block from the user's profile (Name, Company, Address, Contact). Auto-populated.

4. SUBJECT line — exactly: 'DISPUTE OF LIQUIDATED DAMAGES — {project} — Contract reference {contractRef}'.

5. OPENING — One short paragraph stating the LDs are disputed in full / in part and a written response is required by {responseDeadline}. Reference the client's notice or reference number if supplied.

6. CONTRACT POSITION — List on separate lines:
   Contract form: {contractForm}
   Contract reference: {contractRef}
   Original completion date: {contractCompletionDate}
   Actual / current completion date: {actualCompletionDate}
   LD rate: £{ldRatePerDay} {ldPeriodBasis}
   Period claimed: {ldPeriodStart} to {ldPeriodEnd}
   Days / weeks claimed: {ldDaysClaimed}
   Total LDs claimed: £{ldTotalClaimed}
   Non-Completion Certificate issued: {nonCompletionCertIssued}
   Pay Less Notice served: {withholdingNoticeGiven}

7. GROUNDS FOR DISPUTE — start with the primary ground in a bold capitalised line, e.g. 'PRIMARY GROUND: {primaryGround}'. Then list the detailed grounds the user supplied as numbered points. Where relevant, cite the standard clauses by name without lecturing (e.g. JCT D&B 2.32 Non-Completion Notice, JCT D&B 2.29 Relevant Events, the prevention principle, the Housing Grants Construction and Regeneration Act 1996 as amended on Pay Less Notices, Cavendish v Makdessi 2015 on penalties — but only the names that actually apply, no paragraphs of explanation).

8. EVENTS CAUSING DELAY — numbered list of the events the user supplied, with dates where given. State plainly that these are Relevant Events / acts of prevention and the contractor is not responsible.

9. EOT POSITION — one short paragraph stating the current EOT position: {eotPosition}.

10. SUPPORTING EVIDENCE — numbered list of every evidence item the user supplied. If none, write 'Available on request'.

11. REQUESTED OUTCOME — one bold line: '{requestedOutcome}'. Then a single line: 'Amount to be withdrawn or repaid: £{amountToBeRepaid}'.

12. NEXT STEPS — one short paragraph: a written response is required by {responseDeadline}. If not received the matter will be referred to adjudication under the Housing Grants Construction and Regeneration Act 1996 (as amended).

13. ADDITIONAL NOTES — if the user supplied any, include them verbatim under a 'FURTHER NOTES' heading. Otherwise omit this section.

14. SIGN-OFF — global dual sign-off block (contractor signed; client SIGN HERE box).

Rules: never invent facts. If a field is blank, leave it out cleanly. No square-bracket placeholders. No 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised'. Short sentences. Firm but plain. A tradesperson must be able to read it out loud without stumbling.`
  ),
  t("progress-report", "Progress Report", "documents",
    "A weekly or monthly project progress report covering schedule, budget, H&S, risk and procurement. Keeps you in control of the narrative on site.",
    [
      f("project", "Project name"),
      f("contractRef", "Contract reference"),
      fp("periodStart", "Reporting period — start date", "today", "date"),
      fp("periodEnd", "Reporting period — end date", "today", "date"),
      sel("scheduleStatus", "Schedule status (traffic light)", ["Green — On Track", "Amber — At Risk", "Red — Critical Issue"]),
      sel("budgetStatus", "Budget status (traffic light)", ["Green — On Track", "Amber — At Risk", "Red — Critical Issue"]),
      sel("hsStatus", "Health and Safety status (traffic light)", ["Green — On Track", "Amber — At Risk", "Red — Critical Issue"]),
      ta("progressThisPeriod", "Physical progress THIS period (specific tasks complete)"),
      ta("progressNextPeriod", "Physical progress NEXT period (planned)"),
      fp("scheduleBaselineDate", "Schedule baseline completion date", "today", "date"),
      fp("scheduleForecastDate", "Schedule forecast completion date", "today", "date"),
      f("originalContractSum", "Original contract sum (£)", "number"),
      f("variationsApproved", "Approved variations total (£)", "number"),
      f("totalInvoiced", "Total invoiced to date (£)", "number"),
      f("totalCertified", "Total certified to date (£)", "number"),
      f("hoursWorkedNoLTI", "Hours worked without an LTI (Lost Time Incident)", "number"),
      f("accidentsThisPeriod", "Accidents this period", "number"),
      f("nearMissesThisPeriod", "Near misses this period", "number"),
      ta("criticalIssues", "Critical issues and actions taken"),
      ta("procurementTracking", "Procurement tracking (long-lead items, status, expected delivery dates)"),
    ],
    `Produce a UK Project Progress Report. Use PR-NNN format for the report number (taken from the provided document reference). Use the user's profile for the issued-by block (auto-populated). Format:
1. HEADER — Report number {ref}, Project name, Contract reference, Reporting period (start to end), Issued by (full name and company from profile).
2. EXECUTIVE STATUS — display three traffic lights clearly: Schedule / Budget / Health and Safety. For each, render the supplied value in a bold capitalised line, e.g. 'Schedule: GREEN — On Track'.
3. PHYSICAL PROGRESS — section A: this period. Section B: next period planned.
4. SCHEDULE TRACKER — show in a labelled mini-table:
   Baseline completion date: {scheduleBaselineDate}
   Forecast completion date: {scheduleForecastDate}
   Variance: {calculated variance in calendar days, positive if behind, negative if ahead}
5. FINANCIAL SUMMARY — show in a labelled mini-table:
   Original contract sum: £{originalContractSum}
   Approved variations: £{variationsApproved}
   Revised forecast value: £{originalContractSum + variationsApproved}
   Total invoiced to date: £{totalInvoiced}
   Total certified to date: £{totalCertified}
6. RISK AND SAFETY — Hours worked without an LTI, Accidents this period, Near misses this period, Critical issues and actions taken.
7. PROCUREMENT TRACKING — list long-lead items with status and expected delivery.
8. CLOSING STATEMENT — print on its own line, in italics: 'This report is issued for information and record purposes.'
End with an ISSUED BY block auto-populated from the user profile (full name, company, signature line, today's date).`
  ),
  t("novation-letter", "Novation Letter", "documents",
    "A letter handling the novation of an order or contract from one party to another.",
    [f("originalParty", "Original party"), f("newParty", "New party"), f("project", "Project"), ta("scope", "Scope being novated")],
    "Produce a UK Novation Letter formally transferring rights and obligations under a specified contract from one party to another, with effective date."
  ),
  t("bad-debt-letter", "Bad Debt Letter", "documents",
    "Final demand letter before legal action. small claims, statutory demand, or instructing a debt recovery solicitor.",
    [f("debtor", "Debtor"), f("amount", "Amount owed (£)"), f("originalDate", "Original invoice date")],
    "Produce a UK final demand 'Letter Before Action' threatening Small Claims / statutory demand. Reference Late Payment of Commercial Debts (Interest) Act 1998. include 8% + base rate interest and £40–£100 fixed compensation per invoice."
  ),
  // ---------- FINANCE ----------
  t("payment-chaser", "Payment Chaser", "finance",
    "A short, firm payment chase email. saves the awkwardness, gets results.",
    [
      f("clientName", "Client (recipient)"),
      f("invNo", "Original invoice number being chased"),
      fp("invDate", "Original invoice date", "today", "date"),
      f("invAmount", "Original invoice amount (£)", "number"),
      f("outstanding", "Amount outstanding (£)", "number"),
      fo("previousChases", "Previous chase attempts (dates of any previous reminders sent)"),
      fp("paymentDeadline", "Deadline for payment", "today+7d", "date"),
    ],
    "Produce a UK Payment Chaser letter. Use the user's profile for sender full name, company name, address, contact number and bank details (auto-populated). Show: recipient, original invoice number, original invoice date, original invoice amount, amount outstanding, days overdue (calculate from original invoice date to today's date), any previous chase attempts, deadline for payment. Include a clear reference to the Late Payment of Commercial Debts (Interest) Act 1998 and state that the sender reserves the right to charge statutory interest at 8% above the Bank of England base rate on overdue amounts, plus the £40-£100 fixed compensation per invoice under section 5A. End with an ISSUED BY block auto-populated from the user profile (full name printed, company name, today's date, signature line)."
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
    "A quote built on price work (per-metre / per-unit) rates. typical for ductwork, ceilings, decorating, plastering.",
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
  t("photo-evidence-log", "Photo Evidence Log", "site", "A timestamped photo evidence log of site conditions, defects, deliveries. Critical for disputes.", [
      fp("logDate", "Log date", "today", "date"),
      f("siteName", "Site name / project reference"),
      f("loggedBy", "Logged by (name)"),
      sel("evidenceCategory", "Evidence category", ["Defect", "Damage / pre-existing", "Delivery", "Site conditions", "Health & Safety hazard", "Progress / works in place", "Other"]),
      f("locationOnSite", "Location on site (room / level / grid ref)"),
      ta("entries", "Photo entries (one per line: photo reference, time, what the photo shows, action required)"),
      sel("partOfDispute", "Is this evidence linked to a dispute or claim?", ["No", "Yes — variation", "Yes — contra charge", "Yes — extension of time", "Yes — defect"]),
      tao("disputeReference", "Dispute / claim reference (if applicable)"),
    ], `Produce a UK Photo Evidence Log. Use the user's profile for prepared-by (full name, company, today's date). Format as a clean table document with the following sections:
1. HEADER — Log date, Site, Logged by, Evidence category, Location on site, Linked dispute reference (if applicable).
2. INTRODUCTION — One short paragraph stating the purpose of the log: 'The photographs referenced below were taken at the site noted above for the purpose of contemporaneous evidence. Each entry is timestamped and described by the operative listed below.'
3. EVIDENCE TABLE — produce a numbered table with these columns:
   Ref / Time / Photo description / Action required / Photo reference (Photo number to attach)
   One row per entry supplied by the user. Number them P-001, P-002, etc.
4. CHAIN OF CUSTODY STATEMENT — 'I confirm the photographs referenced in this log were taken by me on the date stated above, are unedited, and accurately represent the conditions observed at the time of capture.'
5. NEXT STEPS — Recommend what to do with this log (attach to a variation, raise an RFI, submit to client, raise an incident report) based on the evidence category supplied.
End with a SIGNED block (full name printed, company, signature line, today's date).`),
  t("verbal-instruction-recorder", "Verbal Instruction Recorder", "site", "Records verbal instructions received on site. converts to a Confirmation of Verbal Instruction (CVI) letter so you get paid for it.", [
      f("issuerName", "Who gave the instruction (full name)"),
      sel("issuerRole", "Their role", ["Site Manager", "Project Manager", "Client", "Engineer", "Foreman", "Quantity Surveyor", "Other"]),
      fo("issuerCompany", "Their company"),
      fp("instructionDateTime", "Date and time instruction was given", "today", "datetime-local"),
      f("locationOnSite", "Location on site where instruction was given"),
      f("siteAddress", "Site address / project reference"),
      ta("instruction", "Verbal instruction received (exact wording where possible)"),
      sel("scopeImpact", "Scope impact", ["Adds to scope", "Reduces from scope", "Substitution / alternative method", "Sequence / programme change", "Unsure"]),
      sel("costImpact", "Cost impact", ["Yes — additional cost", "Yes — saving", "No cost impact", "To be agreed"]),
      sel("timeImpact", "Time impact", ["Yes — delay", "Yes — acceleration", "No time impact", "To be agreed"]),
      fo("witnessName", "Witness present (if any)"),
      fo("approxValue", "Approximate value (£) if known", "number"),
      sel("deadlineForWritten", "Deadline for written confirmation", ["48 hours", "72 hours", "5 working days", "7 days"]),
    ], `Produce a UK Confirmation of Verbal Instruction (CVI) letter. Use the user's profile for sender (full name, company, address, contact). Format:
1. ADDRESS BLOCK — To: issuer name + role + their company (if supplied). From: user profile (full name, company, address).
2. SUBJECT — 'Confirmation of Verbal Instruction issued on [date and time supplied]'.
3. OPENING — 'I am writing to confirm in writing the verbal instruction received as set out below. Under industry good practice and the Housing Grants, Construction and Regeneration Act 1996, instructions issued verbally should be confirmed in writing without delay to avoid disputes over scope, cost and programme.'
4. INSTRUCTION DETAILS — clearly numbered:
   1. Issued by: name + role + company
   2. Date and time: as supplied
   3. Location on site: as supplied
   4. Instruction received: the exact wording supplied
   5. Witness (if supplied)
5. IMPACT ASSESSMENT — three lines:
   Scope impact: as selected
   Cost impact: as selected (and approximate value if supplied — make clear this is indicative and subject to a formal variation)
   Time impact: as selected
6. REQUEST FOR WRITTEN INSTRUCTION — 'I now formally request your written confirmation of this instruction within [deadline supplied]. If written confirmation is not received within that period, I will treat the above as a properly issued instruction and proceed accordingly, reserving the right to apply for additional cost and time as a variation.'
7. NEXT STEPS — 'Where this instruction results in a variation, a formal Variation Letter will follow. Please reply confirming acceptance, amendment or rejection by return.'
End with an ISSUED BY block from the user profile (full name printed, company, today's date, signature line).`),
  t("contract-review", "Contract Review", "site", "Plain-English review of a construction contract. flags the dodgy clauses, onerous terms and payment risks.", [ta("contractText", "Paste relevant contract text")], "Review the supplied UK construction contract text. Flag onerous clauses (pay-when-paid, set-off, indemnities, time-bar), payment terms, retention, LDs, and notice provisions. Plain English summary with risk rating."),
  t("dispute-timeline", "Dispute Timeline", "site", "Builds a chronological timeline of a dispute from your bullet points. essential for adjudication.", [ta("events", "Events (one per line: date. what happened)")], "Convert the supplied events into a clean chronological dispute timeline with dates, parties, and document references."),
  t("incident-report", "Incident Report", "site", "RIDDOR-aware incident report. near misses, injuries, dangerous occurrences.", [f("date", "Date / time"), f("location", "Location"), f("persons", "Persons involved"), ta("description", "What happened"), ta("actions", "Immediate actions taken")], "Produce a HSE / RIDDOR-aware Incident Report with sections: Incident Details, Persons Involved, Description, Immediate Actions, Root Cause, Lessons Learned, Reportable under RIDDOR? (yes/no/possibly)."),
  t("reminders", "Reminders", "site", "Custom reminders for inspections, certificates, calibrations, insurance renewals.", [ta("items", "Items to remind (one per line)")], "Produce a Reminders Register with Item / Frequency / Last Done / Next Due / Owner / Status."),
  t("toolbox-talk", "Toolbox Talk", "site", "A short, trade-specific toolbox talk briefing. 5–10 minutes, signed by the crew.", [
      f("topic", "Topic / subject of the talk"),
      fp("talkDate", "Date of talk", "today", "date"),
      f("siteName", "Site name and address"),
      f("deliveredBy", "Delivered by (name)"),
      f("durationMinutes", "Duration (minutes)", "number"),
      f("attendeesCount", "Number of attendees", "number"),
      ta("attendeesNames", "Attendees (one name per line — will form the sign-off sheet)"),
      tao("specificHazards", "Site-specific hazards related to this topic (optional, will be added to the standard set)"),
      sel("ppeRequired", "PPE required for this activity", ["Standard (hard hat, hi-vis, boots, gloves, glasses)", "Standard + RPE", "Standard + harness", "Standard + ear defenders", "Other"]),
      tao("ppeOther", "If 'Other' PPE — specify"),
    ], `Produce a UK toolbox talk briefing for the user's trade on the supplied topic. Format the document as follows:
1. HEADER — Topic, Date, Site, Delivered by, Duration, Number of attendees.
2. PURPOSE — One short paragraph explaining why this talk matters today.
3. RELEVANT LEGISLATION — cite the applicable UK regulations (e.g. Work at Height Regulations 2005, Manual Handling Operations Regulations 1992, COSHH 2002, Control of Noise at Work Regulations 2005, PUWER 1998, CDM 2015) depending on the topic.
4. KEY HAZARDS — bulleted list of the main hazards including any site-specific hazards supplied.
5. CONTROL MEASURES — bulleted list of how those hazards are controlled.
6. DO'S — short list of must-do actions.
7. DON'TS — short list of must-not actions.
8. PPE REQUIRED — list the PPE supplied.
9. EMERGENCY PROCEDURES — first aider, assembly point, raising the alarm.
10. QUESTIONS & DISCUSSION — placeholder line for site-specific questions raised.
11. SIGN-OFF SHEET — produce a table with one row per attendee (use the supplied names), columns: Print Name / Signature / Date. Add a final row for the person delivering the talk with the same three columns. Above the table state: 'By signing below I confirm I have attended this Toolbox Talk, understood the content and had the opportunity to ask questions.'
Close with a PREPARED BY block from the user profile (full name, company, today's date).`),
  t("asbestos-record", "Asbestos Record", "site", "A record entry for asbestos awareness. refurbishment & demolition survey reference, suspected ACMs, actions.", [f("location", "Location"), ta("suspect", "Suspect material / location"), ta("action", "Action taken")], "Produce an Asbestos Awareness Record entry, referencing CAR 2012 and the requirement for a Refurbishment & Demolition Survey before intrusive works."),
  t("snagging-list", "Snagging List", "site",
    "A formal snagging list with project, inspection and item-level detail. Used at handover to record every defect that must be put right.",
    [
      f("projectName", "Project name"),
      ta("projectAddress", "Project address"),
      f("unitPlotNumber", "Unit / plot number"),
      fp("inspectionDate", "Inspection date and time", "today", "datetime-local"),
      f("inspectedByName", "Inspected by (name)"),
      sel("inspectedByRole", "Inspector role", ["Client", "Site Manager", "Quantity Surveyor", "Architect", "Building Surveyor", "Building Control", "Contractor", "Subcontractor", "Other"]),
      f("contractorRepresentative", "Contractor representative (full name + company)"),
      ta("snagItems", "Snag items. One snag per line, separated by | with these columns in order: location | item / element | defect description | severity (Low cosmetic / Medium functional / High urgent safety) | status (Open / In Progress / Closed) | target completion date"),
    ],
    `Produce a formal UK Snagging List. Use SNG-NNN format for the list reference (taken from the document reference). Format:
1. HEADER — Snagging list reference {ref}, Inspection date and time, Project name, Project address, Unit / plot number, Inspected by + role, Contractor representative.
2. SNAG ITEMS — produce a clean numbered table. Start numbering from S-001 and increment for each item supplied. Columns: Item No / Location / Item or Element / Defect Description / Severity / Status / Target Completion Date. Parse the user-supplied lines (separated by |) into the columns in order. If a row is missing a value, leave that cell blank.
3. SEVERITY KEY — print under the table on its own line: 'SEVERITY KEY: Low — cosmetic. Medium — functional. High — urgent safety issue.'
4. SUMMARY — auto-calculate and display three counters: 'Total snags: {count}. Open: {count}. In Progress: {count}. Closed: {count}.'
5. STATEMENT — print verbatim on its own line, bold: 'THIS SNAGGING LIST IS AN OFFICIAL INSPECTION RECORD AND MUST BE ACTIONED WITHIN THE AGREED TIMESCALES.'
6. NEXT ACTIONS — state that the contractor representative shall update the Status column upon completion of each item and re-issue the list to the inspector.
End with an INSPECTED BY block (inspector name, role, signature line, today's date) and a CONTRACTOR REPRESENTATIVE acknowledgement block.`
  ),
  t("site-access-permit", "Site Access Permit", "site", "Permit-to-work for restricted areas or high-risk activity (hot works, confined space).", [f("permitType", "Permit type"), f("location", "Location"), ta("controls", "Controls in place"), f("validity", "Valid from / to")], "Produce a Permit to Work form for the supplied activity. controls, isolation, gas tests if applicable, sign-on / sign-off."),
  t("measurement-record", "Measurement Record", "site", "A site measurement sheet. sketch references, dimensions, notes. Essential for price-work valuations.", [f("area", "Area / location"), ta("measurements", "Measurements (one per line)")], "Produce a clean Measurement Record sheet with Location / Reference / Dimensions / Quantity / Unit / Notes."),
  t("weather-log", "Weather Log", "site", "A weather log entry. temperature, wind, rain. Critical evidence for weather-related EoT claims.", [f("date", "Date"), f("conditions", "Conditions"), ta("impact", "Impact on works")], "Produce a Weather Log entry with date, conditions (temp / wind / rain / visibility), and impact on works (e.g. could not lift / could not paint externally)."),
  t("prestart-meeting", "Pre-Start Meeting Checklist", "site", "A pre-start meeting agenda and checklist. programme, RAMS, welfare, deliveries, key risks.", [f("project", "Project"), f("date", "Date")], "Produce a Pre-Start Meeting Checklist & Agenda for a UK construction project."),
  t("meeting-notes", "Meeting Notes", "site", "Convert your scribbled notes into a clean, distributable meeting minutes document.", [f("meeting", "Meeting subject"), f("date", "Date"), ta("attendees", "Attendees"), ta("rough", "Rough notes")], "Convert the rough notes into clean minutes: Attendees, Apologies, Items Discussed, Actions (with owner and date), Next Meeting."),
  t("delivery-record", "Delivery Record", "site", "A goods received record. supplier, items, condition, signed for.", [f("date", "Date"), f("supplier", "Supplier"), ta("items", "Items received"), f("condition", "Condition")], "Produce a Delivery Record table with Date / Supplier / Delivery Note No / Items / Quantity / Condition / Received By."),
  t("tool-register", "Tool and Equipment Register", "site", "Asset register of your tools and equipment. calibration, PAT, who has it. Helps insurance claims.", [ta("items", "Items (one per line)")], "Produce a Tool & Equipment Register: Asset ID / Description / Serial No / Owner / Last Cal/PAT / Next Due / Location."),
  t("procurement-schedule", "Procurement Schedule", "site", "A procurement schedule listing key materials, lead times, order-by dates.", [ta("items", "Items + lead times")], "Produce a Procurement Schedule: Item / Required On Site / Lead Time / Order By / Supplier / Status."),
  t("risk-register", "Risk Register", "site", "A live risk register with probability × impact scoring (risk matrix).", [ta("risks", "Risks (one per line)")], "Produce a Risk Register: Ref / Risk Description / Probability (1–5) / Impact (1–5) / Score / Owner / Mitigation / Status."),
  t("variation-instruction-log", "Variation Instruction Log", "site", "A live log of every variation instruction received. date, source, status, value.", [ta("variations", "Variations (one per line)")], "Produce a Variation Instruction Log: VO No / Date / Source / Description / Estimated £ / Status / Approved By."),
  t("coshh", "COSHH Assessment", "site", "Control of Substances Hazardous to Health assessment for a specific substance you use.", [
      f("substance", "Substance / product name (as on the container)"),
      fo("manufacturer", "Manufacturer / supplier"),
      fo("manufacturerEmergencyPhone", "Manufacturer 24/7 emergency contact number"),
      f("location", "Site / location where used"),
      ta("activity", "Activity / how the substance is used"),
      sel("hazardClass", "Hazard class (per CLP labels)", ["Irritant", "Corrosive", "Toxic / harmful", "Flammable", "Sensitiser", "Carcinogenic / mutagenic / toxic for reproduction (CMR)", "Hazardous to environment", "Other"]),
      sel("exposureRoute", "Primary exposure route", ["Inhalation", "Skin contact", "Eye contact", "Ingestion", "Multiple routes"]),
      fo("wel", "Workplace Exposure Limit (WEL) if known (mg/m³ or ppm)"),
      f("personsAtRisk", "Persons at risk (operatives, public, vulnerable persons)"),
      ta("controlMeasures", "Control measures in place (extraction / dilution / substitution / handling)"),
      sel("ppeRequired", "PPE required", ["Gloves only", "Gloves + eye protection", "Gloves + eye protection + RPE", "Full chemical suit + RPE", "Other"]),
      ta("firstAid", "First aid measures (skin / eyes / inhalation / ingestion)"),
      ta("targetOrgansLongTerm", "Target organs and long-term health effects (e.g. lungs, liver, skin, CNS — and any chronic effects such as sensitisation, asthma, dermatitis)"),
      sel("storage", "Storage requirements", ["Locked store", "Ventilated store", "Fire-rated cabinet", "Cool/dry place", "Other"]),
      ta("spillProcedure", "Spill procedure and waste disposal method"),
      sel("rpeRequired", "Is RPE required?", ["No", "Yes — FFP2", "Yes — FFP3", "Yes — half-mask with cartridge", "Yes — full-face with cartridge", "Yes — air-fed"]),
    ], `Produce a UK COSHH Assessment compliant with the Control of Substances Hazardous to Health Regulations 2002 (as amended). Format as follows:
1. SUBSTANCE DETAILS — name, manufacturer, manufacturer 24/7 emergency contact number (if supplied — display it on its own line clearly labelled), location, activity in which it is used.
2. HAZARD IDENTIFICATION — hazard class (from CLP labels), exposure route, Workplace Exposure Limit (WEL) if supplied.
3. PERSONS AT RISK — operatives and any other persons (public, vulnerable persons).
4. RISK MATRIX — for this substance show Likelihood (1-5), Severity (1-5), Risk Score (LxS) BEFORE controls and AFTER controls.
5. CONTROL MEASURES — Hierarchy of control (Elimination / Substitution / Engineering / Administrative / PPE). State the measures supplied.
6. PPE REQUIRED — list the specific PPE from the user input. If RPE is required, state the type.
7. SAFE HANDLING & STORAGE — how to handle and store the substance safely.
8. EMERGENCY PROCEDURES & FIRST AID — first aid for skin, eyes, inhalation and ingestion. If a manufacturer 24/7 emergency contact number is on file, repeat it at the top of this section: 'In an emergency call: {number} (manufacturer 24/7 line) AND 999.'
9. TARGET ORGANS AND LONG-TERM HEALTH EFFECTS — produce a clearly labelled section listing the target organs and any long-term / chronic health effects supplied. If the user did not supply anything, state 'Refer to the current Safety Data Sheet section 11 (Toxicological information).'
10. SPILL CONTAINMENT & WASTE DISPOSAL — what to do in a spill and how to dispose of the waste lawfully (including SDS reference and registered carrier).
11. HEALTH SURVEILLANCE — state whether health surveillance is required for this substance (e.g. for sensitisers, CMRs, dusts at the WEL).
12. SAFETY DATA SHEET — state: 'A current Safety Data Sheet (SDS) for this substance is held on site and is available for inspection.'
13. REVIEW — review date is 12 months from today's date OR sooner if the substance, process or controls change.
14. BRIEFING — list a sign-off table with columns Print Name / Signature / Date for every operative who handles the substance.
Close with a PREPARED BY block from the user profile (full name, company, today's date) and a REVIEWED BY block.`),
  t("noise-assessment", "Noise Assessment", "site", "Noise at Work assessment. exposure, hearing protection required.", [f("activity", "Activity"), f("estimatedDb", "Estimated dB(A)")], "Produce a Control of Noise at Work Regulations 2005 assessment. exposure action values 80/85 dB(A), hearing protection required, signage."),
  t("manual-handling", "Manual Handling Assessment", "site", "A TILE / LITE manual handling risk assessment.", [f("load", "Load / item"), f("weight", "Weight"), ta("task", "Task description")], "Produce a Manual Handling Operations Regulations 1992 assessment using the TILE method (Task, Individual, Load, Environment) for the supplied task."),
  t("working-at-height-rescue", "Working at Height Rescue Plan", "site", "Mandatory Working at Height rescue plan. what happens if someone falls into a harness.", [f("activity", "Activity"), f("height", "Working height"), ta("rescueMethod", "Rescue method available")], "Produce a Working at Height Regulations 2005 Rescue Plan. fall arrest equipment, rescue method, suspension trauma considerations, emergency contacts."),
  // ---------- PRICE WORK ----------
  t("scope-of-works", "Scope of Works", "pricework", "A precise written scope of works. what's included, what's not. Stops scope creep.", [
      f("project", "Project / site name"),
      f("client", "Client / main contractor"),
      ta("siteAddress", "Site address"),
      fp("startDate", "Anticipated start date", "today", "date"),
      f("estimatedDuration", "Estimated duration on site"),
      ta("inclusions", "Inclusions (work that IS in scope — be specific)"),
      ta("exclusions", "Exclusions (work that is NOT in scope — list everything that's commonly assumed)"),
      ta("assumptions", "Assumptions the scope is based on (e.g. access available, power on site, prior works complete)"),
      sel("priceBasis", "Price basis", ["Fixed price", "Day rate", "Price work / per-unit", "Cost plus"]),
      tao("preliminaries", "Preliminaries included (welfare, scaffolding, waste removal, etc.)"),
      ta("deliverables", "Deliverables on completion (e.g. certificates, snag list closed, handover docs)"),
      fo("retention", "Retention percentage (if applicable)", "number"),
    ], `Produce a UK tight Scope of Works document. Use the user's profile for prepared-by (full name, company, address, contact). Format with these labelled sections:
1. PROJECT DETAILS — Project, Client, Site address, Anticipated start date, Estimated duration, Price basis.
2. INTRODUCTION — Short paragraph stating: 'This Scope of Works defines what is INCLUDED and what is EXCLUDED for the works to be carried out by the supplier listed at the foot of this document. It is intended to be read in conjunction with any contract, drawings or specification provided.'
3. INCLUSIONS — bullet list of every item supplied in 'Inclusions'.
4. EXCLUSIONS — bullet list of every item supplied in 'Exclusions'. Add a clear note: 'Any work not expressly listed above is considered excluded and will be subject to a separate variation.'
5. ASSUMPTIONS — bullet list of every assumption supplied. Add a clear note: 'Any variation in these assumptions may impact cost and/or programme and will be communicated in writing.'
6. PRELIMINARIES — bullet list of every item supplied (if any).
7. DELIVERABLES — bullet list of items supplied.
8. RETENTION — state the retention percentage if supplied; otherwise state 'No retention applicable.'
9. ACCEPTANCE — 'Acceptance of this Scope of Works confirms the basis on which the supplier will proceed.'
End with two signature blocks: PREPARED BY (user profile) and ACCEPTED BY (client full name printed, company, signature line, date).`),
  t("pricework-variation-tracker", "Price Work Variation Tracker", "pricework", "Tracks every variation on a price-work job. extra rates, extra metres, extra units.", [ta("variations", "Variations (date, description, qty, rate, total)")], "Produce a Price Work Variation Tracker table."),
  t("standing-time-calculator", "Standing Time Calculator", "pricework", "Calculates standing time you are owed when the site can't let you work.", [f("hoursStanding", "Hours standing"), f("dayRate", "Day rate (£)"), ta("reason", "Reason for standing time")], "Produce a Standing Time claim letter / calculation: hours lost × rate, reason, with a request for written approval."),
  t("pricework-profit", "Price Work Profit Calculator", "pricework", "Quickly works out your profit / £ per hour on a price-work job.", [f("priceWorkValue", "Price work value (£)"), f("hoursOnJob", "Hours on the job"), f("materialsCost", "Materials cost (£)")], "Produce a Price Work Profit summary: Revenue, Materials, Net, Hours, £/hr, vs. day rate benchmark."),
  // ---------- SOLE TRADER ----------
  t("hmrc-correspondence", "HMRC Correspondence", "soletrader", "A polite, correctly-phrased reply to a letter from HMRC.", [ta("hmrcLetter", "Their letter (paste the gist)"), ta("yourPosition", "Your position")], "Produce a professional UK reply to HMRC correspondence. courteous, factual, referencing your UTR and the matter at hand."),
  t("reference-letter", "Reference Letter", "soletrader", "A professional reference for a colleague, apprentice or labourer.", [f("name", "Person's name"), ta("worked", "What they did / for how long")], "Produce a UK professional reference letter for a tradesperson. skills, attitude, reliability."),
  t("rate-increase-letter", "Rate Increase Letter", "soletrader", "A short, professional letter notifying a client that your rate is going up.", [f("oldRate", "Old rate"), f("newRate", "New rate"), f("effective", "Effective from")], "Produce a UK rate increase letter. reference rising costs (materials, fuel, insurance) and effective date."),
  t("apprentice-manager", "Apprentice Manager", "soletrader", "Progress, training and competency tracker for your apprentice.", [f("apprenticeName", "Apprentice"), ta("progress", "Recent progress / skills")], "Produce an Apprentice Progress Report. units of competence covered, skills gained, areas to develop, next steps."),
  // ---------- CONTRACTORS ----------
  t("subbie-mgmt", "Subcontractor Management", "contractors", "A subcontractor management dossier. contact, scope, payment status, compliance.", [f("subbie", "Subcontractor"), ta("notes", "Status / notes")], "Produce a Subcontractor Management summary: Contact, Trade, Scope, Order Value, Paid To Date, Compliance (insurance, CSCS, RAMS), Status."),
  t("variation-tracker", "Variation Tracker", "contractors", "A multi-job variation tracker.", [ta("variations", "Variations across jobs")], "Produce a multi-project Variation Tracker table."),
  t("rams-library", "RAMS Library", "contractors", "Index of your RAMS documents by trade / activity.", [ta("entries", "RAMS in library")], "Produce a RAMS Library index: Reference / Activity / Trade / Version / Date / Review Due."),
  t("contract-mgmt", "Contract Management", "contractors", "Contract register. parties, value, dates, key clauses.", [ta("contracts", "Contracts (one per line)")], "Produce a Contract Register: Ref / Parties / Value / Start / End / Retention / Key Clauses / Status."),
  t("multiuser-site-diary", "Multi-user Site Diary", "contractors", "A consolidated daily diary across multiple gangs / sub-trades.", [f("date", "Date"), ta("gangs", "Gangs and their works")], "Produce a consolidated multi-gang Site Diary for the supplied date."),
  t("payment-tracker", "Payment Tracker", "contractors", "Tracks money in and money out across all live jobs.", [ta("entries", "Payment entries")], "Produce a Payment Tracker: Job / Application / Date / Net / Due Date / Status / Notes."),
  t("incident-log", "Incident Log", "contractors", "Master incident & near-miss log across jobs.", [ta("incidents", "Incidents")], "Produce an Incident & Near Miss Log: Date / Site / Type / Description / Action / RIDDOR? / Closed."),
  t("labour-allocation", "Labour Allocation", "contractors", "Daily labour allocation across multiple sites.", [f("date", "Date"), ta("allocation", "Labour allocation")], "Produce a Labour Allocation sheet: Operative / Trade / Site / Hours / Task."),
  t("purchase-order", "Purchase Order", "contractors", "A formal Purchase Order to a supplier or subcontractor.", [f("supplier", "Supplier"), ta("items", "Items"), f("total", "Total (£)")], "Produce a formal UK Purchase Order with PO number, supplier, line items, total, delivery address, payment terms."),
  t("subbie-payment-cert", "Subbi Payment Certificate", "contractors", "A payment certificate to a subcontractor under HGCRA 1996.", [f("subbie", "Subcontractor"), f("appNo", "Application number"), f("certifiedValue", "Certified value (£)"), f("paylessReason", "Pay less reason (if any)")], "Produce a UK Payment Certificate / Pay Less Notice to a subcontractor under HGCRA 1996. including final date for payment."),
  t("hs-policy", "H&S Policy", "contractors", "A short, signed Health & Safety policy statement.", [
      f("companyTradingName", "Trading name (if different to profile company name)", "text"),
      f("directorName", "Responsible person / Director / Proprietor (full name)"),
      f("directorRole", "Position (e.g. Director, Proprietor, Owner)"),
      f("totalEmployees", "Total number of employees (incl. self)", "number"),
      sel("employersLiability", "Employers Liability Insurance held?", ["Yes", "Not required (sole trader, no employees)"]),
      fo("eliPolicyNumber", "Employers Liability policy number (if held)"),
      fo("eliInsurer", "Employers Liability insurer name"),
      f("publicLiabilityCover", "Public Liability cover amount (e.g. £2m, £5m)"),
      ta("typicalActivities", "Typical activities undertaken by the business (3–5 lines)"),
      f("firstAiderName", "Named First Aider"),
      fo("hsAdvisor", "Health & Safety advisor / consultant (if used)"),
      sel("riskAssessmentsHeld", "Are RAMS / Risk Assessments held for each task?", ["Yes", "No (to be implemented)"]),
      fp("policyDate", "Policy issue date", "today", "date"),
      f("nextReviewDate", "Policy next review date (typically 12 months)"),
    ], `Produce a UK Health & Safety Policy Statement compliant with the Health and Safety at Work etc Act 1974 section 2(3) (which requires a written policy from any employer with 5 or more employees, and is good practice for sole traders). Use the user's profile for company name, address, contact and trade (auto-populated). Format the document with these exact sections:
1. STATEMENT OF GENERAL POLICY — a short statement that the business is committed to providing a safe and healthy workplace for all employees, subcontractors, clients and members of the public who may be affected by its activities.
2. COMPANY DETAILS — trading name, registered address (from profile), responsible person and their position, total number of employees, typical activities undertaken.
3. RESPONSIBILITIES — clearly list the responsibilities of: (a) the named responsible person / Director, (b) supervisors / site managers, (c) employees and subcontractors. Each list should be 3–5 bullet points.
4. RISK ASSESSMENT — state that suitable and sufficient risk assessments are carried out for each task and reviewed regularly (or, if 'No' was supplied, state that risk assessments are being implemented and which tasks are next).
5. INSURANCE — list Employers Liability (with insurer + policy number if supplied, OR state 'Sole trader — no employees — Employers Liability not required') and Public Liability cover amount.
6. TRAINING & COMPETENCE — state that all employees are competent for the tasks they carry out, hold appropriate cards (CSCS) where required, and toolbox talks / refresher training are provided regularly.
7. FIRST AID & WELFARE — named first aider, location of first aid kit and accident book, welfare arrangements on site.
8. ACCIDENTS & RIDDOR REPORTING — accidents are recorded in the accident book and reportable incidents are notified to the HSE under RIDDOR 2013.
9. CONSULTATION — employees are consulted on H&S matters under the Health and Safety (Consultation with Employees) Regulations 1996.
10. PPE — appropriate PPE is provided free of charge under the PPE at Work Regulations 1992 (as amended 2022).
11. REVIEW — policy review date (use the date supplied or default to 12 months from issue date).
End with a signed statement block: 'Signed: ____________________ Print name: {director name} Position: {director role} Date: {policy date supplied or today}'. Use plain English. No markdown. No placeholders.`),
  t("subbie-compliance", "Subbi Compliance Checker", "contractors", "Checklist of compliance documents you should hold for each subbie.", [
      f("subbieName", "Subcontractor full / company name"),
      ta("subbieAddress", "Subcontractor address"),
      f("subbieUtr", "Subcontractor UTR"),
      sel("cisVerified", "CIS verified via HMRC?", ["Yes — Net 20%", "Yes — Net 30% (unverified)", "Yes — Gross 0%", "No — to be verified"]),
      sel("publicLiability", "Public Liability insurance held?", ["Yes — £2m+", "Yes — £5m+", "Yes — £10m+", "No — required"]),
      fo("publicLiabilityExpiry", "Public Liability expiry date", "date"),
      sel("employersLiability", "Employers Liability insurance held?", ["Yes — £5m+", "Yes — £10m+ (statutory minimum)", "Not applicable (sole trader)", "No — required"]),
      fo("employersLiabilityExpiry", "Employers Liability expiry date", "date"),
      sel("cscsCards", "CSCS cards held by all operatives?", ["Yes — all valid", "Partially valid", "No — required"]),
      sel("ramsHeld", "RAMS / Method Statement provided for the works?", ["Yes — signed and dated", "Provided but not signed", "No — required"]),
      sel("specificTraining", "Specific training certs held (e.g. PASMA, IPAF, Asbestos Awareness, Manual Handling)?", ["Yes — all relevant certs held", "Some certs outstanding", "Not relevant to this scope"]),
      sel("rightToWork", "Right to Work checks complete?", ["Yes — all operatives", "Pending", "No — required"]),
      sel("references", "References / past work checked?", ["Yes", "Partially", "No"]),
    ], `Produce a UK Subcontractor Compliance Checklist for the named subcontractor. Use the user's profile for the engaging contractor block (full name, company, address). Format as a tick-list document with PASS / FAIL / OUTSTANDING status against each requirement. Sections:
1. SUBCONTRACTOR DETAILS — name, address, UTR, verified CIS status.
2. INSURANCE — Public Liability (with expiry if supplied), Employers Liability (with expiry if supplied). Flag if either is missing or expires within 30 days.
3. CSCS — status of cards.
4. RAMS / METHOD STATEMENTS — held and signed for the specific scope.
5. SPECIFIC TRAINING — relevant trade certs.
6. RIGHT TO WORK — checked, pending or outstanding.
7. REFERENCES — checked, partial or outstanding.
8. OVERALL STATUS — RED (do not start works), AMBER (start subject to outstanding items being closed by a stated date), GREEN (cleared to start).
9. OUTSTANDING ACTIONS — bullet list of any FAIL or PENDING items and who owns each one.
10. REVIEW DATE — 30 days from today.
End with a PREPARED BY block from the user profile (full name, company, today's date) and a SUBCONTRACTOR ACKNOWLEDGEMENT block.`),
  t("commercial-report", "Commercial Report", "contractors", "A weekly / monthly commercial position report. earned value, cost, margin, risk.", [f("project", "Project"), f("period", "Period"), f("earnedValue", "Earned value (£)"), f("costToDate", "Cost to date (£)"), ta("risks", "Commercial risks")], "Produce a Commercial Report: Earned Value, Cost, Margin, Cash Position, Risks, Forecast Final Cost vs Final Value."),
  t("defects-tracker", "Defects Tracker", "contractors", "Defects log during liability period.", [ta("defects", "Defects (one per line)")], "Produce a Defects Tracker: Ref / Date Reported / Location / Description / Owner / Status / Date Closed."),
  t("new-starter-pack", "New Starter Pack", "contractors", "A new-starter induction pack. site rules, emergency procedures, sign-in.", [f("site", "Site")], "Produce a UK New Starter / Site Induction Pack. site rules, PPE, welfare, emergency procedures, sign-in form."),
  t("hire-agreement", "Hire Agreement", "contractors", "A simple plant / equipment hire agreement.", [
      f("hirerName", "Hirer's full name / company name"),
      ta("hirerAddress", "Hirer's address"),
      fo("hirerContact", "Hirer's contact number / email"),
      f("equipment", "Equipment description (make, model, serial / asset number)"),
      f("rate", "Hire rate (£ per day or per week)"),
      sel("rateBasis", "Rate basis", ["Per day", "Per week", "Per month"]),
      fp("startDate", "Hire start date", "today", "date"),
      f("endDate", "Hire end date / off-hire date"),
      f("deposit", "Deposit / security required (£)", "number"),
      ta("conditionOnHire", "Condition of equipment at start of hire (note any existing damage)"),
      sel("insuranceRequired", "Insurance required from hirer", ["Hire-in insurance / CPA insurance", "Hirer's own all-risks", "Not required"]),
      sel("operatorIncluded", "Operator included in hire?", ["No — hirer operates", "Yes — operator supplied"]),
      ta("siteAddress", "Site where equipment will be used"),
      fo("dailyHours", "Working day length (hours)", "number"),
      tao("specialTerms", "Any special terms (delivery, collection, fuel)"),
    ], `Produce a UK Plant / Equipment Hire Agreement between the user (as 'Owner / Hire Company') and the named hirer. Format:
1. PARTIES — Owner (user profile: full name, company, address, contact) and Hirer (full name / company, address, contact).
2. EQUIPMENT — description with make, model, serial / asset number, supplied condition.
3. HIRE TERM — start date, anticipated end date, working day length.
4. HIRE CHARGES — rate (per day / week / month), payment terms (weekly in advance unless otherwise agreed), VAT applicability based on the user's profile, deposit / security amount.
5. INSURANCE — state who insures the equipment during hire (CPA terms by default unless the hirer has their own all-risks cover). Reference the standard CPA Model Conditions for the Hiring of Plant 2011 (with operator) or 2021 (without operator) as appropriate.
6. RESPONSIBILITY FOR LOSS OR DAMAGE — under CPA conditions the hirer is responsible for loss or damage during the hire period (excluding fair wear and tear).
7. OPERATOR — if an operator is supplied, the operator remains the employee of the owner; if not, the hirer is responsible for competence and supervision of any operator they appoint.
8. DELIVERY, COLLECTION & OFF-HIRE — process for off-hire, condition check on return, any cleaning charges.
9. INDEMNITY — hirer indemnifies the owner against any claim arising from their use of the equipment, subject to the CPA conditions.
10. TERMINATION — either party may terminate on written notice; outstanding charges immediately due on termination.
11. GOVERNING LAW — England and Wales.
End with two signature blocks: OWNER (user profile: full name, company, today's date, signature line) and HIRER (full name printed, company, address, today's date, signature line). Close with: 'This agreement is legally binding once signed by both parties. Both parties should retain a signed copy. Hire is subject to the CPA Model Conditions referenced above, copies available on request.'`),
  t("tender-letter", "Tender Letter", "contractors", "A professional tender submission cover letter.", [f("client", "Client"), f("project", "Project"), f("tenderSum", "Tender sum (£)")], "Produce a professional UK tender cover letter. confirming sum, basis, validity (typically 90 days), and key exclusions."),
];

// Pseudo tools with custom routes (not generic form-based)
export const WOW_TOOLS = [
  { id: "verbal-to-variation", name: "Verbal to Variation", section: "documents", route: "/app/wow/verbal-to-variation",
    info: "Record yourself describing a verbal instruction you received on site. Morris converts it instantly into a formal variation letter. ready to send." },
  { id: "photo-to-document", name: "Photo to Document", section: "documents", route: "/app/wow/photo-to-document",
    info: "Snap a photo of a scribbled note, drawing or scrap of paper. Morris turns it into a clean professional document." },
  { id: "tax-pot", name: "Tax Pot", section: "finance", route: "/app/taxpot",
    info: "Set aside 8% of every CIS net payment to cover your end-of-year National Insurance. Morris keeps your running tax pot total alongside your Self Assessment deadline countdown." },
  { id: "company-checker", name: "Company Checker", section: "soletrader", route: "/app/company-checker",
    info: "Look up any UK contractor on Companies House before you commit labour. See active / dissolved status, accounts overdue and red flags." },
];

export function getToolById(id) {
  return TOOLS.find(t => t.id === id) || WOW_TOOLS.find(t => t.id === id);
}

// Emoji per tool. single source of truth so every render site is consistent
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
  "tax-pot": "🐖", "company-checker": "🏢",
  // Account
"favourites": "⭐", "history": "🗃️", "billing": "💳", "team": "👥", "profile": "👤", "privacy": "🛡️", "terms": "⚖️", "complaints": "📣", "refund": "💷", "offline-mode": "📴",
};

export function emojiFor(id) {
  return TOOL_EMOJI[id] || "🔧";
}

// ---------- Risk-level disclaimer system ----------
// Each tool falls into one of four risk categories — drives the colour + label
// of the disclaimer inside the Info popup.
const HS_TOOLS = new Set([
  "rams", "coshh", "noise-assessment", "manual-handling", "working-at-height-rescue",
  "risk-register", "hs-policy", "rams-library", "toolbox-talk", "asbestos-record",
]);
const LEGAL_TOOLS = new Set([
  "contract-review", "dispute-timeline", "novation-letter", "lds-dispute", "eot-claim",
  "contra-charge-dispute", "subcontract-letter", "hire-agreement",
]);
const TAX_TOOLS = new Set([
  "cis-calculator", "self-assessment-prep", "cis-refund-predictor", "vat-threshold",
  "mileage-tracker", "subbie-payment-cert", "hmrc-correspondence",
]);

const LIABILITY = "Morris Construction Tech Ltd accepts no liability for any loss, damage or injury arising from reliance on documents generated by the platform.";

const HS_BODY = "This document is a starting point only. You are responsible for reviewing and adapting it to the specific site, activity and persons at risk. Always carry out your own site-specific risk assessment and ensure all controls are in place before work commences. ";
const LEGAL_BODY = "This is not legal advice. Always seek qualified legal advice before relying on this document in any contract or dispute. Outcomes depend on the specific facts, contract and jurisdiction. ";
const TAX_BODY = "This is not tax advice. Figures are estimates only and do not replace professional accounting or HMRC guidance. Always confirm your tax position with a qualified accountant. ";
const STANDARD_BODY = "This document is provided as a starting point for administrative use only. Always review the content carefully before sending or signing and seek professional advice where required. ";

export function disclaimerFor(id) {
  if (HS_TOOLS.has(id))   return { category: "hs",       label: "Health and Safety Notice", icon: "⚠️", body: HS_BODY + LIABILITY };
  if (LEGAL_TOOLS.has(id)) return { category: "legal",   label: "Legal Notice",              icon: "⚖️",  body: LEGAL_BODY + LIABILITY };
  if (TAX_TOOLS.has(id))   return { category: "tax",     label: "Tax Notice",                icon: "🧮", body: TAX_BODY + LIABILITY };
  return                          { category: "standard", label: "Notice",                    icon: "📋", body: STANDARD_BODY + LIABILITY };
}

// ---------- High-risk tools requiring mandatory review confirmation ----------
// User must tick a checkbox confirming they have reviewed the document before
// it can be downloaded, sent, or shared. Per Prompt 1 Global Rules.
export const REVIEW_REQUIRED_TOOLS = new Set([
  "hmrc-correspondence",
  "working-at-height-rescue",
  "subbi-compliance-checker",
  "hs-policy",
  "hire-agreement",
  "subcontract-letter",
  "coshh",
  "noise-assessment",
  "manual-handling",
  "rams",
  "new-starter-pack",
  "apprentice-manager",
]);

export function requiresReview(toolId) {
  return REVIEW_REQUIRED_TOOLS.has(toolId);
}

// Tools that require a dual sign-off (contractor + client/recipient).
// Mirrors backend `DUAL_SIGNOFF_TOOLS` so the frontend can render the right
// number of signature pads on the tool form. Any tool not in this set falls
// back to a single contractor sign-off pad.
export const DUAL_SIGNOFF_TOOLS = new Set([
  "quote-builder", "variation-letter", "verbal-to-variation",
  "cis-invoice", "handover-certificate", "subcontract-letter",
  "complaint-letter", "application-for-payment", "retention-chaser",
  "final-account", "contra-charge-dispute", "eot-claim", "lds-dispute",
  "novation-letter", "bad-debt-letter", "snagging-list", "purchase-order",
  "subbie-payment-cert", "hire-agreement", "tender-letter",
  "scope-of-works", "price-work-quote", "rate-increase-letter",
  "hmrc-correspondence", "reference-letter",
  "photo-to-document",
]);

export function isDualSignoff(toolId) {
  return DUAL_SIGNOFF_TOOLS.has(toolId);
}

export const ACCOUNT_TOOLS = [
  { id: "favourites", name: "Favourites", section: "account", route: "/app/favourites", info: "Your starred tools, one click away." },
  { id: "history", name: "Document History", section: "account", route: "/app/history", info: "Every document you've generated, saved and ready to re-download." },
  { id: "billing", name: "Plan & Billing", section: "account", route: "/app/billing", info: "Your current plan, usage and upgrades." },
  { id: "team", name: "Team Management", section: "account", route: "/app/team", info: "Invite your crew, assign roles, see who's active." },
  { id: "profile", name: "My Profile", section: "account", route: "/app/profile", info: "Your company details. Used to personalise every document Morris generates." },
  { id: "privacy", name: "Privacy Policy", section: "account", route: "/app/privacy", info: "How Morris handles your data." },
  { id: "terms", name: "Terms and Conditions", section: "account", route: "/app/terms", info: "The legal terms of using Morris." },
  { id: "complaints", name: "Complaints", section: "account", route: "/app/complaints", info: "How to raise a complaint with Morris." },
  { id: "refund", name: "Refund Policy", section: "account", route: "/app/refund-policy", info: "Refund terms for Morris subscriptions." },
  { id: "offline-mode", name: "Offline Mode", section: "account", route: "/app/offline-mode", info: "Generate documents offline. Synced when you're back in signal." },
];

export function getToolsBySection(sectionId) {
  if (sectionId === "account") return ACCOUNT_TOOLS;
  const docTools = TOOLS.filter(x => x.section === sectionId);
  const wowInSection = WOW_TOOLS.filter(x => x.section === sectionId);
  return [...docTools, ...wowInSection];
}
