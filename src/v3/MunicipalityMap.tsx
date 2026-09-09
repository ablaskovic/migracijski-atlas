import { useMemo, useRef, useState } from 'react';
import { geoConicEqualArea, geoPath } from 'd3-geo';
import { GEO, ISOS, jlsVal } from '../lib/metrics.ts';
import { geoStatus, jlsFailed, jlsGeo, retryGeo, useGeo } from '../lib/geoAsync.ts';
import { colors, countyName, fold, type AtlasState } from './model.ts';
import useMapNavigation from './useMapNavigation.ts';
import Icon from './Icon.tsx';
import './municipality-map.css';

const W = 820, H = 535;
const projection = geoConicEqualArea().parallels([43.2, 46.2]).rotate([-16.4, 0]).fitExtent([[50, 35], [W - 40, H - 30]], GEO);
const path = geoPath(projection);

export default function MunicipalityMap({ s, light, update }: { s: AtlasState; light: boolean; update: (patch: Partial<AtlasState>) => void }) {
  useGeo('jmap');
  const geo = jlsGeo();
  const nav = useMapNavigation(W, H);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState(0);
  const results = useRef<HTMLDivElement>(null);
  const L = (hr: string, en: string) => s.lang === 'hr' ? hr : en;
  const nf = new Intl.NumberFormat(s.lang);
  const features = useMemo(() => geo?.features.map(f => ({ f, p: f.properties, d: path(f) ?? '' })) ?? [], [geo]);
  const rows = features.filter(({ p }) => (!s.county || ISOS[p.c] === s.county) && fold(p.n).includes(fold(query))).sort((a, b) => jlsVal(b.p, s.dir) - jlsVal(a.p, s.dir));
  const max = Math.max(1, ...features.map(({ p }) => Math.abs(jlsVal(p, s.dir))));
  const scale = colors(max, light);
  const active = features.find(({ p }) => p.j === (hover ?? selected));
  const description = (p: typeof features[number]['p']) => `${p.n} · ${countyName(ISOS[p.c], s.lang)}: ${nf.format(jlsVal(p, s.dir))}`;
  return <div className="v3-analysis" data-analysis="municipalities"><div className="v3-section-heading"><div><h2>{L('Promjene, mjesto po mjesto.', 'Change, place by place.')}</h2><p>{L('556 gradova i općina · izmjereni unutarnji tokovi 2018.', '556 cities and municipalities · measured internal flows in 2018')}</p></div></div>
    <div className="v3-municipal-layout"><div><div className={'v3-cartography v3-municipal-map' + (nav.zoom > 1 ? ' is-zoomed' : '')}>
      <svg ref={nav.svg} className={'v3-map' + (nav.dragging ? ' is-panning' : '')} viewBox={`0 0 ${W} ${H}`} aria-label={L('Karta gradova i općina Hrvatske 2018.', 'Map of Croatian municipalities 2018')} onPointerDown={nav.onPointerDown} onPointerMove={e => { if (nav.onPointerMove(e)) setHover(null); }} onPointerUp={nav.onPointerEnd} onPointerCancel={nav.onPointerEnd} onLostPointerCapture={nav.onPointerEnd} onClickCapture={e => { if (e.detail > 0 && nav.suppressClick.current) { e.preventDefault(); e.stopPropagation(); } }} onDragStart={e => e.preventDefault()}>
        <g className="v3-map-world" transform={`translate(${nav.x} ${nav.y}) translate(${W / 2} ${H / 2}) scale(${nav.zoom}) translate(${-W / 2} ${-H / 2})`}>
          <g className="v3-municipal-shapes">{features.map(({ p, d }, i) => <path key={p.j} d={d} data-municipality={p.j} fill={scale(jlsVal(p, s.dir))} opacity={s.county && ISOS[p.c] !== s.county ? .22 : 1} vectorEffect="non-scaling-stroke" role="button" tabIndex={focused === i ? 0 : -1} aria-label={description(p)} aria-pressed={selected === p.j} onPointerEnter={() => { if (!nav.dragging) setHover(p.j); }} onPointerLeave={() => setHover(null)} onFocus={e => { nav.reveal(e.currentTarget); setFocused(i); setHover(p.j); }} onBlur={() => setHover(null)} onClick={() => setSelected(p.j)} onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(p.j); return; }
            const delta: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: -i, End: features.length - 1 - i };
            if (!(e.key in delta)) return; e.preventDefault();
            const next = Math.max(0, Math.min(features.length - 1, i + delta[e.key]));
            nav.svg.current?.querySelector<SVGPathElement>(`[data-municipality="${features[next].p.j}"]`)?.focus();
          }}><title>{description(p)}</title></path>)}</g>
          <path d={path(GEO) ?? ''} className="v3-region-boundaries" vectorEffect="non-scaling-stroke" aria-hidden="true" />
          {active && <path className="v3-municipal-outline" data-municipality-outline={active.p.j} d={active.d} vectorEffect="non-scaling-stroke" aria-hidden="true" />}
        </g>
      </svg>
      <div className="v3-map-tools"><button aria-label={L('Povećaj kartu', 'Zoom in')} disabled={nav.zoom === nav.maxZoom} onClick={nav.zoomIn}><Icon name="plus" size={18} /></button><button aria-label={L('Smanji kartu', 'Zoom out')} disabled={nav.zoom === 1} onClick={nav.zoomOut}><Icon name="minus" size={18} /></button><button aria-label={L('Vrati prikaz', 'Reset map')} onClick={nav.reset}><Icon name="reset" size={16} /></button></div>
      {!geo && <div className="v3-geo-loading" role="status">{geoStatus(true)}{jlsFailed() && <button className="v3-button" onClick={() => void retryGeo()}>{L('Pokušaj ponovno', 'Retry')}</button>}</div>}
    </div><div className="v3-municipal-readout" aria-live="polite">{active ? <><strong>{active.p.n}</strong><span>{countyName(ISOS[active.p.c], s.lang)} · {L('Doseljeni', 'Arrivals')}: {nf.format(active.p.i)} · {L('Odseljeni', 'Departures')}: {nf.format(active.p.o)} · {L('Saldo', 'Net')}: {nf.format(active.p.i - active.p.o)}</span><button className="v3-text-button" onClick={() => update({ view: 'population', panel: 'municipal', county: ISOS[active.p.c] })}>{L('Lokalni koridori županije', 'County’s local corridors')}<Icon name="arrow" size={15} /></button></> : <span>{L('Odaberite mjesto na karti ili ga pronađite na popisu.', 'Select a place on the map or find it in the list.')}</span>}</div>
    <div className="v3-legend"><span>{s.dir === 'net' ? nf.format(-max) : '0'}</span><div className="v3-color-key"><div style={{ background: `linear-gradient(90deg,${Array.from({ length: 21 }, (_, i) => scale((s.dir === 'net' ? -max : 0) + i / 20 * (s.dir === 'net' ? 2 * max : max))).join(',')})` }} /></div><span>{nf.format(max)}</span></div></div>
    <div className="v3-municipal-search"><label className="v3-search"><Icon name="search" size={16} /><input value={query} type="search" aria-label={L('Pronađite grad ili općinu', 'Find a city or municipality')} placeholder={L('Grad ili općina…', 'City or municipality…')} onChange={e => setQuery(e.target.value)} /></label><label className="v3-local-filter">{L('Županija', 'County')}<select value={s.county ?? ''} onChange={e => update({ county: e.target.value || null })}><option value="">{L('Sve županije', 'All counties')}</option>{ISOS.map(i => <option key={i} value={i}>{countyName(i, s.lang)}</option>)}</select></label><p className="v3-data-note">{rows.length} / {features.length} · {L('Poredak po odabranoj vrijednosti', 'Ranked by selected value')}</p><div className="v3-municipal-results" ref={results}>{rows.map(({ p }) => <button key={p.j} aria-pressed={selected === p.j} onClick={() => setSelected(p.j)} onPointerEnter={() => setHover(p.j)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(p.j)} onBlur={() => setHover(null)}><span>{p.n}<small>{countyName(ISOS[p.c], s.lang)}</small></span><strong className={jlsVal(p, s.dir) < 0 ? 'v3-negative' : ''}>{nf.format(jlsVal(p, s.dir))}</strong></button>)}{geo && rows.length === 0 && <div className="v3-empty"><p>{L('Nema rezultata.', 'No results.')}</p><button onClick={() => { setQuery(''); update({ county: null }); }}>{L('Očisti filtre', 'Clear filters')}</button></div>}</div></div></div>
    <p className="v3-data-note">{L('Samo preseljenja između različitih gradova i općina, uključujući ona unutar iste županije. Vanjske migracije nisu uključene. Pitoski i sur. (2021.), CC BY 4.0; granice OpenStreetMap, ODbL 1.0.', 'Moves between distinct cities and municipalities, including within a county. External migration is excluded. Pitoski et al. (2021), CC BY 4.0; OpenStreetMap boundaries, ODbL 1.0.')}</p>
  </div>;
}
