import { navigate } from '../main.js'
import { state } from '../state.js'
import { deleteRecord, clearRecords } from '../engine/storage.js'
import { TEST_META } from '../engine/defaults.js'
import { recordsToJSON, recordsToCSV, downloadText } from '../engine/exporters.js'

function scoreTag(score) {
  const cls = score >= 80 ? 'good' : score >= 55 ? 'warn' : 'bad'
  return `<span class="tag ${cls}">${score}</span>`
}

export function renderRecords(root) {
  const records = state.records
  root.innerHTML = `
    <div class="page">
      <h1>测试记录</h1>
      <p class="sub">最近 ${records.length} 条记录保存在本地浏览器中。</p>
      <div class="controls-bar">
        <button id="exportJson" ${records.length ? '' : 'disabled'}>导出 JSON</button>
        <button id="exportCsv" ${records.length ? '' : 'disabled'}>导出 CSV</button>
        <button class="danger" id="clearAll" ${records.length ? '' : 'disabled'}>清空全部记录</button>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        ${records.length === 0
          ? `<div style="padding:50px;text-align:center" class="muted">暂无测试记录，先去完成一次测试吧。</div>`
          : `<table>
              <thead><tr><th>时间</th><th>类型</th><th>方案</th><th>综合分</th><th>关键指标</th><th></th></tr></thead>
              <tbody>
                ${records.map((r) => `
                  <tr>
                    <td class="mono">${new Date(r.date).toLocaleString()}</td>
                    <td>${TEST_META[r.kind]?.icon || ''} ${TEST_META[r.kind]?.name || r.kind}</td>
                    <td>${r.profileName ? `<span class="tag">${r.profileName}</span>` : '<span class="muted">默认</span>'}</td>
                    <td>${scoreTag(r.score)}</td>
                    <td class="muted">${brief(r)}</td>
                    <td style="white-space:nowrap">
                      <button class="small" data-view="${r.id}">查看</button>
                      <button class="small danger" data-del="${r.id}">删除</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`}
      </div>
    </div>
  `
  function brief(r) {
    const m = r.metrics || {}
    if (r.kind === 'click') return `命中 ${m.hitRate}% · 反应 ${m.avgReactionMs}ms · 失误 ${m.misses}`
    if (r.kind === 'flick') return `命中 ${m.hitRate}% · 过转 ${m.overCount} / 欠转 ${m.underCount}`
    if (r.kind === 'tracking') return `在靶 ${m.onTargetRate}% · 偏离 ${m.offTimeMs}ms`
    if (r.kind === 'recoil') return `控制 ${m.controlRate}% · 前 ${m.firstHalfOffset}px / 后 ${m.secondHalfOffset}px`
    return ''
  }

  root.querySelector('#exportJson').addEventListener('click', () => {
    downloadText(`fps-lab-records-${Date.now()}.json`, recordsToJSON(records))
  })
  root.querySelector('#exportCsv').addEventListener('click', () => {
    downloadText(`fps-lab-records-${Date.now()}.csv`, recordsToCSV(records), 'text/csv')
  })
  root.querySelector('#clearAll').addEventListener('click', () => {
    if (!confirm('确定清空全部测试记录？')) return
    clearRecords()
    state.records = []
    renderRecords(root)
  })
  root.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => {
      if (!confirm('删除这条记录？')) return
      const res = deleteRecord(b.dataset.del)
      state.records = res.records
      renderRecords(root)
    })
  )
  root.querySelectorAll('[data-view]').forEach((b) =>
    b.addEventListener('click', () => {
      state.lastResult = records.find((r) => r.id === b.dataset.view)
      navigate('result', { readonly: true })
    })
  )
}
