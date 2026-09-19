export function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function pointInCircle(px, py, cx, cy, r) {
  return distance(px, py, cx, cy) <= r;
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((v) => (v - m) ** 2)));
}

export function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function angleDelta(target, current) {
  let d = ((target - current + 540) % 360) - 180;
  if (d < -180) d += 360;
  return d;
}
