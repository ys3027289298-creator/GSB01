export const DEFAULT_SETTINGS = Object.freeze({
  dpi: 800,
  sensitivity: 1.0,
  fov: 90,
  aspect: '16:9',
  duration: 30,
  targetSize: 'medium',
  targetSpeed: 'medium',
  difficulty: 'normal',
  cmPer360: null
});

export const SIZE_PX = { small: 44, medium: 64, large: 88 };
export const SPEED_MULT = { slow: 0.6, medium: 1, fast: 1.6 };
export const DIFFICULTY = {
  easy: { spawnGap: 1100, sizeMult: 1.25, speedMult: 0.75, missTolerance: 1 },
  normal: { spawnGap: 850, sizeMult: 1, speedMult: 1, missTolerance: 1 },
  hard: { spawnGap: 600, sizeMult: 0.8, speedMult: 1.35, missTolerance: 1 }
};
export const ASPECTS = ['16:9', '16:10', '4:3', '21:9'];

export function clampSettings(input = {}) {
  const num = (v, min, max, fallback) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    dpi: Math.round(num(input.dpi, 50, 64000, DEFAULT_SETTINGS.dpi)),
    sensitivity: num(input.sensitivity, 0.01, 100, DEFAULT_SETTINGS.sensitivity),
    fov: Math.round(num(input.fov, 40, 170, DEFAULT_SETTINGS.fov)),
    aspect: ASPECTS.includes(input.aspect) ? input.aspect : DEFAULT_SETTINGS.aspect,
    duration: Math.round(num(input.duration, 10, 120, DEFAULT_SETTINGS.duration)),
    targetSize: SIZE_PX[input.targetSize] ? input.targetSize : DEFAULT_SETTINGS.targetSize,
    targetSpeed: SPEED_MULT[input.targetSpeed] ? input.targetSpeed : DEFAULT_SETTINGS.targetSpeed,
    difficulty: DIFFICULTY[input.difficulty] ? input.difficulty : DEFAULT_SETTINGS.difficulty,
    cmPer360: Number.isFinite(Number(input.cmPer360)) && input.cmPer360 > 0
      ? Number(input.cmPer360)
      : null
  };
}
