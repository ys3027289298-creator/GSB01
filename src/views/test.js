import { navigate } from '../main.js'
import { state } from '../state.js'
import { TEST_META } from '../engine/defaults.js'
import { randomSeed } from '../engine/rng.js'
import { mountArena } from './arena.js'

export function renderTest(root, params = {}) {
  const kind = params.test || params.kind
  const meta = TEST_META[kind]
  if (!meta) {
    root.innerHTML = `<div class="page"><div class="alert err">未知测试类型。</div>
      <button class="primary" onclick="location.hash='select'">返回选择</button></div>`
    return
  }

  const settings = params.settings || state.settings
  const seed = params.seed ?? randomSeed()

  root.innerHTML = `
    <div class="page">
      <div class="row" style="justify-content:space-between">
        <h1 style="margin:0">${meta.icon} ${meta.name}${params.profileName ? ` · ${params.profileName}` : ''}</h1>
        <span class="pill mono">规则种子 #${seed}</span>
      </div>
      <p class="sub">${meta.desc} 相同种子会生成相同的目标规则，可用于灵敏度对比。</p>
      <div id="arenaHost"></div>
    </div>
  `

  const host = root.querySelector('#arenaHost')
  mountArena(host, {
    kind,
    settings,
    seed,
    profileName: params.profileName,
    settingsOverride: params.settings,
    onDone(record, goNow) {
      if (goNow && record === null && state.lastResult) {
        navigate('result')
        return
      }
      if (record && (goNow || params.autoResult)) {
        navigate('result')
      } else if (record) {
        state.lastResult = record
      }
    },
    onQuit() {
      if (params.compareReturn) navigate('compare')
      else navigate('select')
    }
  })

  // 完成后覆盖 overlay 按钮行为：点击“查看结果”跳转
  const obs = new MutationObserver(() => {
    const btn = host.querySelector('#arOvBtn')
    if (btn && btn.textContent === '查看结果' && !btn.dataset.wired) {
      btn.dataset.wired = '1'
      btn.addEventListener('click', () => {
        if (params.compareReturn) {
          navigate('compare')
        } else {
          navigate('result')
        }
      })
    }
  })
  obs.observe(host, { childList: true, subtree: true, characterData: true })
}
