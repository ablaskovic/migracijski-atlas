import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear, type ScaleLinear } from 'd3-scale';
import { area, line, curveMonotoneX } from 'd3-shape';
import { max } from 'd3-array';
import { YEARS, Y0, YEND, natExt, natVol, flowBadge } from '../lib/metrics.ts';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { State } from '../lib/types.ts';

export default function Scrubber({ S, setYi, togglePlay }: {
  S: State; setYi: (yi: number) => void; togglePlay: () => void;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [sw, setSw] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(es => setSw(es[0].contentRect.width));
    ro.observe(chartRef.current!);
    return () => ro.disconnect();
  }, []);

  /* Collapsing is presentation-only, so it stays local rather than entering S
     (it must not land in the permalink). The body class lets the layout reserve
     the right amount of space under the fixed bar — same escape hatch App uses
     for panel-open/story-open. */
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    document.body.classList.toggle('scrub-collapsed', collapsed);
    return () => document.body.classList.remove('scrub-collapsed');
  }, [collapsed]);

  const sh = 96, mL = 6, mR = 6, mT = 14, mB = 16;
  const { x, sy, dExt, dVol } = useMemo<{
    x?: ScaleLinear<number, number>; sy?: ScaleLinear<number, number>; dExt?: string; dVol?: string;
  }>(() => {
    if (!sw) return {};
    const x = scaleLinear().domain([Y0, YEND]).range([mL, sw - mR]);
    const mE = max(natExt, v => Math.abs(v))!;
    const sy = scaleLinear().domain([-mE, mE]).range([sh - mB, mT]);
    const syv = scaleLinear().domain([0, max(natVol)! * 1.15]).range([sh - mB, mT]);
    const dExt = area<number>().x((_, i) => x(YEARS[i])).y0(sy(0)).y1(v => sy(v)).curve(curveMonotoneX)(natExt)!;
    const dVol = line<number>().x((_, i) => x(YEARS[i])).y(v => syv(v)).curve(curveMonotoneX)(natVol)!;
    return { x, sy, dExt, dVol };
  }, [sw]);

  const scrubTo = (ev: ReactPointerEvent<SVGSVGElement>) => {
    if (!x) return;
    const rect = chartRef.current!.querySelector('svg')!.getBoundingClientRect();
    let y = Math.round(x.invert(ev.clientX - rect.left));
    y = Math.max(S.cum || S.view === 'klas' ? 2011 : Y0, Math.min(YEND, y));
    const yi = YEARS.indexOf(y);
    if (yi !== S.yi) setYi(yi);
  };
  const drag = useRef(false);
  const onDown = (ev: ReactPointerEvent<SVGSVGElement>) => { drag.current = true; ev.currentTarget.setPointerCapture(ev.pointerId); scrubTo(ev); };
  const onMove = (ev: ReactPointerEvent<SVGSVGElement>) => { if (drag.current) scrubTo(ev); };
  const onUp = () => { drag.current = false; };

  /* Tick labels are ~28 px wide (mono 9). The 2013/2015 pair sits 2 years apart,
     so below ~470 px of chart they collide — thin the set instead of overlapping. */
  const ticks = sw >= 470 ? [2000, 2005, 2010, 2013, 2015, 2020, YEND]
    : sw >= 200 ? [2000, 2010, 2020, YEND]
    : [2000, YEND];
  const cap = sw >= 380
    ? 'RH · vanjski saldo (površina) · preseljeni među županijama (crtkano)'
    : 'RH · vanjski saldo · preseljeni';

  const yr = YEARS[S.yi];
  const sub = S.view === 'jmap' ? 'JLS · samo 2018. · izmjereno'
    : S.view === 'flow' || S.view === 'mx'
    ? 'tokovi · ' + (S.cum ? 'kumulativna procjena' : flowBadge(S.yi, S.cum))
    : (S.view === 'klas' || S.cum ? '2011.–' + yr + '.' : 'godišnje');

  return (
    <div className={'scrub' + (S.view === 'jmap' ? ' inert' : '') + (collapsed ? ' collapsed' : '')} id="scrubBox">
      {/* mobile-only handle: the bar is pinned to the bottom there, so it needs a
          way to give the map its space back. Play + year stay visible collapsed. */}
      <button className="scrub-tog" id="scrubTog" aria-expanded={!collapsed}
        aria-controls="spark" title={collapsed ? 'Prikaži vremensku traku' : 'Sakrij vremensku traku'}
        aria-label={collapsed ? 'Prikaži vremensku traku' : 'Sakrij vremensku traku'}
        onClick={() => setCollapsed(c => !c)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={collapsed ? 'M7 14l5-5 5 5z' : 'M7 10l5 5 5-5z'} /></svg>
      </button>
      <button className="play" id="play" aria-label="Reprodukcija kroz godine" onClick={togglePlay}>
        <svg viewBox="0 0 24 24" id="playIco">
          <path d={S.playing ? 'M6 5h4v14H6zm8 0h4v14h-4z' : 'M8 5v14l11-7z'} />
        </svg>
      </button>
      <div className="scrub-chart" ref={chartRef}>
        <svg id="spark" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
          {x && (
            <g>
              <defs>
                <pattern id="hatch" width={5} height={5} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                  <line y2={5} stroke="#c8cdc6" strokeWidth={1} />
                </pattern>
                <clipPath id="spkp"><rect width={sw} height={sy!(0)} /></clipPath>
                <clipPath id="spkn"><rect y={sy!(0)} width={sw} height={sh - sy!(0)} /></clipPath>
              </defs>
              <rect id="preShade" x={x(Y0)} y={mT - 6} width={Math.max(0, x(2011) - x(Y0))} height={sh - mB - mT + 12}
                fill="url(#hatch)" opacity={S.cum || S.view === 'klas' ? 0.55 : 0} />
              <path d={dExt} fill="#1D4E89" opacity={0.55} clipPath="url(#spkp)" />
              <path d={dExt} fill="#B5341F" opacity={0.55} clipPath="url(#spkn)" />
              <line x1={x(Y0)} x2={x(YEND)} y1={sy!(0)} y2={sy!(0)} stroke="var(--line)" />
              <path d={dVol} fill="none" stroke="#8d968f" strokeWidth={1} strokeDasharray="2 3" />
              <text x={x(1999)} y={mT - 3} fontSize={8.5} fontFamily="var(--mono)" fill="var(--mut)">
                {cap}
              </text>
              {ticks.map(t => (
                <text key={t} x={x(t)} y={sh - 4} textAnchor={t === YEND ? 'end' : 'middle'}
                  fontSize={9} fontFamily="var(--mono)" fill="var(--mut)">{t}.</text>
              ))}
              <line x1={x(2013)} x2={x(2013)} y1={mT} y2={sh - mB} stroke="#8d968f" strokeWidth={0.7} strokeDasharray="1 3" />
              <text x={x(2013) + 3} y={mT + 7} fontSize={8} fontFamily="var(--mono)" fill="var(--mut)">EU</text>
              <circle id="realMark" cx={x(2018)} cy={sh - mB} r={3} fill="none" stroke="var(--acc)" strokeWidth={1.5}
                style={{ display: S.view === 'flow' ? undefined : 'none' }} />
              <line id="cur" x1={x(yr)} x2={x(yr)} y1={mT - 6} y2={sh - mB + 6} stroke="var(--acc)" strokeWidth={2} />
              <circle id="curDot" cx={x(yr)} cy={sy!(natExt[S.yi])} r={3.5} fill="var(--acc)" />
            </g>
          )}
        </svg>
      </div>
      <div className="big-year">
        <div className="big-year-n" id="bigYear">{yr}.</div>
        <div className="big-year-s" id="bigYearSub">{sub}</div>
      </div>
    </div>
  );
}
