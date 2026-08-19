import { L } from './i18n.ts';
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
/* A function, not a const array. `note` is language-dependent, and this module's
   body runs at import time — before App.tsx's own module scope calls setLang —
   so a const would have frozen every note in whatever language happened to be
   the default, and would never have followed the toggle afterwards. `label` and
   `href` are identifiers and stay put. */
/* `label` was described as an identifier and left untranslated, but two of the
   four are prose: "i sur." is Croatian for "et al.", and the English footer and
   export credit of the same build say "Pitoski et al. 2021" and "CBS" while the
   English glossary said "Pitoski i sur. (2021.)" and "Državni zavod za
   statistiku". The organisation's own English name and the standard English
   abbreviation are what a reader can look up; the DOI and the URL, which are the
   real identifiers, do not move. */
const SRC = (): SourceLink[] => [
  {
    label: L('Državni zavod za statistiku', 'Croatian Bureau of Statistics'),
    href: 'https://podaci.dzs.hr/',
    note: L('tablice 7.4.1.–7.4.3. i STAN-2026-2-1 — uvjeti korištenja DZS-a',
      'tables 7.4.1.–7.4.3. and STAN-2026-2-1 — CBS terms of use'),
  },
  {
    label: L('Pitoski i sur. (2021.)', 'Pitoski et al. (2021)'),
    href: 'https://doi.org/10.1186/s40649-021-00093-0',
    note: L('izmjereni tokovi 2018. (županije i JLS), CC BY 4.0',
      'measured 2018 flows (counties and LAUs), CC BY 4.0'),
  },
  {
    label: 'OpenStreetMap',
    href: 'https://www.openstreetmap.org/copyright',
    note: L('granice JLS (Overpass admin_level=7), ODbL 1.0',
      'LAU boundaries (Overpass admin_level=7), ODbL 1.0'),
  },
  {
    label: 'geoBoundaries',
    href: 'https://www.geoboundaries.org/',
    note: L('granice županija (ADM1, izvedeno iz OSM-a), ODbL 1.0',
      'county boundaries (ADM1, derived from OSM), ODbL 1.0'),
  },
];
/** The four upstream sources, in the order the footer already names them. */
export const sources = SRC;

/* What the exported PNG/SVG may be used for. A rendered map is a Produced Work,
   so this is ours to set; CC BY 4.0 keeps it reusable in a paper or a slide
   without anyone having to ask, and the export band already carries every
   attribution that choice depends on. */
export const IMG_LICENCE = 'CC BY 4.0';
export const CODE_LICENCE = 'MIT';
export const FONT_LICENCE = 'SIL OFL 1.1';
/* Two copyright holders, so two files. One link for three families from two
   holders was both wrong and the reason public/fonts/OFL-Oswald.txt shipped with
   nothing on the site reaching it — OFL §2 requires the licence to travel with
   the font software, and a file nobody can find has not travelled. */
export const FONT_LICENCES: { label: string; href: string }[] = [
  { label: 'IBM Plex', href: './fonts/OFL-IBMPlex.txt' },
  { label: 'Oswald', href: './fonts/OFL-Oswald.txt' },
];

/* The export is the artifact that leaves the app and it has no link to click,
   so the terms go on it as text. Unconditional — every view's image carries the
   same licence, unlike the study line, which only the two views that reproduce
   the study's method may claim. */
export const exportLicenceLine = (): string =>
  L(`Slika: ${IMG_LICENCE} · kod: ${CODE_LICENCE} · podaci pod uvjetima izvora (DZS · Pitoski i sur. 2021. CC BY · granice ODbL)`,
    `Figure: ${IMG_LICENCE} · code: ${CODE_LICENCE} · data under its sources' terms (CBS · Pitoski et al. 2021 CC BY · boundaries ODbL)`);
