import { L } from './i18n.ts';
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
    get label() { return L('Zagreb gubi samo od prstena', 'Zagreb only loses to its own ring'); },
    get cap() { return L('Jedini partner s kojim Grad Zagreb neto gubi jest vlastiti prsten — Zagrebačka (−334 u izmjerenoj 2018.). Svi ostali smjerovi hrane Zagreb.', 'The only partner the City of Zagreb loses to on net is its own ring — Zagrebačka (−334 in the measured 2018). Every other direction feeds Zagreb.'); },
    patch: { view: 'flow', sel: 'HR-21', dir: 'net', cum: false, yi: IX2018, flowSeen: true, pair: 'HR-01', jls: false },
  },
  {
    get label() { return L('Samo pet županija u plusu', 'Only five counties in the black'); },
    /* This said "samo tri" and named the three largest. Five counties are
       positive on mig+prirodno for 2011.–2024. — Zagrebačka +2.240 and
       Dubrovačko-neretvanska +125 as well — and the rail this preset opens
       lists all five, directly under the caption denying two of them. The
       count is what carried the point, so it is the count that had to be
       right; the two small ones are named because "five" with three examples
       is the same defect one line further down. */
    get cap() { return L('S prirodnim kretanjem u zbroju, 2011.–2024. raste samo pet županija: Grad Zagreb +27.521, Istarska +11.531, Zadarska +3.292, Zagrebačka +2.240 i Dubrovačko-neretvanska +125. Dno: Osječko-baranjska −48.271.', 'With natural change included, only five counties grow over 2011–2024: City of Zagreb +27,521, Istarska +11,531, Zadarska +3,292, Zagrebačka +2,240 and Dubrovačko-neretvanska +125. Bottom: Osječko-baranjska −48,271.'); },
    patch: { view: 'saldo', flow: 'all', den: 'abs', cum: true, yi: Y24, sel: null },
  },
  {
    get label() { return L('Istri pad pojede pola dobitka', 'Natural decline eats half of Istria’s gain'); },
    get cap() { return L('Istarska 2011.–2024.: +22.537 migracijama, −11.006 prirodnim padom — ukupno +11.531. Migracijska leća sama skriva pola priče.', 'Istarska 2011–2024: +22,537 from migration, −11,006 from natural decline — +11,531 in total. The migration lens alone hides half the story.'); },
    patch: { view: 'saldo', flow: 'all', den: 'abs', cum: true, yi: Y24, sel: 'HR-18' },
  },
  {
    get label() { return L('2025.: hrvatski državljani u plusu', '2025: Croatian citizens turn positive'); },
    get cap() { return L('U 2025. hrvatski državljani prvi su put neto pozitivni (+3.705, nakon −6.857 u 2024.), a azijski se val hladi — odseljavanje raste.', 'In 2025 Croatian citizens are net positive for the first time (+3,705, after −6,857 in 2024), while the Asian wave cools — departures are rising.'); },
    patch: { view: 'saldo', flow: 'ext', den: 'abs', cum: false, yi: Y25, sel: null, citz: true, citzTab: 'grp', jls: false, age: false },
    /* the only caption whose claim lives in a panel — close it and the caption is
       describing something that is no longer on screen */
    asserts: ['citz', 'citzTab'],
  },
  {
    get label() { return L('Prag odlučuje tko je gubitnica', 'The threshold decides who is losing'); },
    /* This used to name Karlovačka and Koprivničko-križevačka outright — the one
       surface still writing out a pair that PAPER_KLAS_DIFF exists to derive, and
       so the one that would keep asserting the difference after a DZS revision
       closed it. The legend below the caption names them, from the data. */
    get cap() { return L('Prag −4.500 iz rada, primijenjen na noviju DZS seriju, ne razvrstava županije isto kao rad — legenda imenuje one koje se razlikuju. Pomakni prag i prati kako se klase mijenjaju.', 'The paper’s −4,500 threshold, applied to the newer CBS series, does not classify the counties the way the paper does — the legend names the ones that differ. Move the threshold and watch the classes change.'); },
    patch: { view: 'klas', thr: 4500, thrRel: false, cum: true, yi: Y24, sel: null },
  },
  {
    get label() { return L('Istočna regija: −97 tisuća', 'The Eastern region: −97 thousand'); },
    get cap() { return L('Istočna regija 2011.–2024.: −97.195 osoba, dvostruko gore od Središnje Hrvatske (−46.669). Zagrebačka regija i Jadran rastu.', 'The Eastern region over 2011–2024: −97,195 people, twice as bad as Central Croatia (−46,669). The Zagreb region and the Adriatic grow.'); },
    patch: { view: 'reg', flow: 'tot', den: 'abs', cum: true, yi: Y24, sel: null },
  },
  {
    get label() { return L('Gradovi gube, prstenovi rastu', 'Cities lose, their rings grow'); },
    get cap() { return L('Na izmjerenoj JLS razini (2018., samo unutarnje selidbe) najveći je gubitnik Split (−691), a odmah do njega raste Solin (+229). Grad Zagreb dobiva +3.413 — suburbanizacija je vidljiva tek ispod razine županija.', 'At the measured LAU level (2018, internal moves only) the biggest loser is Split (−691), while Solin next door grows (+229). The City of Zagreb gains +3,413 — suburbanisation only becomes visible below county level.'); },
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
    get label() { return L('Dva motora rasta', 'Two engines of growth'); },
    get cap() { return L('Zagrebačka i Splitsko-dalmatinska obje rastu, ali iz suprotnih izvora: Zagrebačka +15.287 unutarnjim i −1.992 vanjskim migracijama, Splitsko-dalmatinska −2.745 unutarnjim i +12.429 vanjskim. Jedna prima iz Hrvatske, druga iz inozemstva.', 'Zagrebačka and Splitsko-dalmatinska both grow, but from opposite sources: Zagrebačka +15,287 internal and −1,992 external, Splitsko-dalmatinska −2,745 internal and +12,429 external. One receives from Croatia, the other from abroad.'); },
    patch: { view: 'saldo', flow: 'int', den: 'abs', cum: true, yi: Y24, sel: null },
  },
  {
    get label() { return L('Relativno gleda drukčije', 'Relative numbers look different'); },
    get cap() { return L('Apsolutno vodi Grad Zagreb (+41.986), relativno Istarska: +10,8 % stanovništva iz 2011., dvostruko više od Zagreba (+5,3 %). I Zadarska (+5,7 %) ga pretječe. Veličina županije odlučuje koliko isti broj ljudi znači.', 'In absolute terms the City of Zagreb leads (+41,986); in relative terms Istarska does: +10.8 % of its 2011 population, twice Zagreb’s (+5.3 %). Zadarska (+5.7 %) also overtakes it. The size of a county decides what the same number of people means.'); },
    patch: { view: 'saldo', flow: 'tot', den: 'rel11', cum: true, yi: Y24, sel: null },
  },
  {
    get label() { return L('2022.: prvi plus prema inozemstvu', '2022: the first surplus with abroad'); },
    get cap() { return L('Do 2017. samo je jedna županija imala pozitivan saldo s inozemstvom. Godine 2022. ima ih 12, a nacionalni saldo prvi put je pozitivan (+11.685); do 2024. u plusu ih je 19 od 21. Preokret je stvaran i nagao.', 'Up to 2017 only one county had a positive balance with abroad. In 2022 twelve do, and the national balance is positive for the first time (+11,685); by 2024 nineteen of twenty-one are in the black. The reversal is real and abrupt.'); },
    patch: { view: 'saldo', flow: 'ext', den: 'abs', cum: false, yi: YEARS.indexOf(2022), sel: null },
  },
  {
    get label() { return L('Prirodni pad nema iznimke', 'Natural decline has no exceptions'); },
    get cap() { return L('Nijedna županija 2011.–2024. nema pozitivan prirodni prirast — sve 21 su u minusu. Relativno najteže prolazi Ličko-senjska (−13,7 %), najlakše Međimurska (−1,6 %). Migracije preraspodjeljuju, prirodno kretanje oduzima svima.', 'No county has positive natural change over 2011–2024 — all twenty-one are negative. Relatively, Ličko-senjska fares worst (−13.7 %) and Međimurska best (−1.6 %). Migration redistributes; natural change subtracts from everyone.'); },
    patch: { view: 'saldo', flow: 'nat', den: 'rel11', cum: true, yi: Y24, sel: null },
  },
  {
    get label() { return L('Osijeku istok ide najmanje loše', 'Osijek fares least badly in the east'); },
    get cap() { return L('Među pet istočnih županija Osječko-baranjska gubi najmanje unutarnjim migracijama: −2,6 % naspram −6,1 % (Vukovarsko-srijemska) i −5,6 % (Brodsko-posavska). To je argument rada da Osijek ostaje nositelj istoka.', 'Among the five eastern counties Osječko-baranjska loses least to internal migration: −2.6 % against −6.1 % (Vukovarsko-srijemska) and −5.6 % (Brodsko-posavska). This is the paper’s argument that Osijek remains the anchor of the east.'); },
    patch: { view: 'saldo', flow: 'int', den: 'rel11', cum: true, yi: Y24, sel: null },
  },
  /* ── Godine ───────────────────────────────────────────────────────────────
     Two findings that are only *visible* as a grid: both are statements about
     when a sign changed, and answering them on the map meant scrubbing 28 times
     while holding 21 colours in your head. Every number recomputed from
     src/data/atlas_data2.json. */
  {
    get label() { return L('Zagreb je prestao dobivati iz Hrvatske', 'Zagreb stopped gaining from Croatia'); },
    get cap() { return L('Unutarnjim migracijama Grad Zagreb dobiva sve do 2019. (vrh +4.420 u 2015.), a od 2021. gubi — 2022. −622. Zagrebačka istodobno ubrzava: +1.047 (2019.) → +2.238 (2022.). Redak grada mijenja boju, redak prstena tamni.', 'On internal migration the City of Zagreb gains until 2019 (peak +4,420 in 2015), then loses from 2021 — −622 in 2022. Zagrebačka accelerates at the same time: +1,047 (2019) → +2,238 (2022). The city’s row changes colour; the ring’s row darkens.'); },
    patch: { view: 'yrs', flow: 'int', den: 'abs', cum: false, yi: YEARS.indexOf(2022), sel: null },
  },
  {
    get label() { return L('Prirodni prirast: devet godina bez iznimke', 'Natural change: nine years without exception'); },
    get cap() { return L('Posljednja županija-godina s više rođenih nego umrlih je 2016. Od 2017. do 2025. nijedna županija nijedne godine nije pozitivna — 21 redak, devet stupaca, bez ijedne iznimke.', 'The last county-year with more births than deaths is 2016. From 2017 to 2025 no county is positive in any year — twenty-one rows, nine columns, not one exception.'); },
    patch: { view: 'yrs', flow: 'nat', den: 'abs', cum: false, yi: YEARS.indexOf(2017), sel: null },
  },
  {
    get label() { return L('Najprometniji koridor nije najneravnoteženiji', 'The busiest corridor is not the most lopsided'); },
    get cap() { return L('Izmjereno 2018.: Grad Zagreb ↔ Zagrebačka premjesti 4.288 ljudi, a neto tek −334 (8 %). Osječko-baranjska ↔ Grad Zagreb premjesti 819, a neto −517 — 63 %. Velik promet ne znači i velik gubitak.', 'Measured in 2018: City of Zagreb ↔ Zagrebačka moves 4,288 people for a net of just −334 (8 %). Osječko-baranjska ↔ City of Zagreb moves 819 for a net of −517 — 63 %. Heavy traffic does not mean heavy loss.'); },
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
