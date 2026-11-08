// ===================================================================
// watch.js – "Watch": se skak.
//  Live TV   – rigtige partier lige nu, streamet fra Lichess TV
//              (Lichess' gratis, åbne API – kræver internet).
//  Famous Games – berømte partier fra historien, som afspilles træk for træk.
// ===================================================================

const TV_CHANNELS = [
  { id: "best", name: "Top Rated", url: "https://lichess.org/api/tv/feed" },
  { id: "bullet", name: "Bullet", url: "https://lichess.org/api/tv/bullet/feed" },
  { id: "blitz", name: "Blitz", url: "https://lichess.org/api/tv/blitz/feed" },
  { id: "rapid", name: "Rapid", url: "https://lichess.org/api/tv/rapid/feed" },
  { id: "classical", name: "Classical", url: "https://lichess.org/api/tv/classical/feed" },
];

const Watch = {
  view: API.enabled ? "chesshub" : "tv", // "chesshub" (vores egne live-partier), "tv" (Lichess) eller "famous"
  live: null,           // liste over Chesshub-partier, der spilles lige nu
  spectate: null,       // det parti, jeg ser på: { id, game }
  channel: "best",
  tv: null,             // { id, players, fen, lastMove, wc, bc, flipped }
  tvStatus: "idle",     // idle → connecting → live / error
  tvError: "",
  controller: null,     // bruges til at stoppe streamen
  tvClockTimer: null,
  famous: null,         // { game, moves, positions, ply }
  autoplay: null,
  animate: null,

  // ----- Live TV -----

  // Starter streamen fra en Lichess TV-kanal.
  // Svaret er "ndjson": én JSON-linje pr. besked, der bliver ved med at komme.
  async startTV(channelId) {
    this.stopTV();
    this.channel = channelId;
    this.tvStatus = "connecting";
    this.tv = null;
    this.draw();

    const channel = TV_CHANNELS.find((c) => c.id === channelId);
    const controller = new AbortController();
    this.controller = controller;
    try {
      const response = await fetch(channel.url, { signal: controller.signal });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Del teksten op i hele linjer – den sidste (halve) linje gemmes til næste gang
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (line.trim()) this.onTVMessage(JSON.parse(line));
        }
      }
      // Streamen sluttede – start igen
      if (this.controller === controller) this.startTV(channelId);
    } catch (error) {
      if (controller.signal.aborted) return;
      this.tvStatus = "error";
      this.tvError = "Couldn't connect to Lichess TV. Check your internet connection and try again.";
      this.draw();
    }
  },

  stopTV() {
    if (this.controller) this.controller.abort();
    this.controller = null;
    clearInterval(this.tvClockTimer);
  },

  onTVMessage(msg) {
    if (msg.t === "featured") {
      // Et nyt parti vises
      const d = msg.d;
      const player = (color) => {
        const p = d.players.find((x) => x.color === color);
        return { name: p.user.name, title: p.user.title || "", rating: p.rating, seconds: p.seconds };
      };
      this.tv = {
        id: d.id,
        white: player("white"),
        black: player("black"),
        fen: d.fen,
        lastMove: null,
        wc: player("white").seconds,
        bc: player("black").seconds,
        flipped: d.orientation === "black",
        updated: Date.now(),
      };
      this.tvStatus = "live";
      playSound("start");
    } else if (msg.t === "fen" && this.tv) {
      // Et nyt træk i partiet
      const d = msg.d;
      const lm = d.lm ? { from: d.lm.slice(0, 2), to: d.lm.slice(2, 4) } : null;
      this.tv.fen = d.fen;
      this.tv.lastMove = lm;
      this.tv.wc = d.wc;
      this.tv.bc = d.bc;
      this.tv.updated = Date.now();
      this.animate = lm;
      playSound("move");
    }
    this.draw();
    // Uret tæller ned mellem trækkene
    clearInterval(this.tvClockTimer);
    this.tvClockTimer = setInterval(() => this.drawTVClocks(), 250);
  },

  // Lichess sender nogle gange kun brætdelen af FEN – gør den hel
  fullFen(fen) {
    return fen.split(" ").length >= 4 ? fen : fen + " w - - 0 1";
  },

  // ----- Berømte partier -----

  openFamous(id) {
    this.stopAutoplay();
    const game = FAMOUS_GAMES.find((g) => g.id === id);
    const chess = new Chess();
    const positions = [chess.fen()];
    const moves = [];
    for (const san of game.moves.split(" ")) {
      moves.push(chess.move(san));
      positions.push(chess.fen());
    }
    this.famous = { game, moves, positions, ply: 0 };
    this.draw();
    this.startAutoplay();
  },

  setFamousPly(ply) {
    const f = this.famous;
    if (!f) return;
    ply = Math.max(0, Math.min(f.moves.length, ply));
    if (ply === f.ply) return;
    if (ply === f.ply + 1) this.animate = { from: f.moves[ply - 1].from, to: f.moves[ply - 1].to };
    f.ply = ply;
    if (ply > 0) playMoveSound(f.moves[ply - 1]);
    this.draw();
  },

  startAutoplay() {
    this.stopAutoplay();
    this.autoplay = setInterval(() => {
      const f = this.famous;
      if (!f || f.ply >= f.moves.length) return this.stopAutoplay();
      this.setFamousPly(f.ply + 1);
    }, 1300);
    this.drawPanel();
  },

  stopAutoplay() {
    clearInterval(this.autoplay);
    this.autoplay = null;
    if (currentPage === "watch") this.drawPanel();
  },

  // ----- Side-håndtering -----

  open() {
    // Uden server (åbnet fra mappen) er der ingen Chesshub-livepartier
    document.querySelector('[data-wtab="chesshub"]').classList.toggle("hidden", !API.enabled);
    if (this.view === "tv" && this.tvStatus !== "live" && this.tvStatus !== "connecting") this.startTV(this.channel);
    if (this.view === "chesshub") this.startLive();
    this.draw();
  },

  // ----- Chesshub live: se dine venners (og alle andres) partier -----

  startLive() {
    clearInterval(this.liveTimer);
    this.pollLive();
    this.liveTimer = setInterval(() => this.pollLive(), 2500);
  },

  stopLive() {
    clearInterval(this.liveTimer);
  },

  async pollLive() {
    if (currentPage !== "watch" || this.view !== "chesshub") return this.stopLive();
    try {
      if (this.spectate) {
        const { game } = await API.get("/live/" + encodeURIComponent(this.spectate.id));
        const old = this.spectate.game;
        if (!old || game.sans.length !== old.sans.length || game.result !== old.result) {
          const chess = makeGame(game.variant, game.startFen || undefined);
          const moves = game.sans.map((san) => chess.move(san));
          if (old && game.sans.length === old.sans.length + 1) {
            const m = moves[moves.length - 1];
            this.animate = m.drop ? null : { from: m.from, to: m.to };
            playMoveSound(m);
          }
          this.spectate = { id: game.id, game, chess, moves, received: Date.now() };
          this.draw();
        } else {
          this.spectate.game = game;
          this.drawPlayers();
        }
      } else {
        const { games } = await API.get("/live");
        this.live = games;
        this.drawPanel();
      }
    } catch (e) {
      if (this.spectate) { this.spectate.ended = true; this.drawPanel(); }
      else { this.live = []; this.liveError = e.message; this.drawPanel(); }
    }
  },

  liveHTML() {
    if (this.spectate && !this.spectate.game) return `<div class="pz-scroll"><div class="friend-spinner"><span class="spinner"></span>Loading game…</div></div>`;
    if (this.spectate) {
      const g = this.spectate.game;
      const v = findVariant(g.variant);
      const sans = g.sans;
      let rows = "";
      for (let i = 0; i < sans.length; i += 2) rows += `<div class="move-row"><span class="move-number">${i / 2 + 1}.</span><span class="rv-move">${sans[i]}</span><span class="rv-move">${sans[i + 1] || ""}</span></div>`;
      return `
        <div class="pz-scroll">
          <button class="learn-back" data-watch="live-list"><svg><use href="#i-back"/></svg>All live games</button>
          <div class="pz-info"><svg class="pz-info-icon"><use href="#i-watch"/></svg><div>
            <div class="pz-info-title">${escapeHTML(g.white)} vs ${escapeHTML(g.black)}</div>
            <div class="pz-info-line">${isVariant(g.variant) ? v.icon + " " + v.name + " · " : ""}${escapeHTML(g.tc ? g.tc.label : "")}${g.tournament ? " · Tournament" : ""}</div>
          </div></div>
          ${g.result ? `<div class="pz-feedback"><div><b>Game over: ${g.result}</b><span>${escapeHTML(g.reason || "")}</span></div></div>`
            : this.spectate.ended ? `<div class="pz-feedback"><div><b>The game has ended</b></div></div>`
            : `<div class="rv-muted rv-center">● Live – updates automatically</div>`}
          <div class="rv-moves">${rows || '<div class="rv-muted rv-center">No moves yet.</div>'}</div>
        </div>`;
    }
    const games = this.live;
    const friends = new Set(Accounts.friendList().filter((f) => f.status === "friends").map((f) => f.name.toLowerCase()));
    const isFriend = (g) => friends.has(g.white.toLowerCase()) || friends.has(g.black.toLowerCase());
    const sorted = (games || []).slice().sort((a, b) => isFriend(b) - isFriend(a) || b.updated - a.updated);
    return `
      <div class="pz-scroll">
        <h2 class="pz-heading">Live on Chesslab</h2>
        ${games === null ? `<div class="friend-spinner"><span class="spinner"></span>Loading…</div>`
          : sorted.length ? sorted.map((g) => `
            <button class="daily-row ${isFriend(g) ? "attention" : ""}" data-live="${escapeHTML(g.id)}">
              <span class="daily-row-text"><b>${escapeHTML(g.white)} ${g.whiteRating ? `(${g.whiteRating})` : ""} vs ${escapeHTML(g.black)} ${g.blackRating ? `(${g.blackRating})` : ""}</b>
              <span>${isVariant(g.variant) ? findVariant(g.variant).icon + " " + findVariant(g.variant).name + " · " : ""}${escapeHTML(g.tc ? g.tc.label : "")} · ${Math.ceil(g.moves / 2)} moves${isFriend(g) ? " · <b>Friend</b>" : ""}${g.result ? " · finished" : ""}</span></span>
            </button>`).join("")
          : `<p class="rv-muted">Nobody is playing on Chesslab right now. Start a game with Play → New Game → Play Online!</p>`}
        <p class="rv-muted small-note">Want to see top players? Check the Lichess TV tab.</p>
      </div>`;
  },

  leave() {
    this.stopLive();
    this.stopTV();
    this.tvStatus = "idle";
    this.stopAutoplay();
  },

  onMove() {}, // man kan ikke flytte brikker, når man ser på

  // ----- Tegning -----

  draw() {
    if (currentPage !== "watch") return;
    this.drawBoard();
    this.drawPlayers();
    this.drawPanel();
  },

  drawBoard() {
    let chess;
    let lastMove = null;
    let flipped = false;
    if (this.view === "chesshub" && this.spectate) {
      chess = this.spectate.chess;
      const moves = this.spectate.moves;
      lastMove = moves.length ? moves[moves.length - 1] : null;
    } else if (this.view === "tv" && this.tv) {
      try { chess = new Chess(this.fullFen(this.tv.fen)); } catch (e) { chess = new Chess(this.fullFen(this.tv.fen), { skipValidation: true }); }
      lastMove = this.tv.lastMove;
      flipped = this.tv.flipped;
    } else if (this.view === "famous" && this.famous) {
      chess = new Chess(this.famous.positions[this.famous.ply]);
      lastMove = this.famous.ply > 0 ? this.famous.moves[this.famous.ply - 1] : null;
    } else {
      chess = new Chess();
    }
    board.draw({ chess, flipped, lastMove, interactive: false, movableColor: "w", animate: this.animate });
    this.animate = null;
  },

  drawPlayers() {
    const bar = (p, color) => {
      if (!p) return "";
      const title = p.title ? `<span class="title-badge">${p.title}</span>` : "";
      const clockHTML = p.clock !== undefined ? `<div class="clock ${p.active ? "active" : ""}" data-tv="${color}"><svg class="clock-icon"><use href="#i-clock"/></svg><span class="clock-time">${p.clock}</span></div>` : "";
      return `
        <div class="player-left">
          <div class="avatar avatar-${color}"><svg><use href="#i-pawn"/></svg></div>
          <div class="player-meta"><div class="player-name-row">${title}<span class="player-name">${p.name}</span>${p.rating ? `<span class="player-rating">(${p.rating})</span>` : ""}</div></div>
        </div>${clockHTML}`;
    };
    let white = null;
    let black = null;
    let flipped = false;
    if (this.view === "chesshub" && this.spectate && this.spectate.game) {
      const g = this.spectate.game;
      const turn = this.spectate.chess.turn();
      // Uret: tiden fra sidste træk trækkes fra den, der er i trækket
      const passed = g.result ? 0 : Date.now() - g.updated;
      const time = (c) => (g.clock ? ChessClock.format(Math.max(0, g.clock[c] - (turn === c ? passed : 0))) : undefined);
      white = { name: g.white, rating: g.whiteRating, clock: time("w"), active: !g.result && turn === "w" };
      black = { name: g.black, rating: g.blackRating, clock: time("b"), active: !g.result && turn === "b" };
    } else if (this.view === "tv" && this.tv) {
      const turn = this.fullFen(this.tv.fen).split(" ")[1];
      white = { ...this.tv.white, clock: ChessClock.format(this.tv.wc * 1000), active: turn === "w" };
      black = { ...this.tv.black, clock: ChessClock.format(this.tv.bc * 1000), active: turn === "b" };
      flipped = this.tv.flipped;
    } else if (this.view === "famous" && this.famous) {
      white = { name: this.famous.game.white };
      black = { name: this.famous.game.black };
    }
    els.playerTop.innerHTML = bar(flipped ? white : black, flipped ? "w" : "b");
    els.playerBottom.innerHTML = bar(flipped ? black : white, flipped ? "b" : "w");
  },

  // Uret for den spiller der er i trækket tæller ned
  drawTVClocks() {
    if (currentPage !== "watch" || this.view !== "tv" || !this.tv) return;
    const turn = this.fullFen(this.tv.fen).split(" ")[1];
    const passed = (Date.now() - this.tv.updated) / 1000;
    ["w", "b"].forEach((color) => {
      const el = document.querySelector(`.clock[data-tv="${color}"] .clock-time`);
      if (!el) return;
      const base = color === "w" ? this.tv.wc : this.tv.bc;
      const seconds = turn === color ? Math.max(0, base - passed) : base;
      el.textContent = ChessClock.format(seconds * 1000);
    });
  },

  drawPanel() {
    if (currentPage !== "watch") return;
    document.querySelectorAll("[data-wtab]").forEach((t) => t.classList.toggle("active", t.dataset.wtab === this.view));
    $("watch-content").innerHTML = this.view === "chesshub" ? this.liveHTML() : this.view === "tv" ? this.tvHTML() : this.famousHTML();
  },

  tvHTML() {
    const channels = TV_CHANNELS.map((c) => `<button class="tv-channel ${c.id === this.channel ? "selected" : ""}" data-channel="${c.id}">${c.name}</button>`).join("");
    let body;
    if (this.tvStatus === "connecting") body = `<div class="friend-spinner"><span class="spinner"></span>Connecting to Lichess TV…</div>`;
    else if (this.tvStatus === "error") body = `<div class="friend-error">${this.tvError}</div><button class="btn btn-gray" data-watch="retry">Try again</button>`;
    else if (this.tv) {
      const w = this.tv.white;
      const b = this.tv.black;
      body = `
        <div class="tv-live"><span class="live-dot"></span>LIVE</div>
        <div class="tv-match">
          <div><b>${w.title ? w.title + " " : ""}${w.name}</b><span>${w.rating}</span></div>
          <span class="go-vs">vs</span>
          <div><b>${b.title ? b.title + " " : ""}${b.name}</b><span>${b.rating}</span></div>
        </div>
        <p class="rv-muted">A new game starts automatically when this one ends.</p>
        <a class="btn btn-gray btn-small" href="https://lichess.org/${this.tv.id}" target="_blank" rel="noopener">Open game on Lichess</a>`;
    } else body = "";
    return `
      <div class="pz-scroll">
        <h2 class="pz-heading">Live Chess TV</h2>
        <p class="rv-muted">The best games being played right now, streamed live from Lichess.</p>
        <div class="tv-channels">${channels}</div>
        ${body}
      </div>`;
  },

  famousHTML() {
    const f = this.famous;
    if (!f) {
      return `
        <div class="pz-scroll">
          <h2 class="pz-heading">Famous Games</h2>
          <p class="rv-muted">Legendary games from chess history. Pick one and watch it move by move.</p>
          ${FAMOUS_GAMES.map((g) => `
            <button class="pz-theme" data-famous="${g.id}">
              <span class="pz-theme-top"><b>${g.title}</b><span class="pz-theme-count">${g.year || ""}</span></span>
              <span class="pz-theme-desc">${g.white} vs ${g.black} · ${g.result}</span>
            </button>`).join("")}
        </div>`;
    }
    const g = f.game;
    let moveRows = "";
    for (let i = 0; i < f.moves.length; i += 2) {
      const cell = (j) => f.moves[j] ? `<span class="rv-move ${j + 1 === f.ply ? "current" : ""}" data-fply="${j + 1}">${f.moves[j].san}</span>` : "<span></span>";
      moveRows += `<div class="move-row"><span class="move-number">${i / 2 + 1}.</span>${cell(i)}${cell(i + 1)}</div>`;
    }
    const last = f.moves.length;
    return `
      <div class="pz-scroll">
        <button class="learn-back" data-watch="list"><svg><use href="#i-back"/></svg>Famous Games</button>
        <h2 class="pz-heading">${g.title}</h2>
        <div class="rv-muted">${g.white} vs ${g.black} · ${g.event}${g.year ? ", " + g.year : ""} · <b>${g.result}</b></div>
        <div class="rv-coach"><div class="rv-coach-avatar">🦉</div><div class="rv-bubble">${g.story}</div></div>
        <div class="rv-moves">${moveRows}</div>
        <div class="pz-nav rv-nav">
          <button class="nav-btn" data-watch="first" ${f.ply === 0 ? "disabled" : ""}><svg><use href="#i-first"/></svg></button>
          <button class="nav-btn" data-watch="prev" ${f.ply === 0 ? "disabled" : ""}><svg><use href="#i-prev"/></svg></button>
          <button class="nav-btn" data-watch="play">${this.autoplay ? "❚❚" : "▶"}</button>
          <button class="nav-btn" data-watch="next" ${f.ply === last ? "disabled" : ""}><svg><use href="#i-next"/></svg></button>
          <button class="nav-btn" data-watch="last" ${f.ply === last ? "disabled" : ""}><svg><use href="#i-last"/></svg></button>
        </div>
        <button class="btn btn-gray btn-small" data-watch="analyze">Open in Analysis Board</button>
      </div>`;
  },

  handleClick(e) {
    const tab = e.target.closest("[data-wtab]");
    if (tab) {
      this.view = tab.dataset.wtab;
      if (this.view === "tv") { this.stopAutoplay(); this.stopLive(); if (this.tvStatus !== "live") this.startTV(this.channel); }
      else {
        this.stopTV();
        this.tvStatus = "idle";
        if (this.view === "chesshub") { this.stopAutoplay(); this.startLive(); } else this.stopLive();
      }
      return this.draw();
    }
    const live = e.target.closest("[data-live]");
    if (live) { this.spectate = { id: live.dataset.live, game: null, chess: new Chess(), moves: [] }; this.pollLive(); return this.draw(); }
    const ch = e.target.closest("[data-channel]");
    if (ch) return this.startTV(ch.dataset.channel);
    const fam = e.target.closest("[data-famous]");
    if (fam) return this.openFamous(fam.dataset.famous);
    const ply = e.target.closest("[data-fply]");
    if (ply) { this.stopAutoplay(); return this.setFamousPly(Number(ply.dataset.fply)); }
    const btn = e.target.closest("[data-watch]");
    if (!btn) return;
    const f = this.famous;
    switch (btn.dataset.watch) {
      case "retry": this.startTV(this.channel); break;
      case "live-list": this.spectate = null; this.live = null; this.pollLive(); this.draw(); break;
      case "list": this.stopAutoplay(); this.famous = null; this.draw(); break;
      case "first": this.stopAutoplay(); this.setFamousPly(0); break;
      case "prev": this.stopAutoplay(); this.setFamousPly(f.ply - 1); break;
      case "next": this.stopAutoplay(); this.setFamousPly(f.ply + 1); break;
      case "last": this.stopAutoplay(); this.setFamousPly(f.moves.length); break;
      case "play":
        if (this.autoplay) this.stopAutoplay();
        else { if (f.ply >= f.moves.length) f.ply = 0; this.startAutoplay(); }
        break;
      case "analyze": this.stopAutoplay(); Review.openAnalysis(f.positions[0], f.moves.map((m) => m.san)); break;
    }
  },
};

Pages.watch = Watch;
$("watch-panel").addEventListener("click", (e) => Watch.handleClick(e));