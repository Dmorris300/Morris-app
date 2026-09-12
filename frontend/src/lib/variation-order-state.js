// Morris — Variation Orders v2 wizard state helpers.
//
// Pure, side-effect-free functions that own the initial-state contract for
// the wizard. Extracted (Sep 2026, VO-STATE-01) so the "+ New Variation
// button must always initialise from a clean emptyVariation() state" rule
// is testable in isolation from the React component tree.
//
// CONTRACT:
//  - openNewBase()    → ALWAYS a clean baseline (+ optional template
//                        overrides + optional filter-project preselect).
//                        NEVER silently restores localStorage autosave.
//  - openEditBase(v)  → spread `v` on top of empty defaults so every
//                        newly-added field on the schema has a defined
//                        value even for older records.
//  - duplicateBase(v) → copy `v`, strip id / timestamps / signatures /
//                        status / refs, regenerate line-item ids.

const _newId = () => {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch { /* ignore */ }
  return `id-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
};

export const emptyLine = () => ({
  id: _newId(), category: "Labour", description: "", qty: 1, unit: "day", unitPrice: 0,
});

export const emptyVariation = () => ({
  projectId: "", projectName: "", projectAddress: "",
  clientName: "", clientCompany: "", clientEmail: "", clientPhone: "",
  originalQuoteId: "", originalQuoteRef: "", originalContractRef: "", originalContractDate: "",
  variationRef: "", variationDate: new Date().toISOString().slice(0, 10),
  status: "Draft", reason: "Client Request",
  instructionMethod: "Verbal", instructorName: "", instructorRole: "",
  instructionDate: new Date().toISOString().slice(0, 10), instructionLocation: "",
  scopeSummary: "",
  descriptionOfChange: "",
  reasonNarrative: "",
  referenceDocs: "",
  lineItems: [emptyLine()],
  addVat: false, vatRate: 20,
  programmeImpact: { kind: "No impact", days: 0, newPCDate: "", notes: "" },
  photoIds: [], supportingDocs: [],
  preparedBy: "", preparedSignature: "",
  clientApproverName: "", clientApproverSignature: "", approvedDate: "",
  rejectionReason: "",
  paymentTerms: "Payment for this variation will be included in the next Application for Payment.",
  notes: "",
  isFavourite: false,
});

// "+ New Variation" button. ALWAYS returns a clean record. Never
// restores localStorage autosave. Applies template + project preselect.
export function openNewBase({ fromTemplate = null, filterProject = "", jobs = [] } = {}) {
  let base = emptyVariation();
  if (fromTemplate) {
    base = {
      ...base,
      ...(fromTemplate.payload || {}),
      id: undefined,
      status: "Draft",
      variationRef: "",
      variationDate: base.variationDate,
      lineItems: (fromTemplate.payload?.lineItems || []).map((l) => ({ ...l, id: _newId() })),
    };
  }
  if (filterProject && !base.projectId) {
    const j = (jobs || []).find((x) => x.id === filterProject);
    if (j) {
      base.projectId = j.id;
      base.projectName = j.projectName || j.clientName || "";
      base.projectAddress = j.address || "";
      base.clientName = j.clientName || "";
      base.clientCompany = j.company || "";
    }
  }
  return base;
}

// "Resume / Edit" — spread the record on top of empty defaults.
export function openEditBase(v) {
  return { ...emptyVariation(), ...(v || {}) };
}

// "Duplicate" — copy the record, strip fields that must NOT survive.
export function duplicateBase(v) {
  const copy = { ...(v || {}) };
  delete copy.id;
  delete copy.createdAt;
  delete copy.updatedAt;
  delete copy._id;
  copy.status = "Draft";
  copy.variationDate = new Date().toISOString().slice(0, 10);
  copy.variationRef = "";
  copy.lineItems = (copy.lineItems || []).map((l) => ({ ...l, id: _newId() }));
  copy.preparedSignature = "";
  copy.clientApproverSignature = "";
  copy.approvedDate = "";
  return { ...emptyVariation(), ...copy };
}
