// ===================================================================
// puzzles.js – puzzle-træneren (virker ligesom på Lichess).
//
// Sådan virker et puzzle:
//  1. Brættet viser stillingen, og modstanderen laver sit træk (det
//     første træk i løsningen).
//  2. Spilleren skal finde det bedste svar. Rigtigt træk → "Best move!",
//     og modstanderen svarer. Forkert træk → "That's not the move!",
//     trækket tages tilbage, og man må prøve igen.
//  3. Når hele løsningen er spillet, er puzzlet løst. Løste man det uden
//     fejl, stiger ens puzzle-rating, ellers falder den.
//
// Der er også "Themes" (vælg en type puzzle, fx gafler) og "Streak"
// (stadig sværere puzzles – én fejl, og det er slut).
// ===================================================================

// ----- 1. Temaer -----

// Navn og forklaring på hvert tema, sorteret i grupper.
const PUZZLE_THEME_GROUPS = [
  { name: "Recommended", themes: {
    mix: ["Healthy mix", "A bit of everything. You don't know what to expect, so you remain ready for anything! Just like in real games."],
  } },
  { name: "Phases", themes: {
    opening: ["Opening", "A tactic during the first phase of the game."],
    middlegame: ["Middlegame", "A tactic during the second phase of the game."],
    endgame: ["Endgame", "A tactic during the last phase of the game."],
    rookEndgame: ["Rook endgame", "An endgame with only rooks and pawns."],
    bishopEndgame: ["Bishop endgame", "An endgame with only bishops and pawns."],
    knightEndgame: ["Knight endgame", "An endgame with only knights and pawns."],
    queenEndgame: ["Queen endgame", "An endgame with only queens and pawns."],
    queenRookEndgame: ["Queen and Rook", "An endgame with only queens, rooks and pawns."],
  } },
  { name: "Motifs", themes: {
    fork: ["Fork", "A move where the moved piece attacks two of the opponent's pieces at once."],
    pin: ["Pin", "A piece can't move without exposing a more valuable piece behind it."],
    skewer: ["Skewer", "A valuable piece is attacked and must move, exposing a piece behind it."],
    discoveredAttack: ["Discovered attack", "Moving one piece out of the way reveals an attack by another."],
    doubleCheck: ["Double check", "Checking with two pieces at once, so the king has to move."],
    hangingPiece: ["Hanging piece", "An opponent's piece is undefended or not defended enough. Take it!"],
    trappedPiece: ["Trapped piece", "A piece can't escape capture because it has nowhere safe to go."],
    sacrifice: ["Sacrifice", "Giving up material now to gain an advantage after a forced sequence."],
    deflection: ["Deflection", "Distracting a piece from an important duty, like guarding a square."],
    attraction: ["Attraction", "Luring an opponent's piece to a square where it can be attacked."],
    intermezzo: ["Intermezzo", "Instead of the expected move, first play an in-between move with a direct threat."],
    clearance: ["Clearance", "Clearing a square, file or diagonal for a follow-up idea."],
    capturingDefender: ["Capture the defender", "Removing a piece that defends another piece, which can then be taken."],
    xRayAttack: ["X-Ray attack", "A piece attacks or defends a square through an enemy piece."],
    interference: ["Interference", "Moving a piece between two enemy pieces to cut off their defense."],
    quietMove: ["Quiet move", "A move without check or capture that prepares an unstoppable threat."],
    defensiveMove: ["Defensive move", "A precise move or sequence needed to avoid losing material."],
    advancedPawn: ["Advanced pawn", "A pawn close to promotion is the key to the tactic."],
    promotion: ["Promotion", "Promoting a pawn to a queen or another piece."],
    kingsideAttack: ["Kingside attack", "An attack on the king after it castled short."],
    queensideAttack: ["Queenside attack", "An attack on the king after it castled long."],
    exposedKing: ["Exposed king", "A king with few defenders around it, often leading to checkmate."],
    attackingF2F7: ["Attacking f2 or f7", "An attack on the weak f2 or f7 pawn, like in the Fried Liver."],
  } },
  { name: "Checkmates", themes: {
    mate: ["Checkmate", "Win the game with style."],
    mateIn2: ["Mate in 2", "Deliver checkmate in two moves."],
    mateIn3: ["Mate in 3", "Deliver checkmate in three moves."],
    mateIn4: ["Mate in 4", "Deliver checkmate in four moves."],
    backRankMate: ["Back rank mate", "Checkmate the king on its home row, trapped by its own pieces."],
  } },
  { name: "Lengths", themes: {
    short: ["Short puzzle", "Two moves to win."],
    long: ["Long puzzle", "Three moves to win."],
    veryLong: ["Very long puzzle", "Four moves or more to win."],
  } },
  { name: "Goals", themes: {
    equality: ["Equality", "Come back from a losing position and save a draw or a balanced position."],
    advantage: ["Advantage", "Seize your chance to get a decisive advantage."],
    crushing: ["Crushing", "Spot the opponent's blunder to obtain a crushing advantage."],
  } },
];

// Alle temaer i ét opslag: id → [navn, forklaring]
const PUZZLE_THEMES = Object.assign({}, ...PUZZLE_THEME_GROUPS.map((g) => g.themes));

// Hvor mange puzzles der findes med hvert tema
const THEME_COUNTS = { mix: PUZZLES.length };
PUZZLES.forEach((p) => p[5].forEach((t) => { THEME_COUNTS[t] = (THEME_COUNTS[t] || 0) + 1; }));

// Sværhedsgrad: hvor meget sværere/lettere end ens rating puzzlene skal være
const DIFFICULTIES = [
  { id: -600, name: "Easiest" },
  { id: -300, name: "Easier" },
  { id: 0, name: "Normal" },
  { id: 300, name: "Harder" },
  { id: 600, name: "Hardest" },
];

const themeName = (id) => (PUZZLE_THEMES[id] ? PUZZLE_THEMES[id][0] : id);


// ----- 2. Spillerens puzzle-profil (gemmes i browseren) -----

const PUZZLE_KEY = "chessplace-puzzles";

function emptyPuzzleProfile() {
  return { rating: 1500, games: 0, history: [], rated: {}, streakBest: 0, theme: "mix", difficulty: 0 };
}

// Gæstens puzzles (gemt i browseren)
function loadPuzzleProfile() {
  try {
    return { ...emptyPuzzleProfile(), ...JSON.parse(localStorage.getItem(PUZZLE_KEY) || "{}") };
  } catch (error) {
    return emptyPuzzleProfile();
  }
}

// Logget ind online: puzzles er en del af kontoen og gemmes på serveren
function savePuzzleProfile() {
  if (Accounts.online()) return Accounts.save();
  try {
    localStorage.setItem(PUZZLE_KEY, JSON.stringify(Puzzles.profile));
  } catch (error) {
    // Kan ikke gemme – det virker stadig, indtil siden lukkes.
  }
}


// ----- 3. Selve puzzle-træneren -----

const Puzzles = {
  profile: (Accounts.online() && Accounts.profile().puzzles) || loadPuzzleProfile(),
  view: "train",        // hvilken fane: "train", "themes" eller "streak"
  mode: "train",        // "train" (almindelig) eller "streak"
  current: null,        // det puzzle man løser lige nu
  viewPly: null,        // null = live, ellers et tidligere træk (efter puzzlet er løst)
  animate: null,        // træk der skal glide på brættet ved næste tegning
  timers: [],           // ventende setTimeout'er (ryddes når et nyt puzzle starter)
  streak: { running: false, over: false, score: 0, skipUsed: false, used: new Set(), results: [] },

  // ----- Start et puzzle -----

  // Finder et puzzle tæt på en bestemt rating (og med det valgte tema).
  pick(targetRating, theme, exclude) {
    let pool = PUZZLES.filter((p) => (theme === "mix" || p[5].includes(theme)) && !exclude.has(p[0]));
    if (pool.length === 0) pool = PUZZLES.filter((p) => theme === "mix" || p[5].includes(theme));
    // Sortér efter hvor tæt de er på målet og vælg tilfældigt blandt de 12 nærmeste
    pool.sort((a, b) => Math.abs(a[3] - targetRating) - Math.abs(b[3] - targetRating));
    const top = pool.slice(0, 12);
    return top[Math.floor(Math.random() * top.length)];
  },

  // Dagens puzzle: alle får det samme puzzle hver dag (det skifter ved midnat)
  // Lichess' rigtige "Puzzle of the day" (eller et af vores egne, hvis Lichess ikke svarer)
  async daily() {
    this.mode = "train";
    let row = await this.lichessFetch("https://lichess.org/api/puzzle/daily");
    if (!row) {
      const pool = PUZZLES.filter((p) => p[3] >= 1100 && p[3] <= 1900);
      const day = Math.floor(Date.now() / 86400000); // antal dage siden 1970
      row = pool[day % pool.length];
    }
    this.load(row);
    this.current.daily = true;
    this.draw();
  },

  // Næste puzzle i almindelig træning: helst fra Lichess' store database (5 mio. puzzles)
  async nextTraining() {
    const p = this.profile;
    this.mode = "train";
    const token = ++this.loadToken;
    const row = (await this.fromLichess(p.rating + p.difficulty, p.theme)) ||
      this.pick(p.rating + p.difficulty, p.theme, new Set(Object.keys(p.rated)));
    if (token !== this.loadToken || this.mode !== "train") return; // man har klikket videre imens
    this.load(row);
  },

  // ----- Lichess' puzzle-database -----
  // Lichess vælger puzzles i forhold til en rating på 1500 (vi er ikke logget ind
  // på Lichess). Vi omregner derfor min rating + sværhedsgrad til Lichess' fem
  // sværhedsgrader – det dækker ca. 900–2100. Udenfor bruges vores egne puzzles.

  loadToken: 0,
  lichessRows: {},   // puzzles hentet fra Lichess: id → række (til "spil igen")
  lichessDown: 0,    // hvor mange gange Lichess ikke har svaret

  async fromLichess(target, theme) {
    if (!API.enabled || this.lichessDown >= 3) return null;
    const diff = target - 1500;
    if (Math.abs(diff) > 750) return null;
    const names = [["easiest", -600], ["easier", -300], ["normal", 0], ["harder", 300], ["hardest", 600]];
    const level = names.reduce((best, n) => (Math.abs(n[1] - diff) < Math.abs(best[1] - diff) ? n : best))[0];
    const angle = theme && theme !== "mix" ? `&angle=${encodeURIComponent(theme)}` : "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await this.lichessFetch(`https://lichess.org/api/puzzle/next?difficulty=${level}${angle}`);
      if (!row) return null;
      if (!(row[0] in this.profile.rated)) return row; // ikke spillet før
    }
    return null;
  },

  // Henter ét puzzle fra Lichess og laver det om til vores format:
  // [id, FEN før modstanderens træk, træk (UCI), rating, antal spil, temaer]
  async lichessFetch(url) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
      clearTimeout(timer);
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      // Spil partiet frem til puzzlet; det sidste træk er modstanderens
      const chess = new Chess();
      data.game.pgn.split(" ").filter(Boolean).forEach((san) => chess.move(san));
      const last = chess.undo();
      const line = [last.from + last.to + (last.promotion || ""), ...data.puzzle.solution].join(" ");
      const row = [data.puzzle.id, chess.fen(), line, data.puzzle.rating, data.puzzle.plays, data.puzzle.themes, "lichess"];
      this.lichessRows[row[0]] = row;
      this.lichessDown = 0;
      return row;
    } catch (e) {
      this.lichessDown++;
      return null;
    }
  },

  // Find et puzzle ud fra id (vores egne eller et hentet fra Lichess)
  findRow(id) {
    return PUZZLES.find((p) => p[0] === id) || this.lichessRows[id] || (this.profile.saved && this.profile.saved[id]) || null;
  },

  // Indlæser et puzzle og lader modstanderen lave det første træk.
  load(row) {
    this.clearTimers();
    const [id, fen, line, rating, plays, themes, source] = row;
    const chess = new Chess(fen);
    this.current = {
      id, rating, plays, themes, source,
      chess,
      line: line.split(" "),            // løsningen som UCI-træk, fx "e2e4"
      step: 0,                          // hvor langt i løsningen vi er
      solver: chess.turn() === "w" ? "b" : "w", // man spiller modsat den der trækker først
      positions: [fen],                 // stillinger til at bladre i bagefter
      moves: [],                        // de spillede træk
      mistakes: 0,
      status: "loading",                // loading → play → good/wrong → done
      feedback: "turn",
      result: null,                     // "win" eller "fail" når det er slut
      ratingDelta: null,
      // Allerede spillet før? Så ændres ratingen ikke igen
      rated: this.mode === "train" && !(id in this.profile.rated),
    };
    this.viewPly = null;
    board.showHint(null);
    this.draw();

    // Modstanderen trækker efter et kort øjeblik
    this.later(() => this.playOpponent(), this.mode === "rush" || this.mode === "storm" ? 350 : 700);
  },

  // Laver det næste træk i løsningen (modstanderens træk).
  playOpponent() {
    const c = this.current;
    const move = this.playLineMove();
    if (!move) return;
    c.status = "play";
    this.draw();
  },

  // Spiller det næste træk fra løsningen på brættet.
  playLineMove() {
    const c = this.current;
    const uci = c.line[c.step];
    if (!uci) return null;
    const move = c.chess.move(uciToMove(uci));
    this.recordMove(move);
    return move;
  },

  // Gemmer et træk og spiller lyden.
  recordMove(move) {
    const c = this.current;
    c.moves.push(move);
    c.positions.push(c.chess.fen());
    c.step++;
    this.animate = { from: move.from, to: move.to };
    playMoveSound(move);
  },

  // ----- Spillerens træk -----

  onMove(from, to, promotion) {
    const c = this.current;
    if (!c || c.status !== "play" || this.viewPly !== null) return;

    const expected = c.line[c.step];
    const uci = from + to + (promotion || "");
    const move = c.chess.move({ from, to, promotion });

    // Rigtigt træk – eller ethvert træk der giver skakmat (det tæller også)
    if (uci === expected || c.chess.isCheckmate()) {
      this.recordMove(move);
      if (this.mode === "storm") this.stormGood();
      this.animate = board.lastMoveWasDrag ? null : this.animate;

      if (c.step >= c.line.length || c.chess.isCheckmate()) {
        this.finish(true);
        return;
      }
      c.status = "good";
      c.feedback = "good";
      this.draw();
      // Modstanderen svarer
      this.later(() => this.playOpponent(), 500);
      return;
    }

    // Forkert træk: vis det kort, og tag det så tilbage
    c.mistakes++;
    if (this.mode === "storm") this.stormBad();
    c.status = "wrong";
    c.feedback = "fail";
    c.moves.push(move);
    c.positions.push(c.chess.fen());
    playMoveSound(move);
    this.draw();

    this.later(() => {
      c.chess.undo();
      c.moves.pop();
      c.positions.pop();
      if (this.mode === "rush" || this.mode === "storm") {
        // I Puzzle Rush og Storm går man bare videre til næste puzzle
        this.finish(false);
        return;
      }
      if (this.mode === "streak") {
        // I Streak er én fejl nok til at tabe. Vis det rigtige træk med en grøn pil.
        board.showHint(uciToMove(expected));
        this.finish(false);
        return;
      }
      c.status = "play";
      this.draw();
    }, 600);
  },

  // Viser løsningen: resten af trækkene spilles automatisk.
  viewSolution() {
    const c = this.current;
    if (!c || c.status !== "play") return;
    c.mistakes++;
    c.status = "solution";
    this.viewPly = null;
    this.draw();
    const step = () => {
      if (c.step >= c.line.length) {
        this.finish(false);
        return;
      }
      this.playLineMove();
      this.draw();
      this.later(step, 700);
    };
    this.later(step, 300);
  },

  // Streak: spring det nuværende træk over (én gang pr. streak).
  skipMove() {
    const c = this.current;
    if (this.mode !== "streak" || this.streak.skipUsed || !c || c.status !== "play") return;
    this.streak.skipUsed = true;
    this.playLineMove(); // trækket spilles for dig
    if (c.step >= c.line.length) {
      this.finish(true);
      return;
    }
    c.status = "good";
    c.feedback = "good";
    this.draw();
    this.later(() => this.playOpponent(), 500);
  },

  // ----- Puzzlet er slut -----

  finish(solved) {
    const c = this.current;
    c.status = "done";
    c.result = solved && c.mistakes === 0 ? "win" : "fail";
    c.feedback = c.result;

    if (c.rated) {
      // Ny rating med Elo-formlen: man får flere point for at løse svære puzzles
      const p = this.profile;
      const expected = 1 / (1 + Math.pow(10, (c.rating - p.rating) / 400));
      const k = p.games < 20 ? 40 : 20; // i starten flytter ratingen sig hurtigere
      const score = c.result === "win" ? 1 : 0;
      c.ratingDelta = Math.round(k * (score - expected));
      p.rating += c.ratingDelta;
      p.games++;
      p.rated[c.id] = c.result === "win" ? 1 : 0;
      p.history.unshift({ id: c.id, win: c.result === "win", rating: c.rating, delta: c.ratingDelta });
      // Lichess-puzzles gemmes (kort), så de kan spilles igen og tælle med i Dashboard
      if (c.source === "lichess") {
        p.saved = p.saved || {};
        p.saved[c.id] = this.lichessRows[c.id];
        const ids = Object.keys(p.saved);
        if (ids.length > 150) delete p.saved[ids[0]];
        p.info = p.info || {};
        p.info[c.id] = [c.rating, c.themes];
        const infoIds = Object.keys(p.info);
        if (infoIds.length > 2500) delete p.info[infoIds[0]];
      }
      p.history = p.history.slice(0, 30);
      // Til Puzzle Dashboard: hvornår puzzlet blev løst, og ratingen bagefter
      p.times = p.times || {};
      p.times[c.id] = Date.now();
      p.ratingLog = (p.ratingLog || []).concat({ t: Date.now(), r: p.rating }).slice(-1000);
      savePuzzleProfile();
    }

    if (c.result === "win") {
      playSound("start");
      this.profile.solved = (this.profile.solved || 0) + 1; // til præstationer
      savePuzzleProfile();
    }
    Achievements.check();

    // Puzzle Storm: tæl point og gå hurtigt videre
    if (this.mode === "storm") {
      const s = this.storm;
      s.results.push({ id: c.id, win: c.result === "win", rating: c.rating });
      if (c.result === "win") {
        s.score++;
        s.highest = Math.max(s.highest, c.rating);
      }
      this.draw();
      this.later(() => this.nextStorm(), c.result === "win" ? 200 : 300);
      return;
    }

    // Puzzle Rush: tæl point eller kryds, og gå hurtigt videre
    if (this.mode === "rush") {
      const r = this.rush;
      r.results.push({ id: c.id, win: c.result === "win", rating: c.rating });
      if (c.result === "win") r.score++;
      else r.strikes++;
      // Fortæl modstanderen i Puzzle Battle, hvordan det går
      if (r.battle) Friends.send(r.battle.opp, { type: "battle-progress", name: Accounts.name(), id: r.battle.id, score: r.score, strikes: r.strikes });
      if (r.strikes >= 3) return this.endRush("3 strikes");
      this.draw();
      this.later(() => this.nextRush(), c.result === "win" ? 250 : 700);
      return;
    }

    // Streak: fortsæt automatisk, eller slut hvis man fejlede
    if (this.mode === "streak") {
      const s = this.streak;
      s.results.push({ id: c.id, win: c.result === "win", rating: c.rating });
      if (c.result === "win") {
        s.score++;
        this.draw();
        this.later(() => this.nextStreak(), 1200);
        return;
      }
      s.running = false;
      s.over = true;
      if (s.score > this.profile.streakBest) {
        this.profile.streakBest = s.score;
        savePuzzleProfile();
      }
      playSound("end");
    }
    this.draw();
  },

  // ----- Puzzle Rush -----
  // Løs så mange puzzles som muligt. 3 forkerte = slut. I "3 min" og "5 min" er der også et ur.

  rush: { running: false, over: false, mode: "3", score: 0, strikes: 0, used: new Set(), results: [], endTime: 0 },

  // battle = null for almindelig Rush, ellers info om Puzzle Battle mod en ven
  startRush(mode, battle = null) {
    clearInterval(this.rushTimer);
    const seconds = mode === "survival" ? null : Number(mode) * 60;
    this.rush = { running: true, over: false, mode, score: 0, strikes: 0, used: new Set(), results: [],
      endTime: seconds ? Date.now() + seconds * 1000 : null, battle };
    if (seconds) this.rushTimer = setInterval(() => this.tickRush(), 200);
    playSound("start");
    this.nextRush();
  },

  nextRush() {
    const r = this.rush;
    if (!r.running) return;
    // Starter meget let og bliver hurtigt sværere
    const target = Math.min(2600, 600 + r.score * 55);
    // I Puzzle Battle får begge spillere præcis de samme puzzles i samme rækkefølge
    const row = r.battle ? r.battle.list[r.battle.idx++ % r.battle.list.length] : this.pick(target, "mix", r.used);
    r.used.add(row[0]);
    this.mode = "rush";
    this.load(row);
  },

  tickRush() {
    const r = this.rush;
    if (!r.running) return clearInterval(this.rushTimer);
    const el = $("rush-time");
    const left = Math.max(0, r.endTime - Date.now());
    if (el) {
      el.textContent = ChessClock.format(left);
      el.classList.toggle("low", left < 20000);
    }
    if (left <= 0) this.endRush("Time's up");
  },

  endRush(reason) {
    const r = this.rush;
    if (!r.running) return;
    clearInterval(this.rushTimer);
    this.clearTimers();
    r.running = false;
    r.over = true;
    r.reason = reason;
    if (this.current) this.current.status = "done";
    const best = (this.profile.rushBest = this.profile.rushBest || {});
    if (r.battle) {
      // Puzzle Battle tæller ikke som Rush-rekord. Send min slutscore.
      r.newBest = false;
      Friends.send(r.battle.opp, { type: "battle-done", name: Accounts.name(), id: r.battle.id, score: r.score });
    } else {
      r.newBest = r.score > (best[r.mode] || 0);
      if (r.newBest) best[r.mode] = r.score;
    }
    savePuzzleProfile();
    playSound("end");
    Achievements.check();
    this.draw();
  },

  rushHTML() {
    const r = this.rush;
    const best = this.profile.rushBest || {};
    const modes = [["3", "3 min"], ["5", "5 min"], ["survival", "Survival"]];
    if (!r.running && !r.over) {
      return `
        <div class="pz-scroll pz-streak-intro">
          <svg class="pz-streak-logo rush-logo"><use href="#i-clock"/></svg>
          <h2>Puzzle Rush</h2>
          <p>Solve as many puzzles as you can. They start easy and get harder fast.</p>
          <p>Three wrong moves and the run is over!</p>
          <div class="rush-modes">
            ${modes.map(([id, name]) => `
              <button class="rush-mode" data-pz-rush="${id}">
                <b>${name}</b><span>Best: ${best[id] || 0}</span>
              </button>`).join("")}
          </div>
        </div>`;
    }
    const strikes = [0, 1, 2].map((i) => `<span class="strike ${i < r.strikes ? "hit" : ""}">✕</span>`).join("");
    if (r.battle) return this.battleHTML(strikes);
    const tiles = r.results.map((x) => `<span class="pz-hist ${x.win ? "win" : "fail"}"><span>${x.rating}</span></span>`).join("");
    const modeName = modes.find(([id]) => id === r.mode)[1];
    return `
      <div class="pz-scroll">
        <div class="rush-top">
          <div class="rush-score"><span>${r.score}</span><small>${modeName}</small></div>
          ${r.endTime ? `<div class="rush-time ${r.over ? "" : ""}" id="rush-time">${ChessClock.format(Math.max(0, r.endTime - Date.now()))}</div>` : ""}
          <div class="rush-strikes">${strikes}</div>
        </div>
        ${r.over ? `
          <div class="pz-streak-over rush-over">
            <b>${r.reason}!</b>
            <span>Score: <b>${r.score}</b> ${r.newBest ? "· 🎉 New best!" : `· Best: ${best[r.mode] || 0}`}</span>
          </div>
          <div class="pz-actions"><button class="btn btn-green btn-huge" data-pz-rush="${r.mode}">Play again</button></div>
          <button class="btn btn-gray btn-small" data-pz="rush-menu">Other modes</button>` : `
          ${this.feedbackHTML()}
          <button class="btn btn-gray btn-small" data-pz="rush-end">End run</button>`}
        ${tiles ? `<div class="pz-box"><div class="pz-box-title">This run</div><div class="pz-history">${tiles}</div></div>` : ""}
      </div>`;
  },

  // ----- Puzzle Storm (ligesom på Lichess) -----
  // 3 minutter. Hvert rigtigt træk giver "combo" – ved 5, 12, 20 og 30 i træk
  // får man ekstra tid. Et forkert træk koster 10 sekunder og nulstiller combo'en.

  storm: { running: false, over: false, score: 0, combo: 0, maxCombo: 0, moves: 0, wrong: 0,
    highest: 0, endTime: null, startTime: null, used: new Set(), results: [], flash: null },

  // Combo-niveauer og hvor mange sekunder man får for at nå dem
  STORM_LEVELS: [[5, 3], [12, 5], [20, 7], [30, 10]],

  startStorm() {
    clearInterval(this.stormTimer);
    this.storm = { running: true, over: false, score: 0, combo: 0, maxCombo: 0, moves: 0, wrong: 0,
      highest: 0, endTime: null, startTime: null, used: new Set(), results: [], flash: null };
    // Uret starter først ved ens første træk
    this.stormTimer = setInterval(() => this.tickStorm(), 200);
    this.nextStorm();
  },

  nextStorm() {
    const s = this.storm;
    if (!s.running) return;
    // Starter let (ca. 900) og bliver sværere for hvert løst puzzle
    const target = Math.min(2500, 900 + s.score * 35);
    const row = this.pick(target, "mix", s.used);
    s.used.add(row[0]);
    this.mode = "storm";
    this.load(row);
  },

  // Start uret ved første træk
  stormStartClock() {
    const s = this.storm;
    if (!s.endTime) {
      s.startTime = Date.now();
      s.endTime = Date.now() + 180000;
    }
  },

  // Rigtigt træk: combo +1, og måske bonus-tid
  stormGood() {
    const s = this.storm;
    this.stormStartClock();
    s.moves++;
    s.combo++;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    let bonus = 0;
    const level = this.STORM_LEVELS.find(([n]) => n === s.combo);
    if (level) bonus = level[1];
    else if (s.combo > 30 && s.combo % 10 === 0) bonus = 10; // efter 30: +10 sek. for hver 10
    if (bonus) {
      s.endTime += bonus * 1000;
      s.flash = { text: `+${bonus}s`, good: true, at: Date.now() };
    }
  },

  // Forkert træk: -10 sekunder og combo nulstilles
  stormBad() {
    const s = this.storm;
    this.stormStartClock();
    s.moves++;
    s.wrong++;
    s.combo = 0;
    s.endTime -= 10000;
    s.flash = { text: "-10s", good: false, at: Date.now() };
  },

  tickStorm() {
    const s = this.storm;
    if (!s.running) return clearInterval(this.stormTimer);
    if (!s.endTime) return;
    const left = Math.max(0, s.endTime - Date.now());
    const el = $("storm-time");
    if (el) {
      el.textContent = ChessClock.format(left);
      el.classList.toggle("low", left < 20000);
    }
    if (left <= 0) this.endStorm();
  },

  endStorm() {
    const s = this.storm;
    if (!s.running) return;
    clearInterval(this.stormTimer);
    this.clearTimers();
    s.running = false;
    s.over = true;
    s.duration = s.startTime ? Math.min(Date.now(), s.endTime) - s.startTime : 0;
    if (this.current) this.current.status = "done";
    s.newBest = s.score > (this.profile.stormBest || 0);
    if (s.newBest) this.profile.stormBest = s.score;
    savePuzzleProfile();
    playSound("end");
    this.draw();
  },

  // Combo-bjælken: hvor langt er der til næste bonus?
  comboHTML() {
    const s = this.storm;
    const levels = [0, 5, 12, 20, 30];
    let from = 0, to = 5;
    for (let i = 0; i < levels.length; i++) {
      if (s.combo >= levels[i]) { from = levels[i]; to = levels[i + 1] || from + 10; }
    }
    if (s.combo >= 30) { from = Math.floor(s.combo / 10) * 10; to = from + 10; }
    const pct = ((s.combo - from) / (to - from)) * 100;
    return `
      <div class="storm-combo">
        <div class="storm-combo-num"><b>${s.combo}</b><span>Combo</span></div>
        <div class="storm-combo-bar"><span style="width:${pct}%"></span></div>
      </div>`;
  },

  stormHTML() {
    const s = this.storm;
    const best = this.profile.stormBest || 0;
    if (!s.running && !s.over) {
      return `
        <div class="pz-scroll pz-streak-intro">
          <svg class="pz-streak-logo storm-logo"><use href="#i-storm"/></svg>
          <h2>Puzzle Storm</h2>
          <p>Solve as many puzzles as possible in 3 minutes.</p>
          <p>Every correct move builds your <b>combo</b>. Reach 5, 12, 20 and 30 in a row for extra time!</p>
          <p>A wrong move costs <b>10 seconds</b> and resets your combo.</p>
          <div class="pz-best">Your best storm: <b>${best}</b></div>
          <button class="btn btn-green btn-huge" data-pz="storm-start">Start</button>
        </div>`;
    }

    const tiles = s.results.map((r) => `<span class="pz-hist ${r.win ? "win" : "fail"}"><span>${r.rating}</span></span>`).join("");
    if (s.over) {
      const acc = s.moves ? Math.round(((s.moves - s.wrong) / s.moves) * 100) : 0;
      const secs = Math.round(s.duration / 1000);
      const stat = (value, label) => `<div class="dash-card"><b>${value}</b><span>${label}</span></div>`;
      return `
        <div class="pz-scroll">
          <div class="storm-result">
            <span>${s.newBest ? "🎉 New best!" : "Storm over"}</span>
            <b>${s.score}</b>
            <span class="rv-muted">puzzles solved · best ${best}</span>
          </div>
          <div class="dash-cards storm-stats">
            ${stat(s.moves, "Moves")}
            ${stat(acc + "%", "Accuracy")}
            ${stat(s.maxCombo, "Best combo")}
            ${stat(Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0"), "Time")}
            ${stat(s.moves ? (secs / s.moves).toFixed(1) + "s" : "–", "Per move")}
            ${stat(s.highest || "–", "Highest solved")}
          </div>
          <div class="pz-actions">
            <button class="btn btn-green btn-huge" data-pz="storm-start">Play again</button>
            <button class="btn btn-gray pz-solution-btn" data-pz="analyze"><svg class="btn-icon"><use href="#i-search"/></svg>Analyze last puzzle</button>
          </div>
          ${s.results.length ? `<div class="pz-box"><div class="pz-box-title">This storm · click a puzzle to try it again</div><div class="pz-history">${s.results.map((r) => `
            <button class="pz-hist ${r.win ? "win" : "fail"}" data-replay="${r.id}" title="Puzzle #${r.id} – click to replay"><span>${r.rating}</span></button>`).join("")}</div></div>` : ""}
        </div>`;
    }

    // Bonus/straf vises et øjeblik ved uret
    const flash = s.flash && Date.now() - s.flash.at < 1200
      ? `<span class="storm-flash ${s.flash.good ? "good" : "bad"}">${s.flash.text}</span>` : "";
    return `
      <div class="pz-scroll">
        <div class="storm-top">
          <div class="rush-score"><span>${s.score}</span><small>Solved</small></div>
          <div class="storm-clock">
            <div class="rush-time" id="storm-time">${ChessClock.format(s.endTime ? Math.max(0, s.endTime - Date.now()) : 180000)}</div>
            ${flash}
          </div>
        </div>
        ${this.comboHTML()}
        ${s.endTime ? "" : `<p class="rv-muted rv-center">The clock starts with your first move.</p>`}
        ${this.feedbackHTML()}
        <button class="btn btn-gray btn-small" data-pz="storm-end">End storm</button>
        ${tiles ? `<div class="pz-box"><div class="pz-box-title">This storm</div><div class="pz-history">${tiles}</div></div>` : ""}
      </div>`;
  },

  // ----- Puzzle Battle (mod en ven) -----
  // Begge får de samme puzzles (lavet ud fra et fælles "frø"/seed).
  // 3 minutter og 3 fejl – den der løser flest, vinder.

  // Laver den samme liste puzzles ud fra et tal – så begge spillere får den samme
  battleList(seed) {
    // Lille tilfældigheds-generator (mulberry32), der altid giver de samme tal for det samme seed
    let a = seed >>> 0;
    const random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const used = new Set();
    const list = [];
    for (let i = 0; i < 80; i++) {
      const target = Math.min(2600, 600 + i * 50);
      const pool = PUZZLES.filter((p) => !used.has(p[0]))
        .sort((x, y) => Math.abs(x[3] - target) - Math.abs(y[3] - target) || (x[0] < y[0] ? -1 : 1))
        .slice(0, 12);
      const row = pool[Math.floor(random() * pool.length)];
      used.add(row[0]);
      list.push(row);
    }
    return list;
  },

  inviteBattle(name) {
    if (!Friends.isOnline(name)) return showToast(`${name} is offline`);
    const id = Date.now().toString(36);
    const seed = Math.floor(Math.random() * 1e9);
    this.battleInvite = { id, seed, name };
    Friends.send(name, { type: "battle-invite", name: Accounts.name(), id, seed });
    showToast(`Puzzle Battle sent to ${name} – waiting for them to accept…`);
  },

  acceptBattle(name, msg) {
    Friends.send(name, { type: "battle-accept", name: Accounts.name(), id: msg.id });
    this.startBattle(name, msg.id, msg.seed);
  },

  startBattle(opp, id, seed) {
    this.battleInvite = null;
    this.view = "rush";
    showPage("puzzles");
    this.startRush("3", { opp, id, seed, list: this.battleList(seed), idx: 0, oppScore: 0, oppStrikes: 0, oppDone: false });
    showToast(`Puzzle Battle vs ${opp} – go!`);
  },

  // Beskeder fra vennen om Puzzle Battle
  battleMessage(name, msg) {
    const r = this.rush;
    const mine = r.battle && r.battle.id === msg.id;
    switch (msg.type) {
      case "battle-invite":
        showChallenge(name, { ...msg, kind: "battle" });
        break;
      case "battle-accept":
        if (this.battleInvite && this.battleInvite.id === msg.id) this.startBattle(name, msg.id, this.battleInvite.seed);
        break;
      case "battle-decline":
        if (this.battleInvite && this.battleInvite.id === msg.id) this.battleInvite = null;
        notify(`${name} declined your Puzzle Battle`);
        break;
      case "battle-progress":
        if (!mine) return;
        r.battle.oppScore = Number(msg.score) || 0;
        r.battle.oppStrikes = Number(msg.strikes) || 0;
        this.draw();
        break;
      case "battle-done":
        if (!mine) return;
        r.battle.oppScore = Number(msg.score) || 0;
        r.battle.oppDone = true;
        this.draw();
        break;
    }
  },

  battleHTML(strikes) {
    const r = this.rush;
    const b = r.battle;
    const oppStrikes = [0, 1, 2].map((i) => `<span class="strike small ${i < b.oppStrikes ? "hit" : ""}">✕</span>`).join("");
    const tiles = r.results.map((x) => `<span class="pz-hist ${x.win ? "win" : "fail"}"><span>${x.rating}</span></span>`).join("");

    // Resultat når begge er færdige
    let result = "";
    if (r.over) {
      if (!b.oppDone) result = `<b>Waiting for ${escapeHTML(b.opp)} to finish…</b><span>They have ${b.oppScore} so far.</span>`;
      else if (r.score > b.oppScore) result = `<b>🏆 You won!</b><span>${r.score} – ${b.oppScore} vs ${escapeHTML(b.opp)}</span>`;
      else if (r.score < b.oppScore) result = `<b>${escapeHTML(b.opp)} won</b><span>${r.score} – ${b.oppScore}. Rematch?</span>`;
      else result = `<b>It's a tie!</b><span>${r.score} – ${b.oppScore}</span>`;
    }
    return `
      <div class="pz-scroll">
        <div class="battle-title"><svg><use href="#i-friend"/></svg>Puzzle Battle</div>
        <div class="battle-board">
          <div class="battle-side me"><span class="battle-name">You</span><span class="battle-score">${r.score}</span><div class="rush-strikes">${strikes}</div></div>
          <div class="rush-time ${r.over ? "" : ""}" id="rush-time">${ChessClock.format(Math.max(0, r.endTime - Date.now()))}</div>
          <div class="battle-side"><span class="battle-name">${escapeHTML(b.opp)}</span><span class="battle-score">${b.oppScore}</span><div class="rush-strikes">${oppStrikes}</div></div>
        </div>
        ${r.over ? `
          <div class="pz-streak-over rush-over">${result}</div>
          <div class="pz-actions">
            ${b.oppDone && Friends.isOnline(b.opp) ? `<button class="btn btn-green btn-huge" data-pz-battle="${escapeHTML(b.opp)}">Rematch</button>` : ""}
            <button class="btn btn-gray pz-solution-btn" data-pz="rush-menu">Back to Puzzle Rush</button>
          </div>` : `
          ${this.feedbackHTML()}
          <button class="btn btn-gray btn-small" data-pz="rush-end">Give up</button>`}
        ${tiles ? `<div class="pz-box"><div class="pz-box-title">Your puzzles</div><div class="pz-history">${tiles}</div></div>` : ""}
      </div>`;
  },

  // ----- Streak -----

  startStreak() {
    this.streak = { running: true, over: false, score: 0, skipUsed: false, used: new Set(), results: [] };
    this.nextStreak();
  },

  nextStreak() {
    const s = this.streak;
    // Første puzzle er let (ca. 650), og hvert løst puzzle gør det næste lidt sværere
    const target = Math.min(2700, 650 + s.score * 75);
    const row = this.pick(target, "mix", s.used);
    s.used.add(row[0]);
    this.mode = "streak";
    this.load(row);
  },

  // ----- Hjælpefunktioner -----

  later(fn, ms) {
    this.timers.push(setTimeout(fn, ms));
  },

  clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  },

  // Bladre i trækkene efter puzzlet er løst
  setView(ply) {
    const c = this.current;
    if (!c || c.status !== "done") return;
    const total = c.positions.length - 1;
    ply = Math.max(0, Math.min(total, ply));
    const old = this.viewPly === null ? total : this.viewPly;
    if (ply === old) return;
    if (ply === old + 1) this.animate = { from: c.moves[ply - 1].from, to: c.moves[ply - 1].to };
    this.viewPly = ply === total ? null : ply;
    if (ply > 0) playMoveSound(c.moves[ply - 1]);
    this.draw();
  },

  currentPly() {
    const c = this.current;
    return this.viewPly === null ? c.positions.length - 1 : this.viewPly;
  },

  // ----- Tegning -----

  draw() {
    if (currentPage !== "puzzles") return;
    this.drawBoard();
    this.drawPanel();
  },

  drawBoard() {
    const c = this.current;
    if (!c) return;
    const ply = this.currentPly();
    const chess = this.viewPly === null ? c.chess : new Chess(c.positions[ply]);
    const lastMove = settings.highlightLast && ply > 0 ? c.moves[ply - 1] : null;
    board.draw({
      chess,
      flipped: c.solver === "b",
      lastMove,
      interactive: c.status === "play" && this.viewPly === null,
      movableColor: c.solver,
      animate: this.animate,
    });
    this.animate = null;
  },

  drawPanel() {
    document.querySelectorAll("[data-ptab]").forEach((t) => t.classList.toggle("active", t.dataset.ptab === this.view));
    $("pz-train").classList.toggle("hidden", this.view !== "train");
    $("pz-themes").classList.toggle("hidden", this.view !== "themes");
    $("pz-streak").classList.toggle("hidden", this.view !== "streak");
    $("pz-rush").classList.toggle("hidden", this.view !== "rush");
    $("pz-dashboard").classList.toggle("hidden", this.view !== "dashboard");
    $("pz-storm").classList.toggle("hidden", this.view !== "storm");
    if (this.view === "storm") $("pz-storm").innerHTML = this.stormHTML();
    if (this.view === "rush") $("pz-rush").innerHTML = this.rushHTML();
    if (this.view === "dashboard") $("pz-dashboard").innerHTML = this.dashboardHTML();

    if (this.view === "train") $("pz-train").innerHTML = this.trainHTML();
    if (this.view === "themes") $("pz-themes").innerHTML = this.themesHTML();
    if (this.view === "streak") $("pz-streak").innerHTML = this.streakHTML();
  },

  // Boksen med info om puzzlet (id, rating, temaer)
  infoHTML() {
    const c = this.current;
    if (!c) return "";
    const done = c.status === "done";
    const themes = done
      ? `<div class="pz-themes-list">${c.themes.filter((t) => PUZZLE_THEMES[t]).map((t) => `<span class="pz-chip">${themeName(t)}</span>`).join("")}</div>`
      : "";
    return `
      <div class="pz-info">
        <svg class="pz-info-icon"><use href="#i-puzzle"/></svg>
        <div>
          <div class="pz-info-title">${c.daily ? "Daily Puzzle · " + new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Puzzle #" + c.id}</div>
          ${c.source === "lichess" ? `<div class="pz-info-line">From the <a href="https://lichess.org/training/${c.id}" target="_blank" rel="noopener">Lichess puzzle database</a></div>` : ""}
          <div class="pz-info-line">Rating: <b>${done ? c.rating : "hidden"}</b></div>
          <div class="pz-info-line">Played ${c.plays.toLocaleString("en-US")} times</div>
        </div>
      </div>
      ${themes}`;
  },

  // Den store boks der fortæller, hvordan det går
  feedbackHTML() {
    const c = this.current;
    if (!c) return "";
    const colorName = c.solver === "w" ? "white" : "black";
    const king = `<img class="pz-fb-piece" src="${pieceUrl(c.solver, "k")}" alt="">`;

    if (c.status === "loading") {
      return `<div class="pz-feedback">${king}<div><b>Get ready…</b><span>Your opponent is about to move.</span></div></div>`;
    }
    if (c.status === "solution") {
      return `<div class="pz-feedback">${king}<div><b>Here is the solution</b><span>Watch closely…</span></div></div>`;
    }
    if (c.status === "done") {
      if (c.result === "win") {
        return `<div class="pz-feedback win"><svg class="pz-fb-icon"><use href="#i-check"/></svg><div><b>Success!</b><span>Puzzle complete!</span></div></div>`;
      }
      const text = this.mode === "streak" ? "That's not the move!" : "Puzzle complete!";
      return `<div class="pz-feedback fail"><svg class="pz-fb-icon"><use href="#i-close"/></svg><div><b>${text}</b><span>${this.mode === "streak" ? "Your streak is over." : "Try another one."}</span></div></div>`;
    }
    if (c.feedback === "fail") {
      return `<div class="pz-feedback fail"><svg class="pz-fb-icon"><use href="#i-close"/></svg><div><b>That's not the move!</b><span>Try something else.</span></div></div>`;
    }
    if (c.feedback === "good") {
      return `<div class="pz-feedback good"><svg class="pz-fb-icon"><use href="#i-check"/></svg><div><b>Best move!</b><span>Keep going…</span></div></div>`;
    }
    return `<div class="pz-feedback">${king}<div><b>Your turn</b><span>Find the best move for ${colorName}.</span></div></div>`;
  },

  // Knapper til at bladre i løsningen (efter puzzlet er løst)
  navHTML() {
    const c = this.current;
    if (!c || c.status !== "done") return "";
    const ply = this.currentPly();
    const total = c.positions.length - 1;
    return `
      <div class="pz-nav">
        <button class="nav-btn" data-pz="first" ${ply === 0 ? "disabled" : ""}><svg><use href="#i-first"/></svg></button>
        <button class="nav-btn" data-pz="prev" ${ply === 0 ? "disabled" : ""}><svg><use href="#i-prev"/></svg></button>
        <button class="nav-btn" data-pz="next" ${ply === total ? "disabled" : ""}><svg><use href="#i-next"/></svg></button>
        <button class="nav-btn" data-pz="last" ${ply === total ? "disabled" : ""}><svg><use href="#i-last"/></svg></button>
      </div>`;
  },

  // Fanen "Puzzles"
  trainHTML() {
    const c = this.current;
    const p = this.profile;
    const done = c && c.status === "done";

    let actions = "";
    if (done) actions = `<button class="btn btn-green btn-huge" data-pz="continue">Continue training</button>
      <button class="btn btn-gray pz-solution-btn" data-pz="analyze"><svg class="btn-icon"><use href="#i-search"/></svg>Analyze</button>`;
    else if (c && c.mistakes > 0 && c.status === "play") actions = `<button class="btn btn-gray pz-solution-btn" data-pz="solution">View the solution</button>`;

    // Rating-ændring (+12 grøn / -8 rød)
    let delta = "";
    if (done && c.ratingDelta !== null) {
      const cls = c.ratingDelta >= 0 ? "up" : "down";
      delta = `<span class="pz-delta ${cls}">${c.ratingDelta >= 0 ? "+" : ""}${c.ratingDelta}</span>`;
    } else if (done && !c.rated) {
      delta = `<span class="pz-delta">not rated</span>`;
    }

    // De seneste puzzles som små farvede felter
    const history = p.history.slice(0, 15).map((h) => `
      <button class="pz-hist ${h.win ? "win" : "fail"}" data-replay="${h.id}" title="Puzzle #${h.id} – click to replay">
        <span>${h.rating}</span>
      </button>`).join("");

    return `
      <div class="pz-scroll">
        ${this.infoHTML()}
        ${this.feedbackHTML()}
        <div class="pz-actions">${actions}</div>
        ${this.navHTML()}

        <div class="pz-box">
          <div class="pz-rating">
            <span class="pz-rating-label">Your puzzle rating</span>
            <span class="pz-rating-value">${p.rating}${delta}</span>
          </div>
          <div class="pz-setting">
            <span>Theme</span>
            <button class="pz-theme-btn" data-pz="themes">${themeName(p.theme)} <svg><use href="#i-next"/></svg></button>
          </div>
          <div class="pz-setting">
            <span>Difficulty</span>
            <select class="pz-select" id="pz-difficulty">
              ${DIFFICULTIES.map((d) => `<option value="${d.id}" ${d.id === p.difficulty ? "selected" : ""}>${d.name}</option>`).join("")}
            </select>
          </div>
        </div>

        ${history ? `<div class="pz-box"><div class="pz-box-title">Recent puzzles</div><div class="pz-history">${history}</div></div>` : ""}
      </div>`;
  },

  // Fanen "Themes"
  themesHTML() {
    return `
      <div class="pz-scroll">
        <h2 class="pz-heading">Puzzle themes</h2>
        ${PUZZLE_THEME_GROUPS.map((group) => {
          const items = Object.entries(group.themes)
            .filter(([id]) => (THEME_COUNTS[id] || 0) >= 5) // kun temaer med nok puzzles
            .map(([id, [name, desc]]) => `
              <button class="pz-theme ${this.profile.theme === id ? "selected" : ""}" data-theme-pick="${id}">
                <span class="pz-theme-top"><b>${name}</b><span class="pz-theme-count">${THEME_COUNTS[id]}</span></span>
                <span class="pz-theme-desc">${desc}</span>
              </button>`).join("");
          return items ? `<div class="pz-theme-group"><div class="pz-box-title">${group.name}</div>${items}</div>` : "";
        }).join("")}
      </div>`;
  },

  // Fanen "Streak"
  streakHTML() {
    const s = this.streak;
    const best = this.profile.streakBest;

    if (!s.running && !s.over) {
      return `
        <div class="pz-scroll pz-streak-intro">
          <svg class="pz-streak-logo"><use href="#i-bolt"/></svg>
          <h2>Puzzle Streak</h2>
          <p>Solve progressively harder puzzles and build a win streak.</p>
          <p>There is no clock, so take your time. One wrong move, and it's game over!</p>
          <p>But you can skip one move per session.</p>
          <div class="pz-best">Your best streak: <b>${best}</b></div>
          <button class="btn btn-green btn-huge" data-pz="streak-start">Play</button>
        </div>`;
    }

    const tiles = s.results.map((r) => `<span class="pz-hist ${r.win ? "win" : "fail"}"><span>${r.rating}</span></span>`).join("");

    return `
      <div class="pz-scroll">
        <div class="pz-streak-score">
          <svg><use href="#i-bolt"/></svg>
          <span class="pz-streak-number">${s.score}</span>
          <span class="pz-streak-label">${s.over ? "Final streak" : "Streak"}</span>
        </div>
        ${this.feedbackHTML()}
        ${s.over ? `
          <div class="pz-streak-over">
            <b>Game over</b>
            <span>Your streak: ${s.score} · Best: ${best}</span>
          </div>
          <div class="pz-actions">
            <button class="btn btn-green btn-huge" data-pz="streak-start">Play again</button>
            <button class="btn btn-gray pz-solution-btn" data-pz="analyze"><svg class="btn-icon"><use href="#i-search"/></svg>Analyze</button>
          </div>
          ${this.navHTML()}` : `
          <div class="pz-actions">
            <button class="btn btn-gray pz-solution-btn" data-pz="skip" ${s.skipUsed ? "disabled" : ""}>
              ${s.skipUsed ? "Skip used" : "Skip this move"}
            </button>
          </div>`}
        ${tiles ? `<div class="pz-box"><div class="pz-box-title">This streak</div><div class="pz-history">${tiles}</div></div>` : ""}
      </div>`;
  },

  // ----- Puzzle Dashboard (ligesom på Lichess) -----
  // Viser hvor godt man klarer hvert tema: styrker og ting man skal øve.

  // Temaer der ikke siger noget om ens evner (længde, mål osv.) springes over
  DASH_SKIP: ["short", "long", "veryLong", "oneMove", "master", "masterVsMaster", "superGM",
    "crushing", "advantage", "equality", "mate", "middlegame"],

  // Regner statistik ud for de puzzles man har løst i perioden
  dashboardStats(days) {
    const p = this.profile;
    const since = days ? Date.now() - days * 86400000 : 0;
    const times = p.times || {};
    const byId = new Map(PUZZLES.map((row) => [row[0], row]));

    // Én "spand" pr. tema med: antal spillet, antal løst og samlet puzzle-rating
    const total = { played: 0, won: 0, ratingSum: 0 };
    const themes = {};
    for (const [id, win] of Object.entries(p.rated)) {
      // Gamle puzzles (før dashboardet fandtes) har ingen tid – de tæller kun i "All time"
      if (days && !(times[id] >= since)) continue;
      // Vores egne puzzles – eller rating og temaer gemt for Lichess-puzzles
      const row = byId.get(id) || (p.info && p.info[id] ? [id, null, null, p.info[id][0], 0, p.info[id][1]] : null);
      if (!row) continue;
      const add = (s) => { s.played++; s.won += win; s.ratingSum += row[3]; };
      add(total);
      for (const t of row[5]) {
        if (!PUZZLE_THEMES[t] || this.DASH_SKIP.includes(t)) continue;
        add(themes[t] = themes[t] || { played: 0, won: 0, ratingSum: 0 });
      }
    }

    // "Performance": hvor stærkt man spillede – gennemsnitlig puzzle-rating,
    // plus/minus 400 alt efter hvor mange man løste (samme idé som turnerings-performance)
    const perf = (s) => Math.round(Math.max(400, Math.min(3000,
      s.ratingSum / s.played + 400 * (2 * s.won - s.played) / s.played)));
    const list = Object.entries(themes).map(([id, s]) => ({
      id, played: s.played, pct: Math.round((s.won / s.played) * 100), perf: perf(s),
    }));
    return {
      played: total.played,
      pct: total.played ? Math.round((total.won / total.played) * 100) : 0,
      perf: total.played ? perf(total) : null,
      themes: list,
    };
  },

  dashboardHTML() {
    const p = this.profile;
    const days = p.dashDays === undefined ? 30 : p.dashDays;
    const stats = this.dashboardStats(days);
    const periods = [[1, "Last 24 hours"], [7, "Last week"], [30, "Last 30 days"], [0, "All time"]];

    // Én række pr. tema, med knap til at træne netop det tema
    const row = (t) => `
      <button class="dash-row" data-dash-theme="${t.id}" title="Train ${themeName(t.id)}">
        <span class="dash-name"><b>${themeName(t.id)}</b><small>${t.played} played</small></span>
        <span class="dash-pct">${percentBar(t.pct, t.pct >= 70 ? "good" : t.pct < 50 ? "bad" : "")}<small>${t.pct}%</small></span>
        <span class="dash-perf">${t.perf}</span>
      </button>`;

    // Styrker = højeste performance, øve-områder = laveste (mindst 3 puzzles pr. tema)
    // Et tema er en svaghed, hvis man klarer det dårligere end sit gennemsnit – ellers en styrke
    const enough = stats.themes.filter((t) => t.played >= 3).sort((a, b) => a.perf - b.perf);
    const weak = enough.filter((t) => t.perf < stats.perf).slice(0, 5);
    const strong = enough.filter((t) => t.perf >= stats.perf).reverse().slice(0, 5);
    const all = stats.themes.slice().sort((a, b) => b.played - a.played);

    const log = (p.ratingLog || []).filter((x) => !days || x.t >= Date.now() - days * 86400000);
    const fmt = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

    return `
      <div class="pz-scroll">
        <div class="dash-head">
          <h2 class="pz-heading">Puzzle Dashboard</h2>
          <select class="pz-select" id="pz-dash-days">
            ${periods.map(([d, name]) => `<option value="${d}" ${d === days ? "selected" : ""}>${name}</option>`).join("")}
          </select>
        </div>

        ${stats.played === 0 ? `
          <div class="pz-box dash-empty">
            <p>No rated puzzles ${days ? "in this period" : "yet"}.</p>
            <p>Solve some puzzles and come back to see your strengths and weaknesses!</p>
            <button class="btn btn-green" data-ptab="train">Start training</button>
          </div>` : `
          <div class="dash-cards">
            <div class="dash-card"><b>${stats.played}</b><span>Puzzles</span></div>
            <div class="dash-card"><b>${stats.pct}%</b><span>Solved</span></div>
            <div class="dash-card"><b>${stats.perf}</b><span>Performance</span></div>
          </div>

          <div class="pz-box">
            <div class="pz-box-title">Puzzle rating · now ${p.rating}</div>
            ${lineChartSVG(log.map((x) => x.r), { labels: log.length > 1 ? [fmt(log[0].t), fmt(log[log.length - 1].t)] : [], empty: "Solve a few rated puzzles to see your rating graph." })}
          </div>

          ${weak.length ? `
            <div class="pz-box">
              <div class="pz-box-title">Improvement areas</div>
              <p class="dash-hint">Train these themes to improve the most.</p>
              ${weak.map(row).join("")}
            </div>` : `<p class="dash-hint">Play at least 3 puzzles of a theme to see your strengths and weaknesses.</p>`}

          ${strong.length ? `
            <div class="pz-box">
              <div class="pz-box-title">Strengths</div>
              ${strong.map(row).join("")}
            </div>` : ""}

          <div class="pz-box">
            <div class="pz-box-title">All themes</div>
            <div class="dash-legend"><span>Theme</span><span>Solved</span><span>Perf.</span></div>
            ${all.map(row).join("")}
          </div>`}
      </div>`;
  },

  // Åbner det færdige puzzle på analysebrættet (med motoren)
  analyze() {
    const c = this.current;
    if (!c || c.status !== "done") return;
    Review.openAnalysis(c.positions[0], c.moves.map((m) => m.san), c.solver === "b");
  },

  // ----- Klik i panelet -----

  handleClick(e) {
    const battleBtn = e.target.closest("[data-pz-battle]");
    if (battleBtn) return this.inviteBattle(battleBtn.dataset.pzBattle);
    const rushBtn = e.target.closest("[data-pz-rush]");
    if (rushBtn) {
      this.view = "rush";
      return this.startRush(rushBtn.dataset.pzRush);
    }
    const btn = e.target.closest("[data-pz], [data-theme-pick], [data-replay], [data-ptab], [data-dash-theme]");
    if (!btn) return;

    // Klik på et tema i dashboardet: træn det tema
    if (btn.dataset.dashTheme) {
      this.profile.theme = btn.dataset.dashTheme;
      savePuzzleProfile();
      this.view = "train";
      this.nextTraining();
      return;
    }

    if (btn.dataset.ptab) {
      this.view = btn.dataset.ptab;
      // Skift mellem almindelig træning og streak
      // Forlader man et Rush, stoppes det
      if (this.view !== "rush" && this.rush.running) this.endRush("Run ended");
      if (this.view !== "storm" && this.storm.running) this.endStorm();
      if (this.view === "train" && (this.mode === "streak" || this.mode === "rush" || this.mode === "storm")) {
        this.streak.running = false;
        this.nextTraining();
        return;
      }
      this.drawPanel();
      return;
    }
    if (btn.dataset.themePick) {
      this.profile.theme = btn.dataset.themePick;
      savePuzzleProfile();
      this.view = "train";
      this.nextTraining();
      return;
    }
    if (btn.dataset.replay) {
      const row = this.findRow(btn.dataset.replay);
      if (row) {
        this.mode = "train";
        this.view = "train"; // gen-spil vises altid i Puzzles-fanen
        this.load(row);
      }
      return;
    }

    switch (btn.dataset.pz) {
      case "continue": this.nextTraining(); break;
      case "solution": this.viewSolution(); break;
      case "analyze": this.analyze(); break;
      case "themes": this.view = "themes"; this.drawPanel(); break;
      case "skip": this.skipMove(); break;
      case "streak-start": this.view = "streak"; this.startStreak(); break;
      case "rush-end": this.endRush("Run ended"); break;
      case "storm-start": this.view = "storm"; this.startStorm(); break;
      case "storm-end": this.endStorm(); break;
      case "storm-menu": this.storm = { ...this.storm, over: false, running: false }; this.drawPanel(); break;
      case "rush-menu": this.rush = { ...this.rush, over: false, running: false, battle: null }; this.drawPanel(); break;
      case "first": this.setView(0); break;
      case "prev": this.setView(this.currentPly() - 1); break;
      case "next": this.setView(this.currentPly() + 1); break;
      case "last": this.setView(this.current.positions.length - 1); break;
    }
  },

  // Kaldes når man åbner puzzle-siden
  // Forlader man puzzle-siden midt i et Rush, slutter det
  leave() {
    if (this.rush.running) this.endRush("Run ended");
    if (this.storm.running) this.endStorm();
  },

  open() {
    if (!this.current) this.nextTraining();
    else this.draw();
  },
};

// Klik og ændringer i puzzle-panelet
$("puzzle-panel").addEventListener("click", (e) => Puzzles.handleClick(e));
$("puzzle-panel").addEventListener("change", (e) => {
  if (e.target.id === "pz-difficulty") {
    Puzzles.profile.difficulty = Number(e.target.value);
    savePuzzleProfile();
    // Er puzzlet ikke i gang endnu, så hent et nyt med den nye sværhedsgrad
    if (Puzzles.current && Puzzles.current.status === "done") Puzzles.nextTraining();
  }
  // Dashboardets periode (sidste døgn, uge, 30 dage eller altid)
  if (e.target.id === "pz-dash-days") {
    Puzzles.profile.dashDays = Number(e.target.value);
    savePuzzleProfile();
    Puzzles.drawPanel();
  }
});

Pages.puzzles = Puzzles;