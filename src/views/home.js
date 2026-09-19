import { navigate } from '../main.js'
import { state } from '../state.js'
import { TEST_META } from '../engine/defaults.js'

export function renderHome(root) {
  const cal = state.calibration
  root.innerHTML = `
    <div class="page">
      <div class="hero">
        <div style="flex:1;min-width:0">
          <h1>在浏览器里真实测量你的<br/><em>FPS 射击灵敏度</em></h1>
          <p class="sub" style="margin-top:14px">
            通过鼠标校准、快速点击、甩枪转向、目标跟踪与压枪稳定五项互动测试，
            用真实操作数据评估当前灵敏度是否适合你，并给出基于测量结果的建议。
          </p>
          <div class="hero-actions">
            <button class="primary" data-go="select">▶ 开始测试</button>
            <button data-go="calibration">🖱 鼠标校准</button>
            <button class="ghost" data-go="settings">⚙ 设置</button>
          </div>
          <div class="kv-inline" style="margin-top:26px">
            <span>校准状态：<b>${cal ? `已校准 (cm/360 ≈ ${cal.cmPer360})` : '未校准（使用估算）'}</b></span>
            <span>历史记录：<b>${state.records.length} 次</b></span>
            <span>灵敏度方案：<b>${state.profiles.length} 组</b></span>
          </div>
        </div>
        <div class="hero-art">
          <svg class="crosshair-art" viewBox="0 0 280 280">
            <circle cx="140" cy="140" r="70" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1"/>
            <circle cx="140" cy="140" r="40" fill="none" stroke="rgba(255,122,61,.4)" stroke-width="1"/>
            <line x1="140" y1="96" x2="140" y2="128" stroke="#ff7a3d" stroke-width="2"/>
            <line x1="140" y1="152" x2="140" y2="184" stroke="#ff7a3d" stroke-width="2"/>
            <line x1="96" y1="140" x2="128" y2="140" stroke="#ff7a3d" stroke-width="2"/>
            <line x1="152" y1="140" x2="184" y2="140" stroke="#ff7a3d" stroke-width="2"/>
            <circle cx="140" cy="140" r="3" fill="#ff7a3d"/>
          </svg>
        </div>
      </div>

      <h2 style="margin:36px 0 14px">五项测试</h2>
      <div class="grid cols-3">
        ${Object.entries(TEST_META).map(([id, m]) => `
          <div class="card hoverable" data-test="${id}">
            <div style="font-size:28px">${m.icon}</div>
            <h2 style="margin:10px 0 6px">${m.name}</h2>
            <p class="note">${m.desc}</p>
          </div>
        `).join('')}
        <div class="card hoverable" data-test="compare" style="border-style:dashed">
          <div style="font-size:28px">📊</div>
          <h2 style="margin:10px 0 6px">灵敏度对比</h2>
          <p class="note">保存多组灵敏度，用完全相同的目标序列重复测试并逐项对比。</p>
        </div>
      </div>
    </div>
  `
  root.querySelectorAll('[data-go]').forEach((b) =>
    b.addEventListener('click', () => navigate(b.dataset.go))
  )
  root.querySelectorAll('[data-test]').forEach((b) => {
    const id = b.dataset.test
    b.addEventListener('click', () =>
      navigate(id === 'compare' ? 'compare' : 'test', id === 'compare' ? {} : { test: id })
    )
  })
}
