/* Permalink codec: a whitelisted subset of State ↔ location.hash, so any view
   can be shared as a URL. Years are encoded as calendar years (…&y=2018) for
   human-readable links; unknown or invalid fields are ignored on decode. */
import { YEARS, ISOS } from './metrics.ts';
import { STORIES, storyHolds } from './stories.ts';
import { BASE } from './state.ts';
import type { Patch, State } from './types.ts';

const VIEWS = ['saldo', 'klas', 'reg', 'flow', 'mx', 'jmap', 'yrs'] as const;
const FLOWS = ['tot', 'int', 'ext', 'nat', 'all'] as const;
const DENS = ['abs', 'rel11', 'relest'] as const;
const DIRS = ['out', 'in', 'net'] as const;
const LANGS = ['hr', 'en'] as const;

export function encodeHash(S: State): string {
  const p = new URLSearchParams();
  /* Omitted when it matches the reader's own default (BASE resolves that from
     the stored choice, then the browser), which is what keeps a plain link
     language-neutral: shared without `l=`, it opens in whatever the recipient
     reads. Present the moment the language was *chosen*, so a link shared from
     the English view arrives in English. */
  if (S.lang !== BASE.lang) p.set('l', S.lang);
  p.set('v', S.view);
  /* "same as BASE" is the omission rule, and decodeHash's story guard reads it
     back the same way — so both sides must consult BASE, not a literal copy */
  if (S.flow !== BASE.flow) p.set('f', S.flow);
  if (S.den !== BASE.den) p.set('d', S.den);
  p.set('c', S.cum ? '1' : '0');
  p.set('y', String(YEARS[S.yi]));
  if (S.thr !== BASE.thr) p.set('t', String(S.thr));
  if (S.thrRel) { p.set('tr', '1'); p.set('tp', String(S.thrPct)); }
  if (S.sel) p.set('s', S.sel);
  if (S.pair) p.set('pp', S.pair);
  if (S.dir !== BASE.dir) p.set('dir', S.dir);
  if (S.labels) p.set('lb', '1');
  if (S.citz) p.set('cz', S.citzTab === 'zem' ? '2' : '1');
  if (S.jls) p.set('jl', S.jlsTab === 'loc' ? '2' : '1');
  if (S.age) p.set('ag', S.ageTab === 'int' ? '2' : '1');
  if (S.story != null) p.set('st', String(S.story + 1));
  return p.toString();
}

function oneOf<T extends string>(v: string | null, all: readonly T[]): T | undefined {
  return all.includes(v as T) ? (v as T) : undefined;
}

export function decodeHash(hash: string): Patch {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const o: Patch = {};
  const lang = oneOf(p.get('l'), LANGS);
  if (lang) o.lang = lang;
  const view = oneOf(p.get('v'), VIEWS);
  if (view) o.view = view;
  const flow = oneOf(p.get('f'), FLOWS);
  if (flow) o.flow = flow;
  const den = oneOf(p.get('d'), DENS);
  if (den) o.den = den;
  if (p.get('c') != null) o.cum = p.get('c') === '1';
  const yi = YEARS.indexOf(Number(p.get('y')));
  if (yi >= 0) o.yi = yi;
  const thr = Number(p.get('t'));
  if (thr >= 500 && thr <= 15000) o.thr = thr;
  if (p.get('tr') === '1') o.thrRel = true;
  const tp = Number(p.get('tp'));
  if (tp >= 0.5 && tp <= 5) o.thrPct = tp;
  if (ISOS.includes(p.get('s')!)) o.sel = p.get('s');
  if (ISOS.includes(p.get('pp')!)) o.pair = p.get('pp');
  const dir = oneOf(p.get('dir'), DIRS);
  if (dir) o.dir = dir;
  if (p.get('lb') === '1') o.labels = true;
  if (p.get('cz')) { o.citz = true; o.citzTab = p.get('cz') === '2' ? 'zem' : 'grp'; }
  if (p.get('jl')) { o.jls = true; o.jlsTab = p.get('jl') === '2' ? 'loc' : 'inter'; }
  if (p.get('ag')) { o.age = true; o.ageTab = p.get('ag') === '2' ? 'int' : 'ext'; }
  /* ── invariant repairs ──
     Every test below reads `at(k)` — the value the link actually BOOTS, i.e.
     `{...BASE, ...o}[k]` — never the raw patch. `encodeHash` omits any field
     still at its BASE value, so a decoded key being absent means "still at the
     default", not "false". Reading `o.cum` directly is what let `#v=saldo&y=2005`
     boot a *cumulative* view at 2005: `val()` returns 0 before 2011, so all 21
     counties, the whole rail and every aria-label read 0, while the tooltip
     (which clamps to ≥2011) reported 2011's real numbers under an impossible
     "2011.–2005." heading — and encodeHash then rewrote the URL into a complete,
     shareable link to that blank state. Same lesson as the story guard below. */
  const at = <K extends keyof State>(k: K): State[K] => (k in o ? o[k] as State[K] : BASE[k]);
  /* flow-ish views need a hub and must not re-trigger the first-entry jump */
  if (at('view') === 'flow' && !at('sel')) o.sel = 'HR-21';
  if (at('view') === 'flow' || at('view') === 'mx') o.flowSeen = true;
  if (at('view') === 'jmap') { o.yi = YEARS.indexOf(2018); o.cum = false; }
  /* klas is always cumulative from 2011; so is any cum view */
  const ix2011 = YEARS.indexOf(2011);
  if ((at('view') === 'klas' || at('cum')) && at('yi') < ix2011) o.yi = ix2011;
  /* the JLS corridor chip only exists in Tokovi. Carried anywhere else it is a
     flag with no panel behind it: it still set body.panel-open (which hides the
     legend outright below 900 px) and still swallowed an Escape press. */
  if (at('view') !== 'flow') o.jls = false;
  /* `pair` is the same shape of dead flag and was the one key the jls repair did
     not cover: PairCard renders null outside Tokovi, but App's Escape cascade
     still consumed a press for it and aimed focusSoon at a rail row whose
     data-iso does not exist in that view — so `#v=reg&pp=HR-01&cz=1` booted with
     an invisible pair, and the first Escape closed nothing, moved focus nowhere
     and never reached the open panel. encodeHash then re-emitted `pp`. */
  /* Matrica renders the same corridor as Tokovi (row/column instead of
     hub/partner), so `pp` is legal in both and nowhere else. */
  if (at('view') !== 'flow' && at('view') !== 'mx') o.pair = null;
  /* The JLS map has no county detail card either, so a carried `sel` is a card
     painted over a grid it cannot describe (see App.setView). Godine is the same
     shape of surface for the same reason: it is a grid, its rows already *are*
     each county's whole series, and a floating 1998–2025 card over it would both
     cover live cells and duplicate the row underneath it. */
  if (at('view') === 'jmap' || at('view') === 'yrs') o.sel = null;
  /* In Matrica `sel` is legible only as a corridor's row — there is no county
     card there — so a lone half of a corridor is dropped, whichever half it is:
     `#v=mx&s=HR-18` would otherwise mark a row with no card, and `#v=mx&pp=HR-13`
     an Escape-eating flag with nothing on screen at all. */
  if (at('view') === 'mx' && !(at('sel') && at('pair'))) { o.sel = null; o.pair = null; }
  /* A county is not a corridor with itself: `#v=flow&s=HR-01&pp=HR-01` renders no
     card (PairCard guards `pair === sel`) and left the same dead flag behind. */
  if (at('sel') && at('sel') === at('pair')) o.pair = null;
  /* panels are mutually exclusive — keep at most one open (citz > jls > age) */
  if (at('citz')) { o.jls = false; o.age = false; }
  else if (at('jls')) o.age = false;

  /* A preset index is only honoured when the state this link actually boots still
     matches the preset it names. Seeding that comparison from the preset itself
     made every key the URL omits compare against its own value and pass
     vacuously: `#v=saldo&c=1&y=2024&st=2` kept a caption citing +27.521 over a
     view rendering +41.986. `storyHolds` folds BASE in for both sides and is the
     same function App invalidates on. Runs last so the repairs above (a flow hub,
     flowSeen, the jmap year, the dropped chip) are part of what gets compared. */
  const st = Number(p.get('st')) - 1;
  if (st >= 0 && st < STORIES.length && storyHolds(o, st)) o.story = st;
  return o;
}
