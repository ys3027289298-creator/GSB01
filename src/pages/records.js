import { h, toast, downloadFile } from '../dom.js';

const LABELS = {
  click: '快速点击',
  turn: '快速转向',
  tracking: '目标跟踪',
  recoil: '压枪稳定',
  calibration: '鼠标校准'
};

export function recordsPage({ store, router }) {
  const records = store.state.records;

  const table = h('table', {}, [
    h('thead', {}, h('tr', {}, ['时间', '类型', '方案', '评分', '关键数据', '操作'].map((t) => h('th', {}, t)))),
    h('tbody', {}, records.length ? records.map((r) => h('tr', {}, [
      h('td', {}, new Date(r.createdAt).toLocaleString('zh-CN')),
      h('td', {}, LABELS[r.type] || r.type),
      h('td', {}, r.profileName || '默认'),
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
    ])) : [h('tr', {}, h('td', { colspan: '6', class: 'muted', style: { textAlign: 'center', padding: '26px' } }, '暂无测试记录，先去完成一次测试吧。'))])
  ]);

  return h('div', { class: 'wrap' }, [
    h('div', { class: 'card' }, [
      h('h2', {}, `测试记录（${records.length}，最多保留最近 100 条）`),
      h('p', { class: 'muted' }, '记录保存在浏览器本地存储中，刷新不会丢失。'),
      h('div', { class: 'btnrow' }, [
        h('button', { class: 'ghost', onclick: () => exportAllJson(records) }, '导出全部 JSON'),
        h('button', { class: 'ghost', onclick: () => exportAllCsv(records) }, '导出全部 CSV'),
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

function keyStat(r) {
  const s = r.stats;
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
