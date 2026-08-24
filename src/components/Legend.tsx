import {
  ISOS, D, YEARS, DOM, RDOM, REGOF, FLOWN, KCOL, KLAB, SHORTN, PAPER_KLAS_DIFF, paperKlasComparable,
  val, regVal, klasOf, divScale, seqScale, flowOf, flowMax, mxCell, mxMax, jlsVal, jmapScale, yrsCols, marginFlow, fmtI, fmtR,
} from '../lib/metrics.ts';
import { PAPER_THR, PAPER_WINDOW } from '../lib/credits.ts';
import { L, t, yr, yrSpan } from '../lib/i18n.ts';
import { jlsGeo } from '../lib/geoAsync.ts';
import type { CSSProperties } from 'react';
import type { Klas, State } from '../lib/types.ts';

function gradStyle(scale: (v: number) => string, m: number, neg: boolean): CSSProperties {
  const stops = [];
  for (let i = 0; i <= 10; i++) stops.push(scale(neg ? -m + 2 * m * i / 10 : m * i / 10) + ' ' + i * 10 + '%');
  return { background: 'linear-gradient(90deg,' + stops.join(',') + ')' };
}
/* mark: "you are here" tick for the hovered county's value, in [0,100] % */
function GradBar({ scale, m, rel, mark }: {
  scale: (v: number) => string; m: number; rel: boolean; mark?: number | null;
}) {
  const lab = rel ? (v: number) => fmtR.format(v) + ' %' : (v: number) => fmtI.format(Math.round(v));
  return (
    <>
      <div className="legend-bar" style={gradStyle(scale, m, true)}>
        {mark != null && <div className="legend-mark" style={{ left: mark + '%' }} />}
      </div>
      <div className="legend-lbls"><span>{'−' + lab(m)}</span><span>0</span><span>{'+' + lab(m)}</span></div>
    </>
  );
}

/* Sequential twin of GradBar. jmap, mx and flow each inlined this, and each
   evaluated markPct twice — once for the null test, once for the value. In jmap
   that is a linear scan over 556 features per call, per render, per hover. */
function SeqBar({ scale, m, mark }: { scale: (v: number) => string; m: number; mark: number | null }) {
  return (
    <>
      <div className="legend-bar" style={gradStyle(scale, m, false)}>
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
     the county highlight here would mark the scale at a different column's value */
  if (S.view === 'yrs') {
    if (!S.yrHl) return null;
    return clamp((val(S.yrHl[0], S.yrHl[1], S.flow, S.den, S.cum) + m) / (2 * m) * 100);
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
const preNote = (S: State, inter: boolean): string =>
  !S.cum && YEARS[S.yi] < 2007 && inter
    ? L(' Prije 2007. međužupanijske margine ne zatvaraju se točno — v. „Kako čitati”.',
      ' Before 2007 the inter-county margins do not close exactly — see “How to read”.') : '';
function klasNote(S: State): string {
  if (paperKlasComparable(S)) {
    if (!PAPER_KLAS_DIFF.length) {
      return L(`Podjela odgovara objavljenoj u radu za ${PW()}`,
        `The split matches the one published in the paper for ${PW()}`);
    }
    const who = PAPER_KLAS_DIFF.map(d => SHORTN[d.iso]).join(', ');
    /* Croatian needs the verb to agree with the count; English does not, so the
       plural branch exists only on the Croatian side. */
    return L(`Rad za ${PW()} objavljuje 7 / 7 / 7. Na novijoj DZS seriji drukčije `
      + `${PAPER_KLAS_DIFF.length > 1 ? 'su razvrstane' : 'je razvrstana'}: ${who} — v. „Kako čitati”.`,
    `The paper publishes 7 / 7 / 7 for ${PW()}. On the newer CBS series `
      + `${PAPER_KLAS_DIFF.length > 1 ? 'these fall' : 'this falls'} differently: ${who} — see “How to read”.`);
  }
  if (S.thrRel) {
    return L(`Prag u % popisa 2011. — rad koristi apsolutni prag (${fmtI.format(PAPER_THR)}, ${PW()}), a argumentira relativno.`,
      `Threshold as % of the 2011 census — the paper uses an absolute threshold (${fmtI.format(PAPER_THR)}, ${PW()}) but argues in relative terms.`);
  }
  return L(`Prag i tri razreda iz rada; rad ih računa za ${PW()} pragom ${fmtI.format(PAPER_THR)}.`,
    `Threshold and the three classes are the paper's; it computes them for ${PW()} at a threshold of ${fmtI.format(PAPER_THR)}.`);
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
    const prag = S.thrRel ? fmtR.format(S.thrPct) + L(' % popisa 2011.', ' % of 2011 census') : fmtI.format(S.thr);
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
    const { m, scale } = jmapScale(S.dir);
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
        {!ready ? null : S.dir === 'net'
          ? <GradBar scale={scale} m={m} rel={false} mark={mark} />
          : <SeqBar scale={scale} m={m} mark={mark} />}
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
          <div className="legend-title">{L('Neto tokovi: ', 'Net flows: ')}{D[S.sel!]?.n || ''}{L(' ↔ partneri · ', ' ↔ partners · ')}{per}</div>
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
          {S.dir === 'out' ? (D[S.sel!]?.n || '') + L(' → ostale županije', ' → other counties')
            : L('ostale županije → ', 'other counties → ') + (D[S.sel!]?.n || '')} · {per}
        </div>
        <SeqBar scale={sq} m={m} mark={mark} />
        {/* "∝" was inherited verbatim from the v4 single-file and is not what the
            encoding does: the width scale is `scaleSqrt`, with a 0,6 px floor, so
            a 4,9× flow ratio draws about 2,2× the width and the top corridor's
            dominance reads at half. The JLS legend has always stated its √ scale;
            this one now says the same thing about itself. */}
        <div className="legend-note">{L('Debljina luka po korijenskoj (√) skali, relativno na odabranu županiju (nije usporediva između županija). Strelica pokazuje smjer selidbe. ',
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
