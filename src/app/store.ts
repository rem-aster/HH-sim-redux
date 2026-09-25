// Состояние приложения: модель, настройки интерфейса, виды графиков, курсор, цикл анимации.

import { signal } from '@preact/signals';
import { Engine, type Mode } from '../model/engine';
import { LinkGroup, Range } from '../plot/range';
import type { Interaction } from '../plot/canvas-plot';

export const engine = new Engine();
// доступ к модели из консоли браузера и для автотестов
(window as unknown as { hhsim: unknown }).hhsim = { engine };

// ------------------------------------------------------------ ревизии модели
/** Меняется при изменении параметров. */
export const paramsRev = signal(0);
/** Меняется при запуске/остановке и смене режима. */
export const runRev = signal(0);
/** Меняется при изменении набора кривых фиксации потенциала. */
export const vcRev = signal(0);

// ------------------------------------------------------------ настройки интерфейса
function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem('hhsim:' + key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown): void {
  try {
    localStorage.setItem('hhsim:' + key, JSON.stringify(v));
  } catch {
    /* хранилище недоступно */
  }
}

export type ThemePref = 'auto' | 'light' | 'dark';
export const themePref = signal<ThemePref>(load('theme', 'auto'));
export const themeRev = signal(0);

export type SpeedId = 'slow' | 'normal' | 'fast' | 'instant';
export const SPEEDS: Record<SpeedId, { label: string; msPerSec: number; hint: string }> = {
  slow: { label: 'Медленно', msPerSec: 5, hint: '5 мс модельного времени в секунду' },
  normal: { label: 'Нормально', msPerSec: 25, hint: '25 мс модельного времени в секунду' },
  fast: { label: 'Быстро', msPerSec: 120, hint: '120 мс модельного времени в секунду' },
  instant: { label: 'Мгновенно', msPerSec: Infinity, hint: 'Без анимации; непрерывный счёт — 1 с в секунду' },
};
export const speed = signal<SpeedId>(load('speed', 'normal'));

export const interaction = signal<Interaction>('cursor');

export type PanelId = 'membrane' | 'channels' | 'stimuli' | 'drugs' | 'vclamp';
export const openPanels = signal<PanelId[]>(load('panels', ['stimuli'] as PanelId[]));
export function togglePanel(id: PanelId, open?: boolean): void {
  const cur = openPanels.value;
  const isOpen = cur.includes(id);
  const want = open ?? !isOpen;
  if (want === isOpen) return;
  openPanels.value = want ? [...cur, id] : cur.filter((p) => p !== id);
}

/** Переменные трёх линий нижнего графика (жёлтая, зелёная, голубая). */
export const varSel = signal<[string, string, string]>(['m', 'h', 'n']);

export const sidebarWidth = signal<number>(load('sidebar', 420));

export const mode = signal<Mode>('cc');

// ------------------------------------------------------------ курсор
/**
 * Курсор режима регистрации: line 0 — потенциал, 1 — стимул, 2…4 — линии нижнего графика.
 * Режим фиксации: line 0…7 — ток кривой k, 8…15 — потенциал кривой k−8.
 */
export interface CursorState {
  line: number;
  index: number;
}
export const cursor = signal<CursorState | null>(null);

// ------------------------------------------------------------ виды графиков
export const DEFAULT_WINDOW_MS = 60; // 200 точек × plot_rate 3 × 0,1 мс в оригинале

export const views = {
  ccX: new Range(0, DEFAULT_WINDOW_MS),
  mainY: new Range(-100, 60),
  varY: new Range(-0.1, 1.1),
  vcX: new Range(0, DEFAULT_WINDOW_MS),
  vcIY: new Range(-12, 12),
  vcVY: new Range(-100, 100),
};
export const ccGroup = new LinkGroup(views.ccX);
export const vcGroup = new LinkGroup(views.vcX);

/** Пользователь сам изменил масштаб — не подстраивать ось автоматически. */
export const userView = { mainY: false, varY: false, vcIY: false, vcVY: false, vcX: false };

export function resetView(): void {
  if (engine.mode === 'cc') {
    userView.mainY = false;
    userView.varY = false;
    const [a, b] = engine.mainYRange;
    views.mainY.set(a, b);
    views.varY.set(-0.1, 1.1);
    const tEnd = lastTimeMs();
    const w = DEFAULT_WINDOW_MS;
    // окно по умолчанию, в котором видна последняя точка
    const k = Math.max(0, Math.ceil((tEnd - w) / (w / 2)));
    views.ccX.set((k * w) / 2, (k * w) / 2 + w);
  } else {
    userView.vcIY = false;
    userView.vcVY = false;
    userView.vcX = false;
    views.vcVY.set(-100, 100);
    fitVcX();
    views.vcIY.set(engine.vcYmin * 1.2, engine.vcYmax * 1.2);
  }
  redraw();
}

export function zoomView(k: number): void {
  const r = engine.mode === 'cc' ? views.ccX : views.vcX;
  const cur = cursorTimeMs();
  const c = cur !== null && cur > r.min && cur < r.max ? cur : (r.min + r.max) / 2;
  r.set(c - (c - r.min) * k, c + (r.max - c) * k);
  if (engine.mode === 'vc') userView.vcX = true;
}

export function lastTimeMs(): number {
  const h = engine.hist;
  return h.length ? h.col('t')[h.length - 1] * 1e3 : 0;
}

export function fitVcX(): void {
  const t = engine.vcMaxTime * 1e3;
  if (t > 0) views.vcX.set(0, t);
  else views.vcX.set(0, DEFAULT_WINDOW_MS);
}

/** Время точки под курсором, мс. */
export function cursorTimeMs(): number | null {
  const c = cursor.value;
  if (!c) return null;
  if (engine.mode === 'cc') {
    return c.index < engine.hist.length ? engine.hist.col('t')[c.index] * 1e3 : null;
  }
  const curve = engine.vcCurves[c.line % 8];
  return curve && c.index < curve.data.length ? curve.data.col('t')[c.index] * 1e3 : null;
}

// ------------------------------------------------------------ перерисовка
const redrawers = new Set<() => void>();
export function onRedraw(fn: () => void): () => void {
  redrawers.add(fn);
  return () => redrawers.delete(fn);
}
export function redraw(): void {
  for (const fn of redrawers) fn();
}

// ------------------------------------------------------------ сообщения
export const toast = signal<{ text: string; id: number } | null>(null);
let toastTimer = 0;
export function showToast(text: string): void {
  toast.value = { text, id: Date.now() };
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = null), 5000);
}

// ------------------------------------------------------------ события модели
engine.on((e) => {
  switch (e) {
    case 'params':
      paramsRev.value++;
      if (!userView.mainY) {
        const [a, b] = engine.mainYRange;
        views.mainY.set(a, b);
      }
      redraw();
      break;
    case 'run':
      runRev.value++;
      mode.value = engine.mode;
      break;
    case 'clear':
      cursor.value = null;
      views.ccX.set(0, DEFAULT_WINDOW_MS);
      redraw();
      break;
    case 'vc':
      vcRev.value++;
      if (!engine.running && !userView.vcX) fitVcX();
      redraw();
      break;
    case 'vcfull':
      showToast('В режиме фиксации потенциала можно показать не больше 8 кривых. Нажмите «Очистить» или удалите часть кривых.');
      break;
  }
});

// ------------------------------------------------------------ цикл анимации
let lastFrame = 0;
function frame(now: number): void {
  const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 1 / 60;
  lastFrame = now;
  if (engine.running) {
    const sp = SPEEDS[speed.value].msPerSec;
    // «Мгновенно» считает до установления сразу; непрерывный счёт — не быстрее 1 с модельного времени в секунду,
    // чтобы история не разрасталась слишком быстро
    const budget = Number.isFinite(sp) ? (sp / 1000) * dt : engine.continuous ? dt : Infinity;
    engine.advance(budget, 14);
    follow();
    redraw();
  }
  requestAnimationFrame(frame);
}

/** Прокрутка окна за последней точкой, как в оригинале: при выходе за правый край окно сдвигается на половину. */
function follow(): void {
  if (engine.mode === 'cc') {
    const t = lastTimeMs();
    const r = views.ccX;
    if (t > r.max) {
      const half = r.span / 2;
      const k = Math.ceil((t - r.max) / half);
      r.set(r.min + k * half, r.max + k * half);
    }
  } else {
    if (!userView.vcIY) views.vcIY.set(engine.vcYmin * 1.2, engine.vcYmax * 1.2);
    const c = engine.vcCurves[engine.vcCurves.length - 1];
    if (c && c.data.length && !userView.vcX) {
      const t = c.data.col('t')[c.data.length - 1] * 1e3;
      if (t > views.vcX.max) views.vcX.set(views.vcX.min, t * 1.1);
    }
  }
}

export function startLoop(): void {
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------ сохранение настроек
themePref.subscribe((v) => save('theme', v));
speed.subscribe((v) => save('speed', v));
openPanels.subscribe((v) => save('panels', v));
sidebarWidth.subscribe((v) => save('sidebar', v));
