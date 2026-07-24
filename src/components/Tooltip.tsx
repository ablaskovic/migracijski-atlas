import { useEffect, useRef } from 'react';
import {
  D, YEARS, IX2011, REG, REGOF,
  natAt, fsum, klasOf, KCOL, KLAB, flowBadge, fmtI, fmtR, sgn,
} from '../lib/metrics.ts';

import { setTipNode } from '../lib/tip.ts';
import type { State } from '../lib/types.ts';

function tipHTML(S: State): string {
  const iso = S.hl!, c = D[iso], y = YEARS[S.yi];
  if (S.view === 'flow') {
    if (iso === S.sel) return '<div class="tip-name">' + c.n + '</div>odabrana županija — klik na drugu za promjenu';
    const o = fsum(S.sel!, iso, S.yi, S.cum), i2 = fsum(iso, S.sel!, S.yi, S.cum), net = i2 - o;
    const per = S.cum ? '2011.–' + y + '.' : y + '.';
    return '<div class="tip-name">' + c.n + '</div><table>' +
      '<tr><td>' + D[S.sel!].n + ' → ' + c.n + '</td><td>' + fmtI.format(o) + '</td></tr>' +
      '<tr><td>' + c.n + ' → ' + D[S.sel!].n + '</td><td>' + fmtI.format(i2) + '</td></tr>' +
      '<tr class="tip-net"><td>neto (' + D[S.sel!].n + ') · ' + per + '</td><td class="' + (net < 0 ? 'neg' : 'pos') + '">' + sgn(net, fmtI) + '</td></tr></table>' +
      '<span class="cls-tag" style="color:#20262B;background:#E4E7E0">' + flowBadge(S.yi, S.cum) + '</span>';
  }
  const cum = S.cum || S.view === 'klas';
  let ii = 0, oi = 0, ie = 0, oe = 0;
  if (cum) { for (let i = IX2011; i <= Math.max(S.yi, IX2011); i++) { ii += c.ii[i]; oi += c.oi[i]; ie += c.ie[i]; oe += c.oe[i]; } }
  else { ii = c.ii[S.yi]; oi = c.oi[S.yi]; ie = c.ie[S.yi]; oe = c.oe[S.yi]; }
  const vi = ii - oi, ve = ie - oe, vt = vi + ve, rt = vt / c.p * 100;
  let nt = 0; if (cum) { for (let i = IX2011; i <= Math.max(S.yi, IX2011); i++) nt += natAt(iso, i); } else nt = natAt(iso, S.yi);
  const per = cum ? '2011.–' + y + '.' : y + '.';
  let h = '<div class="tip-name">' + c.n + (S.view === 'reg' ? ' · ' + REG[REGOF[iso]].name : '') + '</div><table>' +
    '<tr><td>doseljeni iz žup.</td><td>+' + fmtI.format(ii) + '</td></tr>' +
    '<tr><td>odseljeni u žup.</td><td>−' + fmtI.format(oi) + '</td></tr>' +
    '<tr><td>doseljeni iz inoz.</td><td>+' + fmtI.format(ie) + '</td></tr>' +
    '<tr><td>odseljeni u inoz.</td><td>−' + fmtI.format(oe) + '</td></tr>' +
    '<tr class="tip-net"><td>saldo unutarnje</td><td class="' + (vi < 0 ? 'neg' : 'pos') + '">' + sgn(vi, fmtI) + '</td></tr>' +
    '<tr class="tip-net" style="font-weight:400"><td>saldo vanjske</td><td class="' + (ve < 0 ? 'neg' : 'pos') + '">' + sgn(ve, fmtI) + '</td></tr>' +
    '<tr class="tip-net"><td>migracije · ' + per + '</td><td class="' + (vt < 0 ? 'neg' : 'pos') + '">' + sgn(vt, fmtI) + ' (' + sgn(rt, fmtR) + ' %)</td></tr>' +
    '<tr class="tip-net" style="font-weight:400"><td>prirodni prirast</td><td class="' + (nt < 0 ? 'neg' : 'pos') + '">' + sgn(nt, fmtI) + '</td></tr>' +
    '<tr class="tip-net"><td>ukupna promjena</td><td class="' + ((vt + nt) < 0 ? 'neg' : 'pos') + '">' + sgn(vt + nt, fmtI) + '</td></tr></table>';
  if (S.view === 'klas') {
    const k = klasOf(iso, S.yi, S.thr);
    h += '<span class="cls-tag" style="color:' + (k === 'neu' ? '#20262B' : '#fff') + ';background:' + KCOL[k] + '">' + KLAB[k] + '</span>';
  }
  return h;
}

export default function Tooltip({ S }: { S: State }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setTipNode(ref.current); return () => setTipNode(null); }, []);
  const show = !!S.hl;
  return (
    <div className={'tip' + (show ? ' show' : '')} id="tip" ref={ref}
      dangerouslySetInnerHTML={show ? { __html: tipHTML(S) } : undefined} />
  );
}
