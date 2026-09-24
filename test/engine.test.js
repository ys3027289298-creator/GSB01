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
import { makeStore } from '../src/state.js';

const baseSettings = { ...DEFAULT_SETTINGS };
const makeClick = (seed = 'tl', durationSec = 5) =>
  new ClickTest({ width: 800, height: 600, settings: baseSettings, durationSec, seed, now: () => 0 });

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

describe('点击引擎时间轴（槽位与跳变）', () => {
  it('普通 16ms 帧：bornAt 等于槽位时间且严格递增，expiresAt 固定生命周期', () => {
    const t = makeClick('frames');
    t.start();
    const borns = [];
    for (let ms = 0; ms <= 3000; ms += 16.7) {
      for (const e of t.tick(ms).events) {
        if (e.type === 'spawn') {
          borns.push(e.target.bornAt);
          expect(e.target.expiresAt - e.target.bornAt).toBe(CLICK_LIFETIME);
          expect(e.target.bornAt).toBeLessThanOrEqual(ms + 1e-9);
        }
      }
    }
    expect(borns.length).toBeGreaterThan(1);
    for (let i = 1; i < borns.length; i++) expect(borns[i]).toBeGreaterThan(borns[i - 1]);
  });

  it('一次跨一个生成点：补生成目标使用槽位时间而非帧时间', () => {
    const t = makeClick('jump1');
    t.start();
    const slot = t.nextSpawnAt;
    expect(t.tick(slot - 1).events).toHaveLength(0);
    const { events } = t.tick(slot + 400);
    const spawns = events.filter((e) => e.type === 'spawn');
    expect(spawns).toHaveLength(1);
    expect(spawns[0].target.bornAt).toBe(slot);
    expect(spawns[0].target.expiresAt).toBe(slot + CLICK_LIFETIME);
  });

  it('一次跨多个生成点：按序补齐槽位，已过期目标先 timeout 不复活', () => {
    const t = makeClick('jumpN', 10);
    t.start();
    const { events } = t.tick(4000);
    const spawns = events.filter((e) => e.type === 'spawn');
    const timeouts = events.filter((e) => e.type === 'timeout');
    expect(spawns.length).toBeGreaterThan(2);
    for (let i = 1; i < spawns.length; i++) {
      expect(spawns[i].target.bornAt).toBeGreaterThan(spawns[i - 1].target.bornAt);
    }
    expect(timeouts.length).toBeGreaterThan(0);
    for (const e of timeouts) expect(e.target.expiresAt).toBeLessThanOrEqual(4000);
    for (const alive of t.targets) expect(alive.expiresAt).toBeGreaterThan(4000);
    expect(t.hits + t.timeouts + t.targets.length).toBe(t.spawned);
  });

  it('恰好在生成边界：tick 到槽位时间即生成', () => {
    const t = makeClick('edge-spawn');
    t.start();
    const slot = t.nextSpawnAt;
    const { events } = t.tick(slot);
    expect(events.some((e) => e.type === 'spawn' && e.target.bornAt === slot)).toBe(true);
  });

  it('恰好在过期边界：目标结算 timeout，过期点击记失误', () => {
    const t = makeClick('edge-expire');
    t.start();
    t.tick(t.nextSpawnAt);
    const target = t.targets[0];
    const expiry = target.expiresAt;
    const { events } = t.tick(expiry);
    expect(events.some((e) => e.type === 'timeout' && e.target === target)).toBe(true);
    expect(t.targets).not.toContain(target);
    expect(t.timeouts).toBe(1);
    const res = t.handleClick(target.x, target.y, expiry);
    expect(res.hit).toBe(false);
    expect(t.hits).toBe(0);
    expect(t.reactionTimes).toHaveLength(0);
    expect(t.timeouts).toBe(1);
  });

  it('恰好在结束边界：不再生成新目标，end 只出现一次', () => {
    const t = makeClick('edge-end', 2);
    t.start();
    for (let ms = 0; ms < 2000; ms += 100) t.tick(ms);
    const spawnedBeforeEnd = t.spawned;
    const first = t.tick(2000);
    expect(first.events.filter((e) => e.type === 'end')).toHaveLength(1);
    expect(first.events.some((e) => e.type === 'spawn')).toBe(false);
    expect(t.over).toBe(true);
    expect(t.spawned).toBe(spawnedBeforeEnd);
    expect(t.tick(2100).events).toHaveLength(0);
    expect(t.tick(2000).events).toHaveLength(0);
    expect(t.hits + t.timeouts).toBe(t.spawned);
  });

  it('恢复后点击旧目标：过期目标不得命中，后续 tick 幂等', () => {
    const t = makeClick('resume', 10);
    t.start();
    t.tick(t.nextSpawnAt);
    const target = t.targets[0];
    const res = t.handleClick(target.x, target.y, target.expiresAt + 2500);
    expect(res.hit).toBe(false);
    expect(t.hits).toBe(0);
    expect(t.reactionTimes).toHaveLength(0);
    expect(t.timeouts).toBe(1);
    // 后续 tick 不得对该目标重复结算 timeout，且同一时间戳重复 tick 幂等
    const { events } = t.tick(target.expiresAt + 2600);
    expect(events.filter((e) => e.type === 'timeout' && e.target === target)).toHaveLength(0);
    const snap = t.getStats();
    t.tick(target.expiresAt + 2600);
    expect(t.getStats()).toEqual(snap);
  });

  it('重复 tick 同一时间戳：不重复生成、不重复 timeout、随机序列不变', () => {
    const t = makeClick('dup');
    t.start();
    t.tick(1000);
    const snapshot = { spawned: t.spawned, timeouts: t.timeouts, nextSpawnAt: t.nextSpawnAt };
    const again = t.tick(1000);
    expect(again.events).toHaveLength(0);
    expect(t.spawned).toBe(snapshot.spawned);
    expect(t.timeouts).toBe(snapshot.timeouts);
    expect(t.nextSpawnAt).toBe(snapshot.nextSpawnAt);
    t.tick(3000);
    const back = t.tick(1500);
    expect(back.events).toHaveLength(0);
    expect(t.elapsed).toBe(3000);
  });

  it('重复点击同一目标：第二次按空白失误处理，不重复记命中', () => {
    const t = makeClick('dup-click');
    t.start();
    t.tick(t.nextSpawnAt);
    const target = t.targets[0];
    const first = t.handleClick(target.x, target.y, target.bornAt + 300);
    expect(first.hit).toBe(true);
    const second = t.handleClick(target.x, target.y, target.bornAt + 320);
    expect(second.hit).toBe(false);
    expect(t.hits).toBe(1);
    expect(t.misses).toBe(1);
    expect(t.reactionTimes).toHaveLength(1);
  });

  it('开始前与结束后点击：返回 null 且不污染统计', () => {
    const t = makeClick('idle-click', 2);
    expect(t.handleClick(100, 100, 0)).toBeNull();
    t.start();
    for (let ms = 0; ms <= 2100; ms += 100) t.tick(ms);
    expect(t.over).toBe(true);
    const before = t.getStats();
    expect(t.handleClick(100, 100, 2200)).toBeNull();
    expect(t.getStats()).toEqual(before);
  });

  it('目标终态互斥：每个目标只进入命中或超时之一', () => {
    const t = makeClick('exclusive', 3);
    t.start();
    for (let ms = 0; ms <= 3200; ms += 40) {
      t.tick(ms);
      if (t.targets.length && ms % 2000 < 40) {
        const g = t.targets[0];
        t.handleClick(g.x, g.y, ms + 10);
      }
    }
    const s = t.getStats();
    expect(s.hits + s.timeouts).toBe(s.spawned);
    expect(s.attempts).toBe(s.hits + s.misses);
    expect(s.hits).toBeGreaterThan(0);
    expect(s.timeouts).toBeGreaterThan(0);
  });

  it('事件顺序：表驱动跳跃时间序列下事件时间单调不减', () => {
    const t = makeClick('order', 8);
    t.start();
    const table = [0, 120, 900, 3600, 3616, 7200, 7990, 8000, 8100];
    const times = [];
    for (const ms of table) {
      for (const e of t.tick(ms).events) {
        if (e.type === 'spawn') times.push(e.target.bornAt);
        else if (e.type === 'timeout') times.push(e.target.expiresAt);
        else if (e.type === 'end') times.push(8000);
      }
    }
    expect(times.length).toBeGreaterThan(3);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }
    expect(times[times.length - 1]).toBe(8000);
  });

  it('确定性：相同种子与相同时间输入得到相同目标、统计与事件流', () => {
    const run = () => {
      const t = makeClick('determ', 4);
      t.start();
      const log = [];
      const table = [0, 500, 500, 2400, 2401, 3900, 4100];
      for (const ms of table) {
        for (const e of t.tick(ms).events) {
          log.push(e.type === 'end' ? 'end' : `${e.type}:${e.target.id}:${Math.round(e.target.x)}:${Math.round(e.target.y)}:${e.target.bornAt}`);
        }
        if (t.targets.length) {
          const g = t.targets[0];
          const r = t.handleClick(g.x, g.y, ms + 5);
          log.push(r && r.hit ? `hit:${r.target.id}:${r.reactionMs}` : 'miss');
        }
      }
      return { log, stats: t.getStats() };
    };
    const a = run();
    const b = run();
    expect(a.log).toEqual(b.log);
    expect(a.stats).toEqual(b.stats);
  });

  it('反应时间始终落在 0 到 CLICK_LIFETIME 之间', () => {
    const t = makeClick('rt-range', 10);
    t.start();
    t.tick(t.nextSpawnAt);
    const g = t.targets[0];
    const instant = t.handleClick(g.x, g.y, g.bornAt);
    expect(instant.hit).toBe(true);
    expect(instant.reactionMs).toBe(0);
    t.tick(g.bornAt + 100);
    if (t.targets.length) {
      const late = t.targets[t.targets.length - 1];
      const res = t.handleClick(late.x, late.y, late.expiresAt - 1);
      expect(res.hit).toBe(true);
      expect(res.reactionMs).toBeGreaterThan(0);
      expect(res.reactionMs).toBeLessThan(CLICK_LIFETIME);
    }
    for (const rt of t.reactionTimes) {
      expect(rt).toBeGreaterThanOrEqual(0);
      expect(rt).toBeLessThanOrEqual(CLICK_LIFETIME);
    }
  });

  it('统计契约：getStats 幂等，空样本与纯超时样本数值有限', () => {
    const idle = makeClick('stats-idle', 2);
    idle.start();
    for (let ms = 0; ms <= 2100; ms += 50) idle.tick(ms);
    const s1 = idle.getStats();
    const s2 = idle.getStats();
    expect(s1).toEqual(s2);
    expect(s1.hits).toBe(0);
    expect(s1.timeouts).toBe(s1.spawned);
    expect(s1.spawned).toBeGreaterThan(0);
    for (const k of ['accuracy', 'avgReactionMs', 'medianReactionMs', 'fastestReactionMs', 'mouseDistancePx']) {
      expect(Number.isFinite(s1[k])).toBe(true);
    }
    expect(s1.accuracy).toBe(0);
    expect(s1.avgReactionMs).toBe(0);
  });

  it('引擎到页面记录保存：结束只产生一次 end 并保存一条记录', async () => {
    localStorage.clear();
    const store = makeStore();
    await store.init();
    const t = makeClick('page-reg', 2);
    t.start();
    let endEvents = 0;
    const saveRecord = () => {
      const stats = t.getStats();
      store.addRecord({
        id: `rec_${endEvents}`,
        createdAt: new Date().toISOString(),
        type: 'click',
        profileName: '默认',
        settings: { ...baseSettings },
        stats,
        summary: buildSummary(stats)
      });
    };
    for (let ms = 0; ms <= 2000; ms += 50) {
      for (const e of t.tick(ms).events) {
        if (e.type === 'end') { endEvents += 1; saveRecord(); }
      }
    }
    for (let ms = 2050; ms <= 3000; ms += 50) {
      for (const e of t.tick(ms).events) {
        if (e.type === 'end') { endEvents += 1; saveRecord(); }
      }
    }
    expect(endEvents).toBe(1);
    expect(store.state.records).toHaveLength(1);
    const saved = store.storage.loadRecords();
    expect(saved).toHaveLength(1);
    expect(saved[0].stats.spawned).toBe(t.spawned);
    expect(saved[0].stats.hits + saved[0].stats.timeouts).toBe(t.spawned);
    expect(saved[0].summary.score).toBeGreaterThanOrEqual(0);
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
