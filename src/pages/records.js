import { h, mount, toast, downloadFile } from '../dom.js';
import {
  RECORD_TYPES,
  TYPE_LABELS,
  DEFAULT_PROFILE,
  parseRecordsQuery,
  recordsQueryString,
  filterRecords,
  sortRecords,
  summarizeRecords,
  listProfiles,
  profileNameOf
} from '../engine/recordAnalysis.js';

const LABELS = TYPE_LABELS;

const RANGE_OPTIONS = [
  ['all', '全部时间'],
  ['7d', '最近 7 天'],
  ['30d', '最近 30 天']
];

const SORT_OPTIONS = [
  ['newest', '最新优先'],
  ['oldest', '最早优先'],
  ['scoreDesc', '评分从高到低'],
  ['scoreAsc', '评分从低到高']
];

export function recordsPage({ store, router }) {
  const container = h('div', { class: 'wrap' });

  const currentFilters = () => parseRecordsQuery(router.route.params, store.state.records);

  function renderContent() {
    mount(container, buildView());
  }

  function applyFilters(patch) {
    const next = { ...currentFilters(), ...patch };
    history.pushState(null, '', `#/records?${recordsQueryString(next)}`);
    renderContent();
  }

  function filterSelect(id, options, value, key) {
    return h('select', {
      id,
      style: { marginLeft: '6px', minWidth: '120px' },
      onchange: (e) => applyFilters({ [key]: e.target.value })
    }, options.map(([v, label]) =>
      h('option', { value: v, ...(v === value ? { selected: true } : {}) }, label)));
  }

  function buildView() {
    const records = store.state.records;
    const filters = currentFilters();
    const filtered = sortRecords(filterRecords(records, filters), filters.sort);
    const stats = summarizeRecords(filtered);

    const profileOptions = [['all', '全部方案'], ...listProfiles(records).map((p) => [p, p])];
    const typeOptions = [['all', '全部类型'], ...RECORD_TYPES.map((t) => [t, LABELS[t]])];

    const controls = h('div', {
      class: 'muted',
      style: { display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', margin: '12px 0' }
    }, [
      h('label', {}, ['类型', filterSelect('flt-type', typeOptions, filters.type, 'type')]),
      h('label', {}, ['方案', filterSelect('flt-profile', profileOptions, filters.profile, 'profile')]),
      h('label', {}, ['时间', filterSelect('flt-range', RANGE_OPTIONS, filters.range, 'range')]),
      h('label', {}, ['排序', filterSelect('flt-sort', SORT_OPTIONS, filters.sort, 'sort')])
    ]);

    const statCard = (title, value, sub) => h('div', { class: 'card', style: { margin: 0, padding: '14px 16px' } }, [
      h('div', { class: 'muted', style: { fontSize: '13px' } }, title),
      h('div', { class: 'stat-value', style: { fontSize: '24px', fontWeight: 700, margin: '4px 0' } }, value),
      h('div', { class: 'muted', style: { fontSize: '12px' } }, sub || ' ')
    ]);

    const empty = stats.total === 0;
    const statGrid = h('div', { class: 'grid grid-4', style: { margin: '4px 0 14px' } }, [
      statCard('筛选记录数', String(stats.total), empty ? '当前条件下暂无记录' : `共 ${records.length} 条历史记录`),
      statCard('评分记录数', String(stats.scoredCount), empty ? '—' : '包含有效 summary 的记录'),
      statCard('平均分', stats.avgScore === null ? '—' : stats.avgScore.toFixed(1),
        stats.avgScore === null ? '暂无可统计的评分' : `基于 ${stats.scoredCount} 条评分记录`),
      statCard('最高分', stats.maxScore === null ? '—' : String(stats.maxScore),
        stats.maxScore === null ? '暂无可统计的评分' : `类型：${LABELS[stats.maxType] || stats.maxType || '未知'}`)
    ]);

    const distItems = Object.entries(stats.distribution)
      .filter(([, n]) => n > 0)
      .map(([t, n]) => h('span', {
        class: 'pill',
        style: { marginRight: '8px' }
      }, `${t === 'other' ? '未知类型' : LABELS[t]} × ${n}`));
    const distribution = h('div', { style: { margin: '0 0 14px' } }, [
      h('span', { class: 'muted', style: { marginRight: '10px' } }, '类型分布：'),
      ...(distItems.length ? distItems : [h('span', { class: 'muted' }, '暂无匹配记录')])
    ]);

    const table = h('table', {}, [
      h('thead', {}, h('tr', {}, ['时间', '类型', '方案', '评分', '关键数据', '操作'].map((t) => h('th', {}, t)))),
      h('tbody', {}, filtered.length ? filtered.map((r) => h('tr', {}, [
        h('td', {}, formatTime(r.createdAt)),
        h('td', {}, LABELS[r.type] || r.type || '未知'),
        h('td', {}, profileNameOf(r)),
        h('td', {}, r.summary && typeof r.summary.score === 'number' ? String(r.summary.score) : '—'),
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

    return h('div', { class: 'card' }, [
      h('h2', {}, `测试记录（${records.length}，最多保留最近 100 条）`),
      h('p', { class: 'muted' }, '记录保存在浏览器本地存储中，刷新不会丢失。筛选只影响展示与导出，不会修改历史数据。'),
      controls,
      statGrid,
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
    ]);
  }

  renderContent();
  return container;
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
    const s = r.stats;
    let rate = '', react = '', misses = '', dist = s.mouseDistancePx ?? '';
    if (r.type === 'click') { rate = s.accuracy; react = s.avgReactionMs; misses = s.misses; }
    if (r.type === 'turn') { rate = s.targets ? s.hits / s.targets : 0; react = s.avgCompletionMs; misses = s.overCount + s.underCount; }
    if (r.type === 'tracking') { rate = s.onTargetRate; react = s.avgOffsetPx; misses = s.offTargetMs; }
    if (r.type === 'recoil') { rate = s.stable ? 1 : 0; react = s.avgOffsetPx; misses = s.maxOffsetPx; }
    if (r.type === 'calibration') { rate = s.viewDeg; react = s.errorDeg; misses = s.elapsedMs; }
    return [r.id, r.createdAt, r.type, r.profileName || '默认', r.summary?.score ?? '', rate, react, misses, dist, r.settings.dpi, r.settings.sensitivity, r.settings.fov]
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
  if (!records.length) return toast('当前筛选没有匹配记录，未导出。');
  downloadFile(`fps-test-records-filtered-${Date.now()}.json`, JSON.stringify(records, null, 2));
  toast('当前筛选结果已导出为 JSON。');
}

function exportFilteredCsv(records) {
  if (!records.length) return toast('当前筛选没有匹配记录，未导出。');
  downloadFile(`fps-test-records-filtered-${Date.now()}.csv`, recordsToCsv(records), 'text/csv;charset=utf-8');
  toast('当前筛选结果已导出为 CSV。');
}
