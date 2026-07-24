import {
  ISOS, DOM, RDOM, KCOL, KLAB, Y0, YEND,
  klasOf, divScale, seqScale, flowMax, mxMax, jmapScale, flowBadge, fmtI, fmtR, exportDesc,
} from './metrics.ts';
import type { Klas, State } from './types.ts';

const VARS: Record<string, string> = {
  'var(--ink)': '#20262B', 'var(--acc)': '#0F7D8C', 'var(--line)': '#D9DDD6',
  'var(--mut)': '#5F6A72', 'var(--bg)': '#F4F5F2',
};

export interface ExportInfo { w: number; h: number; bytes: number }

const TOP = 86, BOT = 88;

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
  const badge = flowish ? '· ' + flowBadge(S.yi, S.cum) : '';
  if (flowish && S.dir !== 'net') {
    const m = S.view === 'mx' ? mxMax(S.dir, S.cum) : flowMax(S.sel!, S.dir, S.cum);
    return { kind: 'seq', m, badge };
  }
  const m = S.view === 'reg' ? RDOM[S.flow + S.den + S.cum]
    : S.view === 'mx' ? mxMax('net', S.cum)
    : S.view === 'flow' ? flowMax(S.sel!, 'net', S.cum) : DOM[S.flow + S.den + S.cum];
  return { kind: 'div', m, rel: !flowish && S.den !== 'abs', badge };
}

function gradBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  scale: (v: number) => string, m: number, neg: boolean) {
  const gr = ctx.createLinearGradient(x, 0, x + w, 0);
  for (let i = 0; i <= 10; i++) gr.addColorStop(i / 10, scale(neg ? -m + 2 * m * i / 10 : m * i / 10));
  ctx.fillStyle = gr; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#D9DDD6'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

const SRC_LINE = 'Izvori: DZS 7.4.1.–7.4.3., STAN-2026-2-1 · tokovi 2018.: Pitoski i sur. 2021. (CC BY) · ostale godine: IPF procjena · granice: geoBoundaries/OSM';

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
  ctx.fillText(SRC_LINE, 20, h + TOP + BOT - 14);
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
  }
  const doc =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + TOP + BOT}" viewBox="0 0 ${w} ${h + TOP + BOT}">`
    + `<defs>${defs}</defs>`
    + `<rect width="${w}" height="${h + TOP + BOT}" fill="#F4F5F2"/>`
    + txt(20, 26, `MIGRACIJSKI ATLAS ŽUPANIJA · DZS · ${Y0}.–${YEND}.`, `font-family="${MONO}" font-size="10" font-weight="500" fill="#5F6A72" letter-spacing="1"`)
    + txt(20, 56, dsc.toUpperCase(), `font-family="${DISP}" font-size="21" font-weight="600" fill="#20262B"`)
    + txt(w - 20, 56, per, `font-family="${DISP}" font-size="21" font-weight="600" fill="#20262B" text-anchor="end"`)
    + `<line x1="20" y1="70" x2="${w - 20}" y2="70" stroke="#D9DDD6"/>`
    + new XMLSerializer().serializeToString(clone)
    + legSvg
    + txt(20, h + TOP + BOT - 14, SRC_LINE, `font-family="${MONO}" font-size="8.5" fill="#5F6A72"`)
    + '</svg>';
  if (dl) download(new Blob([doc], { type: 'image/svg+xml;charset=utf-8' }), fname(S, per, 'svg'));
  return doc;
}
