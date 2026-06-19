(function() {
  const VERSION = 'v16.6.2';
  const HOLES_PER_ROUND = 18;
  const OUT_HOLES = [1,2,3,4,5,6,7,8,9];
  const IN_HOLES = [10,11,12,13,14,15,16,17,18];

  function hasState() {
    return typeof state !== 'undefined' && state && Array.isArray(state.groups);
  }

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.floor(n)));
  }

  function roundCount() {
    if (!hasState()) return 1;
    return clamp(state.roundCount || 1, 1, 4);
  }

  function currentRound() {
    if (!hasState()) return 1;
    return clamp(state.currentRound || 1, 1, roundCount());
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function getPar(hole) {
    try {
      if (typeof getParForHole === 'function') return Number(getParForHole(hole) || 4);
    } catch (e) {}
    return Number(state?.coursePar?.[hole] || 4);
  }

  function scoreMap(player, round = currentRound()) {
    if (!player) return {};
    const key = String(clamp(round, 1, roundCount()));
    if (player.rounds && typeof player.rounds === 'object') {
      const store = player.rounds[key] || player.rounds[Number(key)];
      if (store && store.scores && typeof store.scores === 'object') return store.scores;
      return {};
    }
    if (Number(round) === currentRound() || Number(round) === 1) return player.scores || {};
    return {};
  }

  function scoreValue(player, round, hole) {
    const map = scoreMap(player, round);
    const value = map['h' + hole] ?? map[hole];
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function holesInRound(player, round = currentRound()) {
    const holes = [];
    for (let hole = 1; hole <= HOLES_PER_ROUND; hole += 1) {
      if (scoreValue(player, round, hole) != null) holes.push(hole);
    }
    return holes;
  }

  function currentRoundHoles(player) {
    return holesInRound(player, currentRound()).length;
  }

  function entriesThroughRound(player, throughRound = currentRound()) {
    const rows = [];
    const maxRound = Number(throughRound);
    if (!Number.isFinite(maxRound) || maxRound < 1) return rows;
    for (let round = 1; round <= clamp(maxRound, 1, roundCount()); round += 1) {
      for (let hole = 1; hole <= HOLES_PER_ROUND; hole += 1) {
        const score = scoreValue(player, round, hole);
        if (score != null) rows.push({ round, hole, score });
      }
    }
    return rows;
  }

  function totalScoreV1662(player, throughRound = currentRound()) {
    return entriesThroughRound(player, throughRound).reduce((sum, row) => sum + row.score, 0);
  }

  function scoreToParV1662(player, throughRound = currentRound()) {
    const entries = entriesThroughRound(player, throughRound);
    if (!entries.length) return 0;
    return entries.reduce((sum, row) => sum + row.score - getPar(row.hole), 0);
  }

  function parDiffLabelV1662(diff) {
    if (typeof parDiffLabel === 'function') return parDiffLabel(diff);
    if (diff === 0) return 'E';
    return diff > 0 ? '+' + diff : String(diff);
  }

  function parDiffClassV1662(diff) {
    if (typeof parDiffClass === 'function') return parDiffClass(diff);
    if (diff < 0) return 'score-under';
    if (diff > 0) return 'score-over';
    return 'score-even';
  }

  function startTimeFor(rowOrPlayer, group) {
    const player = rowOrPlayer?.player || rowOrPlayer;
    const foundGroup = hasState() && player?.id
      ? state.groups.find(g => (g.players || []).some(p => p.id === player.id))
      : null;
    const sourceGroup = rowOrPlayer?.groupObj || group || rowOrPlayer?.group || foundGroup;
    return player?.roundStarts?.[String(currentRound())]
      || player?.startTimes?.[String(currentRound())]
      || player?.plannedStart
      || player?.startTime
      || sourceGroup?.roundStarts?.[String(currentRound())]
      || sourceGroup?.plannedStart
      || '-';
  }

  function thruLabel(rowOrPlayer, group) {
    const player = rowOrPlayer?.player || rowOrPlayer;
    const holes = currentRoundHoles(player);
    if (!holes) return startTimeFor(rowOrPlayer, group);
    return holes >= HOLES_PER_ROUND ? 'F' : String(holes);
  }

  function allRankingRows() {
    if (!hasState()) return [];
    const rows = [];
    state.groups.forEach(group => {
      (group.players || []).forEach(player => {
        const toPar = scoreToParV1662(player);
        rows.push({
          group: group.name,
          groupObj: group,
          player,
          total: totalScoreV1662(player),
          toPar,
          holes: currentRoundHoles(player),
          thru: currentRoundHoles(player),
          thruLabel: thruLabel(player, group),
          status: player.status
        });
      });
    });
    return rows;
  }

  function sortRankingRows(rows) {
    return rows.sort((a, b) => {
      if (a.toPar !== b.toPar) return a.toPar - b.toPar;
      if (a.holes !== b.holes) return b.holes - a.holes;
      if (a.total !== b.total) return a.total - b.total;
      return String(a.player?.name || '').localeCompare(String(b.player?.name || ''), 'ja');
    });
  }

  function cutPlayerIds() {
    if (!hasState() || !state.cutEnabled) return new Set();
    const cutAfterRound = clamp(state.cutAfterRound || 1, 1, Math.max(1, roundCount() - 1));
    if (currentRound() <= cutAfterRound) return new Set();
    const cutPosition = Math.max(1, clamp(state.cutPosition || 60, 1, 999));
    const source = [];
    state.groups.forEach(group => {
      (group.players || []).forEach(player => {
        if (player.status === 'withdrawn' || player.status === 'dns') return;
        source.push({
          player,
          total: totalScoreV1662(player, cutAfterRound),
          toPar: scoreToParV1662(player, cutAfterRound),
          holes: entriesThroughRound(player, cutAfterRound).length
        });
      });
    });
    sortRankingRows(source);
    if (!source.length) return new Set();
    const base = source[Math.min(source.length - 1, cutPosition - 1)];
    const passing = new Set((state.cutIncludeTies !== false
      ? source.filter(r => r.toPar <= base.toPar)
      : source.slice(0, cutPosition)
    ).map(r => r.player.id));
    return new Set(source.filter(r => !passing.has(r.player.id)).map(r => r.player.id));
  }

  function isCutPlayer(player) {
    return cutPlayerIds().has(player?.id);
  }

  function sectionScore(player, round, holes) {
    const values = holes.map(hole => scoreValue(player, round, hole)).filter(v => v != null);
    return values.length ? values.reduce((sum, n) => sum + n, 0) : '-';
  }

  function sectionToPar(player, round, holes) {
    const played = holes.filter(hole => scoreValue(player, round, hole) != null);
    if (!played.length) return '-';
    const diff = played.reduce((sum, hole) => sum + scoreValue(player, round, hole) - getPar(hole), 0);
    return parDiffLabelV1662(diff);
  }

  function hbhTable(player, round, holes, label, classPrefix) {
    const totalPar = holes.reduce((sum, hole) => sum + getPar(hole), 0);
    const scoreCells = holes.map(hole => {
      const score = scoreValue(player, round, hole);
      const diff = score == null ? null : score - getPar(hole);
      return `<td class="${diff == null ? '' : parDiffClassV1662(diff)}">${score == null ? '-' : score}</td>`;
    }).join('');
    const diffCells = holes.map(hole => {
      const score = scoreValue(player, round, hole);
      const diff = score == null ? null : score - getPar(hole);
      return `<td class="${diff == null ? '' : parDiffClassV1662(diff)}">${diff == null ? '-' : parDiffLabelV1662(diff)}</td>`;
    }).join('');
    return `
      <div class="v1662RoundNineTitle">Round ${round} ${label}</div>
      <div class="${classPrefix}Scroll v1662HbhScroll">
        <table class="${classPrefix}Table v1662HbhTable">
          <tr><th>HOLE</th>${holes.map(h => `<th>${h}</th>`).join('')}<th>${label}</th></tr>
          <tr><td>PAR</td>${holes.map(h => `<td>${getPar(h)}</td>`).join('')}<td><strong>${totalPar}</strong></td></tr>
          <tr><td>SCORE</td>${scoreCells}<td><strong>${sectionScore(player, round, holes)}</strong></td></tr>
          <tr><td>+/-</td>${diffCells}<td><strong>${sectionToPar(player, round, holes)}</strong></td></tr>
        </table>
      </div>
    `;
  }

  function hbhAllRoundsHtml(player, classPrefix) {
    const blocks = [];
    for (let round = 1; round <= currentRound(); round += 1) {
      const roundTotal = totalScoreV1662(player, round) - totalScoreV1662(player, round - 1);
      const roundToPar = scoreToParV1662(player, round) - scoreToParV1662(player, round - 1);
      blocks.push(`
        <div class="v1662RoundBlock">
          <div class="v1662RoundHeading">Round ${round}</div>
          ${hbhTable(player, round, OUT_HOLES, 'OUT', classPrefix)}
          ${hbhTable(player, round, IN_HOLES, 'IN', classPrefix)}
          <div class="v1662RoundSummary">Round ${round} TOTAL: <strong>${roundTotal || '-'}</strong> / <strong class="${parDiffClassV1662(roundToPar)}">${parDiffLabelV1662(roundToPar)}</strong></div>
        </div>
      `);
    }
    return blocks.join('');
  }

  function publicDetailRowV1662(r) {
    const p = r.player;
    const totalToPar = parDiffLabelV1662(scoreToParV1662(p));
    return `
      <tr class="hbhRow">
        <td colspan="5">
          <div class="hbhBox v1662HbhBox">
            ${hbhAllRoundsHtml(p, 'hbh')}
            <div class="v1662GrandTotal">TOTAL <strong>Score ${totalScoreV1662(p)}</strong> / <strong class="${parDiffClassV1662(scoreToParV1662(p))}">${totalToPar}</strong></div>
          </div>
        </td>
      </tr>
    `;
  }

  function monitorDetailRowV1662(r) {
    const p = r.player;
    const totalToPar = parDiffLabelV1662(scoreToParV1662(p));
    return `
      <tr class="monitorHbhRow">
        <td colspan="6">
          <div class="monitorHbhBox v1662HbhBox">
            ${hbhAllRoundsHtml(p, 'monitorHbh')}
            <div class="v1662GrandTotal">TOTAL <strong>Score ${totalScoreV1662(p)}</strong> / <strong class="${parDiffClassV1662(scoreToParV1662(p))}">${totalToPar}</strong></div>
          </div>
        </td>
      </tr>
    `;
  }

  function scorerRankingDetailHtmlV1662(player) {
    return `<div class="scorerRankDetail show v1662HbhBox">${hbhAllRoundsHtml(player, 'scorerRankHbh')}</div>`;
  }

  function publicRowsHtmlV1662(rows, useRankingNumber = true) {
    const cutIds = cutPlayerIds();
    return rows.map((r, i) => {
      const wd = r.status === 'withdrawn';
      const cut = cutIds.has(r.player.id);
      const fav = typeof isFavoritePlayer === 'function' ? isFavoritePlayer(r.player.id) : false;
      const open = typeof isOpenPlayer === 'function' ? isOpenPlayer(r.player.id) : false;
      const rank = wd ? '-' : (cut ? '<span class="v1662CutBadge">CUT</span>' : (useRankingNumber ? i + 1 : ''));
      const scoreToPar = scoreToParV1662(r.player);
      return `
        <tr class="${cut ? 'v1662CutRow' : ''}">
          <td class="publicRank">${rank}</td>
          <td class="publicPlayer ${wd ? 'publicWd' : ''}">
            <button class="favBtn" data-fav="${r.player.id}" aria-label="favorite">${fav ? '\u2605' : '\u2606'}</button>
            <button class="playerLink" data-player-detail="${r.player.id}">${open ? '\u25bc' : '\u25b6'} ${escapeHtml(r.player.name || '')}</button>
          </td>
          <td class="publicScoreToPar ${parDiffClassV1662(scoreToPar)}">${wd ? 'WD' : parDiffLabelV1662(scoreToPar)}</td>
          <td class="publicStatus">${wd ? 'WD' : thruLabel(r)}</td>
          <td class="publicScore">${wd ? 'WD' : totalScoreV1662(r.player)}</td>
        </tr>
        ${open ? publicDetailRowV1662(r) : ''}
      `;
    }).join('');
  }

  function bindPublicButtons() {
    document.querySelectorAll('[data-fav]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        if (typeof toggleFavoritePlayer === 'function') toggleFavoritePlayer(btn.dataset.fav);
      };
    });
    document.querySelectorAll('[data-player-detail]').forEach(btn => {
      btn.onclick = () => {
        if (typeof togglePublicPlayerDetails === 'function') togglePublicPlayerDetails(btn.dataset.playerDetail);
      };
    });
  }

  function scorerRankingCardHtmlV1662(r, rank, mine) {
    const scoreToPar = scoreToParV1662(r.player);
    const fav = typeof isScorerFavoritePlayer === 'function' ? isScorerFavoritePlayer(r.player.id) : false;
    const open = typeof isScorerOpenPlayer === 'function' ? isScorerOpenPlayer(r.player.id) : false;
    const cut = isCutPlayer(r.player);
    return `
      <div class="scorerRankCard ${mine ? 'mine' : ''} ${cut ? 'v1662CutRow' : ''}">
        <div class="scorerRankTop">
          <div style="display:flex;gap:10px;min-width:0;">
            <div class="scorerRankNo">${cut ? '<span class="v1662CutBadge">CUT</span>' : (rank || '')}</div>
            <div style="min-width:0;">
              <div class="scorerRankActions">
                <button class="scorerRankFav" data-scorer-fav="${r.player.id}">${fav ? '\u2605' : '\u2606'}</button>
                <button class="scorerRankNameBtn" data-scorer-rank-detail="${r.player.id}">
                  ${open ? '\u25bc' : '\u25b6'} ${mine ? '\u2605 ' : ''}${escapeHtml(r.player.name || '')}
                </button>
              </div>
              <div class="scorerRankAff">${escapeHtml(r.player.affiliation || '')}</div>
            </div>
          </div>
          <div class="${parDiffClassV1662(scoreToPar)}" style="font-size:22px;font-weight:900;">${parDiffLabelV1662(scoreToPar)}</div>
        </div>
        <div class="scorerRankStats">
          <div class="scorerRankStat">SCORE<strong class="${parDiffClassV1662(scoreToPar)}">${parDiffLabelV1662(scoreToPar)}</strong></div>
          <div class="scorerRankStat">THRU<strong>${thruLabel(r)}</strong></div>
          <div class="scorerRankStat">TOTAL<strong>${totalScoreV1662(r.player)}</strong></div>
        </div>
        ${open ? scorerRankingDetailHtmlV1662(r.player) : ''}
      </div>
    `;
  }

  function bindScorerButtons() {
    document.querySelectorAll('[data-scorer-fav]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        if (typeof toggleScorerFavoritePlayer === 'function') toggleScorerFavoritePlayer(btn.dataset.scorerFav);
      };
    });
    document.querySelectorAll('[data-scorer-rank-detail]').forEach(btn => {
      btn.onclick = () => {
        if (typeof toggleScorerRankingDetail === 'function') toggleScorerRankingDetail(btn.dataset.scorerRankDetail);
      };
    });
  }

  function renderScorerRankingV1662() {
    if (!hasState()) return;
    if (!state.scorerOpenPlayers) state.scorerOpenPlayers = [];
    const el = document.getElementById('scorerRankingBoard');
    const updated = document.getElementById('scorerRankingUpdated');
    if (!el) return;
    if (updated && typeof nowTimeLabel === 'function') updated.textContent = `更新 ${nowTimeLabel()}`;
    const myIds = typeof scorerGroupPlayerIds === 'function' ? scorerGroupPlayerIds() : [];
    const rows = sortRankingRows(allRankingRows().filter(r => r.status !== 'withdrawn' && r.status !== 'dns'));
    if (!rows.length) {
      el.innerHTML = '<div class="noticeEmpty">ランキングデータはまだありません。</div>';
      return;
    }
    const favRows = rows.filter(r => typeof isScorerFavoritePlayer === 'function' && isScorerFavoritePlayer(r.player.id));
    const favBlock = favRows.length ? `
      <div class="scorerRankFavoriteBlock">
        <h3>お気に入りプレーヤー</h3>
        <div class="scorerRankList">${favRows.map(r => scorerRankingCardHtmlV1662(r, '', myIds.includes(r.player.id))).join('')}</div>
      </div>
    ` : '';
    el.innerHTML = `${favBlock}<div class="scorerRankList">${rows.map((r, i) => scorerRankingCardHtmlV1662(r, i + 1, myIds.includes(r.player.id))).join('')}</div>`;
    bindScorerButtons();
  }

  function renderPublicLeaderboardV1662() {
    if (!hasState()) return;
    const el = document.getElementById('publicLeaderboard');
    const updated = document.getElementById('publicUpdated');
    if (!el) return;
    if (updated && typeof nowTimeLabel === 'function') updated.textContent = `更新 ${nowTimeLabel()}`;
    const activeRows = sortRankingRows(allRankingRows().filter(r => r.status !== 'withdrawn'));
    const withdrawnRows = allRankingRows().filter(r => r.status === 'withdrawn').sort((a,b) => String(a.player.name || '').localeCompare(String(b.player.name || ''), 'ja'));
    const rows = [...activeRows, ...withdrawnRows];
    if (!rows.length) {
      el.innerHTML = '<div class="noticeEmpty">ランキングデータはまだありません。</div>';
      return;
    }
    const favRows = rows.filter(r => typeof isFavoritePlayer === 'function' && isFavoritePlayer(r.player.id));
    const favBlock = favRows.length ? `
      <div class="favoriteBlock">
        <h3>お気に入りプレーヤー</h3>
        <table class="publicTable">
          <thead><tr><th></th><th>選手</th><th style="text-align:right;">SCORE</th><th>THRU</th><th style="text-align:right;">TOTAL</th></tr></thead>
          <tbody>${publicRowsHtmlV1662(favRows, false)}</tbody>
        </table>
      </div>
    ` : '';
    el.innerHTML = `
      ${favBlock}
      <table class="publicTable">
        <thead><tr><th>順位</th><th>選手</th><th style="text-align:right;">SCORE</th><th>THRU</th><th style="text-align:right;">TOTAL</th></tr></thead>
        <tbody>${publicRowsHtmlV1662(rows, true)}</tbody>
      </table>
    `;
    bindPublicButtons();
  }

  function renderMonitorRankingV1662() {
    if (!hasState()) return;
    const el = document.getElementById('monitorRanking');
    if (!el) return;
    const rows = sortRankingRows(allRankingRows().filter(r => r.status !== 'withdrawn')).slice(0, 10);
    if (!rows.length) {
      el.innerHTML = '<div class="noticeEmpty">ランキングデータはまだありません。</div>';
      return;
    }
    el.innerHTML = `
      <table>
        <thead><tr><th>順位</th><th>選手</th><th>組</th><th>SCORE</th><th>THRU</th><th>TOTAL</th></tr></thead>
        <tbody>
          ${rows.map((r, i) => {
            const open = typeof isMonitorOpenPlayer === 'function' ? isMonitorOpenPlayer(r.player.id) : false;
            const scoreToPar = scoreToParV1662(r.player);
            const cut = isCutPlayer(r.player);
            return `
              <tr class="${cut ? 'v1662CutRow' : ''}">
                <td>${cut ? '<span class="v1662CutBadge">CUT</span>' : i + 1}</td>
                <td><button class="monitorPlayerLink" data-monitor-detail="${r.player.id}">${open ? '\u25bc' : '\u25b6'} ${escapeHtml(r.player.name || '')}</button></td>
                <td>${escapeHtml(r.group || '')}</td>
                <td class="${parDiffClassV1662(scoreToPar)}"><strong>${parDiffLabelV1662(scoreToPar)}</strong></td>
                <td>${thruLabel(r)}</td>
                <td class="rankScore">${totalScoreV1662(r.player)}</td>
              </tr>
              ${open ? monitorDetailRowV1662(r) : ''}
            `;
          }).join('')}
        </tbody>
      </table>
    `;
    document.querySelectorAll('[data-monitor-detail]').forEach(btn => {
      btn.onclick = () => {
        if (typeof toggleMonitorPlayerDetails === 'function') toggleMonitorPlayerDetails(btn.dataset.monitorDetail);
      };
    });
  }

  function renderRankingV1662() {
    if (!hasState()) return;
    const body = document.getElementById('rankingBody');
    if (!body) return;
    const active = sortRankingRows(allRankingRows().filter(r => r.status !== 'withdrawn'));
    const withdrawn = allRankingRows().filter(r => r.status === 'withdrawn').sort((a,b) => String(a.player.name || '').localeCompare(String(b.player.name || ''), 'ja'));
    const cutIds = cutPlayerIds();
    body.innerHTML = '';
    active.forEach((r, index) => {
      const cut = cutIds.has(r.player.id);
      const tr = document.createElement('tr');
      tr.className = cut ? 'v1662CutRow' : '';
      tr.innerHTML = `
        <td>${cut ? '<span class="v1662CutBadge">CUT</span>' : index + 1}</td>
        <td><strong>${escapeHtml(r.player.name || '')}</strong></td>
        <td>${escapeHtml(r.group || '')}</td>
        <td>${thruLabel(r)}</td>
        <td class="rankScore">${totalScoreV1662(r.player)}</td>
        <td>${cut ? '<span class="v1662CutBadge">CUT</span>' : 'プレー中'}</td>
      `;
      body.appendChild(tr);
    });
    withdrawn.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>-</td>
        <td><strong>${escapeHtml(r.player.name || '')}</strong></td>
        <td>${escapeHtml(r.group || '')}</td>
        <td>${thruLabel(r)}</td>
        <td class="rankScore">-</td>
        <td class="wd">WD</td>
      `;
      body.appendChild(tr);
    });
  }

  function patchMonitorAi() {
    const aiRankingBody = document.getElementById('rankingBody');
    const isAiMonitor = document.title && /AI LIVE MONITOR/i.test(document.title);
    if (!isAiMonitor || !aiRankingBody) return false;
    try {
      if (typeof playerTotals === 'function') {
        playerTotals = function(player) {
          const holes = entriesThroughRound(player).length;
          const strokes = totalScoreV1662(player);
          const toPar = scoreToParV1662(player);
          return { strokes, par: strokes - toPar, holes, toPar };
        };
      }
      if (typeof thruLabel === 'function') {
        thruLabel = function(playerOrRow) {
          return (window.v1662Ranking || {}).thruLabel(playerOrRow) || '-';
        };
      }
      if (typeof rankingRows === 'function') {
        rankingRows = function() {
          const rows = sortRankingRows(allRankingRows().filter(r => r.status !== 'withdrawn' && r.status !== 'dns'))
            .map(r => ({
              group: r.groupObj,
              player: r.player,
              total: {
                strokes: r.total,
                par: r.total - r.toPar,
                holes: r.holes,
                toPar: r.toPar
              }
            }));
          let previous = null;
          let rank = 0;
          rows.forEach((row, index) => {
            if (previous === null || row.total.toPar !== previous) rank = index + 1;
            row.rank = rank;
            previous = row.total.toPar;
          });
          return rows;
        };
      }
      if (typeof renderAll === 'function') renderAll();
      return true;
    } catch (e) {
      console.warn('[v16.6.2 ranking] monitor_ai patch failed', e);
      return false;
    }
  }

  function assignGlobal(name, fn) {
    window[name] = fn;
    try {
      if (name === 'getRankingRows') getRankingRows = fn;
      if (name === 'publicDetailRow') publicDetailRow = fn;
      if (name === 'publicRowsHtml') publicRowsHtml = fn;
      if (name === 'renderPublicLeaderboard') renderPublicLeaderboard = fn;
      if (name === 'scorerRankingDetailHtml') scorerRankingDetailHtml = fn;
      if (name === 'scorerRankingCardHtml') scorerRankingCardHtml = fn;
      if (name === 'renderScorerRanking') renderScorerRanking = fn;
      if (name === 'monitorDetailRow') monitorDetailRow = fn;
      if (name === 'renderMonitorRanking') renderMonitorRanking = fn;
      if (name === 'renderRanking') renderRanking = fn;
      if (name === 'holesCompleted') holesCompleted = fn;
      if (name === 'completedHolesForPlayer') completedHolesForPlayer = fn;
    } catch (e) {}
  }

  function decorateStyles() {
    if (document.getElementById('v1662RankingStyles')) return;
    const style = document.createElement('style');
    style.id = 'v1662RankingStyles';
    style.textContent = `
      .v1662CutBadge{display:inline-block;padding:3px 7px;border-radius:6px;background:#111827;color:#fff;font-weight:900;font-size:12px;line-height:1;}
      .v1662CutRow{opacity:.74;}
      .v1662HbhBox{display:block;}
      .v1662RoundBlock{margin:10px 0 16px;padding:10px;border:1px solid rgba(148,163,184,.35);border-radius:8px;background:rgba(255,255,255,.04);}
      .v1662RoundHeading{font-weight:900;color:#f6d46b;margin-bottom:8px;}
      .v1662RoundNineTitle{margin:8px 0 4px;font-weight:900;color:#f6d46b;}
      .v1662HbhScroll{overflow-x:auto;}
      .v1662HbhTable{min-width:760px;}
      .v1662RoundSummary,.v1662GrandTotal{margin-top:8px;font-weight:900;}
    `;
    document.head.appendChild(style);
  }

  function install() {
    decorateStyles();
    if (patchMonitorAi()) return;
    if (!hasState()) return;
    assignGlobal('getRankingRows', allRankingRows);
    assignGlobal('publicDetailRow', publicDetailRowV1662);
    assignGlobal('publicRowsHtml', publicRowsHtmlV1662);
    assignGlobal('renderPublicLeaderboard', renderPublicLeaderboardV1662);
    assignGlobal('scorerRankingDetailHtml', scorerRankingDetailHtmlV1662);
    assignGlobal('scorerRankingCardHtml', scorerRankingCardHtmlV1662);
    assignGlobal('renderScorerRanking', renderScorerRankingV1662);
    assignGlobal('monitorDetailRow', monitorDetailRowV1662);
    assignGlobal('renderMonitorRanking', renderMonitorRankingV1662);
    assignGlobal('renderRanking', renderRankingV1662);
    assignGlobal('holesCompleted', currentRoundHoles);
    assignGlobal('completedHolesForPlayer', player => holesInRound(player, currentRound()));
    try {
      if (typeof renderRanking === 'function') renderRanking();
      if (typeof renderPublicLeaderboard === 'function') renderPublicLeaderboard();
      if (typeof renderScorerRanking === 'function') renderScorerRanking();
      if (typeof renderMonitorRanking === 'function') renderMonitorRanking();
    } catch (e) {
      console.warn('[v16.6.2 ranking] render refresh failed', e);
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

  window.v1662Ranking = {
    currentRound,
    roundCount,
    scoreMap,
    scoreValue,
    currentRoundHoles,
    thruLabel,
    totalScoreV1662,
    scoreToParV1662,
    allRankingRows,
    cutPlayerIds,
    isCutPlayer
  };

  document.addEventListener('DOMContentLoaded', () => setTimeout(install, 0));
  window.addEventListener('load', () => {
    install();
    setTimeout(install, 500);
    setTimeout(install, 1800);
  });
  setTimeout(install, 150);
})();
