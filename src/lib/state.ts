/* Shared app-state defaults. BASE lives here rather than in App.tsx because the
   permalink codec needs it too: encodeHash omits any field still at its default,
   so decodeHash can only tell "absent" from "explicitly set" by comparing against
   the same object App boots from. Keeping two copies is what let a Nalaz caption
   survive a link that no longer produced its numbers (see hash.ts). */
import { YEARS } from './metrics.ts';
import type { State } from './types.ts';

export const BASE: State = {
  view: 'saldo', flow: 'tot', den: 'abs', cum: true, yi: YEARS.indexOf(2024),
  thr: 4500, thrRel: false, thrPct: 1.5, playing: false, hl: null, sel: null,
  pair: null, pairHl: null, jlsHl: null, regHl: null, dir: 'net', flowSeen: false,
  labels: false, citz: false, jls: false, age: false, help: false,
  jlsTab: 'inter', citzTab: 'grp', ageTab: 'ext', story: null,
};

/* A Nalaz caption cites concrete numbers for one exact view, so the moment any of
   these move the caption is no longer describing what is on screen. A preset's
   own patch keys are added to this set at runtime (App.up), so Nalaz 4 — whose
   claim is about the Državljanstvo panel — also dies when that panel is closed,
   while a preset that never mentions a panel survives one being opened. */
export const STORY_KEYS = ['view', 'flow', 'den', 'cum', 'yi', 'dir', 'sel', 'pair', 'thr', 'thrRel', 'thrPct'] as const;

/* Closing a card unmounts the button that had focus, which drops focus to <body>
   and restarts Tab from the top of the page. Hand it instead to the control that
   owns whatever was just dismissed, on the frame after React flushes the state.
   Selector lists resolve in *document* order, so pass the map path before the
   rail row and the nearer target wins.
   Walk the matches rather than taking the first: `.focus()` on a display:none
   element is a silent no-op that leaves focus on <body> — the exact bug this
   helper exists to prevent. A stale `jl=1` in a permalink used to aim Escape at
   a `#jcardHd` that measured 0×0, and focus went nowhere. */
export function focusSoon(sel: string) {
  requestAnimationFrame(() => {
    for (const el of document.querySelectorAll<HTMLElement | SVGElement>(sel)) {
      if (!el.getClientRects().length) continue;   /* not rendered — cannot take focus */
      el.focus();
      if (document.activeElement === el) return;
    }
  });
}

/* Is this focus a *keyboard* focus? The two-tone rings are a keyboard affordance,
   and they used to be drawn from the `focus` event, which fires for a mouse click
   too: clicking a municipality painted the dashed ink ring meant for Tab, and at
   k = 4,1 that ring measured 18,5 px of white under 8,2 px of dashed ink (see the
   non-scaling-stroke note in index.css). `:focus-visible` is exactly this
   question, and Chrome answers it the way we need in both directions — measured:
   false after a real click on the element, true for a programmatic .focus(),
   which is how the suite drives it. Older engines without the pseudo throw on
   `matches`, and there the honest default is to keep the ring. */
export function isKeyFocus(el: Element): boolean {
  try { return el.matches(':focus-visible'); } catch { return true; }
}
