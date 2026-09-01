import { useEffect, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { YEARS, Y0, YEND, IX2011, IX2018, VLAB } from './lib/metrics.ts';
import { encodeHash, readHash } from './lib/hash.ts';
import { BASE, focusSoon } from './lib/state.ts';
import { L, NEWTAB, setLang, storedLang, storeLang, t, yr, yrSpan } from './lib/i18n.ts';
import { STORIES, storyHolds } from './lib/stories.ts';
import { useGeo } from './lib/geoAsync.ts';
import { NO_AFFIL, PAPER, paperPending, paperRefNote, paperRefTail } from './lib/credits.ts';
import { ATLAS_AUTHOR, CODE_LICENCE, CODE_YEAR, REPO, sources } from './lib/licences.ts';
import { dropHash, privacyShort } from './lib/privacy.ts';
import Header from './components/Header.tsx';
import MapView from './components/MapView.tsx';
import Rail from './components/Rail.tsx';
import Scrubber from './components/Scrubber.tsx';
import Tooltip from './components/Tooltip.tsx';
import { exportPNG, exportSVG, type ExportInfo } from './lib/exportPng.ts';
import { ensureFonts } from './lib/exportFonts.ts';
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
/* The site's own address, read from the one file that already declares it
   rather than copied into a fourth place — index.html, public/sitemap.xml and
   public/robots.txt are the other three. Captured at module scope because the
   language effect below rewrites the very attribute it is read from. */
const SITE = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '/';

/* `location.search` is passed here and nowhere else: `?l=en` exists so the
   English UI has an address a crawler can resolve, which is a fact about how
   this document was *opened*. The popstate handler below stays hash-only — the
   query survives every pushState, so reading it there would re-impose the
   arriving language over a choice the reader has made since. */
const INITIAL: State = { ...BASE, ...readHash(location.hash, location.search) };
/* Before the first render, not in an effect: every string and every number in
   the tree below is formatted against this, so it has to be true by the time
   anything reads it. An effect runs *after* the first paint, which would render
   one frame of Croatian to an English reader — and, worse, one frame of
   `41.986` meaning forty-one thousand to someone reading it as forty-one. */
setLang(INITIAL.lang);

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
    /* Synchronously with the state that caused it, for the reason above: the
       render that follows must already be in the new language. `up` is the only
       writer, so this is the only place it can be done once. */
    if (patch.lang && patch.lang !== s.lang) { setLang(patch.lang); storeLang(patch.lang); }
    /* One predicate, not two. This used to walk `storyKeys(i)` against the patch
       directly, which invalidated on any STORY_KEYS field — while `storyHolds`,
       which both halves of the permalink codec use, skips the keys a preset
       never sets. Two rules for one question, and the project docs claimed they
       were one. `storyHolds` against the *resulting* state is the question
       actually being asked: does this caption still describe the screen? */
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
    /* The JLS map imposes 2018/godišnje on entry and *locks* the Vrijeme
       control, so the pair it leaves behind in the shared state is the one pair
       on the page the reader provably did not choose. The per-view memory only
       restores a destination that has been visited before, so leaving jmap for a
       fresh view carried the imposition into it: from the app's own Nalaz 7
       permalink `#v=jmap&c=0&y=2018&st=7`, pressing Klasifikacija rendered the
       2011.–2018. window — 3 / 9 / 9 against the 7 / 5 / 9 the same view shows
       when reached any other way, twelve of twenty-one counties in a different
       class — and pressing Saldo rendered annual 2018 on a ±7.490 domain instead
       of the cumulative ±44.383. Fall back to the boot pair, which is the last
       one the reader actually saw offered. */
    const carried = s.view === 'jmap' ? { yi: BASE.yi, cum: BASE.cum } : null;
    const restore = mem ?? carried;
    if (v === 'flow' || v === 'mx') {
      if (v === 'flow' && !s.sel) p.sel = 'HR-21';
      if (!s.flowSeen) { p.flowSeen = true; p.cum = false; p.yi = IX2018; }
      else if (restore) { p.yi = restore.yi; p.cum = restore.cum; }
    } else if (v !== 'jmap' && restore) { p.yi = restore.yi; p.cum = restore.cum; }
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
    /* Only when `sel` was HALF A CORRIDOR. It is also the hub in Tokovi and the
       detail-card selection everywhere else, so dropping it unconditionally on
       the way out threw away a plain county selection that the destination can
       render perfectly well: pick a county in Saldo, look at Tokovi, come back,
       and the card was gone though nothing about it had become unrenderable. The
       `pair` half goes either way — no other view can describe it. */
    if (corr(s.view) && !corr(v)) { if (s.pair) p.sel = null; p.pair = null; }
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
  /* The Nalazi picker is the third route into a view, and it used to run none of
     the entry clamps the other two implement — `setView` for a segment press,
     `decodeHash` for a link. Measured, four consequences shipped through it:
     a JLS chip flag that survives into Klasifikacija (body.panel-open with no
     panel, and the next Escape consumed clearing it); half a corridor carried
     into Regije, a state both other routes document as impossible and which
     encodeHash then laundered into every shared link; the per-view year memory
     never written, so returning to Saldo lost the window the reader had built;
     and `flowSeen` left false by the Matrica preset, so a later press of Tokovi
     re-fired the first-entry jump and discarded the reader's own year.
     Composing the same transition instead of re-implementing it: `setView` runs
     the clamp table, the preset's own patch lands on top of it. */
  const applyStory = (i: number) => {
    const p = STORIES[i].patch;
    if (p.view) setView(p.view);
    up({ ...p, story: i, playing: false });
  };

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
  /* Through `up`, the only writer, and keeping the language.
     `setS({ ...BASE })` did neither. BASE.lang is resolved once at module init,
     so a reader who had pressed EN got S.lang back to 'hr' while the module
     mirror — which only `up` moves — stayed 'en': the page went on rendering
     English under a state that said Croatian, #segLang reported HR pressed, and
     pressing HR was a no-op because up()'s guard saw patch.lang === s.lang. The
     permalink dropped `l=` too, so a link copied from a visibly English page
     opened in Croatian for its recipient.
     Reset does not revert the language at all now. "An explicit act beats an
     inference" is the rule the whole language stack is built on, this button
     says "back to the opening view", and a reload after a reset boots the
     stored choice anyway — so reverting it was both surprising and untrue. */
  const resetAll = () => {
    vmem.current = {};
    setResetSeq(n => n + 1);
    up({ ...BASE, lang: ref.current.lang });
  };

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

  /* Whether the tab is being looked at. The play loop is the one thing in the app
     that advances state on a timer, and it had no such guard: measured with
     Chrome's own background throttling left on, hiding the tab at 1998 with
     playback running and coming back 40 s later found the year at 2025 and #play
     already released — the loop had run to the end, set playing:false and
     terminated, so the reader saw none of the animation they started and #srLive
     read "2025. · saldo · godišnje". Throttled the pace is wrong too (one step a
     second against the intended 650 ms), and every step runs the hash-sync
     effect down the replaceState branch, so a reader who arrived on a shared
     `y=2005` link has that very history entry rewritten to y=2025 in place —
     with no earlier entry to go Back to. */
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  /* the playback period, in a ref so the interval can read the current value
     without the effect depending on it — see the note in the effect below */
  const paceRef = useRef(650);
  paceRef.current = reduced ? 1400 : 650;

  /* ── play loop (inert in jmap: single measured year) ── */
  useEffect(() => {
    /* torn down while hidden and re-created on return, so the year the reader
       left on is the year they come back to, at the pace the app chose */
    if (!S.playing || !visible) return;
    /* autoplay is the largest motion in the app — halve the pace rather than
       remove the feature, since the user asked for it explicitly */
    const t = setInterval(() => {
      setS(s => {
        if (!s.playing) return s;
        const next = s.yi + 1;
        if (next >= YEARS.length) return { ...s, yi: YEARS.length - 1, playing: false, story: null };
        return { ...s, yi: next, story: null };
      });
    }, paceRef.current);
    return () => clearInterval(t);
    /* `reduced` is NOT a dependency: it is read through a ref instead. As a
       dependency it tore down and re-created the interval whenever the OS
       preference changed, which restarts the countdown — so a reader who flipped
       reduced-motion mid-playback got one year held for up to a full extra
       period. The pace still follows the preference; the effect's identity no
       longer does. `visible` stays a dependency, because there the teardown IS
       the behaviour. */
  }, [S.playing, visible]);
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
  /* …and so is a reset. It is a destructive control sitting beside the Nalazi
     picker, and it only *changed the view* some of the time: from Klasifikacija
     the entry was pushed and Back undid it, while the identical misclick from
     Saldo replaced the entry and Back could not — inconsistent undo semantics in
     an app that ships Back-as-undo as a feature. */
  const lastReset = useRef(0);
  /* …and so is picking a Nalaz. A preset is a jump to a curated screen, exactly
     the "how did I get here" transition the note above describes — and it often
     lands in the SAME view, so keying the history entry on `S.view` alone meant
     Back could not undo it. Measured on the ordinary path: from Saldo, pick
     Nalaz 2 (also Saldo) and Back left the site rather than restoring the year
     and the mode the reader had built. */
  const lastStory = useRef<number | null>(INITIAL.story);
  /* The replace branch is the high-frequency one, and it had no cap at all.
     Measured on the shipped dist: 77 replaceState calls in 5 s of mouse
     scrubbing, 81 in 5 s of touch scrubbing on a 390 px phone, 76 in 4 s of held
     arrow keys — 15–16 a second. WebKit's budget is 100 history writes per
     rolling 30 s (3,3/s) and it THROWS SecurityError past it; the throw lands
     inside this effect, React routes it to the root ErrorBoundary, and after
     roughly 7–30 s of the app's central interaction the whole working atlas is
     replaced by the render-failure card, taking the zoom and the per-view year
     memory with it. Chrome and Firefox drop the excess silently, which is the
     quieter version of the same bug: the address bar stops tracking the view,
     so the reader scrubs to 2015, copies the link, and hands the recipient
     whichever year the throttle froze it at — from the app whose whole premise
     is that the URL is the state.
     Only the fields a pointer or a held key can move at display rate are
     throttled, and then on the leading edge: one write per 320 ms, the first
     after a quiet moment landing at once. That is `y` (a scrubber drag, arrow
     repeat, playback) and the two threshold sliders `t` and `tp` — everything
     else in the permalink is a discrete press, and a press is not a burst. This
     app's premise is that the address bar IS the state, so a lone toggle has to
     be in the URL by the time a reader can reach for it; throttling every write
     would have bought the rate cap at the price of the property it protects.
     320 ms holds a continuous drag at 3,1 writes a second against the 3,3
     budget — measured: 14 writes in 4 s of scrubbing, minimum gap 321 ms, a
     worst 30 s of 94 against the cap of 100. Playback, at 650 ms a step, never
     reaches the timer at all. A view change is a deliberate act and pushes at
     once, after flushing whatever the timer held, or the two would land out of
     order. Every call is wrapped: an engine that throws anyway leaves a stale
     URL that the next write repairs, rather than a blank page. */
  const HIST_MS = 320;
  /* the same URL with the continuous fields taken out — equal means this change
     moved nothing but a slider */
  const histShape = (x: string) => x.replace(/(^|[#&])(y|t|tp)=[^&]*/g, '$1');
  const histQ = useRef<string | null>(null);
  const histT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const histAt = useRef(0);
  useEffect(() => () => {
    if (histT.current !== null) clearTimeout(histT.current);
    const p = histQ.current;
    histQ.current = null;
    if (p !== null) { try { history.replaceState(null, '', p); } catch { /* rate cap */ } }
  }, []);
  useEffect(() => {
    const h = '#' + encodeHash(S);
    /* …and the query, which a fragment-only write cannot reach. `'#' + …` is
       resolved against the current URL, so `?l=en` outlived every pushState:
       after the reader pressed HR the page was Croatian while the address still
       said English, which is both the link they would copy off that page and
       the state the next reload booted from. Retired the moment it contradicts
       the language on screen — and kept while it agrees, because it is the
       crawlable address of the English half, the one the sitemap, the hreflang
       set and the per-locale canonical all name. */
    const q = new URLSearchParams(location.search);
    if (q.get('l') && q.get('l') !== S.lang) q.delete('l');
    const qs = q.toString();
    const search = qs ? '?' + qs : '';
    const u = location.pathname + search + h;
    /* the timer holds a URL that is now stale — a burst that comes back to where
       it started must not have its own intermediate land after it */
    const cancel = () => {
      if (histT.current !== null) { clearTimeout(histT.current); histT.current = null; }
      histQ.current = null;
    };
    if (location.hash === h && search === location.search) { cancel(); lastReset.current = resetSeq; lastStory.current = S.story; return; }
    const wasReset = resetSeq !== lastReset.current;
    const wasStory = S.story != null && S.story !== lastStory.current;
    lastReset.current = resetSeq;
    lastStory.current = S.story;
    const write = (fn: 'pushState' | 'replaceState', to: string) => {
      histAt.current = Date.now();
      try { history[fn](null, '', to); } catch { /* engine rate cap — the next write repairs it */ }
    };
    if (S.view !== lastView.current || wasReset || wasStory) {
      lastView.current = S.view;
      const p = histQ.current;
      cancel();
      if (p !== null) write('replaceState', p);
      write('pushState', u);
      return;
    }
    const cur = histQ.current ?? (location.pathname + location.search + location.hash);
    const wait = HIST_MS - (Date.now() - histAt.current);
    if (histShape(cur) !== histShape(u) || wait <= 0) { cancel(); write('replaceState', u); return; }
    histQ.current = u;
    if (histT.current === null) {
      histT.current = setTimeout(() => {
        histT.current = null;
        const p = histQ.current;
        histQ.current = null;
        if (p !== null) write('replaceState', p);
      }, wait);
    }
  }, [S, resetSeq]);
  useEffect(() => {
    const onPop = () => {
      lastView.current = readHash(location.hash).view ?? BASE.view;
      /* `help` and `flowSeen` are deliberately not in the permalink, so folding
         BASE back in would close the glossary and re-arm the first-entry 2018
         jump as a side effect of pressing Back. Carry them across instead. */
      /* the outgoing view's year window, for the same reason every other
         transition records it — Back is a view change like any other */
      vmem.current[ref.current.view] = { yi: ref.current.yi, cum: ref.current.cum };
      const patch = readHash(location.hash);
      const back: State = { ...ref.current, ...BASE, help: ref.current.help, flowSeen: ref.current.flowSeen, ...patch };
      /* BASE.lang was resolved once, at module init. A choice stored *since* then
         outranks it — the same precedence BASE itself applies at boot — or Back
         to an entry written before the toggle reverted the language while
         localStorage still said otherwise, and reloading that very URL booted the
         other one. One URL, two languages, depending on how you arrived. */
      if (!patch.lang) back.lang = storedLang() ?? BASE.lang;
      /* Back can cross a language change like any other control, and the module
         mirror has to move with it — otherwise the tree re-renders in the old
         language against the new state. Not stored: stepping through history is
         not choosing. */
      setLang(back.lang);
      setS(back);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    window.__exportPNG = dl => exportPNG(document.querySelector<SVGSVGElement>('#map')!, ref.current, dl);
    window.__exportSVG = dl => exportSVG(document.querySelector<SVGSVGElement>('#map')!, ref.current, dl);
    /* Warm the export's font payload here rather than at the click: the SVG
       exporter is synchronous by contract, so the faces have to be in hand
       before anyone presses Izvoz. One same-origin request against an immutable
       cache, off the first-paint path. */
    ensureFonts().catch(() => { /* the figure names the families instead */ });
    return () => { delete window.__exportPNG; delete window.__exportSVG; };
  }, []);
  useEffect(() => { document.body.classList.toggle('panel-open', S.citz || S.jls || S.age || S.help); }, [S.citz, S.jls, S.age, S.help]);
  /* The tab title is the one piece of copy index.html has to guess at: it is
     static markup, parsed before any of this has run, so it ships Croatian and
     is corrected here once the language is known. An effect is late enough,
     unlike setLang: a tab title has no layout to shift and no figure in it that
     a frame of the wrong locale would misstate by three orders of magnitude —
     which is the whole reason setLang runs before the first render.
     Keyed on S.lang, so it follows the toggle and a popstate across a language
     change as well as the boot. Composed here rather than in i18n.ts because
     metrics.ts imports i18n.ts, and reaching back for Y0/YEND would close the
     cycle; `yrSpan` is what keeps the Croatian trailing dots off the English. */
  useEffect(() => {
    document.title = `${t('hd.title')} · ${yrSpan(Y0, YEND)}`;
    /* …and the description with it. index.html ships the Croatian one because it
       is static markup, and nothing ever moved it: an English reader sharing a
       link handed the recipient a preview card written in Croatian, and a crawler
       that renders the page indexed the same. Same effect, same key on S.lang. */
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.desc'));
    /* …and the canonical, which is now per-locale. index.html ships the Croatian
       one, and `?l=en` is a second indexable URL rather than a duplicate of it:
       a canonical pinned to the bare origin on both would tell a crawler the
       English page is the Croatian one and drop it from the index, which is the
       state this whole address exists to leave. The hreflang pair in the head is
       static and lists both either way, as a reciprocal set must.
       Written from the ADDRESS, not from the reader. It used to read `S.lang`,
       which on a URL that says nothing about language is a *detected* default:
       a rendering crawler reports navigator.languages ['en-US'] and a US
       timezone, so on the bare `/` — the hreflang `hr` target and the x-default
       both — it emitted `canonical …/?l=en` and told the crawler the Croatian
       half of the atlas is a duplicate of the English page, which is the exact
       de-indexing the per-locale scheme exists to prevent. One URL, two
       canonicals, decided by who asked: the same address served the bare one to
       a Croatian-configured reader. og:locale goes with it — it names which page
       this IS, not what the reader is looking at, and the static hreflang set
       beside it names the pair by address too. The title and the description
       stay on S.lang: those are the copy on screen, and they are what a reader
       shares.
       S.lang still has to agree, because the sync effect above retires a
       contradicted `?l=en` from the address and nothing re-runs this one when it
       lands — without that term a reader who pressed HR on `/?l=en` would keep
       an English canonical over a Croatian page for the rest of the session. */
    const urlEn = new URLSearchParams(location.search).get('l') === 'en' && S.lang === 'en';
    document.querySelector('link[rel="canonical"]')
      ?.setAttribute('href', SITE + (urlEn ? '?l=en' : ''));
    document.querySelector('meta[property="og:locale"]')
      ?.setAttribute('content', urlEn ? 'en_GB' : 'hr_HR');
    document.querySelector('meta[property="og:locale:alternate"]')
      ?.setAttribute('content', urlEn ? 'hr_HR' : 'en_GB');
  }, [S.lang]);
  /* Touch fires pointerenter but never pointerleave, so a tapped feature would
     leave its tooltip on screen forever. Clear the highlight on any pointerdown
     that is not itself a map feature — the tip is the only value readout in the
     matrix/JLS views, so it must stay tappable rather than be disabled outright. */
  useEffect(() => {
    const onDown = (ev: PointerEvent) => {
      const t = ev.target as Element | null;
      /* `.rrow` belongs on this list: a rail row owns a highlight exactly the way
         a map feature does — it sets `hl` on pointerenter — so pressing one fired
         this capture-phase handler first and cleared the very highlight the press
         was about, taking the tooltip and the legend's tick with it. */
      if (t && t.closest && t.closest('.cnt,.mxc,.jl,.mxhit,.yrc,.yrhit,.rrow')) return;
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
        /* the Nalazi banner was the one dismissible surface missing from this
           cascade — it has a × like every other, and focus goes back to the
           picker that opened it, like every other */
        if (s.story != null) { up({ story: null }); focusSoon('#story'); return; }
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
      /* Escape is the dialog's own key and is handled above; nothing below is.
         `toggleHelp` moves focus into #helpCard, which is a scroll container
         (overflow-y:auto) 2.498 px tall in a 392 px box — so Space is that
         container's page-down, and it was being taken here instead. The only
         guard was `document.documentElement.scrollHeight > innerHeight + 1`,
         i.e. whether the DOCUMENT scrolls, which at ≥900 px it never does.
         Measured against ./dist at 1440x900 and 1280x800: glossary open, focus
         on #helpCard, Space → scrollTop stays 0, playing false→true, the year
         2024.→2025. and the permalink rewritten, all of it behind an opaque
         overlay and announced only by the sr-only live region. PageDown scrolled
         the card (0→343) in the same state, which is what proves only Space was
         stolen. The arrows did the same thing one year at a time. */
      if (s.help) return;
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
        /* role=slider owes ArrowUp/ArrowDown as well as left/right — the APG
           pattern lists all four, and a reader who reaches for up/down on a
           control that calls itself a slider got nothing. The bare arrows below
           handle left/right for the whole document; these two are scoped to the
           slider, like Home/End above. */
        if (!ev.shiftKey && ev.key === 'ArrowUp') { jump(Math.min(YEARS.length - 1, s.yi + 1)); return; }
        if (!ev.shiftKey && ev.key === 'ArrowDown') { jump(Math.max(min, s.yi - 1)); return; }
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
  const live = S.playing ? L('Reprodukcija kroz godine u tijeku.', 'Playback through the years is running.')
    : `${yr(YEARS[S.yi])} · ${VLAB[S.view]} · ${S.cum || S.view === 'klas' ? L('kumulativno', 'cumulative') : L('godišnje', 'annual')}`;

  return (
    <>
      {/* ~28 header controls sit between the page top and the map; landmarks
          serve AT but a sighted keyboard-only user had no bypass at all (2.4.1) */}
      {/* …and the bypass block reset the atlas. Activating it was a
          same-document fragment navigation, which every engine answers with
          `popstate` — and this app reads popstate as a permalink. `#map` carries
          none of the codec's fields, so `readHash('#map')` returns `{}` by the
          codec's own "unknown or invalid fields are ignored" contract, and the
          handler's `{ ...ref.current, ...BASE, ...patch }` was literally BASE.
          Measured at 1440×900 with a real keyboard activation:
          `#v=saldo&f=nat&d=rel11&c=0&y=2018&s=HR-21` became
          `#v=saldo&c=1&y=2024` — view, sastavnica, vrijednosti, year and card
          all gone, every number on screen changed, and the reset laundered into
          the URL. Focus landed on <body> too, so it never reached the map
          either: the one control that exists for keyboard users did neither of
          the two things it promises.
          Focus is moved here instead and the URL is left alone. The href stays:
          it is what makes this a link, it is what the suite pins, and it is the
          no-JS destination. */}
      <a className="skip" href="#map" onClick={ev => { ev.preventDefault(); focusSoon('#map'); }}>
        {L('Prijeđi na kartu', 'Skip to the map')}</a>
      <Header S={S} setS={up} setView={setView} setMode={setMode} applyStory={applyStory} resetAll={resetAll} />
      <main className="main">
        <MapView S={S} setS={up} selectCounty={selectCounty} setHL={setHL} resetSeq={resetSeq} openCorridor={openCorridor}
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
        <span>{L('Izvori: ', 'Sources: ')}<a className="paper-link" href={sources()[0].href} target="_blank" rel="noopener noreferrer"
            aria-label={`${L('DZS', 'CBS')} — ${sources()[0].note}. ${NEWTAB()}`}>{L('DZS', 'CBS')}</a>{' '}
          {L('tab. 7.4.1.–7.4.3. (srpanj 2026.) · državljanstvo, dob, zemlje: DZS STAN-2026-2-1 · tokovi 2018.: DZS posebna obrada, županije i JLS (',
            'tab. 7.4.1.–7.4.3. (July 2026) · citizenship, age, countries: CBS STAN-2026-2-1 · 2018 flows: CBS special processing, counties and LAUs (')}
          <a className="paper-link" href={sources()[1].href} target="_blank" rel="noopener noreferrer"
            aria-label={`${L('Pitoski i sur. 2021', 'Pitoski et al. 2021')} — ${sources()[1].note}. ${NEWTAB()}`}>{L('Pitoski i sur. 2021', 'Pitoski et al. 2021')}</a>, CC BY) ·
          {L('ostale godine: IPF procjena na DZS marginama · granice županija:', 'other years: IPF estimate on CBS margins · county boundaries:')}{' '}
          <a className="paper-link" href={sources()[3].href} target="_blank" rel="noopener noreferrer"
            aria-label={`geoBoundaries — ${sources()[3].note}. ${NEWTAB()}`}>geoBoundaries</a>{L('/OSM, granice JLS:', '/OSM, LAU boundaries:')}{' '}
          <a className="paper-link" href={sources()[2].href} target="_blank" rel="noopener noreferrer"
            aria-label={`OpenStreetMap — ${sources()[2].note}. ${NEWTAB()}`}>OpenStreetMap</a>{L(' suradnici — oboje ODbL.', ' contributors — both ODbL.')}</span>
        {/* The study the atlas is a companion to is unpublished: the reference is
            pending, not missing, and the atlas is not affiliated with it. Both
            sentences come from lib/credits.ts, which is also what the header,
            the glossary and the export read — one edit publishes all of them.
            Always visible, because a disclaimer behind a panel is a disclaimer
            most readers never meet. */}
        <span>{paperRefNote()}{' '}
          {/* the short citation is Croatian by construction — it is what is
              printed on the paper — so it is annotated rather than translated */}
          {!paperPending() && (
            <><a className="paper-link" lang="hr" href={PAPER.url} target="_blank" rel="noopener noreferrer"
              aria-label={`${PAPER.short} — ${PAPER.citation} ${NEWTAB()}`}>{PAPER.short}</a>{paperRefTail()} </>
          )}
          {NO_AFFIL()}{L(" DZS naknadno revidira serije, pa se pojedine vrijednosti razlikuju od onih u radu.", " CBS revises its series afterwards, so some values differ from those in the paper.")}
          {/* The page measures its own use, and said so nowhere a reader could
              see. One clause here — the fixed lane has no room for more — and the
              full statement in the glossary, both from lib/privacy.ts so they
              cannot drift. */}
          {' '}{privacyShort()}
          {/* Who made it, and where to check it. Every upstream source on this
              page is credited by name and linked; the atlas itself said only
              "autor atlasa" and linked nothing, which was the one attribution
              here that stayed anonymous.
              Threaded onto the end of this sentence rather than given a span of
              its own: .ft is a flex row of items above a fixed-height lane, so
              a third item wraps to a whole new line — measured, that cost the
              footer 75 → 100 px and took the map box to 545, under the 560 the
              suite pins. Inline it costs a line only where the sentence was
              already close to wrapping. The full statement, with the year and
              the repository spelled out, is in the glossary, which has room.
              Values come from lib/licences.ts — the footer, the glossary and
              index.html's <noscript> all read the same four. */}
          {' '}{L('Izradio ', 'Built by ')}<span lang="hr">{ATLAS_AUTHOR}</span>
          {` · © ${CODE_YEAR} · ${CODE_LICENCE} · `}
          {/* Name built from the visible text, not written alongside it: 2.5.3
              Label in Name wants the accessible name to *contain* what a
              speech-input user can see, and "Izvorni kod atlasa na GitHubu" does
              not contain "izvorni kod" — the capital I alone is enough to miss.
              Same label — note — new-tab shape as the four source links above,
              which is the shape the suite checks all of them against. */}
          <a className="paper-link" href={REPO} target="_blank" rel="noopener noreferrer"
            aria-label={`${L('izvorni kod', 'source code')} — ${L('atlas na GitHubu', 'the atlas on GitHub')}. ${NEWTAB()}`}>{L('izvorni kod', 'source code')}</a></span>
      </footer>
      <Tooltip S={S} />
      {/* Vercel Analytics + Speed Insights. Both render nothing; each injects one
          script tag. In a production build with no `dsn` they resolve to
          SAME-ORIGIN paths — /_vercel/insights/script.js and
          /_vercel/speed-insights/script.js — which Vercel's edge proxies, so the
          "page reaches no third-party origin" invariant still holds for a
          deployed visitor. Only `npm run dev` loads them from
          va.vercel-scripts.com (the .debug.js builds), which is why the check
          runs against `dist` — see the third-party-origin checks in
          scripts/verify.cjs, which assert it.
          `beforeSend` strips the fragment before either beacon leaves: both ship
          location.href, so the county, the corridor partner, the view and the
          year were being reported to Vercel's edge while the glossary promised
          the fragment never reaches a server. See lib/privacy.ts. */}
      <Analytics beforeSend={dropHash} />
      <SpeedInsights beforeSend={dropHash} />
    </>
  );
}
