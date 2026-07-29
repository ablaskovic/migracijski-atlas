/* "Nalazi" — curated state presets that walk a reader to the atlas's strongest
   findings (handoff §8 outreach set). Each entry is a plain State patch plus a
   one-breath Croatian caption; App applies the patch and shows the banner.
   Numbers here are display copy only — the map/rail render the same values from
   metrics.ts, so a data refresh that moves them must update these captions too
   (same rule as the CLAUDE.md ground-truth table). */
import { YEARS, IX2018 } from './metrics.ts';
import { BASE, STORY_KEYS } from './state.ts';
import type { Patch, State } from './types.ts';

const Y24 = YEARS.indexOf(2024), Y25 = YEARS.indexOf(2025);

/* `patch` is what the preset *sets*; `asserts` is what its caption actually
   *claims* beyond STORY_KEYS. The two were conflated — invalidation ran over the
   patch's own keys — so a preset became panel-sensitive by accident of carrying a
   defensive `age: false`. Measured: opening "Dob i spol" killed Nalaz 7's caption
   (which never mentions a panel) while Nalaz 1's, 2's, 3's, 5's and 6's survived.
   Now only a caption that speaks about a surface dies when that surface moves. */
export interface Story { label: string; cap: string; patch: Patch; asserts?: (keyof State)[] }

export const STORIES: Story[] = [
  {
    label: 'Zagreb gubi samo od prstena',
    cap: 'Jedini partner s kojim Grad Zagreb neto gubi jest vlastiti prsten — Zagrebačka (−334 u izmjerenoj 2018.). Svi ostali smjerovi hrane Zagreb.',
    patch: { view: 'flow', sel: 'HR-21', dir: 'net', cum: false, yi: IX2018, flowSeen: true, pair: 'HR-01', jls: false },
  },
  {
    label: 'Samo pet županija u plusu',
    /* This said "samo tri" and named the three largest. Five counties are
       positive on mig+prirodno for 2011.–2024. — Zagrebačka +2.240 and
       Dubrovačko-neretvanska +125 as well — and the rail this preset opens
       lists all five, directly under the caption denying two of them. The
       count is what carried the point, so it is the count that had to be
       right; the two small ones are named because "five" with three examples
       is the same defect one line further down. */
    cap: 'S prirodnim kretanjem u zbroju, 2011.–2024. raste samo pet županija: Grad Zagreb +27.521, Istarska +11.531, Zadarska +3.292, Zagrebačka +2.240 i Dubrovačko-neretvanska +125. Dno: Osječko-baranjska −48.271.',
    patch: { view: 'saldo', flow: 'all', den: 'abs', cum: true, yi: Y24, sel: null },
  },
  {
    label: 'Istri pad pojede pola dobitka',
    cap: 'Istarska 2011.–2024.: +22.537 migracijama, −11.006 prirodnim padom — ukupno +11.531. Migracijska leća sama skriva pola priče.',
    patch: { view: 'saldo', flow: 'all', den: 'abs', cum: true, yi: Y24, sel: 'HR-18' },
  },
  {
    label: '2025.: hrvatski državljani u plusu',
    cap: 'U 2025. hrvatski državljani prvi su put neto pozitivni (+3.705, nakon −6.857 u 2024.), a azijski se val hladi — odseljavanje raste.',
    patch: { view: 'saldo', flow: 'ext', den: 'abs', cum: false, yi: Y25, sel: null, citz: true, citzTab: 'grp', jls: false, age: false },
    /* the only caption whose claim lives in a panel — close it and the caption is
       describing something that is no longer on screen */
    asserts: ['citz', 'citzTab'],
  },
  {
    label: 'Prag odlučuje tko je gubitnica',
    cap: 'Na revidiranoj DZS seriji prag −4.500 iz rada prebacuje Karlovačku i Koprivničko-križevačku među gubitnice — ista metoda, druga berba podataka. Pomakni prag i prati klase.',
    patch: { view: 'klas', thr: 4500, thrRel: false, cum: true, yi: Y24, sel: null },
  },
  {
    label: 'Istočna regija: −97 tisuća',
    cap: 'Istočna regija 2011.–2024.: −97.195 osoba, dvostruko gore od Središnje Hrvatske (−46.669). Zagrebačka regija i Jadran rastu.',
    patch: { view: 'reg', flow: 'tot', den: 'abs', cum: true, yi: Y24, sel: null },
  },
  {
    label: 'Gradovi gube, prstenovi rastu',
    cap: 'Na izmjerenoj JLS razini (2018., samo unutarnje selidbe) najveći je gubitnik Split (−691), a odmah do njega raste Solin (+229). Grad Zagreb dobiva +3.413 — suburbanizacija je vidljiva tek ispod razine županija.',
    patch: { view: 'jmap', dir: 'net', cum: false, yi: IX2018, sel: null, jls: false, citz: false, age: false },
  },

  /* ── v2.0.9 additions ───────────────────────────────────────────────────────
     The first seven covered the atlas's own apparatus well (corridors, the JLS
     layer, the citizenship panel) and the study's argument badly. Measured
     against the paper: no preset used the internal/external split, which is its
     central analytic move; none used the "% popisa 2011." lens, which is half
     its own keyword list; none said anything about *when* the turn happened;
     none reproduced its Osijek conclusion; and the Matrica — a whole view — had
     no story at all. These six are those gaps, and every number in them is
     recomputed from src/data/*.json, not carried over from the paper. */
  {
    label: 'Dva motora rasta',
    cap: 'Zagrebačka i Splitsko-dalmatinska obje rastu, ali iz suprotnih izvora: Zagrebačka +15.287 unutarnjim i −1.992 vanjskim migracijama, Splitsko-dalmatinska −2.745 unutarnjim i +12.429 vanjskim. Jedna prima iz Hrvatske, druga iz inozemstva.',
    patch: { view: 'saldo', flow: 'int', den: 'abs', cum: true, yi: Y24, sel: null },
  },
  {
    label: 'Relativno gleda drukčije',
    cap: 'Apsolutno vodi Grad Zagreb (+41.986), relativno Istarska: +10,8 % stanovništva iz 2011., dvostruko više od Zagreba (+5,3 %). I Zadarska (+5,7 %) ga pretječe. Veličina županije odlučuje koliko isti broj ljudi znači.',
    patch: { view: 'saldo', flow: 'tot', den: 'rel11', cum: true, yi: Y24, sel: null },
  },
  {
    label: '2022.: prvi plus prema inozemstvu',
    cap: 'Do 2017. samo je jedna županija imala pozitivan saldo s inozemstvom. Godine 2022. ima ih 12, a nacionalni saldo prvi put je pozitivan (+11.685); do 2024. u plusu ih je 19 od 21. Preokret je stvaran i nagao.',
    patch: { view: 'saldo', flow: 'ext', den: 'abs', cum: false, yi: YEARS.indexOf(2022), sel: null },
  },
  {
    label: 'Prirodni pad nema iznimke',
    cap: 'Nijedna županija 2011.–2024. nema pozitivan prirodni prirast — sve 21 su u minusu. Relativno najteže prolazi Ličko-senjska (−13,7 %), najlakše Međimurska (−1,6 %). Migracije preraspodjeljuju, prirodno kretanje oduzima svima.',
    patch: { view: 'saldo', flow: 'nat', den: 'rel11', cum: true, yi: Y24, sel: null },
  },
  {
    label: 'Osijeku istok ide najmanje loše',
    cap: 'Među pet istočnih županija Osječko-baranjska gubi najmanje unutarnjim migracijama: −2,6 % naspram −6,1 % (Vukovarsko-srijemska) i −5,6 % (Brodsko-posavska). To je argument rada da Osijek ostaje nositelj istoka.',
    patch: { view: 'saldo', flow: 'int', den: 'rel11', cum: true, yi: Y24, sel: null },
  },
  {
    label: 'Najprometniji koridor nije najneravnoteženiji',
    cap: 'Izmjereno 2018.: Grad Zagreb ↔ Zagrebačka premjesti 4.288 ljudi, a neto tek −334 (8 %). Osječko-baranjska ↔ Grad Zagreb premjesti 819, a neto −517 — 63 %. Velik promet ne znači i velik gubitak.',
    patch: { view: 'mx', dir: 'net', cum: false, yi: IX2018, sel: 'HR-14', pair: 'HR-21', jls: false },
  },
];

/* The one definition of "this caption still describes what is on screen", read by
   all three places that need it: App's invalidation, and both halves of the
   permalink codec. Keeping them in sync by hand is what let a link render a banner
   citing +27.521 over a view showing +41.986 (see hash.ts). Only keys the preset
   itself sets are compared — STORY_KEYS names every field a caption can depend on,
   but a preset that never sets `thr` makes no claim about it. */
export function storyKeys(ix: number): (keyof State)[] {
  return [...STORY_KEYS, ...(STORIES[ix].asserts ?? [])];
}
export function storyHolds(s: Partial<State>, ix: number): boolean {
  const patch = STORIES[ix].patch as Record<string, unknown>;
  const cur = { ...BASE, ...s } as Record<string, unknown>;
  return storyKeys(ix).every(k => !(k in patch) || cur[k] === patch[k]);
}
