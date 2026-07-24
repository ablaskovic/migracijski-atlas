import {
  ISOS, DOM, RDOM, KCOL, KLAB, Y0, YEND,
  klasOf, divScale, seqScale, flowMax, flowBadge, fmtI, fmtR, exportDesc,
} from './metrics.ts';
import type { Klas, State } from './types.ts';

const VARS: Record<string, string> = {
  'var(--ink)': '#20262B', 'var(--acc)': '#0F7D8C', 'var(--line)': '#D9DDD6',
  'var(--mut)': '#5F6A72', 'var(--bg)': '#F4F5F2',
};

export interface ExportInfo { w: number; h: number; bytes: number }

function gradBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  scale: (v: number) => string, m: number, neg: boolean) {
  const gr = ctx.createLinearGradient(x, 0, x + w, 0);
  for (let i = 0; i <= 10; i++) gr.addColorStop(i / 10, scale(neg ? -m + 2 * m * i / 10 : m * i / 10));
  ctx.fillStyle = gr; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#D9DDD6'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

export async function exportPNG(node: SVGSVGElement, S: State, dl = true): Promise<ExportInfo | undefined> {
  const w = node.clientWidth, h = node.clientHeight;
  const clone = node.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h));
  clone.querySelectorAll('.cnt').forEach(p => {
    p.setAttribute('stroke', p.classList.contains('sel') ? '#0F7D8C' : '#fff');
    p.setAttribute('stroke-width', p.classList.contains('sel') ? '2.2' : '0.8');
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
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const TOP = 86, BOT = 88, SC = 2;
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
  ctx.font = '400 10px "IBM Plex Sans",system-ui,sans-serif';
  if (S.view === 'klas') {
    let lx = 20; const counts: Record<Klas, number> = { gain: 0, neu: 0, loss: 0 };
    ISOS.forEach(i => counts[klasOf(i, S.yi, S.thr)]++);
    for (const k of ['gain', 'neu', 'loss'] as const) {
      ctx.fillStyle = KCOL[k]; ctx.fillRect(lx, ly, 11, 11);
      ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.strokeRect(lx + 0.5, ly + 0.5, 10, 10);
      ctx.fillStyle = '#20262B'; const t = KLAB[k] + ' · ' + counts[k]; ctx.fillText(t, lx + 16, ly + 9);
      lx += 16 + ctx.measureText(t).width + 18;
    }
  } else if (S.view === 'flow' && S.dir !== 'net') {
    const m = flowMax(S.sel!, S.dir, S.cum);
    gradBar(ctx, 20, ly, 190, 10, seqScale(m, S.dir), m, false);
    ctx.fillStyle = '#5F6A72'; ctx.font = '400 9.5px "IBM Plex Mono",monospace';
    ctx.fillText('0', 20, ly + 22); ctx.textAlign = 'right'; ctx.fillText(fmtI.format(m), 210, ly + 22); ctx.textAlign = 'left';
    ctx.fillText('· ' + flowBadge(S.yi, S.cum), 222, ly + 9);
  } else {
    const m = S.view === 'reg' ? RDOM[S.flow + S.den + S.cum]
      : S.view === 'flow' ? flowMax(S.sel!, 'net', S.cum) : DOM[S.flow + S.den + S.cum];
    gradBar(ctx, 20, ly, 190, 10, divScale(m), m, true);
    const rel = S.view !== 'flow' && S.den !== 'abs';
    const lab = (v: number) => rel ? fmtR.format(v) + ' %' : fmtI.format(Math.round(v));
    ctx.fillStyle = '#5F6A72'; ctx.font = '400 9.5px "IBM Plex Mono",monospace';
    ctx.fillText('−' + lab(m), 20, ly + 22);
    ctx.textAlign = 'center'; ctx.fillText('0', 115, ly + 22);
    ctx.textAlign = 'right'; ctx.fillText('+' + lab(m), 210, ly + 22); ctx.textAlign = 'left';
    if (S.view === 'flow') ctx.fillText('· ' + flowBadge(S.yi, S.cum), 222, ly + 9);
  }
  ctx.fillStyle = '#5F6A72'; ctx.font = '400 8.5px "IBM Plex Mono",ui-monospace,monospace';
  ctx.fillText('Izvori: DZS 7.4.1.–7.4.3. · tokovi 2018.: Pitoski i sur. 2021. (CC BY) · ostale godine: IPF procjena · granice: geoBoundaries/OSM', 20, h + TOP + BOT - 14);
  if (!dl) {
    const b = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/png'));
    return { w: cv.width, h: cv.height, bytes: b ? b.size : 0 };
  }
  cv.toBlob(b => {
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = ('migracijski-atlas_' + S.view + (S.view === 'flow' ? '_' + S.dir : '') + '_' + per)
      .replace(/[–.]/g, '-').replace(/-+/g, '-').replace(/-$/, '') + '.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
  return undefined;
}
