import {
  ISOS, D, REG, JGEO, YEARS, DOM, RDOM, SHORTN,
  val, regVal, klasOf, KCOL, divScale, seqScale, flowOf, flowMax, mxCell, jlsVal, jmapScale, fmtI, fmtR, sgn,
} from '../lib/metrics.ts';
import { moveTip } from '../lib/tip.ts';
import type { State } from '../lib/types.ts';

type Row = { iso: string; v: number; reg?: boolean; pair?: [string, string]; jls?: number };

function railTitle(S: State): string {
  if (S.view === 'jmap') return { out: 'odlasci', in: 'dolasci', net: 'neto' }[S.dir] + ' · 2018.';
  if (S.view === 'flow' || S.view === 'mx') {
    const per = S.cum ? '2011.–' + YEARS[S.yi] + '.' : YEARS[S.yi] + '.';
    return { out: 'odlasci · ', in: 'dolasci · ', net: 'neto · ' }[S.dir] + per;
  }
  const y = YEARS[S.yi];
  if (S.view === 'klas') return 'kumulativno 2011.–' + y + '.';
  return S.cum ? 'kumulativno 2011.–' + y + '.' : 'godina ' + y + '.';
}

/* top-20 corridors nationally for the matrix view; for net, unordered pairs
   oriented toward the gaining county */
function mxRows(S: State): Row[] {
  const rows: Row[] = [];
  if (S.dir === 'net') {
    for (let i = 0; i < ISOS.length; i++) for (let j = i + 1; j < ISOS.length; j++) {
      const a = ISOS[i], b = ISOS[j];
      const v = mxCell(a, b, 'net', S.yi, S.cum);   /* a's gain from b */
      if (v >= 0) rows.push({ iso: a, v, pair: [b, a] });
      else rows.push({ iso: b, v: -v, pair: [a, b] });
    }
  } else {
    for (const a of ISOS) for (const b of ISOS) {
      if (a === b) continue;
      rows.push({ iso: a, v: mxCell(a, b, 'out', S.yi, S.cum), pair: [a, b] });
    }
  }
  return rows.sort((x, y) => y.v - x.v).slice(0, 20);
}

export default function Rail({ S, selectCounty, setHL, openPair, jumpFlow, setJlsHl }: {
  S: State; selectCounty: (iso: string) => void; setHL: (iso: string | null) => void;
  openPair: (iso: string) => void; jumpFlow: (a: string, b: string) => void;
  setJlsHl: (j: number | null) => void;
}) {
  let rows: Row[], m: number, fill: (d: Row) => string, big = false;
  if (S.view === 'jmap') {
    /* net: 10 biggest gainers + 10 biggest losers; gross: top 20 */
    const all = JGEO.features.map(f => ({ iso: ISOS[f.properties.c], v: jlsVal(f.properties, S.dir), jls: f.properties.j }))
      .sort((a, b) => b.v - a.v);
    rows = S.dir === 'net' ? all.slice(0, 10).concat(all.slice(-10)) : all.slice(0, 20);
    m = Math.max(...rows.map(r => Math.abs(r.v))) || 1;
    const js = jmapScale(S.dir).scale;
    fill = d => js(S.dir === 'net' ? d.v : Math.abs(d.v));
  } else if (S.view === 'reg') {
    rows = Object.keys(REG).map(rk => ({ iso: rk, v: regVal(rk, S.yi, S.flow, S.den, S.cum), reg: true })).sort((a, b) => b.v - a.v);
    m = RDOM[S.flow + S.den + S.cum];
    const col = divScale(m);
    fill = d => col(d.v); big = true;
  } else if (S.view === 'mx') {
    rows = mxRows(S);
    m = rows[0]?.v || 1;
    const sq = seqScale(m, S.dir === 'net' ? 'in' : S.dir);
    fill = d => sq(d.v);
  } else if (S.view === 'flow') {
    rows = ISOS.filter(p => p !== S.sel).map(p => ({ iso: p, v: flowOf(S.sel!, S.dir, p, S.yi, S.cum) })).sort((a, b) => b.v - a.v);
    m = flowMax(S.sel!, S.dir, S.cum);
    const sq = seqScale(m, S.dir), dv = divScale(m);
    fill = d => S.dir === 'net' ? dv(d.v) : sq(Math.abs(d.v));
  } else {
    rows = ISOS.map(iso => ({ iso, v: S.view === 'klas' ? val(iso, S.yi, 'tot', 'abs', true) : val(iso, S.yi, S.flow, S.den, S.cum) })).sort((a, b) => b.v - a.v);
    m = S.view === 'klas' ? DOM['totabstrue'] : DOM[S.flow + S.den + S.cum];
    const col = divScale(m);
    fill = d => S.view === 'klas' ? KCOL[klasOf(d.iso, S.yi, S.thr, S.thrRel, S.thrPct)] : col(d.v);
  }
  const isRel = S.view !== 'flow' && S.view !== 'mx' && S.view !== 'jmap' && S.view !== 'klas' && S.den !== 'abs';
  const fmt = (d: Row) => {
    if (isRel) return sgn(d.v, fmtR) + ' %';
    if (S.view === 'mx' || S.view === 'jmap') return S.dir === 'net' ? sgn(Math.round(d.v), fmtI) : fmtI.format(Math.round(d.v));
    return S.view === 'flow' && S.dir !== 'net' ? fmtI.format(d.v) : sgn(Math.round(d.v), fmtI);
  };
  const gross = (S.view === 'flow' && S.dir !== 'net') || S.view === 'mx' || (S.view === 'jmap' && S.dir !== 'net');

  const JNAME = new Map(JGEO.features.map(f => [f.properties.j, f.properties.n]));
  const activate = (d: Row) => {
    if (d.reg || d.jls != null) return;
    if (d.pair) { jumpFlow(d.pair[0], d.pair[1]); return; }
    if (S.view === 'flow') openPair(d.iso);
    else selectCounty(d.iso);
  };
  const name = (d: Row) => {
    if (d.reg) return REG[d.iso].name;
    if (d.pair) return SHORTN[d.pair[0]] + ' → ' + SHORTN[d.pair[1]];
    if (d.jls != null) return JNAME.get(d.jls) || '';
    return D[d.iso].n;
  };
  const railLab = S.view === 'jmap' ? (S.dir === 'net' ? 'JLS — 10 najvećih dobitaka i gubitaka' : 'JLS — 20 najvećih')
    : S.view === 'mx' ? 'Najveći koridori — cijela mreža'
    : S.view === 'reg' ? 'Regije — prijedlog iz rada'
    : S.view === 'flow' ? 'Partneri · ' + (D[S.sel!]?.n || '') : 'Poredak županija';

  return (
    <aside className="rail">
      <div className="rail-hd">
        <div className="ctrl-lab" id="railLab">{railLab}</div>
        <div className="rail-year" id="railYear">{railTitle(S)}</div>
      </div>
      <div className="rail-list" id="railList">
        {rows.map((d, i) => (
          <div key={d.pair ? d.pair.join('') : d.jls != null ? 'j' + d.jls : d.iso}
            className={'rrow' + (big ? ' big' : '') + (d.pair ? ' pairrow' : '') + (!d.reg && !d.pair && d.jls == null && d.iso === S.hl ? ' hl' : '') + (d.jls != null && d.jls === S.jlsHl ? ' hl' : '')}
            role="button" tabIndex={0}
            aria-label={name(d) + ' ' + fmt(d)}
            onPointerEnter={() => { if (d.jls != null) setJlsHl(d.jls); else setHL(d.reg || d.pair ? null : d.iso); }}
            onPointerLeave={() => { if (d.jls != null) setJlsHl(null); else setHL(null); }}
            onPointerMove={moveTip}
            onClick={() => activate(d)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(d); } }}>
            <div className="rname">{d.pair ? <>{i + 1}. {name(d)}</>
              : d.jls != null ? <>{name(d)}{name(d) !== SHORTN[d.iso] && <span className="jc"> {SHORTN[d.iso]}</span>}</>
              : name(d)}</div>
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
      {S.view === 'flow' && <div className="rail-hint">klik na partnera otvara koridor kroz vrijeme · klik na kartu mijenja županiju</div>}
      {S.view === 'mx' && <div className="rail-hint">klik na koridor otvara Tokove s tim parom</div>}
    </aside>
  );
}
