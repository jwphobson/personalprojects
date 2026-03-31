// =====================================================================
// Club Tennis Ladder - Application Logic
// Data synced in real-time via Firebase
// =====================================================================

(function () {
  "use strict";

  const ADMIN_PIN = "2504";
  const ADMIN_STORAGE_KEY = "tennisLadder_adminVerified";

  let adminVerified = localStorage.getItem(ADMIN_STORAGE_KEY) === "true";

  if (adminVerified) {
    document.body.classList.add("admin-enabled");
  }

  function enableAdminMode() {
    adminVerified = true;
    localStorage.setItem(ADMIN_STORAGE_KEY, "true");
    document.body.classList.add("admin-enabled");
    showToast("Admin access granted");
    renderPlayers();
  }

  function disableAdminMode() {
    adminVerified = false;
    localStorage.removeItem(ADMIN_STORAGE_KEY);
    document.body.classList.remove("admin-enabled");
    showToast("Admin mode disabled");
    renderPlayers();
  }

  function requireAdmin() {
    if (adminVerified) return true;

    const pin = prompt("Enter admin PIN");
    if (!pin || pin !== ADMIN_PIN) {
      showToast("Incorrect PIN", "error");
      return false;
    }

    enableAdminMode();
    return true;
  }

  function lockAdmin() {
    disableAdminMode();
  }

  function unlockAdmin() {
    if (requireAdmin()) {
      renderPlayers();
    }
  }

  // --- Data Layer (Firebase) ---
  const db = firebase.database();
  const refs = {
    players: db.ref("players"),
    challenges: db.ref("challenges"),
    matches: db.ref("matches"),
    seasons: db.ref("seasons"),
  };

  let players = [];
  let challenges = [];
  let matches = [];
  let seasons = [];

  function persist() {
    refs.players.set(players);
    refs.challenges.set(challenges);
    refs.matches.set(matches);
    refs.seasons.set(seasons);
  }

  // --- Utility ---
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function formatDate(iso) {
    if (!iso) return "–";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function getPlayerById(id) {
    return players.find((p) => p.id === id);
  }

  function getPlayerName(id) {
    const p = getPlayerById(id);
    return p ? p.name : "Unknown";
  }

  function maskPhone(phone) {
    if (!phone) return "";
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 4) return "••••";
    return `••••••${digits.slice(-4)}`;
  }

  function maskEmail(email) {
    if (!email) return "";
    const [name, domain] = email.split("@");
    if (!name || !domain) return email;

    const maskedName =
      name.length <= 2
        ? `${name[0] || ""}•`
        : `${name[0]}${"•".repeat(Math.max(1, name.length - 2))}${name[name.length - 1]}`;

    return `${maskedName}@${domain}`;
  }

  function normaliseUkPhone(phone) {
    if (!phone) return "";
    const digits = phone.replace(/\D/g, "");
    if (digits.startsWith("44")) return digits;
    if (digits.startsWith("0")) return `44${digits.slice(1)}`;
    return digits;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Toast Notification ---
  function showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = "toast " + type;
    void toast.offsetWidth;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
  }

  // --- Confirmation Modal ---
  function showConfirm(title, message) {
    return new Promise((resolve) => {
      const overlay = document.getElementById("confirm-modal");
      document.getElementById("confirm-title").textContent = title;
      document.getElementById("confirm-message").textContent = message;
      overlay.style.display = "flex";

      function cleanup(result) {
        overlay.style.display = "none";
        document
          .getElementById("confirm-ok")
          .removeEventListener("click", onOk);
        document
          .getElementById("confirm-cancel")
          .removeEventListener("click", onCancel);
        resolve(result);
      }

      function onOk() {
        cleanup(true);
      }
      function onCancel() {
        cleanup(false);
      }

      document.getElementById("confirm-ok").addEventListener("click", onOk);
      document
        .getElementById("confirm-cancel")
        .addEventListener("click", onCancel);
    });
  }

  // --- Tab Navigation ---
  const navButtons = document.querySelectorAll(".nav-btn");
  const tabSections = document.querySelectorAll(".tab-content");

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      navButtons.forEach((b) => b.classList.remove("active"));
      tabSections.forEach((s) => s.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
      refreshAll();
    });
  });

  // --- Standings ---
  function renderStandings() {
    const body = document.getElementById("standings-body");
    const emptyMsg = document.getElementById("standings-empty");
    const filter = document.getElementById("standings-filter").value;

    const sorted = [...players].sort((a, b) => a.position - b.position);

    let filtered = sorted;
    if (filter === "active") {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      filtered = sorted.filter(
        (p) => p.lastPlayed && new Date(p.lastPlayed).getTime() > thirtyDaysAgo,
      );
    }

    if (filtered.length === 0) {
      body.innerHTML = "";
      emptyMsg.style.display = "block";
      return;
    }
    emptyMsg.style.display = "none";

    body.innerHTML = filtered
      .map((p) => {
        const rankClass =
          p.position <= 3 ? `rank-${p.position}` : "rank-default";
        const challengeWins = p.challengeWins || 0;
        const challengeLosses = p.challengeLosses || 0;
        const winPct =
          challengeWins + challengeLosses > 0
          ? Math.round((challengeWins / (challengeWins + challengeLosses)) * 100) + "%"
          : "–";
        const streakText = p.streak
          ? p.streak > 0
            ? `W${p.streak}`
            : `L${Math.abs(p.streak)}`
          : "–";
        const streakClass =
          p.streak > 0 ? "streak-win" : p.streak < 0 ? "streak-loss" : "";

        return `<tr>
                <td class="col-rank"><span class="rank-badge ${rankClass}">${p.position}</span></td>
                <td><span class="player-name">${escapeHtml(p.name)}</span></td>
                <td class="col-stat">${challengeWins}</td>
                <td class="col-stat">${challengeLosses}</td>
                <td class="col-stat">${winPct}</td>
                <td class="col-stat"><span class="${streakClass}">${streakText}</span></td>
                <td class="col-last">${formatDate(p.lastPlayed)}</td>
            </tr>`;
      })
      .join("");
  }

  document
    .getElementById("standings-filter")
    .addEventListener("change", renderStandings);

  // --- Player Management ---
  function renderPlayers() {
    const list = document.getElementById("players-list");
    const emptyMsg = document.getElementById("players-empty");

    if (players.length === 0) {
      list.innerHTML = "";
      emptyMsg.style.display = "block";
      return;
    }

    emptyMsg.style.display = "none";

    const sorted = [...players].sort((a, b) => a.position - b.position);
    list.innerHTML = sorted
      .map((p) => {
        const contact = [
          p.phone ? maskPhone(p.phone) : "",
          p.email ? maskEmail(p.email) : "",
        ]
          .filter(Boolean)
          .join(" | ");

        return `<div class="player-card">
            <div class="player-info">
                <span class="name">#${p.position} ${escapeHtml(p.name)}</span>
                ${contact ? `<span class="contact">${escapeHtml(contact)}</span>` : ""}
            </div>
            <div class="player-actions admin-only">
                <button class="btn btn-sm btn-secondary" onclick="app.editPlayer('${p.id}')" title="Edit">Edit</button>
                <button class="btn btn-sm btn-secondary" onclick="app.movePlayer('${p.id}', -1)" title="Move up">&uarr;</button>
                <button class="btn btn-sm btn-secondary" onclick="app.movePlayer('${p.id}', 1)" title="Move down">&darr;</button>
                <button class="btn btn-sm btn-danger" onclick="app.removePlayer('${p.id}')">Remove</button>
            </div>
        </div>`;
      })
      .join("");
  }

  function addPlayer() {
    if (!requireAdmin()) return;

    const nameInput = document.getElementById("player-name");
    const phoneInput = document.getElementById("player-phone");
    const emailInput = document.getElementById("player-email");

    const name = nameInput.value.trim();
    if (!name) {
      showToast("Please enter a player name", "error");
      return;
    }

    if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      showToast("A player with this name already exists", "error");
      return;
    }

    const newPlayer = {
      id: generateId(),
      name,
      phone: phoneInput.value.trim(),
      email: emailInput.value.trim(),
      position: players.length + 1,
      wins: 0,
      losses: 0,
      challengeWins: 0,
      challengeLosses: 0,
      friendlyWins: 0,
      friendlyLosses: 0,
      streak: 0,
      lastPlayed: null,
    };

    players.push(newPlayer);
    persist();

    nameInput.value = "";
    phoneInput.value = "";
    emailInput.value = "";

    showToast(`${name} added at position #${newPlayer.position}`);
    refreshAll();
  }

  document
    .getElementById("add-player-btn")
    .addEventListener("click", addPlayer);
  document.getElementById("player-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addPlayer();
  });

  async function removePlayer(id) {
    if (!requireAdmin()) return;

    const player = getPlayerById(id);
    if (!player) return;

    const ok = await showConfirm(
      "Remove Player",
      `Remove ${player.name} from the ladder? This cannot be undone.`,
    );
    if (!ok) return;

    const removedPos = player.position;
    players = players.filter((p) => p.id !== id);

    players.forEach((p) => {
      if (p.position > removedPos) p.position--;
    });

    challenges = challenges.filter(
      (c) => c.challengerId !== id && c.challengedId !== id,
    );

    persist();
    showToast(`${player.name} removed`);
    refreshAll();
  }

  function movePlayer(id, direction) {
    if (!requireAdmin()) return;

    const player = getPlayerById(id);
    if (!player) return;

    const targetPos = player.position + direction;
    if (targetPos < 1 || targetPos > players.length) return;

    const other = players.find((p) => p.position === targetPos);
    if (other) {
      other.position = player.position;
    }
    player.position = targetPos;

    persist();
    refreshAll();
  }

  // --- Edit Player ---
  function editPlayer(id) {
    if (!requireAdmin()) return;

    const player = getPlayerById(id);
    if (!player) return;

    document.getElementById("edit-player-id").value = id;
    document.getElementById("edit-player-name").value = player.name;
    document.getElementById("edit-player-phone").value = player.phone || "";
    document.getElementById("edit-player-email").value = player.email || "";
    document.getElementById("edit-player-modal").style.display = "flex";
  }

  document
    .getElementById("edit-player-cancel")
    .addEventListener("click", () => {
      document.getElementById("edit-player-modal").style.display = "none";
    });

  document.getElementById("edit-player-save").addEventListener("click", () => {
    if (!requireAdmin()) return;

    const id = document.getElementById("edit-player-id").value;
    const player = getPlayerById(id);
    if (!player) return;

    const name = document.getElementById("edit-player-name").value.trim();
    if (!name) {
      showToast("Name cannot be empty", "error");
      return;
    }

    const duplicate = players.find(
      (p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      showToast("A player with this name already exists", "error");
      return;
    }

    player.name = name;
    player.phone = document.getElementById("edit-player-phone").value.trim();
    player.email = document.getElementById("edit-player-email").value.trim();

    persist();
    document.getElementById("edit-player-modal").style.display = "none";
    showToast(`${name} updated`);
    refreshAll();
  });

  // --- Challenge System ---
  const MAX_CHALLENGE_DISTANCE = 2;
  const CHALLENGE_EXPIRY_DAYS = 14;

  function getChallengeExpiryDate(createdAt) {
    const created = new Date(createdAt);
    created.setDate(created.getDate() + CHALLENGE_EXPIRY_DAYS);
    return created;
  }

  function isChallengeExpired(challenge) {
    return new Date() > getChallengeExpiryDate(challenge.createdAt);
  }

  function pruneExpiredChallenges() {
    const before = challenges.length;
    challenges = challenges.filter((c) => !isChallengeExpired(c));
    if (challenges.length !== before) {
      persist();
    }
  }

  function renderChallenges() {
    populateChallengerSelects();
    renderOpenChallenges();
    populateChallengeResultSelect();
  }

  function populateChallengerSelects() {
    const challengerSel = document.getElementById("challenger-select");
    const challengedSel = document.getElementById("challenged-select");

    const sorted = [...players].sort((a, b) => a.position - b.position);
    const options = sorted
      .map(
        (p) =>
          `<option value="${p.id}">#${p.position} ${escapeHtml(p.name)}</option>`,
      )
      .join("");

    challengerSel.innerHTML =
      '<option value="">Select challenger...</option>' + options;
    challengedSel.innerHTML =
      '<option value="">Select opponent...</option>' + options;
  }

  function createChallenge() {
    const challengerId = document.getElementById("challenger-select").value;
    const challengedId = document.getElementById("challenged-select").value;

    if (!challengerId || !challengedId) {
      showToast("Please select both players", "error");
      return;
    }

    if (challengerId === challengedId) {
      showToast("A player cannot challenge themselves", "error");
      return;
    }

    const challenger = getPlayerById(challengerId);
    const challenged = getPlayerById(challengedId);

    if (challenger.position <= challenged.position) {
      showToast(
        "Challenger must be ranked lower (higher number) than the opponent",
        "error",
      );
      return;
    }

    if (challenger.position - challenged.position > MAX_CHALLENGE_DISTANCE) {
      showToast(
        `Can only challenge players within ${MAX_CHALLENGE_DISTANCE} positions above`,
        "error",
      );
      return;
    }

    const existing = challenges.find(
      (c) =>
        (c.challengerId === challengerId && c.challengedId === challengedId) ||
        (c.challengerId === challengedId && c.challengedId === challengerId),
    );
    if (existing) {
      showToast(
        "There is already an open challenge between these players",
        "error",
      );
      return;
    }

    const newChallengeId = generateId();
    challenges.push({
      id: newChallengeId,
      challengerId,
      challengedId,
      createdAt: new Date().toISOString(),
    });

    persist();
    showToast(`${challenger.name} has challenged ${challenged.name}!`);
    refreshAll();

    notifyChallenge(newChallengeId);
  }

  document
    .getElementById("create-challenge-btn")
    .addEventListener("click", createChallenge);

  // --- Notify via Web Share API / SMS / WhatsApp ---
async function notifyChallenge(challengeId) {
  const challenge = challenges.find((c) => c.id === challengeId);
  if (!challenge) return;

  const challenger = getPlayerById(challenge.challengerId);
  const challenged = getPlayerById(challenge.challengedId);
  if (!challenger || !challenged) return;

  const ladderUrl = window.location.href.split("#")[0];
  const message = `Hi ${challenged.name}, you've been challenged by ${challenger.name} on the tennis ladder. Please arrange your match within ${CHALLENGE_EXPIRY_DAYS} days.\n\nLadder: ${ladderUrl}`;

  if (challenged.phone) {
    const phone = normaliseUkPhone(challenged.phone);
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      "_blank",
    );
    return;
  }

  if (challenged.email) {
    const subject = "Tennis Ladder Challenge";
    window.location.href = `mailto:${challenged.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    return;
  }

  if (navigator.share) {
    navigator
      .share({
        title: "Tennis Ladder Challenge",
        text: message,
        url: ladderUrl,
      })
      .catch(() => {});
    return;
  }

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(message)
      .then(() => showToast("Challenge message copied"))
      .catch(() => showToast("Could not share challenge", "error"));
  } else {
    showToast("No phone or email available for this player", "error");
  }
}

  function renderOpenChallenges() {
    const container = document.getElementById("open-challenges");
    const emptyMsg = document.getElementById("challenges-empty");

    if (challenges.length === 0) {
      container.innerHTML = "";
      emptyMsg.style.display = "block";
      container.appendChild(emptyMsg);
      return;
    }
    emptyMsg.style.display = "none";

    container.innerHTML = challenges
      .map((c) => {
        const challenger = getPlayerById(c.challengerId);
        const challenged = getPlayerById(c.challengedId);
        if (!challenger || !challenged) return "";

        const expiryDate = formatDate(
          getChallengeExpiryDate(c.createdAt).toISOString(),
        );

        return `<div class="challenge-card">
            <div>
                <div class="players">#${challenger.position} ${escapeHtml(challenger.name)} vs #${challenged.position} ${escapeHtml(challenged.name)}</div>
                <div class="date">Created ${formatDate(c.createdAt)} • Expires ${expiryDate}</div>
            </div>
            <div class="actions">
                <button class="btn btn-sm btn-notify" onclick="app.notifyChallenge('${c.id}')">Notify</button>
                <button class="btn btn-sm btn-danger" onclick="app.cancelChallenge('${c.id}')">Cancel</button>
            </div>
        </div>`;
      })
      .join("");
  }
  async function cancelChallenge(id) {
    const ok = await showConfirm(
      "Cancel Challenge",
      "Are you sure you want to cancel this challenge?",
    );
    if (!ok) return;

    challenges = challenges.filter((c) => c.id !== id);
    persist();
    showToast("Challenge cancelled");
    refreshAll();
  }

  async function archiveSeason() {
    if (!requireAdmin()) return;

    const ok = await showConfirm(
      "Archive Season",
      "Archive current season and reset ladder, matches, and challenges?",
    );
    if (!ok) return;

    const archivedPlayers = [...players]
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ ...p }));

    const archivedChallenges = challenges.map((c) => ({ ...c }));
    const archivedMatches = matches.map((m) => ({ ...m }));

    const archivedSeason = {
      id: generateId(),
      archivedAt: new Date().toISOString(),
      players: archivedPlayers,
      challenges: archivedChallenges,
      matches: archivedMatches,
    };

    seasons.unshift(archivedSeason);

    players = [...players]
      .sort((a, b) => a.position - b.position)
      .map((p, index) => ({
        ...p,
        position: index + 1,
        wins: 0,
        losses: 0,
        challengeWins: 0,
        challengeLosses: 0,
        friendlyWins: 0,
        friendlyLosses: 0,
        streak: 0,
        lastPlayed: null,
      }));

    challenges = [];
    matches = [];

    refs.seasons.set(seasons);
    persist();

    showToast("Season archived and ladder reset");
    refreshAll();
  }

  // --- Record Results ---
  const toggleBtns = document.querySelectorAll(".toggle-btn");
  toggleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("challenge-result-form").style.display =
        btn.dataset.type === "challenge" ? "block" : "none";
      document.getElementById("friendly-result-form").style.display =
        btn.dataset.type === "friendly" ? "block" : "none";
    });
  });

  function populateChallengeResultSelect() {
    const sel = document.getElementById("challenge-select-result");
    sel.innerHTML = '<option value="">Select an open challenge...</option>';

    challenges.forEach((c) => {
      const challenger = getPlayerById(c.challengerId);
      const challenged = getPlayerById(c.challengedId);
      if (!challenger || !challenged) return;
      sel.innerHTML += `<option value="${c.id}">#${challenger.position} ${escapeHtml(challenger.name)} vs #${challenged.position} ${escapeHtml(challenged.name)}</option>`;
    });
  }

  function populateFriendlySelects() {
    const sorted = [...players].sort((a, b) => a.position - b.position);
    const options = sorted
      .map(
        (p) =>
          `<option value="${p.id}">#${p.position} ${escapeHtml(p.name)}</option>`,
      )
      .join("");

    document.getElementById("friendly-player1").innerHTML =
      '<option value="">Select player...</option>' + options;
    document.getElementById("friendly-player2").innerHTML =
      '<option value="">Select player...</option>' + options;
  }

  function parseScoreValue(id) {
    const value = document.getElementById(id).value.trim();
    if (value === "") return null;
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 ? n : NaN;
  }

  function getStructuredScore(prefix) {
    const s1p1 = parseScoreValue(`${prefix}1p1`);
    const s1p2 = parseScoreValue(`${prefix}1p2`);
    const s2p1 = parseScoreValue(`${prefix}2p1`);
    const s2p2 = parseScoreValue(`${prefix}2p2`);
    const tbp1 = parseScoreValue(`${prefix}tbp1`);
    const tbp2 = parseScoreValue(`${prefix}tbp2`);

    if ([s1p1, s1p2, s2p1, s2p2].some((v) => v === null || Number.isNaN(v))) {
      return { error: "Enter valid scores for Set 1 and Set 2" };
    }

    if (s1p1 === s1p2 || s2p1 === s2p2) {
      return { error: "Set scores cannot be tied" };
    }

    const set1Winner = s1p1 > s1p2 ? "p1" : "p2";
    const set2Winner = s2p1 > s2p2 ? "p1" : "p2";

    let winnerSlot;
    let scoreText = `${s1p1}-${s1p2}, ${s2p1}-${s2p2}`;

    if (set1Winner === set2Winner) {
      winnerSlot = set1Winner;
    } else {
      if (
        tbp1 === null ||
        tbp2 === null ||
        Number.isNaN(tbp1) ||
        Number.isNaN(tbp2)
      ) {
        return {
          error: "Enter a championship tie-break score when sets are split",
        };
      }

      if (tbp1 === tbp2) {
        return { error: "Championship tie-break cannot be tied" };
      }

      winnerSlot = tbp1 > tbp2 ? "p1" : "p2";
      scoreText += `, CTB ${tbp1}-${tbp2}`;
    }

    return { winnerSlot, scoreText };
  }

  function clearScoreInputs(prefix) {
    const ids = [
      `${prefix}1p1`,
      `${prefix}1p2`,
      `${prefix}2p1`,
      `${prefix}2p2`,
      `${prefix}tbp1`,
      `${prefix}tbp2`,
    ];

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
  }

  function submitChallengeResult() {
    const challengeId = document.getElementById(
      "challenge-select-result",
    ).value;

    if (!challengeId) {
      showToast("Please select a challenge", "error");
      return;
    }

    const challenge = challenges.find((c) => c.id === challengeId);
    if (!challenge) return;

    const scoreResult = getStructuredScore("s");
    if (scoreResult.error) {
      showToast(scoreResult.error, "error");
      return;
    }

    const challenger = getPlayerById(challenge.challengerId);
    const challenged = getPlayerById(challenge.challengedId);
    const winnerId =
      scoreResult.winnerSlot === "p1"
        ? challenge.challengerId
        : challenge.challengedId;
    const loserId =
      winnerId === challenge.challengerId
        ? challenge.challengedId
        : challenge.challengerId;
    const winner = getPlayerById(winnerId);
    const loser = getPlayerById(loserId);

    let positionChange = null;

    if (winnerId === challenge.challengerId) {
      const oldChallengerPos = challenger.position;
      const challengedPos = challenged.position;

      players.forEach((p) => {
        if (
          p.position >= challengedPos &&
          p.position < oldChallengerPos &&
          p.id !== challenger.id
        ) {
          p.position++;
        }
      });

      challenger.position = challengedPos;
      positionChange = `${winner.name} moves from #${oldChallengerPos} to #${challengedPos}`;
    }

    winner.wins = (winner.wins || 0) + 1;
    winner.challengeWins = (winner.challengeWins || 0) + 1;
    winner.streak = winner.streak > 0 ? winner.streak + 1 : 1;
    winner.lastPlayed = new Date().toISOString();

    loser.losses = (loser.losses || 0) + 1;
    loser.challengeLosses = (loser.challengeLosses || 0) + 1;
    loser.streak = loser.streak < 0 ? loser.streak - 1 : -1;
    loser.lastPlayed = new Date().toISOString();

    matches.unshift({
      id: generateId(),
      type: "challenge",
      player1Id: challenge.challengerId,
      player2Id: challenge.challengedId,
      winnerId,
      score: scoreResult.scoreText,
      positionChange,
      date: new Date().toISOString(),
    });

    challenges = challenges.filter((c) => c.id !== challengeId);

    persist();
    clearScoreInputs("s");
    document.getElementById("challenge-select-result").value = "";

    showToast(`Result recorded! ${winner.name} defeats ${loser.name}`);
    refreshAll();
  }

  document
    .getElementById("submit-challenge-result-btn")
    .addEventListener("click", submitChallengeResult);

  function submitFriendlyResult() {
    const p1Id = document.getElementById("friendly-player1").value;
    const p2Id = document.getElementById("friendly-player2").value;

    if (!p1Id || !p2Id) {
      showToast("Please select both players", "error");
      return;
    }
    if (p1Id === p2Id) {
      showToast("Please select two different players", "error");
      return;
    }

    const scoreResult = getStructuredScore("fs");
    if (scoreResult.error) {
      showToast(scoreResult.error, "error");
      return;
    }

    const winnerId = scoreResult.winnerSlot === "p1" ? p1Id : p2Id;
    const loserId = winnerId === p1Id ? p2Id : p1Id;
    const winner = getPlayerById(winnerId);
    const loser = getPlayerById(loserId);

    winner.friendlyWins = (winner.friendlyWins || 0) + 1;
    winner.lastPlayed = new Date().toISOString();

    loser.friendlyLosses = (loser.friendlyLosses || 0) + 1;
    loser.lastPlayed = new Date().toISOString();

    matches.unshift({
      id: generateId(),
      type: "friendly",
      player1Id: p1Id,
      player2Id: p2Id,
      winnerId,
      score: scoreResult.scoreText,
      positionChange: null,
      date: new Date().toISOString(),
    });

    persist();
    clearScoreInputs("fs");
    document.getElementById("friendly-player1").value = "";
    document.getElementById("friendly-player2").value = "";

    showToast(`Friendly match recorded! ${winner.name} defeats ${loser.name}`);
    refreshAll();
  }

  document
    .getElementById("submit-friendly-result-btn")
    .addEventListener("click", submitFriendlyResult);

  // --- Match History ---
  function renderHistory() {
    const container = document.getElementById("match-history-list");
    const emptyMsg = document.getElementById("history-empty");
    const filter = document.getElementById("history-filter").value;

    let filtered = matches;
    if (filter !== "all") {
      filtered = matches.filter((m) => m.type === filter);
    }

    if (filtered.length === 0) {
      container.innerHTML = "";
      emptyMsg.style.display = "block";
      container.appendChild(emptyMsg);
      return;
    }

    emptyMsg.style.display = "none";

    container.innerHTML = filtered
      .map((m) => {
        const p1Name = getPlayerName(m.player1Id);
        const p2Name = getPlayerName(m.player2Id);
        const winnerName = getPlayerName(m.winnerId);
        const loserName = m.winnerId === m.player1Id ? p2Name : p1Name;
        const typeClass =
          m.type === "challenge" ? "challenge-type" : "friendly-type";
        const cardClass =
          m.type === "friendly" ? "match-card friendly" : "match-card";

        return `<div class="${cardClass}">
                <div class="match-type ${typeClass}">${m.type}</div>
                <div class="match-players"><span class="winner">${escapeHtml(winnerName)}</span> def. ${escapeHtml(loserName)}</div>
                ${m.score ? `<div class="match-score">${escapeHtml(m.score)}</div>` : ""}
                ${m.positionChange ? `<div class="position-change">${escapeHtml(m.positionChange)}</div>` : ""}
                <div class="match-date">${formatDate(m.date)}</div>
            </div>`;
      })
      .join("");
  }

  document
    .getElementById("history-filter")
    .addEventListener("change", renderHistory);

  // --- Refresh All Views ---
  function refreshAll() {
    pruneExpiredChallenges();
    renderStandings();
    renderPlayers();
    renderChallenges();
    populateFriendlySelects();
    renderHistory();
    renderStats();
  }

  // --- HTML Escaping ---
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Expose functions for inline onclick handlers ---
  window.app = {
    removePlayer,
    movePlayer,
    editPlayer,
    cancelChallenge,
    notifyChallenge,
    unlockAdmin,
    lockAdmin,
    archiveSeason,
  };

  // --- Real-time Sync ---
  let dataLoaded = {
    players: false,
    challenges: false,
    matches: false,
    seasons: false,
  };

  function allDataLoaded() {
    return (
      dataLoaded.players &&
      dataLoaded.challenges &&
      dataLoaded.matches &&
      dataLoaded.seasons
    );
  }

  refs.players.on("value", function (snapshot) {
    players = snapshot.val() || [];
    dataLoaded.players = true;
    if (allDataLoaded()) refreshAll();
  });

  refs.challenges.on("value", function (snapshot) {
    challenges = snapshot.val() || [];
    dataLoaded.challenges = true;
    if (allDataLoaded()) refreshAll();
  });

  refs.matches.on("value", function (snapshot) {
    matches = snapshot.val() || [];
    dataLoaded.matches = true;
    if (allDataLoaded()) refreshAll();
  });

  refs.seasons.on("value", function (snapshot) {
    seasons = snapshot.val() || [];
    dataLoaded.seasons = true;
    if (allDataLoaded()) refreshAll();
  });

  // --- One-time migration from localStorage ---
  (function migrateFromLocalStorage() {
    var localPlayers;
    try {
      localPlayers = JSON.parse(localStorage.getItem("tennisLadder_players"));
    } catch (e) {
      return;
    }
    if (!localPlayers || !localPlayers.length) return;

    refs.players.once("value", function (snapshot) {
      if (snapshot.val() && snapshot.val().length) return;
      var localChallenges =
        JSON.parse(localStorage.getItem("tennisLadder_challenges")) || [];
      var localMatches =
        JSON.parse(localStorage.getItem("tennisLadder_matches")) || [];
      refs.players.set(localPlayers);
      refs.challenges.set(localChallenges);
      refs.matches.set(localMatches);
      showToast("Data migrated to cloud");
    });
  })();

  // --- Connection status ---
  db.ref(".info/connected").on("value", function (snap) {
    var el = document.getElementById("connection-status");
    if (el) {
      el.textContent = snap.val() ? "Live" : "Offline";
      el.className = snap.val()
        ? "status-badge status-online"
        : "status-badge status-offline";
    }
  });

  function getPlayerMatches(playerId) {
    return matches.filter(
      (m) => m.player1Id === playerId || m.player2Id === playerId,
    );
  }

  function renderStats() {
    const container = document.getElementById("player-stats-list");
    const emptyMsg = document.getElementById("stats-empty");

    if (!players.length) {
      container.innerHTML = "";
      emptyMsg.style.display = "block";
      container.appendChild(emptyMsg);
      return;
    }

    emptyMsg.style.display = "none";

    const sorted = [...players].sort((a, b) => a.position - b.position);

    container.innerHTML = sorted
      .map((player) => {
       const playerMatches = getPlayerMatches(player.id);
        const challengeWins = player.challengeWins || 0;
        const challengeLosses = player.challengeLosses || 0;
        const friendlyWins = player.friendlyWins || 0;
        const friendlyLosses = player.friendlyLosses || 0;
        const totalPlayed = playerMatches.length;

        const challengePlayed = challengeWins + challengeLosses;
        const challengeWinPct = challengePlayed
          ? Math.round((challengeWins / challengePlayed) * 100)
          : 0;

        return `
            <div class="match-card">
                <div class="match-players">${escapeHtml(player.name)}</div>
                <div class="match-score">
                    Position: #${player.position} · Challenge Played: ${challengePlayed} · Challenge W: ${challengeWins} · Challenge L: ${challengeLosses} · Challenge Win %: ${challengeWinPct}%
                </div>
                <div class="match-date">
Friendly W: ${friendlyWins} · Friendly L: ${friendlyLosses} · Last played: ${formatDate(player.lastPlayed)}                </div>
            </div>
        `;
      })
      .join("");
  }
})();
