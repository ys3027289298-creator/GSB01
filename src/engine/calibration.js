import { clamp } from './geometry.js';

export const CALIB_ANGLES = [90, 180, 360];

export class CalibrationSession {
  constructor({ targetDeg, degPerPxGuess, dpi = 800, now = () => performance.now() }) {
    this.targetDeg = targetDeg;
    this.degPerPxGuess = degPerPxGuess;
    this.pxPerCm = dpi / 2.54;
    this.now = now;
    this.active = false;
    this.startedAt = null;
    this.movePx = 0;
    this.viewDeg = 0;
  }

  begin() {
    this.active = true;
    this.startedAt = this.now();
    this.movePx = 0;
    this.viewDeg = 0;
  }

  addMove(dxPx) {
    if (!this.active) return;
    this.movePx += Math.abs(dxPx);
    this.viewDeg += dxPx * this.degPerPxGuess;
  }

  finish() {
    if (!this.active) return null;
    this.active = false;
    const elapsedMs = this.now() - this.startedAt;
    const actualDeg = clamp(this.viewDeg, -5000, 5000);
    const cmPer360 = actualDeg && this.movePx ? (this.movePx / this.pxPerCm / Math.abs(actualDeg)) * 360 : null;
    return {
      targetDeg: this.targetDeg,
      movePx: Math.round(this.movePx),
      viewDeg: Math.round(actualDeg * 10) / 10,
      errorDeg: Math.round((Math.abs(actualDeg) - this.targetDeg) * 10) / 10,
      errorRatio: Math.abs(Math.abs(actualDeg) - this.targetDeg) / this.targetDeg,
      elapsedMs: Math.round(elapsedMs),
      cmPer360: cmPer360 ? Math.round(cmPer360 * 10) / 10 : null
    };
  }
}

export function estimateDegPerPx(settings) {
  if (settings.cmPer360) {
    const pxPerCm = settings.dpi / 2.54;
    return 360 / (settings.cmPer360 * pxPerCm);
  }
  const yawFactor = 0.022;
  const fovFactor = 90 / settings.fov;
  return settings.sensitivity * yawFactor * fovFactor * (settings.dpi / 800);
}

export function detectPointerSupport() {
  const issues = [];
  if (typeof window === 'undefined') return { supported: true, issues };
  if (!window.PointerEvent) issues.push('当前浏览器不支持 PointerEvent，无法准确记录鼠标移动。');
  if (!window.requestAnimationFrame) issues.push('当前浏览器不支持 requestAnimationFrame。');
  if (!window.localStorage) issues.push('当前浏览器禁用了本地存储，设置与记录无法保存。');
  if (navigator && navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches) {
    issues.push('检测到触屏设备，建议使用鼠标进行测试。');
  }
  return { supported: issues.filter((m) => m.includes('不支持')).length === 0, issues };
}
