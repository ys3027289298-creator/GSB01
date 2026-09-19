import { test, expect } from '@playwright/test'

// 将测试时长改为 10 秒，缩短自动化走查时间
async function setShortDuration(page) {
  await page.goto('/#/settings')
  await page.waitForSelector('#duration')
  await page.fill('#duration', '10')
  await page.click('#save')
  await expect(page.locator('#msg')).toContainText('已保存')
}

async function startAndFinish(page, play) {
  await page.click('#arOvBtn') // 开始 -> 倒计时
  await page.waitForTimeout(2400) // 等倒计时结束
  await page.waitForSelector('.arena-wrap[data-state="running"]', { timeout: 5000 })
  if (play) await play(page)
  // 等待测试自然结束并出现结果遮罩
  await page.waitForFunction(
    () => {
      return document.querySelector('.arena-wrap')?.dataset.state === 'finished'
    },
    { timeout: 30000 }
  )
}

test('校准页面可完成一次 180° 转身并保存', async ({ page }) => {
  await page.goto('/#/calibration')
  await page.waitForSelector('#calLock')
  // 不依赖 pointer lock：直接通过 mousemove movementX 输入
  await page.click('#calLock')
  await page.waitForTimeout(200)
  await page.evaluate(() => {
    for (let i = 0; i < 40; i++) {
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: 120, movementY: 0 }))
    }
  })
  await page.keyboard.press('Space')
  await page.waitForTimeout(200)
  await page.fill('#physCm', '12')
  await page.click('#calSave')
  await page.on('dialog', (d) => d.accept())
  await expect(page.locator('#calSaved')).toContainText('cm/360')
})

test('快速点击测试完成并出结果页', async ({ page }) => {
  await setShortDuration(page)
  await page.goto('/#/test/click')
  await startAndFinish(page, async (p) => {
    // 快速点击模式：跟随当前目标中心点击
    for (let i = 0; i < 40; i++) {
      const pos = await p.evaluate(() => {
        const cv = document.querySelector('#cv')
        // 从画布无法读引擎状态：通过 HUD 存在即继续，随机点击中心附近
        const r = cv.getBoundingClientRect()
        return { x: r.left + r.width * (0.2 + Math.random() * 0.6), y: r.top + r.height * (0.2 + Math.random() * 0.6) }
      })
      await p.mouse.move(pos.x, pos.y, { steps: 2 })
      await p.mouse.click(pos.x, pos.y)
      await p.waitForTimeout(180)
    }
  })
  await page.click('#arOvBtn')
  await page.waitForSelector('.score-ring')
  await expect(page.locator('h1')).toContainText('快速点击')
  await expect(page.locator('.advice')).toContainText(/命中|反应|误点|稳定/)
  await page.click('#retest')
  await page.waitForSelector('#arOvBtn')
})

test('快速转向测试完成并显示过/欠转倾向', async ({ page }) => {
  await page.goto('/#/test/flick')
  await startAndFinish(page, async (p) => {
    // 用合成 movementX/Y 向大致方向甩动
    await p.evaluate(async () => {
      const cv = document.querySelector('#cv')
      const rect = cv.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      for (let i = 0; i < 60; i++) {
        cv.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 0, movementY: 0, clientX: cx + (Math.random() - 0.5) * 300, clientY: cy + (Math.random() - 0.5) * 200 }))
        await new Promise((r) => setTimeout(r, 60))
      }
    })
  })
  await page.click('#arOvBtn')
  await page.waitForSelector('.score-ring')
  await expect(page.locator('.page')).toContainText(/过度移动|移动不足|均衡/)
})

test('目标跟踪测试完成，在靶率有数据', async ({ page }) => {
  await page.goto('/#/test/tracking')
  await startAndFinish(page, async (p) => {
    await p.evaluate(async () => {
      const cv = document.querySelector('#cv')
      const rect = cv.getBoundingClientRect()
      for (let i = 0; i < 120; i++) {
        cv.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true, movementX: 0, movementY: 0,
          clientX: rect.left + rect.width / 2 + Math.sin(i / 5) * 200,
          clientY: rect.top + rect.height / 2 + Math.cos(i / 6) * 120
        }))
        await new Promise((r) => setTimeout(r, 50))
      }
    })
  })
  await page.click('#arOvBtn')
  await page.waitForSelector('.score-ring')
  await expect(page.locator('.page')).toContainText('跟踪在靶率')
})

test('压枪测试：按住开火并下压，前后半段均有数据', async ({ page }) => {
  await page.goto('/#/test/recoil')
  await startAndFinish(page, async (p) => {
    await p.evaluate(async () => {
      const cv = document.querySelector('#cv')
      const rect = cv.getBoundingClientRect()
      cv.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      for (let i = 0; i < 130; i++) {
        cv.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true, movementX: (Math.random() - 0.5) * 6, movementY: 2,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2
        }))
        await new Promise((r) => setTimeout(r, 50))
      }
      window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }))
    })
  })
  await page.click('#arOvBtn')
  await page.waitForSelector('.score-ring')
  await expect(page.locator('.page')).toContainText('前半段平均偏移')
  await expect(page.locator('.page')).toContainText('后半段平均偏移')
})

test('记录持久化、查看、导出与删除', async ({ page }) => {
  // 独立上下文：先完成一次点击测试产生记录
  await page.goto('/#/settings')
  await page.fill('#duration', '10')
  await page.click('#save')
  await page.goto('/#/test/click')
  await startAndFinish(page)
  await page.click('#arOvBtn')
  await page.waitForSelector('.score-ring')

  await page.goto('/#/records')
  await page.waitForSelector('table')
  const count = await page.locator('tbody tr').count()
  expect(count).toBeGreaterThan(0)
  // JSON 导出按钮可用
  await expect(page.locator('#exportJson')).toBeEnabled()
  await expect(page.locator('#exportCsv')).toBeEnabled()
  // 查看单条
  await page.click('[data-view] >> nth=0')
  await page.waitForSelector('.score-ring')
  await page.click('#records')
  await page.waitForSelector('table')
  const before = await page.locator('tbody tr').count()
  page.on('dialog', (d) => d.accept())
  await page.click('[data-del] >> nth=0')
  await page.waitForFunction((b) => document.querySelectorAll('tbody tr').length === b - 1, before)

  // 刷新后记录仍在
  await page.reload()
  await page.waitForSelector('h1')
  const afterReload = await page.locator('tbody tr').count()
  expect(afterReload).toBe(before - 1)
})
