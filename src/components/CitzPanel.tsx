import { scaleBand, scaleLinear } from 'd3-scale';
import { max } from 'd3-array';
import { CIT, CGROUPS, DEMO, YEARS, fmtI, sgn } from '../lib/metrics.ts';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';
import type { Patch, State } from '../lib/types.ts';

export default function CitzPanel({ S, setS, toggleCitz }: {
  S: State; setS: (p: Patch) => void; toggleCitz: () => void;
}) {
  const open = S.citz;
  const zem = S.citzTab === 'zem';
  const yy = CIT.years;
  const y = yy.includes(YEARS[S.yi]) ? YEARS[S.yi] : yy[yy.length - 1];
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
    for (const [k, , col] of CGROUPS) {
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
        <span className="chip-arr">▸</span>
        <span>Državljanstvo<span className="chip-more">{` · RH · ${yy[0]}.–${yy[yy.length - 1]}.`}</span></span>
      </div>
      {open && (
        <div className="chip-body">
          <div className="jcard-cap">
            {zem ? `zemlja podrijetla/odredišta · samo ${DEMO.year}. · najvećih 12 po doseljenima`
              : 'vanjska migracija prema zemlji državljanstva · doseljeni (gore) / odseljeni (dolje)'}
          </div>
          <div className="jtabs" id="citzTabs">
            <button data-v="grp" aria-pressed={!zem} onClick={() => setS({ citzTab: 'grp' })}>Skupine</button>
            <button data-v="zem" aria-pressed={zem} onClick={() => setS({ citzTab: 'zem' })}>{`Zemlje ${DEMO.year}.`}</button>
          </div>
          {zem ? (
            <>
              <div id="zemList">
                {DEMO.countries.map(([nm, d, o]) => (
                  <div className="jrow" key={nm}>
                    <span className="jn">{nm}</span>
                    <span className="zbar"><span style={{ width: Math.max(1, d / DEMO.countries[0][1] * 100) + '%' }} /></span>
                    <span className="jv">{'+' + fmtI.format(d)}</span>
                    <span className="jv">{'−' + fmtI.format(o)}</span>
                  </div>
                ))}
                <div className="jrow zt">
                  <span className="jn">Ukupno {DEMO.year}.</span>
                  <span className="zbar" />
                  <span className="jv">{'+' + fmtI.format(DEMO.cTot[0])}</span>
                  <span className="jv">{'−' + fmtI.format(DEMO.cTot[1])}</span>
                </div>
              </div>
              <div className="citz-note">{`Prema zemlji podrijetla/odredišta (ne državljanstvu) · DZS STAN-2026-2-1 (t. I 4) · objavljeno samo za ${DEMO.year}.`}</div>
            </>
          ) : (
            <>
              <svg id="citzSvg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Doseljeni i odseljeni prema državljanstvu">
                {bars}
                {yy.map(yr => (
                  <text key={yr} x={x(yr)! + x.bandwidth() / 2} y={h - 3} textAnchor="middle" fontSize={9}
                    fontFamily="var(--mono)" fontWeight={yr === y ? 600 : 400}
                    fill={yr === y ? 'var(--acc)' : 'var(--mut)'}>{yr}.</text>
                ))}
                <line x1={mL} x2={w - mR} y1={y0} y2={y0} stroke="var(--ink)" strokeWidth={0.8} />
              </svg>
              <div className="citz-rows" id="citzRows">
                {CGROUPS.map(([k, lab, col]) => (
                  <FragmentRow key={k} col={col} lab={lab} d={CIT.g[k].d[ci]} o={CIT.g[k].o[ci]} />
                ))}
                <span />
                <span className="ct">Ukupno {y}. · saldo {sgn(ts, fmtI)}</span>
                <span className="cv ct">{'+' + fmtI.format(td)}</span>
                <span className="cv ct">{'−' + fmtI.format(to)}</span>
              </div>
              <div className="citz-note" id="citzNote">{`Prema zemlji državljanstva · DZS STAN-2026-2-1 (t. 2) · odabir godine prati vremensku vrpcu unutar ${yy[0]}.–${yy[yy.length - 1]}.`}</div>
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
