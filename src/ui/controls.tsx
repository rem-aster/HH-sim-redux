import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons';

export function parseNumber(s: string): number {
  const t = s.trim().replace(/\s+/g, '').replace(',', '.').replace(/[−–]/g, '-');
  if (t === '') return NaN;
  return Number(t);
}

export function fmtFixed(v: number, digits: number): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : '—';
  return v.toFixed(digits).replace('-', '−');
}

interface NumberInputProps {
  value: number;
  min: number;
  max: number;
  step: number;
  digits: number;
  onChange: (v: number) => void;
  modified?: boolean;
  ariaLabel: string;
  title?: string;
  steppers?: boolean;
  width?: string;
  disabled?: boolean;
}

/** Поле ввода числа с кнопками −/+ (make_valbox.m + make_incrbutton.m). */
export function NumberInput(p: NumberInputProps) {
  const [text, setText] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const shown = text ?? fmtFixed(p.value, p.digits);
  const clamp = (v: number) => Math.max(p.min, Math.min(p.max, v));

  const commit = () => {
    if (text === null) return;
    const v = parseNumber(text);
    setText(null);
    if (Number.isFinite(v)) {
      const c = clamp(v);
      if (c !== p.value) p.onChange(c);
    }
  };
  const bump = (dir: number, mult = 1) => {
    const base = text !== null && Number.isFinite(parseNumber(text)) ? parseNumber(text) : p.value;
    setText(null);
    const v = clamp(Number((base + dir * p.step * mult).toFixed(10)));
    if (v !== p.value) p.onChange(v);
  };

  return (
    <div class={'num' + (p.modified ? ' is-modified' : '') + (p.steppers === false ? ' no-steppers' : '')} style={p.width ? { width: p.width } : undefined}>
      {p.steppers !== false && (
        <button type="button" class="num-step" tabIndex={-1} aria-label="Уменьшить" disabled={p.disabled || p.value <= p.min} onClick={() => bump(-1)}>
          −
        </button>
      )}
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        spellcheck={false}
        autoComplete="off"
        aria-label={p.ariaLabel}
        title={p.title}
        disabled={p.disabled}
        value={shown}
        onFocus={(e) => (e.currentTarget as HTMLInputElement).select()}
        onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            (e.currentTarget as HTMLInputElement).select();
          } else if (e.key === 'Escape') {
            setText(null);
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            bump(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1);
          }
        }}
      />
      {p.steppers !== false && (
        <button type="button" class="num-step" tabIndex={-1} aria-label="Увеличить" disabled={p.disabled || p.value >= p.max} onClick={() => bump(1)}>
          +
        </button>
      )}
    </div>
  );
}

interface FieldProps extends Omit<NumberInputProps, 'ariaLabel' | 'modified'> {
  label: ComponentChildren;
  ariaLabel?: string;
  unit?: string;
  /** Значение по умолчанию: изменённые значения подсвечиваются. */
  def?: number;
  hint?: string;
}

export function NumberField(p: FieldProps) {
  const modified = p.def !== undefined && Math.abs(p.value - p.def) >= 1e-12 * Math.max(1, Math.abs(p.def));
  const title =
    (p.hint ? p.hint + '. ' : '') +
    `Диапазон ${fmtFixed(p.min, p.digits)}…${Number.isFinite(p.max) ? fmtFixed(p.max, p.digits) : '∞'}` +
    (p.def !== undefined ? `, по умолчанию ${fmtFixed(p.def, p.digits)}` : '');
  return (
    <label class="field">
      <span class="field-label">
        <span>{p.label}</span>
        {p.unit && <span class="unit">{p.unit}</span>}
      </span>
      <NumberInput {...p} modified={modified} ariaLabel={p.ariaLabel ?? String(p.label)} title={title} />
    </label>
  );
}

interface SliderFieldProps {
  label: ComponentChildren;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  def?: number;
  extra?: ComponentChildren;
  highlight?: boolean;
  digits?: number;
}

/** Ползунок с полем ввода (окна «Стимулы» и «Стим. ФП»): ползунок — целые значения, поле — любые. */
export function SliderField(p: SliderFieldProps) {
  const modified = p.def !== undefined && p.value !== p.def;
  const pct = ((p.value - p.min) / (p.max - p.min)) * 100;
  return (
    <div class={'slider-field' + (p.highlight ? ' is-selected' : '')}>
      <div class="slider-head">
        {p.extra}
        <span class="field-label">
          <span>{p.label}</span>
          <span class="unit">{p.unit}</span>
        </span>
        <NumberInput
          value={p.value}
          min={p.min}
          max={p.max}
          step={1}
          digits={p.digits ?? (Number.isInteger(p.value) ? 0 : 2)}
          onChange={p.onChange}
          modified={modified}
          ariaLabel={String(p.label)}
          steppers={false}
          width="5.2em"
        />
      </div>
      <input
        type="range"
        class="range"
        min={p.min}
        max={p.max}
        step={1}
        value={p.value}
        style={{ '--pct': `${Math.max(0, Math.min(100, pct))}%` } as JSX.CSSProperties}
        aria-label={String(p.label)}
        onInput={(e) => p.onChange(Math.round(Number((e.currentTarget as HTMLInputElement).value)))}
      />
    </div>
  );
}

export function Switch(p: { checked: boolean; onChange: (v: boolean) => void; label: ComponentChildren; color?: string; title?: string }) {
  return (
    <label class="switch" title={p.title} style={p.color ? ({ '--sw': p.color } as JSX.CSSProperties) : undefined}>
      <input type="checkbox" role="switch" checked={p.checked} onChange={(e) => p.onChange((e.currentTarget as HTMLInputElement).checked)} />
      <span class="switch-track" aria-hidden="true">
        <span class="switch-thumb" />
      </span>
      <span class="switch-label">{p.label}</span>
    </label>
  );
}

export function Select<T extends string | number>(p: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  class?: string;
  title?: string;
}) {
  return (
    <span class={'select ' + (p.class ?? '')}>
      <select
        aria-label={p.ariaLabel}
        title={p.title}
        value={String(p.value)}
        onChange={(e) => {
          const raw = (e.currentTarget as HTMLSelectElement).value;
          const opt = p.options.find((o) => String(o.value) === raw);
          if (opt) p.onChange(opt.value);
        }}
      >
        {p.options.map((o) => (
          <option value={String(o.value)}>{o.label}</option>
        ))}
      </select>
      <Icon name="chevronDown" size={14} class="select-caret" />
    </span>
  );
}

export function Segmented<T extends string>(p: {
  value: T;
  options: { value: T; label: ComponentChildren; title?: string; icon?: string; aria?: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  class?: string;
}) {
  return (
    <div class={'segmented ' + (p.class ?? '')} role="radiogroup" aria-label={p.ariaLabel}>
      {p.options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={p.value === o.value}
          aria-label={o.aria}
          class={p.value === o.value ? 'is-active' : ''}
          title={o.title}
          onClick={() => p.onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={16} />}
          {o.label && <span class="seg-label">{o.label}</span>}
        </button>
      ))}
    </div>
  );
}

/** Выпадающее меню по кнопке. */
export function Menu(p: { button: (open: boolean, toggle: () => void) => ComponentChildren; children: (close: () => void) => ComponentChildren; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div class="menu-wrap" ref={ref}>
      {p.button(open, () => setOpen(!open))}
      {open && <div class={'menu menu-' + (p.align ?? 'right')} role="menu">{p.children(() => setOpen(false))}</div>}
    </div>
  );
}

export function MenuItem(p: { icon?: string; label: ComponentChildren; hint?: ComponentChildren; onClick: () => void; checked?: boolean; disabled?: boolean }) {
  return (
    <button type="button" role="menuitem" class={'menu-item' + (p.checked ? ' is-checked' : '')} onClick={p.onClick} disabled={p.disabled}>
      {p.icon ? <Icon name={p.icon} size={16} /> : <span class="menu-check">{p.checked ? '✓' : ''}</span>}
      <span class="menu-text">
        {p.label}
        {p.hint && <small>{p.hint}</small>}
      </span>
    </button>
  );
}
