import { makeRng } from './rng.js';
import { SIZE_PX, DIFFICULTY, SPEED_MULT } from './settings.js';
import { clamp, distance, mean, stdDev } from './geometry.js';

export class TrackingTest {
  constructor({ width, height, settings, durationSec, seed, now = () => performance.now() }) {
    this.width = width;
    this.height = height;
    this.settings = settings;
    this.durationMs = durationSec * 1000;
    this.rng = makeRng(seed);
    this.now = now;
    const diff = DIFFICULTY[settings.difficulty];
    this.radius = Math.round(SIZE_PX[settings.targetSize] * diff.sizeMult * 0.9 / 2);
    this.baseSpeed = 0.14 * SPEED_MULT[settings.targetSpeed] * diff.speedMult;
    this.reset();
  }

  reset() {
    this.startedAt = null;
    this.elapsed = 0;
    this.over = false;
    this.target = {
      x: this.width / 2,
      y: this.height / 2,
      vx: this.baseSpeed * this.width,
      vy: 0
    };
    this.crosshair = { x: this.width / 2, y: this.height / 2 };
    this.samples = [];
    this.offsets = [];
    this.cursorSpeeds = [];
    this.lastCursor = null;
    this.nextChangeAt = 700;
    this.totalOffset = 0;
  }

  start() {
    this.reset();
    this.startedAt = this.now();
  }

  changeDirection() {
    const speed = this.baseSpeed * this.width * (0.6 + this.rng.next() * 0.9);
    const angle = this.rng.range(0, Math.PI * 2);
    this.target.vx = Math.cos(angle) * speed;
    this.target.vy = Math.sin(angle) * speed * 0.7;
    this.nextChangeAt = this.elapsed + this.rng.range(500, 1300);
  }

  tick(ts, dtMs) {
    if (this.startedAt == null || this.over) return {};
    this.elapsed = ts - this.startedAt;
    const dt = Math.min(50, dtMs || 16.7);
    if (this.elapsed >= this.nextChangeAt) this.changeDirection();
    this.target.x += (this.target.vx * dt) / 1000;
    this.target.y += (this.target.vy * dt) / 1000;
    const margin = this.radius + 8;
    if (this.target.x < margin || this.target.x > this.width - margin) {
      this.target.vx *= -1;
      this.target.x = clamp(this.target.x, margin, this.width - margin);
    }
    if (this.target.y < margin + 30 || this.target.y > this.height - margin) {
      this.target.vy *= -1;
      this.target.y = clamp(this.target.y, margin + 30, this.height - margin);
    }
    const off = distance(this.crosshair.x, this.crosshair.y, this.target.x, this.target.y);
    this.totalOffset += off;
    this.offsets.push(off);
    this.samples.push({ t: this.elapsed, on: off <= this.radius });
    if (this.elapsed >= this.durationMs) {
      this.over = true;
      return { over: true };
    }
    return { over: false, target: this.target, offset: off };
  }

  setCrosshair(x, y) {
    if (this.lastCursor) {
      const d = distance(x, y, this.lastCursor.x, this.lastCursor.y);
      this.cursorSpeeds.push(d);
      this.mouseDistancePx = (this.mouseDistancePx || 0) + d;
    }
    this.lastCursor = { x, y };
    this.crosshair.x = x;
    this.crosshair.y = y;
  }

  getStats() {
    const onCount = this.samples.filter((s) => s.on).length;
    let offMs = 0;
    let streakOn = 0;
    let longestOff = 0;
    let curOff = 0;
    for (let i = 1; i < this.samples.length; i++) {
      const dt = this.samples[i].t - this.samples[i - 1].t;
      if (!this.samples[i].on) {
        offMs += dt;
        curOff += dt;
        longestOff = Math.max(longestOff, curOff);
      } else {
        curOff = 0;
        streakOn += dt;
      }
    }
    const avgOffset = mean(this.offsets);
    const jitter = stdDev(this.cursorSpeeds);
    return {
      type: 'tracking',
      durationMs: this.durationMs,
      onTargetRate: this.samples.length ? onCount / this.samples.length : 0,
      offTargetMs: Math.round(offMs),
      longestOffMs: Math.round(longestOff),
      avgOffsetPx: Math.round(avgOffset * 10) / 10,
      stabilityJitter: Math.round(jitter * 100) / 100,
      mouseDistancePx: Math.round(this.mouseDistancePx || 0),
      stable: jitter < 30
    };
  }
}
