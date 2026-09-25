import { clearPlots, nudge, recall, restartAll, runOrStop, stim, switchMode } from '../app/actions';
import { exportCsv, printPlots, savePng, type PlotEntry } from '../app/export';
import { SPEEDS, engine, mode, openPanels, paramsRev, runRev, speed, themePref, togglePanel, type PanelId, type SpeedId } from '../app/store';
import { varById } from '../app/vars';
import { varSel } from '../app/store';
import { Menu, MenuItem, Segmented } from './controls';
import { Icon } from './icons';
import { livePlots } from './PlotArea';
import { helpOpen } from './HelpDialog';

function plotEntries(): PlotEntry[] {
  if (engine.mode === 'cc') {
    const vars = varSel.value.map(varById);
    return [
      {
        plot: livePlots.main,
        weight: 0.62,
        legend: [
          { color: '--c-v', label: 'Мембранный потенциал, мВ' },
          { color: '--c-stim', label: 'Стимул, нА (от уровня −85)' },
        ],
      },
      {
        plot: livePlots.var,
        weight: 0.38,
        legend: vars.map((v, k) => ({ color: `--c-var${k + 1}`, label: v.label })).filter((_, k) => vars[k].col),
      },
    ].filter((e) => e.plot);
  }
  return [
    { plot: livePlots.vcI, weight: 0.62, legend: engine.vcCurves.map((c, k) => ({ color: `--c-vc${c.color}`, label: `Кривая ${k + 1}` })) },
    { plot: livePlots.vcV, weight: 0.38, legend: [] },
  ].filter((e) => e.plot);
}

const title = () => (engine.mode === 'cc' ? 'HHsim — регистрация потенциала' : 'HHsim — фиксация потенциала');

const PANEL_BUTTONS: { id: PanelId; label: string; vcOnly?: boolean; ccOnly?: boolean }[] = [
  { id: 'membrane', label: 'Мембрана' },
  { id: 'channels', label: 'Каналы' },
  { id: 'stimuli', label: 'Стимулы', ccOnly: true },
  { id: 'vclamp', label: 'Стим. ФП', vcOnly: true },
  { id: 'drugs', label: 'Препараты' },
];

export function PanelToggles() {
  void paramsRev.value;
  const m = mode.value;
  const open = openPanels.value;
  return (
    <nav class="panel-toggles" aria-label="Окна параметров">
      {PANEL_BUTTONS.filter((b) => (m === 'cc' ? !b.vcOnly : !b.ccOnly)).map((b) => (
        <button
          type="button"
          class={'chip' + (open.includes(b.id) ? ' is-on' : '') + (b.id === 'drugs' && engine.drugsActive ? ' is-drug' : '')}
          aria-pressed={open.includes(b.id)}
          onClick={() => {
            togglePanel(b.id);
            if (!open.includes(b.id)) requestAnimationFrame(() => document.getElementById(`panel-${b.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
          }}
          title={b.id === 'drugs' && engine.drugsActive ? 'Применяются препараты' : `Показать/скрыть окно «${b.label}»`}
        >
          {b.label}
        </button>
      ))}
    </nav>
  );
}

export function SpeedMenu() {
  return (
        <Menu
          button={(open, toggle) => (
            <button type="button" class="btn btn-ghost" aria-expanded={open} onClick={toggle} title="Скорость анимации">
              <Icon name="gauge" size={16} /> <span class="hide-sm">{SPEEDS[speed.value].label}</span>
            </button>
          )}
        >
          {(close) =>
            (Object.keys(SPEEDS) as SpeedId[]).map((id) => (
              <MenuItem
                label={SPEEDS[id].label}
                hint={SPEEDS[id].hint}
                checked={speed.value === id}
                onClick={() => {
                  speed.value = id;
                  close();
                }}
              />
            ))
          }
        </Menu>
  );
}

export function Toolbar() {
  void runRev.value;
  void paramsRev.value;
  const m = mode.value;
  const running = engine.running;
  const cont = engine.continuous;
  return (
    <header class="topbar">
      <div class="brand">
        <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="var(--brand-bg)" />
          <path d="M3 21h6l2-3 2.2 3H15l2.5-15 2.5 17 1.8-6H29" fill="none" stroke="var(--c-v)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div class="brand-text">
          <b>HHsim</b>
          <span>симулятор Ходжкина–Хаксли</span>
        </div>
      </div>

      <Segmented
        class="mode-switch"
        ariaLabel="Режим"
        value={m}
        onChange={(v) => switchMode(v)}
        options={[
          { value: 'cc', label: 'Регистрация', title: 'Регистрация потенциала (current clamp): подача стимулов тока' },
          {
            value: 'vc',
            label: (
              <>
                Фиксация<span class="hide-xs"> потенциала</span>
              </>
            ),
            title: 'Фиксация потенциала (voltage clamp): измерение тока',
            aria: 'Фиксация потенциала',
          },
        ]}
      />

      <div class="actions" role="toolbar" aria-label="Моделирование">
        {m === 'cc' && (
          <div class="btn-group">
            <button type="button" class="btn btn-stim" onClick={() => stim(0)} title="Подать стимул 1 (клавиша 1)">
              <Icon name="zap" size={16} /> Стим1
            </button>
            <button type="button" class="btn btn-stim" onClick={() => stim(1)} title="Подать стимул 2 (клавиша 2)">
              <Icon name="zap" size={16} /> Стим2
            </button>
          </div>
        )}
        <div class="btn-group">
          <button
            type="button"
            class={'btn btn-run' + ((m === 'cc' ? cont : running) ? ' is-active' : '')}
            onClick={() => (m === 'cc' ? engine.run() : !running && runOrStop())}
            disabled={m === 'vc' && running}
            title={m === 'cc' ? 'Непрерывное моделирование (Пробел)' : 'Построить кривые фиксации потенциала (Пробел)'}
          >
            <Icon name="play" size={16} class="icon-fill" /> Пуск
          </button>
          <button type="button" class="btn btn-stop" onClick={() => engine.stop()} disabled={!running} title="Остановить моделирование (Пробел)">
            <Icon name="stop" size={15} class="icon-fill" /> Стоп
          </button>
          {m === 'cc' && (
            <button type="button" class="btn btn-nudge" onClick={nudge} title="Продвинуть моделирование ещё на несколько шагов (клавиша S)">
              <Icon name="step" size={16} /> Шаг
            </button>
          )}
        </div>
        <div class="btn-group">
          <button type="button" class="btn" onClick={clearPlots} disabled={m === 'vc' && running} title="Очистить графики и сбросить время (клавиша C)">
            <Icon name="eraser" size={16} /> Очистить
          </button>
          {m === 'cc' && (
            <button
              type="button"
              class="btn"
              onClick={recall}
              title={engine.hasSaved ? 'Вернуть состояние, сохранённое кнопкой «Запомнить» (клавиша R)' : 'Вернуть начальное состояние (клавиша R). Сохранить другое можно кнопкой «Запомнить» на панели курсора'}
            >
              <Icon name="undo" size={16} /> Вернуть
            </button>
          )}
        </div>
      </div>

      <div class="tools">
        <Menu
          button={(open, toggle) => (
            <button type="button" class="btn btn-ghost" aria-expanded={open} onClick={toggle} title="Экспорт данных, печать и сохранение картинки">
              <Icon name="download" size={16} /> <span class="hide-sm">Экспорт</span>
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                icon="download"
                label="Данные — CSV"
                hint="запятая-разделитель, десятичная точка"
                onClick={() => {
                  exportCsv('comma');
                  close();
                }}
              />
              <MenuItem
                icon="download"
                label="Данные — CSV для Excel"
                hint="точка с запятой, десятичная запятая"
                onClick={() => {
                  exportCsv('excel');
                  close();
                }}
              />
              <div class="menu-note">Если курсор установлен, экспортируется только линия под курсором.</div>
              <MenuItem
                icon="image"
                label="Сохранить графики (PNG)"
                onClick={() => {
                  savePng(plotEntries(), title());
                  close();
                }}
              />
              <MenuItem
                icon="printer"
                label="Печать графиков…"
                onClick={() => {
                  close();
                  printPlots(plotEntries(), title());
                }}
              />
            </>
          )}
        </Menu>
        <Menu
          button={(open, toggle) => (
            <button type="button" class="btn btn-ghost btn-icon" aria-expanded={open} onClick={toggle} title="Ещё" aria-label="Ещё">
              <Icon name="more" size={18} />
            </button>
          )}
        >
          {(close) => (
            <>
              <div class="menu-label">Тема</div>
              {(
                [
                  ['auto', 'Как в системе', 'monitor'],
                  ['light', 'Светлая', 'sun'],
                  ['dark', 'Тёмная', 'moon'],
                ] as const
              ).map(([v, l]) => (
                <MenuItem
                  label={l}
                  checked={themePref.value === v}
                  onClick={() => {
                    themePref.value = v;
                    close();
                  }}
                />
              ))}
              <div class="menu-sep" />
              <MenuItem
                icon="reset"
                label="Начать заново"
                hint="вернуть все параметры к исходным"
                onClick={() => {
                  close();
                  if (confirm('Вернуть все параметры модели к исходным значениям и очистить графики?')) restartAll();
                }}
              />
            </>
          )}
        </Menu>
        <button type="button" class="btn btn-ghost btn-icon" onClick={() => (helpOpen.value = true)} title="Справка (F1 или ?)" aria-label="Справка">
          <Icon name="help" size={18} />
        </button>
      </div>
    </header>
  );
}
