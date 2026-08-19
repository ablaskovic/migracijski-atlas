import { useId } from 'react';
import { scaleLinear } from 'd3-scale';
import { area, line, curveMonotoneX } from 'd3-shape';
import { YEARS, Y0, YEND, D, netAt, natAt, fmtI, sgn } from '../lib/metrics.ts';
import { focusSoon } from '../lib/state.ts';
import { L, yr, yrSpan } from '../lib/i18n.ts';
import type { Patch, State } from '../lib/types.ts';

export default function DetailCard({ S, setS }: { S: State; setS: (p: Patch) => void }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const sel = S.sel;
  /* `sel` is a hub in Tokovi and, since corridors open in place, a corridor's row
     in Matrica — neither is a county the county card can describe. Rendering it
     in Matrica put a 1998–2025 county card beside the 21×21 grid for a county the
     user never picked (they picked a *pair*), which is the same defect the
     v2.0.5 "sel dies entering Matrica" rule fixed, arriving by a new route.
     Godine is excluded on a different argument: `sel` never survives into it
     (setView and decodeHash both drop it), and the card would be redundant even
     if it did — a row of that grid *is* this chart, for every county at once. */
  if (!sel || S.view === 'flow' || S.view === 'mx' || S.view === 'yrs') return <div className="card" id="card" />;

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
    /* inert while the glossary is open: .helpcard and .card share top:14/left:16
       and the glossary is both wider and above on z-index, so #cardX was 100 %
       covered and still a tab stop — a control a sighted keyboard user cannot
       see (2.4.11). */
    <div className="card show" id="card" inert={S.help || undefined}>
      <div className="card-hd">
        <h2 className="card-name" id="cardName">{D[sel].n}</h2>
        {/* hand focus to the county this card described, else its rail row —
            closing used to drop focus to <body> and restart Tab from the top */}
        <button className="card-x" id="cardX" aria-label={L(`Zatvori karticu — ${D[sel].n}`, `Close the card — ${D[sel].n}`)}
          onClick={() => { setS({ sel: null }); focusSoon(`.cnt[data-iso="${sel}"], #railList .rrow[data-iso="${sel}"]`); }}>×</button>
      </div>
      <div className="card-sub" id="cardSub">{L(`godišnji saldo ${yrSpan(Y0, YEND)} · vanjske (površina) · unutarnje (crta) · prirodni prirast (crtkano)`,
        `annual net ${yrSpan(Y0, YEND)} · external (area) · internal (line) · natural change (dashed)`)}</div>
      {/* an unlabelled <svg> exposes its tick <text> children as loose strings in
          the reading order; role=img + a name collapses them into one figure */}
      <svg id="cardSvg" viewBox={`0 0 ${w} ${h}`} role="img"
        aria-label={L(`${D[sel].n} — godišnji saldo ${yrSpan(Y0, YEND)}, raspon ±${fmtI.format(m)}. Vrijednosti za odabranu godinu su ispod grafikona.`,
          `${D[sel].n} — annual net ${yrSpan(Y0, YEND)}, range ±${fmtI.format(m)}. The selected year's values are below the chart.`)}>
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
        <span className="cy">{yr(YEARS[S.yi])}</span>
        <span>{L('unut. ', 'internal ')}<b>{sgn(ints[S.yi], fmtI)}</b></span>
        <span>{L('vanj. ', 'external ')}<b>{sgn(exts[S.yi], fmtI)}</b></span>
        <span>{L('prir. ', 'natural ')}<b>{sgn(nats[S.yi], fmtI)}</b></span>
        {/* "uk." reads as ukupna promjena broja stanovnika — the one reading the
            tooltip, the legend and the glossary are all careful to deny. Name the
            two components instead, and carry the same caveat they carry. */}
        <span>{L('mig.+prir. ', 'mig.+nat. ')}<b>{sgn(ints[S.yi] + exts[S.yi] + nats[S.yi], fmtI)}</b></span>
      </div>
      {/* the caveat the tooltip, the legend and the glossary all carry: this is
          an identity sum of two published components, not DZS total population
          change. Unreadable, it is an unlabelled claim rather than a caveat. */}
      <div className="card-note" id="cardNote">
        {L('Zbroj dviju objavljenih sastavnica — nije ukupna promjena broja stanovnika.',
          'The sum of two published components — not total population change.')}
      </div>
    </div>
  );
}
