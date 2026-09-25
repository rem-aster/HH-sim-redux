import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from './icons';

/** Справка открыта (обновляется по событиям самого диалога). */
export const helpOpen = signal(false);
let dialogEl: HTMLDialogElement | null = null;

export function openHelp(): void {
  if (dialogEl && !dialogEl.open) dialogEl.showModal();
  helpOpen.value = true;
}

export function closeHelp(): void {
  dialogEl?.close();
}

const KEYS: [string, string][] = [
  ['1 / 2', 'Стим1 / Стим2'],
  ['Пробел', 'Пуск / Стоп'],
  ['S', 'Шаг'],
  ['C', 'Очистить'],
  ['R', 'Вернуть'],
  ['← →', 'курсор на шаг влево / вправо'],
  ['Shift + ← →', 'курсор к предыдущему / следующему экстремуму'],
  ['↑ ↓', 'курсор на другую линию'],
  ['Esc', 'убрать курсор'],
  ['+ / −', 'увеличить / уменьшить по времени'],
  ['0', 'исходный вид графиков'],
  ['Колесо мыши', 'масштаб по времени; Shift — сдвиг; Alt — масштаб по вертикали'],
  ['F1 или ?', 'эта справка'],
];

export function HelpDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogEl = ref.current;
    return () => {
      dialogEl = null;
    };
  }, []);
  const base = import.meta.env.BASE_URL;
  return (
    <dialog
      ref={ref}
      class="dialog help"
      onClose={(e) => {
        // событие close приходит асинхронно: справку могли уже открыть снова
        helpOpen.value = (e.currentTarget as HTMLDialogElement).open;
      }}
      aria-labelledby="help-title"
    >
      <div class="dialog-head">
        <h2 id="help-title">Справка</h2>
        <button type="button" class="btn btn-ghost btn-icon" onClick={closeHelp} aria-label="Закрыть">
          <Icon name="x" />
        </button>
      </div>
      <div class="dialog-body">
        <p class="lead">
          HHsim — графическая модель участка возбудимой мембраны нейрона, основанная на уравнениях Ходжкина–Хаксли. Можно менять
          параметры каналов, мембраны, стимулов и концентрации ионов и сразу видеть результат.
        </p>
        <div class="help-links">
          <a class="help-link" href={`${base}help/index.html`} target="_blank" rel="noopener">
            <Icon name="book" />
            <span>
              <b>Руководство</b>
              <small>главное окно, панели, курсор, фиксация потенциала</small>
            </span>
          </a>
          <a class="help-link" href={`${base}help/exercises.html`} target="_blank" rel="noopener">
            <Icon name="sliders" />
            <span>
              <b>Упражнения</b>
              <small>шесть лабораторных работ с вопросами</small>
            </span>
          </a>
        </div>

        <h3>Быстрый старт</h3>
        <ol class="steps">
          <li>
            Нажмите фиолетовую кнопку <b>Стим1</b> — клетка получит импульс тока, и на верхнем графике появится спайк (красная линия —
            мембранный потенциал, фиолетовая — стимул). <b>Стим2</b> подаёт гиперполяризующий импульс.
          </li>
          <li>
            На нижнем графике — переменные Ходжкина–Хаксли m, h и n. Другие величины (токи, проводимости) выбираются в цветных
            списках над графиком.
          </li>
          <li>
            Кнопки <b>Мембрана</b>, <b>Каналы</b>, <b>Стимулы</b> и <b>Препараты</b> открывают панели параметров справа. После
            изменения параметра моделирование сразу продолжается.
          </li>
          <li>
            Щёлкните по линии, чтобы поставить курсор и узнать точное значение. <b>Шаг</b> продвигает моделирование ещё немного,{' '}
            <b>Пуск</b> — непрерывно, <b>Стоп</b> — останавливает.
          </li>
          <li>
            Переключатель <b>Фиксация потенциала</b> вверху включает режим voltage clamp: задайте протокол в панели «Стим. ФП» и
            нажмите <b>Пуск</b>.
          </li>
        </ol>

        <h3>Клавиши</h3>
        <table class="keys">
          <tbody>
            {KEYS.map(([k, d]) => (
              <tr>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>О программе</h3>
        <p>
          Веб-версия HHsim 3.7. Авторы оригинала — David S. Touretzky, Mark V. Albert, Nathaniel D. Daw, Alok Ladsariya и Mahtiyar
          Bonakdarpour (Университет Карнеги — Меллона). Официальный сайт:{' '}
          <a href="https://www.cs.cmu.edu/~dst/HHsim/" target="_blank" rel="noopener">
            www.cs.cmu.edu/~dst/HHsim
          </a>
          . Модель и численный метод перенесены без изменений; результаты совпадают с исходной программой.
        </p>
        <p>
          Свободная программа, лицензия{' '}
          <a href="https://www.gnu.org/licenses/old-licenses/gpl-2.0.html" target="_blank" rel="noopener">
            GNU GPL версии 2
          </a>{' '}
          или более поздней. Разработка оригинала частично поддержана грантом NSF DGE-9987588.
        </p>
      </div>
    </dialog>
  );
}
