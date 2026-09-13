// CC-VARIATION-ROUTE-01 — Command Centre Quick Actions must render as
// top-level anchors with no nested <a> descendants. React's hydration
// silently repaints an <a><a>...</a></a> tree because the HTML spec
// forbids nested anchors — the browser hoists inner links out to become
// siblings, which reshuffles click targets. On the reporting device
// this made the Variation tile fire the click event on the Continue-
// Working row (which navigates to /app/history) instead of navigating
// to /app/variation-orders.
//
// This test parses Dashboard.jsx's source directly and enforces:
//   1. Every Quick Action `to=` maps to the correct route.
//   2. There is NO nested `<Link>` inside another `<Link>` anywhere in
//      Dashboard.jsx.
//   3. ProjectCard specifically uses div-with-navigate rather than
//      <Link>-wrapping-<Link> so the "Photos" shortcut can coexist.
//
// This is a static regression that runs in Node without a browser, so
// it stays green as long as the JSX doesn't regress to the nested-
// anchor pattern.
//
// Run:
//   cd /app/frontend && \
//   node --experimental-loader ./tests/loader.mjs tests/cc-variation-route-01.test.mjs

import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync(new URL("../src/pages/Dashboard.jsx", import.meta.url), "utf-8");

let passed = 0, failed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log(`  ✔ ${name}`); } catch (e) { failed++; console.error(`  ✘ ${name}\n    ${e.stack || e.message}`); } };

console.log("CC-VARIATION-ROUTE-01 — Command Centre Quick Actions routing regression");

t("QUICK_ACTIONS.variation-letter → /app/variation-orders", () => {
  const m = SRC.match(/id:\s*"variation-letter"[^}]*to:\s*"([^"]+)"/);
  assert.ok(m, "variation-letter Quick Action not found");
  assert.equal(m[1], "/app/variation-orders");
});

t("QUICK_ACTIONS.cis-invoice → /app/invoice-builder", () => {
  const m = SRC.match(/id:\s*"cis-invoice"[^}]*to:\s*"([^"]+)"/);
  assert.ok(m); assert.equal(m[1], "/app/invoice-builder");
});

t("QUICK_ACTIONS.quote-builder → /app/tool/quote-builder", () => {
  const m = SRC.match(/id:\s*"quote-builder"[^}]*to:\s*"([^"]+)"/);
  assert.ok(m); assert.equal(m[1], "/app/tool/quote-builder");
});

t("QUICK_ACTIONS.rams → /app/rams", () => {
  const m = SRC.match(/id:\s*"rams"[^}]*to:\s*"([^"]+)"/);
  assert.ok(m); assert.equal(m[1], "/app/rams");
});

t("ProjectCard MUST NOT wrap the whole card in <Link> (would nest with the Photos <Link>)", () => {
  const projectCardStart = SRC.indexOf("function ProjectCard(");
  assert.ok(projectCardStart > 0, "ProjectCard function not found");
  const projectCardEnd = SRC.indexOf("\n}\n", projectCardStart);
  const body = SRC.slice(projectCardStart, projectCardEnd);
  // Outer element must be a <div role="link"> not <Link>
  assert.match(body, /return\s*\(\s*<div\s+role="link"/,
    "ProjectCard outer element must be <div role=\"link\"> — regression: nested <Link> inside <Link> triggers hydration reshuffle");
  // Photos Link inside is fine (it's the ONE and only Link now)
  const linkMatches = body.match(/<Link\s/g) || [];
  assert.equal(linkMatches.length, 1, `ProjectCard should contain exactly one <Link> (the Photos shortcut), found ${linkMatches.length}`);
});

t("No <Link> component is a direct or nested descendant of another <Link> in Dashboard.jsx", () => {
  // Strip JS block and line comments so an explanatory comment that
  // mentions "<Link>" doesn't trip the regex-based scan.
  const stripped = SRC
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  // Walk each JSX <Link>: `<Link ...>` opens a scope, `<Link ... />` is
  // self-closing (no scope), `</Link>` closes the current scope.
  const RE = /<Link\b([^>]*?)(\/?)>|<\/Link>/g;
  let depth = 0;
  let m;
  while ((m = RE.exec(stripped)) !== null) {
    const isClose = m[0] === "</Link>";
    const selfClose = m[2] === "/";
    if (isClose) { depth--; continue; }
    if (depth > 0) {
      const ctx = stripped.slice(Math.max(0, m.index - 80), m.index + 80).replace(/\s+/g, " ");
      throw new Error(`Nested <Link> at char ${m.index}: …${ctx}…`);
    }
    if (!selfClose) depth++;
  }
  assert.equal(depth, 0, "Unbalanced <Link>...</Link> pairs");
});

t("data-testid pattern for quick actions matches `cc-quick-<id>`", () => {
  const m = SRC.match(/data-testid=\{`cc-quick-\$\{qa\.id\}`\}/);
  assert.ok(m, "Expected data-testid={`cc-quick-${qa.id}`} on the Quick Action Link");
});

console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
