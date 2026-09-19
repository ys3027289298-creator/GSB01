import { navigate } from '../main.js'
import { state, sensitivityInfo } from '../state.js'
import { loadProfiles, saveProfiles } from '../engine/storage.js'
import { normalizeSettings } from '../engine/sensitivity.js'
import { TEST_META } from '../engine/defaults.js'
import { randomSeed } from '../engine/rng.js'

function uid() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function renderCompare(root) {
  let profiles = loadProfiles().profiles
  let kind = 'click'
  let seed = randomSeed()
  let runResults = {} // profileId -> record

  root.innerHTML = `
    <div class="page">
      <h1>📊 灵敏度对比</h1>
      <p class="sub">保存多组灵敏度，使用<b>相同测试、相同时长、相同规则种子</b>逐项对比命中、反应、转向与跟踪。</p>

      <div class="card">
        <h2>对比配置</h2>
        <div class="grid cols-3">
          <label class="field"><span>测试类型</span>
            <select id="cmpKind">
              ${Object.entries(TEST_META).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('')}
            </select>
          </label>
          <label class="field"><span>测试时长（秒，对比时所有方案相同）</span>
            <input id="cmpDuration" type="number" min="10" max="120" value="20">
          </label>
          <label class="field"><span>规则种子（相同种子目标序列一致）</span>
            <div class="row">
              <input id="cmpSeed" type="number" value="${seed}" style="flex:1">
              <button id="cmpNewSeed" class="small">换一个</button>
            </div>
          </label>
        </div>
      </div>

      <h2 style="margin-top:22px">灵敏度方案</h2>
      <div id="profileList" class="grid cols-3"></div>
      <div class="footer-actions">
        <button id="addProfile" class="primary">＋ 保存当前设置为新方案</button>
        <button id="viewResults" class="ghost">查看测试记录</button>
      </div>

      <div id="cmpResult" style="margin-top:24px"></div>
    </div>
  `

  const listEl = root.querySelector('#profileList')
  const resultEl = root.querySelector('#cmpResult')

  function persist() {
    saveProfiles(profiles)
    state.profiles = profiles
  }

  function profileCard(p) {
    const done = runResults[p.id]
    return `
      <div class="card" data-pid="${p.id}">
        <div class="row" style="justify-content:space-between">
          <input class="pname" value="${p.name}" style="font-weight:600;border:none;background:transparent;color:var(--text);font-size:15px;max-width:130px">
          <button class="small danger pdel">删除</button>
        </div>
        <div class="metric-row"><span class="mk">DPI</span><span class="mv"><input class="pdpi" type="number" value="${p.dpi}" style="width:90px"></span></div>
        <div class="metric-row"><span class="mk">灵敏度</span><span class="mv"><input class="psens" type="number" step="0.01" value="${p.sensitivity}" style="width:90px"></span></div>
        <div class="metric-row"><span class="mk">FOV</span><span class="mv"><input class="pfov" type="number" value="${p.fov}" style="width:90px"></span></div>
        <div class="note">估算 cm/360 ≈ <b>${p.cmPer360}</b></div>
        <div class="row" style="margin-top:12px">
          <button class="primary small prun">${done ? '重新测试' : '用此方案测试'}</button>
          ${done ? `<span class="tag good">已测 ${done.score} 分</span>` : '<span class="tag">未测试</span>'}
        </div>
      </div>`
  }

  function renderProfiles() {
    if (profiles.length === 0) {
      listEl.innerHTML = `<div class="card muted" style="grid-column:1/-1">还没有方案，先在下方保存当前设置，或在设置页调整后再回来。</div>`
      return
    }
    listEl.innerHTML = profiles.map(profileCard).join('')
    listEl.querySelectorAll('[data-pid]').forEach((card) => {
      const pid = card.dataset.pid
      const p = profiles.find((x) => x.id === pid)
      const read = () => ({
        name: card.querySelector('.pname').value,
        dpi: Number(card.querySelector('.pdpi').value),
        sensitivity: Number(card.querySelector('.psens').value),
        fov: Number(card.querySelector('.pfov').value)
      })
      card.querySelector('.pdel').addEventListener('click', () => {
        if (!confirm(`删除方案「${p.name}」？`)) return
        profiles = profiles.filter((x) => x.id !== pid)
        delete runResults[pid]
        persist()
        renderProfiles()
        renderComparison()
      })
      card.querySelector('.prun').addEventListener('click', () => {
        Object.assign(p, read())
        const duration = Math.max(10, Number(root.querySelector('#cmpDuration').value) || 20)
        kind = root.querySelector('#cmpKind').value
        seed = Number(root.querySelector('#cmpSeed').value) || randomSeed()
        persist()
        const settings = normalizeSettings({ ...state.settings, ...p, duration })
        state._compare = {
          profiles, seed, kind, duration,
          results: runResults,
          waitingProfile: p.id
        }
        navigate('test', {
          test: kind,
          seed,
          settings,
          profileName: p.name,
          compareReturn: true,
          autoResult: false
        })
      })
    })
  }

  function afterReturn(pid) {
    const saved = state._compare
    if (!saved) return
    runResults = saved.results || {}
    root.querySelector('#cmpKind').value = saved.kind
    root.querySelector('#cmpSeed').value = saved.seed
    root.querySelector('#cmpDuration').value = saved.duration || 20
    if (saved.waitingProfile && state.lastResult && !saved._consumed) {
      runResults[saved.waitingProfile] = state.lastResult
      saved._consumed = true
      persist()
    }
    renderProfiles()
    renderComparison()
  }

  const METRIC_GROUPS = [
    { key: 'hitRate', label: '命中率', only: ['click', 'flick'] },
    { key: 'onTargetRate', label: '跟踪在靶率', only: ['tracking'] },
    { key: 'controlRate', label: '压枪控制率', only: ['recoil'] },
    { key: 'avgReactionMs', label: '平均反应', only: ['click'], lowerBetter: true },
    { key: 'avgTimeMs', label: '转向用时', only: ['flick'], lowerBetter: true },
    { key: 'overCount', label: '过转次数', only: ['flick'], lowerBetter: true },
    { key: 'underCount', label: '欠转次数', only: ['flick'], lowerBetter: true },
    { key: 'offTimeMs', label: '偏离时间', only: ['tracking'], lowerBetter: true },
    { key: 'avgError', label: '平均偏差', only: ['click', 'flick'], lowerBetter: true },
    { key: 'movementVariability', label: '移动抖动', only: ['tracking'], lowerBetter: true },
    { key: 'firstVsSecondDrift', label: '后半段漂移', only: ['recoil'], lowerBetter: true },
    { key: 'avgOffset', label: '压枪平均偏移', only: ['recoil'], lowerBetter: true },
    { key: 'totalMousePx', label: '鼠标移动量', only: ['click', 'flick', 'tracking', 'recoil'] }
  ]

  function renderComparison() {
    const tested = Object.values(runResults).filter(Boolean)
    if (tested.length < 1) {
      resultEl.innerHTML = ''
      return
    }
    const groups = METRIC_GROUPS.filter((m) => !m.only || m.only.includes(kind))
    const header = `<tr><th>指标</th>${tested.map((r) => `<th>${r.profileName || '方案'}</th>`).join('')}<th>差异解读</th></tr>`
    const rows = groups.map((m) => {
      const vals = tested.map((r) => r.metrics?.[m.key])
      if (vals.every((v) => v === undefined)) return ''
      const nums = vals.filter((v) => typeof v === 'number')
      let bestIdx = 0
      if (nums.length) {
        bestIdx = m.lowerBetter ? vals.indexOf(Math.min(...nums)) : vals.indexOf(Math.max(...nums))
      }
      const cells = vals.map((v, i) =>
        `<td class="${i === bestIdx && v !== undefined ? '' : ''}"><b style="color:${i === bestIdx && v !== undefined ? 'var(--good)' : 'var(--text)'}">${v ?? '—'}${typeof v === 'number' && /Rate|Rate/.test(m.key) ? '%' : ''}</b></td>`
      ).join('')
      let comment = '—'
      if (nums.length >= 2) {
        const max = Math.max(...nums)
        const min = Math.min(...nums)
        const diff = max - min
        comment = diff === 0 ? '各方案基本相同' : `极差 ${Math.round(diff * 100) / 100}，${m.lowerBetter ? '更低' : '更高'}者更优`
      }
      return `<tr><td class="muted">${m.label}</td>${cells}<td class="note">${comment}</td></tr>`
    }).join('')

    resultEl.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden">
        <table>
          <thead>${header}</thead>
          <tbody>
            <tr><td class="muted">综合分</td>${tested.map((r) => `<td><b style="color:var(--accent);font-size:17px">${r.score}</b></td>`).join('')}<td></td></tr>
            ${rows}
          </tbody>
        </table>
      </div>
      <div class="card" style="margin-top:12px" id="cmpAdvice"></div>
    `
    // 综合文字结论
    if (tested.length >= 2) {
      const best = tested.reduce((a, b) => (b.score > a.score ? b : a))
      const worst = tested.reduce((a, b) => (b.score < a.score ? b : a))
      const lines = [`综合分最高的是「${best.profileName}」（${best.score} 分）。`]
      groups.forEach((m) => {
        const vals = tested.map((r) => r.metrics?.[m.key]).filter((v) => typeof v === 'number')
        if (vals.length < 2) return
        const hi = tested[vals.indexOf(Math.max(...vals))]
        const lo = tested[vals.indexOf(Math.min(...vals))]
        if (hi !== lo) {
          lines.push(m.lowerBetter
            ? `${m.label}：「${lo.profileName}」表现更好（${Math.min(...vals)}），「${hi.profileName}」为 ${Math.max(...vals)}。`
            : `${m.label}：「${hi.profileName}」表现更好（${Math.max(...vals)}），「${lo.profileName}」为 ${Math.min(...vals)}。`)
        }
      })
      root.querySelector('#cmpAdvice').innerHTML =
        `<h2>差异解读</h2><ul class="advice">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`
    }
  }

  root.querySelector('#addProfile').addEventListener('click', () => {
    const info = sensitivityInfo()
    profiles.push({
      id: uid(),
      name: `方案 ${profiles.length + 1}`,
      dpi: state.settings.dpi,
      sensitivity: state.settings.sensitivity,
      fov: state.settings.fov,
      cmPer360: info.cmPer360
    })
    persist()
    renderProfiles()
  })
  root.querySelector('#cmpNewSeed').addEventListener('click', () => {
    seed = randomSeed()
    root.querySelector('#cmpSeed').value = seed
  })
  root.querySelector('#viewResults').addEventListener('click', () => navigate('records'))

  renderProfiles()
  if (state._compare) afterReturn(Object.keys(state._compare.results || {})[0])
}
