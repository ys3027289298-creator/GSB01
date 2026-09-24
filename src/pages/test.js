import { h, toast } from '../dom.js';
import { ClickTest } from '../engine/clickTest.js';
import { TurnTest } from '../engine/turnTest.js';
import { TrackingTest } from '../engine/trackingTest.js';
import { RecoilTest } from '../engine/recoilTest.js';
import { estimateDegPerPx } from '../engine/calibration.js';
import { buildSummary } from '../engine/scoring.js';

const TITLES = {
  click: '快速点击测试',
  turn: '快速转向测试',
  tracking: '移动目标跟踪',
  recoil: '压枪稳定性测试'
};
const INSTRUCTIONS = {
  click: '目标会随机出现并在约 1.6 秒后消失，尽快点击。点到空白处算失误。',
  turn: '点击开始后锁定鼠标，按提示方向转到目标处并单击开火。过头会回摆，注意控制。',
  tracking: '锁定鼠标后用准星持续贴住移动目标，全程不需要点击。目标会不断变速变向。',
  recoil: '锁定鼠标后按住左键连续射击，向下压枪把弹着点控制在稳定范围内，松开即停火。'
};

export function testPage(ctx) {
  const { store, router } = ctx;
  const type = router.route.params.type || 'click';
  if (!TITLES[type]) {
    router.go('select');
    return h('div', {}, '加载中…');
  }

  const arena = h('div', { class: 'arena', id: 'arena' });
  const timerEl = h('span', { class: 'timer', id: 'timer' }, '0.0 s');
  const progressBar = h('div');
  const progress = h('div', { class: 'progress' }, progressBar);
  const statePill = h('span', { class: 'pill', id: 'state-pill' }, '准备中');
  const pauseBtn = h('button', { class: 'ghost', id: 'pause-btn' }, '暂停');
  const restartBtn = h('button', { class: 'ghost', id: 'restart-btn' }, '重新开始');
  const quitBtn = h('button', { class: 'danger', id: 'quit-btn' }, '退出');
  pauseBtn.disabled = true;

  const hud = h('div', { class: 'hud' }, [
    h('strong', {}, TITLES[type]), statePill, timerEl, progress,
    pauseBtn, restartBtn, quitBtn
  ]);
  const wrap = h('div', { class: 'arena-wrap' }, [hud, arena]);

  const settings = store.state.settings;
  const fastMode = router.route.params.fast === '1';
  const durationSec = fastMode ? 5 : settings.duration;
  const durationMs = durationSec * 1000;
  const seed = `${type}-${Date.now()}`;
  let engine = null;
  let phase = 'idle';
  let rafId = null;
  let lastTs = 0;
  let runStartTs = 0;
  let pausedAccum = 0;
  let pauseStart = 0;
  let countdownLeft = 3;
  let countdownTimer = null;
  let finishRecorded = false;
  const profileName = store.state.profiles.find((p) => p.id === store.state.activeProfile)?.name || '默认';

  function sizeArena() {
    const rect = arena.getBoundingClientRect();
    return { width: Math.max(320, rect.width), height: Math.max(240, rect.height) };
  }

  function makeEngine() {
    const { width, height } = sizeArena();
    if (type === 'click') return new ClickTest({ width, height, settings, durationSec, seed });
    if (type === 'turn') return new TurnTest({ settings, durationSec, seed, degPerPx: estimateDegPerPx(settings) });
    if (type === 'tracking') return new TrackingTest({ width, height, settings, durationSec, seed });
    return new RecoilTest({ width, height, settings, durationSec, seed });
  }

  function overlay(content) {
    arena.querySelector('.overlay')?.remove();
    const el = h('div', { class: 'overlay' }, content);
    arena.appendChild(el);
    return el;
  }
  function removeOverlay() { arena.querySelector('.overlay')?.remove(); }

  function showStartOverlay() {
    phase = 'idle';
    overlay([
      h('h2', {}, TITLES[type]),
      h('p', { class: 'muted', style: { maxWidth: '560px' } }, INSTRUCTIONS[type]),
      h('p', { class: 'muted' }, `时长 ${settings.duration} 秒 · 目标 ${({ small: '小', medium: '中', large: '大' })[settings.targetSize]} · 速度 ${({ slow: '慢', medium: '中', fast: '快' })[settings.targetSpeed]} · 难度 ${({ easy: '简单', normal: '普通', hard: '困难' })[settings.difficulty]}（方案：${profileName}）`),
      h('button', { id: 'start-btn' }, '开始测试')
    ]);
    arena.querySelector('#start-btn').addEventListener('click', startCountdown);
  }

  function startCountdown() {
    engine = makeEngine();
    phase = 'countdown';
    countdownLeft = 3;
    statePill.textContent = '倒计时';
    renderCountdown();
  }

  function renderCountdown() {
    overlay([
      h('div', { class: 'count', id: 'count-num' }, String(countdownLeft)),
      h('div', { class: 'muted' }, '准备好鼠标，保持专注')
    ]);
    clearTimeout(countdownTimer);
    countdownTimer = setTimeout(function tick() {
      if (phase !== 'countdown') return;
      countdownLeft -= 1;
      if (countdownLeft <= 0) beginRun();
      else {
        const num = document.getElementById('count-num');
        if (num) num.textContent = String(countdownLeft);
        countdownTimer = setTimeout(tick, 800);
      }
    }, 800);
  }

  function beginRun() {
    removeOverlay();
    phase = 'running';
    pauseBtn.disabled = false;
    statePill.textContent = '进行中';
    statePill.className = 'pill good';
    runStartTs = performance.now();
    pausedAccum = 0;
    lastTs = runStartTs;
    engine.start();
    if (type === 'turn' || type === 'tracking' || type === 'recoil') {
      arena.requestPointerLock?.();
    }
    rafId = requestAnimationFrame(loop);
  }

  function loop(ts) {
    if (phase !== 'running') return;
    // 引擎时间轴与 performance.now() 同原点，只扣除暂停累计时长，
    // 暂停期间目标年龄不推进，恢复后也不补算暂停时长。
    const engineTs = ts - pausedAccum;
    const dt = ts - lastTs;
    lastTs = ts;
    if (type === 'click') { engine.tick(engineTs); renderClick(); }
    else if (type === 'turn') { engine.tick(engineTs); renderTurn(); }
    else if (type === 'tracking') { engine.tick(engineTs, dt); renderTracking(); }
    else { const st = engine.tick(engineTs, dt); renderRecoil(st); }
    const elapsed = engine.elapsed || 0;
    const remain = Math.max(0, durationMs - elapsed);
    timerEl.textContent = `${(remain / 1000).toFixed(1)} s`;
    progressBar.style.width = `${Math.min(100, elapsed / durationMs * 100)}%`;
    if (engine.over) { finish(); return; }
    rafId = requestAnimationFrame(loop);
  }

  function renderClick() {
    arena.querySelectorAll('.target').forEach((n) => n.remove());
    for (const t of engine.targets) {
      arena.appendChild(h('div', {
        class: 'target',
        style: { left: `${t.x}px`, top: `${t.y}px`, width: `${t.r * 2}px`, height: `${t.r * 2}px` }
      }));
    }
  }

  function renderTurn() {
    arena.querySelector('.turn-info')?.remove();
    arena.querySelectorAll('.target').forEach((n) => n.remove());
    if (!engine.current) return;
    const { width, height } = sizeArena();
    const err = ((engine.current.goalYaw - engine.yaw) * Math.PI) / 180;
    const indicatorX = width / 2 + Math.tan(Math.max(-1.2, Math.min(1.2, err))) * width * 0.32;
    arena.appendChild(h('div', {
      class: 'target turn-target',
      style: { left: `${indicatorX}px`, top: `${height / 2}px`, width: '56px', height: '56px' }
    }));
    const dir = engine.current.targetAngle > 0 ? '右' : '左';
    arena.appendChild(h('div', {
      class: 'turn-info locked-hint', style: { top: '56px' }
    }, `第 ${engine.current.index + 1}/12 个目标：向${dir}转 ${Math.abs(engine.current.targetAngle)}°，到位后单击`));
  }

  function renderTracking() {
    let dot = arena.querySelector('.target');
    if (!dot) { dot = h('div', { class: 'target turn-target' }); arena.appendChild(dot); }
    dot.style.left = `${engine.target.x}px`;
    dot.style.top = `${engine.target.y}px`;
    dot.style.width = `${engine.radius * 2}px`;
    dot.style.height = `${engine.radius * 2}px`;
    let cross = arena.querySelector('.crosshair');
    if (!cross) { cross = h('div', { class: 'crosshair' }); arena.appendChild(cross); }
    cross.style.left = `${engine.crosshair.x}px`;
    cross.style.top = `${engine.crosshair.y}px`;
  }

  function renderRecoil(state) {
    arena.querySelectorAll('.trail-dot').forEach((n) => n.remove());
    for (const p of engine.trail.filter((_, i) => i % 4 === 0)) {
      arena.appendChild(h('div', { class: 'trail-dot', style: { left: `${p.x}px`, top: `${p.y}px` } }));
    }
    let ring = arena.querySelector('.target');
    if (!ring) {
      ring = h('div', { class: 'target turn-target', style: { width: `${engine.radius * 2}px`, height: `${engine.radius * 2}px` } });
      arena.appendChild(ring);
    }
    ring.style.left = `${engine.center.x}px`;
    ring.style.top = `${engine.center.y}px`;
    let cross = arena.querySelector('.crosshair');
    if (!cross) { cross = h('div', { class: 'crosshair' }); arena.appendChild(cross); }
    cross.style.left = `${engine.crosshair.x}px`;
    cross.style.top = `${engine.crosshair.y}px`;
    statePill.textContent = engine.firing ? `连射中 · ${state?.shots ?? 0} 发` : '按住左键开火';
  }

  function pause() {
    if (phase !== 'running') return;
    phase = 'paused';
    pauseStart = performance.now();
    cancelAnimationFrame(rafId);
    pauseBtn.textContent = '继续';
    statePill.textContent = '已暂停';
    statePill.className = 'pill warn';
    if (document.pointerLockElement) document.exitPointerLock();
    overlay([
      h('h2', {}, '测试已暂停'),
      h('p', { class: 'muted' }, '计时与目标已冻结，点击“继续”恢复。结果不会丢失。'),
      h('button', { id: 'resume-btn' }, '继续测试')
    ]);
    document.getElementById('resume-btn').addEventListener('click', resume);
  }

  function resume() {
    if (phase !== 'paused') return;
    removeOverlay();
    pausedAccum += performance.now() - pauseStart;
    phase = 'running';
    pauseBtn.textContent = '暂停';
    statePill.textContent = '进行中';
    statePill.className = 'pill good';
    lastTs = performance.now();
    if ((type === 'turn' || type === 'tracking' || type === 'recoil') && document.pointerLockElement !== arena) {
      arena.requestPointerLock?.();
    }
    rafId = requestAnimationFrame(loop);
  }

  function restart() {
    cancelAnimationFrame(rafId);
    clearTimeout(countdownTimer);
    if (document.pointerLockElement) document.exitPointerLock();
    finishRecorded = false;
    arena.querySelectorAll('.target,.crosshair,.trail-dot,.turn-info').forEach((n) => n.remove());
    pauseBtn.disabled = true;
    pauseBtn.textContent = '暂停';
    timerEl.textContent = '0.0 s';
    progressBar.style.width = '0%';
    statePill.textContent = '准备中';
    statePill.className = 'pill';
    showStartOverlay();
  }

  function finish() {
    if (finishRecorded) return;
    finishRecorded = true;
    phase = 'over';
    cancelAnimationFrame(rafId);
    clearTimeout(countdownTimer);
    pauseBtn.disabled = true;
    statePill.textContent = '已完成';
    statePill.className = 'pill good';
    if (document.pointerLockElement) document.exitPointerLock();
    const stats = engine.getStats();
    const summary = buildSummary(stats);
    const record = {
      id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      type,
      profileName,
      settings: { ...settings },
      stats,
      summary
    };
    store.addRecord(record);
    overlay([
      h('h2', {}, '测试完成'),
      h('p', { class: 'muted' }, `综合评分 ${summary.score}（${summary.grade}）`),
      h('div', { class: 'btnrow', style: { justifyContent: 'center' } }, [
        h('button', { id: 'view-result' }, '查看详细结果'),
        h('button', { class: 'ghost', id: 'again-btn' }, '再测一次'),
        h('button', { class: 'ghost', id: 'back-settings' }, '返回设置')
      ])
    ]);
    document.getElementById('view-result').addEventListener('click', () => router.go('result', { id: record.id }));
    document.getElementById('again-btn').addEventListener('click', restart);
    document.getElementById('back-settings').addEventListener('click', () => router.go('settings'));
  }

  arena.addEventListener('pointerdown', (e) => {
    if (phase !== 'running') return;
    if (type === 'click') {
      const rect = arena.getBoundingClientRect();
      const result = engine.handleClick(
        e.clientX - rect.left,
        e.clientY - rect.top,
        performance.now() - pausedAccum
      );
      if (result && result.hit) toast(`命中 · 反应 ${Math.round(result.reactionMs)} ms`, 700);
      else if (result) toast('失误：点到空白区域', 600);
    } else if (type === 'turn') {
      engine.click();
      renderTurn();
    } else if (type === 'recoil') {
      engine.setFiring(true);
    }
  });

  document.addEventListener('pointerup', (e) => {
    if (type === 'recoil' && engine && phase === 'running' && e.button === 0) {
      engine.setFiring(false);
    }
  });

  document.addEventListener('pointerlockerror', () => {
    if (phase === 'running' || phase === 'countdown') {
      toast('鼠标锁定失败，请在浏览器地址栏允许指针锁定后重试。', 3200);
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (phase !== 'running' || document.pointerLockElement !== arena) return;
    if (type === 'turn') {
      engine.addMouseDelta(e.movementX);
    } else if (type === 'tracking') {
      const { width, height } = sizeArena();
      engine.setCrosshair(
        Math.max(0, Math.min(width, engine.crosshair.x + e.movementX)),
        Math.max(0, Math.min(height, engine.crosshair.y + e.movementY))
      );
    } else if (type === 'recoil') {
      const { width, height } = sizeArena();
      engine.addMouseMove(e.movementX, e.movementY);
      engine.setCrosshair(
        Math.max(0, Math.min(width, engine.crosshair.x + e.movementX)),
        Math.max(0, Math.min(height, engine.crosshair.y + e.movementY))
      );
    }
  });

  pauseBtn.addEventListener('click', () => {
    if (phase === 'running') pause();
    else if (phase === 'paused') resume();
  });
  restartBtn.addEventListener('click', () => {
    if (phase === 'running' || phase === 'paused') {
      if (!confirm('确定重新开始？当前进度将被清除（不会保存记录）。')) return;
    }
    restart();
  });
  quitBtn.addEventListener('click', () => {
    if (phase === 'running' && !confirm('测试进行中，退出将丢失本次结果。确定退出吗？')) return;
    cancelAnimationFrame(rafId);
    clearTimeout(countdownTimer);
    if (document.pointerLockElement) document.exitPointerLock();
    router.go('select');
  });

  window.addEventListener('beforeunload', (e) => {
    if (phase === 'running') { e.preventDefault(); e.returnValue = ''; }
  }, { once: true });

  showStartOverlay();
  return wrap;
}
