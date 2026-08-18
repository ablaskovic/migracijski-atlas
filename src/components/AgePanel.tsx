import { DEMO, fmtI } from '../lib/metrics.ts';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { L } from '../lib/i18n.ts';
import type { Patch, State } from '../lib/types.ts';

/* Dob i spol — who is actually moving. National, 2025 only (I T3 / II T2 are
   published per priopćenje year, not as a series). Classic pyramid layout:
   oldest on top, odseljeni left (vermilion) / doseljeni right (indigo). */
export default function AgePanel({ S, setS, toggleAge }: {
  S: State; setS: (p: Patch) => void; toggleAge: () => void;
}) {
  const open = S.age;
  const ext = S.ageTab === 'ext';
  const w = 276, rowH = 9.5, mT = 14, mB = 4;
  const n = DEMO.ages.length;
  const h = mT + n * rowH + mB;
  const cx = w / 2, gap = 21, span = cx - gap - 6;
  const mExt = Math.max(...DEMO.ext.d, ...DEMO.ext.o);
  const mInt = Math.max(...DEMO.intm);
  const peakIx = (ext ? DEMO.ext.d : DEMO.intm).indexOf(ext ? Math.max(...DEMO.ext.d) : mInt);

  const onKey = (e: ReactKeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAge(); } };

  return (
    <div className={'chipcard agec' + (open ? ' open' : '')} id="agec">
      <div className="chip-hd" id="ageHd" role="button" tabIndex={0} aria-expanded={open}
        onClick={toggleAge} onKeyDown={onKey}>
        <span className="chip-arr" aria-hidden="true">▸</span>
        <span>{L('Dob i spol', 'Age and sex')}<span className="chip-more">{` · RH · ${DEMO.year}.`}</span></span>
      </div>
      {open && (
        <div className="chip-body">
          <div className="jcard-cap">
            {ext ? 'vanjska migracija po starosti · odseljeni (lijevo) / doseljeni (desno)'
              : 'preseljeni unutar RH po starosti (sve razine)'}
          </div>
          <div className="jtabs" id="ageTabs">
            <button data-v="ext" aria-pressed={ext} onClick={() => setS({ ageTab: 'ext' })}>{L('Vanjska', 'External')}</button>
            <button data-v="int" aria-pressed={!ext} onClick={() => setS({ ageTab: 'int' })}>{L('Unutarnja', 'Internal')}</button>
          </div>
          <svg id="ageSvg" viewBox={`0 0 ${w} ${h}`} role="img"
            aria-label={ext ? 'Vanjska migracija prema starosti' : 'Unutarnja migracija prema starosti'}>
            {ext ? (
              <>
                <text x={cx - gap - 2} y={mT - 5} textAnchor="end" fontSize={8}
                  fontFamily="var(--mono)" fill="#B5341F">{'− odseljeni'}</text>
                <text x={cx + gap + 2} y={mT - 5} fontSize={8}
                  fontFamily="var(--mono)" fill="#1D4E89">{'doseljeni +'}</text>
              </>
            ) : (
              <text x={cx + gap + 2} y={mT - 5} fontSize={8}
                fontFamily="var(--mono)" fill="var(--mut)">{'preseljeni'}</text>
            )}
            {DEMO.ages.map((a, i) => {
              const r = n - 1 - i;                      /* oldest on top */
              const y = mT + r * rowH;
              const hl = i === peakIx;
              return (
                <g key={a}>
                  <text x={cx} y={y + rowH - 2.5} textAnchor="middle" fontSize={7.5}
                    fontFamily="var(--mono)" fontWeight={hl ? 700 : 400}
                    fill={hl ? 'var(--ink)' : 'var(--mut)'}>{a}</text>
                  {ext ? (
                    <>
                      <rect x={cx - gap - DEMO.ext.o[i] / mExt * span} y={y + 1}
                        width={DEMO.ext.o[i] / mExt * span} height={rowH - 2.5} fill="#B5341F" opacity={0.75} />
                      <rect x={cx + gap} y={y + 1}
                        width={DEMO.ext.d[i] / mExt * span} height={rowH - 2.5} fill="#1D4E89" opacity={0.75} />
                    </>
                  ) : (
                    <rect x={cx + gap} y={y + 1}
                      width={DEMO.intm[i] / mInt * span} height={rowH - 2.5} fill="#20262B" opacity={0.68} />
                  )}
                </g>
              );
            })}
          </svg>
          <div className="age-rows" id="ageRows">
            {ext ? (
              <>
                <span>{L('doseljeni ', 'arrivals ')}<b>{'+' + fmtI.format(DEMO.cTot[0])}</b> · {Math.round(100 * DEMO.extM.d / DEMO.cTot[0])} % muškarci</span>
                <span>{L('odseljeni ', 'departures ')}<b>{'−' + fmtI.format(DEMO.cTot[1])}</b> · {Math.round(100 * DEMO.extM.o / DEMO.cTot[1])} % muškarci</span>
                <span>vrh: <b>{DEMO.ages[peakIx]}</b> ({fmtI.format(DEMO.ext.d[peakIx])} doseljenih)</span>
              </>
            ) : (
              <>
                <span>{L('preseljeno ', 'moves ')}<b>{fmtI.format(DEMO.intTot)}</b> · {Math.round(100 * (1 - DEMO.intM / DEMO.intTot))} % žene</span>
                <span>vrh: <b>{DEMO.ages[peakIx]}</b> ({fmtI.format(DEMO.intm[peakIx])} preseljenih)</span>
              </>
            )}
          </div>
          <div className="citz-note" id="ageNote">
            {`DZS STAN-2026-2-1 (t. I 3 / II 2) · objavljeno samo za ${DEMO.year}. — vremenska vrpca ne mijenja ovaj prikaz.`}
          </div>
        </div>
      )}
    </div>
  );
}
