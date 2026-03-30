// =====================================================================
// Club Tennis Ladder - Application Logic
// Data persisted to localStorage
// =====================================================================

(function () {
    'use strict';

    // --- Data Layer ---
    const STORAGE_KEYS = {
        players: 'tennisLadder_players',
        challenges: 'tennisLadder_challenges',
        matches: 'tennisLadder_matches',
    };

    function loadData(key) {
        try {
            return JSON.parse(localStorage.getItem(key)) || [];
        } catch {
            return [];
        }
    }

    function saveData(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }

    let players = loadData(STORAGE_KEYS.players);
    let challenges = loadData(STORAGE_KEYS.challenges);
    let matches = loadData(STORAGE_KEYS.matches);

    function persist() {
        saveData(STORAGE_KEYS.players, players);
        saveData(STORAGE_KEYS.challenges, challenges);
        saveData(STORAGE_KEYS.matches, matches);
    }

    // --- Utility ---
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function formatDate(iso) {
        if (!iso) return '–';
        const d = new Date(iso);
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function getPlayerById(id) {
        return players.find(p => p.id === id);
    }

    function getPlayerName(id) {
        const p = getPlayerById(id);
        return p ? p.name : 'Unknown';
    }

    // --- Toast Notification ---
    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = 'toast ' + type;
        // Force reflow
        void toast.offsetWidth;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    }

    // --- Confirmation Modal ---
    function showConfirm(title, message) {
        return new Promise(resolve => {
            const overlay = document.getElementById('confirm-modal');
            document.getElementById('confirm-title').textContent = title;
            document.getElementById('confirm-message').textContent = message;
            overlay.style.display = 'flex';

            function cleanup(result) {
                overlay.style.display = 'none';
                document.getElementById('confirm-ok').removeEventListener('click', onOk);
                document.getElementById('confirm-cancel').removeEventListener('click', onCancel);
                resolve(result);
            }

            function onOk() { cleanup(true); }
            function onCancel() { cleanup(false); }

            document.getElementById('confirm-ok').addEventListener('click', onOk);
            document.getElementById('confirm-cancel').addEventListener('click', onCancel);
        });
    }

    // --- Tab Navigation ---
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabSections = document.querySelectorAll('.tab-content');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            navButtons.forEach(b => b.classList.remove('active'));
            tabSections.forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
            refreshAll();
        });
    });

    // --- Standings ---
    function renderStandings() {
        const body = document.getElementById('standings-body');
        const emptyMsg = document.getElementById('standings-empty');
        const filter = document.getElementById('standings-filter').value;

        // Sort by ladder position
        const sorted = [...players].sort((a, b) => a.position - b.position);

        let filtered = sorted;
        if (filter === 'active') {
            const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
            filtered = sorted.filter(p => p.lastPlayed && new Date(p.lastPlayed).getTime() > thirtyDaysAgo);
        }

        if (filtered.length === 0) {
            body.innerHTML = '';
            emptyMsg.style.display = 'block';
            return;
        }
        emptyMsg.style.display = 'none';

        body.innerHTML = filtered.map(p => {
            const rankClass = p.position <= 3 ? `rank-${p.position}` : 'rank-default';
            const winPct = (p.wins + p.losses) > 0
                ? Math.round((p.wins / (p.wins + p.losses)) * 100) + '%'
                : '–';
            const streakText = p.streak
                ? (p.streak > 0 ? `W${p.streak}` : `L${Math.abs(p.streak)}`)
                : '–';
            const streakClass = p.streak > 0 ? 'streak-win' : (p.streak < 0 ? 'streak-loss' : '');

            return `<tr>
                <td class="col-rank"><span class="rank-badge ${rankClass}">${p.position}</span></td>
                <td><span class="player-name">${escapeHtml(p.name)}</span></td>
                <td class="col-stat">${p.wins}</td>
                <td class="col-stat">${p.losses}</td>
                <td class="col-stat">${winPct}</td>
                <td class="col-stat"><span class="${streakClass}">${streakText}</span></td>
                <td class="col-last">${formatDate(p.lastPlayed)}</td>
            </tr>`;
        }).join('');
    }

    document.getElementById('standings-filter').addEventListener('change', renderStandings);

    // --- Player Management ---
    function renderPlayers() {
        const list = document.getElementById('players-list');
        const emptyMsg = document.getElementById('players-empty');

        if (players.length === 0) {
            list.innerHTML = '';
            emptyMsg.style.display = 'block';
            return;
        }
        emptyMsg.style.display = 'none';

        const sorted = [...players].sort((a, b) => a.position - b.position);
        list.innerHTML = sorted.map(p => {
            const contact = [p.phone, p.email].filter(Boolean).join(' | ');
            return `<div class="player-card">
                <div class="player-info">
                    <span class="name">#${p.position} ${escapeHtml(p.name)}</span>
                    ${contact ? `<span class="contact">${escapeHtml(contact)}</span>` : ''}
                </div>
                <div class="player-actions">
                    <button class="btn btn-sm btn-secondary" onclick="app.movePlayer('${p.id}', -1)" title="Move up">&uarr;</button>
                    <button class="btn btn-sm btn-secondary" onclick="app.movePlayer('${p.id}', 1)" title="Move down">&darr;</button>
                    <button class="btn btn-sm btn-danger" onclick="app.removePlayer('${p.id}')">Remove</button>
                </div>
            </div>`;
        }).join('');
    }

    function addPlayer() {
        const nameInput = document.getElementById('player-name');
        const phoneInput = document.getElementById('player-phone');
        const emailInput = document.getElementById('player-email');

        const name = nameInput.value.trim();
        if (!name) {
            showToast('Please enter a player name', 'error');
            return;
        }

        if (players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
            showToast('A player with this name already exists', 'error');
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
            streak: 0,
            lastPlayed: null,
        };

        players.push(newPlayer);
        persist();

        nameInput.value = '';
        phoneInput.value = '';
        emailInput.value = '';

        showToast(`${name} added at position #${newPlayer.position}`);
        refreshAll();
    }

    document.getElementById('add-player-btn').addEventListener('click', addPlayer);
    document.getElementById('player-name').addEventListener('keydown', e => {
        if (e.key === 'Enter') addPlayer();
    });

    async function removePlayer(id) {
        const player = getPlayerById(id);
        if (!player) return;

        const ok = await showConfirm('Remove Player', `Remove ${player.name} from the ladder? This cannot be undone.`);
        if (!ok) return;

        const removedPos = player.position;
        players = players.filter(p => p.id !== id);

        // Close gaps in positions
        players.forEach(p => {
            if (p.position > removedPos) p.position--;
        });

        // Remove their open challenges
        challenges = challenges.filter(c => c.challengerId !== id && c.challengedId !== id);

        persist();
        showToast(`${player.name} removed`);
        refreshAll();
    }

    function movePlayer(id, direction) {
        const player = getPlayerById(id);
        if (!player) return;

        const targetPos = player.position + direction;
        if (targetPos < 1 || targetPos > players.length) return;

        const other = players.find(p => p.position === targetPos);
        if (other) {
            other.position = player.position;
        }
        player.position = targetPos;

        persist();
        refreshAll();
    }

    // --- Challenge System ---
    const MAX_CHALLENGE_DISTANCE = 3;

    function renderChallenges() {
        populateChallengerSelects();
        renderOpenChallenges();
        populateChallengeResultSelect();
    }

    function populateChallengerSelects() {
        const challengerSel = document.getElementById('challenger-select');
        const challengedSel = document.getElementById('challenged-select');

        const sorted = [...players].sort((a, b) => a.position - b.position);
        const options = sorted.map(p =>
            `<option value="${p.id}">#${p.position} ${escapeHtml(p.name)}</option>`
        ).join('');

        challengerSel.innerHTML = '<option value="">Select challenger...</option>' + options;
        challengedSel.innerHTML = '<option value="">Select opponent...</option>' + options;
    }

    function createChallenge() {
        const challengerId = document.getElementById('challenger-select').value;
        const challengedId = document.getElementById('challenged-select').value;

        if (!challengerId || !challengedId) {
            showToast('Please select both players', 'error');
            return;
        }

        if (challengerId === challengedId) {
            showToast('A player cannot challenge themselves', 'error');
            return;
        }

        const challenger = getPlayerById(challengerId);
        const challenged = getPlayerById(challengedId);

        if (challenger.position <= challenged.position) {
            showToast('Challenger must be ranked lower (higher number) than the opponent', 'error');
            return;
        }

        if (challenger.position - challenged.position > MAX_CHALLENGE_DISTANCE) {
            showToast(`Can only challenge players within ${MAX_CHALLENGE_DISTANCE} positions above`, 'error');
            return;
        }

        // Check for existing challenge between these players
        const existing = challenges.find(c =>
            (c.challengerId === challengerId && c.challengedId === challengedId) ||
            (c.challengerId === challengedId && c.challengedId === challengerId)
        );
        if (existing) {
            showToast('There is already an open challenge between these players', 'error');
            return;
        }

        challenges.push({
            id: generateId(),
            challengerId,
            challengedId,
            createdAt: new Date().toISOString(),
        });

        persist();
        showToast(`${challenger.name} has challenged ${challenged.name}!`);
        refreshAll();
    }

    document.getElementById('create-challenge-btn').addEventListener('click', createChallenge);

    function renderOpenChallenges() {
        const container = document.getElementById('open-challenges');
        const emptyMsg = document.getElementById('challenges-empty');

        if (challenges.length === 0) {
            container.innerHTML = '';
            emptyMsg.style.display = 'block';
            container.appendChild(emptyMsg);
            return;
        }
        emptyMsg.style.display = 'none';

        container.innerHTML = challenges.map(c => {
            const challenger = getPlayerById(c.challengerId);
            const challenged = getPlayerById(c.challengedId);
            if (!challenger || !challenged) return '';

            return `<div class="challenge-card">
                <div>
                    <div class="players">#${challenger.position} ${escapeHtml(challenger.name)} vs #${challenged.position} ${escapeHtml(challenged.name)}</div>
                    <div class="date">Created ${formatDate(c.createdAt)}</div>
                </div>
                <div class="actions">
                    <button class="btn btn-sm btn-danger" onclick="app.cancelChallenge('${c.id}')">Cancel</button>
                </div>
            </div>`;
        }).join('');
    }

    async function cancelChallenge(id) {
        const ok = await showConfirm('Cancel Challenge', 'Are you sure you want to cancel this challenge?');
        if (!ok) return;

        challenges = challenges.filter(c => c.id !== id);
        persist();
        showToast('Challenge cancelled');
        refreshAll();
    }

    // --- Record Results ---
    const toggleBtns = document.querySelectorAll('.toggle-btn');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            toggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('challenge-result-form').style.display =
                btn.dataset.type === 'challenge' ? 'block' : 'none';
            document.getElementById('friendly-result-form').style.display =
                btn.dataset.type === 'friendly' ? 'block' : 'none';
        });
    });

    function populateChallengeResultSelect() {
        const sel = document.getElementById('challenge-select-result');
        sel.innerHTML = '<option value="">Select an open challenge...</option>';

        challenges.forEach(c => {
            const challenger = getPlayerById(c.challengerId);
            const challenged = getPlayerById(c.challengedId);
            if (!challenger || !challenged) return;
            sel.innerHTML += `<option value="${c.id}">#${challenger.position} ${escapeHtml(challenger.name)} vs #${challenged.position} ${escapeHtml(challenged.name)}</option>`;
        });
    }

    document.getElementById('challenge-select-result').addEventListener('change', function () {
        const winnerSel = document.getElementById('challenge-winner');
        const challenge = challenges.find(c => c.id === this.value);

        if (!challenge) {
            winnerSel.innerHTML = '<option value="">Select winner...</option>';
            return;
        }

        winnerSel.innerHTML = `<option value="">Select winner...</option>
            <option value="${challenge.challengerId}">${escapeHtml(getPlayerName(challenge.challengerId))}</option>
            <option value="${challenge.challengedId}">${escapeHtml(getPlayerName(challenge.challengedId))}</option>`;
    });

    function populateFriendlySelects() {
        const sorted = [...players].sort((a, b) => a.position - b.position);
        const options = sorted.map(p =>
            `<option value="${p.id}">#${p.position} ${escapeHtml(p.name)}</option>`
        ).join('');

        document.getElementById('friendly-player1').innerHTML = '<option value="">Select player...</option>' + options;
        document.getElementById('friendly-player2').innerHTML = '<option value="">Select player...</option>' + options;
        document.getElementById('friendly-winner').innerHTML = '<option value="">Select winner...</option>';
    }

    function updateFriendlyWinner() {
        const p1 = document.getElementById('friendly-player1').value;
        const p2 = document.getElementById('friendly-player2').value;
        const winnerSel = document.getElementById('friendly-winner');

        if (!p1 || !p2 || p1 === p2) {
            winnerSel.innerHTML = '<option value="">Select winner...</option>';
            return;
        }

        winnerSel.innerHTML = `<option value="">Select winner...</option>
            <option value="${p1}">${escapeHtml(getPlayerName(p1))}</option>
            <option value="${p2}">${escapeHtml(getPlayerName(p2))}</option>`;
    }

    document.getElementById('friendly-player1').addEventListener('change', updateFriendlyWinner);
    document.getElementById('friendly-player2').addEventListener('change', updateFriendlyWinner);

    function getScoreFromInputs(prefix) {
        const sets = [];
        for (let i = 1; i <= 3; i++) {
            const p1 = document.getElementById(`${prefix}${i}p1`).value;
            const p2 = document.getElementById(`${prefix}${i}p2`).value;
            if (p1 !== '' && p2 !== '') {
                sets.push(`${p1}-${p2}`);
            }
        }
        return sets.length > 0 ? sets.join(', ') : null;
    }

    function clearScoreInputs(prefix) {
        for (let i = 1; i <= 3; i++) {
            document.getElementById(`${prefix}${i}p1`).value = '';
            document.getElementById(`${prefix}${i}p2`).value = '';
        }
    }

    function submitChallengeResult() {
        const challengeId = document.getElementById('challenge-select-result').value;
        const winnerId = document.getElementById('challenge-winner').value;

        if (!challengeId) {
            showToast('Please select a challenge', 'error');
            return;
        }
        if (!winnerId) {
            showToast('Please select the winner', 'error');
            return;
        }

        const challenge = challenges.find(c => c.id === challengeId);
        if (!challenge) return;

        const challenger = getPlayerById(challenge.challengerId);
        const challenged = getPlayerById(challenge.challengedId);
        const loserId = winnerId === challenge.challengerId ? challenge.challengedId : challenge.challengerId;
        const winner = getPlayerById(winnerId);
        const loser = getPlayerById(loserId);

        const score = getScoreFromInputs('s');

        let positionChange = null;

        // If challenger wins, they take the challenged player's position
        // Everyone between shifts down by one
        if (winnerId === challenge.challengerId) {
            const oldChallengerPos = challenger.position;
            const challengedPos = challenged.position;

            // Move everyone between challenged and challenger down one spot
            players.forEach(p => {
                if (p.position >= challengedPos && p.position < oldChallengerPos && p.id !== challenger.id) {
                    p.position++;
                }
            });

            challenger.position = challengedPos;
            positionChange = `${winner.name} moves from #${oldChallengerPos} to #${challengedPos}`;
        }

        // Update stats
        winner.wins++;
        winner.streak = winner.streak > 0 ? winner.streak + 1 : 1;
        winner.lastPlayed = new Date().toISOString();

        loser.losses++;
        loser.streak = loser.streak < 0 ? loser.streak - 1 : -1;
        loser.lastPlayed = new Date().toISOString();

        // Record match
        matches.unshift({
            id: generateId(),
            type: 'challenge',
            player1Id: challenge.challengerId,
            player2Id: challenge.challengedId,
            winnerId,
            score,
            positionChange,
            date: new Date().toISOString(),
        });

        // Remove the challenge
        challenges = challenges.filter(c => c.id !== challengeId);

        persist();
        clearScoreInputs('s');
        document.getElementById('challenge-select-result').value = '';
        document.getElementById('challenge-winner').innerHTML = '<option value="">Select winner...</option>';

        showToast(`Result recorded! ${winner.name} defeats ${loser.name}`);
        refreshAll();
    }

    document.getElementById('submit-challenge-result-btn').addEventListener('click', submitChallengeResult);

    function submitFriendlyResult() {
        const p1Id = document.getElementById('friendly-player1').value;
        const p2Id = document.getElementById('friendly-player2').value;
        const winnerId = document.getElementById('friendly-winner').value;

        if (!p1Id || !p2Id) {
            showToast('Please select both players', 'error');
            return;
        }
        if (p1Id === p2Id) {
            showToast('Please select two different players', 'error');
            return;
        }
        if (!winnerId) {
            showToast('Please select the winner', 'error');
            return;
        }

        const winner = getPlayerById(winnerId);
        const loserId = winnerId === p1Id ? p2Id : p1Id;
        const loser = getPlayerById(loserId);

        const score = getScoreFromInputs('fs');

        // Update stats (no position change for friendly)
        winner.wins++;
        winner.streak = winner.streak > 0 ? winner.streak + 1 : 1;
        winner.lastPlayed = new Date().toISOString();

        loser.losses++;
        loser.streak = loser.streak < 0 ? loser.streak - 1 : -1;
        loser.lastPlayed = new Date().toISOString();

        matches.unshift({
            id: generateId(),
            type: 'friendly',
            player1Id: p1Id,
            player2Id: p2Id,
            winnerId,
            score,
            positionChange: null,
            date: new Date().toISOString(),
        });

        persist();
        clearScoreInputs('fs');
        document.getElementById('friendly-player1').value = '';
        document.getElementById('friendly-player2').value = '';
        document.getElementById('friendly-winner').innerHTML = '<option value="">Select winner...</option>';

        showToast(`Friendly match recorded! ${winner.name} defeats ${loser.name}`);
        refreshAll();
    }

    document.getElementById('submit-friendly-result-btn').addEventListener('click', submitFriendlyResult);

    // --- Match History ---
    function renderHistory() {
        const container = document.getElementById('match-history-list');
        const emptyMsg = document.getElementById('history-empty');
        const filter = document.getElementById('history-filter').value;

        let filtered = matches;
        if (filter !== 'all') {
            filtered = matches.filter(m => m.type === filter);
        }

        if (filtered.length === 0) {
            container.innerHTML = '';
            emptyMsg.style.display = 'block';
            container.appendChild(emptyMsg);
            return;
        }
        emptyMsg.style.display = 'none';

        container.innerHTML = filtered.map(m => {
            const p1Name = getPlayerName(m.player1Id);
            const p2Name = getPlayerName(m.player2Id);
            const winnerName = getPlayerName(m.winnerId);
            const loserName = m.winnerId === m.player1Id ? p2Name : p1Name;
            const typeClass = m.type === 'challenge' ? 'challenge-type' : 'friendly-type';
            const cardClass = m.type === 'friendly' ? 'match-card friendly' : 'match-card';

            return `<div class="${cardClass}">
                <div class="match-type ${typeClass}">${m.type}</div>
                <div class="match-players"><span class="winner">${escapeHtml(winnerName)}</span> def. ${escapeHtml(loserName)}</div>
                ${m.score ? `<div class="match-score">${escapeHtml(m.score)}</div>` : ''}
                ${m.positionChange ? `<div class="position-change">${escapeHtml(m.positionChange)}</div>` : ''}
                <div class="match-date">${formatDate(m.date)}</div>
            </div>`;
        }).join('');
    }

    document.getElementById('history-filter').addEventListener('change', renderHistory);

    // --- Refresh All Views ---
    function refreshAll() {
        renderStandings();
        renderPlayers();
        renderChallenges();
        populateFriendlySelects();
        renderHistory();
    }

    // --- HTML Escaping ---
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // --- Expose functions for inline onclick handlers ---
    window.app = {
        removePlayer,
        movePlayer,
        cancelChallenge,
    };

    // --- Init ---
    refreshAll();

})();
