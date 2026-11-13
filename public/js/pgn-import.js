// ===================================================================
// pgn-import.js – "Import PGN": upload et parti (fx fra chess.com) og
// lad Stockfish gennemgå det med den almindelige Game Review, så man
// får sin nøjagtighed og en estimeret rating for partiet.
// ===================================================================

let pgnImportParsed = null;
let pgnImportColor = "w";

function openPgnImport() {
  pgnImportParsed = null;
  $("pgn-import-file").value = "";
  $("pgn-import-text").value = "";
  $("pgn-import-preview").classList.add("hidden");
  $("pgn-import-preview").innerHTML = "";
  $("pgn-import-error").textContent = "";
  $("btn-pgn-import-review").disabled = true;
  $("pgn-import-modal").classList.remove("hidden");
}

function closePgnImport() {
  $("pgn-import-modal").classList.add("hidden");
}

// Prøver at læse PGN-teksten. Returnerer { error } hvis det ikke lykkedes.
function parsePgnText(text) {
  text = text.trim();
  if (!text) return null;
  let chess;
  try {
    chess = new Chess();
    chess.loadPgn(text, { strict: false });
  } catch (e) {
    return { error: "Couldn't read that PGN — check it's valid PGN text." };
  }
  const sans = chess.history();
  if (!sans.length) return { error: "No moves found in that PGN." };
  const headers = chess.getHeaders();
  const startFen = headers.FEN || new Chess().fen();
  return {
    sans,
    startFen,
    white: headers.White || "White",
    black: headers.Black || "Black",
    whiteElo: headers.WhiteElo && !isNaN(Number(headers.WhiteElo)) ? Number(headers.WhiteElo) : null,
    blackElo: headers.BlackElo && !isNaN(Number(headers.BlackElo)) ? Number(headers.BlackElo) : null,
    result: ["1-0", "0-1", "1/2-1/2"].includes(headers.Result) ? headers.Result : "*",
  };
}

// Gætter hvilken farve man selv spillede, ved at kigge på navnet i sin profil
function guessMyColor(p) {
  const me = Accounts.name().trim().toLowerCase();
  if (p.white.trim().toLowerCase() === me) return "w";
  if (p.black.trim().toLowerCase() === me) return "b";
  return "w";
}

function handlePgnText(text) {
  const result = parsePgnText(text);
  $("pgn-import-error").textContent = "";
  $("pgn-import-preview").classList.add("hidden");
  $("btn-pgn-import-review").disabled = true;
  pgnImportParsed = null;
  if (!result) return;
  if (result.error) { $("pgn-import-error").textContent = result.error; return; }
  pgnImportParsed = result;
  pgnImportColor = guessMyColor(result);
  drawPgnPreview();
}

function drawPgnPreview() {
  const p = pgnImportParsed;
  if (!p) return;
  const colorBtn = (color, label) => `
    <button class="pgn-color-btn ${pgnImportColor === color ? "selected" : ""}" data-pgn-color="${color}">${label}</button>`;
  $("pgn-import-preview").innerHTML = `
    <div class="pgn-import-matchup">
      <span>${escapeHTML(p.white)}${p.whiteElo ? ` (${p.whiteElo})` : ""}</span>
      <span class="rv-muted">vs</span>
      <span>${escapeHTML(p.black)}${p.blackElo ? ` (${p.blackElo})` : ""}</span>
    </div>
    <div class="pgn-import-meta rv-muted">${p.sans.length} moves · ${p.result === "*" ? "result unknown" : p.result}</div>
    <div class="pgn-color-pick">
      <span class="rv-muted">I played as:</span>
      ${colorBtn("w", "White")}${colorBtn("b", "Black")}
    </div>`;
  $("pgn-import-preview").classList.remove("hidden");
  $("btn-pgn-import-review").disabled = false;
}

$("btn-close-pgn-import").addEventListener("click", closePgnImport);
$("pgn-import-modal").addEventListener("click", (e) => {
  if (e.target.id === "pgn-import-modal") closePgnImport();
});
$("pgn-import-preview").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-pgn-color]");
  if (!btn) return;
  pgnImportColor = btn.dataset.pgnColor;
  drawPgnPreview();
});
$("pgn-import-text").addEventListener("input", (e) => handlePgnText(e.target.value));
$("pgn-import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    $("pgn-import-text").value = reader.result;
    handlePgnText(reader.result);
  };
  reader.onerror = () => { $("pgn-import-error").textContent = "Couldn't read that file."; };
  reader.readAsText(file);
});
$("btn-pgn-import-review").addEventListener("click", () => {
  const p = pgnImportParsed;
  if (!p) return;
  const game = {
    white: { name: p.white, rating: p.whiteElo || undefined },
    black: { name: p.black, rating: p.blackElo || undefined },
    result: p.result,
    sans: p.sans,
    startFen: p.startFen,
    myColor: pgnImportColor,
    opponentRating: (pgnImportColor === "w" ? p.blackElo : p.whiteElo) || 1200,
  };
  closePgnImport();
  Review.openGame(game);
});
