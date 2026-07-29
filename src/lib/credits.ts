/* ── The companion study ────────────────────────────────────────────────────
   This atlas was built as an interactive companion to a paper on county
   migration as a criterion for regionalisation. Until 27 July 2026 it was an
   unpublished manuscript, so the atlas described the reference without naming
   it: circulating someone's manuscript is their call, and a citation a reader
   cannot retrieve is not a citation. It is published now, so every surface
   names it, cites it and links to it.

   What has NOT changed is the other half of that rule: the atlas is
   unaffiliated. The authors have not reviewed, approved or endorsed it, and
   nothing here speaks for them — `NO_AFFIL` is deliberately not conditional on
   publication, because citing a paper does not make you part of it.

   This file stays the single source: header subtitle, footer, the glossary
   section and its `rad` term entry, and both export formats all derive from
   `PAPER`. Two copies live outside it and must move together — the `<noscript>`
   fallback in index.html, which cannot import anything, and the pinned check in
   verify.cjs. The suite compares them, so a half-done edit fails rather than
   shipping a page that cites the paper in one place and calls it pending in
   another. Every field below is composed from these parts, so the journal or
   the year cannot end up saying one thing in the footer and another in the
   glossary. */

const AUTHORS = 'Maras, M. i Vinovrški, L.';
const YEAR = '2026.';
const TITLE = 'Unutarnje i vanjske migracije stanovništva županija kao kriterij regionalizacije Hrvatske';
const JOURNAL = 'Elektronički zbornik radova Veleučilišta u Šibeniku, 20(1–2), 59–76';

export const PAPER = {
  published: true,
  /** Full hr-HR citation. */
  citation: `${AUTHORS} (${YEAR}). ${TITLE}. ${JOURNAL}.`,
  /** Short form for chrome with one line to spend (header subtitle, export). */
  short: `Maras i Vinovrški (${YEAR})`,
  journal: JOURNAL,
  /** Landing page — Hrčak, open access. */
  url: 'https://hrcak.srce.hr/349820',
  doi: 'https://doi.org/10.51650/ezrvs.20.1-2.4',
  licence: 'CC BY-NC',
};

/** True while there is nothing a reader could look up. */
export const paperPending = (): boolean => !PAPER.published || !PAPER.citation;

/** Header subtitle tail — link text, not the whole citation (an 11,5 px line). */
export const paperSub = (): string =>
  paperPending() ? 'još neobjavljen znanstveni rad' : PAPER.short;

/* Footer: what came from the study, and enough of the reference to find it. The
   footer is a fixed-height lane above the map and every wrapped line it gains
   the map loses (measured: +13 px per line at 1440), so the title stays in the
   glossary and this carries authors, year, journal and a link. The phrase
   "nije javno objavljen" is the pending marker the <noscript> is checked
   against. */
export const paperRefNote = (): string => paperPending()
  ? 'Klasifikacija i prijedlog regija preuzeti su iz znanstvenog rada koji još nije javno objavljen; potpuna referenca i atribucija slijede po objavi.'
  : 'Klasifikacija i prijedlog regija preuzeti su iz rada:';

/** What follows the link in the footer, so the credit reads as a reference. */
export const paperRefTail = (): string => paperPending() ? '' : ', ' + PAPER.journal + '.';

/* Independence holds in both states, so it is not conditional on publication —
   an atlas that cites the paper is no more affiliated with it than one that
   cannot. One canonical string, used by the footer and the glossary alike; the
   glossary adds the review/endorsement sentence after it rather than keeping a
   second, longer copy that could drift from this one. */
export const NO_AFFIL = 'Atlas je neovisan i neslužben projekt: autor atlasa nije povezan s autorima rada ni s njihovim ustanovama.';

/* The exported image is the artifact that leaves the app — there is no footnote
   to click through to and no link either, so it carries the DOI as text. Only
   the two views that reproduce the study's method (klasifikacija: the threshold;
   regije: the grouping) say anything; the other four take nothing from it. */
export const paperExportLine = (): string => (paperPending()
  ? 'Klasifikacija i regije prema još neobjavljenom znanstvenom radu (referenca po objavi)'
  : 'Klasifikacija i regije prema: ' + PAPER.short + ', ' + PAPER.doi)
  + ' · atlas nije povezan s njegovim autorima';

/** Glossary, first paragraph: the sentence the full citation follows. */
export const paperHelpIntro = (): string => paperPending()
  ? 'Rukopis je autor atlasa dobio izravno od autora rada, a rad još nije javno objavljen — zato se ovdje ne navodi: ni autori, ni naslov, ni godina. Potpuna referenca i atribucija dodat će se čim rad postane javno dostupan.'
  : `Rad je objavljen i slobodno dostupan (${PAPER.licence}):`;

/** Glossary: what a reader can and cannot check against the source. */
export const paperCheckNote = (): string => paperPending()
  ? 'Dok rad nije javno dostupan, tvrdnje pripisane radu ne možete provjeriti u izvoru; sve ostalo možete.'
  : 'Sve što je ovdje pripisano radu možete provjeriti u izvoru — poveznica je gore.';

/** The `rad` shorthand the legend and the rail use, defined in one place. */
export const paperTerm = (): string => paperPending()
  ? 'znanstveni rad kojemu je atlas nadopuna; još nije javno objavljen — v. „Rad i atribucija” niže'
  : `${PAPER.short}, ${PAPER.journal} — v. „Rad i atribucija” niže`;
