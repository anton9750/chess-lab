// ===================================================================
// gate.js – "kun for venner": siden er låst, indtil man har brugt
// Kristians invitationslink (…/?key=HEMMELIG-NØGLE).
//
// Sådan virker det:
//  - Linket indeholder en hemmelig nøgle. Her i koden står kun en
//    SHA-256 "hash" af nøglen – ikke selve nøglen.
//  - Passer nøglen, husker browseren den (localStorage). Nøglen bliver stående
//    i adresselinjen, så et bogmærke eller en genvej på hjemmeskærmen også virker.
//  - Har man en konto, kan man altid komme ind ved at logge ind på låse-skærmen
//    (fx på en ny telefon eller hvis browseren har glemt nøglen).
//  - Nøglen sendes også med til serveren (api.js), som selv tjekker den.
//    Så kan ingen bruge serveren uden linket – heller ikke ved at gå udenom låsen.
//  - Åbnes siden fra en mappe på computeren (file://), er der ingen lås.
//
// OBS: Låsen kører i browseren, så en dygtig programmør kan komme
// udenom. Den holder tilfældige besøgende ude – den er ikke bank-sikkerhed.
// ===================================================================

// Hash af den hemmelige nøgle. Skift den for at lave en ny nøgle (alle skal så have et nyt link).
const GATE_HASH = "15ba85ea934f979d1b515faf7ddd520fdc7483162c485c6c7764d9df11a4e2b9";
const GATE_KEY = "chesshub-access";
const GATE_RAW_KEY = "chesshub-key";
const GATE_OWNER = "Kristian";

const Gate = {
  // Er siden låst lige nu?
  isLocked() {
    if (location.protocol === "file:") return false; // lokal mappe: ingen lås
    // Åben side (fx GitHub Pages uden server): ingen invitationslås – se public/config.js
    if (window.CHESSHUB_CONFIG && window.CHESSHUB_CONFIG.open) return false;
    try {
      if (localStorage.getItem("chesshub-token")) return false; // logget ind = inviteret
      return localStorage.getItem(GATE_KEY) !== GATE_HASH;
    } catch (error) {
      return true;
    }
  },

  async hash(text) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("chesshub-gate:" + text));
    return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
  },

  // Kører når siden åbnes
  async check() {
    const params = new URLSearchParams(location.search);
    const key = params.get("key");

    if (key) {
      if ((await this.hash(key)) === GATE_HASH) {
        try {
          localStorage.setItem(GATE_KEY, GATE_HASH);
          localStorage.setItem(GATE_RAW_KEY, key);
        } catch (error) { /* ignorer */ }
        this.unlock(true);
        return;
      }
    }

    if (this.isLocked()) this.showLock(!!key);
    else {
      this.unlock(false);
      // Låst op før serveren fandtes? Så mangler vi selve nøglen – bed om linket igen
      if (API.enabled && !this.key() && !API.token) this.needKeyAgain();
    }
  },

  // Selve nøglen (sendes med til serveren)
  key() {
    try { return localStorage.getItem(GATE_RAW_KEY); } catch (e) { return null; }
  },

  // Serveren kender ikke nøglen (fx åbnede man siden, før serveren fandtes):
  // så skal man bruge sit invitationslink én gang til.
  needKeyAgain() {
    if (this.askedAgain) return;
    this.askedAgain = true;
    try { localStorage.removeItem(GATE_KEY); } catch (e) { /* ignorer */ }
    this.showLock(false);
    $("gate-message").textContent = "Chesshub has been updated! Please open your invite link from " + GATE_OWNER + " once more to continue.";
  },

  // Låse-skærmens formularer: indsæt invitationslinket, eller log ind med sin konto
  async tryKey(text) {
    const match = String(text).match(/key=([^&\s]+)/);
    const key = (match ? match[1] : text).trim();
    if (key && (await this.hash(key)) === GATE_HASH) {
      try {
        localStorage.setItem(GATE_KEY, GATE_HASH);
        localStorage.setItem(GATE_RAW_KEY, key);
      } catch (e) { /* ignorer */ }
      location.reload();
    } else {
      $("gate-error").textContent = "That invite link or key isn't right.";
    }
  },

  async tryLogin(name, password) {
    $("gate-error").textContent = "";
    const error = await Accounts.logIn(name, password); // giver en fejltekst tilbage, hvis det gik galt
    if (error) $("gate-error").textContent = error;
    else location.reload();
  },

  showLock(wrongKey) {
    document.documentElement.classList.add("gate-locked");
    $("gate").classList.remove("hidden");
    $("gate-message").textContent = wrongKey
      ? "That invite link isn't valid anymore. Ask " + GATE_OWNER + " for a new one."
      : "Chesshub is invite-only. Ask " + GATE_OWNER + " for an invite link to get in.";
  },

  unlock(firstTime) {
    document.documentElement.classList.remove("gate-locked");
    $("gate").classList.add("hidden");
    if (firstTime) {
      showToast("Welcome to Chesshub! 🎉");
      Friends.start(); // nu må vi gå på vennenetværket
    }
    if (this.afterUnlock) {
      const fn = this.afterUnlock;
      this.afterUnlock = null;
      fn();
    }
  },
};

$("gate").addEventListener("submit", (e) => {
  e.preventDefault();
  if (e.target.id === "gate-key-form") Gate.tryKey($("gate-key-input").value);
  if (e.target.id === "gate-login-form") Gate.tryLogin($("gate-user").value, $("gate-pass").value);
});

// Vent til hele siden (alle scripts) er indlæst, før vi tjekker
document.addEventListener("DOMContentLoaded", () => Gate.check());