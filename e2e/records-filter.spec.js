import { test, expect } from '@playwright/test';

function seedRecords(page) {
  return page.evaluate(() => {
    const now = Date.now();
    const day = 24 * 3600 * 1000;
    const mk = (id, type, score, daysAgo, profileName) => ({
      id,
      createdAt: new Date(now - daysAgo * day).toISOString(),
      type,
      profileName,
      settings: { dpi: 800, sensitivity: 1, fov: 90 },
      stats: type === 'click'
        ? { accuracy: 0.8, avgReactionMs: 300, misses: 2, hits: 8, attempts: 10, mouseDistancePx: 500 }
        : { hits: 8, targets: 10, overCount: 1, underCount: 1, avgCompletionMs: 400, mouseDistancePx: 500 },
      summary: score === null ? null : { score, grade: '良好', advice: [] }
    });
    const records = [
      mk('f_click_low', 'click', 60, 1, '方案A'),
      mk('f_click_high', 'click', 92, 2, '方案B'),
      mk('f_turn', 'turn', 75, 3, '方案A'),
      mk('f_calib', 'calibration', null, 1, '方案A')
    ];
    records[3].stats = { targetDeg: 90, viewDeg: 88, errorDeg: 2, elapsedMs: 1200, cmPer360: 40 };
    localStorage.setItem('fps_tester_records_v1', JSON.stringify(records));
  });
}

test('记录页：带查询参数打开并按类型筛选、统计与导出', async ({ page }) => {
  await page.goto('/#/home');
  await seedRecords(page);
  await page.goto('/#/records?type=click&profile=all&range=all&sort=scoreDesc');
  await page.reload();

  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('92');
  await expect(rows.nth(1)).toContainText('60');

  const stats = page.locator('.stat-value');
  await expect(stats.nth(0)).toHaveText('2');
  await expect(stats.nth(1)).toHaveText('2');
  await expect(stats.nth(2)).toHaveText('76.0');
  await expect(stats.nth(3)).toHaveText('92');

  await expect(page.locator('#flt-type')).toHaveValue('click');
  await expect(page.locator('#flt-sort')).toHaveValue('scoreDesc');

  await page.locator('#flt-type').selectOption('calibration');
  await expect(page).toHaveURL(/type=calibration/);
  await expect(rows).toHaveCount(1);
  await expect(stats.nth(0)).toHaveText('1');
  await expect(stats.nth(1)).toHaveText('0');
  await expect(stats.nth(2)).toHaveText('—');

  await page.goBack();
  await expect(page).toHaveURL(/type=click/);
  await expect(rows).toHaveCount(2);

  await page.locator('#flt-type').selectOption('all');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出当前筛选 JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('filtered');
});

test('记录页：无匹配记录时筛选导出仅提示不下载', async ({ page }) => {
  await page.goto('/#/home');
  await seedRecords(page);
  await page.goto('/#/records?type=recoil&profile=all&range=all&sort=newest');
  await page.reload();
  await expect(page.locator('tbody tr td').first()).toContainText('没有匹配');
  const stats = page.locator('.stat-value');
  await expect(stats.nth(0)).toHaveText('0');
  await expect(stats.nth(2)).toHaveText('—');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: '导出当前筛选 CSV' }).click();
  await expect(page.locator('#toast')).toContainText('未导出');
});
