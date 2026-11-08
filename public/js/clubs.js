// ===================================================================
// clubs.js – klubber (som på chess.com).
// En klub har medlemmer, et klub-leaderboard og en fælles chat-væg.
// Ejeren kan fjerne medlemmer eller slette klubben, og alle medlemmer kan
// starte en klub-turnering.
// ===================================================================

const Clubs = {
  list: null,
  current: null,
  viewId: null,
  sortBy: "rapid",

  open(id = null) {
    this.viewId = id;
    this.current = null;
    if (currentPage !== "clubs") showPage("clubs");
    else this.openPage();
  },

  openPage() {
    this.draw();
    if (!API.enabled) return;
    if (this.viewId) this.load(this.viewId);
    else this.loadList();
    // Ny chat-besked? Hent klubben igen hvert 10. sekund, mens den er åben
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (currentPage !== "clubs") return clearInterval(this.timer);
      if (this.viewId && this.current && this.current.member) this.load(this.viewId, true);
    }, 10000);
  },

  async loadList() {
    try {
      this.list = (await API.get("/clubs")).clubs;
    } catch (e) {
      this.list = [];
      this.error = e.message;
    }
    this.draw();
  },

  async load(id, quiet = false) {
    try {
      const { club } = await API.get("/clubs/" + id);
      if (id !== this.viewId) return;
      const before = this.current ? this.current.messages.length : 0;
      this.current = club;
      if (quiet && club.messages.length === before) return; // intet nyt
    } catch (e) {
      this.error = e.message;
    }
    this.draw();
  },

  async act(action, extra = {}) {
    try {
      const res = await API.post("/clubs/" + this.viewId, { action, ...extra });
      if (res.deleted) { showToast("Club deleted"); return this.open(null); }
      this.current = res.club;
      if (action === "join") showToast(`Welcome to ${res.club.name}!`);
    } catch (e) {
      showToast(e.message);
    }
    this.draw();
  },

  async create(form) {
    try {
      const { club } = await API.post("/clubs", { name: form.name, desc: form.desc });
      showToast("Club created!");
      this.open(club.id);
    } catch (e) {
      showToast(e.message);
    }
  },

  draw() {
    if (currentPage !== "clubs") return;
    const keep = $("club-msg") ? $("club-msg").value : "";
    $("content-page").innerHTML = `<div class="content-wrap">${this.viewId ? this.detailHTML() : this.listHTML()}</div>`;
    if ($("club-msg") && keep) $("club-msg").value = keep;
    const wall = $("club-wall");
    if (wall) wall.scrollTop = wall.scrollHeight;
  },

  listHTML() {
    if (!API.enabled) return `<h1 class="content-title"><svg class="nav-icon"><use href="#i-social"/></svg>Clubs</h1><p class="rv-muted">Clubs need the online version of Chesshub.</p>`;
    const clubs = this.list || [];
    const mine = clubs.filter((c) => c.member);
    const others = clubs.filter((c) => !c.member).sort((a, b) => b.members - a.members);
    const row = (c) => `
      <button class="tour-row" data-club="${c.id}">
        <span class="club-badge">${escapeHTML(c.name[0].toUpperCase())}</span>
        <span class="tour-text"><b>${escapeHTML(c.name)}</b><span>${c.members} member${c.members === 1 ? "" : "s"} · by ${escapeHTML(c.owner)}${c.desc ? " · " + escapeHTML(c.desc.slice(0, 60)) : ""}</span></span>
      </button>`;
    return `
      <h1 class="content-title"><svg class="nav-icon"><use href="#i-social"/></svg>Clubs</h1>
      <div class="social-grid">
        <section class="social-card">
          ${this.list === null ? `<div class="friend-spinner"><span class="spinner"></span>Loading…</div>` : ""}
          ${mine.length ? `<h2>My clubs</h2>${mine.map(row).join("")}` : ""}
          ${others.length ? `<h2>${mine.length ? "Other clubs" : "All clubs"}</h2>${others.map(row).join("")}` : ""}
          ${this.list && !clubs.length ? `<p class="rv-muted">No clubs yet – start the first one!</p>` : ""}
        </section>
        <section class="social-card">
          <h2>Start a club</h2>
          ${Accounts.online() ? `
          <form class="tour-form" id="club-form">
            <label class="friend-row"><span>Name</span><input class="friend-input" name="name" maxlength="30" required placeholder="e.g. Class 2B Chess"></label>
            <label class="friend-row club-desc-row"><span>About</span><textarea class="friend-input" name="desc" maxlength="300" rows="3" placeholder="What is your club about?"></textarea></label>
            <button class="btn btn-green btn-huge">Create club</button>
          </form>` : `<p class="rv-muted">Log in to create or join clubs.</p><button class="btn btn-green" data-auth="signup">Sign Up</button>`}
        </section>
      </div>`;
  },

  detailHTML() {
    const back = `<button class="learn-back" data-club-back><svg><use href="#i-back"/></svg>All clubs</button>`;
    const c = this.current;
    if (!c) return `${back}<p class="rv-muted">${this.error ? escapeHTML(this.error) : "Loading…"}</p>`;
    const cats = [["rapid", "Rapid"], ["blitz", "Blitz"], ["bullet", "Bullet"], ["daily", "Daily"], ["puzzles", "Puzzles"]];
    const value = (m) => (this.sortBy === "puzzles" ? m.puzzles : m.ratings && m.ratings[this.sortBy] && m.ratings[this.sortBy].n > 0 ? m.ratings[this.sortBy].r : null);
    const members = c.members.slice().sort((a, b) => (value(b) || 0) - (value(a) || 0));
    const me = Accounts.name().toLowerCase();
    const isOwner = c.myRole === "owner";

    return `
      ${back}
      <div class="profile-head">
        <span class="club-badge huge">${escapeHTML(c.name[0].toUpperCase())}</span>
        <div>
          <h1>${escapeHTML(c.name)}</h1>
          <span class="rv-muted">${c.members.length} member${c.members.length === 1 ? "" : "s"} · started by ${escapeHTML(c.owner)} · ${formatDate(c.created)}</span>
          ${c.desc ? `<p class="club-desc">${escapeHTML(c.desc)}</p>` : ""}
        </div>
        <div class="player-actions">
          ${!Accounts.online() ? "" : !c.member ? `<button class="btn btn-green" data-club-act="join">Join club</button>`
            : `<button class="btn btn-gray btn-small" data-club-arena>Club tournament</button>
               ${isOwner ? `<button class="btn btn-gray btn-small" data-club-act="delete">Delete club</button>` : `<button class="btn btn-gray btn-small" data-club-act="leave">Leave</button>`}`}
        </div>
      </div>
      <div class="social-grid">
        <section class="social-card">
          <h2>Members</h2>
          <div class="lb-cats">${cats.map(([id, name]) => `<button class="tv-channel ${id === this.sortBy ? "selected" : ""}" data-club-sort="${id}">${name}</button>`).join("")}</div>
          <div class="lb-table">
            ${members.map((m, i) => `
              <div class="lb-row ${m.name.toLowerCase() === me ? "me" : ""}">
                <span class="lb-rank">${i + 1}</span>
                ${userAvatarHTML(m.name, m.color, "small")}
                <b><a href="#" data-player-link="${escapeHTML(m.name)}">${escapeHTML(m.name)}</a>${m.role === "owner" ? ' <span class="bot-badge">OWNER</span>' : ""}</b>
                <span class="lb-rating">${value(m) !== null && value(m) !== undefined ? value(m) : "–"}</span>
                ${isOwner && m.role !== "owner" ? `<button class="icon-x" data-club-kick="${escapeHTML(m.name)}" title="Remove from club">×</button>` : ""}
              </div>`).join("")}
          </div>
        </section>
        <section class="social-card">
          <h2>Club chat</h2>
          ${c.member ? `
            <div class="club-wall" id="club-wall">
              ${c.messages.length ? c.messages.map((m) => `<div class="club-msg"><b>${escapeHTML(m.from)}</b> <span class="rv-muted">${new Date(m.time).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span><p>${escapeHTML(m.text)}</p></div>`).join("") : `<p class="rv-muted">No messages yet. Say hi!</p>`}
            </div>
            <form class="friend-add" id="club-chat-form">
              <input class="friend-input" id="club-msg" maxlength="400" placeholder="Write to the club…" autocomplete="off">
              <button class="btn btn-green btn-small">Send</button>
            </form>` : `<p class="rv-muted">Join the club to read and write messages.</p>`}
        </section>
      </div>`;
  },
};

Pages.clubs = { open: () => Clubs.openPage() };

$("content-page").addEventListener("click", (e) => {
  if (currentPage !== "clubs") return;
  const club = e.target.closest("[data-club]");
  if (club) return Clubs.open(club.dataset.club);
  if (e.target.closest("[data-club-back]")) return Clubs.open(null);
  const act = e.target.closest("[data-club-act]");
  if (act) {
    if (act.dataset.clubAct === "delete" && !confirmInline(act, "Click again to delete")) return;
    return Clubs.act(act.dataset.clubAct);
  }
  const kick = e.target.closest("[data-club-kick]");
  if (kick) return Clubs.act("kick", { name: kick.dataset.clubKick });
  const sort = e.target.closest("[data-club-sort]");
  if (sort) { Clubs.sortBy = sort.dataset.clubSort; return Clubs.draw(); }
  const player = e.target.closest("[data-player-link]");
  if (player) { e.preventDefault(); return PlayerPage.show(player.dataset.playerLink); }
  if (e.target.closest("[data-club-arena]")) {
    // Klub-turnering: åbn turneringssiden med klubbens navn udfyldt
    Tournaments.open(null);
    setTimeout(() => { const input = document.querySelector('#tour-form [name="name"]'); if (input) input.value = Clubs.current.name + " Arena"; }, 100);
  }
});
$("content-page").addEventListener("submit", (e) => {
  if (currentPage !== "clubs") return;
  e.preventDefault();
  if (e.target.id === "club-form") Clubs.create(Object.fromEntries(new FormData(e.target)));
  if (e.target.id === "club-chat-form") {
    const text = $("club-msg").value;
    $("club-msg").value = "";
    if (text.trim()) Clubs.act("message", { text });
  }
});