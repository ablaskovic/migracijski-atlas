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

/* keep the scaled content covering the viewport — no dragging it off-screen */
function fit(t: ZoomT, w: number, h: number): ZoomT {
  const k = clamp(t.k, KMIN, KMAX);
  return { k, x: clamp(t.x, w - k * w, 0), y: clamp(t.y, h - k * h, 0) };
}
/* zoom about a point: that point must stay put under the cursor/fingers/centre.
   One definition, shared by the wheel, the pinch, and the keyboard. */
function zoomTo(base: ZoomT, k2: number, px: number, py: number, w: number, h: number): ZoomT {
  const k = clamp(k2, KMIN, KMAX), r = k / base.k;
  return fit({ k, x: px - (px - base.x) * r, y: py - (py - base.y) * r }, w, h);
}

export function useZoom(w: number, h: number) {
  const [t, setT] = useState<ZoomT>(IDENT);
  /* callback ref, not useRef: switching view (map ⇄ matrix) mounts a *new* svg,
     and a plain ref would leave the wheel/click listeners bound to the old one —
     which is why the matrix had no wheel zoom. State makes the effects re-run. */
  const [node, setNode] = useState<SVGSVGElement | null>(null);
  const ref = useCallback((el: SVGSVGElement | null) => setNode(el), []);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ d: number; cx: number; cy: number; t: ZoomT } | null>(null);
  const drag = useRef<{ x: number; y: number; t: ZoomT; moved: boolean } | null>(null);
  /* a pan ends with a click on whatever path was under the cursor — swallow it,
     otherwise dragging the map also selects a county */
  const panned = useRef(false);

  const reset = useCallback(() => setT(IDENT), []);
  /* a resize changes the clamp bounds — re-fit so content cannot end up adrift */
  useEffect(() => { setT(p => (p.k === 1 ? p : fit(p, w, h))); }, [w, h]);

  /* zoom about a point, absolute scale — the pinch handler's shape */
  const zoomAt = useCallback((k2: number, px: number, py: number) => {
    setT(cur => zoomTo(cur, k2, px, py, w, h));
  }, [w, h]);
  /* zoom about the centre of the box by a factor — the keyboard's shape */
  const zoomBy = useCallback((f: number) => {
    setT(cur => zoomTo(cur, cur.k * f, w / 2, h / 2, w, h));
  }, [w, h]);

  /* Keyboard equivalent of the wheel. Bound to the window rather than the svg:
     the map is not itself a tab stop (its 21 counties are), so there is no single
     element a user would have focused to "be on the map" — and the transform is
     global to the view anyway. Text inputs and browser page zoom keep their keys. */
  useEffect(() => {
    if (!w || !h) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.6); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(1 / 1.6); }
      else if (e.key === '0') { e.preventDefault(); setT(IDENT); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [w, h, zoomBy]);

  /* wheel must be non-passive to preventDefault, so it is bound imperatively */
  useEffect(() => {
    const el = node;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setT(cur => zoomTo(cur, cur.k * Math.pow(2, -e.deltaY / 400), e.clientX - r.left, e.clientY - r.top, w, h));
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
  }, [w, h, node]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = node!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    panned.current = false;   /* a fresh gesture starts as a click until it moves */
    pts.current.set(e.pointerId, local(e));
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      gesture.current = { d: Math.hypot(a.x - b.x, a.y - b.y),
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
    if (g && pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (!d || !g.d) return;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const k = clamp(g.t.k * (d / g.d), KMIN, KMAX), r = k / g.t.k;
      panned.current = true;
      /* zoom about the pinch centre and follow it as the fingers travel — not
         zoomTo(), whose anchor is fixed: here cx/cy drift away from g.cx/g.cy */
      setT(fit({ k, x: cx - (g.cx - g.t.x) * r, y: cy - (g.cy - g.t.y) * r }, w, h));
      return;
    }
    const dr = drag.current;
    if (dr) {
      const p = local(e);
      const dx = p.x - dr.x, dy = p.y - dr.y;
      if (!dr.moved && Math.hypot(dx, dy) < DEAD) return;
      dr.moved = true;
      panned.current = true;
      setT(fit({ k: dr.t.k, x: dr.t.x + dx, y: dr.t.y + dy }, w, h));
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) gesture.current = null;
    if (!pts.current.size) drag.current = null;
  };

  const bind = {
    ref, onPointerDown, onPointerMove, onPointerUp,
    onPointerCancel: onPointerUp, onPointerLeave: onPointerUp,
  };
  /* pan-y keeps one-finger page scrolling alive; pinch still reaches us */
  const style = { touchAction: 'pan-y' as const, cursor: t.k > 1 ? 'grab' : undefined };
  return { t, bind, style, reset, zoomAt, zoomBy, zoomed: t.k > 1 };
}
