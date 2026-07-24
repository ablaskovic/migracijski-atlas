/* Pure computation layer of the atlas. No DOM, no React.
   Direct port of the verified single-file v4 logic (see reference/).
   Any change here must keep scripts/verify.cjs green — those numbers are
   independently derived from the raw DZS/Pitoski sources. */
import { scaleLinear, type ScaleLinear } from 'd3-scale';
import { interpolateLab } from 'd3-interpolate';
import type { FeatureCollection, Geometry } from 'geojson';
import type {
  AtlasRaw, CitData, CountyProps, Den, Dir, Flow, JlsData, Klas, OdMatrix, RegionProps, State,
} from './types.ts';

/* JSON payloads are cast to the shapes in types.ts (via unknown: the inferred
   literal types don't overlap with GeoJSON's/our discriminated interfaces). */
import GEOjson from '../data/geo_counties.json';
import REGGEOjson from '../data/geo_regions5.json';
import RAWjson from '../data/atlas_data2.json';
import ODMjson from '../data/odm.json';
import CITjson from '../data/citizen.json';
import JLSjson from '../data/jls_drill.json';

export const GEO = GEOjson as unknown as FeatureCollection<Geometry, CountyProps>;
export const REGGEO = REGGEOjson as unknown as FeatureCollection<Geometry, RegionProps>;
const RAW = RAWjson as unknown as AtlasRaw;
const ODM = ODMjson as unknown as OdMatrix;
export const CIT = CITjson as unknown as CitData;
export const JLS = JLSjson as unknown as JlsData;

export const YEARS = RAW.years;
export const D = RAW.c;
export const Y0 = YEARS[0];
export const YEND = YEARS[YEARS.length - 1];
export const IX2011 = YEARS.indexOf(2011);
export const IX2018 = YEARS.indexOf(2018);
export const ISOS = Object.keys(D);

export const fmtI = new Intl.NumberFormat('hr-HR');
export const fmtR = new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const sgn = (v: number, f: Intl.NumberFormat) =>
  (v > 0 ? '+' : v < 0 ? '−' : '') + f.format(Math.abs(v));

export const REG: Record<string, { name: string; c: string[] }> = {
  zg: { name: 'Zagrebačka regija', c: ['HR-21', 'HR-01'] },
  sr: { name: 'Središnja Hrvatska', c: ['HR-02', 'HR-05', 'HR-20', 'HR-06', 'HR-07', 'HR-03', 'HR-04'] },
  sj: { name: 'Sjevernojadranska', c: ['HR-08', 'HR-18', 'HR-09'] },
  da: { name: 'Dalmatinska', c: ['HR-13', 'HR-15', 'HR-17', 'HR-19'] },
  is: { name: 'Istočna', c: ['HR-14', 'HR-16', 'HR-12', 'HR-11', 'HR-10'] },
};
export const REGOF: Record<string, string> = {};
for (const k in REG) REG[k].c.forEach(i => { REGOF[i] = k; });

export const FLOWN: Record<Flow, string> = {
  tot: 'migracijski saldo', int: 'unutarnji saldo', ext: 'vanjski saldo',
  nat: 'prirodni prirast', all: 'ukupna promjena (migracije + prirodni prirast)',
};
export const SHORTN: Record<string, string> = {
  'HR-01': 'Zagrebačka', 'HR-02': 'Krapinsko-zag.', 'HR-03': 'Sisačko-mosl.', 'HR-04': 'Karlovačka',
  'HR-05': 'Varaždinska', 'HR-06': 'Koprivničko-kr.', 'HR-07': 'Bjelovarsko-bil.', 'HR-08': 'Primorsko-gor.',
  'HR-09': 'Ličko-senjska', 'HR-10': 'Virovitičko-podr.', 'HR-11': 'Požeško-slav.', 'HR-12': 'Brodsko-pos.',
  'HR-13': 'Zadarska', 'HR-14': 'Osječko-bar.', 'HR-15': 'Šibensko-kn.', 'HR-16': 'Vukovarsko-srij.',
  'HR-17': 'Splitsko-dalm.', 'HR-18': 'Istarska', 'HR-19': 'Dubrovačko-ner.', 'HR-20': 'Međimurska', 'HR-21': 'Grad Zagreb',
};
export const CGROUPS: [key: string, label: string, color: string][] = [
  ['hr', 'Hrvatska', '#20262B'],
  ['sus', 'Susjedstvo (BiH·SRB·XK·MK·AL·CG)', '#A08C6A'],
  ['ukr', 'Ukrajina', '#6B5E86'],
  ['eu', 'EU (bez HR)', '#1D4E89'],
  ['az', 'Azija', '#0F7D8C'],
  ['ost', 'Ostalo', '#C6CCC4'],
];
export const KCOL: Record<Klas, string> = { gain: '#1D4E89', neu: '#C6CCC4', loss: '#B5341F' };
export const KLAB: Record<Klas, string> = { gain: 'pobjednice', neu: 'neutralne', loss: 'gubitnice' };

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
export function klasOf(iso: string, yi: number, thr: number): Klas {
  const v = val(iso, yi, 'tot', 'abs', true);
  return v > 0 ? 'gain' : v >= -thr ? 'neu' : 'loss';
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
  return yi === IX2018 && !cum ? 'izmjereno' : 'procjena (IPF)';
}

/* national series for the scrubber */
export const natExt = YEARS.map((_, yi) => ISOS.reduce((a, iso) => a + D[iso].ie[yi] - D[iso].oe[yi], 0));
export const natVol = YEARS.map((_, yi) => ISOS.reduce((a, iso) => a + D[iso].oi[yi], 0));

/* export caption from state */
export function exportDesc(S: State): [string, string] {
  const per = (S.cum || S.view === 'klas') ? '2011.–' + YEARS[S.yi] + '.' : YEARS[S.yi] + '.';
  const den = S.den === 'rel11' ? ' · % popisa 2011.' : S.den === 'relest' ? ' · % tek. procjene' : '';
  if (S.view === 'klas') return ['Klasifikacija: pobjednice · neutralne · gubitnice (prag −' + fmtI.format(S.thr) + ')', per];
  if (S.view === 'reg') return ['Regije (5) · ' + FLOWN[S.flow] + den, per];
  if (S.view === 'flow') {
    const nm = D[S.sel!]?.n || '';
    const d = { out: nm + ' → ostale županije', in: 'ostale županije → ' + nm, net: 'Neto tokovi: ' + nm + ' ↔ partneri' }[S.dir];
    return [d + ' · ' + (S.cum ? 'kumulativna procjena' : flowBadge(S.yi, S.cum)), per];
  }
  return [FLOWN[S.flow] + den, per];
}
