// Состояние редактора протокола фиксации потенциала (окно «Стим. ФП»).

import { signal } from '@preact/signals';
import { DEFAULT_VC_LISTS, DEFAULT_VC_SELECTED, VC_MAX_CURVES } from '../model/defaults';
import { engine } from './store';

export const VC_PARAMS = [
  { label: 'Поддерживаемый потенциал', short: 'V₀', unit: 'мВ', min: -90, max: 100 },
  { label: 'Время удержания', short: 't₀', unit: 'мс', min: 0, max: 40 },
  { label: 'Потенциал ступени 1', short: 'V₁', unit: 'мВ', min: -90, max: 100 },
  { label: 'Длительность ступени 1', short: 't₁', unit: 'мс', min: 0, max: 40 },
  { label: 'Потенциал ступени 2', short: 'V₂', unit: 'мВ', min: -90, max: 100 },
  { label: 'Длительность ступени 2', short: 't₂', unit: 'мс', min: 0, max: 40 },
  { label: 'Потенциал ступени 3', short: 'V₃', unit: 'мВ', min: -90, max: 100 },
  { label: 'Длительность ступени 3', short: 't₃', unit: 'мс', min: 0, max: 40 },
] as const;

export const vcState = signal<{ selected: number; lists: string[] }>({
  selected: DEFAULT_VC_SELECTED,
  lists: [...DEFAULT_VC_LISTS],
});

/** Разбор списка значений: числа через пробел, запятую или точку с запятой (не больше 8). */
export function parseList(str: string): number[] {
  return str
    .replace(/[^.\s\d,;\-−]/g, '')
    .replace(/−/g, '-')
    .split(/[\s,;]+/)
    .filter((s) => s !== '' && s !== '-' && s !== '.')
    .map(Number)
    .filter(Number.isFinite)
    .slice(0, VC_MAX_CURVES);
}

function clampValue(i: number, v: number): number {
  // как update_vc_box_slider.m: потенциалы −90…100 мВ; длительности — не отрицательные
  return i % 2 === 0 ? Math.max(-90, Math.min(100, v)) : Math.max(0, Math.min(100, v));
}

/** Значения варьируемого параметра для «Пуска». */
export function vcValues(): number[] {
  const { selected, lists } = vcState.value;
  return parseList(lists[selected]).map((v) => clampValue(selected, v));
}

export function selectVaried(i: number): void {
  vcState.value = { ...vcState.value, selected: i };
  const first = parseList(vcState.value.lists[i])[0];
  if (first !== undefined) syncSlider(i, first);
}

function syncSlider(i: number, v: number): void {
  const p = VC_PARAMS[i];
  engine.setVcProtocol(i, Math.max(p.min, Math.min(p.max, Math.round(v))));
}

/** Изменение списка значений варьируемого параметра. */
export function setList(str: string): void {
  const s = vcState.value;
  const lists = [...s.lists];
  lists[s.selected] = str;
  vcState.value = { ...s, lists };
  const first = parseList(str)[0];
  if (first !== undefined) syncSlider(s.selected, clampValue(s.selected, first));
}

/** Нормализовать список (при потере фокуса): убрать лишнее, ограничить значения. */
export function normalizeList(): void {
  const s = vcState.value;
  const vals = parseList(s.lists[s.selected]).map((v) => clampValue(s.selected, v));
  const lists = [...s.lists];
  lists[s.selected] = vals.join(' ');
  vcState.value = { ...s, lists };
}

/** Изменение параметра ползунком или полем ввода. */
export function setProtocolValue(i: number, v: number): void {
  engine.setVcProtocol(i, v);
  const s = vcState.value;
  const lists = [...s.lists];
  const nums = parseList(lists[i]);
  nums[0] = v;
  lists[i] = nums.join(' ');
  vcState.value = { ...s, lists };
}

export function resetVc(): void {
  engine.resetVcProtocol();
  vcState.value = { selected: DEFAULT_VC_SELECTED, lists: [...DEFAULT_VC_LISTS] };
}
