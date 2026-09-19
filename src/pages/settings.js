import { h } from '../dom.js';
import { toast } from '../dom.js';
import { ASPECTS, DEFAULT_SETTINGS } from '../engine/settings.js';

export function settingsPage({ store }) {
  const s = store.state.settings;

  function field(labelText, inputEl, hint) {
    return h('label', { class: 'field' }, [labelText, inputEl, hint ? h('span', { class: 'muted', style: { fontSize: '12px' } }, hint) : null]);
  }

  const dpi = h('input', { type: 'number', min: '50', max: '64000', value: s.dpi, id: 'set-dpi' });
  const sens = h('input', { type: 'number', step: '0.01', min: '0.01', max: '100', value: s.sensitivity, id: 'set-sens' });
  const fov = h('input', { type: 'number', min: '40', max: '170', value: s.fov, id: 'set-fov' });
  const aspect = h('select', { id: 'set-aspect' }, ASPECTS.map((a) => h('option', { value: a, selected: a === s.aspect }, a)));
  const duration = h('select', { id: 'set-duration' }, [10, 15, 20, 30, 45, 60].map((n) => h('option', { value: n, selected: n === s.duration }, `${n} 秒`)));
  const size = h('select', { id: 'set-size' }, [['small', '小'], ['medium', '中'], ['large', '大']].map(([v, label]) => h('option', { value: v, selected: v === s.targetSize }, label)));
  const speed = h('select', { id: 'set-speed' }, [['slow', '慢'], ['medium', '中'], ['fast', '快']].map(([v, label]) => h('option', { value: v, selected: v === s.targetSpeed }, label)));
  const diff = h('select', { id: 'set-diff' }, [['easy', '简单'], ['normal', '普通'], ['hard', '困难']].map(([v, label]) => h('option', { value: v, selected: v === s.difficulty }, label)));

  function collect() {
    return {
      dpi: dpi.value,
      sensitivity: sens.value,
      fov: fov.value,
      aspect: aspect.value,
      duration: Number(duration.value),
      targetSize: size.value,
      targetSpeed: speed.value,
      difficulty: diff.value
    };
  }

  const saveBtn = h('button', {
    onclick: () => {
      store.updateSettings(collect());
      toast('设置已保存，刷新浏览器也不会丢失。');
    }
  }, '保存设置');

  const resetBtn = h('button', {
    class: 'ghost',
    onclick: () => {
      if (!confirm('恢复全部默认设置？当前设置会被覆盖（测试记录保留）。')) return;
      store.resetSettings();
      toast('已恢复默认设置。');
      setTimeout(() => location.reload(), 400);
    }
  }, '恢复默认设置');

  const clearBtn = h('button', {
    class: 'danger',
    onclick: () => {
      if (!confirm('将清空全部本地数据（设置、校准、测试记录、灵敏度方案），且不可恢复。确定吗？')) return;
      store.clearAllData();
      toast('本地数据已清空。');
      setTimeout(() => location.reload(), 500);
    }
  }, '清空本地数据');

  const errorBanner = store.state.dataError
    ? h('div', { class: 'danger-banner' }, [
        h('strong', {}, '本地数据读取失败：'),
        document.createTextNode(store.state.dataError),
        h('div', { class: 'btnrow' }, [
          h('button', { class: 'danger', onclick: () => { store.clearAllData(); setTimeout(() => location.reload(), 400); } }, '清空损坏数据并重置')
        ])
      ])
    : null;

  return h('div', { class: 'wrap' }, [
    errorBanner,
    h('div', { class: 'card' }, [
      h('h2', {}, '基础设置'),
      h('p', { class: 'muted' }, '这些参数会影响所有测试，并在每次修改保存后写入浏览器本地存储。默认值：' +
        `DPI ${DEFAULT_SETTINGS.dpi}、灵敏度 ${DEFAULT_SETTINGS.sensitivity}、FOV ${DEFAULT_SETTINGS.fov}、${DEFAULT_SETTINGS.aspect}、${DEFAULT_SETTINGS.duration} 秒。`),
      h('h3', {}, '游戏参数'),
      h('div', { class: 'grid grid-4' }, [
        field('鼠标 DPI', dpi, '常见值 400 / 800 / 1600'),
        field('游戏内灵敏度', sens, '保留两位小数'),
        field('视野范围 FOV', fov, '40 - 170'),
        field('显示器比例', aspect)
      ]),
      h('h3', {}, '测试参数'),
      h('div', { class: 'grid grid-4' }, [
        field('测试时间', duration),
        field('目标大小', size),
        field('目标速度', speed),
        field('测试难度', diff, '难度影响目标生成频率、尺寸与速度')
      ]),
      h('div', { class: 'btnrow' }, [saveBtn, resetBtn, clearBtn])
    ])
  ]);
}
