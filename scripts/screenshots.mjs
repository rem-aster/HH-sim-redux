// Снимки экрана для справки (public/help/img).
// Запуск: npm run build && npx vite preview --port 4173 & node scripts/screenshots.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const url = process.env.URL ?? 'http://localhost:4173/';
const out = new URL('../public/help/img/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

async function open(panels, height = 800) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height }, colorScheme: 'light', deviceScaleFactor: 1.5 });
  await ctx.addInitScript((p) => {
    localStorage.setItem('hhsim:speed', '"instant"');
    localStorage.setItem('hhsim:theme', '"light"');
    localStorage.setItem('hhsim:sidebar', '420');
    localStorage.setItem('hhsim:panels', JSON.stringify(p));
  }, panels);
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForFunction(() => !window.hhsim.engine.running);
  return page;
}

/** Щелчок по точке линии: время (мс) и значение на оси графика. */
async function clickAt(page, selector, t, y, yRange) {
  const box = await page.locator(selector).boundingBox();
  const bottom = selector.includes('plot-var') ? 34 : 10;
  const x = box.x + 60 + (t / 60) * (box.width - 72);
  const py = box.y + 10 + ((yRange[1] - y) / (yRange[1] - yRange[0])) * (box.height - 10 - bottom);
  await page.mouse.click(x, py);
}

const shot = (page, name, opts = {}) => page.screenshot({ path: out + name, ...opts });
const el = (page, sel, name) => page.locator(sel).screenshot({ path: out + name });

// главное окно с курсором на пике
{
  const page = await open(['stimuli']);
  await page.keyboard.press('Digit1');
  await page.waitForFunction(() => !window.hhsim.engine.running);
  const pk = await page.evaluate(() => {
    const h = window.hhsim.engine.hist;
    const V = h.col('V');
    let im = 0;
    for (let i = 0; i < h.length; i++) if (V[i] > V[im]) im = i;
    return { t: h.col('t')[im] * 1000, v: V[im] * 1000 };
  });
  await clickAt(page, '.plot-main canvas', pk.t, pk.v, [-100, 60]);
  await page.mouse.move(5, 5);
  await shot(page, 'main.png');

  // курсор на h после спайка, затем к минимуму
  const h = await page.evaluate(() => {
    const H = window.hhsim.engine.hist;
    const i = H.lowerBound('t', 0.0071);
    return { t: H.col('t')[i] * 1000, v: H.col('h')[i] };
  });
  await clickAt(page, '.plot-var canvas', h.t, h.v, [-0.1, 1.1]);
  await page.keyboard.press('Shift+ArrowRight');
  await page.mouse.move(5, 5);
  await shot(page, 'cursor.png');
  await page.close();
}

// панели снимаются в высоком окне, чтобы помещались целиком
{
  const page = await open(['stimuli'], 1600);
  await el(page, '#panel-stimuli', 'stimuli.png');
  await page.close();
}

// панели параметров
{
  const page = await open(['membrane', 'channels', 'drugs'], 2400);
  await el(page, '#panel-membrane', 'membrane.png');
  await el(page, '#panel-channels', 'channels.png');
  await page.locator('#panel-channels .btn-soft').first().click();
  await el(page, '#panel-channels .vchan.is-open', 'sodium.png');
  await page.locator('#panel-channels .btn-soft').first().click();
  await page.evaluate(() => window.hhsim.engine.setInhibition(0, 50));
  await el(page, '#panel-drugs', 'drugs.png');
  await page.close();
}

// фиксация потенциала
{
  const page = await open(['vclamp']);
  await page.getByRole('radio', { name: 'Фиксация потенциала' }).click();
  await page.locator('.vc-list input').fill('-40 -20 0 20');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Пуск/ }).click();
  await page.waitForFunction(() => !window.hhsim.engine.running && window.hhsim.engine.vcCurves.length === 4);
  await page.mouse.move(5, 5);
  await shot(page, 'vclamp.png');
  await page.close();
}
{
  const page = await open(['vclamp'], 1600);
  await page.getByRole('radio', { name: 'Фиксация потенциала' }).click();
  await page.locator('.vc-list input').fill('-40 -20 0 20');
  await page.keyboard.press('Enter');
  await el(page, '#panel-vclamp', 'vstim.png');
  await page.close();
}

await browser.close();
console.log('Снимки сохранены в', out);
