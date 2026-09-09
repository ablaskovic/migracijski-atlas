import { useMemo, useState } from 'react';
import { geoConicEqualArea, geoDistance, geoPath } from 'd3-geo';
import type { FeatureCollection, Geometry } from 'geojson';
import { GEO, ISOS, SHORTN, flowMax, flowOf } from '../lib/metrics.ts';
import type { Dir } from '../lib/types.ts';
import { offCentre } from '../lib/anchors.ts';
import { colors, countyName, domain, value, type AtlasState } from './model.ts';
import Icon from './Icon.tsx';
import useMapNavigation from './useMapNavigation.ts';
import './map-interactions.css';

const W = 820, H = 535;
const cities: [string, number, number][] = [['Zagreb', 15.98, 45.81], ['Rijeka', 14.44, 45.33], ['Osijek', 18.69, 45.55], ['Zadar', 15.23, 44.12], ['Split', 16.44, 43.51], ['Dubrovnik', 18.09, 42.65], ['Pula', 13.85, 44.87]];
const projection = geoConicEqualArea().parallels([43.2, 46.2]).rotate([-16.4, 0]).fitExtent([[105, 40], [W - 70, H - 32]], GEO);
const path = geoPath(projection);
const shapes = GEO.features.map(f => ({ iso: f.properties.shapeISO, d: path(f) ?? '', feature: f }));
const scaleStart: [number, number] = [16, 45], scaleEnd: [number, number] = [17, 45];
const scaleWidth = Math.abs(projection(scaleEnd)![0] - projection(scaleStart)![0]) * 50 / (geoDistance(scaleStart, scaleEnd) * 6371);

interface Props {
  s: AtlasState; light: boolean; hover: string | null; onHover: (iso: string | null) => void;
  onSelect: (iso: string) => void; format: (n: number, relative?: boolean) => string; direction: Dir;
  fillCounty?: (iso: string) => string; describeCounty?: (iso: string) => string;
  highlightedCounties?: string[]; boundaries?: FeatureCollection<Geometry>; partner?: string | null;
}

export default function MapCanvas({ s, light, hover, onHover, onSelect, format, direction, fillCounty, describeCounty, highlightedCounties = [], boundaries, partner = null }: Props) {
  const nav = useMapNavigation(W, H);
  const { zoom } = nav;
  const [labels, setLabels] = useState<'cities' | 'counties' | 'off'>('cities');
  const [focused, setFocused] = useState<string | null>(null);
  const scale = colors(domain(s), light);
  const hub = s.county ?? 'HR-21';
  const isFlow = s.view === 'flows';
  const anchors = useMemo(() => {
    if (!isFlow && labels !== 'counties') return {} as Record<string, [number, number]>;
    const corrections = offCentre();
    return Object.fromEntries(shapes.map(f => [f.iso, corrections[f.iso] ? projection(corrections[f.iso])! : path.centroid(f.feature)]));
  }, [isFlow, labels]);
  const corridors = isFlow ? ISOS.filter(i => i !== hub).map(iso => ({ iso, n: flowOf(hub, direction, iso, s.yi, s.cum) })).sort((a, b) => Math.abs(a.n) - Math.abs(b.n)) : [];
  const maxFlow = isFlow ? Math.max(1, flowMax(hub, direction, s.cum)) : 1;
  const L = (hr: string, en: string) => s.lang === 'hr' ? hr : en;
  const active = hover ?? (isFlow ? partner : null) ?? s.county;
  const selectedCounty = isFlow ? hub : s.county;
  const outlines = [...new Set([...highlightedCounties, selectedCounty, isFlow ? partner : null, hover, focused])].filter((iso): iso is string => !!iso);
  const count = (n: number) => new Intl.NumberFormat(s.lang === 'hr' ? 'hr-HR' : 'en-GB').format(n);
  const towardHub = (n: number) => direction === 'in' || direction === 'net' && n >= 0;
  const flowLabel = (iso: string) => {
    if (iso === hub) return countyName(hub, s.lang) + ' · ' + L('odabrana županija', 'selected county');
    const n = flowOf(hub, direction, iso, s.yi, s.cum), incoming = towardHub(n);
    return `${countyName(incoming ? iso : hub, s.lang)} → ${countyName(incoming ? hub : iso, s.lang)}: ${count(Math.abs(n))} ${direction === 'net' ? L('neto preseljenja', 'net moves') : L('preseljenja', 'moves')}`;
  };
  const labelMode = labels === 'cities' ? L('Gradovi', 'Cities') : labels === 'counties' ? L('Županije', 'Counties') : L('Bez naziva', 'Labels off');
  const nextLabels = labels === 'cities' ? 'counties' : labels === 'counties' ? 'off' : 'cities';
  const countyLabels: { iso: string; text: string; x: number; y: number; width: number }[] = [];
  const labelSize = 12 / zoom;
  if (labels === 'counties') {
    // Keep crowded northern names apart; zooming reveals the smaller counties.
    const ordered = [...shapes].sort((a, b) => Number(b.iso === active) - Number(a.iso === active));
    const labelHeight = labelSize * parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
    for (const f of ordered) {
      const [x, y] = anchors[f.iso], text = f.iso === 'HR-21' ? L('Grad Zagreb', 'City of Zagreb') : SHORTN[f.iso];
      const width = text.length * labelHeight * .6;
      if (!countyLabels.some(p => Math.abs(p.x - x) < (p.width + width) / 2 + 3 / zoom && Math.abs(p.y - y) < labelHeight + 3 / zoom)) countyLabels.push({ iso: f.iso, text, x, y, width });
    }
  }

  return <div className={'v3-cartography' + (zoom > 1 ? ' is-zoomed' : '')}>
    <svg ref={nav.svg} className={'v3-map' + (nav.dragging ? ' is-panning' : '')} viewBox={`0 0 ${W} ${H}`} aria-label={L('Interaktivna karta hrvatskih županija', 'Interactive map of Croatian counties')}
      onPointerDown={e => { if (nav.onPointerDown(e)) onHover(null); }}
      onPointerMove={e => { if (nav.onPointerMove(e)) onHover(null); }}
      onPointerUp={nav.onPointerEnd} onPointerCancel={nav.onPointerEnd} onLostPointerCapture={nav.onPointerEnd}
      onClickCapture={e => { if (e.detail > 0 && nav.suppressClick.current) { e.preventDefault(); e.stopPropagation(); } }}
      onDragStart={e => e.preventDefault()}>
      <defs><pattern id="v3-grid" width="45" height="45" patternUnits="userSpaceOnUse"><path d="M 45 0 L 0 0 0 45" fill="none" stroke="currentColor" strokeWidth=".6" /></pattern>{['in', 'out'].map(dir => <marker key={dir} id={dir === 'in' ? 'v3-arrowhead' : 'v3-arrowhead-out'} viewBox="0 0 10 10" markerWidth="7" markerHeight="7" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 10 5 0 10Z" fill={dir === 'in' ? 'var(--accent)' : 'var(--coral)'} /></marker>)}</defs>
      <rect width={W} height={H} fill="url(#v3-grid)" className="v3-map-grid" />
      <g className="v3-compass" transform="translate(53 68)"><text y="-22" textAnchor="middle">N</text><path d="m0-13 5 19-5-3-5 3Z" fill="currentColor" stroke="none" /><circle r="15" fill="none" stroke="currentColor" strokeWidth=".7" /></g>
      <text x="610" y="300" className="v3-neighbour" textAnchor="middle">{L('BOSNA I HERCEGOVINA', 'BOSNIA & HERZEGOVINA')}</text>
      <text x="295" y="370" className="v3-sea" textAnchor="middle" transform="rotate(32 295 370)">{L('JADRANSKO MORE', 'ADRIATIC SEA')}</text>
      <g className="v3-map-world" transform={`translate(${nav.x} ${nav.y}) translate(${W / 2} ${H / 2}) scale(${zoom}) translate(${-W / 2} ${-H / 2})`}>
        <g className="v3-counties">{shapes.map(f => {
          const selected = selectedCounty === f.iso || isFlow && partner === f.iso;
          const n = value(f.iso, s);
          const description = describeCounty?.(f.iso) ?? (isFlow ? flowLabel(f.iso) : `${countyName(f.iso, s.lang)}: ${format(n, s.relative)}`);
          return <path key={f.iso} d={f.d} data-county={f.iso} role="button" tabIndex={0}
            aria-label={description} aria-pressed={selected}
            className={(selected ? 'is-selected ' : '') + (hover === f.iso ? 'is-hovered' : '')}
            fill={fillCounty?.(f.iso) ?? (isFlow ? (f.iso === hub ? 'var(--accent)' : 'var(--flow-land)') : scale(n))}
            vectorEffect="non-scaling-stroke"
            onPointerEnter={() => { if (!nav.dragging) onHover(f.iso); }} onPointerLeave={() => onHover(null)}
            onFocus={e => { setFocused(e.currentTarget.matches(':focus-visible') ? f.iso : null); onHover(f.iso); }} onBlur={() => { setFocused(null); onHover(null); }}
            onClick={() => onSelect(f.iso)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(f.iso); } }}>
            <title>{description}</title>
          </path>;
        })}</g>
        {boundaries && <path className="v3-region-boundaries" d={path(boundaries) ?? ''} vectorEffect="non-scaling-stroke" aria-hidden="true" />}
        {isFlow && <g className="v3-corridors" aria-hidden="true">{corridors.filter(d => Math.abs(d.n) >= 5).map(d => {
          const incoming = towardHub(d.n), a = anchors[incoming ? d.iso : hub], b = anchors[incoming ? hub : d.iso];
          const bend = Math.hypot(a[0] - b[0], a[1] - b[1]) * .18;
          const emphasized = active && active !== hub;
          return <path key={d.iso} data-corridor={d.iso} d={`M${a[0]},${a[1]} Q${(a[0] + b[0]) / 2 + bend},${(a[1] + b[1]) / 2 - bend} ${b[0]},${b[1]}`}
            fill="none" markerEnd={incoming ? 'url(#v3-arrowhead)' : 'url(#v3-arrowhead-out)'} stroke={incoming ? 'var(--accent)' : 'var(--coral)'} strokeWidth={.8 + 6 * Math.sqrt(Math.abs(d.n) / maxFlow)} opacity={emphasized ? active === d.iso ? .95 : .1 : .65} />;
        })}<circle cx={anchors[hub][0]} cy={anchors[hub][1]} r="6" fill="var(--text)" stroke="var(--surface)" strokeWidth="3" /></g>}
        <g className="v3-county-outlines" aria-hidden="true">{outlines.map(iso => <path key={iso} data-outline={iso} d={shapes.find(f => f.iso === iso)?.d} className={focused === iso ? 'is-focused' : undefined} vectorEffect="non-scaling-stroke" />)}</g>
        {labels === 'cities' && <g className="v3-map-labels" aria-hidden="true">{cities.map(([name, lon, lat]) => {
          const [x, y] = projection([lon, lat])!;
          return <g key={name} transform={`translate(${x} ${y})`}><circle r="2.4" /><text x="7" y="4">{name}</text></g>;
        })}</g>}
        {labels === 'counties' && <g className="v3-map-labels v3-county-labels" aria-hidden="true" style={{ fontSize: `${labelSize / 16}rem` }}>{countyLabels.map(label => <text key={label.iso} data-county-label={label.iso} x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central">{label.text}</text>)}</g>}
      </g>
      <g className="v3-geographic-scale" transform={`translate(${W - 60 - scaleWidth * zoom} ${H - 28})`} aria-hidden="true"><path d={`M0 -5V0H${scaleWidth * zoom}V-5`} fill="none" stroke="currentColor" strokeWidth="1" /><text x={scaleWidth * zoom / 2} y="15" textAnchor="middle">50 km · 45° N</text></g>
    </svg>
    <div className="v3-map-tools"><button title={L('Povećaj kartu', 'Zoom in')} aria-label={L('Povećaj kartu', 'Zoom in')} disabled={zoom >= nav.maxZoom} onClick={nav.zoomIn}><Icon name="plus" size={18} /></button>
      <button title={L('Smanji kartu', 'Zoom out')} aria-label={L('Smanji kartu', 'Zoom out')} disabled={zoom === 1} onClick={nav.zoomOut}><Icon name="minus" size={18} /></button>
      <button title={L('Vrati prikaz', 'Reset map')} aria-label={L('Vrati prikaz', 'Reset map')} onClick={nav.reset}><Icon name="reset" size={16} /></button>
      <button title={L('Nazivi: ', 'Labels: ') + labelMode} aria-label={L('Nazivi: ', 'Labels: ') + labelMode + '. ' + L('Promijeni nazive', 'Change labels')} aria-pressed={labels !== 'off'} onClick={() => setLabels(nextLabels)}>Aa</button></div>
    <div className="v3-map-readout" aria-live="polite">{active ? describeCounty ? <span>{describeCounty(active)}</span> : isFlow ? <span>{flowLabel(active)}</span> : <><span>{countyName(active, s.lang)}</span><strong>{format(value(active, s), s.relative)}</strong></> : <><span className="v3-live-dot" /><span>{L('Odaberite županiju za više detalja', 'Select a county to explore')}</span></>}</div>
  </div>;
}
