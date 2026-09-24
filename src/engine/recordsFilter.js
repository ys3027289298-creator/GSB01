export const RECORD_TYPES = ['click', 'turn', 'tracking', 'recoil', 'calibration'];

export const TYPE_LABELS = {
  click: '快速点击',
  turn: '快速转向',
  tracking: '目标跟踪',
  recoil: '压枪稳定',
  calibration: '鼠标校准'
};

export const TIME_RANGES = ['all', '7d', '30d'];
export const SORT_ORDERS = ['newest', 'oldest', 'score-desc', 'score-asc'];

export const DEFAULT_QUERY = { type: 'all', profile: 'all', time: 'all', sort: 'newest' };

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeProfileName(record) {
  const name = record && record.profileName;
  return typeof name === 'string' && name.trim() ? name : '默认';
}

export function hasValidScore(record) {
  return Boolean(
    record &&
    record.summary &&
    typeof record.summary.score === 'number' &&
    Number.isFinite(record.summary.score)
  );
}

function recordTime(record) {
  const t = Date.parse(record && record.createdAt);
  return Number.isFinite(t) ? t : null;
}

export function parseRecordsQuery(params = {}) {
  const query = { ...DEFAULT_QUERY };
  if (params && RECORD_TYPES.includes(params.type)) query.type = params.type;
  if (params && typeof params.profile === 'string' && params.profile.trim()) {
    query.profile = params.profile;
  }
  if (params && TIME_RANGES.includes(params.time)) query.time = params.time;
  if (params && SORT_ORDERS.includes(params.sort)) query.sort = params.sort;
  return query;
}

export function queryToParams(query) {
  const q = { ...DEFAULT_QUERY, ...(query || {}) };
  const params = {};
  if (q.type !== DEFAULT_QUERY.type) params.type = q.type;
  if (q.profile !== DEFAULT_QUERY.profile) params.profile = q.profile;
  if (q.time !== DEFAULT_QUERY.time) params.time = q.time;
  if (q.sort !== DEFAULT_QUERY.sort) params.sort = q.sort;
  return params;
}

export function listProfileNames(records) {
  const names = new Set();
  for (const r of Array.isArray(records) ? records : []) names.add(normalizeProfileName(r));
  return [...names].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function filterRecords(records, query = DEFAULT_QUERY, now = Date.now()) {
  const q = { ...DEFAULT_QUERY, ...(query || {}) };
  const list = Array.isArray(records) ? records : [];
  return list.filter((r) => {
    if (!r || typeof r !== 'object') return false;
    if (q.type !== 'all' && r.type !== q.type) return false;
    if (q.profile !== 'all' && normalizeProfileName(r) !== q.profile) return false;
    if (q.time !== 'all') {
      const days = q.time === '7d' ? 7 : 30;
      const t = recordTime(r);
      if (t === null) return false;
      if (now - t > days * DAY_MS) return false;
    }
    return true;
  });
}

const COMPARATORS = {
  newest: (a, b) => (recordTime(b) ?? 0) - (recordTime(a) ?? 0),
  oldest: (a, b) => (recordTime(a) ?? 0) - (recordTime(b) ?? 0),
  'score-desc': (a, b) => scoreKey(b, 1) - scoreKey(a, 1),
  'score-asc': (a, b) => scoreKey(a, -1) - scoreKey(b, -1)
};

function scoreKey(record, missingDirection) {
  return hasValidScore(record) ? record.summary.score : missingDirection * -Infinity;
}

export function sortRecords(records, sort = 'newest') {
  const list = Array.isArray(records) ? records : [];
  const cmp = COMPARATORS[sort] || COMPARATORS.newest;
  return list
    .map((record, index) => ({ record, index }))
    .sort((a, b) => cmp(a.record, b.record) || a.index - b.index)
    .map((entry) => entry.record);
}

export function analyzeRecords(records) {
  const list = Array.isArray(records) ? records : [];
  const scored = list.filter(hasValidScore);
  const scoredCount = scored.length;
  const avgScore = scoredCount
    ? scored.reduce((sum, r) => sum + r.summary.score, 0) / scoredCount
    : null;
  let best = null;
  for (const r of scored) {
    if (!best || r.summary.score > best.score) {
      best = { id: r.id, type: r.type, score: r.summary.score };
    }
  }
  const typeCounts = {};
  for (const type of RECORD_TYPES) typeCounts[type] = 0;
  for (const r of list) {
    const type = RECORD_TYPES.includes(r && r.type) ? r.type : 'unknown';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  }
  if (!typeCounts.unknown) delete typeCounts.unknown;
  return { total: list.length, scoredCount, avgScore, best, typeCounts };
}
