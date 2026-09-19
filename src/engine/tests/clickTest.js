import { createContext, updateClock, addMouseMovement, randomPosition } from './common.js'
import { rate } from '../scoring.js'

export function createClickTest(settings, seed) {
  const ctx = createContext(settings, seed)
  const radius = settings.targetSize / 2
  const lifetime = 2000 * ctx.diff.timeoutMul
  const nextDelay = () => ctx.rng.range(250, 900)

  const s = {
    hits: 0,
    misses: 0,
    timeouts: 0,
    totalSpawns: 0,
    reactions: [],
    target: null,
    _spawnIn: 700
  }

  function spawn() {
    const pos = randomPosition(ctx.rng, ctx.width, ctx.height, radius)
    s.target = {
      x: pos.x,
      y: pos.y,
      r: radius * ctx.rng.range(0.85, 1.15),
      bornAt: ctx.elapsed * 1000
    }
    s.totalSpawns += 1
  }

  function update(dtMs) {
    if (ctx.state !== 'running') return
    if (!s.target) {
      s._spawnIn -= dtMs
      if (s._spawnIn <= 0) spawn()
    } else if (ctx.elapsed * 1000 - s.target.bornAt > lifetime) {
      s.timeouts += 1
      s.target = null
      s._spawnIn = nextDelay()
    }
    const expired = updateClock(ctx, dtMs / 1000)
    if (expired) finish()
  }

  function click(x, y) {
    if (ctx.state !== 'running') return null
    if (!s.target) {
      s.misses += 1
      return { type: 'miss' }
    }
    const d = Math.hypot(x - s.target.x, y - s.target.y)
    if (d <= s.target.r) {
      const reaction = ctx.elapsed * 1000 - s.target.bornAt
      s.hits += 1
      s.reactions.push(reaction)
      s.target = null
      s._spawnIn = nextDelay()
      return { type: 'hit', reaction }
    }
    s.misses += 1
    return { type: 'miss' }
  }

  function finish() {
    ctx.finished()
    s.target = null
  }

  return {
    kind: 'click',
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
      return createClickTest(settings, seed)
    },
    update,
    click,
    mouseMove(dx, dy) {
      addMouseMovement(ctx, dx, dy)
    },
    getTarget() {
      return s.target
    },
    result() {
      const total = s.hits + s.misses + s.timeouts
      const avg = s.reactions.length
        ? s.reactions.reduce((a, b) => a + b, 0) / s.reactions.length
        : 0
      return {
        hits: s.hits,
        misses: s.misses,
        timeouts: s.timeouts,
        totalSpawns: s.totalSpawns,
        attempts: s.hits + s.misses,
        hitRate: rate(s.hits, Math.max(1, s.hits + s.misses)),
        avgReactionMs: Math.round(avg),
        bestReactionMs: s.reactions.length ? Math.round(Math.min(...s.reactions)) : null,
        totalMousePx: Math.round(ctx.totalMousePx)
      }
    }
  }
}
