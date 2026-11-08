// ===================================================================
// board.js – selve skakbrættet på skærmen.
// Det tegner felter og brikker og håndterer musen:
//  - klik eller træk (drag & drop) for at flytte en brik
//  - højreklik på et felt = rød markering
//  - højreklik og træk = pil
//  - menu til bondeforvandling
// Brættet kender ikke selv reglerne. Det spørger chess.js om lovlige
// træk og fortæller resten af programmet om trækket via "onMove".
// Det samme bræt kan senere genbruges til bots, puzzles og online.
// ===================================================================

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

class BoardView {
  constructor(wrapEl) {
    this.wrapEl = wrapEl;                            // boksen rundt om brættet
    this.boardEl = wrapEl.querySelector(".board");   // de 64 felter
    this.arrowsEl = wrapEl.querySelector(".arrows"); // SVG-laget til pile

    this.opts = null;        // hvad der skal vises (sættes i draw)
    this.selected = null;    // valgt felt, fx "e2"
    this.drag = null;        // info om en brik der trækkes med musen
    this.arrows = [];        // pile: [{ from: "e2", to: "e4" }, ...]
    this.hint = null;        // grøn tip-pil: { from, to } eller null
    this.marks = new Set();  // røde markeringer: felter
    this.rightStart = null;  // felt hvor et højreklik startede
    this.promoEl = null;     // menuen til bondeforvandling (hvis åben)
    this.squareEls = {};     // felt-navn → HTML-element
    this.lastMoveWasDrag = false; // blev det sidste træk lavet ved at trække brikken?

    // Funktioner som resten af programmet sætter:
    this.onMove = null;        // kaldes med (from, to, promotion)
    this.onBoardTouch = null;  // kaldes ved klik; returnerer true hvis klikket er "brugt"

    // Musen/fingeren. "pointer"-hændelser virker både med mus og touch.
    this.boardEl.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    window.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
    // Ingen højreklik-menu på brættet (vi bruger højreklik til pile).
    this.boardEl.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // ----- Tegning -----

  // Tegner brættet. opts indeholder bl.a.:
  //  chess        – et Chess-objekt med den stilling der skal vises
  //  flipped      – true hvis sort skal sidde nederst
  //  lastMove     – sidste træk (markeres med gult) eller null
  //  interactive  – om man må flytte brikker lige nu
  //  movableColor – hvilken farve man må flytte ("w" eller "b")
  //  animate      – { from, to } hvis en brik skal glide (valgfri)
  draw(opts) {
    this.opts = opts;
    if (!opts.interactive) {
      this.selected = null;
      this.closePromotion();
    }
    this.render();
  }

  render() {
    const { chess, flipped, lastMove } = this.opts;
    this.boardEl.innerHTML = "";
    this.squareEls = {};

    // Crazyhouse: en brik fra lommen er valgt → vis de felter, den må sættes på
    const targets = this.dropPiece && chess.dropSquares
      ? chess.dropSquares(this.dropPiece).map((to) => ({ to }))
      : this.selected ? this.legalMovesFrom(this.selected) : [];
    const checkSquare = chess.inCheck() ? this.findKing(chess, chess.turn()) : null;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const square = this.squareAtRowCol(row, col);
        const fileIndex = FILES.indexOf(square[0]);
        const rank = Number(square[1]);

        const el = document.createElement("div");
        el.className = "square " + ((fileIndex + rank) % 2 === 0 ? "light" : "dark");
        el.dataset.square = square;

        if (lastMove && (lastMove.from === square || lastMove.to === square)) el.classList.add("highlight");
        if (square === this.selected) el.classList.add("highlight");
        if ((this.opts.premoveMoves || []).some((pm) => pm.from === square || pm.to === square)) el.classList.add("premove");
        if (this.hint && this.hint.from === square) el.classList.add("hint-square");
        if (this.marks.has(square)) el.classList.add("marked");
        if (square === checkSquare) el.classList.add("in-check");

        // Prik (tomt felt) eller ring (felt med brik) for lovlige træk
        if (settings.showHints && targets.some((m) => m.to === square)) {
          el.classList.add(chess.get(square) ? "hint-capture" : "hint");
        }

        // Brikken – vises som et SVG-billede i baggrunden af en div
        const piece = chess.get(square);
        if (piece) {
          const pieceEl = document.createElement("div");
          pieceEl.className = "piece";
          pieceEl.style.backgroundImage = `url("${pieceUrl(piece.color, piece.type)}")`;
          if (this.drag && this.drag.moved && this.drag.from === square) pieceEl.classList.add("dragging-origin");
          el.appendChild(pieceEl);
        }

        // Stjerner man skal samle i lektionerne
        if (this.opts.stars && this.opts.stars.includes(square)) {
          const star = document.createElement("span");
          star.className = "lesson-star";
          star.textContent = "★";
          el.appendChild(star);
        }

        // Lille mærke i hjørnet (fx "??" for en fejl i Game Review)
        const badge = this.opts.badge;
        if (badge && badge.square === square) {
          const badgeEl = document.createElement("span");
          badgeEl.className = "move-badge cls-" + badge.cls;
          badgeEl.textContent = badge.symbol;
          el.appendChild(badgeEl);
        }

        // Koordinater på nederste række og venstre kolonne
        if (settings.showCoords) {
          if (row === 7) this.addCoord(el, square[0], "coord-file");
          if (col === 0) this.addCoord(el, square[1], "coord-rank");
        }

        this.squareEls[square] = el;
        this.boardEl.appendChild(el);
      }
    }
    this.drawArrows();

    // Animation: brikken glider fra sit gamle felt til det nye.
    // Den bruges kun én gang, så den ikke gentages ved næste tegning.
    const animate = this.opts.animate;
    this.opts.animate = null;
    if (animate) this.animatePiece(animate.from, animate.to);
  }

  // Får brikken på "to" til at glide hen fra "from".
  // Brikken tegnes først på det nye felt, men flyttes med CSS tilbage til det gamle
  // felt. Derefter fjernes flytningen langsomt (transition), så den glider på plads.
  animatePiece(from, to) {
    const speed = { none: 0, fast: 0.1, normal: 0.2, slow: 0.35 }[settings.animSpeed] ?? 0.2;
    if (!speed) return; // animation slået fra
    const pieceEl = this.squareEls[to] && this.squareEls[to].querySelector(".piece");
    if (!pieceEl) return;
    const a = this.rowColOf(from);
    const b = this.rowColOf(to);
    pieceEl.style.transform = `translate(${(a.col - b.col) * 100}%, ${(a.row - b.row) * 100}%)`;
    pieceEl.style.zIndex = 10;
    pieceEl.getBoundingClientRect(); // tving browseren til at tegne startpositionen først
    pieceEl.style.transition = `transform ${speed}s ease`;
    pieceEl.style.transform = "";
    pieceEl.addEventListener("transitionend", () => {
      pieceEl.style.transition = "";
      pieceEl.style.zIndex = "";
    }, { once: true });
  }

  addCoord(el, text, className) {
    const span = document.createElement("span");
    span.className = "coord " + className;
    span.textContent = text;
    el.appendChild(span);
  }

  // ----- Hjælpefunktioner til felter -----

  // Række/kolonne på skærmen (0–7) → feltnavn. Tager højde for vendt bræt.
  squareAtRowCol(row, col) {
    const flipped = this.opts.flipped;
    const file = flipped ? FILES[7 - col] : FILES[col];
    const rank = flipped ? row + 1 : 8 - row;
    return file + rank;
  }

  // Feltnavn → række/kolonne på skærmen.
  rowColOf(square) {
    const fileIndex = FILES.indexOf(square[0]);
    const rank = Number(square[1]);
    const flipped = this.opts.flipped;
    return {
      col: flipped ? 7 - fileIndex : fileIndex,
      row: flipped ? rank - 1 : 8 - rank,
    };
  }

  // Musens position → feltnavn (eller null hvis uden for brættet).
  squareFromPoint(x, y) {
    const rect = this.boardEl.getBoundingClientRect();
    const col = Math.floor(((x - rect.left) / rect.width) * 8);
    const row = Math.floor(((y - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return this.squareAtRowCol(row, col);
  }

  findKing(chess, color) {
    for (const row of chess.board()) {
      for (const piece of row) {
        if (piece && piece.type === "k" && piece.color === color) return piece.square;
      }
    }
    return null;
  }

  legalMovesFrom(square) {
    // Premove: det er ikke min tur, så vi lader som om det er – for at finde mulige træk
    if (this.isPremoveTime()) {
      if (typeof VariantGame !== "undefined" && this.opts.chess instanceof VariantGame) return []; // ingen premoves i varianter
      const fen = this.opts.chess.fen().split(" ");
      fen[1] = this.opts.movableColor;
      fen[3] = "-";
      return new Chess(fen.join(" "), { skipValidation: true }).moves({ square, verbose: true });
    }
    return this.opts.chess.moves({ square, verbose: true });
  }

  // Er det modstanderens tur, men premoves er tilladt?
  isPremoveTime() {
    return !!(this.opts.premove && this.opts.chess.turn() !== this.opts.movableColor);
  }

  isLegalTarget(from, to) {
    return this.legalMovesFrom(from).some((m) => m.to === to);
  }

  // ----- Mus og touch -----

  onPointerDown(e) {
    if (this.promoEl) return; // menuen til bondeforvandling er åben

    // Højreklik: husk hvor det startede (til markering eller pil)
    if (e.button === 2) {
      // Højreklik annullerer en premove (ligesom på de store sider)
      if (this.opts.premoveMoves && this.opts.premoveMoves.length && this.onPremoveCancel) {
        this.onPremoveCancel();
        return;
      }
      this.rightStart = this.squareFromPoint(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;

    // Et venstreklik fjerner alle pile og røde markeringer
    if (this.arrows.length || this.marks.size) {
      this.arrows = [];
      this.marks.clear();
    }

    // Lad resten af programmet reagere først (fx hoppe tilbage til live-stillingen)
    if (this.onBoardTouch && this.onBoardTouch()) return;

    if (!this.opts.interactive) {
      this.render();
      return;
    }

    const square = this.squareFromPoint(e.clientX, e.clientY);
    if (!square) return;
    const piece = this.opts.chess.get(square);

    // Crazyhouse: sæt den valgte brik fra lommen ind
    if (this.dropPiece) {
      const drop = this.dropPiece;
      this.dropPiece = null;
      if (this.opts.chess.dropSquares && this.opts.chess.dropSquares(drop).includes(square) && this.onDrop) {
        this.lastMoveWasDrag = false;
        this.onDrop(drop, square);
        return;
      }
    }

    // En brik er valgt, og man klikker på et lovligt felt: lav trækket
    if (this.selected && square !== this.selected && this.isLegalTarget(this.selected, square) && settings.moveMethod !== "drag") {
      this.lastMoveWasDrag = false; // klik-træk: brikken må gerne glide
      this.attemptMove(this.selected, square);
      return;
    }

    // Klik på en af sine egne brikker: vælg den og begynd at trække
    if (piece && piece.color === this.opts.movableColor) {
      const wasSelected = this.selected === square;
      // Kun-klik: klik på den valgte brik igen fravælger den
      this.selected = settings.moveMethod === "click" && wasSelected ? null : square;
      this.startDrag(e, square, piece, wasSelected);
      this.render();
      return;
    }

    // Klik et andet sted: fravælg (og annuller en evt. premove)
    this.selected = null;
    if (this.opts.premoveMoves && this.opts.premoveMoves.length && this.onPremoveCancel) return this.onPremoveCancel();
    this.render();
  }

  // Laver en kopi af brikken der følger musen.
  startDrag(e, square, piece, wasSelected) {
    e.preventDefault();
    if (settings.moveMethod === "click") return; // kun klik – ingen træk med musen
    const size = this.boardEl.getBoundingClientRect().width / 8;
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.style.width = size + "px";
    ghost.style.height = size + "px";
    ghost.style.backgroundImage = `url("${pieceUrl(piece.color, piece.type)}")`;
    document.body.appendChild(ghost);

    this.drag = { from: square, wasSelected, ghost, size, moved: false, startX: e.clientX, startY: e.clientY, hover: null };
    this.moveGhost(e.clientX, e.clientY);
    document.body.classList.add("grabbing");
  }

  moveGhost(x, y) {
    const d = this.drag;
    d.ghost.style.left = x - d.size / 2 + "px";
    d.ghost.style.top = y - d.size / 2 + "px";
  }

  onPointerMove(e) {
    if (!this.drag) return;
    const d = this.drag;
    this.moveGhost(e.clientX, e.clientY);

    // Først når musen har flyttet sig lidt, regnes det som at "trække"
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) {
      d.moved = true;
      const originPiece = this.squareEls[d.from] && this.squareEls[d.from].querySelector(".piece");
      if (originPiece) originPiece.classList.add("dragging-origin");
    }

    // Hvidt omrids om feltet under musen
    const hover = this.squareFromPoint(e.clientX, e.clientY);
    if (hover !== d.hover) {
      if (d.hover && this.squareEls[d.hover]) this.squareEls[d.hover].classList.remove("drag-over");
      if (hover && this.squareEls[hover]) this.squareEls[hover].classList.add("drag-over");
      d.hover = hover;
    }
  }

  onPointerUp(e) {
    // Højreklik slut: samme felt = markering, andet felt = pil
    if (e.button === 2 && this.rightStart) {
      const end = this.squareFromPoint(e.clientX, e.clientY);
      if (end === this.rightStart) this.toggleMark(end);
      else if (end) this.toggleArrow(this.rightStart, end);
      this.rightStart = null;
      this.render();
      return;
    }

    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    d.ghost.remove();
    document.body.classList.remove("grabbing");

    const target = this.squareFromPoint(e.clientX, e.clientY);

    // Sluppet på et lovligt felt: lav trækket
    if (target && target !== d.from && this.isLegalTarget(d.from, target)) {
      this.lastMoveWasDrag = true; // trukket med musen: ingen animation bagefter
      this.attemptMove(d.from, target);
      return;
    }

    // Klik på den brik der allerede var valgt: fravælg den
    if (target === d.from && d.wasSelected && !d.moved) this.selected = null;
    // Sluppet et ulovligt sted: brikken hopper tilbage
    else if (d.moved && target !== d.from) this.selected = null;

    this.render();
  }

  // ----- Træk og bondeforvandling -----

  attemptMove(from, to) {
    if (this.isPremoveTime()) {
      this.selected = null;
      if (this.onPremove) this.onPremove(from, to);
      return;
    }
    const moves = this.legalMovesFrom(from).filter((m) => m.to === to);
    this.selected = null;
    this.arrows = [];
    this.marks.clear();
    this.hint = null;

    // Er det en bondeforvandling? Så skal man vælge brik (medmindre "auto-queen" er slået til)
    if (moves.some((m) => m.promotion)) {
      if (settings.autoQueen) this.onMove(from, to, "q");
      else this.showPromotion(from, to);
      return;
    }
    this.onMove(from, to);
  }

  // Viser en lodret række med dronning, springer, tårn og løber over feltet.
  showPromotion(from, to) {
    this.render();
    const color = this.opts.chess.turn();
    const { col, row } = this.rowColOf(to);

    // Gennemsigtigt lag bag menuen: klik på det = fortryd
    const backdrop = document.createElement("div");
    backdrop.className = "promo-backdrop";
    backdrop.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.closePromotion();
      this.render();
    });

    const picker = document.createElement("div");
    picker.className = "promo-picker" + (row === 0 ? " from-top" : " from-bottom");
    picker.style.left = col * 12.5 + "%";

    ["q", "n", "r", "b"].forEach((type) => {
      const option = document.createElement("button");
      option.className = "promo-option";
      option.style.backgroundImage = `url("${pieceUrl(color, type)}")`;
      option.addEventListener("click", () => {
        this.closePromotion();
        this.onMove(from, to, type);
      });
      picker.appendChild(option);
    });

    const close = document.createElement("button");
    close.className = "promo-close";
    close.innerHTML = "&times;";
    close.addEventListener("click", () => {
      this.closePromotion();
      this.render();
    });
    picker.appendChild(close);

    backdrop.appendChild(picker);
    picker.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.wrapEl.appendChild(backdrop);
    this.promoEl = backdrop;
  }

  closePromotion() {
    if (this.promoEl) this.promoEl.remove();
    this.promoEl = null;
  }

  // ----- Pile og markeringer -----

  toggleMark(square) {
    if (this.marks.has(square)) this.marks.delete(square);
    else this.marks.add(square);
  }

  toggleArrow(from, to) {
    const index = this.arrows.findIndex((a) => a.from === from && a.to === to);
    if (index >= 0) this.arrows.splice(index, 1);
    else this.arrows.push({ from, to });
  }

  // Viser et tip: en grøn pil for det bedste træk. null fjerner tippet.
  showHint(move) {
    this.hint = move;
    if (this.opts) this.render(); // kun hvis brættet allerede er tegnet
  }

  // Tegner alle pile i SVG-laget. SVG'en er 8 x 8 enheder, så ét felt = 1 enhed.
  drawArrows() {
    let svg = this.arrows.map((a) => this.arrowSvg(a.from, a.to, "arrow")).join("");
    if (this.hint) svg += this.arrowSvg(this.hint.from, this.hint.to, "arrow arrow-hint");
    this.arrowsEl.innerHTML = svg;
  }

  arrowSvg(from, to, className) {
    const a = this.rowColOf(from);
    const b = this.rowColOf(to);
    const start = { x: a.col + 0.5, y: a.row + 0.5 };
    const end = { x: b.col + 0.5, y: b.row + 0.5 };

    // Springertræk tegnes som et "L": først den lange vej, så den korte
    const dx = Math.abs(a.col - b.col);
    const dy = Math.abs(a.row - b.row);
    const points = [start];
    if ((dx === 1 && dy === 2) || (dx === 2 && dy === 1)) {
      points.push(dy === 2 ? { x: start.x, y: end.y } : { x: end.x, y: start.y });
    }

    // Retningen på den sidste del af pilen (til pilespidsen)
    const last = points[points.length - 1];
    const len = Math.hypot(end.x - last.x, end.y - last.y);
    const ux = (end.x - last.x) / len;
    const uy = (end.y - last.y) / len;
    const headLength = 0.42;
    const headWidth = 0.42;

    // Linjen stopper hvor spidsen begynder
    const lineEnd = { x: end.x - ux * headLength, y: end.y - uy * headLength };
    const linePoints = [...points, lineEnd].map((p) => `${p.x},${p.y}`).join(" ");

    // Pilespidsen er en trekant
    const px = -uy * headWidth;
    const py = ux * headWidth;
    const head = [
      `${end.x},${end.y}`,
      `${lineEnd.x + px},${lineEnd.y + py}`,
      `${lineEnd.x - px},${lineEnd.y - py}`,
    ].join(" ");

    return `
      <g class="${className}">
        <polyline points="${linePoints}" fill="none" stroke-width="0.17" stroke-linejoin="round" />
        <polygon points="${head}" />
      </g>`;
  }
}