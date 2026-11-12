// ===================================================================
// opening-book.js – "Browse Openings"-vinduet på Play-siden.
// En liste over 100 kendte åbninger. Man kan søge (fx "ruy", "scandi",
// "lond") og få dem, der starter på det, øverst – ligesom et
// autocomplete-felt. Klikker man på en, startes et nyt Pass and Play-
// parti, og åbningens træk bliver spillet op på brættet med det samme.
// ===================================================================

const OPENING_BOOK = [
  ["King's Pawn Opening", "e4"],
  ["Queen's Pawn Opening", "d4"],
  ["English Opening", "c4"],
  ["Zukertort Opening", "Nf3"],
  ["Bird's Opening", "f4"],
  ["Nimzo-Larsen Attack", "b3"],
  ["King's Fianchetto Opening", "g3"],
  ["Polish Opening", "b4"],
  ["Van Geet Opening", "Nc3"],
  ["Van't Kruijs Opening", "e3"],
  ["Mieses Opening", "d3"],
  ["Saragossa Opening", "c3"],
  ["Grob's Attack", "g4"],
  ["Clemenz Opening", "h3"],

  ["King's Pawn Game", "e4 e5"],
  ["King's Knight Opening", "e4 e5 Nf3"],
  ["Italian Game", "e4 e5 Nf3 Nc6 Bc4"],
  ["Giuoco Piano", "e4 e5 Nf3 Nc6 Bc4 Bc5"],
  ["Evans Gambit", "e4 e5 Nf3 Nc6 Bc4 Bc5 b4"],
  ["Two Knights Defense", "e4 e5 Nf3 Nc6 Bc4 Nf6"],
  ["Ruy Lopez", "e4 e5 Nf3 Nc6 Bb5"],
  ["Ruy Lopez: Morphy Defense", "e4 e5 Nf3 Nc6 Bb5 a6"],
  ["Ruy Lopez: Berlin Defense", "e4 e5 Nf3 Nc6 Bb5 Nf6"],
  ["Ruy Lopez: Exchange Variation", "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6"],
  ["Scotch Game", "e4 e5 Nf3 Nc6 d4"],
  ["Scotch Gambit", "e4 e5 Nf3 Nc6 d4 exd4 Bc4"],
  ["Four Knights Game", "e4 e5 Nf3 Nc6 Nc3 Nf6"],
  ["Three Knights Opening", "e4 e5 Nf3 Nc6 Nc3"],
  ["Petrov's Defense", "e4 e5 Nf3 Nf6"],
  ["Petrov's Defense: Classical Attack", "e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4"],
  ["Philidor Defense", "e4 e5 Nf3 d6"],
  ["Latvian Gambit", "e4 e5 Nf3 f5"],
  ["King's Gambit", "e4 e5 f4"],
  ["King's Gambit Accepted", "e4 e5 f4 exf4"],
  ["King's Gambit Declined", "e4 e5 f4 Bc5"],
  ["Vienna Game", "e4 e5 Nc3"],
  ["Vienna Gambit", "e4 e5 Nc3 Nf6 f4"],
  ["Bishop's Opening", "e4 e5 Bc4"],
  ["Center Game", "e4 e5 d4"],
  ["Danish Gambit", "e4 e5 d4 exd4 c3"],

  ["Sicilian Defense", "e4 c5"],
  ["Sicilian Defense: Najdorf Variation", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6"],
  ["Sicilian Defense: Dragon Variation", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6"],
  ["Sicilian Defense: Scheveningen Variation", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6"],
  ["Sicilian Defense: Closed", "e4 c5 Nc3"],
  ["Sicilian Defense: Alapin Variation", "e4 c5 c3"],
  ["Sicilian Defense: Smith-Morra Gambit", "e4 c5 d4 cxd4 c3"],
  ["Sicilian Defense: Taimanov Variation", "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6"],
  ["Sicilian Defense: Kan Variation", "e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6"],
  ["Sicilian Defense: Accelerated Dragon", "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6"],
  ["Sicilian Defense: Sveshnikov Variation", "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5"],

  ["French Defense", "e4 e6"],
  ["French Defense: Advance Variation", "e4 e6 d4 d5 e5"],
  ["French Defense: Winawer Variation", "e4 e6 d4 d5 Nc3 Bb4"],
  ["French Defense: Tarrasch Variation", "e4 e6 d4 d5 Nd2"],
  ["French Defense: Exchange Variation", "e4 e6 d4 d5 exd5 exd5"],

  ["Caro-Kann Defense", "e4 c6"],
  ["Caro-Kann Defense: Advance Variation", "e4 c6 d4 d5 e5"],
  ["Caro-Kann Defense: Classical Variation", "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5"],
  ["Caro-Kann Defense: Panov-Botvinnik Attack", "e4 c6 d4 d5 exd5 cxd5 c4"],

  ["Scandinavian Defense", "e4 d5"],
  ["Scandinavian Defense: Main Line", "e4 d5 exd5 Qxd5 Nc3"],
  ["Scandinavian Defense: Modern Variation", "e4 d5 exd5 Nf6"],

  ["Pirc Defense", "e4 d6"],
  ["Modern Defense", "e4 g6"],
  ["Alekhine's Defense", "e4 Nf6"],
  ["Alekhine's Defense: Four Pawns Attack", "e4 Nf6 e5 Nd5 c4 Nb6 d4 d6 f4"],
  ["Nimzowitsch Defense", "e4 Nc6"],

  ["Queen's Pawn Game", "d4 d5"],
  ["Queen's Gambit", "d4 d5 c4"],
  ["Queen's Gambit Declined", "d4 d5 c4 e6"],
  ["Queen's Gambit Accepted", "d4 d5 c4 dxc4"],
  ["Slav Defense", "d4 d5 c4 c6"],
  ["Semi-Slav Defense", "d4 d5 c4 c6 Nf3 Nf6 Nc3 e6"],
  ["Albin Countergambit", "d4 d5 c4 e5"],
  ["London System", "d4 d5 Nf3 Nf6 Bf4"],
  ["Jobava London System", "d4 d5 Nc3 Nf6 Bf4"],
  ["Colle System", "d4 d5 Nf3 Nf6 e3"],
  ["Colle-Zukertort System", "d4 d5 Nf3 Nf6 e3 e6 Bd3 c5 b3"],
  ["Stonewall Attack", "d4 d5 e3 Nf6 Bd3 c5 c3 Nc6 f4"],
  ["Richter-Veresov Attack", "d4 d5 Nc3 Nf6 Bg5"],
  ["Blackmar-Diemer Gambit", "d4 d5 Nc3 Nf6 e4"],

  ["Trompowsky Attack", "d4 Nf6 Bg5"],
  ["Torre Attack", "d4 Nf6 Nf3 e6 Bg5"],
  ["Indian Defense", "d4 Nf6"],
  ["King's Indian Defense", "d4 Nf6 c4 g6"],
  ["Grünfeld Defense", "d4 Nf6 c4 g6 Nc3 d5"],
  ["Nimzo-Indian Defense", "d4 Nf6 c4 e6 Nc3 Bb4"],
  ["Queen's Indian Defense", "d4 Nf6 c4 e6 Nf3 b6"],
  ["Bogo-Indian Defense", "d4 Nf6 c4 e6 Nf3 Bb4+"],
  ["Catalan Opening", "d4 Nf6 c4 e6 g3"],
  ["Benoni Defense", "d4 Nf6 c4 c5"],
  ["Benko Gambit", "d4 Nf6 c4 c5 d5 b5"],
  ["Budapest Gambit", "d4 Nf6 c4 e5"],

  ["Dutch Defense", "d4 f5"],
  ["Englund Gambit", "d4 e5"],

  ["English Opening: King's English", "c4 e5"],
  ["English Opening: Symmetrical Variation", "c4 c5"],
  ["Réti Opening", "Nf3 d5 c4"],
  ["King's Indian Attack", "Nf3 d5 g3"],
];

// Finder åbninger, hvis navn passer med søgningen. Dem hvor et HELT ord
// (fx "Ruy", "Scandinavian", "London") starter med søgeteksten kommer
// øverst – ligesom autocomplete. Resten er bare en almindelig søgning
// i hele navnet.
function searchOpeningBook(query) {
  const q = query.trim().toLowerCase();
  if (!q) return OPENING_BOOK.slice(0, 20);

  const wordStart = [];
  const nameContains = [];
  for (const entry of OPENING_BOOK) {
    const name = entry[0];
    const lower = name.toLowerCase();
    const words = lower.split(/[\s'’:-]+/).filter(Boolean);
    if (words.some((w) => w.startsWith(q))) wordStart.push(entry);
    else if (lower.includes(q)) nameContains.push(entry);
  }
  const byName = (a, b) => a[0].localeCompare(b[0]);
  // Inden for "starter med": hele navnet starter med søgningen (fx "Ruy" → "Ruy Lopez") før undervarianter.
  wordStart.sort((a, b) => {
    const aFull = a[0].toLowerCase().startsWith(q) ? 0 : 1;
    const bFull = b[0].toLowerCase().startsWith(q) ? 0 : 1;
    return aFull !== bFull ? aFull - bFull : byName(a, b);
  });
  nameContains.sort(byName);
  return [...wordStart, ...nameContains].slice(0, 30);
}

// ----- Vinduet -----

function openOpeningBook() {
  $("opening-book-modal").classList.remove("hidden");
  const input = $("opening-book-input");
  input.value = "";
  drawOpeningBookResults("");
  input.focus();
}

function closeOpeningBook() {
  $("opening-book-modal").classList.add("hidden");
}

function drawOpeningBookResults(query) {
  const results = searchOpeningBook(query);
  const el = $("opening-book-results");
  el.innerHTML = results.length
    ? results.map((entry, i) => `
        <button class="opening-book-item" data-opening-index="${OPENING_BOOK.indexOf(entry)}">
          <span>${escapeHTML(entry[0])}</span>
          <span class="opening-book-moves">${escapeHTML(entry[1])}</span>
        </button>`).join("")
    : `<div class="opening-book-empty">No openings match “${escapeHTML(query)}”.</div>`;
}

// Viser åbningens trækliste under brættet, så man selv kan spille dem ud for at træne.
function showOpeningMoves(entry) {
  const [name, line] = entry;
  const moves = line.split(" ");
  let numbered = "";
  for (let i = 0; i < moves.length; i += 2) {
    const moveNum = i / 2 + 1;
    numbered += `${moveNum}. ${moves[i]}${moves[i + 1] ? " " + moves[i + 1] : ""} `;
  }
  $("opening-trainer-name").textContent = name;
  $("opening-trainer-moves").textContent = numbered.trim();
  $("opening-trainer").classList.remove("hidden");
  closeOpeningBook();
}

$("btn-browse-openings").addEventListener("click", openOpeningBook);
$("btn-close-opening-book").addEventListener("click", closeOpeningBook);
$("btn-close-opening-trainer").addEventListener("click", () => $("opening-trainer").classList.add("hidden"));
$("opening-book-modal").addEventListener("click", (e) => {
  if (e.target.id === "opening-book-modal") closeOpeningBook();
});
$("opening-book-input").addEventListener("input", (e) => drawOpeningBookResults(e.target.value));
$("opening-book-results").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-opening-index]");
  if (!btn) return;
  showOpeningMoves(OPENING_BOOK[Number(btn.dataset.openingIndex)]);
});
