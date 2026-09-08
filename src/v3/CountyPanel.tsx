import { useState } from 'react';
import { ISOS, YEARS, flowOf, val } from '../lib/metrics.ts';
import type { Flow } from '../lib/types.ts';
import { countyName, fold, ranked, value, type AtlasState, type Explore } from './model.ts';
import Icon from './Icon.tsx';
import TrendChart from './TrendChart.tsx';

interface Props {
  s: AtlasState; hover: string | null; setHover: (iso: string | null) => void;
  update: (patch: Partial<AtlasState>) => void; selectView: (view: Explore) => void;
  direction: 'in' | 'out'; format: (n: number, relative?: boolean) => string; metricFull: Record<Flow, string>;
}

export default function CountyPanel({ s, hover, setHover, update, selectView, direction, format, metricFull }: Props) {
  const [query, setQuery] = useState('');
  const L = (hr: string, en: string) => s.lang === 'hr' ? hr : en;
  const hub = s.county ?? 'HR-21';
  const isFlow = s.view === 'flows';
  const rows = isFlow ? ISOS.filter(iso => iso !== hub).sort((a, b) => flowOf(hub, direction, b, s.yi, s.cum) - flowOf(hub, direction, a, s.yi, s.cum)) : ranked(s);
  const rowValue = (iso: string) => isFlow ? flowOf(hub, direction, iso, s.yi, s.cum) : value(iso, s);
  const max = Math.max(1, ...rows.map(iso => Math.abs(rowValue(iso))));
  const visible = rows.filter(iso => fold(countyName(iso, s.lang)).includes(fold(query)));
  const period = s.cum ? `2011–${YEARS[s.yi]}` : String(YEARS[s.yi]);
  return <aside className="v3-county-panel" aria-label={isFlow ? L('Koridori', 'Corridors') : L('Županije i detalji', 'Counties and details')}>
    {s.county && !isFlow ? <div className="v3-county-detail">
      <div className="v3-panel-title"><span className="v3-eyebrow">{L('DETALJI ŽUPANIJE', 'COUNTY DETAIL')}</span><button className="v3-icon-button" aria-label={L('Zatvori detalje', 'Close county details')} onClick={() => update({ county: null })}><Icon name="close" size={17} /></button></div>
      <h2>{countyName(s.county, s.lang)}</h2><span className="v3-detail-region">{s.county}<span>·</span>{period}</span>
      <strong className={'v3-detail-number ' + (value(s.county, s) < 0 ? 'v3-negative' : '')}>{format(value(s.county, s), s.relative)}</strong><span className="v3-detail-label">{metricFull[s.flow]}</span>
      <div className="v3-composition">{(['int', 'ext', 'nat'] as const).map(f => { const n = val(s.county!, s.yi, f, s.relative ? 'rel11' : 'abs', s.cum); return <div key={f}><span><i className={f} />{metricFull[f]}</span><strong className={n < 0 ? 'v3-negative' : 'v3-positive'}>{format(n, s.relative)}</strong></div>; })}</div>
      <div className="v3-detail-trend"><span className="v3-eyebrow">{L('GODIŠNJI TREND', 'ANNUAL TREND')} · {L('OSOBE', 'PEOPLE')}</span><TrendChart s={s} compact /></div>
      <button className="v3-text-button" onClick={() => selectView('trends')}>{L('Istražite kroz godine', 'Explore through the years')}<Icon name="arrow" size={16} /></button>
      <button className="v3-button v3-detail-flows" onClick={() => selectView('flows')}><Icon name="flow" size={16} />{L('Pogledajte tokove 2018.', 'View 2018 flows')}</button>
      <p className="v3-data-note">{L('Saldo je razlika između doseljenih i odseljenih. Prirodni prirast je razlika rođenih i umrlih.', 'Net migration is arrivals minus departures. Natural change is births minus deaths.')}</p>
    </div> : <>
      <div className="v3-panel-title"><h3>{isFlow ? L('Glavni koridori', 'Leading corridors') : L('Županije', 'Counties')}</h3><span>{isFlow ? 20 : 21}</span></div>
      <p className="v3-panel-subtitle">{isFlow ? L('Preseljenja između županija', 'Moves between counties') : L('Poredak prema odabranoj vrijednosti', 'Ranked by the selected value')}</p>
      <label className="v3-search"><Icon name="search" size={16} /><input type="search" value={query} placeholder={L('Pronađite županiju…', 'Find a county…')} aria-label={L('Pronađite županiju', 'Find a county')} onChange={e => setQuery(e.target.value)} /></label>
      <div className="v3-rank-list">{visible.map(iso => { const n = rowValue(iso); return <button key={iso} className={'v3-rank-row' + (hover === iso ? ' is-hovered' : '')} onClick={() => update({ county: iso })} onPointerEnter={() => setHover(iso)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(iso)} onBlur={() => setHover(null)}>
        <span className="v3-rank-index">{String(rows.indexOf(iso) + 1).padStart(2, '0')}</span><span className="v3-rank-body"><span className="v3-rank-label">{countyName(iso, s.lang)}</span><span className="v3-rank-track"><i style={{ width: `${Math.max(1.5, Math.abs(n) / max * 100)}%`, background: n < 0 ? 'var(--coral)' : 'var(--accent)' }} /></span></span><strong className={n < 0 ? 'v3-negative' : ''}>{isFlow ? new Intl.NumberFormat(s.lang).format(n) : format(n, s.relative)}</strong>
      </button>; })}{visible.length === 0 && <div className="v3-empty"><Icon name="search" /><p>{L('Nema pronađenih županija.', 'No counties found.')}</p><button onClick={() => setQuery('')}>{L('Očisti pretragu', 'Clear search')}</button></div>}</div>
      <div className="v3-panel-foot">{L('Odaberite županiju za istraživanje', 'Select a county to explore')}<Icon name="arrow" size={15} /></div>
    </>}
  </aside>;
}
