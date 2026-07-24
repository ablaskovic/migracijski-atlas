/* Tooltip cursor-follow positioning. Deliberately imperative (ref mutation on
   pointermove) so the tip tracks the cursor without a React re-render per event.
   Tooltip.tsx registers its node here; anything hoverable imports moveTip. */
let tipNode: HTMLDivElement | null = null;
export function setTipNode(n: HTMLDivElement | null) { tipNode = n; }
export function moveTip(e: { clientX: number; clientY: number }) {
  if (!tipNode || !tipNode.classList.contains('show')) return;
  const pad = 14, tw = tipNode.offsetWidth, th = tipNode.offsetHeight;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + tw > innerWidth - 6) x = e.clientX - tw - pad;
  if (y + th > innerHeight - 6) y = e.clientY - th - pad;
  tipNode.style.left = x + 'px';
  tipNode.style.top = y + 'px';
}
