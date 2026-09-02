import {
  ISOS, D, YEARS, DOM, RDOM, REGOF, FLOWN, KCOL, KLAB, SHORTN, PAPER_KLAS_DIFF, paperKlasComparable,
  val, regVal, klasOf, divScale, seqScale, flowOf, flowMax, mxCell, mxMax, jlsVal, jmapScale, yrsCols, marginFlow, preMargin, preMarginNote, pragText, fmtI, fmtR,
} from '../lib/metrics.ts';
import { PAPER_WINDOW, paperSplit, paperThrLine } from '../lib/credits.ts';
import { L, t, yr, yrSpan } from '../lib/i18n.ts';
import { jlsGeo } from '../lib/geoAsync.ts';
import type { CSSProperties } from 'react';
import type { Klas, State } from '../lib/types.ts';

/* Eleven stops sampled at evenly spaced VALUES, with the renderer interpolating
   between them. That is exact enough for every ramp that is linear in value —
   measured, max ΔE 0,90 across the 21 counties in Saldo and 0,34 in Regije,
   none above 3. The JLS map is the app's only non-linear ramp: jmapScale applies
   a signed √ before the colour scale, and it is steepest exactly where almost
   every one of the 556 municipalities lives (|net| < 250 against m = 3.413), so
   eleven stops under-state the whole middle of the key's own ramp. Measured by
   rebuilding the ramp from the page's own stops: 442 of 556 municipalities
   differ from the key at their own value by ΔE > 3 in dir=net (230 above 5,
   worst 9,7 at Kutina), 514/556 in out and 355/556 in in. Read the way a reader
   reads it — matching a polygon against the bar — Imotski's −79 looks like −256,
   Slavonski Brod's −126 like −304, Dubrovnik's +162 like +345.
   The count is a parameter now and the √ branch asks for 48, which brings the
   worst case under ΔE 1 — the same order as the linear ramps — for about 1,5 KB
   of gradient string. Placing eleven stops at inverse-transformed positions
   would be exact for √ specifically and free, but it hardcodes the transform in
   three emitters that should not know it. */
/* the √ ramp's stop count, shared with the two export emitters through
   legendSpec — a key drawn at one density and an image at another would be two
   different keys for one map */
export const JMAP_STOPS = 48;
function evenStops(m: number, neg: boolean, n: number) {
  return Array.from({ length: n + 1 }, (_, i) => ({ off: i / n, v: neg ? -m + 2 * m * i / n : m * i / n }));
}
function gradStyle(scale: (v: number) => string, m: number, neg: boolean, n = 10,
  sample?: (k: number) => { off: number; v: number }[]): CSSProperties {
  const pts = sample ? sample(n) : evenStops(m, neg, n);
  const stops = pts.map(p => scale(p.v) + ' ' + (p.off * 100).toFixed(3) + '%');
  return { background: 'linear-gradient(90deg,' + stops.join(',') + ')' };
}
/* mark: "you are here" tick for the hovered county's value, in [0,100] % */
function GradBar({ scale, m, rel, mark, stops = 10, sample }: {
  scale: (v: number) => string; m: number; rel: boolean; mark?: number | null; stops?: number;
  sample?: (k: number) => { off: number; v: number }[];
}) {
  const lab = rel ? (v: number) => fmtR.format(v) + ' %' : (v: number) => fmtI.format(Math.round(v));
  return (
    <>
      <div className="legend-bar" style={gradStyle(scale, m, true, stops, sample)}>
        {mark != null && <div className="legend-mark" style={{ left: mark + '%' }} />}
      </div>
      <div className="legend-lbls"><span>{'−' + lab(m)}</span><span>0</span><span>{'+' + lab(m)}</span></div>
    </>
  );
}

/* Sequential twin of GradBar. jmap, mx and flow each inlined this, and each
   evaluated markPct twice — once for the null test, once for the value. In jmap
   that is a linear scan over 556 features per call, per render, per hover. */
function SeqBar({ scale, m, mark, stops = 10, sample }: { scale: (v: number) => string; m: number; mark: number | null;
  stops?: number; sample?: (k: number) => { off: number; v: number }[] }) {
  return (
    <>
      <div className="legend-bar" style={gradStyle(scale, m, false, stops, sample)}>
        {mark != null && <div className="legend-mark" style={{ left: mark + '%' }} />}
      </div>
      <div className="legend-lbls"><span>0</span><span>{fmtI.format(m)}</span></div>
    </>
  );
}

/* hovered value → tick position on the current scale */
function markPct(S: State, m: number): number | null {
  const iso = S.hl;
  const clamp = (p: number) => Math.max(0, Math.min(100, p));
  if (S.view === 'jmap') {
    if (S.jlsHl == null) return null;
    const f = jlsGeo()?.features.find(f => f.properties.j === S.jlsHl);
    if (!f) return null;
    const v = jlsVal(f.properties, S.dir);
    return clamp(S.dir === 'net' ? (v + m) / (2 * m) * 100 : Math.abs(v) / m * 100);
  }
  if (S.view === 'mx') {
    if (!S.pairHl || S.pairHl[0] === S.pairHl[1]) return null;
    const v = mxCell(S.pairHl[0], S.pairHl[1], S.dir, S.yi, S.cum);
    return clamp(S.dir === 'net' ? (v + m) / (2 * m) * 100 : Math.abs(v) / m * 100);
  }
  /* the hovered cell names its own year, which is generally not S.yi — reading
     the county highlight here would mark the scale at a different column's value.
     A rail ROW is not that case: its number is by construction val(iso, S.yi),
     which is the quantity this ramp measures, and Godine's own grid already
     honours S.hl for the row band. So the cell keeps precedence and the row is
     the fallback — without it, focusing “Grad Zagreb +3.980” in the rail lit the
     row and the grid and left the −7.490 / 0 / +7.490 ramp with no tick at all,
     where 76,6 % belonged. */
  if (S.view === 'yrs') {
    if (S.yrHl) return clamp((val(S.yrHl[0], S.yrHl[1], S.flow, S.den, S.cum) + m) / (2 * m) * 100);
    return iso ? clamp((val(iso, S.yi, S.flow, S.den, S.cum) + m) / (2 * m) * 100) : null;
  }
  /* Regije has its own highlight key. The rail's region rows write S.regHl — the
     key MapView paints .rhl from — and never S.hl, so the branch at the foot of
     this function was unreachable from the rail and the tick only ever appeared
     for a pointer over the map itself. Measured on “Zagrebačka regija +55.281”:
     the row lit, both its counties lit, and the −97.365 / 0 / +97.365 ramp got
     nothing, where 78,4 % belonged. S.regHl is already a region key, so it needs
     no REGOF lookup; the county-hover branch below stays as the fallback. */
  if (S.view === 'reg' && S.regHl) {
    return clamp((regVal(S.regHl, S.yi, S.flow, S.den, S.cum) + m) / (2 * m) * 100);
  }
  if (!iso) return null;
  if (S.view === 'flow') {
    if (iso === S.sel) return null;
    const v = flowOf(S.sel!, S.dir, iso, S.yi, S.cum);
    return clamp(S.dir === 'net' ? (v + m) / (2 * m) * 100 : Math.abs(v) / m * 100);
  }
  const v = S.view === 'reg' ? regVal(REGOF[iso], S.yi, S.flow, S.den, S.cum)
    : val(iso, S.yi, S.flow, S.den, S.cum);
  return clamp((v + m) / (2 * m) * 100);
}

/* The klasifikacija legend is the one panel in the app that shows a *result*
   attributed to the study, so it is where the result has to answer for itself.
   Exactly one note, never two: this legend is the tallest in the app and both
   the glossary and the JLS card reserve a fixed lane for it (see index.css), so
   a second line here costs a control over there. The branches are ordered by
   what the reader is looking at — first "these counts differ from the published
   ones", then "this threshold is not the study's". */
/* A function, not a module constant: a constant is evaluated at import time,
   before App's module scope has called setLang, so it froze the study's window
   in Croatian ordinals for every reader. In English the klas legend read "The
   paper publishes 7 / 7 / 7 for 2011.–2024.. On the newer CBS series …" — the
   ordinal dots plus a doubled full stop, on the headline paper-comparison
   surface at its default state. */
const PW = (): string => yrSpan(PAPER_WINDOW.from, PAPER_WINDOW.to);

/* Pre-2007 is the softest data in the file and the app never said so where it
   shows. Measured on atlas_data2.json: the national inter-county margin
   Σ(doseljeni) − Σ(odseljeni) is −550, −519, −464, −489, −490 for 2002–06 and
   exactly 0 from 2007 on, i.e. before 2007 the county rows do not close against
   each other. The scrubber's hatched pre-2011 band is drawn at opacity 0 unless
   the view is cumulative or klas — precisely the modes that exclude these years
   anyway — so in godišnje mode, the only mode where 1998–2006 actually renders
   values, there was no marking at all. */
/* `inter` — does the series on screen even have an inter-county margin? See
   metrics.marginFlow: on `ext` and `nat` this caveat described nothing, and the
   two corridor views, which are drawn from the very matrix that does not close,
   returned before it and carried none. Both halves were wrong in opposite
   directions. */
/* the gate and the sentence come from metrics, so the screen and the exported
   figure cannot disagree about when this caveat applies; only the tail differs,
   because a PNG has no glossary to point at */
const preNote = (S: State, inter: boolean): string =>
  preMargin(S, inter)
    ? ' ' + preMarginNote() + L(' — v. „Kako čitati”.', ' — see “How to read”.') : '';
function klasNote(S: State): string {
  if (paperKlasComparable(S)) {
    if (!PAPER_KLAS_DIFF.length) {
      return L(`Podjela odgovara objavljenoj u radu za ${PW()}`,
        `The split matches the one published in the paper for ${PW()}`);
    }
    const who = PAPER_KLAS_DIFF.map(d => SHORTN[d.iso]).join(', ');
    /* Croatian needs the verb to agree with the count; English does not, so the
       plural branch exists only on the Croatian side. */
    return L(`Rad za ${PW()} objavljuje ${paperSplit()}. Na novijoj DZS seriji drukčije `
      + `${PAPER_KLAS_DIFF.length > 1 ? 'su razvrstane' : 'je razvrstana'}: ${who} — v. „Kako čitati”.`,
    `The paper publishes ${paperSplit()} for ${PW()}. On the newer CBS series `
      + `${PAPER_KLAS_DIFF.length > 1 ? 'these fall' : 'this falls'} differently: ${who} — see “How to read”.`);
  }
  /* signed, like the title above: the threshold is a LOSS of 4.500 and the sign
     is the whole of its meaning. It was signed on one branch and left bare on
     the other, so the same fact read "−4.500" with Prag in osobe and "(4.500,
     …)" the moment it was switched to %.
     Both strings live in credits.ts beside the revision caveat, because the
     EXPORT owes the reader the same sentence and used to print the revision one
     unconditionally — blaming DZS for a difference the reader had made. */
  return paperThrLine(S.thrRel);
}

export default function Legend({ S }: { S: State }) {
  const rel = S.den !== 'abs';
  const flowName = FLOWN[S.flow];
  /* one wording for one denominator — the control, the legend and the export
     caption used to say this three different ways */
  const denName = S.den === 'rel11' ? L(' · % popisa 2011.', ' · % of 2011 census')
    : S.den === 'relest' ? L(' · % tek. procjene', ' · % of current estimate') : '';
  const per = S.cum ? yrSpan(2011, YEARS[S.yi]) : yr(YEARS[S.yi]);

  if (S.view === 'klas') {
    const counts: Record<Klas, number> = { gain: 0, neu: 0, loss: 0 };
    ISOS.forEach(iso => counts[klasOf(iso, S.yi, S.thr, S.thrRel, S.thrPct)]++);
    const prag = pragText(S);
    return (
      <div className="legend" id="legend">
        <div className="legend-title">{L('Klasifikacija iz rada · prag ', 'Classification from the paper · threshold ')}{prag}</div>
        <div className="legend-cats">
          {(['gain', 'neu', 'loss'] as const).map(k => (
            <div className="legend-cat" key={k}>
              <span className="legend-sw" style={{ background: KCOL[k] }} />{KLAB[k]} · {counts[k]}
            </div>
          ))}
        </div>
        <div className="legend-note">{klasNote(S)}</div>
      </div>
    );
  }
  /* Godine shares Saldo's ramp and its exact domain, so the two views are
     colour-comparable by construction — this legend therefore differs from
     Saldo's only in saying what the axes are and what the teal column means. */
  if (S.view === 'yrs') {
    const m = DOM[S.flow + S.den + S.cum];
    const cs = yrsCols(S.cum);
    const span = yrSpan(YEARS[cs[0]], YEARS[cs[cs.length - 1]]);
    return (
      <div className="legend" id="legend">
        <div className="legend-title">{L('Županije × godine · ', 'Counties × years · ')}{flowName}{denName} · {span}</div>
        <GradBar scale={divScale(m)} m={m} rel={rel} mark={markPct(S, m)} />
        <div className="legend-note">
          {L('Redak je županija, stupac godina; redci su poredani po zbroju razdoblja. Tirkizni stupac je odabrana godina — klik na ćeliju je postavlja.',
            'A row is a county, a column a year; rows are ordered by the period total. The teal column is the selected year — clicking a cell sets it.')}
          {S.flow === 'all' && L(' Zbroj dviju objavljenih sastavnica — nije ukupna promjena broja stanovnika.',
            ' The sum of two published components — not total population change.')}
          {!S.cum && marginFlow(S.flow) && L(' Šrafirano do 2007.: prije toga se međužupanijske margine ne zatvaraju — v. „Kako čitati”.',
            ' Hatched before 2007: the inter-county margins do not close before then — see “How to read”.')}
        </div>
      </div>
    );
  }
  if (S.view === 'reg') {
    const m = RDOM[S.flow + S.den + S.cum];
    return (
      <div className="legend" id="legend">
        <div className="legend-title">{L('Regije (5) · ', 'Regions (5) · ')}{flowName}{denName}</div>
        <GradBar scale={divScale(m)} m={m} rel={rel} mark={markPct(S, m)} />
        {/* The note used to say Lika was "u radu neodređeno". Now that the study
            is retrievable that is checkable and not quite true — its nine-region
            passage mentions Lika alongside Zadar — and it also understated the
            scope: the study proposes five regions in prose and prints no county
            list at all, so the whole 21→5 partition is the atlas's reading, not
            one footnote's worth of it. The per-county detail is in the glossary;
            this line has to fit above the map. */}
        <div className="legend-note">{L('Plavo: regija dobiva stanovnike · crveno: gubi ih. Rad predlaže pet regija i njihova središta, ali ne objavljuje popis županija — raspored po županijama je tumačenje atlasa; v. „Kako čitati”.',
          'Blue: the region gains people · red: it loses them. The paper proposes five regions and their centres but publishes no county list — assigning counties to them is the atlas’s reading; see “How to read”.')}{preNote(S, marginFlow(S.flow))}</div>
      </div>
    );
  }
  if (S.view === 'jmap') {
    const { m, scale, sample } = jmapScale(S.dir);
    const mark = markPct(S, m);
    const ttl = {
      out: L('odlasci iz JLS', 'moves out of the LAU'),
      in: L('dolasci u JLS', 'moves into the LAU'),
      net: L('neto po JLS', 'net per LAU'),
    }[S.dir];
    /* No key until the payload it would describe has arrived. jmapMax()'s
       `if (!g) return 1` is a harmless domain for the map — which draws nothing
       anyway — but the legend rendered it as a real axis: "0" and "1" under
       "Gradovi i općine · dolasci u JLS · 2018.", i.e. a published claim that the
       largest municipal inflow measured in 2018 was one person, against true
       maxima of 9.606 in, 6.193 out and ±3.413 net (−1 / 0 / +1 for Neto). On a
       *failed* fetch the module map caches the rejection, so it is not a flash:
       the false key sat permanently beside "Geometrija JLS nije učitana", and
       both exporters read the same scale and would have baked m=1 into a figure.
       The title stays — it names the view, and it is true with or without the
       geometry; the status region below says why the map is empty. */
    const ready = !!jlsGeo();
    return (
      <div className="legend" id="legend">
        <div className="legend-title">{L('Gradovi i općine · ', 'Towns and municipalities · ')}{ttl} · {yr(2018)}</div>
        {/* the √ ramp draws itself: 48 stops, placed where the ramp says — see
            gradStyle and metrics.jmapScale */}
        {!ready ? null : S.dir === 'net'
          ? <GradBar scale={scale} m={m} rel={false} mark={mark} stops={JMAP_STOPS} sample={sample} />
          : <SeqBar scale={scale} m={m} mark={mark} stops={JMAP_STOPS} sample={sample} />}
        <div className="legend-note">{L('Boja po korijenskoj (√) skali. Samo preseljenja unutar RH (selidbe između JLS, bez inozemstva). Izmjereno — DZS 2018., posebna obrada (Pitoski i sur. 2021, CC BY). Granice: OSM/ODbL.',
          'Colour on a square-root (√) scale. Internal moves only (between LAUs within Croatia, no international migration). Measured — CBS 2018, special processing (Pitoski et al. 2021, CC BY). Boundaries: OSM/ODbL.')}</div>
      </div>
    );
  }
  if (S.view === 'mx') {
    const m = mxMax(S.dir, S.cum);
    const mark = markPct(S, m);
    const src = (S.yi === YEARS.indexOf(2018) && !S.cum)
      ? L('Izmjereno — DZS 2018., posebna obrada (Pitoski i sur. 2021, CC BY).',
        'Measured — CBS 2018, special processing (Pitoski et al. 2021, CC BY).')
      : L('Procjena (IPF): struktura 2018. skalirana na DZS odseljene; doseljeni približno.',
        'Estimate (IPF): the 2018 structure scaled to CBS out-margins; in-margins approximate.')
        + (S.dir === 'net' ? ' ' + t('note.pairEst') : '');
    const ttl = {
      out: L('odlasci (redak → stupac)', 'out (row → column)'),
      in: L('dolasci (stupac → redak)', 'in (column → row)'),
      net: L('neto za redak', 'net for the row'),
    }[S.dir];
    return (
      <div className="legend" id="legend">
        <div className="legend-title">{L('Matrica tokova · ', 'Flow matrix · ')}{ttl} · {per}</div>
        {S.dir === 'net'
          ? <GradBar scale={divScale(m)} m={m} rel={false} mark={mark} />
          : <SeqBar scale={seqScale(m, S.dir)} m={m} mark={mark} />}
        <div className="legend-note">{L('Dijagonala (selidbe unutar županije) nije dio međužupanijske matrice. ',
          'The diagonal (moves within a county) is not part of the inter-county matrix. ')}{src}{preNote(S, true)}</div>
      </div>
    );
  }
  if (S.view === 'flow') {
    const m = flowMax(S.sel!, S.dir, S.cum);
    const mark = markPct(S, m);
    const src = (S.yi === YEARS.indexOf(2018) && !S.cum)
      ? L('Izmjereno — DZS 2018., posebna obrada (Pitoski i sur. 2021, CC BY).',
        'Measured — CBS 2018, special processing (Pitoski et al. 2021, CC BY).')
      : L('Procjena (IPF): struktura 2018. skalirana na DZS odseljene razdoblja; doseljeni približno.',
        'Estimate (IPF): the 2018 structure scaled to the period’s CBS out-margins; in-margins approximate.')
        + (S.dir === 'net' ? ' ' + t('note.pairEst') : '');
    if (S.dir === 'net') {
      return (
        <div className="legend" id="legend">
          <div className="legend-title">{L('Neto tokovi: ', 'Net flows: ')}<span lang="hr">{D[S.sel!]?.n || ''}</span>{L(' ↔ partneri · ', ' ↔ partners · ')}{per}</div>
          <GradBar scale={divScale(m)} m={m} rel={false} mark={mark} />
          <div className="legend-note">{L('Plavo: odabrana županija dobiva od partnera. Strelica pokazuje smjer selidbe. ',
            'Blue: the selected county gains from the partner. The arrowhead shows the direction of the move. ')}{src}{preNote(S, true)}</div>
        </div>
      );
    }
    const sq = seqScale(m, S.dir);
    return (
      <div className="legend" id="legend">
        <div className="legend-title">
          {S.dir === 'out'
            ? <><span lang="hr">{D[S.sel!]?.n || ''}</span>{L(' → ostale županije', ' → other counties')}</>
            : <>{L('ostale županije → ', 'other counties → ')}<span lang="hr">{D[S.sel!]?.n || ''}</span></>} · {per}
        </div>
        <SeqBar scale={sq} m={m} mark={mark} />
        {/* "∝" was inherited verbatim from the v4 single-file and is not what the
            encoding does: the width scale is `scaleSqrt`, with a 0,6 px floor, so
            a 4,9× flow ratio draws about 2,2× the width and the top corridor's
            dominance reads at half. The JLS legend has always stated its √ scale;
            this one now says the same thing about itself. */}
        {/* The colour sentence the net twin has always carried, and this one did
            not. These two directions fill from a MAGNITUDE ramp over [0, m], so
            the deepest county is the one with the largest one-way flow — in
            Odlasci the one that received most from the hub, in Dolasci the one
            that lost most to it. Both are the exact inverse of the glossary's
            unconditional "plavo dobiva / crveno gubi", and with no colour
            sentence here the glossary was the reader's only source for two of
            Tokovi's three directions. */}
        <div className="legend-note">{S.dir === 'out'
          ? L('Boja: koliko je ljudi otišlo iz odabrane županije u tu županiju — veličina jednosmjernog toka, a ne saldo obojene županije. ',
            'Colour: how many people left the selected county for that one — the size of the one-way flow, not the coloured county’s own balance. ')
          : L('Boja: koliko je ljudi došlo iz te županije u odabranu — veličina jednosmjernog toka, a ne saldo obojene županije. ',
            'Colour: how many people came from that county to the selected one — the size of the one-way flow, not the coloured county’s own balance. ')}
        {L('Debljina luka po korijenskoj (√) skali, relativno na odabranu županiju (nije usporediva između županija). Strelica pokazuje smjer selidbe. ',
          'Arc width on a square-root (√) scale, relative to the selected county (not comparable between counties). The arrowhead shows the direction of the move. ')}{src}{preNote(S, true)}</div>
      </div>
    );
  }
  const m = DOM[S.flow + S.den + S.cum];
  /* The default landing view carried no key at all: a gradient and three signed
     numbers, with the plain-language reading ("blue means it gains people")
     living only in the flow-net legend most readers never reach. */
  return (
    <div className="legend" id="legend">
      <div className="legend-title">{flowName}{denName}</div>
      <GradBar scale={divScale(m)} m={m} rel={rel} mark={markPct(S, m)} />
      <div className="legend-note">
        {L('Plavo: županija dobiva stanovnike · crveno: gubi ih · 0 = ravnoteža.',
          'Blue: the county gains people · red: it loses them · 0 = balance.')}
        {S.flow === 'all' && L(' Zbroj dviju objavljenih sastavnica — nije ukupna promjena broja stanovnika.',
          ' The sum of two published components — not total population change.')}
        {preNote(S, marginFlow(S.flow))}
      </div>
    </div>
  );
}
