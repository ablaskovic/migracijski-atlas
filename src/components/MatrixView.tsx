import { useEffect, useRef, useState } from 'react';
import { D, REG, SHORTN, MXORD, mxCell, mxMax, divScale, seqScale, badgeText, flowBadge, fmtI, sgn } from '../lib/metrics.ts';
import { fitGrid } from '../lib/gridfit.ts';
import { moveTip, COARSE } from '../lib/tip.ts';
import { isKeyFocus } from '../lib/state.ts';
import { L } from '../lib/i18n.ts';
import type { useZoom } from '../lib/useZoom.ts';
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Patch, State } from '../lib/types.ts';

/* 21×21 OD heatmap — the whole gravity structure at once (the star chart in
   Tokovi shows one county at a time). Rows keep tokovi semantics per Smjer:
   out = row→col, in = col→row, net = row's gain from col. Region blocks are
   separated by heavier rules; the diagonal (within-county moves) is not in the
   county matrix and is hatched out. Renders as svg#map so PNG/SVG export works. */

const MONO = 'IBM Plex Mono,ui-monospace,monospace';
/* region block boundaries as county counts along MXORD */
const BLOCKS: number[] = [];
{
  let acc = 0;
  for (const k of Object.keys(REG)) { acc += REG[k].c.length; BLOCKS.push(acc); }
}

export default function MatrixView({ S, setS, size, legend, panel, zoom, openCorridor }: {
  S: State; setS: (p: Patch) => void; size: { w: number; h: number };
  legend: { w: number; h: number }; panel: { w: number; h: number }; zoom: ReturnType<typeof useZoom>;
  openCorridor: (a: string, b: string) => void;
}) {
  const n = MXORD.length;
  /* PADB is the plain bottom margin when the legend is not in the way. The
     four-placement search that steers the grid around the legend and the chip
     dock now lives in lib/gridfit.ts, because Godine needs exactly the same
     search over a differently-shaped grid — its objective is the resulting cell,
     which for a square grid is the same ordering this used to compute. */
  const LBL = 108, TOPL = 90, PADR = 14, PADB = 40;
  /* 12, not 8. The floor is a documented invariant and the suite asserts it —
     but never at ≤980 px with a chip panel open, which is where the placement
     search runs out of box and the cell measured 11,52 px. The grid overflows
     instead, which is the trade Godine already documents for its own floors:
     the shared zoom/pan recovers an off-box grid, and nothing recovers a cell
     too small to hit. */
  const MINCELL = 12;
  const box = fitGrid({ size, legend, panel, cols: n, rows: n, lbl: LBL, top: TOPL, padR: PADR, padB: PADB, min: MINCELL });
  const cell = Math.max(MINCELL, Math.min(box.cw, box.ch));
  /* Centre in the leftover width — but when the cell is at its floor the grid can
     be WIDER than the lane it was given, and then the direction of the overflow
     is the whole question: to the right it runs under the chip dock, which is
     opaque, and those cells stop being reachable at all. Left it runs into the
     row-label gutter, which is text the grid paints over and the shared zoom/pan
     can recover. Clamped so the first column never leaves the box. */
  const over = n * cell - box.w;
  const x0 = box.left + (over <= 0 ? over / -2 : Math.max(2 - box.left, -over)), y0 = TOPL;
  const m = mxMax(S.dir, S.cum);
  const col = S.dir === 'net' ? divScale(m) : seqScale(m, S.dir);
  /* Measured per cell, not assumed from the cell size. `cell >= 22` asks whether
     a number could fit and never asks whether *this* number does: a cumulative
     −12.169 is seven glyphs where an annual 87 is two. Measured at 1920×1080 in
     Kumulativno + Neto (cell 30,14 px), 20 of the 420 in-cell numbers rendered
     wider than their own cell and two pairs of horizontally adjacent numbers
     overlapped glyph boxes — the Zagrebačka/Grad Zagreb cell drew "−12.169" at
     36,6 px, 3,2 px of it on each neighbour's fill, over that neighbour's own
     number and over the white cell border. Same at 1680×1050, and in
     Odlasci + Kumulativno "42.146" spills a 28,1 px cell. .mxnum is baked into
     both export formats with the same geometry, so the figure carried the
     collision too. YearsView already solves exactly this per cell; this is its
     test, with the same 0,6 em advance for the mono face. */
  const numFs = Math.min(8.5, cell / 3);
  const showNum = cell >= 22;
  const fitsNum = (str: string) => str.length * numFs * 0.6 <= cell - 3;
  const hl = S.pairHl;
  const hlR = hl ? MXORD.indexOf(hl[0]) : -1, hlC = hl ? MXORD.indexOf(hl[1]) : -1;
  /* The selected corridor — the one the card in the rail describes. Orthogonal to
     hover (which is one transient pair) and to focus (the roving tab stop), so it
     gets its own marks: a persistent trace band and a ring on the cell. Finding
     one cell in 420 by memory is not a UI. */
  const selR = S.sel && S.pair ? MXORD.indexOf(S.sel) : -1;
  const selC = S.sel && S.pair ? MXORD.indexOf(S.pair) : -1;
  /* label floor: cell*0.42 bottoms out near 5 px on a phone, which is not a
     label. Row pitch is `cell`, so 6.5 px still clears its own line. */
  const rowFs = Math.max(6.5, Math.min(9.5, cell * 0.42));
  const colFs = Math.max(6.5, Math.min(9, cell * 0.4));

  /* Roving tabindex: 420 tab stops would be hostile, so one cell is tabbable and
     the arrows walk the grid (the standard grid pattern). Arrow keys must stop
     propagating or App's global handler also steps the year. */
  const [fc, setFc] = useState<[number, number]>([0, 1]);
  /* whether the roving cell actually holds focus — backs the two-tone ring, the
     same way MapView tracks it for the county and municipality paths */
  const [cellFoc, setCellFoc] = useState(false);
  const navRef = useRef(false);
  const gridRef = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!navRef.current) return;
    navRef.current = false;
    /* By the cell's own identity, not by `[tabindex="0"]`. "Exactly one cell is
       tabbable" is an invariant any outside writer can break — the glossary's
       tab-stop suspension did, restoring a stale cell on close — and a duplicate
       made this line re-focus whichever came first in document order, i.e. the
       cell the reader had just left, while `fc` walked on invisibly. */
    gridRef.current?.querySelector<SVGRectElement>(
      `.mxc[data-a="${MXORD[fc[0]]}"][data-b="${MXORD[fc[1]]}"]`)?.focus();
  }, [fc]);
  /* Move the roving tab stop onto the selected corridor, so the grid's one tab
     stop is the cell the open card describes — and so Escape / the card's ×,
     which return focus to that cell, do not leave focus on a `tabindex="-1"`
     cell while Tab resumes from somewhere else entirely. navRef stays false, so
     this places the stop without stealing focus from wherever it is. */
  useEffect(() => {
    if (selR >= 0 && selC >= 0) setFc([selR, selC]);
  }, [selR, selC]);
  const moveF = (dr: number, dc: number) => {
    navRef.current = true;
    setFc(([r, c]) => {
      let nr = r + dr, nc = c + dc;
      if (nr === nc) { nr += dr; nc += dc; }   /* the diagonal holds no value */
      return nr < 0 || nr >= n || nc < 0 || nc >= n ? [r, c] : [nr, nc];
    });
  };
  const onCellKey = (e: ReactKeyboardEvent<SVGRectElement>, a: string, b: string) => {
    const d: Record<string, [number, number]> = {
      ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0],
    };
    if (d[e.key]) { e.preventDefault(); e.stopPropagation(); moveF(...d[e.key]); return; }
    /* The APG grid pattern requires these precisely because a 21×21 grid is
       otherwise ~40 presses corner to corner, and App scopes its own Home/End
       to #spark — so on a cell they did nothing at all. */
    const jump: Record<string, [number, number] | null> = {
      Home: e.ctrlKey ? [0, 1] : [-1, 0], End: e.ctrlKey ? [n - 1, n - 2] : [-1, n - 1],
      PageUp: [0, -1], PageDown: [n - 1, -1],
    };
    if (e.key in jump) {
      e.preventDefault(); e.stopPropagation();
      navRef.current = true;
      setFc(([r, c]) => {
        const j = jump[e.key]!;
        let nr = j[0] < 0 ? r : j[0], nc = j[1] < 0 ? c : j[1];
        /* the diagonal holds no value — step off it the way moveF does */
        if (nr === nc) { if (nc < n - 1) nc += 1; else nc -= 1; }
        return [nr, nc];
      });
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); e.stopPropagation();
      drill(a, b);
    }
  };
  /* Activating a cell used to switch to Tokovi: `{view:'flow', sel:a, pair:b}`.
     That answered a corridor question with a county answer — measured, clicking
     Istarska→Zadarska (31 people) left the grid entirely and drew 20 arcs from
     Istarska with a rail of all 20 partners summing 996, i.e. the whole county
     outflow, with the one corridor the user asked for reduced to a card in the
     corner. It also destroyed the thing they were reading: the matrix is *the*
     view for comparing corridors, and one click threw it away.
     Now the corridor opens in place: the grid stays, `sel`+`pair` mark it (band
     + selection ring below), and the card renders in the rail. Focus stays on
     the cell — it is no longer unmounted, and `aria-expanded` on the cell is
     what says a card opened, the same contract `.cnt` uses for its county card.
     A second activation closes it, so the cell is a toggle both ways. */
  /* The one implementation, handed down rather than copied. This used to
     re-derive App.openCorridor's toggle and drop its `playing: false`, so opening
     a corridor from a cell left the film running: measured, #play kept
     aria-pressed="true" and the card's readout stepped from "2012. · → 2.457 ·
     ← 2.010 · neto −447" to 2014's figures 1,4 s later, with the badge flipping
     as 2018 went past — while clicking the identical corridor in the rail 40 px
     away stopped it. Two routes to one action, two behaviours. */
  const drill = openCorridor;
  /* keyboard focus must place the tip itself — moveTip otherwise replays the
     last pointer position, which has nothing to do with the focused cell */
  const onCellFocus = (e: ReactFocusEvent<SVGRectElement>, a: string, b: string) => {
    setS({ pairHl: [a, b] });
    /* same rule as the map: a click focuses the cell, and neither the ring nor
       the tip-jump belong to a pointer that already did both */
    if (!isKeyFocus(e.currentTarget)) return;
    setCellFoc(true);
    const r = e.currentTarget.getBoundingClientRect();
    moveTip({ clientX: r.right, clientY: r.bottom });
  };

  /* The label has to state the direction its own number describes. `mxCell` flips
     with Smjer, so a fixed "a → b" told a screen-reader user the exact opposite of
     the truth in Dolasci (the cell labelled "Grad Zagreb → Zagrebačka: 1.977"
     holds Zagrebačka → Grad Zagreb) and read a net balance as a directed flow in
     Neto. `#tip` is aria-hidden, so this string is all AT gets. Same separation of
     "what it points at" from "how it is worded" the rail already makes. */
  /* …and the honesty badge, which #tip carries for a pointer user and this string
     did not carry for anyone else. At #v=mx&y=2003 all 420 gridcells announced an
     IPF-fitted number with no marker at all, while hovering the same cell showed
     the identical table plus a "procjena (IPF)" pill. */
  const cellBadge = S.cum ? badgeText('cum') : flowBadge(S.yi, S.cum);
  const cellAria = (a: string, b: string, v: number): string =>
    (S.dir === 'net' ? L(`${D[a].n} ↔ ${D[b].n}: neto ${sgn(Math.round(v), fmtI)} za ${D[a].n}`,
      `${D[a].n} ↔ ${D[b].n}: net ${sgn(Math.round(v), fmtI)} for ${D[a].n}`)
      : S.dir === 'in' ? `${D[b].n} → ${D[a].n}: ${fmtI.format(Math.round(v))}`
        : `${D[a].n} → ${D[b].n}: ${fmtI.format(Math.round(v))}`) + ' · ' + cellBadge;

  /* Touch hit-testing: a finger is ~40 px against a ~10 px cell, so relying on
     the cell paths themselves means most taps land in a gap and read nothing.
     One overlay across the grid instead resolves the tap to the cell it fell
     in, so every tap inside the matrix returns a corridor. */
  const pick = (ev: ReactPointerEvent<SVGRectElement>) => {
    const svg = ev.currentTarget.ownerSVGElement;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    /* undo the zoom transform before resolving the tap to a row/column */
    const gx = (ev.clientX - r.left - zoom.t.x) / zoom.t.k;
    const gy = (ev.clientY - r.top - zoom.t.y) / zoom.t.k;
    const c = Math.floor((gx - x0) / cell);
    const rw = Math.floor((gy - y0) / cell);
    const inside = rw >= 0 && rw < n && c >= 0 && c < n;
    const a = inside ? MXORD[rw] : null, b = inside ? MXORD[c] : null;
    /* the diagonal carries no value, but it does carry an explanation */
    /* Same-value guard, the one `setHL` already has for the scalar highlights.
       Without it every pointermove over the touch overlay allocated a fresh
       tuple, which is never `===` the previous one, so a finger held inside one
       cell reconciled the whole app — 441 gridcells plus the rail's 420-row
       compute-and-sort — at display rate, on the device class the overlay exists
       to serve. */
    const cur = S.pairHl;
    const same = a && b ? !!cur && cur[0] === a && cur[1] === b : !cur;
    if (!same) setS({ pairHl: a && b ? [a, b] : null });
    const { clientX, clientY } = ev;
    requestAnimationFrame(() => moveTip({ clientX, clientY }));
  };

  /* ARIA 1.2: a `grid` must own `row`s, and gridcells outside a row are not part
     of the grid at all. This used to be 441 gridcells hanging directly off the
     svg, so NVDA/JAWS table navigation — the only practical way to read a 21×21
     matrix — never engaged, and no cell had any positional context. Rows now
     wrap each line, the per-cell <g> is presentational so it does not break
     ownership, and row/col indices are declared. */
  const rows = [];
  for (let r = 0; r < n; r++) {
    const cells = [];
    for (let c = 0; c < n; c++) {
      const a = MXORD[r], b = MXORD[c];
      if (a === b) {
        /* hatched, but no longer silent: probing the one visually distinct band
           in the grid used to return nothing at all — and that explanation was
           pointer-only, since the roving tabindex deliberately steps over the
           diagonal. As a named gridcell a screen reader reaches it in browse
           mode without it ever becoming a tab stop. */
        cells.push(<rect key={a + b} className="mxd" data-a={a} data-b={b}
          vectorEffect="non-scaling-stroke"
          x={x0 + c * cell} y={y0 + r * cell} width={cell} height={cell}
          fill="url(#mxhatch)" role="gridcell" tabIndex={-1} aria-colindex={c + 1}
          aria-label={L(`${D[a].n} — dijagonala: selidbe unutar iste županije nisu dio međužupanijske matrice`,
            `${D[a].n} — diagonal: moves within the same county are not part of the inter-county matrix`)}
          onPointerEnter={() => setS({ pairHl: [a, b] })}
          onPointerLeave={() => { if (!COARSE) setS({ pairHl: null }); }}
          onPointerMove={moveTip} />);
        continue;
      }
      const v = mxCell(a, b, S.dir, S.yi, S.cum);
      const isHl = !!hl && hl[0] === a && hl[1] === b;
      const isF = fc[0] === r && fc[1] === c;
      cells.push(
        <g key={a + b} role="presentation">
          <rect className="mxc" data-a={a} data-b={b} vectorEffect="non-scaling-stroke"
            x={x0 + c * cell} y={y0 + r * cell} width={cell} height={cell}
            fill={col(S.dir === 'net' ? v : Math.abs(v))}
            stroke={isHl ? '#20262B' : '#fff'} strokeWidth={isHl ? 1.6 : 0.5}
            role="gridcell" tabIndex={isF ? 0 : -1} aria-colindex={c + 1}
            aria-label={cellAria(a, b, v)}
            /* activating a cell opens the corridor card in the rail and leaves
               the grid standing, so the cell is the control that owns it —
               same contract `.cnt` has with the county card */
            aria-expanded={r === selR && c === selC}
            onPointerEnter={() => setS({ pairHl: [a, b] })}
            onPointerLeave={() => { if (!COARSE) setS({ pairHl: null }); }}
            onPointerMove={moveTip}
            onFocus={e => onCellFocus(e, a, b)}
            onBlur={() => { setCellFoc(false); if (!COARSE) setS({ pairHl: null }); }}
            onKeyDown={e => onCellKey(e, a, b)}
            /* Drill-through is pointer-only. At 21×21 a cell is ~10 px on a
               phone, so a tap that navigates is a tap that misfires — touch
               reads the corridor instead (see the .mxhit overlay below). */
            onClick={() => { if (!COARSE) drill(a, b); }} />
          {showNum && Math.abs(v) >= 1 && fitsNum(fmtI.format(Math.round(v))) && (
            /* No ink/white flip any more: measured against the shipping Lab
               ramps there is no threshold that works, because there are bands
               where *neither* colour reaches the 4.5:1 this ≤8.5 px text owes.
               On the Dolasci ramp t=0.60–0.70 peaks at 4.42 (ink) / 4.30
               (white); on Odlasci t=0.70–0.80 peaks at 4.43 / 4.14. The old
               0.85 cut left the whole 0.6–0.85 span of the indigo ramp on ink
               at 2.5–3.6:1. A halo removes the dependency instead of tuning it:
               ink on its own white outline is 15.29:1 over every fill, and the
               palette stays exactly as documented. */
            <text className="mxnum" x={x0 + c * cell + cell / 2} y={y0 + r * cell + cell / 2 + 2.5}
              textAnchor="middle" fontSize={numFs} fontFamily={MONO}
              fill="#20262B" pointerEvents="none">
              {fmtI.format(Math.round(v))}
            </text>
          )}
        </g>,
      );
    }
    rows.push(<g key={'row' + r} role="row" aria-rowindex={r + 1}
      aria-label={D[MXORD[r]].n}>{cells}</g>);
  }

  return (
    /* tabIndex -1 for the skip link — see the county map in MapView */
    <svg id="map" role="grid" tabIndex={-1} aria-rowcount={n} aria-colcount={n}
      aria-label={L('Matrica međužupanijskih tokova — strelice pomiču odabir, Enter otvara koridor',
        'Inter-county flow matrix — arrow keys move the selection, Enter opens the corridor')}
      {...zoom.bind} style={zoom.style}>
      <defs>
        <pattern id="mxhatch" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="#EDEFE9" />
          <line y2="5" stroke="#D9DDD6" strokeWidth="1" />
        </pattern>
      </defs>
      <g transform={`translate(${zoom.t.x},${zoom.t.y}) scale(${zoom.t.k})`} ref={gridRef}>
      {MXORD.map((iso, r) => (
        <text key={'r' + iso} x={x0 - 6} y={y0 + r * cell + cell / 2 + 3} textAnchor="end"
          fontSize={rowFs} fontFamily={MONO}
          fontWeight={hl && hl[0] === iso ? 600 : 400}
          fill={hl && hl[0] === iso ? '#20262B' : '#5F6A72'}>{SHORTN[iso]}</text>
      ))}
      {MXORD.map((iso, c) => (
        <text key={'c' + iso} textAnchor="start"
          fontSize={colFs} fontFamily={MONO}
          fontWeight={hl && hl[1] === iso ? 600 : 400}
          fill={hl && hl[1] === iso ? '#20262B' : '#5F6A72'}
          transform={`translate(${x0 + c * cell + cell / 2 + 3},${y0 - 6}) rotate(-65)`}>{SHORTN[iso]}</text>
      ))}
      {rows}
      {/* trace lines back to the axes — bolding two labels is not enough to find
          one pair among 420 cells */}
      {hlR >= 0 && hlC >= 0 && (
        <g className="mxband" pointerEvents="none">
          <rect x={x0} y={y0 + hlR * cell} width={n * cell} height={cell} vectorEffect="non-scaling-stroke" />
          <rect x={x0 + hlC * cell} y={y0} width={cell} height={n * cell} vectorEffect="non-scaling-stroke" />
        </g>
      )}
      {BLOCKS.slice(0, -1).map(b => (
        <g key={'b' + b}>
          <line x1={x0 + b * cell} x2={x0 + b * cell} y1={y0} y2={y0 + n * cell} stroke="#20262B" strokeWidth={1.1} />
          <line x1={x0} x2={x0 + n * cell} y1={y0 + b * cell} y2={y0 + b * cell} stroke="#20262B" strokeWidth={1.1} />
        </g>
      ))}
      <rect x={x0} y={y0} width={n * cell} height={n * cell} fill="none" stroke="#20262B" strokeWidth={1.1} />
      {/* The selected corridor, the one the rail's card describes. Teal, because
          in this app teal is control/selection and never data — so it cannot be
          read as a value the way another ink stroke could. The cell ring is
          two-tone for the reason the focus ring is: teal measures 1.02:1 against
          the light end of the diverging ramp, and the white halo underneath is
          15.29:1 against both. fill/stroke are attributes, not classes, so the
          export ships it without baking (unlike .mxband, which had to be). */}
      {selR >= 0 && selC >= 0 && (
        <g className="mxsel" pointerEvents="none">
          <rect x={x0} y={y0 + selR * cell} width={n * cell} height={cell}
            fill="none" stroke="#0F7D8C" strokeWidth={1.2} opacity={0.8} vectorEffect="non-scaling-stroke" />
          <rect x={x0 + selC * cell} y={y0} width={cell} height={n * cell}
            fill="none" stroke="#0F7D8C" strokeWidth={1.2} opacity={0.8} vectorEffect="non-scaling-stroke" />
          <rect className="mxsel-halo" x={x0 + selC * cell} y={y0 + selR * cell}
            width={cell} height={cell} fill="none" stroke="#FFFFFF" strokeWidth={3.6} vectorEffect="non-scaling-stroke" />
          <rect className="mxsel-ink" x={x0 + selC * cell} y={y0 + selR * cell}
            width={cell} height={cell} fill="none" stroke="#0F7D8C" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
        </g>
      )}
      {/* two-tone focus ring, above the block rules and the outline so it is not
          the one thing on the grid another stroke can hide */}
      {cellFoc && (
        <g className="focusring">
          <rect className="fr-halo" x={x0 + fc[1] * cell} y={y0 + fc[0] * cell} width={cell} height={cell} vectorEffect="non-scaling-stroke" />
          <rect className="fr-ink" x={x0 + fc[1] * cell} y={y0 + fc[0] * cell} width={cell} height={cell} vectorEffect="non-scaling-stroke" />
        </g>
      )}
      {COARSE && (
        <rect className="mxhit" x={x0} y={y0} width={n * cell} height={n * cell}
          fill="transparent" onPointerDown={pick} onPointerMove={pick} />
      )}
      </g>
    </svg>
  );
}
