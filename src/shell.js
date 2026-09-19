import { h, mount } from './dom.js';
import { homePage } from './pages/home.js';
import { settingsPage } from './pages/settings.js';
import { calibrationPage } from './pages/calibration.js';
import { selectPage } from './pages/select.js';
import { testPage } from './pages/test.js';
import { resultPage } from './pages/result.js';
import { recordsPage } from './pages/records.js';
import { comparePage } from './pages/compare.js';

const NAV = [
  ['home', '开始'],
  ['settings', '设置'],
  ['calibration', '鼠标校准'],
  ['select', '测试选择'],
  ['records', '测试记录'],
  ['compare', '灵敏度对比']
];

export function renderShell(root, ctx) {
  const { store, router } = ctx;
  const { path } = router.route;
  const fullscreenTest = path === 'test';

  const nav = h('nav', { class: 'nav' },
    NAV.map(([key, label]) =>
      h('a', {
        href: `#/${key}`,
        class: path === key ? 'active' : ''
      }, label)
    )
  );

  const topbar = h('header', { class: 'topbar' }, [
    h('span', { class: 'brand' }, '🎯 FPS 灵敏度检测'),
    nav,
    h('span', { class: 'spacer' }),
    !fullscreenTest && h('span', { class: 'pill' },
      `DPI ${store.state.settings.dpi} · 灵敏度 ${store.state.settings.sensitivity} · FOV ${store.state.settings.fov}`)
  ]);

  const main = h('main', { class: 'main' });
  const pageCtx = { store, router, main };
  const pageMap = {
    home: homePage,
    settings: settingsPage,
    calibration: calibrationPage,
    select: selectPage,
    test: testPage,
    result: resultPage,
    records: recordsPage,
    compare: comparePage
  };
  const renderer = pageMap[path] || homePage;
  const content = renderer(pageCtx);
  mount(main, content);

  const app = h('div', { style: { display: 'contents' } }, [topbar, main]);
  mount(root, app);
}
