import { describe, it, expect } from 'vitest'
import { makeRng } from '../src/engine/rng.js'
import {
  normalizeSettings,
  degreesPerPixel,
  cmPer360,
  buildCalibration,
  angleFromPixels
} from '../src/engine/sensitivity.js'
import { DEFAULT_SETTINGS } from '../src/engine/defaults.js'

describe('设置与灵敏度', () => {
  it('非法设置回退默认值', () => {
    const s = normalizeSettings({ dpi: -5, sensitivity: 'abc', fov: 0, aspect: 'xx' })
    expect(s.dpi).toBe(DEFAULT_SETTINGS.dpi)
    expect(s.sensitivity).toBe(DEFAULT_SETTINGS.sensitivity)
    expect(s.aspect).toBe('16:9')
  })

  it('灵敏度越高每像素角度越大、cm/360 越小', () => {
    const low = degreesPerPixel(800, 1)
    const high = degreesPerPixel(800, 3)
    expect(high).toBeGreaterThan(low)
    expect(cmPer360(800, 3)).toBeLessThan(cmPer360(800, 1))
  })

  it('校准结果可用于像素到角度换算', () => {
    const cal = buildCalibration({
      targetAngle: 360,
      movementPx: 9000,
      physicalCm: 25,
      dpi: 800,
      sens: 2
    })
    expect(cal.cmPer360).toBe(25)
    const angle = angleFromPixels(2250, cal, 800, 2)
    expect(angle).toBeCloseTo(90, 1)
  })
})

describe('可复现随机数', () => {
  it('相同种子生成相同序列', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    expect(Array.from({ length: 10 }, () => a.next())).toEqual(
      Array.from({ length: 10 }, () => b.next())
    )
  })
})
