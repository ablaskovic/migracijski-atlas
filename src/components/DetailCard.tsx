import { useId } from 'react';
import { scaleLinear } from 'd3-scale';
import { area, line, curveMonotoneX } from 'd3-shape';
import { YEARS, Y0, YEND, D, netAt, natAt, fmtI, sgn } from '../lib/metrics.ts';
import { focusSoon } from '../lib/state.ts';
import type { Patch, State } from '../lib/types.ts';

export default function DetailCard({ S, setS }: { S: State; setS: (p: Patch) => void }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const sel = S.sel;
  if (!sel || S.view === 'flow') return <div className="card" id="card" />;

  const w = 284, h = 128, mL = 4, mR = 4, mT = 8, mB = 14;
  const ints = YEARS.map((_, i) => netAt(sel, i, 'int'));
  const exts = YEARS.map((_, i) => netAt(sel, i, 'ext'));
  const nats = YEARS.map((_, i) => natAt(sel, i));
  const m = Math.max(...ints.map(Math.abs), ...exts.map(Math.abs), ...nats.map(Math.abs)) || 1;
  const x = scaleLinear().domain([Y0, YEND]).range([mL, w - mR]);
  const y = scaleLinear().domain([-m, m]).range([h - mB, mT]);
  const areaG = area<number>().x((_, i) => x(YEARS[i])).y0(y(0)).y1(v => y(v)).curve(curveMonotoneX);
  const lineG = line<number>().x((_, i) => x(YEARS[i])).y(v => y(v)).curve(curveMonotoneX);
  const cx = x(YEARS[S.yi]);

  return (
    <div className="card show" id="card">
      <div className="card-hd">
        <span className="card-name" id="cardName">{D[sel].n}</span>
        {/* hand focus to the county this card described, else its rail row —
            closing used to drop focus to <body> and restart Tab from the top */}
        <button className="card-x" id="cardX" aria-label="Zatvori"
          onClick={() => { setS({ sel: null }); focusSoon(`.cnt[data-iso="${sel}"], #railList .rrow[data-iso="${sel}"]`); }}>×</button>
      </div>
      <div className="card-sub">{`godišnji saldo ${Y0}.–${YEND}. · vanjske (površina) · unutarnje (crta) · prirodni prirast (crtkano)`}</div>
      <svg id="cardSvg" viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <clipPath id={uid + 'p'}><rect width={w} height={y(0)} /></clipPath>
          <clipPath id={uid + 'n'}><rect y={y(0)} width={w} height={h - y(0)} /></clipPath>
        </defs>
        <path d={areaG(exts)!} fill="#1D4E89" opacity={0.5} clipPath={`url(#${uid}p)`} />
        <path d={areaG(exts)!} fill="#B5341F" opacity={0.5} clipPath={`url(#${uid}n)`} />
        <line x1={mL} x2={w - mR} y1={y(0)} y2={y(0)} stroke="var(--line)" />
        <path d={lineG(nats)!} fill="none" stroke="#8d968f" strokeWidth={1.2} strokeDasharray="3 3" />
        <path d={lineG(ints)!} fill="none" stroke="#20262B" strokeWidth={1.6} />
        {[2000, 2010, 2020].map(t => (
          <text key={t} x={x(t)} y={h - 3} textAnchor="middle" fontSize={8.5}
            fontFamily="var(--mono)" fill="var(--mut)">{t}.</text>
        ))}
        <text x={w - mR} y={mT + 2} textAnchor="end" fontSize={8.5}
          fontFamily="var(--mono)" fill="var(--mut)">{'±' + fmtI.format(m)}</text>
        <line id="cardCur" y1={mT} y2={h - mB} stroke="var(--acc)" strokeWidth={1.4} x1={cx} x2={cx} />
      </svg>
      <div className="card-row" id="cardRow">
        <span className="cy">{YEARS[S.yi]}.</span>
        <span>unut. <b>{sgn(ints[S.yi], fmtI)}</b></span>
        <span>vanj. <b>{sgn(exts[S.yi], fmtI)}</b></span>
        <span>prir. <b>{sgn(nats[S.yi], fmtI)}</b></span>
        <span>uk. <b>{sgn(ints[S.yi] + exts[S.yi] + nats[S.yi], fmtI)}</b></span>
      </div>
    </div>
  );
}
