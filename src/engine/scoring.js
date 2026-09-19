import { mean } from './geometry.js';

export function buildSummary(stats) {
  const summary = { ...stats, score: 0, grade: '', advice: [] };
  let score = 0;
  switch (stats.type) {
    case 'click': {
      const acc = stats.attempts ? stats.hits / stats.attempts : 0;
      const targetHitRate = stats.spawned ? stats.hits / stats.spawned : 0;
      score = Math.round(acc * 40 + targetHitRate * 30 + reactionScore(stats.avgReactionMs) * 30);
      if (acc < 0.6) summary.advice.push('点击准确率偏低，空白处失误偏多，建议先放慢节奏确认目标后再开枪。');
      if (stats.avgReactionMs > 520) summary.advice.push('平均反应偏慢，可以在设置中略调高灵敏度以缩短拉枪时间。');
      if (stats.fastestReactionMs < 260 && acc < 0.75) summary.advice.push('手速很快但失误偏多，当前灵敏度可能偏高，建议略调低并追求稳定命中。');
      if (targetHitRate < 0.6) summary.advice.push('漏点较多，部分目标未能在消失前处理，建议练习预瞄与视线快速转移。');
      if (acc >= 0.85 && stats.avgReactionMs <= 400) summary.advice.push('命中率与反应都很出色，当前设置比较稳定，适合继续保持。');
      break;
    }
    case 'turn': {
      const hitRate = stats.targets ? stats.hits / stats.targets : 0;
      score = Math.round(hitRate * 45 + (1 - stats.avgErrorRatio) * 35 + timeScore(stats.avgCompletionMs) * 20);
      if (stats.overCount > stats.underCount * 1.4 && stats.overCount >= 3) summary.advice.push('转向明显偏向过度移动（甩过头），建议降低灵敏度或减小手腕发力幅度。');
      else if (stats.underCount > stats.overCount * 1.4 && stats.underCount >= 3) summary.advice.push('转向明显偏向移动不足（转不到位），建议提高灵敏度或增大手臂拉动距离。');
      else summary.advice.push('过头与不到位次数接近，转向控制较均衡，继续保持。');
      if (stats.avgCompletionMs > 1400) summary.advice.push('平均完成时间偏长，转向速度还有提升空间。');
      if (hitRate >= 0.8 && Math.abs(stats.avgErrorRatio) <= 0.1) summary.advice.push('命中率高且角度误差小，当前灵敏度对转向很合适。');
      break;
    }
    case 'tracking': {
      score = Math.round(stats.onTargetRate * 60 + (1 - Math.min(1, stats.stabilityJitter / 60)) * 25 + (1 - Math.min(1, stats.avgOffsetPx / 200)) * 15);
      if (stats.onTargetRate < 0.55) summary.advice.push('跟枪停留在目标上的时间不足，建议尝试提高灵敏度以跟上变向，或降低目标速度练习。');
      if (stats.stabilityJitter > 45) summary.advice.push('准星抖动明显，鼠标移动不稳定，建议降低灵敏度并练习平滑的手臂拖动。');
      if (stats.onTargetRate >= 0.75 && stats.stabilityJitter <= 30) summary.advice.push('跟踪成功率高且移动平滑，当前灵敏度适合跟枪。');
      else if (stats.onTargetRate >= 0.55 && stats.stabilityJitter <= 45) summary.advice.push('跟踪表现中等偏稳，可尝试小幅调整灵敏度寻找更顺手的位置。');
      break;
    }
    case 'recoil': {
      const control = 1 - Math.min(1, stats.avgOffsetPx / 160);
      score = Math.round(control * 45 + (1 - Math.min(1, stats.maxOffsetPx / 220)) * 20 + consistencyScore(stats) * 20 + (stats.controlStreakMs / Math.max(1, stats.durationMs)) * 15);
      const drift = stats.secondHalfAvgOffset - stats.firstHalfAvgOffset;
      if (drift > 18) summary.advice.push('后半段偏移明显大于前半段，连续射击时控制力下降，注意持续压枪节奏。');
      else if (drift < -10) summary.advice.push('后半段反而更稳，属于预热型表现，可以在交火前先做几次预压。');
      else summary.advice.push('前后半段表现接近，连射稳定性较好。');
      if (stats.avgOffsetPx > 70) summary.advice.push('整体偏移偏大，压枪控制不稳定，建议降低垂直灵敏度或加大下拉幅度。');
      if (score >= 75) summary.advice.push('压枪整体稳定，当前灵敏度下的连发控制值得保持。');
      break;
    }
    case 'calibration': {
      score = Math.round((1 - Math.min(1, Math.abs(stats.errorRatio))) * 100);
      if (Math.abs(stats.errorRatio) > 0.12) summary.advice.push('校准误差较大，请在鼠标垫上沿直线匀速移动后重新校准。');
      else summary.advice.push('校准结果可靠，已用于后续测试的灵敏度换算。');
      break;
    }
    default:
      score = 0;
  }
  summary.score = Math.max(0, Math.min(100, Math.round(score)));
  summary.grade = summary.score >= 85 ? '优秀' : summary.score >= 70 ? '良好' : summary.score >= 55 ? '一般' : '需练习';
  if (!summary.advice.length) summary.advice.push('数据样本较少，建议多测几次后再调整灵敏度。');
  return summary;
}

function reactionScore(ms) {
  if (!ms) return 0;
  return Math.max(0, Math.min(1, (650 - ms) / 400));
}
function timeScore(ms) {
  if (!ms) return 0;
  return Math.max(0, Math.min(1, (2000 - ms) / 1500));
}
function consistencyScore(stats) {
  const diff = Math.abs(stats.secondHalfAvgOffset - stats.firstHalfAvgOffset);
  return Math.max(0, 1 - Math.min(1, diff / 80));
}

export function compareProfiles(runs) {
  const groups = new Map();
  for (const run of runs) {
    const key = run.profileName || '默认';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run.summary);
  }
  const result = [];
  for (const [name, summaries] of groups) {
    const agg = {
      profileName: name,
      runs: summaries.length,
      score: avg(summaries.map((s) => s.score))
    };
    const types = new Set(summaries.map((s) => s.type));
    if (types.has('click')) {
      const cs = summaries.filter((s) => s.type === 'click');
      agg.accuracy = avg(cs.map((s) => s.attempts ? s.hits / s.attempts : 0));
      agg.reactionMs = avg(cs.map((s) => s.avgReactionMs));
      agg.misses = avg(cs.map((s) => s.misses));
    }
    if (types.has('turn')) {
      const ts = summaries.filter((s) => s.type === 'turn');
      agg.turnAccuracy = avg(ts.map((s) => s.targets ? s.hits / s.targets : 0));
      agg.turnMs = avg(ts.map((s) => s.avgCompletionMs));
      agg.overUnder = avg(ts.map((s) => s.overCount - s.underCount));
    }
    if (types.has('tracking')) {
      const ks = summaries.filter((s) => s.type === 'tracking');
      agg.trackingRate = avg(ks.map((s) => s.onTargetRate));
      agg.jitter = avg(ks.map((s) => s.stabilityJitter));
    }
    if (types.has('recoil')) {
      const rs = summaries.filter((s) => s.type === 'recoil');
      agg.recoilOffset = avg(rs.map((s) => s.avgOffsetPx));
      agg.recoilStreak = avg(rs.map((s) => s.controlStreakMs));
    }
    result.push(agg);
  }
  return result.sort((a, b) => b.score - a.score);
}

function avg(arr) {
  const nums = arr.filter((n) => Number.isFinite(n));
  return nums.length ? Math.round(mean(nums) * 100) / 100 : 0;
}
