// AFP-CLIENT-MAP-01 — Job → AFP client field mapping regression.
//
// User report: linking the Riverside Apartments External Works project
// auto-filled Step 2 as:
//   Client Contact Name = Harrington Developments Ltd  ← WRONG (company)
//   Client Company      = Harrington Developments Ltd
//   Client Email        = Sarah Mitchell — 07700 912846  ← WRONG (combined)
//   Client Phone        = blank
//
// This suite locks the fix: every AFP client field must be a strictly-
// disjoint slice of the Job, nothing concatenated, legacy combined
// `clientContact` split cleanly into name + phone, and email/phone kept
// blank when the Job doesn't carry them.
//
// Run:
//   cd /app/frontend && \
//   node --experimental-loader ./tests/loader.mjs tests/afp-client-map-01.test.mjs

import assert from "node:assert/strict";
import { parseClientContact, buildAfpClientFromJob, isLegacyCombinedContact } from "../src/lib/afp-client-map";

let passed = 0, failed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log(`  ✔ ${name}`); } catch (e) { failed++; console.error(`  ✘ ${name}\n    ${e.stack || e.message}`); } };

console.log("AFP-CLIENT-MAP-01 — Job → AFP client mapping regression");

// ---- isLegacyCombinedContact -------------------------------------------
t("isLegacyCombinedContact — plain name is NOT combined", () => {
  assert.equal(isLegacyCombinedContact("Sarah Mitchell"), false);
  assert.equal(isLegacyCombinedContact("Jean-Luc Picard"), false); // hyphen in name is fine
});
t("isLegacyCombinedContact — 'Name — 07700 912846' IS combined", () => {
  assert.equal(isLegacyCombinedContact("Sarah Mitchell — 07700 912846"), true);
});
t("isLegacyCombinedContact — 'Name | +44 7700 912846' IS combined", () => {
  assert.equal(isLegacyCombinedContact("Sarah Mitchell | +44 7700 912846"), true);
});
t("isLegacyCombinedContact — non-string / empty / whitespace → false", () => {
  assert.equal(isLegacyCombinedContact(null), false);
  assert.equal(isLegacyCombinedContact(undefined), false);
  assert.equal(isLegacyCombinedContact(""), false);
  assert.equal(isLegacyCombinedContact("   "), false);
  assert.equal(isLegacyCombinedContact(0), false);
});

// ---- parseClientContact -------------------------------------------------
t("parseClientContact — plain name → { name, phone: '' }", () => {
  assert.deepEqual(parseClientContact("Sarah Mitchell"), { name: "Sarah Mitchell", phone: "" });
});
t("parseClientContact — plain phone digits → { name: '', phone }", () => {
  assert.deepEqual(parseClientContact("07700 912846"), { name: "", phone: "07700 912846" });
});
t("parseClientContact — '+44 20 7946 0000' plain number → routed to phone", () => {
  assert.deepEqual(parseClientContact("+44 20 7946 0000"), { name: "", phone: "+44 20 7946 0000" });
});
t("parseClientContact — legacy 'Name — 07700 912846' → split cleanly", () => {
  assert.deepEqual(
    parseClientContact("Sarah Mitchell — 07700 912846"),
    { name: "Sarah Mitchell", phone: "07700 912846" },
  );
});
t("parseClientContact — legacy 'Name | 07700 912846' → split cleanly", () => {
  assert.deepEqual(
    parseClientContact("Sarah Mitchell | 07700 912846"),
    { name: "Sarah Mitchell", phone: "07700 912846" },
  );
});
t("parseClientContact — legacy 'Name · 07700 912846' → split cleanly", () => {
  assert.deepEqual(
    parseClientContact("Sarah Mitchell · 07700 912846"),
    { name: "Sarah Mitchell", phone: "07700 912846" },
  );
});
t("parseClientContact — reversed 'Phone — Name' → still splits by phone-shape", () => {
  assert.deepEqual(
    parseClientContact("07700 912846 — Sarah Mitchell"),
    { name: "Sarah Mitchell", phone: "07700 912846" },
  );
});
t("parseClientContact — empty / null / undefined / non-string → { '', '' }", () => {
  assert.deepEqual(parseClientContact(""), { name: "", phone: "" });
  assert.deepEqual(parseClientContact(null), { name: "", phone: "" });
  assert.deepEqual(parseClientContact(undefined), { name: "", phone: "" });
  assert.deepEqual(parseClientContact(12345), { name: "", phone: "" });
});
t("parseClientContact — 'Jean-Luc Picard' (hyphen in name, no phone) → name only", () => {
  assert.deepEqual(parseClientContact("Jean-Luc Picard"), { name: "Jean-Luc Picard", phone: "" });
});

// ---- buildAfpClientFromJob ----------------------------------------------
t("Riverside repro — clientContact:null → all client fields blank, company correct", () => {
  // This is the darrenhustle300 Riverside job exactly as returned by
  // GET /api/jobs — clientContact is null, clientName holds the company.
  const job = {
    id: "41fa54d0",
    clientName: "Harrington Developments Ltd",
    projectName: "Riverside Apartments External Works",
    company: null,
    clientContact: null,
    address: "1 Riverside Way, London",
  };
  const out = buildAfpClientFromJob(job);
  assert.deepEqual(out, {
    clientName: "",  // NEVER the company
    clientCompany: "Harrington Developments Ltd",
    clientEmail: "",
    clientPhone: "",
  });
});
t("User-reported symptom — clientContact carries combined 'Sarah Mitchell — 07700 912846' → split into name + phone, email untouched", () => {
  const job = {
    clientName: "Harrington Developments Ltd",
    clientContact: "Sarah Mitchell — 07700 912846",
  };
  const out = buildAfpClientFromJob(job);
  assert.deepEqual(out, {
    clientName: "Sarah Mitchell",
    clientCompany: "Harrington Developments Ltd",
    clientEmail: "",  // MUST NOT be the combined string
    clientPhone: "07700 912846",
  });
});
t("Modern job with explicit clientEmail + clientPhone → both routed correctly", () => {
  const job = {
    clientName: "Harrington Developments Ltd",
    clientContact: "Sarah Mitchell",
    clientEmail: "sarah@harrington.co.uk",
    clientPhone: "07700 912846",
  };
  const out = buildAfpClientFromJob(job);
  assert.deepEqual(out, {
    clientName: "Sarah Mitchell",
    clientCompany: "Harrington Developments Ltd",
    clientEmail: "sarah@harrington.co.uk",
    clientPhone: "07700 912846",
  });
});
t("Job with only `company` field (no clientName) → clientCompany falls back to company", () => {
  const job = { company: "Acme Ltd", clientContact: "Alice" };
  const out = buildAfpClientFromJob(job);
  assert.equal(out.clientCompany, "Acme Ltd");
  assert.equal(out.clientName, "Alice");
});
t("Job with `email` alias (no clientEmail) → clientEmail falls back to email", () => {
  const job = { clientName: "Acme Ltd", email: "info@acme.co.uk" };
  const out = buildAfpClientFromJob(job);
  assert.equal(out.clientEmail, "info@acme.co.uk");
});
t("Job with `phone` alias (no clientPhone) → clientPhone falls back to phone", () => {
  const job = { clientName: "Acme Ltd", phone: "07700 900000" };
  const out = buildAfpClientFromJob(job);
  assert.equal(out.clientPhone, "07700 900000");
});
t("User's manually-typed values preserved when Job doesn't carry that field (re-pick preserves overrides)", () => {
  const job = {
    clientName: "Harrington Developments Ltd",
    clientContact: null, // no contact person on the Job
  };
  const prev = {
    clientName: "Manually Typed Bob",
    clientEmail: "manual@example.com",
    clientPhone: "07700 111222",
  };
  const out = buildAfpClientFromJob(job, prev);
  assert.equal(out.clientName, "Manually Typed Bob");
  assert.equal(out.clientEmail, "manual@example.com");
  assert.equal(out.clientPhone, "07700 111222");
  assert.equal(out.clientCompany, "Harrington Developments Ltd"); // company still overwritten from Job
});
t("Job with combined contact AND user pre-existing phone → Job's parsed phone wins (fresh pick supplies authoritative data)", () => {
  // When the user picks a project, the Job's data should overwrite the
  // pre-existing form values. Otherwise a stale phone from a previous
  // project would leak across a re-pick. `buildAfpClientFromJob` prefers
  // `j.clientPhone || j.phone || parsed.phone` before falling back to
  // `prev.clientPhone` so the freshly-picked Job supplies authoritative
  // contact details.
  const job = { clientContact: "Sarah Mitchell — 07700 912846", clientName: "Acme" };
  const prev = { clientPhone: "01111 999999" };
  const out = buildAfpClientFromJob(job, prev);
  assert.equal(out.clientPhone, "07700 912846");
});
t("Job with NO phone data AND user pre-existing phone → prev is preserved (no data lost)", () => {
  const job = { clientName: "Acme", clientContact: null };
  const prev = { clientPhone: "01111 999999" };
  const out = buildAfpClientFromJob(job, prev);
  assert.equal(out.clientPhone, "01111 999999");
});
t("NEVER concatenate — company name must not appear in clientName, email, or phone", () => {
  const job = {
    clientName: "Harrington Developments Ltd",
    clientContact: "Sarah Mitchell — 07700 912846",
    clientEmail: "sarah@harrington.co.uk",
  };
  const out = buildAfpClientFromJob(job);
  assert.equal(out.clientName, "Sarah Mitchell");
  assert.equal(out.clientEmail, "sarah@harrington.co.uk");
  assert.equal(out.clientPhone, "07700 912846");
  // Guard: the company string must NOT leak into any other field.
  for (const key of ["clientName", "clientEmail", "clientPhone"]) {
    assert.equal(out[key].includes("Harrington"), false, `${key} must not contain company name`);
  }
});
t("NEVER concatenate — phone digits must not appear in clientName or clientEmail", () => {
  const job = { clientContact: "Sarah Mitchell — 07700 912846", clientName: "Acme" };
  const out = buildAfpClientFromJob(job);
  assert.equal(out.clientName.match(/\d/), null, "clientName must contain no digits");
  assert.equal(out.clientEmail, "");
});
t("Empty Job or null Job — every field defaults to blank", () => {
  assert.deepEqual(buildAfpClientFromJob({}), { clientName: "", clientCompany: "", clientEmail: "", clientPhone: "" });
  assert.deepEqual(buildAfpClientFromJob(null), { clientName: "", clientCompany: "", clientEmail: "", clientPhone: "" });
  assert.deepEqual(buildAfpClientFromJob(undefined), { clientName: "", clientCompany: "", clientEmail: "", clientPhone: "" });
});

console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
