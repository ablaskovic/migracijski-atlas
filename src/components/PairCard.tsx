import { useId } from 'react';
import { scaleLinear } from 'd3-scale';
import { area, line, curveMonotoneX } from 'd3-shape';
import { YEARS, Y0, YEND, IX2018, SHORTN, getOD, fsum, badgeText, flowBadge, flowKind, fmtI, sgn } from '../lib/metrics.ts';
import { focusSoon } from '../lib/state.ts';
import { L, yr, yrSpan } from '../lib/i18n.ts';
import type { Patch, State } from '../lib/types.ts';

/* Corridor card: the annual series of one directed pair (sel ⇄ pair) from ODM.
   Opened by clicking a partner row in the Tokovi rail (a map click keeps
   re-hubbing) or a cell / corridor row in Matrica, where it opens in place.
   2018 is the only measured point — ringed like the scrubber's realMark.

   Two mounts, one active: over the map in Tokovi, inside the rail in Matrica.
   A floating card is free over a map (it lands on sea) and expensive over a
   heatmap — measured at 960 px it covered ~12 columns × 9 rows of live cells,
   and steering the grid around it drops the cell to ~10 px, under the 12 px
   floor. See MapView/Rail for the mounts. */
export default function PairCard({ S, setS }: { S: State; setS: (p: Patch) => void }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const sel = S.sel, pair = S.pair;
  if ((S.view !== 'flow' && S.view !== 'mx') || !sel || !pair || pair === sel) return null;
  /* In Matrica the corridor *is* the selection, so closing the card clears both
     halves — a lone `sel` there is a hub with no view to be a hub in. Focus goes
     back to the cell that opened it; in Tokovi, to the partner row. */
  const inMx = S.view === 'mx';
  const close = () => {
    setS(inMx ? { sel: null, pair: null } : { pair: null });
    focusSoon(inMx ? `.mxc[data-a="${sel}"][data-b="${pair}"], #railList .rrow[data-iso="${pair}"]`
      : `#railList .rrow[data-iso="${pair}"]`);
  };

  const outs = YEARS.map((_, i) => getOD(sel, pair, i));
  const ins = YEARS.map((_, i) => getOD(pair, sel, i));
  const nets = YEARS.map((_, i) => ins[i] - outs[i]);
  const w = 284, h = 110, mL = 4, mR = 4, mT = 8, mB = 14;
  const m = Math.max(...outs, ...ins, ...nets.map(Math.abs)) || 1;
  const x = scaleLinear().domain([Y0, YEND]).range([mL, w - mR]);
  const y = scaleLinear().domain([-m, m]).range([h - mB, mT]);
  const areaG = area<number>().x((_, i) => x(YEARS[i])).y0(y(0)).y1(v => y(v)).curve(curveMonotoneX);
  const lineG = line<number>().x((_, i) => x(YEARS[i])).y(v => y(v)).curve(curveMonotoneX);
  const cx = x(YEARS[S.yi]);

  return (
    <div className="paircard" id="pair">
      <div className="card-hd">
        <h2 className="card-name" id="pairName">{SHORTN[sel]} ⇄ {SHORTN[pair]}</h2>
        {/* back to whatever opened this corridor — matrix cell or partner row */}
        <button className="card-x" id="pairX"
          aria-label={L(`Zatvori koridor — ${SHORTN[sel]} i ${SHORTN[pair]}`, `Close the corridor — ${SHORTN[sel]} and ${SHORTN[pair]}`)}
          onClick={close}>×</button>
      </div>
      {/* The two series were separated by hue alone and the caption named them
          by colour — 1.4.1, and measured the two hues are only 1.39:1 apart in
          luminance, so in greyscale or to a deuteranope this is one line
          crossing itself. Every sibling chart here already encodes with shape;
          dolasci now carries a dash, and the caption says so. */}
      {/* "neto za Istarska (površina) · odlasci · dolasci" described the card as
          if it were about the county: a reader who clicked one 31-person cell in
          the matrix was told the chart showed Istarska's odlasci. Every series
          here is this corridor and nothing else, so the caption names both
          endpoints in the direction each series runs. */}
      <div className="card-sub">{L(`godišnji tok ${yrSpan(Y0, YEND)}, samo ovaj koridor · površina: neto za ${SHORTN[sel]} · puna crta: ${SHORTN[sel]} → ${SHORTN[pair]} · crtkano: ${SHORTN[pair]} → ${SHORTN[sel]}`,
        `annual flow ${yrSpan(Y0, YEND)}, this corridor only · area: net for ${SHORTN[sel]} · solid line: ${SHORTN[sel]} → ${SHORTN[pair]} · dashed: ${SHORTN[pair]} → ${SHORTN[sel]}`)}</div>
      <svg id="pairSvg" viewBox={`0 0 ${w} ${h}`} role="img"
        aria-label={L(`Koridor ${SHORTN[sel]} i ${SHORTN[pair]} — samo selidbe između te dvije županije, ne ukupni tokovi županije. Godišnji tok ${yrSpan(Y0, YEND)}, raspon ±${fmtI.format(m)}. Vrijednosti za odabranu godinu su ispod grafikona.`,
          `Corridor ${SHORTN[sel]} and ${SHORTN[pair]} — only moves between these two counties, not the county's total flows. Annual flow ${yrSpan(Y0, YEND)}, range ±${fmtI.format(m)}. The selected year's values are below the chart.`)}>
        <defs>
          <clipPath id={uid + 'p'}><rect width={w} height={y(0)} /></clipPath>
          <clipPath id={uid + 'n'}><rect y={y(0)} width={w} height={h - y(0)} /></clipPath>
        </defs>
        <path d={areaG(nets)!} fill="#1D4E89" opacity={0.28} clipPath={`url(#${uid}p)`} />
        <path d={areaG(nets)!} fill="#B5341F" opacity={0.28} clipPath={`url(#${uid}n)`} />
        <line x1={mL} x2={w - mR} y1={y(0)} y2={y(0)} stroke="var(--line)" />
        <path d={lineG(outs)!} fill="none" stroke="#B5341F" strokeWidth={1.3} />
        <path d={lineG(ins)!} fill="none" stroke="#1D4E89" strokeWidth={1.3} strokeDasharray="4 2.5" />
        <circle cx={x(2018)} cy={h - mB} r={3} fill="none" stroke="var(--acc)" strokeWidth={1.5} />
        {[2000, 2010, 2020].map(t => (
          <text key={t} x={x(t)} y={h - 3} textAnchor="middle" fontSize={8.5}
            fontFamily="var(--mono)" fill="var(--mut)">{yr(t)}</text>
        ))}
        <text x={w - mR} y={mT + 2} textAnchor="end" fontSize={8.5}
          fontFamily="var(--mono)" fill="var(--mut)">{'±' + fmtI.format(m)}</text>
        <line y1={mT} y2={h - mB} stroke="var(--acc)" strokeWidth={1.4} x1={cx} x2={cx} />
      </svg>
      {/* The readout row is the figure the reader compares against the rail row
          they clicked, so it has to be scoped the way that ranking is. It read
          `outs[S.yi]` — the raw annual ODM cell — and hardcoded `false` for cum
          in both flowKind and flowBadge, while every sibling passes S.cum
          (Legend's mxMax, Rail's mxCell, Tooltip's fsum). Measured at
          `#v=mx&c=1&y=2024&s=HR-14&pp=HR-21`: the rail directly above the card
          reads "+5.539", the legend "2011.–2024." and the scrubber "kumulativna
          procjena", while the card printed "2024. · → 463 · ← 213 · neto −250" —
          the cumulative figure the reader clicked on no surface of the card, and
          −250 is 22× smaller. At y=2018 in the same mode it printed a solid
          IZMJERENO pill two centimetres from a legend saying the view is an
          estimate. The plotted series stays annual: it is a time series and its
          sub-caption says so. */}
      <div className="pair-row" id="pairRow">
        <span>{S.cum ? yrSpan(2011, YEARS[S.yi]) : yr(YEARS[S.yi])} · → {fmtI.format(fsum(sel, pair, S.yi, S.cum))} · ← {fmtI.format(fsum(pair, sel, S.yi, S.cum))}{L(' · neto ', ' · net ')}{sgn(fsum(pair, sel, S.yi, S.cum) - fsum(sel, pair, S.yi, S.cum), fmtI)}</span>
        <span className={'cls-tag ' + (S.cum ? 'est' : flowKind(S.yi, S.cum))}>{S.cum ? badgeText('cum') : flowBadge(S.yi, S.cum)}</span>
      </div>
      {/* only one branch of this ternary used to be localized — and the flow
          first-entry jump lands on 2018, so the untranslated one is the branch an
          English reader meets first */}
      <div className="pair-note">{S.yi === IX2018
        ? L('Jedina godina s izmjerenom matricom tokova.', 'The only year with a measured flow matrix.')
        : L('Točka 2018. je izmjerena; ostale su godine IPF procjena na DZS marginama.',
          'The 2018 point is measured; the other years are IPF estimates on CBS margins.')}</div>
    </div>
  );
}
