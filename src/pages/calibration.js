import { h } from '../dom.js';
import { toast } from '../dom.js';
import { CalibrationSession, CALIB_ANGLES, estimateDegPerPx, detectPointerSupport } from '../engine/calibration.js';

export function calibrationPage({ store, router }) {
  const support = detectPointerSupport();
  const s = store.state.settings;

  const log = h('div', { class: 'logline', style: { marginTop: '12px', minHeight: '42px' } },
    s.cmPer360 ? `已保存校准结果：${s.cmPer360} cm / 360°，将用于后续测试的视角换算。`
      : '尚未校准。建议先进行 360° 转身测试（从鼠标垫一端水平移动到另一端）。');

  const arena = h('div', {
    class: 'arena',
    style: { height: '300px' },
    tabindex: '0'
  }, [
    h('div', { class: 'locked-hint', id: 'calib-hint' }, '点击下方按钮开始，进入鼠标锁定后水平移动鼠标'),
    h('div', { class: 'crosshair', id: 'calib-cross', style: { left: '50%', top: '50%' } })
  ]);

  const status = h('div', { class: 'grid grid-3', style: { marginTop: '12px' } }, [
    metric('实际移动距离', '-- px', 'calib-move'),
    metric('视角变化', '--°', 'calib-view'),
    metric('完成时间', '--', 'calib-time')
  ]);

  let session = null;
  let currentAngle = 360;

  function setMetric(move, view, time) {
    document.getElementById('calib-move').textContent = move;
    document.getElementById('calib-view').textContent = view;
    document.getElementById('calib-time').textContent = time;
  }

  function onMove(e) {
    if (!session || !session.active) return;
    session.addMove(e.movementX);
    const cross = document.getElementById('calib-cross');
    if (cross) {
      const left = 50 + Math.max(-40, Math.min(40, session.viewDeg / currentAngle * 80));
      cross.style.left = `${left}%`;
    }
    document.getElementById('calib-move').textContent = `${Math.round(session.movePx)} px`;
    document.getElementById('calib-view').textContent = `${session.viewDeg.toFixed(1)}° / ${currentAngle}°`;
  }

  function onLockChange() {
    const locked = document.pointerLockElement === arena;
    arena.classList.toggle('locked', locked);
    const hint = document.getElementById('calib-hint');
    if (locked) {
      hint.textContent = '鼠标已锁定：水平匀速移动，转够角度后单击鼠标结束';
    } else if (session && session.active) {
      const result = session.finish();
      hint.textContent = '鼠标锁定已退出，本次校准未完成';
      return result;
    }
  }

  function begin(angle) {
    currentAngle = angle;
    const guess = estimateDegPerPx(store.state.settings);
    session = new CalibrationSession({ targetDeg: angle, degPerPxGuess: guess, dpi: store.state.settings.dpi });
    session.begin();
    setMetric('0 px', `0° / ${angle}°`, '进行中…');
    arena.requestPointerLock?.();
  }

  function endCalibration() {
    if (!session || !session.active) return;
    const result = session.finish();
    if (document.pointerLockElement) document.exitPointerLock();
    if (!result || result.movePx < 20) {
      toast('移动距离过小，校准无效，请重新尝试。');
      return;
    }
    setMetric(`${result.movePx} px`, `${result.viewDeg}°`, `${(result.elapsedMs / 1000).toFixed(2)} s`);
    const record = {
      id: `cal_${Date.now()}`,
      createdAt: new Date().toISOString(),
      type: 'calibration',
      profileName: store.state.profiles.find((p) => p.id === store.state.activeProfile)?.name || '默认',
      settings: { ...store.state.settings },
      stats: result,
      summary: null
    };
    store.addRecord(record);
    if (result.cmPer360) {
      store.updateSettings({ cmPer360: result.cmPer360 });
    }
    log.textContent = `校准完成：目标 ${result.targetDeg}°，实际 ${result.viewDeg}°，移动 ${result.movePx} px，用时 ${(result.elapsedMs / 1000).toFixed(2)} s，估算 ${result.cmPer360 ?? '--'} cm/360°。结果已保存。`;
    toast('校准结果已保存并应用。');
  }

  arena.addEventListener('pointerdown', () => {
    if (document.pointerLockElement === arena) endCalibration();
  });
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('mousemove', onMove);

  const angleButtons = CALIB_ANGLES.map((angle) =>
    h('button', { class: 'ghost', onclick: () => begin(angle) }, `${angle}° 转身测试`)
  );

  const unsupported = !support.supported
    ? h('div', { class: 'danger-banner' }, [
        h('strong', {}, '浏览器不支持必要的鼠标功能：'),
        h('div', {}, support.issues.join(' ')),
        h('div', { class: 'muted', style: { marginTop: '8px' } }, '请使用最新版 Chrome / Edge / Firefox，并在桌面设备上通过鼠标进行校准。')
      ])
    : null;

  return h('div', { class: 'wrap' }, [
    unsupported,
    h('div', { class: 'card' }, [
      h('h2', {}, '鼠标校准'),
      h('p', { class: 'muted' }, '点击角度按钮进入鼠标锁定（Pointer Lock），保持视角水平，从鼠标垫一侧匀速移动到另一侧完成对应角度的转身，然后单击鼠标结束。系统会记录实际移动像素、视角变化与用时，并换算 cm/360°。'),
      h('div', { class: 'btnrow' }, angleButtons),
      arena,
      status,
      log,
      h('div', { class: 'btnrow' }, [
        h('button', { onclick: () => router.go('select') }, '校准完成，去选择测试')
      ])
    ])
  ]);
}

function metric(k, v, id) {
  return h('div', { class: 'metric' }, [
    h('div', { class: 'k' }, k),
    h('div', { class: 'v', id }, v)
  ]);
}
