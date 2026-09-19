import { describe, it, expect } from 'vitest'
import { createClickTest } from '../src/engine/tests/clickTest.js'
import { createFlickTest } from '../src/engine/tests/flickTest.js'
import { createTrackingTest } from '../src/engine/tests/trackingTest.js'
import { createRecoilTest } from '../src/engine/tests/recoilTest.js'
import { normalizeSettings } from '../src/engine/sensitivity.js'
import { scoreClick, scoreFlick, scoreTracking, scoreRecoil, buildAdvice } from '../src/engine/scoring.js'

const settings = normalizeSettings({ duration: 5, targetSize: 48, targetSpeed: 1 })

function runFrames(test, ms, each, step = 16) {
  for (let t = 0; t < ms; t += step) {
    test.update(step)
    if (each) each(test, t)
  }
}

describe('快速点击', () => {
  it('命中目标计入反应时间，点空白计失误，超时计漏点', () => {
    const test = createClickTest(settings, 7)
    test.start()
    let reacted = false
    runFrames(test, 5000, (t) => {
      const target = test.getTarget()
      if (target && !reacted) {
        expect(test.click(target.x, target.y).type).toBe('hit')
        reacted = true
      } else if (!target) {
        test.click(10, 10) // 空白误点
      }
    })
    const r = test.result()
    expect(r.hits).toBeGreaterThan(0)
    expect(r.avgReactionMs).toBeGreaterThan(0)
    expect(r.bestReactionMs).not.toBeNull()
    expect(r.misses).toBeGreaterThan(0)
    expect(r.timeouts).toBeGreaterThanOrEqual(0)
    expect(scoreClick(r)).toBeGreaterThan(0)
  })

  it('相同种子首目标位置一致，不同种子不同', () => {
    const a = createClickTest(settings, 99)
    const b = createClickTest(settings, 99)
    a.start(); b.start()
    runFrames(a, 1000); runFrames(b, 1000)
    expect(a.getTarget()).toEqual(b.getTarget())
    const c = createClickTest(settings, 100)
    c.start()
    runFrames(c, 1000)
    expect(c.getTarget().x).not.toBe(a.getTarget().x)
  })
})

describe('快速转向', () => {
  it('向目标移动并命中，结果包含过/欠转统计', () => {
    const test = createFlickTest(settings, 3)
    test.start()
    runFrames(test, 5000, () => {
      const t = test.getTarget()
      if (t) {
        const c = test.getCrosshair()
        // L 形甩动：先水平后垂直，路径长度大于直线距离 => 产生轻微过转
        test.mouseMove(t.x - c.x, 0)
        const c2 = test.getCrosshair()
        test.mouseMove(0, t.y - c2.y)
        test.click(test.getCrosshair().x, test.getCrosshair().y)
      }
    })
    const r = test.result()
    expect(['over', 'under', 'balanced']).toContain(r.bias)
    expect(r.overCount + r.underCount).toBeGreaterThan(0)
    expect(scoreFlick(r)).toBeGreaterThanOrEqual(0)
  })
})

describe('目标跟踪', () => {
  it('全程跟随目标在靶率高，不跟随在靶率低', () => {
    const follow = createTrackingTest(settings, 5)
    follow.start()
    runFrames(follow, 3000, () => {
      const t = follow.getTarget()
      const c = follow.getCrosshair()
      follow.mouseMove(t.x - c.x, t.y - c.y)
    })
    expect(follow.result().onTargetRate).toBeGreaterThan(60)

    const idle = createTrackingTest(settings, 5)
    idle.start()
    runFrames(idle, 3000)
    expect(idle.result().onTargetRate).toBeLessThan(follow.result().onTargetRate)
    expect(scoreTracking(follow.result())).toBeGreaterThan(scoreTracking(idle.result()))
  })
})

describe('压枪稳定', () => {
  it('持续下压控制偏移，前后半段数据均被记录', () => {
    const test = createRecoilTest(settings, 11)
    test.start()
    test.setFiring(true)
    runFrames(test, 4000, () => {
      const t = test.getTarget()
      const c = test.getCrosshair()
      test.mouseMove(t.x - c.x, t.y - c.y)
    })
    const r = test.result()
    expect(r.shots).toBeGreaterThan(10)
    expect(r.controlRate).toBeGreaterThan(50)
    expect(r.firstHalfOffset).toBeGreaterThanOrEqual(0)
    expect(r.secondHalfOffset).toBeGreaterThanOrEqual(0)
    expect(scoreRecoil(r)).toBeGreaterThan(50)
  })

  it('不下压时控制率很低', () => {
    const test = createRecoilTest(settings, 11)
    test.start()
    test.setFiring(true)
    runFrames(test, 3000)
    expect(test.result().controlRate).toBeLessThan(10)
  })
})

describe('建议生成', () => {
  it('过转多时建议降低灵敏度', () => {
    const r = { overCount: 8, underCount: 1, hitRate: 40 }
    const tips = buildAdvice('flick', r, { cmPer360: 15, band: '偏高' })
    expect(tips.join('')).toContain('过度移动')
    expect(tips.join('')).toContain('降低灵敏度')
  })
  it('欠转多时建议提高灵敏度', () => {
    const tips = buildAdvice('flick', { overCount: 1, underCount: 7, hitRate: 50 }, null)
    expect(tips.join('')).toContain('移动不足')
  })
})
