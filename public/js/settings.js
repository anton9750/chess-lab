// ===================================================================
// settings.js – brugerens indstillinger (brættema, brikker, lyd osv.)
// Indstillingerne gemmes i browseren (localStorage), så de huskes
// næste gang siden åbnes.
// ===================================================================

// Brætfarver man kan vælge imellem i indstillingerne.
const BOARD_THEMES = {
  green:  { name: "Green",   light: "#ebecd0", dark: "#739552" },
  brown:  { name: "Brown",   light: "#f0d9b5", dark: "#b58863" },
  blue:   { name: "Blue",    light: "#dee3e6", dark: "#8ca2ad" },
  icy:    { name: "Icy Sea", light: "#d5e3ea", dark: "#6f97ad" },
  purple: { name: "Purple",  light: "#e8e0f1", dark: "#8877b7" },
  gray:   { name: "Gray",    light: "#e0e0e0", dark: "#9e9e9e" },
};

// Accentfarver til hele siden (knapper, logo, markeringer). Vælges i indstillingerne.
// base = hovedfarve, hover = lysere ved mus over, shadow = mørk "kant" under knapper,
// bg = mørk baggrund for valgte felter, mid/text/pale = mellem-, tekst- og lys nuance.
const ACCENT_THEMES = {
  green:  { name: "Green",  base: "#81b64c", hover: "#a3d160", shadow: "#45753c", bg: "#3d4a32", mid: "#5d8f3c", text: "#9ccf6a", pale: "#e9f5dc" },
  red:    { name: "Red",    base: "#d9534f", hover: "#e77471", shadow: "#8f2f2c", bg: "#4a2f2e", mid: "#b8433f", text: "#f08a86", pale: "#fbe6e5" },
  blue:   { name: "Blue",   base: "#4c9dd9", hover: "#74b6e8", shadow: "#2a6494", bg: "#2f3f4d", mid: "#3b82bd", text: "#8cc3ee", pale: "#e3f0fa" },
  purple: { name: "Purple", base: "#9b6bd6", hover: "#b38ae6", shadow: "#62409a", bg: "#3d2f4d", mid: "#8250c0", text: "#c3a3ee", pale: "#efe6fa" },
  orange: { name: "Orange", base: "#e4873e", hover: "#f0a263", shadow: "#9a5522", bg: "#4d3b2c", mid: "#c9722f", text: "#f4b27e", pale: "#fbeadb" },
  pink:   { name: "Pink",   base: "#e0629a", hover: "#ec84b3", shadow: "#99386a", bg: "#4d2f3e", mid: "#c84d85", text: "#f2a1c5", pale: "#fbe4ef" },
  teal:   { name: "Teal",   base: "#2fb5a8", hover: "#58cbbf", shadow: "#1b7a71", bg: "#2b4543", mid: "#27998e", text: "#7fded4", pale: "#dff6f3" },
  gold:   { name: "Gold",   base: "#d9a82b", hover: "#e8bf55", shadow: "#8f6c12", bg: "#4a4128", mid: "#bb9020", text: "#f0cd72", pale: "#faf0d4" },
};

// Brik-sæt (mapperne ligger i img/pieces/).
const PIECE_SETS = {
  cburnett: "Classic",
  merida: "Merida",
  maestro: "Maestro",
};

// Standardindstillinger, hvis brugeren ikke har gemt noget endnu.
const DEFAULT_SETTINGS = {
  boardTheme: "green",
  accent: "green",      // farve på knapper, logo osv. (se ACCENT_THEMES)
  pieceSet: "cburnett",
  showCoords: true,     // vis a–h og 1–8 på brættet
  showHints: true,      // vis prikker for lovlige træk
  highlightLast: true,  // markér sidste træk med gult
  sounds: true,         // lyd når der trækkes
  autoQueen: false,     // bonden bliver altid til dronning
  figurine: true,       // vis små brikker i træklisten i stedet for bogstaver
  sidebarCollapsed: false,
  moveMethod: "both",   // "both" (træk og klik), "drag" (kun træk) eller "click" (kun klik)
  animSpeed: "normal",  // "none", "fast", "normal" eller "slow"
  premoves: true,       // må man lave sit næste træk, mens modstanderen tænker?
  siteTheme: "dark",    // "dark" eller "light"
  evalBar: true,        // vis evalueringsbjælken i bot- og coach-partier
};

const SETTINGS_KEY = "chessplace-settings";

// Indlæser gemte indstillinger. try/catch fordi localStorage kan være
// slået fra (fx i privat vindue) – så bruger vi bare standarderne.
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch (error) {
    return { ...DEFAULT_SETTINGS };
  }
}

// Gemmer indstillingerne.
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    // Kan ikke gemme – det er ikke så slemt, indstillingerne virker stadig nu.
  }
}

// De aktive indstillinger. Bruges af alle de andre filer.
const settings = loadSettings();

// Giver stien til billedet af en brik, fx "img/pieces/cburnett/wK.svg".
function pieceUrl(color, type) {
  return `img/pieces/${settings.pieceSet}/${color}${type.toUpperCase()}.svg`;
}

// Sætter brættets farver som CSS-variabler, så CSS'en kan bruge dem.
function applyBoardTheme() {
  document.body.classList.toggle("theme-light", settings.siteTheme === "light");
  const theme = BOARD_THEMES[settings.boardTheme] || BOARD_THEMES.green;
  document.documentElement.style.setProperty("--light-square", theme.light);
  document.documentElement.style.setProperty("--dark-square", theme.dark);

  // Accentfarven: overskriver CSS-variablerne, så hele siden skifter farve
  const a = ACCENT_THEMES[settings.accent] || ACCENT_THEMES.green;
  const root = document.documentElement.style;
  root.setProperty("--green", a.base);
  root.setProperty("--green-hover", a.hover);
  root.setProperty("--green-shadow", a.shadow);
  root.setProperty("--accent-bg", a.bg);
  root.setProperty("--accent-mid", a.mid);
  root.setProperty("--accent-text", a.text);
  root.setProperty("--accent-pale", a.pale);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", settings.siteTheme === "light" ? "#ffffff" : "#262522");
}