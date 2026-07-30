import { useEffect, useRef, useState } from 'react';
import { YEARS, IX2011, IX2018, VLAB } from './lib/metrics.ts';
import { decodeHash, encodeHash } from './lib/hash.ts';
import { BASE, focusSoon } from './lib/state.ts';
import { STORIES, storyHolds } from './lib/stories.ts';
import { useGeo } from './lib/geoAsync.ts';
import { NO_AFFIL, PAPER, paperPending, paperRefNote, paperRefTail } from './lib/credits.ts';
import { SOURCES } from './lib/licences.ts';
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
const INITIAL: State = { ...BASE, ...decodeHash(location.hash) };

export default function App() {
  const [S, setS] = useState(INITIAL);
  const ref = useRef(S); ref.current = S;
  /* Clearing the preset also keeps `st` out of the permalink, so a shared link
     can never carry a caption that contradicts its own state. The invalidation
     set is `storyKeys(i)` = STORY_KEYS plus whatever *that caption additionally
     claims*: Nalaz 4 asserts something about the Državljanstvo panel, so closing
     that panel must kill it, while a preset that says nothing about panels
     survives one being opened. It used to run over the preset's own *patch* keys
     instead, which enrolled every defensive `age: false` — measured, opening
     "Dob i spol" killed Nalaz 7 alone, for no reason its caption could explain. */
  const up = (patch: Patch) => setS(s => {
    const n: State = { ...s, ...patch };
    /* One predicate, not two. This used to walk `storyKeys(i)` against the patch
       directly, which invalidated on any STORY_KEYS field — while `storyHolds`,
       which both halves of the permalink codec use, skips the keys a preset
       never sets. Two rules for one question, and CLAUDE.md claimed they were
       one. `storyHolds` against the *resulting* state is the question actually
       being asked: does this caption still describe the screen? */
    if (n.story != null && patch.story === undefined && !storyHolds(n, n.story)) n.story = null;
    return n;
  });

  /* Year+mode are one shared pair across views, so a flow-ish view forcing 2018
     used to silently discard whatever cumulative window the user had built in
     Saldo. Remember the pair per view and put it back on return; the documented
     first-entry jump still wins the first time. Ephemeral — never in the hash. */
  const vmem = useRef<Partial<Record<View, { yi: number; cum: boolean }>>>({});

  /* ── control transitions (v4 semantics + mx/jmap) ── */
  const setView = (v: View) => {
    const s = ref.current;
    vmem.current[s.view] = { yi: s.yi, cum: s.cum };
    /* Every highlight is scoped to the view that produced it. Carried across, a
       county `hl` set in Saldo left its tooltip — county saldo, doseljeni iz
       inoz., the lot — sitting on top of the 556-municipality JLS map, because
       the tip's visibility test was view-agnostic. Reached by keyboard alone: a
       focused county never gets the pointerleave that would have cleared it. */
    const p: Patch = { view: v, playing: false, hl: null, pairHl: null, yrHl: null, jlsHl: null, regHl: null };
    const mem = vmem.current[v];
    if (v === 'flow' || v === 'mx') {
      if (v === 'flow' && !s.sel) p.sel = 'HR-21';
      if (!s.flowSeen) { p.flowSeen = true; p.cum = false; p.yi = IX2018; }
      else if (mem) { p.yi = mem.yi; p.cum = mem.cum; }
    } else if (v !== 'jmap' && mem) { p.yi = mem.yi; p.cum = mem.cum; }
    /* the JLS corridor chip only exists in Tokovi; leaving it set outside is a
       flag with no panel behind it that still sets body.panel-open (hiding the
       legend outright below 900 px) and still eats an Escape press */
    if (s.view === 'flow' && v !== 'flow') p.jls = false;
    /* A corridor is `sel` + `pair`, and it means the same thing in Tokovi and in
       Matrica — hub/partner there, row/column here — so switching between those
       two carries it and lands on the same pair. No other view can describe it:
       drop both halves rather than leave a card-less flag that still eats an
       Escape press and still ships in the hash. */
    const corr = (w: View) => w === 'flow' || w === 'mx';
    if (corr(s.view) && !corr(v)) { p.sel = null; p.pair = null; }
    /* `sel` alone is a hub in Tokovi and a detail-card selection in Saldo /
       Klasifikacija / Regije. Matrica and the JLS map have neither: a county
       picked in Saldo used to keep its 1998–2025 card painted over the 21×21
       grid and the 556-municipality map, and its × then aimed `focusSoon` at a
       `.cnt` that does not exist there, dropping focus to <body>. In Matrica it
       survives only as one half of a corridor, which the grid can point at. */
    /* Godine has no county card and no corridor either — its rows already are
       the per-county series a card would draw, and a floating card over a grid
       covers live cells (the argument PairCard settled for Matrica). */
    if (v === 'jmap' || v === 'yrs') { p.sel = null; p.pair = null; }
    if (v === 'mx' && !(s.sel && s.pair)) { p.sel = null; p.pair = null; }
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
    /* Re-hubbing closes the corridor card. Keeping it open silently re-pointed
       it at a pair the user never chose — GZ ⇄ Zagrebačka became
       Splitsko-dalmatinska ⇄ Zagrebačka on one click of the map, under a card
       whose numbers had all changed. Partner-preservation is defensible when
       the partner is what you picked; here the *hub* is, so the pair is stale
       by construction. (Carried open as finding 27 through two passes.) */
    if (s.view === 'flow') up({ sel: iso, ...(s.sel !== iso ? { pair: null } : {}) });
    else up({ sel: s.sel === iso ? null : iso });
  };
  const openPair = (iso: string) => {
    const s = ref.current;
    if (s.view === 'flow') up({ pair: s.pair === iso ? null : iso });
  };
  /* A corridor opens where it was picked. Both the matrix cells and the matrix
     rail used to jump into Tokovi, which answered a corridor question with a
     county one: clicking Istarska→Zadarska (31 people) left the grid, drew 20
     arcs from Istarska and listed all 20 partners summing 996 — the county's
     whole outflow — with the corridor itself demoted to a card in the corner.
     Toggling, so the control that opened it also closes it. */
  const openCorridor = (a: string, b: string) => {
    const s = ref.current;
    const open = s.sel === a && s.pair === b;
    up(open ? { sel: null, pair: null } : { sel: a, pair: b, playing: false });
  };
  const setYi = (yi: number) => up({ yi });
  const applyStory = (i: number) => up({ ...STORIES[i].patch, story: i, playing: false });

  /* chip panels are mutually exclusive */
  const toggleCitz = () => { const s = ref.current; up({ citz: !s.citz, jls: false, age: false }); };
  const toggleJls = () => { const s = ref.current; up({ jls: !s.jls, citz: false, age: false }); };
  const toggleAge = () => { const s = ref.current; up({ age: !s.age, citz: false, jls: false }); };
  /* role=dialog owes focus movement. Opening used to leave focus on the ? button
     with ~40 lines of new content unannounced and its own × three tab stops
     away; closing already returned focus, so only the open half was missing. */
  const toggleHelp = () => {
    const s = ref.current;
    up({ help: !s.help });
    focusSoon(s.help ? '#helpBtn' : '#helpCard');
  };
  /* Back to the boot view, including the per-view year memory and the map
     transform. The zoom lives in useZoom, outside S, and only re-fitted on a
     *view* change — so "vrati na početni prikaz" used to leave the map sitting
     at 2.8×. Bumping a counter is the whole handshake MapView needs. */
  const [resetSeq, setResetSeq] = useState(0);
  const resetAll = () => { vmem.current = {}; setResetSeq(n => n + 1); setS({ ...BASE }); };

  /* The two big geometry payloads load on demand (see geoAsync.ts). App is the
     root, so re-rendering here is what hands the data to Rail, Legend and Tooltip
     as well as MapView. */
  useGeo(S.view);

  /* reduced motion is a live preference, not a boot-time constant */
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { setReduced(mq.matches); document.body.classList.toggle('reduced', mq.matches); };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /* ── play loop (inert in jmap: single measured year) ── */
  useEffect(() => {
    if (!S.playing) return;
    /* autoplay is the largest motion in the app — halve the pace rather than
       remove the feature, since the user asked for it explicitly */
    const t = setInterval(() => {
      setS(s => {
        if (!s.playing) return s;
        const next = s.yi + 1;
        if (next >= YEARS.length) return { ...s, yi: YEARS.length - 1, playing: false, story: null };
        return { ...s, yi: next, story: null };
      });
    }, reduced ? 1400 : 650);
    return () => clearInterval(t);
  }, [S.playing, reduced]);
  const togglePlay = () => {
    const s = ref.current;
    if (s.view === 'jmap') return;
    if (s.playing) { up({ playing: false }); return; }
    const min = (s.cum || s.view === 'klas') ? IX2011 : 0;
    up({ playing: true, ...(s.yi >= YEARS.length - 1 ? { yi: min } : {}) });
  };

  /* ── global effects: hash sync + body classes + keyboard ── */
  /* A view change is the one transition worth a history entry: it makes the
     browser Back button an undo for "how did I get to this screen", instead of
     leaving the site outright. Everything finer stays a replace so the history
     does not fill up with year steps. */
  const lastView = useRef(S.view);
  useEffect(() => {
    const h = '#' + encodeHash(S);
    if (location.hash === h) return;
    if (S.view !== lastView.current) { lastView.current = S.view; history.pushState(null, '', h); }
    else history.replaceState(null, '', h);
  }, [S]);
  useEffect(() => {
    const onPop = () => {
      lastView.current = decodeHash(location.hash).view ?? BASE.view;
      /* `help` and `flowSeen` are deliberately not in the permalink, so folding
         BASE back in would close the glossary and re-arm the first-entry 2018
         jump as a side effect of pressing Back. Carry them across instead. */
      setS(s => ({ ...s, ...BASE, help: s.help, flowSeen: s.flowSeen, ...decodeHash(location.hash) }));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    window.__exportPNG = dl => exportPNG(document.querySelector<SVGSVGElement>('#map')!, ref.current, dl);
    window.__exportSVG = dl => exportSVG(document.querySelector<SVGSVGElement>('#map')!, ref.current, dl);
    return () => { delete window.__exportPNG; delete window.__exportSVG; };
  }, []);
  useEffect(() => { document.body.classList.toggle('panel-open', S.citz || S.jls || S.age || S.help); }, [S.citz, S.jls, S.age, S.help]);
  /* Touch fires pointerenter but never pointerleave, so a tapped feature would
     leave its tooltip on screen forever. Clear the highlight on any pointerdown
     that is not itself a map feature — the tip is the only value readout in the
     matrix/JLS views, so it must stay tappable rather than be disabled outright. */
  useEffect(() => {
    const onDown = (ev: PointerEvent) => {
      const t = ev.target as Element | null;
      if (t && t.closest && t.closest('.cnt,.mxc,.jl,.mxhit,.yrc,.yrhit')) return;
      const s = ref.current;
      if (s.hl || s.pairHl || s.yrHl || s.jlsHl != null) up({ hl: null, pairHl: null, yrHl: null, jlsHl: null });
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement;
      const tag = el.tagName;
      const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable;
      const s = ref.current;
      /* Escape dismisses the topmost thing, one layer per press, and hands focus
         back to whatever opened it. It used to reach only the glossary and the
         corridor card, leaving the three chip panels and the detail card as the
         only surfaces on the page you could open with a key but not close.
         It runs *before* the typing guard: the threshold slider and the Nalazi
         select are the two controls you can be standing in while a panel is
         open, and "Escape reaches every dismissible surface" has to mean from
         there too. */
      if (ev.key === 'Escape') {
        if (s.help) { up({ help: false }); focusSoon('#helpBtn'); return; }
        if (s.pair) {
          /* in Matrica the corridor *is* the selection, so both halves go; focus
             returns to the cell that opened it, the rail row otherwise */
          up(s.view === 'mx' ? { sel: null, pair: null } : { pair: null });
          focusSoon(s.view === 'mx'
            ? '.mxc[data-a="' + s.sel + '"][data-b="' + s.pair + '"], #railList .rrow[data-iso="' + s.pair + '"]'
            : '#railList .rrow[data-iso="' + s.pair + '"]');
          return;
        }
        if (s.citz || s.jls || s.age) {
          up({ citz: false, jls: false, age: false });
          focusSoon(s.citz ? '#citzHd' : s.jls ? '#jcardHd' : '#ageHd');
          return;
        }
        /* in Tokovi `sel` is the hub, not a dismissible selection */
        if (s.sel && s.view !== 'flow') {
          up({ sel: null });
          focusSoon('.cnt[data-iso="' + s.sel + '"], #railList .rrow[data-iso="' + s.sel + '"]');
          return;
        }
        /* Last layer: the tooltip. 1.4.13 wants hover/focus content dismissible
           without moving the pointer or focus, and this one is
           pointer-events:none and cursor-following so it can never be hovered
           either. In Matrica and the JLS map it is the only *visible* readout —
           up to 260 px wide, 14 px from the cursor, sitting on the neighbours a
           magnifier user is trying to compare. Clearing the highlight hides it
           and leaves focus exactly where it was. Runs after every real surface
           so Escape still closes panels first. */
        if (s.hl || s.pairHl || s.yrHl || s.jlsHl != null) up({ hl: null, pairHl: null, yrHl: null, jlsHl: null });
        return;
      }
      if (typing) return;
      /* Everything below is a bare-key shortcut, so a chord must not trigger it.
         Alt+← / Alt+→ (Cmd+←/→ on macOS) are the browser's Back and Forward —
         and this app deliberately makes Back an undo — so stepping the year on
         them mutated the very history entry the user was leaving, via the
         replaceState in the hash-sync effect. useZoom guards the same window
         correctly; the two handlers now agree. */
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (s.view === 'jmap') return;
      const min = (s.cum || s.view === 'klas') ? IX2011 : 0;
      /* The scrubber declares role=slider, so it owes the pattern's whole key
         set — arrows alone meant 27 presses to cross 28 years. Scoped to the
         slider itself: Home/End belong to the document everywhere else. */
      if (el.id === 'spark') {
        const jump = (yi: number) => { ev.preventDefault(); if (yi !== s.yi) up({ yi }); };
        if (ev.key === 'Home') { jump(min); return; }
        if (ev.key === 'End') { jump(YEARS.length - 1); return; }
        if (ev.key === 'PageUp') { jump(Math.min(YEARS.length - 1, s.yi + 5)); return; }
        if (ev.key === 'PageDown') { jump(Math.max(min, s.yi - 5)); return; }
      }
      /* Shift+arrows pan the map (useZoom) — bare arrows step the year */
      if (!ev.shiftKey && ev.key === 'ArrowRight' && s.yi < YEARS.length - 1) up({ yi: s.yi + 1 });
      if (!ev.shiftKey && ev.key === 'ArrowLeft') { if (s.yi > min) up({ yi: s.yi - 1 }); }
      /* Space is also the native activation key for whatever holds focus, and
         preventDefault here used to swallow it — tabbing to a segment and
         pressing Space toggled playback instead of picking the segment. */
      if (ev.key === ' ') {
        /* …and a rail row is a control too, even the inert ones. Regije and JLS
           rows carry no role because activating them does nothing — which sent
           Space straight through to here, so tabbing onto "Zagrebačka regija"
           and pressing Space started playback. Doing nothing is the right answer
           for a row with nothing to activate; starting the film is not.
           The county paths now carry role=button and handle Space themselves,
           so they exit here rather than starting the film from the map. */
        if (tag === 'BUTTON' || tag === 'A' || el.getAttribute('role') === 'button'
          || el.getAttribute('role') === 'gridcell' || el.getAttribute('role') === 'img'
          || el.closest?.('.rrow')) return;
        /* Below 900 px the body scrolls (index.css) and Space / Shift+Space are
           the primary keyboard scroll keys — a 1440 px window at 200 % zoom is
           in that band too. Claim Space only when there is nothing to scroll,
           which is the ≥900 px layout the shortcut was designed for. */
        if (ev.shiftKey) return;
        if (document.documentElement.scrollHeight > window.innerHeight + 1) return;
        ev.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // handlers read ref.current — no stale closures
  const setHL = (iso: string | null) => { if (ref.current.hl !== iso) up({ hl: iso }); };
  const setJlsHl = (j: number | null) => { if (ref.current.jlsHl !== j) up({ jlsHl: j }); };

  /* Screen-reader status. Every value on screen is keyed to year + view, and
     both change without any focus moving (scrub, arrows, autoplay), so without
     this the whole app mutates silently. Held constant while the loop runs so
     it announces once at start and once at the end, not 28 times. */
  const live = S.playing ? 'Reprodukcija kroz godine u tijeku.'
    : `${YEARS[S.yi]}. · ${VLAB[S.view]} · ${S.cum || S.view === 'klas' ? 'kumulativno' : 'godišnje'}`;

  return (
    <>
      {/* ~28 header controls sit between the page top and the map; landmarks
          serve AT but a sighted keyboard-only user had no bypass at all (2.4.1) */}
      <a className="skip" href="#map">Prijeđi na kartu</a>
      <Header S={S} setS={up} setView={setView} setMode={setMode} applyStory={applyStory} resetAll={resetAll} />
      <main className="main">
        <MapView S={S} setS={up} selectCounty={selectCounty} setHL={setHL} resetSeq={resetSeq}
          toggleCitz={toggleCitz} toggleJls={toggleJls} toggleAge={toggleAge} toggleHelp={toggleHelp} />
        <Rail S={S} setS={up} selectCounty={selectCounty} setHL={setHL} openPair={openPair} openCorridor={openCorridor} setJlsHl={setJlsHl} />
      </main>
      <Scrubber S={S} setYi={setYi} togglePlay={togglePlay} />
      <div className="sr-only" id="srLive" role="status" aria-live="polite" aria-atomic="true">{live}</div>
      <footer className="ft">
        {/* ODbL §4.3 wants the licence named, not just the source — the legend
            did it, the footer, the export and the README did not. The names are
            links now: CC BY §3(a) asks for a hyperlink to the material where
            practicable, and OSM's attribution guidance asks for one to its
            copyright page. Threaded into the existing sentence rather than added
            to it, so the lane costs the map exactly what it did before — the
            legend keeps the plain-text wording because `.legend` is
            `pointer-events:none` and a link in it could never be clicked. */}
        <span>Izvori: <a className="paper-link" href={SOURCES[0].href} target="_blank" rel="noopener noreferrer"
            aria-label={`DZS — ${SOURCES[0].note}. Otvara se u novoj kartici.`}>DZS</a>{' '}
          tab. 7.4.1.–7.4.3. (srpanj 2026.) · državljanstvo, dob, zemlje: DZS STAN-2026-2-1 · tokovi 2018.: DZS posebna obrada, županije i JLS (
          <a className="paper-link" href={SOURCES[1].href} target="_blank" rel="noopener noreferrer"
            aria-label={`Pitoski i sur. 2021 — ${SOURCES[1].note}. Otvara se u novoj kartici.`}>Pitoski i sur. 2021</a>, CC BY) ·
          ostale godine: IPF procjena na DZS marginama · granice županija:{' '}
          <a className="paper-link" href={SOURCES[3].href} target="_blank" rel="noopener noreferrer"
            aria-label={`geoBoundaries — ${SOURCES[3].note}. Otvara se u novoj kartici.`}>geoBoundaries</a>/OSM, granice JLS:{' '}
          <a className="paper-link" href={SOURCES[2].href} target="_blank" rel="noopener noreferrer"
            aria-label={`OpenStreetMap — ${SOURCES[2].note}. Otvara se u novoj kartici.`}>OpenStreetMap</a> suradnici — oboje ODbL.</span>
        {/* The study the atlas is a companion to is unpublished: the reference is
            pending, not missing, and the atlas is not affiliated with it. Both
            sentences come from lib/credits.ts, which is also what the header,
            the glossary and the export read — one edit publishes all of them.
            Always visible, because a disclaimer behind a panel is a disclaimer
            most readers never meet. */}
        <span>{paperRefNote()}{' '}
          {!paperPending() && (
            <><a className="paper-link" href={PAPER.url} target="_blank" rel="noopener noreferrer"
              aria-label={`${PAPER.short} — ${PAPER.citation} Otvara se u novoj kartici.`}>{PAPER.short}</a>{paperRefTail()} </>
          )}
          {NO_AFFIL} DZS naknadno revidira serije, pa se pojedine vrijednosti razlikuju od onih u radu.</span>
      </footer>
      <Tooltip S={S} />
    </>
  );
}
