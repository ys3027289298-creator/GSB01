import { makeRng } from './rng.js';
import { SIZE_PX, DIFFICULTY } from './settings.js';
import { pointInCircle, mean, median } from './geometry.js';

export const CLICK_LIFETIME = 1600;

export class ClickTest {
  constructor({ width, height, settings, durationSec, seed, now = () => performance.now() }) {
    this.width = width;
    this.height = height;
    this.settings = settings;
    this.durationMs = durationSec * 1000;
    this.rng = makeRng(seed);
    this.now = now;
    this.diff = DIFFICULTY[settings.difficulty];
    this.radius = Math.round(SIZE_PX[settings.targetSize] * this.diff.sizeMult / 2);
    this.reset();
  }

  reset() {
    this.startedAt = null;
    this.elapsed = 0;
    this.targets = [];
    this.nextSpawnAt = 350 + this.rng.int(0, 300);
    this.spawned = 0;
    this.hits = 0;
    this.misses = 0;
    this.timeouts = 0;
    this.reactionTimes = [];
    this.over = false;
  }

  advanceTo(ts) {
    if (typeof ts === 'number' && Number.isFinite(ts)) {
      const elapsed = ts - this.startedAt;
      if (elapsed > this.elapsed) this.elapsed = elapsed;
    }
    return this.elapsed;
  }

  expireDue() {
    const alive = [];
    for (const t of this.targets) {
      if (t.expiresAt <= this.elapsed) {
        this.timeouts += 1;
      } else {
        alive.push(t);
      }
    }
    this.targets = alive;
  }

  spawnTarget(ts) {
    const margin = this.radius + 12;
    const target = {
      id: this.spawned + 1,
      x: this.rng.range(margin, Math.max(margin + 1, this.width - margin)),
      y: this.rng.range(margin + 40, Math.max(margin + 41, this.height - margin)),
      r: this.radius,
      bornAt: ts,
      expiresAt: ts + CLICK_LIFETIME,
      hit: false
    };
    this.targets.push(target);
    this.spawned += 1;
    const gap = this.diff.spawnGap * (0.7 + this.rng.next() * 0.6);
    this.nextSpawnAt = ts + gap;
    return target;
  }

  start() {
    this.reset();
    this.startedAt = this.now();
    return this.startedAt;
  }

  tick(ts) {
    if (this.startedAt == null || this.over) return { events: [] };
    this.advanceTo(ts);
    const events = [];
    const before = this.targets.length;
    // 按时间顺序合并处理到期的生成槽位与目标过期：
    // 每个补生成目标使用自己的槽位时间作为 bornAt，
    // 在当前帧之前就已过期的目标立即结算 timeout，不获得额外生命。
    for (;;) {
      let nextExpiry = Infinity;
      for (const t of this.targets) {
        if (t.expiresAt < nextExpiry) nextExpiry = t.expiresAt;
      }
      const spawnDue = this.nextSpawnAt <= this.elapsed && this.nextSpawnAt < this.durationMs;
      if (spawnDue && this.nextSpawnAt <= nextExpiry) {
        events.push({ type: 'spawn', target: this.spawnTarget(this.nextSpawnAt) });
      } else if (nextExpiry <= this.elapsed) {
        const idx = this.targets.findIndex((t) => t.expiresAt === nextExpiry);
        const [expired] = this.targets.splice(idx, 1);
        this.timeouts += 1;
        events.push({ type: 'timeout', target: expired });
      } else {
        break;
      }
    }
    if (this.elapsed >= this.durationMs) {
      this.over = true;
      this.timeouts += this.targets.length;
      this.targets = [];
      events.push({ type: 'end' });
    }
    return { events, before, spawned: this.spawned };
  }

  handleClick(x, y, ts) {
    if (this.over || this.startedAt == null) return null;
    if (ts != null) {
      // 输入发生时先按同一时间轴补结算过期目标，后续 tick 保持幂等。
      this.advanceTo(ts);
      this.expireDue();
    }
    const sorted = [...this.targets].sort((a, b) => a.bornAt - b.bornAt);
    for (const target of sorted) {
      if (pointInCircle(x, y, target.x, target.y, target.r)) {
        target.hit = true;
        this.targets = this.targets.filter((t) => t !== target);
        this.hits += 1;
        const reaction = Math.min(CLICK_LIFETIME, Math.max(0, this.elapsed - target.bornAt));
        this.reactionTimes.push(reaction);
        return { hit: true, target, reactionMs: reaction };
      }
    }
    this.misses += 1;
    return { hit: false };
  }

  get attempts() { return this.hits + this.misses; }

  getStats() {
    const attempts = this.attempts;
    const reaction = this.reactionTimes.length
      ? this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length
      : 0;
    return {
      type: 'click',
      durationMs: this.durationMs,
      spawned: this.spawned,
      hits: this.hits,
      misses: this.misses,
      timeouts: this.timeouts,
      attempts,
      accuracy: attempts ? this.hits / attempts : 0,
      avgReactionMs: Math.round(reaction),
      medianReactionMs: Math.round(median(this.reactionTimes)),
      fastestReactionMs: this.reactionTimes.length ? Math.round(Math.min(...this.reactionTimes)) : 0,
      mouseDistancePx: this.mouseDistancePx || 0
    };
  }
}
