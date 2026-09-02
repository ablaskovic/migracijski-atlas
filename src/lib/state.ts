/* Shared app-state defaults. BASE lives here rather than in App.tsx because the
   permalink codec needs it too: encodeHash omits any field still at its default,
   so decodeHash can only tell "absent" from "explicitly set" by comparing against
   the same object App boots from. Keeping two copies is what let a Nalaz caption
   survive a link that no longer produced its numbers (see hash.ts). */
import { YEARS } from './metrics.ts';
import { detectLang, storedLang } from './i18n.ts';
import type { Den, Flow, State, View } from './types.ts';

/* The one field whose default is not a constant. It has to be resolved here
   rather than in App, because "omitted from the hash" means "equal to BASE" —
   so if BASE said `hr` while the reader's default was English, every English
   visitor would carry `l=en` in their URL forever, and a link they shared would
   force English on a Croatian reader. Resolved once, at module init:
   a stored choice beats the browser's, and decodeHash beats both, so an
   explicitly shared `l=` still wins over everything. */
export const BASE: State = {
  lang: storedLang() ?? detectLang(),
  view: 'saldo', flow: 'tot', den: 'abs', cum: true, yi: YEARS.indexOf(2024),
  thr: 4500, thrRel: false, thrPct: 1.5, playing: false, hl: null, sel: null,
  pair: null, pairHl: null, yrHl: null, jlsHl: null, regHl: null, dir: 'net', flowSeen: false,
  labels: false, citz: false, jls: false, age: false, help: false,
  jlsTab: 'inter', citzTab: 'grp', ageTab: 'ext', story: null,
};

/* A Nalaz caption cites concrete numbers for one exact view, so the moment any of
   these move the caption is no longer describing what is on screen. A preset's
   own patch keys are added to this set at runtime (App.up), so Nalaz 4 — whose
   claim is about the Državljanstvo panel — also dies when that panel is closed,
   while a preset that never mentions a panel survives one being opened. */
/* The four views that read their own metric and ignore Sastavnica/Vrijednosti:
   `klasOf` hardcodes `val(iso, yi, 'tot', 'abs', true)`, and `flowOf`, `mxCell`
   and `jlsVal` take neither argument. Both controls are disabled in all four,
   which is exactly why a lens must not be able to sit behind them — see the
   repair in hash.ts and the clamp in App.setView. */
export const LOCK_FD = new Set<View>(['klas', 'flow', 'mx', 'jmap']);

/* …and what those disabled groups should report while they are locked, which is
   the metric the view actually draws rather than whatever the reader last chose
   elsewhere. Corridors are moves within Croatia — the legends say so outright
   ("Samo preseljenja unutar RH", "međužupanijska matrica") — so their lens is
   `int`, while Klasifikacija classifies on total migration. Derived for display
   only, never stored: storing `int` would put `f=int` back into every shared
   corridor link, which is the carried flag this whole repair removes. */
export const EFF_FD: Record<string, { flow: Flow; den: Den }> = {
  klas: { flow: 'tot', den: 'abs' },
  flow: { flow: 'int', den: 'abs' },
  mx: { flow: 'int', den: 'abs' },
  jmap: { flow: 'int', den: 'abs' },
};

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
