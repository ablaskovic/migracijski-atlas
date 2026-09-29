import { useMemo, useRef, useState } from 'react';
import { geoConicEqualArea, geoPath } from 'd3-geo';
import { GEO, ISOS, jlsVal } from '../lib/metrics.ts';
import { geoStatus, jlsFailed, jlsGeo, offlineNote, retryArmed, retryGeo, useGeo } from '../lib/geoAsync.ts';
import { colors, countyName, fold, formatNumber, municipalDomain, resultCount, type AtlasState } from './model.ts';
import useMapNavigation from './useMapNavigation.ts';
import MapPan from './MapPan.tsx';
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
  // The results list is one tab stop (it can hold all 556 rows); arrow keys, Home and End move within it.
  const [row, setRow] = useState(0);
  // A keyboard focus ring of its own: the hover outline moves with the pointer and leaves with it.
  const [ring, setRing] = useState<number | null>(null);
  const [waiting, setWaiting] = useState(false);
  const results = useRef<HTMLDivElement>(null);
  // On a phone the list sits below the readout: a pick there scrolls the readout, with its figures and link, into view.
  const readout = useRef<HTMLDivElement>(null);
  const pickFromList = (j: number) => { setSelected(j); if (matchMedia('(max-width:720px)').matches) readout.current?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth' }); };
  // The retry and clear buttons remove themselves; focus goes to what they served.
  const search = useRef<HTMLInputElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const L = (hr: string, en: string) => s.lang === 'hr' ? hr : en;
  const count = (n: number, signed = false) => formatNumber(s.lang, n, { signed });
  const features = useMemo(() => geo?.features.map(f => ({ f, p: f.properties, d: path(f) ?? '' })) ?? [], [geo]);
  const rows = features.filter(({ p }) => (!s.county || ISOS[p.c] === s.county) && fold(p.n).includes(fold(query))).sort((a, b) => jlsVal(b.p, s.dir) - jlsVal(a.p, s.dir));
  const max = municipalDomain(features.map(({ p }) => jlsVal(p, s.dir)));
  const scale = colors(max, light);
  const active = features.find(({ p }) => p.j === (hover ?? selected));
  const description = (p: typeof features[number]['p']) => `${p.n} · ${countyName(ISOS[p.c], s.lang)}: ${count(jlsVal(p, s.dir), s.dir === 'net')}`;
  return <div className="v3-analysis" data-analysis="municipalities"><div className="v3-section-heading"><div><h2 ref={heading} tabIndex={-1}>{L('Promjene, mjesto po mjesto.', 'Change, place by place.')}</h2><p>{L('556 gradova i općina · izmjereni unutarnji tokovi 2018.', '556 cities and municipalities · measured internal flows in 2018')}</p></div></div>
    <div className="v3-municipal-layout"><div><div className={'v3-cartography v3-municipal-map' + (nav.zoom > 1 ? ' is-zoomed' : '')}>
      <svg ref={nav.svg} className={'v3-map' + (nav.dragging ? ' is-panning' : '')} viewBox={`0 0 ${W} ${H}`} aria-label={L('Karta gradova i općina Hrvatske 2018.', 'Map of Croatian municipalities 2018')} onPointerDown={e => { if (nav.onPointerDown(e)) setHover(null); }} onPointerMove={e => { if (nav.onPointerMove(e)) setHover(null); }} onPointerUp={nav.onPointerEnd} onPointerCancel={e => { nav.onPointerEnd(e); setHover(null); }} onLostPointerCapture={nav.onPointerEnd} onClickCapture={e => { if (e.detail > 0 && nav.suppressClick.current) { e.preventDefault(); e.stopPropagation(); } }} onDragStart={e => e.preventDefault()}>
        <g className="v3-map-world" transform={`translate(${nav.x} ${nav.y}) translate(${W / 2} ${H / 2}) scale(${nav.zoom}) translate(${-W / 2} ${-H / 2})`}>
          <g className="v3-municipal-shapes">{features.map(({ p, d }, i) => <path key={p.j} d={d} data-municipality={p.j} fill={scale(jlsVal(p, s.dir))} opacity={s.county && ISOS[p.c] !== s.county ? .22 : 1} vectorEffect="non-scaling-stroke" role="button" tabIndex={focused === i ? 0 : -1} aria-label={description(p)} aria-pressed={selected === p.j} onPointerEnter={() => { if (!nav.dragging) setHover(p.j); }} onPointerLeave={() => setHover(null)} onFocus={e => { nav.reveal(e.currentTarget); setFocused(i); setHover(p.j); setRing(e.currentTarget.matches(':focus-visible') ? p.j : null); }} onBlur={() => { setHover(null); setRing(null); }} onClick={() => setSelected(p.j)} onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(p.j); return; }
            const delta: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: -i, End: features.length - 1 - i };
            if (!(e.key in delta)) return; e.preventDefault();
            const next = Math.max(0, Math.min(features.length - 1, i + delta[e.key]));
            nav.svg.current?.querySelector<SVGPathElement>(`[data-municipality="${features[next].p.j}"]`)?.focus();
          }}><title>{description(p)}</title></path>)}</g>
          <path d={path(GEO) ?? ''} className="v3-region-boundaries" vectorEffect="non-scaling-stroke" aria-hidden="true" />
          {active && <path className="v3-municipal-outline" data-municipality-outline={active.p.j} d={active.d} vectorEffect="non-scaling-stroke" aria-hidden="true" />}
          {ring != null && <path className="v3-municipal-outline is-focused" data-municipality-focus={ring} d={features.find(({ p }) => p.j === ring)?.d} vectorEffect="non-scaling-stroke" aria-hidden="true" />}
        </g>
      </svg>
      <p className="v3-touch-hint">{nav.zoom > 1 ? L('Povucite kartu · ↺ za listanje stranice', 'Drag to move · ↺ to scroll page') : L('Listajte jednim prstom · Povećajte s dva', 'Scroll with one finger · Zoom with two')}</p>
      <div className="v3-map-tools"><button aria-label={L('Povećaj kartu', 'Zoom in')} aria-disabled={nav.zoom === nav.maxZoom || undefined} onClick={nav.zoomIn}><Icon name="plus" size={18} /></button><button aria-label={L('Smanji kartu', 'Zoom out')} aria-disabled={nav.zoom === 1 || undefined} onClick={nav.zoomOut}><Icon name="minus" size={18} /></button><button aria-label={L('Vrati prikaz', 'Reset map')} onClick={nav.reset}><Icon name="reset" size={16} /></button></div><MapPan nav={nav} lang={s.lang} />
      {!geo && <div className="v3-geo-loading" role="status">{geoStatus(true)}{jlsFailed() && <button className="v3-button" onClick={() => { heading.current?.focus(); void retryGeo().then(r => setWaiting(r === 'offline')); }}>{L('Pokušaj ponovno', 'Retry')}</button>}{waiting && retryArmed() && <span> {offlineNote()}</span>}</div>}
    </div><div className="v3-municipal-readout" ref={readout}>{active ? <><strong>{active.p.n}</strong><span>{countyName(ISOS[active.p.c], s.lang)} · {L('Doseljeni', 'Arrivals')}: {count(active.p.i)} · {L('Odseljeni', 'Departures')}: {count(active.p.o)} · {L('Saldo', 'Net')}: {count(active.p.i - active.p.o, true)}</span><button className="v3-text-button" onClick={() => update({ view: 'population', panel: 'municipal', county: ISOS[active.p.c] })}>{L('Lokalni koridori županije', 'County’s local corridors')}<Icon name="arrow" size={15} /></button></> : <span>{L('Odaberite mjesto na karti ili ga pronađite na popisu.', 'Select a place on the map or find it in the list.')}</span>}</div>
    <div className="v3-legend"><span>{s.dir === 'net' ? '≤ ' + count(-max) : '0'}</span><div className="v3-color-key"><div style={{ background: `linear-gradient(90deg,${Array.from({ length: 21 }, (_, i) => scale((s.dir === 'net' ? -max : 0) + i / 20 * (s.dir === 'net' ? 2 * max : max))).join(',')})` }} /></div><span>{'≥ ' + count(max, s.dir === 'net')}</span></div></div>
    <div className="v3-municipal-search"><label className="v3-search"><Icon name="search" size={16} /><input ref={search} value={query} type="search" aria-label={L('Pronađite grad ili općinu', 'Find a city or municipality')} placeholder={L('Grad ili općina…', 'City or municipality…')} onChange={e => setQuery(e.target.value)} /></label><p className="v3-sr" role="status">{query ? resultCount(s.lang, rows.length) : ''}</p><label className="v3-local-filter">{L('Županija', 'County')}<select value={s.county ?? ''} onChange={e => update({ county: e.target.value || null })}><option value="">{L('Sve županije', 'All counties')}</option>{ISOS.map(i => <option key={i} value={i}>{countyName(i, s.lang)}</option>)}</select></label><p className="v3-data-note">{rows.length} / {features.length} · {L('Poredak po odabranoj vrijednosti', 'Ranked by selected value')}</p><div className="v3-municipal-results" ref={results} onKeyDown={e => {
      const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>(':scope > button')], at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = at < 0 ? -1 : e.key === 'ArrowDown' ? at + 1 : e.key === 'ArrowUp' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : -1;
      if (next < 0 || next >= buttons.length) return;
      e.preventDefault(); buttons[next].focus();
    }}>{rows.map(({ p }, i) => <button key={p.j} tabIndex={i === Math.min(row, rows.length - 1) ? 0 : -1} aria-pressed={selected === p.j} onClick={() => pickFromList(p.j)} onPointerEnter={() => setHover(p.j)} onPointerLeave={() => setHover(null)} onFocus={() => { setHover(p.j); setRow(i); }} onBlur={() => setHover(null)}><span>{p.n}<small>{countyName(ISOS[p.c], s.lang)}</small></span><strong className={jlsVal(p, s.dir) < 0 ? 'v3-negative' : ''}>{count(jlsVal(p, s.dir), s.dir === 'net')}</strong></button>)}{geo && rows.length === 0 && <div className="v3-empty"><p>{L('Nema rezultata.', 'No results.')}</p><button onClick={() => { setQuery(''); update({ county: null }); search.current?.focus(); }}>{L('Očisti filtre', 'Clear filters')}</button></div>}</div></div></div>
    <p className="v3-data-note">{L('Samo preseljenja između različitih gradova i općina, uključujući ona unutar iste županije. Vanjske migracije nisu uključene. Pitoski i sur. (2021.), CC BY 4.0; granice OpenStreetMap, ODbL 1.0.', 'Moves between distinct cities and municipalities, including within a county. External migration is excluded. Pitoski et al. (2021), CC BY 4.0; OpenStreetMap boundaries, ODbL 1.0.')}</p>
  </div>;
}
