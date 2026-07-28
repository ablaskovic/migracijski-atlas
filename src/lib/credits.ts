/* ── The companion study, and why it is not named here ──────────────────────
   This atlas was built as an interactive companion to a paper on county
   migration as a criterion for regionalisation. The manuscript reached the
   author of the atlas directly from its authors and is **not published yet**,
   so the atlas describes the reference without identifying it: naming an
   unpublished manuscript puts it into circulation before its authors choose to,
   and a citation a reader cannot retrieve is not a citation at all.

   Both halves of that are honesty labels in the sense of CLAUDE.md §3, and they
   bind every layer the same way the izmjereno/procjena badges do:
     1. the atlas says the reference is *pending* rather than quietly implying it
        already has one — a bare "iz rada" with nothing to look up is the same
        defect as an unlabelled estimate;
     2. the atlas says it is unaffiliated. The study's authors have not reviewed,
        approved or endorsed any of this, and nothing here should be read as
        speaking for them.

   This file is the ONLY place that changes on publication: set `published` and
   fill `citation` (and `url`, if there is one). Every surface derives its copy
   from here — header subtitle, footer, the glossary section and its `rad` term
   entry, and both export formats — so no surface can go on saying "not
   published" after another one starts citing it.

   One surface cannot import this file: the `<noscript>` fallback in index.html
   is static markup. It carries the same statement and has to be edited in the
   same commit; verify.cjs asserts the two agree, so a half-done publication
   fails the suite rather than shipping. */

export const PAPER = {
  /** Flip to true only once a reader could actually retrieve the paper. */
  published: false,
  /** hr-HR citation once published: autori, godina, naslov, izdanje/DOI. */
  citation: null as string | null,
  /** DOI or landing page, if there is one. */
  url: null as string | null,
};

/** True while there is nothing a reader could look up. */
export const paperPending = (): boolean => !PAPER.published || !PAPER.citation;

const cite = (): string => PAPER.citation + (PAPER.url ? ' · ' + PAPER.url : '');

/** Header subtitle tail — reads "…nadopuna uz X" in both states. */
export const paperSub = (): string =>
  paperPending() ? 'još neobjavljen znanstveni rad' : PAPER.citation!;

/* Footer: what came from the study, and why no reference follows it yet. Kept
   to one sentence each — the footer is a fixed-height lane above the map, and
   every wrapped line it gains the map loses (measured: +13 px per line at
   1440). The glossary is where the same two facts get room to explain
   themselves. The phrase "nije javno objavljen" is the pending marker the
   <noscript> fallback is checked against. */
export const paperRefNote = (): string => paperPending()
  ? 'Klasifikacija i prijedlog regija preuzeti su iz znanstvenog rada koji još nije javno objavljen; potpuna referenca i atribucija slijede po objavi.'
  : 'Klasifikacija i prijedlog regija preuzeti su iz rada: ' + cite() + '.';

/* Independence holds in both states, so it is not conditional on publication —
   an atlas that starts citing the paper is no more affiliated with it than one
   that cannot. One canonical string, used by the footer and the glossary alike;
   the glossary adds the review/endorsement sentence after it rather than
   keeping a second, longer copy that could drift from this one. */
export const NO_AFFIL = 'Atlas je neovisan i neslužben projekt: autor atlasa nije povezan s autorima rada ni s njihovim ustanovama.';

/* The exported image is the artifact that leaves the app — there is no footnote
   to click through to — so the two views that actually reproduce the study's
   method (klasifikacija: the threshold; regije: the grouping) carry the pending
   reference and the disclaimer on their own line. The other four views take
   nothing from the paper and say nothing about it. */
export const paperExportLine = (): string => (paperPending()
  ? 'Klasifikacija i regije prema još neobjavljenom znanstvenom radu (referenca po objavi)'
  : 'Klasifikacija i regije prema: ' + PAPER.citation)
  + ' · atlas nije povezan s njegovim autorima';

/** Glossary, first paragraph: the provenance of the reference itself. */
export const paperHelpIntro = (): string => paperPending()
  ? 'Rukopis je autor atlasa dobio izravno od autora rada, a rad još nije javno objavljen — zato se ovdje ne navodi: ni autori, ni naslov, ni godina. Potpuna referenca i atribucija dodat će se čim rad postane javno dostupan.'
  : 'Rad je objavljen: ' + cite() + '.';

/** Glossary: what a reader can and cannot check while the paper is unavailable. */
export const paperCheckNote = (): string => paperPending()
  ? 'Dok rad nije javno dostupan, tvrdnje pripisane radu ne možete provjeriti u izvoru; sve ostalo možete.'
  : '';

/** The `rad` shorthand the legend and the rail use, defined in one place. */
export const paperTerm = (): string => paperPending()
  ? 'znanstveni rad kojemu je atlas nadopuna; još nije javno objavljen — v. „Rad i atribucija” niže'
  : cite() + ' — v. „Rad i atribucija” niže';
