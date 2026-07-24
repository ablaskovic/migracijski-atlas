import {
  ISOS, D, YEARS, DOM, RDOM, FLOWN, KCOL, KLAB,
  klasOf, divScale, seqScale, flowMax, fmtI, fmtR,
} from '../lib/metrics.ts';
import type { CSSProperties } from 'react';
import type { Klas, State } from '../lib/types.ts';

function gradStyle(scale: (v: number) => string, m: number, neg: boolean): CSSProperties {
  const stops = [];
  for (let i = 0; i <= 10; i++) stops.push(scale(neg ? -m + 2 * m * i / 10 : m * i / 10) + ' ' + i * 10 + '%');
  return { background: 'linear-gradient(90deg,' + stops.join(',') + ')' };
}
function GradBar({ scale, m, rel }: { scale: (v: number) => string; m: number; rel: boolean }) {
  const lab = rel ? (v: number) => fmtR.format(v) + ' %' : (v: number) => fmtI.format(Math.round(v));
  return (
    <>
      <div className="legend-bar" style={gradStyle(scale, m, true)} />
      <div className="legend-lbls"><span>{'−' + lab(m)}</span><span>0</span><span>{'+' + lab(m)}</span></div>
    </>
  );
}

export default function Legend({ S }: { S: State }) {
  const rel = S.den !== 'abs';
  const flowName = FLOWN[S.flow];
  const denName = S.den === 'rel11' ? ' · % popisa 2011.' : S.den === 'relest' ? ' · % procjene sredinom god.' : '';
  const per = S.cum ? '2011.–' + YEARS[S.yi] + '.' : YEARS[S.yi] + '.';

  if (S.view === 'klas') {
    const counts: Record<Klas, number> = { gain: 0, neu: 0, loss: 0 };
    ISOS.forEach(iso => counts[klasOf(iso, S.yi, S.thr)]++);
    return (
      <div className="legend" id="legend">
        <div className="legend-title">Klasifikacija iz rada · prag {fmtI.format(S.thr)}</div>
        <div className="legend-cats">
          {(['gain', 'neu', 'loss'] as const).map(k => (
            <div className="legend-cat" key={k}>
              <span className="legend-sw" style={{ background: KCOL[k] }} />{KLAB[k]} · {counts[k]}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (S.view === 'reg') {
    const m = RDOM[S.flow + S.den + S.cum];
    return (
      <div className="legend" id="legend">
        <div className="legend-title">Regije (5) · {flowName}{denName}</div>
        <GradBar scale={divScale(m)} m={m} rel={rel} />
        <div className="legend-note">Pripadnost prema prijedlogu iz rada; Ličko-senjska pridružena Sjevernom Jadranu (u radu neodređeno).</div>
      </div>
    );
  }
  if (S.view === 'flow') {
    const m = flowMax(S.sel!, S.dir, S.cum);
    const src = (S.yi === YEARS.indexOf(2018) && !S.cum)
      ? 'Izmjereno — DZS 2018., posebna obrada (Pitoski i sur. 2021, CC BY).'
      : 'Procjena (IPF): struktura 2018. skalirana na DZS margine razdoblja.' + (S.dir === 'net' ? ' Neto parova je strukturna procjena.' : '');
    if (S.dir === 'net') {
      return (
        <div className="legend" id="legend">
          <div className="legend-title">Neto tokovi: {D[S.sel!]?.n || ''} ↔ partneri · {per}</div>
          <GradBar scale={divScale(m)} m={m} rel={false} />
          <div className="legend-note">Plavo: odabrana županija dobiva od partnera. {src}</div>
        </div>
      );
    }
    const sq = seqScale(m, S.dir);
    return (
      <div className="legend" id="legend">
        <div className="legend-title">
          {S.dir === 'out' ? (D[S.sel!]?.n || '') + ' → ostale županije' : 'ostale županije → ' + (D[S.sel!]?.n || '')} · {per}
        </div>
        <div className="legend-bar" style={gradStyle(sq, m, false)} />
        <div className="legend-lbls"><span>0</span><span>{fmtI.format(m)}</span></div>
        <div className="legend-note">Debljina luka ∝ broju osoba. {src}</div>
      </div>
    );
  }
  const m = DOM[S.flow + S.den + S.cum];
  return (
    <div className="legend" id="legend">
      <div className="legend-title">{flowName}{denName}</div>
      <GradBar scale={divScale(m)} m={m} rel={rel} />
    </div>
  );
}
