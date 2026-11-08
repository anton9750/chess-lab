// Berømte partier til "Watch". Trækkene er kontrolleret med chess.js.
const FAMOUS_GAMES = [
 {
  "id": "opera",
  "title": "The Opera Game",
  "white": "Paul Morphy",
  "black": "Duke Karl / Count Isouard",
  "year": 1858,
  "event": "Paris (Opera house)",
  "result": "1-0",
  "story": "Played in a box at the Paris Opera during a performance. Morphy develops quickly, sacrifices material to open lines, and finishes with a beautiful queen sacrifice and rook mate.",
  "moves": "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#"
 },
 {
  "id": "immortal",
  "title": "The Immortal Game",
  "white": "Adolf Anderssen",
  "black": "Lionel Kieseritzky",
  "year": 1851,
  "event": "London",
  "result": "1-0",
  "story": "Anderssen gives up a bishop, both rooks and finally his queen – and then mates with his three remaining minor pieces. The most famous attacking game ever played.",
  "moves": "e4 e5 f4 exf4 Bc4 Qh4+ Kf1 b5 Bxb5 Nf6 Nf3 Qh6 d3 Nh5 Nh4 Qg5 Nf5 c6 g4 Nf6 Rg1 cxb5 h4 Qg6 h5 Qg5 Qf3 Ng8 Bxf4 Qf6 Nc3 Bc5 Nd5 Qxb2 Bd6 Bxg1 e5 Qxa1+ Ke2 Na6 Nxg7+ Kd8 Qf6+ Nxf6 Be7#"
 },
 {
  "id": "evergreen",
  "title": "The Evergreen Game",
  "white": "Adolf Anderssen",
  "black": "Jean Dufresne",
  "year": 1852,
  "event": "Berlin",
  "result": "1-0",
  "story": "An Evans Gambit full of sacrifices. Anderssen's queen sacrifice on d7 leads to a forced mate with bishops.",
  "moves": "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O d3 Qb3 Qf6 e5 Qg6 Re1 Nge7 Ba3 b5 Qxb5 Rb8 Qa4 Bb6 Nbd2 Bb7 Ne4 Qf5 Bxd3 Qh5 Nf6+ gxf6 exf6 Rg8 Rad1 Qxf3 Rxe7+ Nxe7 Qxd7+ Kxd7 Bf5+ Ke8 Bd7+ Kf8 Bxe7#"
 },
 {
  "id": "century",
  "title": "The Game of the Century",
  "white": "Donald Byrne",
  "black": "Bobby Fischer",
  "year": 1956,
  "event": "New York",
  "result": "0-1",
  "story": "13-year-old Bobby Fischer sacrifices his queen on move 17 and then hunts the white king with his minor pieces and rooks.",
  "moves": "Nf3 Nf6 c4 g6 Nc3 Bg7 d4 O-O Bf4 d5 Qb3 dxc4 Qxc4 c6 e4 Nbd7 Rd1 Nb6 Qc5 Bg4 Bg5 Na4 Qa3 Nxc3 bxc3 Nxe4 Bxe7 Qb6 Bc4 Nxc3 Bc5 Rfe8+ Kf1 Be6 Bxb6 Bxc4+ Kg1 Ne2+ Kf1 Nxd4+ Kg1 Ne2+ Kf1 Nc3+ Kg1 axb6 Qb4 Ra4 Qxb6 Nxd1 h3 Rxa2 Kh2 Nxf2 Re1 Rxe1 Qd8+ Bf8 Nxe1 Bd5 Nf3 Ne4 Qb8 b5 h4 h5 Ne5 Kg7 Kg1 Bc5+ Kf1 Ng3+ Ke1 Bb4+ Kd1 Bb3+ Kc1 Ne2+ Kb1 Nc3+ Kc1 Rc2#"
 },
 {
  "id": "kasparov-topalov",
  "title": "Kasparov's Immortal",
  "white": "Garry Kasparov",
  "black": "Veselin Topalov",
  "year": 1999,
  "event": "Wijk aan Zee",
  "result": "1-0",
  "story": "Kasparov sacrifices a rook on d4 and chases the black king all the way across the board to a1. Often called the best game of the 20th century.",
  "moves": "e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 c6 f3 b5 Nge2 Nbd7 Bh6 Bxh6 Qxh6 Bb7 a3 e5 O-O-O Qe7 Kb1 a6 Nc1 O-O-O Nb3 exd4 Rxd4 c5 Rd1 Nb6 g3 Kb8 Na5 Ba8 Bh3 d5 Qf4+ Ka7 Rhe1 d4 Nd5 Nbxd5 exd5 Qd6 Rxd4 cxd4 Re7+ Kb6 Qxd4+ Kxa5 b4+ Ka4 Qc3 Qxd5 Ra7 Bb7 Rxb7 Qc4 Qxf6 Kxa3 Qxa6+ Kxb4 c3+ Kxc3 Qa1+ Kd2 Qb2+ Kd1 Bf1 Rd2 Rd7 Rxd7 Bxc4 bxc4 Qxh8 Rd3 Qa8 c3 Qa4+ Ke1 f4 f5 Kc1 Rd2 Qa7"
 },
 {
  "id": "deepblue",
  "title": "Deep Blue vs Kasparov, Game 6",
  "white": "Deep Blue (computer)",
  "black": "Garry Kasparov",
  "year": 1997,
  "event": "New York (rematch)",
  "result": "1-0",
  "story": "The game where a computer beat the world champion in a match for the first time. Deep Blue sacrifices a knight on e6 and Kasparov resigns after just 19 moves.",
  "moves": "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Ng5 Ngf6 Bd3 e6 N1f3 h6 Nxe6 Qe7 O-O fxe6 Bg6+ Kd8 Bf4 b5 a4 Bb7 Re1 Nd5 Bg3 Kc8 axb5 cxb5 Qd3 Bc6 Bf5 exf5 Rxe7 Bxe7 c4"
 },
 {
  "id": "legal",
  "title": "Légal's Mate",
  "white": "Kermur de Légal",
  "black": "Saint Brie",
  "year": 1750,
  "event": "Paris",
  "result": "1-0",
  "story": "A classic trap: White 'blunders' the queen, but if Black takes it, three minor pieces give checkmate.",
  "moves": "e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#"
 },
 {
  "id": "fools",
  "title": "Fool's Mate",
  "white": "Beginner",
  "black": "Beginner",
  "year": 0,
  "event": "The fastest checkmate possible",
  "result": "0-1",
  "story": "The shortest possible game of chess. White weakens the king with f3 and g4, and Black mates on move 2.",
  "moves": "f3 e5 g4 Qh4#"
 }
];