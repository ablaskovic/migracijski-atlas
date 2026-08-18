/* Language: Croatian (the atlas's own) and English (so it can be shown to
   people who do not read Croatian).

   Two things here are load-bearing beyond "words in two languages".

   1. NUMBERS ARE PART OF THE TRANSLATION. Croatian writes the thousands
      separator as `.` and the decimal as `,` — `41.986` and `10,8 %`. Read as
      English those are "forty-one point nine eight six" and "ten point eight",
      i.e. every figure in the atlas is wrong by three orders of magnitude for
      the reader this exists to serve. So `en` formats through `en-GB`. The
      display minus stays U+2212 in both, because that is a typographic choice
      about the glyph, not a locale convention, and the house rules pin it.

   2. THE SOURCES ARE NOT TRANSLATED. County and municipality names, the DZS
      table numbers, and the companion study's citation are identifiers: a
      reader who wants to check "Osječko-baranjska" against a DZS table or find
      the paper on Hrčak needs the string that is actually printed there. What
      is translated is everything the atlas itself says *about* them — including
      every honesty label, because a badge nobody can read is not a label.

   The dictionary is one flat object of `{hr, en}` pairs rather than two parallel
   files: a missing translation is then a type error at the key, not a silently
   Croatian string discovered by a reader. */

export type Lang = 'hr' | 'en';

/* The Croatian-reading languages, by ISO 639 code. Bosnian, Serbian,
   Serbo-Croatian and Montenegrin are mutually intelligible with Croatian to a
   degree that makes an English fallback the worse choice for those readers, and
   the atlas is entirely Latin script, which `sr-Cyrl` readers also read.
   Matched on the *primary subtag* so regional variants (hr-BA, sr-ME, sh-Latn…)
   come along without being enumerated. */
const HR_LANGS = new Set(['hr', 'bs', 'sr', 'sh', 'me', 'cnr']);

/* `navigator.languages` in preference order, falling back to `language`. The
   first entry that is decidably one or the other wins; a reader whose list is
   `['de','hr']` gets English, which is what their own ordering asks for. */
export function detectLang(nav: Pick<Navigator, 'languages' | 'language'> = navigator): Lang {
  const list = nav.languages && nav.languages.length ? nav.languages : [nav.language];
  for (const tag of list) {
    if (!tag) continue;
    const primary = String(tag).toLowerCase().split('-')[0];
    if (HR_LANGS.has(primary)) return 'hr';
    if (primary === 'en') return 'en';
  }
  return 'en';
}

/* Module-level, and set by App before it renders — the same escape hatch the
   tooltip and the zoom transform already use, and for the same reason: the
   alternative is threading a locale through every `fmtI.format(n)` call site in
   fifteen components to say something that is global by nature. `lang` still
   lives in State and the permalink; this is a mirror of it, not a second
   source of truth. */
let LANG: Lang = 'hr';
export const lang = (): Lang => LANG;
export function setLang(l: Lang): void {
  LANG = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

/* Remembered across visits, but never *instead* of the permalink: decodeHash
   wins, so a link shared in English opens in English on a Croatian browser.
   Wrapped because storage throws in private mode in some browsers, and a
   language preference is not worth a blank page. */
const LS_KEY = 'atlas-lang';
export function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v === 'hr' || v === 'en' ? v : null;
  } catch { return null; }
}
export function storeLang(l: Lang): void {
  try { localStorage.setItem(LS_KEY, l); } catch { /* private mode, fine */ }
}

/* ── formatting ─────────────────────────────────────────────────────────────
   Locale-aware, but exported with the same shapes the app already imports so
   the ~90 `fmtI.format(x)` call sites do not each have to learn about language.
   These are getters over a pair of Intl instances, not new instances per call. */
const NUM: Record<Lang, Intl.NumberFormat> = {
  hr: new Intl.NumberFormat('hr-HR'),
  en: new Intl.NumberFormat('en-GB'),
};
const NUM1: Record<Lang, Intl.NumberFormat> = {
  hr: new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  en: new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
};
export const numI = (): Intl.NumberFormat => NUM[LANG];
export const numR = (): Intl.NumberFormat => NUM1[LANG];

/* A year, and a span of years. Croatian writes ordinals with a trailing dot —
   `2024.`, `2011.–2024.` — and English does not. This is why the atlas cannot
   simply interpolate `YEARS[yi]` into a sentence, and why every year that
   reaches the screen goes through here. */
export const yr = (y: number): string => (LANG === 'hr' ? y + '.' : String(y));
export const yrSpan = (a: number, b: number): string =>
  LANG === 'hr' ? `${a}.–${b}.` : `${a}–${b}`;

/* The inline pair. Most of this app's copy is one-off prose carrying a comment
   that explains why it is worded the way it is — the honesty labels, the
   glossary, the Nalazi captions. Moving those to a remote dictionary would put
   every string a screen away from the reasoning that chose it, which is the one
   thing this codebase is most careful about. So shared, enumerated labels live
   in `dict` below (they are referenced from several places and must agree), and
   everything else is written in place as L('…', '…').
   Croatian first, always, so the diff of a copy change shows the original. */
export const L = (hr: string, en: string): string => (LANG === 'hr' ? hr : en);

/* Every external link in the app opens in a new tab and every one of them says
   so in its accessible name (3.2.5 — a link that repurposes the window without
   warning). One string, six call sites, two languages. */
export const NEWTAB = (): string => L('Otvara se u novoj kartici.', 'Opens in a new tab.');

/* ── dictionary ─────────────────────────────────────────────────────────────
   Grouped by the surface that renders it. Values may be functions when a string
   has to interpolate something the caller knows. */
type Entry = string | ((...a: never[]) => string);
const dict = {
  /* header, controls */
  'hd.eyebrow': { hr: 'DZS · međužupanijske i vanjske migracije', en: 'CBS · inter-county and external migration' },
  'hd.title': { hr: 'Migracijski atlas županija', en: 'County Migration Atlas' },
  'ctrl.view': { hr: 'Prikaz', en: 'View' },
  'ctrl.flow': { hr: 'Sastavnica', en: 'Component' },
  'ctrl.den': { hr: 'Mjera', en: 'Measure' },
  'ctrl.time': { hr: 'Vrijeme', en: 'Time' },
  'ctrl.dir': { hr: 'Smjer', en: 'Direction' },
  'ctrl.thr': { hr: 'Prag', en: 'Threshold' },
  'ctrl.export': { hr: 'Izvoz', en: 'Export' },
  'ctrl.story': { hr: 'Nalazi', en: 'Findings' },
  'ctrl.lang': { hr: 'Jezik', en: 'Language' },
  'ctrl.reset': { hr: 'Poništi', en: 'Reset' },
  'ctrl.resetTitle': { hr: 'Vrati na početni prikaz', en: 'Back to the opening view' },

  /* views */
  'view.saldo': { hr: 'Saldo', en: 'Net' },
  'view.klas': { hr: 'Klasifikacija', en: 'Classification' },
  'view.reg': { hr: 'Regije', en: 'Regions' },
  'view.flow': { hr: 'Tokovi', en: 'Flows' },
  'view.mx': { hr: 'Matrica', en: 'Matrix' },
  'view.jmap': { hr: 'JLS 2018.', en: 'LAU 2018' },
  'view.yrs': { hr: 'Godine', en: 'Years' },

  /* components / measures */
  'flow.tot': { hr: 'Ukupno', en: 'Total' },
  'flow.int': { hr: 'Unutarnje', en: 'Internal' },
  'flow.ext': { hr: 'Vanjske', en: 'External' },
  'flow.nat': { hr: 'Prirodno', en: 'Natural' },
  'flow.all': { hr: 'Mig. + prirodno', en: 'Mig. + natural' },
  'den.abs': { hr: 'Apsolutno', en: 'Absolute' },
  'den.rel11': { hr: '% popisa 2011.', en: '% of 2011 census' },
  'den.relest': { hr: '% tek. procjene', en: '% of current estimate' },
  'dir.out': { hr: 'Odlasci', en: 'Out' },
  'dir.in': { hr: 'Dolasci', en: 'In' },
  'dir.net': { hr: 'Neto', en: 'Net' },
  'time.year': { hr: 'Godišnje', en: 'Annual' },
  'time.cum': { hr: 'Kumulativno', en: 'Cumulative' },

  /* honesty labels — the load-bearing ones */
  'badge.meas': { hr: 'izmjereno', en: 'measured' },
  'badge.est': { hr: 'procjena (IPF)', en: 'estimate (IPF)' },
  'badge.cum': { hr: 'kumulativna procjena', en: 'cumulative estimate' },
  'badge.cumTitle': { hr: 'KUMULATIVNA PROCJENA', en: 'CUMULATIVE ESTIMATE' },
  'note.pairEst': {
    hr: 'Neto parova je strukturna procjena.',
    en: 'Pair nets are a structural estimate.',
  },
} as const satisfies Record<string, { hr: Entry; en: Entry }>;

export type Key = keyof typeof dict;

/* The lookup. Deliberately not `t(key) ?? key`: a missing key is a bug, and a
   key rendered as UI text is how that bug reaches a reader instead of a build. */
export function t(key: Key): string {
  return dict[key][LANG] as string;
}
