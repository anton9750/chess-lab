// ===================================================================
// insights.js – "Insights": statistik over alle dine partier
// (på chess.com kræver det Premium – her er det gratis).
//
// Viser bl.a.:
//  - sejre/remis/tab, som hvid og som sort
//  - præcision (accuracy) over tid og i hver fase af partiet
//  - dine bedste og dårligste åbninger
//  - hvordan dine partier ender (mat, tid, opgivet …)
//
// Præcision kræver, at partiet er gennemgået med Game Review. Knappen
// "Analyze my games" gennemgår flere partier på én gang i baggrunden.
// ===================================================================

const InsightsPage = {
  category: "all",   // "all", "rapid", "blitz", "bullet" eller "bots"
  period: 0,         // antal dage (0 = altid)
  running: false,    // er vi ved at analysere partier?
  done: 0,           // hvor mange partier er analyseret i denne omgang
  todo: 0,           // hvor mange skal analyseres i alt
  partial: 0,        // hvor langt det nuværende parti er (0–1)
  token: 0,          // bruges til at stoppe analysen, hvis man forlader siden

  // De partier der tæller med (kun mine partier mod bots/venner)
  games() {
    const since = this.period ? Date.now() - this.period * 86400000 : 0;
    return Accounts.profile().games.filter((g) =>
      g.myColor && g.date >= since && (this.category === "all" || g.ratingCategory === this.category));
  },

  // Vandt, tabte eller remis – set fra min side
  outcome(g) {
    if (g.result === "1/2-1/2") return "draw";
    return (g.result === "1-0") === (g.myColor === "w") ? "win" : "loss";
  },

  // Tæller sejre/remis/tab i en liste partier
  record(list) {
    const r = { win: 0, draw: 0, loss: 0, total: list.length };
    list.forEach((g) => r[this.outcome(g)]++);
    r.pct = r.total ? Math.round((r.win / r.total) * 100) : 0;
    return r;
  },

  // Farvet bjælke med sejre (grøn), remis (grå) og tab (rød)
  recordBar(r) {
    const w = (n) => (r.total ? (n / r.total) * 100 : 0);
    return `
      <div class="stat-bar">
        <span class="win" style="width:${w(r.win)}%"></span>
        <span class="draw" style="width:${w(r.draw)}%"></span>
        <span class="loss" style="width:${w(r.loss)}%"></span>
      </div>`;
  },

  open() {
    const games = this.games();
    const all = this.record(games);
    const reviewed = games.filter((g) => g.review && g.review.accuracy !== null);
    const unreviewed = games.filter((g) => !g.review);

    const cats = [["all", "All"], ["rapid", "Rapid"], ["blitz", "Blitz"], ["bullet", "Bullet"], ["bots", "Bots"]];
    const periods = [[7, "Last 7 days"], [30, "Last 30 days"], [90, "Last 90 days"], [0, "All time"]];

    const filters = `
      <div class="ins-filters">
        <div class="lb-cats">${cats.map(([id, name]) => `<button class="tv-channel ${id === this.category ? "selected" : ""}" data-ins-cat="${id}">${name}</button>`).join("")}</div>
        <select class="pz-select" id="ins-period">
          ${periods.map(([d, name]) => `<option value="${d}" ${d === this.period ? "selected" : ""}>${name}</option>`).join("")}
        </select>
      </div>`;

    let body;
    if (!games.length) {
      body = `
        <section class="social-card ins-empty">
          <p>No games here yet.</p>
          <p class="rv-muted">Play against a bot or a friend, and your insights will show up here.</p>
          <button class="btn btn-green" data-ins-go="play">Play a game</button>
        </section>`;
    } else {
      body = `
        ${this.analyzeBoxHTML(unreviewed.length)}
        <div class="dash-cards ins-cards">
          <div class="dash-card"><b>${all.total}</b><span>Games</span></div>
          <div class="dash-card"><b>${all.pct}%</b><span>Win rate</span></div>
          <div class="dash-card"><b>${reviewed.length ? this.avg(reviewed.map((g) => g.review.accuracy)) : "–"}</b><span>Avg. accuracy</span></div>
          <div class="dash-card">${this.ratingChangeText(games)}<span>Rating change</span></div>
        </div>
        <div class="ins-grid">
          ${this.resultsHTML(games)}
          ${this.accuracyHTML(reviewed)}
          ${this.phasesHTML(reviewed)}
          ${this.qualityHTML(reviewed)}
          ${this.openingsHTML(games, "w")}
          ${this.openingsHTML(games, "b")}
          ${this.endingsHTML(games)}
          ${this.lengthHTML(games)}
        </div>`;
    }

    $("content-page").innerHTML = `
      <div class="content-wrap">
        <h1 class="content-title"><svg class="nav-icon"><use href="#i-chart"/></svg>Insights</h1>
        ${filters}
        ${body}
      </div>`;
  },

  avg(list) {
    return list.length ? (list.reduce((a, b) => a + b, 0) / list.length).toFixed(1) : "–";
  },

  ratingChangeText(games) {
    const sum = games.reduce((s, g) => s + (g.ratingChange || 0), 0);
    return `<b class="${sum >= 0 ? "ins-up" : "ins-down"}">${sum >= 0 ? "+" : ""}${sum}</b>`;
  },

  // Boksen med "Analyze my games"
  analyzeBoxHTML(count) {
    if (this.running) {
      const pct = Math.round(((this.done + this.partial) / this.todo) * 100);
      return `
        <section class="social-card ins-analyze">
          <div><b>Analyzing your games… ${this.done} / ${this.todo}</b>
          <span class="rv-muted">Stockfish is reviewing every move. You can keep this page open.</span></div>
          <div class="rv-progress"><div class="rv-progress-fill" id="ins-progress" style="width:${pct}%"></div></div>
          <button class="btn btn-gray btn-small" data-ins-stop>Stop</button>
        </section>`;
    }
    if (!count) return "";
    const n = Math.min(count, 20);
    return `
      <section class="social-card ins-analyze">
        <div><b>${count} game${count === 1 ? "" : "s"} not reviewed yet</b>
        <span class="rv-muted">Accuracy, mistakes and phases need a Game Review. Let Stockfish review them now (about 15 seconds per game).</span></div>
        <button class="btn btn-green" data-ins-analyze>Analyze ${n} game${n === 1 ? "" : "s"}</button>
      </section>`;
  },

  // Resultater: samlet, som hvid og som sort
  resultsHTML(games) {
    const row = (label, list) => {
      const r = this.record(list);
      return `
        <div class="ins-row">
          <div class="ins-row-head"><b>${label}</b><span class="rv-muted">${r.total} game${r.total === 1 ? "" : "s"} · ${r.pct}% won</span></div>
          ${this.recordBar(r)}
          <div class="stat-numbers"><span><b>${r.win}</b> Won</span><span><b>${r.draw}</b> Drawn</span><span><b>${r.loss}</b> Lost</span></div>
        </div>`;
    };
    return `
      <section class="social-card">
        <h2>Results</h2>
        ${row("As White", games.filter((g) => g.myColor === "w"))}
        ${row("As Black", games.filter((g) => g.myColor === "b"))}
      </section>`;
  },

  // Præcision over tid (kun gennemgåede partier)
  accuracyHTML(reviewed) {
    const list = reviewed.slice().sort((a, b) => a.date - b.date);
    const fmt = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return `
      <section class="social-card">
        <h2>Accuracy</h2>
        ${lineChartSVG(list.map((g) => g.review.accuracy), {
          labels: list.length > 1 ? [fmt(list[0].date), fmt(list[list.length - 1].date)] : [],
          empty: "Review at least 2 games to see your accuracy over time.",
        })}
        ${list.length ? `<p class="rv-muted">Best game: <b>${Math.max(...list.map((g) => g.review.accuracy))}%</b> · Based on ${list.length} reviewed game${list.length === 1 ? "" : "s"}.</p>` : ""}
      </section>`;
  },

  // Åbning, midtspil og slutspil: præcision og fejl pr. parti
  phasesHTML(reviewed) {
    const names = [["opening", "Opening"], ["middlegame", "Middlegame"], ["endgame", "Endgame"]];
    const rows = names.map(([id, name]) => {
      const with_ = reviewed.filter((g) => g.review.phases[id].moves > 0);
      const acc = with_.length ? this.avg(with_.map((g) => g.review.phases[id].acc)) : "–";
      const errors = with_.length ? (with_.reduce((s, g) => s + g.review.phases[id].errors, 0) / with_.length).toFixed(1) : "–";
      return { name, acc, errors };
    });
    // Den svageste fase = laveste præcision
    const scored = rows.filter((r) => r.acc !== "–");
    const weakest = scored.length > 1 ? scored.reduce((a, b) => (Number(a.acc) < Number(b.acc) ? a : b)) : null;
    return `
      <section class="social-card">
        <h2>Game phases</h2>
        ${reviewed.length ? `
          <div class="ins-table">
            <div class="ins-th"><span>Phase</span><span>Accuracy</span><span>Mistakes / game</span></div>
            ${rows.map((r) => `
              <div class="ins-tr ${weakest === r ? "weak" : ""}">
                <span><b>${r.name}</b></span>
                <span>${r.acc === "–" ? "–" : percentBar(Number(r.acc), Number(r.acc) >= 80 ? "good" : Number(r.acc) < 60 ? "bad" : "") + `<small>${r.acc}%</small>`}</span>
                <span>${r.errors}</span>
              </div>`).join("")}
          </div>
          ${weakest ? `<p class="rv-muted">💡 Your weakest phase is the <b>${weakest.name.toLowerCase()}</b>. ${this.phaseTip(weakest.name)}</p>` : ""}`
          : `<p class="rv-muted">Review some games to see how you play in each phase.</p>`}
      </section>`;
  },

  phaseTip(name) {
    if (name === "Opening") return "Try the Openings page and the Learn lessons.";
    if (name === "Endgame") return "Puzzle themes like Rook endgame and Pawn endgame will help.";
    return "Tactics puzzles (forks, pins, skewers) are the best training.";
  },

  // Hvor mange af mine træk var bedste træk, fejl, brølere osv.
  qualityHTML(reviewed) {
    const total = {};
    let moves = 0;
    reviewed.forEach((g) => Object.entries(g.review.counts).forEach(([cls, n]) => {
      total[cls] = (total[cls] || 0) + n;
      moves += n;
    }));
    const rows = CLASS_TABLE_ORDER.map((cls) => {
      const n = total[cls] || 0;
      return `
        <div class="ins-quality">
          <span class="rv-cls"><span class="cls-icon cls-${cls}">${MOVE_CLASSES[cls].symbol}</span>${MOVE_CLASSES[cls].name}</span>
          <span class="ins-q-bar">${percentBar(moves ? (n / moves) * 100 : 0, "cls-bar-" + cls)}</span>
          <span class="rv-muted">${n}</span>
        </div>`;
    }).join("");
    return `
      <section class="social-card">
        <h2>Move quality</h2>
        ${moves ? rows : `<p class="rv-muted">Review some games to see the quality of your moves.</p>`}
      </section>`;
  },

  // Mine åbninger som hvid eller sort, sorteret efter antal partier
  openingsHTML(games, color) {
    const groups = {};
    games.filter((g) => g.myColor === color).forEach((g) => {
      // Kun hoved-navnet: "Sicilian Defense: Najdorf" → "Sicilian Defense"
      const name = (g.opening || "Uncommon Opening").split(":")[0];
      (groups[name] = groups[name] || []).push(g);
    });
    const list = Object.entries(groups).map(([name, list]) => ({ name, r: this.record(list) }))
      .sort((a, b) => b.r.total - a.r.total).slice(0, 6);
    return `
      <section class="social-card">
        <h2>Openings as ${color === "w" ? "White" : "Black"}</h2>
        ${list.length ? list.map(({ name, r }) => `
          <div class="ins-row">
            <div class="ins-row-head"><b>${escapeHTML(name)}</b><span class="rv-muted">${r.total} game${r.total === 1 ? "" : "s"} · ${r.pct}% won</span></div>
            ${this.recordBar(r)}
          </div>`).join("") : `<p class="rv-muted">No games as ${color === "w" ? "White" : "Black"} yet.</p>`}
      </section>`;
  },

  // Hvordan partierne slutter
  endingsHTML(games) {
    const tally = (outcome) => {
      const t = {};
      games.filter((g) => this.outcome(g) === outcome).forEach((g) => {
        const reason = (g.reason || "other").replace(/^(by|on) /, "");
        t[reason] = (t[reason] || 0) + 1;
      });
      return Object.entries(t).sort((a, b) => b[1] - a[1]);
    };
    const list = (rows, total) => rows.length ? rows.map(([reason, n]) => `
      <div class="ins-quality">
        <span>${reason[0].toUpperCase() + reason.slice(1)}</span>
        <span class="ins-q-bar">${percentBar((n / total) * 100)}</span>
        <span class="rv-muted">${n}</span>
      </div>`).join("") : `<p class="rv-muted">None yet.</p>`;
    const r = this.record(games);
    return `
      <section class="social-card">
        <h2>How I win</h2>
        ${list(tally("win"), r.win)}
        <h2>How I lose</h2>
        ${list(tally("loss"), r.loss)}
      </section>`;
  },

  // Hvor lange partierne er
  lengthHTML(games) {
    const moves = (g) => Math.ceil(g.sans.length / 2);
    const avgOf = (list) => (list.length ? Math.round(list.reduce((s, g) => s + moves(g), 0) / list.length) : "–");
    const won = games.filter((g) => this.outcome(g) === "win");
    const lost = games.filter((g) => this.outcome(g) === "loss");
    const longest = games.reduce((a, g) => (moves(g) > moves(a) ? g : a), games[0]);
    return `
      <section class="social-card">
        <h2>Game length</h2>
        <div class="dash-cards">
          <div class="dash-card"><b>${avgOf(games)}</b><span>Avg. moves</span></div>
          <div class="dash-card"><b>${avgOf(won)}</b><span>In wins</span></div>
          <div class="dash-card"><b>${avgOf(lost)}</b><span>In losses</span></div>
        </div>
        <p class="rv-muted">Longest game: <b>${moves(longest)} moves</b> vs ${escapeHTML((longest.myColor === "w" ? longest.black : longest.white).name)}.</p>
      </section>`;
  },

  // ----- Analysér mange partier i træk -----

  async analyzeGames() {
    if (this.running) return;
    const list = this.games().filter((g) => !g.review).slice(0, 20);
    if (!list.length) return;
    const token = ++this.token;
    this.running = true;
    this.done = 0;
    this.todo = list.length;
    this.partial = 0;
    this.open();

    for (const game of list) {
      const summary = await quickReviewGame(game, () => token !== this.token, (p) => {
        this.partial = p;
        const bar = $("ins-progress");
        if (bar) bar.style.width = Math.round(((this.done + p) / this.todo) * 100) + "%";
      });
      if (token !== this.token) return; // stoppet
      if (summary) {
        game.review = summary;
        Accounts.save();
      }
      this.done++;
      this.partial = 0;
      if (currentPage === "insights") this.open();
    }
    this.running = false;
    showToast("Done! Your insights are updated.");
    if (currentPage === "insights") this.open();
  },

  stop() {
    this.token++;
    this.running = false;
    getEngine().stop();
  },

  // Forlader man siden, stoppes analysen (motoren skal bruges andre steder)
  leave() {
    if (this.running) this.stop();
  },
};

Pages.insights = InsightsPage;

$("content-page").addEventListener("click", (e) => {
  if (currentPage !== "insights") return;
  const cat = e.target.closest("[data-ins-cat]");
  if (cat) { InsightsPage.category = cat.dataset.insCat; return InsightsPage.open(); }
  if (e.target.closest("[data-ins-analyze]")) return InsightsPage.analyzeGames();
  if (e.target.closest("[data-ins-stop]")) { InsightsPage.stop(); return InsightsPage.open(); }
  if (e.target.closest("[data-ins-go]")) { showPage("play"); switchTab("bots"); }
});
$("content-page").addEventListener("change", (e) => {
  if (e.target.id === "ins-period") {
    InsightsPage.period = Number(e.target.value);
    InsightsPage.open();
  }
});