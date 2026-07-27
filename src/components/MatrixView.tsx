import { useEffect, useRef, useState } from 'react';
import { D, REG, SHORTN, MXORD, mxCell, mxMax, divScale, seqScale, fmtI, sgn } from '../lib/metrics.ts';
import { moveTip, COARSE } from '../lib/tip.ts';
import { focusSoon } from '../lib/state.ts';
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

export default function MatrixView({ S, setS, size, legend, panel, zoom }: {
  S: State; setS: (p: Patch) => void; size: { w: number; h: number };
  legend: { w: number; h: number }; panel: { w: number; h: number }; zoom: ReturnType<typeof useZoom>;
}) {
  const n = MXORD.length;
  /* PADB is the plain bottom margin when the legend is not in the way */
  const LBL = 108, TOPL = 90, PADR = 14, PADB = 40;
  /* The legend sits at left:16/bottom:12 of the map box. The grid must clear it
     either horizontally or vertically — a floating caption over a heatmap hides
     data, unlike over a map. Take whichever placement leaves the larger cell:
       right  — grid starts past the legend (plus LBL, since row labels hang left)
       above  — grid keeps the full width but stops short of the legend band
     Falls back to the old geometry until the legend has been measured. */
  const GAP = 10;
  const legRight = legend.w ? 16 + legend.w + GAP : 0;
  const legBand = legend.h ? legend.h + 12 + GAP : PADB;
  /* The citizenship / dob panels float bottom-RIGHT over the same box and can be
     open in any view, so stepping right of the legend walks straight into them.
     Four placements, pick the one that leaves the largest cell: the panel can be
     cleared vertically (shorter grid) or horizontally (narrower grid), and which
     one wins depends on how tall the open panel happens to be. */
  const panBand = panel.h ? panel.h + 12 + GAP : 0;
  const panRight = panel.w ? panel.w + 16 + GAP : 0;
  const leftRight = Math.max(LBL, legRight + LBL);
  const cands = [
    { left: leftRight, w: size.w - leftRight - PADR, h: size.h - TOPL - Math.max(PADB, panBand) },
    { left: LBL, w: size.w - LBL - PADR, h: size.h - TOPL - Math.max(legBand, panBand) },
    { left: LBL, w: size.w - LBL - PADR - panRight, h: size.h - TOPL - legBand },
    { left: leftRight, w: size.w - leftRight - PADR - panRight, h: size.h - TOPL - PADB },
  ];
  const best = cands.reduce((a, c) => (Math.min(c.w, c.h) > Math.min(a.w, a.h) ? c : a));
  const left = best.left;
  const cell = Math.max(8, Math.min(best.w, best.h) / n);
  /* center in the leftover width so the grid does not hug the labels */
  const x0 = left + Math.max(0, (best.w - n * cell) / 2), y0 = TOPL;
  const m = mxMax(S.dir, S.cum);
  const col = S.dir === 'net' ? divScale(m) : seqScale(m, S.dir);
  const showNum = cell >= 22;
  const hl = S.pairHl;
  const hlR = hl ? MXORD.indexOf(hl[0]) : -1, hlC = hl ? MXORD.indexOf(hl[1]) : -1;
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
    gridRef.current?.querySelector<SVGRectElement>('.mxc[tabindex="0"]')?.focus();
  }, [fc]);
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
  /* Activating a cell unmounts the entire grid this cell lives in, so focus had
     nowhere to go and landed on <body> — restarting Tab from the top of the
     page. Hand it to the corridor card the drill just opened, which is the
     thing the user asked for. */
  const drill = (a: string, b: string) => {
    setS({ view: 'flow', sel: a, pair: b, flowSeen: true, playing: false });
    focusSoon('#pairX, #railList .rrow[data-iso="' + b + '"]');
  };
  /* keyboard focus must place the tip itself — moveTip otherwise replays the
     last pointer position, which has nothing to do with the focused cell */
  const onCellFocus = (e: ReactFocusEvent<SVGRectElement>, a: string, b: string) => {
    setCellFoc(true);
    setS({ pairHl: [a, b] });
    const r = e.currentTarget.getBoundingClientRect();
    moveTip({ clientX: r.right, clientY: r.bottom });
  };

  /* The label has to state the direction its own number describes. `mxCell` flips
     with Smjer, so a fixed "a → b" told a screen-reader user the exact opposite of
     the truth in Dolasci (the cell labelled "Grad Zagreb → Zagrebačka: 1.977"
     holds Zagrebačka → Grad Zagreb) and read a net balance as a directed flow in
     Neto. `#tip` is aria-hidden, so this string is all AT gets. Same separation of
     "what it points at" from "how it is worded" the rail already makes. */
  const cellAria = (a: string, b: string, v: number): string =>
    S.dir === 'net' ? `${D[a].n} ↔ ${D[b].n}: neto ${sgn(Math.round(v), fmtI)} za ${D[a].n}`
      : S.dir === 'in' ? `${D[b].n} → ${D[a].n}: ${fmtI.format(Math.round(v))}`
        : `${D[a].n} → ${D[b].n}: ${fmtI.format(Math.round(v))}`;

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
    setS({ pairHl: a && b ? [a, b] : null });
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
          x={x0 + c * cell} y={y0 + r * cell} width={cell} height={cell}
          fill="url(#mxhatch)" role="gridcell" tabIndex={-1} aria-colindex={c + 1}
          aria-label={`${D[a].n} — dijagonala: selidbe unutar iste županije nisu dio međužupanijske matrice`}
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
          <rect className="mxc" data-a={a} data-b={b}
            x={x0 + c * cell} y={y0 + r * cell} width={cell} height={cell}
            fill={col(S.dir === 'net' ? v : Math.abs(v))}
            stroke={isHl ? '#20262B' : '#fff'} strokeWidth={isHl ? 1.6 : 0.5}
            role="gridcell" tabIndex={isF ? 0 : -1} aria-colindex={c + 1}
            aria-label={cellAria(a, b, v)}
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
          {showNum && Math.abs(v) >= 1 && (
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
              textAnchor="middle" fontSize={Math.min(8.5, cell / 3)} fontFamily={MONO}
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
    <svg id="map" role="grid" aria-rowcount={n} aria-colcount={n}
      aria-label="Matrica međužupanijskih tokova — strelice pomiču odabir, Enter otvara koridor"
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
          <rect x={x0} y={y0 + hlR * cell} width={n * cell} height={cell} />
          <rect x={x0 + hlC * cell} y={y0} width={cell} height={n * cell} />
        </g>
      )}
      {BLOCKS.slice(0, -1).map(b => (
        <g key={'b' + b}>
          <line x1={x0 + b * cell} x2={x0 + b * cell} y1={y0} y2={y0 + n * cell} stroke="#20262B" strokeWidth={1.1} />
          <line x1={x0} x2={x0 + n * cell} y1={y0 + b * cell} y2={y0 + b * cell} stroke="#20262B" strokeWidth={1.1} />
        </g>
      ))}
      <rect x={x0} y={y0} width={n * cell} height={n * cell} fill="none" stroke="#20262B" strokeWidth={1.1} />
      {/* two-tone focus ring, above the block rules and the outline so it is not
          the one thing on the grid another stroke can hide */}
      {cellFoc && (
        <g className="focusring">
          <rect className="fr-halo" x={x0 + fc[1] * cell} y={y0 + fc[0] * cell} width={cell} height={cell} />
          <rect className="fr-ink" x={x0 + fc[1] * cell} y={y0 + fc[0] * cell} width={cell} height={cell} />
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
