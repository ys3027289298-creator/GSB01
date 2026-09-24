const KEY_SETTINGS = 'fps_tester_settings_v1';
const KEY_RECORDS = 'fps_tester_records_v1';
const KEY_PROFILES = 'fps_tester_profiles_v1';

function safeParse(raw, label) {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    const error = new Error(`本地${label}数据已损坏，无法读取。已保留原始数据，你可以清空本地数据后重新开始。`);
    error.cause = err;
    error.raw = raw;
    throw error;
  }
}

export function makeStorage(backend = globalThis.localStorage) {
  function read(key, label) {
    try {
      return safeParse(backend.getItem(key), label);
    } finally { /* rethrows */ }
  }
  return {
    loadSettings() {
      return safeParse(backend.getItem(KEY_SETTINGS), '设置');
    },
    saveSettings(settings) {
      backend.setItem(KEY_SETTINGS, JSON.stringify(settings));
    },
    loadRecords() {
      const data = safeParse(backend.getItem(KEY_RECORDS), '测试记录');
      if (data == null) return [];
      if (!Array.isArray(data)) throw new Error('本地测试记录数据已损坏（格式不是数组），请清空本地数据后重新开始。');
      return data;
    },
    saveRecords(records) {
      backend.setItem(KEY_RECORDS, JSON.stringify(records));
    },
    loadProfiles() {
      const data = safeParse(backend.getItem(KEY_PROFILES), '灵敏度方案');
      if (data == null) return [];
      if (!Array.isArray(data)) throw new Error('本地灵敏度方案数据已损坏，请清空本地数据后重新开始。');
      return data;
    },
    saveProfiles(profiles) {
      backend.setItem(KEY_PROFILES, JSON.stringify(profiles));
    },
    saveAll(snapshot) {
      const previous = {
        [KEY_SETTINGS]: backend.getItem(KEY_SETTINGS),
        [KEY_RECORDS]: backend.getItem(KEY_RECORDS),
        [KEY_PROFILES]: backend.getItem(KEY_PROFILES)
      };
      try {
        backend.setItem(KEY_SETTINGS, JSON.stringify(snapshot.settings));
        backend.setItem(KEY_RECORDS, JSON.stringify(snapshot.records));
        backend.setItem(KEY_PROFILES, JSON.stringify(snapshot.profiles));
      } catch (err) {
        for (const key of [KEY_SETTINGS, KEY_RECORDS, KEY_PROFILES]) {
          try {
            if (previous[key] == null) backend.removeItem(key);
            else backend.setItem(key, previous[key]);
          } catch { /* 回滚尽力而为 */ }
        }
        const error = new Error('写入本地存储失败，已回滚到导入前的数据，请重试。');
        error.cause = err;
        throw error;
      }
    },
    clearAll() {
      backend.removeItem(KEY_SETTINGS);
      backend.removeItem(KEY_RECORDS);
      backend.removeItem(KEY_PROFILES);
    },
    raw: backend,
    _read: read
  };
}
