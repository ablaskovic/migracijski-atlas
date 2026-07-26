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
   rail row and the nearer target wins. */
export function focusSoon(sel: string) {
  requestAnimationFrame(() => {
    const el = document.querySelector(sel) as HTMLElement | SVGElement | null;
    el?.focus();
  });
}
