import { h } from '../dom.js';
import { detectPointerSupport } from '../engine/calibration.js';

export function homePage({ store, router }) {
  const support = detectPointerSupport();
  const recordCount = store.state.records.length;
  const avg = recordCount
    ? Math.round(store.state.records.reduce((a, r) => a + (r.summary?.score || 0), 0) / recordCount)
    : 0;

  const supportCard = !support.supported
    ? h('div', { class: 'danger-banner' }, support.issues.join(' '))
    : support.issues.length
      ? h('div', { class: 'pill warn', style: { marginBottom: '12px' } }, support.issues.join(' '))
      : h('div', { class: 'pill good', style: { marginBottom: '12px' } }, '浏览器鼠标能力检测通过，可进行全部测试');

  return h('div', { class: 'wrap' }, [
    h('div', { class: 'card' }, [
      h('div', { class: 'hero' }, [
        h('div', {}, [
          h('h1', {}, 'FPS 射击灵敏度检测系统'),
          h('p', { class: 'muted' }, '真实记录鼠标移动与点击，通过校准、快速点击、快速转向、目标跟踪与压枪稳定性五项测试，基于实测数据评估你的灵敏度设置并给出可执行的调整建议。'),
          supportCard,
          h('div', { class: 'btnrow' }, [
            h('button', { onclick: () => router.go('calibration') }, '1. 鼠标校准'),
            h('button', { class: 'success', onclick: () => router.go('select') }, '2. 开始测试'),
            h('button', { class: 'ghost', onclick: () => router.go('settings') }, '基础设置')
          ])
        ]),
        h('div', { class: 'grid' }, [
          h('div', { class: 'metric' }, [h('div', { class: 'k' }, '已保存测试记录'), h('div', { class: 'v' }, String(recordCount))]),
          h('div', { class: 'metric' }, [h('div', { class: 'k' }, '历史平均分'), h('div', { class: 'v' }, String(avg))]),
          h('div', { class: 'metric' }, [h('div', { class: 'k' }, '当前 cm/360°'), h('div', { class: 'v' }, store.state.settings.cmPer360 ? `${store.state.settings.cmPer360} cm` : '未校准')])
        ])
      ])
    ]),
    h('div', { class: 'card' }, [
      h('h2', {}, '使用流程'),
      h('div', { class: 'grid grid-4', style: { marginTop: '12px' } }, [
        step('①', '填写设置', 'DPI、游戏灵敏度、FOV 与屏幕比例'),
        step('②', '校准鼠标', '90°/180°/360° 转身，得到 cm/360°'),
        step('③', '完成测试', '点击、转向、跟踪、压枪四类实时测试'),
        step('④', '对比与建议', '多组灵敏度方案对比，导出记录')
      ])
    ])
  ]);
}

function step(icon, title, desc) {
  return h('div', { class: 'metric' }, [
    h('div', { style: { fontSize: '24px' } }, icon),
    h('div', { style: { fontWeight: 700, marginTop: '6px' } }, title),
    h('div', { class: 'muted', style: { fontSize: '13px', marginTop: '4px' } }, desc)
  ]);
}
