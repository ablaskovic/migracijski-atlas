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

/* …and the PER-EVENT answer, which is what most of the guards above actually
   want. Both flags are session-level, decided once at module init, and on a
   touch laptop, a Surface, or an iPad with a trackpad the primary pointer is the
   mouse: `COARSE` is false while a finger is still generating pointerType
   'touch'. Every JS touch affordance was therefore off on exactly the device
   class index.css serves the full 44 px coarse layout to.
   Measured on such a device at 1440×900: a tap on a matrix cell painted the
   readout Tooltip's own note calls "the only value readout" as a 238×118 panel
   at (0,0) over the app header, describing a cell 651 px away; the same tap in
   Godine gave a 260×272 panel at (0,0) and on a county in Saldo a 260×332 one —
   the tip that on a coarse pointer is deliberately dropped altogether. And the
   finger tap NAVIGATED, taking the hash from `#v=mx&c=1&y=2018` to
   `…&s=HR-18&pp=HR-09`, which is the drill-through the matrix documents as
   pointer-only because "a tap that navigates is a tap that misfires" on a
   15,7 px cell.
   Recorded from every pointerdown the document sees, in the capture phase, so a
   click handler — which carries no pointerType of its own — can ask what pressed
   it. One listener, one boolean. */
let touching = false;
export const wasTouch = (): boolean => touching;
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', e => { touching = e.pointerType === 'touch'; }, true);
}

let tipNode: HTMLDivElement | null = null;
/* last pointer position, kept even while the tip is hidden: it becomes visible
   one render *after* the pointer event that triggered it, so without this the
   first frame would paint at a stale offset (top-left of the page). */
let last: { clientX: number; clientY: number } | null = null;
export function setTipNode(n: HTMLDivElement | null) { tipNode = n; }

/* Re-place at the last known pointer position — called when the tip turns
   visible. `last` is null until something has moved or focused, and a no-op here
   leaves the tip at its static flow position; every caller that can turn the tip
   on from the keyboard therefore places it first. Kept as a guard rather than a
   fallback because a fallback would need a rect this module has no way to
   choose: the tip belongs to whatever summoned it. */
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
  /* …and it asked the SESSION flag, so on a touch laptop or a Surface — where
     the primary pointer is the mouse and index.css is already serving the full
     44 px coarse layout — a finger tap got the mouse placement, i.e. the readout
     back under the hand that summoned it. Measured at 1440×900 with a real
     touch tap on a matrix cell at y=349: the tip landed at top 363 px, 14 px
     below the finger, against 207 px above it on the same tap when the primary
     pointer is coarse. `wasTouch()` is the per-event answer this module already
     records for exactly this class of guard. It is last-press, not per-move, so
     a mouse hover straight after a tap keeps the touch placement until the next
     press — the same latch the drill guards already accept. */
  const coarse = COARSE || wasTouch();
  const pad = coarse ? 24 : 14, tw = tipNode.offsetWidth, th = tipNode.offsetHeight;
  let x = e.clientX + pad;
  let y = coarse ? e.clientY - th - pad : e.clientY + pad;
  if (x + tw > innerWidth - 6) x = e.clientX - tw - pad;
  if (coarse) { if (y < 6) y = e.clientY + pad; }
  else if (y + th > innerHeight - 6) y = e.clientY - th - pad;
  /* flipping can push it past the near edge on a narrow screen — clamp both ends
     so the tip is never partly outside the viewport (labels got cut off at 390) */
  x = Math.max(6, Math.min(x, innerWidth - tw - 6));
  y = Math.max(6, Math.min(y, innerHeight - th - 6));
  tipNode.style.left = x + 'px';
  tipNode.style.top = y + 'px';
}
