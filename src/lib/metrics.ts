/* Pure computation layer of the atlas. No DOM, no React.
   Direct port of the verified single-file v4 logic (see reference/).
   Any change here must keep scripts/verify.cjs green — those numbers are
   independently derived from the raw DZS/Pitoski sources. */
import { scaleLinear, type ScaleLinear } from 'd3-scale';
import { interpolateLab } from 'd3-interpolate';
import type { FeatureCollection, Geometry } from 'geojson';
import type {
  AtlasRaw, CitData, CountyProps, DemoData, Den, Dir, Flow, JlsData, JlsProps, Klas, OdMatrix, State,
} from './types.ts';

/* JSON payloads are cast to the shapes in types.ts (via unknown: the inferred
   literal types don't overlap with GeoJSON's/our discriminated interfaces). */
import { L, numI, numR, t, yr, yrSpan } from './i18n.ts';
import GEOjson from '../data/geo_counties.json';
import RAWjson from '../data/atlas_data2.json';
import ODMjson from '../data/odm.json';
import CITjson from '../data/citizen.json';
import JLSjson from '../data/jls_drill.json';
import DEMOjson from '../data/demo.json';
/* geo_jls.json (475 KB) and geo_regions5.json (68 KB) are NOT imported here —
   together they were 53 % of the bundle for two of six views. See geoAsync.ts. */
import { jlsGeo } from './geoAsync.ts';
import { PAPER_KLAS_OF, PAPER_THR, PAPER_WINDOW } from './credits.ts';

export const GEO = GEOjson as unknown as FeatureCollection<Geometry, CountyProps>;
const RAW = RAWjson as unknown as AtlasRaw;
const ODM = ODMjson as unknown as OdMatrix;
export const CIT = CITjson as unknown as CitData;
export const JLS = JLSjson as unknown as JlsData;
export const DEMO = DEMOjson as unknown as DemoData;

export const YEARS = RAW.years;
export const D = RAW.c;
export const Y0 = YEARS[0];
export const YEND = YEARS[YEARS.length - 1];
export const IX2011 = YEARS.indexOf(2011);
export const IX2018 = YEARS.indexOf(2018);
export const ISOS = Object.keys(D);

/* Locale-aware, but shaped exactly like the `Intl.NumberFormat` instances these
   used to be, because ~90 call sites across fifteen components say
   `fmtI.format(x)` and none of them should have to know what language the page
   is in. The delegation is to i18n's pair of real instances — nothing is
   constructed per call.

   This is not cosmetic. Croatian writes `41.986` where English writes `41,986`,
   so an untranslated number is not merely foreign, it is wrong by three orders
   of magnitude to the reader it is shown to. The display minus is U+2212 in both
   languages: that is a glyph choice the house rules pin, not a locale one. */
export const fmtI: Pick<Intl.NumberFormat, 'format'> = { format: n => numI().format(n) };
export const fmtR: Pick<Intl.NumberFormat, 'format'> = { format: n => numR().format(n) };
export const sgn = (v: number, f: Pick<Intl.NumberFormat, 'format'>) =>
  (v > 0 ? '+' : v < 0 ? '−' : '') + f.format(Math.abs(v));

/* The five regions the study proposes. Membership is data and does not move with
   the language; the names are descriptions of place and do — `name` is therefore
   a getter, so every existing `REG[k].name` call site keeps working and reads
   the current language. The English names are translations, not the study's own:
   it is published in Croatian and prints no English forms, so these are the
   atlas's rendering of them, like the membership itself (see the Regije note). */
const REGN: Record<string, [hr: string, en: string]> = {
  zg: ['Zagrebačka regija', 'Zagreb region'],
  sr: ['Središnja Hrvatska', 'Central Croatia'],
  sj: ['Sjevernojadranska', 'North Adriatic'],
  da: ['Dalmatinska', 'Dalmatian'],
  is: ['Istočna', 'Eastern'],
};
const REGC: Record<string, string[]> = {
  zg: ['HR-21', 'HR-01'],
  sr: ['HR-02', 'HR-05', 'HR-20', 'HR-06', 'HR-07', 'HR-03', 'HR-04'],
  sj: ['HR-08', 'HR-18', 'HR-09'],
  da: ['HR-13', 'HR-15', 'HR-17', 'HR-19'],
  is: ['HR-14', 'HR-16', 'HR-12', 'HR-11', 'HR-10'],
};
export const REG: Record<string, { name: string; c: string[] }> = Object.fromEntries(
  Object.keys(REGC).map(k => [k, {
    c: REGC[k],
    get name() { return L(REGN[k][0], REGN[k][1]); },
  }]),
);
export const REGOF: Record<string, string> = {};
for (const k in REG) REG[k].c.forEach(i => { REGOF[i] = k; });

/* Named quantities. Getters for the same reason REG.name is one: they are read
   from the tooltip, the legend, the rail, every aria-label and both export
   formats, and all of those must be in the language the reader chose. */
const FLOWN_: Record<Flow, [string, string]> = {
  tot: ['migracijski saldo', 'net migration'],
  int: ['unutarnji saldo', 'net internal migration'],
  ext: ['vanjski saldo', 'net external migration'],
  nat: ['prirodni prirast', 'natural change'],
  all: ['migracije + prirodni prirast', 'migration + natural change'],
};
export const FLOWN = {} as Record<Flow, string>;
for (const k of Object.keys(FLOWN_) as Flow[]) {
  Object.defineProperty(FLOWN, k, { get: () => L(FLOWN_[k][0], FLOWN_[k][1]), enumerable: true });
}
/* spoken view names for the screen-reader status line */
const VLAB_: Record<string, [string, string]> = {
  saldo: ['saldo', 'net migration'], klas: ['klasifikacija', 'classification'],
  reg: ['regije', 'regions'], flow: ['tokovi', 'flows'], mx: ['matrica', 'matrix'],
  /* "JLS 2018." keeps its scope marker in both: LAU is the EU's own name for
     this tier, and the year is the honesty label, not decoration */
  jmap: ['JLS 2018.', 'LAU 2018'], yrs: ['godine', 'years'],
};
export const VLAB: Record<string, string> = {};
for (const k of Object.keys(VLAB_)) {
  Object.defineProperty(VLAB, k, { get: () => L(VLAB_[k][0], VLAB_[k][1]), enumerable: true });
}
export const SHORTN: Record<string, string> = {
  'HR-01': 'Zagrebačka', 'HR-02': 'Krapinsko-zag.', 'HR-03': 'Sisačko-mosl.', 'HR-04': 'Karlovačka',
  'HR-05': 'Varaždinska', 'HR-06': 'Koprivničko-kr.', 'HR-07': 'Bjelovarsko-bil.', 'HR-08': 'Primorsko-gor.',
  'HR-09': 'Ličko-senjska', 'HR-10': 'Virovitičko-podr.', 'HR-11': 'Požeško-slav.', 'HR-12': 'Brodsko-pos.',
  'HR-13': 'Zadarska', 'HR-14': 'Osječko-bar.', 'HR-15': 'Šibensko-kn.', 'HR-16': 'Vukovarsko-srij.',
  'HR-17': 'Splitsko-dalm.', 'HR-18': 'Istarska', 'HR-19': 'Dubrovačko-ner.', 'HR-20': 'Međimurska', 'HR-21': 'Grad Zagreb',
};
/* Citizenship groups. The ISO country codes inside the neighbourhood label are
   left alone — they are identifiers, and they are what the DZS table lists. */
const CG_: [string, string, string, string][] = [
  ['hr', 'Hrvatska', 'Croatia', '#20262B'],
  ['sus', 'Susjedstvo (BiH·SRB·XK·MK·AL·CG)', 'Neighbourhood (BiH·SRB·XK·MK·AL·ME)', '#A08C6A'],
  ['ukr', 'Ukrajina', 'Ukraine', '#6B5E86'],
  ['eu', 'EU (bez HR)', 'EU (excl. HR)', '#1D4E89'],
  ['az', 'Azija', 'Asia', '#0F7D8C'],
  ['ost', 'Ostalo', 'Other', '#C6CCC4'],
];
/* a getter would not survive destructuring — every call site reads this as a
   list, so it is rebuilt per read instead */
export const cgroups = (): [key: string, label: string, color: string][] =>
  CG_.map(([k, hr, en, c]) => [k, L(hr, en), c]);
export const KCOL: Record<Klas, string> = { gain: '#1D4E89', neu: '#C6CCC4', loss: '#B5341F' };
/* The study's own three classes. "pobjednice/gubitnice" is its vocabulary, and
   the English is the plain reading of it — these name counties, not contests. */
const KLAB_: Record<Klas, [string, string]> = {
  gain: ['pobjednice', 'gaining'], neu: ['neutralne', 'neutral'], loss: ['gubitnice', 'losing'],
};
export const KLAB: Record<Klas, string> = {} as Record<Klas, string>;
for (const k of Object.keys(KLAB_) as Klas[]) {
  Object.defineProperty(KLAB, k, { get: () => L(KLAB_[k][0], KLAB_[k][1]), enumerable: true });
}

/* ── metric machinery ── */
export function natAt(iso: string, yi: number): number {
  const a = D[iso].nat;
  return a && a[yi] != null ? a[yi] : 0;
}
export function netAt(iso: string, yi: number, flow: Flow): number {
  const c = D[iso];
  if (flow === 'int') return c.ii[yi] - c.oi[yi];
  if (flow === 'ext') return c.ie[yi] - c.oe[yi];
  if (flow === 'nat') return natAt(iso, yi);
  const mig = c.ii[yi] - c.oi[yi] + c.ie[yi] - c.oe[yi];
  return flow === 'all' ? mig + natAt(iso, yi) : mig;
}
export function peAt(iso: string, yi: number): number {
  const pe = D[iso].pe;
  for (let i = yi; i >= 0; i--) { const v = pe[i]; if (v != null) return v; }
  for (let i = yi; i < pe.length; i++) { const v = pe[i]; if (v != null) return v; }
  return D[iso].p;
}
export function denom(iso: string, yi: number, den: Den): number {
  return den === 'rel11' ? D[iso].p : den === 'relest' ? peAt(iso, yi) : 1;
}
export function val(iso: string, yi: number, flow: Flow, den: Den, cum: boolean): number {
  let v = 0;
  if (cum) { for (let i = IX2011; i <= yi; i++) v += netAt(iso, i, flow); if (yi < IX2011) v = 0; }
  else v = netAt(iso, yi, flow);
  return den === 'abs' ? v : v / denom(iso, yi, den) * 100;
}
export function regVal(rk: string, yi: number, flow: Flow, den: Den, cum: boolean): number {
  let v = 0, p = 0;
  for (const iso of REG[rk].c) { v += val(iso, yi, flow, 'abs', cum); p += denom(iso, yi, den === 'abs' ? 'rel11' : den); }
  return den === 'abs' ? v : v / p * 100;
}

/* fixed per-(flow×den×cum) domains so scrubbing is comparable across years */
export const DOM: Record<string, number> = {}, RDOM: Record<string, number> = {};
for (const flow of ['tot', 'int', 'ext', 'nat', 'all'] as const)
  for (const den of ['abs', 'rel11', 'relest'] as const)
    for (const cum of [false, true]) {
      let m = 0, rm = 0;
      for (let yi = cum ? IX2011 : 0; yi < YEARS.length; yi++) {
        for (const iso of ISOS) m = Math.max(m, Math.abs(val(iso, yi, flow, den, cum)));
        for (const rk in REG) rm = Math.max(rm, Math.abs(regVal(rk, yi, flow, den, cum)));
      }
      DOM[flow + den + cum] = m; RDOM[flow + den + cum] = rm;
    }

export type ColorScale = ScaleLinear<string, string>;
export function divScale(m: number): ColorScale {
  return scaleLinear<string>().domain([-m, 0, m]).range(['#B5341F', '#F1EEE9', '#1D4E89']).interpolate(interpolateLab).clamp(true);
}
export function seqScale(m: number, dir: Dir): ColorScale {
  return scaleLinear<string>().domain([0, m]).range(['#F1EEE9', dir === 'in' ? '#1D4E89' : '#B5341F']).interpolate(interpolateLab);
}
/* thrRel: threshold as % of the 2011 census instead of absolute persons —
   the paper's −4.500 is absolute while its own figures argue in relatives */
export function klasOf(iso: string, yi: number, thr: number, thrRel = false, thrPct = 1.5): Klas {
  const v = val(iso, yi, 'tot', 'abs', true);
  const lim = thrRel ? thrPct / 100 * D[iso].p : thr;
  return v > 0 ? 'gain' : v >= -lim ? 'neu' : 'loss';
}

/* ── the atlas's klasifikacija vs the study's published one ──────────────────
   Same rule, newer DZS pull, so the membership is not identical. The legend and
   the glossary both name the counties that moved, and neither writes them out:
   a hardcoded pair would keep asserting a difference after a revision closed it
   (or hide one a revision opened), which is the failure the ground-truth table
   exists to prevent. Evaluated once, at the study's own settings — absolute
   threshold, its endpoint — because that is the only state in which the two are
   answering the same question. */
/* `v` travels with each entry so the glossary can say *how far* past the line a
   county fell without any surface hardcoding a number. The distance that matters
   is the one to the threshold on this series (|v| − thr = 606 and 302 today), not
   the gap to the study's own figure: only the first is recomputable here, and the
   glossary used to blur the two into "a few hundred people", which measured true
   of one reading and false of the other. */
export const PAPER_KLAS_DIFF: { iso: string; here: Klas; paper: Klas; v: number }[] = (() => {
  const yi = YEARS.indexOf(PAPER_WINDOW.to);
  if (yi < 0) return [];
  return ISOS.map(iso => ({
    iso, here: klasOf(iso, yi, PAPER_THR), paper: PAPER_KLAS_OF[iso],
    v: val(iso, yi, 'tot', 'abs', true),
  })).filter(d => d.paper && d.here !== d.paper);
})();
/* Is the current state comparable with what the study published? Off its
   threshold, off its endpoint or in relative mode the two measure different
   things, and a "differs from the study" note would be noise rather than
   honesty. */
export function paperKlasComparable(S: State): boolean {
  return !S.thrRel && S.thr === PAPER_THR && YEARS[S.yi] === PAPER_WINDOW.to;
}

/* ── flows — ODM[a][b] = per-year array; 2018 measured, others IPF ── */
export function getOD(a: string, b: string, yi: number): number {
  const r = ODM[a]; if (!r) return 0;
  const s = r[b]; return s ? (s[yi] || 0) : 0;
}
export function fsum(a: string, b: string, yi: number, cum: boolean): number {
  if (!cum) return getOD(a, b, yi);
  let t = 0; for (let i = IX2011; i <= Math.max(yi, IX2011); i++) t += getOD(a, b, i);
  return t;
}
export function flowOf(sel: string, dir: Dir, p: string, yi: number, cum: boolean): number {
  return dir === 'out' ? fsum(sel, p, yi, cum) : dir === 'in' ? fsum(p, sel, yi, cum)
    : fsum(p, sel, yi, cum) - fsum(sel, p, yi, cum);
}
const FC = new Map<string, number>();
export function flowMax(sel: string, dir: Dir, cum: boolean): number {
  const key = sel + '|' + dir + '|' + cum;
  const hit = FC.get(key);
  if (hit != null) return hit;
  let m = 0;
  for (let yi = cum ? IX2011 : 0; yi < YEARS.length; yi++)
    for (const p of ISOS) if (p !== sel) m = Math.max(m, Math.abs(flowOf(sel, dir, p, yi, cum)));
  m = m || 1; FC.set(key, m); return m;
}
export function flowBadge(yi: number, cum: boolean): string {
  return yi === IX2018 && !cum ? t('badge.meas') : t('badge.est');
}

/* ── matrix view: region-block county order + fixed per-(dir×cum) cell domain ── */
export const MXORD: string[] = Object.keys(REG).flatMap(k => REG[k].c);
export function mxCell(r: string, c: string, dir: Dir, yi: number, cum: boolean): number {
  /* rows keep the tokovi semantics: out = r→c, in = c→r, net = row's gain from c */
  return dir === 'out' ? fsum(r, c, yi, cum) : dir === 'in' ? fsum(c, r, yi, cum)
    : fsum(c, r, yi, cum) - fsum(r, c, yi, cum);
}
const MXC = new Map<string, number>();
export function mxMax(dir: Dir, cum: boolean): number {
  const key = dir + '|' + cum;
  const hit = MXC.get(key);
  if (hit != null) return hit;
  let m = 0;
  for (let yi = cum ? IX2011 : 0; yi < YEARS.length; yi++)
    for (const a of ISOS) for (const b of ISOS)
      if (a !== b) m = Math.max(m, Math.abs(mxCell(a, b, dir, yi, cum)));
  m = m || 1; MXC.set(key, m); return m;
}

/* ── Godine: 21 counties × the whole series, one cell per county-year ────────
   The atlas could show any single year on the map and any single county over
   time in the detail card, but never all 21 series at once — so "when did this
   turn" was a question you answered by scrubbing 28 times and remembering. This
   is that panel: rows are counties, columns are years, colour is the same
   diverging ramp and the same fixed per-(flow×den×cum) domain the map uses, so a
   cell here and the map cell for that year are the same colour by construction.

   Cumulative mode starts the columns at 2011 rather than painting nine columns
   of zeros: `val()` returns 0 before IX2011 when cum is set, which is a rendering
   artefact of where the accumulation starts, not a measurement. */
export function yrsCols(cum: boolean): number[] {
  const out: number[] = [];
  for (let i = cum ? IX2011 : 0; i < YEARS.length; i++) out.push(i);
  return out;
}
/* Row order: the window total in the current denominator, descending — the
   ranking Saldo's rail already shows, so the two agree about who is at the top.
   Deliberately keyed to the *window*, not to `S.yi`: ordering by the selected
   year would reshuffle all 21 rows on every arrow press, which is the one thing
   a small-multiples grid exists to avoid. */
export function yrsTotal(iso: string, flow: Flow, den: Den, cols: number[]): number {
  let v = 0;
  for (const yi of cols) v += netAt(iso, yi, flow);
  return den === 'abs' ? v : v / denom(iso, cols[cols.length - 1], den) * 100;
}
export function yrsOrder(flow: Flow, den: Den, cols: number[]): string[] {
  return [...ISOS].sort((a, b) => yrsTotal(b, flow, den, cols) - yrsTotal(a, flow, den, cols));
}
/* Where the inter-county margins start closing. Measured on atlas_data2.json:
   Σ(doseljeni among counties) − Σ(odseljeni) is −550/−519/−464/−489/−490 for
   2002–06 and exactly 0 from 2007, i.e. before 2007 the county rows do not
   balance against each other. Godine is the first view that renders those years
   next to the rest instead of one at a time, so it is the first that can mark
   where they stop — see the rule the grid draws at this column. */
export const IX2007 = YEARS.indexOf(2007);

/* ── JLS map (measured 2018, internal moves only) ── */
export function jlsVal(p: JlsProps, dir: Dir): number {
  return dir === 'out' ? p.o : dir === 'in' ? p.i : p.i - p.o;
}
const JM = new Map<Dir, number>();
export function jmapMax(dir: Dir): number {
  /* the geometry is loaded on demand — return a harmless domain rather than
     caching 1 for the rest of the session while the chunk is still in flight */
  const g = jlsGeo();
  if (!g) return 1;
  const hit = JM.get(dir);
  if (hit != null) return hit;
  let m = 0;
  for (const f of g.features) m = Math.max(m, Math.abs(jlsVal(f.properties, dir)));
  m = m || 1; JM.set(dir, m); return m;
}
/* signed-√ color ramp: 556 JLS with Grad Zagreb 10× above the rest renders
   blank on a linear domain; the √ transform is stated in the legend */
export function jmapScale(dir: Dir): { m: number; scale: (v: number) => string } {
  const m = jmapMax(dir);
  const base = dir === 'net' ? divScale(m) : seqScale(m, dir);
  return { m, scale: v => base(Math.sign(v) * Math.sqrt(Math.abs(v) / m) * m) };
}

/* national series for the scrubber */
export const natExt = YEARS.map((_, yi) => ISOS.reduce((a, iso) => a + D[iso].ie[yi] - D[iso].oe[yi], 0));
export const natVol = YEARS.map((_, yi) => ISOS.reduce((a, iso) => a + D[iso].oi[yi], 0));

/* Spoken summary for one county path. The map's tooltip is a visual-only div, so
   without this the primary view offered 21 tab stops that each read out nothing
   but a name — while the JLS map, whose labels are built from the data, read out
   doseljeno/odseljeno/neto. Same period wording as the legend and the export. */
export function countyAria(S: State, iso: string): string {
  const n = D[iso].n, y = YEARS[S.yi];
  const per = (S.cum || S.view === 'klas') ? yrSpan(2011, y) : yr(y);
  const num = (v: number) => S.den === 'abs' ? sgn(Math.round(v), fmtI) : sgn(v, fmtR) + ' %';
  if (S.view === 'flow') {
    if (iso === S.sel) return n + L(' — odabrana županija', ' — selected county');
    /* `fsum(a, b)` is ODM[a][b], i.e. a → b — so `o` is the hub's outflow
       (hub → county, what arrives *from* the hub) and `i` its inflow
       (county → hub, what leaves *to* it). The two used to be printed the other
       way round: every partner county told a screen reader both of its flow
       directions backwards, in both languages, at every Smjer and year. The
       visible tooltip had it right all along (Tooltip.tsx) — this is the same
       defect v2.0.4 fixed for matrix cells, arriving on the other surface.
       `i − o` stays the *hub-centric* net every visible surface uses (map fill,
       rail row, legend), so it carries the tooltip's subject qualifier rather
       than a flipped sign: inside a county-perspective sentence an unattributed
       net reads as the county's own, which is its inverse. */
    const o = fsum(S.sel!, iso, S.yi, S.cum), i = fsum(iso, S.sel!, S.yi, S.cum);
    const h = D[S.sel!].n;
    return L(`${n}: iz ${h} ${fmtI.format(o)}, u ${h} ${fmtI.format(i)}, neto (${h}) ${sgn(i - o, fmtI)} · ${per}`,
      `${n}: ${fmtI.format(o)} from ${h}, ${fmtI.format(i)} to ${h}, net (${h}) ${sgn(i - o, fmtI)} · ${per}`);
  }
  if (S.view === 'klas') {
    const k = klasOf(iso, S.yi, S.thr, S.thrRel, S.thrPct);
    const v = sgn(Math.round(val(iso, S.yi, 'tot', 'abs', true)), fmtI);
    return L(`${n}: ${KLAB[k]}, saldo ${v} · ${per}`, `${n}: ${KLAB[k]}, net ${v} · ${per}`);
  }
  if (S.view === 'reg') {
    const rk = REGOF[iso];
    return `${n}, ${REG[rk].name}: ${FLOWN[S.flow]} ${num(regVal(rk, S.yi, S.flow, S.den, S.cum))} · ${per}`;
  }
  return `${n}: ${FLOWN[S.flow]} ${num(val(iso, S.yi, S.flow, S.den, S.cum))} · ${per}`;
}

/* export caption from state */
export function exportDesc(S: State): [string, string] {
  if (S.view === 'jmap') {
    return [L('Gradovi i općine: unutarnja migracija (izmjereno)',
      'Towns and municipalities: internal migration (measured)'), yr(2018)];
  }
  const per = (S.cum || S.view === 'klas') ? yrSpan(2011, YEARS[S.yi]) : yr(YEARS[S.yi]);
  const den = S.den === 'rel11' ? L(' · % popisa 2011.', ' · % of 2011 census')
    : S.den === 'relest' ? L(' · % tek. procjene', ' · % of current estimate') : '';
  if (S.view === 'klas') {
    const prag = S.thrRel ? fmtR.format(S.thrPct) + L(' % popisa 2011.', ' % of 2011 census') : fmtI.format(S.thr);
    return [L('Klasifikacija: pobjednice · neutralne · gubitnice (prag −' + prag + ')',
      'Classification: gaining · neutral · losing (threshold −' + prag + ')'), per];
  }
  if (S.view === 'mx') {
    const d = {
      out: L('odlasci (redak → stupac)', 'out (row → column)'),
      in: L('dolasci (stupac → redak)', 'in (column → row)'),
      net: L('neto (redak prema stupcu)', 'net (row against column)'),
    }[S.dir];
    return [L('Matrica tokova: ', 'Flow matrix: ') + d + ' · '
      + (S.cum ? t('badge.cum') : flowBadge(S.yi, S.cum)), per];
  }
  /* The whole grid is on the image, so its period is the rendered window rather
     than the selected year — the year marker is one column of many, and titling
     the figure with it would name the one thing the image is *not* about. */
  if (S.view === 'yrs') {
    const cols = yrsCols(S.cum);
    return [L('Županije kroz godine · ', 'Counties over time · ') + FLOWN[S.flow] + den
      + (S.cum ? L(' · kumulativno', ' · cumulative') : L(' · godišnje', ' · annual')),
    yrSpan(YEARS[cols[0]], YEARS[cols[cols.length - 1]])];
  }
  if (S.view === 'reg') return [L('Regije (5) · ', 'Regions (5) · ') + FLOWN[S.flow] + den, per];
  if (S.view === 'flow') {
    const nm = D[S.sel!]?.n || '';
    /* arrow phrasing, in both languages, for the same reason: Croatian would
       otherwise need the county name declined, and the arrow is the one form
       that is correct for all 21 without a grammar table */
    const d = {
      out: nm + L(' → ostale županije', ' → other counties'),
      in: L('ostale županije → ', 'other counties → ') + nm,
      net: L('Neto tokovi: ', 'Net flows: ') + nm + L(' ↔ partneri', ' ↔ partners'),
    }[S.dir];
    return [d + ' · ' + (S.cum ? t('badge.cum') : flowBadge(S.yi, S.cum)), per];
  }
  return [FLOWN[S.flow] + den, per];
}
