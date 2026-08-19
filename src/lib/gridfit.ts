/* Where a full-bleed grid may sit inside the map box.

   Two views draw a grid over the whole box instead of a map: Matrica (21×21
   counties) and Godine (21 counties × the rendered years). Both have the same
   problem and it is not the one a map has. The legend floats bottom-left and the
   chip dock bottom-right of `.map-box`; over a map those land on sea, but over a
   grid every pixel is data, so the grid has to be laid out *around* them.

   Clearing a floating panel vertically alone is not enough — measured on the
   matrix, shortening the grid to clear the dock crushed the cell to the 8 px
   floor, while stepping left of it left far more room. So all four placements are
   tried and the one that yields the biggest cell wins:

     0  right of the legend, above the dock
     1  full width, above whichever of legend/dock is taller
     2  full width minus the dock, above the legend
     3  right of the legend, minus the dock, plain bottom margin

   The objective is `min(cellW, cellH)`, not `min(w, h)`: a 21×28 grid and a 21×21
   grid want different boxes out of the same four candidates, and for the square
   case the two objectives are identical (both divide by the same n), so the
   matrix keeps exactly the geometry it was verified with.

   `legend` / `panel` are the measured boxes MapView observes; a zero means "not
   on screen", not "unmeasured yet" — the caller passes {0,0} in both cases and
   the fallbacks below are the plain margins. */

export interface Box { left: number; w: number; h: number; cw: number; ch: number }

export function fitGrid(opts: {
  size: { w: number; h: number };
  legend: { w: number; h: number };
  panel: { w: number; h: number };
  cols: number; rows: number;
  /* room reserved for the row labels hanging left of the grid, and for the
     column labels above it — rotated county names need far more than years do */
  lbl: number; top: number; padR: number; padB: number;
  /* the documented cell floor. Not a clamp on the result — the caller still
     floors — but a tie-break: see the fallback below. */
  min?: number;
}): Box {
  const { size, legend, panel, cols, rows, lbl, top, padR, padB, min = 0 } = opts;
  const GAP = 10;
  const legRight = legend.w ? 16 + legend.w + GAP : 0;
  const legBand = legend.h ? legend.h + 12 + GAP : padB;
  const panBand = panel.h ? panel.h + 12 + GAP : 0;
  const panRight = panel.w ? panel.w + 16 + GAP : 0;
  const leftRight = Math.max(lbl, legRight + lbl);
  const cands = [
    { left: leftRight, w: size.w - leftRight - padR, h: size.h - top - Math.max(padB, panBand) },
    { left: lbl, w: size.w - lbl - padR, h: size.h - top - Math.max(legBand, panBand) },
    { left: lbl, w: size.w - lbl - padR - panRight, h: size.h - top - legBand },
    { left: leftRight, w: size.w - leftRight - padR - panRight, h: size.h - top - padB },
  ];
  const cellOf = (c: { w: number; h: number }) => Math.min(c.w / cols, c.h / rows);
  let best = cands.reduce((a, c) => (cellOf(c) > cellOf(a) ? c : a));
  /* When no placement reaches the floor the caller floors the cell anyway and the
     grid overflows its box — the documented trade, recovered by the shared
     zoom/pan, and better than cells too small to hit. But *which* placement it
     overflows out of then matters: the two candidates that keep their full
     height are the ones that step LEFT of the chip dock, so the overflow runs
     down past the legend rather than sideways under an opaque panel. Choosing on
     `min(cellW, cellH)` alone picked a placement whose overflow landed under the
     dock, which is how cells become unreachable rather than merely off-box. */
  if (min > 0 && cellOf(best) < min) {
    const clear = [cands[2], cands[3]].filter(c => c.w > 0 && c.h > 0);
    if (clear.length) best = clear.reduce((a, c) => (cellOf(c) > cellOf(a) ? c : a));
  }
  return { left: best.left, w: best.w, h: best.h, cw: best.w / cols, ch: best.h / rows };
}
