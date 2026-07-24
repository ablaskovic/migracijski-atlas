import {
  ISOS, D, REG, YEARS, DOM, RDOM,
  val, regVal, klasOf, KCOL, divScale, seqScale, flowOf, flowMax, fmtI, fmtR, sgn,
} from '../lib/metrics.ts';
import { moveTip } from '../lib/tip.ts';
import type { State } from '../lib/types.ts';

type Row = { iso: string; v: number; reg?: boolean };

function railTitle(S: State): string {
  if (S.view === 'flow') {
    const per = S.cum ? '2011.–' + YEARS[S.yi] + '.' : YEARS[S.yi] + '.';
    return { out: 'odlasci · ', in: 'dolasci · ', net: 'neto · ' }[S.dir] + per;
  }
  const y = YEARS[S.yi];
  if (S.view === 'klas') return 'kumulativno 2011.–' + y + '.';
  return S.cum ? 'kumulativno 2011.–' + y + '.' : 'godina ' + y + '.';
}

export default function Rail({ S, selectCounty, setHL }: {
  S: State; selectCounty: (iso: string) => void; setHL: (iso: string | null) => void;
}) {
  let rows: Row[], m: number, fill: (d: Row) => string, big = false;
  if (S.view === 'reg') {
    rows = Object.keys(REG).map(rk => ({ iso: rk, v: regVal(rk, S.yi, S.flow, S.den, S.cum), reg: true })).sort((a, b) => b.v - a.v);
    m = RDOM[S.flow + S.den + S.cum];
    const col = divScale(m);
    fill = d => col(d.v); big = true;
  } else if (S.view === 'flow') {
    rows = ISOS.filter(p => p !== S.sel).map(p => ({ iso: p, v: flowOf(S.sel!, S.dir, p, S.yi, S.cum) })).sort((a, b) => b.v - a.v);
    m = flowMax(S.sel!, S.dir, S.cum);
    const sq = seqScale(m, S.dir), dv = divScale(m);
    fill = d => S.dir === 'net' ? dv(d.v) : sq(Math.abs(d.v));
  } else {
    rows = ISOS.map(iso => ({ iso, v: S.view === 'klas' ? val(iso, S.yi, 'tot', 'abs', true) : val(iso, S.yi, S.flow, S.den, S.cum) })).sort((a, b) => b.v - a.v);
    m = S.view === 'klas' ? DOM['totabstrue'] : DOM[S.flow + S.den + S.cum];
    const col = divScale(m);
    fill = d => S.view === 'klas' ? KCOL[klasOf(d.iso, S.yi, S.thr)] : col(d.v);
  }
  const isRel = S.view !== 'flow' && S.view !== 'klas' && S.den !== 'abs';
  const fmt = (d: Row) => isRel ? sgn(d.v, fmtR) + ' %' : (S.view === 'flow' && S.dir !== 'net' ? fmtI.format(d.v) : sgn(Math.round(d.v), fmtI));
  const gross = S.view === 'flow' && S.dir !== 'net';

  return (
    <aside className="rail">
      <div className="rail-hd">
        <div className="ctrl-lab" id="railLab">
          {S.view === 'reg' ? 'Regije — prijedlog iz rada' : S.view === 'flow' ? 'Partneri · ' + (D[S.sel!]?.n || '') : 'Poredak županija'}
        </div>
        <div className="rail-year" id="railYear">{railTitle(S)}</div>
      </div>
      <div className="rail-list" id="railList">
        {rows.map(d => (
          <div key={d.iso} className={'rrow' + (big ? ' big' : '') + (!d.reg && d.iso === S.hl ? ' hl' : '')}
            onPointerEnter={() => setHL(d.reg ? null : d.iso)} onPointerLeave={() => setHL(null)}
            onPointerMove={moveTip} onClick={() => { if (!d.reg) selectCounty(d.iso); }}>
            <div className="rname">{d.reg ? REG[d.iso].name : D[d.iso].n}</div>
            <div className="rbar-track">
              <div className="rbar-zero" style={{ display: gross ? 'none' : undefined }} />
              <div className="rbar" style={{
                background: fill(d),
                left: gross ? '0%' : d.v < 0 ? (50 - Math.abs(d.v) / m * 50) + '%' : '50%',
                width: Math.max(0.6, Math.abs(d.v) / m * (gross ? 100 : 50)) + '%',
              }} />
            </div>
            <div className="rval">{fmt(d)}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}
