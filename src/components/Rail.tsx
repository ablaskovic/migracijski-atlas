import {
  ISOS, D, REG, YEARS, DOM, RDOM, SHORTN,
  val, regVal, klasOf, KCOL, divScale, seqScale, flowOf, flowMax, mxCell, mxMax, jlsVal, jmapScale, fmtI, fmtR, sgn,
} from '../lib/metrics.ts';
import { jlsGeo, geoStatus } from '../lib/geoAsync.ts';
import { moveTip } from '../lib/tip.ts';
import { useEffect, useRef } from 'react';
import { isKeyFocus } from '../lib/state.ts';
import { L, yr, yrSpan } from '../lib/i18n.ts';
import PairCard from './PairCard.tsx';
import type { Patch, State } from '../lib/types.ts';

/* `pair` is the corridor this row *points at* — the cell it highlights, the hub
   it opens in Tokovi — while `nm` is how the row is worded, always in the
   direction people actually moved. For neto the two differ: the row is worded
   loser → gainer but points at the gainer's cell, which is the one displaying
   the same +v the row shows. */
type Row = { iso: string; v: number; reg?: boolean; pair?: [string, string]; nm?: [string, string]; jls?: number };

function railTitle(S: State): string {
  if (S.view === 'jmap') {
    return { out: L('odlasci', 'out'), in: L('dolasci', 'in'), net: L('neto', 'net') }[S.dir] + ' · ' + yr(2018);
  }
  if (S.view === 'mx') {
    const per = S.cum ? yrSpan(2011, YEARS[S.yi]) : yr(YEARS[S.yi]);
    /* Odlasci and Dolasci produce the same 20 rows and always will: every
       directed corridor is one county's departure and another's arrival, so the
       network's top 20 is one list seen from two sides. Naming a direction here
       made switching Smjer look broken. Only neto reorders — it pairs counties
       up — so only neto names itself. */
    return (S.dir === 'net' ? L('neto · ', 'net · ') : L('koridori · ', 'corridors · ')) + per;
  }
  if (S.view === 'flow') {
    const per = S.cum ? yrSpan(2011, YEARS[S.yi]) : yr(YEARS[S.yi]);
    return { out: L('odlasci · ', 'out · '), in: L('dolasci · ', 'in · '), net: L('neto · ', 'net · ') }[S.dir] + per;
  }
  const y = YEARS[S.yi];
  const kum = L('kumulativno ', 'cumulative ') + yrSpan(2011, y);
  if (S.view === 'klas') return kum;
  return S.cum ? kum : L('godina ' + yr(y), 'year ' + yr(y));
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

export default function Rail({ S, setS, selectCounty, setHL, openPair, openCorridor, setJlsHl }: {
  S: State; setS: (p: Patch) => void; selectCounty: (iso: string) => void; setHL: (iso: string | null) => void;
  openPair: (iso: string) => void; openCorridor: (a: string, b: string) => void;
  setJlsHl: (j: number | null) => void;
}) {
  const JG = jlsGeo();
  /* A rail row can unmount under the reader's own arrow key: in Matrica the
     top-20 corridors recompute on every year step, and at 22 of the 27 steps
     (dir=out) at least one corridor leaves the list. Its keyed row goes with it
     and focus drops to <body> — measured on "Grad Zagreb → Karlovačka" at
     1998→1999 — so the next Tab restarts from the top of the page. Every
     activation path in this app hands focus on; the paths where the list
     rebuilds under a focused row did not.
     Handed to the row that now holds that position, which is where the reader
     was looking, and only when focus actually fell. */
  const listRef = useRef<HTMLDivElement>(null);
  const focusedRow = useRef<number | null>(null);
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
  /* Godine ranks the *marked column*, so its rows are the same quantity Saldo's
     are and fall through to the same branch — but there is nothing to open in
     that view (no county card; the grid row is already the county's series), so
     they must not claim role=button. Same rule Regije and JLS rows follow. */
  const canActivate = (d: Row) => !d.reg && d.jls == null && S.view !== 'yrs';
  const activate = (d: Row) => {
    if (!canActivate(d)) return;
    /* Used to jump to Tokovi, which unmounted every row (the key changes from
       the corridor to the hub iso) and re-framed the screen around one county —
       20 arcs and all 20 partners for a question about one corridor. It now
       opens the corridor in place, like a matrix cell: the ranking stays, this
       row stays mounted, and focus stays on it. */
    if (d.pair) { openCorridor(d.pair[0], d.pair[1]); return; }
    if (S.view === 'flow') openPair(d.iso);
    else selectCounty(d.iso);
  };
  /* which row the open corridor card describes — the rail is also where that card
     lives in Matrica, so an unmarked list next to it reads as unrelated */
  const isOpen = (d: Row): boolean => d.pair
    ? S.sel === d.pair[0] && S.pair === d.pair[1]
    : S.view === 'flow' && S.pair === d.iso;
  /* activating either kind of row toggles the corridor card, so the row owns a
     disclosure — the same contract `.cnt` has with the county card */
  const owns = (d: Row): boolean => canActivate(d) && (!!d.pair || S.view === 'flow');
  const name = (d: Row) => {
    if (d.reg) return REG[d.iso].name;
    if (d.nm) return SHORTN[d.nm[0]] + ' → ' + SHORTN[d.nm[1]];
    if (d.jls != null) return JNAME?.get(d.jls) || '';
    return D[d.iso].n;
  };
  /* The label is built from exactly the strings the row renders, in the order it
     renders them — and `.rname` below is built from this. That is not tidiness:
     WCAG 2.5.3 requires the accessible name to *contain* the visible label, and
     the visible label of a grid row is its text children concatenated with no
     separator at all. So `Grad Zagreb` + `+41.986` reads `Grad Zagreb+41.986`,
     which the old label (`Grad Zagreb +41.986`) did not contain: measured, 21 of
     21 rows failed axe `label-content-name-mismatch` in Saldo alone, and the
     other two row shapes failed it worse — a JLS row said `, ` where it showed
     ` `, and a corridor row dropped the rank the row leads with.
     The single space in `.rrow` below is the other half of this: it puts that
     separator in the DOM, where the visible label is computed, at no layout cost
     (a white-space-only text run in a grid container generates no grid item).
     The county tag is a visible part of a JLS row's identity — two municipalities
     share a name across counties — so it stays in both. */
  const rowName = (d: Row, i: number) =>
    d.pair ? i + 1 + '. ' + name(d)
      : d.jls != null && name(d) !== SHORTN[d.iso] ? name(d) + ', ' + SHORTN[d.iso]
        : name(d);
  const rowAria = (d: Row, i: number) => rowName(d, i) + ' ' + fmt(d);
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
  /* A ReactNode, not a string: the Tokovi heading ends in a county name, and a
     Croatian place name inside a lang="en" document is annotated rather than
     translated — the rule this file already states for its own rows. */
  const railLab = S.view === 'jmap' ? (S.dir === 'net'
    ? L('JLS — 10 najvećih dobitaka i gubitaka', 'LAU — 10 largest gains and losses')
    : L('JLS — 20 najvećih', 'LAU — 20 largest'))
    : S.view === 'mx' ? L('Najveći koridori — cijela mreža', 'Largest corridors — the whole network')
    : S.view === 'reg' ? L('Regije — prijedlog iz rada', 'Regions — the paper’s proposal')
    /* naming the column keeps the rail from reading as a ranking of the whole
       grid, which is sorted by the window total and generally differs */
    : S.view === 'yrs' ? L('Poredak — označena godina', 'Ranking — the marked year')
    : S.view === 'flow'
      ? <>{L('Partneri · ', 'Partners · ')}<span lang="hr">{D[S.sel!]?.n || ''}</span></>
      : L('Poredak županija', 'County ranking');

  const rowKeys = rows.map(d => (d.pair ? d.pair.join('') : d.jls != null ? 'j' + d.jls : d.iso)).join('|');
  useEffect(() => {
    const at = focusedRow.current;
    if (at == null || document.activeElement !== document.body) return;
    const list = listRef.current;
    if (!list) return;
    const all = list.querySelectorAll<HTMLElement>('.rrow');
    if (!all.length) return;
    /* on the frame after React commits, the way focusSoon does it — the node
       is the target here, not a selector, because a corridor row has no stable
       one of its own */
    const want = all[Math.min(at, all.length - 1)];
    requestAnimationFrame(() => { if (want.isConnected && document.activeElement === document.body) want.focus(); });
  }, [rowKeys]);

  return (
    /* the complementary landmark was unnamed while its whole content changes per
       view — landmark navigation announced "complementary" and nothing else */
    <aside className="rail" aria-labelledby="railLab">
      {/* Matrica's corridor card docks here rather than floating over the grid,
          which is data all the way to its edges. Above the header so the list
          keeps its own name and period, and so the card is next to the corridor
          ranking it belongs to. See PairCard. */}
      {S.view === 'mx' && <PairCard S={S} setS={setS} />}
      <div className="rail-hd">
        <h2 className="ctrl-lab" id="railLab">{railLab}</h2>
        <div className="rail-year" id="railYear">{railTitle(S)}</div>
      </div>
      {/* the two lines above name what this list is and what period it covers;
          without the association they were decoration a screen reader met minutes
          before reaching the rows they describe */}
      <div className="rail-list" id="railList" role="group" aria-labelledby="railLab railYear" ref={listRef}>
        {/* Rows come from the geometry, so the JLS rail is empty whenever the
            475 KB chunk has not arrived — during an ordinary fetch, and for
            good after a failed one. Measured with geo_jls aborted: railList
            0 children and no text, under a heading promising ten gains and
            ten losses; a screen reader landed on a named group that contained
            nothing and never said why. The map box already names both states
            and offers the retry, and now says it here in the same words. The
            heading stays: hiding it collapses the aside on the frame the
            geometry lands, and leaves the reader nothing to have been told. */}
        {S.view === 'jmap' && !JG && <p className="rail-empty">{geoStatus(true)}</p>}
        {rows.map((d, i) => (
          <div key={d.pair ? d.pair.join('') : d.jls != null ? 'j' + d.jls : d.iso}
            className={'rrow' + (big ? ' big' : '') + (d.pair ? ' pairrow' : '') + (!d.reg && !d.pair && d.jls == null && d.iso === S.hl ? ' hl' : '') + (d.jls != null && d.jls === S.jlsHl ? ' hl' : '') + (d.reg && d.iso === S.regHl ? ' hl' : '') + (d.pair && S.pairHl && S.pairHl[0] === d.pair[0] && S.pairHl[1] === d.pair[1] ? ' hl' : '') + (isOpen(d) ? ' selrow' : '')}
            data-iso={d.iso}
            /* A row claims role=button only when activating it does something.
               The inert ones used to carry no role at all, which left an
               aria-label sitting on a generic element — a placement ARIA does not
               guarantee AT will expose. `img` is both valid and apt: name + bar +
               number is one small graphic, and it collapses to exactly the one
               string we want announced. */
            role={canActivate(d) ? 'button' : 'img'} tabIndex={0}
            /* .rname below keeps lang="hr" for the visible text, which IS just a
               place name. The row does not: its accessible name is a sentence —
               "Osječko-baranjska −8.7 %" — and marking the row Croatian sent the
               English-formatted number to the Croatian voice with it. */
            aria-label={rowAria(d, i)}
            aria-expanded={owns(d) ? isOpen(d) : undefined}
            /* the rail is the natural index into the map and the 420-cell grid,
               so hovering a row lights up whatever it names: a region's counties,
               a corridor's matrix cell, a JLS, or a county — and focus does the
               same, which is the only way to reach that highlight from a keyboard */
            onPointerEnter={() => lightOn(d)}
            onPointerLeave={() => lightOff(d)}
            /* …and the tip has to be PLACED, not merely shown. The four SVG focus
               handlers were given this and the rail was not, though it is the
               same highlight reached the other way — the comment above says
               focus here "is the only way to reach that highlight from a
               keyboard", which is exactly the population it stranded. Tooltip's
               layout effect only calls placeTip(), and placeTip is `if (last)
               moveTip(last)`: a no-op before the pointer has ever moved, and a
               replay of an unrelated position afterwards. Measured at 1440×900
               with real Tab presses and the mouse never moved: on a fresh load,
               focusing row 0 painted a 260×302 panel at (0,0) over the header
               with style.left and style.top both empty, while the row it
               describes sat at (1149,196); after tabbing through the counties
               first, "Grad Zagreb" and then "Istarska" both froze the tip at
               left 790,234px top 384px — Istarska's numbers painted over eastern
               Slavonia, 359 px from the row that named them.
               Anchored to the row's right/bottom: at 1440 that is 291 px of row
               on the right edge, so moveTip's x-flip puts the tip left of the
               rail, which is the side it wants anyway. */
            onFocus={e => {
              lightOn(d);
              focusedRow.current = i;
              /* a click focuses the row too, and the pointer has already placed
                 the tip — the same guard the SVG handlers take */
              if (!isKeyFocus(e.currentTarget)) return;
              const r = e.currentTarget.getBoundingClientRect();
              moveTip({ clientX: r.right, clientY: r.bottom });
            }}
            onBlur={() => { focusedRow.current = null; lightOff(d); }}
            onPointerMove={moveTip}
            onClick={() => activate(d)}
            onKeyDown={e => {
              if (!canActivate(d)) return;
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(d); }
            }}>
            {/* renders exactly rowName(d, i), in pieces, because .jc is a test
                selector and the county tag is styled apart from the name */}
            {/* lang="hr" because these are Croatian place names inside a document
                that may be lang="en" — without it a screen reader voices
                "Osječko-baranjska" with English phonemes. The exemption that
                keeps them Croatian is what makes the annotation necessary. */}
            <div className="rname" lang="hr">{d.pair ? <>{i + 1}. {name(d)}</>
              : d.jls != null ? <>{name(d)}{name(d) !== SHORTN[d.iso] && <>, <span className="jc">{SHORTN[d.iso]}</span></>}</>
              : name(d)}</div>
            {/* the separator the accessible name claims — see rowAria */}
            {' '}
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
      {S.view === 'flow' && <div className="rail-hint">{L('klik na partnera otvara koridor kroz vrijeme · klik na kartu mijenja županiju',
        'clicking a partner opens its corridor through time · clicking the map changes the county')}</div>}
      {S.view === 'mx' && (
        /* the hint has to describe what the click now does: it opens the corridor
           here, in the grid, instead of jumping to Tokovi */
        <div className="rail-hint">{L('klik na koridor otvara njegovu karticu i označuje ćeliju u mreži',
          'clicking a corridor opens its card and marks its cell in the grid')}
          {S.dir !== 'net' && L(' · isti popis za odlaske i dolaske — svaki je koridor nečiji odlazak i nečiji dolazak',
            ' · the same list for out and in — every corridor is someone’s departure and someone’s arrival')}</div>
      )}
    </aside>
  );
}
