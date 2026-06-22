// Trade-aware placeholder examples for the RAMS "Manual Handling" section.
// Mirrors the existing trade list used by `tools-config.js` and the global
// "Personalised for [Trade] · Switch" pill. Unknown / missing trades fall
// back to a universal example so the placeholder is never empty.
const MAP = {
  "Duct Fitter":         "e.g. 'Carrying duct sections up stairs, two-person lift'",
  "Electrician":         "e.g. 'Carrying cable drums and trunking, two-person lift'",
  "Plumber":             "e.g. 'Carrying boilers, cylinders and pipe bundles, two-person lift'",
  "Heating Engineer":    "e.g. 'Carrying boilers, cylinders and pipe bundles, two-person lift'",
  "Bricklayer":          "e.g. 'Carrying blocks, bags of cement and kerbs, two-person lift'",
  "Groundworker":        "e.g. 'Carrying blocks, bags of cement and kerbs, two-person lift'",
  "Carpenter and Joiner": "e.g. 'Carrying sheet materials and timber lengths, two-person lift'",
  "Plasterer":           "e.g. 'Carrying bags of plaster and boards, two-person lift'",
};

const DEFAULT = "e.g. 'Carrying heavy or awkward materials, two-person lift'";

export function getManualHandlingPlaceholder(trade) {
  if (!trade) return DEFAULT;
  return MAP[trade] || DEFAULT;
}
