import { clampSettings } from './settings.js';

export const BACKUP_FORMAT = 'fps-sensitivity-backup';
export const BACKUP_VERSION = 1;
export const MAX_RECORDS = 100;
export const KNOWN_TYPES = ['click', 'turn', 'tracking', 'recoil', 'calibration'];

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function deepCopy(value) {
  if (value === null || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      const copied = deepCopy(item);
      if (copied !== undefined) out.push(copied);
    }
    return out;
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const copied = deepCopy(item);
      if (copied !== undefined) out[key] = copied;
    }
    return out;
  }
  return undefined;
}

export function createBackup({ settings, records, profiles }, now = () => new Date()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now().toISOString(),
    settings: deepCopy(settings) || {},
    records: deepCopy(Array.isArray(records) ? records : []) || [],
    profiles: deepCopy(Array.isArray(profiles) ? profiles : []) || []
  };
}

const MIGRATIONS = {
  0(raw) {
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : null,
      settings: isPlainObject(raw.settings) ? raw.settings : {},
      records: Array.isArray(raw.records) ? raw.records : [],
      profiles: Array.isArray(raw.profiles) ? raw.profiles : [],
      migratedFrom: 0
    };
  }
};

export function parseBackup(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: '文件不是合法的 JSON，无法导入。' };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, error: '备份文件顶层必须是 JSON 对象。' };
  }
  if (raw.format !== BACKUP_FORMAT) {
    return { ok: false, error: '文件不是本工具的备份（format 不匹配）。' };
  }
  const version = raw.version;
  if (version === BACKUP_VERSION) {
    return { ok: true, backup: raw, migrated: false };
  }
  if (typeof version === 'number' && version > BACKUP_VERSION) {
    return { ok: false, error: `备份版本 v${version} 高于当前支持的 v${BACKUP_VERSION}，请升级应用后再导入。` };
  }
  const migrate = MIGRATIONS[version];
  if (migrate) {
    return { ok: true, backup: migrate(raw), migrated: true };
  }
  return { ok: false, error: `不支持的备份版本：${String(version)}。` };
}

export function validateSettings(raw) {
  if (!isPlainObject(raw)) {
    return { ok: false, error: '备份中的 settings 必须是对象。', settings: null };
  }
  return { ok: true, settings: clampSettings(raw) };
}

function isValidDateString(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function validateRecords(raw) {
  if (!Array.isArray(raw)) {
    return { ok: false, error: '备份中的 records 必须是数组。', valid: [], invalid: [] };
  }
  const valid = [];
  const invalid = [];
  raw.forEach((record, index) => {
    const fail = (reason) => invalid.push({ index, id: record?.id ?? null, reason });
    if (!isPlainObject(record)) return fail('记录不是对象');
    if (typeof record.id !== 'string' || !record.id.trim()) return fail('缺少有效的记录 ID');
    if (typeof record.type !== 'string' || !record.type.trim()) return fail('缺少可识别的 type');
    if (!isPlainObject(record.stats)) return fail('缺少 stats 数据');
    if (!isPlainObject(record.settings)) return fail('缺少 settings 数据');
    if (!isValidDateString(record.createdAt)) return fail('createdAt 时间无效');
    if (record.summary != null && !isPlainObject(record.summary)) return fail('summary 格式非法');

    const normalized = {
      id: record.id,
      type: record.type,
      createdAt: new Date(record.createdAt).toISOString(),
      stats: deepCopy(record.stats),
      settings: deepCopy(record.settings)
    };
    if (typeof record.profileName === 'string' && record.profileName) {
      normalized.profileName = record.profileName;
    }
    if (KNOWN_TYPES.includes(record.type)) {
      if (isPlainObject(record.summary)) normalized.summary = deepCopy(record.summary);
    } else {
      normalized.unknownType = true;
    }
    valid.push(normalized);
  });
  return { ok: true, valid, invalid };
}

export function validateProfiles(raw) {
  if (!Array.isArray(raw)) {
    return { ok: false, error: '备份中的 profiles 必须是数组。', valid: [], invalid: [] };
  }
  const valid = [];
  const invalid = [];
  raw.forEach((profile, index) => {
    const fail = (reason) => invalid.push({ index, id: profile?.id ?? null, reason });
    if (!isPlainObject(profile)) return fail('方案不是对象');
    if (typeof profile.id !== 'string' || !profile.id.trim()) return fail('缺少有效的方案 ID');
    const normalized = {
      id: profile.id,
      name: typeof profile.name === 'string' && profile.name ? profile.name : '未命名方案',
      createdAt: isValidDateString(profile.createdAt) ? new Date(profile.createdAt).toISOString() : null,
      settings: clampSettings(isPlainObject(profile.settings) ? profile.settings : {})
    };
    valid.push(normalized);
  });
  return { ok: true, valid, invalid };
}

export function validateBackup(backup) {
  const settings = validateSettings(backup.settings);
  const records = validateRecords(backup.records);
  const profiles = validateProfiles(backup.profiles);
  return {
    ok: settings.ok && records.ok && profiles.ok,
    settings,
    records,
    profiles
  };
}

function sortRecordsDesc(records) {
  return records
    .map((record, index) => ({ record, index, time: Date.parse(record.createdAt) }))
    .sort((a, b) => {
      const ta = Number.isFinite(a.time) ? a.time : -Infinity;
      const tb = Number.isFinite(b.time) ? b.time : -Infinity;
      if (tb !== ta) return tb - ta;
      return a.index - b.index;
    })
    .map((entry) => entry.record);
}

export function computePreview(backup, validation, current, mode) {
  const currentRecordIds = new Set((current.records || []).map((r) => r.id));
  const currentProfileIds = new Set((current.profiles || []).map((p) => p.id));
  const validRecords = validation.records.valid;
  const validProfiles = validation.profiles.valid;
  const duplicateRecordIds = mode === 'merge'
    ? validRecords.filter((r) => currentRecordIds.has(r.id)).length
    : 0;
  const duplicateProfileIds = mode === 'merge'
    ? validProfiles.filter((p) => currentProfileIds.has(p.id)).length
    : 0;
  const settingsChanged = mode === 'replace'
    ? JSON.stringify(validation.settings.settings) !== JSON.stringify(current.settings)
    : false;
  return {
    mode,
    version: backup.version,
    exportedAt: typeof backup.exportedAt === 'string' ? backup.exportedAt : null,
    migrated: Boolean(backup.migratedFrom != null),
    settingsChanged,
    totalRecords: validRecords.length + validation.records.invalid.length,
    validRecords: validRecords.length,
    invalidRecords: validation.records.invalid.length,
    newRecords: validRecords.length - duplicateRecordIds,
    duplicateRecordIds,
    profileCount: validProfiles.length,
    invalidProfiles: validation.profiles.invalid.length,
    newProfiles: validProfiles.length - duplicateProfileIds,
    duplicateProfileIds
  };
}

export function applyImport(validation, current, mode) {
  if (mode === 'replace') {
    return {
      settings: validation.settings.settings,
      records: sortRecordsDesc(validation.records.valid).slice(0, MAX_RECORDS),
      profiles: validation.profiles.valid.slice()
    };
  }
  const currentRecordIds = new Set((current.records || []).map((r) => r.id));
  const currentProfileIds = new Set((current.profiles || []).map((p) => p.id));
  const addedRecords = validation.records.valid.filter((r) => !currentRecordIds.has(r.id));
  const addedProfiles = validation.profiles.valid.filter((p) => !currentProfileIds.has(p.id));
  return {
    settings: deepCopy(current.settings),
    records: sortRecordsDesc([...(current.records || []), ...addedRecords]).slice(0, MAX_RECORDS),
    profiles: [...(current.profiles || []), ...addedProfiles]
  };
}
