// ===================================================================
// variants.js – skak-varianter (ligesom på Lichess og chess.com).
//
// Almindelig skak bruger chess.js. Varianterne bruger "chessops"
// (lib/chessops.js), som er lavet af Lichess-udvikleren og kender alle
// Lichess' varianter.
//
// VariantGame herunder er en "oversætter": den har de samme funktioner som
// chess.js (moves, move, fen, turn, board …). Så kan brættet og resten af
// programmet bruge en variant præcis som et almindeligt parti.
// ===================================================================

const VARIANTS = [
  { id: "chess", name: "Standard", icon: "♟", rules: "chess",
    desc: "Normal chess." },
  { id: "chess960", name: "Chess960", icon: "🎲", rules: "chess",
    desc: "The back-row pieces start in a random order (960 possible positions). Castling still works – move your king onto your rook." },
  { id: "kingofthehill", name: "King of the Hill", icon: "⛰", rules: "kingofthehill",
    desc: "Get your king to one of the four center squares (d4, e4, d5, e5) to win – or checkmate as usual." },
  { id: "threecheck", name: "Three-check", icon: "③", rules: "3check",
    desc: "Give check three times to win – or checkmate as usual." },
  { id: "atomic", name: "Atomic", icon: "💥", rules: "atomic",
    desc: "Every capture causes an explosion that destroys all pieces around it (except pawns). Blow up the enemy king to win!" },
  { id: "antichess", name: "Antichess", icon: "🔄", rules: "antichess",
    desc: "Lose all your pieces to win! If you can capture, you must. The king is just a normal piece." },
  { id: "horde", name: "Horde", icon: "🐜", rules: "horde",
    desc: "White has 36 pawns, Black has a normal army. Black wins by destroying all the pawns; White wins by checkmate." },
  { id: "racingkings", name: "Racing Kings", icon: "🏁", rules: "racingkings",
    desc: "Race your king to the 8th rank. No checks are allowed – first king to arrive wins." },
  { id: "crazyhouse", name: "Crazyhouse", icon: "🏠", rules: "crazyhouse",
    desc: "Pieces you capture switch sides and go to your pocket. Instead of moving, you can drop one onto any empty square." },
];

const findVariant = (id) => VARIANTS.find((v) => v.id === (id || "chess")) || VARIANTS[0];
const isVariant = (id) => !!id && id !== "chess";

// Rollerne i chessops ↔ bogstaverne i chess.js
const ROLE_LETTER = { pawn: "p", knight: "n", bishop: "b", rook: "r", queen: "q", king: "k" };
const LETTER_ROLE = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const sqName = (n) => Chessops.makeSquare(n);
const sqNum = (s) => Chessops.parseSquare(s);
const colorLetter = (c) => (c === "white" ? "w" : "b");

// ----- Chess960: en tilfældig startstilling -----
// Regler: løberne på hver sin farve, kongen mellem tårnene.
function chess960Fen() {
  const row = new Array(8).fill(null);
  const free = () => row.map((p, i) => (p ? null : i)).filter((i) => i !== null);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  row[pick([0, 2, 4, 6])] = "b";                 // løber på mørkt felt
  row[pick([1, 3, 5, 7])] = "b";                 // løber på lyst felt
  row[pick(free())] = "q";
  row[pick(free())] = "n";
  row[pick(free())] = "n";
  const [a, k, h] = free();                      // de sidste 3 felter: tårn, konge, tårn
  row[a] = "r"; row[k] = "k"; row[h] = "r";
  const back = row.join("");
  // Rokade-rettigheder skrives som tårnenes linjer (fx "HAha"), så det virker for alle 960 stillinger
  const files = "abcdefgh";
  const castling = files[h].toUpperCase() + files[a].toUpperCase() + files[h] + files[a];
  return `${back}/pppppppp/8/8/8/8/PPPPPPPP/${back.toUpperCase()} w ${castling} - 0 1`;
}

// Startstillingen for en variant (Chess960 er tilfældig hver gang)
function variantStartFen(id) {
  if (id === "chess960") return chess960Fen();
  const v = findVariant(id);
  return Chessops.fen.makeFen(Chessops.variant.defaultPosition(v.rules).toSetup());
}

// ----- Selve oversætteren -----

class VariantGame {
  constructor(fen, variantId) {
    this.variant = findVariant(variantId);
    this.is960 = this.variant.id === "chess960";
    this._history = [];     // [{ move (som chess.js), before: position }]
    this._seen = {};        // til 3-gangs gentagelse
    this.load(fen || variantStartFen(this.variant.id));
  }

  load(fen) {
    const setup = Chessops.fen.parseFen(fen).unwrap();
    this.pos = Chessops.variant.setupPosition(this.variant.rules, setup).unwrap();
    this._history = [];
    this._seen = {};
    this.countPosition();
  }

  // ----- Det samme som chess.js -----

  fen() { return Chessops.fen.makeFen(this.pos.toSetup()); }
  turn() { return colorLetter(this.pos.turn); }

  get(square) {
    const p = this.pos.board.get(sqNum(square));
    return p ? { type: ROLE_LETTER[p.role], color: colorLetter(p.color) } : null;
  }

  // 8 rækker (række 8 først) med { square, type, color } eller null
  board() {
    const rows = [];
    for (let rank = 7; rank >= 0; rank--) {
      const row = [];
      for (let file = 0; file < 8; file++) {
        const n = rank * 8 + file;
        const p = this.pos.board.get(n);
        row.push(p ? { square: sqName(n), type: ROLE_LETTER[p.role], color: colorLetter(p.color) } : null);
      }
      rows.push(row);
    }
    return rows;
  }

  // Lovlige træk fra et felt (eller alle). Rokade kan laves ved at flytte kongen
  // to felter (almindelig skak) eller hen på tårnet (Chess960).
  moves({ square, verbose } = {}) {
    const dests = Chessops.compat.chessgroundDests(this.pos, { chess960: this.is960 });
    const out = [];
    for (const [from, tos] of dests) {
      if (square && from !== square) continue;
      for (const to of new Set(tos)) {
        const piece = this.get(from);
        const lastRank = to[1] === (piece.color === "w" ? "8" : "1");
        if (piece.type === "p" && lastRank) {
          const roles = this.variant.id === "antichess" ? ["q", "r", "b", "n", "k"] : ["q", "r", "b", "n"];
          roles.forEach((r) => out.push(this.describe({ from, to, promotion: r })));
        } else out.push(this.describe({ from, to }));
      }
    }
    return verbose ? out : out.map((m) => m.san);
  }

  // Laver et chess.js-lignende træk-objekt (uden at spille det)
  describe({ from, to, promotion, drop }) {
    const move = this.toOps({ from, to, promotion, drop });
    const piece = drop ? { type: drop, color: this.turn() } : this.get(from);
    // (rokade: chessops flytter kongen "hen på tårnet", fx e1h1)
    const target = this.pos.board.get(move.to);
    const castle = !drop && piece.type === "k" && target && target.role === "rook" && target.color === this.pos.turn;
    let captured = !castle && target ? ROLE_LETTER[target.role] : undefined;
    const enPassant = !drop && piece.type === "p" && from[0] !== to[0] && !target;
    if (enPassant) captured = "p";
    const kingside = castle && move.to > move.from;
    let flags = drop ? "d" : castle ? (kingside ? "k" : "q") : enPassant ? "e" : captured ? "c" : "n";
    if (promotion) flags += "p";
    // Almindelig skak: vis rokaden som kongens slutfelt (g1/c1). Chess960: kongen går hen på tårnet.
    if (castle && !this.is960) to = (kingside ? "g" : "c") + from[1];
    return {
      from: drop ? "@" : from, to, piece: piece.type, color: piece.color, captured, promotion, drop,
      flags, san: Chessops.san.makeSan(this.pos, move), uci: makeUciMove(move),
    };
  }

  // chess.js-træk (eller SAN-tekst) → chessops-træk
  toOps(m) {
    if (typeof m === "string") {
      const parsed = Chessops.san.parseSan(this.pos, m);
      if (!parsed) throw new Error("Invalid move: " + m);
      return parsed;
    }
    if (m.drop) return { role: LETTER_ROLE[m.drop], to: sqNum(m.to) };
    const move = { from: sqNum(m.from), to: sqNum(m.to) };
    if (m.promotion) move.promotion = LETTER_ROLE[m.promotion];
    return Chessops.variant.normalizeMove(this.pos, move); // fx e1g1 → e1h1 (rokade)
  }

  move(m) {
    const ops = this.toOps(m);
    if (!this.pos.isLegal(ops)) throw new Error("Invalid move: " + JSON.stringify(m));
    let move;
    if (typeof m === "string") {
      move = ops.role && ops.from === undefined
        ? this.describe({ drop: ROLE_LETTER[ops.role], to: sqName(ops.to) })
        : this.describe({ from: sqName(ops.from), to: sqName(ops.to), promotion: ops.promotion && ROLE_LETTER[ops.promotion] });
    } else move = this.describe(m);
    this._history.push({ move, before: this.pos.clone() });
    this.pos.play(ops);
    this.countPosition();
    return move;
  }

  undo() {
    const last = this._history.pop();
    if (!last) return null;
    this._seen[this.repetitionKey()]--;
    this.pos = last.before;
    return last.move;
  }

  history({ verbose } = {}) {
    return this._history.map((h) => (verbose ? h.move : h.move.san));
  }

  inCheck() { return this.pos.isCheck(); }
  isCheckmate() { return this.pos.isCheckmate(); }
  isStalemate() { return this.pos.isStalemate(); }
  isInsufficientMaterial() { return this.pos.isInsufficientMaterial(); }
  isThreefoldRepetition() { return (this._seen[this.repetitionKey()] || 0) >= 3; }
  isDraw() {
    return this.isStalemate() || this.isInsufficientMaterial() || this.isThreefoldRepetition() || this.pos.halfmoves >= 100;
  }
  isGameOver() { return this.pos.isEnd() || this.isDraw(); }

  // ----- Ekstra for varianter -----

  // Er partiet slut på grund af variantens egne regler? → { winner: "w"/"b"/null, reason }
  variantResult() {
    if (!this.pos.isVariantEnd()) return null;
    const outcome = this.pos.variantOutcome();
    const winner = outcome && outcome.winner ? colorLetter(outcome.winner) : null;
    const reasons = {
      kingofthehill: "– king reached the hill",
      threecheck: "– three checks",
      atomic: "– the king exploded",
      antichess: "– no pieces or moves left",
      horde: "– the horde was destroyed",
      racingkings: winner ? "– king reached the 8th rank" : "– both kings reached the 8th rank",
    };
    return { winner, reason: reasons[this.variant.id] || "by variant rules" };
  }

  // Crazyhouse: hvor mange brikker har hver spiller i lommen?
  pockets() {
    if (!this.pos.pockets) return null;
    const out = {};
    for (const color of ["white", "black"]) {
      out[colorLetter(color)] = {};
      for (const role of ["pawn", "knight", "bishop", "rook", "queen"]) out[colorLetter(color)][ROLE_LETTER[role]] = this.pos.pockets[color][role];
    }
    return out;
  }

  // Crazyhouse: felter hvor brikken må sættes ind
  dropSquares(letter) {
    if (!this.pos.pockets || this.pos.pockets[this.pos.turn][LETTER_ROLE[letter]] <= 0) return [];
    const squares = [];
    for (const n of this.pos.dropDests()) {
      // Bønder må ikke sættes på 1. og 8. række
      if (letter === "p" && (n < 8 || n >= 56)) continue;
      squares.push(sqName(n));
    }
    return squares;
  }

  // Three-check: hvor mange skak mangler hver spiller?
  checksLeft() {
    if (!this.pos.remainingChecks) return null;
    return { w: this.pos.remainingChecks.white, b: this.pos.remainingChecks.black };
  }

  countPosition() {
    const k = this.repetitionKey();
    this._seen[k] = (this._seen[k] || 0) + 1;
  }

  repetitionKey() {
    return this.fen().split(" ").slice(0, 4).join(" ");
  }
}

// Træk i "UCI"-form (fx e2e4, e7e8q, N@f3) – bruges til at sende træk online
function makeUciMove(move) {
  if (move.role && move.from === undefined) return ROLE_LETTER[move.role].toUpperCase() + "@" + sqName(move.to);
  return sqName(move.from) + sqName(move.to) + (move.promotion ? ROLE_LETTER[move.promotion] : "");
}

// Laver et spil: almindelig chess.js til standard, ellers VariantGame
function makeGame(variantId, fen) {
  if (!isVariant(variantId)) return fen ? new Chess(fen) : new Chess();
  return new VariantGame(fen, variantId);
}