import {
  ISOS, D, YEARS, DOM, RDOM, REGOF, FLOWN, KCOL, KLAB,
  val, regVal, klasOf, divScale, seqScale, flowOf, flowMax, mxCell, mxMax, jlsVal, jmapScale, fmtI, fmtR,
} from '../lib/metrics.ts';
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

export default function Legend({ S }: { S: State }) {
  const rel = S.den !== 'abs';
  const flowName = FLOWN[S.flow];
  /* one wording for one denominator — the control, the legend and the export
     caption used to say this three different ways */
  const denName = S.den === 'rel11' ? ' · % popisa 2011.' : S.den === 'relest' ? ' · % tek. procjene' : '';
  const per = S.cum ? '2011.–' + YEARS[S.yi] + '.' : YEARS[S.yi] + '.';

  if (S.view === 'klas') {
    const counts: Record<Klas, number> = { gain: 0, neu: 0, loss: 0 };
    ISOS.forEach(iso => counts[klasOf(iso, S.yi, S.thr, S.thrRel, S.thrPct)]++);
    const prag = S.thrRel ? fmtR.format(S.thrPct) + ' % popisa 2011.' : fmtI.format(S.thr);
    return (
      <div className="legend" id="legend">
        <div className="legend-title">Klasifikacija iz rada · prag {prag}</div>
        <div className="legend-cats">
          {(['gain', 'neu', 'loss'] as const).map(k => (
            <div className="legend-cat" key={k}>
              <span className="legend-sw" style={{ background: KCOL[k] }} />{KLAB[k]} · {counts[k]}
            </div>
          ))}
        </div>
        {S.thrRel && <div className="legend-note">Prag u % popisa 2011. — rad koristi apsolutni prag, a argumentira relativno.</div>}
      </div>
    );
  }
  if (S.view === 'reg') {
    const m = RDOM[S.flow + S.den + S.cum];
    return (
      <div className="legend" id="legend">
        <div className="legend-title">Regije (5) · {flowName}{denName}</div>
        <GradBar scale={divScale(m)} m={m} rel={rel} mark={markPct(S, m)} />
        <div className="legend-note">Plavo: regija dobiva stanovnike · crveno: gubi ih. Pripadnost prema prijedlogu iz rada; Ličko-senjska pridružena Sjevernom Jadranu (u radu neodređeno).</div>
      </div>
    );
  }
  if (S.view === 'jmap') {
    const { m, scale } = jmapScale(S.dir);
    const mark = markPct(S, m);
    const ttl = { out: 'odlasci iz JLS', in: 'dolasci u JLS', net: 'neto po JLS' }[S.dir];
    return (
      <div className="legend" id="legend">
        <div className="legend-title">Gradovi i općine · {ttl} · 2018.</div>
        {S.dir === 'net'
          ? <GradBar scale={scale} m={m} rel={false} mark={mark} />
          : <SeqBar scale={scale} m={m} mark={mark} />}
        <div className="legend-note">Boja po korijenskoj (√) skali. Samo preseljenja unutar RH (selidbe između JLS, bez inozemstva). Izmjereno — DZS 2018., posebna obrada (Pitoski i sur. 2021, CC BY). Granice: OSM/ODbL.</div>
      </div>
    );
  }
  if (S.view === 'mx') {
    const m = mxMax(S.dir, S.cum);
    const mark = markPct(S, m);
    const src = (S.yi === YEARS.indexOf(2018) && !S.cum)
      ? 'Izmjereno — DZS 2018., posebna obrada (Pitoski i sur. 2021, CC BY).'
      : 'Procjena (IPF): struktura 2018. skalirana na DZS margine.' + (S.dir === 'net' ? ' Neto parova je strukturna procjena.' : '');
    const ttl = { out: 'odlasci (redak → stupac)', in: 'dolasci (stupac → redak)', net: 'neto za redak' }[S.dir];
    return (
      <div className="legend" id="legend">
        <div className="legend-title">Matrica tokova · {ttl} · {per}</div>
        {S.dir === 'net'
          ? <GradBar scale={divScale(m)} m={m} rel={false} mark={mark} />
          : <SeqBar scale={seqScale(m, S.dir)} m={m} mark={mark} />}
        <div className="legend-note">Dijagonala (selidbe unutar županije) nije dio međužupanijske matrice. {src}</div>
      </div>
    );
  }
  if (S.view === 'flow') {
    const m = flowMax(S.sel!, S.dir, S.cum);
    const mark = markPct(S, m);
    const src = (S.yi === YEARS.indexOf(2018) && !S.cum)
      ? 'Izmjereno — DZS 2018., posebna obrada (Pitoski i sur. 2021, CC BY).'
      : 'Procjena (IPF): struktura 2018. skalirana na DZS margine razdoblja.' + (S.dir === 'net' ? ' Neto parova je strukturna procjena.' : '');
    if (S.dir === 'net') {
      return (
        <div className="legend" id="legend">
          <div className="legend-title">Neto tokovi: {D[S.sel!]?.n || ''} ↔ partneri · {per}</div>
          <GradBar scale={divScale(m)} m={m} rel={false} mark={mark} />
          <div className="legend-note">Plavo: odabrana županija dobiva od partnera. Strelica pokazuje smjer selidbe. {src}</div>
        </div>
      );
    }
    const sq = seqScale(m, S.dir);
    return (
      <div className="legend" id="legend">
        <div className="legend-title">
          {S.dir === 'out' ? (D[S.sel!]?.n || '') + ' → ostale županije' : 'ostale županije → ' + (D[S.sel!]?.n || '')} · {per}
        </div>
        <SeqBar scale={sq} m={m} mark={mark} />
        <div className="legend-note">Debljina luka ∝ broju osoba, relativno na odabranu županiju (nije usporediva između županija). Strelica pokazuje smjer selidbe. {src}</div>
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
        Plavo: županija dobiva stanovnike · crveno: gubi ih · 0 = ravnoteža.
        {S.flow === 'all' && ' Zbroj dviju objavljenih sastavnica — nije ukupna promjena broja stanovnika.'}
      </div>
    </div>
  );
}
