// ===================================================================
// coach.js – "Play Coach" (som Coach Mae på chess.com).
//
// Man spiller mod coachen selv. Coachen:
//  - spiller på et niveau, man vælger (New to Chess 100 … Master 2200)
//  - kan spille "Casual" (lidt lettere), "Balanced" eller "Challenging" (lidt sværere)
//  - fortæller efter hvert af dine træk, om det var godt eller dårligt
//  - forklarer sine egne træk og advarer, når en af dine brikker er truet
// Coach-partier tæller ikke i ratingen (som på chess.com).
// ===================================================================

// Niveauer man kan vælge
const COACH_LEVELS = [
  { rating: 100, name: "New to Chess" },
  { rating: 400, name: "Beginner" },
  { rating: 600, name: "Novice" },
  { rating: 900, name: "Intermediate" },
  { rating: 1200, name: "Club Player" },
  { rating: 1500, name: "Advanced" },
  { rating: 1800, name: "Expert" },
  { rating: 2200, name: "Master" },
];

// Motor-indstillinger fra svag til stærk (målt i CALIBRATION.md for de svage)
const COACH_LADDER = [
  { random: 1, captureBias: 0 },                  // ~230
  { random: 0.9, temp: 30, depth: 1, captureBias: 0.3 }, // ~430
  { random: 0.6, temp: 22, depth: 1 },            // ~620
  { random: 0.2, temp: 12, depth: 2 },            // ~870
  { random: 0.08, temp: 7.5, depth: 5 },          // ~1200
  { elo: 1500 },
  { elo: 1800 },
  { elo: 2200 },
  { elo: 2500 },
];

const COACH_STYLES = [
  { id: "casual", name: "Casual", desc: "An easier game so you can focus on learning.", step: -1 },
  { id: "balanced", name: "Balanced", desc: "An even match to play while you learn.", step: 0 },
  { id: "challenging", name: "Challenging", desc: "A hard game that pushes you to compete and learn.", step: 1 },
];

const COACH_PIECE = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

const Coach = {
  level: 400,
  style: "balanced",
  showLevels: false,
  color: "w",

  // Laver "botten", som coachen spiller med
  makeBot() {
    const levelIndex = Math.max(0, COACH_LEVELS.findIndex((l) => l.rating === this.level));
    const style = COACH_STYLES.find((s) => s.id === this.style) || COACH_STYLES[1];
    const ladderIndex = Math.max(0, Math.min(COACH_LADDER.length - 1, levelIndex + style.step));
    return {
      id: "coach", name: "Coach Olive", avatar: "🦉", color: "#7d8fa6", rating: this.level,
      engine: COACH_LADDER[ladderIndex],
      intro: "Nice to see you! When you're ready, let's play a game. I'll teach you as we go.",
      lines: {
        start: "Let's play! I'll tell you what I think about your moves – and explain mine.",
        win: "Good game! Let's look at it together in Game Review, so you can do even better next time.",
        lose: "You beat me – well played! Game Review will show you your best moves.",
        draw: "A draw! Nicely defended. Let's look at the game in Game Review.",
      },
    };
  },

  start() {
    try { localStorage.setItem("chesshub-coach", JSON.stringify({ level: this.level, style: this.style })); } catch (e) { /* ignorer */ }
    startNewGame({
      mode: "bot",
      timeControl: NO_TIMER,
      bot: this.makeBot(),
      colorChoice: this.color,
      coach: true,
      coachGame: { level: this.level, style: this.style },
    });
    switchTab("play");
  },

  // ----- Fanen "Play Coach" -----

  drawTab() {
    const level = COACH_LEVELS.find((l) => l.rating === this.level) || COACH_LEVELS[1];
    $("coach-content").innerHTML = `
      <div class="pz-scroll coach-setup">
        <div class="coach-hero">
          <div class="coach-hero-avatar">🦉</div>
          <div class="coach-bubble">Nice to see you! When you're ready, let's play a game. I'll teach you as we go.</div>
        </div>
        <button class="coach-level-toggle" data-coach-toggle>
          <span>${level.name} (${level.rating})</span>
          <svg class="tc-chevron ${this.showLevels ? "up" : ""}"><use href="#i-chevron"/></svg>
        </button>
        ${this.showLevels ? `
          <div class="coach-levels">
            ${COACH_LEVELS.map((l) => `<button class="coach-level ${l.rating === this.level ? "selected" : ""}" data-coach-level="${l.rating}">${l.name} (${l.rating})</button>`).join("")}
          </div>` : ""}
        <div class="coach-styles">
          ${COACH_STYLES.map((s) => `
            <button class="coach-style ${s.id === this.style ? "selected" : ""}" data-coach-style="${s.id}">
              <b>${s.name}</b><span>${s.desc}</span>
            </button>`).join("")}
        </div>
        <div class="color-choice">
          <span class="color-label">I play as</span>
          ${["w", "random", "b"].map((c) => `<button class="color-btn ${this.color === c ? "selected" : ""}" data-coach-color="${c}">${c === "random" ? '<svg><use href="#i-random"/></svg>' : `<img src="img/pieces/cburnett/${c}K.svg" alt="">`}</button>`).join("")}
        </div>
        <p class="rv-muted coach-note">Coach games don't change your rating. Hints, takebacks and the evaluation bar are always allowed.</p>
      </div>
      <div class="bots-footer"><button class="btn btn-green btn-huge" data-coach-play>Play</button></div>`;
  },

  handleClick(e) {
    if (e.target.closest("[data-coach-toggle]")) { this.showLevels = !this.showLevels; return this.drawTab(); }
    const lvl = e.target.closest("[data-coach-level]");
    if (lvl) { this.level = Number(lvl.dataset.coachLevel); this.showLevels = false; return this.drawTab(); }
    const style = e.target.closest("[data-coach-style]");
    if (style) { this.style = style.dataset.coachStyle; return this.drawTab(); }
    const color = e.target.closest("[data-coach-color]");
    if (color) { this.color = color.dataset.coachColor; return this.drawTab(); }
    if (e.target.closest("[data-coach-play]")) this.start();
  },

  // ----- Coachen under partiet -----

  // Hvad coachen siger lige nu: { you: {cls, text} (om dit træk), me: tekst (om coachens træk), say: tekst }
  msg: { you: null, me: null, say: null },

  onStart() {
    this.msg = { you: null, me: null, say: this.makeBot().lines.start };
    this.drawBox();
  },

  say(text) {
    this.msg = { you: null, me: null, say: text };
    this.drawBox();
  },

  // Kaldes af coachMove (review.js) når dit træk er vurderet
  judged(cls, text) {
    this.msg = { you: { cls, text }, me: null, say: null };
    this.drawBox();
  },

  // Coachen har selv trukket: forklar trækket
  explain(move) {
    if (state.result) return;
    const text = this.explainText(move, state.game);
    this.msg = { you: this.msg.you, me: text, say: null };
    addLog(`<b>Coach:</b> ${text}`);
    this.drawBox();
  },

  explainText(move, chess) {
    const piece = COACH_PIECE[move.piece];
    let text;
    if (move.san.includes("#")) text = `Checkmate with ${move.san}!`;
    else if (move.flags.includes("k") || move.flags.includes("q")) text = "I castled to keep my king safe and bring my rook into the game.";
    else if (move.promotion) text = `My pawn reached the last row and became a ${COACH_PIECE[move.promotion]}!`;
    else if (move.captured) text = `I took your ${COACH_PIECE[move.captured]} on ${move.to} with my ${piece}.`;
    else if (move.san.includes("+")) text = `${move.san} – check! You must protect your king.`;
    else if ((move.piece === "n" || move.piece === "b") && (move.from[1] === "1" || move.from[1] === "8")) text = `I'm developing my ${piece} so it can join the fight.`;
    else if (move.piece === "p" && ["d", "e"].includes(move.to[0]) && chess.history().length < 16) text = "I'm putting a pawn in the center to control more squares.";
    else if (move.piece === "q" && chess.history().length < 10) text = "I'm bringing my queen out early. Can you use that to develop with tempo?";
    else if (move.piece === "p") text = `I pushed my pawn to ${move.to}.`;
    else if (move.piece === "r") text = `I moved my rook to ${move.to}. Rooks love open lines!`;
    else if (move.piece === "k") text = `I moved my king to ${move.to}.`;
    else text = `I moved my ${piece} to ${move.to} to find a better square.`;

    // Advarsel: er en af dine brikker i fare nu?
    const threat = this.findThreat(chess, move.color);
    if (threat && !move.san.includes("#")) text += ` Watch out – your ${COACH_PIECE[threat.type]} on ${threat.square} is under attack!`;
    // Lette niveauer: sig til, når coachen selv har efterladt en brik ubeskyttet
    else if (this.level <= 600 || this.style === "casual") {
      const mine = move.color === "w" ? "b" : "w";
      const chance = this.findThreat(chess, mine);
      if (chance) text += " Look closely – one of my pieces is not safe. Can you find it?";
    }
    return text;
  },

  // Finder din mest værdifulde brik, som coachen kan slå med fordel
  findThreat(chess, coachColor) {
    const mine = coachColor === "w" ? "b" : "w";
    let best = null;
    const files = "abcdefgh";
    chess.board().forEach((row, r) => row.forEach((p, f) => {
      if (!p || p.color !== mine || p.type === "k") return;
      const square = files[f] + (8 - r);
      if (!chess.isAttacked(square, coachColor)) return;
      const defended = chess.isAttacked(square, mine);
      const cheapest = Math.min(...chess.attackers(square, coachColor).map((sq) => PIECE_VALUES[chess.get(sq).type] || 0));
      const hanging = !defended || cheapest < PIECE_VALUES[p.type];
      if (hanging && (!best || PIECE_VALUES[p.type] > PIECE_VALUES[best.type])) best = { type: p.type, square };
    }));
    return best;
  },

  // Boksen over træklisten med coachens taleboble
  drawBox() {
    const box = $("coach-box");
    if (!box) return;
    const on = !!(state.coachGame && currentPage === "play");
    box.classList.toggle("hidden", !on);
    if (!on) return;
    const m = this.msg;
    const parts = [];
    if (m.say) parts.push(`<p>${escapeHTML(m.say)}</p>`);
    if (m.you) parts.push(`<p><span class="cls-icon small cls-${m.you.cls}">${MOVE_CLASSES[m.you.cls].symbol}</span> ${escapeHTML(m.you.text)}</p>`);
    if (m.me) parts.push(`<p class="coach-me">${escapeHTML(m.me)}</p>`);
    if (state.botThinking && !m.me && m.you) parts.push(`<p class="rv-muted">Let me think…</p>`);
    const bad = m.you && ["mistake", "blunder", "miss"].includes(m.you.cls);
    const myTurn = !state.result && state.game.turn() === state.humanColor && !state.botThinking;
    box.innerHTML = `
      <div class="coach-hero small">
        <div class="coach-hero-avatar">🦉</div>
        <div class="coach-bubble">${parts.join("") || "<p>Your move!</p>"}</div>
      </div>
      ${state.result ? "" : `
      <div class="coach-actions">
        <button class="btn btn-gray btn-small" data-coach-act="hint" ${myTurn ? "" : "disabled"}><svg><use href="#i-bulb"/></svg>Hint</button>
        <button class="btn ${bad ? "btn-green" : "btn-gray"} btn-small" data-coach-act="takeback"><svg><use href="#i-takeback"/></svg>Takeback</button>
      </div>`}`;
  },
};

// Gemt niveau og stil fra sidst
try {
  const saved = JSON.parse(localStorage.getItem("chesshub-coach") || "null");
  if (saved && COACH_LEVELS.some((l) => l.rating === saved.level)) Coach.level = saved.level;
  if (saved && COACH_STYLES.some((s) => s.id === saved.style)) Coach.style = saved.style;
} catch (e) { /* ignorer */ }

$("tab-coach").addEventListener("click", (e) => Coach.handleClick(e));
$("coach-box").addEventListener("click", (e) => {
  const act = e.target.closest("[data-coach-act]");
  if (!act) return;
  if (act.dataset.coachAct === "hint") showHint();
  if (act.dataset.coachAct === "takeback") { takeback(); Coach.msg = { you: null, me: null, say: "Okay, let's try that again. Take your time!" }; Coach.drawBox(); }
});