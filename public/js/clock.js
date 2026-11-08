// ===================================================================
// clock.js – skakuret.
// Hver spiller har sin egen tid. Når man har trukket, stopper ens ur,
// og modstanderens ur starter. Med "increment" får man ekstra sekunder
// efter hvert træk (fx "3 | 2" = 3 minutter + 2 sekunder pr. træk).
// ===================================================================

class ChessClock {
  // onTick: kaldes ca. 10 gange i sekundet, så skærmen kan opdateres.
  // onFlag: kaldes når en spillers tid er løbet ud.
  constructor({ onTick, onFlag }) {
    this.onTick = onTick;
    this.onFlag = onFlag;
    this.timer = null;
    this.reset(null, 0);
  }

  // Starter et nyt ur. baseSeconds = null betyder "ingen tidsbegrænsning".
  reset(baseSeconds, incrementSeconds) {
    this.stopTimer();
    this.enabled = baseSeconds !== null;
    this.time = { w: (baseSeconds || 0) * 1000, b: (baseSeconds || 0) * 1000 }; // millisekunder
    this.increment = incrementSeconds * 1000;
    this.running = null;   // hvis ur der kører: "w", "b" eller null
    this.started = false;  // uret starter først efter hvids første træk
    this.lastTime = null;
    this.onTick();
  }

  // Kaldes når spilleren med farven "color" har lavet et træk.
  press(color) {
    if (!this.enabled) return;
    this.update();
    if (this.started) this.time[color] += this.increment; // bonus-tid
    this.started = true;
    this.running = color === "w" ? "b" : "w"; // nu er det modstanderens tur
    this.lastTime = performance.now();
    this.startTimer();
    this.onTick();
  }

  // Bruges ved "fortryd træk": sætter hvis ur der skal køre.
  setRunning(color) {
    if (!this.enabled) return;
    this.update();
    this.running = color;
    this.lastTime = performance.now();
    if (color) this.startTimer();
    else this.stopTimer();
    this.onTick();
  }

  // Stopper uret (fx når partiet er slut).
  stop() {
    this.update();
    this.running = null;
    this.stopTimer();
    this.onTick();
  }

  // Trækker den tid fra, der er gået siden sidst.
  update() {
    if (!this.running || this.lastTime === null) return;
    const now = performance.now();
    this.time[this.running] -= now - this.lastTime;
    this.lastTime = now;

    // Tiden er løbet ud!
    if (this.time[this.running] <= 0) {
      this.time[this.running] = 0;
      const flagged = this.running;
      this.running = null;
      this.stopTimer();
      this.onFlag(flagged);
    }
  }

  startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.update();
      this.onTick();
    }, 100);
  }

  stopTimer() {
    clearInterval(this.timer);
    this.timer = null;
  }

  // Laver millisekunder om til tekst som "9:58" eller "0:07.3".
  static format(ms) {
    if (ms < 20000) {
      // Under 20 sekunder vises tiendedele, ligesom på de store skaksider.
      const seconds = Math.max(0, ms) / 1000;
      return `0:${seconds < 10 ? "0" : ""}${seconds.toFixed(1)}`;
    }
    const total = Math.ceil(ms / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = String(total % 60).padStart(2, "0");
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${secs}`;
    return `${minutes}:${secs}`;
  }
}