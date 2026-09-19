import { createContext, updateClock, addMouseMovement, randomPosition, distance, mean } from './common.js'
import { rate } from '../scoring.js'

const ANGLES = [-170, -120, -75, -40, 40, 75, 120, 170]

export function createFlickTest(settings, seed) {
  const ctx = createContext(settings, seed)
  const radius = settings.targetSize / 2
  const tolerance = radius * (ctx.diff.flickTol || 1)
  const crosshair = { x: ctx.width / 2, y: ctx.height / 2 }

  const s = {
    hits: 0,
    misses: 0,
    timeouts: 0,
    rounds: 0,
    overCount: 0,
    underCount: 0,
    errors: [],
    times: [],
    target: null,
    origin: { ...crosshair },
    travelPx: 0,
    _spawnIn: 800
  }

  function spawn() {
    const angle = ctx.rng.pick(ANGLES)
    const distPx = ctx.rng.range(140, Math.min(ctx.width, ctx.height) * 0.42)
    const rad = (angle * Math.PI) / 180
    let x = crosshair.x + Math.sin(rad) * distPx
    let y = crosshair.y - Math.cos(rad) * distPx
    x = Math.max(radius + 8, Math.min(ctx.width - radius - 8, x))
    y = Math.max(radius + 8, Math.min(ctx.height - radius - 8, y))
    s.origin = { ...crosshair }
    s.travelPx = 0
    s.target = { x, y, r: radius, angle, need: distPx, bornAt: ctx.elapsed * 1000 }
    s.rounds += 1
  }

  function classifyAndEnd(hit, clickX, clickY) {
    const t = s.target
    const travel = s.travelPx
    const overshoot = travel - t.need
    const threshold = Math.max(t.need * 0.08, 12)
    if (hit) {
      s.hits += 1
      s.errors.push(Math.abs(distance(crosshair.x, crosshair.y, t.x, t.y)))
    } else {
      s.misses += 1
      const err = distance(clickX, clickY, t.x, t.y)
      s.errors.push(err)
    }
    if (overshoot > threshold) s.overCount += 1
    else if (overshoot < -threshold) s.underCount += 1
    s.times.push(ctx.elapsed * 1000 - t.bornAt)
    s.target = null
    s._spawnIn = ctx.rng.range(300, 700)
    crosshair.x = ctx.width / 2
    crosshair.y = ctx.height / 2
  }

  function update(dtMs) {
    if (ctx.state !== 'running') return
    if (!s.target) {
      s._spawnIn -= dtMs
      if (s._spawnIn <= 0) spawn()
    } else if (ctx.elapsed * 1000 - s.target.bornAt > 2600 * ctx.diff.timeoutMul) {
      s.timeouts += 1
      s.times.push(2600 * ctx.diff.timeoutMul)
      s.errors.push(distance(crosshair.x, crosshair.y, s.target.x, s.target.y))
      const overshoot = distance(s.origin.x, s.origin.y, crosshair.x, crosshair.y) - s.target.need
      const threshold = Math.max(s.target.need * 0.08, 12)
      if (overshoot > threshold) s.overCount += 1
      else if (overshoot < -threshold) s.underCount += 1
      else if (overshoot > 0) s.overCount += 1
      else s.underCount += 1
      s.target = null
      s._spawnIn = 400
      crosshair.x = ctx.width / 2
      crosshair.y = ctx.height / 2
    }
    const expired = updateClock(ctx, dtMs / 1000)
    if (expired) {
      ctx.finished()
      s.target = null
    }
  }

  function mouseMove(dx, dy) {
    addMouseMovement(ctx, dx, dy)
    if (ctx.state !== 'running' || !s.target) return
    s.travelPx += Math.hypot(dx, dy)
    crosshair.x = Math.max(4, Math.min(ctx.width - 4, crosshair.x + dx))
    crosshair.y = Math.max(4, Math.min(ctx.height - 4, crosshair.y + dy))
  }

  function click(x, y) {
    if (ctx.state !== 'running') return null
    if (!s.target) {
      s.misses += 1
      return { type: 'miss' }
    }
    const hit = distance(crosshair.x, crosshair.y, s.target.x, s.target.y) <= s.target.r + tolerance * 0.35
    classifyAndEnd(hit, x, y)
    return { type: hit ? 'hit' : 'miss' }
  }

  return {
    kind: 'flick',
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
      return createFlickTest(settings, seed)
    },
    update,
    mouseMove,
    click,
    getTarget() {
      return s.target
    },
    getCrosshair() {
      return { ...crosshair }
    },
    result() {
      return {
        hits: s.hits,
        misses: s.misses,
        timeouts: s.timeouts,
        rounds: s.rounds,
        overCount: s.overCount,
        underCount: s.underCount,
        bias: s.overCount > s.underCount ? 'over' : s.underCount > s.overCount ? 'under' : 'balanced',
        hitRate: rate(s.hits, Math.max(1, s.hits + s.misses + s.timeouts)),
        avgError: Math.round(mean(s.errors)),
        avgTimeMs: Math.round(mean(s.times)),
        totalMousePx: Math.round(ctx.totalMousePx)
      }
    }
  }
}
