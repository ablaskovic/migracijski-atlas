import { useRef, useState } from 'react';
import { DOM, PE_SPAN, YEARS, val, yrsCols, yrsOrder } from '../lib/metrics.ts';
import { colors, countyName, formatNumber, periodLabel, type AtlasState } from './model.ts';
import TableScroll from './TableScroll.tsx';

export default function YearsGrid({ s, light, onPick }: { s: AtlasState; light: boolean; onPick: (county: string, yi: number) => void }) {
  // The tab stop is a county and a year, not an index: a metric or mode change reorders the rows under it.
  const [focused, setFocused] = useState<{ county: string; yi: number } | null>(null);
  const [peek, setPeek] = useState<{ county: string; yi: number } | null>(null);
  const table = useRef<HTMLDivElement>(null);
  const cols = yrsCols(s.cum), rows = yrsOrder(s.flow, s.den, cols);
  const scale = colors(DOM[s.flow + s.den + s.cum], light);
  const fmt = (n: number) => formatNumber(s.lang, n, { signed: true, digits: s.relative ? 1 : 0, percent: s.relative });
  const active = peek ?? (s.county ? { county: s.county, yi: s.yi } : null);
  const stop = focused && rows.includes(focused.county) && cols.includes(focused.yi) ? focused : { county: rows[0], yi: cols[0] };
  return <><TableScroll className="v3-years-scroll" scrollRef={table} lang={s.lang} label={s.lang === 'hr' ? 'Tablica godina' : 'Years table'}>
    <table className="v3-years" aria-label={s.lang === 'hr' ? 'Saldo po županijama i godinama' : 'Net change by county and year'}>
      <thead><tr><th scope="col">{s.lang === 'hr' ? 'Županija' : 'County'}</th>{cols.map(yi => <th scope="col" key={yi}>{YEARS[yi]}</th>)}</tr></thead>
      <tbody>{rows.map((iso, row) => <tr key={iso}><th scope="row">{countyName(iso, s.lang)}</th>{cols.map((yi, col) => {
        const n = val(iso, yi, s.flow, s.den, s.cum), idx = row * cols.length + col;
        const text = `${countyName(iso, s.lang)} · ${periodLabel(yi, s.cum)}: ${fmt(n)}`;
        return <td key={yi}><button data-grid-cell={idx} title={text} aria-label={text} tabIndex={iso === stop.county && yi === stop.yi ? 0 : -1}
          aria-pressed={s.county === iso && s.yi === yi} style={{ backgroundColor: scale(n) }}
          onFocus={() => { setFocused({ county: iso, yi }); setPeek({ county: iso, yi }); }} onBlur={() => setPeek(null)} onPointerEnter={() => setPeek({ county: iso, yi })} onPointerLeave={() => setPeek(null)} onClick={e => { onPick(iso, yi); if (e.detail > 0 && matchMedia('(max-width:960px), (pointer:coarse)').matches) requestAnimationFrame(() => document.querySelector('.v3-years-readout')?.scrollIntoView({ block: 'nearest', behavior: 'auto' })); }}
          onKeyDown={e => {
            // Moves stay in the row or column and stop at its edge; they never wrap into the next county or year.
            const move: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0], Home: [0, -col], End: [0, cols.length - 1 - col], PageDown: [5, 0], PageUp: [-5, 0] };
            if (!(e.key in move)) return; e.preventDefault();
            const r = Math.max(0, Math.min(rows.length - 1, row + move[e.key][0])), c = Math.max(0, Math.min(cols.length - 1, col + move[e.key][1]));
            setFocused({ county: rows[r], yi: cols[c] });
            const target = table.current?.querySelector<HTMLButtonElement>(`[data-grid-cell="${r * cols.length + c}"]`);
            target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }} /></td>;
      })}</tr>)}</tbody>
    </table>
  </TableScroll><div className="v3-years-readout">{active ? <><span>{countyName(active.county, s.lang)} · {periodLabel(active.yi, s.cum)}</span><strong>{fmt(val(active.county, active.yi, s.flow, s.den, s.cum))}</strong></> : <span>{s.lang === 'hr' ? 'Odaberite ili fokusirajte ćeliju za točnu vrijednost.' : 'Select or focus a cell for its exact value.'}</span>}</div><p className="v3-data-note">{s.lang === 'hr' ? 'Poredak županija prema ukupnoj vrijednosti cijelog prikazanog razdoblja; ne mijenja se odabirom godine.' : 'Counties are ordered by the total for the full displayed period; selecting a year does not change their order.'}</p>{s.den === 'relest' && <p className="v3-data-note">{s.lang === 'hr' ? `Svaki stupac koristi procjenu svoje godine; procjene su dostupne za ${PE_SPAN[0]}–${PE_SPAN[1]}, a izvan raspona koristi se najbliža dostupna godina.` : `Each column uses its own year’s estimate; estimates cover ${PE_SPAN[0]}–${PE_SPAN[1]}, with the nearest available year used outside that range.`}</p>}</>;
}
