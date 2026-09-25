import { describe, expect, test } from 'vitest';
import { Engine, equilib, evalRate } from '../../src/model/engine';

const ready = () => {
  const e = new Engine();
  e.runToIdle();
  return e;
};

describe('модель', () => {
  test('равновесные потенциалы при исходных концентрациях', () => {
    expect(equilib(50, 440, 6.3, 1) * 1000).toBeCloseTo(52.37, 2);
    expect(equilib(400, 20, 6.3, 1) * 1000).toBeCloseTo(-72.14, 2);
    expect(equilib(52, 560, 6.3, -1) * 1000).toBeCloseTo(-57.24, 2);
  });

  test('скорость вида 2 не делится на ноль при V = th', () => {
    const r = { fn: 2 as const, c: 0.1, th: -40, s: -0.1 };
    expect(Number.isFinite(evalRate(r, -40, 1))).toBe(true);
    expect(evalRate(r, -40, 1)).toBeCloseTo(1, 1);
  });

  test('после запуска модель в покое около −62 мВ', () => {
    const e = ready();
    expect(e.running).toBe(false);
    expect(e.V * 1000).toBeGreaterThan(-64);
    expect(e.V * 1000).toBeLessThan(-61);
  });

  test('«Пуск» считает непрерывно, «Стоп» останавливает', () => {
    const e = ready();
    e.run();
    expect(e.continuous).toBe(true);
    e.advance(0.2);
    expect(e.running).toBe(true);
    expect(e.time).toBeGreaterThan(0.2);
    e.stop();
    e.runToIdle();
    expect(e.running).toBe(false);
  });

  test('«Шаг» продвигает не меньше чем на 2 мс', () => {
    const e = ready();
    const t0 = e.time;
    e.nudge();
    e.runToIdle();
    expect(e.time - t0).toBeGreaterThanOrEqual(0.002);
  });

  test('«Очистить» начинает историю заново', () => {
    const e = ready();
    e.stimulate(0);
    e.runToIdle();
    e.clear();
    e.runToIdle();
    expect(e.hist.col('t')[0]).toBeLessThan(0.001);
    expect(e.hist.length).toBeGreaterThanOrEqual(50);
  });

  test('«Запомнить» и «Вернуть» восстанавливают состояние', () => {
    const e = ready();
    e.stimulate(0);
    e.runToIdle();
    const V = e.hist.col('V');
    let peak = 0;
    for (let i = 0; i < e.hist.length; i++) if (V[i] > V[peak]) peak = i;
    e.store(peak);
    e.recall();
    e.advance(Infinity, Infinity, 1);
    // сразу после восстановления потенциал близок к пику
    expect(e.V).toBeGreaterThan(0.03);
    expect(e.hasSaved).toBe(true);
  });

  test('ингибирование TTX на 100 % убирает Na-ток', () => {
    const e = ready();
    const from = e.hist.length;
    e.setInhibition(0, 100);
    e.runToIdle();
    e.stimulate(0);
    e.runToIdle();
    const INa = e.hist.col('INa');
    for (let i = from; i < e.hist.length; i++) expect(INa[i]).toBe(0);
    expect(Math.max(...Array.from(e.hist.col('V').subarray(from, e.hist.length)))).toBeLessThan(-0.03);
  });

  test('потенциал K ниже −95 мВ расширяет ось графика', () => {
    const e = ready();
    expect(e.mainYRange).toEqual([-100, 60]);
    e.setMembrane('Ko', 5);
    expect(e.mainYRange).toEqual([-150, 60]);
  });

  test('Rm учитывает выключенные пассивные каналы', () => {
    const e = ready();
    const r0 = e.Rm;
    e.setPassiveOn('cl', false);
    expect(e.Rm).toBeGreaterThan(r0);
  });
});

describe('фиксация потенциала', () => {
  test('не больше 8 кривых', () => {
    const e = ready();
    e.setMode('vc');
    const events: string[] = [];
    e.on((ev) => events.push(ev));
    e.vcProtocol[3] = 2; // короткая ступень для скорости
    e.vcRun([-40, -30, -20, -10, 0, 10], 2);
    e.runToIdle(10_000_000);
    e.vcRun([20, 30, 40], 2);
    e.runToIdle(10_000_000);
    expect(e.vcCurves.length).toBe(8);
    expect(events).toContain('vcfull');
  });

  test('удаление и очистка кривых', () => {
    const e = ready();
    e.setMode('vc');
    e.vcProtocol[3] = 2;
    e.vcRun([-40, 0], 2);
    e.runToIdle(10_000_000);
    const colors = e.vcCurves.map((c) => c.color);
    e.vcDelete(0);
    expect(e.vcCurves.length).toBe(1);
    expect(e.vcCurves[0].color).toBe(colors[1]);
    e.vcRun([10], 2);
    e.runToIdle(10_000_000);
    expect(e.vcCurves[1].color).toBe(colors[0]); // освободившийся цвет
    e.vcClear();
    expect(e.vcCurves.length).toBe(0);
  });

  test('варьируемая длительность нулевого сегмента добавляет сегмент', () => {
    const e = ready();
    // ступень 3 по умолчанию имеет длительность 0; варьируем её длительность
    const segs = e.vcSegments(5, 7);
    expect(segs.length).toBe(5);
    expect(segs[3].rem).toBeCloseTo(0.005, 12);
    // потенциал ступени без длительности не добавляет сегмент
    expect(e.vcSegments(30, 6).length).toBe(4);
  });

  test('возврат в режим регистрации восстанавливает покой', () => {
    const e = ready();
    e.setMode('vc');
    e.vcRun([0], 2);
    e.runToIdle(10_000_000);
    e.setMode('cc');
    e.runToIdle();
    expect(e.V * 1000).toBeGreaterThan(-64);
    expect(e.V * 1000).toBeLessThan(-61);
  });
});
