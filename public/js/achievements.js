// ===================================================================
// achievements.js – præstationer (badges) og ranglister.
//
// Hver præstation har en test-funktion ("done"), der ser på brugerens
// data. Achievements.check() kaldes efter partier, puzzles, lektioner
// osv. Er en test opfyldt for første gang, vises en besked.
// ===================================================================

// Hjælpere: tæl sejre mod bestemte bots
function botWins(names) {
  return Accounts.profile().games.filter((g) => {
    if (g.mode !== "bot" || !g.myColor) return false;
    const won = (g.result === "1-0" && g.myColor === "w") || (g.result === "0-1" && g.myColor === "b");
    const opponent = g.myColor === "w" ? g.black : g.white;
    return won && names.includes(opponent.name);
  }).length;
}
const groupNames = (group) => BOT_GROUPS.find((g) => g.name === group).bots.map((b) => b.name);
const gamesWon = (mode) => Accounts.profile().games.filter((g) => g.myColor && (!mode || g.mode === mode) &&
  ((g.result === "1-0" && g.myColor === "w") || (g.result === "0-1" && g.myColor === "b"))).length;

const ACHIEVEMENTS = [
  { id: "first-game", icon: "♟", name: "First Steps", desc: "Finish your first game", done: () => Accounts.profile().games.length >= 1 },
  { id: "first-win", icon: "🏅", name: "First Victory", desc: "Win a game against a bot or a friend", done: () => gamesWon() >= 1 },
  { id: "wins-10", icon: "🔥", name: "Winning Streak", desc: "Win 10 games", done: () => gamesWon() >= 10 },
  { id: "beat-beginner", icon: "🐣", name: "Bot Beginner", desc: "Beat a Beginner bot", done: () => botWins(groupNames("Beginner")) >= 1 },
  { id: "beat-intermediate", icon: "🦊", name: "Bot Hunter", desc: "Beat an Intermediate bot", done: () => botWins(groupNames("Intermediate")) >= 1 },
  { id: "beat-advanced", icon: "🐺", name: "Pack Leader", desc: "Beat an Advanced bot", done: () => botWins(groupNames("Advanced")) >= 1 },
  { id: "beat-master", icon: "🐉", name: "Dragon Slayer", desc: "Beat Drake or Max", done: () => botWins(groupNames("Master")) >= 1 },
  { id: "online-win", icon: "🤝", name: "Friendly Rival", desc: "Win an online game against a friend", done: () => gamesWon("online") >= 1 },
  { id: "friend", icon: "👋", name: "Social Butterfly", desc: "Make your first friend", done: () => Accounts.isLoggedIn() && Accounts.friendList().some((f) => f.status === "friends") },
  { id: "puzzles-10", icon: "🧩", name: "Puzzle Solver", desc: "Solve 10 puzzles", done: () => (Puzzles.profile.solved || 0) >= 10 },
  { id: "puzzles-100", icon: "🧠", name: "Puzzle Master", desc: "Solve 100 puzzles", done: () => (Puzzles.profile.solved || 0) >= 100 },
  { id: "puzzle-1700", icon: "👁", name: "Sharp Eye", desc: "Reach a puzzle rating of 1700", done: () => Puzzles.profile.rating >= 1700 },
  { id: "streak-10", icon: "⚡", name: "On Fire", desc: "Get a Puzzle Streak of 10", done: () => Puzzles.profile.streakBest >= 10 },
  { id: "rush-15", icon: "⏱", name: "Speed Demon", desc: "Score 15 in Puzzle Rush", done: () => Math.max(0, ...Object.values(Puzzles.profile.rushBest || {})) >= 15 },
  { id: "lessons-10", icon: "🎓", name: "Good Student", desc: "Complete 10 lessons", done: () => Object.keys(Learn.progress).length >= 10 },
  { id: "lessons-all", icon: "📜", name: "Graduate", desc: "Complete every lesson", done: () => LESSON_COURSES.every((c) => c.lessons.every((l) => Learn.progress[l.id])) },
  { id: "review", icon: "🦉", name: "Self-Reflection", desc: "Review a game with the coach", done: () => !!Accounts.profile().usedReview },
  { id: "brilliant", icon: "💎", name: "Brilliant!", desc: "Play a Brilliant move (found in Game Review)", done: () => !!Accounts.profile().foundBrilliant },
];

const Achievements = {
  // Kaldes efter alt, der kan give en præstation
  check() {
    const profile = Accounts.profile();
    profile.achievements = profile.achievements || {};
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      if (profile.achievements[a.id]) continue;
      let ok = false;
      try { ok = a.done(); } catch (e) { ok = false; }
      if (ok) {
        profile.achievements[a.id] = Date.now();
        changed = true;
        this.announce(a);
      }
    }
    if (changed) Accounts.save();
  },

  // Lille "pop-up" nederst: Achievement unlocked!
  announce(a) {
    const el = document.createElement("div");
    el.className = "achievement-toast";
    el.innerHTML = `<span class="ach-icon">${a.icon}</span><div><small>Achievement unlocked!</small><b>${a.name}</b></div>`;
    document.body.appendChild(el);
    playSound("promote");
    setTimeout(() => el.classList.add("show"), 20);
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, 3500);
  },

  unlockedCount() {
    const done = Accounts.profile().achievements || {};
    return ACHIEVEMENTS.filter((a) => done[a.id]).length;
  },

  gridHTML() {
    const done = Accounts.profile().achievements || {};
    return `<div class="ach-grid">${ACHIEVEMENTS.map((a) => `
      <div class="ach ${done[a.id] ? "unlocked" : ""}" title="${a.desc}">
        <span class="ach-icon">${a.icon}</span>
        <b>${a.name}</b>
        <span>${a.desc}</span>
      </div>`).join("")}</div>`;
  },
};


// ----- Rangliste -----

// (Leaderboard ligger nu i community.js)
