// ===================================================================
// board3d.js – "3D Mode": brættet tegnet som en fotorealistisk 3D-scene
// med Three.js i stedet for flade felter. Bruger Poly Havens "Chess Set"
// (public/textures/.../chess_set_4k.gltf) til bræt og brikker.
//
// Denne klasse efterligner den del af BoardView's udadvendte "API", som
// resten af programmet rent faktisk bruger (draw, showHint, onMove, ...),
// så den kan sættes ind i stedet for det almindelige bræt uden at røre
// main.js/review.js/puzzles.js osv. Se main.js, hvor de to brætter pakkes
// ind i en lille "facade", der sender kald videre til det, der er aktivt.
//
// Det eneste, der er droppet i 3D (besluttet undervejs):
//  - pile og røde markeringer (højreklik+træk bruges nu til at dreje kameraet)
//  - farvede felter for træk-kvalitet (grøn/blå/rød) – kun i 2D indtil videre
//  - stjerner/badges fra lektioner og Game Review
//  - crazyhouse (brikker fra "lommen") – falder automatisk tilbage til 2D
//  - at trække brikken med musen (kun klik-klik for at flytte i 3D)
// ===================================================================

const FILES_3D = ["a", "b", "c", "d", "e", "f", "g", "h"];
const GLTF_PATH = "models/chess_set/chess_set_4k.gltf";
const TABLE_GLTF_PATH = "table/chinese_tea_table_4k.gltf/chinese_tea_table_4k.gltf";
// Panoramabillede af et rum (Poly Havens "Solitude Interior" HDRI, forhåndskonverteret til en
// almindelig PNG i scripts/convert-exr.mjs) – bruges som baggrund, man kan dreje rundt om, og
// som lyskilde/refleksion, så brikkerne ikke bare svæver i et sort tomrum.
const ENV_PATH = "env/interior_2k.png";
// Anden "scene" (nextScene): en skyet himmel (Poly Havens "Kloofendal 48d Partly Cloudy Puresky"
// HDRI, samme forhåndskonvertering) uden bord – brættet svæver i luften i stedet for at stå på noget.
const ENV_SKY_PATH = "env/sky_2k.png";
// Springerne er modelleret i profil i stedet for mod modstanderen – dette er bedste bud på
// hvor meget (og hvilken vej) de skal drejes. Hvis det stadig er forkert: prøv -KNIGHT_FACING_WHITE
// i stedet for KNIGHT_FACING_WHITE i makePieceMesh(), eller juster selve vinklen her.
const KNIGHT_FACING_WHITE = Math.PI;
// Bordet (Poly Havens "Chinese Tea Table") står nu kvadratisk/akse-ret (se loadAssets), men
// selve brætmodellen er modelleret med hjørnet fremad ("diamant") – drej hele bræt+felter+brikker
// 45° om Y, så brættets sider flugter med bordets, i stedet for at stå på skrå oven på det.
const BOARD_YAW = Math.PI / 4;
// Scenen uden bord ("himmel"): brættet svæver denne højde over, hvor gulvet ville have været,
// i stedet for at stå på et usynligt gulv midt i den åbne himmel.
const FLOAT_HEIGHT = 0.3;
function rotateXZ(x, z, angle = BOARD_YAW) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return { x: x * cos - z * sin, z: x * sin + z * cos };
}

class Board3D {
  constructor(wrapEl) {
    this.wrapEl = wrapEl;
    this.opts = null;
    this.selected = null;
    this.hint = null;
    this.lastMoveWasDrag = false; // 3D har ingen træk-med-musen, så denne er altid false ("alt glider")
    this.moveQuality = {};        // ikke brugt i 3D endnu, men skal kunne sættes uden at fejle
    this.dropPiece = null;
    this.promoEl = null;
    this.ready = false;

    this.onMove = null;
    this.onBoardTouch = null;
    this.onPremove = null;
    this.onPremoveCancel = null;
    this.onDrop = null;

    this.squareSize = 0.058; // overskrives, når modellen er loadet
    this.pieceY = 0.017;
    this.tableTopY = 0; // overskrives med bordpladens højde, når bordet er loadet
    this.pieceMeshes = {};   // felt → THREE.Object3D (den brik, der står der lige nu)
    this.squareNodes = [];   // 64 usynlige felter til klik + fremhævning (fast position, index = row*8+col)
    this.lastFlipped = null;

    this.hasTable = true; // skiftes med sceneBtn (nextScene) – anden "scene" er bare bræt+brikker uden bord

    this.canvas = document.createElement("canvas");
    this.canvas.className = "board3d-canvas hidden";
    wrapEl.appendChild(this.canvas);

    // Pil i hjørnet af 3D-scenen: skifter til næste "scene" (lige nu: med bord ↔ kun bræt og brikker).
    this.sceneBtn = document.createElement("button");
    this.sceneBtn.className = "board3d-scene-toggle hidden";
    this.sceneBtn.type = "button";
    this.sceneBtn.title = "Next scene";
    this.sceneBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    this.sceneBtn.addEventListener("click", () => this.nextScene());
    wrapEl.appendChild(this.sceneBtn);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b1814); // midlertidig baggrund, til panoramaet (loadEnvironment) er klar

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 10);
    this.target = new THREE.Vector3(0, 0, 0); // sættes præcist, når brættets højde kendes
    this.azimuth = 0;     // 0 = kigger mod sort (hvid sidder nederst, "ikke vendt")
    this.polar = 1.0;     // radianer fra lodret – klemmes mellem SET og flyttes med musen
    this.radius = 0.62;
    this.pointers = new Map(); // aktive pointer-id'er (til to-finger-drej på touch)
    this.rightDragging = false;

    this.buildLighting();
    this.buildGroundShadow();
    this.buildSquareGrid();
    this.attachPointerHandlers();
    this.updateCameraFromOrbit();

    this.loadPromise = this.loadAssets().then(() => { this.ready = true; if (this.opts) this.render(); });

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(wrapEl);
    this.resize();

    const tick = () => { this.renderer.render(this.scene, this.camera); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  show() { this.canvas.classList.remove("hidden"); this.sceneBtn.classList.remove("hidden"); this.resize(); }
  hide() { this.canvas.classList.add("hidden"); this.sceneBtn.classList.add("hidden"); }

  resize() {
    const rect = this.wrapEl.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ----- Opsætning af scenen -----

  buildLighting() {
    this.scene.add(new THREE.HemisphereLight(0xfff3e0, 0x1a1512, 0.65));
    const key = new THREE.DirectionalLight(0xfff0dd, 2.2);
    key.position.set(0.6, 1.1, 0.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 3;
    // Bred nok til at dække både brættet/bordpladen OG bordets ben helt ned til gulvet
    // (target sættes midt mellem gulv og bordplade i loadAssets, når bordets højde er kendt).
    key.shadow.camera.left = -0.8;
    key.shadow.camera.right = 0.8;
    key.shadow.camera.top = 0.8;
    key.shadow.camera.bottom = -0.8;
    key.shadow.bias = -0.0008;
    this.scene.add(key);
    this.scene.add(key.target);
    this.keyLight = key;
    const fill = new THREE.DirectionalLight(0xdfeaff, 0.5);
    fill.position.set(-0.8, 0.5, -0.6);
    this.scene.add(fill);

    // Simpelt "studie"-miljø som midlertidig belysning, så de ikke-metalliske PBR-materialer
    // ikke ser flade ud, før det rigtige panorama (loadEnvironment) er færdigindlæst.
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new THREE.Scene(), 0.04).texture;
  }

  // Panoramabilleder som baggrund (man kan dreje kameraet rundt og se hele vejen rundt) og som
  // miljøbelysning/refleksion, så brikkerne og bordet ikke bare står i et tomt rum. Begge scenens
  // panoramaer loades her, så der ikke er en indlæsningspause, når man skifter scene med pilen.
  async loadEnvironment() {
    const loadPano = async (path) => {
      const texture = await new THREE.TextureLoader().loadAsync(path);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };
    const [roomTexture, skyTexture] = await Promise.all([loadPano(ENV_PATH), loadPano(ENV_SKY_PATH)]);
    this.envRoom = { background: roomTexture, environment: this.pmrem.fromEquirectangular(roomTexture).texture };
    this.envSky = { background: skyTexture, environment: this.pmrem.fromEquirectangular(skyTexture).texture };
    this.applyEnvironment();
  }

  applyEnvironment() {
    const env = this.hasTable ? this.envRoom : this.envSky;
    if (!env) return;
    this.scene.background = env.background;
    this.scene.environment = env.environment;
  }

  // Intet synligt lokalt gulv-mesh: enhver farvet plade (ensfarvet eller blødt udtonet) så forkert
  // ud, fordi den aldrig rigtig matcher stengulvet i panoramabaggrunden (loadEnvironment). I stedet
  // er der en helt usynlig "skyggeopsamler" (buildGroundShadow), så det, der står på gulvet, får et
  // kontaktpunkt uden at der ses nogen form/farve.
  // Usynlig plade, kun lige stor nok til det, der står på gulvet lige nu (bordets fodaftryk, eller
  // brættet selv i "kun bræt og brikker"-scenen – se setGroundShadowFootprint/nextScene), der tager
  // imod kontaktskyggen (uden den ses selv slet ikke noget sted, ingenting dækker).
  buildGroundShadow() {
    const geo = new THREE.CircleGeometry(0.4, 48);
    const mat = new THREE.ShadowMaterial({ opacity: 0.45 });
    this.groundShadow = new THREE.Mesh(geo, mat);
    this.groundShadow.rotation.x = -Math.PI / 2;
    this.groundShadow.position.y = 0.0005;
    this.groundShadow.receiveShadow = true;
    this.scene.add(this.groundShadow);
  }

  setGroundShadowFootprint(bounds) {
    const radius = Math.max(
      bounds.max.x - bounds.min.x,
      bounds.max.z - bounds.min.z
    ) * 0.5 + 0.03;
    this.groundShadow.geometry.dispose();
    this.groundShadow.geometry = new THREE.CircleGeometry(radius, 48);
  }

  // 64 usynlige, flade felter: bruges både til at finde ud af, hvad man klikker på,
  // og til at tegne den beige markering for lovlige træk.
  buildSquareGrid() {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.squareGroup = new THREE.Group();
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xe8dcb0, transparent: true, opacity: 0 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.userData.row = row;
        mesh.userData.col = col;
        this.squareGroup.add(mesh);
        this.squareNodes[row * 8 + col] = mesh;
      }
    }
    this.scene.add(this.squareGroup);
  }

  async loadAssets() {
    const loader = new THREE.GLTFLoader();
    const [gltf, tableGltf] = await Promise.all([
      loader.loadAsync(GLTF_PATH),
      loader.loadAsync(TABLE_GLTF_PATH),
      this.loadEnvironment(),
    ]);

    // Bordet (Poly Havens "Chinese Tea Table") har sin egen oprindelse centreret i X/Z,
    // ligesom brættet, med benene stående på gulvet ved y=0 – så det passer til den
    // eksisterende gulv-cirkel uden at skulle flyttes. Brættets og brikkernes y-positioner
    // løftes bagefter op med bordpladens højde, så brættet står oven på bordet.
    const tableRoot = tableGltf.scene;
    // Bordets model er modelleret med hjørnet fremad ("diamant"); drej det 45°, så siderne
    // flugter med brættets rækker/linjer i stedet for at stå på skrå.
    tableRoot.rotation.y = Math.PI / 4;
    tableRoot.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(tableRoot);
    this.tableRoot = tableRoot;
    this.tableBounds = new THREE.Box3().setFromObject(tableRoot);
    this.fullTableTopY = this.tableBounds.max.y;
    this.tableTopY = this.fullTableTopY;
    this.setGroundShadowFootprint(this.tableBounds);

    const pawns = [];
    const knights = { white: [], black: [] }; // springerne er to forskellige (spejlvendte) modeller, ikke den samme genbrugt
    this.pieceSource = {}; // "white_pawn" → det originale Object3D (Mesh ELLER en Group med flere dele, fx løberen)
    let boardMesh = null;

    // NB: løberne har to geometri-dele (selve figuren + hakket/kuglen øverst), så gLTF-loaderen
    // bygger dem som en Group af to Mesh'er i stedet for én enkelt Mesh – derfor tjekkes navnet
    // på alle objekter (ikke kun .isMesh), og hele under-træet klones senere i stedet for bare
    // geometri+materiale fra ét enkelt mesh.
    gltf.scene.traverse((obj) => {
      const name = obj.name || "";
      if (name === "board" && obj.isMesh) { boardMesh = obj; return; }
      const m = name.match(/^piece_(pawn|knight|bishop|rook|queen|king)_(white|black)/);
      if (!m) return;
      if (m[1] === "knight") { knights[m[2]].push(obj); if (obj.position) this.pieceY = obj.position.y; return; }
      const key = `${m[2]}_${m[1]}`;
      if (!this.pieceSource[key]) this.pieceSource[key] = obj;
      if (m[1] === "pawn") pawns.push(obj);
      if (obj.position) this.pieceY = obj.position.y;
    });

    // Springerne vender forskellig vej afhængig af hvilken side af brættet de står på
    // (dronningens/kongens side) – gem begge modeller, og vælg den rigtige ud fra,
    // hvilken side af midten den aktuelle brik står på, når den tegnes.
    ["white", "black"].forEach((color) => {
      const list = knights[color].sort((a, b) => a.position.x - b.position.x);
      if (list.length) {
        this.pieceSource[`${color}_knight_left`] = list[0];
        this.pieceSource[`${color}_knight_right`] = list[list.length - 1];
      }
    });

    // Feltstørrelsen regnes ud fra afstanden mellem to bønder på samme række i den originale opstilling
    if (pawns.length >= 2) {
      const xs = [...new Set(pawns.map((p) => Math.round(p.position.x * 1e6) / 1e6))].sort((a, b) => b - a);
      if (xs.length >= 2) this.squareSize = xs[0] - xs[1];
    }

    if (boardMesh) {
      const board = new THREE.Mesh(boardMesh.geometry, boardMesh.material);
      board.position.copy(boardMesh.position);
      this.boardBaseY = boardMesh.position.y; // gemmes, så applyTableTopY kan lægge bordets højde oveni (eller lade være)
      board.position.y += this.tableTopY;
      board.quaternion.copy(boardMesh.quaternion);
      board.rotateY(BOARD_YAW);
      board.scale.copy(boardMesh.scale);
      board.castShadow = true;
      board.receiveShadow = true;
      this.scene.add(board);
      this.boardObj = board;
      // Brættets eget fodaftryk (til skyggeopsamleren, når bordet er fjernet – se nextScene)
      this.boardBounds = new THREE.Box3().setFromObject(board);
    }

    // Felterne (klik + markering) placeres nu, hvor vi kender den rigtige feltstørrelse
    this.squareNodes.forEach((mesh) => {
      const { row, col } = mesh.userData;
      mesh.scale.set(this.squareSize * 0.96, this.squareSize * 0.96, 1);
      const { x, z } = rotateXZ((col - 3.5) * this.squareSize, (row - 3.5) * this.squareSize);
      mesh.position.set(x, 0, z); // y sættes af applyTableTopY
      mesh.rotateZ(BOARD_YAW); // følger brættets drejning, så den beige markering flugter med feltet
    });
    // To faste kamera-afstande: tættere på i himmel-scenen (nextScene, ingen bord), så man
    // ikke kan se, at brættet bare svæver frit i kanten af billedet uden noget under sig.
    this.tableRadius = this.squareSize * 10.5;
    this.skyRadius = this.squareSize * 8.6625;
    this.radius = this.tableRadius;
    this.applyTableTopY(this.tableTopY);
  }

  // Flytter bræt, felter, kamera-mål og lysets skygge-sigte op/ned til den rigtige højde, og
  // tilpasser skyggeopsamlerens størrelse til det, der nu rent faktisk står på gulvet – brugt
  // både ved første indlæsning og når nextScene() slår bordet til/fra.
  applyTableTopY(topY) {
    this.tableTopY = topY;
    if (this.boardObj) this.boardObj.position.y = this.boardBaseY + topY;
    this.squareNodes.forEach((mesh) => { mesh.position.y = topY + this.pieceY + 0.0006; });
    this.target.set(0, topY + this.pieceY, 0);
    this.radius = this.hasTable ? this.tableRadius : this.skyRadius;
    this.updateCameraFromOrbit();
    if (this.keyLight) {
      // Sigt midt på brættet/brikkerne, så skyggens kasse (sat i buildLighting) rammer dem rigtigt
      // uanset scene – der er intet gulv at dække i himmel-scenen, kun selve brættet.
      this.keyLight.target.position.set(0, topY + this.pieceY * 0.5, 0);
      this.keyLight.target.updateMatrixWorld();
    }
    if (this.groundShadow) {
      // Kun med bord er der noget (bordets ben) at tage imod en kontaktskygge for – i himmel-scenen
      // svæver brættet frit i den åbne luft uden noget gulv under sig.
      this.groundShadow.visible = this.hasTable;
      if (this.hasTable && this.tableBounds) this.setGroundShadowFootprint(this.tableBounds);
    }
    if (this.ready && this.opts) this.render();
  }

  // Pilen i hjørnet: skifter mellem "bord + bræt" (i stuen) og "kun bræt og brikker, svævende" (i
  // den skyede himmel).
  nextScene() {
    this.hasTable = !this.hasTable;
    if (this.tableRoot) this.tableRoot.visible = this.hasTable;
    this.applyEnvironment();
    this.applyTableTopY(this.hasTable ? this.fullTableTopY : FLOAT_HEIGHT);
  }

  // ----- Brikker -----

  pieceKey(piece, worldX) {
    const color = piece.color === "w" ? "white" : "black";
    if (piece.type === "n") return `${color}_knight_${worldX < 0 ? "left" : "right"}`;
    return `${color}_${PIECE_NAME_3D[piece.type]}`;
  }

  makePieceMesh(piece, worldX) {
    const source = this.pieceSource[this.pieceKey(piece, worldX)];
    if (!source) return null;
    // Klon hele under-træet (deler stadig geometri/materiale, så det er billigt) – dækker
    // både almindelige et-dels-brikker og løberens to-dels Group på samme måde.
    const obj = source.clone(true);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // Springerne er modelleret i profil (vender ud ad filen), ikke mod modstanderen hen over
    // brættet – drej dem, så hovedet/ansigtet vender mod den anden side.
    if (piece.type === "n") obj.rotateY(piece.color === "w" ? KNIGHT_FACING_WHITE : -KNIGHT_FACING_WHITE);
    // Følg brættets 45°-drejning (BOARD_YAW), ellers vender brikkerne (mest mærkbart springerne) forkert vej.
    obj.rotateY(BOARD_YAW);
    return obj;
  }

  rowColOf(square, flipped) {
    const fileIndex = FILES_3D.indexOf(square[0]);
    const rank = Number(square[1]);
    return {
      col: flipped ? 7 - fileIndex : fileIndex,
      row: flipped ? rank - 1 : 8 - rank,
    };
  }

  squareAt(row, col, flipped) {
    const fileIndex = flipped ? 7 - col : col;
    const rank = flipped ? row + 1 : 8 - row;
    return FILES_3D[fileIndex] + rank;
  }

  worldPosOf(square, flipped) {
    const { row, col } = this.rowColOf(square, flipped);
    const { x, z } = rotateXZ((col - 3.5) * this.squareSize, (row - 3.5) * this.squareSize);
    return new THREE.Vector3(x, this.tableTopY + this.pieceY, z);
  }

  // ----- Tegning (samme kald som BoardView.draw) -----

  draw(opts) {
    this.opts = opts;
    if (!opts.interactive) { this.selected = null; this.closePromotion(); }
    if (this.lastFlipped !== null && this.lastFlipped !== opts.flipped) {
      this.azimuth = opts.flipped ? Math.PI : 0;
      this.updateCameraFromOrbit();
    }
    this.lastFlipped = opts.flipped;
    this.show();
    if (this.ready) this.render();
  }

  render() {
    const { chess, flipped } = this.opts;
    const animate = this.opts.animate;
    this.opts.animate = null;

    // Fjern alle brikker og byg dem op igen ud fra stillingen lige nu
    Object.values(this.pieceMeshes).forEach((mesh) => this.scene.remove(mesh));
    this.pieceMeshes = {};
    chess.board().forEach((row) => row.forEach((piece) => {
      if (!piece) return;
      const pos = this.worldPosOf(piece.square, flipped);
      // Dronningens/kongens side afgøres ud fra den uroterede (bræt-lokale) x – ikke den endelige,
      // drejede verdens-x (BOARD_YAW blander x/z), ellers vælges forkert springer-model.
      const { col } = this.rowColOf(piece.square, flipped);
      const mesh = this.makePieceMesh(piece, (col - 3.5) * this.squareSize);
      if (!mesh) return;
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.pieceMeshes[piece.square] = mesh;
    }));

    this.drawHighlights();
    if (animate) this.animateSlide(animate.from, animate.to, flipped);
  }

  // Beige markering på de felter, en valgt brik lovligt kan flytte til
  drawHighlights() {
    const targets = this.selected ? this.legalMovesFrom(this.selected) : [];
    const targetSquares = new Set(targets.map((m) => m.to));
    this.squareNodes.forEach((mesh) => {
      const square = this.squareAt(mesh.userData.row, mesh.userData.col, this.opts.flipped);
      const isSelected = square === this.selected;
      const isHint = this.hint && (this.hint.from === square || this.hint.to === square);
      if (targetSquares.has(square) || isSelected || isHint) {
        mesh.material.opacity = isSelected ? 0.55 : 0.4;
        mesh.material.color.set(isSelected ? 0xf3e3a0 : 0xe8dcb0);
      } else {
        mesh.material.opacity = 0;
      }
    });
  }

  // Brikken, der nu står på "to", glider ind fra "from"s position (ligesom BoardView.animatePiece)
  animateSlide(from, to, flipped) {
    const speed = { none: 0, fast: 180, normal: 320, slow: 520 }[settings.animSpeed] ?? 320;
    const mesh = this.pieceMeshes[to];
    if (!mesh || !speed) return;
    const start = this.worldPosOf(from, flipped);
    const end = mesh.position.clone();
    const startTime = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const t = Math.min(1, (now - startTime) / speed);
      mesh.position.lerpVectors(start, end, ease(t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ----- Spillelogik (klik for at vælge/flytte – samme regler som BoardView) -----

  legalMovesFrom(square) {
    if (this.isPremoveTime()) {
      const fen = this.opts.chess.fen().split(" ");
      fen[1] = this.opts.movableColor;
      fen[3] = "-";
      return new Chess(fen.join(" "), { skipValidation: true }).moves({ square, verbose: true });
    }
    return this.opts.chess.moves({ square, verbose: true });
  }

  isPremoveTime() {
    return !!(this.opts.premove && this.opts.chess.turn() !== this.opts.movableColor);
  }

  isLegalTarget(from, to) {
    return this.legalMovesFrom(from).some((m) => m.to === to);
  }

  showHint(move) {
    this.hint = move;
    if (this.opts && this.ready) this.drawHighlights();
  }

  handleSquareClick(square) {
    if (this.promoEl) return;
    if (this.onBoardTouch && this.onBoardTouch()) return;
    if (!this.opts.interactive) return;

    const piece = this.opts.chess.get(square);

    if (this.selected && square !== this.selected && this.isLegalTarget(this.selected, square)) {
      this.attemptMove(this.selected, square);
      return;
    }
    if (piece && piece.color === this.opts.movableColor) {
      this.selected = this.selected === square ? null : square;
      this.drawHighlights();
      return;
    }
    this.selected = null;
    this.drawHighlights();
  }

  attemptMove(from, to) {
    if (this.isPremoveTime()) {
      this.selected = null;
      this.drawHighlights();
      if (this.onPremove) this.onPremove(from, to);
      return;
    }
    const moves = this.legalMovesFrom(from).filter((m) => m.to === to);
    this.selected = null;
    this.hint = null;
    this.drawHighlights();

    if (moves.some((m) => m.promotion)) {
      if (settings.autoQueen) this.onMove(from, to, "q");
      else this.showPromotion(from, to);
      return;
    }
    this.onMove(from, to);
  }

  showPromotion(from, to) {
    const color = this.opts.chess.turn();
    const pos = this.worldPosOf(to, this.opts.flipped).project(this.camera);
    const rect = this.wrapEl.getBoundingClientRect();
    const left = (pos.x * 0.5 + 0.5) * rect.width;
    const top = (-pos.y * 0.5 + 0.5) * rect.height;

    const picker = document.createElement("div");
    picker.className = "board3d-promo-picker";
    picker.style.left = left + "px";
    picker.style.top = top + "px";
    ["q", "n", "r", "b"].forEach((type) => {
      const option = document.createElement("button");
      option.className = "promo-option";
      option.style.backgroundImage = `url("${pieceUrl(color, type)}")`;
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closePromotion();
        this.onMove(from, to, type);
      });
      picker.appendChild(option);
    });
    const close = document.createElement("button");
    close.className = "promo-close";
    close.innerHTML = "&times;";
    close.addEventListener("click", (e) => { e.stopPropagation(); this.closePromotion(); this.render(); });
    picker.appendChild(close);

    this.wrapEl.appendChild(picker);
    this.promoEl = picker;
  }

  closePromotion() {
    if (this.promoEl) this.promoEl.remove();
    this.promoEl = null;
  }

  // ----- Kamera: højreklik+træk (eller to fingre) dreje 360 grader rundt om brættet -----

  updateCameraFromOrbit() {
    const x = this.radius * Math.sin(this.polar) * Math.sin(this.azimuth);
    const z = this.radius * Math.sin(this.polar) * Math.cos(this.azimuth);
    const y = this.radius * Math.cos(this.polar);
    this.camera.position.set(this.target.x + x, this.target.y + y, this.target.z + z);
    this.camera.lookAt(this.target);
  }

  orbitBy(dx, dy) {
    this.azimuth -= dx * 0.008;
    this.polar = Math.max(0.55, Math.min(1.45, this.polar - dy * 0.006));
    this.updateCameraFromOrbit();
  }

  squareFromPointer(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects(this.squareNodes, false)[0];
    if (!hit) return null;
    return this.squareAt(hit.object.userData.row, hit.object.userData.col, this.opts && this.opts.flipped);
  }

  attachPointerHandlers() {
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.canvas.addEventListener("pointerdown", (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (e.button === 2 || this.pointers.size === 2) {
        this.rightDragging = true;
        this.dragLast = this.averagePointer();
        return;
      }
      if (e.button === 0 && this.pointers.size === 1 && this.opts) {
        this.clickCandidate = { x: e.clientX, y: e.clientY };
      }
    });

    this.canvas.addEventListener("pointermove", (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.rightDragging) {
        const avg = this.averagePointer();
        this.orbitBy(avg.x - this.dragLast.x, avg.y - this.dragLast.y);
        this.dragLast = avg;
      }
    });

    const endPointer = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.rightDragging = false;
      if (this.clickCandidate && e.button !== 2) {
        const dist = Math.hypot(e.clientX - this.clickCandidate.x, e.clientY - this.clickCandidate.y);
        if (dist < 6 && this.opts) {
          const square = this.squareFromPointer(e.clientX, e.clientY);
          if (square) this.handleSquareClick(square);
        }
      }
      this.clickCandidate = null;
    };
    this.canvas.addEventListener("pointerup", endPointer);
    this.canvas.addEventListener("pointercancel", endPointer);

    // Zoom er bevidst slået fra: kameraets afstand er fast, så man ikke kan zoome ud og se,
    // at bordet ikke står helt rigtigt i forhold til panoramabaggrunden (loadEnvironment).
  }

  averagePointer() {
    const pts = [...this.pointers.values()];
    const x = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const y = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    return { x, y };
  }
}

const PIECE_NAME_3D = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
