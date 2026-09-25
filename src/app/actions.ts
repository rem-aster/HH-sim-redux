// Действия кнопок главного окна.

import { VC_MAX_CURVES } from '../model/defaults';
import { cursor, engine, fitVcX, mode, redraw, showToast, togglePanel, userView, views, type CursorState } from './store';
import { hideCursor } from './cursor';
import { vcState, vcValues } from './vcstate';

export function stim(k: 0 | 1): void {
  engine.stimulate(k);
}

export function runOrStop(): void {
  if (engine.mode === 'cc') {
    if (engine.continuous) engine.stop();
    else engine.run();
  } else if (engine.running) {
    engine.stop();
  } else {
    vcRun();
  }
}

export function nudge(): void {
  engine.nudge();
}

export function clearPlots(): void {
  hideCursor();
  engine.clear();
  if (engine.mode === 'vc') {
    userView.vcIY = false;
    userView.vcX = false;
    views.vcIY.set(engine.vcYmin * 1.2, engine.vcYmax * 1.2);
    fitVcX();
  }
}

export function recall(): void {
  engine.recall();
  showToast('Возвращено сохранённое состояние.');
}

export function storeState(): void {
  const c = cursor.value;
  if (!c || engine.mode !== 'cc') return;
  engine.store(c.index);
  const t = engine.hist.col('t')[c.index] * 1000;
  showToast(`Состояние в точке ${t.toFixed(2)} мс запомнено. Кнопка «Вернуть» вернёт модель в него.`);
}

export function switchMode(m: 'cc' | 'vc'): void {
  if (m === engine.mode) return;
  const c: CursorState | null = cursor.value;
  hideCursor();
  engine.setMode(m, m === 'vc' && c ? c.index : null);
  mode.value = engine.mode;
  if (m === 'vc') {
    togglePanel('vclamp', true); // окно протокола открывается при входе в режим, как в оригинале
    userView.vcIY = false;
    userView.vcX = false;
    views.vcIY.set(engine.vcYmin * 1.2, engine.vcYmax * 1.2);
    fitVcX();
  }
  redraw();
}

/** «Пуск» в режиме фиксации потенциала. */
export function vcRun(): void {
  const values = vcValues();
  if (values.length === 0) {
    showToast('Введите хотя бы одно значение варьируемого параметра.');
    return;
  }
  const free = VC_MAX_CURVES - engine.vcCurves.length;
  if (free <= 0) {
    showToast('В режиме фиксации потенциала можно показать не больше 8 кривых. Нажмите «Очистить» или удалите часть кривых.');
    return;
  }
  // окно по времени сразу охватывает самый длинный протокол
  const sel = vcState.value.selected;
  let tmax = engine.vcMaxTime;
  for (const v of values.slice(0, free)) {
    let t = 0;
    for (const s of engine.vcSegments(v, sel)) if (Number.isFinite(s.rem)) t += Math.max(0, s.rem);
    tmax = Math.max(tmax, t);
  }
  if (tmax <= 0) {
    showToast('Длительность протокола равна нулю — задайте длительность хотя бы одного сегмента.');
    return;
  }
  if (!userView.vcX) views.vcX.set(0, tmax * 1000);
  engine.vcRun(values, sel);
}

export function deleteCurve(): void {
  const c = cursor.value;
  if (!c || engine.mode !== 'vc') return;
  hideCursor();
  engine.vcDelete(c.line % 8);
}

export function restartAll(): void {
  hideCursor();
  engine.restart();
  mode.value = engine.mode;
  userView.mainY = userView.varY = userView.vcIY = userView.vcVY = userView.vcX = false;
  views.ccX.set(0, 60);
  views.varY.set(-0.1, 1.1);
  views.vcVY.set(-100, 100);
  redraw();
}
