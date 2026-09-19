import { DEFAULT_SETTINGS } from './defaults.js'

// 将设置解析为数值参数
export function normalizeSettings(raw = {}) {
  const s = { ...DEFAULT_SETTINGS, ...raw }
  const n = (v, d) => {
    const num = Number(v)
    return Number.isFinite(num) && num > 0 ? num : d
  }
  s.dpi = n(s.dpi, DEFAULT_SETTINGS.dpi)
  s.sensitivity = n(s.sensitivity, DEFAULT_SETTINGS.sensitivity)
  s.fov = n(s.fov, DEFAULT_SETTINGS.fov)
  s.duration = Math.round(n(s.duration, DEFAULT_SETTINGS.duration))
  s.targetSize = n(s.targetSize, DEFAULT_SETTINGS.targetSize)
  s.targetSpeed = n(s.targetSpeed, DEFAULT_SETTINGS.targetSpeed)
  if (!['16:9', '16:10', '21:9', '4:3', '5:4', '32:9'].includes(s.aspect)) {
    s.aspect = DEFAULT_SETTINGS.aspect
  }
  if (!['easy', 'normal', 'hard', 'expert'].includes(s.difficulty)) {
    s.difficulty = DEFAULT_SETTINGS.difficulty
  }
  return s
}

// 每像素对应的视角度数（经验模型，游戏内灵敏度为线性视角系数）
export function degreesPerPixel(dpi, sens) {
  if (!dpi || !sens) return 0
  // 每英寸像素 = dpi；常见 FPS 经验系数：360° ≈ (dpi*sens)/0.8 像素
  return (360 * 0.8 * sens) / dpi
}

// 转 360 度需要的鼠标物理距离（厘米）
export function cmPer360(dpi, sens) {
  const dpp = degreesPerPixel(dpi, sens)
  return dpp > 0 ? (360 / dpp / dpi) * 2.54 : 0
}

export function pixelsForAngle(angleDeg, dpi, sens) {
  const dpp = degreesPerPixel(dpi, sens)
  return dpp > 0 ? angleDeg / dpp : Infinity
}

// 校准：按目标角度转身，记录像素移动量与鼠标垫上的物理距离
export function buildCalibration({ targetAngle, movementPx, physicalCm, dpi, sens }) {
  if (!targetAngle || !movementPx) return null
  const degreesPerPx = targetAngle / movementPx
  const pxPer360 = 360 / degreesPerPx
  // 物理距离为可选（用户可能不填），不填则用 dpi 估算
  const cm360 = physicalCm
    ? physicalCm * (360 / targetAngle)
    : (pxPer360 / dpi) * 2.54
  return {
    targetAngle,
    movementPx: Math.round(movementPx),
    physicalCm: physicalCm || round((movementPx / dpi) * 2.54, 2),
    cmPer360: round(cm360, 2),
    degreesPerPx: round(degreesPerPx, 5),
    estimatedCmPer360: round(cmPer360(dpi, sens), 2),
    date: new Date().toISOString()
  }
}

// 由像素移动量 + 校准结果估算视角变化
export function angleFromPixels(movementPx, calibration, dpi, sens) {
  if (calibration?.degreesPerPx) {
    return movementPx * calibration.degreesPerPx
  }
  return movementPx * degreesPerPixel(dpi, sens)
}

export function summarizeSensitivity(settings, calibration) {
  const cm = calibration?.cmPer360 || cmPer360(settings.dpi, settings.sensitivity)
  const source = calibration?.cmPer360 ? '校准实测' : '设置估算'
  let band = '适中'
  if (cm < 18) band = '偏高（适合大幅度甩枪）'
  else if (cm > 40) band = '偏低（适合精细瞄准）'
  return { cmPer360: round(cm, 2), source, band }
}

export function round(v, digits = 1) {
  const f = 10 ** digits
  return Math.round(v * f) / f
}
