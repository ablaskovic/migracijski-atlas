/* On-demand geometry.

   `geo_jls.json` is 474.951 B — 47 % of the whole bundle — and serves exactly one
   of six views; `geo_regions5.json` is another 67.673 B for one more. Both were
   static imports in metrics.ts, so both were parsed before the *default* Saldo
   view could paint. Split out, the initial chunk drops from 1.019.138 B raw /
   294.756 B gzip to roughly half that.

   The render path stays synchronous — `jlsGeo()` / `regGeo()` return the payload
   or `null` — because every consumer already has to handle "the map box has not
   been measured yet". App subscribes once and re-renders the tree when a payload
   lands; nothing else needs to know this is async. */
import { useEffect, useState } from 'react';
import type { FeatureCollection, Geometry } from 'geojson';
import type { JlsProps, RegionProps } from './types.ts';

export type JlsGeo = FeatureCollection<Geometry, JlsProps>;
export type RegGeo = FeatureCollection<Geometry, RegionProps>;

let jls: JlsGeo | null = null;
let reg: RegGeo | null = null;
let jlsP: Promise<void> | null = null;
let regP: Promise<void> | null = null;
const subs = new Set<() => void>();

export const jlsGeo = (): JlsGeo | null => jls;
export const regGeo = (): RegGeo | null => reg;

export function loadJlsGeo(): Promise<void> {
  if (jls) return Promise.resolve();
  jlsP ??= import('../data/geo_jls.json').then(m => {
    jls = m.default as unknown as JlsGeo;
    subs.forEach(f => f());
  });
  return jlsP;
}
export function loadRegGeo(): Promise<void> {
  if (reg) return Promise.resolve();
  regP ??= import('../data/geo_regions5.json').then(m => {
    reg = m.default as unknown as RegGeo;
    subs.forEach(f => f());
  });
  return regP;
}

/* Called once from App. Loads what the current view needs immediately, and warms
   the rest on a timer so switching views is instant without either payload ever
   touching first paint. Re-renders the whole tree on arrival — App is the root,
   so Rail, Legend and Tooltip pick the data up with it. */
export function useGeo(view: string) {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump(v => v + 1);
    subs.add(f);
    if (view === 'jmap') loadJlsGeo();
    else if (view === 'reg') loadRegGeo();
    return () => { subs.delete(f); };
  }, [view]);
  useEffect(() => {
    const t = setTimeout(() => { loadRegGeo(); loadJlsGeo(); }, 1500);
    return () => clearTimeout(t);
  }, []);
}
