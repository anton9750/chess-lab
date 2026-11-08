// ===================================================================
// learn.js – "Learn": interaktive lektioner + genveje til coaching.
//
// Lektionstyper:
//  stars    – flyt brikken hen over alle stjernerne (lær hvordan brikken går)
//  capture  – slå alle de sorte brikker (de sorte brikker står stille)
//  mate     – find skakmat i ét træk
//  puzzle   – små taktik-opgaver (hentes fra puzzle-databasen)
//  practice – spil en slutspilsstilling færdig mod Stockfish
// ===================================================================

const LESSON_COURSES = [
  { id: "pieces", name: "The Pieces", icon: "♜", desc: "Learn how every piece moves.", lessons: [
    { id: "rook", title: "The Rook", type: "stars", fen: "8/8/8/8/8/8/8/R7 w - - 0 1", stars: ["a6", "f6"],
      text: "The rook moves in straight lines: up, down, left and right, as far as it wants. Collect all the stars!" },
    { id: "rook2", title: "Rook Practice", type: "stars", fen: "8/8/8/8/8/8/3R4/8 w - - 0 1", stars: ["d7", "a7", "a2"],
      text: "The rook can't jump over things, but here the board is empty. Grab the stars in as few moves as you can." },
    { id: "bishop", title: "The Bishop", type: "stars", fen: "8/8/8/8/8/8/8/2B5 w - - 0 1", stars: ["e3", "g5"],
      text: "The bishop moves diagonally, as far as it wants. A bishop always stays on squares of the same color." },
    { id: "bishop2", title: "Bishop Practice", type: "stars", fen: "8/8/8/8/8/8/8/5B2 w - - 0 1", stars: ["c4", "e6", "h3"],
      text: "Zig-zag across the board along the diagonals." },
    { id: "queen", title: "The Queen", type: "stars", fen: "8/8/8/8/8/8/8/3Q4 w - - 0 1", stars: ["d5", "h5", "e8"],
      text: "The queen is the strongest piece. She moves like a rook AND a bishop: straight lines and diagonals." },
    { id: "king", title: "The King", type: "stars", fen: "8/8/8/8/8/8/8/4K3 w - - 0 1", stars: ["e2", "f3", "g4", "h5"],
      text: "The king is the most important piece, but it is slow: it moves just one square in any direction." },
    { id: "knight", title: "The Knight", type: "stars", fen: "8/8/8/8/8/8/8/1N6 w - - 0 1", stars: ["c3", "d5", "f6", "h7"],
      text: "The knight moves in an L-shape: two squares one way, then one square to the side. It is the only piece that can jump over others!" },
    { id: "knight2", title: "Knight Practice", type: "stars", fen: "8/8/8/8/8/8/8/6N1 w - - 0 1", stars: ["f3", "e5", "c6", "a7"],
      text: "Hop, hop, hop! Follow the stars with the knight." },
    { id: "pawn", title: "The Pawn", type: "stars", fen: "8/8/8/8/8/8/4P3/8 w - - 0 1", stars: ["e4", "e6", "e8"],
      text: "Pawns move one square forward (two on their first move). When a pawn reaches the last row, it promotes to a queen or another piece!" },
  ] },
  { id: "capture", name: "Capturing", icon: "⚔", desc: "Take the opponent's pieces.", lessons: [
    { id: "cap-rook", title: "Rook Hunt", type: "capture", fen: "4p3/8/8/p3p3/8/8/8/R7 w - - 0 1",
      text: "You capture by moving onto an enemy piece. Take all the black pawns with your rook!" },
    { id: "cap-bishop", title: "Bishop Hunt", type: "capture", fen: "8/8/3n4/8/5n2/8/8/2B5 w - - 0 1",
      text: "Capture both knights with your bishop." },
    { id: "cap-queen", title: "Queen Hunt", type: "capture", fen: "8/8/3r4/8/1b5n/8/8/3Q4 w - - 0 1",
      text: "The queen can capture in every direction. Clean up the board!" },
    { id: "cap-knight", title: "Knight Hunt", type: "capture", fen: "8/3p4/8/4p3/8/5p2/8/6N1 w - - 0 1",
      text: "Jump from pawn to pawn with your knight." },
  ] },
  { id: "mates", name: "Checkmate Patterns", icon: "♚", desc: "Find checkmate in one move.", lessons: [
    { id: "mate-backrank", title: "Back Rank Mate", type: "mate", fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1",
      text: "The black king is trapped behind its own pawns. Find the checkmate!" },
    { id: "mate-queen", title: "Queen and King", type: "mate", fen: "7k/8/6K1/8/8/8/8/Q7 w - - 0 1",
      text: "Your king helps your queen. Deliver checkmate!" },
    { id: "mate-rook", title: "Rook and King", type: "mate", fen: "k7/8/1K6/8/8/8/8/7R w - - 0 1",
      text: "Your king takes away the escape squares. Now finish with the rook." },
    { id: "mate-tworooks", title: "Rook Roller", type: "mate", fen: "6k1/R7/8/8/8/8/8/1R4K1 w - - 0 1",
      text: "One rook guards the 7th row. The other one gives checkmate on the 8th." },
    { id: "mate-smothered", title: "Smothered Mate", type: "mate", fen: "6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1",
      text: "The black king is surrounded by its own pieces. A knight can finish it off!" },
    { id: "mate-arabian", title: "Arabian Mate", type: "mate", fen: "7k/8/5N2/8/8/8/7R/6K1 w - - 0 1",
      text: "A rook and a knight work together in the corner." },
    { id: "mate-scholar", title: "Scholar's Mate", type: "mate", fen: "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
      text: "The most famous beginner trap: queen and bishop attack the weak f7 pawn." },
  ] },
  { id: "tactics", name: "Tactics 101", icon: "⚡", desc: "Forks, pins, skewers and more.", lessons: [
    { id: "t-hanging", title: "Hanging Pieces", type: "puzzle", theme: "hangingPiece",
      text: "A 'hanging' piece is one that isn't protected. Always look for free pieces!" },
    { id: "t-fork", title: "Forks", type: "puzzle", theme: "fork",
      text: "A fork attacks two pieces at once. The opponent can only save one of them." },
    { id: "t-pin", title: "Pins", type: "puzzle", theme: "pin",
      text: "A pinned piece can't move, because a more valuable piece is behind it." },
    { id: "t-skewer", title: "Skewers", type: "puzzle", theme: "skewer",
      text: "A skewer is like a pin turned around: the valuable piece is in front and must move away." },
    { id: "t-discovered", title: "Discovered Attacks", type: "puzzle", theme: "discoveredAttack",
      text: "Move one piece out of the way to reveal an attack from another piece behind it." },
    { id: "t-mate2", title: "Mate in 2", type: "puzzle", theme: "mateIn2",
      text: "Find a checkmate in two moves. Start with a check!" },
  ] },
  { id: "endgames", name: "Endgame Practice", icon: "♔", desc: "Win basic endgames against Stockfish.", lessons: [
    { id: "e-queen", title: "Checkmate with the Queen", type: "practice", goal: "mate", fen: "8/8/8/4k3/8/8/8/4K2Q w - - 0 1",
      text: "Push the black king to the edge with your queen, then bring your king to help. Watch out for stalemate!" },
    { id: "e-rook", title: "Checkmate with the Rook", type: "practice", goal: "mate", fen: "8/8/8/4k3/8/8/8/R3K3 w - - 0 1",
      text: "A rook alone can't do it – your king must help. Cut off the king one row at a time." },
    { id: "e-pawn", title: "Promote the Pawn", type: "practice", goal: "promote", fen: "4k3/8/4K3/4P3/8/8/8/8 w - - 0 1",
      text: "Your king is in front of the pawn, which means you can win! Get a new queen without losing your pawn." },
  ] },
];

const LEARN_KEY = "chessplace-learn";

function loadLearnProgress() {
  try {
    return JSON.parse(localStorage.getItem(LEARN_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

const Learn = {
  progress: loadLearnProgress(), // lektion-id → true når den er gennemført
  lesson: null,
  course: null,
  chess: null,
  stars: [],
  status: "idle",     // idle → play → wait (motoren tænker) → done
  feedback: null,     // { kind: "good" | "fail" | "info", text }
  moves: 0,
  lastMove: null,
  puzzles: [],        // puzzles i en taktik-lektion
  puzzleIndex: 0,
  line: [],
  step: 0,
  timers: [],
  animate: null,

  saveProgress() {
    try { localStorage.setItem(LEARN_KEY, JSON.stringify(this.progress)); } catch (error) { /* ignorer */ }
  },

  later(fn, ms) { this.timers.push(setTimeout(fn, ms)); },
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; },

  // Lektioner uden konger må gerne have "ulovlige" stillinger
  makeChess(fen) {
    return new Chess(fen, { skipValidation: true });
  },

  // ----- Start en lektion -----

  start(courseId, lessonId) {
    this.clearTimers();
    this.course = LESSON_COURSES.find((c) => c.id === courseId);
    this.lesson = this.course.lessons.find((l) => l.id === lessonId);
    this.moves = 0;
    this.lastMove = null;
    this.feedback = null;
    board.showHint(null);

    const l = this.lesson;
    if (l.type === "puzzle") {
      // De 3 letteste puzzles med temaet
      this.puzzles = PUZZLES.filter((p) => p[5].includes(l.theme)).sort((a, b) => a[3] - b[3]).slice(0, 3);
      this.puzzleIndex = 0;
      this.loadPuzzle();
      return;
    }
    this.chess = this.makeChess(l.fen);
    this.stars = l.type === "stars" ? [...l.stars] : [];
    this.status = "play";
    this.draw();
  },

  loadPuzzle() {
    const p = this.puzzles[this.puzzleIndex];
    this.chess = new Chess(p[1]);
    this.line = p[2].split(" ");
    this.step = 0;
    this.lastMove = null;
    this.status = "wait";
    this.feedback = { kind: "info", text: `Puzzle ${this.puzzleIndex + 1} of ${this.puzzles.length}. Watch your opponent's move…` };
    this.draw();
    this.later(() => {
      this.playLine();
      this.status = "play";
      this.feedback = { kind: "info", text: `Your turn! Find the best move for ${this.chess.turn() === "w" ? "white" : "black"}.` };
      this.draw();
    }, 700);
  },

  playLine() {
    const move = this.chess.move(uciToMove(this.line[this.step]));
    this.step++;
    this.lastMove = move;
    this.animate = { from: move.from, to: move.to };
    playMoveSound(move);
    return move;
  },

  // Farven man spiller med
  myColor() {
    if (!this.lesson) return "w";
    if (this.lesson.type === "puzzle" && this.puzzles[this.puzzleIndex]) {
      return new Chess(this.puzzles[this.puzzleIndex][1]).turn() === "w" ? "b" : "w";
    }
    return "w";
  },

  // ----- Spillerens træk -----

  onMove(from, to, promotion) {
    if (!this.lesson || this.status !== "play") return;
    const l = this.lesson;
    const fenBefore = this.chess.fen();
    const move = this.chess.move({ from, to, promotion });
    this.moves++;
    this.lastMove = move;
    this.animate = board.lastMoveWasDrag ? null : { from: move.from, to: move.to };
    playMoveSound(move);

    if (l.type === "stars" || l.type === "capture") {
      // Sort skal aldrig trække – giv turen tilbage til hvid
      const fen = this.chess.fen().split(" ");
      fen[1] = "w";
      fen[3] = "-";
      this.chess = this.makeChess(fen.join(" "));
      if (l.type === "stars") this.stars = this.stars.filter((s) => s !== move.to);
      const blackLeft = this.chess.board().flat().some((p) => p && p.color === "b");
      const done = l.type === "stars" ? this.stars.length === 0 : !blackLeft;
      if (done) return this.complete(`Done in ${this.moves} move${this.moves === 1 ? "" : "s"}!`);
      this.feedback = l.type === "stars"
        ? { kind: "good", text: move.to && !l.stars.includes(move.to) ? "Keep going!" : "Got it! ★" }
        : { kind: move.captured ? "good" : "info", text: move.captured ? "Nice capture!" : "Keep hunting!" };
      return this.draw();
    }

    if (l.type === "mate") {
      if (this.chess.isCheckmate()) return this.complete("Checkmate! 🎉");
      // Forkert: vis trækket kort og tag det tilbage
      this.status = "wait";
      this.feedback = { kind: "fail", text: this.chess.inCheck() ? "That's check, but not checkmate. Try again!" : "That's not checkmate. Try again!" };
      this.draw();
      this.later(() => {
        this.chess = new Chess(fenBefore);
        this.lastMove = null;
        this.status = "play";
        this.draw();
      }, 800);
      return;
    }

    if (l.type === "puzzle") {
      const uci = from + to + (promotion || "");
      if (uci === this.line[this.step] || this.chess.isCheckmate()) {
        this.step++;
        if (this.step >= this.line.length || this.chess.isCheckmate()) {
          // Næste puzzle eller færdig
          if (this.puzzleIndex + 1 < this.puzzles.length) {
            this.status = "wait";
            this.feedback = { kind: "good", text: "Correct! Here comes the next one…" };
            this.draw();
            this.later(() => { this.puzzleIndex++; this.loadPuzzle(); }, 1200);
            return;
          }
          return this.complete("You solved all the puzzles!");
        }
        this.status = "wait";
        this.feedback = { kind: "good", text: "Best move! Keep going…" };
        this.draw();
        this.later(() => { this.playLine(); this.status = "play"; this.draw(); }, 500);
        return;
      }
      this.status = "wait";
      this.feedback = { kind: "fail", text: "That's not the move! Try something else." };
      this.draw();
      this.later(() => {
        this.chess.undo();
        this.lastMove = null;
        this.status = "play";
        this.draw();
      }, 700);
      return;
    }

    if (l.type === "practice") {
      if (l.goal === "promote" && move.promotion) return this.complete("You got a new queen! 👑");
      if (this.chess.isCheckmate()) return this.complete(`Checkmate in ${this.moves} moves!`);
      if (this.chess.isGameOver()) return this.fail(this.chess.isStalemate() ? "Stalemate! The king has no moves but isn't in check – that's a draw." : "It's a draw. Try again!");
      this.status = "wait";
      this.draw();
      this.engineReply();
    }
  },

  // Stockfish svarer i slutspilsøvelserne
  async engineReply() {
    const fen = this.chess.fen();
    const result = await getEngine().search(fen, { skill: 20, movetime: 400 });
    if (!result || !this.lesson || this.chess.fen() !== fen) return;
    const move = this.chess.move(uciToMove(result.best));
    this.lastMove = move;
    this.animate = { from: move.from, to: move.to };
    playMoveSound(move);
    if (this.chess.isGameOver()) {
      return this.fail(this.chess.isStalemate() ? "Stalemate – it's a draw. Try again!" : "Oh no – that's a draw. Try again!");
    }
    // Har sort slået bonden i bonde-øvelsen?
    if (this.lesson.goal === "promote" && !this.chess.board().flat().some((p) => p && p.color === "w" && p.type === "p")) {
      return this.fail("Black captured your pawn. Try again!");
    }
    this.status = "play";
    this.feedback = null;
    this.draw();
  },

  complete(text) {
    this.status = "done";
    this.feedback = { kind: "good", text };
    this.progress[this.lesson.id] = true;
    this.saveProgress();
    playSound("start");
    Achievements.check();
    this.draw();
  },

  fail(text) {
    this.status = "done";
    this.feedback = { kind: "fail", text };
    playSound("end");
    this.draw();
  },

  nextLesson() {
    const all = LESSON_COURSES.flatMap((c) => c.lessons.map((l) => [c.id, l.id]));
    const index = all.findIndex(([, id]) => id === this.lesson.id);
    const next = all[index + 1];
    if (next) this.start(next[0], next[1]);
    else this.backToList();
  },

  backToList() {
    this.clearTimers();
    this.lesson = null;
    this.status = "idle";
    this.draw();
  },

  // ----- Tegning -----

  open() { this.draw(); },
  leave() { this.clearTimers(); },

  draw() {
    if (currentPage !== "learn") return;
    const chess = this.lesson ? this.chess : new Chess();
    board.draw({
      chess,
      flipped: this.myColor() === "b",
      lastMove: this.lesson ? this.lastMove : null,
      interactive: !!this.lesson && this.status === "play",
      movableColor: this.myColor(),
      stars: this.lesson ? this.stars : [],
      animate: this.animate,
    });
    this.animate = null;
    $("learn-content").innerHTML = this.lesson ? this.lessonHTML() : this.listHTML();
  },

  listHTML() {
    const total = LESSON_COURSES.reduce((n, c) => n + c.lessons.length, 0);
    const done = Object.keys(this.progress).length;
    return `
      <div class="pz-scroll">
        <div class="learn-hero">
          <div class="rv-coach-avatar big">🦉</div>
          <div>
            <h2>Learn chess with Coach Olive</h2>
            <p>${done} of ${total} lessons completed</p>
            <div class="rv-progress"><div class="rv-progress-fill" style="width:${(done / total) * 100}%"></div></div>
          </div>
        </div>
        <div class="learn-tools">
          <button class="learn-tool" data-learn-tool="analysis"><svg><use href="#i-search"/></svg><b>Analysis Board</b><span>Explore any position with Stockfish</span></button>
          <button class="learn-tool" data-learn-tool="review"><svg><use href="#i-trophy"/></svg><b>Game Review</b><span>Let the coach review your games</span></button>
        </div>
        ${LESSON_COURSES.map((c) => `
          <div class="learn-course">
            <div class="learn-course-head">
              <span class="learn-course-icon">${c.icon}</span>
              <div><b>${c.name}</b><span>${c.desc}</span></div>
            </div>
            <div class="learn-lessons">
              ${c.lessons.map((l) => `
                <button class="learn-lesson ${this.progress[l.id] ? "done" : ""}" data-course="${c.id}" data-lesson="${l.id}">
                  ${this.progress[l.id] ? '<svg><use href="#i-check"/></svg>' : ""}${l.title}
                </button>`).join("")}
            </div>
          </div>`).join("")}
      </div>`;
  },

  lessonHTML() {
    const l = this.lesson;
    const fb = this.feedback;
    let progress = "";
    if (l.type === "stars") progress = `<div class="learn-count">★ ${l.stars.length - this.stars.length} / ${l.stars.length} · ${this.moves} moves</div>`;
    if (l.type === "puzzle") progress = `<div class="learn-count">Puzzle ${this.puzzleIndex + 1} / ${this.puzzles.length}</div>`;
    if (l.type === "practice") progress = `<div class="learn-count">${this.moves} moves</div>`;

    return `
      <div class="pz-scroll">
        <button class="learn-back" data-learn="back"><svg><use href="#i-back"/></svg>${this.course.name}</button>
        <h2 class="pz-heading">${l.title}</h2>
        <div class="rv-coach">
          <div class="rv-coach-avatar">🦉</div>
          <div class="rv-bubble">${l.text}</div>
        </div>
        ${progress}
        ${fb ? `<div class="pz-feedback ${fb.kind === "info" ? "" : fb.kind === "good" ? "good" : "fail"}">
          <svg class="pz-fb-icon"><use href="#${fb.kind === "fail" ? "i-close" : fb.kind === "good" ? "i-check" : "i-bulb"}"/></svg>
          <div><b>${fb.kind === "fail" ? "Not quite" : fb.kind === "good" ? (this.status === "done" ? "Lesson complete!" : "Good!") : "Tip"}</b><span>${fb.text}</span></div>
        </div>` : ""}
        <div class="learn-buttons">
          ${this.status === "done" && fb.kind === "good" ? '<button class="btn btn-green btn-huge" data-learn="next">Next lesson</button>' : ""}
          <button class="btn btn-gray" data-learn="retry">Retry</button>
        </div>
      </div>`;
  },

  handleClick(e) {
    const lessonBtn = e.target.closest("[data-lesson]");
    if (lessonBtn) return this.start(lessonBtn.dataset.course, lessonBtn.dataset.lesson);
    const tool = e.target.closest("[data-learn-tool]");
    if (tool) {
      if (tool.dataset.learnTool === "analysis") Review.openAnalysis();
      else {
        // Seneste parti fra arkivet – ellers forklar hvordan
        const game = Accounts.profile().games[0];
        if (game) Review.openGame(game);
        else showToast("Play a game first – then the coach can review it!");
      }
      return;
    }
    const btn = e.target.closest("[data-learn]");
    if (!btn) return;
    if (btn.dataset.learn === "back") this.backToList();
    if (btn.dataset.learn === "retry") this.start(this.course.id, this.lesson.id);
    if (btn.dataset.learn === "next") this.nextLesson();
  },
};

Pages.learn = Learn;
$("learn-panel").addEventListener("click", (e) => Learn.handleClick(e));