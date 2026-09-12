// Register the ESM loader hook (Node 20+ pattern).
import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("./loader.mjs", pathToFileURL(new URL(".", import.meta.url).href));
