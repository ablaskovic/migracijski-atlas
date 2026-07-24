import { useEffect, useRef, useState } from 'react';
import { YEARS, IX2011, IX2018 } from './lib/metrics.ts';
import Header from './components/Header.tsx';
import MapView from './components/MapView.tsx';
import Rail from './components/Rail.tsx';
import Scrubber from './components/Scrubber.tsx';
import Tooltip from './components/Tooltip.tsx';
import { exportPNG, type ExportInfo } from './lib/exportPng.ts';
import type { Patch, State, View } from './lib/types.ts';

declare global {
  interface Window { __exportPNG?: (dl?: boolean) => Promise<ExportInfo | undefined> }
}

/* State shape and transition rules are a 1:1 port of the verified single-file v4.
   scripts/verify.cjs exercises them; keep it green. */
const INITIAL: State = {
  view: 'saldo', flow: 'tot', den: 'abs', cum: true, yi: YEARS.indexOf(2024),
  thr: 4500, playing: false, hl: null, sel: null, dir: 'out', flowSeen: false,
  citz: false, jls: false, jlsTab: 'inter',
};

export default function App() {
  const [S, setS] = useState(INITIAL);
  const ref = useRef(S); ref.current = S;
  const up = (patch: Patch) => setS(s => ({ ...s, ...patch }));

  /* ── control transitions (v4 semantics) ── */
  const setView = (v: View) => {
    const s = ref.current;
    const p: Patch = { view: v, playing: false };
    if (v === 'flow') {
      if (!s.sel) p.sel = 'HR-21';
      if (!s.flowSeen) { p.flowSeen = true; if (!s.cum) p.yi = IX2018; }
    } else if (s.view === 'flow') p.sel = null;
    if ((v === 'klas' || s.cum) && (p.yi ?? s.yi) < IX2011) p.yi = IX2011;
    up(p);
  };
  const setMode = (v: 'yr' | 'cum') => {
    const s = ref.current, cum = v === 'cum';
    up({ cum, ...(cum && s.yi < IX2011 ? { yi: IX2011 } : {}) });
  };
  const selectCounty = (iso: string) => {
    const s = ref.current;
    if (s.view === 'flow') up({ sel: iso });
    else up({ sel: s.sel === iso ? null : iso });
  };
  const setYi = (yi: number) => up({ yi });
  const toggleCitz = () => { const s = ref.current; up({ citz: !s.citz, ...(!s.citz && s.jls ? { jls: false } : {}) }); };
  const toggleJls = () => { const s = ref.current; up({ jls: !s.jls, ...(!s.jls && s.citz ? { citz: false } : {}) }); };

  /* ── play loop ── */
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
    if (s.playing) { up({ playing: false }); return; }
    const min = (s.cum || s.view === 'klas') ? IX2011 : 0;
    up({ playing: true, ...(s.yi >= YEARS.length - 1 ? { yi: min } : {}) });
  };

  /* ── global effects: body classes + keyboard ── */
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.body.classList.add('reduced');
    window.__exportPNG = dl => exportPNG(document.querySelector<SVGSVGElement>('#map')!, ref.current, dl);
    return () => { delete window.__exportPNG; };
  }, []);
  useEffect(() => { document.body.classList.toggle('panel-open', S.citz || S.jls); }, [S.citz, S.jls]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement).tagName === 'INPUT') return;
      const s = ref.current;
      if (ev.key === 'ArrowRight' && s.yi < YEARS.length - 1) up({ yi: s.yi + 1 });
      if (ev.key === 'ArrowLeft') { const min = (s.cum || s.view === 'klas') ? IX2011 : 0; if (s.yi > min) up({ yi: s.yi - 1 }); }
      if (ev.key === ' ') { ev.preventDefault(); togglePlay(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // handlers read ref.current — no stale closures
  const setHL = (iso: string | null) => { if (ref.current.hl !== iso) up({ hl: iso }); };

  return (
    <>
      <Header S={S} setS={up} setView={setView} setMode={setMode} />
      <div className="main">
        <MapView S={S} setS={up} selectCounty={selectCounty} setHL={setHL} toggleCitz={toggleCitz} toggleJls={toggleJls} />
        <Rail S={S} selectCounty={selectCounty} setHL={setHL} />
      </div>
      <Scrubber S={S} setYi={setYi} togglePlay={togglePlay} />
      <footer className="ft">
        <span>Izvori: DZS tab. 7.4.1.–7.4.3. (srpanj 2026.) · državljanstvo: DZS STAN-2026-2-1 · tokovi 2018.: DZS posebna obrada, županije i JLS (Pitoski i sur. 2021, CC BY) · ostale godine: IPF procjena na DZS marginama · granice: geoBoundaries/OSM.</span>
        <span>DZS naknadno revidira serije — pojedine se vrijednosti razlikuju od rada.</span>
      </footer>
      <Tooltip S={S} />
    </>
  );
}
