import { describe, it, expect, beforeEach } from 'vitest';
import { ClickTest, CLICK_LIFETIME } from '../src/engine/clickTest.js';
import { TurnTest } from '../src/engine/turnTest.js';
import { TrackingTest } from '../src/engine/trackingTest.js';
import { RecoilTest } from '../src/engine/recoilTest.js';
import { CalibrationSession } from '../src/engine/calibration.js';
import { pointInCircle, angleDelta } from '../src/engine/geometry.js';
import { buildSummary } from '../src/engine/scoring.js';
import { clampSettings, DEFAULT_SETTINGS } from '../src/engine/settings.js';
import { makeStorage } from '../src/engine/storage.js';

const baseSettings = { ...DEFAULT_SETTINGS };

describe('命中判断', () => {
  it('圆内命中、圆外未命中、边界算命中', () => {
    expect(pointInCircle(10, 10, 10, 10, 20)).toBe(true);
    expect(pointInCircle(40, 10, 10, 10, 20)).toBe(false);
    expect(pointInCircle(30, 10, 10, 10, 20)).toBe(true);
  });
  it('有符号角度差取最短方向', () => {
    expect(angleDelta(350, 10)).toBe(-20);
    expect(Math.abs(angleDelta(180, 0))).toBe(180);
    expect(angleDelta(90, 0)).toBe(90);
  });
});

describe('目标生成（快速点击）', () => {
  it('时间推进后生成多个目标，目标始终在场地内', () => {
    const t = new ClickTest({ width: 800, height: 600, settings: baseSettings, durationSec: 5, seed: 's0', now: () => 0 });
    t.start();
    for (let ms = 0; ms <= 5000; ms += 20) t.tick(ms);
    expect(t.spawned).toBeGreaterThan(3);
  });

  it('不同种子下目标位置序列不同', () => {
    const collect = (seed) => {
      const t = new ClickTest({ width: 800, height: 600, settings: baseSettings, durationSec: 3, seed, now: () => 0 });
      t.start();
      const pts = [];
      for (let ms = 0; ms <= 3000; ms += 30) {
        t.tick(ms);
        for (const g of t.targets) pts.push(`${Math.round(g.x)}_${Math.round(g.y)}`);
      }
      return pts.join('|');
    };
    expect(collect('a')).not.toBe(collect('b'));
  });

  it('点击命中记录反应时间，点空白记失误，超时记漏点', () => {
    const t = new ClickTest({ width: 800, height: 600, settings: baseSettings, durationSec: 2, seed: 'fixed', now: () => 0 });
    t.start();
    t.tick(500);
    expect(t.targets.length).toBeGreaterThan(0);
    const target = t.targets[0];
    t.tick(900);
    const res = t.handleClick(target.x, target.y);
    expect(res.hit).toBe(true);
    expect(res.reactionMs).toBeGreaterThan(0);
    expect(res.reactionMs).toBeLessThan(CLICK_LIFETIME);
    const miss = t.handleClick(2, 2);
    expect(miss.hit).toBe(false);
    expect(t.misses).toBe(1);
    for (let ms = 1000; ms <= 2200; ms += 100) t.tick(ms);
    const stats = t.getStats();
    expect(stats.spawned).toBeGreaterThan(0);
    expect(stats.fastestReactionMs).toBeGreaterThan(0);
    expect(stats.accuracy).toBeCloseTo(t.hits / t.attempts);
  });
});

describe('鼠标移动记录（校准）', () => {
  it('累计移动像素与视角变化，并换算 cm/360', () => {
    let now = 0;
    const session = new CalibrationSession({ targetDeg: 360, degPerPxGuess: 0.2, dpi: 800, now: () => now });
    session.begin();
    session.addMove(500);
    session.addMove(400);
    now = 1200;
    const r = session.finish();
    expect(r.movePx).toBe(900);
    expect(r.viewDeg).toBe(180);
    expect(r.elapsedMs).toBe(1200);
    expect(r.cmPer360).toBeCloseTo(5.715, 1);
  });
});

describe('快速转向引擎', () => {
  it('转不够为 under，转过为 over，到位为 hit', () => {
    let now = 0;
    const t = new TurnTest({ settings: baseSettings, durationSec: 60, seed: 'turn', degPerPx: 0.5, now: () => now });
    t.start();
    t.addMouseDelta(t.current.targetAngle / 0.5 * 0.5);
    now = 400; t.tick(400);
    const under = t.click();
    expect(under.hit).toBe(false);
    expect(under.classification).toBe('under');

    t.addMouseDelta(t.current.targetAngle / 0.5 * 1.6);
    now = 800; t.tick(800);
    const over = t.click();
    expect(over.overshot).toBe(true);

    t.addMouseDelta(t.current.targetAngle / 0.5);
    now = 1200; t.tick(1200);
    const hit = t.click();
    expect(hit.hit).toBe(true);

    const stats = t.getStats();
    expect(stats.underCount + stats.overCount).toBeGreaterThanOrEqual(2);
    expect(stats.mouseDistancePx).toBeGreaterThan(0);
  });

  it('不同种子的目标角度序列不同', () => {
    const seq = (seed) => {
      const t = new TurnTest({ settings: baseSettings, durationSec: 99, seed, degPerPx: 0.5, now: () => 0 });
      const angles = [];
      t.start();
      for (let i = 0; i < 12; i++) { angles.push(t.current.targetAngle); t.click(); }
      return angles.join(',');
    };
    expect(seq('x')).not.toBe(seq('y'));
  });
});

describe('移动目标跟踪', () => {
  it('目标速度与方向持续变化，持续跟住得到高跟踪率', () => {
    const t = new TrackingTest({ width: 800, height: 600, settings: baseSettings, durationSec: 3, seed: 'tr', now: () => 0 });
    t.start();
    let ts = 0;
    let changes = 0;
    let lastVx = t.target.vx;
    let lastVy = t.target.vy;
    for (let i = 0; i < 180; i++) {
      ts += 16.7;
      t.setCrosshair(t.target.x, t.target.y);
      t.tick(ts, 16.7);
      if (Math.abs(t.target.vx - lastVx) > 1 || Math.abs(t.target.vy - lastVy) > 1) changes += 1;
      lastVx = t.target.vx;
      lastVy = t.target.vy;
    }
    expect(changes).toBeGreaterThan(1);
    expect(t.getStats().onTargetRate).toBeGreaterThan(0.85);
  });

  it('完全不跟随则跟踪率很低', () => {
    const t = new TrackingTest({ width: 800, height: 600, settings: baseSettings, durationSec: 2, seed: 'tr2', now: () => 0 });
    t.start();
    let ts = 0;
    for (let i = 0; i < 120; i++) {
      ts += 16.7;
      t.setCrosshair(10, 10);
      t.tick(ts, 16.7);
    }
    expect(t.getStats().onTargetRate).toBeLessThan(0.2);
  });
});

describe('压枪稳定性', () => {
  it('不压枪时偏移持续累积，后半段大于前半段', () => {
    const t = new RecoilTest({ width: 800, height: 600, settings: baseSettings, durationSec: 2, seed: 'rc', now: () => 0 });
    t.start();
    t.setFiring(true);
    let ts = 0;
    for (let i = 0; i < 120; i++) {
      ts += 16.7;
      t.setCrosshair(t.center.x, t.center.y);
      t.tick(ts, 16.7);
    }
    const s = t.getStats();
    expect(s.shots).toBe(120);
    expect(s.secondHalfAvgOffset).toBeGreaterThan(s.firstHalfAvgOffset);
    expect(s.maxOffsetPx).toBeGreaterThan(0);
  });

  it('持续下拉压枪可把偏移控制在小范围内', () => {
    const t = new RecoilTest({ width: 800, height: 600, settings: baseSettings, durationSec: 2, seed: 'rc2', now: () => 0 });
    t.start();
    t.setFiring(true);
    let ts = 0;
    for (let i = 0; i < 120; i++) {
      ts += 16.7;
      t.tick(ts, 16.7);
      t.setCrosshair(t.center.x, t.center.y - t.recoilY);
    }
    expect(t.getStats().avgOffsetPx).toBeLessThan(30);
  });
});

describe('分数与建议', () => {
  it('点击成绩好给稳定建议，差给调整建议', () => {
    const good = buildSummary({
      type: 'click', hits: 18, attempts: 20, spawned: 20,
      avgReactionMs: 320, fastestReactionMs: 210, misses: 2, durationMs: 30000
    });
    expect(good.score).toBeGreaterThan(80);
    expect(good.advice.join(' ')).toContain('稳定');
    const bad = buildSummary({
      type: 'click', hits: 4, attempts: 20, spawned: 20,
      avgReactionMs: 600, fastestReactionMs: 300, misses: 16, durationMs: 30000
    });
    expect(bad.score).toBeLessThan(50);
    expect(bad.advice.length).toBeGreaterThan(0);
  });

  it('转向偏过头与偏不足给出相反建议', () => {
    const base = { type: 'turn', hits: 5, targets: 12, avgErrorDeg: 30, avgErrorRatio: 0.17, avgCompletionMs: 900, durationMs: 30000 };
    const over = buildSummary({ ...base, overCount: 8, underCount: 1 });
    const under = buildSummary({ ...base, overCount: 1, underCount: 8 });
    expect(over.advice.join(' ')).toContain('过度移动');
    expect(under.advice.join(' ')).toContain('移动不足');
  });
});

describe('设置保存与校验', () => {
  it('非法值被回退到默认或裁剪，多余字段被剔除', () => {
    const s = clampSettings({ dpi: 'abc', sensitivity: -5, fov: 999, aspect: 'xx', duration: 3, garbage: 1 });
    expect(s.dpi).toBe(DEFAULT_SETTINGS.dpi);
    expect(s.sensitivity).toBe(0.01);
    expect(s.fov).toBe(170);
    expect(s.aspect).toBe(DEFAULT_SETTINGS.aspect);
    expect(s.duration).toBe(10);
    expect(s.garbage).toBeUndefined();
  });
});

describe('本地存储', () => {
  let backend;
  beforeEach(() => { backend = new Map(); });
  const ls = () => ({
    getItem: (k) => (backend.has(k) ? backend.get(k) : null),
    setItem: (k, v) => backend.set(k, String(v)),
    removeItem: (k) => backend.delete(k)
  });

  it('设置与记录可存取，清空后为空', () => {
    const store = makeStorage(ls());
    store.saveSettings({ dpi: 1600 });
    expect(store.loadSettings().dpi).toBe(1600);
    store.saveRecords([{ id: '1', type: 'click' }]);
    expect(store.loadRecords()).toHaveLength(1);
    store.clearAll();
    expect(store.loadSettings()).toBeNull();
    expect(store.loadRecords()).toEqual([]);
  });

  it('损坏数据抛出包含“损坏”的明确错误', () => {
    const store = makeStorage(ls());
    store.saveRecords([{ id: '1' }]);
    backend.set('fps_tester_records_v1', '{not-json');
    expect(() => store.loadRecords()).toThrow(/损坏/);
  });
});
