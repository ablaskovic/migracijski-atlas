import { useRef, useState } from 'react';
import { DOM, PE_SPAN, YEARS, val, yrsCols, yrsOrder } from '../lib/metrics.ts';
import { colors, countyName, type AtlasState } from './model.ts';

export default function YearsGrid({ s, light, onPick }: { s: AtlasState; light: boolean; onPick: (county: string, yi: number) => void }) {
  const [focused, setFocused] = useState(0);
  const [peek, setPeek] = useState<{ county: string; yi: number } | null>(null);
  const table = useRef<HTMLDivElement>(null);
  const cols = yrsCols(s.cum), rows = yrsOrder(s.flow, s.den, cols);
  const scale = colors(DOM[s.flow + s.den + s.cum], light);
  const fmt = new Intl.NumberFormat(s.lang === 'hr' ? 'hr-HR' : 'en-GB', { maximumFractionDigits: s.relative ? 1 : 0 });
  const active = peek ?? (s.county ? { county: s.county, yi: s.yi } : null);
  return <><div className="v3-years-scroll" ref={table} role="region" tabIndex={0} aria-label={s.lang === 'hr' ? 'Tablica godina — pomičite vodoravno' : 'Years table — scroll horizontally'}>
    <table className="v3-years" aria-label={s.lang === 'hr' ? 'Saldo po županijama i godinama' : 'Net change by county and year'}>
      <thead><tr><th scope="col">{s.lang === 'hr' ? 'Županija' : 'County'}</th>{cols.map(yi => <th scope="col" key={yi}>{String(YEARS[yi]).slice(2)}</th>)}</tr></thead>
      <tbody>{rows.map((iso, row) => <tr key={iso}><th scope="row">{countyName(iso, s.lang)}</th>{cols.map((yi, col) => {
        const n = val(iso, yi, s.flow, s.den, s.cum), idx = row * cols.length + col;
        const text = `${countyName(iso, s.lang)} · ${s.cum ? '2011–' : ''}${YEARS[yi]}: ${fmt.format(n)}${s.relative ? ' %' : ''}`;
        return <td key={yi}><button data-grid-cell={idx} title={text} aria-label={text} tabIndex={idx === Math.min(focused, rows.length * cols.length - 1) ? 0 : -1}
          aria-pressed={s.county === iso && s.yi === yi} style={{ backgroundColor: scale(n) }}
          onFocus={() => { setFocused(idx); setPeek({ county: iso, yi }); }} onBlur={() => setPeek(null)} onPointerEnter={() => setPeek({ county: iso, yi })} onPointerLeave={() => setPeek(null)} onClick={() => onPick(iso, yi)}
          onKeyDown={e => {
            const move: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols.length, ArrowUp: -cols.length, Home: -col, End: cols.length - 1 - col, PageDown: cols.length * 5, PageUp: -cols.length * 5 };
            if (!(e.key in move)) return; e.preventDefault();
            const next = Math.max(0, Math.min(rows.length * cols.length - 1, idx + move[e.key]));
            setFocused(next); table.current?.querySelector<HTMLButtonElement>(`[data-grid-cell="${next}"]`)?.focus();
          }} /></td>;
      })}</tr>)}</tbody>
    </table>
  </div><div className="v3-years-readout" aria-live="polite">{active ? <><span>{countyName(active.county, s.lang)} · {s.cum ? '2011–' : ''}{YEARS[active.yi]}</span><strong>{fmt.format(val(active.county, active.yi, s.flow, s.den, s.cum))}{s.relative ? ' %' : ''}</strong></> : <span>{s.lang === 'hr' ? 'Odaberite ili fokusirajte ćeliju za točnu vrijednost.' : 'Select or focus a cell for its exact value.'}</span>}</div><p className="v3-data-note">{s.lang === 'hr' ? 'Poredak županija prema ukupnoj vrijednosti cijelog prikazanog razdoblja; ne mijenja se odabirom godine.' : 'Counties are ordered by the total for the full displayed period; selecting a year does not change their order.'}</p>{s.den === 'relest' && <p className="v3-data-note">{s.lang === 'hr' ? `Svaki stupac koristi procjenu svoje godine; procjene su dostupne za ${PE_SPAN[0]}–${PE_SPAN[1]}, a izvan raspona koristi se najbliža dostupna godina.` : `Each column uses its own year’s estimate; estimates cover ${PE_SPAN[0]}–${PE_SPAN[1]}, with the nearest available year used outside that range.`}</p>}</>;
}
