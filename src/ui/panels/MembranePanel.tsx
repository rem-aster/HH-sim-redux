import { engine, paramsRev } from '../../app/store';
import { DEFAULT_MEMBRANE, type MembraneParams } from '../../model/defaults';
import { Card } from '../Card';
import { NumberInput, NumberField, fmtFixed } from '../controls';
import { Icon } from '../icons';

type ConcKey = 'Nai' | 'Nao' | 'Ki' | 'Ko' | 'Cli' | 'Clo';

// диапазоны и шаги полей окна «Мембрана» (setup_membrane.m)
const CONC: Record<ConcKey, { min: number; max: number; step: number }> = {
  Nai: { min: 1, max: 100, step: 1 },
  Nao: { min: 5, max: 800, step: 5 },
  Ki: { min: 5, max: 800, step: 5 },
  Ko: { min: 1, max: 100, step: 1 },
  Cli: { min: 1, max: 100, step: 1 },
  Clo: { min: 5, max: 800, step: 5 },
};

const IONS: { name: string; sym: string; i: ConcKey; o: ConcKey; E: 'ENa' | 'EK' | 'ECl' }[] = [
  { name: 'натрий', sym: 'Na⁺', i: 'Nai', o: 'Nao', E: 'ENa' },
  { name: 'калий', sym: 'K⁺', i: 'Ki', o: 'Ko', E: 'EK' },
  { name: 'хлор', sym: 'Cl⁻', i: 'Cli', o: 'Clo', E: 'ECl' },
];

const mv = (v: number) => `${fmtFixed(v * 1000, 1)} мВ`;

export function MembranePanel() {
  void paramsRev.value;
  const m = engine.membrane;
  const set = (k: keyof MembraneParams, v: number) => engine.setMembrane(k, v);
  const Rm = engine.Rm / 1e6;
  return (
    <Card
      id="membrane"
      title="Мембрана"
      accent="--card-membrane"
      summary={
        <>
          V<sub>r</sub> = {mv(engine.Vr)} · T = {fmtFixed(m.T, 1)} °C
        </>
      }
      actions={
        <button type="button" class="btn btn-ghost btn-sm" onClick={() => engine.resetMembrane()} title="Вернуть исходные значения параметров мембраны">
          <Icon name="reset" size={15} /> Сброс
        </button>
      }
    >
      <table class="ion-table">
        <thead>
          <tr>
            <th />
            <th>
              C<sub>вн</sub>, мМ
            </th>
            <th>
              C<sub>нар</sub>, мМ
            </th>
            <th>
              E<sub>ион</sub>
            </th>
          </tr>
        </thead>
        <tbody>
          {IONS.map((ion) => (
            <tr>
              <th scope="row" title={ion.name}>
                {ion.sym}
              </th>
              {[ion.i, ion.o].map((k) => (
                <td>
                  <NumberInput
                    value={m[k]}
                    {...CONC[k]}
                    digits={1}
                    onChange={(v) => set(k, v)}
                    modified={m[k] !== DEFAULT_MEMBRANE[k]}
                    ariaLabel={`${ion.sym} ${k.endsWith('i') ? 'внутри' : 'снаружи'}, мМ`}
                    title={`${k.endsWith('i') ? 'Внутренняя' : 'Внешняя'} концентрация (${CONC[k].min}…${CONC[k].max} мМ), по умолчанию ${DEFAULT_MEMBRANE[k]}`}
                  />
                </td>
              ))}
              <td class="ion-e">{mv(engine[ion.E])}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div class="field-grid">
        <NumberField label="T" unit="°C" value={m.T} min={-20} max={50} step={1} digits={2} def={DEFAULT_MEMBRANE.T} onChange={(v) => set('T', v)} hint="Температура" />
        <NumberField
          label={
            <>
              C<sub>m</sub>
            </>
          }
          ariaLabel="Ёмкость мембраны"
          unit="нФ"
          value={m.Cm / 1e-9}
          min={1}
          max={Infinity}
          step={1}
          digits={2}
          def={1}
          onChange={(v) => set('Cm', v * 1e-9)}
          hint="Ёмкость мембраны"
        />
      </div>

      <dl class="derived">
        <div>
          <dt>
            пассивный V<sub>r</sub>
          </dt>
          <dd>{mv(engine.Vr)}</dd>
        </div>
        <div>
          <dt>
            R<sub>m</sub>
          </dt>
          <dd>{Number.isFinite(Rm) ? `${fmtFixed(Rm, 1)} МОм` : '∞'}</dd>
        </div>
      </dl>
    </Card>
  );
}
