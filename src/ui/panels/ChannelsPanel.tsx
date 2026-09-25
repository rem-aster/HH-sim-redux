import { useState } from 'preact/hooks';
import { engine, paramsRev } from '../../app/store';
import {
  DEFAULT_PASSIVE,
  defaultChannel,
  type ChannelId,
  type GateParams,
  type Ion,
  type PassiveId,
  type Rate,
  type RateFn,
} from '../../model/defaults';
import { evalRate } from '../../model/engine';
import { Card } from '../Card';
import { NumberField, Select, Switch } from '../controls';
import { Icon } from '../icons';
import { MiniChart } from '../MiniChart';

const PASSIVE: { id: PassiveId; label: string }[] = [
  { id: 'na', label: 'Na' },
  { id: 'k', label: 'K' },
  { id: 'cl', label: 'Cl' },
];

export const CHANNEL_INFO: Record<ChannelId, { title: string; gates: [string, string | null] }> = {
  na: { title: 'Быстрый натриевый', gates: ['m', 'h'] },
  k: { title: 'Задерж. выпрямитель', gates: ['n', null] },
  user: { title: 'Канал пользователя', gates: ['p', 'q'] },
};

const ION_OPTIONS: { value: Ion; label: string }[] = [
  { value: 1, label: 'Na⁺' },
  { value: 2, label: 'K⁺' },
  { value: 3, label: 'Cl⁻' },
  { value: 4, label: '—' },
];

const FN_OPTIONS: { value: RateFn; label: string }[] = [
  { value: 1, label: 'c · exp[(V − th) · s]' },
  { value: 2, label: 'c · (V − th) / (1 − exp[(V − th) · s])' },
  { value: 3, label: 'c / (1 + exp[(V − th) · s])' },
  { value: 4, label: '— (нет)' },
];

export function ChannelsPanel() {
  void paramsRev.value;
  const [open, setOpen] = useState<ChannelId | null>(null);
  const on = (id: ChannelId) => engine.channelOn[id] === 1;
  const summary = (['na', 'k', 'user'] as ChannelId[])
    .map((id) => `${id === 'na' ? 'Na' : id === 'k' ? 'K' : 'польз.'} ${on(id) ? '✓' : '—'}`)
    .join(' · ');
  return (
    <Card
      id="channels"
      title="Каналы"
      accent="--card-channels"
      summary={summary}
      actions={
        <button type="button" class="btn btn-ghost btn-sm" onClick={() => engine.resetChannels()} title="Вернуть проводимости пассивных каналов и включить каналы по умолчанию">
          <Icon name="reset" size={15} /> Сброс
        </button>
      }
    >
      <h3 class="sub">Пассивные каналы</h3>
      <div class="chan-list">
        {PASSIVE.map((p) => (
          <div class="chan-row">
            <Switch
              checked={engine.passiveOn[p.id] === 1}
              onChange={(v) => engine.setPassiveOn(p.id, v)}
              color="var(--sw-passive)"
              title="Включить/выключить канал"
              label={
                <>
                  пасс. g<sub>{p.label}</sub>
                </>
              }
            />
            <NumberField
              label=""
              ariaLabel={`Проводимость пассивного ${p.label}-канала, мкСм`}
              unit="мкСм"
              value={engine.passive[p.id] / 1e-6}
              min={0.01}
              max={100}
              step={0.01}
              digits={4}
              def={DEFAULT_PASSIVE[p.id] / 1e-6}
              onChange={(v) => engine.setPassive(p.id, v * 1e-6)}
            />
          </div>
        ))}
      </div>

      <h3 class="sub">Потенциал-зависимые каналы</h3>
      <div class="chan-list">
        {(['na', 'k', 'user'] as ChannelId[]).map((id) => (
          <div class={'vchan' + (open === id ? ' is-open' : '')}>
            <div class="chan-row">
              <Switch checked={on(id)} onChange={(v) => engine.setChannelOn(id, v)} color="var(--sw-active)" title="Включить/выключить канал" label={CHANNEL_INFO[id].title} />
              <button
                type="button"
                class="btn btn-sm btn-soft"
                aria-expanded={open === id}
                onClick={() => setOpen(open === id ? null : id)}
                title="Параметры Ходжкина–Хаксли этого канала"
              >
                Параметры <Icon name="chevronDown" size={14} class="caret" />
              </button>
            </div>
            {open === id && <GateEditor id={id} />}
          </div>
        ))}
      </div>
    </Card>
  );
}

function GateEditor({ id }: { id: ChannelId }) {
  const ch = engine.channels[id];
  const def = defaultChannel(id);
  const info = CHANNEL_INFO[id];
  // В оригинале изменённые значения канала пользователя не подсвечиваются.
  const hl = id !== 'user';
  const [copy, setCopy] = useState<'-' | 'na' | 'k'>('-');
  return (
    <div class="gate-editor">
      <div class="field-grid">
        <label class="field">
          <span class="field-label">Ион</span>
          <Select
            ariaLabel="Ион, который проводит канал"
            value={ch.ion}
            options={ION_OPTIONS}
            onChange={(v) => engine.updateChannel(id, (c) => (c.ion = v))}
          />
        </label>
        <NumberField
          label={
            <>
              g<sub>max</sub>
            </>
          }
          ariaLabel="Максимальная проводимость, мкСм"
          unit="мкСм"
          value={ch.gmax / 1e-6}
          min={0}
          max={200}
          step={1}
          digits={1}
          def={hl ? def.gmax / 1e-6 : undefined}
          onChange={(v) => engine.updateChannel(id, (c) => (c.gmax = v * 1e-6))}
        />
      </div>
      {id === 'user' && (
        <label class="field copy-from">
          <span class="field-label">Копировать параметры из</span>
          <Select
            ariaLabel="Скопировать параметры другого канала"
            value={copy}
            options={[
              { value: '-', label: '—' },
              { value: 'na', label: 'Быстрый натриевый' },
              { value: 'k', label: 'Задерж. выпрямитель' },
            ]}
            onChange={(v) => {
              setCopy(v);
              if (v !== '-') engine.copyToUser(v);
            }}
          />
        </label>
      )}
      <div class="gates">
        {(['gate1', 'gate2'] as const).map((g, gi) =>
          info.gates[gi] ? (
            <GateBlock
              key={g}
              letter={info.gates[gi]!}
              gate={ch[g]}
              def={hl ? def[g] : null}
              onChange={(fn) => engine.updateChannel(id, (c) => fn(c[g]))}
            />
          ) : null,
        )}
      </div>
      <div class="card-actions">
        <button type="button" class="btn btn-ghost btn-sm" onClick={() => engine.resetChannel(id)} title="Вернуть исходные параметры этого канала">
          <Icon name="reset" size={15} /> Сброс канала
        </button>
      </div>
    </div>
  );
}

function GateBlock(p: { letter: string; gate: GateParams; def: GateParams | null; onChange: (fn: (g: GateParams) => void) => void }) {
  const g = p.gate;
  const V: number[] = [];
  for (let v = -90; v <= 90; v++) V.push(v);
  const zg = engine.zgain;
  return (
    <fieldset class="gate">
      <legend>
        Ворота <b>{p.letter}</b>
      </legend>
      <label class="field">
        <span class="field-label">показатель степени</span>
        <Select
          ariaLabel={`Показатель степени ворот ${p.letter}`}
          value={g.expt}
          options={[0, 1, 2, 3, 4, 5, 6].map((v) => ({ value: v, label: String(v) }))}
          onChange={(v) => p.onChange((x) => (x.expt = v))}
        />
      </label>
      <RateEditor kind="alpha" rate={g.alpha} def={p.def?.alpha ?? null} onChange={(fn) => p.onChange((x) => fn(x.alpha))} />
      <RateEditor kind="beta" rate={g.beta} def={p.def?.beta ?? null} onChange={(fn) => p.onChange((x) => fn(x.beta))} />
      <div class="rate-chart">
        <MiniChart
          ariaLabel={`Скорости α и β ворот ${p.letter} в зависимости от потенциала`}
          lines={[
            { x: V, y: V.map((v) => evalRate(g.alpha, v, zg)), color: 'var(--c-alpha)' },
            { x: V, y: V.map((v) => evalRate(g.beta, v, zg)), color: 'var(--c-beta)' },
          ]}
          xRange={[-90, 90]}
          yRange={[-0.1, 2]}
          xLabel="Vm, мВ"
          height={130}
        />
        <div class="chart-legend">
          <span>
            <i style={{ background: 'var(--c-alpha)' }} />α
          </span>
          <span>
            <i style={{ background: 'var(--c-beta)' }} />β, мс⁻¹
          </span>
        </div>
      </div>
    </fieldset>
  );
}

function RateEditor(p: { kind: 'alpha' | 'beta'; rate: Rate; def: Rate | null; onChange: (fn: (r: Rate) => void) => void }) {
  const r = p.rate;
  const d = p.def;
  return (
    <div class={'rate rate-' + p.kind}>
      <div class="rate-title">{p.kind === 'alpha' ? 'α: закрыт → открыт' : 'β: открыт → закрыт'}</div>
      <Select ariaLabel={`Функция ${p.kind === 'alpha' ? 'α' : 'β'}`} class="rate-fn" value={r.fn} options={FN_OPTIONS} onChange={(v) => p.onChange((x) => (x.fn = v))} />
      <div class="rate-params">
        <NumberField label="амплитуда c" value={r.c} min={0} max={10} step={0.01} digits={3} def={d?.c} onChange={(v) => p.onChange((x) => (x.c = v))} />
        <NumberField label="порог th" value={r.th} min={-100} max={100} step={5} digits={3} def={d?.th} onChange={(v) => p.onChange((x) => (x.th = v))} />
        <NumberField label="крутизна s" value={r.s} min={-1} max={1} step={0.01} digits={3} def={d?.s} onChange={(v) => p.onChange((x) => (x.s = v))} />
      </div>
    </div>
  );
}
