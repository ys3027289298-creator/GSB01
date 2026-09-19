import { navigate } from '../main.js'
import { state } from '../state.js'
import { saveCalibration } from '../engine/storage.js'
import { buildCalibration, angleFromPixels, summarizeSensitivity } from '../engine/sensitivity.js'

export function renderCalibration(root) {
  const supportsLock = 'requestPointerLock' in HTMLElement.prototype
  const supportsMove = typeof window.MouseEvent === 'function'
  const cal = state.calibration

  root.innerHTML = `
    <div class="page">
      <h1>🖱 鼠标校准</h1>
      <p class="sub">锁定鼠标后按目标角度平稳转身，系统记录实际鼠标像素移动、视角变化与用时。</p>
      ${!supportsLock || !supportsMove ? `
        <div class="alert err">
          当前浏览器可能不支持 Pointer Lock（鼠标锁定）或鼠标移动事件，校准结果可能不完整。
          建议使用最新版 Chrome / Edge，并在桌面浏览器中通过 http(s) 或 localhost 打开本页面。
        </div>` : `
        <div class="alert ok">浏览器支持鼠标锁定与移动记录，可以开始校准。</div>`}

      <div class="grid cols-2">
        <div class="card">
          <h2>第一步：选择转身角度</h2>
          <div class="seg" id="angleSeg">
            ${[90, 180, 360].map((a, i) => `<button data-a="${a}" class="${i === 1 ? 'on' : ''}">${a}°</button>`).join('')}
          </div>
          <h2 style="margin-top:22px">第二步：锁定并转动</h2>
          <p class="note">
            点击下方“锁定鼠标开始”，然后从鼠标垫上的起点平稳移动鼠标，
            直到你在游戏中感觉刚好转完所选角度，再按 <b>空格</b> 或点击“完成转身”。
          </p>
          <div class="arena-wrap" style="aspect-ratio:1000/360;margin:14px 0" id="calZone">
            <canvas id="calCv" width="1000" height="360" style="cursor:crosshair"></canvas>
            <div class="overlay" id="calOv">
              <h2 id="calOvTitle">准备校准</h2>
              <p class="note">移动时这里会实时显示累计像素与估算角度</p>
              <button class="primary" id="calLock" ${supportsLock ? '' : 'disabled'}>锁定鼠标开始</button>
            </div>
          </div>
          <div class="row">
            <button id="calFinish" class="primary" disabled>完成转身</button>
            <button id="calReset">重新移动</button>
          </div>
        </div>

        <div class="card">
          <h2>第三步：输入物理距离（可选）</h2>
          <p class="note">用尺子量出鼠标在鼠标垫上移动的直线距离，能得到更准的 cm/360；不填则按 DPI 估算。</p>
          <label class="field"><span>鼠标实际移动距离（厘米）</span>
            <input id="physCm" type="number" min="1" max="100" step="0.1" placeholder="例如 12.5"></label>
          <button class="primary" id="calSave" disabled>保存校准结果</button>

          <h2 style="margin-top:24px">本次测量</h2>
          <div id="calLive" class="note">尚未完成一次转身。</div>

          <h2 style="margin-top:24px">已保存校准</h2>
          <div id="calSaved" class="note">
            ${cal
              ? `目标 ${cal.targetAngle}° · 移动 <b>${cal.movementPx}</b> 像素 ·
                 物理 <b>${cal.physicalCm}</b> cm · 用时 <b>${(cal.durationMs / 1000).toFixed(2)}</b> s ·
                 <b style="color:var(--accent)">cm/360 ≈ ${cal.cmPer360}</b><br/>
                 保存于 ${new Date(cal.date).toLocaleString()}`
              : '暂无。'}
          </div>
          <h2 style="margin-top:20px">当前灵敏度画像</h2>
          <div id="calSummary" class="note"></div>
        </div>
      </div>
      <div class="footer-actions">
        <button class="ghost" id="backSelect">去做测试</button>
      </div>
    </div>
  `

  const cv = root.querySelector('#calCv')
  const g = cv.getContext('2d')
  const ov = root.querySelector('#calOv')
  const ovTitle = root.querySelector('#calOvTitle')
  const live = root.querySelector('#calLive')
  const angleSeg = root.querySelector('#angleSeg')
  let targetAngle = 180
  let active = false
  let px = 0
  let startTs = 0
  let durationMs = 0
  let lastResult = null

  function summary() {
    const info = summarizeSensitivity(state.settings, state.calibration)
    root.querySelector('#calSummary').innerHTML =
      `cm/360 ≈ <b>${info.cmPer360}</b>（${info.source}）· ${info.band}`
  }
  summary()

  function draw() {
    g.fillStyle = '#0a0e14'
    g.fillRect(0, 0, 1000, 360)
    g.strokeStyle = 'rgba(255,255,255,.06)'
    for (let x = 0; x < 1000; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 360); g.stroke() }
    // 角度进度
    const est = state.calibration
      ? angleFromPixels(px, state.calibration, state.settings.dpi, state.settings.sensitivity)
      : angleFromPixels(px, null, state.settings.dpi, state.settings.sensitivity)
    const frac = Math.min(1, est / targetAngle)
    g.strokeStyle = '#ff7a3d'
    g.lineWidth = 10
    g.beginPath()
    g.arc(500, 180, 110, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
    g.stroke()
    g.fillStyle = '#e6ebf2'
    g.font = 'bold 34px Segoe UI'
    g.textAlign = 'center'
    g.fillText(`${Math.round(est)}°`, 500, 190)
    g.font = '14px Segoe UI'
    g.fillStyle = '#8b97a8'
    g.fillText(`目标 ${targetAngle}° · ${Math.round(px)} px`, 500, 220)
  }
  draw()

  angleSeg.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      if (active) return
      targetAngle = Number(b.dataset.a)
      angleSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
      draw()
    })
  )

  function startMove() {
    active = true
    px = 0
    startTs = performance.now()
    ov.classList.add('hidden')
    root.querySelector('#calFinish').disabled = false
    cv.requestPointerLock?.()
  }
  function stopMove() {
    if (!active) return
    active = false
    durationMs = performance.now() - startTs
    if (document.pointerLockElement === cv) document.exitPointerLock()
    root.querySelector('#calFinish').disabled = true
    const phys = Number(root.querySelector('#physCm').value) || 0
    lastResult = buildCalibration({
      targetAngle,
      movementPx: px,
      physicalCm: phys,
      dpi: state.settings.dpi,
      sens: state.settings.sensitivity
    })
    lastResult.durationMs = Math.round(durationMs)
    live.innerHTML = `
      目标角度 <b>${targetAngle}°</b> · 实际移动 <b>${lastResult.movementPx}</b> 像素 ·
      用时 <b>${(durationMs / 1000).toFixed(2)}</b> s ·
      每像素 <b>${lastResult.degreesPerPx}°</b> · 估算 cm/360 <b>${lastResult.cmPer360}</b>
      （设置估算值 ${lastResult.estimatedCmPer360}）`
    root.querySelector('#calSave').disabled = false
  }

  function onMove(e) {
    if (!active) return
    px += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0) * 0.15
    draw()
  }
  function onLockChange() {
    const locked = document.pointerLockElement === cv
    if (locked) {
      ov.classList.add('hidden')
    } else if (active) {
      stopMove()
    } else {
      ov.classList.remove('hidden')
      ovTitle.textContent = '准备校准'
    }
  }

  cv.addEventListener('click', () => { if (!active && supportsLock) startMove() })
  root.querySelector('#calLock').addEventListener('click', startMove)
  root.querySelector('#calFinish').addEventListener('click', stopMove)
  root.querySelector('#calReset').addEventListener('click', () => {
    px = 0
    active = false
    lastResult = null
    root.querySelector('#calSave').disabled = true
    draw()
    live.textContent = '已重置，重新锁定鼠标开始移动。'
  })
  document.addEventListener('mousemove', onMove)
  document.addEventListener('pointerlockchange', onLockChange)
  root.querySelector('#calSave').addEventListener('click', () => {
    if (!lastResult) return
    const phys = Number(root.querySelector('#physCm').value)
    if (phys) {
      lastResult = { ...lastResult, ...buildCalibration({
        targetAngle, movementPx: px, physicalCm: phys,
        dpi: state.settings.dpi, sens: state.settings.sensitivity
      }), durationMs: lastResult.durationMs }
    }
    saveCalibration(lastResult)
    state.calibration = lastResult
    root.querySelector('#calSaved').innerHTML =
      `目标 ${lastResult.targetAngle}° · 移动 <b>${lastResult.movementPx}</b> 像素 ·
       物理 <b>${lastResult.physicalCm}</b> cm · 用时 <b>${(lastResult.durationMs / 1000).toFixed(2)}</b> s ·
       <b style="color:var(--accent)">cm/360 ≈ ${lastResult.cmPer360}</b><br/>保存于 ${new Date().toLocaleString()}`
    summary()
    alert('校准结果已保存，将用于后续测试的角度换算。')
  })
  root.querySelector('#backSelect').addEventListener('click', () => navigate('select'))

  function onSpace(e) {
    if (e.code === 'Space' && active) {
      e.preventDefault()
      stopMove()
    }
  }
  window.addEventListener('keydown', onSpace)
}
