import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  D, ISOS, SHORTN, YEARS, IX2011, REG, REGOF,
  natAt, fsum, klasOf, KCOL, KLAB, flowBadge, fmtI, fmtR, sgn,
} from '../lib/metrics.ts';
import { jlsGeo } from '../lib/geoAsync.ts';

import { setTipNode, placeTip, COARSE } from '../lib/tip.ts';
import type { State } from '../lib/types.ts';

/* Measured and estimated used to render as the same neutral pill, so the single
   most load-bearing distinction in the atlas was carried by wording alone.
   Solid = measured, dashed outline = estimate. Text is unchanged. */
function tag(badge: string): string {
  return '<span class="cls-tag ' + (badge === 'izmjereno' ? 'meas' : 'est') + '">' + badge + '</span>';
}

function tipHTML(S: State): string {
  if (S.view === 'jmap' && S.jlsHl != null) {
    const f = jlsGeo()?.features.find(f => f.properties.j === S.jlsHl);
    if (!f) return '';
    const p = f.properties;
    const net = p.i - p.o;
    return '<div class="tip-name">' + p.n + ' · ' + SHORTN[ISOS[p.c]] + '</div><table>' +
      '<tr><td>doselilo iz drugih JLS</td><td>+' + fmtI.format(p.i) + '</td></tr>' +
      '<tr><td>odselilo u druge JLS</td><td>−' + fmtI.format(p.o) + '</td></tr>' +
      '<tr class="tip-net"><td>neto · 2018.</td><td class="' + (net < 0 ? 'neg' : 'pos') + '">' + sgn(net, fmtI) + '</td></tr></table>' +
      tag('izmjereno');
  }
  if (S.view === 'mx' && S.pairHl) {
    const [a, b] = S.pairHl, y = YEARS[S.yi];
    if (a === b) {
      return '<div class="tip-name">' + D[a].n + '</div>' +
        'Selidbe unutar iste županije nisu dio međužupanijske matrice.' +
        '<div class="tip-hint">dijagonala · bez vrijednosti</div>';
    }
    const ab = fsum(a, b, S.yi, S.cum), ba = fsum(b, a, S.yi, S.cum);
    const net = ba - ab;
    const per = S.cum ? '2011.–' + y + '.' : y + '.';
    return '<div class="tip-name">' + D[a].n + ' ↔ ' + D[b].n + '</div><table>' +
      '<tr><td>' + D[a].n + ' → ' + D[b].n + '</td><td>' + fmtI.format(ab) + '</td></tr>' +
      '<tr><td>' + D[b].n + ' → ' + D[a].n + '</td><td>' + fmtI.format(ba) + '</td></tr>' +
      '<tr class="tip-net"><td>neto (' + D[a].n + ') · ' + per + '</td><td class="' + (net < 0 ? 'neg' : 'pos') + '">' + sgn(net, fmtI) + '</td></tr></table>' +
      tag(S.cum ? 'kumulativna procjena' : flowBadge(S.yi, S.cum));
  }
  /* Godine hovers a cell whose year is generally NOT the selected one, so its
     readout has to be computed for that cell's year — `countyBlock` below takes
     the year explicitly for exactly this reason. */
  if (S.view === 'yrs') return S.yrHl ? countyBlock(S, S.yrHl[0], S.yrHl[1]) : '';
  const iso = S.hl!, c = D[iso], y = YEARS[S.yi];
  if (S.view === 'flow') {
    if (iso === S.sel) return '<div class="tip-name">' + c.n + '</div>odabrana županija — klik na drugu za promjenu';
    const o = fsum(S.sel!, iso, S.yi, S.cum), i2 = fsum(iso, S.sel!, S.yi, S.cum), net = i2 - o;
    const per = S.cum ? '2011.–' + y + '.' : y + '.';
    return '<div class="tip-name">' + c.n + '</div><table>' +
      '<tr><td>' + D[S.sel!].n + ' → ' + c.n + '</td><td>' + fmtI.format(o) + '</td></tr>' +
      '<tr><td>' + c.n + ' → ' + D[S.sel!].n + '</td><td>' + fmtI.format(i2) + '</td></tr>' +
      '<tr class="tip-net"><td>neto (' + D[S.sel!].n + ') · ' + per + '</td><td class="' + (net < 0 ? 'neg' : 'pos') + '">' + sgn(net, fmtI) + '</td></tr></table>' +
      tag(S.cum ? 'kumulativna procjena' : flowBadge(S.yi, S.cum));
  }
  return countyBlock(S, iso, S.yi);
}

/* The county decomposition for an explicit (county, year). It used to read
   S.hl/S.yi directly, which is the same thing everywhere except Godine, where
   the hovered cell carries its own year — printing S.yi's numbers under that
   cell's county would have been the tooltip lying about which column it is on,
   the exact failure the matrix's `a → b` labels were fixed for. */
function countyBlock(S: State, iso: string, yi: number): string {
  const c = D[iso], y = YEARS[yi];
  const cum = S.cum || S.view === 'klas';
  let ii = 0, oi = 0, ie = 0, oe = 0;
  if (cum) { for (let i = IX2011; i <= Math.max(yi, IX2011); i++) { ii += c.ii[i]; oi += c.oi[i]; ie += c.ie[i]; oe += c.oe[i]; } }
  else { ii = c.ii[yi]; oi = c.oi[yi]; ie = c.ie[yi]; oe = c.oe[yi]; }
  const vi = ii - oi, ve = ie - oe, vt = vi + ve, rt = vt / c.p * 100;
  let nt = 0; if (cum) { for (let i = IX2011; i <= Math.max(yi, IX2011); i++) nt += natAt(iso, i); } else nt = natAt(iso, yi);
  const per = cum ? '2011.–' + y + '.' : y + '.';
  let h = '<div class="tip-name">' + c.n + (S.view === 'reg' ? ' · ' + REG[REGOF[iso]].name : '') + '</div><table>' +
    '<tr><td>doseljeni iz žup.</td><td>+' + fmtI.format(ii) + '</td></tr>' +
    '<tr><td>odseljeni u žup.</td><td>−' + fmtI.format(oi) + '</td></tr>' +
    '<tr><td>doseljeni iz inoz.</td><td>+' + fmtI.format(ie) + '</td></tr>' +
    '<tr><td>odseljeni u inoz.</td><td>−' + fmtI.format(oe) + '</td></tr>' +
    '<tr class="tip-net"><td>saldo unutarnje</td><td class="' + (vi < 0 ? 'neg' : 'pos') + '">' + sgn(vi, fmtI) + '</td></tr>' +
    '<tr class="tip-net" style="font-weight:400"><td>saldo vanjske</td><td class="' + (ve < 0 ? 'neg' : 'pos') + '">' + sgn(ve, fmtI) + '</td></tr>' +
    '<tr class="tip-net"><td>migracije · ' + per + '</td><td class="' + (vt < 0 ? 'neg' : 'pos') + '">' + sgn(vt, fmtI) + ' (' + sgn(rt, fmtR) + ' % pop. 2011.)</td></tr>' +
    '<tr class="tip-net" style="font-weight:400"><td>prirodni prirast</td><td class="' + (nt < 0 ? 'neg' : 'pos') + '">' + sgn(nt, fmtI) + '</td></tr>' +
    /* not "ukupna promjena": this is the identity sum of two published
       components, not DZS total population change */
    '<tr class="tip-net"><td>mig. + prirodno</td><td class="' + ((vt + nt) < 0 ? 'neg' : 'pos') + '">' + sgn(vt + nt, fmtI) + '</td></tr></table>' +
    (S.flow === 'all' ? '<div class="tip-hint">zbroj dviju objavljenih sastavnica — nije ukupna promjena broja stanovnika</div>' : '');
  if (S.view === 'klas') {
    const k = klasOf(iso, yi, S.thr, S.thrRel, S.thrPct);
    h += '<span class="cls-tag" style="color:' + (k === 'neu' ? '#20262B' : '#fff') + ';background:' + KCOL[k] + '">' + KLAB[k] + '</span>';
  }
  return h;
}

/* Touch fires pointerenter on tap but never pointerleave ("sticky hover"), so a
   cursor-following tip would sit on screen until something else cleared it. On
   coarse pointers the county tip is therefore dropped entirely — the detail card
   carries the same numbers and, on mobile, opens above the map. The matrix and
   JLS tips stay: there they are the only value readout, and App's pointerdown
   handler dismisses them on the next tap away. */
export default function Tooltip({ S }: { S: State }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setTipNode(ref.current); return () => setTipNode(null); }, []);
  /* `hl` is a county highlight and the county tip is the only thing that reads it,
     so the test has to name the views that draw counties. Left view-agnostic, a
     county focused in Saldo carried its saldo tooltip — doseljeni iz inoz. and all
     — straight onto the 556-municipality JLS map when the view changed. (App also
     clears the highlight on a view change now; both halves are cheap.) */
  /* Godine is excluded from the county branch on purpose: `hl` is set there by a
     rail row, which names a county for a whole *column* — the grid's own readout
     is the cell, and that is what `yrHl` carries. */
  const county = !!S.hl && !COARSE && S.view !== 'mx' && S.view !== 'jmap' && S.view !== 'yrs';
  const show = county || (S.view === 'mx' && !!S.pairHl) || (S.view === 'yrs' && !!S.yrHl)
    || (S.view === 'jmap' && S.jlsHl != null);
  /* the .show class lands this render — position now, before the browser paints.
     Content also changes with the pointer standing still (autoplay, arrow-key
     scrubbing, focus moves), and the edge clamp lives in moveTip — so re-place
     on the inputs that rewrite the markup, not only when visibility flips. */
  useLayoutEffect(() => { if (show) placeTip(); },
    [show, S.yi, S.hl, S.pairHl, S.yrHl, S.jlsHl, S.cum, S.dir, S.flow, S.den, S.view]);
  return (
    /* aria-hidden: the same numbers now live in each feature's own aria-label
       (metrics.countyAria / the .jl labels), so exposing this cursor-follower
       too would read every value twice and anchor it to nothing */
    <div className={'tip' + (show ? ' show' : '')} id="tip" ref={ref} aria-hidden="true"
      dangerouslySetInnerHTML={show ? { __html: tipHTML(S) } : undefined} />
  );
}
