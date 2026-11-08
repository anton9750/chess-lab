// ===================================================================
// online.js – "Play a Friend": spil online mod en ven.
//
// Vi bruger PeerJS (lib/peerjs.min.js). Det forbinder de to browsere
// DIREKTE med hinanden (WebRTC). PeerJS' gratis "mæglerserver" (0.peerjs.com)
// bruges kun til at finde hinanden via en kode.
//
// Mange netværk (skole-wifi, mobildata) blokerer en direkte forbindelse.
// Derfor har vi en reserve: "relay". Så sender begge spillere beskederne
// gennem vores egen server (/api/rooms), og henter modpartens beskeder hvert
// sekund. Det er lidt langsommere, men virker næsten altid.
//
// Sådan foregår det:
//  1. Spiller A trykker "Create game" og får en kode, fx "K7Q2MX".
//  2. Spiller B skriver koden og trykker "Join".
//  3. A bestemmer tid og farver og sender "start". Så spiller I!
// Alle beskeder er små JSON-objekter, fx { type: "move", uci: "e2e4" }.
// ===================================================================

const ID_PREFIX = "chessplace-";

// Til test kan man bruge en lokal PeerJS-server: index.html?peerhost=localhost&peerport=9000
function peerOptions() {
  const params = new URLSearchParams(location.search);
  if (params.get("peerhost")) {
    return { host: params.get("peerhost"), port: Number(params.get("peerport") || 9000), path: "/", secure: false };
  }
  return {}; // standard: PeerJS' gratis cloud-server
}

// Laver en kode på 6 tegn (uden tegn der ligner hinanden, som 0/O og 1/I)
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const Online = {
  peer: null,
  conn: null,
  role: null,           // "host" (den der lavede spillet) eller "guest"
  code: null,
  status: "idle",       // idle → waiting/connecting → playing → ended
  error: null,
  opponent: null,       // { name, rating }
  myColor: "w",
  hostColorChoice: "random",
  timeControl: TIME_CONTROLS[2].items[0],
  variant: "chess",     // fx "chess960" (værten bestemmer)
  startFen: null,
  rematchRequested: false,
  opponentWantsRematch: false,
  disconnected: false,
  transport: null,      // "p2p" (direkte) eller "relay" (gennem serveren)
  relay: null,          // { key, since, timer, lastHeard } når vi bruger serveren

  // ----- Forbindelse -----

  // Opret et spil og vent på en ven
  async create() {
    this.reset();
    this.role = "host";
    this.code = makeCode();
    this.status = "creating";
    this.draw();
    let myCode = this.code;

    // 1) Reservér et rum på serveren (reserven, hvis den direkte forbindelse fejler)
    if (API.enabled) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { key } = await API.post("/rooms", { code: this.code });
          if (this.code !== myCode || this.status !== "creating") return; // annulleret imens
          this.relay = { key, since: 0, timer: null, lastHeard: Date.now() };
          this.pollRelay();
          break;
        } catch (e) {
          if (e.status !== 409 || this.status !== "creating") break;
          this.code = myCode = makeCode(); // koden er i brug – prøv en ny
        }
      }
    }

    // 2) Den direkte forbindelse (PeerJS)
    const ready = () => {
      if (this.status !== "creating") return;
      this.status = "waiting";
      this.draw();
      if (this.onReady) this.onReady(); // fx: send koden til en ven, man udfordrer
    };
    if (typeof Peer === "undefined") {
      if (this.relay) return ready();
      return this.fail("PeerJS could not be loaded.");
    }
    this.peer = new Peer(ID_PREFIX + this.code, peerOptions());
    this.peer.on("open", ready);
    // Kan PeerJS' server ikke nås, klarer vi os med relay alene
    if (this.relay) setTimeout(ready, 4000);
    // En ven forbinder til os
    this.peer.on("connection", (conn) => {
      if (this.conn || this.transport === "relay") {
        conn.on("open", () => { conn.send({ type: "busy" }); setTimeout(() => conn.close(), 500); });
        return;
      }
      this.setupConnection(conn);
    });
    this.peer.on("error", (err) => {
      // Har vi relay, er en PeerJS-fejl ikke slemt – så venter vi bare via serveren
      if (this.relay && err && err.type !== "unavailable-id") { ready(); return; }
      this.handlePeerError(err);
    });
  },

  // Deltag i en vens spil med koden
  join(code) {
    code = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 6) {
      this.error = "The code has 6 characters, e.g. K7Q2MX";
      return this.draw();
    }
    this.reset();
    this.role = "guest";
    this.code = code;
    this.status = "connecting";
    this.draw();

    // Prøv først direkte. Virker det ikke inden 7 sekunder, går vi over til serveren.
    const fallback = () => {
      clearTimeout(this.joinTimer);
      if (this.status !== "connecting" || this.transport) return;
      if (API.enabled) this.joinRelay(code);
      else this.fail("Couldn't connect to that game. Check the code and make sure your friend is waiting.");
    };
    if (typeof Peer === "undefined") return fallback();
    this.peer = new Peer(undefined, peerOptions());
    this.peer.on("open", () => {
      const conn = this.peer.connect(ID_PREFIX + code, { reliable: true });
      this.setupConnection(conn);
    });
    this.peer.on("error", (err) => {
      if (this.transport) return this.handlePeerError(err);
      if (err && err.type === "browser-incompatible" && !API.enabled) return this.handlePeerError(err);
      fallback(); // fx "peer-unavailable" eller netværksfejl → prøv serveren
    });
    clearTimeout(this.joinTimer);
    this.joinTimer = setTimeout(fallback, 7000);
  },

  // Deltag gennem serveren (relay)
  async joinRelay(code) {
    this.closePeer();
    try {
      const { key } = await API.post("/rooms/" + code, { action: "join" });
      if (this.code !== code || this.status !== "connecting") return;
      this.relay = { key, since: 0, timer: null, lastHeard: Date.now() };
      this.transport = "relay";
      this.disconnected = false;
      this.pollRelay();
      this.sendHello();
      // Svarer værten ikke inden 15 sekunder, giver vi op
      this.joinTimer = setTimeout(() => {
        if (this.status === "connecting") this.fail("Your friend didn't answer. Make sure they are still waiting and try again.");
      }, 15000);
    } catch (e) {
      this.fail(e.status === 404 ? "No game found with that code. Check the code and try again." : e.message);
    }
  },

  // Henter nye beskeder fra serveren. Hurtigt (1 sek.) når modstanderen er i gang,
  // langsommere ellers – hvert kald koster lidt af Netlify-kvoten.
  async pollRelay() {
    const relay = this.relay;
    if (!relay) return;
    clearTimeout(relay.timer);
    // Kører der allerede et kald? Så spørg igen lige efter (aldrig to på én gang)
    if (relay.busy) { relay.again = true; return; }
    relay.busy = true;
    try {
      const res = await API.get(`/rooms/${this.code}?key=${relay.key}&since=${relay.since}`);
      if (this.relay !== relay) return;
      for (const m of res.msgs) {
        relay.since = Math.max(relay.since, m.n);
        relay.lastHeard = Date.now();
        // Værten: første besked via serveren → vennen bruger relay
        if (!this.transport && this.role === "host") {
          this.transport = "relay";
          this.closePeer();
          this.sendHello(); // fortæl vennen, hvem vi er
        }
        if (this.transport === "relay") this.onMessage(m.msg);
      }
    } catch (e) {
      if (this.relay !== relay) return;
      relay.busy = false;
      if (e.status === 404 || e.status === 403) {
        if (this.transport === "relay") return this.onDisconnect();
        this.relay = null; // rummet findes ikke – brug kun den direkte forbindelse
        return;
      }
    }
    relay.busy = false;
    // Den direkte forbindelse vandt → stop med at spørge serveren
    if (this.transport === "p2p") { this.relay = null; return; }
    if (this.transport === "relay" && this.status === "playing") {
      // Ping hvert 15. sekund, så modstanderen ved, vi er her
      if (!relay.lastPing || Date.now() - relay.lastPing > 15000) { relay.lastPing = Date.now(); this.send({ type: "ping" }); }
      if (!state.result && Date.now() - relay.lastHeard > 45000) this.onDisconnect();
    }
    const theirTurn = state.mode === "online" && !state.result && state.game.turn() !== this.myColor;
    let delay = this.status === "playing" ? (theirTurn ? 1000 : 2500) : this.status === "ended" ? 4000 : 2000;
    if (relay.again) { relay.again = false; delay = 300; }
    relay.timer = setTimeout(() => this.pollRelay(), delay);
  },

  sendHello() {
    // account = logget ind på serveren → partiet kan blive "ratet"
    this.send({ type: "hello", name: Accounts.name(), rating: this.myRating(), color: Accounts.profile().color, country: Accounts.profile().country || null, account: Accounts.online() });
  },

  setupConnection(conn) {
    this.conn = conn;
    conn.on("open", () => {
      if (this.transport === "relay") { try { conn.close(); } catch (e) { /* ignorer */ } return; }
      this.transport = "p2p";
      clearTimeout(this.joinTimer);
      this.disconnected = false;
      this.sendHello();
    });
    conn.on("data", (msg) => { if (this.transport === "p2p") this.onMessage(msg); });
    // Kun en åben, direkte forbindelse kan "miste forbindelsen" (ellers prøver vi relay)
    const lost = () => {
      if (this.conn !== conn) return;
      if (this.transport === "p2p") this.onDisconnect();
      else this.conn = null; // forbindelsen nåede aldrig at åbne – vent på relay
    };
    conn.on("close", lost);
    conn.on("error", lost);
  },

  handlePeerError(err) {
    const type = err && err.type;
    if (type === "peer-unavailable") this.fail("No game found with that code. Check the code and try again.");
    else if (type === "unavailable-id") this.create(); // koden er i brug – lav en ny
    else if (type === "network" || type === "server-error" || type === "socket-error" || type === "socket-closed") {
      this.fail("Couldn't reach the online server. Check your internet connection.");
    } else if (type === "browser-incompatible") this.fail("This browser doesn't support online play.");
    else this.fail("Something went wrong with the connection (" + (type || "unknown") + ").");
  },

  fail(text) {
    this.error = text;
    this.status = "idle";
    this.closePeer();
    this.stopRelay();
    this.draw();
  },

  send(msg) {
    if (this.transport === "relay" && this.relay) {
      // Én ad gangen, så beskederne kommer frem i den rigtige rækkefølge
      const path = "/rooms/" + this.code;
      const body = { action: "send", key: this.relay.key, msg };
      this.relayQueue = (this.relayQueue || Promise.resolve())
        .then(() => API.post(path, body))
        .catch(() => API.post(path, body).catch(() => {})); // prøv én gang til
      return;
    }
    if (this.conn && this.conn.open) this.conn.send(msg);
  },

  myRating() {
    return Accounts.profile().ratings[ratingCategory(this.timeControl, this.variant)] || 1200;
  },

  closePeer() {
    if (this.conn) { try { this.conn.close(); } catch (e) { /* ignorer */ } }
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignorer */ } }
    this.conn = null;
    this.peer = null;
  },

  stopRelay() {
    if (this.relay) clearTimeout(this.relay.timer);
    this.relay = null;
    this.transport = null;
    this.relayQueue = null;
  },

  reset() {
    this.closePeer();
    this.stopRelay();
    clearTimeout(this.joinTimer);
    this.fixedGameId = null;   // turneringer: partiets id kommer fra serveren
    this.tournamentId = null;
    this.challenging = null;
    this.onReady = null;
    this.error = null;
    this.opponent = null;
    this.rematchRequested = false;
    this.opponentWantsRematch = false;
    this.disconnected = false;
  },

  // Forlad spillet helt
  leave() {
    if (state.mode === "online" && !state.result && this.status === "playing") {
      this.send({ type: "resign" });
      endGame(this.myColor === "w" ? "b" : "w", "by resignation");
    }
    this.send({ type: "bye" });
    this.reset();
    this.status = "idle";
    this.draw();
  },

  // ----- Beskeder fra vennen -----

  onMessage(msg) {
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case "hello":
        clearTimeout(this.joinTimer);
        this.opponent = { name: String(msg.name || "Friend").slice(0, 20), rating: Number(msg.rating) || 1200, color: msg.color, account: !!msg.account, country: typeof msg.country === "string" ? msg.country.slice(0, 6) : null };
        // Værten starter partiet, når vennen har sagt hej
        if (this.role === "host") this.startAsHost();
        break;

      case "ping":
        break;

      case "busy":
        this.fail("That game already has two players.");
        break;

      case "start":
        // Gæsten får besked om tid, farve, variant og partiets id fra værten
        this.timeControl = msg.timeControl;
        this.variant = findVariant(msg.variant).id;
        this.startFen = msg.startFen || null;
        this.beginGame(msg.guestColor, msg.gameId);
        break;

      case "move": {
        if (state.mode !== "online" || state.result) return;
        if (state.game.turn() === this.myColor) return; // ikke modstanderens tur – ignorer
        const move = uciToMove(msg.uci);
        applyMove(move, false);
        // Synkroniser urene med modstanderens tider
        if (clock.enabled && msg.times) {
          clock.time.w = msg.times.w;
          clock.time.b = msg.times.b;
          clock.lastTime = performance.now();
        }
        break;
      }

      case "chat":
        addLog(`<b>${escapeHTML(this.opponent ? this.opponent.name : "Friend")}:</b> ${escapeHTML(String(msg.text).slice(0, 200))}`);
        playSound("move");
        break;

      case "resign":
        if (!state.result) endGame(this.myColor, "by resignation", true);
        break;

      case "draw-offer":
        state.drawOffer = this.myColor === "w" ? "b" : "w";
        addLog(`${escapeHTML(this.opponent.name)} offers a draw`);
        drawControls();
        break;

      case "draw-answer":
        if (msg.accept) endGame(null, "by agreement", true);
        else {
          addLog(`${escapeHTML(this.opponent.name)} declined the draw`);
          state.myDrawOffered = false;
          drawControls();
        }
        break;

      case "gameover":
        // Modstanderens side har afgjort partiet (fx på tid)
        if (!state.result) endGame(msg.winner, msg.reason, true);
        break;

      case "rematch":
        this.opponentWantsRematch = true;
        addLog(`${escapeHTML(this.opponent.name)} wants a rematch!`);
        if (this.rematchRequested && this.role === "host") this.startAsHost(true);
        drawControls();
        this.draw();
        break;

      case "bye":
        this.onDisconnect(true);
        break;
    }
  },

  onDisconnect(left = false) {
    if (this.disconnected) return;
    this.disconnected = true;
    if (this.status === "playing" && !state.result) {
      addLog(`<b>${escapeHTML(this.opponent ? this.opponent.name : "Your friend")} ${left ? "left the game" : "disconnected"}.</b> You can claim the win.`);
    } else if (this.status === "waiting" || this.status === "connecting") {
      this.fail("The connection was lost.");
      return;
    }
    drawControls();
    this.draw();
  },

  // ----- Partiet -----

  // Værten bestemmer farverne og sender "start"
  startAsHost(rematch = false) {
    let hostColor;
    if (rematch) hostColor = this.myColor === "w" ? "b" : "w"; // byt farver ved omkamp
    else if (this.hostColorChoice === "random") hostColor = Math.random() < 0.5 ? "w" : "b";
    else hostColor = this.hostColorChoice;
    const guestColor = hostColor === "w" ? "b" : "w";
    const gameId = this.fixedGameId || this.code + "-" + Date.now().toString(36);
    // Varianter: værten laver startstillingen (Chess960 er tilfældig – begge skal have den samme)
    this.startFen = isVariant(this.variant) ? variantStartFen(this.variant) : null;
    this.send({ type: "start", timeControl: this.timeControl, guestColor, gameId, variant: this.variant, startFen: this.startFen });
    this.beginGame(hostColor, gameId);
  },

  beginGame(myColor, gameId) {
    this.myColor = myColor;
    // Ratet parti? Kun hvis begge er logget ind på serveren (og der er et ur)
    this.gameId = gameId || null;
    this.rated = !!(gameId && Accounts.online() && this.opponent && this.opponent.account && this.timeControl.base !== null);
    if (this.rated) {
      const me = Accounts.name();
      const opp = this.opponent.name;
      API.post("/games/start", { id: gameId, white: myColor === "w" ? me : opp, black: myColor === "w" ? opp : me, tc: this.timeControl, variant: this.variant, startFen: this.startFen, tournament: this.tournamentId })
        .catch(() => { this.rated = false; });
    }
    if (typeof Matchmaking !== "undefined") Matchmaking.gameStarted();
    if (this.tournamentId) API.post("/tournaments/" + this.tournamentId, { action: "started" }).catch(() => {});
    this.status = "playing";
    this.rematchRequested = false;
    this.opponentWantsRematch = false;
    startNewGame({ mode: "online", timeControl: this.timeControl, myColor, opponent: this.opponent, variant: this.variant, startFen: this.startFen });
    this.postLive(); // vis partiet under Watch → Chesshub med det samme
    switchTab("play");
  },

  // Live: værten sender stillingen til serveren, så andre kan se med (Watch → Chesshub).
  // Kun ratede partier mellem to konti vises.
  postLive() {
    if (!this.rated || this.role !== "host" || !this.gameId) return;
    const w = state.players.w;
    const b = state.players.b;
    const r = state.result;
    API.post("/live", {
      id: this.gameId, white: w.name, black: b.name, whiteRating: w.rating, blackRating: b.rating,
      tc: this.timeControl, variant: this.variant, startFen: this.startFen, sans: state.game.history(),
      clock: clock.enabled ? { w: clock.time.w, b: clock.time.b } : null,
      result: r ? (r.winner === "w" ? "1-0" : r.winner === "b" ? "0-1" : "1/2-1/2") : null,
      reason: r ? r.reason : null, tournament: this.tournamentId,
    }).catch(() => {});
  },

  // Partiet er slut: meld resultatet til serveren, som opdaterer begge ratings
  async report(game) {
    const id = this.gameId;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await API.post("/games/report", { id, result: game.result, reason: game.reason, sans: game.sans });
        const change = res.changes && res.changes[Accounts.name().toLowerCase()];
        if (change) {
          Accounts.setServerRating(game.id, change);
          state.players[state.humanColor].rating = change.after;
          drawGameOverRating();
          drawPlayers();
        }
        return;
      } catch (e) {
        // Modstanderen har måske ikke nået at bekræfte partiet endnu – prøv igen om lidt
        if (e.status !== 409 || attempt === 3) {
          game.ratingChange = 0;
          drawGameOverRating();
          return;
        }
        await sleep(1500);
      }
    }
  },

  // Kaldes af main.js, når jeg selv har lavet et træk
  sendMove(move) {
    // Relay: nu er det modstanderens tur → spørg serveren oftere med det samme
    if (this.transport === "relay" && this.relay) {
      clearTimeout(this.relay.timer);
      this.relay.timer = setTimeout(() => this.pollRelay(), 1000);
    }
    this.send({
      type: "move",
      uci: move.uci || move.from + move.to + (move.promotion || ""), // (varianter har selv .uci, fx "N@f3")
      times: clock.enabled ? { w: clock.time.w, b: clock.time.b } : null,
    });
  },

  sendChat(text) {
    text = text.trim();
    if (!text || !this.transport) return;
    this.send({ type: "chat", text });
    addLog(`<b>${escapeHTML(Accounts.name())}:</b> ${escapeHTML(text)}`);
  },

  requestRematch() {
    this.rematchRequested = true;
    this.send({ type: "rematch" });
    addLog("You asked for a rematch");
    // Har vennen allerede spurgt? Så starter værten med det samme
    if (this.opponentWantsRematch && this.role === "host") this.startAsHost(true);
    drawControls();
  },

  // ----- Tegning af "Play a Friend"-siden -----

  draw() {
    const el = $("friend-content");
    if (!el) return;

    if (this.status === "creating" || this.status === "waiting") {
      el.innerHTML = `
        <div class="pz-scroll friend-wait">
          <h2>${this.challenging ? "Challenge sent!" : "Invite a friend"}</h2>
          <p>${this.challenging
            ? `Waiting for <b>${escapeHTML(this.challenging)}</b> to accept. They can also join with this code:`
            : "Send this code to your friend. They open Chesslab, go to <b>Play a Friend</b> and enter it."}</p>
          <div class="friend-code">${this.status === "creating" ? "······" : this.code}</div>
          ${isHosted() ? `<button class="btn btn-green" data-friend="copy-link" ${this.status === "creating" ? "disabled" : ""}>Copy invite link</button>` : ""}
          <button class="btn btn-gray" data-friend="copy" ${this.status === "creating" ? "disabled" : ""}>Copy code</button>
          <div class="friend-spinner"><span class="spinner"></span>${this.status === "creating" ? "Connecting to the server…" : "Waiting for your friend to join…"}</div>
          <button class="btn btn-gray btn-small" data-friend="cancel">Cancel</button>
        </div>`;
      return;
    }
    if (this.status === "connecting") {
      el.innerHTML = `
        <div class="pz-scroll friend-wait">
          <h2>Joining game ${this.code}</h2>
          <div class="friend-spinner"><span class="spinner"></span>Connecting to your friend…</div>
          <button class="btn btn-gray btn-small" data-friend="cancel">Cancel</button>
        </div>`;
      return;
    }

    const tcOptions = TIME_CONTROLS.flatMap((cat) => cat.items.map((item) => ({ item, cat })))
      .map(({ item, cat }, i) => `<option value="${i}" ${item === this.timeControl ? "selected" : ""}>${item.label}${cat.category === "Unlimited" ? "" : " (" + cat.category + ")"}</option>`).join("");

    el.innerHTML = `
      <div class="pz-scroll">
        ${this.error ? `<div class="friend-error">${this.error}</div>` : ""}
        ${this.status === "playing" || this.status === "ended" ? `
          <div class="friend-card">
            <b>You are connected with ${escapeHTML(this.opponent ? this.opponent.name : "your friend")}</b>
            <button class="btn btn-gray btn-small" data-friend="leave">Leave game</button>
          </div>` : ""}
        <div class="friend-card">
          <h3>Create a game</h3>
          <label class="friend-row"><span>Time</span><select class="pz-select" id="friend-tc">${tcOptions}</select></label>
          <label class="friend-row"><span>Variant</span><select class="pz-select" id="friend-variant">${VARIANTS.map((v) => `<option value="${v.id}" ${v.id === this.variant ? "selected" : ""}>${v.icon} ${v.name}</option>`).join("")}</select></label>
          <div class="friend-row"><span>I play as</span>
            <div class="color-choice small">
              ${["w", "random", "b"].map((c) => `<button class="color-btn ${this.hostColorChoice === c ? "selected" : ""}" data-friend-color="${c}">${c === "random" ? '<svg><use href="#i-random"/></svg>' : `<img src="img/pieces/cburnett/${c}K.svg" alt="">`}</button>`).join("")}
            </div>
          </div>
          <button class="btn btn-green btn-huge" data-friend="create">Create invite</button>
        </div>
        <div class="friend-card">
          <h3>Join a game</h3>
          <input class="friend-input" id="friend-code" maxlength="8" placeholder="Enter code, e.g. K7Q2MX" autocomplete="off">
          <button class="btn btn-gray btn-huge" data-friend="join">Join</button>
        </div>
        <p class="rv-muted friend-note">Both players just need the Chesslab link. Games connect directly between
        your browsers – and if your network blocks that, they go through the Chesslab server instead.</p>
      </div>`;
  },

  handleClick(e) {
    const color = e.target.closest("[data-friend-color]");
    if (color) {
      this.hostColorChoice = color.dataset.friendColor;
      return this.draw();
    }
    const btn = e.target.closest("[data-friend]");
    if (!btn) return;
    switch (btn.dataset.friend) {
      case "create": {
        const all = TIME_CONTROLS.flatMap((cat) => cat.items);
        this.timeControl = all[Number($("friend-tc").value)];
        this.create();
        break;
      }
      case "join": this.join($("friend-code").value); break;
      case "cancel": this.reset(); this.status = "idle"; this.draw(); break;
      case "leave": this.leave(); break;
      case "copy-link":
        copyText(siteLink({ join: this.code }), "Invite link copied – send it to your friend!");
        break;
      case "copy":
        if (navigator.clipboard) navigator.clipboard.writeText(this.code).then(() => showToast("Code copied!"), () => showToast(this.code));
        else showToast(this.code);
        break;
    }
  },
};


$("tab-friend").addEventListener("click", (e) => Online.handleClick(e));
$("tab-friend").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "friend-code") Online.join(e.target.value);
});
// Chat-feltet under partiet
$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  Online.sendChat($("chat-input").value);
  $("chat-input").value = "";
});

// Husk den valgte tid med det samme (så den ikke nulstilles, når man vælger farve)
$("tab-friend").addEventListener("change", (e) => {
  if (e.target.id === "friend-tc") {
    Online.timeControl = TIME_CONTROLS.flatMap((cat) => cat.items)[Number(e.target.value)];
  }
  if (e.target.id === "friend-variant") Online.variant = e.target.value;
});

// ----- Links (når siden ligger online, fx på Netlify) -----

// Ligger siden på en webadresse (og ikke bare i en mappe på computeren)?
function isHosted() {
  return location.protocol === "http:" || location.protocol === "https:";
}

// Laver et link til siden med ekstra info, fx ?join=K7Q2MX
function siteLink(params) {
  const url = new URL(location.origin + location.pathname);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

function copyText(text, message) {
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => showToast(message), () => showToast(text));
  else showToast(text);
}