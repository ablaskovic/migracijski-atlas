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
import { L } from './i18n.ts';

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

/* One wording for the two states, because two surfaces render it. MapView's
   placeholder had it inline and the rail beside it had nothing at all: with
   geo_jls aborted the aside drew its heading "JLS — 10 najvećih dobitaka i
   gubitaka" and its period "neto · 2018." over a group with zero children and
   no text of any kind — a named, 462 px-tall empty column promising a ranked
   top-10, in both languages, on the failure path and for the whole duration of
   an ordinary fetch. Copying the strings into Rail would have made them two
   facts that drift; they are one, and it lives beside the flags it reads. */
export const geoStatus = (jm: boolean): string =>
  (jm ? jlsErr : regErr)
    ? (jm ? L('Geometrija JLS nije učitana.', 'LAU geometry failed to load.')
      : L('Geometrija regija nije učitana.', 'Region geometry failed to load.'))
    : (jm ? L('Učitavanje geometrije JLS…', 'Loading LAU geometry…')
      : L('Učitavanje geometrije regija…', 'Loading region geometry…'));

/* `??=` memoises the *promise*, so a rejected one used to be cached for the
   whole session: leaving the view and coming back returned the same rejection
   and only a reload could recover. Clear the slot on failure so the next call
   genuinely retries, and swallow the rejection here — an unhandled rejection is
   the one outcome that tells the user nothing. */
/* `speculative` separates a fetch the reader asked for from one the app decided
   to make on their behalf. The warm timer below fires both chunks whether or not
   the reader ever opens those views, and its rejection used to run through this
   same catch — so a reader in a tunnel, a lift, or a Wi-Fi-to-cell handover at
   t=1,5 s had BOTH error flags latched while sitting in Saldo, seeing nothing.
   Seconds later, on a fully healthy connection, pressing Regije and then
   JLS 2018. showed "Geometrija … nije učitana." for the rest of the session,
   because a failed module fetch is cached in the browser's module map (the note
   on retryGeo says so). The app was permanently wrong about the network on the
   strength of a request nobody made. A speculative failure clears the promise
   slot so the next real call retries, and says nothing. */
/* …and speculative-ness is a property of the CALL, not of the promise. `??=`
   memoises the promise, so the flag used to be frozen by whichever call created
   it — and the warm always creates it first. A reader who pressed "JLS 2018."
   while the t=1,5 s warm was still in flight (on a slow connection, roughly the
   whole 1,5–12 s window) was handed the warm's promise and issued no request of
   their own; when it failed, the catch read the warm's `speculative = true`, set
   no flag, and MapView — which gates the entire failure UI on jlsFailed() —
   rendered "Učitavanje geometrije JLS…" for ever, for a view they had explicitly
   asked for. No #jerror, no #jretry, both exporters held, and nothing left to
   re-trigger it: measured, still spinning 7,5 s later, recoverable only by
   leaving the view and coming back, which no reader has any reason to try.
   Kept per slot and mutable, so a real call joining an in-flight warm makes the
   outcome the reader's, while a warm nobody joined still says nothing. */
let jlsSpec = false, regSpec = false;
/* FETCHED, not imported.

   `import('../data/geo_jls.json')` made the payload a JS chunk and put its
   failure in the browser's MODULE MAP, where it is pinned: a second import() of
   the same specifier resolves to the cached rejection without touching the
   network, which is why the retry had to reload the whole document — and why
   pressing it offline replaced a working app with Chrome's error page.
   `new URL(…, import.meta.url)` gives the same content-hashed asset URL with
   none of that. A failed fetch pins nothing, so the retry is a retry; the
   payload is served as application/json rather than wrapped in a module, so
   there is no chunk and no source map to drop; and the URL is still hashed and
   still immutable, so the caching story is unchanged.
   `cache: 'no-store'` ONLY on a retry — the happy path must take the immutable
   cache, and a retry must not be answered by whatever failed last time. */
function load<T>(
  url: string,
  set: (v: T) => void,
  slot: 'jls' | 'reg',
  retry = false,
): Promise<void> {
  const p = fetch(url, retry ? { cache: 'no-store' } : undefined).then(r => {
    /* a 404 body parses as JSON just as happily as the payload does when the
       server answers the SPA shell — the status is what says which */
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }).then(m => {
    set(m as T);
    if (slot === 'jls') jlsErr = false; else regErr = false;
  }).catch(() => {
    if (slot === 'jls') { jlsP = null; if (!jlsSpec) jlsErr = true; }
    else { regP = null; if (!regSpec) regErr = true; }
  }).then(() => { subs.forEach(f => f()); });
  return p;
}

/* The two payloads' own URLs. `new URL(specifier, import.meta.url)` is what
   Vite rewrites into a hashed asset reference at build time — the same hashing
   the chunks had, without the module semantics. */
const JLS_URL = new URL('../data/geo_jls.json', import.meta.url).href;
const REG_URL = new URL('../data/geo_regions5.json', import.meta.url).href;

export function loadJlsGeo(speculative = false): Promise<void> {
  if (jls) return Promise.resolve();
  /* before the memo, so a real request that joins an in-flight warm clears the
     flag the warm set — the failure is now one a reader is waiting on */
  if (!speculative) jlsSpec = false;
  if (!jlsP) { jlsSpec = speculative; jlsP = load<JlsGeo>(JLS_URL, v => { jls = v; }, 'jls'); }
  return jlsP;
}
export function loadRegGeo(speculative = false): Promise<void> {
  if (reg) return Promise.resolve();
  if (!speculative) regSpec = false;
  if (!regP) { regSpec = speculative; regP = load<RegGeo>(REG_URL, v => { reg = v; }, 'reg'); }
  return regP;
}
/* Retry entry point for the error UI.

   It used to reload the document, and that was not laziness: while the payload
   was a module, a failed fetch was recorded in the browser's *module map*, so a
   second `import()` of the same specifier resolved to the cached rejection
   without touching the network — measured, clearing `jlsP` alone still returned
   0 of 556 features. A reload was the only thing that genuinely re-fetched.
   The payload is a fetched asset now (see `load` above), so nothing is pinned
   and the retry is an ordinary re-request. Measured: with the payload failing,
   a zoom of translate(-400,-106) scale(2) made by the reader, and the server
   then healthy — one press clears #jerror, draws all 556 municipalities, makes
   ZERO navigations, and leaves that transform exactly where it was. A reload
   could not have restored it, because it is deliberately outside the hash.

   The offline branch stays, and so does the reason for it. Measured with the
   network forced offline after first load: Saldo, Klasifikacija, Regije,
   Tokovi, Matrica and Godine all switch, render and export — a full PNG export
   offline returned successfully — with zero console errors and zero failed
   requests, because everything except the two geometry payloads is already in
   the entry bundle. Back when this reloaded, pressing retry there replaced that
   working app with Chrome's own network-error page (url
   `chrome-error://chromewebdata/`); it cannot do that now, but a request that
   is going to fail is still worth not making, and a reader who is told "this
   will resume by itself" is better served than one who is handed the same error
   again. `offline` is the answer the caller renders instead of a dead button,
   and what the deferral now resumes with is a re-fetch. */
/* …and the deferred re-fetch is disarmable, because when it was a deferred
   RELOAD it was armed for the rest of the session and scoped to nothing. A reader offline in the JLS view presses
   the retry, goes back to Klasifikacija — which works completely offline,
   exports included — rebuilds a zoom transform and a per-view year window, and
   an hour later the connection returns and the document reloads under them,
   taking vmem and the zoom with it. Both are deliberately outside the hash, so
   a reload cannot restore them: that is the exact loss this deferral exists to
   avoid, arriving by another door, with the notice that explained it long off
   screen. Every press armed one more.
   The caller owns the arming now and drops it when the view that asked is no
   longer the view on screen. Pressing retry again is one click; an unannounced
   reload is not recoverable at all. */
let disarmOnline: (() => void) | null = null;
/* Arm the deferral. Split out because two paths reach it now: the OS flag saying
   there is no network, and a reachability probe saying the origin cannot be
   reached anyway. */
function armOnline(): 'offline' {
  disarmOnline?.();
  const ac = new AbortController();
  /* re-FETCH when the network returns, not reload. The reload was never the
     point — it was the only way past a pinned module-map rejection, and there is
     no module map now. Refetching keeps the zoom transform and the per-view year
     memory, which are deliberately outside the hash and which a reload could not
     restore: the loss this whole deferral was built to avoid is simply gone. */
  window.addEventListener('online', () => { void refetch(); }, { once: true, signal: ac.signal });
  disarmOnline = () => { ac.abort(); disarmOnline = null; };
  return 'offline';
}
/* Clear whichever slot failed and ask for it again. The promise memo is what
   makes a second call a no-op, so it is the thing to drop; the error flag goes
   with it, so the view returns to "loading" rather than sitting on an error
   while the request is in flight. */
function refetch(): Promise<void> {
  const jobs: Promise<void>[] = [];
  if (jlsErr || (!jls && jlsP === null)) {
    jlsErr = false; jlsP = null;
    jobs.push(load<JlsGeo>(JLS_URL, v => { jls = v; }, 'jls', true));
    jlsP = jobs[jobs.length - 1];
  }
  if (regErr || (!reg && regP === null)) {
    regErr = false; regP = null;
    jobs.push(load<RegGeo>(REG_URL, v => { reg = v; }, 'reg', true));
    regP = jobs[jobs.length - 1];
  }
  subs.forEach(f => f());
  return Promise.all(jobs).then(() => undefined);
}
/* REACHABILITY, not the OS flag.

   `navigator.onLine === false` is a reliable "no", and its `true` is worth
   almost nothing: it means an interface is up. Behind a captive portal, with
   DNS down, or on a network that answers the handshake and drops the request,
   the flag reads true and the retry goes ahead into a request that cannot
   succeed, so the reader presses the button and gets the same error back.
   The probe is what makes the difference between that and the deferral, which
   says the retry will resume by itself when the connection returns.
   It mattered more than that once: when this function ended in
   `location.reload()`, a true from the flag on a dead network replaced a
   working app — every view but this one renders and exports from the entry
   bundle — with the browser's network-error page, so the safe branch was the
   one that lost the session. The payload is fetched rather than imported now
   and the retry is a re-fetch, so that particular cliff is gone; the probe
   stays because a request that is going to fail is still worth not making.

   So the flag is asked first, because a false is free and certain, and then the
   origin is asked whether it is actually reachable: a HEAD for a file that is
   already in the document, no-store so nothing answers it from cache, and a
   3 s cap because this runs under a finger on a button. Any failure — a reject,
   a non-ok status, or the timeout — takes the same deferral the offline flag
   takes, which is the outcome that keeps the session.

   /favicon.svg rather than a hashed asset: it is 2 kB, it exists at a stable
   path the rewrite excludes, and a redeploy cannot make its name stale. */
const REACH_MS = 3000;
async function reachable(): Promise<boolean> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), REACH_MS);
    try {
      const r = await fetch('/favicon.svg', { cache: 'no-store', method: 'HEAD', signal: ac.signal });
      return r.ok;
    } finally { clearTimeout(t); }
  } catch { return false; }
}
export async function retryGeo(): Promise<'reloading' | 'offline'> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return armOnline();
  if (!(await reachable())) return armOnline();
  /* 'reloading' is kept as the word the caller already renders against, and it
     is still what the reader sees happen — the view goes back to loading and
     comes back with the map. What it no longer means is `location.reload()`. */
  await refetch();
  return 'reloading';
}
/** Drop a deferred re-fetch that is no longer wanted. Safe to call when none is armed. */
export const cancelRetry = (): void => { disarmOnline?.(); };
/** Whether one is armed. MapView renders the "it will resume by itself" notice
 *  from this rather than from a flag of its own, so the notice cannot outlive
 *  the arming — see the note at its useState. The suite asserts that notice,
 *  #joffline, not this accessor: the comment used to promise a check that reads
 *  `retryArmed` by name, and there is none. */
export const retryArmed = (): boolean => disarmOnline !== null;

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
  /* The warm is speculative in both senses now: it is marked as such, so a
     failure cannot latch a user-facing error for a view nobody opened, and it is
     skipped where the reader has told the browser not to spend their data.
     Measured on a cold load in the default view with nothing clicked, this timer
     fetched 463.888 B + 67.670 B — 41 % of the 1.302.108 B total — for two views
     that were never opened, and evaluating geo_jls costs 24,4 ms of main thread
     (~100 ms at 4× CPU) 1,5 s into the session. Save-Data and 2g are exactly the
     readers for whom that trade is wrong; they still get either chunk the moment
     they ask for the view, through the effect above. */
  useEffect(() => {
    const c = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (c?.saveData === true || /(^|-)2g$/.test(c?.effectiveType ?? '')) return;
    const t = setTimeout(() => { loadRegGeo(true); loadJlsGeo(true); }, 1500);
    return () => clearTimeout(t);
  }, []);
}
