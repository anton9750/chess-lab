// ===================================================================
// bots.js – computer-modstanderne.
// Hver bot har et navn, en rating, en personlighed og indstillinger
// for hvor stærkt den spiller ("engine"):
//
//  { elo: 1500 }  – Stockfish spiller selv på den rating (UCI_Elo).
//                   Stockfish er officielt kalibreret fra 1320 til 3190.
//
//  { random, temp, depth } – "menneskelig" model til de svage bots (under 1320):
//     random – chance (0–1) for et helt tilfældigt træk (en "brøler")
//     depth  – hvor dybt motoren kigger efter gode træk
//     temp   – hvor tilfældigt den vælger mellem de gode træk. Højt tal =
//              vælger tit et dårligere træk, lavt tal = næsten altid det bedste.
//     captureBias – (valgfri) chance for at slå en brik, når den laver et tilfældigt træk
//
// Ratingerne er målt ved at lade bots spille mange partier mod hinanden og mod
// Stockfish' kalibrerede niveauer (se CALIBRATION.md).
// ===================================================================

const BOT_GROUPS = [
  { name: "Beginner", bots: [
    { id: "pip", name: "Pip", avatar: "🐣", color: "#f5c542", rating: 250,
      intro: "Hi! I just learned how the horsey moves!",
      engine: { random: 1, captureBias: 0 },
      lines: { start: "Yay, a game! Be nice to me!", win: "I WON?! I have to tell my mom!", lose: "Good game! You're really good!", draw: "A draw? Is that good?" } },
    { id: "shelly", name: "Shelly", avatar: "🐢", color: "#6fbf73", rating: 400,
      intro: "I like to take things slow and steady.",
      engine: { random: 0.9, temp: 30, depth: 1, captureBias: 0.3 },
      lines: { start: "Slow and steady wins the race...", win: "See? Slow and steady!", lose: "Well played. I'll get you next time.", draw: "Nobody wins. That's okay too." } },
    { id: "benny", name: "Benny", avatar: "🐶", color: "#c98b5a", rating: 600,
      intro: "Woof! Let's play! I love chasing pieces around.",
      engine: { random: 0.6, temp: 22, depth: 1 },
      lines: { start: "Woof woof! Let's go!", win: "Woof! Who's a good boy? Me!", lose: "*sad puppy noises* Good game!", draw: "Woof? A draw?" } },
  ] },
  { name: "Intermediate", bots: [
    { id: "rusty", name: "Rusty", avatar: "🦊", color: "#e8803a", rating: 900,
      intro: "I know a few tricks. Better watch your queen!",
      engine: { random: 0.2, temp: 12, depth: 2 },
      lines: { start: "Let's see if you fall for my tricks.", win: "Tricked you! Hehe.", lose: "Hmph. You saw through my tricks.", draw: "A draw. Clever of you." } },
    { id: "bruno", name: "Bruno", avatar: "🐻", color: "#8a5a3b", rating: 1200,
      intro: "Big and solid. I don't give away pieces easily.",
      engine: { random: 0.08, temp: 7.5, depth: 5 },
      lines: { start: "Let's have a solid game.", win: "Solid as a rock. Good game.", lose: "You broke through my defense. Impressive!", draw: "A fair result." } },
    { id: "olive", name: "Olive", avatar: "🦉", color: "#7d8fa6", rating: 1500,
      intro: "I've read a few chess books. Have you?",
      engine: { elo: 1500 },
      lines: { start: "Page one: control the center.", win: "Just like in the book.", lose: "That wasn't in any of my books!", draw: "A theoretical draw, I'd say." } },
  ] },
  { name: "Advanced", bots: [
    { id: "luna", name: "Luna", avatar: "🐺", color: "#5b6b9a", rating: 1800,
      intro: "Every move has a purpose. Every mistake has a price.",
      engine: { elo: 1800 },
      lines: { start: "The hunt begins.", win: "The pack always wins.", lose: "You hunted well tonight.", draw: "We are equals... for now." } },
    { id: "kestrel", name: "Kestrel", avatar: "🦅", color: "#9a6b3a", rating: 2100,
      intro: "I see the whole board from up here.",
      engine: { elo: 2100 },
      lines: { start: "I'm watching every square.", win: "Nothing escapes my eyes.", lose: "I didn't see that coming. Well done!", draw: "A sharp game. A fair draw." } },
  ] },
  { name: "Master", bots: [
    { id: "drake", name: "Drake", avatar: "🐉", color: "#b33a3a", rating: 2500,
      intro: "Few have survived a game against me.",
      engine: { elo: 2500 },
      lines: { start: "Prepare yourself.", win: "Another challenger falls.", lose: "Impossible... You have defeated a dragon!", draw: "You survived. That is rare." } },
    { id: "max", name: "Max", avatar: "🤖", color: "#4a90a4", rating: 3000,
      intro: "MAXIMUM STRENGTH. NO MERCY. BEEP BOOP.",
      engine: { elo: 3000 },
      lines: { start: "CALCULATING YOUR DEFEAT...", win: "VICTORY. AS CALCULATED.", lose: "ERROR. ERROR. HUMAN HAS WON?!", draw: "RESULT: DRAW. RECALIBRATING..." } },
  ] },
];

// Alle bots i én liste (nemmere at søge i).
const ALL_BOTS = BOT_GROUPS.flatMap((group) => group.bots);

function findBot(id) {
  return ALL_BOTS.find((bot) => bot.id === id);
}

// Fælles replikker, som alle bots kan sige under partiet.
const BOT_CHAT = {
  check: ["Check!", "Check! Watch your king.", "Your king looks nervous."],
  tookQueen: ["Thanks for the queen!", "I'll take that queen, thank you!", "Yum, a queen!"],
  lostQueen: ["Oh no, my queen!", "Noooo, not my queen!", "I needed that queen..."],
  tookRook: ["A rook for me!", "That rook is mine now."],
  thinkingHard: ["Hmm, let me think...", "Interesting move..."],
  drawDeclined: ["No thanks, I want to keep playing.", "A draw? No way!"],
  drawAccepted: ["Okay, let's call it a draw.", "Fine, a draw it is."],
};

// Vælger en tilfældig replik fra en liste.
function randomLine(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Vælger bottens træk. Bruges både i rigtige partier og når bots testes mod hinanden.
// Returnerer { from, to, promotion } – eller null, hvis søgningen blev afbrudt.
async function chooseBotMove(chess, config) {
  const fen = chess.fen();
  // Stockfish til almindelig skak, Fairy-Stockfish til varianter (null = ingen motor → indbygget)
  const engine = await engineFor(chess);
  if (!engine) return simpleVariantMove(chess, config);

  // Stærke bots: motoren spiller selv på den ønskede rating
  if (config.elo) {
    const result = await engine.search(fen, { elo: config.elo, movetime: config.movetime || 700 });
    return result ? uciToMove(result.best) : null;
  }

  // Svage bots: nogle gange et helt tilfældigt træk ...
  if (Math.random() < config.random) return randomBotMove(chess, config.captureBias);

  // ... ellers vælges blandt motorens bedste træk. Jo dårligere et træk er
  // (målt i vinderchance), jo mindre sandsynligt er det, at botten vælger det.
  const result = await engine.analyze(fen, { depth: config.depth, movetime: null, multipv: 8 });
  if (!result || !result.lines.length) return result ? randomBotMove(chess) : null;
  const wins = result.lines.map((l) => winPercent({ cp: l.cp, mate: l.mate }));
  const best = Math.max(...wins);
  const weights = wins.map((w) => Math.exp(-(best - w) / config.temp));
  let pick = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return uciToMove(result.lines[i].move);
  }
  return uciToMove(result.lines[0].move);
}

// ----- Indbygget lille motor til varianter -----
// Bruges kun, hvis Fairy-Stockfish ikke kan køre (fx når siden åbnes fra mappen).
// Den kigger 2 halvtræk frem og tæller materiale – svag, men den spiller efter reglerne.

const SIMPLE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function simpleEvaluate(game, color) {
  const end = game.pos.isEnd();
  if (end) {
    const outcome = game.pos.outcome();
    if (!outcome || !outcome.winner) return 0;
    return (outcome.winner === "white") === (color === "w") ? 1000 : -1000;
  }
  let score = 0;
  game.board().forEach((row) => row.forEach((p) => {
    if (!p) return;
    const v = SIMPLE_VALUES[p.type] + (p.type === "k" && game.variant.id === "kingofthehill" ? 4 - distanceToCenter(p.square) : 0);
    score += p.color === color ? v : -v;
  }));
  if (game.variant.id === "antichess") score = -score;            // færre brikker er godt
  if (game.variant.id === "racingkings") {                          // kongen skal frem
    game.board().forEach((row) => row.forEach((p) => {
      if (p && p.type === "k") score += (p.color === color ? 1 : -1) * Number(p.square[1]) * 0.6;
    }));
  }
  return score;
}

function distanceToCenter(square) {
  const f = "abcdefgh".indexOf(square[0]);
  const r = Number(square[1]) - 1;
  return Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5)) - 0.5;
}

function allMoves(game) {
  const moves = game.moves({ verbose: true });
  const pockets = game.pockets && game.pockets();
  if (pockets) {
    const mine = pockets[game.turn()];
    for (const letter of Object.keys(mine)) {
      if (mine[letter] > 0) game.dropSquares(letter).slice(0, 12).forEach((to) => moves.push({ drop: letter, to }));
    }
  }
  return moves;
}

function simpleSearch(game, depth, color) {
  if (depth === 0 || game.pos.isEnd()) return simpleEvaluate(game, color);
  const mine = game.turn() === color;
  let best = mine ? -Infinity : Infinity;
  for (const m of allMoves(game)) {
    game.move(m.drop ? { drop: m.drop, to: m.to } : { from: m.from, to: m.to, promotion: m.promotion });
    const v = simpleSearch(game, depth - 1, color);
    game.undo();
    best = mine ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}

async function simpleVariantMove(chess, config) {
  await sleep(50);
  if (config.random && Math.random() < config.random) return randomBotMove(chess, config.captureBias);
  const game = new VariantGame(chess.fen(), chess.variant.id);
  const color = game.turn();
  const noise = config.elo ? Math.max(0, (2000 - config.elo) / 600) : (config.temp || 10) / 10;
  let best = null;
  let bestScore = -Infinity;
  for (const m of allMoves(game)) {
    const move = m.drop ? { drop: m.drop, to: m.to } : { from: m.from, to: m.to, promotion: m.promotion };
    game.move(move);
    const score = simpleSearch(game, 1, color) + Math.random() * noise;
    game.undo();
    if (score > bestScore) { bestScore = score; best = move; }
  }
  return best;
}

// Laver et tilfældigt (men lovligt) træk.
// captureBias = chance for at foretrække at slå en brik, hvis man kan (standard 0.5).
function randomBotMove(chess, captureBias = 0.5) {
  const moves = chess.moves({ verbose: true });
  const captures = moves.filter((m) => m.captured);
  const pool = captures.length && Math.random() < captureBias ? captures : moves;
  const move = pool[Math.floor(Math.random() * pool.length)];
  return { from: move.from, to: move.to, promotion: move.promotion ? "q" : undefined };
}