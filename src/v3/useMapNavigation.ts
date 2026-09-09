import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';

interface View { zoom: number; x: number; y: number }
interface Point { x: number; y: number; clientX: number; clientY: number; target: Element }
const MAX_ZOOM = 2.5;

export default function useMapNavigation(width: number, height: number) {
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const current = useRef(view);
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, Point>());
  const suppressClick = useRef(false);
  const gesture = useRef<{ view: View; x: number; y: number; distance: number; clientX: number; clientY: number } | null>(null);
  const update = useCallback((next: View) => {
    const zoom = Math.max(1, Math.min(MAX_ZOOM, next.zoom));
    const x = Math.max(-(zoom - 1) * width / 2, Math.min((zoom - 1) * width / 2, next.x));
    const y = Math.max(-(zoom - 1) * height / 2, Math.min((zoom - 1) * height / 2, next.y));
    current.current = { zoom, x, y };
    setView(current.current);
  }, [width, height]);
  const local = (clientX: number, clientY: number) => {
    const matrix = svg.current?.getScreenCTM();
    return matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : null;
  };
  const zoomTo = useCallback((zoom: number, x = width / 2, y = height / 2) => {
    const old = current.current;
    zoom = Math.max(1, Math.min(MAX_ZOOM, zoom));
    update({ zoom, x: x - width / 2 - (x - width / 2 - old.x) * zoom / old.zoom,
      y: y - height / 2 - (y - height / 2 - old.y) * zoom / old.zoom });
  }, [width, height, update]);
  const cancel = useCallback(() => {
    const captured = [...pointers.current];
    pointers.current.clear();
    gesture.current = null;
    suppressClick.current = true;
    setDragging(false);
    for (const [id, p] of captured) if (p.target.hasPointerCapture(id)) p.target.releasePointerCapture(id);
  }, []);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      // Browser zoom, including trackpad pinch synthesized as Ctrl+wheel, stays native.
      if (e.ctrlKey) return;
      e.preventDefault();
      if (pointers.current.size) return;
      const p = local(e.clientX, e.clientY);
      if (!p) return;
      const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1);
      zoomTo(current.current.zoom * Math.exp(-Math.max(-1000, Math.min(1000, pixels)) * .002), p.x, p.y);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('blur', cancel);
    return () => { el.removeEventListener('wheel', wheel); window.removeEventListener('blur', cancel); cancel(); };
  }, [zoomTo, cancel]);
  const rebase = () => {
    const [a, b] = [...pointers.current.values()];
    gesture.current = a ? { view: current.current, x: b ? (a.x + b.x) / 2 : a.x,
      y: b ? (a.y + b.y) / 2 : a.y, distance: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0,
      clientX: a.clientX, clientY: a.clientY } : null;
  };
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || pointers.current.size >= 2) return false;
    const p = local(e.clientX, e.clientY);
    if (!p) return false;
    if (!pointers.current.size) suppressClick.current = false;
    const target = e.target as Element;
    pointers.current.set(e.pointerId, { x: p.x, y: p.y, clientX: e.clientX, clientY: e.clientY, target });
    // Capture on the original hit target so a tap still produces its county click.
    target.setPointerCapture(e.pointerId);
    rebase();
    if (pointers.current.size === 2) { suppressClick.current = true; setDragging(true); }
    return suppressClick.current;
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const point = pointers.current.get(e.pointerId), start = gesture.current;
    if (!point || !start) return false;
    const p = local(e.clientX, e.clientY);
    if (!p) return false;
    Object.assign(point, { x: p.x, y: p.y, clientX: e.clientX, clientY: e.clientY });
    const [a, b] = [...pointers.current.values()];
    if (!suppressClick.current && Math.hypot(a.clientX - start.clientX, a.clientY - start.clientY) <= 5) return false;
    suppressClick.current = true;
    setDragging(true);
    e.preventDefault();
    const zoom = b && start.distance > 0 ? Math.max(1, Math.min(MAX_ZOOM, start.view.zoom * Math.hypot(a.x - b.x, a.y - b.y) / start.distance)) : start.view.zoom;
    const x = b ? (a.x + b.x) / 2 : a.x, y = b ? (a.y + b.y) / 2 : a.y;
    update({ zoom, x: x - width / 2 - (start.x - width / 2 - start.view.x) * zoom / start.view.zoom,
      y: y - height / 2 - (start.y - height / 2 - start.view.y) * zoom / start.view.zoom });
    return true;
  };
  const onPointerEnd = (e: PointerEvent<SVGSVGElement>) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    pointers.current.delete(e.pointerId);
    if (e.type !== 'pointerup') suppressClick.current = true;
    if (p.target.hasPointerCapture(e.pointerId)) p.target.releasePointerCapture(e.pointerId);
    rebase();
    if (!pointers.current.size) setDragging(false);
  };
  const reset = () => { cancel(); update({ zoom: 1, x: 0, y: 0 }); };
  const reveal = (target: SVGGraphicsElement) => {
    const clip = svg.current?.getBoundingClientRect(), box = target.getBoundingClientRect();
    if (clip && (box.right <= clip.left || box.left >= clip.right || box.bottom <= clip.top || box.top >= clip.bottom)) reset();
  };
  return { svg, ...view, dragging, suppressClick, onPointerDown, onPointerMove, onPointerEnd,
    zoomIn: () => zoomTo(current.current.zoom + .5), zoomOut: () => zoomTo(current.current.zoom - .5),
    reset, reveal, maxZoom: MAX_ZOOM };
}
