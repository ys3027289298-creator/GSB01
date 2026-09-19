import { makeRng } from './rng.js';
import { SIZE_PX } from './settings.js';
import { distance, mean } from './geometry.js';

export class RecoilTest {
  constructor({ width, height, settings, durationSec, seed, now = () => performance.now() }) {
    this.width = width;
    this.height = height;
    this.settings = settings;
    this.durationMs = durationSec * 1000;
    this.rng = makeRng(seed);
    this.now = now;
    this.radius = Math.round(SIZE_PX[settings.targetSize] / 2) + 6;
    this.reset();
  }

  reset() {
    this.startedAt = null;
    this.elapsed = 0;
    this.over = false;
    this.firing = false;
    this.center = { x: this.width / 2, y: this.height / 2 - 20 };
    this.crosshair = { x: this.center.x, y: this.center.y };
    this.recoilY = 0;
    this.offsets = [];
    this.halfSamples = [[], []];
    this.trail = [];
    this.mouseDistancePx = 0;
    this.controlStreakMs = 0;
    this.bestStreakMs = 0;
    this.lastPoint = null;
    this.shots = 0;
  }

  start() {
    this.reset();
    this.startedAt = this.now();
  }

  setFiring(on) {
    this.firing = on;
    if (!on) this.controlStreakMs = 0;
  }

  addMouseMove(dx, dy) {
    this.mouseDistancePx += Math.hypot(dx, dy);
  }

  setCrosshair(x, y) {
    if (this.lastPoint) {
      this.mouseDistancePx += distance(x, y, this.lastPoint.x, this.lastPoint.y);
    }
    this.lastPoint = { x, y };
    this.crosshair.x = x;
    this.crosshair.y = y;
  }

  tick(ts, dtMs) {
    if (this.startedAt == null || this.over) return {};
    this.elapsed = ts - this.startedAt;
    const dt = Math.min(50, dtMs || 16.7);
    if (this.firing) {
      this.shots += 1;
      this.recoilY += 0.035 * dt;
      this.recoilY += (this.rng.next() - 0.5) * 0.02 * dt;
    } else {
      this.recoilY = Math.max(0, this.recoilY - 0.08 * dt);
    }
    const aimPointY = this.crosshair.y + this.recoilY;
    const off = distance(this.crosshair.x, aimPointY, this.center.x, this.center.y);
    this.offsets.push({ t: this.elapsed, off });
    this.halfSamples[this.elapsed < this.durationMs / 2 ? 0 : 1].push(off);
    this.trail.push({ x: this.crosshair.x, y: aimPointY, t: this.elapsed });
    if (this.trail.length > 240) this.trail.shift();
    if (this.firing && off <= this.radius) {
      this.controlStreakMs += dt;
      this.bestStreakMs = Math.max(this.bestStreakMs, this.controlStreakMs);
    } else if (off > this.radius) {
      this.controlStreakMs = 0;
    }
    if (this.elapsed >= this.durationMs) {
      this.over = true;
      return { over: true, recoilY: this.recoilY, offset: off };
    }
    return { over: false, recoilY: this.recoilY, offset: off, shots: this.shots };
  }

  getStats() {
    const all = this.offsets.map((o) => o.off);
    const first = this.halfSamples[0];
    const second = this.halfSamples[1];
    const controlTime = this.offsets
      .slice(1)
      .reduce((acc, s, i) => acc + (s.off <= this.radius ? s.t - this.offsets[i].t : 0), 0);
    return {
      type: 'recoil',
      durationMs: this.durationMs,
      shots: this.shots,
      avgOffsetPx: Math.round(mean(all) * 10) / 10,
      maxOffsetPx: Math.round(Math.max(...all, 0) * 10) / 10,
      firstHalfAvgOffset: Math.round(mean(first.length ? first : [0]) * 10) / 10,
      secondHalfAvgOffset: Math.round(mean(second.length ? second : [0]) * 10) / 10,
      controlMs: Math.round(controlTime),
      controlStreakMs: Math.round(this.bestStreakMs),
      mouseDistancePx: Math.round(this.mouseDistancePx),
      stable: mean(all) <= this.radius * 0.7
    };
  }
}
