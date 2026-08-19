import { useEffect, useRef, useState } from 'react';
import {
  D, SHORTN, YEARS, DOM, IX2007, val, yrsCols, yrsOrder, divScale, fmtI, fmtR, sgn,
} from '../lib/metrics.ts';
import { fitGrid } from '../lib/gridfit.ts';
import { moveTip, COARSE } from '../lib/tip.ts';
import { isKeyFocus } from '../lib/state.ts';
import type { useZoom } from '../lib/useZoom.ts';
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { L, yr } from '../lib/i18n.ts';
import type { Patch, State } from '../lib/types.ts';

/* Godine — 21 counties × the whole series, one cell per county-year.

   The gap this fills: the map showed one year for all counties, the detail card
   showed all years for one county, and nothing showed both. "When did Grad
   Zagreb stop gaining from the rest of Croatia" was a question you answered by
   scrubbing 28 times and holding 21 colours in your head. Here it is one row
   changing sign, next to the twenty rows that did not.

   Colour, domain and ramp are the map's — `DOM[flow+den+cum]` is already the max
   over every county and every rendered year for that combination, so a cell here
   and the map at that year are the same colour by construction, and switching
   Sastavnica re-colours both consistently. Renders as svg#map so both exporters
   work unchanged. */

const MONO = 'IBM Plex Mono,ui-monospace,monospace';

export default function YearsView({ S, setS, size, legend, panel, zoom }: {
  S: State; setS: (p: Patch) => void; size: { w: number; h: number };
  legend: { w: number; h: number }; panel: { w: number; h: number }; zoom: ReturnType<typeof useZoom>;
}) {
  const cols = yrsCols(S.cum);
  const order = yrsOrder(S.flow, S.den, cols);
  const nR = order.length, nC = cols.length;

  /* Year labels are short and rotated, so this needs far less head room than the
     matrix's rotated county names (90) — the grid gets the difference. */
  const LBL = 108, TOPL = 54, PADR = 14, PADB = 40;
  const box = fitGrid({ size, legend, panel, cols: nC, rows: nR, lbl: LBL, top: TOPL, padR: PADR, padB: PADB });
  /* Floors, like the matrix's: below these the grid overflows the box and the
     shared zoom/pan is what recovers it, which is better than cells too small to
     hit. Rows and columns get different floors because they carry different
     things — a row is a labelled county, a column is one year of 28. */
  const cw = Math.max(7, box.cw), ch = Math.max(10, box.ch);
  const x0 = box.left + Math.max(0, (box.w - nC * cw) / 2), y0 = TOPL;

  const m = DOM[S.flow + S.den + S.cum];
  const col = divScale(m);
  const rel = S.den !== 'abs';
  const fmt = (v: number) => rel ? sgn(v, fmtR) + ' %' : sgn(Math.round(v), fmtI);

  /* In-cell numbers when the cell is big enough for the widest value it holds —
       .mxnum is the class, so the export bakes the same white halo it bakes for
       the matrix (no ink/white threshold clears 4.5:1 on this ramp; see
       CLAUDE.md design tokens). Measured per cell rather than assumed: a
       cumulative −28.292 is nine glyphs where an annual −87 is three. */
  const numFs = Math.min(8.5, ch * 0.5, cw * 0.26);
  const showNum = cw >= 30 && ch >= 14 && numFs >= 6;
  const fitsNum = (s: string) => s.length * numFs * 0.6 <= cw - 3;

  const hl = S.yrHl;
  const hlR = hl ? order.indexOf(hl[0]) : -1;
  const hlC = hl ? cols.indexOf(hl[1]) : -1;
  /* A rail row names a county, not a cell, so it lights the whole row through
     the ordinary county highlight (`hl`) — which is also the only way to reach
     that row from the keyboard, since the rail rows are the tab stops here. */
  const hlRow = hlR >= 0 ? hlR : S.hl ? order.indexOf(S.hl) : -1;
  /* The selected year is a column here, and it is the same `S.yi` the scrubber,
     the map and every other view read — so this grid is also a year picker, and
     the marker has to be visibly the *selection* colour rather than another ink
     stroke that could be read as data. Teal, like the corridor mark in Matrica. */
  const selC = cols.indexOf(S.yi);

  const rowFs = Math.max(6.5, Math.min(9.5, ch * 0.62));
  const colFs = Math.max(6.5, Math.min(9, cw * 0.34));

  /* Roving tabindex — 588 tab stops would be hostile. Same grid pattern as the
     matrix, including the stopPropagation, without which App's window handler
     also steps the year on every arrow press. */
  const [fc, setFc] = useState<[number, number]>([0, 0]);
  const [cellFoc, setCellFoc] = useState(false);
  const navRef = useRef(false);
  const gridRef = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!navRef.current) return;
    navRef.current = false;
    gridRef.current?.querySelector<SVGRectElement>('.yrc[tabindex="0"]')?.focus();
  }, [fc]);
  /* Changing Sastavnica reorders the rows and changing mode drops nine columns,
     so a stop parked at [20, 27] can end up outside the grid it belongs to. */
  useEffect(() => {
    setFc(([r, c]) => [Math.min(r, nR - 1), Math.min(c, nC - 1)]);
  }, [nR, nC]);

  const moveF = (dr: number, dc: number) => {
    navRef.current = true;
    setFc(([r, c]) => {
      const nr = r + dr, nc = c + dc;
      return nr < 0 || nr >= nR || nc < 0 || nc >= nC ? [r, c] : [nr, nc];
    });
  };
  const pickYear = (yi: number) => { if (yi !== S.yi) setS({ yi }); };
  const onCellKey = (e: ReactKeyboardEvent<SVGRectElement>, yi: number) => {
    const d: Record<string, [number, number]> = {
      ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0],
    };
    if (d[e.key]) { e.preventDefault(); e.stopPropagation(); moveF(...d[e.key]); return; }
    /* 21×28 is ~47 presses corner to corner, and App scopes its own Home/End to
       #spark — so on a cell they did nothing at all. */
    const jump: Record<string, [number, number]> = {
      Home: e.ctrlKey ? [0, 0] : [-1, 0], End: e.ctrlKey ? [nR - 1, nC - 1] : [-1, nC - 1],
      PageUp: [0, -1], PageDown: [nR - 1, -1],
    };
    if (e.key in jump) {
      e.preventDefault(); e.stopPropagation();
      navRef.current = true;
      setFc(([r, c]) => {
        const j = jump[e.key];
        return [j[0] < 0 ? r : j[0], j[1] < 0 ? c : j[1]];
      });
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pickYear(yi); }
  };
  const onCellFocus = (e: ReactFocusEvent<SVGRectElement>, iso: string, yi: number) => {
    setS({ yrHl: [iso, yi] });
    /* a click focuses the cell too, and neither the keyboard ring nor the
       tip-jump belongs to a pointer that already did both (see isKeyFocus) */
    if (!isKeyFocus(e.currentTarget)) return;
    setCellFoc(true);
    const r = e.currentTarget.getBoundingClientRect();
    moveTip({ clientX: r.right, clientY: r.bottom });
  };

  /* Touch hit-testing, same argument as the matrix: a finger is ~40 px against a
     cell that is ~9 px wide on a phone, so most taps would land in a gap and read
     nothing. One overlay resolves the tap to the cell it fell in. */
  const pick = (ev: ReactPointerEvent<SVGRectElement>) => {
    const svg = ev.currentTarget.ownerSVGElement;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const gx = (ev.clientX - r.left - zoom.t.x) / zoom.t.k;
    const gy = (ev.clientY - r.top - zoom.t.y) / zoom.t.k;
    const c = Math.floor((gx - x0) / cw), rw = Math.floor((gy - y0) / ch);
    const inside = rw >= 0 && rw < nR && c >= 0 && c < nC;
    /* the same-value guard the matrix overlay documents: a new tuple per
       pointermove is a full reconciliation per pointermove */
    const cur = S.yrHl;
    const same = inside ? !!cur && cur[0] === order[rw] && cur[1] === cols[c] : !cur;
    if (!same) setS({ yrHl: inside ? [order[rw], cols[c]] : null });
    const { clientX, clientY } = ev;
    requestAnimationFrame(() => moveTip({ clientX, clientY }));
  };

  /* ARIA 1.2: gridcells must be owned by rows, or table navigation — the only
     practical way to read 588 cells — never engages. */
  const rows = [];
  for (let r = 0; r < nR; r++) {
    const iso = order[r];
    const cells = [];
    for (let c = 0; c < nC; c++) {
      const yi = cols[c];
      const v = val(iso, yi, S.flow, S.den, S.cum);
      const isF = fc[0] === r && fc[1] === c;
      const txt = fmt(v);
      cells.push(
        <g key={yi} role="presentation">
          <rect className="yrc" data-iso={iso} data-y={YEARS[yi]} vectorEffect="non-scaling-stroke"
            x={x0 + c * cw} y={y0 + r * ch} width={cw} height={ch}
            fill={col(v)} stroke="#fff" strokeWidth={0.5}
            role="gridcell" tabIndex={isF ? 0 : -1} aria-colindex={c + 1}
            /* the cell states its own county, year and value: #tip is
               aria-hidden, so this string is the only copy of the number */
            aria-label={`${D[iso].n}, ${yr(YEARS[yi])}: ${txt}`}
            onPointerEnter={() => setS({ yrHl: [iso, yi] })}
            onPointerLeave={() => { if (!COARSE) setS({ yrHl: null }); }}
            onPointerMove={moveTip}
            onFocus={e => onCellFocus(e, iso, yi)}
            onBlur={() => { setCellFoc(false); if (!COARSE) setS({ yrHl: null }); }}
            onKeyDown={e => onCellKey(e, yi)}
            /* pointer activation is fine-pointer only, for the reason the matrix
               documents: at ~9 px a tap that navigates is a tap that misfires */
            onClick={() => { if (!COARSE) pickYear(yi); }} />
          {showNum && fitsNum(txt) && (
            <text className="mxnum" x={x0 + c * cw + cw / 2} y={y0 + r * ch + ch / 2 + numFs * 0.35}
              textAnchor="middle" fontSize={numFs} fontFamily={MONO} fill="#20262B" pointerEvents="none">
              {txt}
            </text>
          )}
        </g>,
      );
    }
    rows.push(<g key={iso} role="row" aria-rowindex={r + 1} aria-label={D[iso].n}>{cells}</g>);
  }

  const preW = S.cum ? 0 : Math.max(0, (IX2007 - cols[0]) * cw);

  return (
    <svg id="map" role="grid" aria-rowcount={nR} aria-colcount={nC}
      aria-label={L('Županije kroz godine — strelice pomiču odabir, Enter postavlja godinu prikaza',
        'Counties over time — arrow keys move the selection, Enter sets the displayed year')}
      {...zoom.bind} style={zoom.style}>
      <defs>
        <pattern id="yrhatch" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line y2="5" stroke="#c8cdc6" strokeWidth="1" />
        </pattern>
      </defs>
      <g transform={`translate(${zoom.t.x},${zoom.t.y}) scale(${zoom.t.k})`} ref={gridRef}>
        {order.map((iso, r) => (
          <text key={iso} x={x0 - 6} y={y0 + r * ch + ch / 2 + 3} textAnchor="end"
            fontSize={rowFs} fontFamily={MONO}
            fontWeight={hlRow === r ? 600 : 400}
            fill={hlRow === r ? '#20262B' : '#5F6A72'}>{SHORTN[iso]}</text>
        ))}
        {cols.map((yi, c) => (
          <text key={yi} textAnchor="start"
            fontSize={colFs} fontFamily={MONO}
            fontWeight={hlC === c || cols[c] === S.yi ? 600 : 400}
            fill={cols[c] === S.yi ? '#0F7D8C' : hlC === c ? '#20262B' : '#5F6A72'}
            transform={`translate(${x0 + c * cw + cw / 2 + 3},${y0 - 6}) rotate(-60)`}>{yr(YEARS[yi])}</text>
        ))}
        {rows}
        {/* Pre-2007 is the softest part of the series and this is the first view
            that renders those years beside the rest instead of one at a time.
            Measured: the national inter-county margin Σ(ii) − Σ(oi) is −550…−490
            for 2002–06 and exactly 0 from 2007. The scrubber marks the same span
            with the same hatch, so the idiom is one a reader has already met. */}
        {preW > 0 && (
          <rect className="yrpre" x={x0} y={y0 - 5} width={preW} height={4}
            fill="url(#yrhatch)" pointerEvents="none" />
        )}
        {/* hover trace back to the axes — fill/stroke as attributes, not from a
            class, so the exported document needs no baking for it (the .mxband
            bar shipped as a solid black bar precisely because it took fill:none
            from a stylesheet that does not travel with the file) */}
        {hlRow >= 0 && (
          <g className="yrband" pointerEvents="none">
            <rect x={x0} y={y0 + hlRow * ch} width={nC * cw} height={ch}
              fill="none" stroke="#20262B" strokeWidth={1.1} opacity={0.5} vectorEffect="non-scaling-stroke" />
            {/* only a cell hover has a column to trace; a rail row does not */}
            {hlC >= 0 && (
              <rect x={x0 + hlC * cw} y={y0} width={cw} height={nR * ch}
                fill="none" stroke="#20262B" strokeWidth={1.1} opacity={0.5} vectorEffect="non-scaling-stroke" />
            )}
          </g>
        )}
        <rect x={x0} y={y0} width={nC * cw} height={nR * ch} fill="none" stroke="#20262B" strokeWidth={1.1}
          vectorEffect="non-scaling-stroke" />
        {/* the rule where the inter-county margins start closing */}
        {preW > 0 && (
          <line x1={x0 + preW} x2={x0 + preW} y1={y0} y2={y0 + nR * ch}
            stroke="#20262B" strokeWidth={1} strokeDasharray="3 3" opacity={0.55}
            vectorEffect="non-scaling-stroke" pointerEvents="none" />
        )}
        {/* the selected year, which every other view is showing */}
        {selC >= 0 && (
          <g className="yrsel" pointerEvents="none">
            <rect x={x0 + selC * cw} y={y0} width={cw} height={nR * ch}
              fill="none" stroke="#FFFFFF" strokeWidth={3.4} vectorEffect="non-scaling-stroke" />
            <rect x={x0 + selC * cw} y={y0} width={cw} height={nR * ch}
              fill="none" stroke="#0F7D8C" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
          </g>
        )}
        {cellFoc && (
          <g className="focusring">
            <rect className="fr-halo" x={x0 + fc[1] * cw} y={y0 + fc[0] * ch} width={cw} height={ch} vectorEffect="non-scaling-stroke" />
            <rect className="fr-ink" x={x0 + fc[1] * cw} y={y0 + fc[0] * ch} width={cw} height={ch} vectorEffect="non-scaling-stroke" />
          </g>
        )}
        {COARSE && (
          <rect className="yrhit" x={x0} y={y0} width={nC * cw} height={nR * ch}
            fill="transparent" onPointerDown={pick} onPointerMove={pick} />
        )}
      </g>
    </svg>
  );
}
