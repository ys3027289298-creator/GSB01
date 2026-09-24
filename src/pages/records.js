import { h, toast, downloadFile } from '../dom.js';
import {
  RECORD_TYPES,
  TYPE_LABELS,
  DEFAULT_QUERY,
  parseRecordsQuery,
  queryToParams,
  listProfileNames,
  filterRecords,
  sortRecords,
  analyzeRecords,
  normalizeProfileName
} from '../engine/recordsFilter.js';

const LABELS = TYPE_LABELS;

const TYPE_OPTIONS = [['all', '全部类型'], ...RECORD_TYPES.map((t) => [t, TYPE_LABELS[t]])];
const TIME_OPTIONS = [['all', '全部时间'], ['7d', '最近 7 天'], ['30d', '最近 30 天']];
const SORT_OPTIONS = [
  ['newest', '最新优先'],
  ['oldest', '最早优先'],
  ['score-desc', '评分从高到低'],
  ['score-asc', '评分从低到高']
];

export function recordsPage({ store, router }) {
  const records = store.state.records;
  const query = parseRecordsQuery(router.route?.params || {});
  const profiles = listProfileNames(records);
  const filtered = sortRecords(filterRecords(records, query), query.sort);
  const stats = analyzeRecords(filtered);

  const updateQuery = (patch) => {
    router.go('records', queryToParams({ ...query, ...patch }));
  };

  const select = (label, options, value, key) => h('label', {
    class: 'muted',
    style: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }
  }, [
    label,
    h('select', {
      dataset: { filter: key },
      onchange: (e) => updateQuery({ [key]: e.target.value })
    }, options.map(([v, text]) =>
      h('option', { value: v, selected: v === value || null }, text)))
  ]);

  const controls = h('div', {
    class: 'records-filters',
    style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', margin: '14px 0' }
  }, [
    select('记录类型', TYPE_OPTIONS, query.type, 'type'),
    select('灵敏度方案', [['all', '全部方案'], ...profiles.map((p) => [p, p])], query.profile, 'profile'),
    select('时间范围', TIME_OPTIONS, query.time, 'time'),
    select('排序方式', SORT_OPTIONS, query.sort, 'sort')
  ]);

  const statCard = (label, value, sub) => h('div', {
    class: 'card',
    style: { padding: '12px 14px', margin: '0' }
  }, [
    h('div', { class: 'muted', style: { fontSize: '12px' } }, label),
    h('div', { style: { fontSize: '22px', fontWeight: '700' } }, value),
    sub ? h('div', { class: 'muted', style: { fontSize: '12px' } }, sub) : null
  ]);

  const summaryCards = h('div', {
    class: 'records-stats',
    style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '10px' }
  }, [
    statCard('筛选记录数', String(stats.total)),
    statCard('有效评分记录', String(stats.scoredCount)),
    statCard('平均评分', stats.avgScore === null ? '暂无评分' : stats.avgScore.toFixed(1)),
    statCard(
      '最高评分',
      stats.best ? String(stats.best.score) : '暂无评分',
      stats.best ? `来自：${LABELS[stats.best.type] || '未知类型'}` : ''
    )
  ]);

  const distribution = h('div', {
    class: 'records-dist',
    style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }
  }, [
    h('span', { class: 'muted', style: { fontSize: '13px', alignSelf: 'center' } }, '类型分布：'),
    ...Object.entries(stats.typeCounts).map(([type, count]) =>
      h('span', { class: 'pill', dataset: { dist: type } },
        `${LABELS[type] || '未知类型'} ${count}`))
  ]);

  const table = h('table', {}, [
    h('thead', {}, h('tr', {}, ['时间', '类型', '方案', '评分', '关键数据', '操作'].map((t) => h('th', {}, t)))),
    h('tbody', {}, filtered.length ? filtered.map((r) => h('tr', {}, [
      h('td', {}, formatTime(r.createdAt)),
      h('td', {}, LABELS[r.type] || r.type),
      h('td', {}, normalizeProfileName(r)),
      h('td', {}, r.summary ? String(r.summary.score) : '—'),
      h('td', { class: 'muted' }, keyStat(r)),
      h('td', {}, [
        h('button', {
          class: 'ghost',
          style: { padding: '5px 10px', marginRight: '6px' },
          onclick: () => router.go('result', { id: r.id })
        }, '查看'),
        h('button', {
          class: 'danger',
          style: { padding: '5px 10px' },
          onclick: () => {
            if (!confirm('删除这条记录？')) return;
            store.deleteRecord(r.id);
            toast('记录已删除。');
          }
        }, '删除')
      ])
    ])) : [h('tr', {}, h('td', { colspan: '6', class: 'muted', style: { textAlign: 'center', padding: '26px' } },
      records.length ? '当前筛选条件下没有匹配的记录。' : '暂无测试记录，先去完成一次测试吧。'))])
  ]);

  return h('div', { class: 'wrap' }, [
    h('div', { class: 'card' }, [
      h('h2', {}, `测试记录（${records.length}，最多保留最近 100 条）`),
      h('p', { class: 'muted' }, '记录保存在浏览器本地存储中，刷新不会丢失。筛选只影响展示与导出，不会修改历史数据。'),
      controls,
      summaryCards,
      distribution,
      h('div', { class: 'btnrow' }, [
        h('button', { class: 'ghost', onclick: () => exportAllJson(records) }, '导出全部 JSON'),
        h('button', { class: 'ghost', onclick: () => exportAllCsv(records) }, '导出全部 CSV'),
        h('button', { class: 'ghost', onclick: () => exportFilteredJson(filtered) }, '导出当前筛选 JSON'),
        h('button', { class: 'ghost', onclick: () => exportFilteredCsv(filtered) }, '导出当前筛选 CSV'),
        h('button', {
          class: 'danger',
          onclick: () => {
            if (!records.length) return toast('没有记录可清空。');
            if (!confirm('确定清空全部测试记录？此操作不可恢复。')) return;
            store.clearRecords();
            toast('全部记录已清空。');
          }
        }, '清空全部记录')
      ]),
      h('div', { style: { marginTop: '14px' } }, table)
    ])
  ]);
}

function formatTime(createdAt) {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) ? new Date(t).toLocaleString('zh-CN') : '未知时间';
}

function keyStat(r) {
  const s = r.stats || {};
  if (r.type === 'click') return `命中率 ${s.hits}/${s.attempts} · 平均反应 ${s.avgReactionMs} ms · 漏点 ${s.timeouts}`;
  if (r.type === 'turn') return `命中 ${s.hits}/${s.targets} · 过头 ${s.overCount} / 不足 ${s.underCount} · ${s.avgCompletionMs} ms`;
  if (r.type === 'tracking') return `跟踪率 ${Math.round(s.onTargetRate * 100)}% · 偏离 ${s.offTargetMs} ms · 抖动 ${s.stabilityJitter}`;
  if (r.type === 'recoil') return `平均偏移 ${s.avgOffsetPx} px · 前 ${s.firstHalfAvgOffset} / 后 ${s.secondHalfAvgOffset}`;
  if (r.type === 'calibration') return `目标 ${s.targetDeg}° · 实测 ${s.viewDeg}° · ${s.cmPer360 ?? '--'} cm/360°`;
  return '';
}

export function recordsToCsv(records) {
  const header = ['id', 'createdAt', 'type', 'profileName', 'score', 'accuracyOrRate', 'reactionOrOffset', 'misses', 'distancePx', 'dpi', 'sensitivity', 'fov'];
  const rows = records.map((r) => {
    const s = r.stats || {};
    const settings = r.settings || {};
    let rate = '', react = '', misses = '', dist = s.mouseDistancePx ?? '';
    if (r.type === 'click') { rate = s.accuracy; react = s.avgReactionMs; misses = s.misses; }
    if (r.type === 'turn') { rate = s.targets ? s.hits / s.targets : 0; react = s.avgCompletionMs; misses = s.overCount + s.underCount; }
    if (r.type === 'tracking') { rate = s.onTargetRate; react = s.avgOffsetPx; misses = s.offTargetMs; }
    if (r.type === 'recoil') { rate = s.stable ? 1 : 0; react = s.avgOffsetPx; misses = s.maxOffsetPx; }
    if (r.type === 'calibration') { rate = s.viewDeg; react = s.errorDeg; misses = s.elapsedMs; }
    return [r.id, r.createdAt, r.type, normalizeProfileName(r), r.summary?.score ?? '', rate, react, misses, dist, settings.dpi, settings.sensitivity, settings.fov]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  return [header.join(','), ...rows].join('\n');
}

function exportAllJson(records) {
  if (!records.length) return toast('没有记录可导出。');
  downloadFile(`fps-test-records-${Date.now()}.json`, JSON.stringify(records, null, 2));
  toast('JSON 已导出。');
}

function exportAllCsv(records) {
  if (!records.length) return toast('没有记录可导出。');
  downloadFile(`fps-test-records-${Date.now()}.csv`, recordsToCsv(records), 'text/csv;charset=utf-8');
  toast('CSV 已导出。');
}

function exportFilteredJson(records) {
  if (!records.length) return toast('当前筛选没有记录可导出。');
  downloadFile(`fps-test-records-filtered-${Date.now()}.json`, JSON.stringify(records, null, 2));
  toast('当前筛选结果已导出为 JSON。');
}

function exportFilteredCsv(records) {
  if (!records.length) return toast('当前筛选没有记录可导出。');
  downloadFile(`fps-test-records-filtered-${Date.now()}.csv`, recordsToCsv(records), 'text/csv;charset=utf-8');
  toast('当前筛选结果已导出为 CSV。');
}
