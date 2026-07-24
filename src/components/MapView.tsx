import { useEffect, useMemo, useRef, useState } from 'react';
import { geoConicEqualArea, geoPath } from 'd3-geo';
import { scaleSqrt } from 'd3-scale';
import {
  GEO, REGGEO, JGEO, ISOS, D, DOM, RDOM, REGOF, SHORTN,
  val, regVal, klasOf, KCOL, divScale, seqScale, flowOf, flowMax, flowBadge, jlsVal, jmapScale,
} from '../lib/metrics.ts';
import Legend from './Legend.tsx';
import DetailCard from './DetailCard.tsx';
import PairCard from './PairCard.tsx';
import JlsCard from './JlsCard.tsx';
import CitzPanel from './CitzPanel.tsx';
import AgePanel from './AgePanel.tsx';
import MatrixView from './MatrixView.tsx';
import StoryBar from './StoryBar.tsx';
import { moveTip, COARSE } from '../lib/tip.ts';
import { useZoom } from '../lib/useZoom.ts';
import type { Patch, State } from '../lib/types.ts';

export default function MapView({ S, setS, selectCounty, setHL, toggleCitz, toggleJls, toggleAge }: {
  S: State; setS: (p: Patch) => void; selectCounty: (iso: string) => void;
  setHL: (iso: string | null) => void; toggleCitz: () => void; toggleJls: () => void;
  toggleAge: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const ro = new ResizeObserver(es => {
      const r = es[0].contentRect;
      setSize(s => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    });
    ro.observe(wrapRef.current!);
    return () => ro.disconnect();
  }, []);

  /* wheel/pinch zoom + drag pan; identity by default so nothing else shifts */
  const zoom = useZoom(size.w, size.h);
  const zt = `translate(${zoom.t.x},${zoom.t.y}) scale(${zoom.t.k})`;
  /* a view change re-fits the content, so a leftover transform would be wrong */
  const resetZoom = zoom.reset;
  useEffect(() => { resetZoom(); }, [S.view, resetZoom]);

  /* The legend floats bottom-left of the map. Over a map that lands on sea, but
     over the matrix it would cover live cells, so MatrixView lays the grid out
     around it — which means it needs the legend's real box, not a guess (the
     note wraps to a different height at every breakpoint). Legend size depends
     only on view/dir, never on the grid, so there is no measurement loop. */
  const [legend, setLegend] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapRef.current?.querySelector('.legend');
    if (!el) { setLegend({ w: 0, h: 0 }); return; }
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setLegend(l => (l.w === r.width && l.h === r.height ? l : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [S.view, S.dir, S.cum]);

  const { drawn, cent, cds, rds, box, jds } = useMemo(() => {
    if (!size.w || !size.h) {
      return {
        drawn: false, cent: {} as Record<string, [number, number]>,
        cds: {} as Record<string, string>, rds: [] as string[],
        box: {} as Record<string, [number, number]>, jds: [] as string[],
      };
    }
    const proj = geoConicEqualArea().parallels([43.2, 46.2]).rotate([-16.4, 0])
      .fitExtent([[16, 10], [size.w - 16, size.h - 10]], GEO);
    const p = geoPath(proj);
    const cent: Record<string, [number, number]> = {}, cds: Record<string, string> = {};
    const box: Record<string, [number, number]> = {};
    GEO.features.forEach(f => {
      const iso = f.properties.shapeISO;
      cds[iso] = p(f)!; cent[iso] = p.centroid(f);
      const b = p.bounds(f); box[iso] = [b[1][0] - b[0][0], b[1][1] - b[0][1]];
    });
    const rds = REGGEO.features.map(f => p(f)!);
    const jds = JGEO.features.map(f => p(f) || '');  /* same projection as counties */
    return { drawn: true, cent, cds, rds, box, jds };
  }, [size]);

  /* county fill per state — port of update() */
  const fill = (iso: string): string => {
    if (S.view === 'klas') return KCOL[klasOf(iso, S.yi, S.thr, S.thrRel, S.thrPct)];
    if (S.view === 'reg') return divScale(RDOM[S.flow + S.den + S.cum])(regVal(REGOF[iso], S.yi, S.flow, S.den, S.cum));
    if (S.view === 'flow') {
      if (iso === S.sel) return '#3B4650';
      const m = flowMax(S.sel!, S.dir, S.cum), v = flowOf(S.sel!, S.dir, iso, S.yi, S.cum);
      if (S.dir === 'net') return divScale(m)(v);
      return seqScale(m, S.dir)(Math.abs(v));
    }
    return divScale(DOM[S.flow + S.den + S.cum])(val(iso, S.yi, S.flow, S.den, S.cum));
  };

  /* flow arcs — port of renderArcs(); estimated years render dashed (honesty
     encoding: only godišnje 2018 is measured) */
  const est = S.cum || flowBadge(S.yi, S.cum) !== 'izmjereno';
  const arcs = useMemo(() => {
    if (S.view !== 'flow' || !S.sel || !cent[S.sel]) return null;
    const sel = S.sel;
    const m = flowMax(sel, S.dir, S.cum);
    const wsc = scaleSqrt().domain([0, m]).range([0.6, 13]);
    const dv = divScale(m);
    const sq = seqScale(m, S.dir).range(['#D9C9C2', S.dir === 'in' ? '#1D4E89' : '#B5341F']);
    const [sx, sy] = cent[sel];
    const items = ISOS.filter(p => p !== sel)
      .map(p => ({ p, v: flowOf(sel, S.dir, p, S.yi, S.cum) }))
      .filter(d => Math.abs(d.v) >= 5)
      .sort((a, b) => Math.abs(a.v) - Math.abs(b.v));
    const paths = items.map(({ p, v }) => {
      const [tx, ty] = cent[p];
      const mx = (sx + tx) / 2, my = (sy + ty) / 2;
      const dx = tx - sx, dy = ty - sy, L = Math.hypot(dx, dy) || 1;
      const cx = mx - dy / L * L * 0.16, cy = my + dx / L * L * 0.16;
      return { p, d: `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`,
        stroke: S.dir === 'net' ? dv(v) : sq(Math.abs(v)), w: wsc(Math.abs(v)) };
    });
    return { paths, sx, sy };
  }, [S.view, S.sel, S.dir, S.yi, S.cum, cent]);

  /* county labels: skip counties whose projected bbox can't hold the name */
  const labels = S.labels && drawn && S.view !== 'mx'
    ? ISOS.filter(iso => box[iso][0] > 70 && box[iso][1] > 34)
    : [];
  const labelG = (
    <g>
      {labels.map(iso => (
        <text key={iso} className="clab" x={cent[iso][0]} y={cent[iso][1] + 3}
          textAnchor="middle" fontSize={9} fontFamily="IBM Plex Mono,ui-monospace,monospace"
          fill="#20262B" stroke="#FFFFFF" strokeWidth={2.4} paintOrder="stroke"
          pointerEvents="none">{SHORTN[iso]}</text>
      ))}
    </g>
  );

  /* .map-box is what the ResizeObserver measures and what map-anchored overlays
     (legend, story bar, pair/JLS cards) position against. The detail card and the
     citizenship/age panels live outside it so that on mobile they can sit above
     and below the map in normal flow instead of covering it; on desktop they go
     back to absolute and anchor to .map-wrap, which is the same box. */
  return (
    <div className="map-wrap">
      <DetailCard S={S} setS={setS} />
      <div className="map-box" ref={wrapRef}>
      {S.view === 'mx' ? (
        <MatrixView S={S} setS={setS} size={size} legend={legend} zoom={zoom} />
      ) : S.view === 'jmap' ? (
        <svg id="map" role="img" aria-label="Karta gradova i općina — unutarnja migracija 2018."
          {...zoom.bind} style={zoom.style}>
          <g transform={zt}>
          <g>
            {drawn && (() => {
              const { scale } = jmapScale(S.dir);
              return JGEO.features.map((f, ix) => {
                const p = f.properties;
                const v = jlsVal(p, S.dir);
                return (
                  <path key={p.j} className={'jl' + (S.jlsHl === p.j ? ' hl' : '')} data-j={p.j}
                    d={jds[ix]} fill={scale(S.dir === 'net' ? v : Math.abs(v))}
                    onPointerEnter={() => setS({ jlsHl: p.j })}
                    /* touch sends leave the moment the finger lifts, which would
                       flash the readout away; keep it until the next tap instead */
                    onPointerLeave={() => { if (!COARSE) setS({ jlsHl: null }); }}
                    onPointerMove={moveTip} />
                );
              });
            })()}
          </g>
          <g>
            {drawn && ISOS.map(iso => <path key={iso} className="jbord" d={cds[iso]} />)}
          </g>
          {labelG}
          </g>
        </svg>
      ) : (
        <svg id="map" role="img" aria-label="Karta županija Hrvatske"
          {...zoom.bind} style={zoom.style}>
          <g transform={zt}>
          <g>
            {drawn && GEO.features.map(f => {
              const iso = f.properties.shapeISO;
              return (
                <path key={iso} className={'cnt' + (iso === S.hl ? ' hl' : '') + (iso === S.sel ? ' sel' : '')}
                  data-iso={iso} d={cds[iso]} fill={fill(iso)} tabIndex={0} aria-label={D[iso].n}
                  onPointerEnter={() => setHL(iso)} onPointerLeave={() => setHL(null)}
                  onPointerMove={moveTip} onClick={() => selectCounty(iso)}
                  onFocus={() => setHL(iso)} onBlur={() => setHL(null)}
                  onKeyDown={e => { if (e.key === 'Enter') selectCounty(iso); }} />
              );
            })}
          </g>
          <g>
            {drawn && rds.map((d, i) => (
              <path key={i} className="regline" d={d} style={{ display: S.view === 'reg' ? undefined : 'none' }} />
            ))}
          </g>
          <g>
            {arcs && arcs.paths.map(a => (
              <path key={a.p} className="arc" d={a.d} stroke={a.stroke} strokeWidth={a.w}
                strokeDasharray={est ? '7 4' : undefined} />
            ))}
            {arcs && <circle cx={arcs.sx} cy={arcs.sy} r={4.5} fill="var(--ink)" stroke="#fff" strokeWidth={1.5} />}
          </g>
          {labelG}
          </g>
        </svg>
      )}
      {S.view !== 'mx' && (
        <button className={'labbtn' + (S.labels ? ' on' : '')} id="labBtn" aria-pressed={S.labels}
          onClick={() => setS({ labels: !S.labels })}>Aa oznake</button>
      )}
      {zoom.zoomed && (
        <button className="zoomrst" id="zoomRst" onClick={zoom.reset}
          title="Vrati prikaz" aria-label="Vrati zumiranje na početno">
          ⤢ {Math.round(zoom.t.k * 10) / 10}×
        </button>
      )}
      <Legend S={S} />
      <PairCard S={S} setS={setS} />
      <JlsCard S={S} setS={setS} toggleJls={toggleJls} />
      <StoryBar S={S} setS={setS} />
      </div>
      <CitzPanel S={S} setS={setS} toggleCitz={toggleCitz} />
      <AgePanel S={S} setS={setS} toggleAge={toggleAge} />
    </div>
  );
}
