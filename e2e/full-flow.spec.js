import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let context;
let page;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  await page.addInitScript(() => {
    const proto = HTMLElement.prototype;
    if (!proto.requestPointerLock) {
      proto.requestPointerLock = function () {};
    }
    let lockedEl = null;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockedEl });
    proto.requestPointerLock = function () {
      lockedEl = this;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    document.exitPointerLock = () => {
      lockedEl = null;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
  });
});

test.afterAll(async () => {
  await context?.close();
});

test('首页加载并显示导航', async () => {
  await page.goto('/#/home');
  await expect(page.locator('h1')).toContainText('FPS');
  for (const name of ['开始', '设置', '鼠标校准', '测试选择', '测试记录', '灵敏度对比']) {
    await expect(page.getByRole('link', { name })).toBeVisible();
  }
});

test('设置可保存并持久化', async () => {
  await page.goto('/#/settings');
  await page.locator('#set-dpi').fill('1600');
  await page.locator('#set-sens').fill('1.25');
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.reload();
  await page.goto('/#/settings');
  await expect(page.locator('#set-dpi')).toHaveValue('1600');
  await expect(page.locator('#set-sens')).toHaveValue('1.25');
});

test('鼠标校准：完成 90 度转身并保存 cm/360', async () => {
  await page.goto('/#/calibration');
  await page.getByRole('button', { name: '90° 转身测试' }).click();
  await page.waitForTimeout(300);
  await page.mouse.move(700, 400);
  for (let i = 0; i < 8; i++) await page.mouse.move(700 + (i + 1) * 60, 400);
  await page.locator('#arena, .arena').first().click({ position: { x: 300, y: 150 } });
  await expect(page.locator('#calib-move')).toContainText('px');
  const text = await page.locator('.logline').first().textContent();
  expect(text).toMatch(/校准完成|已保存校准结果|cm\/360/);
});

for (const [type, name] of [
  ['click', '快速点击测试'],
  ['turn', '快速转向测试'],
  ['tracking', '移动目标跟踪'],
  ['recoil', '压枪稳定性测试']
]) {
  test(`${name}可完成并产生结果记录`, async () => {
    await page.goto(`/#/test?type=${type}&fast=1`);
    await page.getByRole('button', { name: '开始测试' }).click();
    await page.waitForTimeout(3200);
    const arena = page.locator('.arena').first();
    const box = await arena.boundingBox();
    if (type === 'click') {
      for (let i = 0; i < 24; i++) {
        const target = page.locator('.arena .target').first();
        if (await target.count()) {
          const tb = await target.boundingBox();
          if (tb) await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
        } else {
          await page.mouse.click(box.x + 100 + (i * 37) % 800, box.y + 100 + (i * 53) % 400);
        }
        await page.waitForTimeout(140);
      }
    } else if (type === 'turn') {
      let x = 720;
      for (let round = 0; round < 80; round++) {
        if (await page.getByText('测试完成').count()) break;
        const hint = page.locator('.turn-info');
        if (await hint.count()) {
          const t = await hint.textContent();
          const dir = t.includes('右') ? 1 : -1;
          x += dir * 260;
          if (x > 1300) x = 200;
          if (x < 140) x = 1300;
          await page.mouse.move(x, 450, { steps: 8 });
          await page.mouse.click(x, 450);
        }
        await page.waitForTimeout(60);
      }
    } else if (type === 'tracking') {
      for (let i = 0; i < 60; i++) {
        const target = page.locator('.arena .target').first();
        if (await target.count()) {
          const tb = await target.boundingBox();
          if (tb) await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
        }
        await page.waitForTimeout(60);
      }
    } else {
      await page.mouse.down();
      for (let i = 0; i < 50; i++) {
        await page.mouse.move(720 - i, 450 - i);
        await page.waitForTimeout(60);
      }
      await page.mouse.up();
    }
    await page.getByRole('button', { name: '查看详细结果' }, { timeout: 20000 }).waitFor();
    await page.getByRole('button', { name: '查看详细结果' }).click();
    await expect(page.locator('h2').first()).toContainText('详细结果');
    await expect(page.locator('.score-ring')).toBeVisible();
  });
}

test('记录页可查看、删除与导出', async () => {
  await page.goto('/#/home');
  await page.evaluate(() => {
    const rec = {
      id: 'seed_rec_1',
      createdAt: new Date().toISOString(),
      type: 'click',
      profileName: '默认',
      settings: { dpi: 800, sensitivity: 1, fov: 90 },
      stats: { accuracy: 0.8, avgReactionMs: 320, hits: 8, attempts: 10, misses: 2, mouseDistancePx: 1000, durationMs: 30000 },
      summary: { score: 80, grade: '良好', advice: ['测试建议'] }
    };
    const raw = localStorage.getItem('fps_tester_records_v1');
    const list = raw ? JSON.parse(raw) : [];
    list.unshift(rec);
    localStorage.setItem('fps_tester_records_v1', JSON.stringify(list));
  });
  await page.goto('/#/records');
  await page.reload();
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出全部 JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('.json');
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '删除' }).first().click();
  await expect(rows).toHaveCount(before - 1, { timeout: 5000 });
});

test('暂停与继续可用且不清空结果', async () => {
  await page.goto('/#/test?type=click&fast=1');
  await page.getByRole('button', { name: '开始测试' }).click();
  await page.waitForTimeout(3600);
  await page.getByRole('button', { name: '暂停' }).click();
  await expect(page.locator('.overlay h2')).toHaveText('测试已暂停');
  const frozen = await page.locator('#timer').textContent();
  await page.waitForTimeout(700);
  await expect(page.locator('#timer')).toHaveText(frozen);
  await page.getByRole('button', { name: '继续测试' }).click();
  await expect(page.locator('.overlay')).toHaveCount(0);
});
