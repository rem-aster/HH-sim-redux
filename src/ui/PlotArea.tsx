import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { cursorSeriesKey, hideCursor, pick } from '../app/cursor';
import { mainSeries, varSeries, vcCurrentSeries, vcVoltageSeries, VAR_COLORS } from '../app/series';
import {
  DEFAULT_WINDOW_MS,
  ccGroup,
  cursor,
  cursorTimeMs,
  engine,
  interaction,
  lastTimeMs,
  mode,
  onRedraw,
  resetView,
  runRev,
  userView,
  varSel,
  vcGroup,
  vcRev,
  views,
  zoomView,
} from '../app/store';
import { cssVar, plotTheme } from '../app/theme';
import { SCALES, VARS, formatRange, varById } from '../app/vars';
import { CanvasPlot, type PlotConfig, type Tick } from '../plot/canvas-plot';
import type { LinkGroup, Range } from '../plot/range';
import { Segmented, Select } from './controls';
import { Icon } from './icons';
import { CursorBar } from './CursorBar';
import { VC_PARAMS } from '../app/vcstate';
import { SpeedMenu } from './Toolbar';

/** Зарегистрированные графики текущего режима (для сохранения картинки). */
export const livePlots: Record<string, CanvasPlot> = {};

function usePlot(id: string, make: () => Omit<PlotConfig, 'getMode' | 'getTheme' | 'resolveColor'>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cfg: PlotConfig = { ...make(), getMode: () => interaction.value, getTheme: plotTheme, resolveColor: cssVar };
    const plot = new CanvasPlot(ref.current!, cfg);
    livePlots[id] = plot;
    const off = onRedraw(() => plot.invalidate());
    const offCur = cursor.subscribe(() => plot.invalidate());
    const offVar = varSel.subscribe(() => plot.invalidate());
    const offInt = interaction.subscribe(() => plot.invalidate());
    return () => {
      off();
      offCur();
      offVar();
      offInt();
      plot.destroy();
      delete livePlots[id];
    };
  }, []);
  return ref;
}

const cursorMark = () => {
  const c = cursor.value;
  return c ? { key: cursorSeriesKey(c), index: c.index, time: cursorTimeMs() } : null;
};

function varTicks(): Tick[] {
  const scales = varSel.value.map(varById).filter((v) => v.scale).map((v) => v.scale!);
  const same = scales.length > 0 && scales.every((s) => s === scales[0]);
  if (same) {
    const s = SCALES[scales[0]];
    return [0, 0.25, 0.5, 0.75, 1].map((g) => {
      const v = (g - s.b) / s.a;
      const digits = s.max - s.min < 0.1 ? 3 : s.max - s.min <= 2 ? 2 : 0;
      return { v: g, label: (Math.abs(v) < 1e-12 ? 0 : v).toFixed(digits).replace('-', '−') };
    });
  }
  return [
    { v: 0, label: 'мин' },
    { v: 0.5, label: '' },
    { v: 1, label: 'макс' },
  ];
}

function MainPlot() {
  const ref = usePlot('main', () => ({
    group: ccGroup,
    y: views.mainY,
    getSeries: mainSeries,
    yLabel: 'Мембранный потенциал, мВ',
    getCursor: cursorMark,
    onPick: pick,
    onBackground: hideCursor,
    onReset: resetView,
    onUserView: (a) => a !== 'x' && (userView.mainY = true),
    xUnit: 'мс',
  }));
  return <div class="plot-host" ref={ref} />;
}

function VarPlot() {
  const ref = usePlot('var', () => ({
    group: ccGroup,
    y: views.varY,
    getSeries: varSeries,
    yLabel: varAxisLabel(),
    yTicks: varTicks,
    getCursor: cursorMark,
    onPick: pick,
    onBackground: hideCursor,
    onReset: resetView,
    onUserView: (a) => a !== 'x' && (userView.varY = true),
    xLabel: 'Время, мс',
    xUnit: 'мс',
  }));
  // подпись оси зависит от выбранных переменных
  useEffect(
    () =>
      varSel.subscribe(() => {
        const p = livePlots.var;
        if (p) (p.cfg as { yLabel: string }).yLabel = varAxisLabel();
      }),
    [],
  );
  return <div class="plot-host" ref={ref} />;
}

function varAxisLabel(): string {
  const scales = varSel.value.map(varById).filter((v) => v.scale).map((v) => SCALES[v.scale!]);
  if (scales.length && scales.every((s) => s === scales[0])) return scales[0].unit ? `Значение, ${scales[0].unit}` : 'Доля открытых ворот';
  return 'Нормированное значение';
}

function VcCurrentPlot() {
  const ref = usePlot('vcI', () => ({
    group: vcGroup,
    y: views.vcIY,
    getSeries: vcCurrentSeries,
    yLabel: 'Ток, нА',
    getCursor: cursorMark,
    onPick: pick,
    onBackground: hideCursor,
    onReset: resetView,
    onUserView: (a) => {
      if (a !== 'x') userView.vcIY = true;
      if (a !== 'y') userView.vcX = true;
    },
    xUnit: 'мс',
  }));
  return <div class="plot-host" ref={ref} />;
}

function VcVoltagePlot() {
  const ref = usePlot('vcV', () => ({
    group: vcGroup,
    y: views.vcVY,
    getSeries: vcVoltageSeries,
    yLabel: 'Потенциал, мВ',
    getCursor: cursorMark,
    onPick: pick,
    onBackground: hideCursor,
    onReset: resetView,
    onUserView: (a) => {
      if (a !== 'x') userView.vcVY = true;
      if (a !== 'y') userView.vcX = true;
    },
    xLabel: 'Время, мс',
    xUnit: 'мс',
  }));
  return <div class="plot-host" ref={ref} />;
}

function VarSelectors() {
  const sel = varSel.value;
  return (
    <div class="var-select" role="group" aria-label="Переменные нижнего графика">
      {sel.map((id, k) => {
        const v = varById(id);
        const [lo, hi] = v.scale ? formatRange(SCALES[v.scale]) : ['', ''];
        return (
          <div class="var-chip" style={{ '--chip': `var(${VAR_COLORS[k]})` }} title={v.hint}>
            <i class="swatch" />
            <Select
              ariaLabel={`Переменная линии ${['жёлтой', 'зелёной', 'голубой'][k]}`}
              value={id}
              options={VARS.map((o) => ({ value: o.id, label: o.label }))}
              onChange={(nv) => {
                const next = [...sel] as [string, string, string];
                next[k] = nv;
                varSel.value = next;
              }}
            />
            {v.scale && (
              <span class="var-range">
                {lo} … {hi}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: ComponentChildren }[] }) {
  return (
    <div class="legend">
      {items.map((it) => (
        <span class="legend-item">
          <i style={{ background: `var(${it.color})` }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Полоса прокрутки по времени (horizontal slider оригинала). */
function Timeline({ range, group, extent, minSpan = DEFAULT_WINDOW_MS }: { range: Range; group: LinkGroup; extent: () => number; minSpan?: number }) {
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      const total = Math.max(extent(), range.max, minSpan);
      const lo = Math.min(0, range.min);
      const span = total - lo;
      const a = ((range.min - lo) / span) * 100;
      const w = (range.span / span) * 100;
      if (thumb.current) {
        thumb.current.style.left = `${Math.max(0, a)}%`;
        thumb.current.style.width = `${Math.max(2, Math.min(100, w))}%`;
      }
    };
    update();
    const offs = [range.subscribe(update), onRedraw(update)];
    return () => offs.forEach((f) => f());
  }, [range, group]);

  const drag = (e: PointerEvent, onThumb: boolean) => {
    const el = track.current!;
    const r = el.getBoundingClientRect();
    const total = Math.max(extent(), range.max, minSpan);
    const lo = Math.min(0, range.min);
    const span = total - lo;
    const toT = (px: number) => lo + ((px - r.left) / r.width) * span;
    const start = { x: e.clientX, min: range.min, max: range.max };
    if (!onThumb) {
      const c = toT(e.clientX);
      const w = range.span;
      range.set(c - w / 2, c + w / 2);
      start.min = range.min;
      start.max = range.max;
    }
    const move = (ev: PointerEvent) => {
      const dt = ((ev.clientX - start.x) / r.width) * span;
      range.set(start.min + dt, start.max + dt);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  };

  return (
    <div class="timeline" ref={track} onPointerDown={(e) => drag(e as unknown as PointerEvent, false)} title="Прокрутка по времени">
      <div class="timeline-thumb" ref={thumb} onPointerDown={(e) => (e.stopPropagation(), drag(e as unknown as PointerEvent, true))} />
    </div>
  );
}

function ViewTools() {
  const it = interaction.value;
  return (
    <div class="view-tools">
      <Segmented
        ariaLabel="Режим мыши"
        value={it}
        onChange={(v) => (interaction.value = v)}
        options={[
          { value: 'cursor', label: 'Курсор', icon: 'crosshair', title: 'Щелчок по линии ставит курсор' },
          { value: 'zoom', label: 'Масштаб', icon: 'zoom', title: 'Щелчок — увеличить, Shift+щелчок или правая кнопка — уменьшить, протяжка — выделить область, двойной щелчок — исходный вид' },
          { value: 'pan', label: 'Сдвиг', icon: 'hand', title: 'Протяните мышью, чтобы сдвинуть график' },
        ]}
      />
      <div class="btn-group">
        <button type="button" class="btn btn-icon" onClick={() => zoomView(0.5)} title="Увеличить по времени (+)" aria-label="Увеличить">
          <Icon name="zoomIn" size={17} />
        </button>
        <button type="button" class="btn btn-icon" onClick={() => zoomView(2)} title="Уменьшить по времени (−)" aria-label="Уменьшить">
          <Icon name="zoomOut" size={17} />
        </button>
        <button type="button" class="btn btn-icon" onClick={resetView} title="Исходный вид (0)" aria-label="Исходный вид">
          <Icon name="expand" size={16} />
        </button>
      </div>
    </div>
  );
}

function Status() {
  void runRev.value;
  void vcRev.value;
  const running = engine.running;
  let text: string;
  if (engine.mode === 'cc') text = running ? (engine.continuous ? 'Непрерывное моделирование' : 'Идёт расчёт') : 'Установилось';
  else text = running ? `Строится кривая ${engine.vcCurves.length}` : `Кривых: ${engine.vcCurves.length} из 8`;
  return (
    <div class={'status' + (running ? ' is-running' : '')} role="status">
      <span class="status-dot" />
      {text}
      {engine.mode === 'cc' && <TimeReadout />}
    </div>
  );
}

function TimeReadout() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const upd = () => {
      if (ref.current) ref.current.textContent = `t = ${lastTimeMs().toFixed(1)} мс`;
    };
    upd();
    return onRedraw(upd);
  }, []);
  return <span class="status-time" ref={ref} />;
}

export function PlotArea() {
  const m = mode.value;
  return (
    <main class="plots" aria-label="Графики" data-interaction={interaction.value}>
      <div class="plots-bar">
        <ViewTools />
        <div class="plots-bar-right">
          <Status />
          <SpeedMenu />
        </div>
      </div>
      {m === 'cc' ? (
        <div class="plot-stack" key="cc">
          <div class="plot-panel plot-main">
            <Legend
              items={[
                { color: '--c-v', label: 'Мембранный потенциал, мВ' },
                { color: '--c-stim', label: 'Стимул, нА (от уровня −85)' },
              ]}
            />
            <MainPlot />
          </div>
          <div class="plot-panel plot-var">
            <VarSelectors />
            <VarPlot />
          </div>
          <Timeline range={views.ccX} group={ccGroup} extent={lastTimeMs} />
        </div>
      ) : (
        <div class="plot-stack" key="vc">
          <div class="plot-panel plot-main">
            <VcLegend />
            <VcCurrentPlot />
          </div>
          <div class="plot-panel plot-var">
            <VcVoltagePlot />
          </div>
          <Timeline range={views.vcX} group={vcGroup} extent={() => engine.vcMaxTime * 1000} minSpan={0} />
        </div>
      )}
      <CursorBar />
    </main>
  );
}

function VcLegend() {
  void vcRev.value;
  const curves = engine.vcCurves;
  if (!curves.length)
    return (
      <div class="legend">
        <span class="legend-hint">Ток мембраны при фиксации потенциала. Нажмите «Пуск», чтобы построить кривые.</span>
      </div>
    );
  return (
    <Legend
      items={curves.map((c) => ({
        color: `--c-vc${c.color}`,
        label: `${VC_PARAMS[c.varied].short} = ${String(c.value).replace('-', '−')} ${VC_PARAMS[c.varied].unit}`,
      }))}
    />
  );
}
