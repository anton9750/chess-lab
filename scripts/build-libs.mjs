// Bygger lib/chessops.js (det globale "Chessops", som variants.js bruger) ud fra npm-pakken chessops. Kører automatisk før dev/build.
import { build } from "esbuild";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = resolve(root, "node_modules/.cache/chesshub-libs");
const out = resolve(root, "public/lib");
mkdirSync(tmp, { recursive: true });
mkdirSync(out, { recursive: true });

// (chess.js 1.4.0 ligger allerede som færdigt script i public/lib/chess.js)

// 2) chessops → global "Chessops" (samme form som variants.js/bots.js forventer)
writeFileSync(resolve(tmp, "chessops-entry.js"), `
import * as fen from "chessops/fen";
import * as san from "chessops/san";
import * as compat from "chessops/compat";
import * as util from "chessops/util";
import { defaultPosition, setupPosition } from "chessops/variant";

const variant = {
  defaultPosition,
  setupPosition,
  // e1g1 → e1h1 (rokade) osv.
  normalizeMove: (pos, move) => (typeof pos.normalizeMove === "function" ? pos.normalizeMove(move) : move),
};

window.Chessops = {
  fen, san, compat, variant,
  makeSquare: util.makeSquare,
  parseSquare: util.parseSquare,
};
`);

for (const [entry, file] of [["chessops-entry.js", "chessops.js"]]) {
  await build({
    entryPoints: [resolve(tmp, entry)],
    outfile: resolve(out, file),
    bundle: true,
    format: "iife",
    minify: true,
    target: "es2020",
    absWorkingDir: root,
    nodePaths: [resolve(root, "node_modules")],
    logLevel: "warning",
  });
  console.log("lib/" + file + " bygget");
}
rmSync(tmp, { recursive: true, force: true });
