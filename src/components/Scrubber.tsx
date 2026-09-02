import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear, type ScaleLinear } from 'd3-scale';
import { area, line, curveMonotoneX } from 'd3-shape';
import { max } from 'd3-array';
import { YEARS, Y0, YEND, natExt, natVol, flowBadge } from '../lib/metrics.ts';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { L, t, yr as yrL, yrSpan } from '../lib/i18n.ts';
import type { State } from '../lib/types.ts';

export default function Scrubber({ S, setYi, togglePlay }: {
  S: State; setYi: (yi: number, stop?: boolean) => void; togglePlay: () => void;
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
    /* …and the film stops, because the reader just took the year themselves.
       Without it the interval kept advancing under the finger and the drag
       fought the film: measured, press play at 2000 and then press the chart
       at its midpoint — the year jumps to 2012 with #play still
       aria-pressed=true, and 1,5 s later, button still held, #bigYear reads
       2014. App stops playback when a corridor opens, on the grounds that
       "every other route stops playback"; the primary control did not.
       Only the POINTER path: the arrow keys step the year by design and are
       how a reader nudges a running film, which is why they go through the
       window handler and not through here. */
    if (yi !== S.yi) setYi(yi, true);
  };
  /* WHICH pointer owns the drag, not merely that one does — the lesson useZoom
     records for its own pinch ("Identity is what a gesture is") and this never
     learned. A shared boolean meant every pointer scrubbed and any pointerup
     killed all of them. Measured at 390×844 with two real touch handles: the
     SECOND touchStart alone jumped the year 2003 → 2020, and the following
     frames alternated between the two fingers — 2004 2019 2005 2018 2006 2017
     2007 2016 2008 2015 2009 2014 2010 2013, fourteen year changes and fourteen
     history writes in ~270 ms, ending on whichever finger moved last. Lifting
     one finger then killed the survivor: dragging it 40 % of the bar left the
     year at 2013. And a pinch straddling the map and the pinned bar became a
     year change — the map stayed at scale(1) while the year went 2018 → 2024. */
  const drag = useRef<number | null>(null);
  /* …and on a touch pointer the first scrub waits for movement. #spark is 96 px
     tall at the bottom of a 390×844 phone, under the thumb, with
     touch-action:none — so a finger placed at (94,817) to swipe the page up
     changed the year from 2016 to 2002 on touch-down alone, and the 90 px swipe
     that followed left scrollY exactly where it was. The most ordinary gesture
     on a phone was swallowed by the timeline and rewrote the app's primary
     state. The same DEAD-px idea useZoom takes, so a press is still a press —
     paired with touch-action:pan-y in the stylesheet, which lets the browser
     claim a near-vertical drag and send the pointercancel onUp already
     handles. */
  const DEAD_X = 4;
  const pending = useRef<number | null>(null);
  const onDown = (ev: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.current !== null) return;   /* a second finger is not a scrub */
    /* …and neither is a right- or middle-click. useZoom filters exactly this for
       the map — "a right-button drag moved the map, so the context menu opened
       over a map that had shifted under it" — and the scrubber, which is the
       app's primary control, did not: measured at 1440×900 in
       #v=saldo&c=1&y=2024, a right-button press at 30 % of the chart took
       #bigYear from 2024. to 2011. and opened the context menu over a rewritten
       permalink. isPrimary covers the second finger the line above already
       guards, and a pen's barrel button with it. */
    if (!ev.isPrimary || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    drag.current = ev.pointerId;
    /* throws NotFoundError if the pointer is already gone by the time we run
       (synthetic events, some assistive tech) — capture is an optimisation for
       the drag, not a precondition for scrubbing */
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* no capture, still scrubs */ }
    if (ev.pointerType === 'touch') { pending.current = ev.clientX; return; }
    pending.current = null;
    scrubTo(ev);
  };
  /* Self-correcting, because the flag is cleared only by a pointerup ON the svg —
     and a drag can end anywhere else: the browser claiming the gesture, a
     pointercancel the element never sees, an alt-tab, a button released outside
     the chart. The flag then stayed true and the NEXT pointermove over the chart
     scrubbed the year with no button held. `ev.buttons` is the authority on
     whether anything is still pressed, and it costs one test per move. */
  const onMove = (ev: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.current !== ev.pointerId) return;
    if (ev.pointerType === 'mouse' && !ev.buttons) { drag.current = null; return; }
    if (pending.current !== null) {
      if (Math.abs(ev.clientX - pending.current) < DEAD_X) return;
      pending.current = null;
    }
    scrubTo(ev);
  };
  /* pointercancel fires when the browser claims the gesture as a page scroll —
     without it the drag flag sticks and the next hover scrubs the year */
  const onUp = (ev: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.current !== ev.pointerId) return;   /* the other finger's lift is not this drag's end */
    drag.current = null;
    pending.current = null;
  };

  /* Tick labels are ~28 px wide (mono 9). The 2013/2015 pair sits 2 years apart,
     so below ~470 px of chart they collide — thin the set instead of overlapping.
     The 200 px floor below it was reasoned about that same pair and is wrong for
     the one the four-tick tier actually ends on: 2020 and YEND are five years
     apart and YEND is end-anchored, so the two Croatian labels — 27 px with the
     ordinal dot — need x(YEND) − x(2020) >= 42 px, i.e. 239 px of chart.
     Measured in Croatian: at a 320 px viewport the chart is 202 px and "2020."
     [187,3–214,3] overlaps "2025." [209–236] by 5,3 px; at 344 px by 0,9 px;
     clear from 360. English has no ordinal dot (22 px) and never overlapped,
     which is why this survived. The scrubber is the fixed bottom bar on a
     phone, so it is on screen in every view. */
  /* Every threshold below compares the chart's WIDTH against a number calibrated
     for label type at the reference root size. Now that the labels are rem — so
     that a reader who raises the browser's font size gets bigger tick years and
     not just bigger prose — the same chart holds proportionally fewer of them,
     and the thresholds have to move with the type. Measured with the labels
     converted and these numbers left alone: at a 24 px root, "2020." met
     "2025." again at 390 px and the caption ran outside the chart at 560.
     `su` is the width in units of the reference type, so every number here goes
     on meaning what it measured. */
  const rootPx = typeof getComputedStyle === 'function'
    ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16;
  const su = sw * 16 / rootPx;
  const ticks = su >= 470 ? [2000, 2005, 2010, 2013, 2015, 2020, YEND]
    : su >= 239 ? [2000, 2010, 2020, YEND]
    : [2000, YEND];
  const cap = sw >= 380
    ? L('RH · vanjski saldo (površina) · preseljeni među županijama (crtkano)',
      'Croatia · net external migration (area) · moves between counties (dashed)')
    : L('RH · vanjski saldo · preseljeni', 'Croatia · net external · moves');
  /* The hint and the caption share one line, so the room one needs is the room
     the other does not have. A flat 560 was set against the SHORT caption: the
     long Croatian one is 68 characters, and at a 710 px viewport (chart 566) it
     ends at x=368 while the hint starts at 370 — a 2,1 px gap, so the two mono
     strings read as one sentence; 7,8 px at 716. English is 48 px clear at the
     same width, which is why this survived, and a flat raise would have cost
     English readers a hint they had room for. Both strings are mono at 8,5 px,
     which is the 0,6 em advance this file already measures label widths with
     elsewhere, plus a 16 px gap that keeps them two strings. */
  const kbd = L('← → godina · razmaknica reprodukcija', '← → year · space plays');
  const showKbd = sw >= Math.max(560, (cap.length + kbd.length) * 5.4 + 16);

  /* The JLS view has one measured year, so the chart is inert there. It used to be
     dimmed with opacity + pointer-events:none — the pattern the house rules ban,
     escaping the letter of the invariant only because tabIndex was already −1.
     The handlers come off instead, and the slider says so: a screen reader met an
     operable-looking role=slider with aria-valuenow="2018" and no way to work it.

     The open glossary is the same state wearing a different hat, and it had none
     of this treatment. Above 900 px that dialog is deliberately non-modal, so
     #spark stays reachable — measured, 58 of 67 focusable elements are, and it is
     one of them — keeping tabindex="0", role="slider", aria-valuenow and no
     aria-disabled, while App's window handler returns on `s.help` before it
     reaches either the #spark jump keys or the bare-arrow year step, and the
     slider has no key handler of its own. Measured at 1440×900 from
     `#v=saldo&y=2018&c=0`: press ?, focus #spark, press ArrowRight then End, and
     #bigYear stays "2018." with aria-valuenow unchanged. An operable-looking
     slider on the app's primary control that answers nothing — which is the exact
     defect the note above describes, so it takes the same answer. */
  const inert = S.view === 'jmap' || S.help;
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
              {showKbd && (
                <text id="kbdHint" x={x(YEND)} y={mT - 3} textAnchor="end" fontSize={8.5}
                  fontFamily="var(--mono)" fill="var(--mut)">{kbd}</text>
              )}
              {ticks.map(t => (
                <text key={t} x={x(t)} y={sh - 4} textAnchor={t === YEND ? 'end' : 'middle'}
                  fontSize="0.5625rem" fontFamily="var(--mono)" fill="var(--mut)">{yrL(t)}</text>
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
