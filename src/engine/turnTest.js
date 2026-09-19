import { makeRng } from './rng.js';
import { angleDelta, clamp, mean } from './geometry.js';

export class TurnTest {
  constructor({ settings, durationSec, seed, degPerPx, now = () => performance.now() }) {
    this.settings = settings;
    this.durationMs = durationSec * 1000;
    this.rng = makeRng(seed);
    this.degPerPx = degPerPx;
    this.now = now;
    this.targetCount = 12;
    this.hitWindowDeg = 8;
    this.reset();
  }

  reset() {
    this.yaw = 0;
    this.startedAt = null;
    this.elapsed = 0;
    this.over = false;
    this.index = -1;
    this.current = null;
    this.results = [];
    this.totalMousePx = 0;
    this.peakAbsError = 0;
    this.targetPresentAt = 0;
  }

  start() {
    this.reset();
    this.startedAt = this.now();
    this.nextTarget(0, 0);
  }

  nextTarget(ts, startYaw) {
    this.index += 1;
    if (this.index >= this.targetCount) {
      this.over = true;
      return null;
    }
    const dir = this.rng.next() < 0.5 ? -1 : 1;
    const angle = this.rng.pick([45, 60, 75, 90, 120, 150, 180]) * dir;
    this.current = {
      index: this.index,
      startYaw,
      targetAngle: angle,
      goalYaw: startYaw + angle,
      shownAt: ts,
      finishedAt: null,
      overshot: false,
      minAbsError: Infinity
    };
    return this.current;
  }

  addMouseDelta(dxPx) {
    if (!this.current || this.over) return;
    this.totalMousePx += Math.abs(dxPx);
    this.yaw += dxPx * this.degPerPx;
    const err = angleDelta(this.current.goalYaw, this.yaw);
    this.current.minAbsError = Math.min(this.current.minAbsError, Math.abs(err));
    if (Math.sign(err) !== Math.sign(this.current.targetAngle) && Math.abs(err) > this.hitWindowDeg) {
      this.current.overshot = true;
    }
    this.peakAbsError = Math.max(this.peakAbsError, this.current.minAbsError === Infinity ? 0 : 0);
  }

  click() {
    if (!this.current || this.over) return null;
    const err = angleDelta(this.current.goalYaw, this.yaw);
    const absErr = Math.abs(err);
    const hit = absErr <= this.hitWindowDeg;
    const completionMs = this.elapsed - this.current.shownAt;
    let classification;
    if (hit) classification = this.current.overshot ? 'hit-after-over' : 'hit';
    else classification = this.current.overshot ? 'over' : 'under';
    const record = {
      index: this.current.index,
      targetAngle: this.current.targetAngle,
      errorDeg: Math.round(err * 10) / 10,
      absErrorDeg: Math.round(absErr * 10) / 10,
      overshot: this.current.overshot,
      hit,
      classification,
      completionMs: Math.max(0, Math.round(completionMs))
    };
    this.results.push(record);
    const finishedYaw = this.yaw;
    this.nextTarget(this.elapsed, finishedYaw);
    return record;
  }

  tick(ts) {
    if (this.startedAt == null) return {};
    this.elapsed = ts - this.startedAt;
    if (!this.over && this.elapsed >= this.durationMs) {
      if (this.current) {
        const err = angleDelta(this.current.goalYaw, this.yaw);
        this.results.push({
          index: this.current.index,
          targetAngle: this.current.targetAngle,
          errorDeg: Math.round(err * 10) / 10,
          absErrorDeg: Math.round(Math.abs(err) * 10) / 10,
          overshot: this.current.overshot,
          hit: false,
          classification: 'timeout',
          completionMs: Math.round(this.durationMs - this.current.shownAt)
        });
      }
      this.over = true;
      this.current = null;
    }
    return { over: this.over, current: this.current, yaw: this.yaw };
  }

  getStats() {
    const finished = this.results;
    const hits = finished.filter((r) => r.hit).length;
    const overCount = finished.filter((r) => r.classification === 'over' || r.classification === 'hit-after-over').length;
    const underCount = finished.filter((r) => r.classification === 'under').length;
    const errors = finished.map((r) => r.absErrorDeg);
    const times = finished.map((r) => r.completionMs);
    return {
      type: 'turn',
      durationMs: this.durationMs,
      targets: finished.length,
      hits,
      overCount,
      underCount,
      avgErrorDeg: Math.round(mean(errors) * 10) / 10,
      avgErrorRatio: clamp(mean(errors) / 180, 0, 1),
      avgCompletionMs: Math.round(mean(times)),
      mouseDistancePx: Math.round(this.totalMousePx),
      bias: overCount > underCount ? 'over' : underCount > overCount ? 'under' : 'balanced',
      details: finished
    };
  }
}
