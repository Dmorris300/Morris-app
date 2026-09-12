// Node ESM resolver hook — auto-appends `.js` to relative imports so the
// P3 smoke test can load the app's PDF generators without a bundler.
// Registered via: `node --import ./tests/register-loader.mjs tests/pdf-smoke.test.mjs`
import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as pResolve } from "node:path";

export function resolve(specifier, ctx, nextResolve) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const parentDir = ctx.parentURL ? dirname(fileURLToPath(ctx.parentURL)) : process.cwd();
    const base = specifier.startsWith(".") ? pResolve(parentDir, specifier) : specifier;
    const tries = [base, `${base}.js`, `${base}/index.js`];
    for (const t of tries) {
      try { if (statSync(t).isFile()) return nextResolve(pathToFileURL(t).href, ctx); } catch { /* try next */ }
    }
  }
  return nextResolve(specifier, ctx);
}
