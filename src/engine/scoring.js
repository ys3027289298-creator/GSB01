import { round } from './sensitivity.js'

export function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

// 通用综合分（0-100），按各维度权重加权
export function composite(parts) {
  const total = parts.reduce((s, p) => s + p.value * p.weight, 0)
  const wsum = parts.reduce((s, p) => s + p.weight, 0)
  return Math.round((total / wsum) * 100)
}

// 反应时间得分：300ms 满分，900ms 0 分
export function reactionScore(avgMs) {
  if (!Number.isFinite(avgMs)) return 0
  return Math.round(clamp01((900 - avgMs) / 600) * 100)
}

export function rate(n, d) {
  return d > 0 ? round((n / d) * 100, 1) : 0
}

export function scoreClick(r) {
  const parts = [
    { value: r.hitRate / 100, weight: 0.45 },
    { value: reactionScore(r.avgReactionMs) / 100, weight: 0.4 },
    { value: clamp01(1 - r.misses / Math.max(1, r.totalSpawns)), weight: 0.15 }
  ]
  return composite(parts)
}

export function scoreFlick(r) {
  const parts = [
    { value: r.hitRate / 100, weight: 0.45 },
    { value: clamp01(1 - r.avgError / 12), weight: 0.3 },
    { value: reactionScore(r.avgTimeMs) / 100, weight: 0.25 }
  ]
  return composite(parts)
}

export function scoreTracking(r) {
  const parts = [
    { value: r.onTargetRate / 100, weight: 0.55 },
    { value: clamp01(1 - r.avgError / 100), weight: 0.25 },
    { value: clamp01(1 - r.movementVariability), weight: 0.2 }
  ]
  return composite(parts)
}

export function scoreRecoil(r) {
  const parts = [
    { value: r.controlRate / 100, weight: 0.5 },
    { value: clamp01(1 - r.avgOffset / 120), weight: 0.25 },
    { value: clamp01(1 - r.firstVsSecondDrift), weight: 0.25 }
  ]
  return composite(parts)
}

// 依据真实测量数据生成建议（多条，非固定文案）
export function buildAdvice(type, r, sensitivityInfo) {
  const tips = []
  if (type === 'click') {
    if (r.hitRate >= 85 && r.avgReactionMs <= 420) tips.push('命中率与反应都很好，当前灵敏度适合快速点射。')
    if (r.hitRate < 60) tips.push(`命中率仅 ${r.hitRate}%，先放慢节奏保证点击落在目标中心。`)
    if (r.avgReactionMs > 650) tips.push(`平均反应 ${Math.round(r.avgReactionMs)}ms 偏慢，尝试预判目标刷新区域。`)
    if (r.misses > r.hits) tips.push(`空白误点 ${r.misses} 次偏多，移动到位后再点击，减少“抢点”。`)
  }
  if (type === 'flick') {
    if (r.overCount > r.underCount * 1.3 && r.overCount >= 3) tips.push(`过转 ${r.overCount} 次、欠转 ${r.underCount} 次，整体偏向过度移动，建议适当降低灵敏度（cm/360 增大）。`)
    else if (r.underCount > r.overCount * 1.3 && r.underCount >= 3) tips.push(`欠转 ${r.underCount} 次、过转 ${r.overCount} 次，整体偏向移动不足，建议适当提高灵敏度（cm/360 减小）。`)
    else tips.push('过转与欠转次数接近，甩枪幅度控制均衡。')
    if (r.hitRate < 55) tips.push(`转向命中率 ${r.hitRate}%，练习先转到大方向再做微调。`)
  }
  if (type === 'tracking') {
    if (r.onTargetRate < 50) tips.push(`跟踪在靶率仅 ${r.onTargetRate}%，尝试降低目标速度或灵敏度以增加平滑度。`)
    else if (r.onTargetRate >= 80) tips.push(`在靶率 ${r.onTargetRate}%，跟踪稳定，可尝试更高难度。`)
    if (r.movementVariability > 0.6) tips.push('鼠标移动抖动较大，建议用手臂发力、降低握持紧张度。')
  }
  if (type === 'recoil') {
    if (r.firstVsSecondDrift > 0.15) tips.push(`后半段比前半段偏移高 ${(r.firstVsSecondDrift * 100).toFixed(0)}%，持续压枪控制力衰减，注意耐力与下拉幅度。`)
    else tips.push('前后半段偏移接近，持续压枪稳定性良好。')
    if (r.controlRate < 60) tips.push(`控制时间占比 ${r.controlRate}% 偏低，开火时需更早、更均匀地下拉修正。`)
  }
  if (sensitivityInfo?.cmPer360) {
    if (sensitivityInfo.cmPer360 < 18) tips.push(`当前 cm/360 ≈ ${sensitivityInfo.cmPer360}（${sensitivityInfo.band}），精细瞄准可能发飘。`)
    if (sensitivityInfo.cmPer360 > 40) tips.push(`当前 cm/360 ≈ ${sensitivityInfo.cmPer360}（${sensitivityInfo.band}），大幅转向可能需要多次抬鼠标。`)
  }
  if (tips.length === 0) tips.push('各项数据处于正常区间，当前设置比较稳定。')
  return tips
}
