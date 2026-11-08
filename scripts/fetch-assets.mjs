// Henter/producerer de filer, som ikke ligger i git:
//  - Stockfish (motoren) kopieres fra npm-pakken "stockfish" til public/lib/
//  - Brik-sæt (cburnett, merida, maestro) hentes fra Lichess' åbne repo.
//    Lykkes det ikke (offline), laves simple reserve-brikker, så spillet stadig virker.
import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const libDir = resolve(root, "public/lib");
mkdirSync(libDir, { recursive: true });

// ----- Stockfish -----
function findStockfish() {
  const base = resolve(root, "node_modules/stockfish");
  const candidates = [join(base, "bin"), join(base, "src"), base];
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    const js = readdirSync(dir).find((f) => /lite-single\.js$/.test(f));
    if (js) return { dir, js, wasm: js.replace(/\.js$/, ".wasm") };
  }
  return null;
}
const sf = findStockfish();
if (sf && existsSync(join(sf.dir, sf.wasm))) {
  // engine.js leder efter "stockfish-19-lite-single.js". Vi kopierer under både det originale og det navn.
  for (const [from, to] of [
    [sf.js, sf.js], [sf.wasm, sf.wasm],
    [sf.js, "stockfish-19-lite-single.js"], [sf.wasm, "stockfish-19-lite-single.wasm"],
  ]) copyFileSync(join(sf.dir, from), join(libDir, to));
  console.log("Stockfish kopieret:", sf.js);
} else {
  console.warn("! Stockfish ikke fundet i node_modules/stockfish – bots og analyse virker ikke, før du kører 'npm install'.");
}

// ----- Brik-sæt -----
const sets = ["cburnett", "merida", "maestro"];
const names = ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"];
const glyph = { K: ["♔", "♚"], Q: ["♕", "♛"], R: ["♖", "♜"], B: ["♗", "♝"], N: ["♘", "♞"], P: ["♙", "♟"] };

function fallbackSvg(name) {
  const white = name[0] === "w";
  const g = glyph[name[1]][1]; // fyldt figur, farves med fill
  const fill = white ? "#ffffff" : "#222222";
  const stroke = white ? "#222222" : "#ffffff";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><text x="22.5" y="36" font-size="38" text-anchor="middle" font-family="'Segoe UI Symbol','Noto Sans Symbols2','DejaVu Sans',serif" fill="${fill}" stroke="${stroke}" stroke-width="1.2" paint-order="stroke">${g}</text></svg>`;
}

for (const set of sets) {
  const dir = resolve(root, "public/img/pieces", set);
  mkdirSync(dir, { recursive: true });
  for (const n of names) {
    const file = join(dir, n + ".svg");
    if (existsSync(file) && !readFlag(file)) continue;
    let svg = null;
    try {
      const r = await fetch(`https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/${set}/${n}.svg`);
      if (r.ok) svg = await r.text();
    } catch { /* offline */ }
    if (!svg) { svg = fallbackSvg(n); }
    writeFileSync(file, svg);
  }
  console.log("Brik-sæt klar:", set);
}
function readFlag(file) { return false; }
