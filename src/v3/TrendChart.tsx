import { useRef, type CSSProperties, type PointerEvent } from 'react';
import { ISOS, YEARS, netAt } from '../lib/metrics.ts';
import type { Flow } from '../lib/types.ts';
import { formatNumber, type AtlasState } from './model.ts';
import useScreenScale from './useScreenScale.ts';

interface Props { s: AtlasState; compact?: boolean; onYear?: (yi: number, replace?: boolean) => void; flow?: Flow; }

/* Nationally, internal moves cancel out (exactly from 2007; before it only margin residuals remain), so the national
   total is the external balance and "migration + natural change" is external + natural. */
const national = (yi: number, flow: Flow) => ISOS.reduce((n, iso) => n + (flow === 'tot' ? netAt(iso, yi, 'ext') : flow === 'all' ? netAt(iso, yi, 'ext') + netAt(iso, yi, 'nat') : netAt(iso, yi, flow)), 0);

export default function TrendChart({ s, compact = false, onYear, flow }: Props) {
  // A phone scales the viewBox to under half size; the text keeps an 11 px floor on screen.
  const svg = useRef<SVGSVGElement>(null), scale = useScreenScale(svg);
  const series = YEARS.map((_, yi) => s.county ? netAt(s.county, yi, flow ?? s.flow) : national(yi, flow ?? s.flow));
  const max = Math.max(1, ...series.map(Math.abs));
  // Shrunk, the margins are screen pixels (px user units each) so the 11 px labels still fit beside the plot.
  const shrunk = scale < 1, px = shrunk ? 1 / scale : 1;
  const w = 800, h = compact ? 160 : 240, left = compact ? 8 : Math.max(60, 52 * px), right = Math.max(16, 16 * px);
  const top = Math.max(20, 26 * px), bottom = h - 32, mid = (top + bottom) / 2;
  const step = (w - left - right) / YEARS.length;
  const y = (n: number) => mid - n / max * (mid - top);
  // A sideways drag scrubs the years (a phone's bars are 10 px wide), one history entry per drag. It starts only past
  // 8 px of sideways travel, so a tap still reaches its bar and a vertical swipe still scrolls the page.
  const drag = useRef<{ id: number; x: number; y: number; on: boolean; pushed: boolean } | null>(null);
  const scrub = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current, ctm = e.currentTarget.getScreenCTM();
    if (!onYear || !d || d.id !== e.pointerId || !ctm) return;
    if (!d.on) { const dx = Math.abs(e.clientX - d.x); if (dx < 8 || dx < Math.abs(e.clientY - d.y)) return; e.currentTarget.setPointerCapture(e.pointerId); d.on = true; }
    const i = Math.max(0, Math.min(YEARS.length - 1, Math.floor(((e.clientX - ctm.e) / ctm.a - left) / step)));
    // The first new year is pushed and the rest replace it, so a drag that starts on the picked bar keeps that year on Back.
    if (i !== s.yi) { onYear(i, d.pushed); d.pushed = true; }
  };
  return <><svg ref={svg} style={scale < 1 ? { '--svg-min': `${11 / scale}px` } as CSSProperties : undefined} className={'v3-trend-chart' + (compact ? ' is-compact' : '')} viewBox={`0 0 ${w} ${h}`} role={onYear ? 'group' : 'img'} aria-label={s.lang === 'hr' ? 'Godišnji saldo od 1998. do 2025.' : 'Annual net change from 1998 to 2025'}
    onPointerDown={e => { if (onYear && e.button === 0) drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, pushed: false }; }} onPointerMove={scrub} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    <title>{series.map((n, i) => `${YEARS[i]}: ${formatNumber(s.lang, n, { signed: true })}`).join('; ')}</title>
    {[top, mid, bottom].map((y, i) => <g key={y}><line x1={left} x2={w - right} y1={y} y2={y} className="v3-chart-grid" />{!compact && <text x={left - 12} y={y + 4} textAnchor="end">{formatNumber(s.lang, i === 0 ? max : i === 1 ? 0 : -max, { compact: true, digits: 0 })}</text>}</g>)}
    {series.map((n, i) => <g key={YEARS[i]}>
      <rect x={left + step * i + 2} y={Math.min(mid, y(n))} width={step - 5} height={Math.max(1, Math.abs(mid - y(n)))} rx="2" fill={n >= 0 ? 'var(--accent)' : 'var(--coral)'} opacity={i === s.yi ? 1 : .5} />
      {onYear && <rect x={left + step * i} y={top} width={step} height={bottom - top} fill="transparent" className="v3-chart-hit" role="button" tabIndex={0} aria-pressed={i === s.yi}
        aria-label={`${YEARS[i]}: ${formatNumber(s.lang, n, { signed: true })}`}
        onClick={() => onYear(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onYear(i); } }}><title>{YEARS[i]} · {formatNumber(s.lang, n, { signed: true })}</title></rect>}
      {(i === 0 || i === YEARS.length - 1 || YEARS[i] % 5 === 0 && !(shrunk && YEARS[i] - YEARS[0] < 4)) && <text x={left + step * (i + .5)} y={h - 8} textAnchor="middle">{YEARS[i]}</text>}
    </g>)}
    {/* DZS limits the 2011 method change to migration to and from abroad, so only series with external migration show it. */}
    {!compact && s.flow !== 'int' && s.flow !== 'nat' && <><line x1={left + step * YEARS.indexOf(2011)} x2={left + step * YEARS.indexOf(2011)} y1={top - 10} y2={bottom} className="v3-method-line" /><text x={left + step * YEARS.indexOf(2011) + (shrunk ? -7 : 7)} y={12 * px} textAnchor={shrunk ? 'end' : undefined}>{s.lang === 'hr' ? '2011 · promjena metodologije' : '2011 · methodology change'}</text></>}
  </svg>
  {/* The picked bar's value is otherwise only in a tooltip, which touch never shows. */}
  {!compact && <p className="v3-trend-readout"><strong>{YEARS[s.yi]}</strong> · {formatNumber(s.lang, series[s.yi], { signed: true })}</p>}</>;
}
