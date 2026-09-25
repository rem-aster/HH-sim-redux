// Линии графиков из данных модели.

import type { Series } from '../plot/canvas-plot';
import { engine, varSel } from './store';
import { cssVar } from './theme';
import { SCALES, varById } from './vars';

type ColorFn = (name: string) => string;

export const VAR_COLORS = ['--c-var1', '--c-var2', '--c-var3'];
export const STIM_OFFSET = -85; // стимул рисуется как ток (нА) − 85 на оси потенциала

export function mainSeries(color: ColorFn = cssVar): Series[] {
  const h = engine.hist;
  return [
    {
      key: 'V',
      label: 'Потенциал',
      color: color('--c-v'),
      x: h.col('t'),
      y: h.col('V'),
      n: h.length,
      xa: 1000,
      ya: 1000,
      yb: 0,
      va: 1000,
      unit: 'мВ',
      width: 1.9,
    },
    {
      key: 'stim',
      label: 'Стимул',
      color: color('--c-stim'),
      x: h.col('t'),
      y: h.col('stim'),
      n: h.length,
      xa: 1000,
      ya: 1,
      yb: STIM_OFFSET,
      unit: 'нА',
      width: 1.4,
    },
  ];
}

export function varSeries(color: ColorFn = cssVar): Series[] {
  const h = engine.hist;
  const out: Series[] = [];
  varSel.value.forEach((id, k) => {
    const v = varById(id);
    if (!v.col || !v.scale) return;
    const s = SCALES[v.scale];
    out.push({
      key: 'v' + k,
      label: v.short,
      color: color(VAR_COLORS[k]),
      x: h.col('t'),
      y: h.col(v.col),
      n: h.length,
      xa: 1000,
      ya: s.a,
      yb: s.b,
      unit: s.unit,
      width: 1.7,
    });
  });
  return out;
}

export const vcColor = (k: number) => `--c-vc${k % 8}`;

export function vcCurrentSeries(color: ColorFn = cssVar): Series[] {
  return engine.vcCurves.map((c, k) => ({
    key: 'I' + k,
    label: `Кривая ${k + 1}`,
    color: color(vcColor(c.color)),
    x: c.data.col('t'),
    y: c.data.col('I'),
    n: c.data.length,
    xa: 1000,
    ya: 1,
    yb: 0,
    unit: 'нА',
    width: 1.6,
  }));
}

export function vcVoltageSeries(color: ColorFn = cssVar): Series[] {
  return engine.vcCurves.map((c, k) => ({
    key: 'U' + k,
    label: `Кривая ${k + 1}`,
    color: color(vcColor(c.color)),
    x: c.data.col('t'),
    y: c.data.col('V'),
    n: c.data.length,
    xa: 1000,
    ya: 1,
    yb: 0,
    unit: 'мВ',
    width: 1.6,
  }));
}
