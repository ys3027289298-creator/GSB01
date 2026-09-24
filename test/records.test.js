import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseRecordsQuery,
  recordsQueryString,
  filterRecords,
  sortRecords,
  summarizeRecords,
  listProfiles,
  DEFAULT_FILTERS
} from '../src/engine/recordAnalysis.js';
import { recordsPage, recordsToCsv } from '../src/pages/records.js';

const NOW = Date.parse('2026-09-24T12:00:00.000Z');
const daysAgo = (n) => new Date(NOW - n * 24 * 3600 * 1000).toISOString();

let seq = 0;
function rec(over = {}) {
  seq += 1;
  return {
    id: `r${seq}`,
    createdAt: daysAgo(1),
    type: 'click',
    profileName: '方案A',
    settings: { dpi: 800, sensitivity: 1, fov: 90 },
    stats: { accuracy: 0.8, avgReactionMs: 300, misses: 2, hits: 8, attempts: 10, mouseDistancePx: 500 },
    summary: { score: 80 },
    ...over
  };
}

describe('记录筛选', () => {
  it('按五种类型分别筛选', () => {
    const records = [
      rec({ type: 'click' }), rec({ type: 'turn' }), rec({ type: 'tracking' }),
      rec({ type: 'recoil' }), rec({ type: 'calibration', summary: null }), rec({ type: 'click' })
    ];
    for (const type of ['click', 'turn', 'tracking', 'recoil', 'calibration']) {
      const out = filterRecords(records, { ...DEFAULT_FILTERS, type }, NOW);
      expect(out.every((r) => r.type === type)).toBe(true);
      expect(out.length).toBe(type === 'click' ? 2 : 1);
    }
    expect(filterRecords(records, DEFAULT_FILTERS, NOW)).toHaveLength(6);
  });

  it('方案与时间范围取交集，缺失字段归入默认/被安全排除', () => {
    const records = [
      rec({ profileName: '方案A', createdAt: daysAgo(3) }),
      rec({ profileName: '方案A', createdAt: daysAgo(20) }),
      rec({ profileName: '方案B', createdAt: daysAgo(3) }),
      rec({ profileName: undefined, createdAt: daysAgo(3) }),
      rec({ profileName: '方案A', createdAt: undefined })
    ];
    const both = filterRecords(records, { ...DEFAULT_FILTERS, profile: '方案A', range: '7d' }, NOW);
    expect(both.map((r) => r.id)).toEqual([records[0].id]);
    const def = filterRecords(records, { ...DEFAULT_FILTERS, profile: '默认' }, NOW);
    expect(def.map((r) => r.id)).toEqual([records[3].id]);
    const month = filterRecords(records, { ...DEFAULT_FILTERS, profile: '方案A', range: '30d' }, NOW);
    expect(month).toHaveLength(2);
  });

  it('不修改原始记录数组', () => {
    const records = [rec({ createdAt: daysAgo(2) }), rec({ createdAt: daysAgo(1) })];
    const before = [...records];
    sortRecords(filterRecords(records, DEFAULT_FILTERS, NOW), 'oldest');
    expect(records).toEqual(before);
  });
});

describe('记录排序', () => {
  const scored = (id, score, createdAt) => rec({ id, summary: score === null ? null : { score }, createdAt });

  it('四种排序方式均正确', () => {
    const records = [
      scored('a', 70, daysAgo(1)),
      scored('b', 90, daysAgo(3)),
      scored('c', 50, daysAgo(2))
    ];
    expect(sortRecords(records, 'newest').map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(sortRecords(records, 'oldest').map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(sortRecords(records, 'scoreDesc').map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(sortRecords(records, 'scoreAsc').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('同分排序稳定，无评分记录排在最后', () => {
    const records = [
      scored('a', 80, daysAgo(1)),
      scored('b', null, daysAgo(2)),
      scored('c', 80, daysAgo(3)),
      scored('d', 90, daysAgo(4))
    ];
    expect(sortRecords(records, 'scoreDesc').map((r) => r.id)).toEqual(['d', 'a', 'c', 'b']);
    expect(sortRecords(records, 'scoreAsc').map((r) => r.id)).toEqual(['a', 'c', 'd', 'b']);
    expect(sortRecords(records, 'scoreDesc').map((r) => r.id))
      .toEqual(sortRecords(records, 'scoreDesc').map((r) => r.id));
  });
});

describe('分析聚合', () => {
  it('校准记录无 summary 不计入平均分，score 为 0 计入', () => {
    const records = [
      rec({ type: 'calibration', summary: null }),
      rec({ summary: { score: 0 } }),
      rec({ summary: { score: 90 } })
    ];
    const s = summarizeRecords(records);
    expect(s.total).toBe(3);
    expect(s.scoredCount).toBe(2);
    expect(s.avgScore).toBe(45);
    expect(s.maxScore).toBe(90);
    expect(s.distribution.calibration).toBe(1);
  });

  it('空数组与未知类型安全聚合', () => {
    const empty = summarizeRecords([]);
    expect(empty.total).toBe(0);
    expect(empty.avgScore).toBeNull();
    expect(empty.maxScore).toBeNull();
    const weird = summarizeRecords([rec({ type: 'mystery', summary: null }), rec({ summary: { score: NaN } })]);
    expect(weird.scoredCount).toBe(0);
    expect(weird.avgScore).toBeNull();
    expect(weird.distribution.other).toBe(1);
  });

  it('listProfiles 去重并把缺失 profileName 归为默认', () => {
    const records = [rec({ profileName: '方案A' }), rec({ profileName: '方案A' }), rec({ profileName: '' })];
    expect(listProfiles(records)).toEqual(['方案A', '默认']);
  });
});

describe('查询参数', () => {
  it('非法参数回退到安全默认值', () => {
    const records = [rec({ profileName: '方案A' })];
    const f = parseRecordsQuery({ type: 'hack', range: '365d', sort: 'random', profile: '不存在' }, records);
    expect(f).toEqual(DEFAULT_FILTERS);
    expect(parseRecordsQuery({ type: 'turn', range: '7d', sort: 'scoreAsc', profile: '方案A' }, records))
      .toEqual({ type: 'turn', range: '7d', sort: 'scoreAsc', profile: '方案A' });
    expect(parseRecordsQuery(undefined)).toEqual(DEFAULT_FILTERS);
  });

  it('筛选状态可编码为查询字符串并解析还原', () => {
    const records = [rec({ profileName: '方案B' })];
    const filters = { type: 'recoil', profile: '方案B', range: '30d', sort: 'scoreDesc' };
    const params = Object.fromEntries(new URLSearchParams(recordsQueryString(filters)));
    expect(parseRecordsQuery(params, records)).toEqual(filters);
  });
});

describe('导出', () => {
  it('当前筛选导出的内容与顺序和筛选结果一致', () => {
    const records = [
      rec({ id: 'x1', type: 'click', summary: { score: 60 }, createdAt: daysAgo(1) }),
      rec({ id: 'x2', type: 'turn', summary: { score: 95 }, createdAt: daysAgo(2) }),
      rec({ id: 'x3', type: 'click', summary: { score: 88 }, createdAt: daysAgo(3) })
    ];
    const filtered = sortRecords(filterRecords(records, { ...DEFAULT_FILTERS, type: 'click' }, NOW), 'scoreDesc');
    expect(filtered.map((r) => r.id)).toEqual(['x3', 'x1']);
    const csv = recordsToCsv(filtered);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('x3');
    expect(lines[2]).toContain('x1');
    expect(JSON.parse(JSON.stringify(filtered)).map((r) => r.id)).toEqual(['x3', 'x1']);
  });

  it('全部导出仍包含所有记录（回归）', () => {
    const records = [rec({ id: 'a1' }), rec({ id: 'a2', type: 'recoil', stats: { stable: true, avgOffsetPx: 3, maxOffsetPx: 9 } })];
    const csv = recordsToCsv(records);
    expect(csv.split('\n')).toHaveLength(3);
    expect(csv).toContain('a1');
    expect(csv).toContain('a2');
  });
});

describe('记录页（页面级）', () => {
  let store;
  let router;
  let emitted;

  function makeCtx(records, params = {}) {
    const qs = new URLSearchParams(params).toString();
    location.hash = `#/records${qs ? `?${qs}` : ''}`;
    store = {
      state: { records },
      deleteRecord(id) {
        store.state.records = store.state.records.filter((r) => r.id !== id);
        emitted();
      },
      clearRecords() {
        store.state.records = [];
        emitted();
      }
    };
    router = {
      get route() {
        const hash = location.hash.replace(/^#\/?/, '');
        const [path, query = ''] = hash.split('?');
        return { path: path || 'home', params: Object.fromEntries(new URLSearchParams(query)) };
      },
      go: vi.fn()
    };
    return { store, router };
  }

  function renderPage(records, params) {
    const ctx = makeCtx(records, params);
    const el = recordsPage(ctx);
    document.body.appendChild(el);
    return el;
  }

  function rowIds(el) {
    return [...el.querySelectorAll('tbody tr td:first-child')].map((td) => td.textContent);
  }

  beforeEach(() => {
    document.body.innerHTML = '<div id="toast"></div>';
    emitted = () => {};
    window.confirm = () => true;
  });

  it('带查询参数打开时按参数筛选并展示统计', () => {
    const records = [
      rec({ id: 'p1', type: 'click', summary: { score: 70 } }),
      rec({ id: 'p2', type: 'turn', summary: { score: 95 } }),
      rec({ id: 'p3', type: 'click', summary: { score: 90 } })
    ];
    const el = renderPage(records, { type: 'click', profile: 'all', range: 'all', sort: 'scoreDesc' });
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    const scores = [...el.querySelectorAll('tbody tr td:nth-child(4)')].map((td) => td.textContent);
    expect(scores).toEqual(['90', '70']);
    const statValues = [...el.querySelectorAll('.stat-value')].map((d) => d.textContent);
    expect(statValues[0]).toBe('2');
    expect(statValues[2]).toBe('80.0');
    expect(statValues[3]).toBe('90');
    expect(el.querySelector('#flt-type').value).toBe('click');
    expect(el.querySelector('#flt-sort').value).toBe('scoreDesc');
    el.remove();
  });

  it('修改筛选控件只更新视图与 URL，不改变 localStorage 或跳转', () => {
    const records = [rec({ id: 'q1', type: 'click' }), rec({ id: 'q2', type: 'recoil' })];
    const el = renderPage(records, {});
    const goCalls = router.go.mock.calls.length;
    const storageBefore = window.localStorage.length;
    const select = el.querySelector('#flt-type');
    select.value = 'recoil';
    select.dispatchEvent(new Event('change'));
    expect(location.hash).toContain('type=recoil');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(router.go.mock.calls.length).toBe(goCalls);
    expect(window.localStorage.length).toBe(storageBefore);
    el.remove();
  });

  it('删除记录后重新计算筛选结果与统计', () => {
    const records = [
      rec({ id: 'd1', type: 'click', summary: { score: 50 } }),
      rec({ id: 'd2', type: 'click', summary: { score: 100 } })
    ];
    const el = renderPage(records, { type: 'click', profile: 'all', range: 'all', sort: 'newest' });
    emitted = () => {
      const fresh = recordsPage({ store, router });
      el.replaceWith(fresh);
      elRef.el = fresh;
    };
    const elRef = { el };
    el.querySelector('tbody tr .danger').click();
    const current = elRef.el;
    expect(current.querySelectorAll('tbody tr')).toHaveLength(1);
    const statValues = [...current.querySelectorAll('.stat-value')].map((d) => d.textContent);
    expect(statValues[0]).toBe('1');
    expect(store.state.records).toHaveLength(1);
    current.remove();
  });

  it('无匹配记录时统计与导出按钮给出空状态提示', () => {
    const records = [rec({ id: 'e1', type: 'click' })];
    const el = renderPage(records, { type: 'recoil', profile: 'all', range: 'all', sort: 'newest' });
    expect(el.querySelector('tbody tr td').textContent).toContain('没有匹配');
    const statValues = [...el.querySelectorAll('.stat-value')].map((d) => d.textContent);
    expect(statValues).toEqual(['0', '0', '—', '—']);
    const buttons = [...el.querySelectorAll('button')];
    const exportFiltered = buttons.find((b) => b.textContent === '导出当前筛选 JSON');
    exportFiltered.click();
    expect(document.getElementById('toast').textContent).toContain('未导出');
    el.remove();
  });
});
