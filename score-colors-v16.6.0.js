(function() {
  const VERSION = 'v16.6.0';
  const SCORE_CLASSES = ['score-under', 'score-even', 'score-over', 'underPar', 'evenPar', 'overPar'];
  const SCORE_SCOPE_SELECTOR = [
    '#rankingBody',
    '#monitorRanking',
    '#publicLeaderboard',
    '#scorerRankingBoard',
    '#scorerHbhList',
    '.hbhTable',
    '.v13HbhTable',
    '.scorerRankHbhTable',
    '.monitorHbhTable',
    '.publicScoreToPar',
    '.scoreNow',
    '.v13ScoreSummary',
    '.v13SummaryBox',
    '.scorerRankStat',
    '.publicScore',
    '.rankScore'
  ].join(',');
  const SCORE_TEXT_SELECTOR = [
    '.publicScoreToPar',
    '.scoreNow',
    '.v13ScoreCell',
    '.v13SummaryBox strong',
    '.scorerRankStat strong',
    '.hbhTable td',
    '.v13HbhTable td',
    '.scorerRankHbhTable td',
    '.monitorHbhTable td',
    '#rankingBody td',
    '#monitorRanking td',
    '#publicLeaderboard td',
    '#scorerRankingBoard td',
    '#scorerHbhList td',
    'span',
    'strong'
  ].join(',');

  function scoreClass(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value < 0) return 'score-under';
      if (value > 0) return 'score-over';
      return 'score-even';
    }

    const text = String(value ?? '').trim();
    if (!text || text === '-' || text.toUpperCase() === 'WD') return '';
    if (text === 'E' || text === '\u00b10' || text === '+0' || text === '0') return 'score-even';
    if (/^-\d+(?:\.\d+)?$/.test(text)) return 'score-under';
    if (/^\+\d+(?:\.\d+)?$/.test(text)) return 'score-over';
    return '';
  }

  function normalizeScoreClass(el, cls) {
    SCORE_CLASSES.forEach(name => el.classList.remove(name));
    if (cls) el.classList.add(cls);
  }

  function classFromLegacy(el) {
    if (el.classList.contains('underPar')) return 'score-under';
    if (el.classList.contains('overPar')) return 'score-over';
    if (el.classList.contains('evenPar')) return 'score-even';
    return '';
  }

  function inScoreScope(el) {
    return el.matches(SCORE_SCOPE_SELECTOR) || Boolean(el.closest(SCORE_SCOPE_SELECTOR));
  }

  function isScoreText(text) {
    return /^(?:E|\u00b10|\+0|0|[+-]\d+(?:\.\d+)?)$/.test(text);
  }

  function applyScoreColors(root) {
    const base = root && root.nodeType === 1 ? root : document;

    base.querySelectorAll('.underPar,.evenPar,.overPar').forEach(el => {
      const cls = classFromLegacy(el);
      if (cls) normalizeScoreClass(el, cls);
    });

    base.querySelectorAll(SCORE_TEXT_SELECTOR).forEach(el => {
      if (!inScoreScope(el)) return;
      const text = (el.textContent || '').trim();
      if (!isScoreText(text)) return;
      const cls = scoreClass(text);
      if (cls) normalizeScoreClass(el, cls);
    });
  }

  function wrapRender(name) {
    const original = window[name];
    if (typeof original !== 'function' || original.v1650ScoreColorWrapped) return;
    const wrapped = function() {
      const result = original.apply(this, arguments);
      setTimeout(() => applyScoreColors(document), 0);
      return result;
    };
    wrapped.v1650ScoreColorWrapped = true;
    window[name] = wrapped;
  }

  function updateVisibleVersion() {
    const replaceVersion = text => text.replace(/v16\.\d+\.\d+/ig, VERSION);
    const title = document.querySelector('title');
    if (title) title.textContent = replaceVersion(title.textContent);
    document.querySelectorAll('header h1, #v163PageBadge').forEach(el => {
      el.textContent = replaceVersion(el.textContent);
    });
  }

  function installScoreColors() {
    window.parDiffClass = function(diff) {
      const numeric = Number(diff);
      if (!Number.isFinite(numeric)) return '';
      return scoreClass(numeric);
    };

    window.v1650ScoreClass = scoreClass;
    window.v1650ApplyScoreColors = applyScoreColors;
    window.v1650ScoreHtml = function(value, extraClass) {
      return `<span class="${[extraClass || '', scoreClass(value)].filter(Boolean).join(' ')}">${value}</span>`;
    };

    [
      'renderAllScreens',
      'renderRanking',
      'renderScorer',
      'renderScorerHbh',
      'renderScorerRanking',
      'renderPublicLeaderboard',
      'renderMonitor',
      'renderMonitorRanking',
      'renderPublic',
      'renderHbh'
    ].forEach(wrapRender);

    updateVisibleVersion();
    applyScoreColors(document);
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(installScoreColors, 0));
  window.addEventListener('load', () => {
    installScoreColors();
    setTimeout(installScoreColors, 500);
    setTimeout(installScoreColors, 1800);
  });
  setTimeout(installScoreColors, 100);
})();
