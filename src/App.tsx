import { useEffect, useRef, useState } from 'react';
import { YEARS, IX2011, IX2018 } from './lib/metrics.ts';
import { decodeHash, encodeHash } from './lib/hash.ts';
import { STORIES } from './lib/stories.ts';
import Header from './components/Header.tsx';
import MapView from './components/MapView.tsx';
import Rail from './components/Rail.tsx';
import Scrubber from './components/Scrubber.tsx';
import Tooltip from './components/Tooltip.tsx';
import { exportPNG, exportSVG, type ExportInfo } from './lib/exportPng.ts';
import type { Patch, State, View } from './lib/types.ts';

declare global {
  interface Window {
    __exportPNG?: (dl?: boolean) => Promise<ExportInfo | undefined>;
    __exportSVG?: (dl?: boolean) => string | undefined;
  }
}

/* State shape and transition rules extend the verified single-file v4.
   scripts/verify.cjs exercises them; keep it green.
   Deliberate v4 deviation: first entry into a flow-ish view (Tokovi/Matrica)
   always lands on godišnje 2018 — lead with the measured matrix, not the IPF
   cumulative estimate. */
const BASE: State = {
  view: 'saldo', flow: 'tot', den: 'abs', cum: true, yi: YEARS.indexOf(2024),
  thr: 4500, thrRel: false, thrPct: 1.5, playing: false, hl: null, sel: null,
  pair: null, pairHl: null, jlsHl: null, dir: 'net', flowSeen: false,
  labels: false, citz: false, jls: false, age: false,
  jlsTab: 'inter', citzTab: 'grp', ageTab: 'ext', story: null,
};
const INITIAL: State = { ...BASE, ...decodeHash(location.hash) };

export default function App() {
  const [S, setS] = useState(INITIAL);
  const ref = useRef(S); ref.current = S;
  const up = (patch: Patch) => setS(s => ({ ...s, ...patch }));

  /* ── control transitions (v4 semantics + mx/jmap) ── */
  const setView = (v: View) => {
    const s = ref.current;
    const p: Patch = { view: v, playing: false };
    if (v === 'flow' || v === 'mx') {
      if (v === 'flow' && !s.sel) p.sel = 'HR-21';
      if (!s.flowSeen) { p.flowSeen = true; p.cum = false; p.yi = IX2018; }
    }
    if (s.view === 'flow' && v !== 'flow') { p.sel = null; p.pair = null; }
    if (v === 'jmap') { p.yi = IX2018; p.cum = false; }
    if ((v === 'klas' || (p.cum ?? s.cum)) && (p.yi ?? s.yi) < IX2011) p.yi = IX2011;
    up(p);
  };
  const setMode = (v: 'yr' | 'cum') => {
    const s = ref.current, cum = v === 'cum';
    up({ cum, ...(cum && s.yi < IX2011 ? { yi: IX2011 } : {}) });
  };
  const selectCounty = (iso: string) => {
    const s = ref.current;
    if (s.view === 'flow') up({ sel: iso, ...(s.pair === iso ? { pair: null } : {}) });
    else up({ sel: s.sel === iso ? null : iso });
  };
  const openPair = (iso: string) => {
    const s = ref.current;
    if (s.view === 'flow') up({ pair: s.pair === iso ? null : iso });
  };
  /* matrix rail: jump into tokovi with the corridor's pair card open */
  const jumpFlow = (a: string, b: string) => up({ view: 'flow', sel: a, pair: b, flowSeen: true, playing: false });
  const setYi = (yi: number) => up({ yi });
  const applyStory = (i: number) => up({ ...STORIES[i].patch, story: i, playing: false });

  /* chip panels are mutually exclusive */
  const toggleCitz = () => { const s = ref.current; up({ citz: !s.citz, jls: false, age: false }); };
  const toggleJls = () => { const s = ref.current; up({ jls: !s.jls, citz: false, age: false }); };
  const toggleAge = () => { const s = ref.current; up({ age: !s.age, citz: false, jls: false }); };

  /* ── play loop (inert in jmap: single measured year) ── */
  useEffect(() => {
    if (!S.playing) return;
    const t = setInterval(() => {
      setS(s => {
        if (!s.playing) return s;
        const next = s.yi + 1;
        if (next >= YEARS.length) return { ...s, yi: YEARS.length - 1, playing: false };
        return { ...s, yi: next };
      });
    }, 650);
    return () => clearInterval(t);
  }, [S.playing]);
  const togglePlay = () => {
    const s = ref.current;
    if (s.view === 'jmap') return;
    if (s.playing) { up({ playing: false }); return; }
    const min = (s.cum || s.view === 'klas') ? IX2011 : 0;
    up({ playing: true, ...(s.yi >= YEARS.length - 1 ? { yi: min } : {}) });
  };

  /* ── global effects: hash sync + body classes + keyboard ── */
  useEffect(() => {
    const h = '#' + encodeHash(S);
    if (location.hash !== h) history.replaceState(null, '', h);
  }, [S]);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.body.classList.add('reduced');
    window.__exportPNG = dl => exportPNG(document.querySelector<SVGSVGElement>('#map')!, ref.current, dl);
    window.__exportSVG = dl => exportSVG(document.querySelector<SVGSVGElement>('#map')!, ref.current, dl);
    return () => { delete window.__exportPNG; delete window.__exportSVG; };
  }, []);
  useEffect(() => { document.body.classList.toggle('panel-open', S.citz || S.jls || S.age); }, [S.citz, S.jls, S.age]);
  /* Touch fires pointerenter but never pointerleave, so a tapped feature would
     leave its tooltip on screen forever. Clear the highlight on any pointerdown
     that is not itself a map feature — the tip is the only value readout in the
     matrix/JLS views, so it must stay tappable rather than be disabled outright. */
  useEffect(() => {
    const onDown = (ev: PointerEvent) => {
      const t = ev.target as Element | null;
      if (t && t.closest && t.closest('.cnt,.mxc,.jl,.mxhit')) return;
      const s = ref.current;
      if (s.hl || s.pairHl || s.jlsHl != null) up({ hl: null, pairHl: null, jlsHl: null });
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);
  useEffect(() => { document.body.classList.toggle('story-open', S.story != null); }, [S.story]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT') return;
      const s = ref.current;
      if (s.view === 'jmap') return;
      if (ev.key === 'ArrowRight' && s.yi < YEARS.length - 1) up({ yi: s.yi + 1 });
      if (ev.key === 'ArrowLeft') { const min = (s.cum || s.view === 'klas') ? IX2011 : 0; if (s.yi > min) up({ yi: s.yi - 1 }); }
      if (ev.key === ' ') { ev.preventDefault(); togglePlay(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // handlers read ref.current — no stale closures
  const setHL = (iso: string | null) => { if (ref.current.hl !== iso) up({ hl: iso }); };
  const setJlsHl = (j: number | null) => { if (ref.current.jlsHl !== j) up({ jlsHl: j }); };

  return (
    <>
      <Header S={S} setS={up} setView={setView} setMode={setMode} applyStory={applyStory} />
      <div className="main">
        <MapView S={S} setS={up} selectCounty={selectCounty} setHL={setHL}
          toggleCitz={toggleCitz} toggleJls={toggleJls} toggleAge={toggleAge} />
        <Rail S={S} selectCounty={selectCounty} setHL={setHL} openPair={openPair} jumpFlow={jumpFlow} setJlsHl={setJlsHl} />
      </div>
      <Scrubber S={S} setYi={setYi} togglePlay={togglePlay} />
      <footer className="ft">
        <span>Izvori: DZS tab. 7.4.1.–7.4.3. (srpanj 2026.) · državljanstvo, dob, zemlje: DZS STAN-2026-2-1 · tokovi 2018.: DZS posebna obrada, županije i JLS (Pitoski i sur. 2021, CC BY) · ostale godine: IPF procjena na DZS marginama · granice: geoBoundaries/OSM.</span>
        <span>DZS naknadno revidira serije — pojedine se vrijednosti razlikuju od rada.</span>
      </footer>
      <Tooltip S={S} />
    </>
  );
}
