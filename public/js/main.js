// ===================================================================
// main.js – styrer selve partiet og alt i panelet.
// Her samles brættet (board.js), uret (clock.js), lydene (sounds.js),
// motoren (engine.js), bots (bots.js) og reglerne (chess.js).
// ===================================================================

// ----- 1. Konstanter -----

// Tidskontrol: base = minutter i sekunder, inc = ekstra sekunder pr. træk.
const TIME_CONTROLS = [
  { category: "Bullet", icon: "i-bullet", items: [
    { label: "1 min", base: 60, inc: 0 },
    { label: "1 | 1", base: 60, inc: 1 },
    { label: "2 | 1", base: 120, inc: 1 },
  ] },
  { category: "Blitz", icon: "i-bolt", items: [
    { label: "3 min", base: 180, inc: 0 },
    { label: "3 | 2", base: 180, inc: 2 },
    { label: "5 min", base: 300, inc: 0 },
  ] },
  { category: "Rapid", icon: "i-clock", items: [
    { label: "10 min", base: 600, inc: 0 },
    { label: "15 | 10", base: 900, inc: 10 },
    { label: "30 min", base: 1800, inc: 0 },
  ] },
  { category: "Unlimited", icon: "i-infinity", items: [
    { label: "No timer", base: null, inc: 0 },
  ] },
];
const NO_TIMER = TIME_CONTROLS[3].items[0];

// Spilletyper i "New Game"-fanen.
const GAME_MODES = [
  { id: "online", name: "Play Online", desc: "Rated game vs a player with the same time", icon: "i-pawn", ready: true },
  { id: "pass", name: "Pass and Play", desc: "Play against a friend on this device", icon: "i-swap", ready: true },
  { id: "coach", name: "Play Coach", desc: "Learn while you play – the coach explains every move", icon: "i-learn", ready: true },
  { id: "bots", name: "Play Bots", desc: "Challenge a computer opponent", icon: "i-robot", ready: true },
  { id: "friend", name: "Play a Friend", desc: "Invite a friend to play online", icon: "i-friend", ready: true },
];

// Brikkernes værdi i point (bruges til "+3" ved de slåede brikker).
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const COLOR_NAMES = { w: "White", b: "Black" };


// ----- 2. Spillets tilstand -----

const state = {
  game: new Chess(),        // selve partiet (reglerne)
  positions: [],            // stillingen (FEN) efter hvert træk – til at bladre tilbage
  premoves: [],             // mine premoves i kø (kan være mange)
  viewPly: null,            // null = vis live-stillingen, ellers nummeret på det træk vi kigger på
  flipped: false,           // sort nederst?
  timeControl: TIME_CONTROLS[2].items[0],        // tiden i det nuværende parti
  pendingTimeControl: TIME_CONTROLS[2].items[0], // valgt i "New Game"-fanen
  result: null,             // { winner: "w" | "b" | null, title, reason } når partiet er slut
  drawOffer: null,          // farven der har tilbudt remis
  resignArmed: false,       // "Resign" er trykket én gang og venter på bekræftelse
  lowTimeWarned: { w: false, b: false },

  // Bot-partier
  mode: "pass",             // "pass" (to spillere) eller "bot"
  bot: null,                // den bot man spiller mod
  humanColor: "w",          // den farve mennesket spiller med
  botThinking: false,
  botToken: 0,              // tæller der bruges til at ignorere gamle bot-svar
  botSpeech: null,          // det botten siger lige nu (taleboble)
  selectedBotId: "bruno",   // valgt i "Play Bots"-oversigten
  pendingColor: "w",        // "w", "b" eller "random"
  pendingVariant: "chess",  // valgt variant i "New Game" (se variants.js)
  variant: "chess",         // varianten i det nuværende parti
  pendingCoach: false,      // skal coachen kommentere mine træk?
  hintsUsed: 0,

  players: {
    w: { name: "Player 1", rating: 1200 },
    b: { name: "Player 2", rating: 1200 },
  },
};

// HTML-elementer vi bruger ofte
const $ = (id) => document.getElementById(id);
const els = {
  playerTop: $("player-top"),
  playerBottom: $("player-bottom"),
  moveList: $("move-list"),
  openingName: $("opening-name"),
  log: $("game-log"),
  gameOver: $("game-over"),
  offerBar: $("offer-bar"),
};

// Brættet og uret
const board = new BoardView($("board-wrap"));
const clock = new ChessClock({
  onTick: () => drawClocks(),
  onFlag: (color) => handleTimeout(color),
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Hvilken side der vises lige nu
let currentPage = "play";

// Alle sider melder sig her (fx Pages.puzzles = Puzzles). Hver side har open(),
// og nogle har også leave() og onMove() (når brikker flyttes på brættet).
const Pages = {};

// Sider med skakbræt. De andre (News, Social, More, Help) er almindelige tekstsider.
const BOARD_PAGES = ["play", "puzzles", "learn", "watch", "review", "daily"];
// Hvilket menupunkt der skal lyse for hver side
const NAV_FOR_PAGE = { account: "more", review: "learn", help: "more", leaderboard: "social", insights: "social", daily: "play", player: "social", tournaments: "play", clubs: "social" };

// Skifter side. Brættet deles af alle sider med skakbræt.
function showPage(page) {
  const old = currentPage;
  if (old !== page && Pages[old] && Pages[old].leave) Pages[old].leave();
  currentPage = page;
  document.body.dataset.page = page;

  const boardPage = BOARD_PAGES.includes(page);
  $("game-layout").classList.toggle("hidden", !boardPage);
  $("content-page").classList.toggle("hidden", boardPage);
  // Hvert bræt-side har sit eget panel til højre
  document.querySelectorAll(".page-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.page !== page);
  });
  const bars = ["play", "review", "watch", "daily"].includes(page);
  els.playerTop.classList.toggle("hidden", !bars);
  els.playerBottom.classList.toggle("hidden", !bars);
  $("eval-bar").classList.toggle("hidden", page !== "review");

  const nav = NAV_FOR_PAGE[page] || page;
  document.querySelectorAll(".nav-item[data-nav]").forEach((item) => {
    item.classList.toggle("active", item.dataset.nav === nav);
  });

  board.arrows = [];
  board.marks.clear();
  board.showHint(null);
  if (page !== "play") els.gameOver.classList.add("hidden");
  window.scrollTo(0, 0);

  if (page === "play") drawAll();
  else if (Pages[page]) Pages[page].open();
}


// ----- 3. Start og slut på et parti -----

// options: { mode: "pass" | "bot" | "online", timeControl, bot, colorChoice, coach, myColor, opponent, variant, startFen }
function startNewGame(options) {
  state.variant = options.variant || "chess"; // fx "chess960" eller "crazyhouse" (se variants.js)
  state.botToken++; // glem en evt. bot der stadig tænker fra sidste parti
  state.botThinking = false;
  state.botSpeech = null;
  state.coachSpeech = null;
  state.premoves = [];
  state.coachOn = !!options.coach && !isVariant(options.variant); // coachen kender kun almindelig skak
  state.coachGame = options.coachGame || null; // "Play Coach": coachen er selv modstanderen
  state.myDrawOffered = false;
  state.recordedGame = null;
  state.hintsUsed = 0;

  state.mode = options.mode;
  state.timeControl = options.timeControl;
  state.lastOptions = options; // husk til "Rematch"

  if (options.mode === "bot") {
    state.bot = options.bot;
    // "random" = slå plat og krone om farven
    const color = options.colorChoice === "random" ? (Math.random() < 0.5 ? "w" : "b") : options.colorChoice;
    state.humanColor = color;
    const botColor = color === "w" ? "b" : "w";
    const me = Accounts.profile();
    state.players[color] = { name: Accounts.name(), rating: me.ratings.bots, isHuman: true, color: me.color, country: me.country };
    state.players[botColor] = { name: state.bot.name, rating: state.bot.rating, bot: state.bot };
    state.flipped = color === "b"; // man sidder altid nederst
    getEngine().newGame();
  } else if (options.mode === "online") {
    // Online mod en ven: jeg spiller "myColor", vennen den anden farve
    state.bot = null;
    const color = options.myColor;
    const other = color === "w" ? "b" : "w";
    state.humanColor = color;
    state.players = {};
    state.players[color] = { name: Accounts.name(), rating: Online.myRating(), isHuman: true, color: Accounts.profile().color, country: Accounts.profile().country };
    state.players[other] = { name: options.opponent.name, rating: options.opponent.rating, friend: true, color: options.opponent.color, country: options.opponent.country };
    state.flipped = color === "b";
    if (options.opponent.name !== GUEST) Accounts.addRecentOpponent(options.opponent.name, options.opponent.color);
  } else {
    state.bot = null;
    state.players = {
      w: { name: "Player 1", rating: 1200 },
      b: { name: "Player 2", rating: 1200 },
    };
  }

  // Standard-stilling, en selvvalgt stilling (FEN) eller variantens startstilling
  const startFen = options.startFen || (isVariant(state.variant) ? variantStartFen(state.variant) : null);
  state.game = makeGame(state.variant, startFen);
  state.positions = [state.game.fen()];
  state.premoves = [];
  state.viewPly = null;
  state.result = null;
  state.drawOffer = null;
  state.resignArmed = false;
  state.lowTimeWarned = { w: false, b: false };
  board.showHint(null);

  clock.reset(state.timeControl.base, state.timeControl.inc);
  els.gameOver.classList.add("hidden");
  els.log.innerHTML = "";
  $("chat-form").classList.toggle("hidden", state.mode !== "online");
  const w = state.players.w;
  const b = state.players.b;
  addLog(`<b>NEW GAME</b> ${w.name} (${w.rating}) vs ${b.name} (${b.rating}) – ${state.timeControl.label}`);
  if (isVariant(state.variant)) {
    const v = findVariant(state.variant);
    addLog(`<b>${v.icon} ${v.name}:</b> ${v.desc}`);
  }

  playSound("start");
  drawAll();

  if (state.coachGame) Coach.onStart();
  else if (typeof Coach !== "undefined") Coach.drawBox(); // skjul coach-boksen
  if (state.bot) {
    if (state.coachGame) addLog(`<b>Coach:</b> ${state.bot.lines.start}`);
    else botSay(state.bot.lines.start);
    if (state.coachOn && !state.coachGame) addLog("<b>Coach:</b> I'll give you tips after every move. Good luck!");
    maybeBotMove(); // er botten hvid, starter den
  }
}

// Afslutter partiet med et resultat og viser slut-vinduet.
// fromRemote = true når det er vennen (online), der har meldt resultatet.
function endGame(winner, reason, fromRemote = false) {
  if (state.result) return;
  state.botToken++; // stop en bot der tænker
  state.botThinking = false;

  let title = winner ? `${COLOR_NAMES[winner]} Won` : "Draw";
  if ((state.mode === "bot" || state.mode === "online") && winner) {
    title = winner === state.humanColor ? "You Won!" : `${state.players[winner].name} Won`;
  }
  // Afbrudt før begge har trukket (som "Abort" på chess.com): tæller ikke
  const aborted = reason === "aborted";
  if (aborted) title = "Game Aborted";
  // Fortæl vennen om resultatet
  if (state.mode === "online" && !fromRemote) Online.send({ type: "gameover", winner, reason });

  state.result = { winner, title, reason };
  state.premoves = [];
  state.drawOffer = null;
  clock.stop();
  board.showHint(null);

  const text = aborted ? "Game aborted – it doesn't count" : winner ? `${state.players[winner].name} won ${reason}` : `Game drawn ${reason}`;
  addLog(`<b>GAME OVER</b> ${text}`);
  playSound("end");

  // Botten siger noget til sidst
  if (state.bot) {
    if (!winner) botSay(state.bot.lines.draw);
    else if (winner === state.humanColor) botSay(state.bot.lines.lose);
    else botSay(state.bot.lines.win);
  }

  if (!aborted) saveFinishedGame();
  // Afbrudt turneringsparti: fortæl serveren det, så begge kan få et nyt parti
  else if (state.mode === "online" && Online.rated && Online.tournamentId && !fromRemote) {
    API.post("/games/report", { id: Online.gameId, result: "1/2-1/2", reason: "aborted", sans: state.game.history() }).catch(() => {});
  }
  if (state.mode === "online") {
    Online.postLive();
    if (typeof Tournaments !== "undefined") Tournaments.gameOver();
  }
  drawAll();
  // Lille pause før vinduet vises, så man når at se det sidste træk
  setTimeout(showGameOver, 500);
}

// Gemmer partiet i arkivet (så det kan ses under "Games" og i Game Review)
function saveFinishedGame() {
  const history = state.game.history();
  if (history.length === 0) return;
  const r = state.result;
  const player = (color) => {
    const p = state.players[color];
    return { name: p.name, rating: p.rating, color: p.color, bot: p.bot ? { avatar: p.bot.avatar, color: p.bot.color } : null };
  };
  const vsSomeone = state.mode === "bot" || state.mode === "online";
  const opponent = vsSomeone ? state.players[state.humanColor === "w" ? "b" : "w"] : null;
  const labels = { bot: state.coachGame ? "vs Coach" : "vs Bot", online: `Online · ${state.timeControl.label}`, pass: `Pass and Play · ${state.timeControl.label}` };
  const variant = isVariant(state.variant) ? findVariant(state.variant) : null;
  // Ratede online-partier: serveren regner ratingen ud (se Online.report)
  const serverRated = state.mode === "online" && Online.rated;
  state.recordedGame = Accounts.recordGame({
    id: serverRated ? Online.gameId : undefined,
    serverRated,
    mode: state.mode,
    modeLabel: (variant ? variant.name + " · " : "") + labels[state.mode],
    variant: state.variant,
    unrated: (!!variant && state.mode === "bot") || !!state.coachGame, // varianter og coach-partier tæller ikke
    white: player("w"),
    black: player("b"),
    result: r.winner === "w" ? "1-0" : r.winner === "b" ? "0-1" : "1/2-1/2",
    reason: r.reason,
    sans: history,
    startFen: state.positions[0],
    timeControl: state.timeControl,
    opening: variant ? null : getOpeningName(history),
    myColor: vsSomeone ? state.humanColor : null,
    opponentRating: opponent ? opponent.rating : null,
  });
  Achievements.check();
  if (serverRated) Online.report(state.recordedGame); // send resultatet til serveren
  // Den nye rating vises med det samme
  if (vsSomeone && state.recordedGame.ratingChange !== undefined) {
    state.players[state.humanColor].rating = Accounts.profile().ratings[state.recordedGame.ratingCategory];
  }
}

// Tjekker om reglerne siger, at partiet er slut. Returnerer true hvis det er slut.
function checkRulesGameOver() {
  const game = state.game;
  // Varianter kan vindes på andre måder (kongen på bakken, tre skak, eksplosion …)
  if (game instanceof VariantGame) {
    const special = game.variantResult();
    if (special) { endGame(special.winner, special.reason); return true; }
    // Antichess: den der ikke kan trække, vinder
    if (game.variant.id === "antichess" && game.pos.isEnd()) {
      const o = game.pos.outcome();
      endGame(o && o.winner ? colorLetterOf(o.winner) : null, "– no moves left");
      return true;
    }
  }
  if (game.isCheckmate()) endGame(game.turn() === "w" ? "b" : "w", "by checkmate");
  else if (game.isStalemate()) endGame(null, "by stalemate");
  else if (game.isInsufficientMaterial()) endGame(null, "by insufficient material");
  else if (game.isThreefoldRepetition()) endGame(null, "by repetition");
  else if (game.isDraw()) endGame(null, "by 50-move rule");
  return !!state.result;
}

// Kaldes af uret, når en spillers tid er løbet ud.
function handleTimeout(color) {
  if (state.result) return;
  const winner = color === "w" ? "b" : "w";
  // Har modstanderen kun kongen (eller konge + én let officer), kan han ikke sætte mat → remis
  if (!canStillMate(winner)) endGame(null, "by timeout vs insufficient material");
  else endGame(winner, "on time");
}

const colorLetterOf = (c) => (c === "white" ? "w" : "b");

// Har farven nok brikker til i teorien at sætte mat?
function canStillMate(color) {
  if (isVariant(state.variant)) return true; // varianter vindes på andre måder
  const pieces = [];
  state.game.board().forEach((row) => row.forEach((p) => {
    if (p && p.color === color && p.type !== "k") pieces.push(p.type);
  }));
  if (pieces.length === 0) return false;
  if (pieces.length === 1 && (pieces[0] === "n" || pieces[0] === "b")) return false;
  return true;
}


// ----- 4. Træk -----

// Kaldes af brættet, når mennesket har lavet et træk.
board.onMove = (from, to, promotion) => {
  // På de andre sider (puzzles, lektioner, analyse ...) er det siden selv, der får trækket
  if (currentPage !== "play") {
    const page = Pages[currentPage];
    if (page && page.onMove) page.onMove(from, to, promotion);
    return;
  }
  if (state.result || state.viewPly !== null) return;
  if ((state.mode === "bot" || state.mode === "online") && state.game.turn() !== state.humanColor) return;
  applyMove({ from, to, promotion }, true);
};

// Crazyhouse: en brik fra lommen sættes ind på brættet
board.onDrop = (type, square) => {
  if (currentPage !== "play" || state.result || state.viewPly !== null) return;
  if ((state.mode === "bot" || state.mode === "online") && state.game.turn() !== state.humanColor) return;
  applyMove({ drop: type, to: square }, true);
};

// Klik på en brik i lommen (spillerbjælken) vælger den
[els.playerTop, els.playerBottom].forEach((bar) => bar.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-drop]");
  if (!btn || currentPage !== "play") return;
  board.dropPiece = board.dropPiece === btn.dataset.drop ? null : btn.dataset.drop;
  board.selected = null;
  drawAll();
}));

// Udfører et træk (fra mennesket eller botten) og opdaterer det hele.
// byHuman = true hvis det er mennesket, der har trukket.
function applyMove(moveObject, byHuman = false) {
  const move = state.game.move(moveObject);
  state.positions.push(state.game.fen());
  // Brikken glider på plads – undtagen hvis man selv har trukket den med musen
  state.animate = (byHuman && board.lastMoveWasDrag) || move.drop ? null : { from: move.from, to: move.to };
  board.dropPiece = null;

  // Et træk afviser et åbent remistilbud
  if (state.drawOffer) {
    addLog(`${state.players[move.color].name} declined the draw by moving`);
    state.drawOffer = null;
  }
  state.resignArmed = false;

  clock.press(move.color);
  if (state.mode === "online" && byHuman) Online.sendMove(move);
  if (state.mode === "online") Online.postLive(); // så andre kan se med
  state.myDrawOffered = false;
  playMoveSound(move);
  if (state.coachGame) { if (move.color !== state.humanColor) Coach.explain(move); }
  else if (state.bot) botReactToMove(move);
  drawAll();

  if (checkRulesGameOver()) return;

  // Har jeg lavet premoves, mens modstanderen tænkte? Så spilles den første nu (hvis den er lovlig).
  // Resten bliver i køen – man kan premove så mange træk, man vil (som på chess.com).
  if (!byHuman && state.premoves.length) {
    const pm = state.premoves.shift();
    const legal = state.game.moves({ verbose: true }).find((m) => m.from === pm.from && m.to === pm.to);
    if (legal) {
      setTimeout(() => {
        if (state.result || state.game.turn() !== state.humanColor) return;
        board.lastMoveWasDrag = true; // ingen animation – brikken står allerede klar
        applyMove({ from: pm.from, to: pm.to, promotion: legal.promotion ? pm.promotion || "q" : undefined }, true);
      }, 80);
    } else {
      // Trækket er ikke lovligt længere (modstanderen ændrede stillingen) → hele køen annulleres
      state.premoves = [];
      drawBoard();
    }
    return;
  }

  // Coachen kommenterer først mit træk – derefter svarer botten
  if (state.mode === "bot" && byHuman && state.coachOn) coachThenBot(move);
  else maybeBotMove();
}

// Coach-tilstand: vurder mit træk, og lad så botten svare
async function coachThenBot(move) {
  const token = state.botToken;
  state.botThinking = true;
  drawControls();
  const fenAfter = state.positions[state.positions.length - 1];
  const fenBefore = state.positions[state.positions.length - 2];
  await coachMove(move, fenBefore, fenAfter);
  if (token !== state.botToken || state.result) return; // fortrudt eller slut
  state.botThinking = false;
  maybeBotMove();
}

// Premove: læg trækket i køen og vis det med rødt
board.onPremove = (from, to, promotion) => {
  if (currentPage !== "play") return;
  state.premoves.push({ from, to, promotion });
  drawBoard();
};
board.onPremoveCancel = () => {
  state.premoves = [];
  drawBoard();
};

// Stillingen som den ser ud, hvis alle mine premoves bliver spillet.
// Brættet viser den, så man kan blive ved med at premove fra de nye felter.
function premoveGhost() {
  const c = new Chess(state.game.fen());
  for (const pm of state.premoves) {
    const piece = c.get(pm.from);
    if (!piece) break;
    c.remove(pm.from);
    // Rokade: kongen flytter to felter → tårnet flytter med
    if (piece.type === "k" && Math.abs(pm.from.charCodeAt(0) - pm.to.charCodeAt(0)) === 2) {
      const rank = pm.from[1];
      const [rookFrom, rookTo] = pm.to[0] === "g" ? ["h" + rank, "f" + rank] : ["a" + rank, "d" + rank];
      const rook = c.get(rookFrom);
      if (rook) { c.remove(rookFrom); c.put(rook, rookTo); }
    }
    const promotes = piece.type === "p" && (pm.to[1] === "8" || pm.to[1] === "1");
    c.remove(pm.to);
    c.put({ type: promotes ? pm.promotion || "q" : piece.type, color: piece.color }, pm.to);
  }
  // Modstanderen er stadig i trækket
  const fen = c.fen().split(" ");
  fen[1] = state.humanColor === "w" ? "b" : "w";
  fen[3] = "-";
  return new Chess(fen.join(" "), { skipValidation: true });
}

// Klik på brættet mens man kigger på gamle træk → hop tilbage til nu.
board.onBoardTouch = () => {
  if (currentPage !== "play") return false;
  if (state.viewPly !== null && !state.result) {
    setView(null);
    return true;
  }
  return false;
};

// Vælger den rigtige lyd til trækket.
function playMoveSound(move) {
  if (move.san.includes("+")) playSound("check");
  else if (move.flags.includes("p")) playSound("promote");
  else if (move.flags.includes("k") || move.flags.includes("q")) playSound("castle");
  else if (move.flags.includes("c") || move.flags.includes("e")) playSound("capture");
  else playSound("move");
}

// Fortryder træk. Mod en bot fortrydes både bottens og ens eget træk.
function takeback() {
  if (state.result || state.mode === "online") return; // ingen fortryd online
  state.coachSpeech = null;
  const historyLength = state.game.history().length;
  if (historyLength === 0) return;

  let count = 1;
  if (state.mode === "bot") {
    if (state.botThinking) {
      // Botten tænker over sit svar: afbryd den og fortryd kun ens eget træk
      state.botToken++;
      state.botThinking = false;
      getEngine().stop();
      count = 1;
    } else {
      // Det er ens egen tur: fortryd bottens træk + ens eget
      count = 2;
    }
    // Man kan ikke fortryde bottens allerførste træk (når botten er hvid)
    count = Math.min(count, historyLength - (state.humanColor === "b" ? 1 : 0));
    if (count <= 0) return;
  }

  for (let i = 0; i < count; i++) {
    state.game.undo();
    state.positions.pop();
  }
  state.viewPly = null;
  state.drawOffer = null;
  board.showHint(null);

  // Det rigtige ur skal køre igen
  if (state.game.history().length === 0) clock.reset(state.timeControl.base, state.timeControl.inc);
  else clock.setRunning(state.game.turn());

  addLog(count === 2 ? "Takeback (2 moves)" : "Move taken back");
  playSound("move");
  drawAll();
}


// ----- 5. Botten -----

// Hvis det er bottens tur, så finder den et træk og spiller det.
async function maybeBotMove() {
  if (state.mode !== "bot" || state.result) return;
  if (state.game.turn() === state.humanColor) return;

  const token = ++state.botToken;
  state.botThinking = true;
  drawPlayers();
  drawClocks();

  const started = performance.now();
  const config = state.bot.engine;
  let move;

  move = await chooseBotMove(state.game, config);
  if (!move || token !== state.botToken) return; // afbrudt (takeback, nyt parti...)

  // Botten "tænker" mindst lidt, så den ikke svarer på et splitsekund
  const thinkTime = 500 + Math.random() * 900;
  const waited = performance.now() - started;
  if (waited < thinkTime) await sleep(thinkTime - waited);
  if (token !== state.botToken || state.result) return;

  state.botThinking = false;
  applyMove(move);
}

// Botten kommenterer nogle træk (skak, slået dronning osv.)
function botReactToMove(move) {
  const botMoved = move.color !== state.humanColor;
  if (botMoved && move.captured === "q") botSay(randomLine(BOT_CHAT.tookQueen));
  else if (!botMoved && move.captured === "q") botSay(randomLine(BOT_CHAT.lostQueen));
  else if (botMoved && move.captured === "r" && Math.random() < 0.5) botSay(randomLine(BOT_CHAT.tookRook));
  else if (botMoved && move.san.includes("+") && !move.san.includes("#") && Math.random() < 0.35) botSay(randomLine(BOT_CHAT.check));
}

// Viser en taleboble ved botten i nogle sekunder.
let speechTimer = null;
function botSay(text) {
  if (state.coachGame) { addLog(`<b>Coach:</b> ${text}`); Coach.say(text); return; }
  state.botSpeech = text;
  addLog(`<b>${state.bot.name}:</b> ${text}`);
  drawPlayers();
  clearTimeout(speechTimer);
  speechTimer = setTimeout(() => {
    state.botSpeech = null;
    drawPlayers();
  }, 4500);
}

// Tip: spørg Stockfish (fuld styrke) om det bedste træk og vis en grøn pil.
async function showHint() {
  if (state.mode !== "bot" || state.result || state.botThinking) return;
  if (state.game.turn() !== state.humanColor) return;
  const fen = state.game.fen();
  $("btn-hint").disabled = true;
  const engine = await engineFor(state.game);
  const result = engine ? await engine.search(fen, { skill: 20, movetime: 700 }) : null;
  $("btn-hint").disabled = false;
  if (!engine) return showToast("Hints for variants need the online version of Chesslab");
  // Stillingen kan have ændret sig, mens vi ventede
  if (!result || state.game.fen() !== fen) return;
  state.hintsUsed++;
  setView(null);
  board.showHint(uciToMove(result.best));
}

// Remistilbud til botten: den siger ja, hvis den står dårligt.
async function offerDrawToBot() {
  const fen = state.game.fen();
  const engine = await engineFor(state.game);
  const result = engine ? await engine.search(fen, { skill: 20, movetime: 500 }) : null;
  if (!result) { botSay(randomLine(BOT_CHAT.drawDeclined)); return; }
  if (!result || state.result || state.game.fen() !== fen) return;

  // Vurderingen er set fra den der er i trækket (= mennesket). Botten ser det modsat.
  let botScore = result.mate !== null ? (result.mate > 0 ? -10000 : 10000) : -result.scoreCp;
  // Botten siger kun ja efter mindst 15 træk hver, og kun hvis den står klart dårligt
  // – eller hvis stillingen er helt lige efter 30 træk hver.
  const ply = state.game.history().length;
  const losing = ply >= 30 && botScore <= -250;
  const deadEqual = ply >= 60 && Math.abs(botScore) <= 25;
  if (losing || deadEqual) {
    botSay(randomLine(BOT_CHAT.drawAccepted));
    endGame(null, "by agreement");
  } else {
    botSay(randomLine(BOT_CHAT.drawDeclined));
    addLog(`${state.bot.name} declined the draw`);
  }
}


// ----- 6. Bladre i trækkene (gennemse partiet) -----

// ply = antal træk fra start. null = live-stillingen.
function setView(ply) {
  const total = state.game.history().length;
  if (ply !== null) ply = Math.max(0, Math.min(total, ply));
  if (ply === total) ply = null;
  if (ply === state.viewPly) return;
  const before = currentPly();
  state.viewPly = ply;

  // Spil en lyd for det træk vi lander på
  const shown = ply === null ? total : ply;
  const history = state.game.history({ verbose: true });
  if (shown > 0) playMoveSound(history[shown - 1]);
  // Ét træk frem: lad brikken glide
  if (shown === before + 1) state.animate = { from: history[shown - 1].from, to: history[shown - 1].to };

  drawAll();
}

function currentPly() {
  return state.viewPly === null ? state.game.history().length : state.viewPly;
}


// ----- 7. Tegning af det hele -----

function drawAll() {
  if (typeof Coach !== "undefined") Coach.drawBox();
  drawBoard();
  drawPlayers();
  drawClocks();
  drawMoveList();
  drawOpening();
  drawControls();
}

// ----- Evalueringsbjælke under bot-, coach- og "pass and play"-partier -----
// Som på chess.com: ikke mod rigtige modstandere (det ville være snyd).
// Den har sin egen motor, så den ikke forstyrrer botten.
let evalEngine = null;
const liveEval = { fen: null, ev: null, token: 0 };

function liveEvalAllowed() {
  return currentPage === "play" && settings.evalBar && ["bot", "pass"].includes(state.mode) && !isVariant(state.variant);
}

async function updateLiveEval() {
  if (typeof analyzePosition === "undefined") return; // review.js er ikke indlæst endnu
  const on = liveEvalAllowed();
  $("eval-bar").classList.toggle("hidden", !on);
  $("best-move-suggestion").classList.toggle("hidden", !on);
  document.body.classList.toggle("live-eval", on);
  if (!on) return;
  const fen = currentChess().fen();
  if (fen === liveEval.fen) {
    renderEvalBar(liveEval.ev, state.flipped);
    return renderBestMoveSuggestion(fen, liveEval.bestUci);
  }
  liveEval.fen = fen;
  liveEval.bestUci = null;
  renderBestMoveSuggestion(fen, null);
  const token = ++liveEval.token;
  if (!evalEngine) evalEngine = new Engine();
  const res = await analyzePosition(fen, { depth: 14, movetime: 700 }, evalEngine);
  if (token !== liveEval.token || !res) return;
  liveEval.ev = res.eval;
  liveEval.bestUci = res.lines[0] ? res.lines[0].move : null;
  if (liveEvalAllowed()) {
    renderEvalBar(res.eval, state.flipped);
    renderBestMoveSuggestion(fen, liveEval.bestUci);
  }
}

// Viser hvilket træk Stockfish anbefaler i stillingen, fx "White to move: Nf3."
function renderBestMoveSuggestion(fen, bestUci) {
  const el = $("best-move-suggestion");
  if (!el) return;
  const chess = new Chess(fen);
  if (!bestUci || chess.isGameOver()) { el.innerHTML = ""; return; }
  const mover = chess.turn() === "w" ? "White" : "Black";
  const bestSan = typeof uciToSan === "function" ? uciToSan(fen, bestUci) : bestUci;
  el.innerHTML = `<b>${mover} to move:</b> Stockfish suggests <b>${bestSan}</b>.`;
}

// ----- Farvede felter: hvor godt er hvert lovligt træk? -----
// Grøn = godt træk, blå = okay (lidt svagere), rød = regelret dårligt (undgå det).
// Bruger MultiPV til at få Stockfish' vurdering af ALLE lovlige træk i én søgning,
// og sammenligner hver med det bedste træk for at give det en farve.
let qualityEngine = null;
const moveQuality = { fen: null, map: {}, token: 0 };

async function updateMoveQuality() {
  if (typeof winPercent === "undefined") return; // review.js er ikke indlæst endnu
  if (!liveEvalAllowed()) { moveQuality.fen = null; moveQuality.map = {}; return; }
  const fen = currentChess().fen();
  if (fen === moveQuality.fen) return;
  moveQuality.fen = fen;
  moveQuality.map = {};
  const legal = new Chess(fen).moves({ verbose: true });
  if (!legal.length) return;
  const token = ++moveQuality.token;
  if (!qualityEngine) qualityEngine = new Engine();
  const res = await qualityEngine.analyze(fen, { depth: 12, movetime: 600, multipv: legal.length });
  if (token !== moveQuality.token || !res || !res.lines.length) return;
  const wins = res.lines.map((l) => ({ move: l.move, win: winPercent({ cp: l.cp, mate: l.mate }) }));
  const bestWin = Math.max(...wins.map((w) => w.win));
  const map = {};
  wins.forEach((w) => {
    const loss = bestWin - w.win;
    map[w.move] = loss < 10 ? "good" : loss < 25 ? "okay" : "bad";
  });
  moveQuality.map = map;
  if (liveEvalAllowed() && fen === currentChess().fen()) drawBoard();
}

function drawBoard() {
  if (currentPage !== "play") return; // puzzle-siden tegner selv brættet
  updateLiveEval();
  updateMoveQuality();
  const ply = currentPly();
  const live = state.viewPly === null;
  // Kigger vi på et gammelt træk, laver vi et midlertidigt parti med den stilling
  const showGhost = live && state.premoves.length && state.game.turn() !== state.humanColor && !isVariant(state.variant);
  const chess = showGhost ? premoveGhost() : live ? state.game : makeGame(state.variant, state.positions[ply]);
  const history = state.game.history({ verbose: true });
  const lastMove = settings.highlightLast && ply > 0 ? history[ply - 1] : null;

  // Hvem må flytte? I "Pass and Play" den der er i trækket, mod en bot kun mennesket.
  const movable = state.mode === "bot" || state.mode === "online" ? state.humanColor : state.game.turn();
  const myTurn = state.game.turn() === movable && !state.botThinking;
  // Premoves: mod bots og venner, når det er modstanderens tur
  const premove = settings.premoves && (state.mode === "bot" || state.mode === "online") && state.game.turn() !== state.humanColor;

  board.moveQuality = live && liveEvalAllowed() ? moveQuality.map : {};
  board.draw({
    chess,
    flipped: state.flipped,
    lastMove,
    interactive: live && !state.result && (myTurn || premove),
    movableColor: movable,
    premove: live && !state.result && premove,
    premoveMoves: state.premoves,
    animate: state.animate,
  });
  state.animate = null;
  $("board-wrap").classList.toggle("reviewing", !live);
}

// --- Spillerbjælker ---

function drawPlayers() {
  const topColor = state.flipped ? "w" : "b";
  const bottomColor = state.flipped ? "b" : "w";
  els.playerTop.innerHTML = playerBarHTML(topColor);
  els.playerBottom.innerHTML = playerBarHTML(bottomColor);
}

// Avatar: bots har et dyr på farvet baggrund, brugere deres forbogstav, ellers en grå bonde.
function avatarHTML(color, extraClass = "") {
  const player = state.players[color];
  if (player.bot) {
    return `<div class="avatar avatar-bot ${extraClass}" style="background:${player.bot.color}">${player.bot.avatar}</div>`;
  }
  if ((player.isHuman || player.friend) && player.name !== GUEST) return userAvatarHTML(player.name, player.color, extraClass);
  return `<div class="avatar avatar-${color} ${extraClass}"><svg><use href="#i-pawn"/></svg></div>`;
}

function playerBarHTML(color) {
  const player = state.players[color];
  const opponent = color === "w" ? "b" : "w";
  const chess = currentChess();

  let { groups: extra, diffHTML } = materialParts(chess, color);
  // Varianter: Crazyhouse viser "lommen", Three-check hvor mange skak der mangler
  if (chess instanceof VariantGame) {
    const pockets = chess.pockets();
    const checks = chess.checksLeft();
    if (pockets) {
      const mine = pockets[color];
      const canDrop = state.viewPly === null && !state.result && chess.turn() === color &&
        (state.mode === "pass" || color === state.humanColor) && !state.botThinking;
      extra = ["p", "n", "b", "r", "q"].filter((t) => mine[t] > 0).map((t) => `
        <button class="pocket-piece ${board.dropPiece === t && canDrop ? "selected" : ""}" ${canDrop ? `data-drop="${t}"` : "disabled"} title="Drop a ${PIECE_NAMES[t]}">
          <img src="${pieceUrl(color, t)}" alt=""><span>${mine[t]}</span>
        </button>`).join("") || '<span class="pocket-empty">Pocket empty</span>';
      diffHTML = "";
    } else if (checks) {
      extra = `<span class="checks-left">${"✚".repeat(3 - checks[opponent])}<small>${3 - checks[opponent]}/3 checks</small></span>`;
      diffHTML = "";
    } else if (["horde", "racingkings", "antichess"].includes(chess.variant.id)) {
      extra = ""; diffHTML = "";
    }
  }

  // Taleboble hvis botten siger noget – eller coachen kommenterer mit træk
  let speech = "";
  if (player.bot && state.botSpeech) speech = `<div class="speech-bubble">${state.botSpeech}</div>`;
  if (player.isHuman && state.coachOn && state.coachSpeech && !state.coachGame) {
    const c = state.coachSpeech;
    speech = `<div class="speech-bubble coach-bubble"><span class="cls-icon small cls-${c.cls}">${MOVE_CLASSES[c.cls].symbol}</span>🦉 ${c.text}</div>`;
  }

  return `
    <div class="player-left">
      ${avatarHTML(color)}
      <div class="player-meta">
        <div class="player-name-row">
          <span class="player-name">${escapeHTML(player.name)}</span>
          <span class="player-rating">(${player.rating})</span>
          ${typeof flagHTML === "function" ? flagHTML(player.country) : ""}
          ${player.bot ? `<span class="bot-badge">${state.coachGame ? "COACH" : "BOT"}</span>` : ""}
          ${player.friend && state.mode === "online" ? '<span class="bot-badge online-badge">ONLINE</span>' : ""}
        </div>
        <div class="captured">${extra}${diffHTML}</div>
      </div>
      ${speech}
    </div>
    <div class="clock" data-color="${color}">
      <svg class="clock-icon"><use href="#i-clock"/></svg>
      <span class="clock-time"></span>
    </div>`;
}

// Slåede brikker (modstanderens brikker der mangler på brættet) og "+3" hvis man er foran
function materialParts(chess, color) {
  const opponent = color === "w" ? "b" : "w";
  const captured = getCapturedPieces(chess, opponent);
  const groups = ["p", "n", "b", "r", "q"]
    .filter((type) => captured[type] > 0)
    .map((type) => {
      const imgs = Array.from({ length: captured[type] },
        () => `<img class="cap-piece cap-${opponent}" src="${pieceUrl(opponent, type)}" alt="">`).join("");
      return `<span class="cap-group">${imgs}</span>`;
    })
    .join("");
  const diff = getMaterial(chess, color) - getMaterial(chess, opponent);
  return { groups, diffHTML: diff > 0 ? `<span class="material">+${diff}</span>` : "" };
}

// Den stilling der vises lige nu (live eller et gammelt træk)
function currentChess() {
  return state.viewPly === null ? state.game : makeGame(state.variant, state.positions[state.viewPly]);
}

// Tæller hvilke brikker af en farve der er slået (startantal minus dem på brættet).
function getCapturedPieces(chess, color) {
  const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const onBoard = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  chess.board().forEach((row) => row.forEach((p) => {
    if (p && p.color === color && p.type !== "k") onBoard[p.type]++;
  }));
  const captured = {};
  for (const type in start) captured[type] = Math.max(0, start[type] - onBoard[type]);
  return captured;
}

function getMaterial(chess, color) {
  let total = 0;
  chess.board().forEach((row) => row.forEach((p) => {
    if (p && p.color === color) total += PIECE_VALUES[p.type];
  }));
  return total;
}

// --- Ure ---

function drawClocks() {
  if (!state.positions.length) return; // siden er ikke startet endnu
  document.querySelectorAll(".clock").forEach((el) => {
    const color = el.dataset.color;
    const timeEl = el.querySelector(".clock-time");
    const isTurn = state.game.turn() === color && !state.result;
    const isBot = !!state.players[color].bot;

    if (!clock.enabled) {
      // Ingen tidsbegrænsning: vis hvem der er i trækket (eller at botten tænker)
      el.classList.toggle("active", isTurn);
      el.classList.add("no-timer");
      el.classList.toggle("thinking", isTurn && isBot);
      let text = "To move";
      if (isBot) text = "Thinking";
      else if (state.mode === "bot" || state.mode === "online") text = color === state.humanColor ? "Your move" : "Their move";
      timeEl.textContent = isTurn ? text : "";
      return;
    }

    const ms = clock.time[color];
    timeEl.textContent = ChessClock.format(ms);
    el.classList.toggle("active", clock.running === color || (!clock.started && isTurn && !state.result));
    el.classList.toggle("low", ms < 20000);

    // Advarselslyd én gang, når der er under 10 sekunder tilbage
    if (clock.running === color && ms < 10000 && !state.lowTimeWarned[color] && !isBot) {
      state.lowTimeWarned[color] = true;
      playSound("lowtime");
    }
  });
}

// --- Trækliste ---

function drawMoveList() {
  const history = state.game.history({ verbose: true });
  const shown = currentPly();
  let html = "";

  for (let i = 0; i < history.length; i += 2) {
    const white = history[i];
    const black = history[i + 1];
    html += `
      <div class="move-row">
        <span class="move-number">${i / 2 + 1}.</span>
        ${moveHTML(white, i + 1, shown)}
        ${black ? moveHTML(black, i + 2, shown) : "<span></span>"}
      </div>`;
  }
  els.moveList.innerHTML = html;

  // Rul så det viste træk kan ses
  const current = els.moveList.querySelector(".move.current");
  if (state.viewPly === null) els.moveList.scrollTop = els.moveList.scrollHeight;
  else if (current) current.scrollIntoView({ block: "nearest" });
}

// Ét træk i listen. Med "figurine" vises en lille brik i stedet for bogstavet (N, B, R, Q, K).
function moveHTML(move, ply, shownPly) {
  let san = move.san;
  let figure = "";
  if (settings.figurine && /^[KQRBN]/.test(san)) {
    // Altid den hvide brik som ikon – den kan ses på den mørke baggrund
    figure = `<img class="fig" src="${pieceUrl("w", san[0].toLowerCase())}" alt="${san[0]}">`;
    san = san.slice(1);
  }
  const cls = ply === shownPly ? "move current" : "move";
  return `<span class="${cls}" data-ply="${ply}">${figure}${san}</span>`;
}

// Klik på et træk i listen = vis den stilling
els.moveList.addEventListener("click", (e) => {
  const moveEl = e.target.closest(".move");
  if (moveEl) setView(Number(moveEl.dataset.ply));
});

// --- Åbningens navn ---

function drawOpening() {
  if (isVariant(state.variant)) {
    const v = findVariant(state.variant);
    els.openingName.textContent = `${v.icon} ${v.name}`;
    return;
  }
  if (state.positions[0] !== new Chess().fen()) {
    els.openingName.textContent = "Custom position";
    return;
  }
  const sans = state.game.history().slice(0, currentPly());
  const name = getOpeningName(sans);
  if (sans.length === 0) els.openingName.textContent = "Starting Position";
  else els.openingName.textContent = name || "Uncommon Opening";
}

// --- Knapper under træklisten ---

function drawControls() {
  const over = !!state.result;
  const botGame = state.mode === "bot";
  const online = state.mode === "online";
  $("controls-live").classList.toggle("hidden", over);
  $("controls-over").classList.toggle("hidden", !over);

  const moves = state.game.history().length;
  const myTurn = !botGame || (state.game.turn() === state.humanColor && !state.botThinking);

  // "Hint" findes kun mod bots, og man kan ikke fortryde online
  $("btn-hint").classList.toggle("hidden", !botGame);
  $("btn-hint").disabled = !myTurn;
  $("btn-takeback").classList.toggle("hidden", online);

  $("btn-takeback").disabled = moves === 0 || (botGame && state.humanColor === "b" && moves <= 1 && !state.botThinking);
  $("btn-draw").disabled = moves < 2 || !!state.drawOffer || !myTurn || state.myDrawOffered;
  $("btn-review-after").classList.toggle("hidden", !state.recordedGame || isVariant(state.variant));

  const resignBtn = $("btn-resign");
  resignBtn.classList.toggle("armed", state.resignArmed);
  resignBtn.querySelector("span").textContent = canAbort() ? "Abort" : state.resignArmed ? "Confirm?" : "Resign";

  const ply = currentPly();
  $("btn-first").disabled = ply === 0;
  $("btn-prev").disabled = ply === 0;
  $("btn-next").disabled = ply === moves;
  $("btn-last").disabled = ply === moves;

  // Bjælken med remistilbud / omkamp / "vennen forlod spillet"
  const friendLeft = online && Online.disconnected && !over;
  const rematchAsk = online && over && Online.opponentWantsRematch && !Online.rematchRequested;
  const showBar = !!state.drawOffer || friendLeft || rematchAsk;
  els.offerBar.classList.toggle("hidden", !showBar);
  $("btn-accept-draw").classList.toggle("hidden", !state.drawOffer && !rematchAsk);
  $("btn-decline-draw").classList.toggle("hidden", !state.drawOffer);
  $("btn-claim-win").classList.toggle("hidden", !friendLeft);
  if (friendLeft) {
    $("offer-text").textContent = "Your friend left the game.";
  } else if (rematchAsk) {
    $("offer-text").textContent = `${state.players[state.humanColor === "w" ? "b" : "w"].name} wants a rematch!`;
  } else if (state.drawOffer) {
    const other = state.drawOffer === "w" ? "b" : "w";
    $("offer-text").textContent = online
      ? `${state.players[state.drawOffer].name} offers a draw.`
      : `${COLOR_NAMES[state.drawOffer]} offers a draw. ${COLOR_NAMES[other]}?`;
  }
  // Online-omkamp: knappen viser om man venter på vennen
  $("btn-rematch-after").textContent = online && Online.rematchRequested ? "Waiting…" : "Rematch";
}

// --- Beskeder (log) ---

function addLog(html) {
  const line = document.createElement("div");
  line.className = "log-line";
  line.innerHTML = html;
  els.log.appendChild(line);
  els.log.scrollTop = els.log.scrollHeight;
}

// --- Slut-vindue ---

function showGameOver() {
  if (!state.result) return;
  const { winner, title, reason } = state.result;
  $("game-over-title").textContent = title;
  $("game-over-reason").textContent = reason;
  // Grøn top når man vinder (eller i "Pass and Play"), grå ved remis eller tab mod en bot
  const lost = (state.mode === "bot" || state.mode === "online") && winner && winner !== state.humanColor;
  $("game-over").classList.toggle("is-draw", !winner || lost);

  const player = (color) => `
    <div class="go-player ${winner === color ? "winner" : ""}">
      ${avatarHTML(color, "big")}
      <span>${state.players[color].name}</span>
    </div>`;
  $("game-over-players").innerHTML = `${player("w")}<span class="go-vs">vs</span>${player("b")}`;

  // Rating-ændring (mod bots og venner)
  const g = state.recordedGame;
  drawGameOverRating();
  $("btn-review-game").classList.toggle("hidden", !g || isVariant(state.variant)); // Game Review kender kun almindelig skak

  els.gameOver.classList.remove("hidden");
}

// Rating-linjen i "game over"-boksen (kaldes igen, når serveren har svaret)
function drawGameOverRating() {
  const g = state.recordedGame;
  if (g && g.serverRated && g.ratingChange === undefined) {
    $("game-over-rating").innerHTML = `<span class="rv-muted">Updating your rating…</span>`;
    return;
  }
  $("game-over-rating").innerHTML = g && g.ratingChange !== undefined
    ? `Your ${g.ratingCategory === "bots" ? "bot" : g.ratingCategory} rating: <b>${state.players[state.humanColor].rating}</b>
       <span class="pz-delta ${g.ratingChange >= 0 ? "up" : "down"}">${g.ratingChange >= 0 ? "+" : ""}${g.ratingChange}</span>` : "";
}


// ----- 8. Knapperne -----

// Remis
$("btn-draw").addEventListener("click", () => {
  if (state.result) return;
  if (state.mode === "bot") {
    addLog("You offered a draw");
    offerDrawToBot();
    return;
  }
  if (state.mode === "online") {
    Online.send({ type: "draw-offer" });
    state.myDrawOffered = true;
    addLog("You offered a draw");
    drawControls();
    return;
  }
  state.drawOffer = state.game.turn();
  addLog(`${COLOR_NAMES[state.drawOffer]} offers a draw`);
  drawControls();
});
$("btn-accept-draw").addEventListener("click", () => {
  // Knappen bruges også til at sige ja til en omkamp online
  if (state.mode === "online" && state.result) return Online.requestRematch();
  if (state.mode === "online") Online.send({ type: "draw-answer", accept: true });
  endGame(null, "by agreement");
});
$("btn-decline-draw").addEventListener("click", () => {
  if (state.mode === "online") Online.send({ type: "draw-answer", accept: false });
  addLog("Draw declined");
  state.drawOffer = null;
  drawControls();
});
$("btn-claim-win").addEventListener("click", () => {
  endGame(state.humanColor, "– opponent left the game", true);
});

// Opgiv: første klik = "Confirm?", andet klik = opgiv
let resignTimer = null;

// Online-partier kan afbrydes, før begge spillere har lavet deres første træk
function canAbort() {
  return state.mode === "online" && !state.result && state.game.history().length < 2;
}

$("btn-resign").addEventListener("click", () => {
  if (state.result) return;
  if (canAbort()) return endGame(null, "aborted");
  if (!state.resignArmed) {
    state.resignArmed = true;
    drawControls();
    clearTimeout(resignTimer);
    resignTimer = setTimeout(() => { state.resignArmed = false; drawControls(); }, 3000);
    return;
  }
  clearTimeout(resignTimer);
  // Mod en bot opgiver mennesket altid; ellers den der er i trækket
  const loser = state.mode === "bot" || state.mode === "online" ? state.humanColor : state.game.turn();
  endGame(loser === "w" ? "b" : "w", "by resignation");
});

$("btn-takeback").addEventListener("click", takeback);
$("btn-hint").addEventListener("click", showHint);

// Bladre-knapper
$("btn-first").addEventListener("click", () => setView(0));
$("btn-prev").addEventListener("click", () => setView(currentPly() - 1));
$("btn-next").addEventListener("click", () => setView(currentPly() + 1));
$("btn-last").addEventListener("click", () => setView(null));
$("btn-flip").addEventListener("click", () => {
  state.flipped = !state.flipped;
  drawAll();
});

// Piletasterne på tastaturet
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if (e.key === "Escape") { closeSettings(); closeAuth(); }
  if (currentPage === "review") {
    if (e.key === "ArrowLeft") Review.setView(Review.viewPly - 1);
    else if (e.key === "ArrowRight") Review.setView(Review.viewPly + 1);
    else if (e.key === "ArrowUp") Review.setView(0);
    else if (e.key === "ArrowDown") Review.setView(Review.moves.length);
    else return;
    e.preventDefault();
    return;
  }
  if (currentPage === "watch") {
    if (!Watch.famous || Watch.view !== "famous") return;
    Watch.stopAutoplay();
    if (e.key === "ArrowLeft") Watch.setFamousPly(Watch.famous.ply - 1);
    else if (e.key === "ArrowRight") Watch.setFamousPly(Watch.famous.ply + 1);
    return;
  }
  if (currentPage !== "play" && currentPage !== "puzzles") return;
  if (currentPage === "puzzles") {
    // På puzzle-siden bladrer piletasterne i løsningen
    if (!Puzzles.current) return;
    if (e.key === "ArrowLeft") Puzzles.setView(Puzzles.currentPly() - 1);
    else if (e.key === "ArrowRight") Puzzles.setView(Puzzles.currentPly() + 1);
    else if (e.key === "Escape") closeSettings();
    return;
  }
  if (e.key === "ArrowLeft") setView(currentPly() - 1);
  else if (e.key === "ArrowRight") setView(currentPly() + 1);
  else if (e.key === "ArrowUp") setView(0);
  else if (e.key === "ArrowDown") setView(null);
  else if (e.key === "Escape") closeSettings();
  else return;
  e.preventDefault();
});

// Nyt parti / omkamp
const rematch = () => {
  if (state.mode === "online") {
    if (!Online.conn || Online.disconnected) return showToast("Your friend is no longer connected");
    Online.requestRematch();
    els.gameOver.classList.add("hidden");
    return;
  }
  startNewGame(state.lastOptions);
};
$("btn-rematch").addEventListener("click", rematch);
$("btn-rematch-after").addEventListener("click", rematch);
const openReview = () => { if (state.recordedGame) Review.openGame(state.recordedGame); };
$("btn-review-game").addEventListener("click", openReview);
$("btn-review-after").addEventListener("click", openReview);
const newGameButton = () => switchTab(state.mode === "bot" ? "bots" : state.mode === "online" ? "friend" : "new");
$("btn-new-from-over").addEventListener("click", newGameButton);
$("btn-new-after").addEventListener("click", newGameButton);
$("btn-close-over").addEventListener("click", () => els.gameOver.classList.add("hidden"));


// ----- 9. Faner i panelet -----

function switchTab(tab) {
  // "Bots" og "Play a Friend" er undersider af "New Game", så den fane forbliver markeret
  const tabButton = tab === "bots" || tab === "friend" || tab === "coach" ? "new" : tab;
  document.querySelectorAll(".tab[data-tab]").forEach((t) => t.classList.toggle("active", t.dataset.tab === tabButton));
  ["play", "new", "bots", "coach", "friend", "games"].forEach((name) => {
    $("tab-" + name).classList.toggle("hidden", tab !== name);
  });
  if (tab !== "play") els.gameOver.classList.add("hidden");
  if (tab === "bots") drawBotsTab();
  if (tab === "coach") Coach.drawTab();
  if (tab === "friend") Online.draw();
  if (tab === "games") drawGamesTab();
}

// Fanen "Games": arkivet over spillede partier
function drawGamesTab() {
  const games = Accounts.profile().games;
  $("tab-games").innerHTML = `
    <div class="pz-scroll">
      <h2 class="pz-heading">Your games <span class="rv-muted">${games.length}</span></h2>
      ${gameListHTML(games)}
    </div>`;
}
$("tab-games").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-review-game]");
  if (btn) openArchivedGame(btn.dataset.reviewGame);
  const pgn = e.target.closest("[data-pgn-game]");
  if (pgn) downloadArchivedPGN(pgn.dataset.pgnGame);
});

document.querySelectorAll(".tab[data-tab]").forEach((t) => {
  t.addEventListener("click", () => switchTab(t.dataset.tab));
});


// ----- 10. "New Game"-fanen -----

function drawNewGameTab() {
  // Knappen der viser den valgte tid
  const tc = state.pendingTimeControl;
  const category = TIME_CONTROLS.find((c) => c.items.includes(tc));
  $("tc-toggle-label").textContent = category.category === "Unlimited" ? "No timer" : `${tc.label} (${category.category})`;
  $("tc-toggle-icon").innerHTML = `<use href="#${category.icon}"/>`;
  $("tc-toggle-icon").setAttribute("class", "tc-icon tc-" + category.category.toLowerCase());

  // Gitteret med alle tider
  $("tc-grid").innerHTML = TIME_CONTROLS.map((cat, ci) => `
    <div class="tc-category">
      <div class="tc-category-title">
        <svg class="tc-icon tc-${cat.category.toLowerCase()}"><use href="#${cat.icon}"/></svg>${cat.category}
      </div>
      <div class="tc-buttons">
        ${cat.items.map((item, ii) => `
          <button class="tc-btn ${item === tc ? "selected" : ""}" data-c="${ci}" data-i="${ii}">${item.label}</button>
        `).join("")}
      </div>
    </div>`).join("");

  // Spilletyper
  // "Play Online" (søg modstander) og "Pass and Play" kan vælges; de andre åbner deres egen fane
  if (!state.newMode) state.newMode = API.enabled ? "online" : "pass";
  $("mode-list").innerHTML = GAME_MODES.filter((m) => m.id !== "online" || API.enabled).map((mode) => {
    const selectable = mode.id === "online" || mode.id === "pass";
    return `
    <button class="mode ${mode.id === state.newMode ? "selected" : ""} ${mode.ready ? "" : "not-ready"}" data-mode="${mode.id}">
      <svg class="mode-icon"><use href="#${mode.icon}"/></svg>
      <span class="mode-text">
        <span class="mode-name">${mode.name}</span>
        <span class="mode-desc">${mode.ready ? mode.desc : "Coming soon"}</span>
      </span>
      ${selectable ? (mode.id === state.newMode ? '<svg class="mode-check"><use href="#i-check"/></svg>' : "") : '<svg class="mode-arrow"><use href="#i-next"/></svg>'}
    </button>`;
  }).join("");
  $("btn-start").textContent = state.newMode === "online" ? "Play" : "Start Game";
  // Variant-vælgeren
  const variant = findVariant(state.pendingVariant);
  if (!$("variant-select").options.length) {
    $("variant-select").innerHTML = VARIANTS.map((v) => `<option value="${v.id}">${v.icon} ${v.name}</option>`).join("");
  }
  $("variant-select").value = variant.id;
  $("variant-desc").textContent = isVariant(variant.id) ? variant.desc : "";
  // Online-partier og varianter starter altid fra udgangsstillingen
  document.querySelector("#tab-new .custom-pos").classList.toggle("hidden", state.newMode === "online" || isVariant(state.pendingVariant));
}

$("tc-toggle").addEventListener("click", () => {
  $("tc-grid").classList.toggle("hidden");
  $("tc-toggle").classList.toggle("open");
});

$("tc-grid").addEventListener("click", (e) => {
  const btn = e.target.closest(".tc-btn");
  if (!btn) return;
  state.pendingTimeControl = TIME_CONTROLS[btn.dataset.c].items[btn.dataset.i];
  $("tc-grid").classList.add("hidden");
  $("tc-toggle").classList.remove("open");
  drawNewGameTab();
});

$("mode-list").addEventListener("click", (e) => {
  const btn = e.target.closest(".mode");
  if (!btn) return;
  const mode = GAME_MODES.find((m) => m.id === btn.dataset.mode);
  if (mode.id === "bots") switchTab("bots");
  else if (mode.id === "coach") switchTab("coach");
  else if (mode.id === "friend") switchTab("friend");
  else { state.newMode = mode.id; drawNewGameTab(); }
});

$("variant-select").addEventListener("change", (e) => {
  state.pendingVariant = e.target.value;
  drawNewGameTab();
  drawBotsTab();
});

$("btn-start").addEventListener("click", () => {
  if (state.newMode === "online") return Matchmaking.find(state.pendingTimeControl, state.pendingVariant);
  if (isVariant(state.pendingVariant)) {
    // Varianter starter altid fra variantens egen startstilling
    startNewGame({ mode: "pass", timeControl: state.pendingTimeControl, variant: state.pendingVariant });
    return switchTab("play");
  }
  const startFen = readCustomFen();
  if (startFen === false) return; // ugyldig FEN
  startNewGame({ mode: "pass", timeControl: state.pendingTimeControl, startFen });
  switchTab("play");
});

// Selvvalgt startstilling (FEN) i "New Game"-fanen
$("custom-pos-toggle").addEventListener("change", (e) => {
  $("custom-fen").classList.toggle("hidden", !e.target.checked);
  if (!e.target.checked) state.pendingFen = null;
  drawBotsTab();
});
$("custom-fen").addEventListener("input", (e) => { state.pendingFen = e.target.value.trim() || null; });

// Læser FEN-feltet. null = standardstilling, false = ugyldig
function readCustomFen() {
  if (!state.pendingFen) return null;
  try {
    const chess = new Chess(state.pendingFen);
    if (chess.isGameOver()) { showToast("That position is already finished"); return false; }
    return chess.fen();
  } catch (error) {
    showToast("That FEN is not a valid chess position");
    return false;
  }
}

// Brug en stilling fra analysebrættet som startstilling
function setStartPosition(fen) {
  state.pendingFen = fen;
  $("custom-pos-toggle").checked = true;
  $("custom-fen").classList.remove("hidden");
  $("custom-fen").value = fen;
}


// ----- 11. "Play Bots"-siden -----

function drawBotsTab() {
  const bot = findBot(state.selectedBotId);

  // Den valgte bot vises stort med sin replik
  $("bot-hero").innerHTML = `
    <div class="bot-hero-avatar" style="background:${bot.color}">${bot.avatar}</div>
    <div class="bot-hero-info">
      <div class="bot-hero-name">${bot.name} <span class="player-rating">(${bot.rating})</span></div>
      <div class="bot-hero-bubble">${bot.intro}</div>
    </div>`;

  // Alle bots i grupper
  $("bot-groups").innerHTML = BOT_GROUPS.map((group) => `
    <div class="bot-group">
      <div class="bot-group-title">${group.name}</div>
      <div class="bot-grid">
        ${group.bots.map((b) => `
          <button class="bot-tile ${b.id === bot.id ? "selected" : ""}" data-bot="${b.id}" title="${b.name} (${b.rating})">
            <span class="bot-tile-avatar" style="background:${b.color}">${b.avatar}</span>
            <span class="bot-tile-name">${b.name}</span>
            <span class="bot-tile-rating">${b.rating}</span>
          </button>`).join("")}
      </div>
    </div>`).join("");

  // Valg af farve og coach
  document.querySelectorAll("#tab-bots .color-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.color === state.pendingColor);
  });
  $("bot-coach").checked = state.pendingCoach;
  // Vis hvis partiet starter fra en selvvalgt stilling – eller er en variant
  const variant = isVariant(state.pendingVariant) ? findVariant(state.pendingVariant) : null;
  $("bot-custom-pos").classList.toggle("hidden", !state.pendingFen || !!variant);
  $("bot-variant-note").classList.toggle("hidden", !variant);
  if (variant) $("bot-variant-note").textContent = `${variant.icon} Playing ${variant.name} (change it under New Game). Variant games don't change your bot rating.`;
}

$("bot-groups").addEventListener("click", (e) => {
  const tile = e.target.closest(".bot-tile");
  if (!tile) return;
  state.selectedBotId = tile.dataset.bot;
  drawBotsTab();
});

$("bot-coach").addEventListener("change", (e) => { state.pendingCoach = e.target.checked; });

document.querySelectorAll("#tab-bots .color-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.pendingColor = btn.dataset.color;
    drawBotsTab();
  });
});

$("btn-bots-back").addEventListener("click", () => switchTab("new"));

$("btn-play-bot").addEventListener("click", () => {
  const variant = state.pendingVariant || "chess";
  const startFen = isVariant(variant) ? null : readCustomFen();
  if (startFen === false) return;
  startNewGame({
    startFen,
    variant,
    mode: "bot",
    timeControl: NO_TIMER, // bot-partier er uden ur
    bot: findBot(state.selectedBotId),
    colorChoice: state.pendingColor,
    coach: state.pendingCoach,
  });
  switchTab("play");
});


// ----- 12. Indstillinger -----

function openSettings() {
  drawSettings();
  $("settings-modal").classList.remove("hidden");
}
function closeSettings() {
  $("settings-modal").classList.add("hidden");
}

function drawSettings() {
  // Brætfarver: små brætter man kan klikke på
  $("theme-list").innerHTML = Object.entries(BOARD_THEMES).map(([id, t]) => `
    <button class="theme-option ${settings.boardTheme === id ? "selected" : ""}" data-theme="${id}">
      <span class="theme-preview" style="--l:${t.light};--d:${t.dark}"></span>
      <span>${t.name}</span>
    </button>`).join("");

  // Accentfarve: knapper, logo og markeringer
  $("accent-list").innerHTML = Object.entries(ACCENT_THEMES).map(([id, a]) => `
    <button class="accent-option ${settings.accent === id ? "selected" : ""}" data-accent="${id}">
      <span class="accent-swatch" style="background:${a.base}"></span>
      <span>${a.name}</span>
    </button>`).join("");

  // Brik-sæt: viser konge, dronning og springer
  $("piece-set-list").innerHTML = Object.entries(PIECE_SETS).map(([id, name]) => `
    <button class="piece-set-option ${settings.pieceSet === id ? "selected" : ""}" data-set="${id}">
      <span class="piece-set-preview">
        ${["wK", "wQ", "wN", "bK", "bQ", "bN"].map((p) => `<img src="img/pieces/${id}/${p}.svg" alt="">`).join("")}
      </span>
      <span>${name}</span>
    </button>`).join("");

  // Til/fra-knapper
  const toggles = [
    ["showHints", "Show legal moves"],
    ["highlightLast", "Highlight last move"],
    ["showCoords", "Show coordinates"],
    ["figurine", "Piece icons in move list"],
    ["autoQueen", "Always promote to queen"],
    ["premoves", "Allow premoves"],
    ["evalBar", "Evaluation bar (bot & coach games)"],
    ["sounds", "Sounds"],
  ];
  $("toggle-list").innerHTML = toggles.map(([key, label]) => `
    <label class="toggle-row">
      <span>${label}</span>
      <input type="checkbox" data-key="${key}" ${settings[key] ? "checked" : ""}>
      <span class="switch"></span>
    </label>`).join("");

  // Udseende og hvordan man flytter brikker
  const select = (key, options) => `
    <select class="pz-select" data-select="${key}">
      ${options.map(([value, label]) => `<option value="${value}" ${settings[key] === value ? "selected" : ""}>${label}</option>`).join("")}
    </select>`;
  $("interface-list").innerHTML = `
    <div class="toggle-row"><span>Site theme</span>${select("siteTheme", [["dark", "Dark"], ["light", "Light"]])}</div>
    <div class="toggle-row"><span>Move pieces by</span>${select("moveMethod", [["both", "Drag or click"], ["drag", "Dragging only"], ["click", "Clicking only"]])}</div>
    <div class="toggle-row"><span>Piece animation</span>${select("animSpeed", [["none", "None"], ["fast", "Fast"], ["normal", "Normal"], ["slow", "Slow"]])}</div>`;
}

$("interface-list").addEventListener("change", (e) => {
  const key = e.target.dataset.select;
  if (!key) return;
  settings[key] = e.target.value;
  applySettingsChange();
});

$("settings-modal").addEventListener("click", (e) => {
  // Klik uden for vinduet lukker det
  if (e.target.id === "settings-modal") return closeSettings();

  const theme = e.target.closest(".theme-option");
  if (theme) settings.boardTheme = theme.dataset.theme;
  const accent = e.target.closest(".accent-option");
  if (accent) settings.accent = accent.dataset.accent;
  const set = e.target.closest(".piece-set-option");
  if (set) settings.pieceSet = set.dataset.set;
  if (theme || set || accent) applySettingsChange();
});

$("toggle-list").addEventListener("change", (e) => {
  settings[e.target.dataset.key] = e.target.checked;
  applySettingsChange();
});

function applySettingsChange() {
  saveSettings();
  applyBoardTheme();
  drawSettings();
  if (currentPage === "play") drawAll();
  else if (Pages[currentPage] && Pages[currentPage].draw) Pages[currentPage].draw();
}

$("btn-settings").addEventListener("click", openSettings);
$("btn-close-settings").addEventListener("click", closeSettings);


// ----- 13. Menuen i venstre side -----

// Menupunkter med data-nav skifter side, data-action gør noget andet
document.querySelectorAll(".sidebar [data-nav], .sidebar [data-action]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    const nav = el.dataset.nav;
    if (nav) {
      showPage(nav);
      if (nav === "play") switchTab("play");
      return;
    }
    const action = el.dataset.action;
    if (action === "settings") openSettings();
    else if (action === "help") showPage("help");
    else if (action === "collapse") {
      settings.sidebarCollapsed = !settings.sidebarCollapsed;
      saveSettings();
      document.body.classList.toggle("sidebar-collapsed", settings.sidebarCollapsed);
    }
  });
});


// ----- 14. Lille besked (toast) -----

let toastTimer = null;
function showToast(text) {
  const toast = $("toast");
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}


// ----- 15. Start -----

applyBoardTheme();
document.body.classList.toggle("sidebar-collapsed", settings.sidebarCollapsed);
drawNewGameTab();
document.body.dataset.page = "play";
startNewGame({ mode: "pass", timeControl: state.timeControl });