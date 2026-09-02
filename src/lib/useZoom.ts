/* Zoom + pan for the map and the matrix.

   Hand-rolled on Pointer Events rather than d3-zoom: that would pull in
   d3-selection/-drag/-transition and an imperative DOM layer this app does not
   otherwise use (d3 here is computation only — see metrics.ts). The transform
   is plain state, so React still owns every attribute it renders.

   Gesture split follows the usual rule for a map inside a scrolling page:
     touch    two fingers pinch/pan; one finger is left to the page so the
              document can still be scrolled with the map under the thumb
     pointer  wheel zooms about the cursor, drag pans
     keyboard + / − zoom about the centre of the box, 0 returns to 1×
   A drag shorter than DEAD px is not a pan, so county clicks and matrix taps
   survive the gesture.

   The keyboard set is not a nicety: without it the entire zoom feature was
   pointer-only (WCAG 2.1.1), and so was the county-label rule, which only reveals
   a small county's name once the *zoomed* bbox can hold it (MapView). */
import { useCallback, useEffect, useRef, useState } from 'react';

export type ZoomT = { k: number; x: number; y: number };
export const IDENT: ZoomT = { k: 1, x: 0, y: 0 };

const KMIN = 1, KMAX = 8, DEAD = 4;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* Keep the scaled content covering the viewport — no dragging it off-screen —
   and, where the content is TALLER than the viewport, let it be reached.

   `ch` is the drawn extent and `kmin` the scale at which all of it fits. Both
   used to be the viewport's own height and a flat 1, and three call sites
   promised that "the shared zoom/pan recovers an off-box grid" on the strength
   of it. It could not. Clamping `y` to `h − k*h` means a point at user-y `u`
   paints no higher than `k*u + h − k*h`, which exceeds `h` for every `u > h` at
   every `k ≥ 1` — so a row below the box moved further away the more you zoomed,
   and `panBy` is a no-op at k = 1. Measured at 1366×657 in Matrica, where the
   12 px cell floor makes the grid 321 px tall in a 260 px box: 14 of 21 rows on
   screen, and five zoom-ins with twenty pans down each took the last row's top
   from 330 px to 820 px, with 2 rows left. Six counties — Dubrovačko-neretvanska,
   Osječko-baranjska, Vukovarsko-srijemska, Brodsko-posavska, Požeško-slavonska,
   Virovitičko-podravska — were on the page, focusable, arrow-reachable, and
   unreachable by eye. At 1280×610 it was eleven.
   Now the pan bound follows the content, so k > 1 reaches the bottom rows, and
   the zoom floor follows it too, so one press of − shows the whole grid. Where
   the content fits the box both are what they were: `Math.min(0, …)` is 0 and
   `kmin` is 1. */
function fit(t: ZoomT, w: number, h: number, ch: number, kmin: number): ZoomT {
  const k = clamp(t.k, kmin, KMAX);
  return { k, x: clamp(t.x, w - k * w, 0), y: clamp(t.y, Math.min(0, h - k * ch), 0) };
}
/* zoom about a point: that point must stay put under the cursor/fingers/centre.
   One definition, shared by the wheel, the pinch, and the keyboard. */
function zoomTo(base: ZoomT, k2: number, px: number, py: number, w: number, h: number, ch: number, kmin: number): ZoomT {
  const k = clamp(k2, kmin, KMAX), r = k / base.k;
  return fit({ k, x: px - (px - base.x) * r, y: py - (py - base.y) * r }, w, h, ch, kmin);
}

/* `frozen` is the open glossary. The map's own keys are bare-key shortcuts like
   the year's, and a dialog that holds focus owns the keyboard: measured with the
   glossary open at 1440x900, "+" zoomed the map to 1,6x behind the overlay,
   where the reader could neither see it nor undo it without closing the dialog
   first. App's handler takes the same guard for the year and playback keys. */
export function useZoom(w: number, h: number, frozen = false) {
  const [t, setT] = useState<ZoomT>(IDENT);
  /* The drawn extent, reported by whatever is drawn — only Matrica and Godine
     can exceed their box, because they lay out on a fixed cell geometry with a
     12 px floor rather than fitting a projection to the box, so for them a short
     box is a crop. 0 means "no taller than the box", which is every map view. */
  const [contentH, setContentH] = useState(0);
  const ch = Math.max(h, contentH);
  const kmin = h > 0 && ch > h ? h / ch : KMIN;
  /* the wheel listener is bound imperatively and its effect does not re-run on
     every transform, so it reads the current k from here rather than closing
     over a stale one */
  const tRef = useRef(t); tRef.current = t;
  /* callback ref, not useRef: switching view (map ⇄ matrix) mounts a *new* svg,
     and a plain ref would leave the wheel/click listeners bound to the old one —
     which is why the matrix had no wheel zoom. State makes the effects re-run. */
  const [node, setNode] = useState<SVGSVGElement | null>(null);
  const ref = useCallback((el: SVGSVGElement | null) => setNode(el), []);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ ids: [number, number]; d: number; cx: number; cy: number; t: ZoomT } | null>(null);
  const drag = useRef<{ x: number; y: number; t: ZoomT; moved: boolean } | null>(null);
  /* a pan ends with a click on whatever path was under the cursor — swallow it,
     otherwise dragging the map also selects a county */
  const panned = useRef(false);
  /* Pointer capture, so a gesture survives the pointer leaving the box. The map
     box is ~570 px wide, so panning Istria to Vukovar at k = 4 routinely reaches
     its edge mid-drag — and the gesture died there with the button still held,
     because onPointerLeave was wired to onPointerUp. On touch a pinch aborted
     the moment one finger crossed the edge. Reads as a dead-feeling map rather
     than as an error.
     Taken when the gesture *becomes* one, never on pointerdown: while an element
     holds capture the click is dispatched to it rather than to the hit-test
     target, so capturing on press would have sent every county click to the svg
     and nothing would ever have been selected. Below DEAD px it is still a
     click, and above it the click is swallowed anyway. */
  const held = useRef(new Set<number>());
  const grab = (el: Element, id: number) => {
    if (held.current.has(id)) return;
    held.current.add(id);
    try { el.setPointerCapture(id); } catch { /* pointer already gone — still pans */ }
  };

  const reset = useCallback(() => setT(IDENT), []);
  /* a resize changes the clamp bounds — re-fit so content cannot end up adrift */
  useEffect(() => { setT(p => fit(p, w, h, ch, kmin)); }, [w, h, ch, kmin]);

  /* zoom about the centre of the box by a factor — the keyboard's shape */
  const zoomBy = useCallback((f: number) => {
    setT(cur => zoomTo(cur, cur.k * f, w / 2, h / 2, w, h, ch, kmin));
  }, [w, h, ch, kmin]);
  /* Pan by a fraction of the viewport. Zoom alone only ever magnifies the centre
     of the box, so from the keyboard Istria, Dubrovnik and Vukovar — and the
     county labels that only appear once a county is zoomed wide enough — were
     unreachable at k > 1. `fit` still clamps, so this cannot drag content off
     screen and is a no-op at k = 1. */
  const panBy = useCallback((fx: number, fy: number) => {
    setT(cur => (cur.k <= kmin && ch <= h ? cur : fit({ ...cur, x: cur.x + fx * w * 0.25, y: cur.y + fy * h * 0.25 }, w, h, ch, kmin)));
  }, [w, h, ch, kmin]);

  /* Keyboard equivalent of the wheel. Bound to the window rather than the svg:
     the map is not itself a tab stop (its 21 counties are), so there is no single
     element a user would have focused to "be on the map" — and the transform is
     global to the view anyway. Text inputs and browser page zoom keep their keys. */
  useEffect(() => {
    if (!w || !h) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (frozen) return;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.6); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(1 / 1.6); }
      else if (e.key === '0') { e.preventDefault(); setT(IDENT); }
      /* Shift+arrows pan. Bare arrows belong to the year scrubber, so the pan
         keys have to be a chord; App's year handler skips shifted arrows. */
      else if (e.shiftKey && e.key === 'ArrowLeft') { e.preventDefault(); panBy(1, 0); }
      else if (e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); panBy(-1, 0); }
      else if (e.shiftKey && e.key === 'ArrowUp') { e.preventDefault(); panBy(0, 1); }
      else if (e.shiftKey && e.key === 'ArrowDown') { e.preventDefault(); panBy(0, -1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [w, h, zoomBy, panBy, frozen]);

  /* wheel must be non-passive to preventDefault, so it is bound imperatively */
  useEffect(() => {
    const el = node;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      /* Ctrl/Cmd+wheel is the browser's page zoom, and it is the same chord the
         keyboard half of this file already yields at line 103 for the same
         stated reason. Swallowing it here took the universal desktop page-zoom
         gesture away from a low-vision reader whenever the cursor happened to be
         over the map — while Ctrl+'+' kept working — so one file implemented
         "browser page zoom keep their keys" for the keyboard and broke it for
         the wheel. A trackpad pinch also arrives as a ctrlKey wheel and is given
         up with it: the pinch handler already covers touch, and the plain-wheel
         path covers every mouse. */
      if (e.ctrlKey || e.metaKey) return;
      /* Below 900 px the body is the scroller (index.css), and so is a 1440 px
         window at 200 % browser zoom — the app's own documented band. Claiming
         the wheel there left the gesture dead over more than half the viewport:
         scrolling down neither scrolled nor zoomed, because k was already KMIN,
         and scrolling up zoomed the map instead of reaching the rail, the
         timeline and the footer. Same guard App's Space handler takes — hand the
         wheel back when the page has somewhere to go and the zoom has none. */
      const canScroll = document.documentElement.scrollHeight > window.innerHeight + 1;
      if (canScroll && (e.deltaY > 0 ? tRef.current.k <= kmin : tRef.current.k >= KMAX)) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setT(cur => zoomTo(cur, cur.k * Math.pow(2, -e.deltaY / 400), e.clientX - r.left, e.clientY - r.top, w, h, ch, kmin));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    /* capture phase: stop the click before it reaches any county/cell handler */
    const onClick = (e: MouseEvent) => {
      if (!panned.current) return;
      panned.current = false;
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener('click', onClick, true);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('click', onClick, true);
    };
  }, [w, h, ch, kmin, node]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = node!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    /* Only the primary button pans. Without the filter a right-button drag
       moved the map, so the context menu opened over a map that had shifted
       under it — and a middle-button drag panned instead of autoscrolling. */
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    panned.current = false;   /* a fresh gesture starts as a click until it moves */
    pts.current.set(e.pointerId, local(e));
    if (pts.current.size === 2) {
      const [ia, ib] = [...pts.current.keys()];
      const [a, b] = [...pts.current.values()];
      /* Record WHICH two pointers the gesture is between, not just that there
         were two. With a third finger down and one of the first two lifted,
         `size` returns to 2 over a different pair, and the move handler kept
         measuring against the original `d` — so the zoom jumped by the ratio
         between two unrelated finger spans. Identity is what a gesture is. */
      gesture.current = { ids: [ia, ib], d: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, t };
      drag.current = null;
    } else if (pts.current.size === 1 && e.pointerType !== 'touch') {
      const p = local(e);
      drag.current = { x: p.x, y: p.y, t, moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, local(e));
    const g = gesture.current;
    if (g && g.ids.every(id => pts.current.has(id))) {
      const a = pts.current.get(g.ids[0])!, b = pts.current.get(g.ids[1])!;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (!d || !g.d) return;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const k = clamp(g.t.k * (d / g.d), kmin, KMAX), r = k / g.t.k;
      panned.current = true;
      grab(e.currentTarget, e.pointerId);
      /* zoom about the pinch centre and follow it as the fingers travel — not
         zoomTo(), whose anchor is fixed: here cx/cy drift away from g.cx/g.cy */
      setT(fit({ k, x: cx - (g.cx - g.t.x) * r, y: cy - (g.cy - g.t.y) * r }, w, h, ch, kmin));
      return;
    }
    const dr = drag.current;
    if (dr) {
      const p = local(e);
      const dx = p.x - dr.x, dy = p.y - dr.y;
      if (!dr.moved && Math.hypot(dx, dy) < DEAD) return;
      dr.moved = true;
      panned.current = true;
      grab(e.currentTarget, e.pointerId);
      setT(fit({ k: dr.t.k, x: dr.t.x + dx, y: dr.t.y + dy }, w, h, ch, kmin));
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (held.current.delete(e.pointerId)) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    }
    pts.current.delete(e.pointerId);
    /* the gesture ends when either of ITS OWN pointers goes, not when the count
       happens to drop below two */
    if (gesture.current && !gesture.current.ids.every(id => pts.current.has(id))) gesture.current = null;
    if (!pts.current.size) drag.current = null;
  };

  /* No onPointerLeave: with capture the pointer cannot leave mid-gesture, and
     mapping leave to up is what *actively ended* a pan the moment the cursor
     crossed the box edge. pointercancel still covers the browser claiming the
     gesture as a page scroll. */
  const bind = {
    ref, onPointerDown, onPointerMove, onPointerUp,
    onPointerCancel: onPointerUp,
  };
  /* pan-y keeps one-finger page scrolling alive; pinch still reaches us */
  const style = { touchAction: 'pan-y' as const, cursor: t.k > 1 ? 'grab' : undefined };
  /* `zoomed` gates the readout and the "vrati na početni prikaz" button, so it
     has to mean "not at 1×" rather than "magnified": zoomed OUT to see a whole
     grid is a state the reader needs the same way back from. The grab cursor
     stays on k > 1 alone, since below 1 there is nothing to pan. */
  return { t, bind, style, reset, zoomBy, panBy, setContentH, zoomed: Math.abs(t.k - 1) > 0.001 };
}
