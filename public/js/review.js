// ===================================================================
// review.js – Game Review (coach) og Analysis Board.
//
// Game Review: Stockfish analyserer hver stilling i partiet. For hvert
// træk sammenligner vi, hvor godt man stod før og efter trækket, og
// giver trækket en karakter (Brilliant, Best, Mistake, Blunder ...).
// En coach forklarer trækkene med almindelige ord.
//
// "Hvor godt man står" måles som vinderchance i procent (0–100),
// beregnet ud fra Stockfish' vurdering i centibønder (100 = én bonde).
// Formlerne er de samme, som Lichess bruger.
// ===================================================================

// ----- 1. Karakterer for træk -----

const MOVE_CLASSES = {
  brilliant:  { name: "Brilliant",  symbol: "!!", order: 0 },
  great:      { name: "Great",      symbol: "!",  order: 1 },
  best:       { name: "Best",       symbol: "★",  order: 2 },
  excellent:  { name: "Excellent",  symbol: "👍︎", order: 3 },
  good:       { name: "Good",       symbol: "✓",  order: 4 },
  book:       { name: "Book",       symbol: "📖︎", order: 5 },
  forced:     { name: "Forced",     symbol: "→",  order: 6 },
  inaccuracy: { name: "Inaccuracy", symbol: "?!", order: 7 },
  mistake:    { name: "Mistake",    symbol: "?",  order: 8 },
  miss:       { name: "Miss",       symbol: "✗",  order: 9 },
  blunder:    { name: "Blunder",    symbol: "??", order: 10 },
};
const CLASS_TABLE_ORDER = ["brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "miss", "blunder"];

const PIECE_NAMES = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

// Vurdering (fra hvids side) → hvids vinderchance i procent
function winPercent(evalWhite) {
  if (evalWhite.mate !== null && evalWhite.mate !== undefined) return evalWhite.mate > 0 ? 100 : 0;
  const cp = Math.max(-1500, Math.min(1500, evalWhite.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

// Hvor præcist et træk var (0–100), ud fra hvor meget vinderchance det kostede
function moveAccuracy(winLoss) {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * winLoss) - 3.1669));
}

// Vurdering som tekst til evalueringsbjælken: "+1.3", "-0.4", "M3"
function formatEval(evalWhite) {
  if (evalWhite.mate !== null && evalWhite.mate !== undefined) {
    if (evalWhite.mate === 0) return "#";
    return (evalWhite.mate > 0 ? "M" : "-M") + Math.abs(evalWhite.mate);
  }
  const pawns = evalWhite.cp / 100;
  return (pawns > 0 ? "+" : "") + pawns.toFixed(1);
}

// Laver et UCI-træk (fx "g1f3") om til SAN (fx "Nf3") i en given stilling
function uciToSan(fen, uci) {
  try {
    const chess = new Chess(fen);
    return chess.move(uciToMove(uci)).san;
  } catch (error) {
    return uci;
  }
}

// Laver en hel variant (liste af UCI-træk) om til SAN-tekst: "1. e4 e5 2. Nf3"
function pvToSan(fen, pv, maxMoves = 8) {
  const chess = new Chess(fen);
  const parts = [];
  for (const uci of pv.slice(0, maxMoves)) {
    // Træknummeret står som det sidste tal i FEN'en
    const number = chess.fen().split(" ")[5];
    let move;
    try { move = chess.move(uciToMove(uci)); } catch (error) { break; }
    if (move.color === "w") parts.push(`${number}. ${move.san}`);
    else parts.push(parts.length === 0 ? `${number}... ${move.san}` : move.san);
  }
  return parts.join(" ");
}

// Analyserer én stilling og returnerer vurderingen set fra HVIDS side.
async function analyzePosition(fen, options, engine = null) {
  const chess = new Chess(fen);
  const sign = chess.turn() === "w" ? 1 : -1;

  // Slutstillinger behøver ingen motor
  if (chess.isCheckmate()) return { eval: { cp: null, mate: 0 * sign, matedSide: chess.turn() }, lines: [], terminal: true };
  if (chess.isDraw() || chess.isStalemate()) return { eval: { cp: 0, mate: null }, lines: [], terminal: true };

  const result = await (engine || getEngine()).analyze(fen, options);
  if (!result) return null;
  const lines = result.lines.map((l) => ({
    move: l.move,
    pv: l.pv,
    eval: { cp: l.cp === null ? null : l.cp * sign, mate: l.mate === null ? null : l.mate * sign },
  }));
  return { eval: lines.length ? lines[0].eval : { cp: 0, mate: null }, lines, best: result.best };
}

// Hvids vinderchance i en analyseret stilling (mat på brættet tæller som 0 eller 100)
function positionWin(analysis) {
  if (analysis.terminal && analysis.eval.matedSide) return analysis.eval.matedSide === "w" ? 0 : 100;
  return winPercent(analysis.eval);
}

// Giver et træk en karakter. Bruges både i Game Review og af coachen i bot-partier.
//  before / after – analyse af stillingen før og efter trækket
//  move           – trækket (fra chess.js, med .color, .san, .from, .to, .piece)
//  fenBefore      – stillingen før trækket
//  isBook         – om trækket er et kendt åbningstræk
//  prevClass      – karakteren for modstanderens forrige træk (til "Miss")
//  ply            – hvilket træk i partiet (0 = første), bruges til at være mild i åbningen
function classifyMove({ before, after, move, fenBefore, isBook, prevClass, ply }) {
  const mover = move.color;
  const toMover = (w) => (mover === "w" ? w : 100 - w);
  const winBefore = toMover(positionWin(before));
  const winAfter = toMover(positionWin(after));
  const loss = Math.max(0, winBefore - winAfter);
  const uci = move.from + move.to + (move.promotion || "");
  const bestUci = before.lines[0] ? before.lines[0].move : before.best;
  const isBest = uci === bestUci || (after.terminal && after.eval.matedSide && after.eval.matedSide !== mover);
  const legalCount = new Chess(fenBefore).moves().length;

  let cls;
  if (isBook) cls = "book";
  else if (legalCount === 1) cls = "forced";
  else if (isBest) {
    cls = "best";
    // "Great": det eneste gode træk – det næstbedste træk er meget dårligere
    if (before.lines[1]) {
      const secondWin = toMover(winPercent(before.lines[1].eval));
      if (winBefore - secondWin >= 15 && winAfter >= 40) cls = "great";
    }
    // "Brilliant": et godt offer – brikken sættes et sted, hvor den kan slås
    if (isSacrifice(move, fenBefore) && winAfter >= 50 && winBefore < 97) cls = "brilliant";
  } else if (loss < 2) cls = "excellent";
  else if (loss < 5) cls = "good";
  else if (loss < 10) cls = "inaccuracy";
  else if (loss < 20) cls = "mistake";
  else cls = "blunder";

  // Åbningen (de første 8 træk for hver): motoren svinger lidt i vurderingen,
  // så et almindeligt udviklingstræk, der efterlader en fin stilling, er ikke en fejl.
  if (ply !== undefined && ply < 16 && (cls === "inaccuracy" || cls === "mistake") && winAfter >= 35) cls = "good";

  // "Miss": modstanderen lavede lige en fejl, men man udnyttede den ikke
  if ((cls === "mistake" || cls === "blunder" || cls === "inaccuracy") &&
      (prevClass === "mistake" || prevClass === "blunder") && winBefore >= 60 && loss >= 10) {
    cls = "miss";
  }

  return { cls, loss, winBefore, winAfter, accuracy: moveAccuracy(loss), bestUci };
}

// Hvilken fase af partiet er en stilling i? (bruges af Insights)
//  - endgame: højst 6 officerer tilbage på brættet (springere, løbere, tårne, damer)
//  - opening: de første 10 træk for hver
//  - ellers middlegame
function gamePhase(fen, ply) {
  const officers = fen.split(" ")[0].replace(/[^nbrqNBRQ]/g, "").length;
  if (officers <= 6) return "endgame";
  if (ply < 20) return "opening";
  return "middlegame";
}

// Laver et lille sammendrag af en Game Review for én spiller.
// Det gemmes på partiet, så Insights og "Retry mistakes" kan bruge det senere.
function summarizeReview(moves, results, positions, analysis, color) {
  const counts = {};
  const phases = { opening: { acc: [], errors: 0 }, middlegame: { acc: [], errors: 0 }, endgame: { acc: [], errors: 0 } };
  const all = [];
  const mistakes = [];

  results.forEach((r, i) => {
    if (!r || moves[i].color !== color) return;
    counts[r.cls] = (counts[r.cls] || 0) + 1;
    all.push(r.accuracy);
    const phase = phases[gamePhase(positions[i], i)];
    phase.acc.push(r.accuracy);
    const bad = r.cls === "mistake" || r.cls === "blunder" || r.cls === "miss";
    if (bad) phase.errors++;

    // Gem fejlen som en lille opgave: "find et bedre træk her"
    if (bad && r.bestUci) {
      const lines = analysis[i] ? analysis[i].lines : [];
      // Var det næstbedste træk næsten lige så godt? Så tæller det også som rigtigt
      let alt = null;
      if (lines[1]) {
        const toMover = (w) => (color === "w" ? w : 100 - w);
        const diff = toMover(winPercent(lines[0].eval)) - toMover(winPercent(lines[1].eval));
        if (diff < 3) alt = lines[1].move;
      }
      mistakes.push({ fen: positions[i], played: moves[i].san, best: r.bestUci, alt, cls: r.cls, ply: i });
    }
  });

  const avg = (list) => (list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null);
  return {
    accuracy: avg(all),
    counts,
    phases: Object.fromEntries(Object.entries(phases).map(([k, p]) => [k, { acc: avg(p.acc), errors: p.errors, moves: p.acc.length }])),
    mistakes: mistakes.slice(0, 12),
  };
}

// Viser en estimeret rating for partiet, hvis vi kender hvilken farve man selv spillede
// og modstanderens rating (bots, venner eller en importeret PGN med Elo-tags).
function perfEstimateHTML(g, acc) {
  if (!g.myColor || !g.opponentRating) return "";
  const list = acc[g.myColor];
  if (!list.length) return "";
  const accuracy = list.reduce((a, b) => a + b, 0) / list.length;
  const won = (g.result === "1-0" && g.myColor === "w") || (g.result === "0-1" && g.myColor === "b");
  const draw = g.result === "1/2-1/2";
  const score = won ? 1 : draw ? 0.5 : 0;
  const est = estimatePerformanceElo(accuracy, score, g.opponentRating);
  return `<div class="rv-perf">Estimated performance: <b>${est}</b></div>`;
}

// En hurtig Game Review uden at vise noget (bruges af Insights til at analysere mange partier).
// Returnerer sammendraget, eller null hvis den blev afbrudt.
async function quickReviewGame(game, isCancelled, onProgress) {
  const startFen = game.startFen || new Chess().fen();
  const chess = new Chess(startFen);
  const positions = [startFen];
  const moves = [];
  for (const san of game.sans) {
    moves.push(chess.move(san));
    positions.push(chess.fen());
  }

  // Analysér hver stilling – kortere tid end den rigtige Game Review, så det går hurtigt
  const analysis = [];
  for (let i = 0; i < positions.length; i++) {
    const a = await analyzePosition(positions[i], { depth: 10, movetime: 120, multipv: 2 });
    if (!a || isCancelled()) return null;
    analysis.push(a);
    onProgress((i + 1) / positions.length);
  }

  const book = openingDepth(game.sans);
  const results = [];
  for (let i = 0; i < moves.length; i++) {
    results.push(classifyMove({
      before: analysis[i], after: analysis[i + 1], move: moves[i], fenBefore: positions[i],
      isBook: i < book, prevClass: i > 0 ? results[i - 1].cls : null, ply: i,
    }));
  }
  return summarizeReview(moves, results, positions, analysis, game.myColor);
}

// Er trækket et offer? (en officer sættes et sted, hvor en billigere brik kan slå den)
function isSacrifice(move, fenBefore) {
  if (move.piece === "p" || move.piece === "k") return false;
  const chess = new Chess(fenBefore);
  chess.move(move);
  const opponent = move.color === "w" ? "b" : "w";
  const attackers = chess.attackers(move.to, opponent);
  if (attackers.length === 0) return false;
  const value = PIECE_VALUES[move.piece];
  const gained = move.captured ? PIECE_VALUES[move.captured] : 0;
  const cheapest = Math.min(...attackers.map((sq) => PIECE_VALUES[chess.get(sq).type] || 9));
  const defended = chess.attackers(move.to, move.color).length > 0;
  return value - gained >= 2 && (cheapest < value || !defended);
}

// Coachens forklaring af et træk
function coachComment(info) {
  const { cls, move, bestSan, fenAfter, after, opening, replySan, replyCapture } = info;
  const san = move.san;
  const name = MOVE_CLASSES[cls].name.toLowerCase();
  const mover = move.color;
  const afterWin = info.winAfter;

  // Tekst om hvorfor et træk er dårligt
  let reason = "";
  const opponentMates = after.eval.mate !== null && after.eval.mate !== undefined && after.eval.mate !== 0 &&
    ((mover === "w" && after.eval.mate < 0) || (mover === "b" && after.eval.mate > 0));
  if (opponentMates) reason = "Now your opponent has a forced checkmate.";
  else if (info.missedMate) reason = "You had a forced checkmate!";
  else if (replyCapture) reason = `It allows ${replySan}, winning your ${PIECE_NAMES[replyCapture]}.`;
  else if (afterWin < 30) reason = "Your position is now in serious trouble.";
  else reason = "It gives your opponent a better position.";

  switch (cls) {
    case "book": return `${san} is a book move${opening ? ` in the ${opening}` : ""}.`;
    case "forced": return `${san} was the only legal move.`;
    case "brilliant": return `${san} is brilliant! A great sacrifice of your ${PIECE_NAMES[move.piece]}.`;
    case "great": return `${san} is a great move – the only move that keeps your advantage.`;
    case "best":
      if (san.includes("#")) return `${san} is checkmate! Well played.`;
      return `${san} is the best move.`;
    case "excellent": return `${san} is excellent. ${bestSan && bestSan !== san ? `${bestSan} was just slightly better.` : ""}`;
    case "good": return `${san} is good, but ${bestSan} was better.`;
    case "inaccuracy": return `${san} is an inaccuracy. ${bestSan} was the best move.`;
    case "miss": return `${san} is a miss. Your opponent just made a mistake, and ${bestSan} would have punished it.`;
    case "mistake":
    case "blunder":
      return `${san} is a ${name}. ${reason} The best move was ${bestSan}.`;
  }
  return "";
}


// ----- Skills (som på chess.com): gode træk giver "Skill Points" -----

const SKILLS = {
  checkmate: { name: "Checkmates", icon: "👑" },
  tactics: { name: "Finds Tactics", icon: "⚔️" },
  defends: { name: "Defends Pieces", icon: "🛡️" },
  castles: { name: "King Safety", icon: "🏰" },
  develops: { name: "Develops Pieces", icon: "🐴" },
  center: { name: "Controls the Center", icon: "🎯" },
  promotes: { name: "Promotes Pawns", icon: "♛" },
};
const SKILL_LEVEL_SIZE = 10; // 10 point pr. niveau

// Fortjener træk nummer i et Skill Point? Kun gode træk tæller.
function skillForMove(move, result, fenBefore, fenAfter, ply) {
  if (!result || !["brilliant", "great", "best", "excellent", "good", "book"].includes(result.cls)) return null;
  const mover = move.color;
  const other = mover === "w" ? "b" : "w";
  if (move.san.includes("#")) return "checkmate";
  const before = new Chess(fenBefore);
  const after = new Chess(fenAfter);
  // Slog en ubeskyttet brik – eller fandt det eneste gode træk
  const loose = Coach.findThreat(before, mover); // modstanderens mest værdifulde "løse" brik
  if (["brilliant", "great"].includes(result.cls)) return "tactics";
  if (move.captured && loose && loose.square === move.to && PIECE_VALUES[move.captured] >= 3) return "tactics";
  // Reddede en truet brik
  const threatBefore = Coach.findThreat(before, other);
  const threatAfter = Coach.findThreat(after, other);
  if (threatBefore && PIECE_VALUES[threatBefore.type] >= 3 &&
      (!threatAfter || PIECE_VALUES[threatAfter.type] < PIECE_VALUES[threatBefore.type])) return "defends";
  if (move.flags.includes("k") || move.flags.includes("q")) return "castles";
  if ((move.piece === "n" || move.piece === "b") && (move.from[1] === "1" || move.from[1] === "8") && ply < 24) return "develops";
  if (["d4", "e4", "d5", "e5"].includes(move.to) && ply < 20) return "center";
  if (move.promotion) return "promotes";
  return null;
}

function skillProgress(id) {
  const points = (Accounts.profile().skills || {})[id] || 0;
  return { points, level: Math.floor(points / SKILL_LEVEL_SIZE) + 1, inLevel: points % SKILL_LEVEL_SIZE };
}

function skillCardHTML(id) {
  const s = SKILLS[id];
  const p = skillProgress(id);
  return `
    <div class="skill-card">
      <span class="skill-icon">${s.icon}</span>
      <div class="skill-info">
        <div class="skill-head"><b>${s.name}</b><span>Lv ${p.level} · ${p.inLevel}/${SKILL_LEVEL_SIZE}</span></div>
        <div class="skill-bar"><div style="width:${(p.inLevel / SKILL_LEVEL_SIZE) * 100}%"></div></div>
      </div>
    </div>`;
}


// ----- 2. Review-siden -----

const Review = {
  mode: "review",     // "review" (Game Review) eller "analysis" (frit analysebræt)
  game: null,         // { white, black, result, sans, startFen }
  positions: [],      // FEN efter hvert træk
  moves: [],          // verbose træk
  analysis: [],       // analyse for hver stilling
  results: [],        // karakter og kommentar for hvert træk
  viewPly: 0,
  flipped: false,
  progress: 0,
  running: false,
  token: 0,
  showBest: false,
  liveLines: [],      // analysebrættets motorlinjer

  // Starter Game Review af et parti fra arkivet
  openGame(game) {
    this.mode = "review";
    this.retry = null;
    this.loadMoves(game.startFen || new Chess().fen(), game.sans);
    this.game = game;
    this.flipped = game.myColor === "b";
    this.viewPly = 0;
    showPage("review");
    this.runReview();
  },

  // Åbner analysebrættet (evt. med en stilling)
  // flipped = true viser brættet fra sorts side (fx efter et puzzle som sort)
  openAnalysis(startFen, sans = [], flipped = false) {
    this.mode = "analysis";
    this.retry = null;
    this.flipped = flipped;
    this.loadMoves(startFen || new Chess().fen(), sans);
    this.game = { white: { name: "White" }, black: { name: "Black" }, result: "*" };
    this.viewPly = this.moves.length;
    this.results = [];
    this.token++;
    showPage("review");
    this.analyzeLive();
  },

  loadMoves(startFen, sans) {
    this.skills = [];
    const chess = new Chess(startFen);
    this.positions = [startFen];
    this.moves = [];
    for (const san of sans) {
      const move = chess.move(san);
      this.moves.push(move);
      this.positions.push(chess.fen());
    }
    this.analysis = [];
    this.results = [];
  },

  // Analyserer hele partiet, stilling for stilling
  async runReview() {
    const token = ++this.token;
    this.running = true;
    this.progress = 0;
    this.draw();

    for (let i = 0; i < this.positions.length; i++) {
      const a = await analyzePosition(this.positions[i], { depth: 12, movetime: 400, multipv: 2 });
      if (token !== this.token) return; // afbrudt (man åbnede noget andet)
      this.analysis[i] = a;
      this.progress = Math.round(((i + 1) / this.positions.length) * 100);
      this.drawPanel();
    }

    // Giv hvert træk en karakter
    const sans = this.moves.map((m) => m.san);
    const book = openingDepth(sans);
    const opening = getOpeningName(sans);
    this.results = [];
    for (let i = 0; i < this.moves.length; i++) {
      this.results.push(this.judge(i, i < book, opening));
    }
    this.running = false;

    // Skill Points for mine træk (gives kun første gang partiet gennemgås)
    this.skills = this.moves.map((m, i) => (this.game.myColor && m.color === this.game.myColor
      ? skillForMove(m, this.results[i], this.positions[i], this.positions[i + 1], i) : null));
    if (this.game.myColor && !this.game.skillsAwarded) {
      const profile = Accounts.profile();
      profile.skills = profile.skills || {};
      this.skills.forEach((id) => { if (id) profile.skills[id] = (profile.skills[id] || 0) + 1; });
      this.game.skillsAwarded = true;
    }

    // Gem et sammendrag på partiet (til Insights og "Retry mistakes")
    if (this.game.myColor) {
      this.game.review = summarizeReview(this.moves, this.results, this.positions, this.analysis, this.game.myColor);
    }

    // Præstationer: brugte Game Review – og fandt jeg et Brilliant træk?
    const profile = Accounts.profile();
    profile.usedReview = true;
    if (this.game.myColor && this.results.some((r, i) => r.cls === "brilliant" && this.moves[i].color === this.game.myColor)) {
      profile.foundBrilliant = true;
    }
    Accounts.save();
    Achievements.check();
    this.draw();
  },

  // Bedømmer træk nummer i (0 = første træk)
  judge(i, isBook, opening) {
    const move = this.moves[i];
    const before = this.analysis[i];
    const after = this.analysis[i + 1];
    const prevClass = i > 0 && this.results[i - 1] ? this.results[i - 1].cls : null;
    const result = classifyMove({ before, after, move, fenBefore: this.positions[i], isBook, prevClass, ply: i });

    const bestSan = result.bestUci ? uciToSan(this.positions[i], result.bestUci) : "";
    // Modstanderens bedste svar – slår det en brik?
    let replySan = "";
    let replyCapture = null;
    const replyUci = after.lines[0] && after.lines[0].move;
    if (replyUci) {
      const c = new Chess(this.positions[i + 1]);
      const reply = c.move(uciToMove(replyUci));
      replySan = reply.san;
      if (reply.captured && PIECE_VALUES[reply.captured] >= 3) replyCapture = reply.captured;
    }
    // Havde man en mat, som man missede?
    const mover = move.color;
    const bm = before.eval.mate;
    const missedMate = bm !== null && bm !== undefined && bm !== 0 && ((mover === "w" && bm > 0) || (mover === "b" && bm < 0)) &&
      !(after.eval.mate !== null && after.eval.mate !== undefined && ((mover === "w" && after.eval.mate >= 0) || (mover === "b" && after.eval.mate <= 0)));

    result.comment = coachComment({ ...result, move, bestSan, after, opening, replySan, replyCapture, missedMate, fenAfter: this.positions[i + 1] });
    result.bestSan = bestSan;
    return result;
  },

  // Analysebrættet: analysér den viste stilling løbende
  async analyzeLive() {
    const token = ++this.token;
    const fen = this.positions[this.viewPly];
    this.liveLines = [];
    this.liveEval = null;
    this.drawPanel();
    const chess = new Chess(fen);
    if (chess.isGameOver()) {
      this.liveEval = chess.isCheckmate() ? { cp: null, mate: 0, matedSide: chess.turn() } : { cp: 0, mate: null };
      this.draw();
      return;
    }
    const sign = chess.turn() === "w" ? 1 : -1;
    const toWhite = (lines) => lines.map((l) => ({ ...l, eval: { cp: l.cp === null ? null : l.cp * sign, mate: l.mate === null ? null : l.mate * sign } }));
    await getEngine().analyze(fen, {
      depth: 18, movetime: 4000, multipv: 3,
      onUpdate: (lines) => {
        if (token !== this.token) return;
        this.liveLines = toWhite(lines);
        this.liveEval = this.liveLines[0].eval;
        this.drawEvalBar();
        this.drawLines();
        this.drawBestMove();
      },
    });
  },

  // Analysebrættet: tekst om hvilket træk Stockfish anbefaler i den viste stilling
  // (fx "White to move: Stockfish recommends Nf3.")
  drawBestMove() {
    const el = $("rv-best-suggestion");
    if (!el) return;
    const fen = this.positions[this.viewPly];
    const chess = new Chess(fen);
    if (chess.isGameOver() || !this.liveLines.length) { el.innerHTML = ""; return; }
    const mover = chess.turn() === "w" ? "White" : "Black";
    const bestSan = uciToSan(fen, this.liveLines[0].move);
    el.innerHTML = `<b>${mover} to move:</b> Stockfish's top recommendation is <b>${bestSan}</b>.`;
  },

  // ----- Træk på analysebrættet -----

  onMove(from, to, promotion) {
    if (this.retry) return this.retryMove(from, to, promotion);
    if (this.mode !== "analysis") return;
    const chess = new Chess(this.positions[this.viewPly]);
    const move = chess.move({ from, to, promotion });
    // Laver man et nyt træk midt i partiet, slettes resten (ny variant)
    this.positions = this.positions.slice(0, this.viewPly + 1);
    this.moves = this.moves.slice(0, this.viewPly);
    this.positions.push(chess.fen());
    this.moves.push(move);
    this.viewPly++;
    this.animate = board.lastMoveWasDrag ? null : { from: move.from, to: move.to };
    playMoveSound(move);
    this.draw();
    this.analyzeLive();
  },

  setView(ply) {
    ply = Math.max(0, Math.min(this.moves.length, ply));
    if (ply === this.viewPly) return;
    if (ply === this.viewPly + 1) this.animate = { from: this.moves[ply - 1].from, to: this.moves[ply - 1].to };
    this.viewPly = ply;
    if (ply > 0) playMoveSound(this.moves[ply - 1]);
    this.draw();
    if (this.mode === "analysis") this.analyzeLive();
  },

  // Næste vigtige øjeblik (gode fund, fejl eller et Skill Point) efter den viste stilling
  nextKeyPly() {
    for (let i = this.viewPly; i < this.results.length; i++) {
      const r = this.results[i];
      if (["brilliant", "great", "inaccuracy", "mistake", "miss", "blunder"].includes(r.cls) || this.skills[i]) return i + 1;
    }
    return null;
  },

  // ----- Tegning -----

  open() {
    this.draw();
  },

  leave() {
    this.token++;
    getEngine().stop();
  },

  draw() {
    if (currentPage !== "review") return;
    this.drawBoard();
    this.drawPlayers();
    this.drawPanel();
    this.drawEvalBar();
  },

  currentEval() {
    if (this.mode === "analysis") return this.liveEval;
    const a = this.analysis[this.viewPly];
    return a ? a.eval : null;
  },

  drawBoard() {
    if (this.retry) return this.drawRetryBoard();
    const chess = new Chess(this.positions[this.viewPly]);
    const lastMove = this.viewPly > 0 ? this.moves[this.viewPly - 1] : null;
    const result = this.viewPly > 0 ? this.results[this.viewPly - 1] : null;

    // Grøn pil med det bedste træk (fra stillingen før det viste træk)
    let hint = null;
    if (this.mode === "review" && this.showBest && result && result.bestUci && !["best", "brilliant", "great", "book", "forced"].includes(result.cls)) {
      hint = uciToMove(result.bestUci);
    }
    if (this.mode === "analysis" && this.showBest && this.liveLines[0]) hint = uciToMove(this.liveLines[0].move);
    board.hint = hint;

    board.draw({
      chess,
      flipped: this.flipped,
      lastMove,
      interactive: this.mode === "analysis",
      movableColor: chess.turn(),
      animate: this.animate,
      badge: result && lastMove ? { square: lastMove.to, cls: result.cls, symbol: MOVE_CLASSES[result.cls].symbol } : null,
    });
    this.animate = null;
  },

  drawPlayers() {
    const g = this.game;
    const bar = (color) => {
      const p = color === "w" ? g.white : g.black;
      const avatar = p.bot ? `<div class="avatar avatar-bot" style="background:${p.bot.color}">${p.bot.avatar}</div>` : userAvatarHTML(p.name, p.color);
      // Slåede brikker og materiale i den viste stilling (som på chess.com)
      const m = materialParts(new Chess(this.positions[this.viewPly]), color);
      return `<div class="player-left">${avatar}<div class="player-meta"><div class="player-name-row"><span class="player-name">${escapeHTML(p.name)}</span>${p.rating ? `<span class="player-rating">(${p.rating})</span>` : ""}</div><div class="captured">${m.groups}${m.diffHTML}</div></div></div>`;
    };
    els.playerTop.innerHTML = bar(this.flipped ? "w" : "b");
    els.playerBottom.innerHTML = bar(this.flipped ? "b" : "w");
  },

  // Bjælken ved siden af brættet: hvid del = hvids fordel
  drawEvalBar() {
    renderEvalBar(this.currentEval(), this.flipped);
  },

  // Motorens bedste linjer (kun analysebrættet)
  drawLines() {
    const el = $("rv-lines");
    if (!el) return;
    const fen = this.positions[this.viewPly];
    el.innerHTML = this.liveLines.map((l) => `
      <div class="rv-line">
        <span class="rv-line-eval ${winPercent(l.eval) >= 50 ? "white" : "black"}">${formatEval(l.eval)}</span>
        <span class="rv-line-moves">${pvToSan(fen, l.pv)}</span>
      </div>`).join("") || `<div class="rv-muted">Thinking…</div>`;
  },

  // Graf over vurderingen gennem hele partiet
  graphHTML() {
    if (this.running || this.analysis.length < 2) return "";
    const n = this.analysis.length - 1;
    const pts = this.analysis.map((a, i) => {
      const x = n === 0 ? 0 : (i / n) * 100;
      const y = 100 - positionWin(a);
      return [x, y];
    });
    const area = `0,100 ${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")} 100,100`;
    // Røde/orange prikker ved fejl
    const dots = this.results.map((r, i) => {
      if (!["blunder", "mistake", "miss", "brilliant", "great"].includes(r.cls)) return "";
      const [x, y] = pts[i + 1];
      return `<circle cx="${x}" cy="${y}" r="1.6" class="graph-dot cls-${r.cls}"/>`;
    }).join("");
    const cursorX = n === 0 ? 0 : (this.viewPly / n) * 100;
    return `
      <svg class="rv-graph" id="rv-graph" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="0" y="0" width="100" height="100" class="graph-bg"/>
        <polygon points="${area}" class="graph-area"/>
        <line x1="0" y1="50" x2="100" y2="50" class="graph-mid"/>
        <line x1="${cursorX}" y1="0" x2="${cursorX}" y2="100" class="graph-cursor"/>
        ${dots}
      </svg>`;
  },

  drawPanel() {
    if (currentPage !== "review") return;
    const panel = $("rv-content");
    if (this.retry) {
      panel.innerHTML = this.retryHTML();
      return;
    }
    if (this.mode === "analysis") {
      panel.innerHTML = this.analysisHTML();
      this.drawLines();
      this.drawBestMove();
      Explorer.show(this.positions[this.viewPly]); // åbningsbiblioteket for den viste stilling
      return;
    }
    panel.innerHTML = this.reviewHTML();
    const current = panel.querySelector(".rv-move.current");
    if (current) current.scrollIntoView({ block: "nearest" });
  },

  reviewHTML() {
    const g = this.game;
    if (this.running) {
      return `
        <div class="rv-coach">
          <div class="rv-coach-avatar">🦉</div>
          <div class="rv-bubble">Let me take a look at your game…</div>
        </div>
        <div class="rv-progress"><div class="rv-progress-fill" style="width:${this.progress}%"></div></div>
        <div class="rv-muted rv-center">Analyzing… ${this.progress}%</div>`;
    }

    // Præcision og antal af hver karakter for begge spillere
    const acc = { w: [], b: [] };
    const counts = { w: {}, b: {} };
    this.results.forEach((r, i) => {
      const color = this.moves[i].color;
      acc[color].push(r.accuracy);
      counts[color][r.cls] = (counts[color][r.cls] || 0) + 1;
    });
    const avg = (list) => (list.length ? (list.reduce((a, b) => a + b, 0) / list.length).toFixed(1) : "–");

    // Coachens kommentar til det viste træk
    let comment;
    const res = this.viewPly > 0 ? this.results[this.viewPly - 1] : null;
    if (!res) {
      const opening = getOpeningName(this.moves.map((m) => m.san));
      comment = `Let's review this game! White played with ${avg(acc.w)}% accuracy and Black with ${avg(acc.b)}%.` +
        (opening ? ` The opening was the ${opening}.` : "") + " Use the arrows to go through the moves.";
    } else {
      comment = res.comment;
    }

    const rows = CLASS_TABLE_ORDER.map((cls) => `
      <div class="rv-row">
        <span class="rv-count">${counts.w[cls] || 0}</span>
        <span class="rv-cls"><span class="cls-icon cls-${cls}">${MOVE_CLASSES[cls].symbol}</span>${MOVE_CLASSES[cls].name}</span>
        <span class="rv-count">${counts.b[cls] || 0}</span>
      </div>`).join("");

    // Træklisten med små karakter-ikoner
    let moveRows = "";
    for (let i = 0; i < this.moves.length; i += 2) {
      const cell = (j) => {
        const m = this.moves[j];
        if (!m) return "<span></span>";
        const r = this.results[j];
        const icon = r && !["best", "excellent", "good", "book", "forced"].includes(r.cls)
          ? `<span class="cls-icon small cls-${r.cls}">${MOVE_CLASSES[r.cls].symbol}</span>` : "";
        const star = this.skills[j] ? '<span class="rv-skill-star" title="Skill Point">★</span>' : "";
        return `<span class="rv-move ${j + 1 === this.viewPly ? "current" : ""}" data-rv-ply="${j + 1}">${star}${m.san}${icon}</span>`;
      };
      moveRows += `<div class="move-row"><span class="move-number">${i / 2 + 1}.</span>${cell(i)}${cell(i + 1)}</div>`;
    }

    const clsHeader = res ? `<span class="cls-icon cls-${res.cls}">${MOVE_CLASSES[res.cls].symbol}</span><b class="cls-text-${res.cls}">${MOVE_CLASSES[res.cls].name}</b>` : "";
    // Vurderingen efter trækket (fx +1.3) i hjørnet af boblen
    const evAfter = res && this.analysis[this.viewPly] ? formatEval(this.analysis[this.viewPly].eval) : "";
    const skill = this.viewPly > 0 ? this.skills[this.viewPly - 1] : null;
    const skillHTML = skill ? `
      <div class="rv-skill"><span class="cls-icon small cls-great">★</span><b>${escapeHTML(this.moves[this.viewPly - 1].san)} earns a Skill Point</b></div>
      ${skillCardHTML(skill)}` : "";
    const nextKey = this.nextKeyPly();
    const myPoints = this.skills.filter(Boolean);
    const skillSummary = myPoints.length ? `
      <div class="rv-section-title">Skills this game (+${myPoints.length})</div>
      <div class="skill-list">${[...new Set(myPoints)].map((id) => skillCardHTML(id)).join("")}</div>` : "";

    return `
      <div class="rv-coach">
        <div class="rv-coach-avatar">🦉</div>
        <div class="rv-bubble">${clsHeader || evAfter ? `<div class="rv-bubble-head">${clsHeader}${evAfter ? `<span class="rv-eval-chip">${evAfter}</span>` : ""}</div>` : ""}${comment}${skillHTML}</div>
      </div>
      <button class="btn btn-green rv-next-key" data-rv="next-key" ${nextKey ? "" : "disabled"}>
        ${this.viewPly === 0 ? "Start Review" : nextKey ? "Next" : "Review complete"}<svg class="btn-icon"><use href="#i-next"/></svg>
      </button>
      ${this.graphHTML()}
      <div class="rv-players">
        <div><span class="rv-pname">${g.white.name}</span><span class="rv-acc white">${avg(acc.w)}</span></div>
        <span class="rv-acc-label">Accuracy</span>
        <div><span class="rv-acc black">${avg(acc.b)}</span><span class="rv-pname">${g.black.name}</span></div>
      </div>
      ${perfEstimateHTML(g, acc)}
      <div class="rv-table">${rows}</div>
      <div class="rv-moves">${moveRows}</div>
      ${skillSummary}
      <div class="rv-controls">
        <button class="btn btn-gray btn-small" data-rv="best">${this.showBest ? "Hide best move" : "Show best move"}</button>
        <button class="btn btn-gray btn-small" data-rv="analysis">Analysis board</button>
        <button class="btn btn-gray btn-small" data-rv="pgn">Download PGN</button>
      </div>
      ${g.review && g.review.mistakes.length ? `
        <button class="btn btn-green rv-retry-btn" data-rv="retry">
          <svg class="btn-icon"><use href="#i-takeback"/></svg>Retry mistakes (${g.review.mistakes.length})
        </button>` : ""}
      ${this.navHTML()}`;
  },

  analysisHTML() {
    let moveRows = "";
    for (let i = 0; i < this.moves.length; i += 2) {
      const cell = (j) => this.moves[j]
        ? `<span class="rv-move ${j + 1 === this.viewPly ? "current" : ""}" data-rv-ply="${j + 1}">${this.moves[j].san}</span>` : "<span></span>";
      moveRows += `<div class="move-row"><span class="move-number">${i / 2 + 1}.</span>${cell(i)}${cell(i + 1)}</div>`;
    }
    const opening = getOpeningName(this.moves.slice(0, this.viewPly).map((m) => m.san));
    return `
      <div class="rv-section-title">Stockfish ${ENGINE_MODERN ? 19 : 10} · depth 18</div>
      <div class="rv-best-suggestion" id="rv-best-suggestion"></div>
      <div class="rv-lines" id="rv-lines"></div>
      <div class="opening"><svg><use href="#i-book"/></svg><span>${this.viewPly === 0 ? "Starting Position" : opening || "Uncommon Opening"}</span></div>
      <div class="rv-moves">${moveRows || '<div class="rv-muted rv-center">Make a move on the board for either side.</div>'}</div>
      <div class="rv-explorer" id="rv-explorer"></div>
      <div class="rv-controls">
        <button class="btn btn-gray btn-small" data-rv="best">${this.showBest ? "Hide arrow" : "Show best move"}</button>
        <button class="btn btn-gray btn-small" data-rv="reset">Reset</button>
        <button class="btn btn-green btn-small" data-rv="review" ${this.moves.length ? "" : "disabled"}>Game Review</button>
      </div>
      <div class="rv-controls">
        <button class="btn btn-gray btn-small" data-rv="play-bot">Play vs Bot from here</button>
        <button class="btn btn-gray btn-small" data-rv="play-pass">Pass and Play from here</button>
        <button class="btn btn-gray btn-small" data-rv="copy-fen">Copy FEN</button>
        <button class="btn btn-gray btn-small" data-rv="pgn" ${this.moves.length ? "" : "disabled"}>Download PGN</button>
      </div>
      <div class="rv-load">
        <input type="text" id="rv-fen" placeholder="Paste a FEN or PGN and press Load">
        <button class="btn btn-gray btn-small" data-rv="load">Load</button>
      </div>
      ${this.navHTML()}`;
  },

  navHTML() {
    const last = this.moves.length;
    return `
      <div class="pz-nav rv-nav">
        <button class="nav-btn" data-rv="first" ${this.viewPly === 0 ? "disabled" : ""}><svg><use href="#i-first"/></svg></button>
        <button class="nav-btn" data-rv="prev" ${this.viewPly === 0 ? "disabled" : ""}><svg><use href="#i-prev"/></svg></button>
        <button class="nav-btn" data-rv="next" ${this.viewPly === last ? "disabled" : ""}><svg><use href="#i-next"/></svg></button>
        <button class="nav-btn" data-rv="last" ${this.viewPly === last ? "disabled" : ""}><svg><use href="#i-last"/></svg></button>
        <button class="nav-btn" data-rv="flip"><svg><use href="#i-flip"/></svg></button>
      </div>`;
  },

  // Indlæser en FEN eller PGN, som brugeren har indsat
  loadInput(text) {
    text = text.trim();
    if (!text) return;
    try {
      const chess = new Chess(text); // er det en FEN?
      this.openAnalysis(chess.fen());
      return;
    } catch (error) { /* ikke en FEN – prøv PGN */ }
    try {
      const chess = new Chess();
      chess.loadPgn(text);
      const header = chess.header();
      this.openAnalysis(header.FEN || new Chess().fen(), chess.history());
    } catch (error) {
      showToast("That is not a valid FEN or PGN");
    }
  },

  // ----- Retry mistakes (ligesom chess.com) -----
  // Man får stillingerne, hvor man lavede en fejl, og skal finde et bedre træk.

  startRetry() {
    const list = this.game.review ? this.game.review.mistakes : [];
    if (!list.length) return;
    this.retry = { list, idx: 0, found: 0, status: "play", hint: false, shownFen: null, lastMove: null };
    this.draw();
  },

  // Den fejl man er ved lige nu
  retryItem() {
    return this.retry.list[this.retry.idx];
  },

  retryMove(from, to, promotion) {
    const r = this.retry;
    if (r.status !== "play") return;
    const item = this.retryItem();
    const chess = new Chess(item.fen);
    const move = chess.move({ from, to, promotion });
    const uci = from + to + (promotion || "");
    r.shownFen = chess.fen();
    r.lastMove = move;
    playMoveSound(move);

    // Rigtigt: det bedste træk, et næsten lige så godt træk, eller skakmat
    if (uci === item.best || uci === item.alt || chess.isCheckmate()) {
      r.status = "solved";
      r.found++;
      playSound("start");
      this.draw();
      return;
    }

    // Forkert: vis trækket kort, og tag det så tilbage
    r.status = "wrong";
    this.draw();
    setTimeout(() => {
      if (this.retry !== r || r.status !== "wrong") return;
      r.status = "play";
      r.shownFen = null;
      r.lastMove = null;
      this.draw();
    }, 700);
  },

  // Vis det rigtige træk
  retryShow() {
    const r = this.retry;
    const item = this.retryItem();
    const chess = new Chess(item.fen);
    r.lastMove = chess.move(uciToMove(item.best));
    r.shownFen = chess.fen();
    r.status = "shown";
    this.animate = { from: r.lastMove.from, to: r.lastMove.to };
    playMoveSound(r.lastMove);
    this.draw();
  },

  retryNext() {
    const r = this.retry;
    r.idx++;
    r.status = r.idx >= r.list.length ? "finished" : "play";
    r.hint = false;
    r.shownFen = null;
    r.lastMove = null;
    this.draw();
  },

  drawRetryBoard() {
    const r = this.retry;
    if (r.status === "finished") r.idx = Math.min(r.idx, r.list.length - 1);
    const item = this.retryItem();
    const chess = new Chess(r.shownFen || item.fen);
    const mover = new Chess(item.fen).turn();
    board.hint = null;
    board.draw({
      chess,
      flipped: mover === "b",
      lastMove: r.lastMove,
      interactive: r.status === "play",
      movableColor: mover,
      animate: this.animate,
    });
    this.animate = null;
  },

  retryHTML() {
    const r = this.retry;
    const total = r.list.length;
    const back = `<button class="btn btn-gray btn-small" data-rv="retry-exit">Back to Game Review</button>`;

    if (r.status === "finished") {
      return `
        <div class="rv-coach">
          <div class="rv-coach-avatar">🦉</div>
          <div class="rv-bubble"><div class="rv-bubble-head"><b>All done!</b></div>
            You found the better move in <b>${r.found} of ${total}</b> positions. ${r.found === total ? "Perfect! 🎉" : "Keep practicing – you'll spot them in your games next time."}</div>
        </div>
        <div class="rv-controls">
          <button class="btn btn-green btn-small" data-rv="retry-again">Try again</button>
          ${back}
        </div>`;
    }

    const item = this.retryItem();
    const color = new Chess(item.fen).turn() === "w" ? "White" : "Black";
    const name = MOVE_CLASSES[item.cls].name.toLowerCase();
    const bestSan = uciToSan(item.fen, item.best);
    // Hint: hvilken brik skal flyttes?
    const piece = new Chess(item.fen).get(item.best.slice(0, 2));
    const hint = r.hint && piece ? `<div class="rv-retry-hint">💡 Hint: move your <b>${PIECE_NAMES[piece.type]}</b>.</div>` : "";

    let text, actions;
    if (r.status === "solved") {
      text = `<div class="rv-bubble-head"><span class="cls-icon cls-best">★</span><b class="cls-text-best">Correct!</b></div>${r.lastMove.san} is a much better move.`;
      actions = `<button class="btn btn-green btn-small" data-rv="retry-next">${r.idx + 1 < total ? "Next mistake" : "Finish"}</button>`;
    } else if (r.status === "shown") {
      text = `The best move was <b>${bestSan}</b>.`;
      actions = `<button class="btn btn-green btn-small" data-rv="retry-next">${r.idx + 1 < total ? "Next mistake" : "Finish"}</button>`;
    } else if (r.status === "wrong") {
      text = `<div class="rv-bubble-head"><span class="cls-icon cls-mistake">?</span><b class="cls-text-mistake">Not quite</b></div>Try another move.`;
      actions = "";
    } else {
      text = `In the game you played <b>${item.played}</b>, which was a ${name}. Find a better move for ${color}!`;
      actions = `
        <button class="btn btn-gray btn-small" data-rv="retry-hint" ${r.hint ? "disabled" : ""}>Hint</button>
        <button class="btn btn-gray btn-small" data-rv="retry-show">Show solution</button>
        <button class="btn btn-gray btn-small" data-rv="retry-next">Skip</button>`;
    }

    return `
      <div class="rv-retry-top">
        <b>Retry mistakes</b>
        <span class="rv-muted">${r.idx + 1} / ${total}</span>
      </div>
      <div class="rv-progress"><div class="rv-progress-fill" style="width:${(r.idx / total) * 100}%"></div></div>
      <div class="rv-coach">
        <div class="rv-coach-avatar">🦉</div>
        <div class="rv-bubble">${text}</div>
      </div>
      ${hint}
      <div class="rv-controls">${actions}</div>
      <div class="rv-controls">${back}</div>`;
  },

  handleClick(e) {
    const plyEl = e.target.closest("[data-rv-ply]");
    if (plyEl) return this.setView(Number(plyEl.dataset.rvPly));
    const graph = e.target.closest("#rv-graph");
    if (graph) {
      const rect = graph.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      return this.setView(Math.round(ratio * this.moves.length));
    }
    const btn = e.target.closest("[data-rv]");
    if (!btn) return;
    switch (btn.dataset.rv) {
      case "first": this.setView(0); break;
      case "prev": this.setView(this.viewPly - 1); break;
      case "next": this.setView(this.viewPly + 1); break;
      case "next-key": { const k = this.nextKeyPly(); if (k) this.setView(k); break; }
      case "last": this.setView(this.moves.length); break;
      case "flip": this.flipped = !this.flipped; this.draw(); break;
      case "best": this.showBest = !this.showBest; this.draw(); break;
      case "retry": this.startRetry(); break;
      case "retry-hint": this.retry.hint = true; this.drawPanel(); break;
      case "retry-show": this.retryShow(); break;
      case "retry-next": this.retryNext(); break;
      case "retry-again": this.startRetry(); break;
      case "retry-exit": this.retry = null; this.draw(); break;
      case "analysis": this.openAnalysis(this.positions[0], this.moves.map((m) => m.san), this.flipped); break;
      case "reset": this.openAnalysis(undefined, [], this.flipped); break;
      case "load": this.loadInput($("rv-fen").value); break;
      case "pgn": {
        const g = this.game || {};
        downloadGamePGN({ ...g, white: g.white, black: g.black, result: g.result || "*", sans: this.moves.map((m) => m.san), startFen: this.positions[0] });
        break;
      }
      case "copy-fen": {
        const fen = this.positions[this.viewPly];
        if (navigator.clipboard) navigator.clipboard.writeText(fen).then(() => showToast("FEN copied"), () => showToast(fen));
        else showToast(fen);
        break;
      }
      case "play-bot": {
        const fen = this.positions[this.viewPly];
        if (new Chess(fen).isGameOver()) return showToast("That position is already finished");
        setStartPosition(fen);
        showPage("play");
        switchTab("bots");
        showToast("Pick a bot – the game starts from your position");
        break;
      }
      case "play-pass": {
        const fen = this.positions[this.viewPly];
        if (new Chess(fen).isGameOver()) return showToast("That position is already finished");
        showPage("play");
        startNewGame({ mode: "pass", timeControl: NO_TIMER, startFen: fen });
        switchTab("play");
        break;
      }
      case "review":
        this.openGame({ white: { name: "White" }, black: { name: "Black" }, result: "*", sans: this.moves.map((m) => m.san), startFen: this.positions[0] });
        break;
    }
  },
};

Pages.review = Review;
$("review-panel").addEventListener("click", (e) => Review.handleClick(e));
$("review-panel").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "rv-fen") Review.loadInput(e.target.value);
});


// Tegner evalueringsbjælken (bruges af Game Review, analysebrættet og bot-partier)
function renderEvalBar(ev, flipped) {
  let white = 50;
  let text = "";
  if (ev) {
    white = ev.matedSide ? (ev.matedSide === "w" ? 0 : 100) : winPercent(ev);
    text = ev.matedSide ? "#" : formatEval(ev);
  }
  $("eval-bar").classList.toggle("flipped", !!flipped);
  $("eval-fill").style.height = white + "%";
  $("eval-text").textContent = text;
  $("eval-text").classList.toggle("dark", white >= 50);
}

// ----- 3. Coach i bot-partier -----

// Efter mennesket har trukket: vurder trækket og lad coachen sige noget.
async function coachMove(move, fenBefore, fenAfter) {
  const before = await analyzePosition(fenBefore, { depth: 10, movetime: 300, multipv: 2 });
  if (!before) return;
  const after = await analyzePosition(fenAfter, { depth: 10, movetime: 300, multipv: 1 });
  if (!after) return;
  const sans = state.game.history();
  const isBook = sans.length <= openingDepth(sans);
  const result = classifyMove({ before, after, move, fenBefore, isBook, prevClass: null, ply: sans.length - 1 });
  const bestSan = result.bestUci ? uciToSan(fenBefore, result.bestUci) : "";
  let text;
  switch (result.cls) {
    case "brilliant": text = `Brilliant! ${move.san} is a fantastic sacrifice.`; break;
    case "great": text = `Great move! ${move.san} was the only good move.`; break;
    case "best": text = `${move.san} is the best move. Nice!`; break;
    case "excellent": text = `Excellent move.`; break;
    case "good": text = `Good move. ${bestSan} was a little better.`; break;
    case "book": text = `${move.san} is a book move. Good start!`; break;
    case "forced": text = `That was the only move.`; break;
    case "inaccuracy": text = `Hmm, an inaccuracy. ${bestSan} was better.`; break;
    case "mistake": text = `That's a mistake. ${bestSan} was the move. You can use Takeback to try again.`; break;
    case "miss": text = `You missed something! ${bestSan} would have won material.`; break;
    case "blunder": text = `Oh no, a blunder! ${bestSan} was much better. Try Takeback!`; break;
  }
  state.coachSpeech = { text, cls: result.cls };
  addLog(`<b>Coach:</b> ${text}`);
  if (state.coachGame) Coach.judged(result.cls, text);
  drawPlayers();
}