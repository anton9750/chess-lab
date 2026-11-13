// ===================================================================
// board3d-menu.js – "3D-menuen": den fuldskærms-forside, man lander på, når man
// skifter til 3D Mode fra 2D (se main.js, btn-toggle-3d / toggle-list). Fire knapper:
//  - Play     – luk menuen, spillet (der allerede kører) ses bag den
//  - Bots     – en "beige, fotorealistisk" bræt-stil liste over botter (kun ratings,
//               ingen ikoner/navne) – vælg én og bekræft for at starte et botparti
//  - Games    – tidligere partier (gemt i localStorage via Accounts) – klik for at
//               åbne Game Review af det, stadig i 3D
//  - Live TV  – et rigtigt parti, der spilles lige nu (Lichess TV-feed, se watch.js),
//               vist direkte på det samme 3D-bræt/baggrund, med spillernes navne i et
//               stiliseret bånd ovenpå
//
// Tegnes som et DOM-overlay oven på Board3D's canvas (samme mønster som scoreBtn/
// promo-picker i board3d.js), ikke som en Three.js-scene i sig selv.
// ===================================================================

// Stillbillede af scenen, brugt som baggrund for selve menuen (home/bots/games), så den
// rigtige (tunge) Three.js-scene kun behøver at blive vist, når man rent faktisk vælger
// at spille/se et parti – ikke mens man bare browser menuen.
const BOARD3D_COVER_PATH = "img/app/board3d-cover.png";
// De stadier, hvor stillbilledet skal dække for den levende 3D-scene bagved.
const BOARD3D_COVER_STATES = ["home", "bots", "games"];

const Board3DMenu = {
  state: "closed", // "closed" | "home" | "bots" | "games" | "live"
  enabled: false,   // true mens 3D Mode overhovedet er slået til (se disable() vs. close())
  board3d: null,
  el: null,
  coverEl: null,
  homeBtn: null,
  selectedBotId: null,
  liveTimer: null,
  liveLastFen: null,

  init(board3dInstance) {
    this.board3d = board3dInstance;

    this.coverEl = document.createElement("img");
    this.coverEl.className = "board3d-cover hidden";
    this.coverEl.src = BOARD3D_COVER_PATH;
    this.coverEl.alt = "";
    board3dInstance.wrapEl.appendChild(this.coverEl);

    this.el = document.createElement("div");
    this.el.className = "board3d-menu hidden";
    board3dInstance.wrapEl.appendChild(this.el);
    this.el.addEventListener("click", (e) => this.handleClick(e));

    // Pil under "næste scene"-pilen: tilbage til 3D-forsiden (Play/Bots/Games/Live TV) fra et
    // igangværende parti, uden at skulle slå 3D Mode fra og til igen.
    this.homeBtn = document.createElement("button");
    this.homeBtn.className = "board3d-home-toggle hidden";
    this.homeBtn.type = "button";
    this.homeBtn.title = "Back to 3D menu";
    this.homeBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 11.5 12 4l8 7.5M6 10v9h5v-5h2v5h5v-9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    this.homeBtn.addEventListener("click", () => this.open());
    board3dInstance.wrapEl.appendChild(this.homeBtn);
  },

  // 3D Mode slås til: menuen åbner frisk på forsiden.
  open() {
    this.enabled = true;
    this.state = "home";
    this.selectedBotId = null;
    this.render();
  },

  // Forlader menuen ind i et parti/visning (Play, Bots-bekræft, Games, Live TV) – stadig i 3D.
  close() {
    this.stopLive();
    this.state = "closed";
    this.render();
  },

  // 3D Mode slås helt fra (tilbage til 2D) – skjul også "tilbage til menu"-pilen.
  disable() {
    this.stopLive();
    this.enabled = false;
    this.state = "closed";
    this.render();
  },

  goHome() {
    this.stopLive();
    this.state = "home";
    this.render();
  },

  render() {
    this.el.classList.toggle("hidden", this.state === "closed");
    this.coverEl.classList.toggle("hidden", !BOARD3D_COVER_STATES.includes(this.state));
    // "Tilbage til menu"-pilen vises kun, når man rent faktisk er inde i et parti/en visning
    // (menuen selv er lukket, men 3D Mode er stadig slået til).
    this.homeBtn.classList.toggle("hidden", !(this.enabled && this.state === "closed"));
    // Live TV skal ikke have den mørke overlay-baggrund – der skal være frit udsyn til
    // 3D-brættet, kun med tilbage-knappen og navne-båndet ovenpå.
    this.el.classList.toggle("board3d-menu-clear", this.state === "live");
    if (this.state === "home") this.el.innerHTML = this.homeHTML();
    else if (this.state === "bots") this.el.innerHTML = this.botsHTML();
    else if (this.state === "games") this.el.innerHTML = this.gamesHTML();
    else if (this.state === "live") this.el.innerHTML = this.liveHTML();
  },

  handleClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "home") return this.goHome();
    if (action === "play") { this.close(); return; }
    if (action === "bots") { this.state = "bots"; this.selectedBotId = null; return this.render(); }
    if (action === "games") { this.state = "games"; return this.render(); }
    if (action === "live") { this.state = "live"; this.render(); this.startLive(); return; }

    if (action === "select-bot") {
      this.selectedBotId = btn.dataset.botId;
      return this.render();
    }
    if (action === "confirm-bot") {
      const bot = findBot(this.selectedBotId);
      if (!bot) return;
      if (currentPage !== "play") showPage("play");
      startNewGame({ mode: "bot", timeControl: NO_TIMER, bot, colorChoice: "random" });
      this.close();
      return;
    }
    if (action === "open-game") {
      const game = Accounts.profile().games.find((g) => g.id === btn.dataset.gameId);
      if (!game) return;
      Review.openGame(game);
      this.close();
      return;
    }
  },

  // ----- Forside: de fire knapper -----

  homeHTML() {
    return `
      <div class="board3d-menu-panel board3d-home-panel">
        <h1 class="board3d-menu-title">Chesshub</h1>
        <button class="board3d-menu-btn" data-action="play">Play</button>
        <button class="board3d-menu-btn" data-action="bots">Bots</button>
        <button class="board3d-menu-btn" data-action="games">Games</button>
        <button class="board3d-menu-btn" data-action="live">Live TV</button>
      </div>`;
  },

  // ----- Bots: kun ratings, ingen navne/ikoner -----

  botsHTML() {
    const tiles = ALL_BOTS.map((bot) => `
      <button class="board3d-bot-tile ${bot.id === this.selectedBotId ? "selected" : ""}"
              data-action="select-bot" data-bot-id="${bot.id}">${bot.rating}</button>`).join("");
    return `
      <div class="board3d-menu-panel board3d-bots-panel">
        <button class="board3d-menu-back" data-action="home" title="Back"><svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <h2 class="board3d-menu-subtitle">Choose a bot</h2>
        <p class="board3d-menu-hint">Pick a rating to play against</p>
        <div class="board3d-bot-grid">${tiles}</div>
        <button class="board3d-menu-confirm" data-action="confirm-bot" ${this.selectedBotId ? "" : "disabled"}>Confirm</button>
      </div>`;
  },

  // ----- Games: tidligere partier fra localStorage (Accounts) -----

  gamesHTML() {
    const games = (Accounts.profile().games || []).slice(0, 30);
    const rows = games.length
      ? games.map((g) => {
          const opp = g.myColor ? (g.myColor === "w" ? g.black : g.white) : null;
          const title = opp ? `vs ${escapeHTML(opp.name)} (${opp.rating ?? "?"})` : `${escapeHTML(g.white.name)} vs ${escapeHTML(g.black.name)}`;
          let res = "draw";
          if (g.myColor) {
            if (g.result === "1-0") res = g.myColor === "w" ? "win" : "loss";
            if (g.result === "0-1") res = g.myColor === "b" ? "win" : "loss";
          }
          const label = { win: "W", loss: "L", draw: "D" }[res] || "–";
          return `
            <button class="board3d-game-row ${res}" data-action="open-game" data-game-id="${g.id}">
              <span class="board3d-game-result">${label}</span>
              <span class="board3d-game-title">${title}</span>
              <span class="board3d-game-date">${formatDate(g.date)}</span>
            </button>`;
        }).join("")
      : '<p class="board3d-menu-hint">No games yet — play one and it will show up here.</p>';
    return `
      <div class="board3d-menu-panel board3d-games-panel">
        <button class="board3d-menu-back" data-action="home" title="Back"><svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <h2 class="board3d-menu-subtitle">Your games</h2>
        <div class="board3d-game-list">${rows}</div>
      </div>`;
  },

  // ----- Live TV: et rigtigt parti (Lichess TV-feed), vist direkte på 3D-brættet -----

  liveHTML() {
    return `
      <button class="board3d-menu-back board3d-live-back" data-action="home" title="Back"><svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <div class="board3d-live-banner" id="board3d-live-banner">
        <span class="board3d-live-dot"></span> LIVE · connecting…
      </div>`;
  },

  startLive() {
    clearInterval(this.liveTimer);
    this.liveLastFen = null;
    Watch.startTV("best");
    this.liveTimer = setInterval(() => this.pollLive(), 400);
  },

  stopLive() {
    if (this.liveTimer) clearInterval(this.liveTimer);
    this.liveTimer = null;
    if (typeof Watch !== "undefined") Watch.stopTV();
    // Gendan det rigtige bræt (mit eget igangværende parti/side), som liveTV-visningen
    // midlertidigt har overskrevet ved at tegne direkte i board3d.
    if (currentPage === "play") drawAll();
    else if (Pages[currentPage] && Pages[currentPage].draw) Pages[currentPage].draw();
  },

  pollLive() {
    if (this.state !== "live") return;
    const banner = document.getElementById("board3d-live-banner");
    if (!Watch.tv) {
      if (banner) banner.innerHTML = Watch.tvStatus === "error"
        ? "Couldn't connect to Lichess TV"
        : '<span class="board3d-live-dot"></span> LIVE · connecting…';
      return;
    }
    const tv = Watch.tv;
    if (banner) {
      banner.innerHTML = `
        <span class="board3d-live-dot"></span> LIVE on Lichess TV
        <div class="board3d-live-players">
          <span class="board3d-live-white">${escapeHTML(tv.white.name)} (${tv.white.rating})</span>
          <span class="board3d-live-vs">vs</span>
          <span class="board3d-live-black">${escapeHTML(tv.black.name)} (${tv.black.rating})</span>
        </div>`;
    }
    if (tv.fen === this.liveLastFen) return;
    const isFirst = this.liveLastFen === null;
    this.liveLastFen = tv.fen;

    let chess;
    try { chess = new Chess(Watch.fullFen(tv.fen)); }
    catch (e) { chess = new Chess(Watch.fullFen(tv.fen), { skipValidation: true }); }

    this.board3d.draw({
      chess,
      flipped: tv.flipped,
      lastMove: tv.lastMove,
      interactive: false,
      movableColor: null,
      animate: !isFirst && tv.lastMove ? { from: tv.lastMove.from, to: tv.lastMove.to } : null,
    });
  },
};
