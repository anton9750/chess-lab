// ===================================================================
// pages.js – sider uden skakbræt: News, Social (profil), More, Help,
// samt søgefeltet og vinduerne til Sign Up / Log In.
// ===================================================================

// ----- 1. News -----

const NEWS = [
  { title: "8 chess variants", tag: "New feature",
    text: "Chess960, King of the Hill, Three-check, Atomic, Antichess, Horde, Racing Kings and Crazyhouse! Pick one under Play → New Game → Variant. Play them online (each has its own rating), with friends or against the bots (powered by Fairy-Stockfish)." },
  { title: "Arena tournaments and clubs", tag: "Community",
    text: "Create or join a tournament under Play → Tournaments – you're paired automatically, and two wins in a row put you on fire 🔥 for double points. Start a club for your class under Social → Clubs." },
  { title: "Play Coach, Skills and a live eval bar", tag: "New feature",
    text: "Play → New Game → Play Coach: Coach Olive plays you at your level (New to Chess to Master), explains her moves and warns you about threats. Game Review now has a Next button for the key moments and Skill Points for good moves, and bot games show an evaluation bar." },
  { title: "Playing friends works on every network", tag: "Fix",
    text: "If your network blocks direct connections (school wifi, mobile data), Play a Friend now sends the moves through the Chesshub server instead." },
  { title: "Watch Chesshub games live", tag: "Watch",
    text: "Every rated game on Chesshub can be watched live under Watch → Chesshub – including your friends' games and tournament games." },
  { title: "5 million Lichess puzzles + opening explorer", tag: "Puzzles",
    text: "Puzzles now come straight from the Lichess database, matched to your rating. The analysis board has an opening explorer with moves from Chesshub players – connect a Lichess account to also see master games." },
  { title: "Install Chesshub as an app", tag: "New feature",
    text: "Put Chesshub on your phone's home screen or your desktop: More → Install the app." },
  { title: "Game Review is here", tag: "New feature",
    text: "Finished a game? Press Game Review and Coach Olive goes through every move with Stockfish. You get an accuracy score for both players, an evaluation graph and an explanation for every Brilliant move, Mistake and Blunder." },
  { title: "Play your friends online", tag: "New feature",
    text: "Create a game under Play a Friend, send the 6-letter code to a friend, and play with clocks, chat, draw offers and rematches. Moves go directly between your browsers – or through the Chesshub server if your network blocks that." },
  { title: "Puzzle Streak and 50 puzzle themes", tag: "Puzzles",
    text: "Train with 3,000 puzzles from the open Lichess puzzle database. Pick a theme like Forks or Mate in 2, or try Puzzle Streak: puzzles get harder and harder, and one mistake ends the run." },
  { title: "Meet the bots", tag: "Play",
    text: "Ten computer opponents from Pip (250) to Max (3000), each with their own personality. Turn on the Coach to get tips after every move while you play." },
  { title: "Watch live games", tag: "Watch",
    text: "Watch the best games being played right now on Lichess TV, or replay legendary games like the Opera Game, the Immortal Game and Kasparov's Immortal." },
  { title: "New lessons for beginners", tag: "Learn",
    text: "Learn how the pieces move by collecting stars, practice famous checkmate patterns, and learn to win basic endgames against Stockfish." },
];

const NewsPage = {
  open() {
    $("content-page").innerHTML = `
      <div class="content-wrap">
        <h1 class="content-title"><svg class="nav-icon icon-news"><use href="#i-news"/></svg>Chesshub News</h1>
        <p class="rv-muted">Updates and new features on Chesshub.</p>
        <div class="news-list">
          ${NEWS.map((n, i) => `
            <article class="news-card ${i === 0 ? "featured" : ""}">
              <span class="news-tag">${n.tag}</span>
              <h2>${n.title}</h2>
              <p>${n.text}</p>
            </article>`).join("")}
        </div>
      </div>`;
  },
};


// ----- 2. Social (profil og venner) -----

const SocialPage = {
  open() {
    // Husk hvad der står i tekstfelterne, så det ikke forsvinder når siden tegnes igen
    const keep = {};
    ["friend-add-name", "dm-input"].forEach((id) => {
      const el = $(id);
      if (el) keep[id] = { value: el.value, focused: document.activeElement === el };
    });

    const p = Accounts.profile();
    const loggedIn = Accounts.isLoggedIn();
    const total = p.stats.wins + p.stats.losses + p.stats.draws;
    const pct = (n) => (total ? (n / total) * 100 : 0);
    // [navn, værdi, ikon, css-klasse, kategori til rating-grafen]
    const ratings = [
      ["Rapid", p.ratings.rapid, "i-clock", "tc-rapid", "rapid"],
      ["Blitz", p.ratings.blitz, "i-bolt", "tc-blitz", "blitz"],
      ["Bullet", p.ratings.bullet, "i-bullet", "tc-bullet", "bullet"],
      ["Bots", p.ratings.bots, "i-robot", "", "bots"],
      ["Daily", p.ratings.daily || 1200, "i-sun", "tc-daily", "daily"],
      ["Puzzles", Puzzles.profile.rating, "i-puzzle", "icon-puzzle", "puzzles"],
      ["Puzzle Rush", Puzzles.profile.rushBest ? Math.max(...Object.values(Puzzles.profile.rushBest)) : 0, "i-bolt", "tc-bullet", null],
    ];
    // Varianter vises kun, når man har spillet dem
    VARIANTS.filter((v) => isVariant(v.id) && p.ratingGames && p.ratingGames[v.id] > 0)
      .forEach((v) => ratings.push([v.name, p.ratings[v.id], null, "", v.id, v.icon]));

    // Rating-grafen for den valgte kategori (klik på en rating-boks for at skifte)
    const cat = this.graphCat || "rapid";
    const catName = (ratings.find((r) => r[4] === cat) || ratings[0])[0];
    const points = Accounts.ratingHistory(cat);
    const fmt = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const graph = lineChartSVG(points.map((x) => x.r), {
      width: 760, height: 170,
      labels: points.length > 1 ? [fmt(points[0].t), fmt(points[points.length - 1].t)] : [],
      empty: cat === "puzzles" ? "Solve some rated puzzles to see your graph." : `Play some ${catName.toLowerCase()} games to see your rating graph.`,
    });
    const best = points.length ? Math.max(...points.map((x) => x.r)) : null;

    $("content-page").innerHTML = `
      <div class="content-wrap">
        ${loggedIn ? "" : `
          <div class="social-banner">
            <div><b>You are playing as a guest.</b><span>Create a free account to get your own profile, add friends and keep your games.</span></div>
            <button class="btn btn-green" data-auth="signup">Sign Up</button>
          </div>`}
        <div class="profile-head">
          ${userAvatarHTML(p.username, p.color, "huge")}
          <div>
            <h1>${escapeHTML(p.username)} ${flagHTML(p.country)}</h1>
            <span class="rv-muted">Joined ${formatDate(p.created)}</span>
            ${p.bio ? `<p class="profile-bio">${escapeHTML(p.bio)}</p>` : ""}
            ${loggedIn ? `<div class="presence ${Friends.status}">${presenceText()}</div>` : ""}
          </div>
          <button class="btn btn-gray btn-small profile-logout" data-more="insights">Insights</button>
          <button class="btn btn-gray btn-small" data-more="leaderboard">Leaderboard</button>
          <button class="btn btn-gray btn-small" data-more="account">Account settings</button>
          ${loggedIn ? '<button class="btn btn-gray btn-small" data-auth="logout">Log Out</button>' : ""}
        </div>

        <div class="rating-tiles">
          ${ratings.map(([name, value, icon, cls, key, emoji]) => key ? `
            <button class="rating-tile ${key === cat ? "selected" : ""}" data-graph-cat="${key}" title="Show ${name} rating graph">
              ${emoji ? `<span class="variant-tile-icon">${emoji}</span>` : `<svg class="${cls}"><use href="#${icon}"/></svg>`}<span>${name}</span><b>${value}</b></button>` : `
            <div class="rating-tile"><svg class="${cls}"><use href="#${icon}"/></svg><span>${name}</span><b>${value}</b></div>`).join("")}
        </div>

        <section class="social-card rating-graph-card">
          <div class="rating-graph-head">
            <h2>${catName} rating</h2>
            ${best !== null ? `<span class="rv-muted">Highest: <b>${best}</b></span>` : ""}
          </div>
          ${graph}
        </section>

        <div class="social-grid">
          <section class="social-card">
            ${Friends.chatWith ? chatHTML() : ""}
            <h2>Stats</h2>
            <div class="stat-bar">
              <span class="win" style="width:${pct(p.stats.wins)}%"></span>
              <span class="draw" style="width:${pct(p.stats.draws)}%"></span>
              <span class="loss" style="width:${pct(p.stats.losses)}%"></span>
            </div>
            <div class="stat-numbers">
              <span><b>${p.stats.wins}</b> Won</span><span><b>${p.stats.draws}</b> Drawn</span><span><b>${p.stats.losses}</b> Lost</span>
            </div>
            <h2>Achievements <span class="rv-muted">${Achievements.unlockedCount()} / ${ACHIEVEMENTS.length}</span></h2>
            ${Achievements.gridHTML()}
            <h2>Recent games</h2>
            ${gameListHTML(p.games.slice(0, 6))}
          </section>

          <section class="social-card">
            ${friendsHTML()}
          </section>
        </div>
      </div>`;

    // Gendan tekstfelterne
    Object.entries(keep).forEach(([id, k]) => {
      const el = $(id);
      if (!el) return;
      el.value = k.value;
      if (k.focused) el.focus();
    });
    const log = $("dm-log");
    if (log) log.scrollTop = log.scrollHeight;
  },
};

// Status-tekst: er jeg online for mine venner?
function presenceText() {
  switch (Friends.status) {
    case "online": return "● Online – friends can find you";
    case "connecting": return "Connecting to the friends network…";
    case "taken": return "Someone else is online with this username (maybe another tab?)";
    case "error": return "Offline – can't reach the friends network. Retrying…";
    default: return "Offline";
  }
}

// Venne-kortet på Social-siden
function friendsHTML() {
  if (!Accounts.isLoggedIn()) {
    return `<h2>Friends</h2><p class="rv-muted">Log in or sign up to add friends, chat and send challenges.</p>
      <button class="btn btn-green" data-auth="signup">Sign Up</button>`;
  }
  const list = Accounts.friendList();
  const incoming = list.filter((f) => f.status === "incoming");
  const outgoing = list.filter((f) => f.status === "outgoing");
  // Venner der er online vises først
  const friends = list.filter((f) => f.status === "friends")
    .sort((a, b) => Friends.isOnline(b.name) - Friends.isOnline(a.name) || a.name.localeCompare(b.name));
  const recent = (Accounts.profile().recent || []).filter((r) => !Accounts.getFriend(r.name)).slice(0, 5);

  const dot = (name) => `<span class="online-dot ${Friends.isOnline(name) ? "on" : ""}" title="${Friends.isOnline(name) ? "Online" : "Offline"}"></span>`;
  const unread = (name) => {
    const k = Friends.key(name);
    const n = Friends.unread[k] || (Accounts.online() && (Accounts.profile().unread || {})[k]);
    return n ? `<span class="nav-badge inline">${n}</span>` : "";
  };

  return `
    <h2>Friends <span class="rv-muted">${friends.length}</span></h2>
    ${isHosted() ? `<button class="btn btn-gray btn-small friend-link-btn" data-copy-friend-link>🔗 Copy my friend link</button>` : ""}
    <form class="friend-add" id="friend-add-form">
      <input class="friend-input" id="friend-add-name" placeholder="Add a friend by username" maxlength="20" autocomplete="off">
      <button class="btn btn-green btn-small">Add</button>
    </form>

    ${incoming.length ? `
      <div class="friend-section-title">Friend requests</div>
      ${incoming.map((f) => `
        <div class="friend-item request">
          ${userAvatarHTML(f.name, f.color)}
          <b>${escapeHTML(f.name)}</b>
          <button class="btn btn-green btn-small" data-friend-accept="${escapeHTML(f.name)}">Accept</button>
          <button class="btn btn-gray btn-small" data-friend-decline="${escapeHTML(f.name)}">Decline</button>
        </div>`).join("")}` : ""}

    <div class="friend-list">
      ${friends.length ? friends.map((f) => `
        <div class="friend-item">
          <div class="friend-avatar">${userAvatarHTML(f.name, f.color)}${dot(f.name)}</div>
          <div class="friend-name">
            <b>${escapeHTML(f.name)}</b>
            <span>${Friends.isOnline(f.name) ? "Online" : f.lastSeen ? "Last seen " + formatDate(f.lastSeen) : "Offline"}${f.ratings ? " · Rapid " + f.ratings.rapid : ""}</span>
          </div>
          <button class="icon-btn" data-dm="${escapeHTML(f.name)}" title="Message">💬${unread(f.name)}</button>
          <button class="btn btn-green btn-small" data-challenge="${escapeHTML(f.name)}">Challenge</button>
          <button class="icon-x" data-unfriend="${escapeHTML(f.name)}" title="Remove friend">×</button>
        </div>`).join("") : '<p class="rv-muted">No friends yet. Add someone by their username!</p>'}
    </div>

    ${outgoing.length ? `
      <div class="friend-section-title">Sent requests</div>
      ${outgoing.map((f) => `
        <div class="friend-item muted">
          ${userAvatarHTML(f.name, f.color)}
          <b>${escapeHTML(f.name)}</b>
          <span class="rv-muted">Waiting…</span>
          <button class="icon-x" data-unfriend="${escapeHTML(f.name)}" title="Cancel">×</button>
        </div>`).join("")}` : ""}

    ${recent.length ? `
      <div class="friend-section-title">Recent opponents</div>
      ${recent.map((r) => `
        <div class="friend-item">
          ${userAvatarHTML(r.name, r.color)}
          <b>${escapeHTML(r.name)}</b>
          <button class="btn btn-gray btn-small" data-add-friend="${escapeHTML(r.name)}">Add friend</button>
        </div>`).join("")}` : ""}

    <p class="rv-muted small-note">${Accounts.online() ? "Friend requests and messages are saved on the server, so friends get them even when they're offline. The green dot means a friend has Chesshub open right now." : "Friends can see you while you have Chesshub open. Requests and messages are delivered when your friend is online."}</p>`;
}

// Chat med en ven
function chatHTML() {
  const key = Friends.chatWith;
  const friend = Accounts.getFriend(key);
  if (!friend) { Friends.chatWith = null; return ""; }
  Friends.unread[key] = 0;
  const msgs = Friends.messages[key] || [];
  return `
    <div class="dm-box">
      <div class="dm-head">
        ${userAvatarHTML(friend.name, friend.color, "small")}
        <b>${escapeHTML(friend.name)}</b>
        <span class="rv-muted">${Friends.isOnline(friend.name) ? "Online" : "Offline – messages are sent when they come online"}</span>
        <button class="icon-x" data-dm-close title="Close">×</button>
      </div>
      <div class="dm-log" id="dm-log">
        ${msgs.length ? msgs.map((m) => `
          <div class="dm-msg ${Friends.key(m.from) === Friends.key(Accounts.name()) ? "mine" : ""}">${escapeHTML(m.text)}</div>`).join("")
          : '<p class="rv-muted rv-center">Say hi! 👋</p>'}
      </div>
      <form class="dm-form" id="dm-form">
        <input class="friend-input" id="dm-input" placeholder="Write a message…" maxlength="500" autocomplete="off">
        <button class="btn btn-green btn-small">Send</button>
      </form>
    </div>`;
}

// Liste over partier (bruges af Social og fanen "Games")
function gameListHTML(games) {
  if (!games.length) return '<p class="rv-muted">No games yet. Play a game and it will show up here!</p>';
  return `<div class="game-list">${games.map((g) => {
    let res = "draw";
    if (g.myColor) {
      if (g.result === "1-0") res = g.myColor === "w" ? "win" : "loss";
      if (g.result === "0-1") res = g.myColor === "b" ? "win" : "loss";
    } else if (g.result !== "1/2-1/2") res = "neutral";
    const label = { win: "W", loss: "L", draw: "D", neutral: g.result === "1-0" ? "1-0" : "0-1" }[res];
    const opp = g.myColor ? (g.myColor === "w" ? g.black : g.white) : null;
    const title = opp ? `vs ${escapeHTML(opp.name)} (${opp.rating || "?"})` : `${escapeHTML(g.white.name)} vs ${escapeHTML(g.black.name)}`;
    const change = g.ratingChange !== undefined ? `<span class="${g.ratingChange >= 0 ? "pz-delta up" : "pz-delta down"}">${g.ratingChange >= 0 ? "+" : ""}${g.ratingChange}</span>` : "";
    return `
      <div class="game-item">
        <span class="game-result ${res}">${label}</span>
        <div class="game-info">
          <b>${title}</b>
          <span>${g.modeLabel || ""} · ${Math.ceil(g.sans.length / 2)} moves · ${g.reason} · ${formatDate(g.date)}</span>
        </div>
        ${change}
        <button class="icon-btn" data-pgn-game="${g.id}" title="Download PGN">⤓</button>
        ${isVariant(g.variant) ? "" : `<button class="btn btn-gray btn-small" data-review-game="${g.id}">Review</button>`}
      </div>`;
  }).join("")}</div>`;
}


// ----- 3. More -----

const MorePage = {
  open(showOpenings = false) {
    if (showOpenings) return this.openings();
    const tiles = [
      ["analysis", "i-search", "Analysis Board", "Analyze any position with Stockfish"],
      ["review", "i-trophy", "Game Review", "Let the coach review your last game"],
      ["openings", "i-book", "Openings", `Explore ${OPENINGS.length} famous openings`],
      ["streak", "i-bolt", "Puzzle Streak", "How many puzzles in a row can you solve?"],
      ["rush", "i-clock", "Puzzle Rush", "Solve as many puzzles as you can, fast"],
      ["tournaments", "i-trophy", "Tournaments", "Arena tournaments – join or create one"],
      ["clubs", "i-social", "Clubs", "Join a club or start your own"],
      ["install", "i-pawn", "Install the app", "Put Chesshub on your phone or desktop"],
      ["insights", "i-chart", "Insights", "Stats, accuracy and openings from your games"],
      ["leaderboard", "i-trophy", "Leaderboard", "Compare ratings with your friends"],
      ["bots", "i-robot", "Play Bots", "10 computer opponents"],
      ["famous", "i-watch", "Famous Games", "Replay legendary games"],
      ["account", "i-settings", "Account settings", "Profile, flag, password and more"],
      ["settings", "i-settings", "Board settings", "Board, pieces and sounds"],
      ["help", "i-help", "Help", "How everything works"],
      ["credits", "i-learn", "Credits", "Open-source parts used in Chesshub"],
    ];
    $("content-page").innerHTML = `
      <div class="content-wrap">
        <h1 class="content-title"><svg class="nav-icon"><use href="#i-more"/></svg>More</h1>
        <div class="more-grid">
          ${tiles.map(([id, icon, name, desc]) => `
            <button class="more-tile" data-more="${id}"><svg><use href="#${icon}"/></svg><b>${name}</b><span>${desc}</span></button>`).join("")}
        </div>
      </div>`;
  },

  openings() {
    $("content-page").innerHTML = `
      <div class="content-wrap">
        <button class="learn-back" data-more="back"><svg><use href="#i-back"/></svg>More</button>
        <h1 class="content-title"><svg class="nav-icon"><use href="#i-book"/></svg>Openings</h1>
        <p class="rv-muted">Click an opening to explore it on the Analysis Board.</p>
        <div class="opening-list">
          ${OPENINGS.map(([line, name], i) => `
            <button class="opening-item" data-opening="${i}"><b>${name}</b><span>${sanLineText(line)}</span></button>`).join("")}
        </div>
      </div>`;
  },

  credits() {
    $("content-page").innerHTML = `
      <div class="content-wrap">
        <button class="learn-back" data-more="back"><svg><use href="#i-back"/></svg>More</button>
        <h1 class="content-title">Credits</h1>
        <div class="social-card credits">
          <p><b>chess.js</b> – chess rules. BSD 2-Clause license.</p>
          <p><b>Stockfish 19</b> (WebAssembly port by Nathan Rugg) – the engine behind bots, hints, Game Review and analysis on the online site. <b>Stockfish 10</b> is used when Chesshub is opened from a folder. GPLv3.</p>
          <p><b>PeerJS</b> – online play between browsers. MIT license.</p>
          <p><b>Lichess puzzle database</b> – 3,000 puzzles, CC0 (public domain).</p>
          <p><b>Lichess TV</b> – live games from the open Lichess API.</p>
          <p><b>Piece sets</b> from Lichess: cburnett (GPLv2+), merida (GPLv2+), maestro (CC BY-NC-SA 4.0).</p>
          <p>Everything else – layout, styling, icons, sounds, bots, lessons and game code – was made for this project.</p>
        </div>
      </div>`;
  },
};

// "e4 e5 Nf3" → "1. e4 e5 2. Nf3"
function sanLineText(line) {
  return line.split(" ").map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(" ");
}


// ----- 4. Help -----

const HelpPage = {
  open() {
    const faq = [
      ["How do I move a piece?", "Drag it with the mouse, or click the piece and then click the square you want. Dots show the legal moves, rings show captures."],
      ["How do I draw arrows?", "Right-click a square to mark it red. Right-click and drag to draw an arrow. A normal left click clears everything."],
      ["How do I play against the computer?", "Go to Play → New Game → Play Bots. Pick a bot, choose your color and press Play. Turn on the Coach for tips after every move."],
      ["How do I play a rated game online?", "Log in, go to Play → New Game, keep Play Online selected, choose a time and press Play. Chesshub finds a player with the same time control and a rating close to yours. You can abort before both players have moved – then the game doesn't count."],
      ["How do I play with a friend online?", "Add them as a friend on the Social page and press Challenge – pick a live game, a Daily game (days per move) or a Puzzle Battle. You can also go to Play → Play a Friend and share a 6-letter code."],
      ["How does the rating work?", "Like chess.com, Chesshub uses the Glicko system. Everyone starts at 1200. New players' ratings move a lot (shown with a ? on the Leaderboard); after more games they settle down. Bullet, Blitz, Rapid and Daily each have their own rating."],
      ["How strong are the bots?", "The ratings are measured: Stockfish 19 plays the strong bots at its officially calibrated strength (UCI_Elo, 1320–3190), and the weaker bots were tested in hundreds of games against those levels. On the online site the bots use Stockfish 19; opened from a folder they use the older Stockfish 10."],
      ["What is Game Review?", "After a game, press Game Review. Stockfish checks every move, and the coach explains what was good and what was a mistake. Your games are saved under Play → Games."],
      ["How does the puzzle rating work?", "Every puzzle has a rating. Solve it without mistakes and your rating goes up; make a mistake and it goes down. Harder puzzles give more points."],
      ["Where are my account and games saved?", "On the Chesshub server, so you can log in from any device. Your password is stored safely (hashed), never as plain text. Guests (not logged in) are only saved in this browser."],
      ["Online play doesn't connect. What can I do?", "Check your internet connection. Some school or work networks block direct connections between browsers – try another network, like a phone hotspot."],
    ];
    const keys = [["← / →", "Previous / next move"], ["↑ / ↓", "First / last move"], ["Esc", "Close windows"], ["Right-click", "Mark a square"], ["Right-drag", "Draw an arrow"]];
    $("content-page").innerHTML = `
      <div class="content-wrap">
        <h1 class="content-title"><svg class="nav-icon"><use href="#i-help"/></svg>Help</h1>
        <div class="social-grid">
          <section class="social-card">
            <h2>Frequently asked questions</h2>
            ${faq.map(([q, a]) => `<details class="faq"><summary>${q}</summary><p>${a}</p></details>`).join("")}
          </section>
          <section class="social-card">
            <h2>Keyboard shortcuts</h2>
            ${keys.map(([k, d]) => `<div class="key-row"><kbd>${k}</kbd><span>${d}</span></div>`).join("")}
            <h2>The rules in short</h2>
            <p class="rv-muted">Checkmate the opponent's king to win. The game is a draw by stalemate (no legal moves, not in check), threefold repetition, the 50-move rule, insufficient material or agreement. Special moves: castling, en passant and promotion – all supported.</p>
          </section>
        </div>
      </div>`;
  },
};

Pages.news = NewsPage;
Pages.social = SocialPage;
Pages.more = MorePage;
Pages.help = HelpPage;

// Klik på indholdssiderne
$("content-page").addEventListener("click", (e) => {
  const t = e.target;
  // Klik på en rating-boks: vis grafen for den kategori
  const graphCat = t.closest("[data-graph-cat]");
  if (graphCat) {
    SocialPage.graphCat = graphCat.dataset.graphCat;
    return SocialPage.open();
  }
  const review = t.closest("[data-review-game]");
  if (review) return openArchivedGame(review.dataset.reviewGame);
  const pgn = t.closest("[data-pgn-game]");
  if (pgn) return downloadArchivedPGN(pgn.dataset.pgnGame);
  const auth = t.closest("[data-auth]");
  if (auth) return handleAuthAction(auth.dataset.auth);
  const challenge = t.closest("[data-challenge]");
  if (challenge) return openChallengeSetup(challenge.dataset.challenge);
  const unfriend = t.closest("[data-unfriend]");
  if (unfriend) {
    Friends.remove(unfriend.dataset.unfriend);
    return SocialPage.open();
  }
  if (t.closest("[data-copy-friend-link]")) {
    return copyText(siteLink({ add: Accounts.name() }), "Link copied – anyone who opens it can add you as a friend");
  }
  const accept = t.closest("[data-friend-accept]");
  if (accept) return Friends.accept(accept.dataset.friendAccept);
  const decline = t.closest("[data-friend-decline]");
  if (decline) return Friends.decline(decline.dataset.friendDecline);
  const addFriend = t.closest("[data-add-friend]");
  if (addFriend) {
    const error = Friends.request(addFriend.dataset.addFriend);
    if (error) showToast(error);
    return;
  }
  const dm = t.closest("[data-dm]");
  if (dm) {
    Friends.chatWith = Friends.key(dm.dataset.dm);
    Friends.loadChat(dm.dataset.dm); // hent samtalen fra serveren
    SocialPage.open();
    Friends.redraw();
    const input = $("dm-input");
    if (input) input.focus();
    return;
  }
  if (t.closest("[data-dm-close]")) {
    Friends.chatWith = null;
    return SocialPage.open();
  }
  const opening = t.closest("[data-opening]");
  if (opening) return Review.openAnalysis(undefined, OPENINGS[Number(opening.dataset.opening)][0].split(" "));
  const more = t.closest("[data-more]");
  if (!more) return;
  switch (more.dataset.more) {
    case "back": MorePage.open(); break;
    case "analysis": Review.openAnalysis(); break;
    case "review": {
      const game = Accounts.profile().games[0];
      if (game) Review.openGame(game);
      else showToast("Play a game first – then the coach can review it!");
      break;
    }
    case "openings": MorePage.openings(); break;
    case "streak": showPage("puzzles"); Puzzles.view = "streak"; Puzzles.drawPanel(); break;
    case "bots": showPage("play"); switchTab("bots"); break;
    case "famous": Watch.view = "famous"; showPage("watch"); break;
    case "settings": openSettings(); break;
    case "account": showPage("account"); break;
    case "help": showPage("help"); break;
    case "credits": MorePage.credits(); break;
    case "rush": Puzzles.view = "rush"; showPage("puzzles"); break;
    case "leaderboard": showPage("leaderboard"); break;
    case "insights": showPage("insights"); break;
    case "tournaments": Tournaments.open(null); break;
    case "clubs": Clubs.open(null); break;
    case "install": installApp(); break;
  }
});

$("content-page").addEventListener("submit", (e) => {
  e.preventDefault();
  if (e.target.id === "friend-add-form") {
    // Tøm feltet FØR siden tegnes igen (ellers bliver teksten husket)
    const input = $("friend-add-name");
    const name = input.value;
    input.value = "";
    const error = Friends.request(name);
    if (error) showToast(error);
    SocialPage.open();
  }
  if (e.target.id === "dm-form") {
    const input = $("dm-input");
    const text = input.value;
    input.value = "";
    Friends.sendDM(Friends.chatWith, text);
    SocialPage.open();
    if ($("dm-input")) $("dm-input").focus();
  }
});

// ----- Udfordr en ven (vælg tid og farve) -----

let challengeTarget = null;
let challengeColor = "random";

function openChallengeSetup(name) {
  challengeTarget = name;
  $("cs-title").textContent = `Challenge ${name}`;
  // Er vennen offline, kan man kun sende en Daily-udfordring
  $("cs-type").value = Friends.isOnline(name) ? "live" : "daily";
  drawChallengeType();
  drawChallengeColors();
  $("challenge-setup").classList.remove("hidden");
}

// Viser de rigtige valg for den valgte type udfordring
function drawChallengeType() {
  const type = $("cs-type").value;
  const online = Friends.isOnline(challengeTarget);
  if (type === "live") {
    $("cs-tc").innerHTML = TIME_CONTROLS.flatMap((cat) => cat.items.map((item) => ({ item, cat })))
      .map(({ item, cat }, i) => `<option value="${i}" ${item.label === "10 min" ? "selected" : ""}>${item.label}${cat.category === "Unlimited" ? "" : " (" + cat.category + ")"}</option>`).join("");
  } else if (type === "daily") {
    $("cs-tc").innerHTML = `<option value="1">1 day per move</option><option value="3" selected>3 days per move</option><option value="7">7 days per move</option>`;
  }
  $("cs-tc-row").classList.toggle("hidden", type === "battle");
  $("cs-variant-row").classList.toggle("hidden", type !== "live");
  if (!$("cs-variant").options.length) $("cs-variant").innerHTML = VARIANTS.map((v) => `<option value="${v.id}">${v.icon} ${v.name}</option>`).join("");
  $("cs-color-row").classList.toggle("hidden", type === "battle");
  const notes = {
    live: online ? "" : `${challengeTarget} is offline – live games and battles need you both online.`,
    daily: "A slow game – you don't need to be online at the same time.",
    battle: online ? "Race each other on the same puzzles: 3 minutes, 3 strikes. Most solved wins!" : `${challengeTarget} is offline – battles need you both online.`,
  };
  $("cs-note").textContent = notes[type];
  $("cs-send").disabled = !online && type !== "daily";
}

function drawChallengeColors() {
  document.querySelectorAll("[data-cs-color]").forEach((b) => b.classList.toggle("selected", b.dataset.csColor === challengeColor));
}

$("challenge-setup").addEventListener("click", (e) => {
  if (e.target.id === "challenge-setup" || e.target.closest("[data-cs-close]")) {
    $("challenge-setup").classList.add("hidden");
    return;
  }
  const color = e.target.closest("[data-cs-color]");
  if (color) { challengeColor = color.dataset.csColor; drawChallengeColors(); }
  if (e.target.closest("#cs-send")) {
    const type = $("cs-type").value;
    $("challenge-setup").classList.add("hidden");
    if (type === "daily") return Daily.invite(challengeTarget, Number($("cs-tc").value), challengeColor);
    if (type === "battle") return Puzzles.inviteBattle(challengeTarget);
    const tc = TIME_CONTROLS.flatMap((cat) => cat.items)[Number($("cs-tc").value)];
    Friends.challenge(challengeTarget, tc, challengeColor, $("cs-variant").value);
  }
});
$("cs-type").addEventListener("change", drawChallengeType);

function downloadArchivedPGN(id) {
  const game = Accounts.profile().games.find((g) => g.id === id);
  if (game) downloadGamePGN(game);
}

// Åbner et parti fra arkivet i Game Review
function openArchivedGame(id) {
  const game = Accounts.profile().games.find((g) => g.id === id);
  if (game) Review.openGame(game);
}


// ----- 5. Sign Up / Log In -----

let authMode = "signup";

function openAuth(mode) {
  authMode = mode;
  $("auth-title").textContent = mode === "signup" ? "Sign Up" : "Log In";
  $("auth-confirm-row").classList.toggle("hidden", mode !== "signup");
  $("auth-submit").textContent = mode === "signup" ? "Create Account" : "Log In";
  $("auth-switch").innerHTML = mode === "signup"
    ? 'Already have an account? <a href="#" data-auth-switch="login">Log In</a>'
    : 'New here? <a href="#" data-auth-switch="signup">Sign Up</a>';
  $("auth-error").textContent = "";
  $("auth-note").textContent = API.enabled
    ? "Your account works on every device – just log in."
    : "Opened from a folder: this account is saved in this browser only.";
  $("auth-form").reset();
  $("auth-modal").classList.remove("hidden");
  $("auth-username").focus();
}

function closeAuth() {
  $("auth-modal").classList.add("hidden");
}

function handleAuthAction(action) {
  if (action === "signup" || action === "login") openAuth(action);
  if (action === "logout") {
    Accounts.logOut();
    showToast("You are logged out");
    afterAuthChange();
  }
}

$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = $("auth-username").value;
  const pass = $("auth-password").value;
  $("auth-submit").disabled = true; // vent på serveren
  const error = authMode === "signup"
    ? await Accounts.signUp(user, pass, $("auth-confirm").value)
    : await Accounts.logIn(user, pass);
  $("auth-submit").disabled = false;
  if (error) {
    $("auth-error").textContent = error;
    return;
  }
  closeAuth();
  showToast(authMode === "signup" ? `Welcome to Chesshub, ${Accounts.name()}!` : `Welcome back, ${Accounts.name()}!`);
  afterAuthChange();
});

$("auth-modal").addEventListener("click", (e) => {
  if (e.target.id === "auth-modal" || e.target.closest("#btn-close-auth")) return closeAuth();
  const sw = e.target.closest("[data-auth-switch]");
  if (sw) { e.preventDefault(); openAuth(sw.dataset.authSwitch); }
});

// Opdaterer alt, der viser brugerens navn
function afterAuthChange() {
  drawSidebarUser();
  // Kom man fra et venne-link, før man var logget ind? Så send anmodningen nu.
  if (pendingFriendLink && Accounts.isLoggedIn()) {
    const name = pendingFriendLink;
    pendingFriendLink = null;
    setTimeout(() => { const error = Friends.request(name); if (error) showToast(error); showPage("social"); }, 1500);
  }
  Friends.chatWith = null;
  Friends.unread = {};
  Friends.start(); // log på (eller af) vennenetværket
  Sync.start();    // hent nyt fra serveren med jævne mellemrum
  if (typeof Daily !== "undefined") { Daily.games = []; Daily.badge(); }
  if (state.mode !== "online") {
    // Navnet i et igangværende parti
    ["w", "b"].forEach((c) => { if (state.players[c].isHuman) state.players[c].name = Accounts.name(); });
  }
  if (currentPage === "play") drawAll();
  if (currentPage === "social") SocialPage.open();
}

// Menuen viser enten Sign Up/Log In-knapper eller brugerens navn
function drawSidebarUser() {
  const area = $("sidebar-auth");
  if (Accounts.isLoggedIn()) {
    const p = Accounts.profile();
    area.innerHTML = `
      <button class="sidebar-user" data-nav="social">${userAvatarHTML(p.username, p.color, "small")}<span>${p.username}</span></button>`;
  } else {
    // .auth-compact vises kun, når menuen er smal (telefon, tablet eller sammenklappet)
    area.innerHTML = `
      <button class="btn btn-green" data-auth="signup">Sign Up</button>
      <button class="btn btn-gray" data-auth="login">Log In</button>
      <button class="auth-compact" data-auth="signup" title="Sign Up / Log In"><svg><use href="#i-friend"/></svg><span>Sign Up</span></button>`;
  }
}

$("sidebar-auth").addEventListener("click", (e) => {
  const auth = e.target.closest("[data-auth]");
  if (auth) handleAuthAction(auth.dataset.auth);
  const nav = e.target.closest("[data-nav]");
  if (nav) showPage(nav.dataset.nav);
});


// ----- 6. Søgning -----

// Alt man kan søge efter: sider, bots, temaer, åbninger, lektioner og berømte partier
function buildSearchIndex() {
  const items = [
    ["Play", "Page", () => showPage("play")],
    ["Puzzles", "Page", () => showPage("puzzles")],
    ["Puzzle Streak", "Puzzles", () => { showPage("puzzles"); Puzzles.view = "streak"; Puzzles.drawPanel(); }],
    ["Puzzle Rush", "Puzzles", () => { Puzzles.view = "rush"; showPage("puzzles"); }],
    ["Daily Puzzle", "Puzzles", () => { Puzzles.view = "train"; showPage("puzzles"); Puzzles.daily(); }],
    ["Leaderboard", "Page", () => showPage("leaderboard")],
    ["Insights / Stats", "Page", () => showPage("insights")],
    ["Daily Chess", "Play", () => { Daily.selected = null; showPage("daily"); }],
    ["Tournaments / Arena", "Play", () => Tournaments.open(null)],
    ["Clubs", "Social", () => Clubs.open(null)],
    ["Opening explorer", "Analysis", () => Review.openAnalysis()],
    ["Install the app", "More", () => installApp()],
    ["Watch live games", "Watch", () => { Watch.view = "chesshub"; showPage("watch"); }],
    ...VARIANTS.filter((v) => isVariant(v.id)).map((v) => [v.name + " (variant)", "Play", () => { state.pendingVariant = v.id; showPage("play"); switchTab("new"); }]),
    ["Puzzle Storm", "Puzzles", () => { Puzzles.view = "storm"; showPage("puzzles"); }],
    ["Puzzle Dashboard", "Puzzles", () => { Puzzles.view = "dashboard"; showPage("puzzles"); }],
    ["Achievements", "Social", () => showPage("social")],
    ["Learn / Lessons", "Page", () => showPage("learn")],
    ["Watch / Live TV", "Page", () => { Watch.view = "tv"; showPage("watch"); }],
    ["News", "Page", () => showPage("news")],
    ["Social / Profile", "Page", () => showPage("social")],
    ["Analysis Board", "Tool", () => Review.openAnalysis()],
    ["Play a Friend", "Play", () => { showPage("play"); switchTab("friend"); }],
    ["Play Bots", "Play", () => { showPage("play"); switchTab("bots"); }],
    ["Settings", "Tool", () => openSettings()],
    ["Help", "Page", () => showPage("help")],
  ];
  ALL_BOTS.forEach((b) => items.push([`${b.name} (${b.rating})`, "Bot", () => { state.selectedBotId = b.id; showPage("play"); switchTab("bots"); }]));
  Object.entries(PUZZLE_THEMES).forEach(([id, [name]]) => {
    if ((THEME_COUNTS[id] || 0) >= 5) items.push([name, "Puzzle theme", () => { Puzzles.profile.theme = id; savePuzzleProfile(); showPage("puzzles"); Puzzles.view = "train"; Puzzles.nextTraining(); }]);
  });
  OPENINGS.forEach(([line, name]) => items.push([name, "Opening", () => Review.openAnalysis(undefined, line.split(" "))]));
  LESSON_COURSES.forEach((c) => c.lessons.forEach((l) => items.push([l.title, "Lesson", () => { showPage("learn"); Learn.start(c.id, l.id); }])));
  FAMOUS_GAMES.forEach((g) => items.push([g.title, "Famous game", () => { Watch.view = "famous"; showPage("watch"); Watch.openFamous(g.id); }]));
  return items;
}

let searchIndex = null;
let searchResults = [];

$("search-input").addEventListener("input", (e) => {
  if (!searchIndex) searchIndex = buildSearchIndex();
  const q = e.target.value.trim().toLowerCase();
  const box = $("search-results");
  if (!q) { box.classList.add("hidden"); return; }
  // Navne der starter med søgningen kommer først
  searchResults = searchIndex
    .filter(([name]) => name.toLowerCase().includes(q))
    .sort((a, b) => a[0].toLowerCase().indexOf(q) - b[0].toLowerCase().indexOf(q))
    .slice(0, 8);
  box.innerHTML = searchResults.length
    ? searchResults.map(([name, kind], i) => `<button class="search-item" data-search="${i}"><b>${name}</b><span>${kind}</span></button>`).join("")
    : '<div class="search-empty">No results</div>';
  box.classList.remove("hidden");
});

$("search-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && searchResults[0]) runSearch(0);
  if (e.key === "Escape") { e.target.value = ""; $("search-results").classList.add("hidden"); }
});

$("search-results").addEventListener("click", (e) => {
  const item = e.target.closest("[data-search]");
  if (item) runSearch(Number(item.dataset.search));
});

function runSearch(index) {
  const result = searchResults[index];
  $("search-results").classList.add("hidden");
  $("search-input").value = "";
  $("search-input").blur();
  if (result) result[2]();
}

// Klik udenfor lukker søgeresultaterne
document.addEventListener("click", (e) => {
  if (!e.target.closest(".sidebar-search")) $("search-results").classList.add("hidden");
});

drawSidebarUser();
Friends.start();


// ----- 7. Menuerne der folder ud, når musen holdes over venstre menu -----

// Hvert punkt i menuerne har et data-go, som her bliver til en handling
const FLYOUT_ACTIONS = {
  play:     () => { showPage("play"); switchTab("play"); },
  new:      () => { showPage("play"); switchTab("new"); },
  bots:     () => { showPage("play"); switchTab("bots"); },
  coach:    () => { showPage("play"); switchTab("coach"); },
  friend:   () => { showPage("play"); switchTab("friend"); },
  history:  () => { showPage("play"); switchTab("games"); },
  puzzles:  () => { Puzzles.view = "train"; showPage("puzzles"); },
  daily:    () => { Puzzles.view = "train"; showPage("puzzles"); Puzzles.daily(); },
  streak:   () => { Puzzles.view = "streak"; showPage("puzzles"); },
  themes:   () => { Puzzles.view = "themes"; showPage("puzzles"); },
  rush:     () => { Puzzles.view = "rush"; showPage("puzzles"); },
  leaderboard: () => showPage("leaderboard"),
  insights: () => showPage("insights"),
  "daily-chess": () => { Daily.selected = null; showPage("daily"); },
  tournaments: () => Tournaments.open(null),
  clubs: () => Clubs.open(null),
  lessons:  () => { showPage("learn"); if (Learn.lesson) Learn.backToList(); },
  analysis: () => Review.openAnalysis(),
  review:   () => {
    const game = Accounts.profile().games[0];
    if (game) Review.openGame(game);
    else showToast("Play a game first – then the coach can review it!");
  },
  openings: () => { showPage("more"); MorePage.openings(); },
  tv:       () => { Watch.view = "tv"; showPage("watch"); },
  famous:   () => { Watch.view = "famous"; Watch.famous = null; showPage("watch"); },
  news:     () => showPage("news"),
  profile:  () => showPage("social"),
  friends:  () => { showPage("social"); const input = $("friend-add-name"); if (input) input.focus(); },
  more:     () => showPage("more"),
  settings: () => openSettings(),
  help:     () => showPage("help"),
  credits:  () => { showPage("more"); MorePage.credits(); },
};

document.querySelectorAll(".flyout-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    const li = item.closest(".nav-li");
    li.classList.add("flyout-closed"); // luk menuen efter et klik
    FLYOUT_ACTIONS[item.dataset.go]();
  });
});
// Menuen må gerne åbne igen, når musen har været væk
document.querySelectorAll(".nav-li").forEach((li) => {
  li.addEventListener("mouseleave", () => li.classList.remove("flyout-closed"));
});


// ----- Links: ?join=KODE (spil) og ?add=NAVN (venneanmodning) -----

let pendingFriendLink = null;

function handleStartLinks() {
  const params = new URLSearchParams(location.search);
  const join = params.get("join");
  const add = params.get("add");
  // Fjern det fra adresselinjen, så det ikke sker igen ved genindlæsning
  if (join || add) {
    params.delete("join");
    params.delete("add");
    const rest = params.toString();
    history.replaceState(null, "", location.pathname + (rest ? "?" + rest : ""));
  }

  if (join) {
    showPage("play");
    switchTab("friend");
    Online.join(join);
  } else if (add) {
    if (Accounts.isLoggedIn()) {
      if (add.toLowerCase() === Accounts.name().toLowerCase()) return showToast("That's your own friend link!");
      // Vent lidt, så vi er forbundet til vennenetværket først
      setTimeout(() => { const error = Friends.request(add); if (error) showToast(error); showPage("social"); }, 1500);
    } else {
      pendingFriendLink = add;
      openAuth("signup");
      showToast(`Create an account (or log in) to add ${add} as a friend`);
    }
  }
}
// ----- Synkronisering med serveren -----
// Hvert 45. sekund (når fanen er synlig) hentes det nyeste: ratings, venner,
// ulæste beskeder og Daily-partier, hvor det er min tur.

const Sync = {
  timer: null,
  start() {
    clearInterval(this.timer);
    if (!Accounts.online()) return;
    this.tick();
    this.timer = setInterval(() => { if (document.visibilityState === "visible") this.tick(); }, 45000);
  },
  async tick() {
    const before = Accounts.profile().friends.filter((f) => f.status === "incoming").length;
    const data = await Accounts.refresh();
    if (!data) return;
    const after = Accounts.profile().friends.filter((f) => f.status === "incoming").length;
    if (after > before) notify("You have a new friend request");
    Friends.redraw();
    Daily.badge();
    drawSidebarUser();
    if (currentPage === "daily") Daily.load();
  },
};
// ----- Installer som app -----
// Browseren fortæller, når siden kan installeres. Så viser vi en "Install app"-knap.
let installPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  if (currentPage === "more") MorePage.open();
});
async function installApp() {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
  } else {
    showToast(/iPhone|iPad/.test(navigator.userAgent)
      ? "On iPhone/iPad: press Share, then \"Add to Home Screen\""
      : "Use your browser's menu → \"Install Chesshub\" or \"Add to Home screen\"");
  }
}
if ("serviceWorker" in navigator && API.enabled) {
  navigator.serviceWorker.register("sw.js").then((reg) => {
    // Første besøg: service workeren styrer ikke siden endnu, så siden er ikke
    // "isolated". Genindlæs én gang, når den er klar (variant-motoren skal bruge det).
    if (window.crossOriginIsolated) return;
    const reloadOnce = () => {
      try {
        if (sessionStorage.getItem("chesshub-coi-reload")) return;
        sessionStorage.setItem("chesshub-coi-reload", "1");
      } catch (e) { return; }
      location.reload();
    };
    if (navigator.serviceWorker.controller) reloadOnce();
    else navigator.serviceWorker.addEventListener("controllerchange", reloadOnce);
  }).catch(() => {});
}

// Send ændringer, inden siden lukkes
window.addEventListener("pagehide", () => { if (Accounts.dirty) Accounts.push(); });

// Er siden låst, venter vi med links til man er kommet ind
function afterGate() {
  LichessAuth.handleRedirect(); // kommer vi tilbage fra "Connect Lichess"?
  handleStartLinks();
  Sync.start();
}
if (Gate.isLocked()) Gate.afterUnlock = afterGate;
else afterGate();