export const DEFAULT_SETTINGS = {
  dpi: 800,
  sensitivity: 2.0,
  fov: 90,
  aspect: '16:9',
  duration: 30,
  targetSize: 48,
  targetSpeed: 1,
  difficulty: 'normal'
}

export const ASPECTS = ['16:9', '16:10', '21:9', '4:3', '5:4', '32:9']

export const DIFFICULTIES = {
  easy: { label: '简单', timeoutMul: 1.35, speedMul: 0.7, flickTol: 1.3 },
  normal: { label: '普通', timeoutMul: 1.0, speedMul: 1.0, flickTol: 1.0 },
  hard: { label: '困难', timeoutMul: 0.8, speedMul: 1.35, flickTol: 0.85 },
  expert: { label: '专家', timeoutMul: 0.65, speedMul: 1.7, flickTol: 0.7 }
}

export const TEST_META = {
  click: { name: '快速点击', icon: '🎯', desc: '目标随机出现，尽快点击，记录反应与失误。' },
  flick: { name: '快速转向', icon: '🔄', desc: '向不同方向甩枪转向并命中，判断过转 / 欠转。' },
  tracking: { name: '目标跟踪', icon: '🌀', desc: '持续跟随变速移动目标，评估跟踪稳定性。' },
  recoil: { name: '压枪稳定', icon: '🔫', desc: '按住开火并压住后坐力，对比前后半段控制。' }
}

export const STORAGE_KEYS = {
  settings: 'fpslab.settings.v1',
  records: 'fpslab.records.v1',
  profiles: 'fpslab.profiles.v1',
  calibration: 'fpslab.calibration.v1'
}
