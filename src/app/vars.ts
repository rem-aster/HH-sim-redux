import type { HistKey } from '../model/engine';

/** Масштаб переменной на нижнем графике (graph_scale.m): graph = value · a + b. */
export interface VarScale {
  a: number;
  b: number;
  min: number;
  max: number;
  unit: string;
}

export const SCALES = {
  gate: { a: 1, b: 0, min: 0, max: 1, unit: '' },
  current: { a: 1 / 1.5, b: 0.5, min: -0.75, max: 0.75, unit: 'мкА' },
  cond: { a: 1 / 30, b: 0, min: 0, max: 30, unit: 'мкСм' },
  leak: { a: 22.5, b: 0.5, min: -1 / 45, max: 1 / 45, unit: 'мкА' },
} satisfies Record<string, VarScale>;

export type ScaleId = keyof typeof SCALES;

export interface VarDef {
  id: string;
  /** Название в списке выбора. */
  label: string;
  /** Короткое обозначение для легенды и курсора. */
  short: string;
  col: HistKey | null;
  scale: ScaleId | null;
  hint: string;
}

export const VARS: VarDef[] = [
  { id: 'm', label: 'm', short: 'm', col: 'm', scale: 'gate', hint: 'Активационные ворота Na-канала' },
  { id: 'h', label: 'h', short: 'h', col: 'h', scale: 'gate', hint: 'Инактивационные ворота Na-канала' },
  { id: 'n', label: 'n', short: 'n', col: 'n', scale: 'gate', hint: 'Активационные ворота K-канала' },
  { id: 'INa', label: 'I_Na (мкА)', short: 'I_Na', col: 'INa', scale: 'current', hint: 'Ток быстрого натриевого канала' },
  { id: 'IK', label: 'I_K (мкА)', short: 'I_K', col: 'IK', scale: 'current', hint: 'Ток калиевого канала задержанного выпрямления' },
  { id: 'gNa', label: 'g_Na (мкСм)', short: 'g_Na', col: 'gNa', scale: 'cond', hint: 'Проводимость натриевого канала' },
  { id: 'gK', label: 'g_K (мкСм)', short: 'g_K', col: 'gK', scale: 'cond', hint: 'Проводимость калиевого канала' },
  { id: 'Ileak', label: 'I_утечки (мкА)', short: 'I_утечки', col: 'Ileak', scale: 'leak', hint: 'Ток через пассивные каналы' },
  { id: 'p', label: 'p (польз. канал)', short: 'p', col: 'p', scale: 'gate', hint: 'Ворота 1 канала пользователя' },
  { id: 'q', label: 'q (польз. канал)', short: 'q', col: 'q', scale: 'gate', hint: 'Ворота 2 канала пользователя' },
  { id: 'Iuser', label: 'I_польз (мкА)', short: 'I_польз', col: 'Iuser', scale: 'current', hint: 'Ток канала пользователя' },
  { id: 'guser', label: 'g_польз (мкСм)', short: 'g_польз', col: 'guser', scale: 'cond', hint: 'Проводимость канала пользователя' },
  { id: 'none', label: 'пусто', short: '', col: null, scale: null, hint: 'Не показывать линию' },
];

export const varById = (id: string): VarDef => VARS.find((v) => v.id === id) ?? VARS[VARS.length - 1];

export function formatRange(s: VarScale): [string, string] {
  const f = (v: number) => {
    const r = Math.abs(v) < 0.1 && v !== 0 ? v.toFixed(3) : String(Number(v.toFixed(3)));
    return r.replace('-', '−');
  };
  const u = s.unit ? ' ' + s.unit : '';
  return [f(s.min) + u, f(s.max) + u];
}
