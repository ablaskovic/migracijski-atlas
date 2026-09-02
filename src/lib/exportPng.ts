import {
  ISOS, DOM, RDOM, KCOL, KLAB, Y0, YEND,
  klasOf, paperKlasComparable, divScale, seqScale, flowMax, mxMax, jmapScale, flowBadge, fmtI, fmtR, exportDesc, marginFlow,
  preMargin, preMarginNote,
} from './metrics.ts';
import { ensureFonts, fontCss } from './exportFonts.ts';
import { paperCaveatLine, paperExportLine, paperThrLine } from './credits.ts';
import { exportLicenceLine } from './licences.ts';
import { L, t, yrSpan } from './i18n.ts';
import type { Klas, State } from './types.ts';

const VARS: Record<string, string> = {
  'var(--ink)': '#20262B', 'var(--acc)': '#0F7D8C', 'var(--line)': '#D9DDD6',
  'var(--mut)': '#5F6A72', 'var(--bg)': '#F4F5F2',
};

export interface ExportInfo { w: number; h: number; bytes: number }

/* One prefix per exported document, so two figures can share a page.
   Every id in the export was fixed and un-namespaced: `lg` for the legend ramp,
   `mxhatch`/`yrhatch` cloned out of the live grid, and `map` on the clone
   itself. A fragment reference resolves to the FIRST matching id in the host
   document, so inlining a Matrica figure and a Godine figure into one page or
   notebook — a normal use of a file this module calls a "vector twin …
   publication-ready" — made the second legend bar paint the first figure's
   ramp: two grids with different domains showing one colour key, with nothing
   on screen saying so. Same for the pre-2007 hatch, and `id="map"` collided
   with whatever the host page called `map`.
   Random rather than derived from the state: the pairing this has to survive is
   two *different* figures in one document, and a state-derived prefix collides
   for exactly those. DetailCard and PairCard already scope their clip paths
   this way. */
/* padded: toString(36) is shorter than 8 chars for a small enough random */
const uid = () => 'ma' + (Math.random().toString(36) + '000000').slice(2, 8) + '-';

/* rename every id the clone carries, and repoint the references to them */
function scopeIds(clone: SVGSVGElement, u: string): void {
  clone.removeAttribute('id');
  const moved = new Map<string, string>();
  clone.querySelectorAll('[id]').forEach(el => {
    const was = el.id;
    el.id = u + was;
    moved.set(was, el.id);
  });
  if (!moved.size) return;
  clone.querySelectorAll('*').forEach(el => {
    for (const a of ['fill', 'stroke', 'clip-path', 'mask']) {
      const m = /^url\(#(.+)\)$/.exec(el.getAttribute(a) || '');
      const to = m && moved.get(m[1]);
      if (to) el.setAttribute(a, `url(#${to})`);
    }
  });
}

/* The height the FIGURE needs, which is not the height of the box on screen.

   Matrica and Godine lay out on a fixed cell geometry with a 12 px hit floor, so
   on a short window the grid is taller than the box it is drawn in — the
   documented trade — and #map's overflow:hidden crops it. The export inherited
   that crop by sizing itself from `clientHeight`: measured at 1366×657, a
   1074×434 sheet holding 140 of its 420 cells, seven whole counties
   (Splitsko-dalmatinska, Dubrovačko-neretvanska, Osječko-baranjska,
   Vukovarsko-srijemska, Brodsko-posavska, Požeško-slavonska,
   Virovitičko-podravska) cut flush at the frame, under a title that still reads
   MATRICA TOKOVA and beside a column axis that is complete. A viewport may crop;
   a published figure may not.

   Only while the reader has not zoomed. Above 1× the frame is one they chose,
   and the bbox is the magnified content — growing to it would export a sheet
   eight times too tall. */
function drawnH(node: SVGSVGElement): number {
  const h = node.clientHeight;
  const tf = node.querySelector('g[transform]')?.getAttribute('transform') ?? '';
  const k = Number(/scale\(([\d.]+)\)/.exec(tf)?.[1] ?? 1);
  if (Math.abs(k - 1) > 0.001) return h;
  try {
    const bb = node.getBBox();
    return Math.max(h, Math.ceil(bb.y + bb.height));
  } catch { return h; }
}

/* The two grids are laid out for a screen that also holds a legend and a chip
   dock, and the exported figure carries neither — so it inherited the hole they
   leave. Measured at 1440×900: Matrica's 1148 px figure has its cells between
   x 445 and 831, 360 px of nothing to the left of the first row label and 318 to
   the right, 34 % of the width carrying data; Godine 414 px left against 14
   right; at 1024×768 Matrica 151 against 330. A published figure should be its
   ink.
   Cropped rather than re-laid-out: the screen keeps the geometry it was verified
   with, and only the artefact changes. Grids only — the maps are already their
   own frame — and only at 1×, for the reason drawnH gives: above it the frame is
   one the reader chose. Client rects, because #map carries no viewBox and its
   user units are CSS px. */
const CROP_PAD = 20;
function gridCrop(node: SVGSVGElement): { x: number; y: number; w: number; h: number } | null {
  if (node.getAttribute('role') !== 'grid') return null;
  const tf = node.querySelector('g[transform]')?.getAttribute('transform') ?? '';
  const k = Number(/scale(([d.]+))/.exec(tf)?.[1] ?? 1);
  if (Math.abs(k - 1) > 0.001) return null;
  const r = node.getBoundingClientRect();
  const ink = [...node.querySelectorAll('.mxc, .mxd, .yrc, text')]
    .map(e => e.getBoundingClientRect()).filter(q => q.width > 0 && q.height > 0);
  if (ink.length < 20) return null;
  const x0 = Math.min(...ink.map(q => q.left)), x1 = Math.max(...ink.map(q => q.right));
  const y0 = Math.min(...ink.map(q => q.top)), y1 = Math.max(...ink.map(q => q.bottom));
  const x = Math.max(0, Math.floor(x0 - r.left - CROP_PAD));
  const y = Math.max(0, Math.floor(y0 - r.top - CROP_PAD));
  /* bounded by drawnH, not clientHeight: a grid taller than its box overflows
     it, and drawnH exists to let the export grow to the ink rather than inherit
     the clip. Clamping here to clientHeight put that clip straight back —
     measured at 900×620, 40 cells across two rows fell outside the crop. */
  const hMax = drawnH(node);
  const w = Math.min(node.clientWidth - x, Math.ceil(x1 - r.left + CROP_PAD) - x);
  const h = Math.min(hMax - y, Math.ceil(y1 - r.top + CROP_PAD) - y);
  return w > 0 && h > 0 && (w < node.clientWidth || h < hMax) ? { x, y, w, h } : null;
}

/* clone the live map SVG and bake class/CSS-var-provided presentation into
   attributes so the standalone document renders identically */
function bakeMapClone(node: SVGSVGElement, u: string, h = node.clientHeight, face = fontCss(),
  crop: { x: number; y: number; w: number; h: number } | null = null): SVGSVGElement {
  const clone = node.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  /* The faces, if they have been fetched. The serialised map is rasterised in
     its own browsing context, which cannot see document.fonts — so without this
     every in-map string fell back to an installed face while the band around it
     drew in the real one. See exportFonts.ts. */
  if (face) {
    const st = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    st.textContent = face;
    clone.insertBefore(st, clone.firstChild);
  }
  clone.setAttribute('width', String(crop ? crop.w : node.clientWidth));
  clone.setAttribute('height', String(crop ? crop.h : h));
  if (crop) clone.setAttribute('viewBox', `${crop.x} ${crop.y} ${crop.w} ${crop.h}`);
  clone.querySelectorAll('.cnt').forEach(p => {
    p.setAttribute('stroke', p.classList.contains('sel') ? '#0F7D8C' : '#fff');
    p.setAttribute('stroke-width', p.classList.contains('sel') ? '2.2' : '0.8');
  });
  clone.querySelectorAll('.jl').forEach(p => {
    p.setAttribute('stroke', '#fff'); p.setAttribute('stroke-width', '0.35');
  });
  clone.querySelectorAll('.jbord').forEach(p => {
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#20262B');
    p.setAttribute('stroke-width', '1'); p.setAttribute('stroke-linejoin', 'round');
  });
  clone.querySelectorAll('.regline').forEach(p => {
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#20262B');
    p.setAttribute('stroke-width', '1.8'); p.setAttribute('stroke-linejoin', 'round');
  });
  clone.querySelectorAll('.arc').forEach(p => {
    p.setAttribute('fill', 'none'); p.setAttribute('opacity', '0.82'); p.setAttribute('stroke-linecap', 'round');
  });
  /* the casing under each arc takes its whole appearance from the stylesheet —
     an exported document ships without one, so an unbaked casing would paint as
     a black-filled blob under every corridor (the .mxband lesson, again) */
  clone.querySelectorAll('.arccase').forEach(p => {
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#fff');
    p.setAttribute('opacity', '0.82'); p.setAttribute('stroke-linecap', 'round');
  });
  clone.querySelectorAll('.arch').forEach(p => p.setAttribute('opacity', '0.9'));
  /* The matrix trace bands take fill:none from the stylesheet alone, and this
     document ships without one — so an export taken while a corridor was
     highlighted painted a solid black row and column (measured: rgb(0,0,0))
     straight across the heatmap. Everything visible has to be baked, not just
     the shapes that carry data. */
  clone.querySelectorAll('.mxband rect').forEach(r => {
    r.setAttribute('fill', 'none'); r.setAttribute('stroke', '#20262B');
    r.setAttribute('stroke-width', '1.1'); r.setAttribute('opacity', '0.5');
  });
  /* The focus ring is UI state, not data — it must not be baked into a figure
     that ends up in a paper. It also takes its stroke from the stylesheet, so
     leaving it in would ship a painting node with no fill/stroke of its own,
     the exact self-containment failure the .mxband bar was. */
  clone.querySelectorAll('.focusring').forEach(g => g.remove());
  /* the in-cell number's white halo is what makes it legible on the dark end of
     both ramps (see MatrixView); it comes from a class, so it has to be baked
     or the exported matrix reverts to ink-on-indigo at ~2,5:1 */
  clone.querySelectorAll('.mxnum').forEach(t => {
    t.setAttribute('paint-order', 'stroke');
    t.setAttribute('stroke', '#fff');
    t.setAttribute('stroke-width', '2.2');
    t.setAttribute('stroke-linejoin', 'round');
  });
  clone.querySelectorAll('*').forEach(el => {
    for (const a of ['fill', 'stroke']) {
      const v = el.getAttribute(a);
      if (v && v.indexOf('var(') === 0) el.setAttribute(a, VARS[v] || '#20262B');
    }
  });
  scopeIds(clone, u);
  return clone;
}

function fname(S: State, per: string, ext: string): string {
  /* Every control that changes the FIGURE has to change the name, or the files
     overwrite each other in the reader's downloads folder. The name carried the
     view, the period, and the direction for two of the three views that have
     one. Measured over 26 states, each exported document hashed to prove the
     payloads genuinely differ: 26 distinct figures arrived under 6 names. A
     researcher building a four-panel Saldo figure — unutarnje, vanjske,
     prirodno, ukupno — got migracijski-atlas_saldo_2024.png, (1), (2), (3),
     with nothing saying which component is which; the eight abs/rel11 × flow
     combinations collapsed onto one name, and Matrica's three directions onto
     another, which is the collision the note below says was fixed for Tokovi
     and the JLS map.
     Only what that view actually reads: appending a denominator to Matrica,
     which does not use one, would put a difference in the name that is not in
     the picture. */
  const bits: string[] = [S.view];
  if (S.view === 'flow' || S.view === 'jmap' || S.view === 'mx') bits.push(S.dir);
  /* the component: every view but the JLS map, whose single measured year has
     no components to choose between */
  if (S.view !== 'jmap') bits.push(S.flow);
  /* absolute or per-capita — the choropleth views and the two grids read it */
  if (S.view !== 'jmap' && S.view !== 'flow') bits.push(S.den);
  /* the class boundary IS the Klasifikacija figure */
  if (S.view === 'klas') bits.push(S.thrRel ? S.thrPct + 'pct' : String(S.thr));
  bits.push(per);
  return ('migracijski-atlas_' + bits.join('_'))
    .replace(/[–.]/g, '-').replace(/-+/g, '-').replace(/-$/, '') + '.' + ext;
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* which legend the current state needs: klas swatches, sequential bar, or diverging bar */
type Leg =
  | { kind: 'klas'; counts: Record<Klas, number> }
  | { kind: 'seq'; m: number; badge: string; scale?: (v: number) => string }
  | { kind: 'div'; m: number; rel: boolean; badge: string; scale?: (v: number) => string };
function legendSpec(S: State): Leg {
  if (S.view === 'klas') {
    const counts: Record<Klas, number> = { gain: 0, neu: 0, loss: 0 };
    ISOS.forEach(i => counts[klasOf(i, S.yi, S.thr, S.thrRel, S.thrPct)]++);
    return { kind: 'klas', counts };
  }
  if (S.view === 'jmap') {
    const { m, scale } = jmapScale(S.dir);
    /* the badge is the honesty label plus the scale note, and both were Croatian
       literals — an English figure carried "· izmjereno · √ skala" under an
       English title */
    const badge = '· ' + t('badge.meas') + L(' · √ skala', ' · √ scale');
    return S.dir === 'net' ? { kind: 'div', m, rel: false, badge, scale }
      : { kind: 'seq', m, badge, scale };
  }
  const flowish = S.view === 'flow' || S.view === 'mx';
  /* `flowBadge` never returns the cumulative wording, so a cumulative export
     carried "· procjena (IPF)" in its legend under a title that said
     "KUMULATIVNA PROCJENA" — one image, two different honesty labels. Same
     expression exportDesc uses, so the two halves cannot disagree again. */
  /* …and it was still a Croatian literal, so an English cumulative export was
     titled "· CUMULATIVE ESTIMATE" over a legend badge reading "kumulativna
     procjena" — one image, two languages for the same honesty fact. */
  const badge = flowish ? '· ' + (S.cum ? t('badge.cum') : flowBadge(S.yi, S.cum)) : '';
  if (flowish && S.dir !== 'net') {
    const m = S.view === 'mx' ? mxMax(S.dir, S.cum) : flowMax(S.sel!, S.dir, S.cum);
    return { kind: 'seq', m, badge };
  }
  /* Godine shares Saldo's domain exactly — DOM is already the max over every
     county and every rendered year — so the exported key is the same key, and a
     figure of the grid and a figure of the map are colour-comparable. */
  const m = S.view === 'reg' ? RDOM[S.flow + S.den + S.cum]
    : S.view === 'mx' ? mxMax('net', S.cum)
    : S.view === 'flow' ? flowMax(S.sel!, 'net', S.cum) : DOM[S.flow + S.den + S.cum];
  return { kind: 'div', m, rel: !flowish && S.den !== 'abs', badge };
}

/* The caveat the on-screen legend carries has to travel with the image. The
   export is the artifact that leaves the app — pasted into a paper, a slide, a
   mail — and it is the one place a reader cannot click through to find the
   footnote. "Neto parova je strukturna procjena" and the mig+prirodno caveat
   were both on screen and in neither exported format (measured: the string
   "strukturna" appeared nowhere in the exported document). */
function legendNote(S: State): string {
  const all = L('Zbroj dviju objavljenih sastavnica — nije ukupna promjena broja stanovnika.',
    'The sum of two published components — not total population change.');
  /* …and the pre-2007 caveat, wherever the screen shows it. It was gated on
     Godine alone, on the reasoning that Godine "is the only view whose image can
     carry those columns off into a slide" — but a Saldo, Regije, Matrica or
     Tokovi figure at 2003 is nothing BUT pre-2007 data. Measured over twelve
     exported 2003 documents: the screen carries it in 4 of 4 views, the export
     carried it in 0 of 4, under this file's own header saying the caveat the
     screen carries has to travel with the image. Same predicate as the screen,
     from metrics, so the gate cannot drift again. */
  const pre = preMargin(S, S.view === 'flow' || S.view === 'mx' || marginFlow(S.flow))
    ? ' ' + preMarginNote() : '';
  if (S.view === 'jmap') {
    return L('Samo preseljenja unutar RH (JLS↔JLS), bez inozemstva.',
      'Internal moves within Croatia only (LAU↔LAU), no international migration.');
  }
  if ((S.view === 'flow' || S.view === 'mx') && S.dir === 'net') return t('note.pairEst') + pre;
  /* Godine is the only view that renders 1998–2006 beside the rest, so it is the
     only one whose *image* can carry those columns off into a slide — the hatch
     that marks them on screen has no caption of its own, so the words go here. */
  if (S.view === 'yrs' && !S.cum && marginFlow(S.flow)) {
    return L('Šrafirano do 2007.: prije toga se međužupanijske margine ne zatvaraju.',
      'Hatched before 2007: the inter-county margins do not close before then.')
      + (S.flow === 'all' ? ' ' + all : '');   /* the hatch caption already names 2007 */
  }
  if (S.view !== 'klas' && S.flow === 'all') return all + pre;
  return pre.trim();
}

/* ── measured band layout, shared by both formats ───────────────────────────
   Reported by a user, and both halves are the same defect: text was drawn
   without ever being fitted to the canvas.
   1. The title shrank towards a floor and then drew anyway. At a narrow map the
      floor is not enough, so "NETO TOKOVI: SISAČKO-MOSLAVAČKA ↔ PARTNERI ·
      KUMULATIVNA PROCJENA" ran straight through the right-aligned period.
      Truncating is not the fix: the tail of that string is the honesty badge,
      and dropping it would be an unbadged estimate. It wraps.
   2. The four credit rows were drawn at x=20 with no fitting at all, so both
      the licence row and the source row simply ran off the right edge — the
      source row has been ~950 px at 8,5 px mono all along, which is wider than
      the canvas at any browser window under ~1000 px. They wrap too, and the
      bottom band is sized from the number of rows that produces rather than
      pinned to a constant that was only ever right at one width.
   Both bands are therefore computed, not fixed, and the two formats share this
   one function so they cannot drift apart. */
const TITLE_MAX = 23, TITLE_MIN = 12, TITLE_LH = 26;
const EYEBROW_MAX = 10, EYEBROW_MIN = 7;
const CREDIT_FS = 8.5, CREDIT_LH = 14;
const BASE_TOP = 86;
const MONO_CSS = '"IBM Plex Mono",ui-monospace,monospace';
const DISP_CSS = 'Oswald,"Arial Narrow",sans-serif';

let MC: CanvasRenderingContext2D | null = null;
function measureCtx(): CanvasRenderingContext2D | null {
  if (!MC) MC = document.createElement('canvas').getContext('2d');
  return MC;
}
/* Greedy word wrap against a real text measurement. `widths` is per line, so
   the title's first line can reserve room for the right-aligned period while
   its continuations get the full width. A single word longer than the line is
   hard-broken rather than allowed to overflow. */
function wrapText(text: string, font: string, widths: (i: number) => number): string[] {
  const ctx = measureCtx();
  if (!ctx) return [text];
  ctx.font = font;
  const fits = (s: string, i: number) => ctx.measureText(s).width <= widths(i);
  const out: string[] = [];
  let line = '';
  const push = () => { out.push(line); line = ''; };
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (fits(next, out.length) || !line) {
      if (!fits(next, out.length) && !line) {
        /* one unbreakable token wider than the whole line */
        let chunk = '';
        for (const ch of word) {
          if (chunk && !fits(chunk + ch, out.length)) { line = chunk; push(); chunk = ''; }
          chunk += ch;
        }
        line = chunk;
        continue;
      }
      line = next;
    } else { push(); line = word; }
  }
  if (line) out.push(line);
  return out.length ? out : [text];
}

export interface Band {
  top: number; bot: number; titleFs: number; titleLines: string[];
  per: string; credits: string[];
  /* the legend's own caveat, wrapped. It sits beside the gradient bar at x=222,
     which leaves 148 px on a 390 px canvas — measured, "Neto parova je
     strukturna procjena." ran to 401 there. Below a floor it drops to x=20 on
     its own line under the scale labels instead of being squeezed. */
  noteLines: string[]; noteX: number; legendBottom: number;
  /* The atlas's own name, above the rule. It was the last run in the band still
     drawn unfitted at a fixed size — the defect the v2.0.9 pass fixed for the
     title, the credits and the legend caveat and missed here, because in
     Croatian it happened to fit at every width the suite exercised. English is
     four characters longer (the title states the country, and "1998–2025" keeps
     no trailing dots), which at 390 px lands within ~1 px of the edge. Fitted by
     shrinking, never by wrapping or truncating: it is one line of identity, and
     an eyebrow that wraps pushes the whole band down. */
  eyebrow: string; eyebrowFs: number;
}
export function bandLayout(S: State, w: number): Band {
  const [dsc, per] = exportDesc(S);
  const title = dsc.toUpperCase();
  const ctx = measureCtx();
  let perW = 0;
  if (ctx) { ctx.font = `600 ${TITLE_MAX}px ${DISP_CSS}`; perW = ctx.measureText(per).width; }
  /* shrink first — a one-line title is the intended look — and only wrap once
     the floor is reached, so narrow exports degrade in the right order */
  let titleFs = TITLE_MAX, titleLines = [title];
  const lineW = (i: number) => (i === 0 ? w - perW - 58 : w - 40);
  while (titleFs > TITLE_MIN) {
    if (wrapText(title, `600 ${titleFs}px ${DISP_CSS}`, lineW).length === 1) break;
    titleFs--;
  }
  titleLines = wrapText(title, `600 ${titleFs}px ${DISP_CSS}`, lineW);
  /* letter-spacing is 1 user unit per character in the SVG and is absolute, not
     relative to the font size, so it is added to the measurement rather than
     scaled with it. Budgeted for the last character too: Chrome's
     getComputedTextLength() includes the trailing gap, and the suite measures
     exactly that. The budget is w-44 rather than the band's own w-40: the fit is
     a canvas measureText and the check is an SVG getComputedTextLength, two
     measurements of the same string that agree to about a pixel, and English
     lands within one of the edge at 390 px. The 2 px a side is the difference
     between "fits" and "fits because it happened to". */
  const eyebrow = `${t('hd.title').toUpperCase()} · ${L('DZS', 'CBS')} · ${yrSpan(Y0, YEND)}`;
  let eyebrowFs = EYEBROW_MAX;
  if (ctx) {
    const eyeFits = (f: number) => {
      ctx.font = `500 ${f}px ${MONO_CSS}`;
      return ctx.measureText(eyebrow).width + eyebrow.length <= w - 44;
    };
    while (eyebrowFs > EYEBROW_MIN && !eyeFits(eyebrowFs)) eyebrowFs -= 0.5;
  }
  const credits = [caveatLine(S), paperLine(S), exportLicenceLine(), srcLine(S)]
    .filter(Boolean)
    .flatMap(t => wrapText(t, `400 ${CREDIT_FS}px ${MONO_CSS}`, () => w - 40));
  /* legend geometry, band-relative: bar at 18, scale labels at 40 */
  const note = legendNote(S);
  const beside = w - 222 - 20;
  const noteX = beside >= 140 ? 222 : 20;
  const noteW = noteX === 222 ? beside : w - 40;
  const noteLines = note ? wrapText(note, `400 ${CREDIT_FS}px ${MONO_CSS}`, () => noteW) : [];
  /* at x=222 the note starts on the labels' own line; dropped to x=20 it starts
     one line below them so it cannot sit on the numbers */
  const noteTop = noteX === 222 ? 40 : 53;
  const legendBottom = noteLines.length
    ? Math.max(40, noteTop + (noteLines.length - 1) * 11) : 40;
  return {
    top: BASE_TOP + (titleLines.length - 1) * TITLE_LH,
    /* 14 px per credit row, 14 px below the last, and 20 px of head room so the
       top row clears whatever the legend actually ended up occupying */
    bot: CREDIT_LH * credits.length + legendBottom + 20,
    titleFs, titleLines, per, credits, noteLines, noteX, legendBottom,
    eyebrow, eyebrowFs,
  };
}

function gradBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  scale: (v: number) => string, m: number, neg: boolean) {
  const gr = ctx.createLinearGradient(x, 0, x + w, 0);
  for (let i = 0; i <= 10; i++) gr.addColorStop(i / 10, scale(neg ? -m + 2 * m * i / 10 : m * i / 10));
  ctx.fillStyle = gr; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#D9DDD6'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/* The boundary credit is not one credit. The county outlines come from
   geoBoundaries; `geo_jls.json` is a raw Overpass `admin_level=7` pull, i.e.
   OpenStreetMap directly — so a JLS export used to carry an attribution that
   was both wrong *and* licence-free. ODbL requires the licence to be named, and
   this is the artifact that leaves the app: there is no footnote to click. */
const SRC_BASE = (): string => L(
  'Izvori: DZS 7.4.1.–7.4.3., STAN-2026-2-1 · tokovi 2018.: Pitoski i sur. 2021. (CC BY) · ostale godine: IPF procjena',
  'Sources: CBS 7.4.1.–7.4.3., STAN-2026-2-1 · 2018 flows: Pitoski et al. 2021 (CC BY) · other years: IPF estimate');
const srcLine = (S: State): string => SRC_BASE() + (S.view === 'jmap'
  ? L(' · granice JLS: OpenStreetMap suradnici (ODbL)', ' · LAU boundaries: OpenStreetMap contributors (ODbL)')
  : L(' · granice županija: geoBoundaries/OSM (ODbL)', ' · county boundaries: geoBoundaries/OSM (ODbL)'));

/* Klasifikacija reproduces the study's threshold and Regije its grouping, and
   the on-screen legend says so ("Klasifikacija iz rada", "prijedlog iz rada").
   The export is where that shorthand has to resolve itself: it is the artifact
   that ends up in a slide or a paper, with no glossary to open. Its own line
   rather than appended to srcLine — that line already runs ~950 px at 8,5 px
   mono and would be clipped by the canvas edge, i.e. the disclaimer would be
   the half that vanished. The four views that take nothing from the study say
   nothing about it. */
const paperLine = (S: State): string =>
  S.view === 'klas' || S.view === 'reg' ? paperExportLine() : '';
/* Same scoping, one row above: an image that cites the study by DOI while
   showing a class count the study did not publish owes the reason on the image
   itself. Not appended to paperLine — that row already runs ~700 px at 8,5 px
   mono and the caveat is the half that would be clipped. */
/* …and the RIGHT caveat for the figure in hand. This keyed on the view alone,
   so a Klasifikacija image at a threshold or window the paper never used still
   printed "DZS naknadno revidira serije…" — blaming revisions for a difference
   the reader had made with the Prag slider. Measured at #v=klas&y=2024&t=10000
   the figure shows 7 / 3 / 11 against the paper's 7 / 7 / 7, and the only
   explanation on the image named neither the paper's threshold nor its window.
   The screen's legend has always branched on paperKlasComparable; the export
   now reads the same two strings from credits.ts. */
const caveatLine = (S: State): string =>
  S.view === 'reg' || (S.view === 'klas' && paperKlasComparable(S)) ? paperCaveatLine()
    : S.view === 'klas' ? paperThrLine(S.thrRel) : '';

export async function exportPNG(node: SVGSVGElement, S: State, dl = true): Promise<ExportInfo | undefined> {
  /* Snapshot first, wait second. `ensureFonts()` can take up to its 8 s timeout,
     and while it does the scrubber, Play and the view buttons stay live — only
     #pngBtn is disabled. The band was drawn from `S`, captured at click time,
     while the map was cloned AFTER the await, from whatever was on screen by
     then. Measured with the woff2 requests held and the year arrowed 2019 → 2020
     during the wait: the band said "MIGRACIJSKI SALDO 2019." over a clone whose
     21 fills were the 2020 state, and the export completed after 10,0 s with no
     error. Switching to Matrica during the wait detached the captured node
     entirely (clientWidth 0) and the same path failed as "canvas too large".
     The geometry, the band and the clone are taken in one synchronous pass, so
     the image describes the instant the reader pressed on; the faces are the
     only thing the await is for, and they go into the clone afterwards. */
  const crop = gridCrop(node);
  const w = crop ? crop.w : node.clientWidth, h = crop ? crop.h : drawnH(node);
  const B = bandLayout(S, w), TOP = B.top, BOT = B.bot;
  const clone = bakeMapClone(node, uid(), h, '', crop);
  const face = await ensureFonts();
  if (face) {
    const st = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    st.textContent = face;
    clone.insertBefore(st, clone.firstChild);
  }
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
  const img = new Image();
  /* try/FINALLY, and revoked the moment the load settles. It used to be revoked
     on two paths only — a successful draw, and an image error — so anything that
     threw between the load and the draw (the canvas setup, the band, or now the
     area clamp and the encode) stranded a multi-hundred-KB blob for the life of
     the document, and every retry stranded another. Once onload has fired the
     bitmap is decoded and held by the <img>, so revoking here is safe and the
     later drawImage is unaffected — which is what makes one finally enough. */
  try {
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('the serialised map did not rasterise')); img.src = url; });
  } finally {
    URL.revokeObjectURL(url);
  }
  /* Derived, not fixed at 2. `.main`/`.map-wrap` carry no max-width, so .map-box
     grows to the window minus the 292 px rail: measured at 3840×2160 the map is
     3548×1856 and a flat SC=2 asks for a 7096×4060 canvas — 28,8 Mpx, ~110 MB of
     RGBA backing store, on top of the ~25 MB decoded blob-URL <img> drawImage
     reads from and the serialised SVG. WebKit caps canvas backing store by AREA
     (16.777.216 px on iOS/iPadOS) and past it toBlob yields a blank image rather
     than an error, so the reader downloads an empty frame with no message. This
     keeps 2× on every ordinary window — 1440×900 and 2560×1440 are both well
     under the cap — and degrades toward 1× instead of failing on a 4K or 5K one. */
  const MAX_PX = 16_000_000;
  const SC = Math.max(1, Math.min(2, Math.sqrt(MAX_PX / Math.max(1, w * (h + TOP + BOT)))));
  const cv = document.createElement('canvas');
  /* floored, not rounded: a canvas takes integers, and rounding UP can carry the
     product back over MAX_PX (measured: 16.001.488 at 3840×2160). Flooring both
     sides can only reduce the area. The reference window keeps an exact 2× either
     way, which is what the suite pins. */
  cv.width = Math.floor(w * SC); cv.height = Math.floor((h + TOP + BOT) * SC);
  const ctx = cv.getContext('2d')!; ctx.scale(SC, SC);
  ctx.fillStyle = '#F4F5F2'; ctx.fillRect(0, 0, w, h + TOP + BOT);
  ctx.fillStyle = '#5F6A72'; ctx.font = '500 ' + B.eyebrowFs + 'px ' + MONO_CSS;
  ctx.fillText(B.eyebrow, 20, 26);
  const per = B.per;
  ctx.fillStyle = '#20262B';
  ctx.font = '600 ' + B.titleFs + 'px ' + DISP_CSS;
  B.titleLines.forEach((ln, i) => ctx.fillText(ln, 20, 56 + i * TITLE_LH));
  ctx.textAlign = 'right'; ctx.font = '600 ' + TITLE_MAX + 'px ' + DISP_CSS;
  ctx.fillText(per, w - 20, 56); ctx.textAlign = 'left';
  const ruleY = 70 + (B.titleLines.length - 1) * TITLE_LH;
  ctx.strokeStyle = '#D9DDD6'; ctx.beginPath(); ctx.moveTo(20, ruleY); ctx.lineTo(w - 20, ruleY); ctx.stroke();
  ctx.drawImage(img, 0, TOP, w, h);
  const ly = h + TOP + 18;
  const leg = legendSpec(S);
  ctx.font = '400 10px "IBM Plex Sans",system-ui,sans-serif';
  if (leg.kind === 'klas') {
    let lx = 20;
    for (const k of ['gain', 'neu', 'loss'] as const) {
      ctx.fillStyle = KCOL[k]; ctx.fillRect(lx, ly, 11, 11);
      ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.strokeRect(lx + 0.5, ly + 0.5, 10, 10);
      ctx.fillStyle = '#20262B'; const t = KLAB[k] + ' · ' + leg.counts[k]; ctx.fillText(t, lx + 16, ly + 9);
      lx += 16 + ctx.measureText(t).width + 18;
    }
  } else if (leg.kind === 'seq') {
    gradBar(ctx, 20, ly, 190, 10, leg.scale ?? seqScale(leg.m, S.dir), leg.m, false);
    ctx.fillStyle = '#5F6A72'; ctx.font = '400 9.5px "IBM Plex Mono",monospace';
    ctx.fillText('0', 20, ly + 22); ctx.textAlign = 'right'; ctx.fillText(fmtI.format(leg.m), 210, ly + 22); ctx.textAlign = 'left';
    ctx.fillText(leg.badge, 222, ly + 9);
  } else {
    gradBar(ctx, 20, ly, 190, 10, leg.scale ?? divScale(leg.m), leg.m, true);
    const lab = (v: number) => leg.rel ? fmtR.format(v) + ' %' : fmtI.format(Math.round(v));
    ctx.fillStyle = '#5F6A72'; ctx.font = '400 9.5px "IBM Plex Mono",monospace';
    ctx.fillText('−' + lab(leg.m), 20, ly + 22);
    ctx.textAlign = 'center'; ctx.fillText('0', 115, ly + 22);
    ctx.textAlign = 'right'; ctx.fillText('+' + lab(leg.m), 210, ly + 22); ctx.textAlign = 'left';
    ctx.fillText(leg.badge, 222, ly + 9);
  }
  ctx.fillStyle = '#5F6A72'; ctx.font = '400 8.5px "IBM Plex Mono",ui-monospace,monospace';
  if (leg.kind !== 'klas') B.noteLines.forEach((ln, i) =>
    ctx.fillText(ln, B.noteX, h + TOP + 18 + (B.noteX === 222 ? 22 : 35) + i * 11));
  /* bottom-up, so the source credit is always the last line on the image */
  B.credits.forEach((ln, i) => ctx.fillText(
    ln, 20, h + TOP + BOT - CREDIT_LH * (B.credits.length - i)));
  /* One awaited encode for both branches. The download path used to fire
     `cv.toBlob(b => { if (b) download(b, …) })` and return immediately, so the
     function resolved before the callback ran: Header's `catch`/`fail('png')`
     could not see an encode failure, `setBusy(false)` ran while the encode was
     still in flight, and a null blob — which is exactly what a canvas over the
     platform's area cap returns — was silently swallowed. Nothing downloaded,
     nothing reported, the button back to normal. Awaiting it makes the failure
     an exception the existing handler already renders, and keeps `busy` true
     until the file is genuinely handed to the browser. */
  const blob = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/png'));
  if (!blob) throw new Error('canvas.toBlob returned null (canvas too large, or the encode was refused)');
  if (!dl) return { w: cv.width, h: cv.height, bytes: blob.size };
  download(blob, fname(S, per, 'png'));
  return undefined;
}

/* ── vector twin of exportPNG: same bands, same legend, publication-ready ── */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const MONO = 'IBM Plex Mono,ui-monospace,monospace';
const DISP = 'Oswald,Arial Narrow,sans-serif';

function svgGrad(id: string, scale: (v: number) => string, m: number, neg: boolean): string {
  let stops = '';
  for (let i = 0; i <= 10; i++)
    stops += `<stop offset="${i * 10}%" stop-color="${scale(neg ? -m + 2 * m * i / 10 : m * i / 10)}"/>`;
  return `<linearGradient id="${id}">${stops}</linearGradient>`;
}
const txt = (x: number, y: number, s: string, attrs: string) => `<text x="${x}" y="${y}" ${attrs}>${esc(s)}</text>`;

/* exportPNG shrinks its title until it clears the right-aligned period; the SVG
   twin emitted a fixed font-size="21" and had no equivalent, so at a 732 px map
   (a 1024 px browser window, rail included) "NETO TOKOVI: PRIMORSKO-GORANSKA ↔
   PARTNERI · KUMULATIVNA PROCJENA" ran 73 px straight through "2011.–2024.".
   Same canvas metrics the PNG measures with, so both formats break the same way
   or not at all. */

export function exportSVG(node: SVGSVGElement, S: State, dl = true): string {
  const crop = gridCrop(node);
  const w = crop ? crop.w : node.clientWidth, h = crop ? crop.h : drawnH(node);
  const B = bandLayout(S, w), TOP = B.top, BOT = B.bot;
  const u = uid();
  const clone = bakeMapClone(node, u, h, fontCss(), crop);
  clone.setAttribute('y', String(TOP));
  const per = B.per;
  const leg = legendSpec(S);
  const ly = h + TOP + 18;
  let defs = '', legSvg = '';
  if (leg.kind === 'klas') {
    let lx = 20;
    /* Mono, and measured. exportFonts embeds Mono and Oswald only and states
       why: "the only text that asks for [IBM Plex Sans] is the PNG's canvas
       legend, which is drawn by the page and already has the real face." That
       was not true of this branch — the SVG twin is drawn by whoever opens the
       file, so on a machine without Plex Sans these three labels fell back to a
       substitute while every other string in the same figure came out of an
       embedded face: one figure, two typefaces, in the honesty legend. The
       advance estimate went with it: `t.length * 5.6` is Plex Sans at 10 px
       (~0,55 em), and a wider substitute (DejaVu Sans, ~0,64 em) ran a
       14-character label ~90 px against the 78 px budgeted, into the next
       swatch. 9,5 px mono is what the other legend labels below already use. */
    const mctx = measureCtx();
    if (mctx) mctx.font = `400 9.5px ${MONO_CSS}`;
    for (const k of ['gain', 'neu', 'loss'] as const) {
      const t = KLAB[k] + ' · ' + leg.counts[k];
      legSvg += `<rect x="${lx}" y="${ly}" width="11" height="11" fill="${KCOL[k]}" stroke="rgba(0,0,0,.15)"/>`
        + txt(lx + 16, ly + 9, t, `font-family="${MONO}" font-size="9.5" fill="#20262B"`);
      lx += 16 + (mctx ? mctx.measureText(t).width : t.length * 5.7) + 18;
    }
  } else {
    const neg = leg.kind === 'div';
    defs = svgGrad(u + 'lg', leg.scale ?? (neg ? divScale(leg.m) : seqScale(leg.m, S.dir)), leg.m, neg);
    const lab = (v: number) => (leg.kind === 'div' && leg.rel) ? fmtR.format(v) + ' %' : fmtI.format(Math.round(v));
    legSvg = `<rect x="20" y="${ly}" width="190" height="10" fill="url(#${u}lg)" stroke="#D9DDD6"/>`;
    const la = `font-family="${MONO}" font-size="9.5" fill="#5F6A72"`;
    if (neg) legSvg += txt(20, ly + 22, '−' + lab(leg.m), la)
      + txt(115, ly + 22, '0', la + ' text-anchor="middle"')
      + txt(210, ly + 22, '+' + lab(leg.m), la + ' text-anchor="end"');
    else legSvg += txt(20, ly + 22, '0', la) + txt(210, ly + 22, fmtI.format(leg.m), la + ' text-anchor="end"');
    if (leg.badge) legSvg += txt(222, ly + 9, leg.badge, la);
    legSvg += B.noteLines.map((ln, i) => txt(B.noteX, ly + (B.noteX === 222 ? 22 : 35) + i * 11, ln,
      `font-family="${MONO}" font-size="${CREDIT_FS}" fill="#5F6A72"`)).join('');
  }
  const doc =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + TOP + BOT}" viewBox="0 0 ${w} ${h + TOP + BOT}">`
    + `<defs>${defs}</defs>`
    + `<rect width="${w}" height="${h + TOP + BOT}" fill="#F4F5F2"/>`
    + txt(20, 26, B.eyebrow, `font-family="${MONO}" font-size="${B.eyebrowFs}" font-weight="500" fill="#5F6A72" letter-spacing="1"`)
    + B.titleLines.map((ln, i) => txt(20, 56 + i * TITLE_LH, ln,
      `font-family="${DISP}" font-size="${B.titleFs}" font-weight="600" fill="#20262B"`)).join('')
    + txt(w - 20, 56, per, `font-family="${DISP}" font-size="${TITLE_MAX}" font-weight="600" fill="#20262B" text-anchor="end"`)
    + `<line x1="20" y1="${70 + (B.titleLines.length - 1) * TITLE_LH}" x2="${w - 20}" y2="${70 + (B.titleLines.length - 1) * TITLE_LH}" stroke="#D9DDD6"/>`
    + new XMLSerializer().serializeToString(clone)
    + legSvg
    + B.credits.map((ln, i) => txt(20, h + TOP + BOT - CREDIT_LH * (B.credits.length - i), ln,
      `font-family="${MONO}" font-size="${CREDIT_FS}" fill="#5F6A72"`)).join('')
    + '</svg>';
  if (dl) download(new Blob([doc], { type: 'image/svg+xml;charset=utf-8' }), fname(S, per, 'svg'));
  return doc;
}
