import { TEST_META } from './defaults.js'

export function recordsToJSON(records) {
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), app: 'fps-sensitivity-lab', records },
    null,
    2
  )
}

const COLUMNS = [
  ['id', 'ID'],
  ['date', '测试时间'],
  ['kind', '测试类型'],
  ['score', '综合分'],
  ['hitRate', '命中率%'],
  ['avgReactionMs', '平均反应ms'],
  ['bestReactionMs', '最快反应ms'],
  ['avgTimeMs', '平均完成ms'],
  ['overCount', '过转'],
  ['underCount', '欠转'],
  ['bias', '转向倾向'],
  ['onTargetRate', '在靶率%'],
  ['avgError', '平均偏差px'],
  ['offTimeMs', '偏离时间ms'],
  ['controlRate', '控制率%'],
  ['avgOffset', '平均偏移px'],
  ['firstHalfOffset', '前半段偏移'],
  ['secondHalfOffset', '后半段偏移'],
  ['misses', '失误'],
  ['timeouts', '漏点'],
  ['totalMousePx', '鼠标移动px'],
  ['cmPer360', 'cm/360']
]

function csvEscape(v) {
  if (v === null || v === undefined) return ''
  const str = String(v)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function recordsToCSV(records) {
  const header = COLUMNS.map((c) => c[1]).join(',')
  const lines = records.map((r) =>
    COLUMNS.map(([key]) => {
      if (key === 'kind') return csvEscape(TEST_META[r.kind]?.name || r.kind)
      if (key === 'date') return csvEscape(new Date(r.date).toLocaleString())
      if (key === 'cmPer360') return csvEscape(r.settings?.cmPer360 ?? r.sensitivityInfo?.cmPer360 ?? '')
      return csvEscape(r.metrics?.[key] ?? r[key] ?? '')
    }).join(',')
  )
  return '﻿' + [header, ...lines].join('\n')
}

export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
