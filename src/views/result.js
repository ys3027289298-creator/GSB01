import { navigate } from '../main.js'
import { state } from '../state.js'
import { TEST_META } from '../engine/defaults.js'

const METRIC_LABELS = {
  hitRate: '命中率',
  onTargetRate: '跟踪在靶率',
  controlRate: '稳定控制率',
  avgReactionMs: '平均反应时间',
  bestReactionMs: '最快反应时间',
  avgTimeMs: '平均转向完成时间',
  avgError: '平均落点偏差',
  misses: '空白误点次数',
  timeouts: '漏点次数',
  hits: '命中次数',
  rounds: '转向轮数',
  overCount: '过度移动（过转）',
  underCount: '移动不足（欠转）',
  bias: '转向倾向',
  offTimeMs: '偏离目标时间',
  movementVariability: '鼠标移动抖动系数',
  avgOffset: '平均准星偏移',
  firstHalfOffset: '前半段平均偏移',
  secondHalfOffset: '后半段平均偏移',
  firstVsSecondDrift: '后半段相对漂移',
  controlMs: '受控时长',
  shots: '射击帧数',
  totalMousePx: '鼠标总移动距离'
}

const UNITS = {
  hitRate: '%', onTargetRate: '%', controlRate: '%',
  avgReactionMs: ' ms', bestReactionMs: ' ms', avgTimeMs: ' ms',
  avgError: ' px', misses: ' 次', timeouts: ' 次', hits: ' 次', rounds: ' 轮',
  overCount: ' 次', underCount: ' 次', offTimeMs: ' ms', avgOffset: ' px',
  firstHalfOffset: ' px', secondHalfOffset: ' px', controlMs: ' ms', totalMousePx: ' px'
}

const BIAS_TEXT = { over: '偏向过度移动（过转）', under: '偏向移动不足（欠转）', balanced: '过/欠转均衡' }

export function renderResult(root, params = {}) {
  const record = state.lastResult
  if (!record) {
    root.innerHTML = `<div class="page"><div class="alert">没有可显示的测试结果。</div>
      <button class="primary" onclick="location.hash='select'">去选择测试</button></div>`
    return
  }
  const meta = TEST_META[record.kind]
  const rows = Object.entries(record.metrics || {})
    .filter(([k]) => METRIC_LABELS[k])
    .map(([k, v]) => {
      const val = k === 'bias' ? (BIAS_TEXT[v] || v) : `${v}${UNITS[k] || ''}`
      return `<div class="metric-row"><span class="mk">${METRIC_LABELS[k]}</span><span class="mv">${val}</span></div>`
    })
    .join('')

  root.innerHTML = `
    <div class="page">
      <h1>${meta?.icon || ''} ${meta?.name || record.kind} · 测试结果</h1>
      <p class="sub">
        ${new Date(record.date).toLocaleString()}
        ${record.profileName ? ` · 方案 <b>${record.profileName}</b>` : ''}
      </p>
      <div class="grid cols-2">
        <div class="card" style="display:flex;flex-direction:column;align-items:center;gap:14px">
          <div class="score-ring" style="--s:${record.score}"><span>${record.score}</span></div>
          <div class="note">综合分数（基于本次真实测量数据）</div>
          <div class="kv-inline" style="justify-content:center">
            <span>DPI <b>${record.settings.dpi}</b></span>
            <span>灵敏度 <b>${record.settings.sensitivity}</b></span>
            <span>FOV <b>${record.settings.fov}</b></span>
            <span>cm/360 <b>${record.settings.cmPer360 ?? '—'}</b></span>
          </div>
        </div>
        <div class="card">
          <h2>详细数据</h2>
          ${rows}
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>针对本次数据的建议</h2>
        <ul class="advice">
          ${(record.advice || []).map((a) => `<li>${a}</li>`).join('')}
        </ul>
      </div>
      <div class="footer-actions">
        <button class="primary" id="retest">重新测试</button>
        <button id="settings">返回设置</button>
        <button id="records">查看全部记录</button>
        <button id="select">选择其它测试</button>
      </div>
    </div>
  `
  root.querySelector('#retest').addEventListener('click', () => navigate('test', { test: record.kind }))
  root.querySelector('#settings').addEventListener('click', () => navigate('settings'))
  root.querySelector('#records').addEventListener('click', () => navigate('records'))
  root.querySelector('#select').addEventListener('click', () => navigate('select'))
}
