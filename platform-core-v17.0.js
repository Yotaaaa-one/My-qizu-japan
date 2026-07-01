(function(global) {
  const VERSION = 'v17.0';
  const firebaseConfig = {
    apiKey: "AIzaSyCcHuDIRU8w2bcZBuXLO4dr-vdKcygNdMc",
    authDomain: "pgascoredatebace.firebaseapp.com",
    projectId: "pgascoredatebace",
    storageBucket: "pgascoredatebace.firebasestorage.app",
    messagingSenderId: "605130500501",
    appId: "1:605130500501:web:4d77d1a6a5cd56c7336e9c",
    measurementId: "G-23N9V3D1E0"
  };

  const PLAYER_FIELDS = [
    'playerId',
    'name',
    'kana',
    'affiliation',
    'qualification',
    'year',
    'registered',
    'seed',
    'qualifierRank',
    'birthDate',
    'email',
    'phone',
    'status',
    'createdAt',
    'updatedAt'
  ];

  const QUALIFICATIONS = [
    { value: '', label: '未設定' },
    { value: 'professional', label: 'プロ' },
    { value: 'amateur', label: 'アマチュア' },
    { value: 'invited', label: '招待' },
    { value: 'other', label: 'その他' }
  ];

  const STATUSES = [
    { value: 'active', label: '有効' },
    { value: 'inactive', label: '無効' },
    { value: 'suspended', label: '停止' }
  ];

  let ready = false;
  let authUnsubscribe = null;
  let toastTimer = null;

  function initFirebase() {
    if (!global.firebase) {
      throw new Error('Firebase SDK が読み込まれていません。');
    }
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    ready = true;
    return firebase.app();
  }

  function db() {
    initFirebase();
    return firebase.firestore();
  }

  function auth() {
    initFirebase();
    return firebase.auth();
  }

  function serverTimestamp() {
    initFirebase();
    return firebase.firestore.FieldValue.serverTimestamp();
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

  function normalizeText(value) {
    return String(value ?? '').trim().toLowerCase();
  }

  function formatDateTime(value) {
    if (!value) return '-';
    try {
      const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
      if (Number.isNaN(date.getTime())) return '-';
      return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return '-';
    }
  }

  function formatDate(value) {
    if (!value) return '';
    try {
      const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toISOString().slice(0, 10);
    } catch (e) {
      return String(value);
    }
  }

  function qualificationLabel(value) {
    return QUALIFICATIONS.find(row => row.value === value)?.label || value || '未設定';
  }

  function statusLabel(value) {
    return STATUSES.find(row => row.value === value)?.label || value || '未設定';
  }

  function badgeClassForStatus(value) {
    if (value === 'active') return 'badge';
    if (value === 'inactive') return 'badge disabled';
    return 'badge pending';
  }

  function showToast(message) {
    let toast = document.getElementById('platformToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'platformToast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
  }

  async function fetchUserProfile(uid) {
    try {
      const snap = await db().collection('users').doc(uid).get();
      return snap.exists ? snap.data() : null;
    } catch (error) {
      console.warn('[v17 platform] users role fetch skipped', error);
      return null;
    }
  }

  function updateUserChip(user, profile) {
    document.querySelectorAll('[data-auth-email]').forEach(el => {
      el.textContent = user?.email || '未ログイン';
    });
    document.querySelectorAll('[data-auth-role]').forEach(el => {
      el.textContent = profile?.role || 'login';
    });
  }

  function ensureAuthOverlay(pageName) {
    let overlay = document.getElementById('platformAuthOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'platformAuthOverlay';
    overlay.className = 'platformAuthOverlay show';
    overlay.innerHTML = `
      <div class="authCard">
        <div class="authHeader">
          <h2>${escapeHtml(pageName || '管理画面ログイン')}</h2>
          <p class="smallText">Firebase Authentication のメールアドレスとパスワードでログインしてください。</p>
        </div>
        <div class="authBody">
          <div class="formGrid">
            <div class="field">
              <label for="platformAuthEmail">メールアドレス</label>
              <input id="platformAuthEmail" type="email" autocomplete="username">
            </div>
            <div class="field">
              <label for="platformAuthPassword">パスワード</label>
              <input id="platformAuthPassword" type="password" autocomplete="current-password">
            </div>
          </div>
          <div id="platformAuthError" class="authError"></div>
          <div class="buttonRow" style="margin-top:16px;">
            <button id="platformAuthLoginBtn" class="btn">ログイン</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const submit = async () => {
      const email = document.getElementById('platformAuthEmail')?.value.trim();
      const password = document.getElementById('platformAuthPassword')?.value || '';
      const errorBox = document.getElementById('platformAuthError');
      if (errorBox) errorBox.classList.remove('show');
      if (!email || !password) {
        if (errorBox) {
          errorBox.textContent = 'メールアドレスとパスワードを入力してください。';
          errorBox.classList.add('show');
        }
        return;
      }
      try {
        await auth().signInWithEmailAndPassword(email, password);
      } catch (error) {
        if (errorBox) {
          errorBox.textContent = 'ログインできませんでした: ' + (error.message || error.code);
          errorBox.classList.add('show');
        }
      }
    };

    document.getElementById('platformAuthLoginBtn')?.addEventListener('click', submit);
    document.getElementById('platformAuthPassword')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') submit();
    });

    return overlay;
  }

  function requireAuth(options = {}) {
    initFirebase();
    const overlay = ensureAuthOverlay(options.pageName || 'PGA Tournament Platform');
    let initialized = false;

    if (authUnsubscribe) authUnsubscribe();
    authUnsubscribe = auth().onAuthStateChanged(async user => {
      if (!user) {
        document.body.classList.remove('platform-authenticated');
        overlay.classList.add('show');
        updateUserChip(null, null);
        return;
      }

      const profile = await fetchUserProfile(user.uid);
      document.body.classList.add('platform-authenticated');
      overlay.classList.remove('show');
      updateUserChip(user, profile);
      bindLogoutButtons();

      if (!initialized && typeof options.onReady === 'function') {
        initialized = true;
        options.onReady({ user, profile, role: profile?.role || 'login' });
      }
    });
  }

  function bindLogoutButtons() {
    document.querySelectorAll('[data-platform-logout]').forEach(btn => {
      if (btn.dataset.boundLogout) return;
      btn.dataset.boundLogout = '1';
      btn.addEventListener('click', async () => {
        await auth().signOut();
        location.reload();
      });
    });
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const source = String(text || '').replace(/^\uFEFF/, '');

    for (let i = 0; i < source.length; i += 1) {
      const c = source[i];
      const next = source[i + 1];
      if (quoted) {
        if (c === '"' && next === '"') {
          cell += '"';
          i += 1;
        } else if (c === '"') {
          quoted = false;
        } else {
          cell += c;
        }
      } else if (c === '"') {
        quoted = true;
      } else if (c === ',') {
        row.push(cell);
        cell = '';
      } else if (c === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else if (c !== '\r') {
        cell += c;
      }
    }
    row.push(cell);
    rows.push(row);
    return rows.filter(r => r.some(v => String(v).trim() !== ''));
  }

  function csvToObjects(text) {
    const rows = parseCsv(text);
    if (!rows.length) return [];
    const headers = rows[0].map(h => String(h || '').trim());
    return rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] ?? '';
      });
      return obj;
    });
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function objectsToCsv(objects, headers = PLAYER_FIELDS) {
    const lines = [headers.map(csvEscape).join(',')];
    objects.forEach(obj => {
      lines.push(headers.map(header => csvEscape(obj[header])).join(','));
    });
    return '\uFEFF' + lines.join('\r\n');
  }

  function downloadText(filename, content, type = 'text/plain') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('ファイルを読み込めませんでした。'));
      reader.readAsText(file, 'utf-8');
    });
  }

  function firstValue(record, keys) {
    for (const key of keys) {
      if (record[key] != null && String(record[key]).trim() !== '') return String(record[key]).trim();
    }
    return '';
  }

  function booleanValue(value) {
    return value === true || ['true', '1', 'yes', 'y', '有', 'あり', '対象'].includes(String(value ?? '').trim().toLowerCase());
  }

  function rankValue(value) {
    const rank = Number(value);
    return Number.isFinite(rank) && rank > 0 ? rank : null;
  }

  function getYearEligibility(player, year) {
    const key = String(year || '').trim();
    const stored = key && player?.years && typeof player.years === 'object' ? player.years[key] : null;
    if (stored && typeof stored === 'object') {
      const registered = booleanValue(stored.registered);
      return {
        registered,
        seed: registered && booleanValue(stored.seed),
        qualifierRank: registered ? rankValue(stored.qualifierRank) : null,
        source: 'years'
      };
    }
    if (key && Number(player?.eligibilityYear || 0) === Number(key)) {
      return {
        registered: true,
        seed: booleanValue(player?.hasTourEligibility),
        qualifierRank: rankValue(player?.qualifierRank),
        source: 'legacy'
      };
    }
    return { registered: false, seed: false, qualifierRank: null, source: 'none' };
  }

  function normalizePlayerRecord(record) {
    const status = firstValue(record, ['status', 'ステータス']) || 'active';
    const year = firstValue(record, ['year', '年度', 'eligibilityYear', '出場資格年度']);
    const registeredValue = firstValue(record, ['registered', '年間登録']);
    const seedValue = firstValue(record, ['seed', 'シード資格', 'hasTourEligibility', '出場資格', '出場資格有無']);
    const registered = registeredValue === '' ? (year ? true : null) : booleanValue(registeredValue);
    const seed = seedValue === '' ? null : booleanValue(seedValue);
    return {
      playerId: firstValue(record, ['playerId', 'id', 'ID', '選手ID']),
      name: firstValue(record, ['name', '氏名', '名前']),
      kana: firstValue(record, ['kana', 'フリガナ', 'ふりがな']),
      affiliation: firstValue(record, ['affiliation', '所属']),
      qualification: firstValue(record, ['qualification', '資格区分']),
      year,
      registered,
      seed,
      qualifierRank: firstValue(record, ['qualifierRank', '予選会ランキング', '予選会順位']),
      eligibilityYear: year,
      hasTourEligibility: seed,
      birthDate: firstValue(record, ['birthDate', '生年月日']),
      email: firstValue(record, ['email', 'メールアドレス', 'メール']),
      phone: firstValue(record, ['phone', '電話番号', '電話']),
      status
    };
  }

  function clonePlain(value, fallback = {}) {
    try {
      return JSON.parse(JSON.stringify(value ?? fallback));
    } catch (error) {
      return clonePlain(fallback, {});
    }
  }

  function emptyRoundScoreStore() {
    return { scores: {}, shots: {}, testScores: {}, testShots: {} };
  }

  function ensureCompatiblePlayerRounds(player, roundCount) {
    const count = Math.max(1, Math.min(4, Number(roundCount || 1)));
    if (!player.rounds || typeof player.rounds !== 'object' || Array.isArray(player.rounds)) player.rounds = {};
    if (!player.rounds['1'] && ['scores', 'shots', 'testScores', 'testShots'].some(key => Object.keys(player[key] || {}).length)) {
      player.rounds['1'] = {
        scores: clonePlain(player.scores),
        shots: clonePlain(player.shots),
        testScores: clonePlain(player.testScores),
        testShots: clonePlain(player.testShots)
      };
    }
    for (let round = 1; round <= count; round += 1) {
      const key = String(round);
      if (!player.rounds[key] || typeof player.rounds[key] !== 'object') player.rounds[key] = emptyRoundScoreStore();
      ['scores', 'shots', 'testScores', 'testShots'].forEach(field => {
        if (!player.rounds[key][field] || typeof player.rounds[key][field] !== 'object') player.rounds[key][field] = {};
      });
    }
    return player;
  }

  function scoreGroupsFromPairings(pairings, options = {}) {
    const round = Math.max(1, Math.min(4, Number(options.round || 1)));
    const roundCount = Math.max(round, Math.min(4, Number(options.roundCount || round)));
    const groupMode = options.mode === 'test' ? 'test' : 'live';
    const existingPlayers = options.existingPlayers && typeof options.existingPlayers.get === 'function' ? options.existingPlayers : new Map();
    return (pairings || []).slice().sort((left, right) => Number(left.groupId || left.id || 0) - Number(right.groupId || right.id || 0)).map(pairing => {
      const groupId = Number(pairing.groupId || pairing.id || 0);
      const plannedStart = pairing.startTime || pairing.plannedStart || '08:00';
      const players = (pairing.players || []).slice().sort((left, right) => Number(left.order || 999) - Number(right.order || 999)).map((source, index) => {
        const playerId = source.playerId || source.id;
        const existing = existingPlayers.get(playerId);
        const player = ensureCompatiblePlayerRounds(existing ? clonePlain(existing) : {
          id: playerId,
          name: source.playerName || source.name || '',
          affiliation: source.affiliation || '',
          status: 'active',
          scores: {},
          shots: {},
          testScores: {},
          testShots: {},
          rounds: {}
        }, roundCount);
        player.id = playerId;
        player.name = source.playerName || source.name || player.name || '';
        player.affiliation = source.affiliation || player.affiliation || '';
        player.status = player.status || 'active';
        player.roundStarts = { ...(player.roundStarts || {}), [String(round)]: plannedStart };
        player.startTimes = { ...(player.startTimes || {}), [String(round)]: plannedStart };
        player.plannedStart = plannedStart;
        player.startHole = Number(pairing.startHole) === 10 ? 10 : 1;
        player.order = index + 1;
        const activeStore = player.rounds[String(round)] || emptyRoundScoreStore();
        player.scores = activeStore.scores;
        player.shots = activeStore.shots;
        player.testScores = activeStore.testScores;
        player.testShots = activeStore.testShots;
        return player;
      });
      return {
        id: groupId,
        name: pairing.groupName || pairing.name || `第${groupId}組`,
        startHole: Number(pairing.startHole) === 10 ? 10 : 1,
        plannedStart,
        roundStarts: { [String(round)]: plannedStart },
        mode: groupMode,
        liveStartedAt: null,
        liveStartDiff: null,
        players
      };
    });
  }

  function pairingSnapshot(pairings, round) {
    return (pairings || []).map(group => ({
      round: Number(round || group.round || 1),
      groupId: Number(group.groupId || group.id || 0),
      groupName: group.groupName || group.name || '',
      startHole: Number(group.startHole) === 10 ? 10 : 1,
      startTime: group.startTime || group.plannedStart || '',
      players: (group.players || []).map((player, index) => ({
        playerId: player.playerId || player.id,
        playerName: player.playerName || player.name || '',
        affiliation: player.affiliation || '',
        order: Number(player.order || index + 1)
      }))
    }));
  }

  function buildInitialScoreState(master, roundOnePairings) {
    const roundCount = Math.max(1, Math.min(4, Number(master?.roundCount || 1)));
    const groups = scoreGroupsFromPairings(roundOnePairings, { round: 1, roundCount, mode: 'live' });
    return {
      tournamentName: master?.name || '',
      roundCount,
      currentRound: 1,
      cutEnabled: Boolean(master?.cutEnabled) && roundCount > 1,
      cutAfterRound: Math.max(1, Math.min(roundCount - 1 || 1, Number(master?.cutAfterRound || 1))),
      cutPosition: Math.max(1, Number(master?.cutPosition || 60)),
      cutIncludeTies: master?.cutIncludeTies !== false,
      groups,
      roundPairings: { '1': pairingSnapshot(roundOnePairings, 1) },
      selectedGroupId: groups[0]?.id || 1,
      selectedHole: groups[0]?.startHole || 1,
      notices: [],
      pace: {},
      timeLogs: [],
      suspension: { totalMinutes: 0, activeStart: null },
      deviceGroupId: null,
      assignedDeviceGroupIds: [],
      publicFavorites: [],
      publicOpenPlayers: [],
      scorerOpenPlayers: [],
      monitorOpenPlayers: []
    };
  }

  global.PGAPlatform = {
    VERSION,
    PLAYER_FIELDS,
    QUALIFICATIONS,
    STATUSES,
    initFirebase,
    db,
    auth,
    serverTimestamp,
    requireAuth,
    bindLogoutButtons,
    escapeHtml,
    normalizeText,
    formatDate,
    formatDateTime,
    qualificationLabel,
    statusLabel,
    badgeClassForStatus,
    showToast,
    parseCsv,
    csvToObjects,
    objectsToCsv,
    downloadText,
    readFileAsText,
    normalizePlayerRecord,
    booleanValue,
    getYearEligibility,
    rankValue,
    clonePlain,
    ensureCompatiblePlayerRounds,
    scoreGroupsFromPairings,
    pairingSnapshot,
    buildInitialScoreState
  };
})(window);
