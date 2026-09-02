import { DEMO, fmtI } from '../lib/metrics.ts';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { L, yr } from '../lib/i18n.ts';
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
        <span>{L('Dob i spol', 'Age and sex')}<span className="chip-more">{L(` · RH · ${DEMO.year}.`, ` · Croatia · ${DEMO.year}`)}</span></span>
      </div>
      {open && (
        <div className="chip-body">
          <div className="jcard-cap">
            {ext ? L('vanjska migracija po starosti · odseljeni (lijevo) / doseljeni (desno)',
              'external migration by age · departures (left) / arrivals (right)')
              : L('preseljeni unutar RH po starosti (sve razine)',
                'moves within Croatia by age (all levels)')}
          </div>
          <div className="jtabs" id="ageTabs">
            <button data-v="ext" aria-pressed={ext} onClick={() => setS({ ageTab: 'ext' })}>{L('Vanjska', 'External')}</button>
            <button data-v="int" aria-pressed={!ext} onClick={() => setS({ ageTab: 'int' })}>{L('Unutarnja', 'Internal')}</button>
          </div>
          <svg id="ageSvg" viewBox={`0 0 ${w} ${h}`} role="img" aria-describedby="ageTable"
            aria-label={ext ? L('Vanjska migracija prema starosti', 'External migration by age')
              : L('Unutarnja migracija prema starosti', 'Internal migration by age')}>
            {ext ? (
              <>
                <text x={cx - gap - 2} y={mT - 5} textAnchor="end" fontSize="0.5rem"
                  fontFamily="var(--mono)" fill="#B5341F">{L('− odseljeni', '− departures')}</text>
                <text x={cx + gap + 2} y={mT - 5} fontSize="0.5rem"
                  fontFamily="var(--mono)" fill="#1D4E89">{L('doseljeni +', 'arrivals +')}</text>
              </>
            ) : (
              <text x={cx + gap + 2} y={mT - 5} fontSize="0.5rem"
                fontFamily="var(--mono)" fill="var(--mut)">{L('preseljeni', 'moves')}</text>
            )}
            {DEMO.ages.map((a, i) => {
              const r = n - 1 - i;                      /* oldest on top */
              const y = mT + r * rowH;
              const hl = i === peakIx;
              return (
                <g key={a}>
                  <text x={cx} y={y + rowH - 2.5} textAnchor="middle" fontSize="0.46875rem"
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
          {/* The 32 bars are the whole of this chart, and they existed only as
              rect widths: role="img" collapses the figure to its one name, the
              band labels 0–4 … 75+ are inside it and hidden with it, and the
              readout below gives two totals and the peak. So a screen-reader
              reader could learn that 25–29 is the largest band and not how many
              60–64-year-olds left — which is the question a pyramid is drawn to
              answer. Every sibling chart here (#cardSvg, #pairSvg, #citzSvg) has
              a text readout of its plotted values; this one had none for any
              band. A table rather than a <desc>, because sixteen rows of two
              numbers is a table, and AT can navigate one by row and column
              instead of hearing a single run-on string. aria-describedby ties it
              to the figure so the two are met together. */}
          {/* the div takes .sr-only, not the table: a table treats width:1px as a
              MINIMUM, so the class alone left a 292×360 absolutely-positioned box
              in the page — clipped to nothing visually, but still a rect the
              overlay sweeps would measure */}
          <div className="sr-only" id="ageTable">
          <table>
            <caption>{ext
              ? L('Vanjska migracija prema dobnoj skupini, ' + DEMO.year + '.',
                'External migration by age band, ' + DEMO.year)
              : L('Unutarnja migracija prema dobnoj skupini, ' + DEMO.year + '.',
                'Internal migration by age band, ' + DEMO.year)}</caption>
            <thead>
              <tr>
                <th scope="col">{L('Dobna skupina', 'Age band')}</th>
                {ext ? (
                  <>
                    <th scope="col">{L('doseljeni', 'arrivals')}</th>
                    <th scope="col">{L('odseljeni', 'departures')}</th>
                  </>
                ) : <th scope="col">{L('preseljeni', 'moves')}</th>}
              </tr>
            </thead>
            <tbody>
              {DEMO.ages.map((band, i) => (
                <tr key={band}>
                  <th scope="row">{band}</th>
                  {ext ? (
                    <>
                      <td>{fmtI.format(DEMO.ext.d[i])}</td>
                      <td>{fmtI.format(DEMO.ext.o[i])}</td>
                    </>
                  ) : <td>{fmtI.format(DEMO.intm[i])}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="age-rows" id="ageRows">
            {ext ? (
              <>
                <span>{L('doseljeni ', 'arrivals ')}<b>{'+' + fmtI.format(DEMO.cTot[0])}</b> · {Math.round(100 * DEMO.extM.d / DEMO.cTot[0])}{L(' % muškarci', ' % men')}</span>
                <span>{L('odseljeni ', 'departures ')}<b>{'−' + fmtI.format(DEMO.cTot[1])}</b> · {Math.round(100 * DEMO.extM.o / DEMO.cTot[1])}{L(' % muškarci', ' % men')}</span>
                <span>{L('vrh: ', 'peak: ')}<b>{DEMO.ages[peakIx]}</b> ({fmtI.format(DEMO.ext.d[peakIx])}{L(' doseljenih)', ' arrivals)')}</span>
              </>
            ) : (
              <>
                <span>{L('preseljeno ', 'moves ')}<b>{fmtI.format(DEMO.intTot)}</b> · {Math.round(100 * (1 - DEMO.intM / DEMO.intTot))}{L(' % žene', ' % women')}</span>
                <span>{L('vrh: ', 'peak: ')}<b>{DEMO.ages[peakIx]}</b> ({fmtI.format(DEMO.intm[peakIx])}{L(' preseljenih)', ' moves)')}</span>
              </>
            )}
          </div>
          <div className="citz-note" id="ageNote">
            {L(`DZS STAN-2026-2-1 (t. I 3 / II 2) · objavljeno samo za ${yr(DEMO.year)} — vremenska vrpca ne mijenja ovaj prikaz.`,
              `CBS STAN-2026-2-1 (t. I 3 / II 2) · published for ${yr(DEMO.year)} only — the time scrubber does not change this view.`)}
          </div>
        </div>
      )}
    </div>
  );
}
