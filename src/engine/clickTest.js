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

  spawnTarget(slotTs) {
    const margin = this.radius + 12;
    const target = {
      id: this.spawned + 1,
      x: this.rng.range(margin, Math.max(margin + 1, this.width - margin)),
      y: this.rng.range(margin + 40, Math.max(margin + 41, this.height - margin)),
      r: this.radius,
      bornAt: slotTs,
      expiresAt: slotTs + CLICK_LIFETIME,
      hit: false
    };
    this.targets.push(target);
    this.spawned += 1;
    const gap = this.diff.spawnGap * (0.7 + this.rng.next() * 0.6);
    this.nextSpawnAt = slotTs + gap;
    return target;
  }

  start() {
    this.reset();
    this.startedAt = this.now();
    return this.startedAt;
  }

  _advanceTo(ts) {
    const events = [];
    if (this.startedAt == null || this.over) return events;
    this.elapsed = Math.max(this.elapsed, ts - this.startedAt);
    const elapsed = this.elapsed;
    for (;;) {
      let expiring = null;
      for (const t of this.targets) {
        if (!expiring || t.expiresAt < expiring.expiresAt) expiring = t;
      }
      const canSpawn = this.nextSpawnAt <= elapsed && this.nextSpawnAt < this.durationMs;
      const canExpire = expiring != null && expiring.expiresAt <= elapsed;
      if (canExpire && (!canSpawn || expiring.expiresAt <= this.nextSpawnAt)) {
        this.targets = this.targets.filter((t) => t !== expiring);
        this.timeouts += 1;
        events.push({ type: 'timeout', target: expiring });
      } else if (canSpawn) {
        events.push({ type: 'spawn', target: this.spawnTarget(this.nextSpawnAt) });
      } else {
        break;
      }
    }
    if (elapsed >= this.durationMs) {
      this.over = true;
      for (const t of this.targets) {
        this.timeouts += t.hit ? 0 : 1;
      }
      this.targets = [];
      events.push({ type: 'end' });
    }
    return events;
  }

  tick(ts) {
    if (this.startedAt == null || this.over) return { events: [] };
    const before = this.targets.length;
    const events = this._advanceTo(ts);
    return { events, before, spawned: this.spawned };
  }

  handleClick(x, y, ts) {
    if (this.startedAt == null) return null;
    if (Number.isFinite(ts)) this._advanceTo(ts);
    if (this.over) return null;
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
