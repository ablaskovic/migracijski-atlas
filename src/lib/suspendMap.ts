/* Suspend the map's own tab stops while an opaque panel is drawn over it.

   `inert` cannot do this job: one of the overlays' siblings is `svg#map`, an
   SVGSVGElement, and the attribute is an IDL property of HTMLElement — setting
   it there parses and does nothing at all (measured in Chrome: `svg.inert` is
   undefined where `div.inert` is false, and a focusable child of an inert <svg>
   still takes Tab). So the map's focusable content — 21 county paths, 556
   municipalities, 420 matrix cells, 588 Godine cells, all of it SVG — is
   suspended directly instead. Pointer use is untouched: tabindex -1 removes an
   element from the tab order, not from the page.

   The glossary had this and the three other opaque map overlays did not, though
   they are the same shape of problem. Measured against dist/ at 1000×800 with
   `elementFromPoint` at five points per feature: with "Državljanstvo" open,
   3 of 21 county paths are 100 % covered by the floating panel body — each one
   role="button", tabIndex 0, Enter-activatable, its two-tone focus ring drawn
   inside svg#map and therefore underneath the panel. With the JLS chip open in
   Tokovi, 6 of 21 are covered, the selected hub among them. In the JLS map with
   a chip panel open, 134 of 556 municipalities are covered outright and 22 more
   partly — and that view is arrow-navigated across all 556, so a reader walks
   134 consecutive features whose focus ring they cannot see. At 1440×900 the
   count is 0, which is why this reads as width-dependent rather than as absent:
   the same dependence the glossary's own fix was written for.

   The restore is idempotent on purpose. The write-back used to be
   unconditional, and above 900 px the glossary is deliberately non-modal, so the
   roving stop can move while an overlay is open — restoring a stale cell left
   two tabindex="0" cells in a roving-tabindex grid and froze its arrow keys. */
import { useEffect } from 'react';

export function useSuspendMapStops(active: boolean, key: string) {
  useEffect(() => {
    if (!active) return;
    const moved: [Element, string][] = [];
    for (const f of document.getElementById('map')?.querySelectorAll('[tabindex]:not([tabindex="-1"])') ?? []) {
      moved.push([f, f.getAttribute('tabindex')!]);
      f.setAttribute('tabindex', '-1');
    }
    return () => {
      /* …but idempotent was not enough, because the guard is true for exactly
         the cell it must not fire on. When the roving stop moves, React writes
         tabindex="-1" onto the cell it left — so the recorded "0" was written back
         beside the live stop. Measured at 1440×900 in Matrica, where the
         glossary is deliberately non-modal: open it, click a second cell, press
         Escape, and `.mxc[tabindex="0"]` is ["HR-21/HR-01", "HR-05/HR-21"]. Same
         on the JLS map with a chip open, where Shift+Tab from #labBtn then walks
         two municipalities in a row. The arrow-key freeze that note describes is
         gone — focus moved to identity — but the duplicate stop is not.
         A stop that appeared during the suspension is React's own answer to
         where the stop is, and it wins: no recorded "0" is restored beside it.
         Scoped to a stop that is NOT one of the suspended elements, so the
         county map — 21 paths that all carry tabIndex={0} — still restores all
         21 if React happens to have rewritten one of them. */
      const live = document.getElementById('map')?.querySelector('[tabindex="0"]');
      const moot = !!live && !moved.some(([el]) => el === live);
      moved.forEach(([el, v]) => {
        if (el.isConnected && el.getAttribute('tabindex') === '-1' && !(moot && v === '0')) {
          el.setAttribute('tabindex', v);
        }
      });
    };
    /* `key` carries whatever remounts the map's focusable content — the view,
       today. A view change mounts a whole new grid with fresh tabindex=0 cells,
       and none of these overlays is modal above 900 px, so the reader can switch
       views with one open: the cleanup restores the outgoing view's values (on
       nodes React has already dropped, harmlessly) and the incoming grid is
       suspended in the same pass. */
  }, [active, key]);
}
