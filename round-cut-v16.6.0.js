(function() {
  const VERSION = 'v16.6.0';
  const DEFAULTS = {
    roundCount: 1,
    currentRound: 1,
    cutEnabled: false,
    cutAfterRound: 1,
    cutPosition: 60,
    cutIncludeTies: true
  };
  let originalGetRankingRows = null;
  let renderingSettings = false;
  let postCutInitialRenderDone = false;

  const text = {
    title: '\u5927\u4f1a\u30e9\u30a6\u30f3\u30c9\u30fb\u4e88\u9078\u30ab\u30c3\u30c8\u8a2d\u5b9a',
    desc: '\u5927\u4f1a\u3054\u3068\u306e\u30e9\u30a6\u30f3\u30c9\u6570\u3001\u73fe\u5728\u30e9\u30a6\u30f3\u30c9\u3001\u4e88\u9078\u30ab\u30c3\u30c8\u6761\u4ef6\u3092\u4fdd\u5b58\u3057\u307e\u3059\u3002',
    roundCount: '\u5927\u4f1a\u30e9\u30a6\u30f3\u30c9\u6570',
    currentRound: '\u73fe\u5728\u30e9\u30a6\u30f3\u30c9',
    cutEnabled: '\u4e88\u9078\u30ab\u30c3\u30c8',
    cutOn: 'ON',
    cutOff: 'OFF',
    cutAfter: '\u4e88\u9078\u30ab\u30c3\u30c8\u5b9f\u65bd\u30e9\u30a6\u30f3\u30c9',
    cutPosition: '\u30ab\u30c3\u30c8\u9806\u4f4d',
    includeTies: '\u30bf\u30a4\u3092\u542b\u3080',
    save: '\u5927\u4f1a\u30e9\u30a6\u30f3\u30c9\u8a2d\u5b9a\u3092\u4fdd\u5b58',
    cutTo: '\u4e88\u9078\u30ab\u30c3\u30c8',
    currentCutLine: '\u73fe\u5728\u30ab\u30c3\u30c8\u30e9\u30a4\u30f3',
    noLine: '\u7b97\u51fa\u5f85\u3061',
    afterCut: '\u4e88\u9078\u30ab\u30c3\u30c8\u901a\u904e\u8005\u306e\u307f\u8868\u793a',
    saved: '\u5927\u4f1a\u30e9\u30a6\u30f3\u30c9\u8a2d\u5b9a\u3092\u4fdd\u5b58\u3057\u307e\u3057\u305f'
  };

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.floor(n)));
  }

  function hasState() {
    return typeof state !== 'undefined' && state;
  }

  function settings() {
    if (!hasState()) return { ...DEFAULTS };
    const roundCount = clamp(state.roundCount ?? DEFAULTS.roundCount, 1, 4);
    const currentRound = clamp(state.currentRound ?? DEFAULTS.currentRound, 1, roundCount);
    const cutPosition = Math.max(1, clamp(state.cutPosition ?? DEFAULTS.cutPosition, 1, 999));
    const canCut = roundCount > 1;
    const cutAfterRound = canCut
      ? clamp(state.cutAfterRound ?? Math.min(2, roundCount - 1), 1, roundCount - 1)
      : 1;
    const normalized = {
      roundCount,
      currentRound,
      cutEnabled: canCut ? Boolean(state.cutEnabled ?? DEFAULTS.cutEnabled) : false,
      cutAfterRound,
      cutPosition,
      cutIncludeTies: state.cutIncludeTies !== false
    };
    state.roundCount = normalized.roundCount;
    state.currentRound = normalized.currentRound;
    state.cutEnabled = normalized.cutEnabled;
    state.cutAfterRound = normalized.cutAfterRound;
    state.cutPosition = normalized.cutPosition;
    state.cutIncludeTies = normalized.cutIncludeTies;
    return normalized;
  }

  function roundLabel(s = settings()) {
    return `Round ${s.currentRound} / ${s.roundCount}`;
  }

  function cutPositionLabel(s = settings()) {
    return `${s.cutPosition}\u4f4d${s.cutIncludeTies ? '\u30bf\u30a4' : ''}\u307e\u3067`;
  }

  function activeRows(rows) {
    return (rows || []).filter(r => r && r.player && r.status !== 'withdrawn' && r.status !== 'dns');
  }

  function scoreToParForRow(row) {
    if (typeof playerScoreToPar === 'function') return playerScoreToPar(row.player);
    return Number(row.total || 0);
  }

  function sortedCutRows(rows) {
    return activeRows(rows).slice().sort((a, b) => {
      const diff = scoreToParForRow(a) - scoreToParForRow(b);
      if (diff !== 0) return diff;
      const holes = Number(b.holes || 0) - Number(a.holes || 0);
      if (holes !== 0) return holes;
      return Number(a.total || 0) - Number(b.total || 0);
    });
  }

  function sourceRankingRows() {
    const source = originalGetRankingRows || (typeof getRankingRows === 'function' ? getRankingRows : null);
    if (!source) return [];
    try {
      return source();
    } catch (e) {
      console.warn('[v16.6.0 round/cut] ranking source failed', e);
      return [];
    }
  }

  function cutLineDiff() {
    const s = settings();
    if (!s.cutEnabled) return null;
    const sorted = sortedCutRows(sourceRankingRows());
    if (!sorted.length) return null;
    const index = Math.min(s.cutPosition, sorted.length) - 1;
    return scoreToParForRow(sorted[index]);
  }

  function diffLabel(diff) {
    if (diff == null || !Number.isFinite(Number(diff))) return text.noLine;
    if (typeof parDiffLabel === 'function') return parDiffLabel(Number(diff));
    return Number(diff) === 0 ? 'E' : (Number(diff) > 0 ? `+${Number(diff)}` : `${Number(diff)}`);
  }

  function diffClass(diff) {
    if (diff == null || !Number.isFinite(Number(diff))) return '';
    if (typeof parDiffClass === 'function') return parDiffClass(Number(diff));
    return Number(diff) < 0 ? 'score-under' : Number(diff) > 0 ? 'score-over' : 'score-even';
  }

  function shouldShowCutLine() {
    const s = settings();
    return s.cutEnabled && s.currentRound <= s.cutAfterRound;
  }

  function shouldFilterPostCut() {
    const s = settings();
    return s.cutEnabled && s.currentRound > s.cutAfterRound;
  }

  function qualifyingPlayerIds(rows) {
    const s = settings();
    const sorted = sortedCutRows(rows);
    if (!sorted.length) return new Set();
    if (!s.cutIncludeTies) {
      return new Set(sorted.slice(0, s.cutPosition).map(r => r.player.id));
    }
    const index = Math.min(s.cutPosition, sorted.length) - 1;
    const threshold = scoreToParForRow(sorted[index]);
    return new Set(sorted.filter(r => scoreToParForRow(r) <= threshold).map(r => r.player.id));
  }

  function filterPostCutRows(rows) {
    if (!shouldFilterPostCut()) return rows;
    const ids = qualifyingPlayerIds(rows);
    return activeRows(rows).filter(r => ids.has(r.player.id));
  }

  function bannerHtml(target) {
    const s = settings();
    const line = cutLineDiff();
    const lineLabel = diffLabel(line);
    const lineClass = diffClass(line);
    const parts = [`<span class="v166RoundText">${roundLabel(s)}</span>`];

    if (shouldShowCutLine()) {
      parts.push(`<span class="v166CutText">${text.cutTo}\uff1a${cutPositionLabel(s)}</span>`);
      parts.push(`<span class="v166CutText">${text.currentCutLine}\uff1a<strong class="${lineClass}">${lineLabel}</strong></span>`);
      parts.push(`<span class="v166CutLine">CUT LINE <strong class="${lineClass}">${lineLabel}</strong></span>`);
    } else if (shouldFilterPostCut()) {
      parts.push(`<span class="v166CutText">${text.afterCut}</span>`);
    }

    return `<div class="v166RoundCutBanner" data-v166-target="${target}">${parts.join('')}</div>`;
  }

  function removeBanner(container, target) {
    if (!container) return;
    container.querySelectorAll(`.v166RoundCutBanner[data-v166-target="${target}"]`).forEach(el => el.remove());
  }

  function prependBanner(container, target, includeCut) {
    if (!container) return;
    removeBanner(container, target);
    container.insertAdjacentHTML('afterbegin', bannerHtml(target, includeCut));
  }

  function insertBefore(node, target, html) {
    if (!node || !node.parentNode) return;
    removeBanner(node.parentNode, target);
    node.insertAdjacentHTML('beforebegin', html);
  }

  function decorateDisplays() {
    if (!hasState()) return;
    settings();
    renderHqPostCutRanking();

    const rankingTable = document.getElementById('rankingBody')?.closest('table');
    if (rankingTable) insertBefore(rankingTable, 'hq-ranking', bannerHtml('hq-ranking'));

    prependBanner(document.getElementById('publicLeaderboard'), 'public-ranking', true);
    prependBanner(document.getElementById('scorerRankingBoard'), 'scorer-ranking', true);
    prependBanner(document.getElementById('monitorRanking'), 'monitor-ranking', true);

    const scorerScreen = document.getElementById('scorerScreen');
    if (scorerScreen) {
      removeBanner(scorerScreen, 'scorer-main');
      scorerScreen.insertAdjacentHTML('afterbegin', `<div class="v166RoundCutBanner" data-v166-target="scorer-main"><span class="v166RoundText">${roundLabel()}</span></div>`);
    }

    if (typeof window.v1650ApplyScoreColors === 'function') {
      window.v1650ApplyScoreColors(document);
    }
  }

  function renderHqPostCutRanking() {
    if (!shouldFilterPostCut()) return;
    const body = document.getElementById('rankingBody');
    if (!body || typeof getRankingRows !== 'function') return;
    const rows = getRankingRows()
      .filter(r => r.status !== 'withdrawn' && r.status !== 'dns')
      .sort((a, b) => {
        const total = Number(a.total || 0) - Number(b.total || 0);
        if (total !== 0) return total;
        const holes = Number(b.holes || 0) - Number(a.holes || 0);
        if (holes !== 0) return holes;
        return String(a.player?.name || '').localeCompare(String(b.player?.name || ''), 'ja');
      });

    body.innerHTML = '';
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6">\u8868\u793a\u5bfe\u8c61\u306e\u9078\u624b\u306f\u3044\u307e\u305b\u3093</td></tr>';
      return;
    }
    rows.forEach((r, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td><strong>${r.player.name}</strong></td>
        <td>${r.group}</td>
        <td>${r.holes}H</td>
        <td class="rankScore">${r.total}</td>
        <td>\u30d7\u30ec\u30fc\u4e2d</td>
      `;
      body.appendChild(tr);
    });
  }

  function setOptions(select, values, selected) {
    if (!select) return;
    select.innerHTML = '';
    values.forEach(value => {
      const opt = document.createElement('option');
      opt.value = String(value);
      opt.textContent = `${value}R`;
      select.appendChild(opt);
    });
    select.value = String(selected);
  }

  function ensureSettingsCard() {
    const setup = document.getElementById('setupScreen');
    if (!setup || document.getElementById('v166RoundCutCard')) return;
    const firstCard = setup.querySelector('.card');
    if (!firstCard) return;
    const card = document.createElement('div');
    card.className = 'card v166RoundCutCard';
    card.id = 'v166RoundCutCard';
    card.innerHTML = `
      <div>
        <span class="pill">ROUND / CUT</span>
        <h2 class="holeTitle">${text.title}</h2>
      </div>
      <p class="small">${text.desc}</p>
      <div class="v166RoundCutGrid">
        <div>
          <label>${text.roundCount}</label>
          <select id="v166RoundCount"></select>
        </div>
        <div>
          <label>${text.currentRound}</label>
          <select id="v166CurrentRound"></select>
        </div>
        <div>
          <label>${text.cutEnabled}</label>
          <select id="v166CutEnabled">
            <option value="false">${text.cutOff}</option>
            <option value="true">${text.cutOn}</option>
          </select>
        </div>
        <div>
          <label>${text.cutAfter}</label>
          <select id="v166CutAfterRound"></select>
        </div>
        <div>
          <label>${text.cutPosition}</label>
          <input id="v166CutPosition" type="number" min="1" step="1">
        </div>
        <div>
          <label>${text.includeTies}</label>
          <select id="v166CutIncludeTies">
            <option value="true">${text.includeTies}</option>
            <option value="false">${text.includeTies} OFF</option>
          </select>
        </div>
      </div>
      <div class="v166RoundCutPreview" id="v166RoundCutPreview"></div>
      <div class="utility">
        <button class="blue" id="v166SaveRoundCutBtn" type="button">${text.save}</button>
      </div>
    `;
    firstCard.insertAdjacentElement('afterend', card);
  }

  function renderSettingsCard() {
    if (!hasState()) return;
    ensureSettingsCard();
    const card = document.getElementById('v166RoundCutCard');
    if (!card) return;
    renderingSettings = true;
    const s = settings();
    setOptions(document.getElementById('v166RoundCount'), [1, 2, 3, 4], s.roundCount);
    setOptions(document.getElementById('v166CurrentRound'), Array.from({ length: s.roundCount }, (_, i) => i + 1), s.currentRound);
    setOptions(document.getElementById('v166CutAfterRound'), Array.from({ length: Math.max(1, s.roundCount - 1) }, (_, i) => i + 1), s.cutAfterRound);
    const cutEnabled = document.getElementById('v166CutEnabled');
    const cutPosition = document.getElementById('v166CutPosition');
    const cutIncludeTies = document.getElementById('v166CutIncludeTies');
    const cutAfter = document.getElementById('v166CutAfterRound');
    if (cutEnabled) cutEnabled.value = String(s.cutEnabled);
    if (cutPosition) cutPosition.value = String(s.cutPosition);
    if (cutIncludeTies) cutIncludeTies.value = String(s.cutIncludeTies);
    const cutControlsDisabled = !s.cutEnabled || s.roundCount < 2;
    if (cutAfter) cutAfter.disabled = cutControlsDisabled || s.roundCount < 2;
    if (cutPosition) cutPosition.disabled = cutControlsDisabled;
    if (cutIncludeTies) cutIncludeTies.disabled = cutControlsDisabled;
    const preview = document.getElementById('v166RoundCutPreview');
    if (preview) preview.innerHTML = bannerHtml('preview').replace('v166RoundCutBanner', 'v166RoundCutBanner v166PreviewBanner');
    bindSettingsEvents();
    renderingSettings = false;
  }

  function readSettingsFromForm() {
    if (!hasState()) return;
    state.roundCount = clamp(document.getElementById('v166RoundCount')?.value ?? DEFAULTS.roundCount, 1, 4);
    state.currentRound = clamp(document.getElementById('v166CurrentRound')?.value ?? DEFAULTS.currentRound, 1, state.roundCount);
    state.cutEnabled = document.getElementById('v166CutEnabled')?.value === 'true';
    state.cutAfterRound = clamp(document.getElementById('v166CutAfterRound')?.value ?? DEFAULTS.cutAfterRound, 1, Math.max(1, state.roundCount - 1));
    state.cutPosition = Math.max(1, clamp(document.getElementById('v166CutPosition')?.value ?? DEFAULTS.cutPosition, 1, 999));
    state.cutIncludeTies = document.getElementById('v166CutIncludeTies')?.value !== 'false';
    settings();
  }

  function saveSettings() {
    if (renderingSettings) return;
    readSettingsFromForm();
    if (typeof saveState === 'function') saveState();
    if (typeof renderAllScreens === 'function') renderAllScreens();
    renderSettingsCard();
    decorateDisplays();
    if (typeof toast === 'function') toast(text.saved);
  }

  function bindSettingsEvents() {
    ['v166RoundCount', 'v166CurrentRound', 'v166CutEnabled', 'v166CutAfterRound', 'v166CutPosition', 'v166CutIncludeTies'].forEach(id => {
      const el = document.getElementById(id);
      if (!el || el.v166Bound) return;
      el.v166Bound = true;
      el.addEventListener('change', saveSettings);
    });
    const btn = document.getElementById('v166SaveRoundCutBtn');
    if (btn && !btn.v166Bound) {
      btn.v166Bound = true;
      btn.addEventListener('click', saveSettings);
    }
  }

  function assignGlobal(name, fn) {
    window[name] = fn;
    try {
      if (name === 'saveState') saveState = fn;
      if (name === 'normalizeLoadedState') normalizeLoadedState = fn;
      if (name === 'getRankingRows') getRankingRows = fn;
      if (name === 'renderAllScreens') renderAllScreens = fn;
      if (name === 'renderTournamentManager') renderTournamentManager = fn;
      if (name === 'renderRanking') renderRanking = fn;
      if (name === 'renderPublicLeaderboard') renderPublicLeaderboard = fn;
      if (name === 'renderScorerRanking') renderScorerRanking = fn;
      if (name === 'renderMonitorRanking') renderMonitorRanking = fn;
      if (name === 'renderScorer') renderScorer = fn;
    } catch (e) {}
  }

  function wrapFunction(name, after) {
    const original = window[name];
    if (typeof original !== 'function' || original.v166RoundCutWrapped) return;
    const wrapped = function() {
      settings();
      const result = original.apply(this, arguments);
      after(result);
      return result;
    };
    wrapped.v166RoundCutWrapped = true;
    assignGlobal(name, wrapped);
  }

  function installRankingFilter() {
    if (typeof getRankingRows !== 'function') return;
    if (getRankingRows.v166RoundCutWrapped) return;
    originalGetRankingRows = getRankingRows;
    const wrapped = function() {
      const rows = originalGetRankingRows.apply(this, arguments);
      return filterPostCutRows(rows);
    };
    wrapped.v166RoundCutWrapped = true;
    assignGlobal('getRankingRows', wrapped);
  }

  function install() {
    if (!hasState()) return;
    settings();
    installRankingFilter();

    if (typeof normalizeLoadedState === 'function' && !normalizeLoadedState.v166RoundCutWrapped) {
      const original = normalizeLoadedState;
      const wrapped = function() {
        const result = original.apply(this, arguments);
        settings();
        return result;
      };
      wrapped.v166RoundCutWrapped = true;
      assignGlobal('normalizeLoadedState', wrapped);
    }

    if (typeof saveState === 'function' && !saveState.v166RoundCutWrapped) {
      const original = saveState;
      const wrapped = function(options) {
        settings();
        return original.apply(this, arguments);
      };
      wrapped.v166RoundCutWrapped = true;
      assignGlobal('saveState', wrapped);
    }

    ['renderAllScreens', 'renderRanking', 'renderPublicLeaderboard', 'renderScorerRanking', 'renderMonitorRanking', 'renderScorer'].forEach(name => {
      wrapFunction(name, () => setTimeout(decorateDisplays, 0));
    });
    wrapFunction('renderTournamentManager', () => {
      renderSettingsCard();
      setTimeout(decorateDisplays, 0);
    });

    renderSettingsCard();
    decorateDisplays();
    if (!postCutInitialRenderDone && shouldFilterPostCut() && typeof renderAllScreens === 'function') {
      postCutInitialRenderDone = true;
      setTimeout(() => renderAllScreens(), 0);
    }
    updateVersionLabels();
  }

  function updateVersionLabels() {
    const replaceVersion = value => String(value || '').replace(/v16\.\d+\.\d+/ig, VERSION);
    const title = document.querySelector('title');
    if (title) title.textContent = replaceVersion(title.textContent);
    document.querySelectorAll('header h1, #v163PageBadge').forEach(el => {
      el.textContent = replaceVersion(el.textContent);
    });
  }

  window.v166RoundCut = {
    settings,
    cutLineDiff,
    shouldShowCutLine,
    shouldFilterPostCut,
    qualifyingPlayerIds,
    decorateDisplays,
    renderSettingsCard
  };

  document.addEventListener('DOMContentLoaded', () => setTimeout(install, 0));
  window.addEventListener('load', () => {
    install();
    setTimeout(install, 500);
    setTimeout(install, 1800);
  });
  setTimeout(install, 100);
})();
