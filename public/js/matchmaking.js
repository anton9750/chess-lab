// ===================================================================
// matchmaking.js – "Play Online": find en modstander (som på chess.com).
//
// Sådan finder to spillere hinanden:
//  1. Jeg spørger serveren om åbne "seeks" (folk der venter på et parti)
//     med samme tid og en rating tæt på min.
//  2. Findes der en, "tager" jeg den (serveren sørger for, at kun én kan)
//     og forbinder til personens spil med koden – præcis som "Play a Friend".
//  3. Findes der ingen, laver jeg selv et spil og lægger en seek på serveren.
//     Den fornyes hvert 5. sekund, så serveren ved, at jeg stadig venter.
// Jo længere man venter, jo større rating-forskel accepteres.
// ===================================================================

const Matchmaking = {
  active: false,
  tc: null,
  startedAt: 0,
  timer: null,
  hosting: false,   // har jeg selv lagt en seek ud?
  joining: false,   // er jeg ved at forbinde til en andens spil?
  online: null,     // antal spillere online (fra serveren)

  async find(tc, variant = "chess") {
    if (!API.enabled) return showToast("Play Online needs the online version of Chesshub");
    if (!Accounts.online()) {
      openAuth("signup");
      return showToast("Create a free account (or log in) to play rated games online");
    }
    if (tc.base === null) return showToast("Pick a time control with a clock for online games");
    this.cancel(true);
    this.active = true;
    this.tc = tc;
    this.variant = variant;
    this.startedAt = Date.now();
    this.draw();
    API.get("/stats").then((s) => { this.online = s.online; this.draw(); }).catch(() => {});
    this.loop();
  },

  // Hvor stor rating-forskel accepteres? Starter ved ±150 og vokser med tiden.
  range() {
    return 150 + ((Date.now() - this.startedAt) / 1000) * 15;
  },

  async loop() {
    clearTimeout(this.timer);
    if (!this.active) return;

    // Er jeg ved at joine en andens spil? Så vent og se, om det lykkes.
    if (this.joining) {
      if (Online.status === "idle") { this.joining = false; } // det mislykkedes – søg videre
      else { this.timer = setTimeout(() => this.loop(), 2000); return; }
    }

    try {
      const me = Accounts.name().toLowerCase();
      const myRating = Accounts.profile().ratings[ratingCategory(this.tc, this.variant)] || 1200;
      const { seeks } = await API.get("/seeks");
      if (!this.active) return;
      const candidates = seeks
        .filter((s) => s.tc.base === this.tc.base && s.tc.inc === this.tc.inc && (s.variant || "chess") === this.variant && s.user.toLowerCase() !== me)
        .filter((s) => Math.abs(s.rating - myRating) <= this.range())
        .sort((a, b) => Math.abs(a.rating - myRating) - Math.abs(b.rating - myRating));

      for (const seek of candidates) {
        // Venter vi begge to? Så er det kun den med det "laveste" navn, der tager den andens
        // (ellers kunne vi tage hinandens samtidig).
        if (this.hosting && seek.user.toLowerCase() > me) continue;
        try {
          await API.post("/seeks/take", { id: seek.user });
        } catch (e) {
          continue; // en anden nåede det først
        }
        if (this.hosting) await this.stopHosting();
        this.joining = true;
        Online.timeControl = seek.tc;
        Online.variant = this.variant;
        Online.join(seek.code);
        this.draw();
        this.timer = setTimeout(() => this.loop(), 2000);
        return;
      }

      // Ingen passende modstander: lav selv et spil og vent
      if (!this.hosting) {
        this.hosting = true;
        Online.timeControl = this.tc;
        Online.variant = this.variant;
        Online.hostColorChoice = "random";
        Online.create();                     // nulstiller Online – derfor sættes onReady bagefter
        Online.onReady = () => this.postSeek();
      } else if (Online.status === "waiting") {
        this.postSeek();                     // forny min seek
      }
    } catch (e) {
      this.error = e.message;
    }
    this.draw();
    this.timer = setTimeout(() => this.loop(), 5000);
  },

  postSeek() {
    if (!this.active || !Online.code) return;
    API.post("/seeks", { tc: this.tc, code: Online.code, variant: this.variant }).catch(() => {});
  },

  async stopHosting() {
    this.hosting = false;
    await API.del("/seeks").catch(() => {});
    Online.reset();
    Online.status = "idle";
  },

  // Kaldes af online.js, når partiet går i gang
  gameStarted() {
    if (!this.active) return;
    this.active = false;
    this.joining = false;
    clearTimeout(this.timer);
    if (this.hosting) {
      this.hosting = false;
      API.del("/seeks").catch(() => {});
    }
    this.draw();
  },

  cancel(silent = false) {
    const wasActive = this.active;
    this.active = false;
    clearTimeout(this.timer);
    if (this.hosting) this.stopHosting();
    if (this.joining) { Online.reset(); Online.status = "idle"; }
    this.joining = false;
    this.error = null;
    if (wasActive && !silent) this.draw();
  },

  // Søge-boksen i "New Game"-fanen
  draw() {
    const box = $("mm-box");
    if (!box) return;
    $("tab-new").classList.toggle("searching", this.active);
    if (!this.active) { box.innerHTML = ""; return; }
    const seconds = Math.floor((Date.now() - this.startedAt) / 1000);
    box.innerHTML = `
      <div class="mm-search">
        <span class="spinner big"></span>
        <h2>Searching for an opponent…</h2>
        <p class="rv-muted">${isVariant(this.variant) ? findVariant(this.variant).icon + " " + findVariant(this.variant).name + " · " : ""}${escapeHTML(this.tc.label)} · your rating ${Accounts.profile().ratings[ratingCategory(this.tc, this.variant)] || 1200}</p>
        <p class="rv-muted">${this.joining ? "Found one! Connecting…" : `Looking for players within ±${Math.round(this.range())} rating · ${seconds}s`}</p>
        ${this.online !== null ? `<p class="rv-muted">${this.online} player${this.online === 1 ? "" : "s"} online</p>` : ""}
        ${this.error ? `<p class="friend-error">${escapeHTML(this.error)}</p>` : ""}
        <button class="btn btn-gray" data-mm-cancel>Cancel</button>
      </div>`;
  },
};

$("tab-new").addEventListener("click", (e) => {
  if (e.target.closest("[data-mm-cancel]")) Matchmaking.cancel();
});
// Opdatér ventetiden hvert sekund
setInterval(() => { if (Matchmaking.active) Matchmaking.draw(); }, 1000);