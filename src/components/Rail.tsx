import {
  ISOS, D, REG, YEARS, DOM, RDOM, SHORTN,
  val, regVal, klasOf, KCOL, divScale, seqScale, flowOf, flowMax, mxCell, mxMax, jlsVal, jmapScale, fmtI, fmtR, sgn,
} from '../lib/metrics.ts';
import { jlsGeo } from '../lib/geoAsync.ts';
import { moveTip } from '../lib/tip.ts';
import { focusSoon } from '../lib/state.ts';
import type { Patch, State } from '../lib/types.ts';

/* `pair` is the corridor this row *points at* — the cell it highlights, the hub
   it opens in Tokovi — while `nm` is how the row is worded, always in the
   direction people actually moved. For neto the two differ: the row is worded
   loser → gainer but points at the gainer's cell, which is the one displaying
   the same +v the row shows. */
type Row = { iso: string; v: number; reg?: boolean; pair?: [string, string]; nm?: [string, string]; jls?: number };

function railTitle(S: State): string {
  if (S.view === 'jmap') return { out: 'odlasci', in: 'dolasci', net: 'neto' }[S.dir] + ' · 2018.';
  if (S.view === 'mx') {
    const per = S.cum ? '2011.–' + YEARS[S.yi] + '.' : YEARS[S.yi] + '.';
    /* Odlasci and Dolasci produce the same 20 rows and always will: every
       directed corridor is one county's departure and another's arrival, so the
       network's top 20 is one list seen from two sides. Naming a direction here
       made switching Smjer look broken. Only neto reorders — it pairs counties
       up — so only neto names itself. */
    return (S.dir === 'net' ? 'neto · ' : 'koridori · ') + per;
  }
  if (S.view === 'flow') {
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
      /* point at the *gainer's* cell: mxCell(gainer, loser, 'net') is +v, so the
         highlighted cell, the tooltip's "neto (…)" line, the legend mark and the
         corridor card all carry the same sign the row shows. Pointing at the
         loser's cell meant a row reading +517 lit a cell reading −517. */
      if (v >= 0) rows.push({ iso: a, v, pair: [a, b], nm: [b, a] });
      else rows.push({ iso: b, v: -v, pair: [b, a], nm: [a, b] });
    }
  } else {
    for (const a of ISOS) for (const b of ISOS) {
      if (a === b) continue;
      /* in Dolasci the hub is the receiving county, so the cell this row lights
         is again the one displaying this row's number under the current Smjer */
      rows.push({ iso: S.dir === 'in' ? b : a, v: mxCell(a, b, 'out', S.yi, S.cum),
        pair: S.dir === 'in' ? [b, a] : [a, b], nm: [a, b] });
    }
  }
  return rows.sort((x, y) => y.v - x.v).slice(0, 20);
}

export default function Rail({ S, setS, selectCounty, setHL, openPair, jumpFlow, setJlsHl }: {
  S: State; setS: (p: Patch) => void; selectCounty: (iso: string) => void; setHL: (iso: string | null) => void;
  openPair: (iso: string) => void; jumpFlow: (a: string, b: string) => void;
  setJlsHl: (j: number | null) => void;
}) {
  const JG = jlsGeo();
  let rows: Row[], m: number, fill: (d: Row) => string, big = false;
  if (S.view === 'jmap') {
    /* net: 10 biggest gainers + 10 biggest losers; gross: top 20 */
    const all = (JG ? JG.features : []).map(f => ({ iso: ISOS[f.properties.c], v: jlsVal(f.properties, S.dir), jls: f.properties.j }))
      .sort((a, b) => b.v - a.v);
    rows = S.dir === 'net' ? all.slice(0, 10).concat(all.slice(-10)) : all.slice(0, 20);
    m = Math.max(...rows.map(r => Math.abs(r.v)), 1);
    const js = jmapScale(S.dir).scale;
    fill = d => js(S.dir === 'net' ? d.v : Math.abs(d.v));
  } else if (S.view === 'reg') {
    rows = Object.keys(REG).map(rk => ({ iso: rk, v: regVal(rk, S.yi, S.flow, S.den, S.cum), reg: true })).sort((a, b) => b.v - a.v);
    m = RDOM[S.flow + S.den + S.cum];
    const col = divScale(m);
    fill = d => col(d.v); big = true;
  } else if (S.view === 'mx') {
    rows = mxRows(S);
    /* The BAR length stays relative to the top corridor — the rail is a ranking.
       The COLOUR has to come from the grid's own domain, because the grid is what
       the legend beside it describes: normalised to the top-20 instead, the #1 row
       painted itself #B5341F, the extreme of the ramp, while the cell it lights
       sat at rgb(214,131,107), ~60 % of a 0–3.868 scale. One number, two colours,
       one key. (For net this is the positive half of divScale, which is exactly
       what the gaining cell is filled with.) */
    m = rows[0]?.v || 1;
    const sq = seqScale(mxMax(S.dir, S.cum), S.dir === 'net' ? 'in' : S.dir);
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

  /* only the JLS view names municipalities — building this 556-entry Map on every
     render of every view cost 556 allocations per hover frame for nothing */
  const JNAME = S.view === 'jmap' && JG
    ? new Map(JG.features.map(f => [f.properties.j, f.properties.n]))
    : null;
  /* Regije and JLS rows have nothing to open — there is no region selection and
     no JLS drill — so they must not claim role=button. They stayed focusable:
     that is what makes the map highlight reachable without a pointer. */
  const canActivate = (d: Row) => !d.reg && d.jls == null;
  const activate = (d: Row) => {
    if (!canActivate(d)) return;
    /* This row's React key changes from the corridor to the hub iso, so every
       row unmounts and focus fell to <body>. Hand it to the corridor card the
       jump opens — the same handshake the matrix cells make. */
    if (d.pair) { jumpFlow(d.pair[0], d.pair[1]); focusSoon('#pairX'); return; }
    if (S.view === 'flow') openPair(d.iso);
    else selectCounty(d.iso);
  };
  const name = (d: Row) => {
    if (d.reg) return REG[d.iso].name;
    if (d.nm) return SHORTN[d.nm[0]] + ' → ' + SHORTN[d.nm[1]];
    if (d.jls != null) return JNAME?.get(d.jls) || '';
    return D[d.iso].n;
  };
  /* the county tag is a visible part of a JLS row's identity (two municipalities
     share a name across counties), so it belongs in the spoken label too */
  const rowAria = (d: Row) =>
    (d.jls != null && name(d) !== SHORTN[d.iso] ? name(d) + ', ' + SHORTN[d.iso] : name(d)) + ' ' + fmt(d);
  /* hover and focus drive the same highlight — see the row handlers below */
  const lightOn = (d: Row) => {
    if (d.jls != null) setJlsHl(d.jls);
    else if (d.reg) setS({ regHl: d.iso });
    else if (d.pair) setS({ pairHl: d.pair });
    else setHL(d.iso);
  };
  const lightOff = (d: Row) => {
    if (d.jls != null) setJlsHl(null);
    else if (d.reg) setS({ regHl: null });
    else if (d.pair) setS({ pairHl: null });
    else setHL(null);
  };
  const railLab = S.view === 'jmap' ? (S.dir === 'net' ? 'JLS — 10 najvećih dobitaka i gubitaka' : 'JLS — 20 najvećih')
    : S.view === 'mx' ? 'Najveći koridori — cijela mreža'
    : S.view === 'reg' ? 'Regije — prijedlog iz rada'
    : S.view === 'flow' ? 'Partneri · ' + (D[S.sel!]?.n || '') : 'Poredak županija';

  return (
    /* the complementary landmark was unnamed while its whole content changes per
       view — landmark navigation announced "complementary" and nothing else */
    <aside className="rail" aria-labelledby="railLab">
      <div className="rail-hd">
        <h2 className="ctrl-lab" id="railLab">{railLab}</h2>
        <div className="rail-year" id="railYear">{railTitle(S)}</div>
      </div>
      {/* the two lines above name what this list is and what period it covers;
          without the association they were decoration a screen reader met minutes
          before reaching the rows they describe */}
      <div className="rail-list" id="railList" role="group" aria-labelledby="railLab railYear">
        {rows.map((d, i) => (
          <div key={d.pair ? d.pair.join('') : d.jls != null ? 'j' + d.jls : d.iso}
            className={'rrow' + (big ? ' big' : '') + (d.pair ? ' pairrow' : '') + (!d.reg && !d.pair && d.jls == null && d.iso === S.hl ? ' hl' : '') + (d.jls != null && d.jls === S.jlsHl ? ' hl' : '') + (d.reg && d.iso === S.regHl ? ' hl' : '') + (d.pair && S.pairHl && S.pairHl[0] === d.pair[0] && S.pairHl[1] === d.pair[1] ? ' hl' : '')}
            data-iso={d.iso}
            /* A row claims role=button only when activating it does something.
               The inert ones used to carry no role at all, which left an
               aria-label sitting on a generic element — a placement ARIA does not
               guarantee AT will expose. `img` is both valid and apt: name + bar +
               number is one small graphic, and it collapses to exactly the one
               string we want announced. */
            role={canActivate(d) ? 'button' : 'img'} tabIndex={0}
            aria-label={rowAria(d)}
            /* the rail is the natural index into the map and the 420-cell grid,
               so hovering a row lights up whatever it names: a region's counties,
               a corridor's matrix cell, a JLS, or a county — and focus does the
               same, which is the only way to reach that highlight from a keyboard */
            onPointerEnter={() => lightOn(d)}
            onPointerLeave={() => lightOff(d)}
            onFocus={() => lightOn(d)}
            onBlur={() => lightOff(d)}
            onPointerMove={moveTip}
            onClick={() => activate(d)}
            onKeyDown={e => {
              if (!canActivate(d)) return;
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(d); }
            }}>
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
      {S.view === 'mx' && (
        <div className="rail-hint">klik na koridor otvara Tokove s tim parom
          {S.dir !== 'net' && ' · isti popis za odlaske i dolaske — svaki je koridor nečiji odlazak i nečiji dolazak'}</div>
      )}
    </aside>
  );
}
