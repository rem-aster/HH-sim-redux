// Экспорт данных в текстовую таблицу и сохранение/печать графиков.

import { CanvasPlot } from '../plot/canvas-plot';
import { cursor, engine, showToast, varSel } from './store';
import { varById } from './vars';
import { PRINT_COLORS, PRINT_THEME } from './theme';

export type CsvFlavor = 'comma' | 'excel';

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function num(v: number, digits: number, flavor: CsvFlavor): string {
  if (!Number.isFinite(v)) return '';
  const s = Number(v.toPrecision(digits)).toString();
  return flavor === 'excel' ? s.replace('.', ',') : s;
}

/** Таблица с данными графиков. Если курсор установлен — только линия под курсором. */
export function buildTable(flavor: CsvFlavor): { header: string[]; rows: string[][] } | null {
  const c = cursor.value;
  if (engine.mode === 'cc') {
    const h = engine.hist;
    const n = h.length;
    const t = h.col('t');
    const sel = varSel.value.map(varById).filter((v) => v.col);
    type Col = { name: string; get: (i: number) => number };
    const cols: Col[] = [];
    const V = h.col('V');
    const S = h.col('stim');
    const colV: Col = { name: 'мембранный потенциал (мВ)', get: (i) => V[i] * 1000 };
    const colS: Col = { name: 'уровень стимула (нА)', get: (i) => S[i] };
    const colVar = (k: number): Col | null => {
      const v = varById(varSel.value[k]);
      if (!v.col) return null;
      const Y = h.col(v.col);
      return { name: v.label, get: (i) => Y[i] };
    };
    if (c) {
      const col = c.line === 0 ? colV : c.line === 1 ? colS : colVar(c.line - 2);
      if (col) cols.push(col);
    } else {
      cols.push(colV, colS);
      varSel.value.forEach((_, k) => {
        const col = colVar(k);
        if (col) cols.push(col);
      });
      void sel;
    }
    const rows: string[][] = [];
    for (let i = 0; i < n; i++) rows.push([num(t[i] * 1000, 8, flavor), ...cols.map((col) => num(col.get(i), 6, flavor))]);
    return { header: ['время (мс)', ...cols.map((col) => col.name)], rows };
  }
  const curves = engine.vcCurves;
  if (curves.length === 0) return null;
  const list = c ? [curves[c.line % 8]].filter(Boolean) : curves;
  const header: string[] = [];
  list.forEach((_, j) => {
    const sfx = list.length > 1 ? ` [${j + 1}]` : '';
    header.push(`время (мс)${sfx}`, `фиксированный потенциал (мВ)${sfx}`, `ток (нА)${sfx}`);
  });
  const nmax = Math.max(...list.map((cv) => cv.data.length));
  const rows: string[][] = [];
  for (let i = 0; i < nmax; i++) {
    const row: string[] = [];
    for (const cv of list) {
      const d = cv.data;
      if (i < d.length) row.push(num(d.col('t')[i] * 1000, 8, flavor), num(d.col('V')[i], 6, flavor), num(d.col('I')[i], 6, flavor));
      else row.push('', '', '');
    }
    rows.push(row);
  }
  return { header, rows };
}

export function exportCsv(flavor: CsvFlavor): void {
  const tbl = buildTable(flavor);
  if (!tbl || tbl.rows.length === 0) {
    showToast('Нельзя экспортировать пустой график.');
    return;
  }
  const sep = flavor === 'excel' ? ';' : ',';
  const esc = (s: string) => (/[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [tbl.header.map(esc).join(sep), ...tbl.rows.map((r) => r.join(sep))];
  // BOM нужен Excel, чтобы распознать UTF-8
  const blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const m = engine.mode === 'cc' ? 'registraciya' : 'fiksaciya';
  download(`hhsim-${m}-${stamp()}.csv`, blob);
}

// ------------------------------------------------------------ картинка графиков

export interface PlotEntry {
  plot: CanvasPlot;
  weight: number;
  legend: { color: string; label: string }[];
}

const printColor = (name: string) => PRINT_COLORS[name] ?? '#444';

/** Собирает графики в одно изображение со светлым фоном. */
export function renderImage(entries: PlotEntry[], title: string, width = 1600): HTMLCanvasElement {
  const scale = 2;
  const legendH = 26;
  const titleH = 40;
  const total = entries.reduce((s, e) => s + e.weight, 0);
  const plotsH = Math.round(width * 0.55);
  const height = titleH + entries.length * legendH + plotsH + 16;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = PRINT_THEME.text;
  ctx.font = `600 16px ${PRINT_THEME.font}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 16, titleH / 2);
  ctx.font = `12px ${PRINT_THEME.font}`;
  ctx.fillStyle = PRINT_THEME.muted;
  ctx.textAlign = 'right';
  ctx.fillText(`HHsim · ${new Date().toLocaleString('ru-RU')}`, width - 16, titleH / 2);
  ctx.textAlign = 'left';
  let y = titleH;
  for (const e of entries) {
    // легенда
    let x = 64;
    ctx.font = `12px ${PRINT_THEME.font}`;
    for (const l of e.legend) {
      ctx.fillStyle = printColor(l.color);
      ctx.fillRect(x, y + legendH / 2 - 1.5, 16, 3);
      ctx.fillStyle = PRINT_THEME.text;
      ctx.fillText(l.label, x + 22, y + legendH / 2);
      x += 30 + ctx.measureText(l.label).width;
    }
    y += legendH;
    const h = Math.round((plotsH * e.weight) / total);
    ctx.save();
    ctx.translate(0, y);
    e.plot.drawForExport(ctx, width, h, PRINT_THEME, printColor);
    ctx.restore();
    y += h;
  }
  return canvas;
}

export function savePng(entries: PlotEntry[], title: string): void {
  const c = renderImage(entries, title);
  c.toBlob((b) => {
    if (b) download(`hhsim-${stamp()}.png`, b);
  }, 'image/png');
}

export function printPlots(entries: PlotEntry[], title: string): void {
  const c = renderImage(entries, title);
  let area = document.getElementById('print-area');
  if (!area) {
    area = document.createElement('div');
    area.id = 'print-area';
    document.body.append(area);
  }
  area.innerHTML = '';
  const img = new Image();
  img.src = c.toDataURL('image/png');
  img.alt = title;
  area.append(img);
  img.decode().finally(() => window.print());
}
