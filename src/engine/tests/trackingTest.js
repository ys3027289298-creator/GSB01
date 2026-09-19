import { createContext, updateClock, addMouseMovement, clamp, mean, stddev } from './common.js'
import { rate } from '../scoring.js'

// 变速变向移动目标跟踪
export function createTrackingTest(settings, seed) {
  const ctx = createContext(settings, seed)
  const radius = settings.targetSize / 2
  const speedBase = 0.0022 * settings.targetSpeed * ctx.diff.speedMul // 每毫秒像素比例（乘 140~320 的速度系数）
  const target = {
    x: ctx.width / 2,
    y: ctx.height / 2,
    vx: speedBase * 220,
    vy: 0,
    r: radius
  }
  const crosshair = { x: ctx.width / 2, y: ctx.height / 2 - 120 }

  const s = {
    samples: 0,
    onTarget: 0,
    errors: [],
    speeds: [],
    _changeIn: ctx.rng.range(600, 1400),
    offMs: 0
  }

  function update(dtMs) {
    if (ctx.state !== 'running') return
    const expired = updateClock(ctx, dtMs / 1000)
    s._changeIn -= dtMs
    if (s._changeIn <= 0) {
      const sp = speedBase * ctx.rng.range(140, 320)
      const ang = ctx.rng.range(0, Math.PI * 2)
      target.vx = Math.cos(ang) * sp
      target.vy = Math.sin(ang) * sp
      s._changeIn = ctx.rng.range(500, 1300)
    }
    target.x = clamp(target.x + target.vx * dtMs, radius, ctx.width - radius)
    target.y = clamp(target.y + target.vy * dtMs, radius, ctx.height - radius)
    if (target.x <= radius || target.x >= ctx.width - radius) target.vx *= -1
    if (target.y <= radius || target.y >= ctx.height - radius) target.vy *= -1

    const err = Math.hypot(crosshair.x - target.x, crosshair.y - target.y)
    s.samples += 1
    s.errors.push(err)
    if (err <= radius) s.onTarget += 1
    else s.offMs += 100
    s.speeds.push(Math.hypot(target.vx, target.vy))
    if (expired) ctx.finished()
  }

  function mouseMove(dx, dy) {
    addMouseMovement(ctx, dx, dy)
    if (ctx.state !== 'running') return
    crosshair.x = clamp(crosshair.x + dx, 4, ctx.width - 4)
    crosshair.y = clamp(crosshair.y + dy, 4, ctx.height - 4)
  }

  return {
    kind: 'tracking',
    ctx,
    start() {
      if (ctx.state === 'idle') {
        ctx.state = 'running'
        ctx.startedAt = Date.now()
      }
    },
    pause() {
      if (ctx.state === 'running') ctx.state = 'paused'
    },
    resume() {
      if (ctx.state === 'paused') ctx.state = 'running'
    },
    restart() {
      return createTrackingTest(settings, seed)
    },
    update,
    mouseMove,
    getTarget() {
      return { ...target }
    },
    getCrosshair() {
      return { ...crosshair }
    },
    result() {
      const m = mean(s.errors)
      const sd = stddev(s.speeds.length ? s.speeds : [0])
      const meanSpeed = mean(s.speeds)
      return {
        onTargetRate: rate(s.onTarget, s.samples),
        avgError: Math.round(m),
        offTimeMs: Math.round(s.offMs),
        samples: s.samples,
        movementVariability: Math.round(clamp(sd / Math.max(1, meanSpeed), 0, 1) * 100) / 100,
        totalMousePx: Math.round(ctx.totalMousePx)
      }
    }
  }
}
