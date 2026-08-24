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
let jlsErr = false;
let regErr = false;
const subs = new Set<() => void>();

export const jlsGeo = (): JlsGeo | null => jls;
export const regGeo = (): RegGeo | null => reg;
/* A chunk that never arrives is a state the render path has to name. Without
   this the JLS view sits under "Učitavanje geometrije JLS…" for ever: `jlsGeo()`
   stays null, which is also the pre-arrival state, so the placeholder is the
   permanent post-failure UI. */
export const jlsFailed = (): boolean => jlsErr;
export const regFailed = (): boolean => regErr;

/* `??=` memoises the *promise*, so a rejected one used to be cached for the
   whole session: leaving the view and coming back returned the same rejection
   and only a reload could recover. Clear the slot on failure so the next call
   genuinely retries, and swallow the rejection here — an unhandled rejection is
   the one outcome that tells the user nothing. */
function load<T>(
  imp: () => Promise<{ default: unknown }>,
  set: (v: T) => void,
  slot: 'jls' | 'reg',
): Promise<void> {
  const p = imp().then(m => {
    set(m.default as T);
    if (slot === 'jls') jlsErr = false; else regErr = false;
  }).catch(() => {
    if (slot === 'jls') { jlsErr = true; jlsP = null; } else { regErr = true; regP = null; }
  }).then(() => { subs.forEach(f => f()); });
  return p;
}

export function loadJlsGeo(): Promise<void> {
  if (jls) return Promise.resolve();
  jlsP ??= load<JlsGeo>(() => import('../data/geo_jls.json'), v => { jls = v; }, 'jls');
  return jlsP;
}
export function loadRegGeo(): Promise<void> {
  if (reg) return Promise.resolve();
  regP ??= load<RegGeo>(() => import('../data/geo_regions5.json'), v => { reg = v; }, 'reg');
  return regP;
}
/* Retry entry point for the error UI.

   This reloads the document rather than re-calling `import()`, and that is not
   laziness: a failed module fetch is recorded in the browser's *module map*, so
   a second `import()` of the same specifier resolves to the cached rejection
   without touching the network. Measured — clearing `jlsP` alone still returned
   0 of 556 features. The whole view state lives in the hash, so a reload is the
   only thing that genuinely re-fetches.

   But "a reload costs the user nothing" is only true while the connection is up,
   and this button appears at the moment it is most likely to be down. Measured
   with the network forced offline after first load: Saldo, Klasifikacija, Regije,
   Tokovi, Matrica and Godine all switch, render and export — a full PNG export
   offline returned successfully — with zero console errors and zero failed
   requests, because everything except the two geometry chunks is already in the
   entry bundle. Pressing retry there replaced that working app with Chrome's own
   network-error page (url `chrome-error://chromewebdata/`), and took the zoom
   transform and the per-view year memory with it — both deliberately outside the
   hash, so a reload cannot restore them. The recovery control destroyed the
   session in exactly the state it exists for.
   So: reload when there is a network to reload over, and otherwise wait for one.
   `offline` is the answer the caller renders instead of a dead button. */
export function retryGeo(): 'reloading' | 'offline' {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    window.addEventListener('online', () => location.reload(), { once: true });
    return 'offline';
  }
  location.reload();
  return 'reloading';
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
