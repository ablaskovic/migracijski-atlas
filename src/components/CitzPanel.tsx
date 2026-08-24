import { scaleBand, scaleLinear } from 'd3-scale';
import { max } from 'd3-array';
import { CIT, cgroups, countryName, DEMO, YEARS, fmtI, sgn } from '../lib/metrics.ts';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';
import type { Patch, State } from '../lib/types.ts';
import { L, yr as yrOf, yrSpan } from '../lib/i18n.ts';

export default function CitzPanel({ S, setS, toggleCitz }: {
  S: State; setS: (p: Patch) => void; toggleCitz: () => void;
}) {
  const open = S.citz;
  const zem = S.citzTab === 'zem';
  const yy = CIT.years;
  /* the scrubber can sit anywhere in 1998–2025 while this panel only has
     2021–2025, and the clamp used to be silent: the big year could read 2015.
     while the chart highlighted 2025. Say so when it actually bites. */
  const inRange = yy.includes(YEARS[S.yi]);
  const y = inRange ? YEARS[S.yi] : yy[yy.length - 1];
  const ci = yy.indexOf(y);

  const w = 276, h = 148, mL = 8, mR = 8, mT = 8, mB = 14;
  const x = scaleBand<number>().domain(yy).range([mL, w - mR]).paddingInner(0.28).paddingOuter(0.06);
  const mD = max(yy.map((_, i) => CIT.tot.d[i]))!;
  const mO = max(yy.map((_, i) => CIT.tot.o[i]))!;
  const y0 = mT + (h - mT - mB) * mD / (mD + mO);
  const sD = scaleLinear().domain([0, mD]).range([y0, mT]);
  const sO = scaleLinear().domain([0, mO]).range([y0, h - mB]);

  const bars: ReactElement[] = [];
  yy.forEach((yr, i) => {
    let up = 0, dn = 0;
    for (const [k, , col] of cgroups()) {
      const dv = CIT.g[k].d[i], ov = CIT.g[k].o[i];
      if (dv > 0) bars.push(<rect key={`${yr}${k}d`} x={x(yr)} width={x.bandwidth()}
        y={sD(up + dv)} height={sD(up) - sD(up + dv)} fill={col} opacity={yr === y ? 1 : 0.45} />);
      if (ov > 0) bars.push(<rect key={`${yr}${k}o`} x={x(yr)} width={x.bandwidth()}
        y={sO(dn)} height={sO(dn + ov) - sO(dn)} fill={col} opacity={yr === y ? 0.72 : 0.3} />);
      up += dv; dn += ov;
    }
  });

  const td = CIT.tot.d[ci], to = CIT.tot.o[ci], ts = td - to;
  const onKey = (e: ReactKeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCitz(); } };

  return (
    <div className={'chipcard citz' + (open ? ' open' : '')} id="citz">
      <div className="chip-hd" id="citzHd" role="button" tabIndex={0} aria-expanded={open}
        onClick={toggleCitz} onKeyDown={onKey}>
        <span className="chip-arr" aria-hidden="true">▸</span>
        <span>{L('Državljanstvo', 'Citizenship')}<span className="chip-more">{L(` · RH · ${yy[0]}.–${yy[yy.length - 1]}.`, ` · Croatia · ${yy[0]}–${yy[yy.length - 1]}`)}</span></span>
      </div>
      {open && (
        <div className="chip-body">
          <div className="jcard-cap">
            {zem ? L(`zemlja podrijetla/odredišta · samo ${DEMO.year}. · najvećih 12 po doseljenima`,
              `country of origin/destination · ${DEMO.year} only · top 12 by arrivals`)
              : L('vanjska migracija prema zemlji državljanstva · doseljeni (gore) / odseljeni (dolje)',
                'external migration by country of citizenship · arrivals (above) / departures (below)')}
          </div>
          <div className="jtabs" id="citzTabs">
            <button data-v="grp" aria-pressed={!zem} onClick={() => setS({ citzTab: 'grp' })}>{L('Skupine', 'Groups')}</button>
            <button data-v="zem" aria-pressed={zem} onClick={() => setS({ citzTab: 'zem' })}>{L(`Zemlje ${DEMO.year}.`, `Countries ${DEMO.year}`)}</button>
          </div>
          {/* one panel, two time behaviours: Skupine follows the scrubber,
              Zemlje is frozen — make the frozen one say so up front */}
          {zem && <div className="citz-clamp" id="zemFixed">{L(`Fiksno ${yrOf(DEMO.year)} — vremenska vrpca ne mijenja ovaj popis.`,
            `Fixed at ${yrOf(DEMO.year)} — the time scrubber does not change this list.`)}</div>}
          {zem ? (
            <>
              <div id="zemList">
                {DEMO.countries.map(([nm, d, o]) => (
                  <div className="jrow" key={nm}>
                    <span className="jn">{countryName(nm)}</span>
                    <span className="zbar"><span style={{ width: Math.max(1, d / DEMO.countries[0][1] * 100) + '%' }} /></span>
                    <span className="jv">{'+' + fmtI.format(d)}</span>
                    <span className="jv">{'−' + fmtI.format(o)}</span>
                  </div>
                ))}
                {/* The remainder, so the column closes. This list is the top 12
                    by arrivals and the row below it is the national total, and
                    the two were printed adjacently with nothing between them:
                    the 12 arrival values sum to 43.365 against a total of
                    56.665 — 13.300 people, 23,5 % — and departures 27.322 against
                    37.485. The sibling Skupine tab teaches the opposite, since
                    its six group rows sum to its total exactly in all five
                    published years, so a reader who learned the pattern there was
                    misled here. Derived, not written out, so a data refresh
                    cannot leave it asserting a stale difference. */}
                <div className="jrow">
                  <span className="jn">{L('Ostale zemlje', 'Other countries')}</span>
                  <span className="zbar" />
                  <span className="jv">{'+' + fmtI.format(DEMO.cTot[0] - DEMO.countries.reduce((a, c) => a + c[1], 0))}</span>
                  <span className="jv">{'−' + fmtI.format(DEMO.cTot[1] - DEMO.countries.reduce((a, c) => a + c[2], 0))}</span>
                </div>
                <div className="jrow zt">
                  <span className="jn">{L('Ukupno — sve zemlje ', 'Total — all countries ') + yrOf(DEMO.year)}</span>
                  <span className="zbar" />
                  <span className="jv">{'+' + fmtI.format(DEMO.cTot[0])}</span>
                  <span className="jv">{'−' + fmtI.format(DEMO.cTot[1])}</span>
                </div>
              </div>
              <div className="citz-note">{L(`Prema zemlji podrijetla/odredišta (ne državljanstvu) · DZS STAN-2026-2-1 (t. I 4) · objavljeno samo za ${yrOf(DEMO.year)}`,
                `By country of origin/destination (not citizenship) · CBS STAN-2026-2-1 (t. I 4) · published for ${yrOf(DEMO.year)} only`)}</div>
            </>
          ) : (
            <>
              <svg id="citzSvg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={L('Doseljeni i odseljeni prema državljanstvu', 'Arrivals and departures by citizenship')}>
                {bars}
                {/* through the formatter, not `{yr}.` — the trailing dot is a
                    Croatian ordinal and this axis printed it in both languages.
                    The parameter was shadowing the imported `yr` helper, which is
                    why the literal was reached for in the first place. */}
                {yy.map(v => (
                  <text key={v} x={x(v)! + x.bandwidth() / 2} y={h - 3} textAnchor="middle" fontSize={9}
                    fontFamily="var(--mono)" fontWeight={v === y ? 600 : 400}
                    fill={v === y ? 'var(--acc)' : 'var(--mut)'}>{yrOf(v)}</text>
                ))}
                <line x1={mL} x2={w - mR} y1={y0} y2={y0} stroke="var(--ink)" strokeWidth={0.8} />
              </svg>
              <div className="citz-rows" id="citzRows">
                {cgroups().map(([k, lab, col]) => (
                  <FragmentRow key={k} col={col} lab={lab} d={CIT.g[k].d[ci]} o={CIT.g[k].o[ci]} />
                ))}
                <span />
                <span className="ct">{L('Ukupno ', 'Total ') + yrOf(y) + L(' · saldo ', ' · net ') + sgn(ts, fmtI)}</span>
                <span className="cv ct">{'+' + fmtI.format(td)}</span>
                <span className="cv ct">{'−' + fmtI.format(to)}</span>
              </div>
              {/* A load-bearing honesty message that appears and disappears as
                  the year is scrubbed, with no focus moving — exactly the case
                  role=status exists for. Without it the panel silently shows one
                  year while the big year reads another. */}
              {/* Mounted whether or not it has something to say: a live region
                  inserted already populated is not guaranteed to announce, which
                  is the pattern #srLive follows and this one did not. Empty it
                  paints nothing — see .citz-clamp:empty. */}
              <div className="citz-clamp" id="citzClamp" role="status" aria-live="polite">
                {!inRange && L(`Vremenska vrpca je na ${yrOf(YEARS[S.yi])} — izvan objavljenog raspona, prikazano ${yrOf(y)}`,
                  `The time scrubber is at ${yrOf(YEARS[S.yi])} — outside the published range, showing ${yrOf(y)}`)}
              </div>
              <div className="citz-note" id="citzNote">{L(`Prema zemlji državljanstva · DZS STAN-2026-2-1 (t. 2) · odabir godine prati vremensku vrpcu unutar ${yrSpan(yy[0], yy[yy.length - 1])}`,
                `By country of citizenship · CBS STAN-2026-2-1 (t. 2) · the year follows the time scrubber within ${yrSpan(yy[0], yy[yy.length - 1])}`)}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FragmentRow({ col, lab, d, o }: { col: string; lab: string; d: number; o: number }) {
  return (
    <>
      <span className="sw" style={{ background: col }} />
      <span>{lab}</span>
      <span className="cv">{'+' + fmtI.format(d)}</span>
      <span className="cv">{'−' + fmtI.format(o)}</span>
    </>
  );
}
