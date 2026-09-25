import { effect } from '@preact/signals';
import type { PlotTheme } from '../plot/canvas-plot';
import { redraw, themePref, themeRev } from './store';

const media = window.matchMedia('(prefers-color-scheme: dark)');

export function effectiveTheme(): 'light' | 'dark' {
  const p = themePref.value;
  if (p === 'auto') return media.matches ? 'dark' : 'light';
  return p;
}

let cache: Record<string, string> = {};

function refresh(): void {
  cache = {};
  themeRev.value++;
  redraw();
}

export function initTheme(): void {
  effect(() => {
    const p = themePref.value;
    const root = document.documentElement;
    if (p === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', p);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', effectiveTheme() === 'dark' ? '#0d1117' : '#f6f7f9');
    requestAnimationFrame(refresh);
  });
  media.addEventListener('change', refresh);
}

/** Значение CSS-переменной темы (кэшируется до смены темы). */
export function cssVar(name: string): string {
  let v = cache[name];
  if (v === undefined) {
    v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
    cache[name] = v;
  }
  return v;
}

export function plotTheme(): PlotTheme {
  return {
    bg: cssVar('--plot-bg'),
    grid: cssVar('--plot-grid'),
    axis: cssVar('--plot-axis'),
    text: cssVar('--text'),
    muted: cssVar('--text-muted'),
    zoomFill: cssVar('--zoom-fill'),
    zoomStroke: cssVar('--accent'),
    font: cssVar('--font-sans'),
  };
}

/** Светлая тема для печати и сохранения картинки. */
export const PRINT_THEME: PlotTheme = {
  bg: '#ffffff',
  grid: '#e3e6ea',
  axis: '#9aa1ab',
  text: '#1d2127',
  muted: '#5b6470',
  zoomFill: 'transparent',
  zoomStroke: 'transparent',
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

export const PRINT_COLORS: Record<string, string> = {
  '--c-v': '#d62828',
  '--c-stim': '#5b5bd6',
  '--c-var1': '#b58900',
  '--c-var2': '#16a34a',
  '--c-var3': '#0891b2',
  '--c-vc0': '#dc2626',
  '--c-vc1': '#2563eb',
  '--c-vc2': '#16a34a',
  '--c-vc3': '#c026d3',
  '--c-vc4': '#0891b2',
  '--c-vc5': '#ca8a04',
  '--c-vc6': '#ea580c',
  '--c-vc7': '#166534',
};
