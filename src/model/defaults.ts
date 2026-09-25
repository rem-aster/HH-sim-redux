// Исходные значения параметров модели HHsim 3.7 (перенесены без изменений).
// Внутренние единицы — как в оригинале: СИ (В, с, См, Ф, А), концентрации в мМ,
// температура в °C, параметры скоростей ворот — для потенциала в мВ и времени в мс.

export const ION_NA = 1;
export const ION_K = 2;
export const ION_CL = 3;
export const ION_NONE = 4;
export type Ion = 1 | 2 | 3 | 4;

/** Вид функции скорости перехода ворот. */
export type RateFn = 1 | 2 | 3 | 4;

export interface Rate {
  fn: RateFn;
  c: number;
  th: number;
  s: number;
}

export interface GateParams {
  /** Показатель степени (0…6). */
  expt: number;
  alpha: Rate;
  beta: Rate;
}

export interface ChannelParams {
  ion: Ion;
  /** Максимальная проводимость, См. */
  gmax: number;
  gate1: GateParams;
  gate2: GateParams;
}

export type ChannelId = 'na' | 'k' | 'user';
export type PassiveId = 'na' | 'k' | 'cl';

export interface MembraneParams {
  Nai: number;
  Nao: number;
  Ki: number;
  Ko: number;
  Cli: number;
  Clo: number;
  /** Температура, °C. */
  T: number;
  /** Ёмкость мембраны, Ф. */
  Cm: number;
}

export interface StimParams {
  lag: number; // мс
  mag1: number; // нА
  dur1: number; // мс
  gap: number; // мс
  mag2: number; // нА
  dur2: number; // мс
}

/** Протокол фиксации потенциала: 4 сегмента «потенциал (мВ), длительность (мс)». */
export type VcProtocol = [number, number, number, number, number, number, number, number];

const rate = (fn: RateFn, c: number, th: number, s: number): Rate => ({ fn, c, th, s });
const noRate = (): Rate => rate(4, 0, 0, 0);

export const DEFAULT_MEMBRANE: MembraneParams = {
  Nai: 50,
  Nao: 440,
  Ki: 400,
  Ko: 20,
  Cli: 52,
  Clo: 560,
  T: 6.3,
  Cm: 1e-9,
};

export const DEFAULT_PASSIVE: Record<PassiveId, number> = {
  na: 0.0265e-6,
  k: 0.07e-6,
  cl: 0.1e-6,
};

export function defaultChannel(id: ChannelId): ChannelParams {
  switch (id) {
    case 'na':
      return {
        ion: ION_NA,
        gmax: 120e-6,
        gate1: { expt: 3, alpha: rate(2, 0.1, -40, -0.1), beta: rate(1, 4.0, -65, -1 / 18) },
        gate2: { expt: 1, alpha: rate(1, 0.07, -65, -1 / 20), beta: rate(3, 1, -35, -0.1) },
      };
    case 'k':
      return {
        ion: ION_K,
        gmax: 36e-6,
        gate1: { expt: 4, alpha: rate(2, 0.01, -55, -0.1), beta: rate(1, 0.125, -65, -1 / 80) },
        gate2: { expt: 0, alpha: noRate(), beta: noRate() },
      };
    case 'user':
      return {
        ion: ION_NA,
        gmax: 0,
        gate1: { expt: 0, alpha: noRate(), beta: noRate() },
        gate2: { expt: 0, alpha: noRate(), beta: noRate() },
      };
  }
}

/** Начальные значения переменных ворот (состояние покоя). NaN — как в оригинале для неиспользуемых ворот. */
export const INITIAL_GATES = [0.068775, 0.515186, 0.35286656, NaN, NaN, NaN];
export const INITIAL_V = -63.39 / 1000;

export const DEFAULT_SWITCHES = {
  passive: { na: 1, k: 1, cl: 1 } as Record<PassiveId, number>,
  channel: { na: 1, k: 1, user: 0 } as Record<ChannelId, number>,
};

export const DEFAULT_STIM: [StimParams, StimParams] = [
  { lag: 0, mag1: 10, dur1: 1, gap: 1, mag2: 0, dur2: 1 },
  { lag: 0, mag1: -10, dur1: 2, gap: 1, mag2: 0, dur2: 1 },
];

export const DEFAULT_VC: VcProtocol = [-60, 10, -40, 20, -60, 10, 0, 0];

/** Списки значений варьируемого параметра, которые оригинал показывает по умолчанию. */
export const DEFAULT_VC_LISTS = ['-60', '10', '-40', '20', '-60', '10', '0', '0'];
export const DEFAULT_VC_SELECTED = 2; // «Потенциал ступени 1» (индекс с нуля)
export const VC_MAX_CURVES = 8;

/** Препараты: IC50 и диапазон концентраций графика доза–эффект. */
export const DRUGS = [
  { id: 'ttx', abbr: 'TTX', ic50: 10, cmin: 0.1, cmax: 100, unit: 'нМ' },
  { id: 'tea', abbr: 'TEA', ic50: 10, cmin: 0.1, cmax: 100, unit: 'мМ' },
] as const;

/** Максимальный шаг интегрирования, с (с проназой шаг мельче). */
export function maxDeltaT(pronase: boolean): number {
  return pronase ? 1e-5 : 1e-4;
}
