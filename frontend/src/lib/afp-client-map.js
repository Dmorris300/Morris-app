// AFP-CLIENT-MAP-01 (Sep 2026) — Pure Job → AFP client mapper.
//
// The Job schema historically stored a person + phone into a single
// free-text `clientContact` field, and older AFP code paths concatenated
// contact details across the four AFP client inputs. This module extracts
// the parsing + mapping logic from ApplicationsForPayment.jsx so it can
// be exercised headlessly and locked with regression tests.
//
// Contract: given a Job (any of the legacy shapes) return the four AFP
// client fields as a strictly-disjoint object:
//    { clientName, clientCompany, clientEmail, clientPhone }
// where `clientName` is the human contact (never the company), and
// nothing is ever concatenated into a foreign field.

export function isLegacyCombinedContact(s) {
  if (typeof s !== "string") return false;
  const trimmed = s.trim();
  if (!trimmed) return false;
  const hasSeparator = /[—–]|(\s-\s)|(\s\|\s)|(\s·\s)/.test(trimmed);
  if (!hasSeparator) return false;
  const phoneLike = /(?:\+?\d[\d\s\-]{5,})/;
  return phoneLike.test(trimmed);
}

export function parseClientContact(raw) {
  if (typeof raw !== "string") return { name: "", phone: "" };
  const s = raw.trim();
  if (!s) return { name: "", phone: "" };
  if (!isLegacyCombinedContact(s)) {
    // But still: if it's purely a phone (all digits and phone chars),
    // route it to phone rather than name. Accept spaced numbers by
    // counting total digits after stripping whitespace/punctuation.
    if (/^\+?[\d\s\-\(\)]+$/.test(s) && s.replace(/\D/g, "").length >= 6) {
      return { name: "", phone: s };
    }
    return { name: s, phone: "" };
  }
  const sepMatch = s.match(/\s(?:[—–\-|·])\s/);
  if (!sepMatch) return { name: s, phone: "" };
  const idx = sepMatch.index;
  const left = s.slice(0, idx).trim();
  const right = s.slice(idx + sepMatch[0].length).trim();
  const phoneLike = /(?:\+?\d[\d\s\-\(\)]{5,})/;
  const leftIsPhone = phoneLike.test(left) && !phoneLike.test(right);
  const rightIsPhone = phoneLike.test(right);
  if (rightIsPhone) return { name: left, phone: right };
  if (leftIsPhone) return { name: right, phone: left };
  return { name: left, phone: right };
}

export function buildAfpClientFromJob(j, prev = {}) {
  const parsed = parseClientContact(j?.clientContact);
  return {
    clientName: parsed.name || prev.clientName || "",
    clientCompany: j?.clientName || j?.company || prev.clientCompany || "",
    clientEmail: j?.clientEmail || j?.email || prev.clientEmail || "",
    clientPhone: j?.clientPhone || j?.phone || parsed.phone || prev.clientPhone || "",
  };
}
