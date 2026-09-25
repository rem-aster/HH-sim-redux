import { engine, paramsRev } from '../../app/store';
import { DRUGS } from '../../model/defaults';
import { Card } from '../Card';
import { NumberField, Switch, fmtFixed } from '../controls';
import { Icon } from '../icons';
import { MiniChart } from '../MiniChart';

const INFO = [
  { name: 'тетродотоксин', desc: 'подавляет Na-ток' },
  { name: 'тетраэтиламмоний', desc: 'подавляет K-ток' },
];

/** Концентрация, соответствующая проценту ингибирования (update_drugbox.m). */
export function concFor(drug: 0 | 1, inh: number): number | null {
  const d = DRUGS[drug];
  const xmin = d.ic50 * d.cmin;
  const xmax = d.ic50 * d.cmax;
  if (inh <= 0) return null;
  if (inh >= 100) return xmax;
  return Math.max((100 * d.ic50) / (100 - inh) - d.ic50, xmin);
}

export function inhFor(drug: 0 | 1, conc: number): number {
  const d = DRUGS[drug];
  return 100 - (100 * d.ic50) / (d.ic50 + conc);
}

function fmtConc(x: number): string {
  return x >= 100 ? fmtFixed(x, 0) : x >= 10 ? fmtFixed(x, 1) : fmtFixed(x, 2);
}

export function drugsSummary(): string {
  const parts: string[] = [];
  if (engine.inhibition[0]) parts.push(`TTX ${Math.round(engine.inhibition[0])} %`);
  if (engine.inhibition[1]) parts.push(`TEA ${Math.round(engine.inhibition[1])} %`);
  if (engine.pronase) parts.push('проназа');
  return parts.length ? parts.join(' · ') : 'не применяются';
}

export function DrugsPanel() {
  void paramsRev.value;
  const active = engine.drugsActive;
  return (
    <Card
      id="drugs"
      title="Препараты"
      accent="--card-drugs"
      badge={active ? <span class="badge badge-drug">активны</span> : null}
      summary={drugsSummary()}
      actions={
        <button type="button" class="btn btn-ghost btn-sm" onClick={() => engine.resetDrugs()} title="Отменить все препараты">
          <Icon name="reset" size={15} /> Сброс
        </button>
      }
    >
      {([0, 1] as const).map((k) => (
        <DrugEditor k={k} />
      ))}
      <div class="drug">
        <h3 class="sub">Проназа — устраняет инактивацию Na-каналов</h3>
        <Switch checked={engine.pronase} onChange={(v) => engine.setPronase(v)} color="var(--c-var3)" label="Проназа" title="Включить/выключить проназу" />
      </div>
    </Card>
  );
}

function DrugEditor({ k }: { k: 0 | 1 }) {
  const d = DRUGS[k];
  const inh = engine.inhibition[k];
  const xmin = d.ic50 * d.cmin;
  const xmax = d.ic50 * d.cmax;
  const xs: number[] = [];
  for (let e = 0; e <= 60; e++) xs.push(xmin * (xmax / xmin) ** (e / 60));
  const conc = concFor(k, inh);
  return (
    <div class="drug">
      <h3 class="sub">
        {d.abbr} ({INFO[k].name}) — {INFO[k].desc}
      </h3>
      <MiniChart
        ariaLabel={`Кривая доза–эффект ${d.abbr}. Щёлкните, чтобы выбрать концентрацию`}
        lines={[{ x: xs, y: xs.map((x) => inhFor(k, x)), color: 'var(--c-drug)', width: 2 }]}
        xRange={[xmin, xmax]}
        yRange={[0, 100]}
        logX
        xLabel={`концентрация, ${d.unit}`}
        yLabel="%"
        height={120}
        marker={conc !== null ? { x: conc, dashed: !(conc === xmin || Math.abs(conc - xmax) < 12) } : null}
        onClick={(x, y, inside) => {
          // graph_select.m: щелчок вне графика отменяет препарат
          if (!inside || x < 1 || x > 1000 || y < 0 || y > 100) engine.setInhibition(k, 0);
          else engine.setInhibition(k, inhFor(k, x));
        }}
      />
      <div class="drug-row">
        <NumberField
          label="ингибирование"
          unit="%"
          value={Math.round(inh)}
          min={0}
          max={100}
          step={1}
          digits={0}
          def={0}
          onChange={(v) => engine.setInhibition(k, v)}
        />
        <div class="drug-conc">
          {conc === null ? (
            <span class="muted">щёлкните по графику, чтобы применить</span>
          ) : (
            <>
              ≈ {fmtConc(conc)} {d.unit}
              <button type="button" class="btn btn-ghost btn-xs" onClick={() => engine.setInhibition(k, 0)} title="Убрать препарат">
                <Icon name="x" size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
