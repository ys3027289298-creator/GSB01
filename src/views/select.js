import { navigate } from '../main.js'
import { state } from '../state.js'
import { TEST_META } from '../engine/defaults.js'

export function renderSelect(root) {
  root.innerHTML = `
    <div class="page">
      <h1>选择测试</h1>
      <p class="sub">
        时长 ${state.settings.duration} 秒 · 目标 ${state.settings.targetSize}px ·
        速度 ${state.settings.targetSpeed}× · 可在
        <a href="#/settings" style="color:var(--accent2)">设置页</a>调整。
      </p>
      <div class="grid cols-2">
        ${Object.entries(TEST_META).map(([id, m]) => `
          <div class="card hoverable" data-test="${id}">
            <div style="display:flex;align-items:center;gap:14px">
              <div style="font-size:34px">${m.icon}</div>
              <div>
                <h2 style="margin:0">${m.name}</h2>
                <p class="note" style="margin:6px 0 0">${m.desc}</p>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="footer-actions">
        <button class="ghost" data-go="calibration">先做鼠标校准</button>
        <button class="ghost" data-go="compare">进入灵敏度对比</button>
      </div>
    </div>
  `
  root.querySelectorAll('[data-test]').forEach((b) =>
    b.addEventListener('click', () => navigate('test', { test: b.dataset.test }))
  )
  root.querySelectorAll('[data-go]').forEach((b) =>
    b.addEventListener('click', () => navigate(b.dataset.go))
  )
}
