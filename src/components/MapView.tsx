import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { geoConicEqualArea, geoPath } from 'd3-geo';
import { scaleSqrt } from 'd3-scale';
import {
  GEO, ISOS, DOM, RDOM, REGOF, SHORTN,
  val, regVal, klasOf, KCOL, divScale, seqScale, flowOf, flowMax, flowKind, jlsVal, jmapScale, countyAria, fmtI, fmtR, sgn,
  ARC_MIN,
} from '../lib/metrics.ts';
import { jlsGeo, regGeo, jlsFailed, regFailed, retryGeo, geoStatus } from '../lib/geoAsync.ts';
import Legend from './Legend.tsx';
import DetailCard from './DetailCard.tsx';
import PairCard from './PairCard.tsx';
import JlsCard from './JlsCard.tsx';
import CitzPanel from './CitzPanel.tsx';
import AgePanel from './AgePanel.tsx';
import MatrixView from './MatrixView.tsx';
import YearsView from './YearsView.tsx';
import HelpPanel from './HelpPanel.tsx';
import StoryBar from './StoryBar.tsx';
import { moveTip, COARSE, TOKENS_COARSE } from '../lib/tip.ts';
import { L } from '../lib/i18n.ts';
import { focusSoon, isKeyFocus } from '../lib/state.ts';
import { offCentre } from '../lib/anchors.ts';
import { useSuspendMapStops } from '../lib/suspendMap.ts';
import { useZoom } from '../lib/useZoom.ts';
import type { Patch, State } from '../lib/types.ts';

export default function MapView({ S, setS, selectCounty, setHL, resetSeq, openCorridor, toggleCitz, toggleJls, toggleAge, toggleHelp }: {
  S: State; setS: (p: Patch) => void; selectCounty: (iso: string) => void;
  setHL: (iso: string | null) => void; resetSeq: number;
  openCorridor: (a: string, b: string) => void;
  toggleCitz: () => void; toggleJls: () => void;
  toggleAge: () => void; toggleHelp: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  /* The STAGE's height as well as the box's. `.map-box` carries min-height:180px
     (288 in the mobile layout), so it can never measure below that — and every
     threshold keyed on it therefore sat under a floor it could not reach:
     `stage-tight` (114 fine / 174 coarse) was unreachable by construction, and
     with it index.css's whole two-row dock rule. Worse, the premise that
     ".map-box is the stage's only in-flow child, so the two are the same box"
     fails exactly where the protection is wanted. Measured at 901×800 with a
     coarse pointer and a corridor card in flow: the stage was 140 px against the
     box's floored 180, the stage-anchored chip dock rose to y=459 into the top
     strip's 445–489 lane, and a real touchscreen tap on the centre of "Dob i
     spol" opened the GLOSSARY — the exact defect stage-tight exists to prevent.
     Both are measured; the shorter one decides. */
  const [stageH, setStageH] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(es => {
      for (const e of es) {
        const r = e.contentRect;
        if (e.target === wrapRef.current) setSize(s => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
        else setStageH(h => (h === r.height ? h : r.height));
      }
    });
    ro.observe(wrapRef.current!);
    const stage = wrapRef.current?.parentElement;
    if (stage) ro.observe(stage);
    return () => ro.disconnect();
  }, []);
  /* what the overlays actually have to fit inside */
  const stageFit = stageH ? Math.min(size.h, stageH) : size.h;

  /* Which feature actually holds focus, kept out of S: presentation only, and
     deliberately separate from `hl` (hover) for the reason v2.0.4 documented.
     It backs the two-tone focus ring — see .focusring in index.css. */
  const [fIso, setFIso] = useState<string | null>(null);
  /* 2.4.11: the detail card and the corridor card are opaque panels over the
     map, and unlike the glossary and the chip panels they are NOT in the
     suspend gate below — deliberately, because suspending all 21 county stops
     on every county selection would be a regression at 1440, where the card
     covers nothing. But at 1000×800 it covers four counties outright:
     #v=saldo&c=1&y=2024&s=HR-18 puts HR-04, HR-18, HR-08 and HR-09 entirely
     behind #card (six more partly), and #v=flow&s=HR-21&pp=HR-01 puts HR-14,
     HR-16, HR-12, HR-10 and HR-11 behind #pair. All 21 keep tabindex 0, so a
     keyboard reader tabs onto a county whose focus ring is drawn inside the
     svg UNDER the card, and Enter selects one they cannot see. Two covered at
     1100, one at 1150, none at 1280 — the same width dependence the glossary's
     own fix was written for.
     2.4.11 allows the obscuring thing to move out of the way, so the card fades
     while a covered county holds focus and comes straight back on blur. */
  const [jFoc, setJFoc] = useState(false);
  /* roving tabindex over the 556 municipalities — see the .jl paths below */
  const [jf, setJf] = useState(0);
  /* whether the last retry press found no network at all — see retryGeo */
  const [offline, setOffline] = useState(false);
  const jNav = useRef(false);
  const jgRef = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!jNav.current) return;
    jNav.current = false;
    /* by position, not by `[tabindex="0"]`: that invariant is the roving stop's
       own bookkeeping and an outside writer can leave a second one behind (see
       the glossary's suspension), after which this focused whichever came first
       in document order rather than the feature the arrow key just reached */
    jgRef.current?.querySelectorAll<SVGPathElement>('.jl')[jf]?.focus();
  }, [jf]);


  /* wheel/pinch zoom + drag pan; identity by default so nothing else shifts */
  /* the glossary is a dialog and owns the keyboard while it is open — see useZoom */
  const zoom = useZoom(size.w, size.h, S.help,
    /* a pinch is not a probe — see useZoom and the two grids' pick() */
    () => setS({ hl: null, pairHl: null, yrHl: null, jlsHl: null }));
  /* …and it has to stay there when the map moves under it. The tip is placed
     once, from the focused feature’s bbox corner, and the same hook adds +, −,
     0 and Shift+arrows on the window — none of which re-placed it. Measured on
     HR-18: placed 20 px from its corner, then + + takes the county to 2,6× and
     the tip stays where it was, 351 px away; two Shift+→ make it 920 px, still
     shown and still describing a county nowhere near it. That is the "one
     county’s numbers anchored over another" failure the placement was written
     for, reached through the keys this same file adds for the same readers.
     Only while the feature really holds focus, so a pointer reader’s tip is
     never moved out from under the pointer. */
  useEffect(() => {
    const el = fIso
      ? wrapRef.current?.querySelector<SVGPathElement>(`.cnt[data-iso="${fIso}"]`)
      : jFoc ? jgRef.current?.querySelectorAll<SVGPathElement>('.jl')[jf] : null;
    if (!el || document.activeElement !== el) return;
    const r = el.getBoundingClientRect();
    moveTip({ clientX: r.right, clientY: r.bottom });
  }, [zoom.t, fIso, jFoc, jf]);
  const [covered, setCovered] = useState(false);
  /* The zoom reset unmounts itself, and only its CLICK path hands focus on. The
     documented keys do the same unmount from useZoom's window handler: with the
     button focused, '0' or '−' back to 1× dropped focus to <body>, so the next
     Tab restarted from the top of the page — the failure focusSoon exists to
     prevent, asserted in this app only for click and Enter activations.
     Guarded on focus having actually fallen: a reset from the mouse, or with
     focus anywhere else, is left alone. */
  const wasZoomed = useRef(zoom.zoomed);
  useEffect(() => {
    const was = wasZoomed.current;
    wasZoomed.current = zoom.zoomed;
    if (was && !zoom.zoomed && document.activeElement === document.body) focusSoon('#labBtn, #helpBtn');
  }, [zoom.zoomed]);
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
  /* …and BEFORE paint, with the first measurement taken synchronously the way
     the panel effect below already takes its own. A passive effect landed the
     box one frame late, which is the other half of the jump: the grid drew once
     from a stale box and then moved. The note above records the precondition a
     layout effect needs — the legend's size depends only on view/dir, never on
     the grid, so there is no measurement loop to fall into. */
  useLayoutEffect(() => {
    const el = wrapRef.current?.querySelector('.legend');
    if (!el) { setLegend({ w: 0, h: 0 }); return; }
    /* …and while we have it: the legend is a scroller nothing could scroll.
       The cap and overflow-y:auto exist for the reader who raised Chrome's
       minimum font size — at 108 px of stage the legend gives instead of the
       controls — and the same rule keeps pointer-events:none, so a wheel over
       it reached svg#map underneath and zoomed the map instead, while no
       tabindex made it reachable from a keyboard in Firefox or Safari. What
       overflows is the bottom of the legend, which is where the honesty note
       lives. So it becomes interactive exactly while it overflows, and goes
       back to being transparent to the pointer the moment it fits — the map
       under it stays clickable in every ordinary state. Measured here because
       this observer already fires on precisely the changes that start or end
       the overflow. */
    const measure = () => {
      const r = el.getBoundingClientRect();
      setLegend(l => (l.w === r.width && l.h === r.height ? l : { w: r.width, h: r.height }));
      const over = el.scrollHeight > el.clientHeight + 1;
      el.classList.toggle('scrolls', over);
      if (over) {
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', L('Legenda — pomaknite za ostatak', 'Legend — scroll for the rest'));
      } else {
        el.removeAttribute('tabindex');
        el.removeAttribute('role');
        el.removeAttribute('aria-label');
      }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
    /* flow/den belong here too: the legend note gains a sentence for
       "mig. + prirodno" and Godine states its own window, so both change the
       measured height the two grid views lay themselves out around. */
  }, [S.view, S.dir, S.cum, S.flow, S.den]);

  /* Same argument as the legend, for the chip panels: they float bottom-right
     over the map box, so over a grid they sit on live data. Measured on the dock
     rather than on the open panel, so the collapsed sibling chip stacked above it
     is inside the box the grid steers around. Only when the dock actually
     overlays (on mobile it drops into normal flow below the map, covering
     nothing).

     It used to require an *open* panel (`.citz.open,.agec.open`) before
     reporting a box at all, which meant the collapsed dock — 247 × 62 px of
     opaque chip headers — was never steered around. Measured at the default
     state, with nothing open: 8 unreachable `.mxc` at 1440 and 24 at 1150, and
     20 / 34 `.yrc` in Godine, every one of them returning `.chipdock` from
     `elementFromPoint`. A collapsed chip is exactly as opaque as an open one;
     "is it open" was never the right question, "does it overlay" is.

     The dock's own rect stopped being the answer to that question. An open
     panel's body is no longer inside it: opening one used to push the header
     stack 354 px up out from under the pointer, so the body was lifted out of
     the flow and anchored above the two headers, which now hold still
     (index.css .chipdock). It is a positioned descendant, so it falls outside
     the dock's border box entirely — measuring that box alone would report a
     58 px strip while ~370 px of opaque panel sat over the grid.
     The union of the header stack and whichever body is open is what the grid
     steers around. Both are anchored to the dock's bottom-right corner, which
     is the corner fitGrid reserves from. */
  const [panel, setPanel] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapRef.current?.parentElement?.querySelector<HTMLElement>('.chipdock');
    if (!el || getComputedStyle(el).position !== 'absolute') { setPanel({ w: 0, h: 0 }); return; }
    const measure = () => {
      const bs = [...el.querySelectorAll<HTMLElement>('.chipcard, .chipcard.open .chip-body')]
        .filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect());
      const w = bs.length ? Math.max(...bs.map(b => b.right)) - Math.min(...bs.map(b => b.left)) : 0;
      const h = bs.length ? Math.max(...bs.map(b => b.bottom)) - Math.min(...bs.map(b => b.top)) : 0;
      setPanel(p => (p.w === w && p.h === h ? p : { w, h }));
    };
    /* the dock's own box no longer changes when a panel opens, so observing it
       alone would never fire — the cards and the floating body are what move */
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.querySelectorAll<HTMLElement>('.chipcard, .chip-body').forEach(c => ro.observe(c));
    measure();
    return () => ro.disconnect();
  }, [S.citz, S.age, S.citzTab, S.ageTab, S.view, size.w]);

  /* Every opaque overlay drawn over the map, not just the glossary. The chip
     panels and the JLS card are the same 296–312 px of solid panel over the same
     live county paths, and neither suspended anything: measured at 1000×800,
     "Državljanstvo" open covers 3 of 21 counties outright, the JLS chip in Tokovi
     covers 6 (the selected hub among them), and a chip panel over the municipal
     map covers 134 of its 556 arrow-navigable features. See lib/suspendMap.ts.
     The chip pair is gated on the dock actually floating — `panel` is already
     measured as {0,0} when it is in normal flow below 900 px, where it covers
     nothing and taking 556 tab stops away would be a regression, not a fix. The
     JLS card floats at every width, and the glossary is suspended at every width
     for the reason its own note gives.
     Called below the projection memo, not here, because its key has to carry
     the moment the map's focusable content EXISTS — see the note at the call. */

  /* Region outlines and the 556 JLS polygons arrive on their own chunks, so the
     projected path cache has to rebuild when they land — hence the identities in
     the dep list. `p(f) || ''` keeps a missing payload from throwing. */
  const JGEO = jlsGeo(), REGGEO = regGeo();
  /* Three memos, not one. The single memo projected the 21 counties AND the 556
     JLS polygons AND the 5 region outlines on every re-run and then threw two of
     the three away, because only one view draws each — and its dep list, correct
     and stable in itself, carried no view term while geoAsync warms both chunks
     on a timer, so `JGEO` is non-null in every view. Every observed resize frame
     paid for all of it: measured at 1440×900 over 40 resize steps, 46,2 ms of
     script per resize with the chunks warmed against 19,7 ms with them blocked —
     ~25 ms a frame of pure waste, capping a window drag at about 21 fps. A Nalaz
     press does it too, since StoryBar is an in-flow sibling of .map-stage and
     mounting it fires the same ResizeObserver. Split, entering Tokovi or the JLS
     map pays a one-off projection at a moment that is already a layout change. */
  /* …and only in a view that draws counties, which is the term this memo did
     not carry while jds and rds beside it both do. Two of the seven views draw
     none: Matrica and Godine put no .cnt in the DOM and receive no projection
     output — they take size, legend, panel and zoom and nothing else. Every
     resize frame there still ran fitExtent over the whole 21-county collection
     plus 21 path, 21 centroid and 21 bounds computations and the offCentre
     re-projection, and discarded all of it: measured at 2,93 ms of d3-geo per
     frame in Matrica, 18 % of a 16,7 ms budget and about three quarters of a
     frame at 4× CPU, for output nothing reads. A window drag fires it, and so
     does pressing a Nalaz, since StoryBar is an in-flow sibling of the stage.
     `drawn` still answers "has the layout measured itself", which is what the
     two grid branches below use it for — it just stops paying for a projection
     to say so. */
  const drawsMap = S.view !== 'mx' && S.view !== 'yrs';
  const { drawn, cent, cds, box, p } = useMemo(() => {
    if (!size.w || !size.h || !drawsMap) {
      return {
        drawn: !!(size.w && size.h), cent: {} as Record<string, [number, number]>,
        cds: {} as Record<string, string>,
        box: {} as Record<string, [number, number]>, p: null as ReturnType<typeof geoPath> | null,
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
    /* …except where that centroid is not in the county it names: Zadarska's is
       in the Zadar channel and Brodsko-posavska's is inside Požeško-slavonska,
       so the label and the Tokovi hub were drawn at sea and on the wrong county
       respectively. lib/anchors.ts explains the correction and why it is a
       lon/lat constant of the geometry rather than of the viewport. */
    for (const [iso, ll] of Object.entries(offCentre())) {
      const q = proj(ll); if (q) cent[iso] = q;
    }
    return { drawn: true, cent, cds, box, p };
  }, [size, drawsMap]);
  /* the same projection as the counties, built only for the view that draws it */
  const jds = useMemo(
    () => (p && JGEO && S.view === 'jmap' ? JGEO.features.map(f => p(f) || '') : [] as string[]),
    [p, JGEO, S.view]);
  const rds = useMemo(
    () => (p && REGGEO && S.view === 'reg' ? REGGEO.features.map(f => p(f) || '') : [] as string[]),
    [p, REGGEO, S.view]);

  /* The suspension, keyed on when the content it suspends exists. `S.view`
     alone was a one-shot: every focusable thing in #map is gated on `drawn`,
     which is false until the ResizeObserver has measured the stage, and the 556
     municipalities additionally on an async chunk — so on a permalink that boots
     with a panel already open the effect ran against an empty #map, snapshotted
     nothing, and never ran again. Measured at 1000×800: `#v=saldo&cz=1` left 5
     of 21 county paths covered by the panel body and all 5 still tabindex="0",
     ring drawn under the panel, Enter still opening their card; `#v=flow&…&jl=1`
     left 10 of 21; `#v=jmap&cz=1` covered 149 municipalities and Tab reached one
     of them. Opening the same panel in-session at the same size left 0 live —
     identical geometry, so only the timing differed, which is what named the
     defect. `drawn` also stands in for the matrix and Godine grids, which mount
     off the same measurement. The restore already writes back only nodes still
     connected and still at −1, so the extra teardown a wider key causes is a
     no-op on the nodes React has replaced. */
  useSuspendMapStops(
    S.help || (S.jls && S.view === 'flow') || ((S.citz || S.age) && panel.h > 0),
    `${S.view}:${drawn ? 1 : 0}:${JGEO ? 1 : 0}`);
  /* The 556 fills and the 556 accessible names, hoisted out of the render.
     Neither depends on hover, and both were rebuilt on every pointer crossing:
     `hl`/`jlsHl` live in the root State, so a single setJlsHl re-renders the whole
     tree and this block re-ran 556 sqrt+Lab scale evaluations plus 1.668
     Intl.NumberFormat.format calls to produce byte-identical output. Measured
     with real mouse moves over 150 distinct features, CDP Performance delta minus
     an idle baseline: 8,61 ms TaskDuration / 5,50 ms ScriptDuration per crossing
     on this view, of which the label rebuild alone benchmarks at 2,09 ms and the
     scale at 0,33 ms — and 46,7 ms per crossing at 4× CPU, three dropped frames
     for every municipality the pointer touches. Keyed on what the values really
     depend on: the payload, the direction and the language. */
  /* `S.lang` rather than `L()` inside the memo: L reads the module mirror that
     `up` moves, which is a data flow the dependency checker cannot see — and the
     dependency is real, since these strings are the reader's language. The two
     branches are exactly what L would pick, and App keeps S.lang and the mirror
     in step synchronously (it sets both in one writer, before the render). */
  /* …and the view term, which the three memos above carry and this one did not.
     The mechanism is stated verbatim one screen up: a dep list "correct and
     stable in itself" but with no view term recomputes everywhere, because
     geoAsync warms both chunks on a timer and JGEO is non-null in every view.
     So the 556 signed-√ Lab evaluations and 556 accessible names — 1.668
     fmtI.format calls — ran in Saldo, Klasifikacija, Regije, Tokovi, Matrica
     and Godine: once per session when the warm lands, and again on every Smjer
     press and every language toggle. A/B measured on dist at 1440×900 in
     Matrica over 24 Smjer presses, geo_jls served against aborted: +3,97 and
     +3,47 ms of script per press across two runs. All of it thrown away — the
     JSX that consumes this is reachable only in jmap. */
  const jlsPaint = useMemo(() => {
    if (!JGEO || S.view !== 'jmap') return null;
    const { scale } = jmapScale(S.dir);
    const hr = S.lang === 'hr';
    return JGEO.features.map(f => {
      const q = f.properties;
      const v = jlsVal(q, S.dir);
      return {
        fill: scale(S.dir === 'net' ? v : Math.abs(v)),
        label: hr
          ? `${q.n}, ${SHORTN[ISOS[q.c]]}: doseljeno ${fmtI.format(q.i)}, odseljeno ${fmtI.format(q.o)}, neto ${sgn(q.i - q.o, fmtI)}`
          : `${q.n}, ${SHORTN[ISOS[q.c]]}: ${fmtI.format(q.i)} in, ${fmtI.format(q.o)} out, net ${sgn(q.i - q.o, fmtI)}`,
      };
    });
  }, [JGEO, S.view, S.dir, S.lang]);

  /* county fill per state — port of update().
     The scale is built once per render, not once per county: `fill` runs 21 times
     and used to construct 21 d3 scales each time, on every hover. */
  const fill = useMemo(() => {
    if (S.view === 'klas') return (iso: string) => KCOL[klasOf(iso, S.yi, S.thr, S.thrRel, S.thrPct)];
    if (S.view === 'reg') {
      const col = divScale(RDOM[S.flow + S.den + S.cum]);
      return (iso: string) => col(regVal(REGOF[iso], S.yi, S.flow, S.den, S.cum));
    }
    if (S.view === 'flow') {
      const m = flowMax(S.sel!, S.dir, S.cum), dv = divScale(m), sq = seqScale(m, S.dir);
      return (iso: string) => {
        if (iso === S.sel) return '#3B4650';
        const v = flowOf(S.sel!, S.dir, iso, S.yi, S.cum);
        return S.dir === 'net' ? dv(v) : sq(Math.abs(v));
      };
    }
    const col = divScale(DOM[S.flow + S.den + S.cum]);
    return (iso: string) => col(val(iso, S.yi, S.flow, S.den, S.cum));
  }, [S.view, S.yi, S.thr, S.thrRel, S.thrPct, S.flow, S.den, S.cum, S.sel, S.dir]);

  /* Everything drawn above the counties is sized in screen pixels and divided by
     k, because everything in this svg is inside the zoom transform: the county
     borders take `vectorEffect="non-scaling-stroke"` and the labels are
     counter-scaled to stay 9 px at any k. The arcs were the exception, and it
     showed — at KMAX the widest arc rendered 13 × 8 = 104 px across, 18 % of the
     default box, with a 198 px arrowhead, over a map whose own borders were
     still hairlines. The county underneath was completely covered and still
     hoverable (.arc is pointer-events:none), so the reader got a tooltip for a
     county they could not see. The hub dot is the same story: r 4,5 is ~72 px
     across at KMAX, exactly where a reader zoomed in to click. */
  const k = zoom.t.k;

  /* flow arcs — port of renderArcs(); estimated years render dashed (honesty
     encoding: only godišnje 2018 is measured) */
  const est = S.cum || flowKind(S.yi, S.cum) !== 'meas';
  const arcs = useMemo(() => {
    if (S.view !== 'flow' || !S.sel || !cent[S.sel]) return null;
    const sel = S.sel;
    const m = flowMax(sel, S.dir, S.cum);
    const wsc = scaleSqrt().domain([0, m]).range([0.6, 13]);
    const dv = divScale(m);
    /* The ramp the county fills and the legend use, not a second one. The low end
       used to be overridden to #D9C9C2, so the same corridor was painted two
       colours: matched back onto the legend bar in Lab, an arc worth 0 read as
       14 % of max, 10 % read as 22 %, 25 % as 35 % and 50 % as 57 % — at m=1000 a
       250-person corridor was drawn as an arc the legend calls ~353 people while
       the county it lands on is filled the colour the legend calls 250. Two
       answers, side by side, to how big the corridor is. The override was
       presumably for legibility, since the pale end of this ramp is the pale end
       of the fill underneath it; that is what the casing below is for. */
    const sq = seqScale(m, S.dir);
    const [sx, sy] = cent[sel];
    const items = ISOS.filter(p => p !== sel)
      .map(p => ({ p, v: flowOf(sel, S.dir, p, S.yi, S.cum) }))
      /* Corridors under five people are not drawn — inherited from the first
         commit and, until now, written down nowhere. It costs more than it
         looks: for Ličko-senjska in the measured year the map draws 10 arcs
         while the rail lists all 20 partners, and in Odlasci the same hub
         drops 6–7 in most years. A reader counting arcs undercounts the
         network, and "no arc" reads as "no flow" where the honest answer is
         a flow of one to four people. The county FILLS still carry those
         values, which is what caps the harm; the legend now says the rest. */
      .filter(d => Math.abs(d.v) >= ARC_MIN)
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
      /* the head is pure geometry, so it is built in user units — screen px / k */
      const back = (toHub ? 5.5 : 1.5) / k;    /* clear the hub dot (r 4.5) */
      const tipX = px - ax * back, tipY = py - ay * back;
      const len = Math.max(5, w * 1.9) / k, hw = Math.max(2.4, w * 0.85) / k;
      const bx = tipX - ax * len, by = tipY - ay * len;
      const head = `M${tipX},${tipY} L${bx - ay * hw},${by + ax * hw} L${bx + ay * hw},${by - ax * hw} Z`;
      return { p, d: `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`,
        stroke: S.dir === 'net' ? dv(v) : sq(Math.abs(v)), w, head };
    });
    return { paths, sx, sy };
  }, [S.view, S.sel, S.dir, S.yi, S.cum, cent, k]);

  /* county labels: skip counties whose projected bbox can't hold the name.
     The test is against the *zoomed* size, so zooming into a small county now
     reveals its name; type is counter-scaled so it stays 9 px on screen at any
     k instead of growing to 72 px with its halo. */
  /* One predicate for the label layer and for the button that toggles it, so the
     two cannot drift apart again. `labelG` is mounted only by the two geometry
     branches below, and Godine renders YearsView instead — which never reads
     S.labels — so in that view the toggle flipped to .on, announced "pressed",
     appended `lb=1` to the shared permalink, and changed nothing on screen. */
  const hasLabels = S.view !== 'mx' && S.view !== 'yrs';
  /* Measure the name that is actually drawn. The gate used to be a constant 70,
     while the text is `SHORTN[iso].length * 9 * 0.6` px wide — IBM Plex Mono
     advances 0,6 em and the type is counter-scaled to 9 px at every k — so one
     number stood in for names from 8 chars ("Zadarska", 43 px) to 17
     ("Virovitičko-podr.", 92 px): 27 px too strict for the shortest and 22 px
     too generous for the longest. Measured, the longest overflowed: at 570×439
     "Bjelovarsko-bil." was 86 px of text in a 71 px county and overlapped
     "Zagrebačka"; at 1200×700 "Virovitičko-podr." overlapped "Bjelovarsko-bil."
     by 18×8 px — two 9 px labels on top of each other over almost their full
     height — and nothing dropped either, because the filter's survivors were
     all drawn unconditionally.
     Halo included: the 2,4 px stroke is painted under the fill on both sides. */
  const nameW = (iso: string) => SHORTN[iso].length * 9 * 0.6 + 4.8;
  const placed: number[][] = [];
  const labels = S.labels && drawn && hasLabels
    ? ISOS.filter(iso => box[iso][0] * k > nameW(iso) && box[iso][1] * k > 20)
      /* …and where two still collide, the bigger county keeps its name: sorting
         by projected area makes the choice deterministic and leaves the label on
         the county with more room to hold it. */
      .sort((a, b) => box[b][0] * box[b][1] - box[a][0] * box[a][1])
      .filter(iso => {
        const w = nameW(iso) / k / 2, h = 11 / k / 2, [cx, cy] = cent[iso];
        const r = [cx - w, cy - h, cx + w, cy + h];
        if (placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) return false;
        placed.push(r); return true;
      })
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
    /* --stageh is the map stage's measured height (.map-box is the stage's only
       in-flow child, so the two are the same box). It used to sit on .chipdock,
       which was the only box that needed it; the corridor card needs the same
       number to know where the dock's top edge is, and it is not inside the
       dock. Set on their common ancestor and inherited by both. */
    /* `stage-short` when the stage cannot hold both a readable top-left panel and
       the legend's 176 px lane; index.css lets the legend yield there. 340 is
       14 (the panel's top offset) + its 140 px floor + 8 of clearance + the
       tallest legend measured (148, the English klas one) + its 12 px offset. */
    /* Unconditionally, including 0. `size.h ? … : undefined` left the property
       UNSET on a zero-measure stage, so every `var(--stageh,600px)` consumer read
       600px — the one value guaranteed to be wrong there. --chipfree then
       resolved to 428px and the citizenship body reserved 377 px inside a 0 px
       stage: measured at 932×430 with a coarse pointer, the panel rendered at
       [328,−180,296,388], so 180 px of it sat above the top of the screen where
       its own overflow-y:auto cannot reach, and the rest landed on the header —
       61.568 px² over .hd, with elementFromPoint at #segDen's centre returning
       #ageHd and at the HR/EN switch returning #citzSvg. 0px reads as 0px now,
       and the floors added for the short-stage case keep it a small panel rather
       than a negative one. */
    /* `stage-tight`: the stage is too short to hold the map's top strip and a
       two-high chip dock at once. The strip runs from top:14 to 14 + --hbw and
       the dock occupies 12 + 2 × --chiph from the bottom, so they collide below
       their sum — 114 px with a fine pointer, 174 px with a coarse one, where
       both tokens double. Read from TOKENS_COARSE — `any-pointer:coarse`, the
       query the tokens themselves use — not from tip.ts's COARSE, which is
       `pointer:coarse`: on a touch laptop those disagree, the tokens doubled and
       this threshold did not. The strip is z-index 6 against the dock's 4, so it took
       the tap: measured at 1024×600 with a coarse pointer, pressing the centre of
       "Dob i spol" opened the glossary instead of the age panel, and at 901×600
       elementFromPoint over #citzHd returned #helpBtn. Both thresholds are read
       from the same query the tokens are, so the class and the CSS cannot
       disagree about which pointer this is. */
    <div className={'map-wrap' + (stageFit && stageFit < 340 ? ' stage-short' : '')
      + (stageFit && stageFit < (TOKENS_COARSE ? 174 : 114) ? ' stage-tight' : '')
      + (covered ? ' focus-covered' : '')}
      style={{ '--stageh': stageFit + 'px' } as CSSProperties}>
      <DetailCard S={S} setS={setS} />
      {/* outside .map-box on purpose: at ≤900 it leaves the overlay layer and
          sits in normal flow above the map, like the detail card. Floating, it
          is a 232 px panel over a 439 px map that collides with both the JLS
          chip and the legend. Desktop is unaffected — .map-wrap and .map-box
          are the same box, so absolute positioning resolves identically. */}
      {/* In Matrica this mount is skipped and Rail renders the card instead — a
          floating card over a heatmap covers live corridors (measured: ~12×9
          cells at 960 px, and steering the grid around it crushes the cell to
          ~10 px). Over a map it costs sea. */}
      {S.view !== 'mx' && <PairCard S={S} setS={setS} />}
      {/* The stage exists to be the chip dock's containing block. Anchored to
          .map-wrap the dock's `bottom:12px` measured past the in-flow Nalazi
          banner, so at z-index 4 it painted over it: measured with a real click,
          #storyX was 100 % covered at 1280/1150/1024/960 and the press opened
          the Dob i spol panel instead of closing the banner. The v2.0.3 pass
          fixed "the banner covers the chip" and left "the chip covers the
          banner"; sharing a box with the map alone, neither can reach the
          other. Below 900 px the stage is a plain block and the dock joins the
          normal flow, where nothing overlays anything. */}
      <div className="map-stage">
      <div className="map-box" ref={wrapRef}>
      {/* `drawn` guards the county paths and the JLS map already; the two grids
          were the exception, and they are the two that lay themselves out around
          a MEASURED legend box. On a cold link the first paint used {w:0,h:0}
          and the fitGrid floor, so Matrica drew 7 px cells at x=2 for 100–240 ms
          before landing at x=414 with 25,7 px ones. Holding the space empty for
          that frame is what the map branch has always done. */}
      {S.view === 'mx' ? (drawn && (
        <MatrixView S={S} setS={setS} size={size} legend={legend} panel={panel} zoom={zoom} openCorridor={openCorridor} />
      )) : S.view === 'yrs' ? (drawn && (
        <YearsView S={S} setS={setS} size={size} legend={legend} panel={panel} zoom={zoom} />
      )) : S.view === 'jmap' ? (
        /* role=img would declare this a single leaf graphic and hide the
           focusable features inside it from assistive tech */
        /* tabIndex -1 for the skip link, as in the county map below */
        /* The instruction is only true while there is something to move
           between. With geo_jls aborted the map drew 0 .jl paths and still
           announced "Strelice pomiču odabir." — the view's one navigation
           promise, made over an empty group. The placeholder two elements down
           already says why, in the same words. */
        <svg id="map" role="group" tabIndex={-1} aria-label={JGEO
          ? L('Karta gradova i općina — unutarnja migracija 2018. Strelice pomiču odabir.',
            'Map of towns and municipalities — internal migration 2018. Arrow keys move the selection.')
          : L('Karta gradova i općina. ', 'Map of towns and municipalities. ') + geoStatus(true)}
          {...zoom.bind} style={zoom.style}>
          <g transform={zt}>
          <g ref={jgRef}>
            {drawn && JGEO && jlsPaint && (() => {
              return JGEO.features.map((f, ix) => {
                const p = f.properties;
                const paint = jlsPaint[ix];
                return (
                  <path key={p.j} className={'jl' + (S.jlsHl === p.j ? ' hl' : '')} data-j={p.j}
                    d={jds[ix]} fill={paint.fill}
                    vectorEffect="non-scaling-stroke"
                    /* the per-JLS numbers lived only in a hover tooltip, so the
                       whole view was unreachable without a pointer. One tab stop
                       in, arrows walk the features (grouped by county). */
                    tabIndex={ix === jf ? 0 : -1}
                    /* Nothing opens when a municipality is activated, so this is
                       a readout, not a button — the same call the inert rail
                       rows make. role=img is what keeps the aria-label exposed
                       on a focusable element that claims no behaviour. */
                    role="img"
                    aria-label={paint.label}
                    /* and not here either, for the reason the county paths give:
                       "… in, … out, net …" is a sentence carrying English words
                       and English-formatted numbers */
                    /* not while a pinch owns the pointers: the coarse branch
                       suppresses the matching leave, so a two-finger gesture
                       left a municipality readout parked over the zoomed map */
                    onPointerEnter={() => { if (!zoom.gesturing.current) setS({ jlsHl: p.j }); }}
                    /* touch sends leave the moment the finger lifts, which would
                       flash the readout away; keep it until the next tap instead */
                    onPointerLeave={e => { if (e.pointerType !== 'touch') setS({ jlsHl: null }); }}
                    /* A tap fires pointerover, pointerenter, pointerdown, pointerup
                       and pointerleave — and no pointermove. So on the one device
                       class this tip exists for (Tooltip says it outright: on a
                       coarse pointer it is the JLS map's only value readout) the
                       only positioning input never ran: `last` stayed null,
                       placeTip() was a no-op, and .tip's position:fixed with auto
                       insets painted the box at its static flow position.
                       Measured at 390×844 coarse, one clean tap on Sveti Martin na
                       Muri: style.left and style.top both empty, rect (0,1918) —
                       1.074 px below a 844 px viewport, and fixed positioning means
                       scrolling never brings it back. At 1024×768 the same tap
                       painted it at (0,0), over the header, 300 px from the polygon.
                       One drag-tap placed it and every clean tap afterwards
                       replayed that stale point under a different municipality's
                       numbers. Matrica and Godine already position from pointerdown
                       through their touch overlays; this is the same signal. */
                    onPointerDown={moveTip}
                    onPointerMove={moveTip}
                    onFocus={e => {
                      setS({ jlsHl: p.j });
                      /* clicking a municipality focuses it, and the ring plus the
                         tip-jump that follow are both keyboard behaviour: the
                         pointer already placed the tip on pointermove */
                      if (!isKeyFocus(e.currentTarget)) return;
                      setJFoc(true);
                      const r = e.currentTarget.getBoundingClientRect();
                      moveTip({ clientX: r.right, clientY: r.bottom });
                    }}
                    onBlur={() => { setJFoc(false); if (!COARSE) setS({ jlsHl: null }); }}
                    onKeyDown={e => {
                      /* Shift+arrow is the documented keyboard pan and useZoom
                         listens for it on the window; matching on `e.key` alone
                         swallowed the chord here the same way the two grids did.
                         See the note in MatrixView.onCellKey. */
                      if (e.shiftKey) return;
                      const last = JGEO.features.length - 1;
                      const d: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
                      /* 556 features on a flat list is 555 presses end to end;
                         Home/End/PageUp/PageDown make it navigable */
                      const abs: Record<string, number> = { Home: 0, End: last };
                      const page: Record<string, number> = { PageUp: -25, PageDown: 25 };
                      let next: number | null = null;
                      if (d[e.key]) next = ix + d[e.key];
                      else if (e.key in abs) next = abs[e.key];
                      else if (page[e.key]) next = ix + page[e.key];
                      if (next === null) return;
                      e.preventDefault(); e.stopPropagation();
                      jNav.current = true;
                      setJf(Math.max(0, Math.min(last, next)));
                    }} />
                );
              });
            })()}
          </g>
          <g>
            {drawn && ISOS.map(iso => <path key={iso} className="jbord" d={cds[iso]} vectorEffect="non-scaling-stroke" />)}
          </g>
          {/* same two-tone ring as the county map — a 1.6 px teal stroke on a
              √-scaled indigo/vermilion fill measured as low as 1.02:1 */}
          {jFoc && JGEO && jds[jf] && (
            <g className="focusring">
              <path className="fr-halo" d={jds[jf]} vectorEffect="non-scaling-stroke" />
              <path className="fr-ink" d={jds[jf]} vectorEffect="non-scaling-stroke" />
            </g>
          )}
          {labelG}
          </g>
        </svg>
      ) : (
        /* tabIndex -1 so the skip link has something to land on: "Prijeđi na
           kartu" moves focus here rather than navigating to #map, and .focus()
           on an element with no tabindex is a silent no-op that leaves focus on
           <body> — which is exactly what the bypass block used to do. Not a tab
           stop: the county paths inside it are, and adding one more would put a
           whole-map stop in front of all 21 of them. */
        <svg id="map" role="group" tabIndex={-1} aria-label={L('Karta županija Hrvatske', 'Map of Croatian counties')}
          {...zoom.bind} style={zoom.style}>
          <g transform={zt}>
          <g>
            {drawn && GEO.features.map(f => {
              const iso = f.properties.shapeISO;
              return (
                <path key={iso} className={'cnt' + (iso === S.hl ? ' hl' : '') + (iso === S.sel ? ' sel' : '')
                  + (S.view === 'reg' && S.regHl && REGOF[iso] === S.regHl ? ' rhl' : '')}
                  data-iso={iso} d={cds[iso]} fill={fill(iso)} tabIndex={0} aria-label={countyAria(S, iso)}
                  /* NO lang="hr" here, unlike #cardName and the rail's .rname:
                     this label is a SENTENCE, not a name — "Grad Zagreb: net
                     migration +3,242 · 2018" — and NVDA/JAWS/VoiceOver automatic
                     language switching handed the whole of it to the Croatian
                     voice in English. Croatian reads the comma as the decimal
                     mark and the dot as the thousands separator, so "3,242" came
                     out three-point-two-four-two and "−8.7" is not a Croatian
                     numeral at all, while "net migration" got Croatian phonemes.
                     The numbers are the payload; the county name inside the
                     sentence keeps English phonemes, which is the cheaper loss.
                     Surfaces whose ENTIRE string is a place name still carry it. */
                  /* every stroke in the map is inside the zoom transform, so a
                     hairline border grew with k — see index.css */
                  vectorEffect="non-scaling-stroke"
                  /* A focusable path with an aria-label and no role is a name
                     ARIA does not guarantee AT will expose — the rule the rail
                     rows and the matrix diagonal already follow. It is also
                     genuinely activatable, and in every view but Tokovi it
                     toggles the detail card, so it owes aria-expanded too. */
                  role="button"
                  aria-expanded={S.view === 'flow' ? undefined : iso === S.sel}
                  onPointerEnter={() => setHL(iso)} onPointerLeave={() => setHL(null)}
                  onPointerMove={moveTip} onClick={() => selectCounty(iso)}
                  /* the ring is a keyboard affordance: drawn from the focus
                     event alone it also appeared on a plain mouse click */
                  /* …and the tip has to be placed, not merely shown. moveTip
                     replays the last POINTER position, and there may not have
                     been one: measured at 1440×900 on a fresh load with the
                     pointer never moved, focusing HR-19 painted its full readout
                     at 0,0 — a 260×242 black panel over the app header — while
                     the county it describes sits at (575,598). After a hover it
                     is worse in a quieter way: hover Istarska (tip at 345,349),
                     focus Vukovarsko-srijemska at (763,288) and the tip keeps its
                     old position and swaps its content, so one county's numbers
                     are anchored over another ~420 px away. Every Tab through the
                     21 paths reproduced it. The JLS path 60 lines below and both
                     grid views already do exactly this. */
                  onFocus={e => {
                    setHL(iso);
                    if (!isKeyFocus(e.currentTarget)) return;
                    setFIso(iso);
                    const r = e.currentTarget.getBoundingClientRect();
                    moveTip({ clientX: r.right, clientY: r.bottom });
                    /* …and if the card is drawn over it, get the card out of the
                       way rather than leave the ring underneath (2.4.11). */
                    /* closest, not parentElement: wrapRef is .map-box and both
                       cards hang off .map-wrap, which is not its direct parent. */
                    const panel = wrapRef.current?.closest('.map-wrap')?.querySelector('#card.show, #pair');
                    const c = panel?.getBoundingClientRect();
                    setCovered(!!c && r.left >= c.left - 0.5 && r.right <= c.right + 0.5
                      && r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5);
                  }}
                  onBlur={() => { setHL(null); setFIso(null); setCovered(false); }}
                  /* Space is the other native activation key. Without it the
                     press fell through to App's window handler, which read a
                     <path> as "not a control" and started the 28-year
                     animation from the app's primary view. */
                  onKeyDown={e => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault(); e.stopPropagation();
                    selectCounty(iso);
                  }} />
              );
            })}
          </g>
          <g>
            {drawn && rds.map((d, i) => (
              /* `rds` is now empty outside Regije, so the display:none this
                 carried — which existed to keep the projected paths mounted
                 across a view change — has nothing left to hide */
              <path key={i} className="regline" d={d} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          <g>
            {/* a white casing under each arc, so restoring the shared ramp does not
                cost a pale corridor its legibility against the pale fill it
                crosses. Same dash pattern, so the honesty encoding still reads. */}
            {arcs && arcs.paths.map(a => (
              <path key={'c' + a.p} className="arccase" d={a.d} strokeWidth={(a.w + 1.8) / k}
                strokeDasharray={est ? `${7 / k} ${4 / k}` : undefined} />
            ))}
            {arcs && arcs.paths.map(a => (
              <path key={a.p} className="arc" d={a.d} stroke={a.stroke} strokeWidth={a.w / k}
                strokeDasharray={est ? `${7 / k} ${4 / k}` : undefined} />
            ))}
            {arcs && arcs.paths.map(a => (
              <path key={'h' + a.p} className="arch" d={a.head} fill={a.stroke} />
            ))}
            {/* Every other thing drawn above the county paths opts out of hit
                testing — .arc, .arch, .focusring, .regline, .jbord and the
                inline .clab — and this one did not. It is not a descendant of
                the county path, so while the cursor was over it the county's
                pointerenter/pointermove never fired and its pointerleave already
                had: the hub's own tooltip blanked, S.hl cleared (taking the rail
                row and the legend mark with it), and a click landed on a circle
                with no onClick, so selectCounty never ran. A ~12 px dead spot at
                k=1, and it is inside the zoom transform, so ~72 px across at
                KMAX — exactly where a reader zoomed in to click. */}
            {arcs && <circle className="hubdot" cx={arcs.sx} cy={arcs.sy} r={4.5 / k} fill="var(--ink)" stroke="#fff" strokeWidth={1.5 / k} />}
          </g>
          {/* Two-tone focus ring, drawn above every fill so it is never the
              county's own stroke competing with its own colour. See index.css. */}
          {fIso && cds[fIso] && (
            <g className="focusring">
              <path className="fr-halo" d={cds[fIso]} vectorEffect="non-scaling-stroke" />
              <path className="fr-ink" d={cds[fIso]} vectorEffect="non-scaling-stroke" />
            </g>
          )}
          {labelG}
          </g>
        </svg>
      )}
      {/* The strip has a fourth member, and it is the leftmost one. .jcard sits
          at top:14 left:16, the same row as the three buttons, and it used to be
          rendered last of all four — so a sighted keyboard reader watched focus
          walk right to #helpBtn (x=1018) and #labBtn (x=1056), then jump 1.001 px
          back left to #jcardHd (x=17) on the same row, measured at 1440×900 in
          Tokovi. That is the 2.4.3 inversion the note below was written for; the
          commit that closed it reordered the three inside .mapstrip and left the
          one outside it alone. All four are absolutely positioned, so nothing
          moves on screen; when the card is open its body now reads before the
          buttons, which is what the layout has always claimed. */}
      <JlsCard S={S} setS={setS} toggleJls={toggleJls} />
      {/* Source order = paint order, left to right: zoom reset, help, labels.
          They used to be three absolutely-positioned controls, each reserving
          space for its neighbour with a literal — which held at Chrome's default
          root font size and stopped holding at its "Very large" one, where the
          labels toggle grew across the "?" and took its clicks. .mapstrip is
          that row, laid out rather than measured, so the order below is now the
          layout as well as the paint and the Tab order it was written for: a
          sighted keyboard reader used to watch focus jump right, left, further
          left across one row of three buttons (2.4.3). */}
      <div className="mapstrip">
      {zoom.zoomed && (() => { const zk = Math.round(zoom.t.k * 10) / 10; return (
        /* Resetting the zoom unmounts this button, so focus had nowhere to go;
           hand it to the neighbouring map control. The title and the aria-label
           also used to say two different things to two different users. */
        <button className="zoomrst" id="zoomRst"
          onClick={() => { zoom.reset(); focusSoon('#labBtn, #helpBtn'); }}
          title={L('Vrati zumiranje na početno', 'Reset zoom')}
          /* the title was translated and the accessible name was not, so this one
             control said two things in two languages to two different users; the
             factor is a number and owes the reader's own decimal separator */
          aria-label={L(`Vrati zumiranje na početno, trenutačno ${fmtR.format(zk)}×`,
            `Reset zoom, currently ${fmtR.format(zk)}×`)}>
          ⤢ {fmtR.format(zk)}×
        </button>
      ); })()}
      {/* aria-expanded + haspopup, not aria-pressed. This opens a role=dialog;
          "pressed" describes a toggle button that stays down, and a screen reader
          announced the glossary's own open state as if the "?" were a setting.
          The title duplicated the aria-label word for word, which is a second
          announcement of the same string — it says what the control opens now,
          and the name stays the name. */}
      <button className={'helpbtn' + (S.help ? ' on' : '')} id="helpBtn"
        aria-expanded={S.help} aria-haspopup="dialog" aria-controls="helpCard"
        title={L('Otvori pojmovnik', 'Open the glossary')}
        aria-label={L('Kako čitati atlas', 'How to read the atlas')} onClick={toggleHelp}>?</button>
      {hasLabels ? (
        <button className={'labbtn' + (S.labels ? ' on' : '')} id="labBtn" aria-pressed={S.labels}
          onClick={() => setS({ labels: !S.labels })}>{L('Aa oznake', 'Aa labels')}</button>
      ) : (
        /* Matrica and Godine draw no labels, so the button is not mounted there —
           and in a row that means the two controls to its left slide into its
           place. Measured at 2560 px, saldo → yrs moved #helpBtn 2145,9 → 2230,
           84,1 px under the reader's pointer on a view change, which the old
           108 px literal never did. The lane is kept open instead, by the button's
           own text rather than by a second number that can drift: a span, so
           #labBtn stays absent where no labels exist, and visibility:hidden, so it
           is neither a tab stop nor a hit target. */
        <span className="labbtn labbtn-lane" aria-hidden="true">{L('Aa oznake', 'Aa labels')}</span>
      )}
      </div>
      {/* The 475 KB municipal geometry is its own chunk, so "not here yet" and
          "never arriving" are two different states and the view has to name
          both. It used to name neither: `jlsGeo()` returns null before the
          fetch *and* after it fails, so the loading placeholder was also the
          permanent post-failure UI — an empty country under a spinner, with no
          retry short of a reload. role=status so the wait and the failure both
          reach assistive tech, which the SVG <text> never did. */}
      {/* Both halves, not one. geoAsync was built symmetrically — jlsFailed() /
          regFailed(), shared flags, shared retry — and only the JLS half was
          wired to anything, so a failed geo_regions5.json fetch left Regije
          drawing county tints from the static REGOF with no boundary outlines,
          no message and no retry. A failed module fetch is cached in the
          browser's module map, so that state could not self-heal without the
          reload only this UI offers, and the export shipped without the
          outlines too. */}
      {/* The region is mounted for both geometry views whether or not it has
          anything to report, for the reason #srLive is: a live region inserted
          already populated is not guaranteed to announce. Empty it paints
          nothing — see .geostat:empty. */}
      {(S.view === 'jmap' || S.view === 'reg') && (() => {
        const jm = S.view === 'jmap';
        const waiting = jm ? !JGEO : !REGGEO;
        return (
          <div className="geostat" id="jstatus" role="status" aria-live="polite">
            {!waiting ? null : (jm ? jlsFailed() : regFailed()) ? (
              <>
                <span id="jerror">{geoStatus(jm)}</span>
                {/* The retry reloads, which is the only thing that re-fetches a
                    module the browser has cached a rejection for — but offline
                    that replaces a working app (every view but this one still
                    renders and exports from the entry bundle) with the browser's
                    network-error page. retryGeo says which happened; here we
                    only have to render the answer, and the listener it armed
                    reloads by itself when the connection comes back. */}
                <button id="jretry" onClick={() => setOffline(retryGeo() === 'offline')}>
                  {L('Pokušaj ponovno', 'Try again')}</button>
                {offline && <span id="joffline">{L('Nema mreže — nastavit će se automatski kad se veza vrati.',
                  'No connection — this will resume by itself when the network is back.')}</span>}
              </>
            ) : <span id="jloading">{geoStatus(jm)}</span>}
          </div>
        );
      })()}
      <Legend S={S} />
      <HelpPanel S={S} setS={setS} />
      </div>
      {/* One dock, not two bottom-right anchors. Side by side the pair spanned
          656 px of the map's bottom edge and ran into the legend below ~1150 px
          and under the detail card below ~1100. Stacked, the dock is one panel
          wide at every width and the two can never overlap each other. */}
      {/* --stageh is what bounds the floating panel body: it is positioned
          against this dock, and the dock is only as tall as its two headers, so
          there is no percentage for the body to cap itself with. The stage's
          height is already measured here (.map-box is the stage's only in-flow
          child, so the two are the same box) — see --chipfree in index.css. */}
      <div className="chipdock">
        <AgePanel S={S} setS={setS} toggleAge={toggleAge} />
        <CitzPanel S={S} setS={setS} toggleCitz={toggleCitz} />
      </div>
      </div>
      {/* Outside the stage on purpose. Floated bottom-centre the caption shared
          the map's bottom edge with the legend (left) and the chip dock (right),
          and won on z-index: the "Dob i spol" chip was unclickable at every
          desktop width from 1200 to 1600. In flow, below the stage the dock is
          anchored to, it collides with nothing in either direction. */}
      <StoryBar S={S} setS={setS} />
    </div>
  );
}
