import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { testPage } from '../src/pages/test.js';
import { renderShell } from '../src/shell.js';
import { DEFAULT_SETTINGS } from '../src/engine/settings.js';
import { RecoilTest } from '../src/engine/recoilTest.js';
import { TrackingTest } from '../src/engine/trackingTest.js';

const mounted = [];

function makeCtx(type = 'click') {
  const records = [];
  const store = {
    state: {
      settings: { ...DEFAULT_SETTINGS, duration: 5 },
      profiles: [],
      activeProfile: null,
      records
    },
    addRecord: vi.fn((r) => records.push(r)),
    subscribe: () => () => {}
  };
  const nav = [];
  const router = {
    route: { path: 'test', params: { type, fast: '1' } },
    go: (path) => nav.push(path)
  };
  return { store, router, records, nav };
}

function mountPage(type = 'click') {
  const ctx = makeCtx(type);
  const el = testPage(ctx);
  document.body.appendChild(el);
  const page = { ...ctx, el, arena: el.querySelector('.arena') };
  mounted.push(page);
  return page;
}

function pointerdown(target, x = 40, y = 40) {
  target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: y }));
}
function pointerupLeft() {
  document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
}
function mousemove(dx = 5, dy = 3) {
  const e = new MouseEvent('mousemove');
  e.movementX = dx;
  e.movementY = dy;
  document.dispatchEvent(e);
}
function beforeunloadEvent() {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e;
}

function mockPointerLock() {
  let locked = null;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
  document.exitPointerLock = vi.fn(() => { locked = null; });
  return {
    exit: document.exitPointerLock,
    lock: (el) => { locked = el; },
    lockOther: () => { locked = document.createElement('div'); },
    lockedEl: () => locked
  };
}

function startTest(page) {
  page.el.querySelector('#start-btn').click();
  vi.advanceTimersByTime(2600);
}
function runToFinish() {
  vi.advanceTimersByTime(40000);
}
function statePill(page) {
  return page.el.querySelector('#state-pill').textContent;
}

beforeEach(() => {
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  window.confirm = vi.fn(() => true);
});

afterEach(() => {
  for (const page of mounted.splice(0)) page.el.dispose?.();
  vi.useRealTimers();
  document.body.innerHTML = '';
  delete document.exitPointerLock;
  delete document.pointerLockElement;
  vi.restoreAllMocks();
});

describe('测试页生命周期', () => {
  it('运行中退出：取消 RAF、导航到选择页且不保存记录', () => {
    const p = mountPage('click');
    startTest(p);
    expect(statePill(p)).toBe('进行中');
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    p.el.querySelector('#quit-btn').click();
    expect(p.nav).toEqual(['select']);
    expect(cancelSpy).toHaveBeenCalled();
    expect(p.records).toHaveLength(0);
    const frozenTimer = p.el.querySelector('#timer').textContent;
    vi.advanceTimersByTime(10000);
    expect(p.el.querySelector('#timer').textContent).toBe(frozenTimer);
    expect(p.records).toHaveLength(0);
  });

  it('倒计时中退出：倒计时不再推进，不会进入运行态', () => {
    const p = mountPage('click');
    p.el.querySelector('#start-btn').click();
    vi.advanceTimersByTime(900);
    expect(statePill(p)).toBe('倒计时');
    p.el.querySelector('#quit-btn').click();
    expect(p.nav).toEqual(['select']);
    vi.advanceTimersByTime(10000);
    expect(statePill(p)).not.toBe('进行中');
    expect(p.records).toHaveLength(0);
  });

  it('暂停后退出：无需确认直接离开，资源被清理', () => {
    window.confirm = vi.fn(() => false);
    const p = mountPage('click');
    startTest(p);
    p.el.querySelector('#pause-btn').click();
    expect(p.el.querySelector('.overlay h2').textContent).toBe('测试已暂停');
    p.el.querySelector('#quit-btn').click();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(p.nav).toEqual(['select']);
    vi.advanceTimersByTime(10000);
    expect(p.records).toHaveLength(0);
  });

  it('自然完成：记录恰好一条，结果覆盖层可用', () => {
    const p = mountPage('click');
    startTest(p);
    runToFinish();
    expect(statePill(p)).toBe('已完成');
    expect(p.records).toHaveLength(1);
    expect(p.el.querySelector('.overlay h2').textContent).toBe('测试完成');
    vi.advanceTimersByTime(20000);
    expect(p.records).toHaveLength(1);
  });

  it('完成后再测一次：重新绑定一套监听并产生第二条记录', () => {
    const p = mountPage('click');
    startTest(p);
    runToFinish();
    expect(p.records).toHaveLength(1);
    p.el.querySelector('#again-btn').click();
    expect(p.el.querySelector('#start-btn')).toBeTruthy();
    startTest(p);
    expect(statePill(p)).toBe('进行中');
    vi.advanceTimersByTime(60000);
    expect(p.records).toHaveLength(2);
  });

  it('连续两次重开：不叠加监听，最终只产生一条记录', () => {
    const p = mountPage('click');
    startTest(p);
    p.el.querySelector('#restart-btn').click();
    p.el.querySelector('#start-btn').click();
    vi.advanceTimersByTime(2600);
    expect(statePill(p)).toBe('进行中');
    p.el.querySelector('#restart-btn').click();
    p.el.querySelector('#start-btn').click();
    vi.advanceTimersByTime(2600);
    runToFinish();
    expect(p.records).toHaveLength(1);
  });

  it('每种全局监听都有对称移除，dispose 幂等', () => {
    const docAdd = vi.spyOn(document, 'addEventListener');
    const docRemove = vi.spyOn(document, 'removeEventListener');
    const winAdd = vi.spyOn(window, 'addEventListener');
    const winRemove = vi.spyOn(window, 'removeEventListener');
    const p = mountPage('recoil');
    expect(docAdd).toHaveBeenCalledTimes(3);
    expect(winAdd).toHaveBeenCalledTimes(1);
    p.el.dispose();
    expect(docRemove).toHaveBeenCalledTimes(3);
    expect(winRemove).toHaveBeenCalledTimes(1);
    p.el.dispose();
    p.el.dispose();
    expect(docRemove).toHaveBeenCalledTimes(3);
    expect(winRemove).toHaveBeenCalledTimes(1);
  });

  it('旧实例 dispose 后不再响应全局事件，新实例输入只触发一次', () => {
    const a = mountPage('recoil');
    startTest(a);
    a.el.querySelector('#quit-btn').click();
    const b = mountPage('recoil');
    startTest(b);
    const spy = vi.spyOn(RecoilTest.prototype, 'setFiring');
    pointerdown(b.arena);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith(true);
    pointerupLeft();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(false);
    b.el.dispose();
    pointerdown(a.arena);
    pointerdown(b.arena);
    pointerupLeft();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('不同类型连续切换：旧实例的 mousemove 不再影响新实例', () => {
    const pl = mockPointerLock();
    const a = mountPage('recoil');
    a.arena.requestPointerLock = vi.fn(() => pl.lock(a.arena));
    startTest(a);
    a.el.querySelector('#quit-btn').click();
    const b = mountPage('tracking');
    b.arena.requestPointerLock = vi.fn(() => pl.lock(b.arena));
    startTest(b);
    const recoilSpy = vi.spyOn(RecoilTest.prototype, 'addMouseMove');
    const trackSpy = vi.spyOn(TrackingTest.prototype, 'setCrosshair');
    mousemove(10, 10);
    expect(recoilSpy).not.toHaveBeenCalled();
    expect(trackSpy).toHaveBeenCalledTimes(1);
  });

  it('beforeunload 仅在当前实例 running 时阻止离开', () => {
    const p = mountPage('click');
    expect(beforeunloadEvent().defaultPrevented).toBe(false);
    startTest(p);
    expect(beforeunloadEvent().defaultPrevented).toBe(true);
    p.el.querySelector('#pause-btn').click();
    expect(beforeunloadEvent().defaultPrevented).toBe(false);
    p.el.querySelector('#resume-btn').click();
    expect(beforeunloadEvent().defaultPrevented).toBe(true);
    p.el.querySelector('#quit-btn').click();
    expect(beforeunloadEvent().defaultPrevented).toBe(false);
  });

  it('完成后 beforeunload 不再阻止，dispose 后同样不阻止', () => {
    const p = mountPage('click');
    startTest(p);
    runToFinish();
    expect(statePill(p)).toBe('已完成');
    expect(beforeunloadEvent().defaultPrevented).toBe(false);
    p.el.dispose();
    expect(beforeunloadEvent().defaultPrevented).toBe(false);
  });

  it('退出时释放本实例持有的 Pointer Lock，不动其他元素的锁', () => {
    const pl = mockPointerLock();
    const p = mountPage('recoil');
    p.arena.requestPointerLock = vi.fn(() => pl.lock(p.arena));
    startTest(p);
    expect(p.arena.requestPointerLock).toHaveBeenCalled();
    expect(pl.lockedEl()).toBe(p.arena);
    p.el.querySelector('#quit-btn').click();
    expect(pl.exit).toHaveBeenCalledTimes(1);
    expect(pl.lockedEl()).toBe(null);

    const q = mountPage('click');
    startTest(q);
    pl.lockOther();
    q.el.dispose();
    expect(pl.exit).toHaveBeenCalledTimes(1);
    expect(pl.lockedEl()).not.toBe(null);
  });

  it('压枪暂停显式结束 firing，恢复后需重新按下才开火', () => {
    const pl = mockPointerLock();
    const p = mountPage('recoil');
    p.arena.requestPointerLock = vi.fn(() => pl.lock(p.arena));
    startTest(p);
    const spy = vi.spyOn(RecoilTest.prototype, 'setFiring');
    pointerdown(p.arena);
    vi.advanceTimersByTime(200);
    expect(statePill(p)).toContain('连射中');
    p.el.querySelector('#pause-btn').click();
    expect(spy).toHaveBeenLastCalledWith(false);
    p.el.querySelector('#resume-btn').click();
    vi.advanceTimersByTime(300);
    expect(statePill(p)).toBe('按住左键开火');
    pointerdown(p.arena);
    vi.advanceTimersByTime(100);
    expect(statePill(p)).toContain('连射中');
  });

  it('暂停/继续重复点击幂等，计时冻结且统计不丢', () => {
    const p = mountPage('click');
    startTest(p);
    vi.advanceTimersByTime(500);
    p.el.querySelector('#pause-btn').click();
    p.el.querySelector('#pause-btn').click();
    expect(statePill(p)).toBe('进行中');
    p.el.querySelector('#pause-btn').click();
    const frozen = p.el.querySelector('#timer').textContent;
    vi.advanceTimersByTime(2000);
    expect(p.el.querySelector('#timer').textContent).toBe(frozen);
    p.el.querySelector('#resume-btn').click();
    runToFinish();
    expect(p.records).toHaveLength(1);
  });

  it('路由切换时 renderShell 释放上一页的全部监听', () => {
    const docRemove = vi.spyOn(document, 'removeEventListener');
    const winRemove = vi.spyOn(window, 'removeEventListener');
    const ctx = makeCtx('click');
    const root = document.createElement('div');
    document.body.appendChild(root);
    renderShell(root, ctx);
    expect(root.querySelector('.arena')).toBeTruthy();
    ctx.router.route = { path: 'select', params: {} };
    renderShell(root, ctx);
    expect(docRemove).toHaveBeenCalledTimes(3);
    expect(winRemove).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.arena')).toBeFalsy();
    expect(beforeunloadEvent().defaultPrevented).toBe(false);
    ctx.router.route = { path: 'home', params: {} };
    expect(() => renderShell(root, ctx)).not.toThrow();
    expect(docRemove).toHaveBeenCalledTimes(3);
  });
});
