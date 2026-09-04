import { scaleBand, scaleLinear } from 'd3-scale';
import { max } from 'd3-array';
import { CIT, cgroups, countryName, DEMO, YEARS, fmtI, sgn } from '../lib/metrics.ts';
import { useMemo } from 'react';
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

  /* The bar column is scaled to the largest quantity IN it, and the remainder is
     part of it. The twelve country rows were scaled to countries[0] and the
     remainder row drew an empty track — but the remainder is +13.300 arrivals
     against Njemačka's +9.628, 38 % MORE than the widest bar on screen. So a
     reader scanning the one visual magnitude encoding this layout has read the
     biggest single quantity in the column as zero, which undercuts exactly the
     "the column closes" honesty the row was added for. Half-opacity, the same
     way this atlas marks a derived quantity elsewhere: it is a residual, not a
     country. */
  const zemRem = [DEMO.cTot[0] - DEMO.countries.reduce((a, c) => a + c[1], 0),
    DEMO.cTot[1] - DEMO.countries.reduce((a, c) => a + c[2], 0)];
  const zemMax = Math.max(DEMO.countries[0][1], zemRem[0]);
  /* plain numbers, and the JSX below uses them too */
  const w = 276, h = 148, mL = 8, mR = 8, mT = 8, mB = 14;
  /* Built only when the panel is OPEN. Hover state lives in root State, so
     every pointer crossing in every view re-renders this component — and with
     the chip collapsed, which is the default, it still constructed a scaleBand
     and two scaleLinears and pushed up to 60 bar <rect>s and 10 frames before
     reaching the `{open && …}` that throws them away. The header is what shows
     when it is closed, and the header needs none of it.
     A memo rather than a child component, so the JSX below stays where it is
     and the deps say exactly what the chart depends on. */
  const chart = useMemo(() => {
    if (!open) return null;
    const x = scaleBand<number>().domain(yy).range([mL, w - mR]).paddingInner(0.28).paddingOuter(0.06);
    const mD = max(yy.map((_, i) => CIT.tot.d[i]))!;
    const mO = max(yy.map((_, i) => CIT.tot.o[i]))!;
    const y0 = mT + (h - mT - mB) * mD / (mD + mO);
    const sD = scaleLinear().domain([0, mD]).range([y0, mT]);
    const sO = scaleLinear().domain([0, mO]).range([y0, h - mB]);

    const bars: ReactElement[] = [];
    /* 1.4.11, on the panel's own terms. cgroups() stacks with 'ost' (#C6CCC4)
       last, so the topmost segment of every arrivals bar and the bottommost of
       every departures bar was that pale grey: measured against the chip body,
       1,59:1 selected and 1,22:1 dimmed, so the visible top of the 2024 bar was
       the teal segment below it and the bar read ~5,8 px shorter than its value.
       At 0,45 / 0,30 EVERY segment of the four unselected years was under 2:1 —
       Hrvatska 1,86, EU 1,66, Ukrajina 1,53, Azija 1,50, Susjedstvo 1,35 — so the
       year-to-year comparison this panel exists for was unreadable. index.css
       records the same rule for the swatch beside it ("its own edge has to clear
       3:1") and gives it a --mut border; the bars had no stroke at all.
       The dimmed years go to 0,7 (ink 4,0:1, gain 3,9:1) and each stack gets its
       own outline, which is what now carries the total's edge — so the selected
       year is emphasised by the weight of that outline rather than by an opacity
       split that cost the other four their legibility. */
    const frames: ReactElement[] = [];
    yy.forEach((yr, i) => {
      let up = 0, dn = 0;
      for (const [k, , col] of cgroups()) {
        const dv = CIT.g[k].d[i], ov = CIT.g[k].o[i];
        if (dv > 0) bars.push(<rect key={`${yr}${k}d`} className={'cg cg-' + k} x={x(yr)} width={x.bandwidth()}
          y={sD(up + dv)} height={sD(up) - sD(up + dv)} fill={col} opacity={yr === y ? 1 : 0.7} />);
        if (ov > 0) bars.push(<rect key={`${yr}${k}o`} className={'cg cg-' + k} x={x(yr)} width={x.bandwidth()}
          y={sO(dn)} height={sO(dn + ov) - sO(dn)} fill={col} opacity={yr === y ? 0.72 : 0.7} />);
        up += dv; dn += ov;
      }
      const sw = yr === y ? 1.4 : 0.6;
      if (up > 0) frames.push(<rect key={`${yr}fd`} className="citz-frame" x={x(yr)} width={x.bandwidth()}
        y={sD(up)} height={y0 - sD(up)} strokeWidth={sw} />);
      if (dn > 0) frames.push(<rect key={`${yr}fo`} className="citz-frame" x={x(yr)} width={x.bandwidth()}
        y={y0} height={sO(dn) - y0} strokeWidth={sw} />);
    });
    return { x, y0, sD, sO, bars, frames };
  }, [open, y, yy]);

  const td = CIT.tot.d[ci], to = CIT.tot.o[ci], ts = td - to;
  const onKey = (e: ReactKeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCitz(); } };

  return (
    <div className={'chipcard citz' + (open ? ' open' : '')} id="citz">
      <div className="chip-hd" id="citzHd" role="button" tabIndex={0} aria-expanded={open}
        onClick={toggleCitz} onKeyDown={onKey}>
        <span className="chip-arr" aria-hidden="true">▸</span>
        <span>{L('Državljanstvo', 'Citizenship')}<span className="chip-more">{L(` · RH · ${yy[0]}.–${yy[yy.length - 1]}.`, ` · Croatia · ${yy[0]}–${yy[yy.length - 1]}`)}</span></span>
      </div>
      {/* A load-bearing honesty message that appears and disappears as the year
          is scrubbed, with no focus moving — exactly the case role=status exists
          for. Without it the panel silently shows one year while the big year
          reads another.
          Mounted whether or not it has something to say: a live region inserted
          already populated is not guaranteed to announce, which is the pattern
          #srLive follows and this one did not. Empty it paints nothing — it
          carries only type styles and has no box of its own, which is what lets
          it stay in the tree. It is NOT on the `:empty{display:none}` rule —
          cc8bec5 took it off precisely so the region keeps registering, and
          putting it back would recreate MA3-057.
          …and OUTSIDE the `open &&` gate, which is the other half of the same
          argument: inside it, the region was created the moment the panel was,
          so opening the panel with the scrubber already out of range inserted it
          already populated — the very case the paragraph above is about. Mounted
          with the card, the message becomes a mutation of a region AT already
          knows. Skupine only: Zemlje is frozen at one year and says so in its
          own line.
          The panel body is positioned above the headers rather than in flow, so
          nothing mounted outside it can sit inside it: the region is the
          sr-only copy and the visible line stays in the body, above the source
          note, where it has always been. Same split as the charts and their
          sr-only tables. */}
      <div className="sr-only" id="citzClamp" role="status" aria-live="polite">
        {open && !zem && !inRange && L(`Vremenska vrpca je na ${yrOf(YEARS[S.yi])} — izvan objavljenog raspona, prikazano ${yrOf(y)}`,
          `The time scrubber is at ${yrOf(YEARS[S.yi])} — outside the published range, showing ${yrOf(y)}`)}
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
              {/* the twelve countries as a table too, for the reason the group
                  rows have one: .jrow is four spans and the +/− was the whole
                  of the column semantics. The remainder row below is part of
                  the same reading, so it is in here as well. */}
              <div className="sr-only" id="zemTable">
                <table>
                  <caption>{L(`Vanjska migracija prema zemlji, ${yrOf(DEMO.year)} — najvećih 12 po doseljenima`,
                    `External migration by country, ${yrOf(DEMO.year)} — top 12 by arrivals`)}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{L('Zemlja', 'Country')}</th>
                      <th scope="col">{L('doseljeni', 'arrivals')}</th>
                      <th scope="col">{L('odseljeni', 'departures')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEMO.countries.map(([nm, d, o]) => (
                      <tr key={nm}>
                        <th scope="row">{countryName(nm)}</th>
                        <td>{fmtI.format(d)}</td>
                        <td>{fmtI.format(o)}</td>
                      </tr>
                    ))}
                    <tr>
                      <th scope="row">{L('Ostale zemlje', 'Other countries')}</th>
                      <td>{fmtI.format(zemRem[0])}</td>
                      <td>{fmtI.format(zemRem[1])}</td>
                    </tr>
                    <tr>
                      <th scope="row">{L('Ukupno', 'Total')}</th>
                      <td>{fmtI.format(DEMO.cTot[0])}</td>
                      <td>{fmtI.format(DEMO.cTot[1])}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div id="zemList">
                {DEMO.countries.map(([nm, d, o]) => (
                  <div className="jrow" key={nm}>
                    <span className="jn">{countryName(nm)}</span>
                    <span className="zbar"><span style={{ width: Math.max(1, d / zemMax * 100) + '%' }} /></span>
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
                  {/* Marked as a residual by SHAPE, not by fading. At opacity .5
                      over the #EDEFE9 track this composited to rgb(133,159,185):
                      2,37:1 against the track and 2,67:1 against the body, which
                      made its right edge — the datum — the faintest edge in the
                      panel, on what its own note calls the widest bar on screen.
                      The twelve country bars beside it measure 4,07:1, and this
                      same panel already applied the 3:1 floor to its stacks
                      ("the visible top of the bar was invisible and the value
                      read short") and to its swatches. It keeps the country
                      bars' .75 and takes a dashed edge instead, which says
                      "not one of the twelve" without saying it in contrast. */}
                  <span className="zbar"><span className="zrem" style={{ width: Math.max(1, zemRem[0] / zemMax * 100) + '%' }} /></span>
                  <span className="jv">{'+' + fmtI.format(zemRem[0])}</span>
                  <span className="jv">{'−' + fmtI.format(zemRem[1])}</span>
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
              <svg id="citzSvg" viewBox={`0 0 ${w} ${h}`} role="img" aria-describedby="citzTable" aria-label={L('Doseljeni i odseljeni prema državljanstvu', 'Arrivals and departures by citizenship')}>
                {chart!.bars}
                {chart!.frames}
                {/* through the formatter, not `{yr}.` — the trailing dot is a
                    Croatian ordinal and this axis printed it in both languages.
                    The parameter was shadowing the imported `yr` helper, which is
                    why the literal was reached for in the first place. */}
                {yy.map(v => (
                  <text key={v} className={'cyr' + (v === y ? ' on' : '')}
                    x={chart!.x(v)! + chart!.x.bandwidth() / 2} y={h - 3} textAnchor="middle" fontSize="0.5625rem"
                    fontFamily="var(--mono)" fontWeight={v === y ? 600 : 400}
                    /* --ink, not --acc. Teal at 9 px weight 600 is 4,72:1 over
                       the panel at BEST, and this body is 94 % panel plus 6 % of
                       whatever the map shows under the dock: measured 4,28:1 with
                       a Tokovi hub beneath it and 4,31:1 over the deepest fills,
                       under the 4,5:1 AA asks of text this size. The margin over
                       sea was 0,22, so any content under the translucent body
                       sank it. YearsView removed this exact construction from its
                       column labels for this exact reason — keep teal on --panel
                       or larger than 18 px — and the weight and the 1,4 px
                       .citz-frame already mark which year is selected. */
                    fill={v === y ? 'var(--ink)' : 'var(--mut)'}>{yrOf(v)}</text>
                ))}
                <line x1={mL} x2={w - mR} y1={chart!.y0} y2={chart!.y0} stroke="var(--ink)" strokeWidth={0.8} />
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
              {/* …and the same figures as a table, the way #ageSvg has
                  #ageTable. .citz-rows is a CSS grid of spans: nothing in it
                  says which column is arrivals and which departures, so the
                  leading + or − was the only signal, and a reader navigating by
                  column had nothing to navigate. The div takes .sr-only and not
                  the table, for the reason AgePanel records: a table reads
                  width:1px as a minimum and would leave a real box in the page
                  for the overlay sweeps to find. */}
              <div className="sr-only" id="citzTable">
                <table>
                  <caption>{L(`Vanjska migracija prema državljanstvu, ${yrOf(y)}`,
                    `External migration by citizenship, ${yrOf(y)}`)}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{L('Skupina', 'Group')}</th>
                      <th scope="col">{L('doseljeni', 'arrivals')}</th>
                      <th scope="col">{L('odseljeni', 'departures')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cgroups().map(([k, lab]) => (
                      <tr key={k}>
                        <th scope="row">{lab}</th>
                        <td>{fmtI.format(CIT.g[k].d[ci])}</td>
                        <td>{fmtI.format(CIT.g[k].o[ci])}</td>
                      </tr>
                    ))}
                    <tr>
                      <th scope="row">{L('Ukupno', 'Total')}</th>
                      <td>{fmtI.format(td)}</td>
                      <td>{fmtI.format(to)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* the visible half; the announcement is #citzClamp, mounted with
                  the card so it can register before it speaks */}
              <div className="citz-clamp" aria-hidden="true">
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
