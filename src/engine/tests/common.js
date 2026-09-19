import { makeRng, randomSeed } from '../rng.js'
import { DIFFICULTIES } from '../defaults.js'

export function createContext(settings, seed = randomSeed()) {
  const rng = makeRng(seed)
  const diff = DIFFICULTIES[settings.difficulty] || DIFFICULTIES.normal
  return {
    rng,
    seed,
    diff,
    width: 1000,
    height: 600,
    elapsed: 0,
    duration: settings.duration,
    state: 'idle', // idle | running | paused | finished
    totalMousePx: 0,
    startedAt: null,
    finishedAt: null,
    finished(reason = 'timeup') {
      this.state = 'finished'
      this.finishReason = reason
      this.finishedAt = Date.now()
    },
    get timeLeft() {
      return Math.max(0, this.duration - this.elapsed)
    },
    get progress() {
      return Math.min(1, this.elapsed / this.duration)
    }
  }
}

export function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by)
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

export function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

export function stddev(arr) {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return Math.sqrt(mean(arr.map((v) => (v - m) ** 2)))
}

export function updateClock(ctx, dt) {
  if (ctx.state !== 'running') return false
  ctx.elapsed += dt
  if (ctx.elapsed >= ctx.duration) {
    ctx.elapsed = ctx.duration
    return true
  }
  return false
}

export function addMouseMovement(ctx, dx, dy) {
  if (ctx.state !== 'running') return
  ctx.totalMousePx += Math.hypot(dx, dy)
}

export function randomPosition(rng, w, h, radius, margin = 16) {
  return {
    x: rng.range(radius + margin, w - radius - margin),
    y: rng.range(radius + margin + 8, h - radius - margin - 8)
  }
}
