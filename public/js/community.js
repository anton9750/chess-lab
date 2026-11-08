// ===================================================================
// community.js – Leaderboard og spillerprofiler (som på chess.com).
//
//  - "Global": alle spillere på Chesshub (fra serveren)
//  - "Friends": mig og mine venner
//  - "Bot record": mine resultater mod hver bot
// Klik på en spiller for at se profilen: ratings, statistik og seneste partier.
// ===================================================================

const LB_CATEGORIES = [
  ["rapid", "Rapid", "i-clock"], ["blitz", "Blitz", "i-bolt"], ["bullet", "Bullet", "i-bullet"],
  ["daily", "Daily", "i-sun"], ["puzzles", "Puzzles", "i-puzzle"], ["bots", "Bots", "i-robot"],
];
// Varianterne har hver deres rating (vises i en ekstra række)
const LB_VARIANTS = VARIANTS.filter((v) => isVariant(v.id)).map((v) => [v.id, v.name, v.icon]);

const LeaderboardPage = {
  tab: API.enabled ? "global" : "friends",
  category: "rapid",
  search: "",
  players: null,     // spillere fra serveren
  loading: false,
  error: null,

  // En spillers rating i den valgte kategori (null = ingen partier endnu)
  value(p) {
    if (this.category === "puzzles") return p.puzzleGames ? p.puzzles : null;
    if (this.category === "bots") return p.bots;
    const r = p.ratings && p.ratings[this.category];
    return r && r.n > 0 ? r.r : null;
  },

  // "Foreløbig" rating: for få partier til at være sikker (som "?" på chess.com)
  provisional(p) {
    const r = p.ratings && p.ratings[this.category];
    return r && !["puzzles", "bots"].includes(this.category) && r.rd > 110;
  },

  async load() {
    if (!API.enabled) return;
    this.loading = true;
    try {
      const { players } = await API.get("/leaderboard");
      this.players = players;
      this.error = null;
    } catch (e) {
      this.error = e.message;
    }
    this.loading = false;
    if (currentPage === "leaderboard") this.open(false);
  },

  open(reload = true) {
    if (reload && API.enabled && this.tab !== "bots") this.load();
    const tabs = [...(API.enabled ? [["global", "Global"]] : []), ["friends", "Friends"], ["bots", "Bot record"]];
    let body;

    if (this.tab === "bots") body = this.botRecordHTML();
    else body = this.tableHTML();

    $("content-page").innerHTML = `
      <div class="content-wrap">
        <h1 class="content-title"><svg class="nav-icon"><use href="#i-trophy"/></svg>Leaderboard</h1>
        <div class="lb-tabs">${tabs.map(([id, name]) => `<button class="tab ${id === this.tab ? "active" : ""}" data-lb-tab="${id}">${name}</button>`).join("")}</div>
        <div class="social-card">${body}</div>
      </div>`;
    const input = $("lb-search");
    if (input && this.searchFocused) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  },

  tableHTML() {
    const me = Accounts.name().toLowerCase();
    let rows;
    if (this.players) {
      rows = this.players.map((p) => ({ ...p, me: p.name.toLowerCase() === me }));
      if (this.tab === "friends") {
        const friends = new Set(Accounts.friendList().filter((f) => f.status === "friends").map((f) => f.name.toLowerCase()));
        rows = rows.filter((p) => p.me || friends.has(p.name.toLowerCase()));
      }
    } else {
      // Uden server: kun mig og mine venner (ratings fra vennenetværket)
      const p = Accounts.profile();
      const toRatings = (ratings) => Object.fromEntries(["rapid", "blitz", "bullet", "daily"].map((c) => [c, { r: (ratings || {})[c] || 1200, n: 1, rd: 50 }]));
      rows = [{ name: p.username, color: p.color, ratings: toRatings(p.ratings), puzzles: Puzzles.profile.rating, puzzleGames: Puzzles.profile.games, bots: p.ratings.bots, me: true },
        ...Accounts.friendList().filter((f) => f.status === "friends").map((f) => ({ name: f.name, color: f.color, ratings: toRatings(f.ratings), puzzles: f.puzzles, puzzleGames: f.puzzles ? 1 : 0, bots: f.ratings && f.ratings.bots }))];
    }

    const withValue = rows.filter((r) => this.value(r) !== null && this.value(r) !== undefined)
      .sort((a, b) => this.value(b) - this.value(a));
    withValue.forEach((r, i) => { r.rank = i + 1; });
    const q = this.search.trim().toLowerCase();
    const shown = q ? withValue.filter((r) => r.name.toLowerCase().includes(q)) : withValue;
    const unrated = q ? rows.filter((r) => !withValue.includes(r) && r.name.toLowerCase().includes(q)) : [];
    const games = (r) => (this.category === "puzzles" ? r.puzzleGames : r.ratings && r.ratings[this.category] ? r.ratings[this.category].n : null);

    return `
      <div class="lb-cats">${LB_CATEGORIES.map(([id, name, icon]) => `<button class="tv-channel ${id === this.category ? "selected" : ""}" data-lb-cat="${id}"><svg class="lb-cat-icon"><use href="#${icon}"/></svg>${name}</button>`).join("")}</div>
      <div class="lb-cats lb-variants">${LB_VARIANTS.map(([id, name, icon]) => `<button class="tv-channel ${id === this.category ? "selected" : ""}" data-lb-cat="${id}">${icon} ${name}</button>`).join("")}</div>
      <input class="friend-input lb-search" id="lb-search" placeholder="Search players…" value="${escapeHTML(this.search)}" autocomplete="off">
      ${this.loading && !this.players ? `<p class="rv-muted">Loading players…</p>` : ""}
      ${this.error ? `<p class="friend-error">${escapeHTML(this.error)}</p>` : ""}
      <div class="lb-table">
        ${shown.length ? shown.slice(0, 100).map((r) => `
          <button class="lb-row ${r.me ? "me" : ""}" ${API.enabled ? `data-player="${escapeHTML(r.name)}"` : ""}>
            <span class="lb-rank ${r.rank <= 3 ? "top" + r.rank : ""}">${r.rank}</span>
            ${userAvatarHTML(r.name, r.color, "small")}
            <b>${escapeHTML(r.name)}${r.me ? " (you)" : ""} ${flagHTML(r.country)}</b>
            ${games(r) !== null ? `<span class="rv-muted lb-games">${games(r)} game${games(r) === 1 ? "" : "s"}</span>` : ""}
            <span class="lb-rating">${Math.round(this.value(r))}${this.provisional(r) ? '<span class="lb-prov" title="Provisional rating – not many games yet">?</span>' : ""}</span>
          </button>`).join("") : `<p class="rv-muted">${q ? "No players found." : this.tab === "friends" ? "No ratings yet. Play some games – or add friends on the Social page!" : "Nobody has a rating here yet. Be the first!"}</p>`}
        ${unrated.map((r) => `
          <button class="lb-row" data-player="${escapeHTML(r.name)}">
            <span class="lb-rank">–</span>${userAvatarHTML(r.name, r.color, "small")}<b>${escapeHTML(r.name)}</b>
            <span class="rv-muted lb-games">no ${this.category} games</span>
          </button>`).join("")}
      </div>
      ${this.tab === "global" ? `<p class="rv-muted small-note">Everyone with the Chesshub link who has an account. A <b>?</b> means a provisional rating (only a few games played).</p>` : ""}`;
  },

  // Mine resultater mod hver bot
  botRecordHTML() {
    const games = Accounts.profile().games.filter((g) => g.mode === "bot" && g.myColor);
    return `<div class="lb-table">${ALL_BOTS.map((bot) => {
      let w = 0, d = 0, l = 0;
      games.forEach((g) => {
        const opp = g.myColor === "w" ? g.black : g.white;
        if (opp.name !== bot.name) return;
        if (g.result === "1/2-1/2") d++;
        else if ((g.result === "1-0") === (g.myColor === "w")) w++;
        else l++;
      });
      return `
        <div class="lb-row">
          <span class="avatar avatar-bot small" style="background:${bot.color}">${bot.avatar}</span>
          <b>${bot.name} <span class="rv-muted">(${bot.rating})</span></b>
          <span class="lb-record"><span class="win">${w}W</span> <span>${d}D</span> <span class="loss">${l}L</span></span>
        </div>`;
    }).join("")}</div>`;
  },
};

Pages.leaderboard = LeaderboardPage;


// ----- Spillerprofil -----

const PlayerPage = {
  name: null,
  data: null,
  error: null,

  show(name) {
    this.name = name;
    this.data = null;
    this.error = null;
    showPage("player");
  },

  async open() {
    this.draw();
    try {
      this.data = await API.get("/users/" + encodeURIComponent(this.name));
    } catch (e) {
      this.error = e.message;
    }
    if (currentPage === "player") this.draw();
  },

  draw() {
    const d = this.data;
    const back = `<button class="learn-back" data-more="leaderboard"><svg><use href="#i-back"/></svg>Leaderboard</button>`;
    if (!d) {
      $("content-page").innerHTML = `<div class="content-wrap">${back}<p class="rv-muted">${this.error ? escapeHTML(this.error) : "Loading…"}</p></div>`;
      return;
    }
    const isMe = d.name.toLowerCase() === Accounts.name().toLowerCase();
    const friend = Accounts.getFriend(d.name);
    const online = Date.now() - (d.lastSeen || 0) < 5 * 60000;
    const total = d.stats.wins + d.stats.draws + d.stats.losses;
    const pct = (n) => (total ? (n / total) * 100 : 0);
    const tile = (name, value, icon, games) => `
      <div class="rating-tile"><svg><use href="#${icon}"/></svg><span>${name}</span><b>${value || "–"}</b>${games !== undefined ? `<small class="rv-muted">${games} game${games === 1 ? "" : "s"}</small>` : ""}</div>`;

    let actions = "";
    if (!isMe && Accounts.online()) {
      if (friend && friend.status === "friends") {
        actions = `
          <button class="btn btn-green btn-small" data-challenge="${escapeHTML(d.name)}">Challenge</button>
          <button class="btn btn-gray btn-small" data-player-dm="${escapeHTML(d.name)}">Message</button>`;
      } else if (friend && friend.status === "outgoing") actions = `<span class="rv-muted">Friend request sent</span>`;
      else if (friend && friend.status === "incoming") actions = `<button class="btn btn-green btn-small" data-friend-accept="${escapeHTML(d.name)}">Accept friend request</button>`;
      else actions = `<button class="btn btn-green btn-small" data-add-friend="${escapeHTML(d.name)}">Add friend</button>`;
    }

    $("content-page").innerHTML = `
      <div class="content-wrap">
        ${back}
        <div class="profile-head">
          ${userAvatarHTML(d.name, d.color, "huge")}
          <div>
            <h1>${escapeHTML(d.name)} ${flagHTML(d.country)}</h1>
            ${d.bio ? `<p class="profile-bio">${escapeHTML(d.bio)}</p>` : ""}
            <span class="rv-muted">Joined ${formatDate(d.created)} · ${d.friends} friend${d.friends === 1 ? "" : "s"} · ${d.achievements} achievement${d.achievements === 1 ? "" : "s"}</span>
            <div class="presence ${online ? "online" : ""}">${online ? "● Online now" : "Last online " + formatDate(d.lastSeen)}</div>
          </div>
          <div class="player-actions">${actions}</div>
        </div>
        <div class="rating-tiles">
          ${tile("Rapid", d.ratings.rapid.r, "i-clock", d.ratings.rapid.n)}
          ${tile("Blitz", d.ratings.blitz.r, "i-bolt", d.ratings.blitz.n)}
          ${tile("Bullet", d.ratings.bullet.r, "i-bullet", d.ratings.bullet.n)}
          ${tile("Daily", d.ratings.daily.r, "i-sun", d.ratings.daily.n)}
          ${tile("Puzzles", d.puzzleGames ? d.puzzles : null, "i-puzzle", d.puzzleGames)}
          ${tile("Bots", d.bots, "i-robot")}
          ${VARIANTS.filter((v) => isVariant(v.id) && d.ratings[v.id] && d.ratings[v.id].n > 0).map((v) => `
            <div class="rating-tile"><span class="variant-tile-icon">${v.icon}</span><span>${v.name}</span><b>${d.ratings[v.id].r}</b><small class="rv-muted">${d.ratings[v.id].n} game${d.ratings[v.id].n === 1 ? "" : "s"}</small></div>`).join("")}
        </div>
        <section class="social-card">
          <h2>Stats</h2>
          <div class="stat-bar">
            <span class="win" style="width:${pct(d.stats.wins)}%"></span>
            <span class="draw" style="width:${pct(d.stats.draws)}%"></span>
            <span class="loss" style="width:${pct(d.stats.losses)}%"></span>
          </div>
          <div class="stat-numbers"><span><b>${d.stats.wins}</b> Won</span><span><b>${d.stats.draws}</b> Drawn</span><span><b>${d.stats.losses}</b> Lost</span></div>
          <h2>Recent games</h2>
          ${d.games.length ? `<div class="pl-games">${d.games.map((g) => `
            <div class="pl-game">
              <span class="pl-result ${g.result === "1/2-1/2" ? "draw" : (g.result === "1-0") === (g.white === d.name) ? "win" : "loss"}">${g.result === "1/2-1/2" ? "½" : (g.result === "1-0") === (g.white === d.name) ? "W" : "L"}</span>
              <span class="pl-players"><span><b>${escapeHTML(g.white || "?")}</b> vs <b>${escapeHTML(g.black || "?")}</b></span><small class="rv-muted">${escapeHTML(g.modeLabel || "")}${g.opening ? " · " + escapeHTML(g.opening) : ""}</small></span>
              <span class="rv-muted pl-meta">${Math.ceil(g.moves / 2)} move${Math.ceil(g.moves / 2) === 1 ? "" : "s"} · ${formatDate(g.date)}</span>
            </div>`).join("")}</div>` : `<p class="rv-muted">No games yet.</p>`}
        </section>
      </div>`;
  },
};

Pages.player = PlayerPage;

// Klik på Leaderboard- og spillersiderne
$("content-page").addEventListener("click", (e) => {
  if (currentPage !== "leaderboard" && currentPage !== "player") return;
  const tab = e.target.closest("[data-lb-tab]");
  if (tab) { LeaderboardPage.tab = tab.dataset.lbTab; return LeaderboardPage.open(); }
  const cat = e.target.closest("[data-lb-cat]");
  if (cat) { LeaderboardPage.category = cat.dataset.lbCat; return LeaderboardPage.open(false); }
  const player = e.target.closest("[data-player]");
  if (player) return PlayerPage.show(player.dataset.player);
  const dm = e.target.closest("[data-player-dm]");
  if (dm) {
    Friends.chatWith = Friends.key(dm.dataset.playerDm);
    Friends.loadChat(dm.dataset.playerDm);
    showPage("social");
  }
});
$("content-page").addEventListener("input", (e) => {
  if (e.target.id !== "lb-search") return;
  LeaderboardPage.search = e.target.value;
  LeaderboardPage.searchFocused = true;
  LeaderboardPage.open(false);
});