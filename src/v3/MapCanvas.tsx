import { useMemo, useRef, useState } from 'react';
import { geoConicEqualArea, geoPath } from 'd3-geo';
import { GEO, ISOS, flowOf } from '../lib/metrics.ts';
import { offCentre } from '../lib/anchors.ts';
import { colors, countyName, domain, value, type AtlasState } from './model.ts';
import Icon from './Icon.tsx';

const W = 820, H = 535;
const cities: [string, number, number][] = [['Zagreb', 15.98, 45.81], ['Rijeka', 14.44, 45.33], ['Osijek', 18.69, 45.55], ['Zadar', 15.23, 44.12], ['Split', 16.44, 43.51], ['Dubrovnik', 18.09, 42.65], ['Pula', 13.85, 44.87]];
const projection = geoConicEqualArea().parallels([43.2, 46.2]).rotate([-16.4, 0]).fitExtent([[105, 40], [W - 70, H - 32]], GEO);
const path = geoPath(projection);
const shapes = GEO.features.map(f => ({ iso: f.properties.shapeISO, d: path(f) ?? '', feature: f }));

interface Props { s: AtlasState; light: boolean; hover: string | null; onHover: (iso: string | null) => void; onSelect: (iso: string) => void; format: (n: number, relative?: boolean) => string; direction: 'in' | 'out'; }

export default function MapCanvas({ s, light, hover, onHover, onSelect, format, direction }: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState([0, 0]);
  const [labels, setLabels] = useState(true);
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const scale = colors(domain(s), light);
  const hub = s.county ?? 'HR-21';
  const isFlow = s.view === 'flows';
  const anchors = useMemo(() => {
    if (!isFlow) return {} as Record<string, [number, number]>;
    const corrections = offCentre();
    return Object.fromEntries(shapes.map(f => [f.iso, corrections[f.iso] ? projection(corrections[f.iso])! : path.centroid(f.feature)]));
  }, [isFlow]);
  const corridors = isFlow ? ISOS.filter(i => i !== hub).map(iso => ({ iso, n: flowOf(hub, direction, iso, s.yi, s.cum) })).sort((a, b) => a.n - b.n) : [];
  const maxFlow = Math.max(1, ...corridors.map(d => d.n));
  const L = (hr: string, en: string) => s.lang === 'hr' ? hr : en;
  const active = hover ?? s.county;

  return <div className={'v3-cartography' + (zoom > 1 ? ' is-zoomed' : '')}>
    <svg className="v3-map" viewBox={`0 0 ${W} ${H}`} aria-label={L('Interaktivna karta hrvatskih županija', 'Interactive map of Croatian counties')}
      onPointerDown={e => { if (zoom <= 1) return; drag.current = { x: e.clientX, y: e.clientY, px: pan[0], py: pan[1], moved: false }; }}
      onPointerMove={e => { const d = drag.current; if (!d) return; const factor = W / e.currentTarget.getBoundingClientRect().width; if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) { d.moved = true; e.currentTarget.setPointerCapture(e.pointerId); } if (d.moved) setPan([d.px + (e.clientX - d.x) * factor, d.py + (e.clientY - d.y) * factor]); }}
      onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); if (drag.current?.moved) setTimeout(() => { drag.current = null; }, 0); else drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}>
      <defs><pattern id="v3-grid" width="45" height="45" patternUnits="userSpaceOnUse"><path d="M 45 0 L 0 0 0 45" fill="none" stroke="currentColor" strokeWidth=".6" /></pattern></defs>
      <rect width={W} height={H} fill="url(#v3-grid)" className="v3-map-grid" />
      <g className="v3-compass" transform="translate(53 68)"><text y="-22" textAnchor="middle">N</text><path d="m0-13 5 19-5-3-5 3Z" fill="currentColor" stroke="none" /><circle r="15" fill="none" stroke="currentColor" strokeWidth=".7" /></g>
      <text x="610" y="185" className="v3-neighbour" textAnchor="middle">{L('BOSNA I HERCEGOVINA', 'BOSNIA & HERZEGOVINA')}</text>
      <text x="295" y="370" className="v3-sea" textAnchor="middle" transform="rotate(32 295 370)">{L('JADRANSKO MORE', 'ADRIATIC SEA')}</text>
      <g transform={`translate(${pan[0]} ${pan[1]}) translate(${W / 2} ${H / 2}) scale(${zoom}) translate(${-W / 2} ${-H / 2})`}>
        <g className="v3-counties">{shapes.map(f => {
          const selected = (isFlow ? hub : s.county) === f.iso;
          const n = value(f.iso, s);
          return <path key={f.iso} d={f.d} data-county={f.iso} role="button" tabIndex={0}
            aria-label={`${countyName(f.iso, s.lang)}: ${format(n, s.relative)}`} aria-pressed={selected}
            className={(selected ? 'is-selected ' : '') + (hover === f.iso ? 'is-hovered' : '')}
            fill={isFlow ? (selected ? 'var(--accent)' : 'var(--flow-land)') : scale(n)}
            vectorEffect="non-scaling-stroke"
            onPointerEnter={() => { if (!drag.current?.moved) onHover(f.iso); }} onPointerLeave={() => onHover(null)}
            onFocus={() => onHover(f.iso)} onBlur={() => onHover(null)}
            onClick={() => { if (!drag.current?.moved) onSelect(f.iso); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(f.iso); } }}>
            <title>{countyName(f.iso, s.lang)} · {format(n, s.relative)}</title>
          </path>;
        })}</g>
        {isFlow && <g className="v3-corridors" aria-hidden="true">{corridors.filter(d => d.n >= 5).map(d => {
          const a = anchors[hub], b = anchors[d.iso];
          const bend = Math.hypot(a[0] - b[0], a[1] - b[1]) * .18;
          return <path key={d.iso} d={`M${a[0]},${a[1]} Q${(a[0] + b[0]) / 2 + bend},${(a[1] + b[1]) / 2 - bend} ${b[0]},${b[1]}`}
            fill="none" stroke={direction === 'in' ? 'var(--accent)' : 'var(--coral)'} strokeWidth={.8 + 6 * Math.sqrt(d.n / maxFlow)} opacity={hover && hover !== d.iso && hover !== hub ? .1 : .65} />;
        })}<circle cx={anchors[hub][0]} cy={anchors[hub][1]} r="6" fill="var(--text)" stroke="var(--surface)" strokeWidth="3" /></g>}
        {labels && <g className="v3-map-labels" aria-hidden="true">{cities.map(([name, lon, lat]) => {
          const [x, y] = projection([lon, lat])!;
          return <g key={name} transform={`translate(${x} ${y})`}><circle r="2.4" /><text x="7" y="4">{name}</text></g>;
        })}</g>}
      </g>
    </svg>
    <div className="v3-map-tools"><button title={L('Povećaj kartu', 'Zoom in')} aria-label={L('Povećaj kartu', 'Zoom in')} disabled={zoom >= 2.5} onClick={() => setZoom(z => Math.min(2.5, z + .5))}><Icon name="plus" size={18} /></button>
      <button title={L('Smanji kartu', 'Zoom out')} aria-label={L('Smanji kartu', 'Zoom out')} disabled={zoom === 1} onClick={() => { setZoom(z => Math.max(1, z - .5)); setPan([0, 0]); }}><Icon name="minus" size={18} /></button>
      <button title={L('Vrati prikaz', 'Reset map')} aria-label={L('Vrati prikaz', 'Reset map')} onClick={() => { setZoom(1); setPan([0, 0]); }}><Icon name="reset" size={16} /></button>
      <button title={L('Nazivi gradova', 'City labels')} aria-label={L('Nazivi gradova', 'City labels')} aria-pressed={labels} onClick={() => setLabels(!labels)}>Aa</button></div>
    <div className="v3-map-readout" aria-live="polite">{active ? <><span>{countyName(active, s.lang)}</span><strong>{isFlow && active !== hub ? format(flowOf(hub, direction, active, s.yi, s.cum)) : format(value(active, s), s.relative)}</strong></> : <><span className="v3-live-dot" /><span>{L('Odaberite županiju za više detalja', 'Select a county to explore')}</span></>}</div>
    <div className="v3-map-scale" aria-hidden="true"><span>0</span><i /><span>50 km</span></div>
  </div>;
}
