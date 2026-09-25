import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    hhsim: { engine: any };
  }
}

const idle = (page: Page) => page.waitForFunction(() => !window.hhsim.engine.running, null, { timeout: 30_000 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hhsim:speed', '"instant"'));
});

test('Стим1 вызывает спайк, курсор показывает значение', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('./');
  await idle(page);
  await page.getByRole('button', { name: 'Стим1', exact: true }).first().click();
  await idle(page);
  const peak = await page.evaluate(() => {
    const h = window.hhsim.engine.hist;
    const V = h.col('V');
    let im = 0;
    for (let i = 0; i < h.length; i++) if (V[i] > V[im]) im = i;
    return { t: h.col('t')[im] * 1000, v: V[im] * 1000, n: h.length };
  });
  // те же числа, что у HHsim 3.7 (tests/smoke_test.m в Octave-версии: 278 шагов, пик 39,2 мВ)
  expect(peak.n).toBe(278);
  expect(peak.v).toBeCloseTo(39.2, 1);

  const box = (await page.locator('.plot-main canvas').boundingBox())!;
  await page.mouse.click(box.x + 60 + (peak.t / 60) * (box.width - 72), box.y + 10 + ((60 - peak.v) / 160) * (box.height - 20));
  await expect(page.locator('.cursor-value')).toHaveText('39.2 мВ');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.cursor-label')).toHaveText('Стимул');
  await page.keyboard.press('Escape');
  await expect(page.locator('.cursor-bar')).toHaveClass(/is-empty/);
  expect(errors).toEqual([]);
});

test('панели параметров меняют модель', async ({ page }) => {
  await page.goto('./');
  await idle(page);
  await page.getByRole('button', { name: 'Мембрана', exact: true }).click();
  const nao = page.getByRole('textbox', { name: 'Na⁺ снаружи, мМ' });
  await nao.fill('220');
  await nao.press('Enter');
  await expect.poll(() => page.evaluate(() => window.hhsim.engine.membrane.Nao)).toBe(220);
  await expect(page.locator('#panel-membrane .ion-e').first()).toHaveText('35.7 мВ');

  await page.getByRole('button', { name: 'Препараты', exact: true }).click();
  const ttx = page.getByRole('textbox', { name: 'ингибирование' }).first();
  await ttx.fill('100');
  await ttx.press('Enter');
  await expect(page.locator('.chip.is-drug')).toBeVisible();
  await page.getByRole('button', { name: 'Стим1', exact: true }).first().click();
  await idle(page);
  const vmax = await page.evaluate(() => {
    const V = window.hhsim.engine.hist.col('V');
    const n = window.hhsim.engine.hist.length;
    let m = -1;
    for (let i = n - 150; i < n; i++) m = Math.max(m, V[i]);
    return m * 1000;
  });
  expect(vmax).toBeLessThan(-30); // без Na-тока спайка нет
});

test('фиксация потенциала строит семейство кривых', async ({ page }) => {
  await page.goto('./');
  await idle(page);
  await page.getByRole('radio', { name: 'Фиксация потенциала' }).click();
  const list = page.getByRole('textbox', { name: 'Значения варьируемого параметра' });
  await list.fill('-40 0');
  await list.press('Enter');
  await page.getByRole('button', { name: 'Пуск' }).click();
  await page.waitForFunction(() => !window.hhsim.engine.running && window.hhsim.engine.vcCurves.length === 2);
  const imin = await page.evaluate(() => {
    const d = window.hhsim.engine.vcCurves[0].data;
    let m = 0;
    for (let i = 0; i < d.length; i++) m = Math.min(m, d.col('I')[i]);
    return m;
  });
  expect(imin).toBeLessThan(-50); // входящий Na-ток, как в smoke_test.m
  await expect(page.locator('.status')).toContainText('Кривых: 2 из 8');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт' }).click();
  await page.getByRole('menuitem', { name: /Данные — CSV/ }).first().click();
  const file = await download;
  const text = await (await file.createReadStream()).toArray();
  const csv = Buffer.concat(text).toString('utf8');
  expect(csv).toContain('время (мс) [1],фиксированный потенциал (мВ) [1],ток (нА) [1]');

  await page.getByRole('radio', { name: 'Регистрация' }).click();
  await idle(page);
  const V = await page.evaluate(() => window.hhsim.engine.V * 1000);
  expect(V).toBeGreaterThan(-64);
  expect(V).toBeLessThan(-61);
});

test('телефон: без горизонтальной прокрутки @mobile', async ({ page }) => {
  await page.goto('./');
  await idle(page);
  await page.getByRole('button', { name: 'Стим1', exact: true }).first().click();
  await idle(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('.plot-main canvas')).toBeVisible();
});

test('справка открывается', async ({ page }) => {
  await page.goto('./');
  await idle(page);
  await page.getByRole('button', { name: 'Справка' }).click();
  await expect(page.getByRole('dialog', { name: 'Справка' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Справка' })).toBeHidden();
  await page.locator('body').press('F1');
  await expect(page.getByRole('dialog', { name: 'Справка' })).toBeVisible();
  const res = await page.request.get('help/exercises.html');
  expect(res.ok()).toBe(true);
});
