// ===================================================================
// explorer.js – åbningsbibliotek på analysebrættet (som på chess.com/Lichess).
//
// Tre kilder:
//  - "Chesshub": træk fra alle ratede partier spillet på Chesshub (vores server)
//  - "Masters": 2+ millioner partier fra stormestre (Lichess)
//  - "Lichess": partier fra Lichess-spillere
// Lichess kræver nu, at man er logget ind for at bruge deres bibliotek. Derfor kan
// man forbinde sin Lichess-konto ("Connect Lichess"). Det bruger Lichess' officielle
// login (OAuth med PKCE): Chesshub ser aldrig ens Lichess-adgangskode.
// ===================================================================

const LICHESS_TOKEN_KEY = "chesshub-lichess-token";

const LichessAuth = {
  token() {
    try { return localStorage.getItem(LICHESS_TOKEN_KEY); } catch (e) { return null; }
  },

  redirectUri() {
    return location.origin + location.pathname;
  },

  // Tilfældig tekst i "base64url"-format
  random(bytes = 32) {
    const arr = crypto.getRandomValues(new Uint8Array(bytes));
    return btoa(String.fromCharCode(...arr)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },

  async challenge(verifier) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },

  // Send brugeren til Lichess for at logge ind (kommer tilbage med ?code=...)
  async connect() {
    const verifier = this.random(48);
    const state = this.random(12);
    sessionStorage.setItem("lichess-verifier", verifier);
    sessionStorage.setItem("lichess-state", state);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: "chesshub",
      redirect_uri: this.redirectUri(),
      code_challenge_method: "S256",
      code_challenge: await this.challenge(verifier),
      state,
    });
    location.href = "https://lichess.org/oauth?" + params;
  },

  // Kaldes når siden åbnes: kommer vi tilbage fra Lichess?
  async handleRedirect() {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state || state !== sessionStorage.getItem("lichess-state")) return false;
    params.delete("code");
    params.delete("state");
    const rest = params.toString();
    history.replaceState(null, "", location.pathname + (rest ? "?" + rest : ""));
    try {
      const response = await fetch("https://lichess.org/api/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code", code, client_id: "chesshub",
          redirect_uri: this.redirectUri(), code_verifier: sessionStorage.getItem("lichess-verifier"),
        }),
      });
      const data = await response.json();
      if (!data.access_token) throw new Error(data.error_description || "No token");
      localStorage.setItem(LICHESS_TOKEN_KEY, data.access_token);
      showToast("Lichess connected! The Masters database is ready.");
      Explorer.source = "masters";
      Review.openAnalysis();
    } catch (e) {
      showToast("Couldn't connect to Lichess: " + e.message);
    }
    return true;
  },

  disconnect() {
    localStorage.removeItem(LICHESS_TOKEN_KEY);
    showToast("Lichess disconnected");
  },
};

const Explorer = {
  source: "chesshub",  // "chesshub", "masters" eller "lichess"
  cache: {},
  token: 0,

  // Henter trækkene for en stilling og tegner tabellen i analysepanelet
  async show(fen) {
    const el = $("rv-explorer");
    if (!el) return;
    const token = ++this.token;
    const cacheKey = this.source + "|" + fen;
    el.innerHTML = this.frameHTML(this.cache[cacheKey] ? this.tableHTML(this.cache[cacheKey]) : `<div class="rv-muted rv-center"><span class="spinner"></span></div>`);
    if (this.cache[cacheKey]) return;
    let result;
    try {
      result = await this.fetch(fen);
      this.cache[cacheKey] = result;
    } catch (e) {
      result = { error: e.message };
    }
    if (token !== this.token || !$("rv-explorer")) return;
    $("rv-explorer").innerHTML = this.frameHTML(this.tableHTML(result));
  },

  async fetch(fen) {
    if (this.source === "chesshub") {
      if (!API.enabled) throw new Error("The Chesslab database needs the online version");
      const { moves } = await API.get("/explorer?fen=" + encodeURIComponent(fen));
      return { moves };
    }
    const token = LichessAuth.token();
    if (!token) return { needLogin: true };
    const url = this.source === "masters"
      ? "https://explorer.lichess.ovh/masters?fen=" + encodeURIComponent(fen)
      : "https://explorer.lichess.ovh/lichess?variant=standard&speeds=blitz,rapid,classical&ratings=1600,1800,2000,2200,2500&fen=" + encodeURIComponent(fen);
    const response = await fetch(url, { headers: { authorization: "Bearer " + token } });
    if (response.status === 401) {
      LichessAuth.disconnect();
      return { needLogin: true };
    }
    if (!response.ok) throw new Error("Lichess explorer error " + response.status);
    const data = await response.json();
    return { moves: data.moves.map((m) => ({ san: m.san, white: m.white, draws: m.draws, black: m.black })), opening: data.opening && data.opening.name };
  },

  frameHTML(inner) {
    const tabs = [["chesshub", "Chesslab"], ["masters", "Masters"], ["lichess", "Lichess"]];
    return `
      <div class="rv-section-title explorer-head">
        <span>Opening explorer</span>
        <span class="explorer-tabs">${tabs.map(([id, name]) => `<button class="${id === this.source ? "selected" : ""}" data-explorer-src="${id}">${name}</button>`).join("")}</span>
      </div>
      ${inner}`;
  },

  tableHTML(r) {
    if (r.needLogin) {
      return `<div class="explorer-login">
        <p class="rv-muted">Lichess now requires a (free) Lichess account to use their opening database with millions of games.</p>
        <button class="btn btn-gray btn-small" data-lichess-connect>Connect Lichess account</button>
      </div>`;
    }
    if (r.error) return `<p class="rv-muted">${escapeHTML(r.error)}</p>`;
    if (!r.moves.length) {
      return `<p class="rv-muted">${this.source === "chesshub" ? "No Chesslab games reached this position yet. (Only rated online games count.)" : "No games in this position."}</p>`;
    }
    const total = r.moves.reduce((s, m) => s + m.white + m.draws + m.black, 0);
    const pct = (n, all) => (all ? Math.round((n / all) * 100) : 0);
    return `
      ${r.opening ? `<div class="rv-muted explorer-opening">${escapeHTML(r.opening)}</div>` : ""}
      <div class="explorer-table">
        ${r.moves.slice(0, 12).map((m) => {
          const n = m.white + m.draws + m.black;
          return `
          <button class="explorer-row" data-explorer-move="${escapeHTML(m.san)}">
            <b>${escapeHTML(m.san)}</b>
            <span class="rv-muted">${n.toLocaleString("en-US")} <small>(${pct(n, total)}%)</small></span>
            <span class="explorer-bar" title="White ${pct(m.white, n)}% · Draw ${pct(m.draws, n)}% · Black ${pct(m.black, n)}%">
              <span class="w" style="width:${pct(m.white, n)}%">${pct(m.white, n) >= 15 ? pct(m.white, n) + "%" : ""}</span>
              <span class="d" style="width:${pct(m.draws, n)}%">${pct(m.draws, n) >= 15 ? pct(m.draws, n) + "%" : ""}</span>
              <span class="b" style="width:${pct(m.black, n)}%">${pct(m.black, n) >= 15 ? pct(m.black, n) + "%" : ""}</span>
            </span>
          </button>`;
        }).join("")}
      </div>
      ${LichessAuth.token() && this.source !== "chesshub" ? `<button class="link-btn" data-lichess-disconnect>Disconnect Lichess</button>` : ""}`;
  },
};

// Klik i explorer-tabellen (den ligger i analysepanelet)
$("review-panel").addEventListener("click", (e) => {
  const src = e.target.closest("[data-explorer-src]");
  if (src) { Explorer.source = src.dataset.explorerSrc; Explorer.show(Review.positions[Review.viewPly]); return; }
  const mv = e.target.closest("[data-explorer-move]");
  if (mv) {
    const chess = new Chess(Review.positions[Review.viewPly]);
    const move = chess.move(mv.dataset.explorerMove);
    Review.onMove(move.from, move.to, move.promotion);
    return;
  }
  if (e.target.closest("[data-lichess-connect]")) return LichessAuth.connect();
  if (e.target.closest("[data-lichess-disconnect]")) { LichessAuth.disconnect(); Explorer.cache = {}; Explorer.show(Review.positions[Review.viewPly]); }
});