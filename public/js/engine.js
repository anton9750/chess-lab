// ===================================================================
// engine.js – forbindelsen til skakmotoren Stockfish.
// Stockfish kører i en "Web Worker" (et baggrundsprogram), så siden
// ikke fryser, mens motoren tænker.
// Vi taler med Stockfish via tekstbeskeder i "UCI"-sproget, fx:
//   "position fen ..."  → her er stillingen
//   "go movetime 1000"  → tænk i 1 sekund
// og Stockfish svarer fx "bestmove e2e4".
//
// To motorer:
//  - Stockfish 19 (lib/stockfish-19-lite-single.js + .wasm) bruges, når siden
//    ligger på en webadresse (fx Netlify). Den er stærk og har "UCI_Elo",
//    så bots kan spille på en bestemt, kalibreret rating.
//  - Stockfish 10 (lib/stockfish-source.js) bruges, når index.html åbnes
//    direkte fra mappen (file://) – der må browseren ikke hente .wasm-filen.
// ===================================================================

const ENGINE_MODERN = location.protocol === "http:" || location.protocol === "https:";

class Engine {
  // port = (valgfri) en færdig forbindelse til en motor, fx Fairy-Stockfish til varianter
  constructor(port = null, version = null) {
    if (port) {
      this.worker = port;
      this.version = version;
    } else if (ENGINE_MODERN) {
      this.worker = new Worker("lib/stockfish-19-lite-single.js");
      this.version = 19;
    } else {
      // Stockfish 10 ligger som tekst i lib/stockfish-source.js.
      // Vi laver en "Blob" (en fil i hukommelsen) og starter en worker fra den.
      const blob = new Blob([window.STOCKFISH_SOURCE], { type: "application/javascript" });
      this.worker = new Worker(URL.createObjectURL(blob));
      this.version = 10;
    }
    this.worker.onmessage = (e) => this.onLine(String(e.data));

    this.jobs = [];       // søgninger der venter på svar, i rækkefølge
    this.lastSkill = null;
    this.lastElo = null;
    this.lastMultiPv = 1;

    this.send("uci");
    this.send("isready");
  }

  send(command) {
    this.worker.postMessage(command);
  }

  // Kaldes for hver linje Stockfish skriver tilbage.
  onLine(line) {
    const job = this.jobs[0];
    if (!job) return;

    // Analyse med flere linjer (MultiPV): gem vurdering og variant for hver linje
    if (job.analyze && line.startsWith("info") && line.includes(" score ") && line.includes(" pv ")) {
      const index = Number((line.match(/multipv (\d+)/) || [0, 1])[1]);
      const cp = line.match(/score cp (-?\d+)/);
      const mate = line.match(/score mate (-?\d+)/);
      const pv = line.split(" pv ")[1].trim().split(" ");
      job.lines[index] = { cp: cp ? Number(cp[1]) : null, mate: mate ? Number(mate[1]) : null, pv, move: pv[0] };
      if (job.onUpdate && !job.cancelled) job.onUpdate(Object.values(job.lines));
    }

    // "info ... score cp 35 ..." = stillingens vurdering i centibønder (100 = én bonde)
    if (line.startsWith("info") && line.includes(" score ")) {
      const cp = line.match(/score cp (-?\d+)/);
      const mate = line.match(/score mate (-?\d+)/);
      if (cp) { job.scoreCp = Number(cp[1]); job.mate = null; }
      if (mate) { job.mate = Number(mate[1]); job.scoreCp = null; }
    }

    // "bestmove e2e4" = søgningen er færdig
    if (line.startsWith("bestmove")) {
      this.jobs.shift();
      const best = line.split(" ")[1];
      if (job.cancelled) job.resolve(null);
      else if (job.analyze) job.resolve({ best, lines: Object.values(job.lines) });
      else if (!best || best === "(none)") job.resolve(null);
      else job.resolve({ best, scoreCp: job.scoreCp, mate: job.mate });
    }
  }

  // Finder det bedste træk i en stilling.
  //  fen      – stillingen
  //  skill    – 0 (svagest) til 20 (stærkest)
  //  elo      – spil på en bestemt rating (1320–3190), kun Stockfish 19 (valgfri)
  //  depth    – hvor mange træk frem motoren må regne (valgfri)
  //  movetime – hvor mange millisekunder den må tænke (valgfri)
  // Returnerer et Promise med { best: "e2e4", scoreCp, mate } eller null hvis afbrudt.
  search(fen, { skill = 20, elo = null, depth = null, movetime = null } = {}) {
    // Kun én søgning ad gangen: en ny søgning afbryder den gamle
    this.stop();

    return new Promise((resolve) => {
      this.jobs.push({ resolve, scoreCp: null, mate: null, cancelled: false });

      if (elo && (this.version === 19 || this.version === "fairy")) {
        this.setElo(elo);
      } else {
        this.setElo(null);
        // Stockfish 10 kender ikke UCI_Elo – brug "Skill Level" som en tilnærmelse
        this.setSkill(elo ? Math.max(0, Math.min(20, Math.round(((elo - 1320) / (3190 - 1320)) * 20))) : skill);
      }
      this.setMultiPv(1);
      this.send(`position fen ${fen}`);

      let go = "go";
      if (depth) go += ` depth ${depth}`;
      if (movetime) go += ` movetime ${movetime}`;
      if (!depth && !movetime) go += " movetime 1000";
      this.send(go);
    });
  }

  // Analyserer en stilling med fuld styrke og giver de bedste linjer tilbage.
  //  multipv  – hvor mange forskellige gode træk der skal findes
  //  onUpdate – kaldes undervejs, mens motoren tænker dybere (valgfri)
  // Returnerer { best, lines: [{ move, cp, mate, pv }, ...] }.
  // cp og mate er set fra den spiller, der er i trækket.
  analyze(fen, { depth = 12, movetime = 500, multipv = 1, onUpdate = null } = {}) {
    this.stop();
    return new Promise((resolve) => {
      this.jobs.push({ resolve, analyze: true, lines: {}, onUpdate, cancelled: false });
      this.setElo(null);
      this.setSkill(20);
      this.setMultiPv(multipv);
      this.send(`position fen ${fen}`);
      let go = "go";
      if (depth) go += ` depth ${depth}`;
      if (movetime) go += ` movetime ${movetime}`;
      this.send(go);
    });
  }

  setSkill(skill) {
    if (skill === this.lastSkill) return;
    this.send(`setoption name Skill Level value ${skill}`);
    this.lastSkill = skill;
  }

  // Fairy-Stockfish: hvilken variant der spilles
  setVariant(variantId) {
    if (this.variantId === variantId) return;
    this.stop();
    const names = { chess960: "chess", threecheck: "3check" };
    this.send(`setoption name UCI_Variant value ${names[variantId] || variantId}`);
    this.send(`setoption name UCI_Chess960 value ${variantId === "chess960"}`);
    this.send("ucinewgame");
    this.variantId = variantId;
  }

  // Begræns styrken til en bestemt rating (null = fuld styrke)
  setElo(elo) {
    if (elo === this.lastElo) return;
    if (elo) {
      this.send("setoption name UCI_LimitStrength value true");
      this.send(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, Math.round(elo)))}`);
    } else if (this.lastElo) {
      this.send("setoption name UCI_LimitStrength value false");
    }
    this.lastElo = elo;
  }

  setMultiPv(count) {
    if (count === this.lastMultiPv) return;
    this.send(`setoption name MultiPV value ${count}`);
    this.lastMultiPv = count;
  }

  // Afbryder alle igangværende søgninger. Deres svar bliver null.
  stop() {
    if (this.jobs.length === 0) return;
    this.jobs.forEach((job) => { job.cancelled = true; });
    this.send("stop");
  }

  newGame() {
    this.stop();
    this.send("ucinewgame");
    this.send("isready");
  }
}

// Motoren startes først, når den skal bruges (den er stor).
let engineInstance = null;
function getEngine() {
  if (!engineInstance) engineInstance = new Engine();
  return engineInstance;
}

// Laver "e7e8q" om til { from: "e7", to: "e8", promotion: "q" }
// og "N@f3" (Crazyhouse: sæt en springer ind på f3) om til { drop: "n", to: "f3" }
function uciToMove(uci) {
  if (uci[1] === "@") return { drop: uci[0].toLowerCase(), to: uci.slice(2, 4) };
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined };
}

// ----- Fairy-Stockfish (motoren til varianter) -----
// Den bruger flere tråde, og det kræver, at siden er "cross-origin isolated"
// (to sikkerheds-headers, som Netlify sender – se netlify.toml).
// Uden det (fx fra mappen) bruges en lille indbygget motor i bots.js i stedet.

let fairyPromise = null;

function fairyAvailable() {
  return ENGINE_MODERN && window.crossOriginIsolated === true;
}

function getFairyEngine() {
  if (!fairyPromise) {
    fairyPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "lib/fairy/stockfish.js";
      script.onload = async () => {
        try {
          const sf = await window.Stockfish({ locateFile: (file) => "lib/fairy/" + file });
          // En lille "port", så Engine-klassen kan tale med den som med en worker
          const port = { onmessage: null, postMessage: (cmd) => sf.postMessage(cmd) };
          sf.addMessageListener((line) => port.onmessage && port.onmessage({ data: line }));
          resolve(new Engine(port, "fairy"));
        } catch (error) {
          reject(error);
        }
      };
      script.onerror = reject;
      document.head.appendChild(script);
    }).catch(() => null);
  }
  return fairyPromise;
}

// Den rigtige motor til et parti: Stockfish til almindelig skak, Fairy-Stockfish til varianter.
// Giver null, hvis der ikke er nogen motor til varianten (så bruges den indbyggede).
async function engineFor(chess) {
  if (!(typeof VariantGame !== "undefined" && chess instanceof VariantGame)) return getEngine();
  if (!fairyAvailable()) return null;
  const engine = await getFairyEngine();
  if (engine) engine.setVariant(chess.variant.id);
  return engine;
}