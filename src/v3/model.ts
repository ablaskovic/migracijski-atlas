import { scalePow } from 'd3-scale';
import { D, DOM, ISOS, IX2011, YEARS, val } from '../lib/metrics.ts';
import { detectLang, storedLang, type Lang } from '../lib/i18n.ts';
import type { Flow } from '../lib/types.ts';

export type Explore = 'map' | 'trends' | 'flows';
export interface AtlasState { view: Explore; yi: number; flow: Flow; relative: boolean; cum: boolean; county: string | null; lang: Lang; dir: 'in' | 'out' }
export const FLOWS: Flow[] = ['tot', 'int', 'ext', 'nat', 'all'];

export function readState(): AtlasState {
  const p = new URLSearchParams(location.hash.slice(1));
  const lang = p.get('l') ?? new URLSearchParams(location.search).get('l');
  const year = YEARS.indexOf(Number(p.get('year')));
  const view = p.get('explore');
  const cum = p.get('sum') === '1' && view !== 'trends';
  return {
    view: view === 'flows' || view === 'trends' ? view : 'map',
    yi: Math.max(cum ? IX2011 : 0, year < 0 ? YEARS.length - 1 : year),
    flow: FLOWS.includes(p.get('metric') as Flow) ? p.get('metric') as Flow : 'tot',
    relative: p.get('unit') === 'pct', cum,
    county: ISOS.includes(p.get('county') ?? '') ? p.get('county') : null,
    lang: lang === 'hr' || lang === 'en' ? lang : storedLang() ?? detectLang(),
    dir: p.get('dir') === 'out' ? 'out' : 'in',
  };
}

export function stateHash(s: AtlasState): string {
  const p = new URLSearchParams({ explore: s.view, year: String(YEARS[s.yi]), metric: s.flow, l: s.lang });
  if (s.cum) p.set('sum', '1');
  if (s.relative) p.set('unit', 'pct');
  if (s.county) p.set('county', s.county);
  if (s.dir === 'out') p.set('dir', 'out');
  return '#' + p.toString();
}

export const value = (iso: string, s: AtlasState) => val(iso, s.yi, s.flow, s.relative ? 'rel11' : 'abs', s.cum);
export const domain = (s: AtlasState) => DOM[s.flow + (s.relative ? 'rel11' : 'abs') + s.cum];
export const colors = (max: number, light = false) => scalePow<string>().exponent(.55).domain([-max, 0, max])
  .range(light ? ['#b33f49', '#dce7ea', '#087d68'] : ['#ed9688', '#293c48', '#6ae0be']).clamp(true);
export const ranked = (s: AtlasState) => [...ISOS].sort((a, b) => value(b, s) - value(a, s));
export const fold = (text: string) => text.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const countyName = (iso: string, lang: Lang) => iso === 'HR-21' && lang === 'en' ? 'City of Zagreb' : D[iso].n;
export function totals(s: AtlasState) {
  const isos = s.county ? [s.county] : ISOS;
  const sum = (key: 'ie' | 'oe') => isos.reduce((n, iso) => n + D[iso][key].slice(s.cum ? IX2011 : s.yi, s.yi + 1).reduce((a, b) => a + b, 0), 0);
  return { arrivals: sum('ie'), departures: sum('oe'), net: isos.reduce((n, iso) => n + val(iso, s.yi, s.county ? 'tot' : 'ext', 'abs', s.cum), 0) };
}

export function downloadFile(content: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
