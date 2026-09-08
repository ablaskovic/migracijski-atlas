import { ISOS, YEARS, netAt } from '../lib/metrics.ts';
import type { Flow } from '../lib/types.ts';
import type { AtlasState } from './model.ts';

interface Props { s: AtlasState; compact?: boolean; onYear?: (yi: number) => void; flow?: Flow; }

export default function TrendChart({ s, compact = false, onYear, flow }: Props) {
  const series = YEARS.map((_, yi) => (s.county ? [s.county] : ISOS).reduce((n, iso) => n + netAt(iso, yi, flow ?? (s.county ? s.flow : 'ext')), 0));
  const max = Math.max(1, ...series.map(Math.abs));
  const w = 800, h = compact ? 160 : 240, left = compact ? 8 : 60, right = 16;
  const top = 20, bottom = h - 32, mid = (top + bottom) / 2;
  const step = (w - left - right) / YEARS.length;
  const y = (n: number) => mid - n / max * (mid - top);
  const fmt = new Intl.NumberFormat(s.lang === 'hr' ? 'hr-HR' : 'en-GB', { notation: 'compact', maximumFractionDigits: 0 });
  return <svg className={'v3-trend-chart' + (compact ? ' is-compact' : '')} viewBox={`0 0 ${w} ${h}`} role={onYear ? 'group' : 'img'} aria-label={s.lang === 'hr' ? 'Godišnji saldo od 1998. do 2025.' : 'Annual net change from 1998 to 2025'}>
    <title>{series.map((n, i) => `${YEARS[i]}: ${n}`).join('; ')}</title>
    {[top, mid, bottom].map((y, i) => <g key={y}><line x1={left} x2={w - right} y1={y} y2={y} className="v3-chart-grid" />{!compact && <text x={left - 12} y={y + 4} textAnchor="end">{fmt.format(i === 0 ? max : i === 1 ? 0 : -max)}</text>}</g>)}
    {series.map((n, i) => <g key={YEARS[i]}>
      <rect x={left + step * i + 2} y={Math.min(mid, y(n))} width={step - 5} height={Math.max(1, Math.abs(mid - y(n)))} rx="2" fill={n >= 0 ? 'var(--accent)' : 'var(--coral)'} opacity={i === s.yi ? 1 : .5} />
      {onYear && <rect x={left + step * i} y={top} width={step} height={bottom - top} fill="transparent" className="v3-chart-hit" role="button" tabIndex={0}
        aria-label={`${YEARS[i]}: ${new Intl.NumberFormat(s.lang).format(n)}`}
        onClick={() => onYear(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onYear(i); } }}><title>{YEARS[i]} · {new Intl.NumberFormat(s.lang).format(n)}</title></rect>}
      {(i === 0 || i === YEARS.length - 1 || YEARS[i] % 5 === 0) && <text x={left + step * (i + .5)} y={h - 8} textAnchor="middle">{YEARS[i]}</text>}
    </g>)}
    {!compact && <><line x1={left + step * YEARS.indexOf(2011)} x2={left + step * YEARS.indexOf(2011)} y1={top - 10} y2={bottom} className="v3-method-line" /><text x={left + step * YEARS.indexOf(2011) + 7} y={12}>{s.lang === 'hr' ? '2011 · promjena metodologije' : '2011 · methodology change'}</text></>}
  </svg>;
}
