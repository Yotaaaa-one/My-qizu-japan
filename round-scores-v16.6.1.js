(function() {
  const VERSION = 'v16.6.1';
  const HOLES_PER_ROUND = 18;
  let lastAppliedRound = null;
  let installing = false;

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.floor(n)));
  }

  function cloneObject(value) {
    try {
      return JSON.parse(JSON.stringify(value || {}));
    } catch (e) {
      return {};
    }
  }

  function hasState() {
    return typeof state !== 'undefined' && state && Array.isArray(state.groups);
  }

  function roundCount() {
    if (!hasState()) return 1;
    return clamp(state.roundCount || 1, 1, 4);
  }

  function scorerDeviceRound() {
    try {
      const page = String(window.location?.pathname || '').split('/').pop().toLowerCase();
      if (!page.includes('scorer')) return null;
      const lock = JSON.parse(localStorage.getItem('pga_score_v1646_device_lock') || 'null');
      if (!lock || !lock.round) return null;
      const requestedTournament = new URLSearchParams(window.location.search || '').get('tournament');
      if (requestedTournament && lock.tournamentId && String(requestedTournament) !== String(lock.tournamentId)) return null;
      return clamp(lock.round, 1, roundCount());
    } catch (error) {
      return null;
    }
  }

  function currentRound() {
    if (!hasState()) return 1;
    return scorerDeviceRound() || clamp(state.currentRound || 1, 1, roundCount());
  }

  function roundLabel() {
    return `Round ${currentRound()} / ${roundCount()}`;
  }

  function hasLegacyScores(player) {
    return ['scores', 'shots', 'testScores', 'testShots'].some(key => {
      const value = player && player[key];
      return value && typeof value === 'object' && Object.keys(value).length > 0;
    });
  }

  function emptyRoundStore() {
    return { scores: {}, shots: {}, testScores: {}, testShots: {} };
  }

  function ensurePlayerRounds(player) {
    if (!player || typeof player !== 'object') return emptyRoundStore();
    if (!player.rounds || typeof player.rounds !== 'object' || Array.isArray(player.rounds)) {
      player.rounds = {};
    }

    if (!player.rounds['1'] && hasLegacyScores(player)) {
      player.rounds['1'] = {
        scores: cloneObject(player.scores),
        shots: cloneObject(player.shots),
        testScores: cloneObject(player.testScores),
        testShots: cloneObject(player.testShots)
      };
    }

    for (let round = 1; round <= roundCount(); round += 1) {
      const key = String(round);
      if (!player.rounds[key] || typeof player.rounds[key] !== 'object') player.rounds[key] = emptyRoundStore();
      const store = player.rounds[key];
      if (!store.scores || typeof store.scores !== 'object') store.scores = {};
      if (!store.shots || typeof store.shots !== 'object') store.shots = {};
      if (!store.testScores || typeof store.testScores !== 'object') store.testScores = {};
      if (!store.testShots || typeof store.testShots !== 'object') store.testShots = {};
    }

    return player.rounds[String(currentRound())] || emptyRoundStore();
  }

  function roundStore(player, round = currentRound()) {
    ensurePlayerRounds(player);
    const key = String(clamp(round, 1, roundCount()));
    if (!player.rounds[key]) player.rounds[key] = emptyRoundStore();
    return player.rounds[key];
  }

  function syncPlayerAlias(player) {
    const store = roundStore(player, currentRound());
    player.scores = store.scores;
    player.shots = store.shots;
    player.testScores = store.testScores;
    player.testShots = store.testShots;
  }

  function normalizeRoundScores() {
    if (!hasState()) return;
    state.roundCount = roundCount();
    if (!scorerDeviceRound()) state.currentRound = currentRound();
    state.selectedHole = clamp(state.selectedHole || 1, 1, HOLES_PER_ROUND);
    state.groups.forEach(group => {
      (group.players || []).forEach(player => syncPlayerAlias(player));
    });
  }

  function scoreMap(player, round = currentRound()) {
    return roundStore(player, round).scores;
  }

  function testScoreMap(player, round = currentRound()) {
    return roundStore(player, round).testScores;
  }

  function shotsMap(player, round = currentRound()) {
    return roundStore(player, round).shots;
  }

  function testShotsMap(player, round = currentRound()) {
    return roundStore(player, round).testShots;
  }

  function isCurrentTestMode() {
    try {
      return typeof isTestMode === 'function' ? Boolean(isTestMode()) : false;
    } catch (e) {
      return false;
    }
  }

  function mapForMode(player) {
    return isCurrentTestMode() ? testScoreMap(player) : scoreMap(player);
  }

  function shotsForMode(player) {
    return isCurrentTestMode() ? testShotsMap(player) : shotsMap(player);
  }

  function holeKey(hole = state?.selectedHole) {
    return 'h' + clamp(hole || 1, 1, HOLES_PER_ROUND);
  }

  function scoreEntriesThroughRound(player) {
    const entries = [];
    for (let round = 1; round <= currentRound(); round += 1) {
      const scores = scoreMap(player, round);
      for (let hole = 1; hole <= HOLES_PER_ROUND; hole += 1) {
        const key = 'h' + hole;
        if (scores[key] != null && scores[key] !== '') {
          entries.push({ round, hole, score: Number(scores[key]) });
        }
      }
    }
    return entries;
  }

  function parForHole(hole) {
    try {
      return typeof getParForHole === 'function' ? Number(getParForHole(hole)) : Number(state?.coursePar?.[hole] || 4);
    } catch (e) {
      return Number(state?.coursePar?.[hole] || 4);
    }
  }

  function totalScoreRoundAware(player) {
    return scoreEntriesThroughRound(player).reduce((sum, row) => sum + Number(row.score || 0), 0);
  }

  function holesCompletedRoundAware(player) {
    return scoreEntriesThroughRound(player).length;
  }

  function parTotalRoundAware(player) {
    return scoreEntriesThroughRound(player).reduce((sum, row) => sum + parForHole(row.hole), 0);
  }

  function playerScoreToParRoundAware(player) {
    const entries = scoreEntriesThroughRound(player);
    if (!entries.length) return 0;
    return totalScoreRoundAware(player) - parTotalRoundAware(player);
  }

  function currentRoundSubtotal(player, holes) {
    const scores = scoreMap(player);
    const values = holes.map(h => scores['h' + h]).filter(v => v != null && v !== '').map(Number);
    return values.length ? values.reduce((sum, n) => sum + n, 0) : '-';
  }

  function currentRoundToPar(player, holes) {
    const scores = scoreMap(player);
    const played = holes.filter(h => scores['h' + h] != null && scores['h' + h] !== '');
    if (!played.length) return '-';
    const score = played.reduce((sum, h) => sum + Number(scores['h' + h]), 0);
    const par = played.reduce((sum, h) => sum + parForHole(h), 0);
    return typeof parDiffLabel === 'function' ? parDiffLabel(score - par) : String(score - par);
  }

  function isGroupHoleComplete(group, hole, testMode) {
    const active = typeof activePlayers === 'function'
      ? activePlayers(group)
      : (group?.players || []).filter(p => p.status !== 'withdrawn');
    if (!active.length) return false;
    const key = holeKey(hole);
    return active.every(player => {
      const map = testMode ? testScoreMap(player) : scoreMap(player);
      return map[key] != null;
    });
  }

  function roundHoleLocalKey(groupId) {
    const tournament = typeof FIREBASE_TOURNAMENT_ID !== 'undefined' ? FIREBASE_TOURNAMENT_ID : 'default';
    return `pga_score_current_hole_${tournament}_g${Number(groupId)}_r${currentRound()}`;
  }

  function legacyHoleLocalKey(groupId) {
    const tournament = typeof FIREBASE_TOURNAMENT_ID !== 'undefined' ? FIREBASE_TOURNAMENT_ID : 'default';
    return `pga_score_current_hole_${tournament}_g${Number(groupId)}`;
  }

  function saveRoundCurrentHole(groupId, hole) {
    const h = clamp(hole, 1, HOLES_PER_ROUND);
    if (!groupId || !h) return;
    try {
      localStorage.setItem(roundHoleLocalKey(groupId), String(h));
    } catch (e) {}
  }

  function loadRoundCurrentHole(groupId) {
    try {
      const direct = Number(localStorage.getItem(roundHoleLocalKey(groupId)) || 0);
      if (direct >= 1 && direct <= HOLES_PER_ROUND) return direct;
      if (currentRound() === 1) {
        const legacy = Number(localStorage.getItem(legacyHoleLocalKey(groupId)) || 0);
        if (legacy >= 1 && legacy <= HOLES_PER_ROUND) return legacy;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function resolveRoundCurrentHole(group, fallbackHole) {
    const seq = typeof scorerHoleSequenceForGroup === 'function'
      ? scorerHoleSequenceForGroup(group)
      : Array.from({ length: HOLES_PER_ROUND }, (_, i) => i + 1);
    const saved = group ? loadRoundCurrentHole(group.id) : null;
    const candidates = [saved, fallbackHole, group?.startHole, 1].map(Number);
    const found = candidates.find(h => h && h >= 1 && h <= HOLES_PER_ROUND && seq.includes(h));
    return found || seq[0] || 1;
  }

  function applyRoundCursorIfNeeded(force) {
    if (!hasState()) return;
    const round = currentRound();
    const isScorerPage = document.body?.classList.contains('scorer-mode') || location.pathname.toLowerCase().includes('scorer');
    const fixed = typeof isGroupFixed === 'function' ? isGroupFixed() : Boolean(state.deviceGroupId);
    if (!force && lastAppliedRound === round) return;
    lastAppliedRound = round;
    if (!isScorerPage && !fixed) return;
    const gid = Number((typeof fixedGroupId === 'function' ? fixedGroupId() : 0) || state.deviceGroupId || state.selectedGroupId || 0);
    const group = state.groups.find(g => Number(g.id) === gid);
    if (!group) return;
    state.selectedGroupId = group.id;
    state.selectedHole = resolveRoundCurrentHole(group, group.startHole || 1);
    saveRoundCurrentHole(group.id, state.selectedHole);
  }

  function assignGlobal(name, fn) {
    window[name] = fn;
    try {
      if (name === 'normalizeLoadedState') normalizeLoadedState = fn;
      if (name === 'saveState') saveState = fn;
      if (name === 'renderAllScreens') renderAllScreens = fn;
      if (name === 'renderScorer') renderScorer = fn;
      if (name === 'renderScorerHbh') renderScorerHbh = fn;
      if (name === 'renderScorerRanking') renderScorerRanking = fn;
      if (name === 'renderPublicLeaderboard') renderPublicLeaderboard = fn;
      if (name === 'renderMonitorRanking') renderMonitorRanking = fn;
      if (name === 'renderRanking') renderRanking = fn;
      if (name === 'currentHoleKey') currentHoleKey = fn;
      if (name === 'playerScores') playerScores = fn;
      if (name === 'playerScoresStore') playerScoresStore = fn;
      if (name === 'playerShots') playerShots = fn;
      if (name === 'totalScore') totalScore = fn;
      if (name === 'holesCompleted') holesCompleted = fn;
      if (name === 'completedHolesForPlayer') completedHolesForPlayer = fn;
      if (name === 'playerParTotalForCompleted') playerParTotalForCompleted = fn;
      if (name === 'playerScoreToPar') playerScoreToPar = fn;
      if (name === 'getPlayerScoreForHole') getPlayerScoreForHole = fn;
      if (name === 'holeDiffLabel') holeDiffLabel = fn;
      if (name === 'hbhSubtotal') hbhSubtotal = fn;
      if (name === 'hbhToPar') hbhToPar = fn;
      if (name === 'isHoleCompleteForGroup') isHoleCompleteForGroup = fn;
      if (name === 'isTestHoleCompleteForGroup') isTestHoleCompleteForGroup = fn;
      if (name === 'clearTestDataForGroup') clearTestDataForGroup = fn;
      if (name === 'saveScorerCurrentHole') saveScorerCurrentHole = fn;
      if (name === 'loadScorerCurrentHole') loadScorerCurrentHole = fn;
      if (name === 'resolveScorerCurrentHole') resolveScorerCurrentHole = fn;
    } catch (e) {}
  }

  function decorateRoundDisplays() {
    if (!hasState()) return;
    normalizeRoundScores();
    const holeLabel = document.getElementById('holeLabel');
    if (holeLabel) holeLabel.textContent = `${roundLabel()} / Hole ${clamp(state.selectedHole || 1, 1, HOLES_PER_ROUND)}`;

    const hbhList = document.getElementById('scorerHbhList');
    if (hbhList && !hbhList.querySelector('.v1661RoundScoreNote')) {
      hbhList.insertAdjacentHTML('afterbegin', `<div class="v1661RoundScoreNote">${roundLabel()} / 1H-18H</div>`);
    }

    const notice = document.getElementById('autoMoveNotice');
    document.querySelectorAll('.v1661RoundDone').forEach(el => el.remove());
    if (notice) delete notice.dataset.v1661RoundNoted;
    if (notice && notice.textContent) {
      const group = typeof currentGroup === 'function' ? currentGroup() : null;
      if (group && isGroupHoleComplete(group, state.selectedHole, isCurrentTestMode()) && !nextHoleForCurrentRound(group, state.selectedHole)) {
        notice.dataset.v1661RoundNoted = '1';
        notice.insertAdjacentHTML('afterend', `<div class="v1661RoundDone">${roundLabel()} \u306e18\u30db\u30fc\u30eb\u5165\u529b\u304c\u5b8c\u4e86\u3057\u307e\u3057\u305f\u3002\u6b21\u30e9\u30a6\u30f3\u30c9\u306b\u306f\u81ea\u52d5\u9032\u884c\u3057\u307e\u305b\u3093\u3002</div>`);
      }
    }

    renderCutList();
    if (typeof window.v1650ApplyScoreColors === 'function') window.v1650ApplyScoreColors(document);
  }

  function nextHoleForCurrentRound(group, hole) {
    const seq = typeof holeSequence === 'function'
      ? holeSequence(group?.startHole || 1).map(Number)
      : Array.from({ length: HOLES_PER_ROUND }, (_, i) => i + 1);
    const idx = seq.indexOf(Number(hole));
    return seq[idx + 1] || null;
  }

  function sourceRowsAllPlayers() {
    if (!hasState()) return [];
    const rows = [];
    state.groups.forEach(group => {
      (group.players || []).forEach(player => {
        rows.push({
          group: group.name,
          player,
          total: totalScoreRoundAware(player),
          holes: holesCompletedRoundAware(player),
          status: player.status
        });
      });
    });
    return rows;
  }

  function cutSettings() {
    if (!hasState()) return null;
    const count = roundCount();
    const enabled = Boolean(state.cutEnabled) && count > 1;
    return {
      enabled,
      cutAfterRound: clamp(state.cutAfterRound || 1, 1, Math.max(1, count - 1)),
      cutPosition: Math.max(1, clamp(state.cutPosition || 60, 1, 999)),
      cutIncludeTies: state.cutIncludeTies !== false
    };
  }

  function cutPlayerIds() {
    const s = cutSettings();
    if (!s || !s.enabled || currentRound() <= s.cutAfterRound) return new Set();
    const rows = sourceRowsAllPlayers()
      .filter(r => r.status !== 'withdrawn' && r.status !== 'dns')
      .sort((a, b) => {
        const diff = playerScoreToParRoundAware(a.player) - playerScoreToParRoundAware(b.player);
        if (diff !== 0) return diff;
        return Number(b.holes || 0) - Number(a.holes || 0) || Number(a.total || 0) - Number(b.total || 0);
      });
    if (!rows.length) return new Set();
    const idx = Math.min(s.cutPosition, rows.length) - 1;
    const threshold = playerScoreToParRoundAware(rows[idx].player);
    const passing = new Set((s.cutIncludeTies ? rows.filter(r => playerScoreToParRoundAware(r.player) <= threshold) : rows.slice(0, s.cutPosition)).map(r => r.player.id));
    return new Set(rows.filter(r => !passing.has(r.player.id)).map(r => r.player.id));
  }

  function renderCutList() {
    document.querySelectorAll('.v1661CutList').forEach(el => el.remove());
    const ids = cutPlayerIds();
    if (!ids.size) return;
    const names = sourceRowsAllPlayers()
      .filter(r => ids.has(r.player.id))
      .map(r => `${r.player.name} <span class="v1661CutBadge">CUT</span>`);
    if (!names.length) return;
    const html = `<div class="v1661CutList">CUT: ${names.join(' / ')}</div>`;
    const targets = [
      document.getElementById('rankingBody')?.closest('table'),
      document.getElementById('publicLeaderboard'),
      document.getElementById('scorerRankingBoard'),
      document.getElementById('monitorRanking')
    ].filter(Boolean);
    targets.forEach(target => target.insertAdjacentHTML('beforebegin', html));
  }

  function wrapRender(name) {
    const original = window[name];
    if (typeof original !== 'function' || original.v1661RoundScoreWrapped) return;
    const wrapped = function() {
      normalizeRoundScores();
      applyRoundCursorIfNeeded(false);
      const result = original.apply(this, arguments);
      setTimeout(decorateRoundDisplays, 0);
      return result;
    };
    wrapped.v1661RoundScoreWrapped = true;
    assignGlobal(name, wrapped);
  }

  function installOverrides() {
    assignGlobal('currentHoleKey', () => holeKey());
    assignGlobal('playerScores', player => mapForMode(player));
    assignGlobal('playerScoresStore', player => mapForMode(player));
    assignGlobal('playerShots', (player, key) => {
      const map = shotsForMode(player);
      const actualKey = key || holeKey();
      if (!map[actualKey]) map[actualKey] = [];
      return map[actualKey];
    });
    assignGlobal('totalScore', totalScoreRoundAware);
    assignGlobal('holesCompleted', holesCompletedRoundAware);
    assignGlobal('completedHolesForPlayer', player => scoreEntriesThroughRound(player).map(row => row.hole));
    assignGlobal('playerParTotalForCompleted', parTotalRoundAware);
    assignGlobal('playerScoreToPar', playerScoreToParRoundAware);
    assignGlobal('getPlayerScoreForHole', (player, hole) => scoreMap(player)['h' + hole] ?? '-');
    assignGlobal('holeDiffLabel', (player, hole) => {
      const score = scoreMap(player)['h' + hole];
      if (score == null) return '-';
      return typeof parDiffLabel === 'function' ? parDiffLabel(Number(score) - parForHole(hole)) : String(Number(score) - parForHole(hole));
    });
    assignGlobal('hbhSubtotal', currentRoundSubtotal);
    assignGlobal('hbhToPar', currentRoundToPar);
    assignGlobal('isHoleCompleteForGroup', (group, hole) => isGroupHoleComplete(group, hole, false));
    assignGlobal('isTestHoleCompleteForGroup', (group, hole) => isGroupHoleComplete(group, hole, true));
    assignGlobal('clearTestDataForGroup', group => {
      (group?.players || []).forEach(player => {
        const store = roundStore(player);
        store.testScores = {};
        store.testShots = {};
        syncPlayerAlias(player);
      });
    });
    assignGlobal('saveScorerCurrentHole', saveRoundCurrentHole);
    assignGlobal('loadScorerCurrentHole', loadRoundCurrentHole);
    assignGlobal('resolveScorerCurrentHole', resolveRoundCurrentHole);
  }

  function wrapCore() {
    if (typeof normalizeLoadedState === 'function' && !normalizeLoadedState.v1661RoundScoreWrapped) {
      const original = normalizeLoadedState;
      const wrapped = function() {
        const result = original.apply(this, arguments);
        normalizeRoundScores();
        applyRoundCursorIfNeeded(false);
        return result;
      };
      wrapped.v1661RoundScoreWrapped = true;
      assignGlobal('normalizeLoadedState', wrapped);
    }

    if (typeof saveState === 'function' && !saveState.v1661RoundScoreWrapped) {
      const original = saveState;
      const wrapped = function() {
        normalizeRoundScores();
        return original.apply(this, arguments);
      };
      wrapped.v1661RoundScoreWrapped = true;
      assignGlobal('saveState', wrapped);
    }

    ['renderAllScreens', 'renderScorer', 'renderScorerHbh', 'renderScorerRanking', 'renderPublicLeaderboard', 'renderMonitorRanking', 'renderRanking'].forEach(wrapRender);
  }

  function updateVersionLabels() {
    const replaceVersion = value => String(value || '').replace(/v16\.\d+\.\d+/ig, VERSION);
    const title = document.querySelector('title');
    if (title) title.textContent = replaceVersion(title.textContent);
    document.querySelectorAll('header h1, #v163PageBadge').forEach(el => {
      el.textContent = replaceVersion(el.textContent);
    });
  }

  function install() {
    if (installing || !hasState()) return;
    installing = true;
    normalizeRoundScores();
    installOverrides();
    wrapCore();
    applyRoundCursorIfNeeded(lastAppliedRound == null);
    updateVersionLabels();
    setTimeout(decorateRoundDisplays, 0);
    installing = false;
  }

  window.v1661RoundScores = {
    normalizeRoundScores,
    roundStore,
    scorerDeviceRound,
    currentRound,
    roundCount,
    totalScoreRoundAware,
    holesCompletedRoundAware,
    playerScoreToParRoundAware,
    cutPlayerIds
  };

  document.addEventListener('DOMContentLoaded', () => setTimeout(install, 0));
  window.addEventListener('load', () => {
    install();
    setTimeout(install, 500);
    setTimeout(install, 1800);
  });
  setTimeout(install, 100);
})();
