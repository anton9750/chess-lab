// ===================================================================
// account.js – kontoindstillinger (som "Settings → Profile/Account" på chess.com).
//  - Profil: avatar-farve, land (flag) og en kort tekst om dig selv
//  - Skift adgangskode
//  - Log ud på alle andre enheder
//  - Download dine data
//  - Slet kontoen
// ===================================================================

const AVATAR_COLORS = ["#81b64c", "#5d9948", "#3a92d1", "#2c6fb0", "#8a5cc7", "#c75ca8",
  "#e05c5c", "#e0874a", "#d6a42a", "#7d8fa6", "#4b4847", "#2bb3a3"];

// Landenes navne på engelsk (browseren kender dem)
const regionNames = (() => {
  try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) { return null; }
})();
const FLAG_CODES = ("ad ae af ag ai al am ao ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et eu fi fj fk fm fo fr ga gb gb-eng gb-sct gb-wls gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hn hr ht hu ic id ie il im in iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug un us uy uz va vc ve vg vi vn vu wf ws xk ye yt za zm zw").split(" ");
const SPECIAL_COUNTRIES = { "gb-eng": "England", "gb-sct": "Scotland", "gb-wls": "Wales", eu: "European Union", un: "United Nations", xk: "Kosovo" };

function countryName(code) {
  if (!code) return "";
  if (SPECIAL_COUNTRIES[code]) return SPECIAL_COUNTRIES[code];
  try { return (regionNames && regionNames.of(code.toUpperCase())) || code.toUpperCase(); } catch (e) { return code.toUpperCase(); }
}

// Et lille flag (billede – Windows kan ikke vise flag-emojis)
function flagHTML(code) {
  if (!code || !FLAG_CODES.includes(code)) return "";
  return `<img class="flag" src="img/flags/${code}.svg" alt="${escapeHTML(countryName(code))}" title="${escapeHTML(countryName(code))}">`;
}

const AccountPage = {
  message: null, // { type: "ok" | "error", text, section }

  open() {
    this.draw();
  },

  note(section) {
    const m = this.message;
    return m && m.section === section ? `<p class="account-msg ${m.type}">${escapeHTML(m.text)}</p>` : "";
  },

  draw() {
    if (currentPage !== "account") return;
    const p = Accounts.profile();
    const online = Accounts.online();
    const countries = FLAG_CODES.map((c) => [c, countryName(c)]).sort((a, b) => a[1].localeCompare(b[1]));

    $("content-page").innerHTML = `
      <div class="content-wrap account-page">
        <h1 class="content-title"><svg class="nav-icon"><use href="#i-settings"/></svg>Account settings</h1>
        ${online ? "" : `
          <div class="social-banner">
            <div><b>You are playing as a guest.</b><span>Create a free account to get account settings, a profile and friends.</span></div>
            <button class="btn btn-green" data-auth="signup">Sign Up</button>
          </div>`}

        <section class="social-card">
          <h2>Profile</h2>
          <div class="account-preview">
            ${userAvatarHTML(p.username, p.color, "huge")}
            <div><b class="account-name">${escapeHTML(p.username)} ${flagHTML(p.country)}</b>
              <span class="rv-muted">${p.bio ? escapeHTML(p.bio) : "No bio yet"}</span></div>
          </div>
          <form id="account-profile-form" class="account-form">
            <span class="account-label">Avatar color</span>
            <div class="color-swatches">
              ${AVATAR_COLORS.map((c) => `<button type="button" class="swatch ${p.color === c ? "selected" : ""}" data-swatch="${c}" style="background:${c}" title="${c}"></button>`).join("")}
            </div>
            <label class="account-label" for="account-country">Country</label>
            <select id="account-country" class="friend-input">
              <option value="">– No flag –</option>
              ${countries.map(([c, name]) => `<option value="${c}" ${p.country === c ? "selected" : ""}>${escapeHTML(name)}</option>`).join("")}
            </select>
            <label class="account-label" for="account-bio">About me</label>
            <textarea id="account-bio" class="friend-input" maxlength="200" rows="3" placeholder="Favorite opening, chess goals…">${escapeHTML(p.bio || "")}</textarea>
            <button class="btn btn-green">Save profile</button>
            ${this.note("profile")}
          </form>
        </section>

        ${online ? `
        <section class="social-card">
          <h2>Password</h2>
          <form id="account-password-form" class="account-form">
            <input type="password" id="pw-current" class="friend-input" placeholder="Current password" autocomplete="current-password" required>
            <input type="password" id="pw-new" class="friend-input" placeholder="New password (at least 6 characters)" autocomplete="new-password" minlength="6" required>
            <input type="password" id="pw-confirm" class="friend-input" placeholder="Repeat new password" autocomplete="new-password" required>
            <button class="btn btn-green">Change password</button>
            ${this.note("password")}
          </form>
        </section>

        <section class="social-card">
          <h2>Devices</h2>
          <p class="rv-muted">Logged in on a friend's phone or a school computer? Log out everywhere except here.</p>
          <button class="btn btn-gray" data-account="logout-all">Log out on all other devices</button>
          ${this.note("devices")}
        </section>` : ""}

        <section class="social-card">
          <h2>Your data</h2>
          <p class="rv-muted">Download your profile, games, puzzle stats and achievements as a file.</p>
          <button class="btn btn-gray" data-account="export">Download my data</button>
        </section>

        ${location.hash === "#admin" ? `
        <section class="social-card">
          <h2>Admin</h2>
          <p class="rv-muted">For the owner of Chesslab: reset a friend's forgotten password, or delete an account.</p>
          <form id="account-admin-form" class="account-form">
            <input type="password" id="admin-secret" class="friend-input" placeholder="Admin key" required>
            <input id="admin-user" class="friend-input" placeholder="Username" required>
            <div class="rv-controls">
              <button class="btn btn-green" data-admin="reset-password">Reset password</button>
              <button class="btn btn-red" data-admin="delete">Delete account</button>
            </div>
            ${this.note("admin")}
          </form>
        </section>` : ""}

        ${online ? `
        <section class="social-card danger-card">
          <h2>Delete account</h2>
          <p class="rv-muted">This deletes your account, ratings and games for good. It can't be undone.</p>
          <form id="account-delete-form" class="account-form">
            <input id="del-name" class="friend-input" placeholder="Type your username: ${escapeHTML(p.username)}" required>
            <input type="password" id="del-password" class="friend-input" placeholder="Password" autocomplete="current-password" required>
            <button class="btn btn-red">Delete my account</button>
            ${this.note("delete")}
          </form>
        </section>` : ""}
      </div>`;
  },

  saveProfile() {
    const p = Accounts.profile();
    p.country = $("account-country").value || null;
    p.bio = $("account-bio").value.trim().slice(0, 200);
    Accounts.save();
    if (Accounts.online()) Accounts.push(); // send med det samme
    this.message = { type: "ok", text: "Profile saved!", section: "profile" };
    this.draw();
    if (typeof drawSidebarUser === "function") drawSidebarUser();
  },

  setColor(color) {
    Accounts.profile().color = color;
    Accounts.save();
    this.message = null;
    this.draw();
    if (typeof drawSidebarUser === "function") drawSidebarUser();
  },

  async changePassword() {
    const current = $("pw-current").value;
    const next = $("pw-new").value;
    if (next !== $("pw-confirm").value) {
      this.message = { type: "error", text: "The new passwords don't match", section: "password" };
      return this.draw();
    }
    try {
      await API.post("/account", { action: "password", password: current, newPassword: next });
      this.message = { type: "ok", text: "Password changed! Other devices have been logged out.", section: "password" };
    } catch (e) {
      this.message = { type: "error", text: e.message, section: "password" };
    }
    this.draw();
  },

  async logoutAll() {
    try {
      const res = await API.post("/account", { action: "logout-all" });
      this.message = { type: "ok", text: res.ended ? `Logged out on ${res.ended} other device${res.ended === 1 ? "" : "s"}.` : "You weren't logged in anywhere else.", section: "devices" };
    } catch (e) {
      this.message = { type: "error", text: e.message, section: "devices" };
    }
    this.draw();
  },

  exportData() {
    const p = Accounts.profile();
    const data = JSON.stringify({ exported: new Date().toISOString(), profile: p }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `chesshub-${p.username}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  // Admin: nulstil adgangskode eller slet en konto
  async admin(action) {
    if (!action) return;
    const username = $("admin-user").value.trim();
    try {
      const res = await API.post("/admin", { secret: $("admin-secret").value, action, username });
      this.message = { type: "ok", section: "admin", text: action === "delete"
        ? `${res.deleted}'s account was deleted.`
        : `New password for ${res.username}: ${res.tempPassword} – give it to them, and they can change it under Account settings.` };
    } catch (e) {
      this.message = { type: "error", text: e.message, section: "admin" };
    }
    this.draw();
  },

  async deleteAccount() {
    const p = Accounts.profile();
    if ($("del-name").value.trim().toLowerCase() !== p.username.toLowerCase()) {
      this.message = { type: "error", text: "The username doesn't match", section: "delete" };
      return this.draw();
    }
    try {
      await API.post("/account", { action: "delete", password: $("del-password").value });
    } catch (e) {
      this.message = { type: "error", text: e.message, section: "delete" };
      return this.draw();
    }
    // Ryd op i browseren og start forfra som gæst
    API.setToken(null);
    try {
      const data = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}");
      if (data.users) delete data.users[p.username];
      data.current = GUEST;
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(data));
    } catch (e) { /* ignorer */ }
    alertAndReload();
  },
};

// Kontoen er slettet: vis en besked kort, og genindlæs siden som gæst
function alertAndReload() {
  showToast("Your account has been deleted.");
  setTimeout(() => location.reload(), 1500);
}

Pages.account = AccountPage;

$("content-page").addEventListener("click", (e) => {
  if (currentPage !== "account") return;
  const swatch = e.target.closest("[data-swatch]");
  if (swatch) return AccountPage.setColor(swatch.dataset.swatch);
  const btn = e.target.closest("[data-account]");
  if (!btn) return;
  if (btn.dataset.account === "logout-all") AccountPage.logoutAll();
  if (btn.dataset.account === "export") AccountPage.exportData();
});
$("content-page").addEventListener("submit", (e) => {
  if (currentPage !== "account") return;
  e.preventDefault();
  if (e.target.id === "account-profile-form") AccountPage.saveProfile();
  if (e.target.id === "account-password-form") AccountPage.changePassword();
  if (e.target.id === "account-delete-form") AccountPage.deleteAccount();
  if (e.target.id === "account-admin-form") AccountPage.admin(e.submitter && e.submitter.dataset.admin);
});