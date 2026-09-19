import { h } from '../dom.js';

const TESTS = [
  { key: 'click', icon: '⚡', title: '快速点击测试', desc: '随机位置、大小与时机出现的目标，考验反应与点射精度，点空记为失误。' },
  { key: 'turn', icon: '🔄', title: '快速转向测试', desc: '目标出现在视野不同方向，鼠标锁定转向后开枪，判断过头/不到位。' },
  { key: 'tracking', icon: '🎯', title: '移动目标跟踪', desc: '目标持续变速变向移动，用准星持续跟随，评估跟枪时间与稳定性。' },
  { key: 'recoil', icon: '🔫', title: '压枪稳定性', desc: '按住左键连射持续攻击目标，观察弹道轨迹与前后半段控制差异。' }
];

export function selectPage({ store, router }) {
  const cards = TESTS.map((t) =>
    h('div', {
      class: 'testcard',
      role: 'button',
      tabindex: '0',
      onclick: () => router.go('test', { type: t.key }),
      onkeydown: (e) => { if (e.key === 'Enter') router.go('test', { type: t.key }); }
    }, [
      h('div', { class: 'icon' }, t.icon),
      h('h3', {}, t.title),
      h('p', {}, t.desc),
      h('span', { class: 'pill' }, `时长 ${store.state.settings.duration} 秒 · ${store.state.settings.targetSize === 'small' ? '小目标' : store.state.settings.targetSize === 'large' ? '大目标' : '中目标'}`)
    ])
  );

  return h('div', { class: 'wrap' }, [
    h('div', { class: 'card' }, [
      h('h2', {}, '选择测试'),
      h('p', { class: 'muted' }, `当前难度：${({ easy: '简单', normal: '普通', hard: '困难' })[store.state.settings.difficulty]}。可在“设置”中调整时间、目标大小、速度与难度。`),
      h('div', { class: 'testgrid', style: { marginTop: '14px' } }, cards)
    ]),
    h('div', { class: 'card' }, [
      h('h2', {}, '灵敏度对比模式'),
      h('p', { class: 'muted' }, '先在“灵敏度对比”页保存多组方案，然后依次用每组方案完成相同规则的测试，结果页会按方案聚合命中、反应、转向与跟踪的差异。'),
      h('div', { class: 'btnrow' }, [
        h('button', { class: 'ghost', onclick: () => router.go('compare') }, '管理灵敏度方案')
      ])
    ])
  ]);
}
