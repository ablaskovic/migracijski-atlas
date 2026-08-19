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

/* WHERE the reader is, as opposed to what their browser asks for. The countries
   whose official language is one of HR_LANGS above — Croatia, Bosnia and
   Herzegovina, Serbia, Montenegro — by ISO 3166-1 alpha-2 and by IANA zone.

   A caveat worth stating rather than discovering: in the IANA database
   Europe/Zagreb, Europe/Sarajevo, Europe/Ljubljana and Europe/Skopje are all
   *links* to Europe/Belgrade, and an engine is free to canonicalise. Chrome
   returns what the platform supplies (on Windows, via CLDR's windowsZones
   mapping keyed by the system region, so a Croatian install answers
   Europe/Zagreb), but a canonicalising environment answers Europe/Belgrade for
   all of them — which is in this set anyway, so the failure mode is that a
   Slovenian or Macedonian reader is offered Croatian. In this region that is a
   far better wrong guess than English, and it is one click from being right. */
const HR_REGIONS = new Set(['hr', 'ba', 'rs', 'me']);
const HR_ZONES = new Set(['europe/zagreb', 'europe/sarajevo', 'europe/belgrade', 'europe/podgorica']);

/* The device's own statement of where it is. Not an IP lookup, deliberately: an
   IP lookup needs either a third-party geolocation host — which this app must
   not reach, and the suite asserts it reaches none — or a server function of our
   own, and *either way the answer arrives after the first paint*. The language
   has to be settled before the first render (see setLang below): a frame of the
   wrong language here is not a cosmetic flicker, it is a frame in which `41.986`
   means forty-one. The timezone costs no request and is available synchronously,
   which is the only reason it can decide anything at boot.
   Wrapped: `resolvedOptions().timeZone` is unset on a few old engines and throws
   on a couple more, and a language default is not worth a blank page. */
export function timeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; }
}

/* Who gets which language, before anything is stored or shared.

   Two signals, and the reader only needs one of them to be Croatian:

   1. LANGUAGE — `navigator.languages` in preference order, falling back to
      `language`. The first entry that is decidably one or the other wins, so a
      reader whose list is `['en','hr']` gets English, which is what their own
      ordering asks for, while `['de','hr']` gets Croatian: German is not on
      offer, so the second preference is the first that means anything here.
   2. REGION — where the reader actually is. A browser set to English or German
      inside Croatia is extremely ordinary (it is what a great many machines in
      the region ship as), and the atlas is Croatian by default; answering such
      a reader in English because of a setting they may never have chosen gets
      the common case backwards.

   So English is the answer only when *neither* signal points at Croatian:
   English is the fallback for readers this atlas cannot otherwise reach, not a
   default that a location has to argue its way out of. `l=` in the permalink
   and a stored choice both still outrank all of this — an explicit act beats an
   inference, always. */
export function detectLang(
  nav: Pick<Navigator, 'languages' | 'language'> = navigator,
  tz: string = timeZone(),
): Lang {
  const list = (nav.languages && nav.languages.length ? nav.languages : [nav.language]).filter(Boolean);
  for (const tag of list) {
    const primary = String(tag).toLowerCase().split('-')[0];
    if (HR_LANGS.has(primary)) return 'hr';
    /* decidable, but not final: the region below can still answer for it */
    if (primary === 'en') break;
  }
  /* A region subtag is the reader's own tag saying where they are (`en-HR`), and
     is read from every entry rather than only the first: a list is a preference
     order for languages, not for places. Script subtags are skipped by length —
     a region is two letters (`hr-HR`) or three digits (`es-419`), a script is
     four (`sr-Latn-RS`), which is why `sr-Latn` must not read as region "latn". */
  for (const tag of list) {
    for (const sub of String(tag).toLowerCase().split('-').slice(1)) {
      if (sub.length === 2 && HR_REGIONS.has(sub)) return 'hr';
    }
  }
  return HR_ZONES.has(tz.toLowerCase()) ? 'hr' : 'en';
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
  /* No 'hd.eyebrow': it was defined and rendered nowhere, and its text differed
     from the eyebrow actually shown — the header composes its own (Header.tsx)
     and so does the export band (exportPng.ts), so a copy edit here would have
     changed nothing on screen while looking like it had. */
  /* The English title names the country; the Croatian one does not, and does not
     need to. "Migracijski atlas županija" reaches a reader who already knows
     whose counties these are — the atlas is in their language, on their subject,
     and every county name in it is one they can place. "County Migration Atlas"
     reaches a reader who by construction does not: English exists here so the
     atlas can be shown to people outside that context, and "county" is a unit
     forty countries use. So the country is stated, in the one place that travels
     with every copy of the title — the <h1>, the tab, and the eyebrow of an
     exported figure, which leaves the app with no page around it to explain
     itself. Parenthesised and in caps because it is a qualifier on the name, not
     part of it; the <h1> is uppercased by the stylesheet anyway, and the tab and
     the export are not. */
  'hd.title': { hr: 'Migracijski atlas županija', en: 'County Migration Atlas (CROATIA)' },
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

/* The title in the *other* language. The language switch sits beside the <h1> in
   the same flex row, so the <h1>'s own width is what positions it — and the two
   titles differ by tens of pixels, which means pressing EN moved the button that
   had just been pressed, out from under the pointer. The <h1> reserves the wider
   of the two (index.css, .hd-title::after) and the switch stops moving. */
export const titleAlt = (): string => dict['hd.title'][LANG === 'hr' ? 'en' : 'hr'];
