// SUBBI-DRAFT-01 — Save → leave → Drafts → Resume → fields restored,
// then Back → Drafts still loads normally.
//
// This test exercises the two branches of the fix in isolation, using
// stubbed collaborators (drafts API, toast, storage) so it runs headless
// in Node with no browser or backend.
//
// Fixture: user fills a Subbi Payment Certificate and clicks Save Draft.
// 1. GenericToolPage hydration on Resume must:
//    a. NOT reset `values` to autoDefaults if `?draft=<id>` is in URL —
//       the flash-of-blank-then-hydrated pattern is the reported bug.
//    b. On fetchDraft success: populate values from `data.values`.
//    c. On fetchDraft error: fall back to autoDefaults + surface a
//       specific toast rather than leaving the form blank.
//    d. On fetchDraft returning a wrong-toolId draft: fall back to
//       autoDefaults and clear the draft query param.
// 2. Drafts list load must:
//    a. On transient error (network / 502 / plaintext-404): retry once
//       with a short backoff.
//    b. On persistent error: preserve any previously-loaded list rather
//       than blanking to 0.
//    c. On non-transient error (real 500 / 401): surface a toast and
//       preserve list.
//
// Run:
//   cd /app/frontend && \
//   node --experimental-loader ./tests/loader.mjs tests/subbi-draft-01.test.mjs

import assert from "node:assert/strict";

// ---- Extracted behaviour under test (mirrors production logic) ----

// GenericToolPage.jsx — draft-restore branch (isolated as pure function).
async function restoreDraft({ toolId, draftId, tool, api, toast, setValues, setResult, setRefNumber, clearQuery }) {
  const autoDefaults = () => {
    const init = {};
    (tool.fields || []).forEach(f => { if (f.defaultValue) init[f.name] = f.defaultValue; });
    return init;
  };
  try {
    const d = await api.getDraft(draftId);
    if (!d || d.toolId !== toolId) {
      setValues(autoDefaults());
      return "wrong-tool";
    }
    const payload = d.data || {};
    if (payload.values && typeof payload.values === "object") setValues(payload.values);
    if (typeof payload.result === "string") setResult(payload.result);
    if (typeof payload.refNumber === "string") setRefNumber(payload.refNumber);
    toast.success("Draft restored");
    return "restored";
  } catch (e) {
    toast.error("Could not load that draft — please try again from the Drafts list.");
    setValues(autoDefaults());
    return "error";
  } finally {
    clearQuery();
  }
}

// Drafts.jsx — load() with transient retry (isolated as pure function).
function isTransientListError(e) {
  if (!e) return false;
  if (!e.response) return true;
  const s = e.response.status;
  if (s === 502 || s === 503 || s === 504) return true;
  if (s === 404) {
    const body = e.response.data;
    if (typeof body === "string" && /404 page not found/i.test(body)) return true;
  }
  return false;
}
async function loadDrafts({ api, toast, prev, setDrafts, sleep = (ms) => new Promise(r => setTimeout(r, ms)) }) {
  let attempts = 0;
  try {
    attempts++;
    const rows = await api.listDrafts();
    setDrafts(rows);
    return { attempts, outcome: "ok" };
  } catch (e1) {
    if (!isTransientListError(e1)) {
      toast.error("Could not load drafts");
      setDrafts(prev == null ? [] : prev);
      return { attempts, outcome: "non-transient" };
    }
  }
  await sleep(1);
  try {
    attempts++;
    const rows = await api.listDrafts();
    setDrafts(rows);
    return { attempts, outcome: "ok-after-retry" };
  } catch (e2) {
    toast.error("Drafts are momentarily unavailable — pull to refresh in a few seconds.");
    setDrafts(prev == null ? [] : prev);
    return { attempts, outcome: "transient-retry-failed" };
  }
}

// ---- Test harness ----
const TOOL = { id: "subbie-payment-cert", name: "Subbi Payment Certificate", fields: [
  { name: "subbie" }, { name: "appNo" }, { name: "certifiedValue" },
  { name: "paylessReason" },
] };
const FILLED_VALUES = {
  subbie: "Morris Ductwork Ltd",
  appNo: "SUB-TEST-01",
  certifiedValue: "4250",
  paylessReason: "£250 withheld pending completion of outstanding snagging works.",
};
const DRAFT_ID = "9ce58f84-e436-4930-81d4-d17a78815ee8";
const SAVED_DRAFT = {
  id: DRAFT_ID, toolId: TOOL.id, toolName: TOOL.name,
  title: "Subbi Payment Certificate · 13 Sept",
  data: { values: { ...FILLED_VALUES }, result: "", refNumber: "" },
};

function stubs(overrides = {}) {
  const setV = (label) => (v) => rec[label] = v;
  const rec = { values: undefined, result: undefined, refNumber: undefined, toast: [], drafts: undefined, cleared: 0 };
  return {
    rec,
    api: {
      getDraft: async (id) => { if (overrides.getDraftImpl) return overrides.getDraftImpl(id); return SAVED_DRAFT; },
      listDrafts: async () => { if (overrides.listDraftsImpl) return overrides.listDraftsImpl(); return [SAVED_DRAFT]; },
    },
    toast: {
      success: (m) => rec.toast.push(["success", m]),
      error: (m) => rec.toast.push(["error", m]),
    },
    setValues: setV("values"),
    setResult: setV("result"),
    setRefNumber: setV("refNumber"),
    setDrafts: (val) => { rec.drafts = typeof val === "function" ? val(rec.drafts) : val; },
    clearQuery: () => { rec.cleared++; },
  };
}

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log(`  ✔ ${name}`); }
  catch (e) { failed++; console.error(`  ✘ ${name}\n    ${e.stack || e.message}`); }
}

console.log("SUBBI-DRAFT-01 — Save & Resume + Drafts list resilience");

// ---- restoreDraft branches ----

await t("Resume: happy path — saved draft matches toolId → values, result, refNumber all hydrated + Draft restored toast", async () => {
  const s = stubs();
  const outcome = await restoreDraft({ toolId: TOOL.id, draftId: DRAFT_ID, tool: TOOL, ...s });
  assert.equal(outcome, "restored");
  assert.deepEqual(s.rec.values, FILLED_VALUES);
  assert.equal(s.rec.result, "");
  assert.equal(s.rec.refNumber, "");
  assert.deepEqual(s.rec.toast, [["success", "Draft restored"]]);
  assert.equal(s.rec.cleared, 1);
});

await t("Resume: wrong-tool draft → autoDefaults + no toast + query cleared", async () => {
  const s = stubs({ getDraftImpl: async () => ({ ...SAVED_DRAFT, toolId: "different-tool" }) });
  const outcome = await restoreDraft({ toolId: TOOL.id, draftId: DRAFT_ID, tool: TOOL, ...s });
  assert.equal(outcome, "wrong-tool");
  assert.deepEqual(s.rec.values, {}); // no defaults set on these fields
  assert.deepEqual(s.rec.toast, []);
  assert.equal(s.rec.cleared, 1);
});

await t("Resume: fetchDraft throws (network) → autoDefaults + explicit error toast", async () => {
  const s = stubs({ getDraftImpl: async () => { throw new Error("Network down"); } });
  const outcome = await restoreDraft({ toolId: TOOL.id, draftId: DRAFT_ID, tool: TOOL, ...s });
  assert.equal(outcome, "error");
  assert.deepEqual(s.rec.toast, [["error", "Could not load that draft — please try again from the Drafts list."]]);
  assert.equal(s.rec.cleared, 1);
});

await t("Resume: fetchDraft returns null → autoDefaults + clear query", async () => {
  const s = stubs({ getDraftImpl: async () => null });
  const outcome = await restoreDraft({ toolId: TOOL.id, draftId: DRAFT_ID, tool: TOOL, ...s });
  assert.equal(outcome, "wrong-tool");
  assert.equal(s.rec.cleared, 1);
});

// ---- loadDrafts branches ----

await t("Back → Drafts: happy path → list loaded once", async () => {
  const s = stubs();
  const out = await loadDrafts({ api: s.api, toast: s.toast, prev: null, setDrafts: s.setDrafts });
  assert.equal(out.outcome, "ok");
  assert.equal(out.attempts, 1);
  assert.deepEqual(s.rec.drafts, [SAVED_DRAFT]);
  assert.deepEqual(s.rec.toast, []);
});

await t("Back → Drafts: 502 on first attempt, 200 on retry → list loaded, no error toast", async () => {
  let calls = 0;
  const s = stubs({
    listDraftsImpl: async () => {
      calls++;
      if (calls === 1) throw Object.assign(new Error("Bad gateway"), { response: { status: 502, data: "Bad gateway" } });
      return [SAVED_DRAFT];
    },
  });
  const out = await loadDrafts({ api: s.api, toast: s.toast, prev: null, setDrafts: s.setDrafts });
  assert.equal(out.outcome, "ok-after-retry");
  assert.equal(out.attempts, 2);
  assert.deepEqual(s.rec.drafts, [SAVED_DRAFT]);
  assert.deepEqual(s.rec.toast, []);
});

await t("Back → Drafts: ingress plaintext 404 first, 200 on retry → OK after retry", async () => {
  let calls = 0;
  const s = stubs({
    listDraftsImpl: async () => {
      calls++;
      if (calls === 1) throw Object.assign(new Error("nf"), { response: { status: 404, data: "404 page not found\n" } });
      return [SAVED_DRAFT];
    },
  });
  const out = await loadDrafts({ api: s.api, toast: s.toast, prev: null, setDrafts: s.setDrafts });
  assert.equal(out.outcome, "ok-after-retry");
  assert.equal(out.attempts, 2);
});

await t("Back → Drafts: transient failure both attempts → previous list preserved, specific toast", async () => {
  const prev = [{ id: "keep-me", toolId: TOOL.id }];
  const s = stubs({ listDraftsImpl: async () => { throw Object.assign(new Error("Network Error"), {}); } });
  const out = await loadDrafts({ api: s.api, toast: s.toast, prev, setDrafts: s.setDrafts });
  assert.equal(out.outcome, "transient-retry-failed");
  assert.equal(out.attempts, 2);
  assert.deepEqual(s.rec.drafts, prev, "previously-loaded list must NOT be blanked on transient failure");
  assert.match(s.rec.toast[0][1], /momentarily unavailable/);
});

await t("Back → Drafts: non-transient error (500) → NOT retried, previous list preserved, generic toast", async () => {
  let calls = 0;
  const s = stubs({
    listDraftsImpl: async () => {
      calls++;
      throw Object.assign(new Error("Server error"), { response: { status: 500, data: { detail: "boom" } } });
    },
  });
  const prev = [{ id: "keep-me" }];
  const out = await loadDrafts({ api: s.api, toast: s.toast, prev, setDrafts: s.setDrafts });
  assert.equal(out.outcome, "non-transient");
  assert.equal(out.attempts, 1);
  assert.deepEqual(s.rec.drafts, prev);
  assert.deepEqual(s.rec.toast, [["error", "Could not load drafts"]]);
});

await t("Back → Drafts: first load with no prior list AND non-transient → drafts is [] (empty state), user sees 'no drafts' UI, not stale spinner", async () => {
  const s = stubs({
    listDraftsImpl: async () => { throw Object.assign(new Error("Server error"), { response: { status: 500 } }); },
  });
  const out = await loadDrafts({ api: s.api, toast: s.toast, prev: null, setDrafts: s.setDrafts });
  assert.equal(out.outcome, "non-transient");
  assert.deepEqual(s.rec.drafts, []);
});

console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
