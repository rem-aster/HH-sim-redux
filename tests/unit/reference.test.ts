// Сравнение с эталонными траекториями, полученными из исходной версии HHsim 3.7
// (Octave-порт https://github.com/rem-aster/HHsim) для тех же последовательностей действий.
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { Engine } from '../../src/model/engine';

const FIXTURES = new URL('../fixtures/', import.meta.url);

type Ref = Record<string, unknown>;
function load(name: string): Ref | null {
  const url = new URL(`${name}.json.gz`, FIXTURES);
  if (!existsSync(url)) return null;
  return JSON.parse(gunzipSync(readFileSync(url)).toString('utf8'));
}

const arr = (v: unknown): number[] => (Array.isArray(v) ? (v as (number | null)[]) : [v as number]).map((x) => (x === null ? NaN : x));

function maxDiff(a: ArrayLike<number>, b: number[], n: number, skip: number[] = []): number {
  let m = 0;
  for (let i = 0; i < n; i++) {
    if (skip.includes(i)) continue;
    const x = a[i];
    const y = b[i];
    if (Number.isNaN(x) && Number.isNaN(y)) continue;
    m = Math.max(m, Math.abs(x - y));
  }
  return m;
}

function ready(): Engine {
  const e = new Engine();
  e.runToIdle();
  return e;
}

const run = (e: Engine) => {
  e.runToIdle(2_000_000);
  expect(e.running).toBe(false);
};

// Сценарий может вернуть индексы точек, которые не сравниваются.
const CC: Record<string, (e: Engine) => void | number[]> = {
  startup: () => {},
  stim1: (e) => {
    e.stimulate(0);
    run(e);
  },
  stim2: (e) => {
    e.stimulate(1);
    run(e);
  },
  stim1_twice: (e) => {
    e.stimulate(0);
    run(e);
    e.stimulate(0);
    run(e);
  },
  nudge100: (e) => {
    e.nudge(0.1);
    run(e);
  },
  pronase_stim1: (e) => {
    e.setPronase(true);
    run(e);
    e.stimulate(0);
    run(e);
  },
  ttx50_stim1: (e) => {
    e.setInhibition(0, 50);
    run(e);
    e.stimulate(0);
    run(e);
  },
  temp20_stim1: (e) => {
    e.setMembrane('T', 20);
    run(e);
    e.stimulate(0);
    run(e);
  },
  ko60: (e) => {
    e.setMembrane('Ko', 60);
    run(e);
  },
  cm3_stim1: (e) => {
    e.setMembrane('Cm', 3 * 1e-9);
    run(e);
    e.stimulate(0);
    run(e);
  },
  userchan_na: (e) => {
    e.copyToUser('na');
    e.setChannelOn('na', false);
    run(e);
    e.setChannelOn('user', true);
    run(e);
    e.stimulate(0);
    run(e);
  },
  passive_off: (e) => {
    e.setChannelOn('na', false);
    run(e);
    e.setChannelOn('k', false);
    run(e);
    e.setPassiveOn('cl', false);
    run(e);
  },
  recall: (e) => {
    e.stimulate(0);
    run(e);
    // recall_state.m перезаписывает переменные ворот в последней точке истории
    // (косметический эффект на графике); здесь история не переписывается.
    const last = e.hist.length - 1;
    e.recall();
    run(e);
    return [last];
  },
  clear_stim2: (e) => {
    e.stimulate(0);
    run(e);
    e.clear();
    run(e);
    e.stimulate(1);
    run(e);
  },
};

const CC_COLS: [string, string, number][] = [
  // ключ эталона, ключ истории, множитель
  ['t', 't', 1],
  ['V', 'V', 1],
  ['I', 'stim', 1],
  ['m', 'm', 1],
  ['h', 'h', 1],
  ['n', 'n', 1],
  ['INa', 'INa', 1],
  ['IK', 'IK', 1],
  ['gNa', 'gNa', 1],
  ['gK', 'gK', 1],
  ['Ileak', 'Ileak', 1],
  ['Iuser', 'Iuser', 1],
  ['guser', 'guser', 1],
];

describe('режим регистрации совпадает с HHsim 3.7', () => {
  for (const [name, scenario] of Object.entries(CC)) {
    const ref = load(name);
    test.skipIf(!ref)(name, () => {
      const e = ready();
      const skip = scenario(e) || [];
      const n = arr(ref!.t).length;
      expect(e.hist.length).toBe(n);
      for (const [rk, hk, k] of CC_COLS) {
        const r = arr(ref![rk]).map((x) => x * k);
        const col = e.hist.col(hk as never);
        const scale = Math.max(1e-12, ...r.filter(Number.isFinite).map(Math.abs));
        // значения для графиков в оригинале проходят масштабирование (graph_scale) — допуск на округление
        expect(maxDiff(col, r, n, skip) / scale, `${name}: ${rk}`).toBeLessThan(1e-9);
      }
      for (const k of ['ENa', 'EK', 'ECl', 'Vr'] as const) {
        expect(e[k]).toBeCloseTo(ref![k] as number, 12);
      }
    });
  }
});

const VC: Record<string, [(e: Engine) => void, number[], number]> = {
  vc_default: [() => {}, [-40], 2],
  vc_family: [() => {}, [-40, -20, 0, 30], 2],
  vc_ttx: [
    (e) => {
      e.setInhibition(0, 100);
      run(e);
    },
    [-40],
    2,
  ],
  vc_hold: [() => {}, [-90, -70], 0],
};

describe('фиксация потенциала совпадает с HHsim 3.7', () => {
  for (const [name, [prep, values, varied]] of Object.entries(VC)) {
    const ref = load(name);
    test.skipIf(!ref)(name, () => {
      const e = ready();
      prep(e);
      e.setMode('vc');
      e.vcRun(values, varied);
      e.runToIdle(10_000_000);
      const curves = ref!.curves as Ref[] | Ref;
      const list = Array.isArray(curves) ? curves : [curves];
      expect(e.vcCurves.length).toBe(list.length);
      list.forEach((c, j) => {
        const d = e.vcCurves[j].data;
        const n = arr(c.t).length;
        expect(d.length).toBe(n);
        for (const k of ['t', 'V', 'I'] as const) {
          const r = arr(c[k]);
          const scale = Math.max(1e-12, ...r.filter(Number.isFinite).map(Math.abs));
          expect(maxDiff(d.col(k), r, n) / scale, `${name}[${j}]: ${k}`).toBeLessThan(1e-9);
        }
      });
    });
  }
});
