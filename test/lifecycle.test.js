import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { testPage } from '../src/pages/test.js';
import { makeStore } from '../src/state.js';

let rafQueue;
let rafSeq;
const liveInstances = [];

function stubRaf() {
  rafQueue = new Map();
  rafSeq = 0;
  vi.stubGlobal('requestAnimationFrame', (cb) => {
    const id = ++rafSeq;
    rafQueue.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => {
    rafQueue.delete(id);
  });
}

function flushRaf(ts) {
  const cbs = [...rafQueue.values()];
  rafQueue.clear();
  for (const cb of cbs) cb(ts);
}

function mountTest(type, params = {}) {
  const store = makeStore();
  const router = {
    route: { path: 'test', params: { type, fast: '1', ...params } },
    go: vi.fn()
  };
  const disposers = [];
  const ctx = {
    store,
    router,
    main: document.getElementById('app'),
    onDispose: (fn) => disposers.push(fn)
  };
  const el = testPage(ctx);
  document.getElementById('app').appendChild(el);
  const instance = {
    store,
    router,
    el,
    arena: el.querySelector('#arena'),
    statePill: el.querySelector('#state-pill'),
    pauseBtn: el.querySelector('#pause-btn'),
    restartBtn: el.querySelector('#restart-btn'),
    quitBtn: el.querySelector('#quit-btn'),
    dispose: () => disposers.forEach((fn) => fn())
  };
  liveInstances.push(instance);
  return instance;
}

function startAndRun(m) {
  m.el.querySelector('#start-btn').click();
  vi.advanceTimersByTime(800 * 3);
  return performance.now();
}

function pointerdown(target, button = 0) {
  target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button }));
}

function beforeUnloadEvent() {
  const ev = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(ev);
  return ev;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  localStorage.clear();
  stubRaf();
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  while (liveInstances.length) liveInstances.pop().dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete document.pointerLockElement;
  delete document.exitPointerLock;
});

describe('测试页生命周期', () => {
  it('运行中退出：取消 RAF、释放资源、不再保存记录', () => {
    const m = mountTest('click');
    const t0 = startAndRun(m);
    flushRaf(t0 + 16);
    expect(rafQueue.size).toBe(1);
    m.quitBtn.click();
    expect(m.router.go).toHaveBeenCalledWith('select');
    expect(rafQueue.size).toBe(0);
    flushRaf(t0 + 32);
    vi.advanceTimersByTime(10000);
    expect(m.store.state.records).toHaveLength(0);
  });

  it('倒计时中退出：countdown timeout 被清理，引擎不会启动', () => {
    const m = mountTest('click');
    m.el.querySelector('#start-btn').click();
    vi.advanceTimersByTime(800);
    expect(m.statePill.textContent).toBe('倒计时');
    m.quitBtn.click();
    expect(m.router.go).toHaveBeenCalledWith('select');
    vi.advanceTimersByTime(10000);
    expect(rafQueue.size).toBe(0);
    expect(m.store.state.records).toHaveLength(0);
  });

  it('暂停后退出：不拦截 beforeunload，且不产生记录', () => {
    const m = mountTest('click');
    const t0 = startAndRun(m);
    flushRaf(t0 + 16);
    m.pauseBtn.click();
    expect(m.statePill.textContent).toBe('已暂停');
    m.quitBtn.click();
    expect(m.router.go).toHaveBeenCalledWith('select');
    expect(beforeUnloadEvent().defaultPrevented).toBe(false);
    expect(m.store.state.records).toHaveLength(0);
  });

  it('自然完成：只保存一条记录，重复帧不会重复记录', () => {
    const m = mountTest('click');
    const t0 = startAndRun(m);
    flushRaf(t0 + 5100);
    expect(m.statePill.textContent).toBe('已完成');
    expect(m.store.state.records).toHaveLength(1);
    flushRaf(t0 + 5200);
    vi.advanceTimersByTime(5000);
    expect(m.store.state.records).toHaveLength(1);
    expect(m.el.querySelector('#view-result')).toBeTruthy();
  });

  it('完成后再测一次：监听器不叠加，仍是同一套', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const m = mountTest('click');
    const t0 = startAndRun(m);
    flushRaf(t0 + 5100);
    const addsAfterFirstRun = addSpy.mock.calls.length;
    m.el.querySelector('#again-btn').click();
    expect(addSpy.mock.calls.length).toBe(addsAfterFirstRun);
    const t1 = startAndRun(m);
    flushRaf(t1 + 5100);
    expect(m.store.state.records).toHaveLength(2);
    addSpy.mockRestore();
  });

  it('连续两次重新开始：不叠加监听、不产生记录', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const m = mountTest('recoil');
    const t0 = startAndRun(m);
    flushRaf(t0 + 16);
    const baseAdds = addSpy.mock.calls.length;
    m.restartBtn.click();
    m.restartBtn.click();
    expect(addSpy.mock.calls.length).toBe(baseAdds);
    expect(m.el.querySelector('#start-btn')).toBeTruthy();
    vi.advanceTimersByTime(10000);
    expect(m.store.state.records).toHaveLength(0);
    addSpy.mockRestore();
  });

  it('路由离开后旧实例被 dispose，新实例只收到自己的输入', () => {
    let locked = null;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
    document.exitPointerLock = vi.fn(() => { locked = null; });

    const a = mountTest('tracking');
    const t0 = startAndRun(a);
    locked = a.arena;
    flushRaf(t0 + 16);
    a.dispose();
    expect(document.exitPointerLock).toHaveBeenCalledTimes(1);

    const b = mountTest('tracking');
    const t1 = startAndRun(b);
    locked = b.arena;
    flushRaf(t1 + 16);
    const move = new MouseEvent('mousemove', { bubbles: true });
    move.movementX = 10;
    move.movementY = 0;
    document.dispatchEvent(move);
    flushRaf(t1 + 32);
    const cross = b.el.querySelector('.crosshair');
    expect(cross.style.left).toBe('170px');
    b.dispose();
  });

  it('dispose 后旧实例的 document 监听被对称移除且不再响应', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const m = mountTest('recoil');
    startAndRun(m);
    m.dispose();
    const removedTypes = removeSpy.mock.calls.map((c) => c[0]);
    expect(removedTypes).toEqual(expect.arrayContaining(['pointerup', 'pointerlockerror', 'mousemove']));
    pointerdown(m.arena);
    document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    document.dispatchEvent(new Event('pointerlockerror'));
    expect(document.getElementById('toast').textContent).toBe('');
    expect(m.store.state.records).toHaveLength(0);
    removeSpy.mockRestore();
  });

  it('beforeunload 只在当前实例 running 时阻止离开', () => {
    const m = mountTest('click');
    expect(beforeUnloadEvent().defaultPrevented).toBe(false);
    const t0 = startAndRun(m);
    expect(beforeUnloadEvent().defaultPrevented).toBe(true);
    m.pauseBtn.click();
    expect(beforeUnloadEvent().defaultPrevented).toBe(false);
    m.pauseBtn.click();
    flushRaf(t0 + 16);
    expect(beforeUnloadEvent().defaultPrevented).toBe(true);
    m.dispose();
    expect(beforeUnloadEvent().defaultPrevented).toBe(false);
  });

  it('dispose 幂等：只释放自己持有的 Pointer Lock，可重复调用', () => {
    let locked = null;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
    document.exitPointerLock = vi.fn(() => { locked = null; });

    const m = mountTest('tracking');
    startAndRun(m);
    locked = m.arena;
    m.dispose();
    m.dispose();
    expect(document.exitPointerLock).toHaveBeenCalledTimes(1);
    expect(locked).toBeNull();

    const other = mountTest('tracking');
    startAndRun(other);
    locked = document.createElement('div');
    document.exitPointerLock.mockClear();
    other.dispose();
    expect(document.exitPointerLock).not.toHaveBeenCalled();
  });

  it('压枪暂停会结束 firing，恢复后需重新按下才开火', () => {
    const m = mountTest('recoil');
    const t0 = startAndRun(m);
    pointerdown(m.arena);
    flushRaf(t0 + 32);
    expect(m.statePill.textContent).toContain('连射中');
    m.pauseBtn.click();
    m.pauseBtn.click();
    flushRaf(t0 + 64);
    expect(m.statePill.textContent).toBe('按住左键开火');
    pointerdown(m.arena);
    flushRaf(t0 + 96);
    expect(m.statePill.textContent).toContain('连射中');
    document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    flushRaf(t0 + 128);
    expect(m.statePill.textContent).toBe('按住左键开火');
  });

  it('单次输入只触发一次：旧实例不拦截新实例事件', () => {
    const first = mountTest('click');
    const t0 = startAndRun(first);
    flushRaf(t0 + 16);
    first.dispose();
    const second = mountTest('click');
    const t1 = startAndRun(second);
    flushRaf(t1 + 16);
    pointerdown(second.arena);
    const toasts = document.getElementById('toast').textContent;
    expect(toasts).toContain('失误');
    expect(second.store.state.records).toHaveLength(0);
    expect(first.store.state.records).toHaveLength(0);
    second.dispose();
  });
});
