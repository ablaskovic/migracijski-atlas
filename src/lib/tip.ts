/* Tooltip cursor-follow positioning. Deliberately imperative (ref mutation on
   pointermove) so the tip tracks the cursor without a React re-render per event.
   Tooltip.tsx registers its node here; anything hoverable imports moveTip. */
/* Touch pointers deliver enter/leave inconsistently: county paths get a sticky
   enter with no leave, while JLS/matrix cells get a leave the instant the finger
   lifts. Neither maps onto hover, so both are special-cased against this flag —
   read once, since a device does not change input class mid-session. */
export const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;

let tipNode: HTMLDivElement | null = null;
/* last pointer position, kept even while the tip is hidden: it becomes visible
   one render *after* the pointer event that triggered it, so without this the
   first frame would paint at a stale offset (top-left of the page). */
let last: { clientX: number; clientY: number } | null = null;
export function setTipNode(n: HTMLDivElement | null) { tipNode = n; }

/* re-place at the last known pointer position — call when the tip turns visible */
export function placeTip() { if (last) moveTip(last); }

export function moveTip(e: { clientX: number; clientY: number }) {
  last = { clientX: e.clientX, clientY: e.clientY };
  if (!tipNode || !tipNode.classList.contains('show')) return;
  const pad = 14, tw = tipNode.offsetWidth, th = tipNode.offsetHeight;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + tw > innerWidth - 6) x = e.clientX - tw - pad;
  if (y + th > innerHeight - 6) y = e.clientY - th - pad;
  /* flipping can push it past the near edge on a narrow screen — clamp both ends
     so the tip is never partly outside the viewport (labels got cut off at 390) */
  x = Math.max(6, Math.min(x, innerWidth - tw - 6));
  y = Math.max(6, Math.min(y, innerHeight - th - 6));
  tipNode.style.left = x + 'px';
  tipNode.style.top = y + 'px';
}
