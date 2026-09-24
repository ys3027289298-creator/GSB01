import { describe, it, expect } from 'vitest';
import {
  parseRecordsQuery,
  queryToParams,
  filterRecords,
  sortRecords,
  analyzeRecords,
  listProfileNames,
  DEFAULT_QUERY
} from '../src/engine/recordsFilter.js';
import { recordsPage, recordsToCsv } from '../src/pages/records.js';

const NOW = Date.parse('2026-09-24T12:00:00.000Z');
const iso = (daysAgo) => new Date(NOW - daysAgo * 86400000).toISOString();

function rec(id, type, daysAgo, score, profileName = '方案A') {
  return {
    id,
    type,
    createdAt: iso(daysAgo),
    profileName,
    stats: {},
    settings: { dpi: 800, sensitivity: 1, fov: 90 },
    summary: score === null ? undefined : { score }
  };
}

const sample = [
  rec('c1', 'click', 1, 80),
  rec('t1', 'turn', 3, 70, '方案B'),
  rec('k1', 'tracking', 10, 60),
  rec('r1', 'recoil', 20, 90, '方案B'),
  rec('cal1', 'calibration', 2, null),
  rec('old1', 'click', 40, 50, '方案B'),
  { id: 'legacy1', type: 'click', stats: {}, settings: {} } // 缺 createdAt / profileName / summary
];

describe('记录筛选', () => {
  it('按每种类型筛选', () => {
    for (const [type, id] of [['click', 'c1'], ['turn', 't1'], ['tracking', 'k1'], ['recoil', 'r1'], ['calibration', 'cal1']]) {
      const out = filterRecords(sample, { ...DEFAULT_QUERY, type }, NOW);
      expect(out.some((r) => r.id === id)).toBe(true);
      expect(out.every((r) => r.type === type)).toBe(true);
    }
  });

  it('方案与时间范围取交集', () => {
    const out = filterRecords(sample, { ...DEFAULT_QUERY, profile: '方案B', time: '7d' }, NOW);
    expect(out.map((r) => r.id)).toEqual(['t1']);
  });

  it('缺少 createdAt / profileName 的旧记录归入默认且不崩溃', () => {
    const all = filterRecords(sample, DEFAULT_QUERY, NOW);
    expect(all.some((r) => r.id === 'legacy1')).toBe(true);
    const def = filterRecords(sample, { ...DEFAULT_QUERY, profile: '默认' }, NOW);
    expect(def.map((r) => r.id)).toEqual(['legacy1']);
    const recent = filterRecords(sample, { ...DEFAULT_QUERY, time: '7d' }, NOW);
    expect(recent.some((r) => r.id === 'legacy1')).toBe(false);
  });

  it('不修改原始数组', () => {
    const before = sample.map((r) => r.id);
    filterRecords(sample, { ...DEFAULT_QUERY, type: 'click' }, NOW);
    sortRecords(sample, 'score-asc');
    expect(sample.map((r) => r.id)).toEqual(before);
  });
});

describe('记录排序', () => {
  const sorted = (sort) => sortRecords(sample, sort).map((r) => r.id);

  it('最新优先', () => {
    expect(sorted('newest').slice(0, 3)).toEqual(['c1', 'cal1', 't1']);
  });

  it('最早优先', () => {
    expect(sorted('oldest')[0]).toBe('legacy1');
    expect(sorted('oldest')[1]).toBe('old1');
  });

  it('评分从高到低，无评分记录排最后', () => {
    const ids = sorted('score-desc');
    expect(ids[0]).toBe('r1');
    expect(ids[1]).toBe('c1');
    expect(ids[ids.length - 1]).toBe('legacy1');
    expect(ids.indexOf('cal1')).toBeGreaterThan(ids.indexOf('old1'));
  });

  it('评分从低到高', () => {
    const ids = sorted('score-asc');
    expect(ids[0]).toBe('old1');
    expect(ids[1]).toBe('k1');
  });

  it('同分排序稳定，不随机改变顺序', () => {
    const tied = [rec('a', 'click', 1, 80), rec('b', 'click', 2, 80), rec('c', 'click', 3, 80)];
    for (let i = 0; i < 5; i++) {
      expect(sortRecords(tied, 'score-desc').map((r) => r.id)).toEqual(['a', 'b', 'c']);
    }
  });
});

describe('分析聚合', () => {
  it('统计数量、平均分、最高分与类型分布', () => {
    const stats = analyzeRecords(sample);
    expect(stats.total).toBe(7);
    expect(stats.scoredCount).toBe(5);
    expect(stats.avgScore).toBeCloseTo((80 + 70 + 60 + 90 + 50) / 5);
    expect(stats.best).toMatchObject({ id: 'r1', type: 'recoil', score: 90 });
    expect(stats.typeCounts.click).toBe(3);
    expect(stats.typeCounts.calibration).toBe(1);
  });

  it('无 summary 的校准记录不计入平均分，score 为 0 计入', () => {
    const stats = analyzeRecords([
      rec('cal', 'calibration', 1, null),
      rec('z', 'click', 1, 0),
      rec('x', 'click', 1, 100)
    ]);
    expect(stats.total).toBe(3);
    expect(stats.scoredCount).toBe(2);
    expect(stats.avgScore).toBe(50);
  });

  it('空数组返回明确空状态，不出现 NaN', () => {
    const stats = analyzeRecords([]);
    expect(stats.total).toBe(0);
    expect(stats.avgScore).toBeNull();
    expect(stats.best).toBeNull();
    expect(Number.isNaN(stats.avgScore)).toBe(false);
  });

  it('删除记录后重新聚合结果正确', () => {
    const filtered = filterRecords(sample, DEFAULT_QUERY, NOW);
    const afterDelete = filtered.filter((r) => r.id !== 'r1');
    const stats = analyzeRecords(afterDelete);
    expect(stats.total).toBe(6);
    expect(stats.best.id).toBe('c1');
  });
});

describe('查询参数', () => {
  it('非法参数回退到安全默认值', () => {
    const q = parseRecordsQuery({ type: 'hack', time: '999d', sort: 'random', profile: '' });
    expect(q).toEqual(DEFAULT_QUERY);
  });

  it('合法参数被保留，默认值不写入 URL', () => {
    const q = parseRecordsQuery({ type: 'click', profile: '方案B', time: '7d', sort: 'score-desc' });
    expect(q).toEqual({ type: 'click', profile: '方案B', time: '7d', sort: 'score-desc' });
    expect(queryToParams(DEFAULT_QUERY)).toEqual({});
    expect(queryToParams(q)).toEqual({ type: 'click', profile: '方案B', time: '7d', sort: 'score-desc' });
  });
});

describe('筛选导出', () => {
  it('当前筛选 CSV 的行顺序与排序结果一致', () => {
    const filtered = sortRecords(filterRecords(sample, { ...DEFAULT_QUERY, type: 'click' }, NOW), 'score-asc');
    const lines = recordsToCsv(filtered).split('\n').slice(1);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('old1');
    expect(lines[1]).toContain('c1');
    expect(lines[2]).toContain('legacy1');
  });

  it('全部导出回归：包含全部记录与表头', () => {
    const lines = recordsToCsv(sample).split('\n');
    expect(lines).toHaveLength(sample.length + 1);
    expect(lines[0]).toContain('profileName');
  });
});

describe('记录页渲染（带查询参数）', () => {
  function renderPage(params) {
    const store = {
      state: { records: sample },
      deleteRecord() {},
      clearRecords() {}
    };
    const router = { route: { path: 'records', params }, go() {} };
    return recordsPage({ store, router });
  }

  it('按查询参数渲染筛选后的行与统计', () => {
    const el = renderPage({ type: 'click', sort: 'score-desc' });
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
    expect(el.textContent).toContain('筛选记录数');
    expect(el.textContent).toContain('平均评分');
    const selects = el.querySelectorAll('select');
    expect(selects).toHaveLength(4);
    expect(selects[0].value).toBe('click');
    expect(selects[3].value).toBe('score-desc');
  });

  it('非法查询参数回退默认视图，无匹配时显示空状态', () => {
    const el = renderPage({ type: 'nope', sort: 'zzz' });
    expect(el.querySelectorAll('tbody tr')).toHaveLength(7);
    const empty = renderPage({ profile: '不存在的方案' });
    expect(empty.textContent).toContain('当前筛选条件下没有匹配的记录');
    expect(empty.textContent).toContain('暂无评分');
    expect(empty.textContent).not.toContain('NaN');
  });
});
