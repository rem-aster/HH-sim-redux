import { stim } from '../../app/actions';
import { engine, paramsRev } from '../../app/store';
import { DEFAULT_STIM, type StimParams } from '../../model/defaults';
import { Card } from '../Card';
import { SliderField, fmtFixed } from '../controls';
import { Icon } from '../icons';
import { MiniChart } from '../MiniChart';

const FIELDS: { key: keyof StimParams; label: string; unit: string; min: number; max: number }[] = [
  { key: 'lag', label: 'Задержка до импульса 1', unit: 'мс', min: 0, max: 50 },
  { key: 'mag1', label: 'Амплитуда импульса 1', unit: 'нА', min: -100, max: 100 },
  { key: 'dur1', label: 'Длительность импульса 1', unit: 'мс', min: 0, max: 50 },
  { key: 'gap', label: 'Интервал между импульсами', unit: 'мс', min: 0, max: 50 },
  { key: 'mag2', label: 'Амплитуда импульса 2', unit: 'нА', min: -100, max: 100 },
  { key: 'dur2', label: 'Длительность импульса 2', unit: 'мс', min: 0, max: 50 },
];

/** Форма стимула для графика (redisplay_stim.m). */
export function stimShape(s: StimParams): { x: number[]; y: number[]; xmax: number; ymax: number } {
  const x: number[] = [-0.2, s.lag > 0 ? s.lag : 0];
  const y: number[] = [0, 0];
  if (s.dur1 > 0) x.push(s.lag, s.lag + s.dur1), y.push(s.mag1, s.mag1);
  if (s.gap > 0) x.push(s.lag + s.dur1, s.lag + s.dur1 + s.gap), y.push(0, 0);
  if (s.dur2 > 0) x.push(s.lag + s.dur1 + s.gap, s.lag + s.dur1 + s.gap + s.dur2), y.push(s.mag2, s.mag2);
  const end = s.lag + s.dur1 + s.gap + s.dur2;
  x.push(end, end + 0.7);
  y.push(0, 0);
  const mtime = Math.max(...x);
  const tv = [0, 10.9, 20.9, 25.9, 50.9, 100.9, 110.9, 120.9, 130.9, 140.9, 150.9, 160.9, 170.9, 180.9, 190.9, 200.9, 210.9, 220.9, 230.9];
  let xmax = tv[tv.length - 1];
  for (let b = 0; b < tv.length - 1; b++) if (mtime >= tv[b] && mtime <= tv[b + 1]) {
    xmax = tv[b + 1];
    break;
  }
  const ymax = Math.round(Math.max(10, ...y.map(Math.abs)) * 1.2);
  return { x, y, xmax, ymax };
}

export function describeStim(s: StimParams): string {
  const p = (m: number, d: number) => `${fmtFixed(m, Number.isInteger(m) ? 0 : 1)} нА × ${fmtFixed(d, Number.isInteger(d) ? 0 : 1)} мс`;
  const parts: string[] = [];
  if (s.dur1 > 0 && s.mag1 !== 0) parts.push(p(s.mag1, s.dur1));
  if (s.dur2 > 0 && s.mag2 !== 0) parts.push(p(s.mag2, s.dur2));
  return parts.length ? parts.join(' + ') : 'нет импульса';
}

export function StimuliPanel() {
  void paramsRev.value;
  return (
    <Card
      id="stimuli"
      title="Стимулы"
      accent="--card-stimuli"
      summary={`Стим1: ${describeStim(engine.stims[0])}`}
      actions={
        <button type="button" class="btn btn-ghost btn-sm" onClick={() => engine.resetStims()} title="Вернуть исходные шаблоны стимулов">
          <Icon name="reset" size={15} /> Сброс
        </button>
      }
    >
      {([0, 1] as const).map((k) => (
        <StimEditor k={k} />
      ))}
    </Card>
  );
}

function StimEditor({ k }: { k: 0 | 1 }) {
  const s = engine.stims[k];
  const shape = stimShape(s);
  const def = DEFAULT_STIM[k];
  return (
    <div class="stim">
      <div class="stim-head">
        <h3 class="sub">Шаблон стимула {k + 1}</h3>
        <button type="button" class="btn btn-stim btn-sm" onClick={() => stim(k)} title={`Подать стимул ${k + 1} (клавиша ${k + 1})`}>
          <Icon name="zap" size={15} /> Стим{k + 1}
        </button>
      </div>
      <MiniChart
        ariaLabel={`Форма стимула ${k + 1}`}
        lines={[{ x: shape.x, y: shape.y, color: 'var(--c-stim)', width: 2 }]}
        xRange={[-0.2, shape.xmax]}
        yRange={[-shape.ymax, shape.ymax]}
        hLines={[0]}
        xLabel="время, мс"
        yLabel="нА"
        height={110}
      />
      <div class="stim-fields">
        {FIELDS.map((f) => (
          <SliderField
            label={f.label}
            unit={f.unit}
            value={s[f.key]}
            min={f.min}
            max={f.max}
            def={def[f.key]}
            onChange={(v) => engine.setStim(k, { [f.key]: v })}
          />
        ))}
      </div>
    </div>
  );
}
