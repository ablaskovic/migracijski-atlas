import { useRef, useState } from 'react';
import { DOM, ISOS, YEARS, val } from '../lib/metrics.ts';
import { colors, countyName, type AtlasState } from './model.ts';

export default function YearsGrid({ s, light, onPick }: { s: AtlasState; light: boolean; onPick: (county: string, yi: number) => void }) {
  const [focused, setFocused] = useState(0);
  const table = useRef<HTMLDivElement>(null);
  const den = s.relative ? 'rel11' : 'abs';
  const scale = colors(DOM[s.flow + den + false], light);
  const fmt = new Intl.NumberFormat(s.lang === 'hr' ? 'hr-HR' : 'en-GB', { maximumFractionDigits: s.relative ? 1 : 0 });
  return <div className="v3-years-scroll" ref={table}>
    <table className="v3-years" aria-label={s.lang === 'hr' ? 'Godišnji saldo po županijama i godinama' : 'Annual net change by county and year'}>
      <thead><tr><th scope="col">{s.lang === 'hr' ? 'Županija' : 'County'}</th>{YEARS.map(y => <th scope="col" key={y}>{String(y).slice(2)}</th>)}</tr></thead>
      <tbody>{ISOS.map((iso, row) => <tr key={iso}><th scope="row">{countyName(iso, s.lang)}</th>{YEARS.map((y, col) => {
        const n = val(iso, col, s.flow, den, false), idx = row * YEARS.length + col;
        const text = `${countyName(iso, s.lang)} · ${y}: ${fmt.format(n)}${s.relative ? ' %' : ''}`;
        return <td key={y}><button data-grid-cell={idx} title={text} aria-label={text} tabIndex={idx === focused ? 0 : -1}
          aria-pressed={s.county === iso && s.yi === col} style={{ backgroundColor: scale(n) }}
          onFocus={() => setFocused(idx)} onClick={() => onPick(iso, col)}
          onKeyDown={e => {
            const move: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: YEARS.length, ArrowUp: -YEARS.length };
            if (!(e.key in move)) return; e.preventDefault();
            const next = Math.max(0, Math.min(ISOS.length * YEARS.length - 1, idx + move[e.key]));
            setFocused(next); table.current?.querySelector<HTMLButtonElement>(`[data-grid-cell="${next}"]`)?.focus();
          }} /></td>;
      })}</tr>)}</tbody>
    </table>
  </div>;
}
