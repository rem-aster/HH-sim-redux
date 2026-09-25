import { deleteCurve, storeState } from '../app/actions';
import { hideCursor, moveCursor, readout } from '../app/cursor';
import { cursor, engine, mode, onRedraw, paramsRev, varSel, vcRev } from '../app/store';
import { useEffect, useState } from 'preact/hooks';
import { Icon } from './icons';

export function CursorBar() {
  void cursor.value;
  void varSel.value;
  void vcRev.value;
  void paramsRev.value;
  // значения могут измениться, пока идёт расчёт (например, после «Очистить»)
  const [, force] = useState(0);
  useEffect(() => onRedraw(() => cursor.value && force((x) => x + 1)), []);
  const r = readout();
  const m = mode.value;
  if (!r) {
    return (
      <div class="cursor-bar is-empty">
        <Icon name="crosshair" size={16} />
        <span>
          Щёлкните по линии графика, чтобы поставить курсор и измерить значение в этой точке.
          <span class="kbd-hint"> Двигать курсор можно стрелками ← →.</span>
        </span>
      </div>
    );
  }
  return (
    <div class="cursor-bar" style={{ '--cur': `var(${r.color})` }} role="group" aria-label="Панель курсора">
      <div class="cursor-read">
        <i class="swatch" />
        <span class="cursor-label">{r.label}</span>
        <output class="cursor-value" aria-live="polite">
          {r.value}
        </output>
        <span class="cursor-time">t = {r.time}</span>
      </div>
      <div class="cursor-nav">
        <button type="button" class="btn btn-icon" onClick={() => moveCursor(-2)} title="К предыдущему максимуму или минимуму (Shift+←)" aria-label="К предыдущему экстремуму">
          <Icon name="chevronsLeft" />
        </button>
        <button type="button" class="btn btn-icon" onClick={() => moveCursor(-1)} title="На один шаг влево (←)" aria-label="На шаг влево">
          <Icon name="chevronLeft" />
        </button>
        <button type="button" class="btn btn-icon" onClick={() => moveCursor(1)} title="На один шаг вправо (→)" aria-label="На шаг вправо">
          <Icon name="chevronRight" />
        </button>
        <button type="button" class="btn btn-icon" onClick={() => moveCursor(2)} title="К следующему максимуму или минимуму (Shift+→)" aria-label="К следующему экстремуму">
          <Icon name="chevronsRight" />
        </button>
        <button type="button" class="btn btn-sm" onClick={() => moveCursor(0)} title="Перевести курсор на другую линию в тот же момент времени (↑ ↓)">
          <Icon name="layers" size={15} /> Другая линия
        </button>
        {m === 'cc' ? (
          <button type="button" class="btn btn-sm" onClick={storeState} title="Запомнить состояние в точке курсора, чтобы потом вернуть его кнопкой «Вернуть»">
            <Icon name="bookmark" size={15} /> Запомнить
          </button>
        ) : (
          <button
            type="button"
            class="btn btn-sm btn-danger-soft"
            onClick={deleteCurve}
            disabled={engine.running}
            title="Удалить кривую, на которой стоит курсор"
          >
            <Icon name="trash" size={15} /> Удалить кривую
          </button>
        )}
        <button type="button" class="btn btn-icon btn-ghost" onClick={hideCursor} title="Убрать курсор (Esc)" aria-label="Убрать курсор">
          <Icon name="x" />
        </button>
      </div>
    </div>
  );
}
