import { REG, SHORTN, MXORD, mxCell, mxMax, divScale, seqScale, fmtI } from '../lib/metrics.ts';
import { moveTip } from '../lib/tip.ts';
import type { Patch, State } from '../lib/types.ts';

/* 21×21 OD heatmap — the whole gravity structure at once (the star chart in
   Tokovi shows one county at a time). Rows keep tokovi semantics per Smjer:
   out = row→col, in = col→row, net = row's gain from col. Region blocks are
   separated by heavier rules; the diagonal (within-county moves) is not in the
   county matrix and is hatched out. Renders as svg#map so PNG/SVG export works. */

const MONO = 'IBM Plex Mono,ui-monospace,monospace';
/* region block boundaries as county counts along MXORD */
const BLOCKS: number[] = [];
{
  let acc = 0;
  for (const k of Object.keys(REG)) { acc += REG[k].c.length; BLOCKS.push(acc); }
}

export default function MatrixView({ S, setS, size }: {
  S: State; setS: (p: Patch) => void; size: { w: number; h: number };
}) {
  const n = MXORD.length;
  /* PADB reserves room for the legend/story band under the grid */
  const LBL = 108, TOPL = 90, PADR = 14, PADB = 40;
  const cell = Math.max(8, Math.min((size.w - LBL - PADR) / n, (size.h - TOPL - PADB) / n));
  /* center the grid in the leftover width so the legend (bottom-left) stays clear */
  const x0 = LBL + Math.max(0, (size.w - LBL - PADR - n * cell) / 2), y0 = TOPL;
  const m = mxMax(S.dir, S.cum);
  const col = S.dir === 'net' ? divScale(m) : seqScale(m, S.dir);
  const showNum = cell >= 22;
  const hl = S.pairHl;

  const cells = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const a = MXORD[r], b = MXORD[c];
      if (a === b) {
        cells.push(<rect key={a + b} x={x0 + c * cell} y={y0 + r * cell} width={cell} height={cell}
          fill="url(#mxhatch)" />);
        continue;
      }
      const v = mxCell(a, b, S.dir, S.yi, S.cum);
      const isHl = !!hl && hl[0] === a && hl[1] === b;
      cells.push(
        <g key={a + b}>
          <rect className="mxc" data-a={a} data-b={b}
            x={x0 + c * cell} y={y0 + r * cell} width={cell} height={cell}
            fill={col(S.dir === 'net' ? v : Math.abs(v))}
            stroke={isHl ? '#20262B' : '#fff'} strokeWidth={isHl ? 1.6 : 0.5}
            onPointerEnter={() => setS({ pairHl: [a, b] })}
            onPointerLeave={() => setS({ pairHl: null })}
            onPointerMove={moveTip}
            onClick={() => setS({ view: 'flow', sel: a, pair: b, flowSeen: true, playing: false })} />
          {showNum && Math.abs(v) >= 1 && (
            <text x={x0 + c * cell + cell / 2} y={y0 + r * cell + cell / 2 + 2.5}
              textAnchor="middle" fontSize={Math.min(8.5, cell / 3)} fontFamily={MONO}
              fill={Math.abs(v) > 0.55 * m ? '#fff' : '#20262B'} pointerEvents="none">
              {fmtI.format(Math.round(v))}
            </text>
          )}
        </g>,
      );
    }
  }

  return (
    <svg id="map" role="img" aria-label="Matrica međužupanijskih tokova">
      <defs>
        <pattern id="mxhatch" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="#EDEFE9" />
          <line y2="5" stroke="#D9DDD6" strokeWidth="1" />
        </pattern>
      </defs>
      {MXORD.map((iso, r) => (
        <text key={'r' + iso} x={x0 - 6} y={y0 + r * cell + cell / 2 + 3} textAnchor="end"
          fontSize={Math.min(9.5, cell * 0.42)} fontFamily={MONO}
          fontWeight={hl && hl[0] === iso ? 600 : 400}
          fill={hl && hl[0] === iso ? '#20262B' : '#5F6A72'}>{SHORTN[iso]}</text>
      ))}
      {MXORD.map((iso, c) => (
        <text key={'c' + iso} textAnchor="start"
          fontSize={Math.min(9, cell * 0.4)} fontFamily={MONO}
          fontWeight={hl && hl[1] === iso ? 600 : 400}
          fill={hl && hl[1] === iso ? '#20262B' : '#5F6A72'}
          transform={`translate(${x0 + c * cell + cell / 2 + 3},${y0 - 6}) rotate(-65)`}>{SHORTN[iso]}</text>
      ))}
      {cells}
      {BLOCKS.slice(0, -1).map(b => (
        <g key={'b' + b}>
          <line x1={x0 + b * cell} x2={x0 + b * cell} y1={y0} y2={y0 + n * cell} stroke="#20262B" strokeWidth={1.1} />
          <line x1={x0} x2={x0 + n * cell} y1={y0 + b * cell} y2={y0 + b * cell} stroke="#20262B" strokeWidth={1.1} />
        </g>
      ))}
      <rect x={x0} y={y0} width={n * cell} height={n * cell} fill="none" stroke="#20262B" strokeWidth={1.1} />
    </svg>
  );
}
