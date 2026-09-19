import { h, toast } from '../dom.js';
import { compareProfiles } from '../engine/scoring.js';

export function comparePage({ store, router }) {
  const { profiles, records, activeProfile } = store.state;
  const testRuns = records.filter((r) => r.type !== 'calibration' && r.summary);
  const rows = compareProfiles(testRuns);

  const profileList = h('div', { class: 'grid grid-2' },
    profiles.length ? profiles.map((p) =>
      h('div', { class: 'metric', style: { outline: p.id === activeProfile ? '2px solid var(--accent)' : 'none' } }, [
        h('div', { style: { fontWeight: 700 } }, p.name),
        h('div', { class: 'muted', style: { fontSize: '13px', marginTop: '4px' } },
          `DPI ${p.settings.dpi} · 灵敏度 ${p.settings.sensitivity} · FOV ${p.settings.fov} · ${p.settings.aspect} · cm/360 ${p.settings.cmPer360 ?? '未校准'}`),
        h('div', { class: 'btnrow', style: { marginTop: '10px' } }, [
          h('button', {
            style: { padding: '6px 12px' },
            onclick: () => { store.setActiveProfile(p.id); toast(`已切换到「${p.name}」，测试结果将归入该方案。`); }
          }, p.id === activeProfile ? '当前使用中' : '使用此方案'),
          h('button', {
            class: 'danger', style: { padding: '6px 12px' },
            onclick: () => { if (confirm(`删除方案「${p.name}」？历史记录仍保留。`)) store.deleteProfile(p.id); }
          }, '删除')
        ])
      ])
    ) : [h('p', { class: 'muted' }, '还没有保存灵敏度方案。调整好设置后点击下方按钮保存当前设置。')]
  );

  const compareTable = rows.length ? h('table', {}, [
    h('thead', {}, h('tr', {}, ['方案', '测试次数', '综合均分', '命中率', '平均反应', '转向命中 / 倾向', '跟踪率 / 抖动', '压枪偏移'].map((t) => h('th', {}, t)))),
    h('tbody', {}, rows.map((r) => h('tr', {}, [
      h('td', { style: { fontWeight: 700 } }, r.profileName),
      h('td', {}, String(r.runs)),
      h('td', {}, String(r.score)),
      h('td', {}, r.accuracy != null ? `${Math.round(r.accuracy * 100)}%` : '—'),
      h('td', {}, r.reactionMs ? `${r.reactionMs} ms` : '—'),
      h('td', {}, r.turnAccuracy != null ? `${Math.round(r.turnAccuracy * 100)}% · ${r.turnMs} ms · ${r.overUnder > 0 ? `偏过头+${r.overUnder}` : r.overUnder < 0 ? `偏不足${r.overUnder}` : '均衡'}` : '—'),
      h('td', {}, r.trackingRate != null ? `${Math.round(r.trackingRate * 100)}% · ${r.jitter}` : '—'),
      h('td', {}, r.recoilOffset != null ? `${r.recoilOffset} px · 受控 ${r.recoilStreak} ms` : '—')
    ])))
  ]) : h('p', { class: 'muted' }, '还没有可对比的测试结果。保存多个方案后，用相同时间、目标数量与规则分别测试即可看到差异。');

  return h('div', { class: 'wrap' }, [
    h('div', { class: 'card' }, [
      h('h2', {}, '灵敏度方案'),
      h('p', { class: 'muted' }, '保存当前的 DPI / 游戏灵敏度 / FOV 等设置为一个命名方案，切换方案后完成相同测试，系统按方案分组统计。'),
      h('div', { class: 'btnrow' }, [
        h('button', { onclick: () => {
          const name = prompt('为当前灵敏度设置起个名字，例如「800x1.2」：', `方案 ${profiles.length + 1}`);
          if (!name) return;
          const p = store.saveProfile(name.trim());
          store.setActiveProfile(p.id);
          toast('方案已保存并切换。');
        } }, '保存当前设置为方案')
      ]),
      h('div', { style: { marginTop: '14px' } }, profileList)
    ]),
    h('div', { class: 'card' }, [
      h('h2', {}, '对比结果'),
      h('p', { class: 'muted' }, '各方案在相同测试规则下的命中、反应、转向、跟踪与压枪数据。请保证对比时测试时间、目标大小、速度与难度一致。'),
      compareTable,
      h('div', { class: 'btnrow' }, [
        h('button', { onclick: () => router.go('select') }, '使用当前方案去测试'),
        h('button', { class: 'ghost', onclick: () => router.go('records') }, '查看全部记录')
      ])
    ])
  ]);
}
