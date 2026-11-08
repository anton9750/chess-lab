// ===================================================================
// openings.js – navnene på kendte åbninger.
// Hver linje er en trækfølge og åbningens navn. Vi finder den
// længste trækfølge, der passer med starten af partiet.
// ===================================================================

const OPENINGS = [
  ["e4", "King's Pawn Opening"],
  ["d4", "Queen's Pawn Opening"],
  ["c4", "English Opening"],
  ["Nf3", "Zukertort Opening"],
  ["f4", "Bird's Opening"],
  ["b3", "Nimzo-Larsen Attack"],
  ["g3", "King's Fianchetto Opening"],
  ["b4", "Polish Opening"],
  ["Nc3", "Van Geet Opening"],
  ["e3", "Van't Kruijs Opening"],
  ["d3", "Mieses Opening"],
  ["c3", "Saragossa Opening"],
  ["f3", "Barnes Opening"],
  ["g4", "Grob Opening"],
  ["a3", "Anderssen's Opening"],
  ["a4", "Ware Opening"],
  ["h3", "Clemenz Opening"],
  ["h4", "Kádas Opening"],
  ["Nh3", "Amar Opening"],
  ["Na3", "Sodium Attack"],

  // 1.e4 e5
  ["e4 e5", "King's Pawn Game"],
  ["e4 e5 Nf3", "King's Knight Opening"],
  ["e4 e5 Nf3 Nc6", "King's Knight Opening: Normal Variation"],
  ["e4 e5 Nf3 Nc6 Bc4", "Italian Game"],
  ["e4 e5 Nf3 Nc6 Bc4 Bc5", "Italian Game: Giuoco Piano"],
  ["e4 e5 Nf3 Nc6 Bc4 Bc5 b4", "Italian Game: Evans Gambit"],
  ["e4 e5 Nf3 Nc6 Bc4 Nf6", "Italian Game: Two Knights Defense"],
  ["e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5", "Italian Game: Two Knights Defense, Knight Attack"],
  ["e4 e5 Nf3 Nc6 Bb5", "Ruy Lopez Opening"],
  ["e4 e5 Nf3 Nc6 Bb5 a6", "Ruy Lopez Opening: Morphy Defense"],
  ["e4 e5 Nf3 Nc6 Bb5 Nf6", "Ruy Lopez Opening: Berlin Defense"],
  ["e4 e5 Nf3 Nc6 d4", "Scotch Game"],
  ["e4 e5 Nf3 Nc6 d4 exd4 Bc4", "Scotch Gambit"],
  ["e4 e5 Nf3 Nc6 Nc3", "Three Knights Opening"],
  ["e4 e5 Nf3 Nc6 Nc3 Nf6", "Four Knights Game"],
  ["e4 e5 Nf3 Nf6", "Petrov's Defense"],
  ["e4 e5 Nf3 d6", "Philidor Defense"],
  ["e4 e5 Nf3 f5", "Latvian Gambit"],
  ["e4 e5 f4", "King's Gambit"],
  ["e4 e5 f4 exf4", "King's Gambit Accepted"],
  ["e4 e5 Nc3", "Vienna Game"],
  ["e4 e5 Bc4", "Bishop's Opening"],
  ["e4 e5 Qh5", "Wayward Queen Attack"],
  ["e4 e5 d4", "Center Game"],

  // Andre svar på 1.e4
  ["e4 c5", "Sicilian Defense"],
  ["e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6", "Sicilian Defense: Najdorf Variation"],
  ["e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6", "Sicilian Defense: Dragon Variation"],
  ["e4 c5 Nc3", "Sicilian Defense: Closed"],
  ["e4 c5 c3", "Sicilian Defense: Alapin Variation"],
  ["e4 c5 d4 cxd4 c3", "Sicilian Defense: Smith-Morra Gambit"],
  ["e4 e6", "French Defense"],
  ["e4 e6 d4 d5 e5", "French Defense: Advance Variation"],
  ["e4 c6", "Caro-Kann Defense"],
  ["e4 c6 d4 d5 e5", "Caro-Kann Defense: Advance Variation"],
  ["e4 d5", "Scandinavian Defense"],
  ["e4 d6", "Pirc Defense"],
  ["e4 g6", "Modern Defense"],
  ["e4 Nf6", "Alekhine's Defense"],
  ["e4 Nc6", "Nimzowitsch Defense"],

  // 1.d4
  ["d4 d5", "Queen's Pawn Game"],
  ["d4 d5 c4", "Queen's Gambit"],
  ["d4 d5 c4 e6", "Queen's Gambit Declined"],
  ["d4 d5 c4 dxc4", "Queen's Gambit Accepted"],
  ["d4 d5 c4 c6", "Slav Defense"],
  ["d4 d5 c4 e5", "Albin Countergambit"],
  ["d4 d5 Bf4", "London System"],
  ["d4 d5 Nf3 Nf6 Bf4", "London System"],
  ["d4 Nf6", "Indian Defense"],
  ["d4 Nf6 Bf4", "London System"],
  ["d4 Nf6 c4 g6", "King's Indian Defense"],
  ["d4 Nf6 c4 g6 Nc3 d5", "Grünfeld Defense"],
  ["d4 Nf6 c4 e6 Nc3 Bb4", "Nimzo-Indian Defense"],
  ["d4 Nf6 c4 e6 Nf3 b6", "Queen's Indian Defense"],
  ["d4 Nf6 c4 e6 g3", "Catalan Opening"],
  ["d4 Nf6 c4 c5", "Benoni Defense"],
  ["d4 Nf6 c4 c5 d5 b5", "Benko Gambit"],
  ["d4 f5", "Dutch Defense"],

  // 1.c4
  ["c4 e5", "English Opening: King's English"],
];

// Finder åbningens navn ud fra partiets træk (fx ["e4", "e5", "Nf3"]).
// Returnerer null, hvis ingen åbning passer.
function getOpeningName(sanMoves) {
  // "+" og "#" (skak og mat) fjernes, så de ikke ødelægger sammenligningen.
  const moves = sanMoves.map((san) => san.replace(/[+#]/g, ""));

  let bestName = null;
  let bestLength = 0;

  for (const [line, name] of OPENINGS) {
    const lineMoves = line.split(" ");
    const fits =
      lineMoves.length <= moves.length &&
      lineMoves.every((move, i) => move === moves[i]);

    if (fits && lineMoves.length > bestLength) {
      bestName = name;
      bestLength = lineMoves.length;
    }
  }
  return bestName;
}

// Hvor mange træk i starten af partiet der passer med en kendt åbning ("bogtræk").
function openingDepth(sanMoves) {
  const moves = sanMoves.map((san) => san.replace(/[+#]/g, ""));
  let best = 0;
  for (const [line] of OPENINGS) {
    const lineMoves = line.split(" ");
    if (lineMoves.length <= moves.length && lineMoves.length > best && lineMoves.every((m, i) => m === moves[i])) {
      best = lineMoves.length;
    }
  }
  return best;
}