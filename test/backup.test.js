import { describe, it, expect, vi } from 'vitest';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  buildBackup,
  parseBackup,
  migrateLegacy,
  validateSettings,
  validateRecords,
  validateProfiles,
  computePreview,
  applyImport
} from '../src/engine/backup.js';
import { DEFAULT_SETTINGS } from '../src/engine/settings.js';
import { makeStore } from '../src/state.js';
import { backupSection, settingsPage } from '../src/pages/settings.js';
import { recordsPage } from '../src/pages/records.js';

const ISO = '2026-09-20T08:00:00.000Z';

function rec(id, createdAt = ISO, extra = {}) {
  return { id, createdAt, type: 'click', stats: { hits: 3, attempts: 5 }, settings: { dpi: 800 }, ...extra };
}

function profile(id, extra = {}) {
  return { id, name: `方案${id}`, createdAt: ISO, settings: { ...DEFAULT_SETTINGS }, ...extra };
}

function makeBackend() {
  const map = new Map();
  const backend = {
    throwOnCall: -1,
    calls: 0,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      backend.calls += 1;
      if (backend.calls === backend.throwOnCall) throw new Error('QuotaExceeded');
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
    snapshot: () => new Map(map)
  };
  return backend;
}

describe('备份导出结构', () => {
  it('生成完整顶层结构且为深拷贝快照', () => {
    const state = { settings: { ...DEFAULT_SETTINGS }, records: [rec('r1')], profiles: [profile('p1')] };
    const backup = buildBackup(state, new Date(ISO));
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.exportedAt).toBe(ISO);
    expect(Array.isArray(backup.records)).toBe(true);
    expect(Array.isArray(backup.profiles)).toBe(true);
    state.records[0].stats.hits = 999;
    state.settings.dpi = 1;
    expect(backup.records[0].stats.hits).toBe(3);
    expect(backup.settings.dpi).toBe(DEFAULT_SETTINGS.dpi);
  });

  it('没有记录时也能导出设置和方案', () => {
    const backup = buildBackup({ settings: { ...DEFAULT_SETTINGS }, records: [], profiles: [profile('p1')] });
    expect(backup.records).toEqual([]);
    expect(backup.profiles).toHaveLength(1);
    expect(backup.settings.dpi).toBe(DEFAULT_SETTINGS.dpi);
  });
});

describe('备份解析与版本', () => {
  it('接受当前版本备份', () => {
    const text = JSON.stringify(buildBackup({ settings: {}, records: [], profiles: [] }));
    const result = parseBackup(text);
    expect(result.ok).toBe(true);
    expect(result.backup.version).toBe(1);
    expect(result.migrated).toBe(false);
  });

  it('旧版本 v0 经迁移入口适配', () => {
    const legacy = { format: BACKUP_FORMAT, version: 0, settings: { dpi: 400 }, records: [rec('r1')] };
    const result = parseBackup(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe(0);
    expect(result.backup.version).toBe(1);
    expect(result.backup.profiles).toEqual([]);
    expect(migrateLegacy(legacy).records).toHaveLength(1);
  });

  it('拒绝未知的未来版本', () => {
    const future = { format: BACKUP_FORMAT, version: 99, settings: {}, records: [], profiles: [] };
    const result = parseBackup(JSON.stringify(future));
    expect(result.ok).toBe(false);
    expect(result.future).toBe(true);
    expect(result.error).toContain('99');
  });

  it('拒绝非法 JSON 与错误格式', () => {
    expect(parseBackup('not json {{').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ format: 'other', version: 1 })).ok).toBe(false);
    expect(parseBackup(JSON.stringify([1, 2, 3])).ok).toBe(false);
  });
});

describe('数据校验与归一化', () => {
  it('settings 经过 clampSettings 归一化', () => {
    const result = validateSettings({ dpi: 999999, sensitivity: '2.5', aspect: 'weird', fov: 10 });
    expect(result.ok).toBe(true);
    expect(result.settings.dpi).toBe(64000);
    expect(result.settings.sensitivity).toBe(2.5);
    expect(result.settings.aspect).toBe('16:9');
    expect(result.settings.fov).toBe(40);
  });

  it('记录与方案缺少 ID 时分别计入无效', () => {
    const records = validateRecords([rec('r1'), { type: 'click', stats: {}, settings: {}, createdAt: ISO }]);
    expect(records.valid).toHaveLength(1);
    expect(records.invalid).toBe(1);
    const profiles = validateProfiles([profile('p1'), { name: '无ID', settings: {} }]);
    expect(profiles.valid).toHaveLength(1);
    expect(profiles.invalid).toBe(1);
  });

  it('createdAt 无效的记录被拒绝', () => {
    const result = validateRecords([rec('r1', 'not-a-date'), rec('r2')]);
    expect(result.valid.map((r) => r.id)).toEqual(['r2']);
    expect(result.invalid).toBe(1);
  });

  it('summary 必须是对象，任意字符串被拒绝；缺少 summary 允许', () => {
    const withString = validateRecords([rec('r1', ISO, { summary: '高分' })]);
    expect(withString.invalid).toBe(1);
    const without = validateRecords([rec('r1')]);
    expect(without.valid).toHaveLength(1);
    expect(without.valid[0].summary).toBeUndefined();
  });

  it('未知 type 保留但明确标记且不参与评分统计', () => {
    const result = validateRecords([rec('r1', ISO, { type: 'mystery', summary: { score: 95 } })]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].unknownType).toBe(true);
    expect(result.valid[0].summary).toBeUndefined();
  });

  it('records / profiles 非数组时分别报错', () => {
    expect(validateRecords('oops').ok).toBe(false);
    expect(validateProfiles(42).ok).toBe(false);
  });
});

describe('差异预览', () => {
  const current = {
    settings: { ...DEFAULT_SETTINGS },
    records: [rec('a'), rec('b')],
    profiles: [profile('p1')]
  };

  it('合并模式统计新增与重复 ID', () => {
    const backup = buildBackup({
      settings: { ...DEFAULT_SETTINGS, dpi: 1600 },
      records: [rec('a'), rec('c'), { bad: true }],
      profiles: [profile('p1'), profile('p2')]
    });
    const preview = computePreview(backup, current, 'merge');
    expect(preview.ok).toBe(true);
    expect(preview.version).toBe(1);
    expect(preview.exportedAt).toBeTruthy();
    expect(preview.settingsChanged).toBe(true);
    expect(preview.totalRecords).toBe(3);
    expect(preview.validRecords).toBe(2);
    expect(preview.invalidRecords).toBe(1);
    expect(preview.newRecords).toBe(1);
    expect(preview.duplicateIds).toBe(1);
    expect(preview.profileCount).toBe(2);
    expect(preview.newProfiles).toBe(1);
    expect(preview.mode).toBe('merge');
  });

  it('替换模式全部计入新增且设置无变化时可识别', () => {
    const backup = buildBackup({ settings: { ...DEFAULT_SETTINGS }, records: [rec('a')], profiles: [] });
    const preview = computePreview(backup, current, 'replace');
    expect(preview.newRecords).toBe(1);
    expect(preview.settingsChanged).toBe(false);
  });
});

describe('合并与替换规则', () => {
  it('替换模式用备份覆盖并截断到最近 100 条', () => {
    const many = Array.from({ length: 105 }, (_, i) =>
      rec(`r${i}`, new Date(Date.parse(ISO) + i * 1000).toISOString()));
    const backup = buildBackup({ settings: { ...DEFAULT_SETTINGS, dpi: 1600 }, records: many, profiles: [profile('p1')] });
    const next = applyImport(backup, { settings: { ...DEFAULT_SETTINGS }, records: [rec('old')], profiles: [] }, 'replace');
    expect(next.settings.dpi).toBe(1600);
    expect(next.records).toHaveLength(100);
    expect(next.records[0].id).toBe('r104');
    expect(next.records.some((r) => r.id === 'old')).toBe(false);
    expect(next.profiles).toHaveLength(1);
  });

  it('合并模式保留当前设置，仅补充新 ID 并按时间倒序截断', () => {
    const current = {
      settings: { ...DEFAULT_SETTINGS, dpi: 400 },
      records: [rec('a', '2026-09-01T00:00:00.000Z')],
      profiles: [profile('p1')]
    };
    const backup = buildBackup({
      settings: { ...DEFAULT_SETTINGS, dpi: 3200 },
      records: [rec('a', '2026-09-01T00:00:00.000Z'), rec('b', '2026-09-10T00:00:00.000Z')],
      profiles: [profile('p1'), profile('p2')]
    });
    const next = applyImport(backup, current, 'merge');
    expect(next.settings.dpi).toBe(400);
    expect(next.records.map((r) => r.id)).toEqual(['b', 'a']);
    expect(next.profiles.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('重复导入同一文件幂等', () => {
    const current = { settings: { ...DEFAULT_SETTINGS }, records: [rec('a')], profiles: [] };
    const backup = buildBackup({ settings: {}, records: [rec('a'), rec('b')], profiles: [profile('p1')] });
    const once = applyImport(backup, current, 'merge');
    const twice = applyImport(backup, { ...current, records: once.records, profiles: once.profiles }, 'merge');
    expect(twice.records.map((r) => r.id)).toEqual(once.records.map((r) => r.id));
    expect(twice.profiles).toHaveLength(1);
    expect(new Set(twice.records.map((r) => r.id)).size).toBe(twice.records.length);
  });

  it('合并后截断到 100 条', () => {
    const current = {
      settings: { ...DEFAULT_SETTINGS },
      records: Array.from({ length: 60 }, (_, i) => rec(`c${i}`, new Date(Date.parse(ISO) - i * 1000).toISOString())),
      profiles: []
    };
    const imported = Array.from({ length: 60 }, (_, i) => rec(`n${i}`, new Date(Date.parse(ISO) + i * 1000).toISOString()));
    const backup = buildBackup({ settings: {}, records: imported, profiles: [] });
    const next = applyImport(backup, current, 'merge');
    expect(next.records).toHaveLength(100);
    expect(next.records[0].id).toBe('n59');
  });
});

describe('原子提交与回滚', () => {
  it('任意一个 setItem 失败时全部回滚且状态不变', async () => {
    const backend = makeBackend();
    const store = makeStore(backend);
    await store.init();
    store.updateSettings({ dpi: 1600 });
    store.addRecord(rec('old'));
    const before = backend.snapshot();
    const beforeRecords = store.state.records.slice();

    backend.throwOnCall = backend.calls + 2;
    expect(() => store.importSnapshot({
      settings: { ...DEFAULT_SETTINGS, dpi: 3200 },
      records: [rec('new')],
      profiles: [profile('p1')]
    })).toThrow('写入本地存储失败');

    expect(backend.snapshot()).toEqual(before);
    expect(store.state.records).toEqual(beforeRecords);
    expect(store.state.settings.dpi).toBe(1600);
    expect(store.state.profiles).toEqual([]);
  });

  it('成功提交后新实例读取到恢复后的数据', async () => {
    const backend = makeBackend();
    const store = makeStore(backend);
    await store.init();
    store.importSnapshot({
      settings: { ...DEFAULT_SETTINGS, dpi: 1200 },
      records: [rec('r1'), rec('r2', '2026-09-21T00:00:00.000Z')],
      profiles: [profile('p1')]
    });
    const restored = makeStore(backend);
    await restored.init();
    expect(restored.state.settings.dpi).toBe(1200);
    expect(restored.state.records.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(restored.state.profiles.map((p) => p.id)).toEqual(['p1']);
    const page = recordsPage({ store: restored, router: { go() {} } });
    expect(page.textContent).toContain('测试记录（2');
  });
});

describe('设置页备份区 DOM 流程', () => {
  function setup() {
    const store = {
      state: { settings: { ...DEFAULT_SETTINGS }, records: [rec('a')], profiles: [], dataError: null },
      exportBackup: vi.fn(() => buildBackup({ settings: store.state.settings, records: store.state.records, profiles: [] })),
      importSnapshot: vi.fn()
    };
    const reload = vi.fn();
    const el = backupSection({ store, reload });
    document.body.append(el);
    return { store, reload, el };
  }

  function selectFile(el, content) {
    const input = el.querySelector('#backup-file');
    const file = new File([content], 'backup.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  }

  async function waitFor(el, predicate) {
    for (let i = 0; i < 100; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (predicate()) return;
    }
    throw new Error('等待预览渲染超时');
  }

  it('选择文件后显示差异预览，确认后只提交一次', async () => {
    const { store, el } = setup();
    const backup = buildBackup({ settings: { ...DEFAULT_SETTINGS }, records: [rec('a'), rec('b')], profiles: [profile('p1')] });
    selectFile(el, JSON.stringify(backup));
    await waitFor(el, () => el.querySelector('#backup-confirm'));
    const preview = el.querySelector('#backup-preview');
    expect(preview.textContent).toContain('导入预览');
    expect(preview.textContent).toContain('合并新增');
    expect(preview.textContent).toContain('重复 ID 数');
    const confirmBtn = el.querySelector('#backup-confirm');
    confirmBtn.click();
    confirmBtn.click();
    expect(store.importSnapshot).toHaveBeenCalledTimes(1);
    const snapshot = store.importSnapshot.mock.calls[0][0];
    expect(snapshot.records.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(snapshot.profiles).toHaveLength(1);
    el.remove();
  });

  it('非法文件只提示错误，不产生任何写入', async () => {
    const { store, el } = setup();
    selectFile(el, 'not json');
    await waitFor(el, () => el.querySelector('#backup-error').textContent.length > 0);
    expect(el.querySelector('#backup-error').textContent).toContain('JSON');
    expect(el.querySelector('#backup-confirm')).toBeNull();
    expect(store.importSnapshot).not.toHaveBeenCalled();
    el.remove();
  });

  it('取消预览不改变当前数据', async () => {
    const { store, el } = setup();
    selectFile(el, JSON.stringify(buildBackup({ settings: {}, records: [rec('x')], profiles: [] })));
    await waitFor(el, () => el.querySelector('#backup-cancel'));
    el.querySelector('#backup-cancel').click();
    expect(el.querySelector('#backup-preview').textContent).toBe('');
    expect(store.importSnapshot).not.toHaveBeenCalled();
    el.remove();
  });

  it('设置页包含备份区', () => {
    const store = {
      state: { settings: { ...DEFAULT_SETTINGS }, records: [], profiles: [], dataError: null },
      exportBackup: vi.fn(),
      importSnapshot: vi.fn(),
      updateSettings: vi.fn(),
      resetSettings: vi.fn(),
      clearAllData: vi.fn()
    };
    const page = settingsPage({ store });
    expect(page.querySelector('#backup-section')).toBeTruthy();
    expect(page.querySelector('#backup-export').textContent).toContain('导出完整备份');
  });
});
