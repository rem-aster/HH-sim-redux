import { engine, paramsRev } from '../../app/store';
import { vcColor } from '../../app/series';
import { VC_PARAMS, normalizeList, resetVc, selectVaried, setList, setProtocolValue, vcState, vcValues } from '../../app/vcstate';
import { DEFAULT_VC, VC_MAX_CURVES } from '../../model/defaults';
import { Card } from '../Card';
import { SliderField } from '../controls';
import { Icon } from '../icons';
import { MiniChart } from '../MiniChart';

const SEGMENTS = ['Поддерживаемый потенциал', 'Ступень 1', 'Ступень 2', 'Ступень 3'];

/** Форма протокола для графика (redisplay_voltage.m). */
function shape(value: number, sel: number): { x: number[]; y: number[] } {
  const p = [...engine.vcProtocol];
  p[sel] = value;
  const [m0, d0, m1, d1, m2, d2, m3, d3] = p;
  const x = [-0.2, d0 > 0 ? d0 : 0];
  const y = [m0, m0];
  if (d1 > 0) x.push(d0, d0 + d1), y.push(m1, m1);
  if (d2 > 0) x.push(d0 + d1, d0 + d1 + d2), y.push(m2, m2);
  if (d3 > 0) x.push(d0 + d1 + d2, d0 + d1 + d2 + d3), y.push(m3, m3);
  return { x, y };
}

export function VclampPanel() {
  void paramsRev.value;
  const st = vcState.value;
  const values = vcValues();
  const shapes = values.map((v) => shape(v, st.selected));
  const used = new Set(engine.vcCurves.map((c) => c.color));
  // цвета новых кривых — следующие свободные
  const free = [0, 1, 2, 3, 4, 5, 6, 7].filter((c) => !used.has(c));
  const colors = values.map((_, i) => free[i] ?? i % 8);
  const mtime = Math.max(0, ...shapes.flatMap((s) => s.x));
  const tv = [0, 10.9, 20.9, 25.9, 50.9, 100.9, 150.9, 200.9];
  let xmax = 200.9;
  for (let b = 0; b < tv.length - 1; b++) if (mtime >= tv[b] && mtime <= tv[b + 1]) {
    xmax = tv[b + 1];
    break;
  }
  const ymax = Math.round(Math.max(10, ...shapes.flatMap((s) => s.y.map(Math.abs))) * 1.2);
  const prm = VC_PARAMS[st.selected];
  const p = engine.vcProtocol;
  const summary = `${p[0]} мВ → ${p[2]} мВ${p[5] ? ` → ${p[4]} мВ` : ''} · варьируется: ${prm.label.toLowerCase()}`;

  return (
    <Card
      id="vclamp"
      title="Протокол фиксации потенциала"
      accent="--card-vclamp"
      summary={summary}
      actions={
        <button type="button" class="btn btn-ghost btn-sm" onClick={resetVc} title="Вернуть исходный протокол">
          <Icon name="reset" size={15} /> Сброс
        </button>
      }
    >
      <MiniChart
        ariaLabel="Форма потенциала для каждой кривой"
        lines={shapes.map((s, i) => ({ x: s.x, y: s.y, color: `var(${vcColor(colors[i] ?? i)})`, width: 2 }))}
        xRange={[-0.2, xmax]}
        yRange={[-ymax, ymax]}
        hLines={[0]}
        xLabel="время, мс"
        yLabel="мВ"
        height={130}
      />
      <p class="note">
        Стимул состоит из поддерживаемого потенциала и до трёх ступеней. Отметьте <span class="vary-dot" /> параметр, который нужно
        варьировать, и перечислите его значения в поле ниже — для каждого значения будет построена своя кривая.
      </p>
      <div class="vc-segments">
        {SEGMENTS.map((title, s) => (
          <fieldset class="vc-seg">
            <legend>{title}</legend>
            {[0, 1].map((r) => {
              const i = s * 2 + r;
              const P = VC_PARAMS[i];
              return (
                <SliderField
                  label={P.short}
                  unit={P.unit}
                  value={p[i]}
                  min={P.min}
                  max={P.max}
                  def={DEFAULT_VC[i]}
                  highlight={st.selected === i}
                  onChange={(v) => setProtocolValue(i, v)}
                  extra={
                    <input
                      type="radio"
                      class="vary"
                      name="vc-vary"
                      checked={st.selected === i}
                      onChange={() => selectVaried(i)}
                      title={`Варьировать: ${P.label.toLowerCase()}`}
                      aria-label={`Варьировать: ${P.label.toLowerCase()}`}
                    />
                  }
                />
              );
            })}
          </fieldset>
        ))}
      </div>
      <label class="field vc-list">
        <span class="field-label">
          {prm.label} ({prm.unit}) — значения через пробел, до {VC_MAX_CURVES}
        </span>
        <input
          type="text"
          class="text-input"
          spellcheck={false}
          value={st.lists[st.selected]}
          onInput={(e) => setList((e.currentTarget as HTMLInputElement).value)}
          onBlur={normalizeList}
          onKeyDown={(e) => e.key === 'Enter' && normalizeList()}
          aria-label="Значения варьируемого параметра"
          placeholder="например: -40 -20 0 20"
        />
      </label>
      <p class="note">Нажмите «Пуск», чтобы построить кривые. Всего на графике помещается до {VC_MAX_CURVES} кривых.</p>
    </Card>
  );
}
