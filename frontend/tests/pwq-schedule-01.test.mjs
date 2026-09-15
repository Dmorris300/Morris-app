// PWQ-SCHEDULE-01 — Price Work Quote extended schedule columns.
//
// User ask (Sep 2026): upgrade every priced row from
//   Description | Unit | Quantity | Rate
// to
//   Item No | Location | Description | Drawing/Ref | Unit | Quantity | Rate | Amount
// Amount must recalculate live (Qty × Rate). Draft save + reopen must
// persist every new field. The generated PDF must include every new
// column. No unrelated tools may be touched.
//
// This suite is a source-level regression (the .mjs loader cannot mount
// React or run jsPDF), so it asserts the invariants on the JSX text and
// the LLM prompt payload — the pieces that survive across cache-busts.
//
// Run:
//   cd /app/frontend && \
//   node --experimental-loader ./tests/loader.mjs tests/pwq-schedule-01.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  resolve(__dirname, "../src/pages/PriceWorkQuote.jsx"),
  "utf8",
);

let passed = 0, failed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log(`  ✔ ${name}`); } catch (e) { failed++; console.error(`  ✘ ${name}\n    ${e.stack || e.message}`); } };

console.log("PWQ-SCHEDULE-01 — extended priced schedule columns");

// ---- makeRow shape ------------------------------------------------------
const makeRowIdx = src.indexOf("function makeRow()");
assert.ok(makeRowIdx > -1, "makeRow declaration not found");
const makeRowEnd = src.indexOf("\n}", makeRowIdx) + 2;
const makeRowBlock = src.slice(makeRowIdx, makeRowEnd);

t("makeRow — defaults `location: \"\"` (new field, backwards compatible)", () => {
  assert.match(makeRowBlock, /location:\s*""/, "makeRow must default location to empty string");
});
t("makeRow — defaults `drawingRef: \"\"` (new field, backwards compatible)", () => {
  assert.match(makeRowBlock, /drawingRef:\s*""/, "makeRow must default drawingRef to empty string");
});
t("makeRow — retains existing description / unit / quantity / rate / notes", () => {
  assert.match(makeRowBlock, /description:\s*""/,          "makeRow must retain description");
  assert.match(makeRowBlock, /unit:\s*"Square metre"/,     "makeRow must retain unit default");
  assert.match(makeRowBlock, /quantity:\s*""/,             "makeRow must retain quantity");
  assert.match(makeRowBlock, /rate:\s*""/,                 "makeRow must retain rate");
  assert.match(makeRowBlock, /notes:\s*""/,                "makeRow must retain notes");
});
t("makeRow — id is a crypto UUID (no schema break)", () => {
  assert.match(makeRowBlock, /id:\s*crypto\.randomUUID\(\)/);
});

// ---- Leading-zero strip helper ------------------------------------------
t("_stripLeadingZeros — turns '0350' into '350', preserves '0', '0.5', '-0.25'", () => {
  assert.match(src, /function _stripLeadingZeros\(v\) \{/, "_stripLeadingZeros helper missing");
  assert.match(src, /replace\(\/\^\(-\?\)0\+\(\?=\\d\)\/,\s*"\$1"\)/, "leading-zero regex changed");
});
t("_numFocus — select-all-on-focus helper wired for numeric inputs", () => {
  assert.match(src, /function _numFocus\(e\) \{/, "_numFocus helper missing");
  assert.match(src, /e\.target\.select\(\)/, "_numFocus must select on focus");
});

// ---- Schedule card renders every new column -----------------------------
const sched = src.match(/\/\* SECTION 3 — PRICED SCHEDULE[\s\S]*?\/\* SECTION 4/);
assert.ok(sched, "Section 3 (Priced Schedule) block not found");
const schedBlock = sched[0];

t("Schedule row renders Location input (optional)", () => {
  assert.match(schedBlock, /testId={`pwq-row-\$\{idx\}-location`}/);
  assert.match(schedBlock, /label="Location \(optional\)"/);
});
t("Schedule row renders Drawing / Ref input (optional)", () => {
  assert.match(schedBlock, /testId={`pwq-row-\$\{idx\}-drawing-ref`}/);
  assert.match(schedBlock, /label="Drawing \/ Ref \(optional\)"/);
});
t("Schedule row still renders Description of Work input", () => {
  assert.match(schedBlock, /testId={`pwq-row-\$\{idx\}-description`}/);
  assert.match(schedBlock, /label="Description of Work"/);
});
t("Schedule row still renders Unit / Quantity / Rate inputs", () => {
  assert.match(schedBlock, /testId={`pwq-row-\$\{idx\}-unit`}/);
  assert.match(schedBlock, /testId={`pwq-row-\$\{idx\}-quantity`}/);
  assert.match(schedBlock, /testId={`pwq-row-\$\{idx\}-rate`}/);
});
t("Schedule row renders read-only Amount cell (auto Qty × Rate)", () => {
  assert.match(schedBlock, /data-testid={`pwq-row-\$\{idx\}-amount`}/);
  assert.match(schedBlock, /Amount \(£\)/);
  // Amount value comes straight from r.lineTotal via money() → guarantees
  // 2dp £ formatting.
  assert.match(schedBlock, /\{money\(r\.lineTotal\)\}[\s\S]{0,80}data-testid={`pwq-row-\$\{idx\}-amount`}|data-testid={`pwq-row-\$\{idx\}-amount`}[\s\S]{0,120}\{money\(r\.lineTotal\)\}/);
});
t("Schedule row Amount cell is read-only (aria-readonly)", () => {
  assert.match(schedBlock, /aria-readonly="true"/);
});
t("Schedule row Item No still surfaces as the header pill", () => {
  assert.match(schedBlock, /data-testid={`pwq-row-\$\{idx\}-num`}/);
  assert.match(schedBlock, /Item \{r\.lineNumber\}/);
});
t("Schedule row Remove still wired", () => {
  assert.match(schedBlock, /data-testid={`pwq-row-\$\{idx\}-remove`}/);
});
t("Numeric Quantity + Rate inputs run through _stripLeadingZeros and _numFocus", () => {
  // Both inputs must call the strip helper and expose select-on-focus.
  const qtyRateStrip = (schedBlock.match(/_stripLeadingZeros\(v\)/g) || []).length;
  const numFocusRefs = (schedBlock.match(/onFocus=\{_numFocus\}/g) || []).length;
  assert.ok(qtyRateStrip >= 2, `Expected _stripLeadingZeros wired for qty + rate — got ${qtyRateStrip}`);
  assert.ok(numFocusRefs >= 2, `Expected _numFocus wired for qty + rate — got ${numFocusRefs}`);
});

// ---- Add / Remove wiring survives ---------------------------------------
t("Add Item button retained (no functionality removed)", () => {
  assert.match(src, /data-testid="pwq-add-row"/);
  assert.match(src, /addRow = \(\) => setRows/);
});
t("Remove Row still wired via removeRow(id)", () => {
  assert.match(src, /removeRow = \(id\) =>/);
});
t("updateRow still spreads existing row + patch (no shape break)", () => {
  assert.match(src, /rs\.map\(\(r\) => \(r\.id === id \? \{ \.\.\.r, \[field\]: value \} : r\)\)/);
});

// ---- Live recalc: decorated memo drives lineTotal -----------------------
t("decorated memo still computes lineTotal = qty × rate live on any row change", () => {
  assert.match(src, /const decorated = useMemo\(/);
  assert.match(src, /lineTotal = qty \* rate/);
  // The memo dep-array must be `[rows]` so any field edit re-triggers the
  // amount recalc (including qty/rate blanks and new location/drawing edits).
  assert.match(src, /\}, \[rows\]\);/);
});

// ---- Save Draft persists every new field --------------------------------
t("getDraftData still ships the full `rows` array (new fields persist automatically)", () => {
  const gd = src.match(/const getDraftData = \(\) => \(\{[\s\S]*?\}\);/);
  assert.ok(gd, "getDraftData not found");
  assert.match(gd[0], /\brows\b/, "getDraftData must include the rows array");
});
t("Draft restore restores rows array via `if (Array.isArray(p.rows)) setRows(p.rows)`", () => {
  const matches = (src.match(/if \(Array\.isArray\(p\.rows\)\) setRows\(p\.rows\);/g) || []).length;
  // Both fetchDraft path AND session-recovery path must restore rows.
  assert.ok(matches >= 2, `Expected 2 setRows restore points — got ${matches}`);
});

// ---- PDF: itemsBlock feeds every new column into the LLM prompt --------
const itemsBlockIdx = src.indexOf("const itemsBlock = populated.map");
assert.ok(itemsBlockIdx > -1, "itemsBlock builder not found");
const itemsBlockEnd = src.indexOf("}).join(\"\\n\");", itemsBlockIdx) + 15;
const itemsBlockCode = src.slice(itemsBlockIdx, itemsBlockEnd);

t("itemsBlock includes Item Number", () => {
  assert.match(itemsBlockCode, /`Item \$\{r\.lineNumber\}\.`/);
});
t("itemsBlock includes Location (falls back to '—')", () => {
  assert.match(itemsBlockCode, /`Location: \$\{\(r\.location \|\| ""\)\.trim\(\) \|\| "—"\}`/);
});
t("itemsBlock includes Description verbatim", () => {
  assert.match(itemsBlockCode, /`Description: \$\{r\.description\}`/);
});
t("itemsBlock includes Drawing / Ref (falls back to '—')", () => {
  assert.match(itemsBlockCode, /`Drawing \/ Ref: \$\{\(r\.drawingRef \|\| ""\)\.trim\(\) \|\| "—"\}`/);
});
t("itemsBlock includes Unit / Quantity / Rate / Amount", () => {
  assert.match(itemsBlockCode, /`Unit: \$\{r\.unit\}`/);
  assert.match(itemsBlockCode, /`Quantity: \$\{r\.quantity \|\| "0"\}`/);
  assert.match(itemsBlockCode, /`Rate: \$\{money\(N\(r\.rate\)\)\} per \$\{r\.unit\.toLowerCase\(\)\}`/);
  assert.match(itemsBlockCode, /`Amount: \$\{money\(r\.lineTotal\)\}`/);
});
t("itemsBlock preserves Notes column (no functionality removed)", () => {
  assert.match(itemsBlockCode, /`Notes: \$\{r\.notes \|\| "—"\}`/);
});
t("LLM promptTemplate still instructs to render the pipe-delimited schedule verbatim", () => {
  assert.match(src, /preserving the pipe-delimited structure exactly as supplied/);
});

// ---- Currency formatting: £ with two decimals ---------------------------
t("money() helper still uses en-GB £ with 2 decimals", () => {
  assert.match(src, /minimumFractionDigits: 2, maximumFractionDigits: 2/);
  assert.match(src, /`£\$\{\(Number\(n\) \|\| 0\)\.toLocaleString\("en-GB"/);
});

// ---- No unrelated tools touched -----------------------------------------
t("Only pages/PriceWorkQuote.jsx is expected to change — TOOL_ID unchanged", () => {
  assert.match(src, /const TOOL_ID\s+= "price-work-quote"/);
});

console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
