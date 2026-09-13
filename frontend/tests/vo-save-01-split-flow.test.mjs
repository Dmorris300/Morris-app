// VO-SAVE-01 — Split save-flow regression.
//
// The wizard's Save & Generate PDF button used to hide the real error
// behind a generic "Save failed" toast whenever ANY step in the flow
// threw — even a downstream PDF render that had nothing to do with the
// database save. This test exercises the split flow directly, using
// minimal stubbed axios/toast/storage/pdf collaborators, so the two
// failure branches produce distinct user-facing messages and always
// preserve a persisted record when the failure is downstream of the save.
//
// Run:
//   cd /app/frontend && \
//   node --experimental-loader ./tests/loader.mjs tests/vo-save-01-split-flow.test.mjs

import assert from "node:assert/strict";

// Extract the save-flow behaviour under test from VariationOrders.jsx as
// a pure async function that mirrors the wizard's saveEntry() logic. This
// avoids importing React / axios / sonner into a Node harness while
// keeping the branch structure identical to production.
function isTransientSaveError(e) {
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function saveEntry({ data, api, toast, downloadPdf, storage, TOOL_ID = "variation-orders", DRAFT_KEY = "morris.tool_draft.variation-orders" }) {
  if (!data.projectName && !data.projectId) { toast.error("Project is required"); return { stage: "validate" }; }
  const postOrPatch = async () => {
    if (data.id) { const r = await api.patch(`/variation-orders/variation-orders/${data.id}`, { ...data }); return r.data; }
    const r = await api.post("/variation-orders/variation-orders", { ...data }); return r.data;
  };
  let saved;
  let retried = false;
  try {
    try {
      saved = await postOrPatch();
    } catch (e1) {
      if (!isTransientSaveError(e1)) throw e1;
      retried = true;
      await sleep(1); // shortened for tests
      saved = await postOrPatch();
    }
  } catch (e) {
    const detail = e?.response?.data?.detail;
    const detailMsg = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map(d => d?.msg || d).join("; ") : "";
    const bodyStr = typeof e?.response?.data === "string" ? e.response.data : "";
    const status = e?.response?.status;
    const infraHint = isTransientSaveError(e) ? " — backend was momentarily unavailable, please try again in a few seconds" : "";
    const msg = (detailMsg || bodyStr || e?.message || "Save failed") + (status ? ` (${status})` : "") + infraHint;
    toast.error(msg);
    return { stage: "save-failed", error: e, retried };
  }
  try { await api.post("/documents/save", { title: `Variation Order — ${data.projectName || "Client"}`, toolId: TOOL_ID, refNumber: saved.variationRef, jobId: data.projectId || null, content: "", metadata: { ...saved } }); } catch { /* soft-fail */ }
  try { storage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  try {
    downloadPdf({ data: saved });
    toast.success("Variation saved");
    return { stage: "ok", saved, retried };
  } catch (e) {
    toast.success("Variation saved — PDF download failed, open the record to retry");
    return { stage: "pdf-failed", saved, error: e, retried };
  }
}

function makeStubs({ postImpl, patchImpl, docsImpl, pdfImpl } = {}) {
  const toastCalls = [];
  const storageCalls = [];
  const api = {
    post: async (url, body) => {
      if (url === "/documents/save") return docsImpl ? docsImpl(url, body) : { data: {} };
      if (postImpl) return postImpl(url, body);
      return { data: { ...body, id: "server-id", variationRef: "VO-999" } };
    },
    patch: async (url, body) => patchImpl ? patchImpl(url, body) : { data: { ...body, id: "server-id", variationRef: "VO-999" } },
  };
  return {
    api,
    toast: {
      success: (m) => toastCalls.push(["success", m]),
      error: (m) => toastCalls.push(["error", m]),
    },
    downloadPdf: pdfImpl || (() => undefined),
    storage: { removeItem: (k) => storageCalls.push(k) },
    toastCalls,
    storageCalls,
  };
}

const DATA = { projectName: "Repro Ltd", lineItems: [{ id: "l1", category: "Labour", qty: 1, unit: "day", unitPrice: 750 }], status: "Submitted" };

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log(`  ✔ ${name}`); }
  catch (e) { failed++; console.error(`  ✘ ${name}\n    ${e.stack || e.message}`); }
}

console.log("VO-SAVE-01 — split-flow diagnostics");

await t("happy path: save + PDF both succeed → single success toast", async () => {
  const s = makeStubs();
  const out = await saveEntry({ data: DATA, ...s });
  assert.equal(out.stage, "ok");
  assert.deepEqual(s.toastCalls, [["success", "Variation saved"]]);
  assert.deepEqual(s.storageCalls, ["morris.tool_draft.variation-orders"]);
});

await t("backend 400 with detail string → surfaces the actual detail, not 'Save failed'", async () => {
  const err = Object.assign(new Error("Request failed"), { response: { status: 400, data: { detail: "Project is required" } } });
  const s = makeStubs({ postImpl: async () => { throw err; } });
  const out = await saveEntry({ data: DATA, ...s });
  assert.equal(out.stage, "save-failed");
  assert.equal(out.retried, false);
  assert.deepEqual(s.toastCalls, [["error", "Project is required (400)"]]);
  assert.deepEqual(s.storageCalls, []);
});

await t("backend 422 with pydantic detail array → joins messages with status suffix", async () => {
  const err = Object.assign(new Error("Request failed"), { response: { status: 422, data: { detail: [{ msg: "value is not a valid float" }, { msg: "field required" }] } } });
  const s = makeStubs({ postImpl: async () => { throw err; } });
  const out = await saveEntry({ data: DATA, ...s });
  assert.equal(out.stage, "save-failed");
  assert.equal(s.toastCalls[0][0], "error");
  assert.match(s.toastCalls[0][1], /value is not a valid float; field required \(422\)/);
});

await t("network error (no response) → retries once, still fails → transient hint", async () => {
  let calls = 0;
  const err = Object.assign(new Error("Network Error"), {});
  const s = makeStubs({ postImpl: async () => { calls++; throw err; } });
  const out = await saveEntry({ data: DATA, ...s });
  assert.equal(out.stage, "save-failed");
  assert.equal(out.retried, true);
  assert.equal(calls, 2);
  assert.equal(s.toastCalls[0][0], "error");
  assert.match(s.toastCalls[0][1], /Network Error/);
  assert.match(s.toastCalls[0][1], /backend was momentarily unavailable/);
});

await t("ingress plaintext '404 page not found' → retried and hint shown, not silently swallowed", async () => {
  let calls = 0;
  const err = Object.assign(new Error("Request failed"), { response: { status: 404, data: "404 page not found\n" } });
  const s = makeStubs({ postImpl: async () => { calls++; throw err; } });
  const out = await saveEntry({ data: DATA, ...s });
  assert.equal(out.stage, "save-failed");
  assert.equal(out.retried, true);
  assert.equal(calls, 2);
  assert.match(s.toastCalls[0][1], /404 page not found/);
  assert.match(s.toastCalls[0][1], /\(404\)/);
  assert.match(s.toastCalls[0][1], /backend was momentarily unavailable/);
});

await t("FastAPI JSON 404 with detail → NOT retried, no infra hint (real 404, not transient)", async () => {
  let calls = 0;
  const err = Object.assign(new Error("Request failed"), { response: { status: 404, data: { detail: "Not found" } } });
  const s = makeStubs({ patchImpl: async () => { calls++; throw err; } });
  const out = await saveEntry({ data: { ...DATA, id: "already-deleted" }, ...s });
  assert.equal(out.stage, "save-failed");
  assert.equal(out.retried, false);
  assert.equal(calls, 1);
  assert.equal(s.toastCalls[0][1], "Not found (404)");
});

await t("transient 502 on first attempt, 200 on retry → save persists, single success toast", async () => {
  let calls = 0;
  const err502 = Object.assign(new Error("Bad gateway"), { response: { status: 502, data: "Bad gateway" } });
  const s = makeStubs({
    postImpl: async (url, body) => {
      calls++;
      if (calls === 1) throw err502;
      return { data: { ...body, id: "server-id", variationRef: "VO-999" } };
    },
  });
  const out = await saveEntry({ data: DATA, ...s });
  assert.equal(out.stage, "ok");
  assert.equal(out.retried, true);
  assert.equal(calls, 2);
  assert.deepEqual(s.toastCalls, [["success", "Variation saved"]]);
});

await t("PDF generation throws AFTER successful save → record marked saved, PDF failure toast", async () => {
  const s = makeStubs({ pdfImpl: () => { throw new Error("Popup blocked"); } });
  const out = await saveEntry({ data: DATA, ...s });
  assert.equal(out.stage, "pdf-failed");
  assert.equal(s.toastCalls[0][0], "success");
  assert.match(s.toastCalls[0][1], /Variation saved — PDF download failed/);
  // Autosave STILL cleared because the record is persisted.
  assert.deepEqual(s.storageCalls, ["morris.tool_draft.variation-orders"]);
});

await t("documents/save soft-fail never surfaces to user", async () => {
  const s = makeStubs({ docsImpl: async () => { throw new Error("Docs down"); } });
  const out = await saveEntry({ data: DATA, ...s });
  assert.equal(out.stage, "ok");
  assert.deepEqual(s.toastCalls, [["success", "Variation saved"]]);
});

await t("missing project name AND projectId → validation error, no API call", async () => {
  let called = false;
  const s = makeStubs({ postImpl: async () => { called = true; return { data: {} }; } });
  const out = await saveEntry({ data: { lineItems: [] }, ...s });
  assert.equal(out.stage, "validate");
  assert.equal(called, false);
  assert.deepEqual(s.toastCalls, [["error", "Project is required"]]);
});

await t("existing record with id → uses PATCH instead of POST", async () => {
  let patched = false, posted = false;
  const s = makeStubs({
    patchImpl: async (url) => { patched = true; return { data: { id: "server-id", variationRef: "VO-EXISTING" } }; },
    postImpl: async () => { posted = true; return { data: {} }; },
  });
  const out = await saveEntry({ data: { ...DATA, id: "existing" }, ...s });
  assert.equal(out.stage, "ok");
  assert.equal(patched, true);
  assert.equal(posted, false);
});

console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
