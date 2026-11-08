// ===================================================================
// daily.js – "Daily chess": langsomme partier mod venner (som på chess.com).
//
// Man har 1, 3 eller 7 dage til hvert træk, så man behøver ikke at være
// online samtidig.
//
// Partierne ligger på Chesshubs server (/api/daily). Serveren tjekker, at
// trækkene er lovlige, holder øje med tiden og opdaterer "Daily"-ratingen.
// Når man trækker, får vennen et lille "puf" over vennenetværket, så han
// ser trækket med det samme, hvis han er online.
// ===================================================================

const DAY = 86400000;

const Daily = {
  games: [],        // mine partier (fra serveren)
  selected: null,   // id på det parti, der vises på brættet
  viewPly: null,    // null = nyeste stilling, ellers et tidligere træk
  animate: null,
  loading: false,

  me: () => Friends.key(Accounts.name()),
  myColor(g) { return Friends.key(g.white) === this.me() ? "w" : "b"; },
  opponent(g) { return this.myColor(g) === "w" ? g.black : g.white; },
  iInvited(g) { return Friends.key(g.inviter) === this.me(); },

  chess(g, ply = null) {
    const chess = new Chess(g.startFen);
    const sans = ply === null ? g.sans : g.sans.slice(0, ply);
    sans.forEach((san) => chess.move(san));
    return chess;
  },

  turn(g) { return this.chess(g).turn(); },
  myTurn(g) { return g.status === "active" && this.turn(g) === this.myColor(g); },

  // Mine træk først, så invitationer, så resten
  list() {
    const rank = (g) => (this.myTurn(g) ? 3 : g.status === "invite" && !this.iInvited(g) ? 2 : g.status !== "over" ? 1 : 0);
    return this.games.slice().sort((a, b) => rank(b) - rank(a) || b.updated - a.updated);
  },

  // Tid tilbage, fx "2d 23h", "5h 12m" eller "12 min"
  timeLeft(g) {
    const ms = Math.max(0, (g.deadline || Date.now()) - Date.now());
    const hours = Math.floor((ms % DAY) / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (ms >= DAY) return `${Math.floor(ms / DAY)}d ${hours}h`;
    if (ms >= 3600000) return `${hours}h ${minutes}m`;
    return `${Math.max(1, minutes)} min`;
  },

  current() {
    return this.games.find((g) => g.id === this.selected) || null;
  },

  // ----- Serveren -----

  async load() {
    if (!Accounts.online()) return this.draw();
    this.loading = true;
    try {
      const { games } = await API.get("/daily");
      this.games = games;
      games.forEach((g) => this.checkFinished(g));
    } catch (e) { /* vis det vi har */ }
    this.loading = false;
    this.badge();
    this.draw();
  },

  // Gør noget i et parti (træk, accepter, opgiv …) og fortæl vennen det
  async act(g, action, extra = {}, pokeText = null) {
    try {
      const { game } = await API.post("/daily/" + g.id, { action, ...extra });
      this.games = this.games.map((x) => (x.id === game.id ? game : x));
      this.checkFinished(game);
      if (pokeText) Friends.send(this.opponent(game), { type: "refresh", what: "daily", name: Accounts.name(), text: pokeText });
    } catch (e) {
      showToast(e.message);
      await this.load();
    }
    this.badge();
    this.draw();
  },

  // ----- Nyt parti -----

  async invite(friendName, days, colorChoice) {
    if (!Accounts.online()) return showToast(API.enabled ? "Log in to play Daily games" : "Daily chess needs the online version of Chesshub");
    try {
      const { game } = await API.post("/daily", { opponent: friendName, days, color: colorChoice });
      this.games.unshift(game);
      this.selected = game.id;
      Friends.send(friendName, { type: "refresh", what: "daily", name: Accounts.name(), text: `${Accounts.name()} challenged you to a Daily game (${days} day${days > 1 ? "s" : ""} per move)` });
      showToast(`Daily challenge sent to ${friendName}`);
      showPage("daily");
    } catch (e) {
      showToast(e.message);
    }
  },

  accept(g) { this.act(g, "accept", {}, `${Accounts.name()} accepted your Daily challenge`); },
  decline(g) {
    this.selected = null;
    this.act(g, "decline", {}, this.iInvited(g) ? null : `${Accounts.name()} declined your Daily challenge`).then(() => {
      this.games = this.games.filter((x) => x.id !== g.id);
      this.draw();
    });
  },
  resign(g) { this.act(g, "resign", {}, `${Accounts.name()} resigned your Daily game`); },
  offerDraw(g) { this.act(g, "draw-offer", {}, `${Accounts.name()} offers a draw in your Daily game`); showToast("Draw offered"); },
  acceptDraw(g) { this.act(g, "draw-accept", {}, `${Accounts.name()} accepted the draw`); },

  // Mit træk på brættet
  onMove(from, to, promotion) {
    const g = this.current();
    if (!g || !this.myTurn(g) || this.viewPly !== null) return;
    const chess = this.chess(g);
    const move = chess.move({ from, to, promotion });
    // Vis trækket med det samme (serveren bekræfter det lige bagefter)
    g.sans = [...g.sans, move.san];
    g.status = chess.isGameOver() ? g.status : "active";
    this.animate = board.lastMoveWasDrag ? null : { from: move.from, to: move.to };
    playMoveSound(move);
    this.draw();
    this.act({ ...g, sans: g.sans.slice(0, -1) }, "move", { san: move.san }, `${Accounts.name()} played ${move.san} in your Daily game`);
  },

  // Når et parti er slut, gemmes det i mit arkiv (én gang) – så tæller det i Insights
  checkFinished(g) {
    if (g.status !== "over") return;
    const p = Accounts.profile();
    p.dailyRecorded = p.dailyRecorded || {};
    if (p.dailyRecorded[g.id]) return;
    p.dailyRecorded[g.id] = true;
    const opp = this.opponent(g);
    const friend = Accounts.getFriend(opp) || {};
    const change = g.changes && g.changes[this.me()];
    const record = Accounts.recordGame({
      id: "daily-" + g.id,
      mode: "online",
      modeLabel: `Daily · ${g.days} day${g.days > 1 ? "s" : ""}`,
      white: { name: g.white, color: this.myColor(g) === "w" ? p.color : friend.color },
      black: { name: g.black, color: this.myColor(g) === "b" ? p.color : friend.color },
      result: g.result,
      reason: g.reason,
      sans: g.sans,
      startFen: g.startFen,
      timeControl: { label: "Daily", daily: true, base: null, inc: 0 },
      opening: getOpeningName(g.sans),
      myColor: this.myColor(g),
      serverRated: true,
    });
    if (change) Accounts.setServerRating(record.id, change);
    Achievements.check();
  },

  // Rødt tal ved "Play": partier hvor det er min tur + nye udfordringer
  waitingCount() {
    if (!this.games.length) return Accounts.dailyWaiting || 0;
    return this.games.filter((g) => this.myTurn(g) || (g.status === "invite" && !this.iInvited(g))).length;
  },

  badge() {
    const n = Accounts.online() ? this.waitingCount() : 0;
    document.querySelectorAll(".nav-item[data-nav='play']").forEach((item) => {
      let badge = item.querySelector(".nav-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "nav-badge";
        item.appendChild(badge);
      }
      badge.textContent = n;
      badge.classList.toggle("hidden", n === 0);
    });
  },

  // ----- Tegning -----

  open() {
    this.draw();
    this.load();
  },

  draw() {
    if (currentPage !== "daily") return;
    this.drawBoard();
    this.drawPlayers();
    this.drawPanel();
  },

  drawBoard() {
    const g = this.current();
    if (!g) {
      board.draw({ chess: new Chess(), flipped: false, lastMove: null, interactive: false, movableColor: "w" });
      return;
    }
    const ply = this.viewPly === null ? g.sans.length : this.viewPly;
    const chess = this.chess(g, ply);
    const history = this.chess(g).history({ verbose: true });
    board.draw({
      chess,
      flipped: this.myColor(g) === "b",
      lastMove: settings.highlightLast && ply > 0 ? history[ply - 1] : null,
      interactive: this.myTurn(g) && this.viewPly === null,
      movableColor: this.myColor(g),
      animate: this.animate,
    });
    this.animate = null;
  },

  drawPlayers() {
    const g = this.current();
    const p = Accounts.profile();
    const bar = (color) => {
      if (!g) return "";
      const name = color === "w" ? g.white : g.black;
      const isMe = Friends.key(name) === this.me();
      const friend = isMe ? null : Accounts.getFriend(name);
      const rating = isMe ? p.ratings.daily : friend && friend.ratings && friend.ratings.daily;
      const toMove = g.status === "active" && this.turn(g) === color;
      return `
        <div class="player-left">${userAvatarHTML(name, isMe ? p.color : friend && friend.color)}
          <div class="player-meta"><div class="player-name-row"><span class="player-name">${escapeHTML(name)}</span>${rating ? `<span class="player-rating">(${rating})</span>` : ""}</div></div>
        </div>
        ${toMove ? `<div class="daily-clock">⏳ ${this.timeLeft(g)}</div>` : ""}`;
    };
    const flipped = g && this.myColor(g) === "b";
    els.playerTop.innerHTML = bar(flipped ? "w" : "b");
    els.playerBottom.innerHTML = bar(flipped ? "b" : "w");
  },

  drawPanel() {
    const el = $("daily-content");
    if (!API.enabled) {
      el.innerHTML = `<div class="pz-scroll"><h2 class="pz-heading">Daily Chess</h2>
        <p class="rv-muted">Daily chess uses the Chesshub server, so it only works on the online site (not when index.html is opened from a folder).</p></div>`;
      return;
    }
    if (!Accounts.online()) {
      el.innerHTML = `
        <div class="pz-scroll">
          <h2 class="pz-heading">Daily Chess</h2>
          <p class="rv-muted">Play slow games with your friends – you get days for each move, so you don't need to be online at the same time.</p>
          <p class="rv-muted">Log in or sign up to start.</p>
          <button class="btn btn-green" data-auth-open="signup">Sign Up</button>
        </div>`;
      return;
    }
    el.innerHTML = this.current() ? this.gameHTML(this.current()) : this.listHTML();
  },

  // Listen over alle partier
  listHTML() {
    const games = this.list();
    const row = (g) => {
      const opp = this.opponent(g);
      let status;
      if (g.status === "invite") status = this.iInvited(g) ? "Waiting for them to accept" : "<b>New challenge!</b>";
      else if (g.status === "over") status = `${g.result === "1/2-1/2" ? "Draw" : (g.result === "1-0") === (this.myColor(g) === "w") ? "You won" : "You lost"} ${g.reason || ""}`;
      else status = this.myTurn(g) ? `<b>Your move</b> · ${this.timeLeft(g)} left` : `Their move · ${this.timeLeft(g)} left`;
      return `
        <button class="daily-row ${this.myTurn(g) || (g.status === "invite" && !this.iInvited(g)) ? "attention" : ""}" data-daily-open="${g.id}">
          ${userAvatarHTML(opp, (Accounts.getFriend(opp) || {}).color, "small")}
          <span class="daily-row-text"><b>vs ${escapeHTML(opp)}</b><span>${status}</span></span>
          <span class="daily-row-moves rv-muted">${Math.ceil(g.sans.length / 2)} moves</span>
        </button>`;
    };
    const active = games.filter((g) => g.status !== "over");
    const over = games.filter((g) => g.status === "over").slice(0, 10);
    const friends = Accounts.friendList().filter((f) => f.status === "friends");

    return `
      <div class="pz-scroll">
        <h2 class="pz-heading">Daily Chess</h2>
        <p class="rv-muted">Slow games with friends. You have days for every move, so you don't need to be online at the same time.</p>
        ${friends.length ? `
          <div class="pz-box daily-new">
            <div class="pz-box-title">New Daily game</div>
            <label class="pz-setting"><span>Friend</span>
              <select class="pz-select" id="daily-friend">${friends.map((f) => `<option>${escapeHTML(f.name)}</option>`).join("")}</select></label>
            <label class="pz-setting"><span>Time per move</span>
              <select class="pz-select" id="daily-days"><option value="1">1 day</option><option value="3" selected>3 days</option><option value="7">7 days</option></select></label>
            <label class="pz-setting"><span>I play as</span>
              <select class="pz-select" id="daily-color"><option value="random">Random</option><option value="w">White</option><option value="b">Black</option></select></label>
            <button class="btn btn-green" data-daily-new>Send challenge</button>
          </div>` : `<p class="rv-muted">Add friends on the Social page to play Daily games.</p>`}
        ${this.loading && !games.length ? `<div class="rv-muted rv-center">Loading your games…</div>` : ""}
        ${active.length ? `<div class="pz-box"><div class="pz-box-title">Current games</div>${active.map(row).join("")}</div>` : ""}
        ${over.length ? `<div class="pz-box"><div class="pz-box-title">Finished</div>${over.map(row).join("")}</div>` : ""}
      </div>`;
  },

  // Ét parti
  gameHTML(g) {
    const opp = this.opponent(g);
    const sans = g.sans;
    let moveRows = "";
    for (let i = 0; i < sans.length; i += 2) {
      const cell = (j) => sans[j] ? `<span class="rv-move ${this.viewPly === j + 1 ? "current" : ""}" data-daily-ply="${j + 1}">${sans[j]}</span>` : "<span></span>";
      moveRows += `<div class="move-row"><span class="move-number">${i / 2 + 1}.</span>${cell(i)}${cell(i + 1)}</div>`;
    }

    let status, actions = "";
    if (g.status === "invite") {
      if (this.iInvited(g)) {
        status = `Waiting for ${escapeHTML(opp)} to accept your challenge.`;
        actions = `<button class="btn btn-gray btn-small" data-daily="cancel">Cancel challenge</button>`;
      } else {
        status = `<b>${escapeHTML(opp)}</b> challenges you to a Daily game · ${g.days} day${g.days > 1 ? "s" : ""} per move. You play ${this.myColor(g) === "w" ? "White" : "Black"}.`;
        actions = `<button class="btn btn-green btn-small" data-daily="accept">Accept</button><button class="btn btn-gray btn-small" data-daily="decline">Decline</button>`;
      }
    } else if (g.status === "over") {
      const won = g.result !== "1/2-1/2" && (g.result === "1-0") === (this.myColor(g) === "w");
      status = `<b>${g.result === "1/2-1/2" ? "Draw" : won ? "You won" : `${escapeHTML(opp)} won`}</b> ${g.reason || ""}`;
      actions = `<button class="btn btn-green btn-small" data-daily="review">Game Review</button>`;
    } else {
      const offer = g.drawOffer && g.drawOffer !== this.myColor(g);
      status = this.myTurn(g)
        ? `<b>Your move!</b> You have ${this.timeLeft(g)} left.`
        : `Waiting for ${escapeHTML(opp)} to move (${this.timeLeft(g)} left).`;
      if (offer) status += `<br><b>${escapeHTML(opp)} offers a draw.</b>`;
      actions = `
        ${offer ? `<button class="btn btn-green btn-small" data-daily="draw-accept">Accept draw</button>` : `<button class="btn btn-gray btn-small" data-daily="draw" ${g.drawOffer ? "disabled" : ""}>${g.drawOffer ? "Draw offered" : "Offer draw"}</button>`}
        <button class="btn btn-gray btn-small" data-daily="resign">Resign</button>`;
    }

    const total = sans.length;
    const ply = this.viewPly === null ? total : this.viewPly;
    return `
      <div class="pz-scroll">
        <button class="learn-back" data-daily="back"><svg><use href="#i-back"/></svg>All Daily games</button>
        <div class="pz-info"><svg class="pz-info-icon daily-icon"><use href="#i-sun"/></svg>
          <div><div class="pz-info-title">Daily vs ${escapeHTML(opp)}</div>
          <div class="pz-info-line">${g.days} day${g.days > 1 ? "s" : ""} per move · started ${formatDate(g.created)}</div></div>
        </div>
        <div class="pz-feedback daily-status"><div>${status}</div></div>
        <div class="rv-controls">${actions}</div>
        <div class="rv-moves">${moveRows || '<div class="rv-muted rv-center">No moves yet.</div>'}</div>
        <div class="pz-nav">
          <button class="nav-btn" data-daily="first" ${ply === 0 ? "disabled" : ""}><svg><use href="#i-first"/></svg></button>
          <button class="nav-btn" data-daily="prev" ${ply === 0 ? "disabled" : ""}><svg><use href="#i-prev"/></svg></button>
          <button class="nav-btn" data-daily="next" ${ply === total ? "disabled" : ""}><svg><use href="#i-next"/></svg></button>
          <button class="nav-btn" data-daily="last" ${ply === total ? "disabled" : ""}><svg><use href="#i-last"/></svg></button>
        </div>
      </div>`;
  },

  setView(ply) {
    const g = this.current();
    const total = g.sans.length;
    ply = Math.max(0, Math.min(total, ply));
    this.viewPly = ply === total ? null : ply;
    this.draw();
  },

  handleClick(e) {
    const open = e.target.closest("[data-daily-open]");
    if (open) { this.selected = open.dataset.dailyOpen; this.viewPly = null; return this.draw(); }
    const plyEl = e.target.closest("[data-daily-ply]");
    if (plyEl) return this.setView(Number(plyEl.dataset.dailyPly));
    if (e.target.closest("[data-daily-new]")) {
      return this.invite($("daily-friend").value, Number($("daily-days").value), $("daily-color").value);
    }
    if (e.target.closest("[data-auth-open]")) return handleAuthAction("signup");
    const btn = e.target.closest("[data-daily]");
    if (!btn) return;
    const g = this.current();
    switch (btn.dataset.daily) {
      case "back": this.selected = null; this.viewPly = null; this.draw(); break;
      case "accept": this.accept(g); break;
      case "decline": case "cancel": this.decline(g); break;
      case "resign": if (confirmInline(btn, "Click again to resign")) this.resign(g); break;
      case "draw": this.offerDraw(g); break;
      case "draw-accept": this.acceptDraw(g); break;
      case "review": Review.openGame({ white: { name: g.white }, black: { name: g.black }, result: g.result, sans: g.sans, startFen: g.startFen, myColor: this.myColor(g) }); break;
      case "first": this.setView(0); break;
      case "prev": this.setView((this.viewPly === null ? g.sans.length : this.viewPly) - 1); break;
      case "next": this.setView((this.viewPly === null ? g.sans.length : this.viewPly) + 1); break;
      case "last": this.setView(g.sans.length); break;
    }
  },
};

// En knap der skal klikkes to gange (så man ikke opgiver ved et uheld)
function confirmInline(btn, text) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = "1";
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = old; }, 3000);
  return false;
}

Pages.daily = Daily;
$("daily-panel").addEventListener("click", (e) => Daily.handleClick(e));

// Opdatér "tid tilbage" en gang i minuttet, mens Daily-siden er åben
setInterval(() => { if (currentPage === "daily") Daily.drawPlayers(); }, 60000);
setTimeout(() => Daily.badge(), 0);