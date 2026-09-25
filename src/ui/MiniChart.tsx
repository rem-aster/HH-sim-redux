// Небольшие статические графики на SVG: форма стимула, протокол, α/β, доза–эффект.
import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import { formatTick, linearTicks } from '../plot/ticks';

export interface MiniLine {
  x: number[];
  y: number[];
  /** Цвет CSS, например var(--c-stim): так линии меняют цвет вместе с темой. */
  color: string;
  width?: number;
  dash?: string;
}

interface Props {
  lines: MiniLine[];
  xRange: [number, number];
  yRange: [number, number];
  xLabel?: string;
  yLabel?: string;
  logX?: boolean;
  height?: number;
  /** Вертикальная отметка (например, выбранная концентрация). */
  marker?: { x: number; dashed?: boolean } | null;
  hLines?: number[];
  onClick?: (x: number, y: number, inside: boolean) => void;
  ariaLabel: string;
  xTickFormat?: (v: number) => string;
}

const W = 320;
const PAD0 = { l: 38, r: 8, t: 8, b: 26 };
let uid = 0;

export function MiniChart(p: Props) {
  const id = useRef(`mc${++uid}`).current;
  const H = p.height ?? 120;
  const PAD = p.yLabel ? { ...PAD0, t: 18 } : PAD0;
  const [x0, x1] = p.xRange;
  const [y0, y1] = p.yRange;
  const tx = (x: number) => {
    const f = p.logX ? (Math.log10(x) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0)) : (x - x0) / (x1 - x0);
    return PAD.l + f * (W - PAD.l - PAD.r);
  };
  const ty = (y: number) => PAD.t + ((y1 - y) / (y1 - y0)) * (H - PAD.t - PAD.b);
  const fx = (px: number) => {
    const f = (px - PAD.l) / (W - PAD.l - PAD.r);
    return p.logX ? 10 ** (Math.log10(x0) + f * (Math.log10(x1) - Math.log10(x0))) : x0 + f * (x1 - x0);
  };
  const fy = (py: number) => y1 - ((py - PAD.t) / (H - PAD.t - PAD.b)) * (y1 - y0);

  const yt = linearTicks(y0, y1, 3);
  const xt = p.logX
    ? { values: decades(x0, x1), step: 1 }
    : linearTicks(x0, x1, 5);
  const xfmt = p.xTickFormat ?? ((v: number) => (p.logX ? String(v) : formatTick(v, xt.step)));

  const path = (l: MiniLine) => {
    let d = '';
    let pen = false;
    for (let i = 0; i < l.x.length; i++) {
      const X = l.x[i];
      const Y = l.y[i];
      if (!Number.isFinite(Y) || !Number.isFinite(X)) {
        pen = false;
        continue;
      }
      const yy = Math.max(-1000, Math.min(1000 + H, ty(Y)));
      d += `${pen ? 'L' : 'M'}${tx(X).toFixed(1)},${yy.toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  const onClick = (e: JSX.TargetedMouseEvent<SVGSVGElement>) => {
    if (!p.onClick) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    const inside = px >= PAD.l && px <= W - PAD.r && py >= PAD.t && py <= H - PAD.b;
    p.onClick(fx(px), fy(py), inside);
  };

  return (
    <svg
      class={'mini-chart' + (p.onClick ? ' is-clickable' : '')}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={p.ariaLabel}
      onClick={onClick}
    >
      <defs>
        <clipPath id={id}>
          <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} />
        </clipPath>
      </defs>
      <rect class="mc-bg" x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} />
      {yt.values.map((v) => (
        <g>
          <line class="mc-grid" x1={PAD.l} x2={W - PAD.r} y1={ty(v)} y2={ty(v)} />
          <text class="mc-tick" x={PAD.l - 4} y={ty(v)} text-anchor="end" dominant-baseline="middle">
            {formatTick(v, yt.step)}
          </text>
        </g>
      ))}
      {xt.values.map((v) => (
        <g>
          <line class="mc-grid" x1={tx(v)} x2={tx(v)} y1={PAD.t} y2={H - PAD.b} />
          <text class="mc-tick" x={tx(v)} y={H - PAD.b + 11} text-anchor={tx(v) > W - 18 ? 'end' : 'middle'}>
            {xfmt(v)}
          </text>
        </g>
      ))}
      <g clip-path={`url(#${id})`}>
        {(p.hLines ?? []).map((v) => (
          <line class="mc-zero" x1={PAD.l} x2={W - PAD.r} y1={ty(v)} y2={ty(v)} />
        ))}
        {p.lines.map((l) => (
          <path d={path(l)} fill="none" style={{ stroke: l.color }} stroke-width={l.width ?? 1.8} stroke-dasharray={l.dash} stroke-linejoin="round" />
        ))}
        {p.marker && Number.isFinite(p.marker.x) && (
          <line
            class="mc-marker"
            x1={tx(p.marker.x)}
            x2={tx(p.marker.x)}
            y1={PAD.t}
            y2={H - PAD.b}
            stroke-dasharray={p.marker.dashed ? '3 3' : undefined}
          />
        )}
      </g>
      <rect class="mc-frame" x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} />
      {p.xLabel && (
        <text class="mc-label" x={W - PAD.r} y={H - 2} text-anchor="end">
          {p.xLabel}
        </text>
      )}
      {p.yLabel && (
        <text class="mc-label" x={PAD.l} y={2} dominant-baseline="hanging">
          {p.yLabel}
        </text>
      )}
    </svg>
  );
}

function decades(a: number, b: number): number[] {
  const out: number[] = [];
  for (let e = Math.ceil(Math.log10(a)); 10 ** e <= b * 1.0001; e++) out.push(10 ** e);
  return out;
}
