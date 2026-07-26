import { useEffect, useMemo, useRef, useState } from 'react';
import { geoConicEqualArea, geoPath } from 'd3-geo';
import { scaleSqrt } from 'd3-scale';
import {
  GEO, REGGEO, JGEO, ISOS, DOM, RDOM, REGOF, SHORTN,
  val, regVal, klasOf, KCOL, divScale, seqScale, flowOf, flowMax, flowBadge, jlsVal, jmapScale, countyAria, fmtI, sgn,
} from '../lib/metrics.ts';
import Legend from './Legend.tsx';
import DetailCard from './DetailCard.tsx';
import PairCard from './PairCard.tsx';
import JlsCard from './JlsCard.tsx';
import CitzPanel from './CitzPanel.tsx';
import AgePanel from './AgePanel.tsx';
import MatrixView from './MatrixView.tsx';
import HelpPanel from './HelpPanel.tsx';
import StoryBar from './StoryBar.tsx';
import { moveTip, COARSE } from '../lib/tip.ts';
import { useZoom } from '../lib/useZoom.ts';
import type { Patch, State } from '../lib/types.ts';

export default function MapView({ S, setS, selectCounty, setHL, resetSeq, toggleCitz, toggleJls, toggleAge, toggleHelp }: {
  S: State; setS: (p: Patch) => void; selectCounty: (iso: string) => void;
  setHL: (iso: string | null) => void; resetSeq: number; toggleCitz: () => void; toggleJls: () => void;
  toggleAge: () => void; toggleHelp: () => void;
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

  /* roving tabindex over the 556 municipalities — see the .jl paths below */
  const [jf, setJf] = useState(0);
  const jNav = useRef(false);
  const jgRef = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!jNav.current) return;
    jNav.current = false;
    jgRef.current?.querySelector<SVGPathElement>('.jl[tabindex="0"]')?.focus();
  }, [jf]);

  /* wheel/pinch zoom + drag pan; identity by default so nothing else shifts */
  const zoom = useZoom(size.w, size.h);
  const zt = `translate(${zoom.t.x},${zoom.t.y}) scale(${zoom.t.k})`;
  /* a view change re-fits the content, so a leftover transform would be wrong;
     resetSeq is the ⟲ button, which owns the same "back to how it started" */
  const resetZoom = zoom.reset;
  useEffect(() => { resetZoom(); }, [S.view, resetSeq, resetZoom]);

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

  /* Same argument as the legend, for the chip panels: they float bottom-right
     over the map box and can be open in any view, so in the matrix they would
     sit on top of live corridors. Measured on the dock rather than the open
     panel, so the collapsed sibling chip stacked above it is inside the box the
     grid steers around. Only when the dock actually overlays (on mobile it drops
     into normal flow below the map and covers nothing). */
  const [panel, setPanel] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapRef.current?.parentElement?.querySelector<HTMLElement>('.chipdock');
    if (!el || !el.querySelector('.citz.open,.agec.open')
      || getComputedStyle(el).position !== 'absolute') { setPanel({ w: 0, h: 0 }); return; }
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setPanel(p => (p.w === r.width && p.h === r.height ? p : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [S.citz, S.age, S.citzTab, S.ageTab, S.view, size.w]);

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
      const w = wsc(Math.abs(v));
      /* Every arc is drawn hub→partner whatever the direction, so colour was the
         only thing saying which way people actually moved — a blue "dolasci"
         arc reads as hub→partner and means the opposite. Put a head on the
         receiving end: partner for odlasci, hub for dolasci, sign for neto. */
      const toHub = S.dir === 'in' || (S.dir === 'net' && v > 0);
      const [px, py] = toHub ? [sx, sy] : [tx, ty];
      let ax = px - cx, ay = py - cy;
      const aL = Math.hypot(ax, ay) || 1;
      ax /= aL; ay /= aL;
      const back = toHub ? 5.5 : 1.5;          /* clear the hub dot (r 4.5) */
      const tipX = px - ax * back, tipY = py - ay * back;
      const len = Math.max(5, w * 1.9), hw = Math.max(2.4, w * 0.85);
      const bx = tipX - ax * len, by = tipY - ay * len;
      const head = `M${tipX},${tipY} L${bx - ay * hw},${by + ax * hw} L${bx + ay * hw},${by - ax * hw} Z`;
      return { p, d: `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`,
        stroke: S.dir === 'net' ? dv(v) : sq(Math.abs(v)), w, head };
    });
    return { paths, sx, sy };
  }, [S.view, S.sel, S.dir, S.yi, S.cum, cent]);

  /* county labels: skip counties whose projected bbox can't hold the name.
     The test is against the *zoomed* size, so zooming into a small county now
     reveals its name; type is counter-scaled so it stays 9 px on screen at any
     k instead of growing to 72 px with its halo. */
  const k = zoom.t.k;
  const labels = S.labels && drawn && S.view !== 'mx'
    ? ISOS.filter(iso => box[iso][0] * k > 70 && box[iso][1] * k > 34)
    : [];
  const labelG = (
    <g>
      {labels.map(iso => (
        <text key={iso} className="clab" x={cent[iso][0]} y={cent[iso][1] + 3 / k}
          textAnchor="middle" fontSize={9 / k} fontFamily="IBM Plex Mono,ui-monospace,monospace"
          fill="#20262B" stroke="#FFFFFF" strokeWidth={2.4 / k} paintOrder="stroke"
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
      {/* outside .map-box on purpose: at ≤900 it leaves the overlay layer and
          sits in normal flow above the map, like the detail card. Floating, it
          is a 232 px panel over a 439 px map that collides with both the JLS
          chip and the legend. Desktop is unaffected — .map-wrap and .map-box
          are the same box, so absolute positioning resolves identically. */}
      <PairCard S={S} setS={setS} />
      <div className="map-box" ref={wrapRef}>
      {S.view === 'mx' ? (
        <MatrixView S={S} setS={setS} size={size} legend={legend} panel={panel} zoom={zoom} />
      ) : S.view === 'jmap' ? (
        /* role=img would declare this a single leaf graphic and hide the
           focusable features inside it from assistive tech */
        <svg id="map" role="group" aria-label="Karta gradova i općina — unutarnja migracija 2018. Strelice pomiču odabir."
          {...zoom.bind} style={zoom.style}>
          <g transform={zt}>
          <g ref={jgRef}>
            {drawn && (() => {
              const { scale } = jmapScale(S.dir);
              return JGEO.features.map((f, ix) => {
                const p = f.properties;
                const v = jlsVal(p, S.dir);
                return (
                  <path key={p.j} className={'jl' + (S.jlsHl === p.j ? ' hl' : '')} data-j={p.j}
                    d={jds[ix]} fill={scale(S.dir === 'net' ? v : Math.abs(v))}
                    /* the per-JLS numbers lived only in a hover tooltip, so the
                       whole view was unreachable without a pointer. One tab stop
                       in, arrows walk the features (grouped by county). */
                    tabIndex={ix === jf ? 0 : -1}
                    aria-label={`${p.n}, ${SHORTN[ISOS[p.c]]}: doseljeno ${fmtI.format(p.i)}, odseljeno ${fmtI.format(p.o)}, neto ${sgn(p.i - p.o, fmtI)}`}
                    onPointerEnter={() => setS({ jlsHl: p.j })}
                    /* touch sends leave the moment the finger lifts, which would
                       flash the readout away; keep it until the next tap instead */
                    onPointerLeave={() => { if (!COARSE) setS({ jlsHl: null }); }}
                    onPointerMove={moveTip}
                    onFocus={e => {
                      setS({ jlsHl: p.j });
                      const r = e.currentTarget.getBoundingClientRect();
                      moveTip({ clientX: r.right, clientY: r.bottom });
                    }}
                    onBlur={() => { if (!COARSE) setS({ jlsHl: null }); }}
                    onKeyDown={e => {
                      const d: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
                      if (!d[e.key]) return;
                      e.preventDefault(); e.stopPropagation();
                      jNav.current = true;
                      setJf(x => Math.max(0, Math.min(JGEO.features.length - 1, x + d[e.key])));
                    }} />
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
        <svg id="map" role="group" aria-label="Karta županija Hrvatske"
          {...zoom.bind} style={zoom.style}>
          <g transform={zt}>
          <g>
            {drawn && GEO.features.map(f => {
              const iso = f.properties.shapeISO;
              return (
                <path key={iso} className={'cnt' + (iso === S.hl ? ' hl' : '') + (iso === S.sel ? ' sel' : '')
                  + (S.view === 'reg' && S.regHl && REGOF[iso] === S.regHl ? ' rhl' : '')}
                  data-iso={iso} d={cds[iso]} fill={fill(iso)} tabIndex={0} aria-label={countyAria(S, iso)}
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
            {arcs && arcs.paths.map(a => (
              <path key={'h' + a.p} className="arch" d={a.head} fill={a.stroke} />
            ))}
            {arcs && <circle cx={arcs.sx} cy={arcs.sy} r={4.5} fill="var(--ink)" stroke="#fff" strokeWidth={1.5} />}
          </g>
          {labelG}
          </g>
        </svg>
      )}
      <button className={'helpbtn' + (S.help ? ' on' : '')} id="helpBtn" aria-pressed={S.help}
        title="Kako čitati atlas" aria-label="Kako čitati atlas" onClick={toggleHelp}>?</button>
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
      <JlsCard S={S} setS={setS} toggleJls={toggleJls} />
      <HelpPanel S={S} setS={setS} />
      </div>
      {/* Outside .map-box on purpose. Floated bottom-centre the caption shared
          the map's bottom edge with the legend (left) and the chip dock (right),
          and won on z-index: the "Dob i spol" chip was unclickable at every
          desktop width from 1200 to 1600. In flow it collides with nothing. */}
      <StoryBar S={S} setS={setS} />
      {/* One dock, not two bottom-right anchors. Side by side the pair spanned
          656 px of the map's bottom edge and ran into the legend below ~1150 px
          and under the detail card below ~1100. Stacked, the dock is one panel
          wide at every width and the two can never overlap each other. */}
      <div className="chipdock">
        <AgePanel S={S} setS={setS} toggleAge={toggleAge} />
        <CitzPanel S={S} setS={setS} toggleCitz={toggleCitz} />
      </div>
    </div>
  );
}
