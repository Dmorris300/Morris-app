// Morris — Legacy V1 → V2 Variation Order draft bridge (Sep 2026)
//
// Historic `variation-letter` drafts saved via the generic tool were stored
// as a flat `values` object on the draft's `data` field. VariationOrders v2
// consumes `?open=<recordId>` for existing V2 records but has no native
// understanding of the legacy shape. This helper maps legacy `values` into
// the V2 `emptyVariation()` shape so `VariationOrders.jsx?draft=<legacyId>`
// can hydrate the wizard with the user's original entries.
//
// Non-mutating: we NEVER rewrite the persisted legacy draft. The mapping
// runs client-side on open. On save, the wizard creates a fresh V2 record
// (POST /variation-orders/variations) and leaves the legacy draft alone so
// the user's history remains truthful.

const _num = (v) => {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const _str = (v) => (v === null || v === undefined ? "" : String(v));

// Turn a datetime-local ("2026-07-20T15:04") into a plain date ("2026-07-20")
// when the V2 field only accepts a date. Passes plain dates through as-is.
const _dateOnly = (v) => {
  const s = _str(v);
  if (!s) return "";
  return s.length >= 10 ? s.slice(0, 10) : s;
};

// Reason mapping: the legacy list has "Other" but V2 uses different labels
// for some items. Passthrough where the label already matches V2's set.
const _mapReason = (v) => {
  const known = new Set([
    "Client Request", "Unforeseen Site Condition", "Design Error",
    "Scope Change", "Material Substitution", "Other",
  ]);
  return known.has(v) ? v : "Client Request";
};

const _mapMethod = (v) => {
  const known = new Set(["Verbal", "Email", "WhatsApp", "Text message", "Written", "Other"]);
  return known.has(v) ? v : "Verbal";
};

const _mapRole = (v) => {
  const known = new Set(["Site Manager", "Project Manager", "Client", "Engineer", "Foreman", "Other"]);
  return known.has(v) ? v : "";
};

const _lineItemsFromLegacyCosts = (values, uuid) => {
  const rows = [];
  const push = (category, description, unit, amount) => {
    if (amount > 0) rows.push({ id: uuid(), category, description, qty: 1, unit, unitPrice: amount });
  };
  push("Labour", "Labour (imported from legacy variation letter)", "sum", _num(values.labourCost));
  push("Materials", "Materials (imported from legacy variation letter)", "sum", _num(values.materialsCost));
  push("Plant & Equipment", "Plant and equipment (imported from legacy variation letter)", "sum", _num(values.plantEquipmentCost));
  push("Preliminaries", "Preliminaries and overheads (imported from legacy variation letter)", "sum", _num(values.prelimsOverheads));
  return rows;
};

const _programmeImpactFromLegacy = (values) => {
  const days = _num(values.timeImpact);
  const newPC = _dateOnly(values.newPCDate);
  if (days > 0) {
    return { kind: "Additional days", days, newPCDate: newPC, notes: "" };
  }
  if (newPC) {
    return { kind: "Additional days", days: 0, newPCDate: newPC, notes: "" };
  }
  return { kind: "No impact", days: 0, newPCDate: "", notes: "" };
};

// Compose a `notes` field that preserves legacy details V2 has no home for.
const _composeNotes = (values) => {
  const parts = [];
  if (values.raisedBy) parts.push(`Raised by: ${values.raisedBy}.`);
  if (values.clauseRef) parts.push(`Contract clause: ${values.clauseRef}.`);
  return parts.join(" ").trim();
};

// Public: map a legacy variation-letter draft's `values` into a V2
// variation record shape suitable for `openEdit`. Returns partial fields
// only — the caller spreads `...emptyVariation(), ...mapped` so V2
// defaults (variationDate, status = "Draft", etc.) apply on top.
export function mapLegacyVariationLetterDraft(values) {
  if (!values || typeof values !== "object") return {};
  // Prefer window.crypto.randomUUID when available; fall back for older
  // browsers or SSR contexts. Never throw.
  const uuid = () => {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch { /* ignore */ }
    return `legacy-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
  };
  const mapped = {
    projectName: _str(values.project),
    clientName: _str(values.client),
    originalContractRef: _str(values.contractRef),
    originalContractDate: _dateOnly(values.contractDate),
    instructorName: _str(values.instructorName),
    instructorRole: _mapRole(values.instructorRole),
    instructionDate: _dateOnly(values.instructionDate) || new Date().toISOString().slice(0, 10),
    instructionLocation: _str(values.instructionLocation),
    instructionMethod: _mapMethod(values.instructionMethod),
    reason: _mapReason(values.reasonForVariation),
    referenceDocs: _str(values.referenceDocuments),
    scopeSummary: _str(values.originalScope),
    descriptionOfChange: _str(values.variation),
    addVat: !!values.addVat,
    vatRate: values.vatRate === "" || values.vatRate === undefined ? 20 : _num(values.vatRate),
    programmeImpact: _programmeImpactFromLegacy(values),
  };
  const lines = _lineItemsFromLegacyCosts(values, uuid);
  if (lines.length > 0) mapped.lineItems = lines;
  const notes = _composeNotes(values);
  if (notes) mapped.notes = notes;
  return mapped;
}

// Export test-only internals so the pytest bridge can assert individual
// transformations without importing the whole page module.
export const __test = {
  _mapReason, _mapMethod, _mapRole, _dateOnly, _num,
  _lineItemsFromLegacyCosts, _programmeImpactFromLegacy, _composeNotes,
};
