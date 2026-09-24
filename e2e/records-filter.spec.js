import { test, expect } from '@playwright/test';

function seedRecords(page) {
  return page.evaluate(() => {
    const now = Date.now();
    const mk = (id, type, daysAgo, score, profileName) => ({
      id,
      createdAt: new Date(now - daysAgo * 86400000).toISOString(),
      type,
      profileName,
      settings: { dpi: 800, sensitivity: 1, fov: 90 },
      stats: {},
      summary: score === null ? undefined : { score }
    });
    const list = [
      mk('e2e_c1', 'click', 1, 80, '方案A'),
      mk('e2e_t1', 'turn', 2, 70, '方案B'),
      mk('e2e_cal', 'calibration', 3, null, '方案A'),
      mk('e2e_old', 'click', 40, 50, '方案B')
    ];
    localStorage.setItem('fps_tester_records_v1', JSON.stringify(list));
  });
}

test('记录页：带查询参数的筛选、统计与刷新恢复', async ({ page }) => {
  await page.goto('/#/home');
  await seedRecords(page);
  await page.reload();

  await page.goto('/#/records?type=click&sort=score-desc');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('tbody tr').first()).toContainText('80');
  await expect(page.locator('.records-stats')).toContainText('平均评分');
  await expect(page.locator('.records-stats')).toContainText('65');

  await page.locator('select[data-filter="type"]').selectOption('all');
  await expect(page).toHaveURL(/#\/records/);
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await expect(page.locator('.records-dist')).toContainText('快速点击 2');

  await page.locator('select[data-filter="profile"]').selectOption('方案B');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('select[data-filter="profile"]')).toHaveValue('方案B');

  await page.goto('/#/records?type=bogus&sort=nope');
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await expect(page.locator('select[data-filter="type"]')).toHaveValue('all');
  await expect(page.locator('select[data-filter="sort"]')).toHaveValue('newest');

  await page.goto('/#/records?profile=不存在');
  await expect(page.locator('tbody')).toContainText('当前筛选条件下没有匹配的记录');
  await expect(page.locator('.records-stats')).toContainText('暂无评分');
});

test('记录页：当前筛选导出与空筛选提示', async ({ page }) => {
  await page.goto('/#/home');
  await seedRecords(page);
  await page.reload();

  await page.goto('/#/records?type=click&sort=score-asc');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出当前筛选 JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('filtered');

  await page.goto('/#/records?profile=不存在');
  await page.getByRole('button', { name: '导出当前筛选 CSV' }).click();
  await expect(page.locator('#toast')).toContainText('当前筛选没有记录可导出');
});
