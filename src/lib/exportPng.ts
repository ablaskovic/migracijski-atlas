import {
  ISOS, DOM, RDOM, KCOL, KLAB, Y0, YEND,
  klasOf, divScale, seqScale, flowMax, mxMax, jmapScale, flowBadge, fmtI, fmtR, exportDesc,
} from './metrics.ts';
import { paperCaveatLine, paperExportLine } from './credits.ts';
import { exportLicenceLine } from './licences.ts';
import { L, t, yrSpan } from './i18n.ts';
import type { Klas, State } from './types.ts';

const VARS: Record<string, string> = {
  'var(--ink)': '#20262B', 'var(--acc)': '#0F7D8C', 'var(--line)': '#D9DDD6',
  'var(--mut)': '#5F6A72', 'var(--bg)': '#F4F5F2',
};

export interface ExportInfo { w: number; h: number; bytes: number }

/* clone the live map SVG and bake class/CSS-var-provided presentation into
   attributes so the standalone document renders identically */
function bakeMapClone(node: SVGSVGElement): SVGSVGElement {
  const clone = node.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(node.clientWidth));
  clone.setAttribute('height', String(node.clientHeight));
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
  return clone;
}

function fname(S: State, per: string, ext: string): string {
  /* jmap too, not only flow: the three directions produced three different
     figures that landed on disk under one name and overwrote each other */
  return ('migracijski-atlas_' + S.view + (S.view === 'flow' || S.view === 'jmap' ? '_' + S.dir : '') + '_' + per)
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
  if (S.view === 'jmap') {
    return L('Samo preseljenja unutar RH (JLS↔JLS), bez inozemstva.',
      'Internal moves within Croatia only (LAU↔LAU), no international migration.');
  }
  if ((S.view === 'flow' || S.view === 'mx') && S.dir === 'net') return t('note.pairEst');
  /* Godine is the only view that renders 1998–2006 beside the rest, so it is the
     only one whose *image* can carry those columns off into a slide — the hatch
     that marks them on screen has no caption of its own, so the words go here. */
  if (S.view === 'yrs' && !S.cum) {
    return L('Šrafirano do 2007.: prije toga se međužupanijske margine ne zatvaraju.',
      'Hatched before 2007: the inter-county margins do not close before then.')
      + (S.flow === 'all' ? ' ' + all : '');
  }
  if (S.view !== 'klas' && S.flow === 'all') return all;
  return '';
}

/* ── measured band layout, shared by both formats ───────────────────────────
   Reported by a user, and both halves are the same defect: text was drawn
   without ever being fitted to the canvas.
   1. The title shrank towards a floor and then drew anyway. At a narrow map the
      floor is not enough, so "NETO TOKOVI: SISAČKO-MOSLAVAČKA ↔ PARTNERI ·
      KUMULATIVNA PROCJENA" ran straight through the right-aligned period.
      Truncating is not the fix: the tail of that string is the honesty badge,
      and dropping it would be an unbadged estimate (CLAUDE.md §3). It wraps.
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
const caveatLine = (S: State): string =>
  S.view === 'klas' || S.view === 'reg' ? paperCaveatLine() : '';

export async function exportPNG(node: SVGSVGElement, S: State, dl = true): Promise<ExportInfo | undefined> {
  const w = node.clientWidth, h = node.clientHeight;
  const B = bandLayout(S, w), TOP = B.top, BOT = B.bot;
  const clone = bakeMapClone(node);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const SC = 2;
  const cv = document.createElement('canvas');
  cv.width = w * SC; cv.height = (h + TOP + BOT) * SC;
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
  URL.revokeObjectURL(url);
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
  if (!dl) {
    const b = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/png'));
    return { w: cv.width, h: cv.height, bytes: b ? b.size : 0 };
  }
  cv.toBlob(b => { if (b) download(b, fname(S, per, 'png')); }, 'image/png');
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
  const w = node.clientWidth, h = node.clientHeight;
  const B = bandLayout(S, w), TOP = B.top, BOT = B.bot;
  const clone = bakeMapClone(node);
  clone.setAttribute('y', String(TOP));
  const per = B.per;
  const leg = legendSpec(S);
  const ly = h + TOP + 18;
  let defs = '', legSvg = '';
  if (leg.kind === 'klas') {
    let lx = 20;
    for (const k of ['gain', 'neu', 'loss'] as const) {
      const t = KLAB[k] + ' · ' + leg.counts[k];
      legSvg += `<rect x="${lx}" y="${ly}" width="11" height="11" fill="${KCOL[k]}" stroke="rgba(0,0,0,.15)"/>`
        + txt(lx + 16, ly + 9, t, `font-family="IBM Plex Sans,system-ui,sans-serif" font-size="10" fill="#20262B"`);
      lx += 16 + t.length * 5.6 + 18;
    }
  } else {
    const neg = leg.kind === 'div';
    defs = svgGrad('lg', leg.scale ?? (neg ? divScale(leg.m) : seqScale(leg.m, S.dir)), leg.m, neg);
    const lab = (v: number) => (leg.kind === 'div' && leg.rel) ? fmtR.format(v) + ' %' : fmtI.format(Math.round(v));
    legSvg = `<rect x="20" y="${ly}" width="190" height="10" fill="url(#lg)" stroke="#D9DDD6"/>`;
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
