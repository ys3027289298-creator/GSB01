import { clampSettings } from './settings.js';

export const BACKUP_FORMAT = 'fps-sensitivity-backup';
export const BACKUP_VERSION = 1;
export const MAX_RECORDS = 100;
export const KNOWN_TYPES = ['click', 'turn', 'tracking', 'recoil', 'calibration'];

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function buildBackup({ settings, records, profiles }, now = new Date()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    settings: deepCopy(settings ?? {}),
    records: deepCopy(records ?? []),
    profiles: deepCopy(profiles ?? [])
  };
}

export function migrateLegacy(data) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
    settings: isPlainObject(data.settings) ? data.settings : {},
    records: Array.isArray(data.records) ? data.records : [],
    profiles: Array.isArray(data.profiles) ? data.profiles : [],
    migratedFrom: data.version
  };
}

export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: '文件不是合法的 JSON，无法导入。' };
  }
  if (!isPlainObject(data)) {
    return { ok: false, error: '备份文件结构不正确：顶层必须是 JSON 对象。' };
  }
  if (data.format !== BACKUP_FORMAT) {
    return { ok: false, error: `无法识别的备份格式（format: ${JSON.stringify(data.format ?? null)}）。` };
  }
  if (typeof data.version !== 'number' || !Number.isInteger(data.version) || data.version < 0) {
    return { ok: false, error: '备份文件缺少有效的 version 字段。' };
  }
  if (data.version > BACKUP_VERSION) {
    return {
      ok: false,
      future: true,
      error: `备份版本 ${data.version} 高于当前支持的版本 ${BACKUP_VERSION}，为避免丢失数据已拒绝导入，请升级应用后再试。`
    };
  }
  if (data.version < BACKUP_VERSION) {
    return { ok: true, backup: migrateLegacy(data), migrated: true, fromVersion: data.version };
  }
  return { ok: true, backup: data, migrated: false };
}

export function validateSettings(raw) {
  const ok = isPlainObject(raw);
  return { ok, settings: clampSettings(ok ? raw : {}) };
}

function normalizeRecord(item) {
  if (!isPlainObject(item)) return null;
  if (typeof item.id !== 'string' || !item.id.trim()) return null;
  if (typeof item.type !== 'string' || !item.type.trim()) return null;
  if (!isPlainObject(item.stats)) return null;
  if (!isPlainObject(item.settings)) return null;
  if (item.summary != null && !isPlainObject(item.summary)) return null;
  const time = Date.parse(item.createdAt);
  if (!Number.isFinite(time)) return null;
  const record = {
    id: item.id,
    type: item.type,
    createdAt: new Date(time).toISOString(),
    stats: deepCopy(item.stats),
    settings: deepCopy(item.settings)
  };
  if (typeof item.profileName === 'string' && item.profileName) record.profileName = item.profileName;
  if (item.summary != null) record.summary = deepCopy(item.summary);
  if (!KNOWN_TYPES.includes(item.type)) {
    record.unknownType = true;
    delete record.summary;
  }
  return record;
}

export function validateRecords(raw) {
  if (!Array.isArray(raw)) {
    return { ok: false, valid: [], invalid: 0, error: '备份中的 records 必须是数组。' };
  }
  const valid = [];
  let invalid = 0;
  for (const item of raw) {
    const record = normalizeRecord(item);
    if (record) valid.push(record);
    else invalid += 1;
  }
  return { ok: true, valid, invalid };
}

function normalizeProfile(item) {
  if (!isPlainObject(item)) return null;
  if (typeof item.id !== 'string' || !item.id.trim()) return null;
  if (!isPlainObject(item.settings)) return null;
  const profile = {
    id: item.id,
    name: typeof item.name === 'string' && item.name ? item.name : '未命名方案',
    settings: clampSettings(item.settings)
  };
  const time = Date.parse(item.createdAt);
  profile.createdAt = Number.isFinite(time) ? new Date(time).toISOString() : null;
  return profile;
}

export function validateProfiles(raw) {
  if (!Array.isArray(raw)) {
    return { ok: false, valid: [], invalid: 0, error: '备份中的 profiles 必须是数组。' };
  }
  const valid = [];
  let invalid = 0;
  for (const item of raw) {
    const profile = normalizeProfile(item);
    if (profile) valid.push(profile);
    else invalid += 1;
  }
  return { ok: true, valid, invalid };
}

export function validateBackup(backup) {
  return {
    settings: validateSettings(backup.settings),
    records: validateRecords(backup.records),
    profiles: validateProfiles(backup.profiles)
  };
}

function recordTime(record) {
  const t = Date.parse(record?.createdAt);
  return Number.isFinite(t) ? t : null;
}

export function sortRecordsDesc(records) {
  return records
    .map((record, index) => ({ record, index, time: recordTime(record) }))
    .sort((a, b) => {
      if (a.time == null && b.time == null) return a.index - b.index;
      if (a.time == null || b.time == null) return a.index - b.index;
      if (a.time !== b.time) return b.time - a.time;
      return a.index - b.index;
    })
    .map((entry) => entry.record);
}

export function computePreview(backup, current, mode) {
  const result = validateBackup(backup);
  const errors = [];
  if (!result.settings.ok) errors.push('settings 字段不是对象，已按默认设置归一化。');
  if (result.records.error) errors.push(result.records.error);
  if (result.profiles.error) errors.push(result.profiles.error);

  const validRecords = result.records.valid;
  const validProfiles = result.profiles.valid;
  const currentRecordIds = new Set((current.records || []).map((r) => r.id));
  const currentProfileIds = new Set((current.profiles || []).map((p) => p.id));

  const duplicateIds = validRecords.filter((r) => currentRecordIds.has(r.id)).length;
  const duplicateProfileIds = validProfiles.filter((p) => currentProfileIds.has(p.id)).length;

  const settingsChanged = JSON.stringify(result.settings.settings) !== JSON.stringify(current.settings);

  return {
    ok: errors.length === 0,
    errors,
    version: backup.version,
    exportedAt: typeof backup.exportedAt === 'string' ? backup.exportedAt : null,
    migrated: Boolean(backup.migratedFrom != null),
    mode,
    settingsChanged,
    totalRecords: Array.isArray(backup.records) ? backup.records.length : 0,
    validRecords: validRecords.length,
    invalidRecords: result.records.invalid,
    newRecords: mode === 'merge' ? validRecords.length - duplicateIds : validRecords.length,
    duplicateIds,
    profileCount: validProfiles.length,
    invalidProfiles: result.profiles.invalid,
    newProfiles: mode === 'merge' ? validProfiles.length - duplicateProfileIds : validProfiles.length,
    skippedProfiles: mode === 'merge' ? duplicateProfileIds : 0
  };
}

export function applyImport(backup, current, mode) {
  const result = validateBackup(backup);
  if (mode === 'replace') {
    return {
      settings: result.settings.settings,
      records: sortRecordsDesc(result.records.valid).slice(0, MAX_RECORDS),
      profiles: result.profiles.valid
    };
  }
  const seenRecordIds = new Set();
  const mergedRecords = [];
  for (const record of [...(current.records || []), ...result.records.valid]) {
    if (seenRecordIds.has(record.id)) continue;
    seenRecordIds.add(record.id);
    mergedRecords.push(record);
  }
  const seenProfileIds = new Set();
  const mergedProfiles = [];
  for (const profile of [...(current.profiles || []), ...result.profiles.valid]) {
    if (seenProfileIds.has(profile.id)) continue;
    seenProfileIds.add(profile.id);
    mergedProfiles.push(profile);
  }
  return {
    settings: current.settings,
    records: sortRecordsDesc(mergedRecords).slice(0, MAX_RECORDS),
    profiles: mergedProfiles
  };
}
