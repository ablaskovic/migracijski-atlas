import {
  ISOS, DOM, RDOM, KCOL, KLAB, Y0, YEND,
  klasOf, divScale, seqScale, flowMax, mxMax, jmapScale, flowBadge, fmtI, fmtR, exportDesc,
} from './metrics.ts';
import { paperCaveatLine, paperExportLine } from './credits.ts';
import type { Klas, State } from './types.ts';

const VARS: Record<string, string> = {
  'var(--ink)': '#20262B', 'var(--acc)': '#0F7D8C', 'var(--line)': '#D9DDD6',
  'var(--mut)': '#5F6A72', 'var(--bg)': '#F4F5F2',
};

export interface ExportInfo { w: number; h: number; bytes: number }

/* BOT went 88 → 102 when the study's views gained a third credit row. The band
   is laid out from its bottom edge upward at a 14 px rhythm — source credit at
   BOT−14, the study reference at BOT−28, the revision caveat at BOT−42 — and
   the legend's own last row sits 40 px below the map. At BOT = 88 a third row
   would have landed 6 px under the legend; the suite asserts ≥ 12 px of
   clearance, and 12 px is also roughly where 8,5 px mono stops reading as a
   separate block. Non-study views draw two rows into the same taller band, so
   every export keeps one page geometry. */
const TOP = 86, BOT = 102;

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
  return ('migracijski-atlas_' + S.view + (S.view === 'flow' ? '_' + S.dir : '') + '_' + per)
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
    return S.dir === 'net' ? { kind: 'div', m, rel: false, badge: '· izmjereno · √ skala', scale }
      : { kind: 'seq', m, badge: '· izmjereno · √ skala', scale };
  }
  const flowish = S.view === 'flow' || S.view === 'mx';
  /* `flowBadge` never returns the cumulative wording, so a cumulative export
     carried "· procjena (IPF)" in its legend under a title that said
     "KUMULATIVNA PROCJENA" — one image, two different honesty labels. Same
     expression exportDesc uses, so the two halves cannot disagree again. */
  const badge = flowish ? '· ' + (S.cum ? 'kumulativna procjena' : flowBadge(S.yi, S.cum)) : '';
  if (flowish && S.dir !== 'net') {
    const m = S.view === 'mx' ? mxMax(S.dir, S.cum) : flowMax(S.sel!, S.dir, S.cum);
    return { kind: 'seq', m, badge };
  }
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
  if (S.view === 'jmap') return 'Samo preseljenja unutar RH (JLS↔JLS), bez inozemstva.';
  if ((S.view === 'flow' || S.view === 'mx') && S.dir === 'net') return 'Neto parova je strukturna procjena.';
  if (S.view !== 'klas' && S.flow === 'all') return 'Zbroj dviju objavljenih sastavnica — nije ukupna promjena broja stanovnika.';
  return '';
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
const SRC_BASE = 'Izvori: DZS 7.4.1.–7.4.3., STAN-2026-2-1 · tokovi 2018.: Pitoski i sur. 2021. (CC BY) · ostale godine: IPF procjena';
const srcLine = (S: State): string => SRC_BASE + (S.view === 'jmap'
  ? ' · granice JLS: OpenStreetMap suradnici (ODbL)'
  : ' · granice županija: geoBoundaries/OSM (ODbL)');

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
  const clone = bakeMapClone(node);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const SC = 2;
  const cv = document.createElement('canvas');
  cv.width = w * SC; cv.height = (h + TOP + BOT) * SC;
  const ctx = cv.getContext('2d')!; ctx.scale(SC, SC);
  ctx.fillStyle = '#F4F5F2'; ctx.fillRect(0, 0, w, h + TOP + BOT);
  ctx.fillStyle = '#5F6A72'; ctx.font = '500 10px "IBM Plex Mono",ui-monospace,monospace';
  ctx.fillText(`MIGRACIJSKI ATLAS ŽUPANIJA · DZS · ${Y0}.–${YEND}.`, 20, 26);
  const [dsc, per] = exportDesc(S);
  ctx.fillStyle = '#20262B';
  let fs = 23; ctx.font = '600 ' + fs + 'px Oswald,"Arial Narrow",sans-serif';
  const perW = ctx.measureText(per).width;
  while (fs > 13 && ctx.measureText(dsc.toUpperCase()).width > w - perW - 58) {
    fs--; ctx.font = '600 ' + fs + 'px Oswald,"Arial Narrow",sans-serif';
  }
  ctx.fillText(dsc.toUpperCase(), 20, 56);
  ctx.textAlign = 'right'; ctx.font = '600 23px Oswald,"Arial Narrow",sans-serif';
  ctx.fillText(per, w - 20, 56); ctx.textAlign = 'left';
  ctx.strokeStyle = '#D9DDD6'; ctx.beginPath(); ctx.moveTo(20, 70); ctx.lineTo(w - 20, 70); ctx.stroke();
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
  const note = legendNote(S);
  if (note && leg.kind !== 'klas') ctx.fillText(note, 222, ly + 22);
  const pl = paperLine(S), cl = caveatLine(S);
  if (cl) ctx.fillText(cl, 20, h + TOP + BOT - 42);
  if (pl) ctx.fillText(pl, 20, h + TOP + BOT - 28);
  ctx.fillText(srcLine(S), 20, h + TOP + BOT - 14);
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
const DISP_CSS = 'Oswald,"Arial Narrow",sans-serif';
function fitTitle(dsc: string, per: string, w: number, start = 21, min = 12): number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return start;
  ctx.font = '600 ' + start + 'px ' + DISP_CSS;
  const perW = ctx.measureText(per).width;
  let fs = start;
  while (fs > min) {
    ctx.font = '600 ' + fs + 'px ' + DISP_CSS;
    if (ctx.measureText(dsc).width <= w - perW - 58) break;
    fs--;
  }
  return fs;
}

export function exportSVG(node: SVGSVGElement, S: State, dl = true): string {
  const w = node.clientWidth, h = node.clientHeight;
  const clone = bakeMapClone(node);
  clone.setAttribute('y', String(TOP));
  const [dsc, per] = exportDesc(S);
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
    const note = legendNote(S);
    if (note) legSvg += txt(222, ly + 22, note, `font-family="${MONO}" font-size="8.5" fill="#5F6A72"`);
  }
  const tfs = fitTitle(dsc.toUpperCase(), per, w);
  const doc =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + TOP + BOT}" viewBox="0 0 ${w} ${h + TOP + BOT}">`
    + `<defs>${defs}</defs>`
    + `<rect width="${w}" height="${h + TOP + BOT}" fill="#F4F5F2"/>`
    + txt(20, 26, `MIGRACIJSKI ATLAS ŽUPANIJA · DZS · ${Y0}.–${YEND}.`, `font-family="${MONO}" font-size="10" font-weight="500" fill="#5F6A72" letter-spacing="1"`)
    + txt(20, 56, dsc.toUpperCase(), `font-family="${DISP}" font-size="${tfs}" font-weight="600" fill="#20262B"`)
    + txt(w - 20, 56, per, `font-family="${DISP}" font-size="21" font-weight="600" fill="#20262B" text-anchor="end"`)
    + `<line x1="20" y1="70" x2="${w - 20}" y2="70" stroke="#D9DDD6"/>`
    + new XMLSerializer().serializeToString(clone)
    + legSvg
    + (caveatLine(S) ? txt(20, h + TOP + BOT - 42, caveatLine(S), `font-family="${MONO}" font-size="8.5" fill="#5F6A72"`) : '')
    + (paperLine(S) ? txt(20, h + TOP + BOT - 28, paperLine(S), `font-family="${MONO}" font-size="8.5" fill="#5F6A72"`) : '')
    + txt(20, h + TOP + BOT - 14, srcLine(S), `font-family="${MONO}" font-size="8.5" fill="#5F6A72"`)
    + '</svg>';
  if (dl) download(new Blob([doc], { type: 'image/svg+xml;charset=utf-8' }), fname(S, per, 'svg'));
  return doc;
}
