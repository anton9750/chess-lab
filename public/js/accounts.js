// ===================================================================
// accounts.js – brugerkonti, profil og arkiv over spillede partier.
//
// Online (siden ligger på Netlify):
//   Kontoen ligger på Chesshubs server. Man kan logge ind fra alle enheder.
//   Serveren bestemmer: adgangskode, venner og ratings for online-partier.
//   Resten af profilen (arkiv, puzzles, præstationer …) ejes af browseren
//   og sendes til serveren, når den ændres ("synkronisering").
//
// Fra mappen (file://): der er ingen server, så konti gemmes kun i denne
// browser – præcis som i den første version.
// ===================================================================

const ACCOUNTS_KEY = "chesshub-accounts-v2"; // nyt navn = alle starter forfra på det nye system
const FRIEND_INFO_KEY = "chesshub-friend-info";
const GUEST = "Guest";
// Ratings som serveren bestemmer (resten, fx "bots", bestemmer browseren)
const SERVER_CATEGORIES = ["bullet", "blitz", "rapid", "daily",
  "chess960", "kingofthehill", "threecheck", "atomic", "antichess", "horde", "racingkings", "crazyhouse"];

// Indlæser konti fra browseren
function loadAccounts() {
  try {
    const data = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}");
    return { users: data.users || {}, current: data.current || null };
  } catch (error) {
    return { users: {}, current: null };
  }
}

const Accounts = {
  data: loadAccounts(),
  friendInfo: (() => { try { return JSON.parse(localStorage.getItem(FRIEND_INFO_KEY) || "{}"); } catch (e) { return {}; } })(),
  pushTimer: null,
  dirty: false,      // har browseren ændringer, som serveren ikke har fået endnu?

  // Gemmer i browseren – og sender (lidt senere) ændringerne til serveren
  save() {
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(this.data));
    } catch (error) {
      // Kunne ikke gemme – fortsæt alligevel
    }
    if (this.online()) {
      this.dirty = true;
      clearTimeout(this.pushTimer);
      this.pushTimer = setTimeout(() => this.push(), 2500);
    }
  },

  // Er jeg logget ind på serveren (og ikke bare lokalt)?
  online() {
    return API.enabled && !!API.token && this.isLoggedIn();
  },

  // Laver en tom profil
  newProfile(username) {
    return {
      username,
      created: Date.now(),
      color: ["#81b64c", "#4c9dd9", "#e4733e", "#c25b5b", "#9b6bd6", "#d6a33a"][Math.floor(Math.random() * 6)],
      ratings: { rapid: 1200, blitz: 1200, bullet: 1200, bots: 1200, daily: 1200 },
      rd: {},         // rating-usikkerhed fra serveren (høj = "foreløbig" rating)
      stats: { wins: 0, losses: 0, draws: 0 },
      games: [],      // arkiv over partier (nyeste først)
      friends: [],    // [{ name, status }]
    };
  },

  // Den profil der bruges lige nu (logget ind eller gæst)
  profile() {
    if (this.data.current && this.data.users[this.data.current]) return this.data.users[this.data.current];
    if (!this.data.users[GUEST]) this.data.users[GUEST] = this.newProfile(GUEST);
    return this.data.users[GUEST];
  },

  isLoggedIn() {
    return !!(this.data.current && this.data.users[this.data.current]);
  },

  name() {
    return this.isLoggedIn() ? this.data.current : GUEST;
  },

  // ----- Serveren -----

  // Den del af profilen, som browseren ejer (det der sendes til serveren)
  clientPart(profile) {
    const client = { ...profile };
    ["username", "created", "ratings", "rd", "ratingGames", "friends", "unread", "passwordHash"].forEach((k) => delete client[k]);
    client.botsRating = profile.ratings.bots || 1200;
    client.puzzles = profile.puzzles || Puzzles.profile;
    client.puzzleRating = client.puzzles.rating;
    client.puzzleGames = client.puzzles.games || 0;
    return client;
  },

  // Laver en profil ud fra serverens svar
  // keepLocal = behold browserens egne data (fordi de er nyere end serverens)
  applyServer(me, keepLocal = false) {
    const old = this.data.users[me.name];
    const base = keepLocal && old ? this.clientPart(old) : (me.client || {});
    const profile = { ...this.newProfile(me.name), ...base };
    profile.username = me.name;
    profile.created = me.created;
    profile.ratings = { bots: base.botsRating || 1200 };
    profile.rd = {};
    profile.ratingGames = {};
    for (const c of SERVER_CATEGORIES) {
      profile.ratings[c] = me.ratings[c].r;
      profile.rd[c] = me.ratings[c].rd;
      profile.ratingGames[c] = me.ratings[c].n;
    }
    profile.friends = me.friends || [];
    profile.unread = me.unread || {};
    profile.games = profile.games || [];
    profile.stats = profile.stats || { wins: 0, losses: 0, draws: 0 };
    delete profile.botsRating;
    // Puzzles hører til kontoen: Puzzles.profile peger på det samme objekt
    profile.puzzles = { ...emptyPuzzleProfile(), ...(base.puzzles || {}) };
    Puzzles.profile = profile.puzzles;
    this.data.users = { [GUEST]: this.data.users[GUEST] || this.newProfile(GUEST), [me.name]: profile };
    this.data.current = me.name;
    try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(this.data)); } catch (e) { /* ignorer */ }
    return profile;
  },

  // Send mine ændringer til serveren
  async push() {
    if (!this.online()) return;
    clearTimeout(this.pushTimer);
    this.dirty = false;
    try {
      const { me } = await API.put("/me", { client: this.clientPart(this.profile()) });
      // Serveren kan have flettet partier fra en anden enhed ind
      if (!this.dirty) this.applyServer(me, false);
    } catch (e) {
      this.dirty = true; // prøv igen næste gang
    }
  },

  // Hent det nyeste fra serveren (ratings, venner, ulæste beskeder …)
  async refresh() {
    if (!this.online()) return null;
    try {
      const data = await API.get("/me");
      this.applyServer(data.me, this.dirty);
      this.dailyWaiting = data.dailyWaiting || 0;
      return data;
    } catch (e) {
      return null;
    }
  },

  // Login-billetten er udløbet (eller kontoen findes ikke længere)
  sessionExpired() {
    API.setToken(null);
    this.data.current = null;
    this.save();
    showToast("Please log in again");
    if (typeof afterAuthChange === "function") afterAuthChange();
  },

  // ----- Opret konto / log ind / log ud -----

  // Returnerer en fejltekst, eller null hvis det gik godt.
  async signUp(username, password, confirm) {
    username = username.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return "Username must be 3–20 letters, numbers or _";
    if (username.toLowerCase() === GUEST.toLowerCase()) return "That username is not allowed";
    if (password.length < 6) return "Password must be at least 6 characters";
    if (password !== confirm) return "The passwords don't match";
    if (!API.enabled) return this.localSignUp(username, password);
    try {
      const { token, me } = await API.post("/signup", { username, password });
      API.setToken(token);
      this.applyServer(me);
      // Første gang: send den tomme profil (med farve osv.)
      this.save();
      return null;
    } catch (e) {
      return e.message;
    }
  },

  async logIn(username, password) {
    if (!API.enabled) return this.localLogIn(username, password);
    try {
      const { token, me } = await API.post("/login", { username: username.trim(), password });
      API.setToken(token);
      this.applyServer(me);
      return null;
    } catch (e) {
      return e.message;
    }
  },

  logOut() {
    if (this.online()) {
      this.push();
      API.post("/logout").catch(() => {});
    }
    API.setToken(null);
    this.data.current = null;
    Puzzles.profile = loadPuzzleProfile(); // tilbage til gæstens puzzles
    this.save();
  },

  // ----- Lokale konti (kun når siden åbnes fra mappen, uden server) -----

  async hash(password) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("chessplace:" + password));
    return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
  },

  async localSignUp(username, password) {
    const taken = Object.keys(this.data.users).some((u) => u.toLowerCase() === username.toLowerCase());
    if (taken) return "That username is already taken";
    const profile = this.newProfile(username);
    profile.passwordHash = await this.hash(password);
    this.data.users[username] = profile;
    this.data.current = username;
    this.save();
    return null;
  },

  async localLogIn(username, password) {
    const name = Object.keys(this.data.users).find((u) => u.toLowerCase() === username.trim().toLowerCase());
    const user = name && this.data.users[name];
    if (!user || !user.passwordHash) return "Unknown username";
    if ((await this.hash(password)) !== user.passwordHash) return "Wrong password";
    this.data.current = name;
    this.save();
    return null;
  },

  // ----- Arkiv over partier -----

  // Gemmer et færdigt parti i profilen og opdaterer statistik og rating.
  // game = { mode, white, black, result, reason, sans, timeControl, opening, myColor, opponentRating, serverRated }
  // serverRated = true: et online-parti, hvor serveren regner ratingen ud (se Online.report)
  recordGame(game) {
    const profile = this.profile();
    game.id = game.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    game.date = Date.now();

    // Statistik og rating tæller kun når "jeg" spillede mod nogen (bot eller ven)
    if (game.myColor) {
      const won = (game.result === "1-0" && game.myColor === "w") || (game.result === "0-1" && game.myColor === "b");
      const draw = game.result === "1/2-1/2";
      if (won) profile.stats.wins++;
      else if (draw) profile.stats.draws++;
      else profile.stats.losses++;

      const category = game.mode === "bot" ? "bots" : ratingCategory(game.timeControl, game.variant);
      game.ratingCategory = category;
      if (!game.serverRated && !game.unrated) {
        // Elo: hvor meget ratingen ændres afhænger af modstanderens rating
        const mine = profile.ratings[category] || 1200; // (nye kategorier starter på 1200)
        const expected = 1 / (1 + Math.pow(10, ((game.opponentRating || 1200) - mine) / 400));
        const score = won ? 1 : draw ? 0.5 : 0;
        game.ratingChange = Math.round(32 * (score - expected));
        profile.ratings[category] = mine + game.ratingChange;
      }
    }

    profile.games.unshift(game);
    profile.games = profile.games.slice(0, 100); // højst 100 partier gemmes
    this.save();
    return game;
  },

  // Serveren har regnet ratingen ud for et online-parti
  setServerRating(gameId, change) {
    if (!change) return;
    const profile = this.profile();
    const game = profile.games.find((g) => g.id === gameId);
    if (game) {
      game.ratingChange = change.after - change.before;
      game.ratingCategory = change.category;
    }
    profile.ratings[change.category] = change.after;
    this.save();
  },

  // Ratingens udvikling i én kategori (til rating-grafen).
  // Partierne gemmer kun "+12"/"-8", så vi regner baglæns fra den nuværende rating.
  // Giver en liste [{ t: tidspunkt, r: rating }] fra ældst til nyest.
  ratingHistory(category) {
    if (category === "puzzles") return Puzzles.profile.ratingLog || [];
    const profile = this.profile();
    const games = profile.games.filter((g) => g.ratingCategory === category && g.ratingChange !== undefined);
    let rating = profile.ratings[category] || 1200;
    const points = [];
    for (const g of games) {          // nyeste parti først
      points.push({ t: g.date, r: rating });
      rating -= g.ratingChange;       // ratingen før dette parti
    }
    if (games.length) points.push({ t: games[games.length - 1].date - 1, r: rating }); // startpunktet
    return points.reverse();
  },

  // ----- Venner -----
  // Online bestemmer serveren, hvem der er venner. Hver ven: { name, status }
  //   status: "friends"  – I er venner
  //           "outgoing" – jeg har sendt en venneanmodning
  //           "incoming" – personen har sendt mig en anmodning
  // Ekstra info (farve, ratings, sidst set) fra vennenetværket gemmes i friendInfo.
  friendList() {
    const profile = this.profile();
    profile.friends = (profile.friends || []).map((f) => (typeof f === "string" ? { name: f, status: "outgoing" } : f));
    return profile.friends.map((f) => ({ ...(this.friendInfo[f.name.toLowerCase()] || {}), ...f }));
  },

  getFriend(name) {
    return this.friendList().find((f) => f.name.toLowerCase() === String(name).toLowerCase());
  },

  // Gemmer ekstra info om en ven (farve, ratings, sidst set)
  setFriendInfo(name, info) {
    const k = String(name).toLowerCase();
    this.friendInfo[k] = { ...(this.friendInfo[k] || {}), ...info };
    try { localStorage.setItem(FRIEND_INFO_KEY, JSON.stringify(this.friendInfo)); } catch (e) { /* ignorer */ }
  },

  // Kun til lokale konti (uden server): ændr venne-status direkte
  setFriend(name, data) {
    const { status, ...info } = data;
    if (Object.keys(info).length) this.setFriendInfo(name, info);
    if (!status) return;
    const profile = this.profile();
    const friend = profile.friends.find((f) => f.name.toLowerCase() === String(name).toLowerCase());
    if (friend) friend.status = status;
    else profile.friends.push({ name, status });
    this.save();
  },

  removeFriend(name) {
    const profile = this.profile();
    profile.friends = (profile.friends || []).filter((f) => f.name.toLowerCase() !== name.toLowerCase());
    this.save();
  },

  // Folk man har spillet online mod (så man kan tilføje dem som venner)
  addRecentOpponent(name, color) {
    const profile = this.profile();
    profile.recent = (profile.recent || []).filter((r) => r.name.toLowerCase() !== name.toLowerCase());
    profile.recent.unshift({ name, color, time: Date.now() });
    profile.recent = profile.recent.slice(0, 10);
    this.save();
  },
};

// Hvilken rating-kategori en tidskontrol hører til
// Varianter har hver deres rating (som på Lichess), uanset tempo
function ratingCategory(timeControl, variant) {
  if (variant && variant !== "chess") return variant;
  if (timeControl && timeControl.daily) return "daily";
  if (!timeControl || timeControl.base === null) return "rapid";
  const total = timeControl.base + 40 * timeControl.inc; // samme regel som de store sider
  if (total < 180) return "bullet";
  if (total < 600) return "blitz";
  return "rapid";
}

// Viser en dato som "20 Oct 2026"
function formatDate(time) {
  return new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Avatar for en bruger: farvet firkant med forbogstav
function userAvatarHTML(name, color, extraClass = "") {
  if (name === GUEST || !name) {
    return `<div class="avatar avatar-w ${extraClass}"><svg><use href="#i-pawn"/></svg></div>`;
  }
  return `<div class="avatar avatar-letter ${extraClass}" style="background:${color || "#81b64c"}">${name[0].toUpperCase()}</div>`;
}

// Gør tekst sikker at vise som HTML (så en ven ikke kan sende <script> i chatten)
function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ----- PGN (standard-filformatet for skakpartier) -----

// Laver PGN-tekst for et gemt parti
function gamePGN(game) {
  if (isVariant(game.variant)) return variantPGN(game);
  const chess = new Chess(game.startFen || undefined);
  const d = new Date(game.date || Date.now());
  const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  chess.setHeader("Event", game.modeLabel ? `Chesshub: ${game.modeLabel}` : "Chesshub game");
  chess.setHeader("Site", "Chesshub");
  chess.setHeader("Date", date);
  chess.setHeader("White", game.white ? game.white.name : "White");
  chess.setHeader("Black", game.black ? game.black.name : "Black");
  chess.setHeader("Result", game.result || "*");
  if (game.white && game.white.rating) chess.setHeader("WhiteElo", String(game.white.rating));
  if (game.black && game.black.rating) chess.setHeader("BlackElo", String(game.black.rating));
  if (game.timeControl && game.timeControl.base) chess.setHeader("TimeControl", `${game.timeControl.base}+${game.timeControl.inc}`);
  if (game.reason) chess.setHeader("Termination", game.reason);
  game.sans.forEach((san) => chess.move(san));
  return chess.pgn();
}

// PGN for et variant-parti (chess.js kender ikke varianterne, så vi skriver det selv)
function variantPGN(game) {
  const v = findVariant(game.variant);
  const tag = (k, val) => `[${k} "${String(val).replace(/"/g, "'")}"]`;
  const lines = [
    tag("Event", `Chesshub: ${game.modeLabel || v.name}`), tag("Site", "Chesshub"),
    tag("White", game.white ? game.white.name : "White"), tag("Black", game.black ? game.black.name : "Black"),
    tag("Result", game.result || "*"), tag("Variant", v.name), tag("SetUp", "1"), tag("FEN", game.startFen),
  ];
  const black = game.startFen && game.startFen.split(" ")[1] === "b";
  let moves = "";
  game.sans.forEach((san, i) => {
    const ply = i + (black ? 1 : 0);
    if (ply % 2 === 0) moves += `${ply / 2 + 1}. `;
    else if (i === 0) moves += `${Math.floor(ply / 2) + 1}... `;
    moves += san + " ";
  });
  return lines.join("\n") + "\n\n" + moves + (game.result || "*");
}

// Gemmer tekst som en fil på computeren (fx "game.pgn")
function downloadText(filename, text) {
  const blob = new Blob([text], { type: "application/x-chess-pgn" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function downloadGamePGN(game) {
  const name = (s) => String(s || "player").replace(/[^A-Za-z0-9_-]/g, "");
  downloadText(`chesshub_${name(game.white && game.white.name)}_vs_${name(game.black && game.black.name)}.pgn`, gamePGN(game));
  showToast("PGN downloaded");
}