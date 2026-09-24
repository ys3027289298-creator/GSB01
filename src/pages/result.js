import { h, fmtMs, fmtPct } from '../dom.js';
import { downloadFile } from '../dom.js';

const LABELS = {
  click: '快速点击测试',
  turn: '快速转向测试',
  tracking: '移动目标跟踪',
  recoil: '压枪稳定性测试',
  calibration: '鼠标校准'
};

export function resultPage({ store, router }) {
  const id = router.route.params.id;
  const record = store.state.records.find((r) => r.id === id) || store.state.records[0];
  if (!record) {
    return h('div', { class: 'wrap' }, [
      h('div', { class: 'card' }, [
        h('h2', {}, '没有可显示的结果'),
        h('p', { class: 'muted' }, '该记录可能已被删除。'),
        h('div', { class: 'btnrow' }, [
          h('button', { onclick: () => router.go('select') }, '去测试'),
          h('button', { class: 'ghost', onclick: () => router.go('records') }, '查看记录')
        ])
      ])
    ]);
  }

  const { summary, stats, settings } = record;
  if (!summary) {
    return h('div', { class: 'wrap' }, [
      h('div', { class: 'card' }, [
        h('h2', {}, `${LABELS[record.type] || record.type} · 历史记录`),
        h('p', { class: 'muted' }, `${new Date(record.createdAt).toLocaleString('zh-CN')} · 该记录来自旧版本备份，缺少评分摘要，仅展示原始数据。`),
        h('pre', { class: 'muted', style: { whiteSpace: 'pre-wrap', fontSize: '12px' } }, JSON.stringify(record.stats, null, 2)),
        h('div', { class: 'btnrow' }, [
          h('button', { class: 'ghost', onclick: () => router.go('records') }, '返回记录'),
          h('button', { class: 'danger', onclick: () => {
            if (!confirm('删除这条测试记录？')) return;
            store.deleteRecord(record.id);
            router.go('records');
          } }, '删除记录')
        ])
      ])
    ]);
  }
  const metrics = metricDefs(record);
  const ringColor = summary.score >= 85 ? '#37d399' : summary.score >= 55 ? '#4da3ff' : '#ff5c7a';

  const card = h('div', { class: 'card' }, [
    h('h2', {}, `${LABELS[record.type]} · 详细结果`),
    h('p', { class: 'muted' }, `${new Date(record.createdAt).toLocaleString('zh-CN')} · 灵敏度方案：${record.profileName || '默认'}`),
    h('div', { class: 'grid grid-2', style: { marginTop: '16px' } }, [
      h('div', {}, [
        h('div', {
          class: 'score-ring',
          style: { background: `conic-gradient(${ringColor} ${summary.score * 3.6}deg, #1e2939 0deg)` }
        }, [
          h('div', { style: { width: '116px', height: '116px', borderRadius: '50%', background: '#0e131c', display: 'grid', placeItems: 'center' } }, [
            h('div', { style: { textAlign: 'center' } }, [
              h('div', { class: 'num' }, String(summary.score)),
              h('div', { class: 'muted' }, summary.grade)
            ])
          ])
        ])
      ]),
      h('div', { class: 'grid grid-2' }, metrics.map(([k, v]) =>
        h('div', { class: 'metric' }, [h('div', { class: 'k' }, k), h('div', { class: 'v', style: { fontSize: '20px' } }, v)])
      ))
    ]),
    h('h3', {}, '根据本次测量给出的建议'),
    h('ul', { class: 'advice' }, summary.advice.map((text) => h('li', {}, text))),
    h('h3', {}, '本次使用的设置'),
    h('p', { class: 'muted' }, `DPI ${settings.dpi} · 游戏灵敏度 ${settings.sensitivity} · FOV ${settings.fov} · 屏幕比例 ${settings.aspect} · cm/360° ${settings.cmPer360 ?? '未校准'} · 时长 ${Math.round(stats.durationMs / 1000)} 秒`),
    h('div', { class: 'btnrow' }, [
      h('button', { onclick: () => router.go('test', { type: record.type }) }, '重新测试'),
      h('button', { class: 'ghost', onclick: () => router.go('select') }, '选择其他测试'),
      h('button', { class: 'ghost', onclick: () => router.go('settings') }, '返回设置'),
      h('button', { class: 'ghost', onclick: () => exportJson(record) }, '导出本次 JSON'),
      h('button', { class: 'danger', onclick: () => {
        if (!confirm('删除这条测试记录？')) return;
        store.deleteRecord(record.id);
        router.go('records');
      } }, '删除记录')
    ])
  ]);

  if (record.type === 'turn') {
    card.appendChild(h('h3', {}, '逐目标转向明细'));
    card.appendChild(h('table', {}, [
      h('thead', {}, h('tr', {}, ['#', '目标角度', '误差', '判定', '用时'].map((t) => h('th', {}, t)))),
      h('tbody', {}, stats.details.map((d, i) => h('tr', {}, [
        h('td', {}, String(i + 1)),
        h('td', {}, `${d.targetAngle > 0 ? '+' : ''}${d.targetAngle}°`),
        h('td', {}, `${d.errorDeg}°`),
        h('td', {}, classText(d)),
        h('td', {}, fmtMs(d.completionMs))
      ])))
    ]));
  }

  return h('div', { class: 'wrap' }, [card]);
}

function classText(d) {
  if (d.hit && d.classification === 'hit') return h('span', { class: 'pill good' }, '精准命中');
  if (d.hit) return h('span', { class: 'pill warn' }, '过头后命中');
  if (d.classification === 'over') return h('span', { class: 'pill bad' }, '过度移动');
  if (d.classification === 'under') return h('span', { class: 'pill warn' }, '移动不足');
  return h('span', { class: 'pill bad' }, '超时');
}

function metricDefs(record) {
  const s = record.stats;
  if (record.type === 'click') return [
    ['命中率', fmtPct(s.accuracy)],
    ['平均反应', fmtMs(s.avgReactionMs)],
    ['最快反应', fmtMs(s.fastestReactionMs)],
    ['命中 / 失误', `${s.hits} / ${s.misses}`],
    ['漏点次数', String(s.timeouts)],
    ['目标总数', String(s.spawned)]
  ];
  if (record.type === 'turn') return [
    ['命中率', fmtPct(s.targets ? s.hits / s.targets : 0)],
    ['平均完成时间', fmtMs(s.avgCompletionMs)],
    ['平均角度误差', `${s.avgErrorDeg}°`],
    ['过度 / 不足', `${s.overCount} / ${s.underCount}`],
    ['偏向', s.bias === 'over' ? '过度移动' : s.bias === 'under' ? '移动不足' : '均衡'],
    ['鼠标移动', `${s.mouseDistancePx} px`]
  ];
  if (record.type === 'tracking') return [
    ['跟踪成功率', fmtPct(s.onTargetRate)],
    ['偏离时间', fmtMs(s.offTargetMs)],
    ['最长连续偏离', fmtMs(s.longestOffMs)],
    ['平均偏离', `${s.avgOffsetPx} px`],
    ['移动稳定性', s.stable ? '稳定' : '抖动偏大'],
    ['鼠标移动', `${s.mouseDistancePx} px`]
  ];
  return [
    ['平均偏移', `${s.avgOffsetPx} px`],
    ['最大偏移', `${s.maxOffsetPx} px`],
    ['前半段偏移', `${s.firstHalfAvgOffset} px`],
    ['后半段偏移', `${s.secondHalfAvgOffset} px`],
    ['最长受控时长', fmtMs(s.controlStreakMs)],
    ['发射弹数', String(s.shots)]
  ];
}

function exportJson(record) {
  downloadFile(`fps-test-${record.type}-${record.id}.json`, JSON.stringify(record, null, 2));
}
