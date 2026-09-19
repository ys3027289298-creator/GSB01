import { createTest } from '../engine/createTest.js'
import { scoreClick, scoreFlick, scoreTracking, scoreRecoil, buildAdvice } from '../engine/scoring.js'
import { persistRecord } from '../record.js'
import { sensitivityInfo } from '../state.js'

const SCORERS = { click: scoreClick, flick: scoreFlick, tracking: scoreTracking, recoil: scoreRecoil }

export function mountArena(container, opts) {
  const { kind, settings, seed, profileName, settingsOverride, onDone, onQuit } = opts
  let test = createTest(kind, settings, seed)
  const w = test.ctx.width
  const h = test.ctx.height
  let phase = 'ready'
  let raf = null
  let lastTs = 0
  let countdownLeft = 3
  let locked = false
  let lastClient = null

  container.innerHTML = `
    <div class="arena-wrap" style="aspect-ratio:${w}/${h}">
      <canvas id="cv" width="${w}" height="${h}"></canvas>
      <div class="hud">
        <div class="group">
          <span class="chip">剩余 <b id="arTime">${settings.duration}</b>s</span>
          <span class="chip" id="arLive"></span>
        </div>
        <div class="group"><span class="chip" id="arLock"></span></div>
      </div>
      <div class="bar"><i id="arProg" style="width:0%"></i></div>
      <div class="overlay" id="arOv">
        <h2 id="arOvTitle">准备开始</h2>
        <p class="note" id="arOvText" style="max-width:560px"></p>
        <button class="primary" id="arOvBtn">开始测试</button>
        <p class="note" id="arOvHint"></p>
      </div>
    </div>
    <div class="controls-bar">
      <button id="arPause" disabled>暂停</button>
      <button id="arRestart">重新开始</button>
      <button id="arQuit">退出测试</button>
      <span class="note" id="arWarn" style="display:none;color:var(--warn)">测试进行中：已自动暂停，确认退出不会丢失已保存的历史记录。</span>
    </div>
  `

  const cv = container.querySelector('#cv')
  const g = cv.getContext('2d')
  const ov = container.querySelector('#arOv')
  const ovTitle = container.querySelector('#arOvTitle')
  const ovText = container.querySelector('#arOvText')
  const ovBtn = container.querySelector('#arOvBtn')
  const ovHint = container.querySelector('#arOvHint')
  const pauseBtn = container.querySelector('#arPause')
  const timeEl = container.querySelector('#arTime')
  const liveEl = container.querySelector('#arLive')
  const progEl = container.querySelector('#arProg')
  const lockEl = container.querySelector('#arLock')

  const INSTRUCTIONS = {
    click: '目标在随机位置、以随机大小出现，尽快点击；点空白记为失误，超时未点记为漏点。',
    flick: '目标出现在视野不同方向，甩动鼠标转向后点击；系统记录过转与欠转。',
    tracking: '目标持续变速变向移动，移动准星持续跟随，全程采样偏离时间与抖动。',
    recoil: '按住左键持续开火，准星受后坐力上跳，向下压住并保持在绿色稳定圈内。'
  }
  ovText.textContent = INSTRUCTIONS[kind]
  ovHint.textContent = kind === 'click'
    ? '本测试无需锁定鼠标，直接移动并点击即可。'
    : '建议开始后锁定鼠标（Esc 解锁，解锁会自动暂停）。'
  lockEl.textContent = kind === 'click' ? '点击模式：直接移动鼠标' : '未锁定'

  function setOverlay(show, title, text, btnLabel) {
    ov.classList.toggle('hidden', !show)
    container.querySelector('.arena-wrap').dataset.state = phase
    if (title !== undefined) ovTitle.textContent = title
    if (text !== undefined) ovText.textContent = text
    if (btnLabel !== undefined) ovBtn.textContent = btnLabel
    ovBtn.style.display = btnLabel === '' ? 'none' : ''
  }

  function requestLock() {
    if (kind !== 'click' && cv.requestPointerLock && !locked) {
      try { cv.requestPointerLock() } catch { /* 不支持也能玩 */ }
    }
  }
  function releaseLock() {
    if (document.pointerLockElement === cv) document.exitPointerLock()
  }

  function startCountdown() {
    phase = 'countdown'
    countdownLeft = 3
    pauseBtn.disabled = true
    requestLock()
    tickCountdown()
  }
  function tickCountdown() {
    if (phase !== 'countdown') return
    if (countdownLeft > 0) {
      setOverlay(true, String(countdownLeft), '把鼠标放到中心位置，测试即将开始', '')
      countdownLeft -= 1
      setTimeout(tickCountdown, 700)
    } else {
      beginRun()
    }
  }
  function beginRun() {
    phase = 'running'
    test.start()
    lastTs = performance.now()
    setOverlay(false)
    pauseBtn.disabled = false
    pauseBtn.textContent = '暂停'
    raf = requestAnimationFrame(loop)
  }

  function loop(ts) {
    if (phase !== 'running') return
    const dt = Math.min(50, ts - lastTs)
    lastTs = ts
    test.update(dt)
    draw()
    updateHud()
    if (test.ctx.state === 'finished') {
      finish()
      return
    }
    raf = requestAnimationFrame(loop)
  }

  function updateHud() {
    timeEl.textContent = Math.ceil(test.ctx.timeLeft)
    progEl.style.width = `${(test.ctx.progress * 100).toFixed(1)}%`
    const r = test.result()
    if (kind === 'click') liveEl.textContent = `命中 ${r.hits} · 失误 ${r.misses} · 漏点 ${r.timeouts}`
    if (kind === 'flick') liveEl.textContent = `命中 ${r.hits} · 过转 ${r.overCount} · 欠转 ${r.underCount}`
    if (kind === 'tracking') liveEl.textContent = `在靶 ${r.onTargetRate}% · 偏离 ${(r.offTimeMs / 1000).toFixed(1)}s`
    if (kind === 'recoil') liveEl.textContent = `控制 ${r.controlRate}% · 偏移 ${r.avgOffset}px`
  }

  function draw() {
    g.clearRect(0, 0, w, h)
    g.fillStyle = '#0a0e14'
    g.fillRect(0, 0, w, h)
    g.strokeStyle = 'rgba(255,255,255,.04)'
    g.lineWidth = 1
    for (let x = 0; x < w; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke() }
    for (let y = 0; y < h; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke() }
    if (kind === 'recoil') drawRecoil()
    else if (kind === 'tracking') drawTracking()
    else drawStatic()
  }

  function getCross() {
    return test.getCrosshair ? test.getCrosshair() : null
  }
  function drawCross(x, y, color = '#ff7a3d') {
    g.strokeStyle = color
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(x - 12, y); g.lineTo(x - 4, y)
    g.moveTo(x + 4, y); g.lineTo(x + 12, y)
    g.moveTo(x, y - 12); g.lineTo(x, y - 4)
    g.moveTo(x, y + 4); g.lineTo(x, y + 12)
    g.stroke()
    g.fillStyle = color
    g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill()
  }
  function drawTarget(t, color = '#ff563d') {
    const grad = g.createRadialGradient(t.x - t.r * 0.3, t.y - t.r * 0.3, 2, t.x, t.y, t.r)
    grad.addColorStop(0, '#ffb199')
    grad.addColorStop(1, color)
    g.fillStyle = grad
    g.beginPath(); g.arc(t.x, t.y, t.r, 0, Math.PI * 2); g.fill()
    g.strokeStyle = 'rgba(255,255,255,.85)'
    g.lineWidth = 2
    g.beginPath(); g.arc(t.x, t.y, t.r * 0.45, 0, Math.PI * 2); g.stroke()
  }
  function drawStatic() {
    const t = test.getTarget()
    if (t) drawTarget(t)
    if (kind === 'flick') {
      g.strokeStyle = 'rgba(76,194,255,.5)'
      g.beginPath(); g.arc(w / 2, h / 2, 8, 0, Math.PI * 2); g.stroke()
    }
    const c = getCross()
    if (c) drawCross(c.x, c.y)
    else if (kind === 'click' && lastClient) drawCross(lastClient.x, lastClient.y)
  }
  function drawTracking() {
    const t = test.getTarget()
    drawTarget(t, '#4cc2ff')
    const c = getCross()
    const on = Math.hypot(c.x - t.x, c.y - t.y) <= t.r
    g.strokeStyle = on ? 'rgba(74,222,128,.3)' : 'rgba(248,113,113,.25)'
    g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(t.x, t.y); g.stroke()
    drawCross(c.x, c.y, on ? '#4ade80' : '#ff7a3d')
  }
  function drawRecoil() {
    const t = test.getTarget()
    const ctrl = test.getControlRadius()
    g.fillStyle = 'rgba(74,222,128,.08)'
    g.beginPath(); g.arc(t.x, t.y, ctrl, 0, Math.PI * 2); g.fill()
    g.strokeStyle = 'rgba(74,222,128,.55)'
    g.setLineDash([6, 6])
    g.beginPath(); g.arc(t.x, t.y, ctrl, 0, Math.PI * 2); g.stroke()
    g.setLineDash([])
    const trail = test.getTrail()
    g.strokeStyle = 'rgba(255,122,61,.55)'
    g.lineWidth = 1.5
    g.beginPath()
    trail.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
    g.stroke()
    g.fillStyle = '#f87171'
    g.beginPath(); g.arc(t.x, t.y, 7, 0, Math.PI * 2); g.fill()
    drawCross(getCross().x, getCross().y)
  }

  function finish() {
    phase = 'finished'
    cancelAnimationFrame(raf)
    releaseLock()
    pauseBtn.disabled = true
    const metrics = test.result()
    const score = SCORERS[kind](metrics)
    const info = sensitivityInfo()
    const advice = buildAdvice(kind, metrics, info)
    const usedSettings = { ...settings, cmPer360: info.cmPer360 }
    const record = persistRecord({
      kind, score, metrics, advice,
      settingsOverride: settingsOverride || usedSettings,
      profileName
    })
    draw()
    setOverlay(true, '测试完成', `综合分 ${score} 分，结果已保存到测试记录。`, '查看结果')
    if (onDone) onDone(record)
  }

  function toCanvas(clientX, clientY) {
    const rect = cv.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * w,
      y: ((clientY - rect.top) / rect.height) * h
    }
  }

  function onMouseMove(e) {
    if (phase !== 'running') return
    if (kind === 'click') {
      const p = toCanvas(e.clientX, e.clientY)
      if (lastClient) test.mouseMove(p.x - lastClient.x, p.y - lastClient.y)
      lastClient = p
      draw()
      return
    }
    let dx = e.movementX || 0
    let dy = e.movementY || 0
    if ((!dx && !dy) || !locked) {
      const p = toCanvas(e.clientX, e.clientY)
      if (lastClient) {
        dx = p.x - lastClient.x
        dy = p.y - lastClient.y
      }
      lastClient = p
    }
    test.mouseMove(dx, dy)
  }
  function onClick(e) {
    if (phase !== 'running' || kind === 'recoil') return
    const p = toCanvas(e.clientX, e.clientY)
    if (kind === 'click') lastClient = p
    test.click(p.x, p.y)
  }
  function onMouseDown(e) {
    if (phase === 'running' && kind === 'recoil' && e.button === 0) test.setFiring(true)
  }
  function onMouseUp(e) {
    if (kind === 'recoil' && e.button === 0) test.setFiring(false)
  }
  function onLockChange() {
    locked = document.pointerLockElement === cv
    if (kind !== 'click') {
      lockEl.textContent = locked ? '已锁定（Esc 解锁并自动暂停）' : '未锁定，可直接移动'
    }
    if (!locked && phase === 'running' && kind !== 'click') doPause(true)
  }

  function doPause(auto = false) {
    if (phase !== 'running') return
    phase = 'paused'
    test.pause()
    cancelAnimationFrame(raf)
    releaseLock()
    pauseBtn.disabled = false
    pauseBtn.textContent = '继续'
    setOverlay(
      true,
      auto ? '已自动暂停' : '已暂停',
      auto ? '鼠标锁定被解除（通常因按了 Esc）。点击继续并重新锁定。' : '计时已暂停，点击继续。',
      '继续'
    )
  }
  function doResume() {
    if (phase !== 'paused') return
    phase = 'running'
    test.resume()
    lastTs = performance.now()
    setOverlay(false)
    pauseBtn.textContent = '暂停'
    requestLock()
    raf = requestAnimationFrame(loop)
  }
  function doRestart() {
    if (phase === 'running' || phase === 'paused') {
      if (!confirm('重新开始将放弃本次测试数据，确定吗？')) return
    }
    destroy()
    mountArena(container, opts)
  }
  function doQuit() {
    if (phase === 'running') {
      doPause()
      container.querySelector('#arWarn').style.display = 'inline'
      return
    }
    destroy()
    if (onQuit) onQuit()
  }

  function onOverlayBtn() {
    if (phase === 'ready') startCountdown()
    else if (phase === 'paused') doResume()
    else if (phase === 'finished' && onDone) onDone(state.lastResult, true)
  }

  function destroy() {
    cancelAnimationFrame(raf)
    releaseLock()
    cv.removeEventListener('mousemove', onMouseMove)
    cv.removeEventListener('click', onClick)
    cv.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mouseup', onMouseUp)
    document.removeEventListener('pointerlockchange', onLockChange)
    ovBtn.removeEventListener('click', onOverlayBtn)
    pauseBtn.removeEventListener('click', onPauseToggle)
    container.querySelector('#arRestart').removeEventListener('click', doRestart)
    container.querySelector('#arQuit').removeEventListener('click', doQuit)
  }

  function onPauseToggle() {
    if (phase === 'running') doPause()
    else if (phase === 'paused') doResume()
  }

  cv.addEventListener('mousemove', onMouseMove)
  cv.addEventListener('click', onClick)
  cv.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  document.addEventListener('pointerlockchange', onLockChange)
  ovBtn.addEventListener('click', onOverlayBtn)
  pauseBtn.addEventListener('click', onPauseToggle)
  container.querySelector('#arRestart').addEventListener('click', doRestart)
  container.querySelector('#arQuit').addEventListener('click', doQuit)

  return { destroy }
}
