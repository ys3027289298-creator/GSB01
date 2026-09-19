import { navigate } from '../main.js'
import { state } from '../state.js'
import { saveSettings, clearAllData } from '../engine/storage.js'
import { DEFAULT_SETTINGS, ASPECTS, DIFFICULTIES } from '../engine/defaults.js'
import { normalizeSettings, summarizeSensitivity } from '../engine/sensitivity.js'

export function renderSettings(root) {
  const s = { ...state.settings }
  root.innerHTML = `
    <div class="page">
      <h1>基础设置</h1>
      <p class="sub">设置自动保存在浏览器本地，刷新页面不会丢失。</p>
      <div id="msg"></div>
      <div class="grid cols-2">
        <div class="card">
          <h2>鼠标与游戏</h2>
          <label class="field"><span>鼠标 DPI</span><input id="dpi" type="number" min="100" max="32000" value="${s.dpi}"></label>
          <label class="field"><span>游戏内灵敏度</span><input id="sensitivity" type="number" step="0.01" min="0.01" max="100" value="${s.sensitivity}"></label>
          <label class="field"><span>视野范围 FOV（度）</span><input id="fov" type="number" min="40" max="170" value="${s.fov}"></label>
          <label class="field"><span>显示器比例</span>
            <select id="aspect">${ASPECTS.map((a) => `<option ${a === s.aspect ? 'selected' : ''}>${a}</option>`).join('')}</select>
          </label>
          <div class="card" style="background:var(--panel2)">
            <div class="kv-inline">
              <span>估算 cm/360：<b id="cm360">--</b></span>
              <span id="cmband" class="muted"></span>
            </div>
          </div>
        </div>
        <div class="card">
          <h2>测试参数</h2>
          <label class="field"><span>测试时长（秒）</span><input id="duration" type="number" min="10" max="120" value="${s.duration}"></label>
          <label class="field"><span>目标大小（像素直径）</span><input id="targetSize" type="number" min="20" max="120" value="${s.targetSize}"></label>
          <label class="field"><span>目标速度</span>
            <div class="seg" id="targetSpeed">
              ${[0.6, 1, 1.5, 2].map((v) => `<button data-v="${v}" class="${s.targetSpeed === v ? 'on' : ''}">${v}×</button>`).join('')}
            </div>
          </label>
          <label class="field"><span>测试难度</span>
            <div class="seg" id="difficulty">
              ${Object.entries(DIFFICULTIES).map(([k, d]) => `<button data-v="${k}" class="${s.difficulty === k ? 'on' : ''}">${d.label}</button>`).join('')}
            </div>
          </label>
        </div>
      </div>
      <div class="footer-actions">
        <button class="primary" id="save">保存设置</button>
        <button id="reset">恢复默认设置</button>
        <button class="danger" id="clear">清空全部本地数据</button>
        <span class="note">清空将删除设置、校准、记录和所有灵敏度方案。</span>
      </div>
    </div>
  `
  const $ = (id) => root.querySelector(id)
  let speed = s.targetSpeed
  let diff = s.difficulty

  function refreshCm() {
    const cur = normalizeSettings({
      dpi: $('#dpi').value,
      sensitivity: $('#sensitivity').value,
      fov: $('#fov').value,
      aspect: $('#aspect').value
    })
    const info = summarizeSensitivity(cur, state.calibration)
    $('#cm360').textContent = `${info.cmPer360}（${info.source}）`
    $('#cmband').textContent = info.band
  }
  ;['#dpi', '#sensitivity', '#fov', '#aspect'].forEach((id) => $(id).addEventListener('input', refreshCm))
  refreshCm()

  $('#targetSpeed').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      speed = Number(b.dataset.v)
      $('#targetSpeed').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
    })
  )
  $('#difficulty').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      diff = b.dataset.v
      $('#difficulty').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
    })
  )

  function collect() {
    return normalizeSettings({
      dpi: $('#dpi').value,
      sensitivity: $('#sensitivity').value,
      fov: $('#fov').value,
      aspect: $('#aspect').value,
      duration: $('#duration').value,
      targetSize: $('#targetSize').value,
      targetSpeed: speed,
      difficulty: diff
    })
  }

  function flash(html, ok = false) {
    $('#msg').innerHTML = `<div class="alert ${ok ? 'ok' : 'err'}">${html}</div>`
  }

  $('#save').addEventListener('click', () => {
    const next = collect()
    state.settings = next
    const res = saveSettings(next)
    flash(res.ok ? '设置已保存。' : res.error, res.ok)
  })
  $('#reset').addEventListener('click', () => {
    state.settings = { ...DEFAULT_SETTINGS }
    saveSettings(state.settings)
    renderSettings(root)
  })
  $('#clear').addEventListener('click', () => {
    if (!confirm('确定清空全部本地数据？此操作不可恢复。')) return
    clearAllData()
    state.settings = { ...DEFAULT_SETTINGS }
    state.records = []
    state.profiles = []
    state.calibration = null
    flash('全部本地数据已清空。', true)
    setTimeout(() => navigate('settings'), 800)
  })
}
