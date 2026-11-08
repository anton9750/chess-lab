// ===================================================================
// api.js – snakker med Chesshubs server (Netlify Function på /api/...).
//
// Alle kald sender:
//  - invitationsnøglen (x-gate-key), så kun folk med linket kan bruge serveren
//  - login-billetten (token), hvis man er logget ind
//
// Åbnes siden direkte fra mappen (file://), er der ingen server. Så er
// API.enabled false, og konti virker kun i denne browser (som før).
// ===================================================================

const TOKEN_KEY = "chesshub-token";

const API = {
  // Serveren (Netlify Functions) findes ikke på GitHub Pages – slå den til i public/config.js hvis du har en
  enabled: (location.protocol === "http:" || location.protocol === "https:") && !!(window.CHESSHUB_CONFIG && window.CHESSHUB_CONFIG.api),
  token: (() => { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } })(),

  setToken(token) {
    this.token = token;
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* ignorer */ }
  },

  // Laver et kald. Giver svaret (JSON) tilbage – eller kaster en fejl med en tekst, man kan vise.
  async call(method, path, body) {
    const headers = { "content-type": "application/json", "x-gate-key": Gate.key() || "" };
    if (this.token) headers.authorization = "Bearer " + this.token;
    let response;
    try {
      response = await fetch("/api" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw Object.assign(new Error("Can't reach the Chesslab server. Check your internet connection."), { status: 0 });
    }
    let data = {};
    try { data = await response.json(); } catch (e) { /* tomt svar */ }
    if (!response.ok) {
      // Login udløbet? Så er man logget ud.
      if (response.status === 401 && this.token) Accounts.sessionExpired();
      if (response.status === 403 && /invite/i.test(data.error || "")) Gate.needKeyAgain();
      throw Object.assign(new Error(data.error || "Something went wrong"), { status: response.status });
    }
    return data;
  },

  get(path) { return this.call("GET", path); },
  post(path, body) { return this.call("POST", path, body || {}); },
  put(path, body) { return this.call("PUT", path, body || {}); },
  del(path) { return this.call("DELETE", path); },
};