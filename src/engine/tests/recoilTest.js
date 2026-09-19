import { createContext, updateClock, addMouseMovement, clamp, mean } from './common.js'
import { rate } from '../scoring.js'

// 按住开火：准星承受持续上跳后坐力，玩家需向下压住并保持在稳定圈内
export function createRecoilTest(settings, seed) {
  const ctx = createContext(settings, seed)
  const radius = settings.targetSize / 2
  const controlRadius = radius * 1.15
  const target = { x: ctx.width / 2, y: ctx.height / 2 }
  const recoilV = 0.16 * ctx.diff.speedMul * settings.targetSpeed // 像素/毫秒
  const wobble = 0.04 * ctx.diff.speedMul
  const crosshair = { x: target.x, y: target.y }

  const s = {
    firing: false,
    samples: 0,
    controlled: 0,
    offsetsFirst: [],
    offsetsSecond: [],
    controlMs: 0,
    trail: [],
    shots: 0
  }

  function update(dtMs) {
    if (ctx.state !== 'running') return
    const expired = updateClock(ctx, dtMs / 1000)
    if (s.firing) {
      // 后坐力：持续上跳 + 随机水平抖动
      crosshair.y -= recoilV * dtMs
      crosshair.x += ctx.rng.range(-wobble, wobble) * dtMs
      s.shots += dtMs / 100
      const off = Math.hypot(crosshair.x - target.x, crosshair.y - target.y)
      s.samples += 1
      s.offsetsFirst = s.offsetsFirst || []
      if (ctx.elapsed < ctx.duration / 2) s.offsetsFirst.push(off)
      else s.offsetsSecond.push(off)
      if (off <= controlRadius) {
        s.controlled += 1
        s.controlMs += 100
      }
      s.trail.push({ x: crosshair.x, y: crosshair.y })
      if (s.trail.length > 240) s.trail.shift()
    }
    if (expired) {
      ctx.finished()
      s.firing = false
    }
  }

  function mouseMove(dx, dy) {
    addMouseMovement(ctx, dx, dy)
    if (ctx.state !== 'running') return
    crosshair.x = clamp(crosshair.x + dx, target.x - 160, target.x + 160)
    crosshair.y = clamp(crosshair.y + dy, target.y - 200, target.y + 120)
  }

  function setFiring(v) {
    if (ctx.state !== 'running') return
    s.firing = v
  }

  return {
    kind: 'recoil',
    ctx,
    start() {
      if (ctx.state === 'idle') {
        ctx.state = 'running'
        ctx.startedAt = Date.now()
      }
    },
    pause() {
      if (ctx.state === 'running') {
        ctx.state = 'paused'
        s.firing = false
      }
    },
    resume() {
      if (ctx.state === 'paused') ctx.state = 'running'
    },
    restart() {
      return createRecoilTest(settings, seed)
    },
    update,
    mouseMove,
    setFiring,
    getTarget() {
      return { ...target, r: radius }
    },
    getControlRadius() {
      return controlRadius
    },
    getCrosshair() {
      return { ...crosshair }
    },
    getTrail() {
      return s.trail.slice(-80)
    },
    result() {
      const first = mean(s.offsetsFirst)
      const second = mean(s.offsetsSecond)
      const drift = second > 0 ? clamp((second - first) / Math.max(1, second), -1, 1) : 0
      return {
        controlRate: rate(s.controlled, s.samples),
        controlMs: Math.round(s.controlMs),
        avgOffset: Math.round(mean([...s.offsetsFirst, ...s.offsetsSecond])),
        firstHalfOffset: Math.round(first),
        secondHalfOffset: Math.round(second),
        firstVsSecondDrift: Math.round(drift * 100) / 100,
        shots: Math.round(s.shots),
        totalMousePx: Math.round(ctx.totalMousePx)
      }
    }
  }
}
