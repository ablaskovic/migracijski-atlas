/* Tooltip cursor-follow positioning. Deliberately imperative (ref mutation on
   pointermove) so the tip tracks the cursor without a React re-render per event.
   Tooltip.tsx registers its node here; anything hoverable imports moveTip. */
/* Touch pointers deliver enter/leave inconsistently: county paths get a sticky
   enter with no leave, while JLS/matrix cells get a leave the instant the finger
   lifts. Neither maps onto hover, so both are special-cased against this flag —
   read once, since a device does not change input class mid-session. */
export const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
/* …and the OTHER coarse question, which is the one index.css asks. Every 44 px
   touch token lives under `any-pointer:coarse` — true when any available input
   is coarse — while the flag above is `pointer:coarse`, the PRIMARY input. On a
   touch laptop or a Surface those two disagree: the tokens double and a
   threshold keyed on the flag above does not, so MapView's claim that "the class
   and the CSS cannot disagree about which pointer this is" was false on exactly
   the devices where a thumb reaches the controls. Kept separate rather than
   widened, because the tap semantics above are genuinely about the primary
   pointer: a mouse user on a touch laptop should keep the hover tooltip. */
export const TOKENS_COARSE = typeof matchMedia === 'function' && matchMedia('(any-pointer:coarse)').matches;

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
  /* Above the contact point on touch, below the cursor on a mouse. The fixed
     +14 px put the readout under the hand that summoned it: measured on a
     390×844 coarse device in Matrica, a tap at (362,234) drew a 260×183 panel at
     (88,248) — top edge exactly 14 px below the finger — and a tap at (242,354)
     drew it at (6,368). The old rule only ever flipped upward when the tip would
     overflow the bottom of the viewport, so anywhere in the upper two thirds of
     the grid the reader had to lift their hand and lean to read it, and Tooltip
     documents that on a coarse pointer this tip IS the only value readout for
     Matrica and the JLS map. COARSE is exported from this very module and
     consulted by four components; the placement never asked. The larger pad
     clears the contact patch itself. */
  const pad = COARSE ? 24 : 14, tw = tipNode.offsetWidth, th = tipNode.offsetHeight;
  let x = e.clientX + pad;
  let y = COARSE ? e.clientY - th - pad : e.clientY + pad;
  if (x + tw > innerWidth - 6) x = e.clientX - tw - pad;
  if (COARSE) { if (y < 6) y = e.clientY + pad; }
  else if (y + th > innerHeight - 6) y = e.clientY - th - pad;
  /* flipping can push it past the near edge on a narrow screen — clamp both ends
     so the tip is never partly outside the viewport (labels got cut off at 390) */
  x = Math.max(6, Math.min(x, innerWidth - tw - 6));
  y = Math.max(6, Math.min(y, innerHeight - th - 6));
  tipNode.style.left = x + 'px';
  tipNode.style.top = y + 'px';
}
