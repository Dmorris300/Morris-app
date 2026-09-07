// Morris — shared UK formatting + commercial constants.
//
// Every user-facing render of a date, money value or commercial dropdown
// should route through this module so we stay consistent across every
// tool and every PDF. Internal storage stays ISO / raw numbers; only the
// render path uses these helpers.

// ---------- Dates ----------------------------------------------------------

// Accepts ISO ("2026-02-24"), full ISO datetime, JS Date, or already-formatted
// "DD/MM/YYYY" string. Returns "DD/MM/YYYY" or "" when the input is empty.
export function formatUKDate(input) {
  if (input == null || input === "") return "";
  if (input instanceof Date) return _toDDMMYYYY(input);
  const s = String(input).trim();
  if (!s) return "";
  // Already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  // ISO date or datetime — take the date part.
  const isoLike = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoLike) return `${isoLike[3]}/${isoLike[2]}/${isoLike[1]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return _toDDMMYYYY(d);
  return s; // give up gracefully — caller sees the raw value
}

export function formatUKDateTime(input) {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return String(input);
  return `${_toDDMMYYYY(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Today's date in DD/MM/YYYY, used as the default for new records.
export function todayUKDate() {
  return _toDDMMYYYY(new Date());
}

function _toDDMMYYYY(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// ---------- Currency -------------------------------------------------------

// Format a GBP amount. `n` may be a number or a numeric string. Returns
// "£0.00" for falsy or NaN values so PDFs never show "£NaN".
export function formatGBP(n, { withSymbol = true, decimals = 2 } = {}) {
  const num = typeof n === "number" ? n : parseFloat(n);
  if (!isFinite(num)) return withSymbol ? "£0.00" : "0.00";
  const abs = Math.abs(num).toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const signed = num < 0 ? `-${abs}` : abs;
  return withSymbol ? `£${signed}` : signed;
}

// ---------- Commercial dropdown constants ---------------------------------

// Cleaned-up pricing basis options for variation / price-work tools. Use
// `basisIsLumpSum(v)` to decide whether Unit Rate and Units Completed should
// remain visible.
export const PRICING_BASIS = [
  "Lump Sum",
  "Per Item / Piece",
  "Per Metre",
  "Per m²",
  "Per m³",
  "Per Hour",
  "Per Day",
  "Other",
];
export function basisIsLumpSum(v) { return (v || "").trim() === "Lump Sum"; }
// Whether the basis drives a unit-rate × qty calculation (i.e. per-unit).
export function basisUsesUnitRate(v) {
  const s = (v || "").trim();
  if (!s || s === "Other" || s === "Lump Sum") return false;
  return true;
}

// Variation lifecycle — SEQUENCE MATTERS. Do NOT alphabetise.
export const VARIATION_STATUS_ORDER = ["Draft", "Submitted", "Certified", "Paid", "Rejected"];

// Quote lifecycle — Draft → Sent → Accepted → Rejected.
export const QUOTE_STATUS_ORDER = ["Draft", "Sent", "Accepted", "Rejected"];

// Priority — sequence matters.
export const PRIORITY_ORDER = ["Low", "Medium", "High"];

// Standard UK retention rates.
export const RETENTION_RATES = ["0%", "3%", "5%", "10%"];

// Standard UK VAT rates.
export const VAT_RATES = ["0%", "5%", "20%"];

// Instruction methods — alphabetical.
export const INSTRUCTION_METHODS = ["Email", "Letter", "Meeting", "Site instruction", "Text / WhatsApp", "Verbal"];

// Payment frequencies — sequence matters (short → long).
export const PAYMENT_FREQUENCIES = ["One-off on completion", "Weekly", "Fortnightly", "Monthly", "Stage payments"];

// Payment methods — alphabetical.
export const PAYMENT_METHODS = ["BACS", "Cheque", "Credit card", "Direct debit", "Standing order"];

// Category-aware cost units for variations. Use PRICING_BASIS where a full
// pricing basis is needed; use these when a compact "cost unit" is required.
export const COST_UNITS = ["each", "item", "lump sum", "metre", "m²", "m³", "hour", "day"];

// ---------- Sort helper ---------------------------------------------------

// Case-insensitive alphabetical sort. Non-mutating; returns a new array.
export function sortAlpha(list) {
  return [...(list || [])].sort((a, b) => String(a).toLowerCase().localeCompare(String(b).toLowerCase()));
}
