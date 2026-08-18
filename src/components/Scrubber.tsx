import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear, type ScaleLinear } from 'd3-scale';
import { area, line, curveMonotoneX } from 'd3-shape';
import { max } from 'd3-array';
import { YEARS, Y0, YEND, natExt, natVol, flowBadge } from '../lib/metrics.ts';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { L, t, yr as yrL, yrSpan } from '../lib/i18n.ts';
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
     for panel-open. */
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
  const onDown = (ev: ReactPointerEvent<SVGSVGElement>) => {
    drag.current = true;
    /* throws NotFoundError if the pointer is already gone by the time we run
       (synthetic events, some assistive tech) — capture is an optimisation for
       the drag, not a precondition for scrubbing */
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* no capture, still scrubs */ }
    scrubTo(ev);
  };
  const onMove = (ev: ReactPointerEvent<SVGSVGElement>) => { if (drag.current) scrubTo(ev); };
  /* pointercancel fires when the browser claims the gesture as a page scroll —
     without it the drag flag sticks and the next hover scrubs the year */
  const onUp = () => { drag.current = false; };

  /* Tick labels are ~28 px wide (mono 9). The 2013/2015 pair sits 2 years apart,
     so below ~470 px of chart they collide — thin the set instead of overlapping. */
  const ticks = sw >= 470 ? [2000, 2005, 2010, 2013, 2015, 2020, YEND]
    : sw >= 200 ? [2000, 2010, 2020, YEND]
    : [2000, YEND];
  const cap = sw >= 380
    ? L('RH · vanjski saldo (površina) · preseljeni među županijama (crtkano)',
      'Croatia · net external migration (area) · moves between counties (dashed)')
    : L('RH · vanjski saldo · preseljeni', 'Croatia · net external · moves');

  /* The JLS view has one measured year, so the chart is inert there. It used to be
     dimmed with opacity + pointer-events:none — the pattern the house rules ban,
     escaping the letter of the invariant only because tabIndex was already −1.
     The handlers come off instead, and the slider says so: a screen reader met an
     operable-looking role=slider with aria-valuenow="2018" and no way to work it. */
  const inert = S.view === 'jmap';
  const yr = YEARS[S.yi];
  const sub = S.view === 'jmap' ? L('JLS · samo 2018. · izmjereno', 'LAU · 2018 only · measured')
    : S.view === 'flow' || S.view === 'mx'
      ? L('tokovi · ', 'flows · ') + (S.cum ? t('badge.cum') : flowBadge(S.yi, S.cum))
      : (S.view === 'klas' || S.cum ? yrSpan(2011, yr) : L('godišnje', 'annual'));

  /* The app's two primary interactions. Both named themselves in Croatian
     whatever the reader had chosen — the visible `title` as well as the
     accessible name — on the bar that carries the year for every view. */
  const togLab = collapsed ? L('Prikaži vremensku traku', 'Show the timeline')
    : L('Sakrij vremensku traku', 'Hide the timeline');
  const playLab = S.playing ? L('Zaustavi reprodukciju', 'Stop playback')
    : L('Pokreni reprodukciju kroz godine', 'Play through the years');

  return (
    <div className={'scrub' + (inert ? ' inert' : '') + (collapsed ? ' collapsed' : '')} id="scrubBox">
      {/* mobile-only handle: the bar is pinned to the bottom there, so it needs a
          way to give the map its space back. Play + year stay visible collapsed. */}
      <button className="scrub-tog" id="scrubTog" aria-expanded={!collapsed}
        aria-controls="spark" title={togLab} aria-label={togLab}
        onClick={() => setCollapsed(c => !c)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={collapsed ? 'M7 14l5-5 5 5z' : 'M7 10l5 5 5-5z'} /></svg>
      </button>
      {/* `disabled`, not opacity + pointer-events:none — the same lesson the
          segment groups already learned (Header.tsx): dimmed-but-focusable left
          a keyboard user tabbing onto a dead control in the JLS view and
          pressing Enter on nothing. */}
      <button className="play" id="play" aria-pressed={S.playing} disabled={inert} onClick={togglePlay}
        title={playLab} aria-label={playLab}>
        <svg viewBox="0 0 24 24" id="playIco" aria-hidden="true">
          <path d={S.playing ? 'M6 5h4v14H6zm8 0h4v14h-4z' : 'M8 5v14l11-7z'} />
        </svg>
      </button>
      <div className="scrub-chart" ref={chartRef}>
        {/* a real slider: the year is the app's primary control, and it was
            reachable only by dragging with a mouse. Arrow keys are handled
            globally in App, so focus here just makes that discoverable. */}
        <svg id="spark" role="slider" tabIndex={inert ? -1 : 0}
          aria-label={L('Godina prikaza', 'Displayed year')} aria-disabled={inert || undefined}
          aria-valuemin={S.cum || S.view === 'klas' ? 2011 : Y0} aria-valuemax={YEND}
          aria-valuenow={yr} aria-valuetext={yrL(yr)}
          onPointerDown={inert ? undefined : onDown} onPointerMove={inert ? undefined : onMove}
          onPointerUp={inert ? undefined : onUp} onPointerCancel={inert ? undefined : onUp}>
          {x && (
            <g>
              <defs>
                {/* The pre-2011 band marks years the cumulative window does not
                    include, which is a real exclusion and was drawn like a
                    watermark: #c8cdc6 hairlines at 0,55 barely separated from the
                    #F4F5F2 background, with no edge at all where the band ends.
                    Darker, slightly thicker, and far more opaque — see #preShade
                    and the boundary rule at 2011 below. */}
                <pattern id="hatch" width={5} height={5} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                  <line y2={5} stroke="#aab2a9" strokeWidth={1.3} />
                </pattern>
                <clipPath id="spkp"><rect width={sw} height={sy!(0)} /></clipPath>
                <clipPath id="spkn"><rect y={sy!(0)} width={sw} height={sh - sy!(0)} /></clipPath>
              </defs>
              {/* Top starts at mT, not mT−6: the caption sits at mT−3 and at the
                  old height the band ran straight under it. Measured, the caption
                  is #5F6A72 on the #aab2a9 hatch = 2,55:1 wherever a line crosses
                  a glyph — fine as texture at 0,55, not fine at 0,9. Dropping the
                  top 6 px clears the text and costs the band nothing that reads. */}
              <rect id="preShade" x={x(Y0)} y={mT} width={Math.max(0, x(2011) - x(Y0))} height={sh - mB - mT + 6}
                fill="url(#hatch)" opacity={S.cum || S.view === 'klas' ? 0.9 : 0} />
              <path d={dExt} fill="#1D4E89" opacity={0.55} clipPath="url(#spkp)" />
              <path d={dExt} fill="#B5341F" opacity={0.55} clipPath="url(#spkn)" />
              <line x1={x(Y0)} x2={x(YEND)} y1={sy!(0)} y2={sy!(0)} stroke="var(--line)" />
              <path d={dVol} fill="none" stroke="#8d968f" strokeWidth={1} strokeDasharray="2 3" />
              <text x={x(1999)} y={mT - 3} fontSize={8.5} fontFamily="var(--mono)" fill="var(--mut)">
                {cap}
              </text>
              {/* the arrow/space shortcuts existed but nothing said so */}
              {sw >= 560 && (
                <text id="kbdHint" x={x(YEND)} y={mT - 3} textAnchor="end" fontSize={8.5}
                  fontFamily="var(--mono)" fill="var(--mut)">{L('← → godina · razmaknica reprodukcija', '← → year · space plays')}</text>
              )}
              {ticks.map(t => (
                <text key={t} x={x(t)} y={sh - 4} textAnchor={t === YEND ? 'end' : 'middle'}
                  fontSize={9} fontFamily="var(--mono)" fill="var(--mut)">{yrL(t)}</text>
              ))}
              {/* Where the band ends. Drawn after the data, like the EU rule, so
                  it is not half-hidden behind the two filled areas — a shaded
                  region whose edge you cannot see reads as a gradient in the
                  background rather than as a boundary. Solid, to stay distinct
                  from the dotted EU marker three years to its right. */}
              {(S.cum || S.view === 'klas') && (
                <line id="preEdge" x1={x(2011)} x2={x(2011)} y1={mT} y2={sh - mB + 6}
                  stroke="#8d968f" strokeWidth={1} />
              )}
              <line x1={x(2013)} x2={x(2013)} y1={mT} y2={sh - mB} stroke="#8d968f" strokeWidth={0.7} strokeDasharray="1 3" />
              <text x={x(2013) + 3} y={mT + 7} fontSize={8} fontFamily="var(--mono)" fill="var(--mut)">EU</text>
              {/* Matrica is anchored on the same measured 2018 matrix as Tokovi,
                  so it gets the same "this is the measured year" marker. */}
              <circle id="realMark" cx={x(2018)} cy={sh - mB} r={3} fill="none" stroke="var(--acc)" strokeWidth={1.5}
                style={{ display: S.view === 'flow' || S.view === 'mx' ? undefined : 'none' }} />
              <line id="cur" x1={x(yr)} x2={x(yr)} y1={mT - 6} y2={sh - mB + 6} stroke="var(--acc)" strokeWidth={2} />
              <circle id="curDot" cx={x(yr)} cy={sy!(natExt[S.yi])} r={3.5} fill="var(--acc)" />
            </g>
          )}
        </svg>
      </div>
      <div className="big-year">
        {/* yrL(), not `{yr}.` — the trailing dot is a Croatian ordinal and reads as
            a full stop in English */}
        <div className="big-year-n" id="bigYear">{yrL(yr)}</div>
        <div className="big-year-s" id="bigYearSub">{sub}</div>
      </div>
    </div>
  );
}
