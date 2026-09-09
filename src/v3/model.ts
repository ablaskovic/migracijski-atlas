import { scalePow } from 'd3-scale';
import { D, DOM, ISOS, IX2011, IX2018, YEARS, denName, val } from '../lib/metrics.ts';
import { detectLang, storedLang, type Lang } from '../lib/i18n.ts';
import type { Den, Dir, Flow, State, View } from '../lib/types.ts';
import { BASE } from '../lib/state.ts';
import { STORIES } from '../lib/stories.ts';

export const VIEWS = ['map', 'trends', 'flows', 'classify', 'regions', 'matrix', 'municipalities', 'population'] as const;
export type Explore = typeof VIEWS[number];
export type PopulationTab = 'age' | 'citizenship' | 'countries' | 'municipal';
export interface AtlasState { view: Explore; yi: number; flow: Flow; den: Den; relative: boolean; cum: boolean; county: string | null; lang: Lang; dir: Dir; pair: string | null; thr: number; thrRel: boolean; thrPct: number; panel: PopulationTab; age: 'ext' | 'int'; localScope: 'inter' | 'local'; story: number | null }
export const FLOWS: Flow[] = ['tot', 'int', 'ext', 'nat', 'all'];
export const viewName = (view: Explore, lang: Lang) => ({ map: ['Karta', 'Map'], trends: ['Trendovi', 'Trends'], flows: ['Tokovi', 'Flows'], classify: ['Klasifikacija', 'Classification'], regions: ['Regije', 'Regions'], matrix: ['Matrica', 'Matrix'], municipalities: ['JLS 2018.', 'Municipalities'], population: ['Stanovništvo', 'Population'] }[view][lang === 'hr' ? 0 : 1]);
const classicViews: Record<Explore, View> = { map: 'saldo', trends: 'yrs', flows: 'flow', classify: 'klas', regions: 'reg', matrix: 'mx', municipalities: 'jmap', population: 'saldo' };
export const asClassic = (s: AtlasState): State => ({ ...BASE, lang: s.lang, view: classicViews[s.view], yi: s.yi, flow: s.flow, den: s.den, cum: s.cum, sel: s.county, pair: s.pair, dir: s.dir, thr: s.thr, thrRel: s.thrRel, thrPct: s.thrPct });
export function normalizeState(s: AtlasState): AtlasState {
  const next = { ...s, relative: s.den !== 'abs' };
  if (next.view === 'classify') { next.cum = true; next.flow = 'tot'; next.den = 'abs'; next.relative = false; }
  if (next.view === 'municipalities') { next.yi = IX2018; next.cum = false; }
  if (next.view === 'population') {
    next.cum = false;
    next.yi = next.panel === 'municipal' ? IX2018 : next.panel === 'citizenship' ? Math.max(YEARS.indexOf(2021), next.yi) : YEARS.length - 1;
  }
  if (next.cum && next.yi < IX2011) next.yi = IX2011;
  if (next.pair === (next.county ?? 'HR-21')) next.pair = null;
  return next;
}

export function findingPatch(index: number): Partial<AtlasState> {
  const p = STORIES[index].patch;
  const view = p.citz || p.age || p.jls ? 'population' : (Object.keys(classicViews) as Explore[]).find(v => classicViews[v] === p.view) ?? 'map';
  const den = p.den ?? 'abs';
  return { view, flow: p.flow ?? 'tot', den, relative: den !== 'abs', yi: p.yi ?? BASE.yi, cum: p.cum ?? false, county: p.sel ?? null, pair: p.pair ?? null, dir: p.dir ?? 'in', thr: p.thr ?? BASE.thr, thrRel: p.thrRel ?? false, thrPct: p.thrPct ?? 1.5, panel: p.citz ? 'citizenship' : p.jls ? 'municipal' : 'age', age: p.ageTab ?? 'ext', localScope: p.jlsTab === 'loc' ? 'local' : 'inter', story: index };
}

export function readState(): AtlasState {
  const p = new URLSearchParams(location.hash.slice(1));
  const lang = p.get('l') ?? new URLSearchParams(location.search).get('l');
  const year = YEARS.indexOf(Number(p.get('year')));
  const view = VIEWS.includes(p.get('explore') as Explore) ? p.get('explore') as Explore : 'map';
  const cum = p.get('sum') === '1';
  const den = p.get('unit') === 'estimate' ? 'relest' : p.get('unit') === 'pct' ? 'rel11' : 'abs';
  const bounded = (key: string, fallback: number, lo: number, hi: number) => { const n = Number(p.get(key)); return p.has(key) && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback; };
  const story = p.has('finding') && /^\d+$/.test(p.get('finding')!) ? Number(p.get('finding')) : -1;
  const result = normalizeState({
    view,
    yi: Math.max(cum ? IX2011 : 0, year < 0 ? YEARS.length - 1 : year),
    flow: FLOWS.includes(p.get('metric') as Flow) ? p.get('metric') as Flow : 'tot',
    relative: den !== 'abs', den, cum,
    county: ISOS.includes(p.get('county') ?? '') ? p.get('county') : null,
    lang: lang === 'hr' || lang === 'en' ? lang : storedLang() ?? detectLang(),
    dir: p.get('dir') === 'out' || p.get('dir') === 'net' ? p.get('dir') as Dir : 'in',
    pair: ISOS.includes(p.get('pair') ?? '') ? p.get('pair') : null,
    thr: bounded('threshold', BASE.thr, 500, 15000), thrRel: p.get('thresholdUnit') === 'pct', thrPct: bounded('thresholdPct', 1.5, .5, 5),
    panel: ['age', 'citizenship', 'countries', 'municipal'].includes(p.get('panel') ?? '') ? p.get('panel') as PopulationTab : 'age',
    age: p.get('age') === 'int' ? 'int' : 'ext', localScope: p.get('local') === '1' ? 'local' : 'inter',
    story: story >= 0 && story < STORIES.length ? story : null,
  });
  if (result.story != null) {
    const expected = findingPatch(result.story);
    if (Object.entries(expected).some(([k, v]) => result[k as keyof AtlasState] !== v)) result.story = null;
  }
  return result;
}

export function stateHash(s: AtlasState): string {
  const p = new URLSearchParams({ explore: s.view, year: String(YEARS[s.yi]), metric: s.flow, l: s.lang });
  if (s.cum) p.set('sum', '1');
  if (s.den !== 'abs') p.set('unit', s.den === 'relest' ? 'estimate' : 'pct');
  if (s.county) p.set('county', s.county);
  if (s.dir !== 'in') p.set('dir', s.dir);
  if (s.pair) p.set('pair', s.pair);
  if (s.thr !== BASE.thr) p.set('threshold', String(s.thr));
  if (s.thrRel) p.set('thresholdUnit', 'pct');
  if (s.thrPct !== 1.5) p.set('thresholdPct', String(s.thrPct));
  if (s.view === 'population') p.set('panel', s.panel);
  if (s.age !== 'ext') p.set('age', s.age);
  if (s.localScope === 'local') p.set('local', '1');
  if (s.story != null) p.set('finding', String(s.story));
  return '#' + p.toString();
}

export const value = (iso: string, s: AtlasState) => val(iso, s.yi, s.flow, s.den, s.cum);
export const unitName = (s: Pick<AtlasState, 'den' | 'yi' | 'lang'>) => s.den === 'abs' ? (s.lang === 'hr' ? 'broj osoba' : 'people') : denName(s.den, s.yi).replace(/^\s*·\s*/, '');
export const domain = (s: AtlasState) => DOM[s.flow + s.den + s.cum];
export const colors = (max: number, light = false) => scalePow<string>().exponent(.55).domain([-max, 0, max])
  .range(light ? ['#b33f49', '#dce7ea', '#087d68'] : ['#ed9688', '#293c48', '#6ae0be']).clamp(true);
export const ranked = (s: AtlasState) => [...ISOS].sort((a, b) => value(b, s) - value(a, s));
export const fold = (text: string) => text.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const countyName = (iso: string, lang: Lang) => iso === 'HR-21' && lang === 'en' ? 'City of Zagreb' : D[iso].n;
export function totals(s: AtlasState, isos = s.county ? [s.county] : ISOS) {
  const sum = (key: 'ie' | 'oe') => isos.reduce((n, iso) => n + D[iso][key].slice(s.cum ? IX2011 : s.yi, s.yi + 1).reduce((a, b) => a + b, 0), 0);
  return { arrivals: sum('ie'), departures: sum('oe'), net: isos.reduce((n, iso) => n + val(iso, s.yi, s.county ? 'tot' : 'ext', 'abs', s.cum), 0) };
}

export function downloadFile(content: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
