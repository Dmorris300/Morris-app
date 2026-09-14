// AFP-PROJECT-LINK-01 — "Link to project" selector must ALWAYS render.
//
// User report (Sep 2026): after a hard refresh, the "Link to Project
// (Recommended)" dropdown was missing from Step 1 of the New Application
// for Payment wizard. Only Project Name / Site Address were visible.
//
// Root cause: the JSX gated the selector behind `{jobs.length > 0 && (...)}`
// which silently hid the entire dropdown whenever `/api/jobs` returned an
// empty list, transiently failed (401 during auth-token race, cold hot
// reload), or was still loading. The "Not linked" default option was
// therefore also hidden, and users could not link a Job to a new AFP.
//
// Fix: remove the guard so the selector is always rendered. The "Not
// linked" option remains the first option, so the manual (unlinked) AFP
// flow is preserved even when the jobs list is empty.
//
// This test is a source-level assertion: since the .mjs loader cannot
// evaluate JSX, we parse the JSX text and lock the invariants directly.
//
// Run:
//   cd /app/frontend && \
//   node --experimental-loader ./tests/loader.mjs tests/afp-project-link-01.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  resolve(__dirname, "../src/pages/ApplicationsForPayment.jsx"),
  "utf8",
);

let passed = 0, failed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log(`  ✔ ${name}`); } catch (e) { failed++; console.error(`  ✘ ${name}\n    ${e.stack || e.message}`); } };

console.log("AFP-PROJECT-LINK-01 — Step 1 project selector always renders");

// ---- Locate the Step 1 block ------------------------------------------
// Anchor on the data-testid attribute — this is the wizard's Step 1
// container so any assertion below is scoped to it.
const step1StartIdx = src.indexOf('data-testid="afp-step-1-project"');
assert.ok(step1StartIdx > -1, "afp-step-1-project block not found in source");

// Slice from the Step 1 anchor up to Step 2's anchor so every assertion
// below is scoped to just the Step 1 block.
const step2StartIdx = src.indexOf('data-testid="afp-step-2-contract"', step1StartIdx);
assert.ok(step2StartIdx > step1StartIdx, "afp-step-2-contract anchor not found after Step 1");
const step1Block = src.slice(step1StartIdx, step2StartIdx);

// ---- Invariants --------------------------------------------------------
t("Step 1 contains the afp-link-project selector", () => {
  assert.ok(
    step1Block.includes('data-testid="afp-link-project"'),
    "afp-link-project selector missing from Step 1",
  );
});

t("Step 1 selector is NOT wrapped in a `jobs.length > 0` guard", () => {
  // Reject any conditional that would hide the selector when the jobs
  // list is empty. The exact anti-pattern we removed:
  //   {jobs.length > 0 && (
  //     <Field label="Link to project (recommended)"> ... </Field>
  //   )}
  // If the guard reappears in this Step 1 slice, the bug is back.
  const guardPatterns = [
    /jobs\.length\s*>\s*0\s*&&/,
    /jobs\?\.\s*length\s*>\s*0\s*&&/,
    /jobs\s*&&\s*jobs\.length\s*&&/,
  ];
  for (const p of guardPatterns) {
    assert.equal(
      p.test(step1Block),
      false,
      `Step 1 must not gate the project selector on jobs presence — found /${p.source}/`,
    );
  }
});

t("Selector always exposes 'Not linked' as the first option", () => {
  // The "Not linked" default must render regardless of whether the jobs
  // list is populated so that users can always keep an AFP unlinked.
  const notLinkedIdx = step1Block.indexOf('<option value="">Not linked</option>');
  const selectIdx = step1Block.indexOf('data-testid="afp-link-project"');
  assert.ok(notLinkedIdx > -1, "'Not linked' default option missing");
  assert.ok(
    notLinkedIdx > selectIdx,
    "'Not linked' must appear after the <select data-testid=afp-link-project>",
  );
});

t("Selector maps jobs.map(j => <option>) inline (no defensive early-return)", () => {
  // Ensure the jobs.map(...) still runs inside the selector so a
  // populated jobs list still renders every job. Regression-guards
  // against someone re-adding the guard by wrapping the .map instead.
  assert.match(
    step1Block,
    /jobs\.map\(\s*j\s*=>\s*<option\s+key=\{j\.id\}\s+value=\{j\.id\}>/,
    "jobs.map(...) option rendering not found inside Step 1 selector",
  );
});

t("Selector still uses pickProject as the change handler", () => {
  // pickProject is the function that fires buildAfpClientFromJob and
  // hydrates Step 2 with the mapped client fields. Losing it would
  // regress AFP-CLIENT-MAP-01 even if the dropdown is visible.
  assert.match(
    step1Block,
    /onChange=\{\(e\)\s*=>\s*pickProject\(e\.target\.value\)\}/,
    "pickProject onChange handler missing — Step 2 mapping would break",
  );
});

t("Manual Project Name / Site Address inputs still render alongside the selector", () => {
  // The "unlinked" manual entry flow must remain intact.
  assert.ok(
    step1Block.includes('data-testid="afp-projectName"'),
    "afp-projectName input missing — manual entry flow broken",
  );
  assert.ok(
    step1Block.includes('data-testid="afp-projectAddress"'),
    "afp-projectAddress input missing — manual entry flow broken",
  );
});

// ---- Safety-net (loading / empty / error hints) ------------------------
// After the first "selector missing" report we still had a silent-empty
// failure mode: users on accounts with zero jobs (e.g. `previewqa`) saw
// only "Not linked" and had no idea whether the dropdown was still
// loading, genuinely empty, or errored. These assertions lock the
// user-visible hints and the toast on non-401 fetch failures.

t("Wizard accepts jobsLoading + jobsError props from parent", () => {
  assert.match(
    src,
    /function AfpWizard\(\{[^}]*jobsLoading[^}]*jobsError[^}]*\}\)/,
    "AfpWizard signature must accept jobsLoading and jobsError props",
  );
});

t("Parent tracks jobsLoading state and resets it around loadAll", () => {
  assert.match(src, /const \[jobsLoading, setJobsLoading\] = useState\(true\)/, "jobsLoading state missing");
  assert.match(src, /const \[jobsError, setJobsError\] = useState\(false\)/, "jobsError state missing");
  assert.match(src, /setJobsLoading\(true\)/, "setJobsLoading(true) at start of loadAll missing");
  assert.match(src, /setJobsLoading\(false\)/, "setJobsLoading(false) after loadAll missing");
});

t("Parent toasts on non-401 /api/jobs failure (401 is handled globally)", () => {
  // Look for the guarded toast in the rejected-branch of the jobs load.
  assert.match(
    src,
    /if \(status !== 401\)[\s\S]{0,200}toast\.error\(/,
    "toast.error on non-401 /api/jobs failure missing",
  );
  assert.match(
    src,
    /setJobsError\(true\)/,
    "setJobsError(true) on non-401 /api/jobs failure missing",
  );
});

t("Parent passes jobsLoading + jobsError props to the AfpWizard render", () => {
  // The wizard is rendered inside `{wizardOpen && editing && (...)}` so a
  // scoped slice keeps assertions tight.
  const propsIdx = src.indexOf("<AfpWizard");
  assert.ok(propsIdx > -1, "<AfpWizard mount not found");
  const propsBlock = src.slice(propsIdx, propsIdx + 400);
  assert.match(propsBlock, /jobsLoading=\{jobsLoading\}/, "jobsLoading prop not passed to AfpWizard");
  assert.match(propsBlock, /jobsError=\{jobsError\}/, "jobsError prop not passed to AfpWizard");
});

t("Step 1 renders a Loading hint while jobsLoading is true", () => {
  assert.ok(
    step1Block.includes('data-testid="afp-link-project-loading"'),
    "afp-link-project-loading hint missing",
  );
  assert.match(
    step1Block,
    /jobsLoading\s*\?\s*\(\s*<p[^>]*data-testid="afp-link-project-loading"/,
    "Loading hint must be gated on `jobsLoading`",
  );
});

t("Step 1 renders an Error hint when jobsError is true", () => {
  assert.ok(
    step1Block.includes('data-testid="afp-link-project-error"'),
    "afp-link-project-error hint missing",
  );
  assert.match(
    step1Block,
    /jobsError\s*\?\s*\(\s*<p[^>]*data-testid="afp-link-project-error"/,
    "Error hint must be gated on `jobsError`",
  );
});

t("Step 1 renders an Empty hint when jobs load OK but the list is empty", () => {
  assert.ok(
    step1Block.includes('data-testid="afp-link-project-empty"'),
    "afp-link-project-empty hint missing",
  );
  // Empty hint must ONLY show when both jobsLoading is false AND jobsError
  // is false AND jobs.length === 0 — otherwise it competes with the
  // loading/error copy above.
  assert.match(
    step1Block,
    /jobs\.length\s*===\s*0\s*\?\s*\(\s*<p[^>]*data-testid="afp-link-project-empty"/,
    "Empty hint must be gated on jobs.length === 0",
  );
});

t("None of the hints appear when jobs are populated", () => {
  // The three hints must all live inside a single ternary chain that
  // resolves to `null` when jobs.length > 0. Regression-guards against
  // someone accidentally splitting the hints into always-rendered <p>s.
  assert.match(
    step1Block,
    /:\s*null\s*\}/,
    "Ternary chain must fall through to `null` so hints hide when jobs load OK",
  );
});

console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
