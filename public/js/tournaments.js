// ===================================================================
// tournaments.js – Arena-turneringer (som på Lichess og chess.com).
//
// Sådan virker en Arena:
//  - Alle kan oprette en turnering med navn, tempo, variant, starttid og længde.
//  - Man melder sig til. Når turneringen kører, parrer serveren ledige
//    spillere med hinanden – så snart et parti er slut, får man et nyt.
//  - Point: sejr 2, remis 1, tab 0. Efter 2 sejre i træk er man "i flammer" 🔥
//    og får dobbelt point, indtil man ikke vinder.
//  - Selve partierne spilles som almindelige online-partier (og er ratede).
// ===================================================================

const Tournaments = {
  list: null,          // alle turneringer (fra serveren)
  current: null,       // den turnering, der vises
  viewId: null,        // id på den viste turnering (null = listen)
  activeId: null,      // turnering, jeg er meldt til, og som kører/snart kører
  handledPairing: null, // id på det parti, jeg allerede har startet
  timer: null,

  // ----- Data fra serveren -----

  async loadList() {
    try {
      const { tournaments } = await API.get("/tournaments");
      this.list = tournaments;
    } catch (e) {
      this.list = [];
      this.error = e.message;
    }
    if (currentPage === "tournaments" && !this.viewId) this.draw();
  },

  async loadCurrent(id) {
    try {
      const { tournament } = await API.get("/tournaments/" + id);
      if (id === this.viewId) this.current = tournament;
      this.onUpdate(tournament);
    } catch (e) {
      if (id === this.viewId) this.error = e.message;
    }
    if (currentPage === "tournaments" && this.viewId === id) this.draw();
  },

  async act(action) {
    try {
      const { tournament } = await API.post("/tournaments/" + this.viewId, { action });
      this.current = tournament;
      this.onUpdate(tournament);
      if (action === "join") showToast(tournament.status === "live" ? "You're in! Waiting for an opponent…" : "You're in! Come back when it starts.");
    } catch (e) {
      showToast(e.message);
    }
    this.draw();
  },

  async create(form) {
    if (!Accounts.online()) return showToast("Log in to create tournaments");
    const tc = TIME_CONTROLS.flatMap((c) => c.items)[Number(form.tc)];
    try {
      const { tournament } = await API.post("/tournaments", {
        name: form.name, tc, variant: form.variant, startsIn: Number(form.startsIn), duration: Number(form.duration),
      });
      showToast("Tournament created!");
      this.open(tournament.id);
    } catch (e) {
      showToast(e.message);
    }
  },

  // ----- Parring: start mit parti, når serveren har fundet en modstander -----

  onUpdate(t) {
    // Er jeg med i en turnering, der kører? Så holder vi øje med den – også fra spillesiden
    if (t.joined && t.status !== "finished") this.watch(t.id);
    else if (this.activeId === t.id) this.unwatch();
    if (t.status === "live" && t.joined) this.handlePairing(t);
  },

  watch(id) {
    if (this.activeId === id && this.timer) return;
    this.activeId = id;
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (currentPage === "tournaments" && this.viewId) this.loadCurrent(this.viewId);
      else if (this.activeId) this.loadCurrent(this.activeId);
    }, 3000);
  },

  unwatch() {
    this.activeId = null;
    clearInterval(this.timer);
    this.timer = null;
  },

  handlePairing(t) {
    const p = t.myPairing;
    if (!p || this.handledPairing === p.id) return;
    // Spiller jeg allerede et parti (som ikke er slut)? Så vent.
    if (state.mode === "online" && Online.status === "playing" && !state.result) return;
    const me = Accounts.name().toLowerCase();
    const white = p.white === me;
    if (white) {
      // Hvid laver spillet og fortæller serveren koden
      this.handledPairing = p.id;
      Online.timeControl = t.tc;
      Online.variant = t.variant;
      Online.hostColorChoice = "w";
      Online.create(); // nulstiller Online – derfor sættes resten bagefter
      Online.fixedGameId = p.id;
      Online.tournamentId = t.id;
      Online.onReady = () => API.post("/tournaments/" + t.id, { action: "code", code: Online.code }).catch(() => {});
    } else {
      // Sort venter på hvids kode og forbinder så
      if (!p.code) return;
      this.handledPairing = p.id;
      Online.join(p.code);
      Online.tournamentId = t.id;
    }
    notify(`Tournament game vs ${white ? p.blackName : p.whiteName}!`);
    showPage("play");
    switchTab("friend");
  },

  // Kaldes, når et online-parti er slut
  gameOver() {
    if (!Online.tournamentId || !this.activeId) return;
    setTimeout(() => showToast("Next tournament game starts soon…"), 2500);
  },

  // ----- Siden -----

  open(id = null) {
    this.viewId = id;
    this.current = null;
    if (currentPage !== "tournaments") showPage("tournaments");
    else this.draw();
  },

  // Kaldes af showPage
  openPage() {
    this.draw();
    if (this.viewId) this.loadCurrent(this.viewId);
    else this.loadList();
    // Opdater listen/turneringen, mens siden er åben
    clearInterval(this.pageTimer);
    this.pageTimer = setInterval(() => {
      if (currentPage !== "tournaments") return clearInterval(this.pageTimer);
      if (this.viewId && this.activeId !== this.viewId) this.loadCurrent(this.viewId);
      else if (!this.viewId) this.loadList();
    }, 5000);
  },

  draw() {
    if (currentPage !== "tournaments") return;
    $("content-page").innerHTML = `<div class="content-wrap">${this.viewId ? this.detailHTML() : this.listHTML()}</div>`;
  },

  // Fx "in 12 min", "2 h left", "ended 3 days ago"
  when(t) {
    const fmt = (ms) => {
      const m = Math.round(Math.abs(ms) / 60000);
      if (m < 60) return `${m} min`;
      if (m < 48 * 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
      return `${Math.round(m / 1440)} days`;
    };
    if (t.status === "upcoming") return `Starts in ${fmt(t.startsAt - Date.now())}`;
    if (t.status === "live") return `${fmt(t.endsAt - Date.now())} left`;
    return `Ended ${formatDate(t.endsAt)}`;
  },

  label(t) {
    const v = isVariant(t.variant) ? findVariant(t.variant) : null;
    return `${v ? v.icon + " " + v.name + " · " : ""}${escapeHTML(t.tc.label || t.tc.base / 60 + "+" + t.tc.inc)}`;
  },

  listHTML() {
    const tcs = TIME_CONTROLS.flatMap((c) => c.items.map((item) => ({ item, c })))
      .map(({ item, c }, i) => (item.base ? `<option value="${i}" ${item.label === "3 min" ? "selected" : ""}>${item.label} (${c.category})</option>` : "")).join("");
    const row = (t) => `
      <button class="tour-row ${t.status}" data-tour="${t.id}">
        <span class="tour-icon">${t.status === "live" ? "🔴" : t.status === "upcoming" ? "⏳" : "🏆"}</span>
        <span class="tour-text"><b>${escapeHTML(t.name)}</b><span>${this.label(t)} · ${t.duration} min · ${t.playerCount} player${t.playerCount === 1 ? "" : "s"}${t.status === "finished" && t.leader ? " · Winner: " + escapeHTML(t.leader) : ""}</span></span>
        <span class="tour-when">${this.when(t)}</span>
      </button>`;
    const list = this.list || [];
    const live = list.filter((t) => t.status === "live");
    const upcoming = list.filter((t) => t.status === "upcoming").sort((a, b) => a.startsAt - b.startsAt);
    const finished = list.filter((t) => t.status === "finished").slice(0, 10);

    return `
      <h1 class="content-title"><svg class="nav-icon"><use href="#i-trophy"/></svg>Tournaments</h1>
      <p class="rv-muted">Arena tournaments: join, and you're paired with a new opponent as soon as your game ends. Win = 2 points, draw = 1. Win twice in a row and you're on fire 🔥 – double points!</p>
      <div class="social-grid">
        <section class="social-card">
          ${this.list === null ? `<div class="friend-spinner"><span class="spinner"></span>Loading…</div>` : ""}
          ${live.length ? `<h2>Live now</h2>${live.map(row).join("")}` : ""}
          ${upcoming.length ? `<h2>Upcoming</h2>${upcoming.map(row).join("")}` : ""}
          ${this.list && !live.length && !upcoming.length ? `<p class="rv-muted">No tournaments right now – create one!</p>` : ""}
          ${finished.length ? `<h2>Finished</h2>${finished.map(row).join("")}` : ""}
        </section>
        <section class="social-card">
          <h2>Create a tournament</h2>
          ${Accounts.online() ? `
          <form class="tour-form" id="tour-form">
            <label class="friend-row"><span>Name</span><input class="friend-input" name="name" maxlength="40" placeholder="${escapeHTML(Accounts.name())}'s Arena"></label>
            <label class="friend-row"><span>Time</span><select class="pz-select" name="tc">${tcs}</select></label>
            <label class="friend-row"><span>Variant</span><select class="pz-select" name="variant">${VARIANTS.map((v) => `<option value="${v.id}">${v.icon} ${v.name}</option>`).join("")}</select></label>
            <label class="friend-row"><span>Starts</span><select class="pz-select" name="startsIn">
              <option value="0">Now</option><option value="5" selected>In 5 minutes</option><option value="15">In 15 minutes</option>
              <option value="30">In 30 minutes</option><option value="60">In 1 hour</option><option value="180">In 3 hours</option><option value="1440">Tomorrow</option>
            </select></label>
            <label class="friend-row"><span>Length</span><select class="pz-select" name="duration">
              <option value="15">15 minutes</option><option value="30" selected>30 minutes</option><option value="45">45 minutes</option>
              <option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option>
            </select></label>
            <button class="btn btn-green btn-huge">Create</button>
          </form>` : `<p class="rv-muted">Log in to create and join tournaments.</p><button class="btn btn-green" data-auth="signup">Sign Up</button>`}
        </section>
      </div>`;
  },

  detailHTML() {
    const back = `<button class="learn-back" data-tour-back><svg><use href="#i-back"/></svg>All tournaments</button>`;
    const t = this.current;
    if (!t) return `${back}<p class="rv-muted">${this.error ? escapeHTML(this.error) : "Loading…"}</p>`;
    const me = Accounts.name().toLowerCase();
    const myRow = t.players.find((p) => p.name.toLowerCase() === me);

    let status = "";
    if (t.joined && t.status === "live") {
      const p = t.myPairing;
      if (p) status = `<div class="tour-status playing">♟ Your game vs <b>${escapeHTML(p.white === me ? p.blackName : p.whiteName)}</b> – <a href="#" data-tour-play>go to the board</a></div>`;
      else status = `<div class="tour-status"><span class="spinner"></span> Waiting for an opponent… (keep Chesshub open)</div>`;
    } else if (t.joined && t.status === "upcoming") status = `<div class="tour-status">You're in! The tournament starts in ${this.when(t).replace("Starts in ", "")}. Keep Chesshub open.</div>`;

    let button = "";
    if (t.status !== "finished" && Accounts.online()) {
      button = t.joined
        ? `<button class="btn btn-gray" data-tour-act="withdraw">${t.status === "live" ? "Pause / leave" : "Withdraw"}</button>`
        : `<button class="btn btn-green btn-huge" data-tour-act="join">Join</button>`;
    } else if (!Accounts.online()) button = `<button class="btn btn-green" data-auth="signup">Sign up to join</button>`;

    const podium = t.status === "finished" && t.players.length
      ? `<div class="tour-podium">${t.players.slice(0, 3).map((p, i) => `<div class="podium-${i + 1}"><span>${["🥇", "🥈", "🥉"][i]}</span><b>${escapeHTML(p.name)}</b><small>${p.score} points</small></div>`).join("")}</div>` : "";

    return `
      ${back}
      <div class="tour-head">
        <div>
          <h1>${escapeHTML(t.name)}</h1>
          <span class="rv-muted">${this.label(t)} · ${t.duration} min arena · by ${escapeHTML(t.creator)}</span>
        </div>
        <div class="tour-clock ${t.status}">${this.when(t)}</div>
      </div>
      ${status}
      ${button}
      ${podium}
      <div class="social-grid">
        <section class="social-card">
          <h2>Standings <span class="rv-muted">${t.players.length} player${t.players.length === 1 ? "" : "s"}</span></h2>
          ${t.players.length ? `<div class="lb-table">${t.players.map((p) => `
            <div class="lb-row tour-player ${p.name.toLowerCase() === me ? "me" : ""} ${p.withdrawn ? "withdrawn" : ""}">
              <span class="lb-rank ${p.rank <= 3 ? "top" + p.rank : ""}">${p.rank}</span>
              <b>${escapeHTML(p.name)} ${p.fire ? "🔥" : ""}</b>
              <span class="tour-results">${p.results.map((r) => `<span class="r${r}">${r}</span>`).join("")}</span>
              <span class="lb-rating">${p.score}</span>
            </div>`).join("")}</div>` : `<p class="rv-muted">Nobody has joined yet.</p>`}
        </section>
        <section class="social-card">
          <h2>Games</h2>
          ${t.pairings.length ? t.pairings.slice(0, 30).map((p) => `
            <div class="tour-game">
              <span>${escapeHTML(p.whiteName)} – ${escapeHTML(p.blackName)}</span>
              <span class="rv-muted">${p.result || (p.abandoned ? "cancelled" : "playing…")}</span>
            </div>`).join("") : `<p class="rv-muted">No games yet.</p>`}
          ${myRow ? `<p class="rv-muted small-note">Your score: <b>${myRow.score}</b> after ${myRow.games} game${myRow.games === 1 ? "" : "s"}.</p>` : ""}
        </section>
      </div>`;
  },
};

Pages.tournaments = { open: () => Tournaments.openPage() };

$("content-page").addEventListener("click", (e) => {
  if (currentPage !== "tournaments") return;
  const row = e.target.closest("[data-tour]");
  if (row) return Tournaments.open(row.dataset.tour);
  if (e.target.closest("[data-tour-back]")) return Tournaments.open(null);
  const act = e.target.closest("[data-tour-act]");
  if (act) return Tournaments.act(act.dataset.tourAct);
  if (e.target.closest("[data-tour-play]")) { e.preventDefault(); showPage("play"); switchTab("play"); }
});
$("content-page").addEventListener("submit", (e) => {
  if (e.target.id !== "tour-form") return;
  e.preventDefault();
  Tournaments.create(Object.fromEntries(new FormData(e.target)));
});