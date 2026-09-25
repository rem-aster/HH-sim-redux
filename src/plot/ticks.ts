/** «Красивые» деления оси: шаг 1, 2 или 5 × 10^k. */
export function niceStep(span: number, target: number): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / Math.max(1, target);
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  const m = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return m * p;
}

export function linearTicks(min: number, max: number, target: number): { values: number[]; step: number } {
  const step = niceStep(max - min, target);
  const values: number[] = [];
  const start = Math.ceil(min / step - 1e-9) * step;
  for (let v = start; v <= max + step * 1e-9; v += step) {
    values.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    if (values.length > 200) break;
  }
  return { values, step };
}

/** Число знаков после запятой, достаточное для шага step. */
export function decimalsFor(step: number): number {
  if (!(step > 0)) return 0;
  return Math.max(0, Math.min(10, -Math.floor(Math.log10(step) + 1e-9)));
}

export function formatTick(v: number, step: number): string {
  return v.toFixed(decimalsFor(step)).replace('-', '−');
}
