import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  createBackup,
  parseBackup,
  validateSettings,
  validateRecords,
  validateProfiles,
  validateBackup,
  computePreview,
  applyImport
} from '../src/engine/backup.js';
import { makeStorage } from '../src/engine/storage.js';
import { makeStore } from '../src/state.js';
import { settingsPage } from '../src/pages/settings.js';
import { DEFAULT_SETTINGS } from '../src/engine/settings.js';

const rec = (id, createdAt, extra = {}) => ({
  id,
  type: 'click',
  createdAt,
  stats: { hits: 8, attempts: 10 },
  settings: { dpi: 800, sensitivity: 1, fov: 90 },
  summary: { score: 80 },
  ...extra
});

describe('导出结构', () => {
  it('生成完整的版本化备份结构', () => {
    const backup = createBackup({
      settings: { ...DEFAULT_SETTINGS, dpi: 1600 },
      records: [rec('r1', '2026-09-01T00:00:00.000Z')],
      profiles: [{ id: 'p1', name: 'A', createdAt: '2026-09-01T00:00:00.000Z', settings: DEFAULT_SETTINGS }]
    }, () => new Date('2026-09-24T08:00:00.000Z'));
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.exportedAt).toBe('2026-09-24T08:00:00.000Z');
    expect(backup.settings.dpi).toBe(1600);
    expect(backup.records).toHaveLength(1);
    expect(backup.profiles).toHaveLength(1);
  });

  it('没有记录时也能导出设置和方案', () => {
    const backup = createBackup({ settings: DEFAULT_SETTINGS, records: [], profiles: [{ id: 'p1' }] });
    expect(backup.records).toEqual([]);
    expect(backup.profiles).toHaveLength(1);
    expect(() => JSON.stringify(backup)).not.toThrow();
  });

  it('导出是深拷贝快照，不携带函数 / DOM 节点 / 运行时引用', () => {
    const settings = { ...DEFAULT_SETTINGS, fn: () => 1, node: document.createElement('div') };
    const records = [rec('r1', '2026-09-01T00:00:00.000Z')];
    const backup = createBackup({ settings, records, profiles: [] });
    settings.dpi = 1;
    records[0].stats.hits = 0;
    expect(backup.settings.dpi).toBe(DEFAULT_SETTINGS.dpi);
    expect(backup.records[0].stats.hits).toBe(8);
    expect(backup.settings.fn).toBeUndefined();
    expect(backup.settings.node).toBeUndefined();
    expect(JSON.parse(JSON.stringify(backup))).toEqual(backup);
  });
});

describe('解析与版本', () => {
  it('接受当前版本备份', () => {
    const backup = createBackup({ settings: DEFAULT_SETTINGS, records: [], profiles: [] });
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    expect(parsed.migrated).toBe(false);
  });

  it('通过适配入口迁移可识别的旧版本', () => {
    const legacy = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 0,
      settings: { dpi: 400 },
      records: [rec('old1', '2026-01-01T00:00:00.000Z')]
    });
    const parsed = parseBackup(legacy);
    expect(parsed.ok).toBe(true);
    expect(parsed.migrated).toBe(true);
    expect(parsed.backup.version).toBe(BACKUP_VERSION);
    expect(parsed.backup.profiles).toEqual([]);
    expect(parsed.backup.records).toHaveLength(1);
  });

  it('拒绝未来版本，不静默丢字段', () => {
    const future = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1, settings: {}, records: [], profiles: [] });
    const parsed = parseBackup(future);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('版本');
  });

  it('拒绝非法 JSON 和格式不匹配的文件', () => {
    expect(parseBackup('{oops').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ format: 'other', version: 1 })).ok).toBe(false);
    expect(parseBackup(JSON.stringify([1, 2, 3])).ok).toBe(false);
  });
});

describe('校验与归一化', () => {
  it('settings 经过 clampSettings 归一化', () => {
    const result = validateSettings({ dpi: 999999, sensitivity: -5, aspect: '32:9', difficulty: 'impossible' });
    expect(result.ok).toBe(true);
    expect(result.settings.dpi).toBe(64000);
    expect(result.settings.sensitivity).toBe(0.01);
    expect(result.settings.aspect).toBe('16:9');
    expect(result.settings.difficulty).toBe('normal');
  });

  it('记录缺少 ID 时计入无效项并给出原因', () => {
    const result = validateRecords([rec('ok', '2026-09-01T00:00:00.000Z'), { type: 'click', stats: {}, settings: {}, createdAt: '2026-09-01T00:00:00.000Z' }]);
    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].reason).toContain('ID');
  });

  it('方案缺少 ID 时计入无效项', () => {
    const result = validateProfiles([{ name: '无 ID' }, { id: 'p1', name: '有 ID', settings: {} }]);
    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toHaveLength(1);
  });

  it('createdAt 无效的记录被拒绝', () => {
    const result = validateRecords([rec('bad', 'not-a-date'), rec('bad2', 123)]);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(2);
  });

  it('summary 为任意字符串时记录被拒绝，缺失时允许', () => {
    const withStringSummary = validateRecords([rec('s1', '2026-09-01T00:00:00.000Z', { summary: '优秀' })]);
    expect(withStringSummary.invalid).toHaveLength(1);
    const noSummary = validateRecords([rec('s2', '2026-09-01T00:00:00.000Z', { summary: undefined })]);
    expect(noSummary.valid).toHaveLength(1);
    expect(noSummary.valid[0].summary).toBeUndefined();
  });

  it('未知 type 保留但明确标记，不伪造成有效分数', () => {
    const result = validateRecords([rec('u1', '2026-09-01T00:00:00.000Z', { type: 'future-mode' })]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].unknownType).toBe(true);
    expect(result.valid[0].summary).toBeUndefined();
  });

  it('records / profiles 不是数组时分别返回错误', () => {
    const validation = validateBackup({ settings: {}, records: 'x', profiles: null });
    expect(validation.ok).toBe(false);
    expect(validation.records.error).toBeTruthy();
    expect(validation.profiles.error).toBeTruthy();
    expect(validation.settings.ok).toBe(true);
  });
});

describe('合并与替换', () => {
  const current = {
    settings: { ...DEFAULT_SETTINGS, dpi: 1600 },
    records: [rec('cur1', '2026-09-10T00:00:00.000Z')],
    profiles: [{ id: 'pc', name: '当前方案', settings: DEFAULT_SETTINGS }]
  };
  const makeValidation = (records, profiles = []) => ({
    ok: true,
    settings: validateSettings({ dpi: 400 }),
    records: validateRecords(records),
    profiles: validateProfiles(profiles)
  });

  it('替换模式用归一化数据覆盖当前状态，并按时间倒序', () => {
    const validation = makeValidation([
      rec('a', '2026-09-01T00:00:00.000Z'),
      rec('b', '2026-09-05T00:00:00.000Z')
    ], [{ id: 'p1', settings: {} }]);
    const next = applyImport(validation, current, 'replace');
    expect(next.settings.dpi).toBe(400);
    expect(next.records.map((r) => r.id)).toEqual(['b', 'a']);
    expect(next.profiles.map((p) => p.id)).toEqual(['p1']);
  });

  it('合并模式保留当前设置，只追加新 ID 的记录和方案', () => {
    const validation = makeValidation(
      [rec('cur1', '2026-09-10T00:00:00.000Z'), rec('new1', '2026-09-20T00:00:00.000Z')],
      [{ id: 'pc', settings: {} }, { id: 'p2', settings: {} }]
    );
    const next = applyImport(validation, current, 'merge');
    expect(next.settings.dpi).toBe(1600);
    expect(next.records.map((r) => r.id)).toEqual(['new1', 'cur1']);
    expect(next.profiles.map((p) => p.id)).toEqual(['pc', 'p2']);
  });

  it('重复导入同一文件幂等，不产生重复行', () => {
    const validation = makeValidation([rec('new1', '2026-09-20T00:00:00.000Z')], [{ id: 'p2', settings: {} }]);
    const once = applyImport(validation, current, 'merge');
    const twice = applyImport(validation, once, 'merge');
    expect(twice.records).toEqual(once.records);
    expect(twice.profiles).toEqual(once.profiles);
  });

  it('预览统计重复 ID 与新增数量', () => {
    const backup = { version: 1, exportedAt: '2026-09-24T00:00:00.000Z' };
    const validation = makeValidation(
      [rec('cur1', '2026-09-10T00:00:00.000Z'), rec('new1', '2026-09-20T00:00:00.000Z'), { type: 'click', stats: {}, settings: {}, createdAt: 'bad' }],
      [{ id: 'pc', settings: {} }, { id: 'p2', settings: {} }]
    );
    const preview = computePreview(backup, validation, current, 'merge');
    expect(preview.totalRecords).toBe(3);
    expect(preview.validRecords).toBe(2);
    expect(preview.invalidRecords).toBe(1);
    expect(preview.newRecords).toBe(1);
    expect(preview.duplicateRecordIds).toBe(1);
    expect(preview.newProfiles).toBe(1);
    expect(preview.duplicateProfileIds).toBe(1);
    expect(preview.settingsChanged).toBe(false);
  });

  it('替换模式预览标记设置变化', () => {
    const backup = { version: 1, exportedAt: null };
    const preview = computePreview(backup, makeValidation([]), current, 'replace');
    expect(preview.settingsChanged).toBe(true);
  });

  it('导入记录截断到最近 100 条', () => {
    const many = Array.from({ length: 150 }, (_, i) =>
      rec(`r${i}`, new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString()));
    const next = applyImport(makeValidation(many), current, 'replace');
    expect(next.records).toHaveLength(100);
    expect(next.records[0].id).toBe('r149');
  });

  it('合并后按时间倒序，时间相同的有效记录保持输入相对顺序', () => {
    const validation = makeValidation([
      rec('x1', '2026-09-01T00:00:00.000Z'),
      rec('x2', '2026-09-01T00:00:00.000Z'),
      rec('x3', '2026-09-03T00:00:00.000Z')
    ]);
    const next = applyImport(validation, { settings: {}, records: [], profiles: [] }, 'replace');
    expect(next.records.map((r) => r.id)).toEqual(['x3', 'x1', 'x2']);
  });
});

describe('原子提交与回滚', () => {
  function makeBackend(failOnKey) {
    const map = new Map();
    const backend = {
      armed: false,
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => {
        if (backend.armed && k === failOnKey) throw new Error('quota exceeded');
        map.set(k, v);
      },
      removeItem: (k) => map.delete(k),
      _map: map
    };
    return backend;
  }

  it('任意一次 setItem 失败时回滚到导入前快照', () => {
    const backend = makeBackend('fps_tester_records_v1');
    const storage = makeStorage(backend);
    storage.saveSettings({ dpi: 800 });
    storage.saveRecords([{ id: 'old' }]);
    storage.saveProfiles([]);
    backend.armed = true;
    expect(() => storage.saveSnapshot({ settings: { dpi: 1 }, records: [{ id: 'new' }], profiles: [{ id: 'p' }] }))
      .toThrow('回滚');
    expect(storage.loadSettings()).toEqual({ dpi: 800 });
    expect(storage.loadRecords()).toEqual([{ id: 'old' }]);
    expect(storage.loadProfiles()).toEqual([]);
  });

  it('校验失败时不触碰存储（零副作用）', () => {
    const backend = makeBackend(null);
    const storage = makeStorage(backend);
    storage.saveRecords([{ id: 'old' }]);
    const parsed = parseBackup('{broken');
    expect(parsed.ok).toBe(false);
    expect(storage.loadRecords()).toEqual([{ id: 'old' }]);
    expect(backend._map.size).toBe(1);
  });

  it('导入成功后重新 init 能读到恢复的数据', async () => {
    localStorage.clear();
    const store = makeStore();
    await store.init();
    store.importSnapshot({
      settings: { ...DEFAULT_SETTINGS, dpi: 3200 },
      records: [rec('imp1', '2026-09-20T00:00:00.000Z')],
      profiles: [{ id: 'p9', name: '导入方案', settings: DEFAULT_SETTINGS }]
    });
    const restored = makeStore();
    await restored.init();
    expect(restored.state.settings.dpi).toBe(3200);
    expect(restored.state.records.map((r) => r.id)).toEqual(['imp1']);
    expect(restored.state.profiles.map((p) => p.id)).toEqual(['p9']);
  });
});

describe('设置页备份区 DOM 流程', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('选择文件后展示差异预览，重复确认只提交一次', async () => {
    vi.useFakeTimers();
    try {
      const store = makeStore();
      await store.init();
      store.updateSettings({ dpi: 1600 });
      let commits = 0;
      const original = store.importSnapshot;
      store.importSnapshot = (snapshot) => { commits += 1; return original(snapshot); };

      const page = settingsPage({ store });
      document.body.appendChild(page);
      expect(page.querySelector('#backup-export')).toBeTruthy();
      expect(page.querySelector('#backup-mode')).toBeTruthy();

      const backup = createBackup({
        settings: { ...DEFAULT_SETTINGS, dpi: 400 },
        records: [rec('imp1', '2026-09-20T00:00:00.000Z')],
        profiles: [{ id: 'p1', name: '方案', settings: DEFAULT_SETTINGS }]
      });
      const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
      const input = page.querySelector('#backup-file');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
      await vi.advanceTimersByTimeAsync(10);

      const preview = page.querySelector('#backup-preview');
      expect(preview.textContent).toContain('导入预览');
      expect(preview.textContent).toContain('替换全部');

      const confirmBtn = page.querySelector('#backup-confirm');
      confirmBtn.click();
      confirmBtn.click();
      expect(commits).toBe(1);
      expect(store.state.settings.dpi).toBe(400);
      expect(store.state.records.map((r) => r.id)).toEqual(['imp1']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('非法文件只提示错误，不改变当前数据', async () => {
    const store = makeStore();
    await store.init();
    store.updateSettings({ dpi: 1600 });
    const page = settingsPage({ store });
    document.body.appendChild(page);

    const input = page.querySelector('#backup-file');
    Object.defineProperty(input, 'files', { value: [new File(['{bad'], 'bad.json')], configurable: true });
    input.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 20));

    expect(page.querySelector('#backup-error').textContent).toContain('JSON');
    expect(store.state.settings.dpi).toBe(1600);
    expect(store.state.records).toEqual([]);
  });
});
