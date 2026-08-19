import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  D, ISOS, SHORTN, YEARS, IX2011, REG, REGOF,
  natAt, fsum, klasOf, KCOL, KLAB, badgeText, flowKind, fmtI, fmtR, sgn,
} from '../lib/metrics.ts';
import { jlsGeo } from '../lib/geoAsync.ts';

import { setTipNode, placeTip, COARSE } from '../lib/tip.ts';
import { L, yr as yrOf, yrSpan } from '../lib/i18n.ts';
import type { BadgeKind } from '../lib/metrics.ts';
import type { State } from '../lib/types.ts';

/* Measured and estimated used to render as the same neutral pill, so the single
   most load-bearing distinction in the atlas was carried by wording alone.
   Solid = measured, dashed outline = estimate. Text is unchanged. */
/* Every name below comes from a generated data file, and this markup goes into
   `dangerouslySetInnerHTML`. Nothing user- or URL-controlled reaches it today,
   and both audits confirmed the current data clean — 0 of 556 municipality and
   0 of 21 county names contain < > & " ' — but the data files are regenerated
   from upstream sources by a pipeline, `geo_jls.json` is a 475 KB single line no
   reviewer reads, and "the current values happen to be safe" is not a property,
   it is an observation. Three replaces make it one. */
const esc = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function tag(kind: BadgeKind): string {
  /* takes the honesty *predicate*, not its display copy: comparing a rendered
     badge against a literal is what inverted this encoding in English on two
     other surfaces (see metrics.flowKind). The cumulative estimate carries the
     estimate outline, like every other non-measured value. */
  return '<span class="cls-tag ' + (kind === 'meas' ? 'meas' : 'est') + '">' + badgeText(kind) + '</span>';
}

function tipHTML(S: State): string {
  if (S.view === 'jmap' && S.jlsHl != null) {
    const f = jlsGeo()?.features.find(f => f.properties.j === S.jlsHl);
    if (!f) return '';
    const p = f.properties;
    const net = p.i - p.o;
    return '<div class="tip-name">' + esc(p.n) + ' · ' + esc(SHORTN[ISOS[p.c]]) + '</div><table>' +
      '<tr><td>' + L('doselilo iz drugih JLS', 'moved in from other LAUs') + '</td><td>+' + fmtI.format(p.i) + '</td></tr>' +
      '<tr><td>' + L('odselilo u druge JLS', 'moved out to other LAUs') + '</td><td>−' + fmtI.format(p.o) + '</td></tr>' +
      '<tr class="tip-net"><td>' + L('neto · ', 'net · ') + yrOf(2018) + '</td><td class="' + (net < 0 ? 'neg' : 'pos') + '">' + sgn(net, fmtI) + '</td></tr></table>' +
      tag('meas');
  }
  if (S.view === 'mx' && S.pairHl) {
    const [a, b] = S.pairHl, y = YEARS[S.yi];
    if (a === b) {
      return '<div class="tip-name">' + esc(D[a].n) + '</div>' +
        L('Selidbe unutar iste županije nisu dio međužupanijske matrice.',
          'Moves within the same county are not part of the inter-county matrix.') +
        '<div class="tip-hint">' + L('dijagonala · bez vrijednosti', 'diagonal · no value') + '</div>';
    }
    const ab = fsum(a, b, S.yi, S.cum), ba = fsum(b, a, S.yi, S.cum);
    const net = ba - ab;
    const per = S.cum ? yrSpan(2011, y) : yrOf(y);
    return '<div class="tip-name">' + esc(D[a].n) + ' ↔ ' + esc(D[b].n) + '</div><table>' +
      '<tr><td>' + esc(D[a].n) + ' → ' + esc(D[b].n) + '</td><td>' + fmtI.format(ab) + '</td></tr>' +
      '<tr><td>' + esc(D[b].n) + ' → ' + esc(D[a].n) + '</td><td>' + fmtI.format(ba) + '</td></tr>' +
      '<tr class="tip-net"><td>' + L('neto (', 'net (') + esc(D[a].n) + ') · ' + per + '</td><td class="' + (net < 0 ? 'neg' : 'pos') + '">' + sgn(net, fmtI) + '</td></tr></table>' +
      tag(S.cum ? 'cum' : flowKind(S.yi, S.cum));
  }
  /* Godine hovers a cell whose year is generally NOT the selected one, so its
     readout has to be computed for that cell's year — `countyBlock` below takes
     the year explicitly for exactly this reason. */
  if (S.view === 'yrs') return S.yrHl ? countyBlock(S, S.yrHl[0], S.yrHl[1]) : '';
  const iso = S.hl!, c = D[iso], y = YEARS[S.yi];
  if (S.view === 'flow') {
    if (iso === S.sel) return '<div class="tip-name">' + esc(c.n) + '</div>' + L('odabrana županija — klik na drugu za promjenu', 'selected county — click another to change');
    const o = fsum(S.sel!, iso, S.yi, S.cum), i2 = fsum(iso, S.sel!, S.yi, S.cum), net = i2 - o;
    /* line 44 does this correctly; this one hand-built the Croatian ordinals */
    const per = S.cum ? yrSpan(2011, y) : yrOf(y);
    return '<div class="tip-name">' + esc(c.n) + '</div><table>' +
      '<tr><td>' + esc(D[S.sel!].n) + ' → ' + esc(c.n) + '</td><td>' + fmtI.format(o) + '</td></tr>' +
      '<tr><td>' + esc(c.n) + ' → ' + esc(D[S.sel!].n) + '</td><td>' + fmtI.format(i2) + '</td></tr>' +
      '<tr class="tip-net"><td>' + L('neto (', 'net (') + esc(D[S.sel!].n) + ') · ' + per + '</td><td class="' + (net < 0 ? 'neg' : 'pos') + '">' + sgn(net, fmtI) + '</td></tr></table>' +
      tag(S.cum ? 'cum' : flowKind(S.yi, S.cum));
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
  const per = cum ? yrSpan(2011, y) : yrOf(y);
  let h = '<div class="tip-name">' + esc(c.n) + (S.view === 'reg' ? ' · ' + esc(REG[REGOF[iso]].name) : '') + '</div><table>' +
    '<tr><td>' + L('doseljeni iz žup.', 'in from counties') + '</td><td>+' + fmtI.format(ii) + '</td></tr>' +
    '<tr><td>' + L('odseljeni u žup.', 'out to counties') + '</td><td>−' + fmtI.format(oi) + '</td></tr>' +
    '<tr><td>' + L('doseljeni iz inoz.', 'in from abroad') + '</td><td>+' + fmtI.format(ie) + '</td></tr>' +
    '<tr><td>' + L('odseljeni u inoz.', 'out to abroad') + '</td><td>−' + fmtI.format(oe) + '</td></tr>' +
    '<tr class="tip-net"><td>' + L('saldo unutarnje', 'net internal') + '</td><td class="' + (vi < 0 ? 'neg' : 'pos') + '">' + sgn(vi, fmtI) + '</td></tr>' +
    '<tr class="tip-net" style="font-weight:400"><td>' + L('saldo vanjske', 'net external') + '</td><td class="' + (ve < 0 ? 'neg' : 'pos') + '">' + sgn(ve, fmtI) + '</td></tr>' +
    '<tr class="tip-net"><td>' + L('migracije · ', 'migration · ') + per + '</td><td class="' + (vt < 0 ? 'neg' : 'pos') + '">' + sgn(vt, fmtI) + ' (' + sgn(rt, fmtR) + L(' % pop. 2011.)', ' % of 2011 pop.)') + '</td></tr>' +
    '<tr class="tip-net" style="font-weight:400"><td>' + L('prirodni prirast', 'natural change') + '</td><td class="' + (nt < 0 ? 'neg' : 'pos') + '">' + sgn(nt, fmtI) + '</td></tr>' +
    /* not "ukupna promjena": this is the identity sum of two published
       components, not DZS total population change */
    '<tr class="tip-net"><td>' + L('mig. + prirodno', 'mig. + natural') + '</td><td class="' + ((vt + nt) < 0 ? 'neg' : 'pos') + '">' + sgn(vt + nt, fmtI) + '</td></tr></table>' +
    (S.flow === 'all' ? '<div class="tip-hint">' + L('zbroj dviju objavljenih sastavnica — nije ukupna promjena broja stanovnika',
      'the sum of two published components — not total population change') + '</div>' : '');
  if (S.view === 'klas') {
    const k = klasOf(iso, yi, S.thr, S.thrRel, S.thrPct);
    h += '<span class="cls-tag" style="color:' + (k === 'neu' ? '#20262B' : '#fff') + ';background:' + KCOL[k] + '">' + esc(KLAB[k]) + '</span>';
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
