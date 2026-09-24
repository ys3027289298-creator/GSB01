export const RECORD_TYPES = ['click', 'turn', 'tracking', 'recoil', 'calibration'];

export const TYPE_LABELS = {
  click: '快速点击',
  turn: '快速转向',
  tracking: '目标跟踪',
  recoil: '压枪稳定',
  calibration: '鼠标校准'
};

export const DEFAULT_PROFILE = '默认';

export const RANGES = ['all', '7d', '30d'];
export const SORTS = ['newest', 'oldest', 'scoreDesc', 'scoreAsc'];

export const DEFAULT_FILTERS = {
  type: 'all',
  profile: 'all',
  range: 'all',
  sort: 'newest'
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function profileNameOf(record) {
  const name = record && typeof record.profileName === 'string' ? record.profileName.trim() : '';
  return name || DEFAULT_PROFILE;
}

export function listProfiles(records) {
  const seen = [];
  for (const r of records || []) {
    const name = profileNameOf(r);
    if (!seen.includes(name)) seen.push(name);
  }
  return seen;
}

export function parseRecordsQuery(params = {}, records = []) {
  const filters = { ...DEFAULT_FILTERS };
  if (params && RECORD_TYPES.includes(params.type)) filters.type = params.type;
  if (params && RANGES.includes(params.range)) filters.range = params.range;
  if (params && SORTS.includes(params.sort)) filters.sort = params.sort;
  if (params && typeof params.profile === 'string' && params.profile !== 'all') {
    if (listProfiles(records).includes(params.profile)) filters.profile = params.profile;
  }
  return filters;
}

export function recordsQueryString(filters) {
  const merged = { ...DEFAULT_FILTERS, ...(filters || {}) };
  const qs = new URLSearchParams({
    type: merged.type,
    profile: merged.profile,
    range: merged.range,
    sort: merged.sort
  });
  return qs.toString();
}

function timeOf(record) {
  const t = Date.parse(record && record.createdAt);
  return Number.isFinite(t) ? t : null;
}

export function filterRecords(records, filters = DEFAULT_FILTERS, now = Date.now()) {
  const list = Array.isArray(records) ? records : [];
  const f = { ...DEFAULT_FILTERS, ...(filters || {}) };
  return list.filter((r) => {
    if (!r || typeof r !== 'object') return false;
    if (f.type !== 'all' && r.type !== f.type) return false;
    if (f.profile !== 'all' && profileNameOf(r) !== f.profile) return false;
    if (f.range !== 'all') {
      const t = timeOf(r);
      if (t === null) return false;
      const days = f.range === '7d' ? 7 : 30;
      if (t < now - days * DAY_MS || t > now + DAY_MS) return false;
    }
    return true;
  });
}

function scoreOf(record) {
  const s = record && record.summary ? record.summary.score : null;
  return typeof s === 'number' && Number.isFinite(s) ? s : null;
}

export function sortRecords(records, sort = 'newest') {
  const list = Array.isArray(records) ? records : [];
  const indexed = list.map((record, index) => ({ record, index }));
  const cmp = {
    newest: (a, b) => (timeOf(b.record) ?? -Infinity) - (timeOf(a.record) ?? -Infinity),
    oldest: (a, b) => (timeOf(a.record) ?? Infinity) - (timeOf(b.record) ?? Infinity),
    scoreDesc: (a, b) => (scoreOf(b.record) ?? -Infinity) - (scoreOf(a.record) ?? -Infinity),
    scoreAsc: (a, b) => {
      const sa = scoreOf(a.record);
      const sb = scoreOf(b.record);
      if (sa === null && sb === null) return 0;
      if (sa === null) return 1;
      if (sb === null) return -1;
      return sa - sb;
    }
  }[SORTS.includes(sort) ? sort : 'newest'];
  indexed.sort((a, b) => cmp(a, b) || a.index - b.index);
  return indexed.map((x) => x.record);
}

export function summarizeRecords(records) {
  const list = Array.isArray(records) ? records : [];
  const distribution = {};
  for (const t of RECORD_TYPES) distribution[t] = 0;
  let other = 0;
  let scoredCount = 0;
  let scoreSum = 0;
  let maxScore = null;
  let maxType = null;
  for (const r of list) {
    if (r && RECORD_TYPES.includes(r.type)) distribution[r.type] += 1;
    else other += 1;
    const s = scoreOf(r);
    if (s === null) continue;
    scoredCount += 1;
    scoreSum += s;
    if (maxScore === null || s > maxScore) {
      maxScore = s;
      maxType = r.type;
    }
  }
  if (other > 0) distribution.other = other;
  return {
    total: list.length,
    scoredCount,
    avgScore: scoredCount ? scoreSum / scoredCount : null,
    maxScore,
    maxType,
    distribution
  };
}
