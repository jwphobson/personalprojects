// =====================================================================
// Club Tennis Ladder - Application Logic
// Data synced in real-time via Firebase
// =====================================================================

(function () {
  "use strict";

  const ADMIN_PIN = "2504";
  const ADMIN_STORAGE_KEY = "tennisLadder_adminVerified";
  const MAX_CHALLENGE_DISTANCE = 2;
  const CHALLENGE_EXPIRY_DAYS = 14;

  let adminVerified = localStorage.getItem(ADMIN_STORAGE_KEY) === "true";

  if (adminVerified) {
    document.body.classList.add("admin-enabled");
  }

  function getEl(id) {
    return document.getElementById(id);
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
    friendlyChallenges: db.ref("friendlyChallenges"),
    matches: db.ref("matches"),
    seasons: db.ref("seasons"),
  };

  let players = [];
  let challenges = [];
  let friendlyChallenges = [];
  let matches = [];
  let seasons = [];

  function persist() {
    refs.players.set(players);
    refs.challenges.set(challenges);
    refs.friendlyChallenges.set(friendlyChallenges);
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
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function getChallengeExpiryDate(createdAt) {
    const created = new Date(createdAt);
    created.setDate(created.getDate() + CHALLENGE_EXPIRY_DAYS);
    return created;
  }

  function isExpired(item) {
    return new Date() > getChallengeExpiryDate(item.createdAt);
  }

  // --- Toast Notification ---
  function showToast(message, type = "success") {
    const toast = getEl("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.className = "toast " + type;
    void toast.offsetWidth;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
  }

  // --- Confirmation Modal ---
  function showConfirm(title, message) {
    return new Promise((resolve) => {
      const overlay = getEl("confirm-modal");
      const titleEl = getEl("confirm-title");
      const messageEl = getEl("confirm-message");
      const okBtn = getEl("confirm-ok");
      const cancelBtn = getEl("confirm-cancel");

      if (!overlay || !titleEl || !messageEl || !okBtn || !cancelBtn) {
        resolve(window.confirm(message));
        return;
      }

      titleEl.textContent = title;
      messageEl.textContent = message;
      overlay.style.display = "flex";

      function cleanup(result) {
        overlay.style.display = "none";
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        resolve(result);
      }

      function onOk() {
        cleanup(true);
      }

      function onCancel() {
        cleanup(false);
      }

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
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
      const target = getEl(btn.dataset.tab);
      if (target) target.classList.add("active");
      refreshAll();
    });
  });

  // --- Standings ---
  function renderStandings() {
    const body = getEl("standings-body");
    const emptyMsg = getEl("standings-empty");
    const filterEl = getEl("standings-filter");

    if (!body || !emptyMsg) return;

    const filter = filterEl ? filterEl.value : "all";
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

  const standingsFilter = getEl("standings-filter");
  if (standingsFilter) {
    standingsFilter.addEventListener("change", renderStandings);
  }

  // --- Friendly Standings ---
  function renderFriendlies() {
    const body = getEl("friendlies-body");
    const emptyMsg = getEl("friendlies-empty");

    if (!body || !emptyMsg) return;

    const sorted = [...players].sort((a, b) => a.position - b.position);

    if (sorted.length === 0) {
      body.innerHTML = "";
      emptyMsg.style.display = "block";
      return;
    }

    body.innerHTML = sorted
      .map((p) => {
        const rankClass =
          p.position <= 3 ? `rank-${p.position}` : "rank-default";
        const friendlyWins = p.friendlyWins || 0;
        const friendlyLosses = p.friendlyLosses || 0;
        const played = friendlyWins + friendlyLosses;
        const winPct =
          played > 0
            ? Math.round((friendlyWins / played) * 100) + "%"
            : "–";

        return `<tr>
          <td class="col-rank"><span class="rank-badge ${rankClass}">${p.position}</span></td>
          <td><span class="player-name">${escapeHtml(p.name)}</span></td>
          <td class="col-stat">${friendlyWins}</td>
          <td class="col-stat">${friendlyLosses}</td>
          <td class="col-stat">${winPct}</td>
          <td class="col-last">${formatDate(p.lastFriendlyPlayed)}</td>
        </tr>`;
      })
      .join("");

    emptyMsg.style.display = "none";
  }

  // --- Player Management ---
  function renderPlayers() {
    const list = getEl("players-list");
    const emptyMsg = getEl("players-empty");

    if (!list || !emptyMsg) return;

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

    const nameInput = getEl("player-name");
    const phoneInput = getEl("player-phone");
    const emailInput = getEl("player-email");

    if (!nameInput || !phoneInput || !emailInput) return;

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
      lastFriendlyPlayed: null,
    };

    players.push(newPlayer);
    persist();

    nameInput.value = "";
    phoneInput.value = "";
    emailInput.value = "";

    showToast(`${name} added at position #${newPlayer.position}`);
    refreshAll();
  }

  const addPlayerBtn = getEl("add-player-btn");
  if (addPlayerBtn) addPlayerBtn.addEventListener("click", addPlayer);

  const playerNameInput = getEl("player-name");
  if (playerNameInput) {
    playerNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addPlayer();
    });
  }

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
    friendlyChallenges = friendlyChallenges.filter(
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

    const idEl = getEl("edit-player-id");
    const nameEl = getEl("edit-player-name");
    const phoneEl = getEl("edit-player-phone");
    const emailEl = getEl("edit-player-email");
    const modal = getEl("edit-player-modal");

    if (!idEl || !nameEl || !phoneEl || !emailEl || !modal) return;

    idEl.value = id;
    nameEl.value = player.name;
    phoneEl.value = player.phone || "";
    emailEl.value = player.email || "";
    modal.style.display = "flex";
  }

  const editCancel = getEl("edit-player-cancel");
  if (editCancel) {
    editCancel.addEventListener("click", () => {
      const modal = getEl("edit-player-modal");
      if (modal) modal.style.display = "none";
    });
  }

  const editSave = getEl("edit-player-save");
  if (editSave) {
    editSave.addEventListener("click", () => {
      if (!requireAdmin()) return;

      const idEl = getEl("edit-player-id");
      const nameEl = getEl("edit-player-name");
      const phoneEl = getEl("edit-player-phone");
      const emailEl = getEl("edit-player-email");
      const modal = getEl("edit-player-modal");

      if (!idEl || !nameEl || !phoneEl || !emailEl || !modal) return;

      const id = idEl.value;
      const player = getPlayerById(id);
      if (!player) return;

      const name = nameEl.value.trim();
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
      player.phone = phoneEl.value.trim();
      player.email = emailEl.value.trim();

      persist();
      modal.style.display = "none";
      showToast(`${name} updated`);
      refreshAll();
    });
  }

  // --- Challenge System ---
  function pruneExpiredChallenges() {
    const beforeNormal = challenges.length;
    const beforeFriendly = friendlyChallenges.length;

    challenges = challenges.filter((c) => !isExpired(c));
    friendlyChallenges = friendlyChallenges.filter((c) => !isExpired(c));

    if (
      challenges.length !== beforeNormal ||
      friendlyChallenges.length !== beforeFriendly
    ) {
      persist();
    }
  }

  function populateChallengerSelects() {
    const challengerSel = getEl("challenger-select");
    const challengedSel = getEl("challenged-select");
    if (!challengerSel || !challengedSel) return;

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

  function populateFriendlyChallengeSelects() {
    const challengerSel = getEl("friendly-challenger-select");
    const challengedSel = getEl("friendly-challenged-select");
    if (!challengerSel || !challengedSel) return;

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
    const challengerId = getEl("challenger-select")?.value;
    const challengedId = getEl("challenged-select")?.value;

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

    if (!challenger || !challenged) return;

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
    notifyChallenge(newChallengeId, "challenge");
  }

  function createFriendlyChallenge() {
    const challengerId = getEl("friendly-challenger-select")?.value;
    const challengedId = getEl("friendly-challenged-select")?.value;

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

    if (!challenger || !challenged) return;

    const existing = friendlyChallenges.find(
      (c) =>
        (c.challengerId === challengerId && c.challengedId === challengedId) ||
        (c.challengerId === challengedId && c.challengedId === challengerId),
    );
    if (existing) {
      showToast(
        "There is already an open friendly challenge between these players",
        "error",
      );
      return;
    }

    const newChallengeId = generateId();
    friendlyChallenges.push({
      id: newChallengeId,
      challengerId,
      challengedId,
      createdAt: new Date().toISOString(),
    });

    persist();
    showToast(`${challenger.name} has invited ${challenged.name} to a friendly`);
    refreshAll();
    notifyChallenge(newChallengeId, "friendly");
  }

  const createChallengeBtn = getEl("create-challenge-btn");
  if (createChallengeBtn) {
    createChallengeBtn.addEventListener("click", createChallenge);
  }

  const createFriendlyChallengeBtn = getEl("create-friendly-challenge-btn");
  if (createFriendlyChallengeBtn) {
    createFriendlyChallengeBtn.addEventListener("click", createFriendlyChallenge);
  }

  async function notifyChallenge(challengeId, type = "challenge") {
    const source = type === "friendly" ? friendlyChallenges : challenges;
    const challenge = source.find((c) => c.id === challengeId);
    if (!challenge) return;

    const challenger = getPlayerById(challenge.challengerId);
    const challenged = getPlayerById(challenge.challengedId);
    if (!challenger || !challenged) return;

    const ladderUrl = window.location.href.split("#")[0];
    const message =
      type === "friendly"
        ? `Hi ${challenged.name}, you've been invited by ${challenger.name} to play a friendly on the tennis ladder. Please arrange your match within ${CHALLENGE_EXPIRY_DAYS} days.\n\nLadder: ${ladderUrl}`
        : `Hi ${challenged.name}, you've been challenged by ${challenger.name} on the tennis ladder. Please arrange your match within ${CHALLENGE_EXPIRY_DAYS} days.\n\nLadder: ${ladderUrl}`;

    const subject =
      type === "friendly"
        ? "Tennis Ladder Friendly Challenge"
        : "Tennis Ladder Challenge";

    if (challenged.phone) {
      const phone = normaliseUkPhone(challenged.phone);
      window.open(
        `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
        "_blank",
      );
      return;
    }

    if (challenged.email) {
      window.location.href = `mailto:${challenged.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      return;
    }

    if (navigator.share) {
      navigator
        .share({
          title: subject,
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
    const container = getEl("open-challenges");
    const emptyMsg = getEl("challenges-empty");

    if (!container || !emptyMsg) return;

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
            <button class="btn btn-sm btn-notify" onclick="app.notifyChallenge('${c.id}', 'challenge')">Notify</button>
            <button class="btn btn-sm btn-danger" onclick="app.cancelChallenge('${c.id}')">Cancel</button>
          </div>
        </div>`;
      })
      .join("");
  }

  function renderOpenFriendlyChallenges() {
    const container = getEl("open-friendly-challenges");
    const emptyMsg = getEl("friendly-challenges-empty");

    if (!container || !emptyMsg) return;

    if (friendlyChallenges.length === 0) {
      container.innerHTML = "";
      emptyMsg.style.display = "block";
      container.appendChild(emptyMsg);
      return;
    }

    emptyMsg.style.display = "none";

    container.innerHTML = friendlyChallenges
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
            <button class="btn btn-sm btn-notify" onclick="app.notifyChallenge('${c.id}', 'friendly')">Notify</button>
            <button class="btn btn-sm btn-danger" onclick="app.cancelFriendlyChallenge('${c.id}')">Cancel</button>
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

  async function cancelFriendlyChallenge(id) {
    const ok = await showConfirm(
      "Cancel Friendly Challenge",
      "Are you sure you want to cancel this friendly challenge?",
    );
    if (!ok) return;

    friendlyChallenges = friendlyChallenges.filter((c) => c.id !== id);
    persist();
    showToast("Friendly challenge cancelled");
    refreshAll();
  }

  async function archiveSeason() {
    if (!requireAdmin()) return;

    const ok = await showConfirm(
      "Archive Season",
      "Archive current season and reset ladder, matches, and challenges?",
    );
    if (!ok) return;

    const archivedSeason = {
      id: generateId(),
      archivedAt: new Date().toISOString(),
      players: [...players].sort((a, b) => a.position - b.position).map((p) => ({ ...p })),
      challenges: challenges.map((c) => ({ ...c })),
      friendlyChallenges: friendlyChallenges.map((c) => ({ ...c })),
      matches: matches.map((m) => ({ ...m })),
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
        lastFriendlyPlayed: null,
      }));

    challenges = [];
    friendlyChallenges = [];
    matches = [];

    refs.seasons.set(seasons);
    persist();

    showToast("Season archived and ladder reset");
    refreshAll();
  }

  // --- Record Results ---
  function populateChallengeResultSelect() {
    const sel = getEl("challenge-select-result");
    if (!sel) return;

    sel.innerHTML = '<option value="">Select an open ladder challenge...</option>';

    challenges.forEach((c) => {
      const challenger = getPlayerById(c.challengerId);
      const challenged = getPlayerById(c.challengedId);
      if (!challenger || !challenged) return;

      sel.innerHTML += `<option value="${c.id}">
        #${challenger.position} ${escapeHtml(challenger.name)} vs #${challenged.position} ${escapeHtml(challenged.name)}
      </option>`;
    });
  }

  function populateFriendlyChallengeResultSelect() {
    const sel = getEl("friendly-challenge-select-result");
    if (!sel) return;

    sel.innerHTML = '<option value="">Select an open friendly challenge...</option>';

    friendlyChallenges.forEach((c) => {
      const challenger = getPlayerById(c.challengerId);
      const challenged = getPlayerById(c.challengedId);
      if (!challenger || !challenged) return;

      sel.innerHTML += `<option value="${c.id}">
        #${challenger.position} ${escapeHtml(challenger.name)} vs #${challenged.position} ${escapeHtml(challenged.name)}
      </option>`;
    });
  }

  function parseScoreValue(id) {
    const el = getEl(id);
    if (!el) return null;

    const value = el.value.trim();
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
      const el = getEl(id);
      if (el) el.value = "";
    });
  }

  function submitChallengeResult() {
    const challengeId = getEl("challenge-select-result")?.value;

    if (!challengeId) {
      showToast("Please select a ladder challenge", "error");
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
    if (!challenger || !challenged) return;

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
    if (!winner || !loser) return;

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

    const now = new Date().toISOString();

    winner.wins = (winner.wins || 0) + 1;
    winner.challengeWins = (winner.challengeWins || 0) + 1;
    winner.streak = winner.streak > 0 ? winner.streak + 1 : 1;
    winner.lastPlayed = now;

    loser.losses = (loser.losses || 0) + 1;
    loser.challengeLosses = (loser.challengeLosses || 0) + 1;
    loser.streak = loser.streak < 0 ? loser.streak - 1 : -1;
    loser.lastPlayed = now;

    matches.unshift({
      id: generateId(),
      type: "challenge",
      player1Id: challenge.challengerId,
      player2Id: challenge.challengedId,
      winnerId,
      score: scoreResult.scoreText,
      positionChange,
      date: now,
    });

    challenges = challenges.filter((c) => c.id !== challengeId);

    persist();
    clearScoreInputs("s");
    const sel = getEl("challenge-select-result");
    if (sel) sel.value = "";

    showToast(`Result recorded! ${winner.name} defeats ${loser.name}`);
    refreshAll();
  }

  const submitChallengeBtn = getEl("submit-challenge-result-btn");
  if (submitChallengeBtn) {
    submitChallengeBtn.addEventListener("click", submitChallengeResult);
  }

  function submitFriendlyResult() {
    const challengeId = getEl("friendly-challenge-select-result")?.value;

    if (!challengeId) {
      showToast("Please select a friendly challenge", "error");
      return;
    }

    const challenge = friendlyChallenges.find((c) => c.id === challengeId);
    if (!challenge) return;

    const scoreResult = getStructuredScore("fs");
    if (scoreResult.error) {
      showToast(scoreResult.error, "error");
      return;
    }

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
    if (!winner || !loser) return;

    const now = new Date().toISOString();

    winner.friendlyWins = (winner.friendlyWins || 0) + 1;
    winner.lastPlayed = now;
    winner.lastFriendlyPlayed = now;

    loser.friendlyLosses = (loser.friendlyLosses || 0) + 1;
    loser.lastPlayed = now;
    loser.lastFriendlyPlayed = now;

    matches.unshift({
      id: generateId(),
      type: "friendly",
      player1Id: challenge.challengerId,
      player2Id: challenge.challengedId,
      winnerId,
      score: scoreResult.scoreText,
      positionChange: null,
      date: now,
    });

    friendlyChallenges = friendlyChallenges.filter((c) => c.id !== challengeId);

    persist();
    clearScoreInputs("fs");
    const sel = getEl("friendly-challenge-select-result");
    if (sel) sel.value = "";

    showToast(`Friendly recorded! ${winner.name} defeats ${loser.name}`);
    refreshAll();
  }

  const submitFriendlyBtn = getEl("submit-friendly-result-btn");
  if (submitFriendlyBtn) {
    submitFriendlyBtn.addEventListener("click", submitFriendlyResult);
  }

  // --- Match History ---
  function renderHistory() {
    const container = getEl("match-history-list");
    const emptyMsg = getEl("history-empty");
    const filterEl = getEl("history-filter");

    if (!container || !emptyMsg) return;

    const filter = filterEl ? filterEl.value : "all";

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

  const historyFilter = getEl("history-filter");
  if (historyFilter) {
    historyFilter.addEventListener("change", renderHistory);
  }

  // --- Stats ---
  function getPlayerMatches(playerId) {
    return matches.filter(
      (m) => m.player1Id === playerId || m.player2Id === playerId,
    );
  }

  function renderStats() {
    const container = getEl("player-stats-list");
    const emptyMsg = getEl("stats-empty");

    if (!container || !emptyMsg) return;

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
              Position: #${player.position} · Total Played: ${totalPlayed} · Challenge Played: ${challengePlayed} · Challenge W: ${challengeWins} · Challenge L: ${challengeLosses} · Challenge Win %: ${challengeWinPct}%
            </div>
            <div class="match-date">
              Friendly W: ${friendlyWins} · Friendly L: ${friendlyLosses} · Last played: ${formatDate(player.lastPlayed)}
            </div>
          </div>
        `;
      })
      .join("");
  }

  // --- Refresh All Views ---
  function refreshAll() {
    pruneExpiredChallenges();
    renderStandings();
    renderFriendlies();
    renderPlayers();
    populateChallengerSelects();
    populateFriendlyChallengeSelects();
    renderOpenChallenges();
    renderOpenFriendlyChallenges();
    populateChallengeResultSelect();
    populateFriendlyChallengeResultSelect();
    renderHistory();
    renderStats();
  }

  // --- Expose functions for inline onclick handlers ---
  window.app = {
    removePlayer,
    movePlayer,
    editPlayer,
    cancelChallenge,
    cancelFriendlyChallenge,
    notifyChallenge,
    unlockAdmin,
    lockAdmin,
    archiveSeason,
  };

  // --- Real-time Sync ---
  const dataLoaded = {
    players: false,
    challenges: false,
    friendlyChallenges: false,
    matches: false,
    seasons: false,
  };

  function allDataLoaded() {
    return (
      dataLoaded.players &&
      dataLoaded.challenges &&
      dataLoaded.friendlyChallenges &&
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

  refs.friendlyChallenges.on("value", function (snapshot) {
    friendlyChallenges = snapshot.val() || [];
    dataLoaded.friendlyChallenges = true;
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
    let localPlayers;
    try {
      localPlayers = JSON.parse(localStorage.getItem("tennisLadder_players"));
    } catch (e) {
      return;
    }

    if (!localPlayers || !localPlayers.length) return;

    refs.players.once("value", function (snapshot) {
      if (snapshot.val() && snapshot.val().length) return;

      const localChallenges =
        JSON.parse(localStorage.getItem("tennisLadder_challenges")) || [];
      const localFriendlyChallenges =
        JSON.parse(localStorage.getItem("tennisLadder_friendlyChallenges")) || [];
      const localMatches =
        JSON.parse(localStorage.getItem("tennisLadder_matches")) || [];

      refs.players.set(localPlayers);
      refs.challenges.set(localChallenges);
      refs.friendlyChallenges.set(localFriendlyChallenges);
      refs.matches.set(localMatches);

      showToast("Data migrated to cloud");
    });
  })();

  // --- Connection status ---
  db.ref(".info/connected").on("value", function (snap) {
    const el = getEl("connection-status");
    if (!el) return;

    el.textContent = snap.val() ? "Live" : "Offline";
    el.className = snap.val()
      ? "status-badge status-online"
      : "status-badge status-offline";
  });
})();