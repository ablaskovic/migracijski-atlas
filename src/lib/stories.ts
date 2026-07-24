/* "Nalazi" — curated state presets that walk a reader to the atlas's strongest
   findings (handoff §8 outreach set). Each entry is a plain State patch plus a
   one-breath Croatian caption; App applies the patch and shows the banner.
   Numbers here are display copy only — the map/rail render the same values from
   metrics.ts, so a data refresh that moves them must update these captions too
   (same rule as the CLAUDE.md ground-truth table). */
import { YEARS, IX2018 } from './metrics.ts';
import type { Patch } from './types.ts';

const Y24 = YEARS.indexOf(2024), Y25 = YEARS.indexOf(2025);

export interface Story { label: string; cap: string; patch: Patch }

export const STORIES: Story[] = [
  {
    label: 'Zagreb gubi samo od prstena',
    cap: 'Jedini partner s kojim Grad Zagreb neto gubi jest vlastiti prsten — Zagrebačka (−334 u izmjerenoj 2018.). Svi ostali smjerovi hrane Zagreb.',
    patch: { view: 'flow', sel: 'HR-21', dir: 'net', cum: false, yi: IX2018, flowSeen: true, pair: 'HR-01', jls: false },
  },
  {
    label: 'Samo tri županije u plusu',
    cap: 'S prirodnim kretanjem u zbroju, 2011.–2024. rastu samo tri županije: Grad Zagreb +27.521, Istarska +11.531 i Zadarska +3.292. Dno: Osječko-baranjska −48.271.',
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
];
