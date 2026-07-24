import { useEffect, useMemo, useRef, useState } from 'react';
import { geoConicEqualArea, geoPath } from 'd3-geo';
import { scaleSqrt } from 'd3-scale';
import {
  GEO, REGGEO, ISOS, D, DOM, RDOM, REGOF,
  val, regVal, klasOf, KCOL, divScale, seqScale, flowOf, flowMax,
} from '../lib/metrics.ts';
import Legend from './Legend.tsx';
import DetailCard from './DetailCard.tsx';
import JlsCard from './JlsCard.tsx';
import CitzPanel from './CitzPanel.tsx';
import { moveTip } from '../lib/tip.ts';
import type { Patch, State } from '../lib/types.ts';

export default function MapView({ S, setS, selectCounty, setHL, toggleCitz, toggleJls }: {
  S: State; setS: (p: Patch) => void; selectCounty: (iso: string) => void;
  setHL: (iso: string | null) => void; toggleCitz: () => void; toggleJls: () => void;
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

  const { drawn, cent, cds, rds } = useMemo(() => {
    if (!size.w || !size.h) {
      return { drawn: false, cent: {} as Record<string, [number, number]>, cds: {} as Record<string, string>, rds: [] as string[] };
    }
    const proj = geoConicEqualArea().parallels([43.2, 46.2]).rotate([-16.4, 0])
      .fitExtent([[16, 10], [size.w - 16, size.h - 10]], GEO);
    const p = geoPath(proj);
    const cent: Record<string, [number, number]> = {}, cds: Record<string, string> = {};
    GEO.features.forEach(f => { const iso = f.properties.shapeISO; cds[iso] = p(f)!; cent[iso] = p.centroid(f); });
    const rds = REGGEO.features.map(f => p(f)!);
    return { drawn: true, cent, cds, rds };
  }, [size]);

  /* county fill per state — port of update() */
  const fill = (iso: string): string => {
    if (S.view === 'klas') return KCOL[klasOf(iso, S.yi, S.thr)];
    if (S.view === 'reg') return divScale(RDOM[S.flow + S.den + S.cum])(regVal(REGOF[iso], S.yi, S.flow, S.den, S.cum));
    if (S.view === 'flow') {
      if (iso === S.sel) return '#3B4650';
      const m = flowMax(S.sel!, S.dir, S.cum), v = flowOf(S.sel!, S.dir, iso, S.yi, S.cum);
      if (S.dir === 'net') return divScale(m)(v);
      return seqScale(m, S.dir)(Math.abs(v));
    }
    return divScale(DOM[S.flow + S.den + S.cum])(val(iso, S.yi, S.flow, S.den, S.cum));
  };

  /* flow arcs — port of renderArcs() */
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

  return (
    <div className="map-wrap" ref={wrapRef}>
      <svg id="map" role="img" aria-label="Karta županija Hrvatske">
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
            <path key={a.p} className="arc" d={a.d} stroke={a.stroke} strokeWidth={a.w} />
          ))}
          {arcs && <circle cx={arcs.sx} cy={arcs.sy} r={4.5} fill="var(--ink)" stroke="#fff" strokeWidth={1.5} />}
        </g>
      </svg>
      <Legend S={S} />
      <DetailCard S={S} setS={setS} />
      <JlsCard S={S} setS={setS} toggleJls={toggleJls} />
      <CitzPanel S={S} toggleCitz={toggleCitz} />
    </div>
  );
}
