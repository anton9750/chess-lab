# Chesshub

Skakside med bots, puzzles, varianter, Game Review, turneringer m.m. — vanilla JS bygget med **Vite** og klar til **GitHub Pages**.

## Kør lokalt

```bash
npm install
npm run dev        # åbner http://localhost:5173
```

`npm run dev` og `npm run build` kører først `npm run assets`, som:

- bygger `public/lib/chessops.js` fra npm-pakken `chessops` (`chess.js` 1.4.0 ligger allerede i `public/lib/`)
- kopierer Stockfish fra npm-pakken `stockfish` til `public/lib/`
- henter brik-sættene (cburnett, merida, maestro) fra Lichess' repo. Er du offline, laves simple reserve-brikker.

## Skift farve (grøn → rød → blå …)

**Settings → Accent color**: Green, Red, Blue, Purple, Orange, Pink, Teal og Gold. Valget gemmes i browseren. Farverne defineres i `ACCENT_THEMES` i `public/js/settings.js`, og de styrer CSS-variablerne `--green`, `--green-hover`, `--green-shadow`, `--accent-*`. Tilføj en ny farve ved at tilføje en linje dér.

## Udgiv på GitHub Pages

1. Læg projektet i et GitHub-repo (branch `main`).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push. `.github/workflows/deploy.yml` bygger og udgiver siden.

## Hvad er anderledes end Netlify-versionen

- **Ingen service worker.**
- **Ingen server** (`/api/...`). `public/config.js` har `api: false`, så konti, ratings og partier gemmes kun i browseren (localStorage). Online-spil og Daily Chess via serveren virker derfor ikke. PeerJS' P2P-del kan stadig virke.
- **Ingen invitationslås** (`open: true` i `public/config.js`).
- **Fairy-Stockfish** (varianter) kræver særlige headers, som GitHub Pages ikke kan sende. Varianterne bruger derfor den indbyggede lille motor i `bots.js`.
- Scripts i `public/js/` er almindelige globale scripts (ikke ES-moduler), præcis som før.

## Mapper

```
index.html          siden
src/style.css       al styling (bundles af Vite)
public/js/          al spil-logik
public/config.js    åben side / server til-fra
public/lib/         peerjs + (genererede) chess.js, chessops.js, Stockfish
public/img/         ikon + brik-sæt
scripts/            assets-scripts
```
