import './styles.css'
import { state, refreshState } from './state.js'
import { renderHome } from './views/home.js'
import { renderSettings } from './views/settings.js'
import { renderCalibration } from './views/calibration.js'
import { renderSelect } from './views/select.js'
import { renderTest } from './views/test.js'
import { renderResult } from './views/result.js'
import { renderRecords } from './views/records.js'
import { renderCompare } from './views/compare.js'

const app = document.getElementById('app')

const VIEWS = {
  home: renderHome,
  settings: renderSettings,
  calibration: renderCalibration,
  select: renderSelect,
  test: renderTest,
  result: renderResult,
  records: renderRecords,
  compare: renderCompare
}

const NAV = [
  ['home', '首页'],
  ['select', '开始测试'],
  ['calibration', '鼠标校准'],
  ['compare', '灵敏度对比'],
  ['records', '测试记录'],
  ['settings', '设置']
]

export function navigate(view, params = {}) {
  state.view = view
  state.routeParams = params
  if (view === 'records' || view === 'settings' || view === 'home') refreshState()
  location.hash = view + (params.test ? `/${params.test}` : '')
  render()
  window.scrollTo(0, 0)
}

function render() {
  const view = state.view
  app.innerHTML = `
    <div class="topbar">
      <div class="brand">FPS<span>·</span>SENS LAB</div>
      <div class="nav">
        ${NAV.map(([id, label]) =>
          `<button data-nav="${id}" class="${view === id ? 'active' : ''}">${label}</button>`
        ).join('')}
      </div>
      <div class="spacer"></div>
      <div class="pill">DPI ${state.settings.dpi} · 灵敏度 ${state.settings.sensitivity} · FOV ${state.settings.fov}</div>
    </div>
    <div id="view-root"></div>
  `
  app.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.nav))
  })
  const root = document.getElementById('view-root')
  const renderer = VIEWS[view] || renderHome
  renderer(root, state.routeParams || {})
}

function boot() {
  refreshState()
  const hash = location.hash.replace(/^#\/?/, '')
  const [name, test] = hash.split('/')
  if (VIEWS[name]) {
    state.view = name
    state.routeParams = test ? { test } : {}
  }
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace(/^#\/?/, '')
    const [n, t] = h.split('/')
    if (VIEWS[n] && n !== state.view) {
      state.view = n
      state.routeParams = t ? { test: t } : {}
      render()
    }
  })
  render()
}

boot()
