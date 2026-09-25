// Лёгкий график на canvas: оси, сетка, быстрые линии (прореживание min/max),
// режимы «Курсор», «Масштаб», «Сдвиг», колесо мыши, жесты, подсказка при наведении.

import { LinkGroup, Range } from './range';
import { formatTick, linearTicks } from './ticks';

export interface Series {
  key: string;
  label: string;
  color: string;
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  n: number;
  /** Отображаемое x = x · xa. */
  xa: number;
  /** Отображаемое y = y · ya + yb. */
  ya: number;
  yb: number;
  /** Значение для подсказки = y · va + vb (по умолчанию — само y). */
  va?: number;
  vb?: number;
  unit?: string;
  width?: number;
  /** Не участвует в выборе курсором. */
  noPick?: boolean;
}

export interface Tick {
  v: number;
  label: string;
}

export type Interaction = 'cursor' | 'zoom' | 'pan';

export interface PlotTheme {
  bg: string;
  grid: string;
  axis: string;
  text: string;
  muted: string;
  zoomFill: string;
  zoomStroke: string;
  font: string;
}

export interface CursorMark {
  key: string;
  index: number;
  /** Время курсора на оси X (для линии времени на связанных графиках). */
  time?: number | null;
}

export interface PlotConfig {
  group: LinkGroup;
  y: Range;
  /** Линии графика; color переводит имя цвета (CSS-переменную) в значение. */
  getSeries: (color: (name: string) => string) => Series[];
  resolveColor: (name: string) => string;
  yLabel: string;
  /** Подпись оси X; если не задана, подписи делений X не рисуются. */
  xLabel?: string;
  xUnit?: string;
  yTicks?: (min: number, max: number) => Tick[];
  getCursor?: () => CursorMark | null;
  getMode: () => Interaction;
  getTheme: () => PlotTheme;
  onPick?: (key: string, index: number) => void;
  onBackground?: () => void;
  onReset?: () => void;
  /** Пользователь изменил масштаб/сдвиг вручную. */
  onUserView?: (axis: 'x' | 'y' | 'xy') => void;
  /** Формат значения в подсказке. */
  formatValue?: (v: number) => string;
  /** Подсказку по времени показывать только при наведении на этот график. */
  tooltip?: boolean;
}

const PAD = { left: 60, right: 12, top: 10, bottomTicks: 34, bottomPlain: 10 };

export function nearestIndex(x: ArrayLike<number>, n: number, v: number): number {
  let lo = 0;
  let hi = n - 1;
  if (n <= 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (x[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(x[lo - 1] - v) <= Math.abs(x[lo] - v)) return lo - 1;
  return lo;
}

function lowerBound(x: ArrayLike<number>, n: number, v: number): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (x[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function formatNumber(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  let s: string;
  if (a >= 1e5 || a < 1e-4) s = v.toExponential(digits - 1);
  else s = Number(v.toPrecision(digits)).toString();
  return s.replace('-', '−');
}

export class CanvasPlot {
  readonly cfg: PlotConfig;
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tip: HTMLDivElement;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private ro: ResizeObserver;
  private unsub: (() => void)[] = [];
  private drag: {
    id: number;
    x0: number;
    y0: number;
    x: number;
    y: number;
    moved: boolean;
    button: number;
    shift: boolean;
    xr: [number, number];
    yr: [number, number];
  } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { d0: number; xr: [number, number]; cx: number } | null = null;
  private hoverPx: { x: number; y: number } | null = null;

  constructor(container: HTMLElement, cfg: PlotConfig) {
    this.cfg = cfg;
    this.el = document.createElement('div');
    this.el.className = 'plot';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'plot-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', `График: ${cfg.yLabel}`);
    this.tip = document.createElement('div');
    this.tip.className = 'plot-tip';
    this.tip.hidden = true;
    this.el.append(this.canvas, this.tip);
    container.append(this.el);
    this.ctx = this.canvas.getContext('2d')!;

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    this.resize();

    const c = this.canvas;
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('pointermove', this.onMove);
    c.addEventListener('pointerup', this.onUp);
    c.addEventListener('pointercancel', this.onCancel);
    c.addEventListener('pointerleave', this.onLeave);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('dblclick', this.onDbl);
    c.addEventListener('contextmenu', (e) => {
      if (this.cfg.getMode() === 'zoom') e.preventDefault();
    });

    this.unsub.push(cfg.group.x.subscribe(() => this.invalidate()));
    this.unsub.push(cfg.group.subscribe(() => this.invalidate()));
    this.unsub.push(cfg.y.subscribe(() => this.invalidate()));
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    for (const u of this.unsub) u();
    this.el.remove();
  }

  invalidate(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  private resize(): void {
    const r = this.el.getBoundingClientRect();
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.w = Math.max(10, r.width);
    this.h = Math.max(10, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.draw();
  }

  // ---------------------------------------------------------------- геометрия

  private rect(w = this.w, h = this.h) {
    const bottom = this.cfg.xLabel ? PAD.bottomTicks : PAD.bottomPlain;
    return { l: PAD.left, t: PAD.top, r: w - PAD.right, b: h - bottom };
  }

  private toPx(xd: number, yd: number, w = this.w, h = this.h): [number, number] {
    const R = this.rect(w, h);
    const xr = this.cfg.group.x;
    const yr = this.cfg.y;
    return [R.l + ((xd - xr.min) / xr.span) * (R.r - R.l), R.t + ((yr.max - yd) / yr.span) * (R.b - R.t)];
  }

  private fromPx(px: number, py: number): [number, number] {
    const R = this.rect();
    const xr = this.cfg.group.x;
    const yr = this.cfg.y;
    return [xr.min + ((px - R.l) / (R.r - R.l)) * xr.span, yr.max - ((py - R.t) / (R.b - R.t)) * yr.span];
  }

  // ---------------------------------------------------------------- отрисовка

  draw(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawTo(ctx, this.w, this.h, this.cfg.getTheme(), true, this.cfg.resolveColor);
  }

  /** Рисует график для сохранения в файл (без подсказок и наведения). */
  drawForExport(ctx: CanvasRenderingContext2D, w: number, h: number, th: PlotTheme, color: (name: string) => string): void {
    this.drawTo(ctx, w, h, th, false, color);
  }

  private drawTo(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    th: PlotTheme,
    interactive: boolean,
    color: (name: string) => string,
  ): void {
    const R = this.rect(w, h);
    const xr = this.cfg.group.x;
    const yr = this.cfg.y;
    ctx.save();
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.font = `11px ${th.font}`;
    ctx.textBaseline = 'middle';

    // сетка и деления Y
    const yt = this.cfg.yTicks
      ? this.cfg.yTicks(yr.min, yr.max)
      : (() => {
          const { values, step } = linearTicks(yr.min, yr.max, Math.max(3, Math.round((R.b - R.t) / 40)));
          return values.map((v) => ({ v, label: formatTick(v, step) }));
        })();
    ctx.lineWidth = 1;
    ctx.strokeStyle = th.grid;
    ctx.fillStyle = th.muted;
    ctx.textAlign = 'right';
    for (const t of yt) {
      if (t.v < yr.min - 1e-9 || t.v > yr.max + 1e-9) continue;
      const y = Math.round(this.toPx(0, t.v, w, h)[1]) + 0.5;
      ctx.beginPath();
      ctx.moveTo(R.l, y);
      ctx.lineTo(R.r, y);
      ctx.stroke();
      ctx.fillText(t.label, R.l - 6, y);
    }
    // деления X
    const { values: xv, step: xs } = linearTicks(xr.min, xr.max, Math.max(3, Math.round((R.r - R.l) / 90)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const v of xv) {
      const x = Math.round(this.toPx(v, 0, w, h)[0]) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, R.t);
      ctx.lineTo(x, R.b);
      ctx.stroke();
      if (this.cfg.xLabel) ctx.fillText(formatTick(v, xs), x, R.b + 5);
    }
    // рамка
    ctx.strokeStyle = th.axis;
    ctx.strokeRect(R.l + 0.5, R.t + 0.5, R.r - R.l - 1, R.b - R.t - 1);

    // подписи осей
    ctx.fillStyle = th.text;
    if (this.cfg.xLabel) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(this.cfg.xLabel, R.r, h - 1);
    }
    ctx.save();
    ctx.translate(13, (R.t + R.b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.cfg.yLabel, 0, 0);
    ctx.restore();

    // линии
    ctx.save();
    ctx.beginPath();
    ctx.rect(R.l + 1, R.t + 1, R.r - R.l - 2, R.b - R.t - 2);
    ctx.clip();
    const series = this.cfg.getSeries(color);
    // первая линия рисуется последней — поверх остальных
    for (let i = series.length - 1; i >= 0; i--) this.drawSeries(ctx, series[i], R);

    // линия времени курсора и наведения
    const cur = this.cfg.getCursor?.() ?? null;
    const hx = this.cfg.group.hoverX;
    if (interactive && hx !== null && Number.isFinite(hx)) {
      const x = Math.round(this.toPx(hx, 0, w, h)[0]) + 0.5;
      ctx.strokeStyle = th.muted;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x, R.t);
      ctx.lineTo(x, R.b);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (cur) {
      const s = series.find((q) => q.key === cur.key);
      if (!s && cur.time !== undefined && cur.time !== null) {
        // курсор на другом графике группы — только линия времени
        const x = Math.round(this.toPx(cur.time, 0, w, h)[0]) + 0.5;
        ctx.strokeStyle = th.muted;
        ctx.globalAlpha = 0.6;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, R.t);
        ctx.lineTo(x, R.b);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (s && cur.index >= 0 && cur.index < s.n) {
        const [px, py] = this.toPx(s.x[cur.index] * s.xa, s.y[cur.index] * s.ya + s.yb, w, h);
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(Math.round(px) + 0.5, R.t);
        ctx.lineTo(Math.round(px) + 0.5, R.b);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        if (Number.isFinite(py)) {
          ctx.fillStyle = th.bg;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(px, py, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // рамка масштабирования
    if (interactive && this.drag && this.drag.moved && this.cfg.getMode() === 'zoom') {
      const d = this.drag;
      const xOnly = Math.abs(d.y - d.y0) < 12;
      const x0 = Math.min(d.x0, d.x);
      const x1 = Math.max(d.x0, d.x);
      const y0 = xOnly ? R.t : Math.min(d.y0, d.y);
      const y1 = xOnly ? R.b : Math.max(d.y0, d.y);
      ctx.fillStyle = th.zoomFill;
      ctx.strokeStyle = th.zoomStroke;
      ctx.lineWidth = 1;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
    }
    ctx.restore();
    ctx.restore();

    if (interactive) this.updateTip(series);
  }

  private drawSeries(ctx: CanvasRenderingContext2D, s: Series, R: ReturnType<CanvasPlot['rect']>): void {
    if (s.n <= 0) return;
    const xr = this.cfg.group.x;
    const yr = this.cfg.y;
    const xa = s.xa;
    const kx = (R.r - R.l) / xr.span;
    const ky = (R.b - R.t) / yr.span;
    const X = (xd: number) => R.l + (xd - xr.min) * kx;
    const Y = (raw: number) => R.t + (yr.max - (raw * s.ya + s.yb)) * ky;

    let i0 = lowerBound(s.x, s.n, xr.min / xa) - 1;
    let i1 = lowerBound(s.x, s.n, xr.max / xa) + 1;
    i0 = Math.max(0, i0);
    i1 = Math.min(s.n - 1, i1);
    if (i1 < i0) return;

    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width ?? 1.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const count = i1 - i0 + 1;
    const pixels = R.r - R.l;
    if (count <= pixels * 3) {
      let pen = false;
      for (let i = i0; i <= i1; i++) {
        const yv = s.y[i];
        if (!Number.isFinite(yv)) {
          pen = false;
          continue;
        }
        const px = X(s.x[i] * xa);
        const py = Y(yv);
        if (pen) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
        pen = true;
      }
      if (count === 1) {
        const px = X(s.x[i0] * xa);
        const py = Y(s.y[i0]);
        ctx.moveTo(px - 1, py);
        ctx.lineTo(px + 1, py);
      }
    } else {
      // прореживание: для каждого столбца пикселей — минимум и максимум
      let col = Math.floor(X(s.x[i0] * xa));
      let mn = Infinity;
      let mx = -Infinity;
      let first = NaN;
      let last = NaN;
      let pen = false;
      const flush = () => {
        if (!Number.isFinite(first)) return;
        const x = col + 0.5;
        if (pen) ctx.lineTo(x, first);
        else ctx.moveTo(x, first);
        ctx.lineTo(x, mn);
        ctx.lineTo(x, mx);
        ctx.lineTo(x, last);
        pen = true;
      };
      for (let i = i0; i <= i1; i++) {
        const yv = s.y[i];
        const c = Math.floor(X(s.x[i] * xa));
        if (c !== col) {
          flush();
          col = c;
          mn = Infinity;
          mx = -Infinity;
          first = NaN;
        }
        if (!Number.isFinite(yv)) {
          flush();
          pen = false;
          first = NaN;
          mn = Infinity;
          mx = -Infinity;
          continue;
        }
        const py = Y(yv);
        if (!Number.isFinite(first)) first = py;
        last = py;
        if (py < mn) mn = py;
        if (py > mx) mx = py;
      }
      flush();
    }
    ctx.stroke();
  }

  // ---------------------------------------------------------------- подсказка

  private updateTip(series: Series[]): void {
    const hp = this.hoverPx;
    if (!hp || this.drag?.moved || this.cfg.tooltip === false) {
      this.tip.hidden = true;
      return;
    }
    const [xd] = this.fromPx(hp.x, hp.y);
    const fmt = this.cfg.formatValue ?? ((v: number) => formatNumber(v));
    const rows: string[] = [];
    let tval: number | null = null;
    for (const s of series) {
      if (s.n <= 0) continue;
      const i = nearestIndex(s.x, s.n, xd / s.xa);
      if (i < 0) continue;
      const xt = s.x[i] * s.xa;
      const R = this.rect();
      if (Math.abs(this.toPx(xt, 0)[0] - hp.x) > Math.max(24, (R.r - R.l) * 0.05)) continue;
      const yv = s.y[i];
      if (!Number.isFinite(yv)) continue;
      if (tval === null) tval = xt;
      const v = yv * (s.va ?? 1) + (s.vb ?? 0);
      rows.push(
        `<div class="tip-row"><i style="background:${s.color}"></i><span>${escapeHtml(s.label)}</span><b>${fmt(v)}${s.unit ? ' ' + s.unit : ''}</b></div>`,
      );
    }
    if (tval === null || rows.length === 0) {
      this.tip.hidden = true;
      return;
    }
    this.tip.innerHTML = `<div class="tip-time">${formatNumber(tval, 5)} ${this.cfg.xUnit ?? ''}</div>${rows.join('')}`;
    this.tip.hidden = false;
    const tw = this.tip.offsetWidth;
    const tht = this.tip.offsetHeight;
    let left = hp.x + 14;
    if (left + tw > this.w - 4) left = hp.x - tw - 14;
    let top = hp.y - tht - 10;
    if (top < 2) top = hp.y + 16;
    this.tip.style.transform = `translate(${Math.max(2, left)}px, ${Math.max(2, Math.min(this.h - tht - 2, top))}px)`;
  }

  // ---------------------------------------------------------------- выбор линии

  /** Ближайшая к точке линия (в пикселях) и индекс ближайшей по времени точки на ней. */
  private hitTest(px: number, py: number, radius: number): { key: string; index: number } | null {
    let best: { key: string; index: number; d: number } | null = null;
    const [xd] = this.fromPx(px, py);
    const [xl] = this.fromPx(px - radius, py);
    const [xh] = this.fromPx(px + radius, py);
    for (const s of this.cfg.getSeries(this.cfg.resolveColor)) {
      if (s.noPick || s.n <= 0) continue;
      const iNear = nearestIndex(s.x, s.n, xd / s.xa);
      if (iNear < 0) continue;
      let a = Math.max(0, lowerBound(s.x, s.n, xl / s.xa) - 1);
      let b = Math.min(s.n - 1, lowerBound(s.x, s.n, xh / s.xa) + 1);
      if (b - a > 4000) {
        a = Math.max(0, iNear - 2000);
        b = Math.min(s.n - 1, iNear + 2000);
      }
      let dmin = Infinity;
      let prev: [number, number] | null = null;
      for (let i = a; i <= b; i++) {
        const yv = s.y[i];
        if (!Number.isFinite(yv)) {
          prev = null;
          continue;
        }
        const q = this.toPx(s.x[i] * s.xa, yv * s.ya + s.yb);
        const d = prev ? segDist(px, py, prev[0], prev[1], q[0], q[1]) : Math.hypot(q[0] - px, q[1] - py);
        if (d < dmin) dmin = d;
        prev = q;
      }
      if (dmin <= radius && (!best || dmin < best.d)) best = { key: s.key, index: iNear, d: dmin };
    }
    return best ? { key: best.key, index: best.index } : null;
  }

  // ---------------------------------------------------------------- указатель

  private localXY(e: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent) => {
    const p = this.localXY(e);
    this.pointers.set(e.pointerId, p);
    const mode = this.cfg.getMode();
    if (this.pointers.size === 2 && mode !== 'cursor') {
      const [a, b] = [...this.pointers.values()];
      this.pinch = {
        d0: Math.abs(a.x - b.x) || 1,
        xr: [this.cfg.group.x.min, this.cfg.group.x.max],
        cx: this.fromPx((a.x + b.x) / 2, 0)[0],
      };
      this.drag = null;
      return;
    }
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = {
      id: e.pointerId,
      x0: p.x,
      y0: p.y,
      x: p.x,
      y: p.y,
      moved: false,
      button: e.button,
      shift: e.shiftKey || e.altKey,
      xr: [this.cfg.group.x.min, this.cfg.group.x.max],
      yr: [this.cfg.y.min, this.cfg.y.max],
    };
  };

  private onMove = (e: PointerEvent) => {
    const p = this.localXY(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.abs(a.x - b.x) || 1;
      const k = this.pinch.d0 / d;
      const [x0, x1] = this.pinch.xr;
      const c = this.pinch.cx;
      this.cfg.group.x.set(c - (c - x0) * k, c + (x1 - c) * k);
      this.cfg.onUserView?.('x');
      return;
    }
    const d = this.drag;
    if (d && d.id === e.pointerId) {
      d.x = p.x;
      d.y = p.y;
      if (!d.moved && Math.hypot(p.x - d.x0, p.y - d.y0) > 4) d.moved = true;
      if (d.moved && this.cfg.getMode() === 'pan') {
        const R = this.rect();
        const dx = ((p.x - d.x0) / (R.r - R.l)) * (d.xr[1] - d.xr[0]);
        const dy = ((p.y - d.y0) / (R.b - R.t)) * (d.yr[1] - d.yr[0]);
        this.cfg.group.x.set(d.xr[0] - dx, d.xr[1] - dx);
        this.cfg.y.set(d.yr[0] + dy, d.yr[1] + dy);
        this.cfg.onUserView?.('xy');
      }
      this.invalidate();
      return;
    }
    if (e.pointerType === 'mouse') {
      this.hoverPx = p;
      const R = this.rect();
      if (p.x >= R.l && p.x <= R.r) this.cfg.group.setHover(this.fromPx(p.x, p.y)[0]);
      else this.cfg.group.setHover(null);
      this.invalidate();
    }
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    const mode = this.cfg.getMode();
    if (!d.moved) {
      if (mode === 'cursor') {
        const hit = this.hitTest(d.x0, d.y0, e.pointerType === 'mouse' ? 7 : 16);
        if (hit) this.cfg.onPick?.(hit.key, hit.index);
        else this.cfg.onBackground?.();
      } else if (mode === 'zoom') {
        const out = d.button === 2 || d.shift;
        this.zoomAt(d.x0, d.y0, out ? 2 : 0.5, true);
      }
    } else if (mode === 'zoom') {
      const xOnly = Math.abs(d.y - d.y0) < 12;
      const [xa] = this.fromPx(Math.min(d.x0, d.x), 0);
      const [xb] = this.fromPx(Math.max(d.x0, d.x), 0);
      if (Math.abs(d.x - d.x0) > 3) this.cfg.group.x.set(xa, xb);
      if (!xOnly) {
        const [, ya] = this.fromPx(0, Math.max(d.y0, d.y));
        const [, yb] = this.fromPx(0, Math.min(d.y0, d.y));
        this.cfg.y.set(ya, yb);
      }
      this.cfg.onUserView?.(xOnly ? 'x' : 'xy');
    }
    this.invalidate();
  };

  private onCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.drag = null;
    this.pinch = null;
    this.invalidate();
  };

  private onLeave = () => {
    this.hoverPx = null;
    this.cfg.group.setHover(null);
    this.invalidate();
  };

  private onDbl = (e: MouseEvent) => {
    if (this.cfg.getMode() !== 'cursor') {
      e.preventDefault();
      this.cfg.onReset?.();
    }
  };

  private onWheel = (e: WheelEvent) => {
    const p = this.localXY(e);
    const R = this.rect();
    if (p.x < R.l - 40 || p.x > R.r) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
    if (e.shiftKey || Math.abs(dx) > Math.abs(dy)) {
      // горизонтальная прокрутка — сдвиг по времени
      const d = e.shiftKey ? dy || dx : dx;
      const xr = this.cfg.group.x;
      const shift = (d / (R.r - R.l)) * xr.span;
      xr.set(xr.min + shift, xr.max + shift);
      this.cfg.onUserView?.('x');
      return;
    }
    const k = Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0025));
    if (e.altKey) this.zoomY(p.y, k);
    else this.zoomAt(p.x, p.y, k, false);
  };

  /** Масштаб относительно точки: k < 1 — увеличение. */
  zoomAt(px: number, py: number, k: number, both: boolean): void {
    const [cx, cy] = this.fromPx(px, py);
    const xr = this.cfg.group.x;
    xr.set(cx - (cx - xr.min) * k, cx + (xr.max - cx) * k);
    if (both) {
      const yr = this.cfg.y;
      yr.set(cy - (cy - yr.min) * k, cy + (yr.max - cy) * k);
    }
    this.cfg.onUserView?.(both ? 'xy' : 'x');
  }

  private zoomY(py: number, k: number): void {
    const [, cy] = this.fromPx(0, py);
    const yr = this.cfg.y;
    yr.set(cy - (cy - yr.min) * k, cy + (yr.max - cy) * k);
    this.cfg.onUserView?.('y');
  }
}

function segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = dx * dx + dy * dy;
  let t = L > 0 ? ((px - x1) * dx + (py - y1) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
