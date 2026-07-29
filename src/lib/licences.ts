/* ── Sources and licences, in one place ─────────────────────────────────────
   Same reasoning as credits.ts, applied to everything that is not the companion
   study. Three surfaces name these — the footer, the glossary and both export
   formats — and they used to name them as plain text, three times, with no link
   anywhere. Two problems with that.

   First, one of them is closer to an obligation than a courtesy: the measured
   2018 OD matrix and the whole JLS layer come from Pitoski et al. under
   **CC BY 4.0**, whose §3(a) asks for a URI or hyperlink to the material "to the
   extent reasonably practicable". On a web page it is practicable. OSM's own
   attribution guidance likewise asks for a link to its copyright page, and ODbL
   §4.3 wants the licence named — which the atlas did, without ever making it
   reachable.

   Second, none of it said what a reader may do with the artifact that actually
   leaves the app. An exported map is a **Produced Work** under ODbL §4.3, not a
   derived database, so share-alike does not reach it and the figure can carry
   its own terms as long as the attribution travels with it — which the export
   band already does. So the figures are CC BY 4.0: useful to the next
   researcher, and honest about what it is built from.

   The links are here rather than inline because the footer is a fixed lane
   above the map (every wrapped line costs the map ~13 px at 1440) and the
   glossary is where the same facts get room. One list, two renderings. */

export interface SourceLink { label: string; href: string; note: string }

/** The four upstream sources, in the order the footer already names them. */
export const SOURCES: SourceLink[] = [
  {
    label: 'Državni zavod za statistiku',
    href: 'https://podaci.dzs.hr/',
    note: 'tablice 7.4.1.–7.4.3. i STAN-2026-2-1 — uvjeti korištenja DZS-a',
  },
  {
    label: 'Pitoski i sur. (2021.)',
    href: 'https://doi.org/10.1186/s40649-021-00093-0',
    note: 'izmjereni tokovi 2018. (županije i JLS), CC BY 4.0',
  },
  {
    label: 'OpenStreetMap',
    href: 'https://www.openstreetmap.org/copyright',
    note: 'granice JLS (Overpass admin_level=7), ODbL 1.0',
  },
  {
    label: 'geoBoundaries',
    href: 'https://www.geoboundaries.org/',
    note: 'granice županija (ADM1, izvedeno iz OSM-a), ODbL 1.0',
  },
];

/* What the exported PNG/SVG may be used for. A rendered map is a Produced Work,
   so this is ours to set; CC BY 4.0 keeps it reusable in a paper or a slide
   without anyone having to ask, and the export band already carries every
   attribution that choice depends on. */
export const IMG_LICENCE = 'CC BY 4.0';
export const CODE_LICENCE = 'MIT';
export const FONT_LICENCE = 'SIL OFL 1.1';
/** Served from public/fonts, so a built site carries it (OFL §2). */
export const FONT_LICENCE_HREF = './fonts/OFL-IBMPlex.txt';

/* The export is the artifact that leaves the app and it has no link to click,
   so the terms go on it as text. Unconditional — every view's image carries the
   same licence, unlike the study line, which only the two views that reproduce
   the study's method may claim. */
export const exportLicenceLine = (): string =>
  `Slika: ${IMG_LICENCE} · kod: ${CODE_LICENCE} · podaci pod uvjetima izvora (DZS · Pitoski i sur. 2021. CC BY · granice ODbL)`;
