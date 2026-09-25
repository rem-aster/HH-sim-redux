// Курсор измерения (line_click.m, move_cursor.m, reset_cursor_values.m).

import type { Range } from '../plot/range';
import { cursor, engine, varSel, views, type CursorState } from './store';
import { STIM_OFFSET, VAR_COLORS, vcColor } from './series';
import { SCALES, varById } from './vars';

export interface LineInfo {
  x: ArrayLike<number>;
  /** Значения в единицах отображения на графике. */
  yPlot: (i: number) => number;
  /** Значение для панели курсора. */
  value: (i: number) => number;
  n: number;
  label: string;
  unit: string;
  color: string;
  xRange: Range;
  yRange: Range;
  vcCurrent?: boolean;
}

/** Описание линии курсора; null, если на линии нет данных. */
export function lineInfo(line: number): LineInfo | null {
  if (engine.mode === 'cc') {
    const h = engine.hist;
    const t = h.col('t');
    if (line === 0) {
      const V = h.col('V');
      return {
        x: t,
        yPlot: (i) => V[i] * 1000,
        value: (i) => V[i] * 1000,
        n: h.length,
        label: 'Потенциал мембр.',
        unit: 'мВ',
        color: '--c-v',
        xRange: views.ccX,
        yRange: views.mainY,
      };
    }
    if (line === 1) {
      const S = h.col('stim');
      return {
        x: t,
        yPlot: (i) => S[i] + STIM_OFFSET,
        value: (i) => S[i],
        n: h.length,
        label: 'Стимул',
        unit: 'нА',
        color: '--c-stim',
        xRange: views.ccX,
        yRange: views.mainY,
      };
    }
    const k = line - 2;
    const v = varById(varSel.value[k]);
    if (!v.col || !v.scale) return null;
    const s = SCALES[v.scale];
    const Y = h.col(v.col);
    return {
      x: t,
      yPlot: (i) => Y[i] * s.a + s.b,
      value: (i) => Y[i],
      n: h.length,
      label: v.label.replace(/ \(.*\)$/, ''),
      unit: s.unit,
      color: VAR_COLORS[k],
      xRange: views.ccX,
      yRange: views.varY,
    };
  }
  const k = line % 8;
  const c = engine.vcCurves[k];
  if (!c) return null;
  const current = line < 8;
  const Y = c.data.col(current ? 'I' : 'V');
  return {
    x: c.data.col('t'),
    yPlot: (i) => Y[i],
    value: (i) => Y[i],
    n: c.data.length,
    label: current ? 'Ток мембраны' : 'Заданный потенциал',
    unit: current ? 'нА' : 'мВ',
    color: vcColor(c.color),
    xRange: views.vcX,
    yRange: current ? views.vcIY : views.vcVY,
    vcCurrent: current,
  };
}

/** Ключ линии на графике для курсора. */
export function cursorSeriesKey(c: CursorState): string {
  if (engine.mode === 'cc') return c.line === 0 ? 'V' : c.line === 1 ? 'stim' : 'v' + (c.line - 2);
  return (c.line < 8 ? 'I' : 'U') + (c.line % 8);
}

/** Линия курсора по ключу линии графика. */
export function lineFromKey(key: string): number {
  if (key === 'V') return 0;
  if (key === 'stim') return 1;
  if (key[0] === 'v') return 2 + Number(key.slice(1));
  if (key[0] === 'I') return Number(key.slice(1));
  return 8 + Number(key.slice(1));
}

export function pick(key: string, index: number): void {
  setCursor(lineFromKey(key), index, false);
}

export function hideCursor(): void {
  cursor.value = null;
}

function lineCount(): number {
  return engine.mode === 'cc' ? 5 : 16;
}

/** Установить курсор; если на линии нет значения, перейти к следующей линии. */
function setCursor(line: number, index: number, scroll: boolean): void {
  const N = lineCount();
  for (let tries = 0; tries < N; tries++) {
    const L = lineInfo(line);
    if (L && L.n > 0) {
      const i = Math.max(0, Math.min(L.n - 1, index));
      if (Number.isFinite(L.yPlot(i))) {
        cursor.value = { line, index: i };
        if (scroll) ensureVisible(L, i);
        return;
      }
    }
    line = (line + 1) % N;
  }
  cursor.value = null;
}

/** Прокрутить график, если курсор ушёл за край (как reset_cursor_values.m). */
function ensureVisible(L: LineInfo, i: number): void {
  const xd = L.x[i] * 1000;
  const xr = L.xRange;
  if (xd <= xr.min) xr.set(xd - xr.span * 0.1, xd - xr.span * 0.1 + xr.span);
  else if (xd >= xr.max) xr.set(xd - xr.span * 0.9, xd - xr.span * 0.9 + xr.span);
  const yd = L.yPlot(i);
  const yr = L.yRange;
  if (yd <= yr.min) yr.set(yd - yr.span * 0.1, yd - yr.span * 0.1 + yr.span);
  else if (yd >= yr.max) yr.set(yd - yr.span * 0.9, yd - yr.span * 0.9 + yr.span);
}

/**
 * Перемещение курсора: ±1 — на одну точку, ±2 — к ближайшему максимуму или минимуму,
 * 0 — на другую линию («пер.»).
 */
export function moveCursor(step: -2 | -1 | 0 | 1 | 2): void {
  const c = cursor.value;
  if (!c) return;
  if (step === 0) {
    setCursor((c.line + 1) % lineCount(), c.index, true);
    return;
  }
  const L = lineInfo(c.line);
  if (!L) return;
  const n = L.n;
  let index = c.index;
  const s = Math.sign(step);
  if (Math.abs(step) === 1) {
    const ni = index + s;
    if (ni >= 0 && ni < n) index = ni;
  } else {
    if (index + s < 0 || index + s >= n) return;
    const y = L.value;
    const orig = s * Math.sign(y(index + s) - y(index));
    let slope = orig;
    while (slope === orig && index + s >= 0 && index + s < n) {
      index += s;
      if (index + s < 0 || index + s >= n) break;
      slope = s * Math.sign(y(index + s) - y(index));
    }
  }
  setCursor(c.line, index, true);
}

/** Формат %g с заданным числом значащих цифр (как sprintf('%5.3g')). */
export function fmtG(v: number, p = 3): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  let e = Math.floor(Math.log10(Math.abs(v)));
  const r = Number(v.toPrecision(p));
  if (r !== 0) e = Math.floor(Math.log10(Math.abs(r)));
  let s: string;
  if (e < -4 || e >= p) {
    s = r.toExponential(p - 1).replace(/\.?0+e/, 'e');
  } else {
    s = r.toFixed(Math.max(0, p - 1 - e));
    if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  }
  return s.replace('-', '−');
}

/** Ток с приставкой единиц (varunits_string.m); на входе — нА. */
export function fmtCurrent(nA: number): string {
  const a = Math.abs(nA);
  let v = nA;
  let prefix = 'н';
  if (a >= 1e9) {
    v = nA / 1e9;
    prefix = '';
  } else if (a >= 1e6) {
    v = nA / 1e6;
    prefix = 'м';
  } else if (a >= 1e3) {
    v = nA / 1e3;
    prefix = 'мк';
  }
  return `${v.toFixed(2).replace('-', '−')} ${prefix}А`;
}

export interface CursorReadout {
  label: string;
  value: string;
  time: string;
  color: string;
}

export function readout(): CursorReadout | null {
  const c = cursor.value;
  if (!c) return null;
  const L = lineInfo(c.line);
  if (!L || c.index >= L.n) return null;
  const v = L.value(c.index);
  return {
    label: L.label,
    value: L.vcCurrent ? fmtCurrent(v) : `${fmtG(v)}${L.unit ? ' ' + L.unit : ''}`,
    time: `${(L.x[c.index] * 1000).toFixed(2)} мс`,
    color: L.color,
  };
}
