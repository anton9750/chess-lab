// ===================================================================
// friends.js – venner på tværs af computere (som på chess.com).
//
// Sådan virker det uden vores egen server:
//  - Når man er logget ind, får man en "adresse" hos PeerJS' gratis
//    mæglerserver: "chesshub-user-" + brugernavn (fx chesshub-user-kristian).
//  - Vil man være ven med "mads", forbinder vi til chesshub-user-mads.
//    Er Mads online, går beskeden direkte til hans browser.
//  - Er Mads ikke online, prøver vi igen hvert 20. sekund, så længe
//    siden er åben. Anmodninger og beskeder sendes, når han kommer online.
//
// Online (logget ind på serveren) bestemmer SERVEREN, hvem der er venner,
// og beskeder gemmes dér – så de også når frem, når vennen er offline.
// Forbindelsen mellem browserne bruges så til det, der skal ske med det samme:
// "er online"-prikken, udfordringer, Puzzle Battle og et lille "refresh"-puf,
// når der er nyt på serveren.
//
// Beskeder mellem venner (JSON):
//  hello, friend-request, friend-accept, friend-decline, friend-remove,
//  dm (privat besked), challenge, challenge-decline,
//  daily-sync (Daily-partier), battle-* (Puzzle Battle)
// ===================================================================

const USER_PREFIX = "chesshub-user-";
const MESSAGES_KEY = "chesshub-messages";

const Friends = {
  peer: null,
  status: "offline",   // offline → connecting → online / taken / error
  conns: {},           // navn (små bogstaver) → åben forbindelse
  outbox: {},          // navn → beskeder der venter på, at vennen kommer online
  messages: {},        // navn → [{ from, text, time }]
  unread: {},          // navn → antal ulæste beskeder
  chatWith: null,      // hvis chat er åben på Social-siden
  pingTimer: null,
  retryTimer: null,

  key: (name) => String(name).toLowerCase(),

  // ----- Start og stop -----

  start() {
    this.stop();
    // Låst side (ingen invitation endnu): ikke på vennenetværket
    if (Gate.isLocked()) {
      this.status = "offline";
      return;
    }
    if (!Accounts.isLoggedIn() || typeof Peer === "undefined") {
      this.status = "offline";
      return this.redraw();
    }
    this.loadMessages();
    this.status = "connecting";
    this.redraw();

    const me = Accounts.name();
    this.peer = new Peer(USER_PREFIX + this.key(me), peerOptions());
    this.peer.on("open", () => {
      this.status = "online";
      this.pingFriends();
      this.pingTimer = setInterval(() => this.pingFriends(), 20000);
      this.redraw();
    });
    this.peer.on("connection", (conn) => this.setup(conn));
    this.peer.on("error", (err) => {
      const type = err && err.type;
      if (type === "peer-unavailable") return; // en ven er bare ikke online – helt normalt
      if (type === "unavailable-id") {
        // Navnet bruges allerede (måske i en anden fane, eller af en anden person)
        this.status = "taken";
        this.stop(true);
        return this.redraw();
      }
      // Netværksfejl: prøv igen om lidt
      this.status = "error";
      this.stop(true);
      this.redraw();
      this.retryTimer = setTimeout(() => this.start(), 30000);
    });
    this.peer.on("disconnected", () => {
      if (this.peer && !this.peer.destroyed) this.peer.reconnect();
    });
  },

  stop(keepStatus = false) {
    clearInterval(this.pingTimer);
    clearTimeout(this.retryTimer);
    Object.values(this.conns).forEach((c) => { try { c.close(); } catch (e) { /* ignorer */ } });
    this.conns = {};
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignorer */ } }
    this.peer = null;
    if (!keepStatus) this.status = "offline";
  },

  // ----- Forbindelser -----

  // Prøv at forbinde til alle venner og anmodninger, der ikke allerede er forbundet
  pingFriends() {
    Accounts.friendList().forEach((f) => {
      if (!this.conns[this.key(f.name)] && f.status !== "incoming") this.connectTo(f.name);
    });
    // Også dem vi har beskeder til
    Object.keys(this.outbox).forEach((name) => { if (!this.conns[name]) this.connectTo(name); });
  },

  connectTo(name) {
    if (!this.peer || this.peer.destroyed || this.peer.disconnected) return;
    const conn = this.peer.connect(USER_PREFIX + this.key(name), { reliable: true });
    conn.outgoing = true; // det er mig, der har ringet op
    this.setup(conn);
  },

  setup(conn) {
    conn.on("open", () => {
      const p = Accounts.profile();
      conn.send({ type: "hello", name: Accounts.name(), color: p.color, ratings: p.ratings, puzzles: Puzzles.profile.rating });
    });
    conn.on("data", (msg) => this.onMessage(conn, msg));
    conn.on("close", () => this.onClose(conn));
    conn.on("error", () => this.onClose(conn));
  },

  onClose(conn) {
    const name = conn.friendName;
    if (name && this.conns[name] === conn) {
      delete this.conns[name];
      this.redraw();
    }
  },

  isOnline(name) {
    const conn = this.conns[this.key(name)];
    return !!(conn && conn.open);
  },

  // Send til en ven – eller læg i "udbakken", hvis vennen ikke er online
  send(name, msg) {
    const conn = this.conns[this.key(name)];
    if (conn && conn.open) {
      conn.send(msg);
      return true;
    }
    const key = this.key(name);
    (this.outbox[key] = this.outbox[key] || []).push(msg);
    this.connectTo(name);
    return false;
  },

  // ----- Beskeder -----

  onMessage(conn, msg) {
    if (!msg || !msg.type) return;
    const from = String(msg.name || conn.friendName || "").slice(0, 20);

    if (msg.type === "hello") {
      if (!/^[A-Za-z0-9_]{3,20}$/.test(from) || this.key(from) === this.key(Accounts.name())) return conn.close();
      conn.friendName = this.key(from);
      // Har vi forbundet til hinanden på samme tid, er der to forbindelser.
      // Begge sider skal beholde DEN SAMME: den som brugeren med det "laveste"
      // navn (alfabetisk) har ringet op.
      const old = this.conns[conn.friendName];
      if (old && old !== conn && old.open) {
        const iAmLower = this.key(Accounts.name()) < conn.friendName;
        const preferred = (c) => (iAmLower ? c.outgoing : !c.outgoing);
        if (preferred(old) && !preferred(conn)) { conn.close(); return; }
        try { old.close(); } catch (e) { /* ignorer */ }
      }
      this.conns[conn.friendName] = conn;

      const friend = Accounts.getFriend(from);
      if (friend) {
        Accounts.setFriendInfo(friend.name, { color: msg.color, ratings: msg.ratings, puzzles: msg.puzzles, lastSeen: Date.now() });
        // (Kun uden server) Har jeg sendt en anmodning, som personen ikke har fået endnu? Send den nu.
        if (!Accounts.online() && friend.status === "outgoing") conn.send({ type: "friend-request", name: Accounts.name() });
      }
      // Send ventende beskeder
      (this.outbox[conn.friendName] || []).forEach((m) => conn.send(m));
      delete this.outbox[conn.friendName];
      return this.redraw();
    }

    const name = conn.friendName;
    if (!name) return; // har ikke sagt hej endnu
    const friend = Accounts.getFriend(name);
    const display = friend ? friend.name : from;

    // Online: serveren ved besked – hent det nyeste derfra
    if (Accounts.online() && ["friend-request", "friend-accept", "friend-decline", "friend-remove", "refresh"].includes(msg.type)) {
      Accounts.refresh().then(() => { this.redraw(); if (currentPage === "daily") Daily.load(); });
      if (msg.type === "friend-request") notify(`${from} sent you a friend request`);
      if (msg.type === "friend-accept") notify(`${display} accepted your friend request!`);
      if (msg.type === "refresh" && msg.what === "daily") notify(msg.text || `${display} made a move in your Daily game`);
      return;
    }

    switch (msg.type) {
      case "friend-request":
        if (friend && friend.status === "friends") {
          conn.send({ type: "friend-accept", name: Accounts.name() });
        } else if (friend && friend.status === "outgoing") {
          // Vi har begge spurgt hinanden → så er vi venner
          Accounts.setFriend(display, { status: "friends" });
          conn.send({ type: "friend-accept", name: Accounts.name() });
          notify(`You and ${display} are now friends!`);
        } else if (!friend) {
          Accounts.setFriend(from, { status: "incoming", lastSeen: Date.now() });
          notify(`${from} sent you a friend request`);
        }
        break;
      case "friend-accept":
        if (friend && friend.status !== "friends") {
          Accounts.setFriend(display, { status: "friends" });
          notify(`${display} accepted your friend request!`);
          Achievements.check();
        }
        break;
      case "friend-decline":
      case "friend-remove":
        if (friend) Accounts.removeFriend(display);
        break;
      case "dm":
        if (!friend || friend.status !== "friends") return;
        this.addMessage(name, display, String(msg.text).slice(0, 500));
        if (this.chatWith !== name || currentPage !== "social") {
          this.unread[name] = (this.unread[name] || 0) + 1;
          notify(`${display}: ${String(msg.text).slice(0, 60)}`);
        }
        break;
      case "challenge":
        if (!friend || friend.status !== "friends") return;
        showChallenge(display, msg);
        break;
      case "battle-invite":
      case "battle-accept":
      case "battle-decline":
      case "battle-progress":
      case "battle-done":
        if (!friend || friend.status !== "friends") return;
        Puzzles.battleMessage(display, msg);
        break;
      case "challenge-decline":
        notify(`${display} declined your challenge`);
        if (Online.status === "waiting") { Online.reset(); Online.status = "idle"; Online.draw(); }
        break;
    }
    this.redraw();
  },

  // ----- Handlinger fra brugeren -----

  // Venne-handlinger via serveren (online). Fejl vises som en lille besked.
  async serverAction(action, name, doneText) {
    try {
      const res = await API.post("/friends", { action, name });
      await Accounts.refresh();
      showToast(res.message || doneText(res.status));
      // Giv vennen et "puf", så han ser det med det samme (hvis han er online)
      const types = { request: "friend-request", accept: "friend-accept", decline: "friend-decline", remove: "friend-remove" };
      this.send(name, { type: types[action], name: Accounts.name() });
      if (res.status === "friends") Achievements.check();
    } catch (e) {
      showToast(e.message);
    }
    this.redraw();
  },

  // Send en venneanmodning
  request(name) {
    name = name.trim();
    if (!Accounts.isLoggedIn()) return "Log in to add friends";
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) return "That is not a valid username";
    if (this.key(name) === this.key(Accounts.name())) return "You can't add yourself";
    if (Accounts.online()) {
      this.serverAction("request", name, (status) => status === "friends" ? `You and ${name} are now friends!` : `Friend request sent to ${name}`);
      return null;
    }
    const existing = Accounts.getFriend(name);
    if (existing && existing.status === "friends") return `${existing.name} is already your friend`;
    if (existing && existing.status === "incoming") return this.accept(existing.name);
    Accounts.setFriend(name, { status: "outgoing" });
    const sent = this.send(name, { type: "friend-request", name: Accounts.name() });
    showToast(sent ? `Friend request sent to ${name}` : `${name} isn't online – the request is sent when they are`);
    this.redraw();
    return null;
  },

  accept(name) {
    if (Accounts.online()) {
      this.serverAction("accept", name, () => `You and ${name} are now friends!`);
      return null;
    }
    Accounts.setFriend(name, { status: "friends" });
    this.send(name, { type: "friend-accept", name: Accounts.name() });
    showToast(`You and ${name} are now friends!`);
    Achievements.check();
    this.redraw();
    return null;
  },

  decline(name) {
    if (Accounts.online()) return this.serverAction("decline", name, () => "Request declined");
    this.send(name, { type: "friend-decline", name: Accounts.name() });
    Accounts.removeFriend(name);
    this.redraw();
  },

  remove(name) {
    if (Accounts.online()) return this.serverAction("remove", name, () => `${name} removed from your friends`);
    this.send(name, { type: "friend-remove", name: Accounts.name() });
    Accounts.removeFriend(name);
    delete this.outbox[this.key(name)];
    this.redraw();
  },

  sendDM(name, text) {
    text = text.trim();
    if (!text) return;
    // Online gemmes beskeden på serveren (når frem, selvom vennen er offline)
    if (Accounts.online()) API.post("/messages", { to: name, text }).catch((e) => showToast(e.message));
    // ... og sendes direkte, hvis vennen er online lige nu
    if (this.isOnline(name)) this.send(name, { type: "dm", name: Accounts.name(), text });
    this.addMessage(this.key(name), Accounts.name(), text);
    this.redraw();
  },

  // Udfordr en ven: vi laver et online-spil og sender koden til vennen
  challenge(name, timeControl, color, variant = "chess") {
    if (!this.isOnline(name)) return showToast(`${name} is offline`);
    Online.timeControl = timeControl;
    Online.hostColorChoice = color;
    Online.variant = variant;
    Online.create(); // nulstiller Online – derfor sættes resten bagefter
    Online.challenging = name;
    Online.onReady = () => {
      this.send(name, { type: "challenge", name: Accounts.name(), code: Online.code, timeControl, color, variant });
      Online.onReady = null;
    };
    showPage("play");
    switchTab("friend");
  },

  // Hent hele samtalen fra serveren (når man åbner en chat)
  async loadChat(name) {
    if (!Accounts.online()) return;
    try {
      const { messages } = await API.get("/messages?with=" + encodeURIComponent(name));
      this.messages[this.key(name)] = messages;
      delete this.unread[this.key(name)];
      if (Accounts.profile().unread) delete Accounts.profile().unread[this.key(name)];
      this.saveMessages();
      this.redraw();
    } catch (e) { /* vis bare det vi har */ }
  },

  // ----- Gemte beskeder -----

  addMessage(key, from, text) {
    (this.messages[key] = this.messages[key] || []).push({ from, text, time: Date.now() });
    this.messages[key] = this.messages[key].slice(-100);
    this.saveMessages();
  },

  loadMessages() {
    try {
      const all = JSON.parse(localStorage.getItem(MESSAGES_KEY) || "{}");
      this.messages = all[this.key(Accounts.name())] || {};
    } catch (e) {
      this.messages = {};
    }
  },

  saveMessages() {
    try {
      const all = JSON.parse(localStorage.getItem(MESSAGES_KEY) || "{}");
      all[this.key(Accounts.name())] = this.messages;
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(all));
    } catch (e) { /* ignorer */ }
  },

  // Antal ting der venter (anmodninger + ulæste beskeder) – vises som rødt tal i menuen
  badgeCount() {
    const requests = Accounts.isLoggedIn() ? Accounts.friendList().filter((f) => f.status === "incoming").length : 0;
    // Ulæste beskeder: fra serveren (online) eller fra vennenetværket
    const serverUnread = Accounts.online() ? Accounts.profile().unread || {} : {};
    const all = { ...serverUnread, ...this.unread };
    const unread = Object.values(all).reduce((a, b) => a + b, 0);
    return requests + unread;
  },

  redraw() {
    const count = this.badgeCount();
    document.querySelectorAll(".nav-item[data-nav='social']").forEach((item) => {
      let badge = item.querySelector(".nav-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "nav-badge";
        item.appendChild(badge);
      }
      badge.textContent = count;
      badge.classList.toggle("hidden", count === 0);
    });
    if (currentPage === "social") SocialPage.open();
    if (currentPage === "player" && typeof PlayerPage !== "undefined") PlayerPage.draw();
    if (typeof Daily !== "undefined") Daily.badge();
  },
};

// Lille besked + lyd
function notify(text) {
  showToast(text);
  playSound("start");
}

// ----- Udfordring fra en ven -----

let pendingChallenge = null;

function showChallenge(name, msg) {
  pendingChallenge = { name, ...msg };
  const tc = msg.timeControl || {};
  const colorText = msg.color === "w" ? "they play White" : msg.color === "b" ? "they play Black" : "random colors";
  $("challenge-text").innerHTML = msg.kind === "battle"
    ? `<b>${escapeHTML(name)}</b> challenges you to a <b>Puzzle Battle</b>!<br><span class="rv-muted">Same puzzles · 3 minutes · 3 strikes</span>`
    : `<b>${escapeHTML(name)}</b> challenges you to ${isVariant(msg.variant) ? "a game of <b>" + escapeHTML(findVariant(msg.variant).name) + "</b>" : "a game"}!<br><span class="rv-muted">${escapeHTML(tc.label || "")} · ${colorText}</span>`;
  $("challenge-modal").classList.remove("hidden");
  playSound("start");
}

$("challenge-modal").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-challenge-answer]");
  if (!btn || !pendingChallenge) return;
  const c = pendingChallenge;
  pendingChallenge = null;
  $("challenge-modal").classList.add("hidden");
  if (c.kind === "battle") {
    if (btn.dataset.challengeAnswer === "accept") Puzzles.acceptBattle(c.name, c);
    else Friends.send(c.name, { type: "battle-decline", name: Accounts.name(), id: c.id });
    return;
  }
  if (btn.dataset.challengeAnswer === "accept") {
    showPage("play");
    switchTab("friend");
    Online.join(c.code);
  } else {
    Friends.send(c.name, { type: "challenge-decline", name: Accounts.name() });
  }
});