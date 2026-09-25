// Ядро HHsim: точный перенос численной схемы оригинала (iterate.m, find_dV.m,
// vc_iterate.m, find_I.m, vc_stabilize.m и др.). Порядок арифметических операций
// сохранён, чтобы результаты совпадали с версией для Octave/MATLAB.

import { Columns } from './columns';
import {
  DEFAULT_MEMBRANE,
  DEFAULT_PASSIVE,
  DEFAULT_STIM,
  DEFAULT_SWITCHES,
  DEFAULT_VC,
  INITIAL_GATES,
  INITIAL_V,
  VC_MAX_CURVES,
  defaultChannel,
  maxDeltaT,
  type ChannelId,
  type ChannelParams,
  type MembraneParams,
  type PassiveId,
  type Rate,
  type StimParams,
  type VcProtocol,
} from './defaults';

export const HIST_KEYS = [
  't', // время, с
  'V', // мембранный потенциал, В
  'stim', // ток стимула, нА
  'm',
  'h',
  'n',
  'INa', // мкА
  'IK', // мкА
  'gNa', // мкСм
  'gK', // мкСм
  'Ileak', // мкА
  'p',
  'q',
  'Iuser', // мкА
  'guser', // мкСм
] as const;
export type HistKey = (typeof HIST_KEYS)[number];

export const VC_KEYS = ['t', 'V', 'I'] as const; // с, мВ, нА
export type VcKey = (typeof VC_KEYS)[number];

export interface VcCurve {
  /** Номер цвета (0…7), закреплён за кривой. */
  color: number;
  /** Значение варьируемого параметра для этой кривой. */
  value: number;
  /** Номер варьируемого параметра протокола (0…7). */
  varied: number;
  data: Columns<VcKey>;
  done: boolean;
}

/** Сохранённое состояние переменных Ходжкина–Хаксли (кнопки «Запомнить» / «Вернуть»). */
export interface Snapshot {
  V: number;
  m: number;
  h: number;
  n: number;
  p: number;
  q: number;
}

export type Mode = 'cc' | 'vc';

export type EngineEvent =
  | 'params' // изменились параметры модели
  | 'run' // изменилось состояние запуска
  | 'clear' // очищена история режима регистрации
  | 'vc' // изменился набор кривых фиксации потенциала
  | 'vcfull'; // превышено число кривых

interface StimSegment {
  amp: number; // А
  rem: number; // оставшееся время, с
}

interface VcSegment {
  V: number; // В
  rem: number; // с
}

const CHANNELS: ChannelId[] = ['na', 'k', 'user'];

/** Функция скорости перехода ворот (evalrate.m). V — в мВ. */
export function evalRate(r: Rate, V: number, zgain: number): number {
  let z: number;
  switch (r.fn) {
    case 1:
      z = r.c * Math.exp((V - r.th) * r.s);
      break;
    case 2:
      if (V === r.th) V = r.th + 0.01; // защита от деления на ноль
      if (r.s !== 0) z = (r.c * (V - r.th)) / (1 - Math.exp((V - r.th) * r.s));
      else z = (r.c * (V - r.th)) / (1 - Math.exp(0.0001));
      break;
    case 3:
      z = r.c / (1 + Math.exp((V - r.th) * r.s));
      break;
    default:
      z = V * 0;
  }
  // температурная поправка (по данным для аксона кальмара)
  return z * zgain;
}

/** Равновесный потенциал Нернста, В (equilib.m). */
export function equilib(Ci: number, Co: number, T: number, Z: number): number {
  const TK = T + 273.16;
  const R = 8.31451;
  const F = 96485.3;
  return ((R * TK) / (Z * F)) * Math.log(Co / Ci);
}

/** Ограничение значением [0, 1]; NaN превращается в 0, как max/min в MATLAB. */
function clamp01(x: number): number {
  return x > 1 ? 1 : x >= 0 ? x : 0;
}

function copyChannel(c: ChannelParams): ChannelParams {
  return {
    ion: c.ion,
    gmax: c.gmax,
    gate1: { expt: c.gate1.expt, alpha: { ...c.gate1.alpha }, beta: { ...c.gate1.beta } },
    gate2: { expt: c.gate2.expt, alpha: { ...c.gate2.alpha }, beta: { ...c.gate2.beta } },
  };
}

export class Engine {
  // ---------- параметры ----------
  membrane: MembraneParams = { ...DEFAULT_MEMBRANE };
  passive: Record<PassiveId, number> = { ...DEFAULT_PASSIVE };
  passiveOn: Record<PassiveId, number> = { ...DEFAULT_SWITCHES.passive };
  channels: Record<ChannelId, ChannelParams> = {
    na: defaultChannel('na'),
    k: defaultChannel('k'),
    user: defaultChannel('user'),
  };
  channelOn: Record<ChannelId, number> = { ...DEFAULT_SWITCHES.channel };
  /** Процент ингибирования TTX и TEA. */
  inhibition: [number, number] = [0, 0];
  pronase = false;
  stims: [StimParams, StimParams] = [{ ...DEFAULT_STIM[0] }, { ...DEFAULT_STIM[1] }];
  vcProtocol: VcProtocol = [...DEFAULT_VC] as VcProtocol;

  // ---------- производные величины ----------
  ENa = 0;
  EK = 0;
  ECl = 0;
  Vr = 0;
  Rm = 0;
  zgain = 1;

  // ---------- динамическое состояние ----------
  mode: Mode = 'cc';
  V = INITIAL_V;
  /** Переменные ворот: m, h (Na), n, — (K), p, q (канал пользователя). */
  gv = Float64Array.from(INITIAL_GATES);
  I_leak = 0;
  deltaT = maxDeltaT(false);
  time = 0;
  /** История режима регистрации. */
  readonly hist = new Columns<HistKey>(HIST_KEYS, 4096);

  private stimtimer: StimSegment[] = [{ amp: 0, rem: Infinity }];
  private nudgeTime = 0;
  /** 0 — до установления, Infinity — непрерывно, 1 — остановить. */
  private stopflag = 0;
  private lastTime = 0;
  private clearFlag = false;
  private recallFlag = false;
  private saved: Snapshot | null = null;
  private modeSwitchSnap: Snapshot | null = null;
  running = false;

  // ---------- фиксация потенциала ----------
  readonly vcCurves: VcCurve[] = [];
  vcYmin = -10;
  vcYmax = 10;
  private vcQueue: number[] = [];
  private vcVaried = 2;
  private vcTimer: VcSegment[] = [{ V: 0, rem: Infinity }];
  private vcTime = 0;
  private deltaV = 0;
  private highrescnt = 0;
  private vcCurve: VcCurve | null = null;

  private listeners = new Set<(e: EngineEvent) => void>();

  constructor(opts: { autostart?: boolean } = {}) {
    this.recalc();
    if (opts.autostart !== false) this.start();
  }

  on(fn: (e: EngineEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: EngineEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  // =====================================================================
  // Производные величины мембраны
  // =====================================================================

  private recalc(): void {
    const m = this.membrane;
    this.zgain = 3 ** ((m.T - 6.3) / 10);
    this.ENa = equilib(m.Nai, m.Nao, m.T, +1);
    this.EK = equilib(m.Ki, m.Ko, m.T, +1);
    this.ECl = equilib(m.Cli, m.Clo, m.T, -1);
    const gxK = this.passive.k * this.passiveOn.k;
    const gxNa = this.passive.na * this.passiveOn.na;
    const gxCl = this.passive.cl * this.passiveOn.cl;
    this.Vr = (this.EK * gxK + this.ENa * gxNa + this.ECl * gxCl) / Math.max(gxK + gxNa + gxCl, 1e-15);
    // В оригинале Rm не учитывал выключенные каналы; здесь учитывает.
    const g = gxCl + gxK + gxNa;
    this.Rm = g > 0 ? 1 / g : Infinity;
  }

  get gmult1(): number {
    return (100 - this.inhibition[0]) / 100;
  }

  get gmult2(): number {
    return (100 - this.inhibition[1]) / 100;
  }

  /** Диапазон оси потенциала главного графика, мВ (resize_main_axis.m). */
  get mainYRange(): [number, number] {
    return this.EK * 1000 <= -95 ? [-150, 60] : [-100, 60];
  }

  // =====================================================================
  // Изменение параметров
  // =====================================================================

  /** Вызывается после любого изменения параметров модели. */
  changed(nudge = true): void {
    this.recalc();
    this.emit('params');
    if (nudge) this.nudge();
  }

  setMembrane<K extends keyof MembraneParams>(key: K, value: number): void {
    this.membrane[key] = value;
    this.changed();
  }

  setPassive(id: PassiveId, g: number): void {
    this.passive[id] = g;
    this.changed();
  }

  setPassiveOn(id: PassiveId, on: boolean): void {
    this.passiveOn[id] = on ? 1 : 0;
    this.changed();
  }

  setChannelOn(id: ChannelId, on: boolean): void {
    this.channelOn[id] = on ? 1 : 0;
    this.changed();
  }

  updateChannel(id: ChannelId, fn: (c: ChannelParams) => void): void {
    fn(this.channels[id]);
    this.changed();
  }

  /** Скопировать параметры в канал пользователя (copy_channel_params.m). */
  copyToUser(src: 'na' | 'k'): void {
    const c = copyChannel(this.channels[src]);
    c.gmax = c.gmax * 1e6 * 1e-6; // как в оригинале: через значение поля в мкСм
    if (src === 'k') c.gate2 = defaultChannel('user').gate2;
    this.channels.user = c;
    this.changed();
  }

  resetMembrane(): void {
    this.membrane = { ...DEFAULT_MEMBRANE };
    this.changed();
  }

  /** Сброс окна «Каналы»: пассивные проводимости и переключатели каналов. */
  resetChannels(): void {
    this.passive = { ...DEFAULT_PASSIVE };
    this.passiveOn = { ...DEFAULT_SWITCHES.passive };
    this.channelOn = { ...DEFAULT_SWITCHES.channel };
    this.changed();
  }

  /** Сброс параметров одного потенциал-зависимого канала (reset_channel.m). */
  resetChannel(id: ChannelId): void {
    this.channels[id] = defaultChannel(id);
    this.changed();
  }

  setInhibition(drug: 0 | 1, percent: number): void {
    this.inhibition[drug] = Math.max(0, Math.min(100, percent));
    this.changed();
  }

  setPronase(on: boolean): void {
    this.pronase = on;
    this.changed(false);
    this.runSystem(0); // set_pronase.m вызывает iterate
  }

  resetDrugs(): void {
    this.inhibition = [0, 0];
    this.pronase = false;
    this.changed();
  }

  get drugsActive(): boolean {
    return this.pronase || this.inhibition[0] !== 0 || this.inhibition[1] !== 0;
  }

  setStim(k: 0 | 1, p: Partial<StimParams>): void {
    Object.assign(this.stims[k], p);
    this.emit('params');
  }

  resetStims(): void {
    this.stims = [{ ...DEFAULT_STIM[0] }, { ...DEFAULT_STIM[1] }];
    this.emit('params');
  }

  setVcProtocol(i: number, v: number): void {
    this.vcProtocol[i] = v;
    this.emit('params');
  }

  resetVcProtocol(): void {
    this.vcProtocol = [...DEFAULT_VC] as VcProtocol;
    this.emit('params');
  }

  /** Сбросить всё к исходному состоянию (как перезапуск программы). */
  restart(): void {
    this.running = false;
    this.membrane = { ...DEFAULT_MEMBRANE };
    this.passive = { ...DEFAULT_PASSIVE };
    this.passiveOn = { ...DEFAULT_SWITCHES.passive };
    this.channelOn = { ...DEFAULT_SWITCHES.channel };
    this.channels = { na: defaultChannel('na'), k: defaultChannel('k'), user: defaultChannel('user') };
    this.inhibition = [0, 0];
    this.pronase = false;
    this.stims = [{ ...DEFAULT_STIM[0] }, { ...DEFAULT_STIM[1] }];
    this.vcProtocol = [...DEFAULT_VC] as VcProtocol;
    this.mode = 'cc';
    this.V = INITIAL_V;
    this.gv = Float64Array.from(INITIAL_GATES);
    this.I_leak = 0;
    this.deltaT = maxDeltaT(false);
    this.time = 0;
    this.hist.clear();
    this.stimtimer = [{ amp: 0, rem: Infinity }];
    this.nudgeTime = 0;
    this.stopflag = 0;
    this.lastTime = 0;
    this.clearFlag = false;
    this.recallFlag = false;
    this.saved = null;
    this.modeSwitchSnap = null;
    this.vcCurves.length = 0;
    this.vcQueue = [];
    this.vcCurve = null;
    this.vcTimer = [{ V: 0, rem: Infinity }];
    this.vcYmin = -10;
    this.vcYmax = 10;
    this.recalc();
    this.emit('params');
    this.emit('clear');
    this.emit('vc');
    this.start();
  }

  // =====================================================================
  // Управление запуском (run_system.m)
  // =====================================================================

  private start(): void {
    if (this.running) return;
    if (this.stopflag === 1) this.stopflag = 0;
    this.running = true;
    this.emit('run');
  }

  private runSystem(mode: 0 | 1 | 2 | 3, nudgeSec = 0.002): void {
    if (this.mode !== 'cc') {
      if (mode === 3) this.stopflag = 1;
      return;
    }
    switch (mode) {
      case 0: // до установления
        this.start();
        break;
      case 1: // «Шаг»: не меньше 2 мс
        this.nudgeTime = this.time + nudgeSec;
        this.start();
        break;
      case 2: // «Пуск»: непрерывно
        this.stopflag = Infinity;
        this.start();
        this.emit('run');
        break;
      case 3: // «Стоп»
        this.stopflag = 1;
        this.nudgeTime = 0;
        this.emit('run');
        break;
    }
  }

  /** Непрерывный режим («Пуск») включён. */
  get continuous(): boolean {
    return this.running && this.stopflag === Infinity;
  }

  /** «Шаг»: продвинуть моделирование не меньше чем на seconds (по умолчанию 2 мс). */
  nudge(seconds = 0.002): void {
    this.runSystem(1, seconds);
  }

  run(): void {
    this.runSystem(2);
  }

  stop(): void {
    if (this.mode === 'vc') {
      if (this.running) this.stopflag = 1;
      return;
    }
    this.runSystem(3);
  }

  /** Подать стимул Стим1 (k = 0) или Стим2 (k = 1) (begin_stimulus.m). */
  stimulate(k: 0 | 1): void {
    if (this.mode !== 'cc') return;
    const s = this.stims[k];
    this.stimtimer = [
      { amp: 0 * 1e-9, rem: s.lag * 1e-3 },
      { amp: s.mag1 * 1e-9, rem: s.dur1 * 1e-3 },
      { amp: 0 * 1e-9, rem: s.gap * 1e-3 },
      { amp: s.mag2 * 1e-9, rem: s.dur2 * 1e-3 },
      { amp: 0 * 1e-9, rem: Infinity },
    ];
    this.runSystem(0);
  }

  /** «Очистить». */
  clear(): void {
    if (this.mode === 'cc') {
      this.clearFlag = true;
      this.runSystem(1);
    } else {
      this.vcClear();
    }
  }

  /** «Вернуть» — восстановить сохранённое состояние. */
  recall(): void {
    if (this.mode !== 'cc') return;
    this.recallFlag = true;
    this.runSystem(1);
  }

  /** «Запомнить» — сохранить состояние в точке истории с индексом i. */
  store(i: number): void {
    const s = this.snapshotAt(i);
    if (s) this.saved = s;
  }

  get hasSaved(): boolean {
    return this.saved !== null;
  }

  private snapshotAt(i: number): Snapshot | null {
    const h = this.hist;
    if (i < 0 || i >= h.length) return null;
    return {
      V: h.col('V')[i],
      m: h.col('m')[i],
      h: h.col('h')[i],
      n: h.col('n')[i],
      p: h.col('p')[i],
      q: h.col('q')[i],
    };
  }

  private restore(s: Snapshot): void {
    this.V = s.V;
    this.gv[0] = s.m;
    this.gv[1] = s.h;
    this.gv[2] = s.n;
    this.gv[4] = s.p;
    this.gv[5] = s.q;
  }

  private clearHistory(): void {
    if (!this.saved) this.saved = this.snapshotAt(0);
    this.time = 0;
    this.lastTime = 0;
    this.nudgeTime = 0;
    this.hist.clear();
    this.emit('clear');
  }

  private recallState(): void {
    const s = this.saved ?? this.snapshotAt(0);
    if (s) this.restore(s);
  }

  // =====================================================================
  // Переключение режимов (switch_mode.m)
  // =====================================================================

  /**
   * @param cursorIndex индекс точки курсора в истории, если курсор установлен:
   *   при возврате в режим регистрации модель вернётся в это состояние
   *   (иначе — в состояние начала истории).
   */
  setMode(mode: Mode, cursorIndex: number | null = null): void {
    if (mode === this.mode) return;
    if (mode === 'vc') {
      this.modeSwitchSnap = this.snapshotAt(cursorIndex ?? 0);
      this.running = false;
      this.stopflag = 0;
      this.nudgeTime = 0;
      this.mode = 'vc';
      this.V = this.vcTimer[0].V;
    } else {
      this.running = false;
      this.stopflag = 0;
      this.vcQueue = [];
      this.vcCurve = null;
      this.mode = 'cc';
      this.V = INITIAL_V;
      if (this.modeSwitchSnap) this.restore(this.modeSwitchSnap);
      this.clearHistory();
      this.runSystem(1);
    }
    this.emit('run');
    this.emit('params');
  }

  // =====================================================================
  // Режим регистрации: интегрирование (find_dV.m, iterate.m)
  // =====================================================================

  private channelCurrent(c: ChannelParams, g1: number, g2: number): number {
    let E: number;
    switch (c.ion) {
      case 1:
        E = this.ENa;
        break;
      case 2:
        E = this.EK;
        break;
      case 3:
        E = this.ECl;
        break;
      default:
        E = 0;
    }
    return c.gmax * 1e6 * (E - this.V) * g1 ** c.gate1.expt * g2 ** c.gate2.expt;
  }

  // токи последнего вызова membraneStep, мкА
  private cPassive = 0;
  private cNa = 0;
  private cK = 0;
  private cUser = 0;

  /**
   * Общая часть find_dV.m и find_I.m: токи утечки, обновление ворот на шаг deltaT
   * и токи потенциал-зависимых каналов.
   */
  private membraneStep(): void {
    const V = this.V;
    const sw = this.passiveOn;
    const g = this.passive;
    const currentK = sw.k * (g.k * 1e6) * (this.EK - V);
    const currentNa = sw.na * (g.na * 1e6) * (this.ENa - V);
    const currentCl = sw.cl * (g.cl * 1e6) * (this.ECl - V);
    this.I_leak = currentK + currentNa + currentCl;
    this.cPassive = currentNa + currentK + currentCl;

    const gv = this.gv;
    const Vm = V * 1e3;
    const zg = this.zgain;
    for (let ci = 0; ci < 3; ci++) {
      const ch = this.channels[CHANNELS[ci]];
      for (let gi = 0; gi < 2; gi++) {
        const gate = gi === 0 ? ch.gate1 : ch.gate2;
        const j = ci * 2 + gi;
        const alpha = evalRate(gate.alpha, Vm, zg);
        const beta = evalRate(gate.beta, Vm, zg);
        const delta = alpha - (alpha + beta) * gv[j];
        gv[j] = clamp01(gv[j] + delta * this.deltaT * 1e3);
      }
    }
    if (this.pronase) gv[1] = 1; // проназа устраняет инактивацию

    this.cNa = this.gmult1 * this.channelOn.na * this.channelCurrent(this.channels.na, gv[0], gv[1]);
    this.cK = this.gmult2 * this.channelOn.k * this.channelCurrent(this.channels.k, gv[2], gv[3]);
    this.cUser = this.channelOn.user * this.channelCurrent(this.channels.user, gv[4], gv[5]);
  }

  /** Изменение потенциала за шаг, В (find_dV.m). Обновляет ворота. */
  private findDV(): number {
    this.membraneStep();
    // dV = dt[мс] * I[мкА] / Cm[нФ] — в вольтах
    return (
      (this.deltaT * 1e3 *
        (this.cPassive + this.cNa + this.cK + this.cUser + this.stimtimer[0].amp * 1e6)) /
      (this.membrane.Cm * 1e9)
    );
  }

  /** Один шаг режима регистрации. Возвращает true, если моделирование остановилось. */
  private stepCC(): boolean {
    if (this.clearFlag) {
      this.clearFlag = false;
      this.clearHistory();
    }
    if (this.recallFlag) {
      this.recallFlag = false;
      this.recallState();
    }

    const gv = this.gv;
    const g0 = new Float64Array(6);
    const gp = new Float64Array(6);
    let correctorDV = 0;
    let errorval2 = 0;
    let errorval5 = 0;
    for (let halvings = 0; ; halvings++) {
      // предиктор-корректор с адаптивным шагом
      g0.set(gv);
      const IL0 = this.I_leak;
      const predictorDV = this.findDV();
      gp.set(gv);
      const predictorIL = this.I_leak;
      correctorDV = 0.5 * (predictorDV + this.findDV());
      const cK = 0.5 * (gv[2] + gp[2]);
      errorval2 = Math.abs(predictorDV - correctorDV) / this.deltaT;
      errorval5 = Math.abs(gp[2] - cK);
      if ((errorval2 > 30 || errorval5 > 0.01) && halvings < 60) {
        gv.set(g0);
        this.I_leak = IL0;
        this.deltaT = this.deltaT / 2.0;
        continue;
      }
      gv[0] = 0.5 * (gv[0] + gp[0]);
      gv[1] = 0.5 * (gv[1] + gp[1]);
      gv[2] = cK;
      // gv[3] (вторые ворота K-канала) в оригинале не усредняются
      gv[4] = 0.5 * (gv[4] + gp[4]);
      gv[5] = 0.5 * (gv[5] + gp[5]);
      this.I_leak = 0.5 * (this.I_leak + predictorIL);
      break;
    }

    this.V = this.V + correctorDV;
    this.time = this.time + this.deltaT;
    this.record();

    const h = this.hist;
    const ptr = h.length; // число точек, как u.ptr в оригинале
    let Vchange = Infinity;
    if (ptr >= 50) {
      const t = h.col('t');
      const Vh = h.col('V');
      const lookfor = this.time - 0.005;
      while (t[this.lastTime] < lookfor) this.lastTime++;
      Vchange = 0;
      for (let i = this.lastTime; i < ptr; i++) {
        const d = Math.abs(Vh[i] - this.V);
        if (d > Vchange) Vchange = d;
      }
    }

    if (
      this.stopflag === 1 ||
      (this.stopflag === 0 &&
        this.nudgeTime <= this.time &&
        Vchange < 1e-3 &&
        this.stimtimer[0].amp === 0 &&
        this.stimtimer.length === 1)
    ) {
      this.stopflag = 0;
      this.running = false;
      return true;
    }

    const seg = this.stimtimer[0];
    seg.rem = seg.rem - this.deltaT;
    if (seg.rem <= 0) this.stimtimer.shift();

    // увеличить шаг вдвое, если ошибка мала
    const deltaTMax = maxDeltaT(this.pronase);
    if (errorval2 < 10 && errorval5 < 0.003 && this.deltaT < deltaTMax) this.deltaT = this.deltaT * 2;
    return false;
  }

  private record(): void {
    const h = this.hist;
    const i = h.append();
    const gv = this.gv;
    const na = this.channels.na;
    const k = this.channels.k;
    const u = this.channels.user;
    h.col('t')[i] = this.time;
    h.col('V')[i] = this.V;
    h.col('stim')[i] = this.stimtimer[0].amp * 1e9;
    h.col('m')[i] = gv[0];
    h.col('h')[i] = gv[1];
    h.col('n')[i] = gv[2];
    h.col('INa')[i] = this.gmult1 * this.channelOn.na * this.channelCurrent(na, gv[0], gv[1]);
    h.col('IK')[i] = this.gmult2 * this.channelOn.k * this.channelCurrent(k, gv[2], gv[3]);
    h.col('gNa')[i] = this.gmult1 * (na.gmax * 1e6) * gv[0] ** na.gate1.expt * gv[1] ** na.gate2.expt;
    h.col('gK')[i] = this.gmult2 * (k.gmax * 1e6) * gv[2] ** k.gate1.expt;
    h.col('Ileak')[i] = -this.I_leak;
    h.col('p')[i] = gv[4];
    h.col('q')[i] = gv[5];
    h.col('Iuser')[i] = this.channelOn.user * this.channelCurrent(u, gv[4], gv[5]);
    h.col('guser')[i] = this.channelOn.user * (u.gmax * 1e6) * gv[4] ** u.gate1.expt * gv[5] ** u.gate2.expt;
  }

  // =====================================================================
  // Режим фиксации потенциала (vc_run.m, vc_addcurve.m, vc_iterate.m)
  // =====================================================================

  /** Ток фиксации, мкА (find_I.m). Обновляет ворота. */
  private findI(): number {
    this.membraneStep();
    // ограничение снизу, чтобы ёмкостный выброс не был слишком большим
    const c_timestep = Math.max(5e-5, this.deltaT);
    return (
      (this.membrane.Cm * 1e9 * this.deltaV) / (c_timestep * 1e3) -
      (this.I_leak + this.cNa + this.cK + this.cUser)
    );
  }

  /** Сегменты протокола для кривой со значением value варьируемого параметра. */
  vcSegments(value: number | null, varied = this.vcVaried): VcSegment[] {
    const p = this.vcProtocol;
    const segs: [number, number][] = [
      [p[0], p[1]],
      [p[2], p[3]],
      [p[4], p[5]],
      [p[6], p[7]],
    ];
    if (value !== null && varied >= 0) {
      const row = varied % 2;
      const v = row === 0 ? Math.max(-90, Math.min(100, value)) : value;
      segs[Math.floor(varied / 2)][row] = v;
    }
    const out: VcSegment[] = [];
    for (const [V, dur] of segs) if (dur !== 0) out.push({ V: V * 1e-3, rem: dur * 1e-3 });
    out.push({ V: 0 * 1e-3, rem: Infinity });
    return out;
  }

  /**
   * «Пуск» в режиме фиксации потенциала: по кривой на каждое значение
   * варьируемого параметра (индекс varied, 0…7).
   */
  vcRun(values: number[], varied: number): void {
    if (this.mode !== 'vc' || this.running) return;
    this.vcVaried = varied;
    this.vcQueue = values.slice(0, VC_MAX_CURVES);
    if (this.stopflag === 1) this.stopflag = 0;
    if (this.vcQueue.length === 0) return;
    this.running = true;
    this.vcNextCurve();
    this.emit('run');
  }

  private vcNextCurve(): void {
    const value = this.vcQueue.shift();
    if (value === undefined) {
      this.running = false;
      this.vcCurve = null;
      return;
    }
    if (this.vcCurves.length >= VC_MAX_CURVES) {
      this.vcQueue = [];
      this.running = false;
      this.vcCurve = null;
      this.emit('vcfull');
      return;
    }
    const used = new Set(this.vcCurves.map((c) => c.color));
    let color = 0;
    while (used.has(color)) color++;
    const curve: VcCurve = { color, value, varied: this.vcVaried, data: new Columns<VcKey>(VC_KEYS, 8192), done: false };
    this.vcCurves.push(curve);
    this.vcCurve = curve;
    this.vcTimer = this.vcSegments(value);

    this.vcTime = 0;
    this.deltaV = 0;
    this.V = this.vcTimer[0].V;
    this.highrescnt = 0;
    // довести токи до равновесия при поддерживаемом потенциале
    this.deltaT = 1e-4;
    this.vcStabilize();
    this.findI();
    this.deltaT = 1e-5;
    this.emit('vc');
  }

  private vcStabilize(): void {
    const THRESHOLD = 1e-7;
    const MAX_ITERATIONS = 10000;
    this.V = this.vcTimer[0].V;
    this.findI();
    this.findI();
    // значение I должно не меняться на протяжении последних 200 итераций
    const N = 200;
    const hist = new Float64Array(N);
    for (let i = 0; i < N; i++) hist[i] = i + 1;
    let head = 0; // индекс самого старого элемента
    let diff = 999;
    let iters = 0;
    while (Math.abs(diff) > THRESHOLD && iters < MAX_ITERATIONS) {
      hist[head] = this.findI();
      const newest = head;
      head = (head + 1) % N;
      diff = hist[head] - hist[newest];
      iters++;
    }
  }

  /** Один шаг фиксации потенциала. Возвращает true, если кривая завершена. */
  private stepVC(): boolean {
    const curve = this.vcCurve!;
    const gv = this.gv;
    const gp = new Float64Array(6);

    const predictorI = this.findI();
    gp.set(gv);
    const predictorIL = this.I_leak;
    const correctorI = 0.5 * (predictorI + this.findI());
    gv[0] = 0.5 * (gv[0] + gp[0]);
    gv[1] = 0.5 * (gv[1] + gp[1]);
    gv[2] = 0.5 * (gv[2] + gp[2]);
    gv[4] = 0.5 * (gv[4] + gp[4]);
    gv[5] = 0.5 * (gv[5] + gp[5]);
    this.I_leak = 0.5 * (this.I_leak + predictorIL);

    const InA = correctorI * 1e3;
    if (this.deltaV === 0) {
      if (InA > this.vcYmax) this.vcYmax = InA * 1.2;
      else if (InA < this.vcYmin) this.vcYmin = InA * 1.2;
    }
    const d = curve.data;
    const i = d.append();
    d.col('I')[i] = InA;
    d.col('V')[i] = this.vcTimer[0].V * 1e3;
    d.col('t')[i] = this.vcTime;

    // после скачка потенциала несколько шагов делаются с очень малым шагом
    if (this.highrescnt === 91) this.deltaT = 1e-5;
    if (this.highrescnt === 1) this.deltaT = 1e-5;
    this.highrescnt = this.highrescnt - 1;

    this.vcTimer[0].rem = this.vcTimer[0].rem - this.deltaT;
    this.vcTime = this.vcTime + this.deltaT;
    const oldvoltage = this.vcTimer[0].V;
    if (this.vcTimer[0].rem <= -1e-7) {
      this.vcTimer.shift();
      this.V = this.vcTimer[0].V;
      this.vcTime = this.vcTime - this.deltaT + 1e-10;
      this.deltaT = 1e-10;
      this.highrescnt = 93;
    }
    this.deltaV = this.V - oldvoltage;

    if (this.stopflag === 1 || (this.vcTimer[0].V === 0 && this.vcTimer.length === 1)) {
      const aborted = this.stopflag === 1;
      this.stopflag = 0;
      curve.done = true;
      if (aborted) this.vcQueue = [];
      this.vcNextCurve();
      this.emit('vc');
      if (!this.running) this.emit('run');
      return true;
    }
    return false;
  }

  vcClear(): void {
    if (this.running) return;
    this.vcCurves.length = 0;
    this.vcYmin = -10;
    this.vcYmax = 10;
    this.emit('vc');
  }

  vcDelete(index: number): void {
    const c = this.vcCurves[index];
    if (!c || c === this.vcCurve) return;
    this.vcCurves.splice(index, 1);
    this.emit('vc');
  }

  /** Максимальная длительность завершённых кривых, с. */
  get vcMaxTime(): number {
    let m = 0;
    for (const c of this.vcCurves) {
      const n = c.data.length;
      if (n > 0) m = Math.max(m, c.data.col('t')[n - 1]);
    }
    return m;
  }

  // =====================================================================
  // Продвижение моделирования
  // =====================================================================

  /** Текущее модельное время активного режима, с. */
  get clock(): number {
    return this.mode === 'cc' ? this.time : this.vcTime;
  }

  /**
   * Выполнить шаги, пока моделирование идёт, модельное время продвинулось
   * меньше чем на simBudget секунд и не исчерпан лимит времени wallMs.
   * Возвращает число шагов.
   */
  advance(simBudget = Infinity, wallMs = Infinity, maxSteps = Infinity): number {
    if (!this.running) return 0;
    const t0 = performance.now();
    let steps = 0;
    let consumed = 0;
    while (this.running && steps < maxSteps) {
      const c0 = this.clock;
      const mode = this.mode;
      const stopped = mode === 'cc' ? this.stepCC() : this.stepVC();
      steps++;
      if (stopped && mode === 'cc') break;
      const d = this.clock - c0;
      consumed += d >= 0 ? d : this.clock; // после очистки или новой кривой время начинается с нуля
      if (consumed >= simBudget) break;
      if ((steps & 31) === 0 && performance.now() - t0 > wallMs) break;
    }
    if (!this.running) this.emit('run');
    return steps;
  }

  /** Досчитать до остановки (для тестов). */
  runToIdle(maxSteps = 5_000_000): number {
    return this.advance(Infinity, Infinity, maxSteps);
  }
}
