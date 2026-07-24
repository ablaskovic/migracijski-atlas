import { JLS, ISOS, D, SHORTN, fmtI } from '../lib/metrics.ts';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { JlsRow, Patch, State } from '../lib/types.ts';

export default function JlsCard({ S, setS, toggleJls }: {
  S: State; setS: (p: Patch) => void; toggleJls: () => void;
}) {
  const on = S.view === 'flow' && !!S.sel && !!JLS.c[S.sel];
  const open = on && S.jls;

  let rows: JlsRow[] = [], cap = '';
  if (open) {
    const dd = JLS.c[S.sel!];
    if (S.jlsTab === 'loc') { rows = dd.loc; cap = 'najveći koridori unutar županije'; }
    else if (S.dir === 'out') { rows = dd.out; cap = 'najveći odlazni koridori'; }
    else if (S.dir === 'in') { rows = dd.in; cap = 'najveći dolazni koridori'; }
    else { rows = dd.out.concat(dd.in).slice().sort((a, b) => b[2] - a[2]).slice(0, 12); cap = 'najveći bruto koridori (JLS neto nije objavljen)'; }
  }
  const tag = (j: number) => {
    const iso = ISOS[JLS.names[j][1]];
    return iso === S.sel ? null : <span className="jc"> {SHORTN[iso]}</span>;
  };
  const onKey = (e: ReactKeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleJls(); } };

  return (
    <div className={'chipcard jcard' + (on ? ' show' : '') + (open ? ' open' : '')} id="jcard">
      <div className="chip-hd" id="jcardHd" role="button" tabIndex={0} aria-expanded={open}
        onClick={toggleJls} onKeyDown={onKey}>
        <span className="chip-arr">▸</span>
        <span id="jcardTitle">{on ? 'JLS koridori · ' + (D[S.sel!]?.n || '') : 'JLS koridori'}</span>
      </div>
      {open && (
        <div className="chip-body">
          <div className="jcard-cap" id="jcardCap">{cap + ' · 2018. · izmjereno'}</div>
          <div className="jtabs" id="jlsTabs">
            <button data-v="inter" aria-pressed={S.jlsTab === 'inter'} onClick={() => setS({ jlsTab: 'inter' })}>Među županijama</button>
            <button data-v="loc" aria-pressed={S.jlsTab === 'loc'} onClick={() => setS({ jlsTab: 'loc' })}>Unutar županije</button>
          </div>
          <div id="jcardList">
            {rows.length ? rows.map(([s, t, n], i) => (
              <div className="jrow" key={i}>
                <span className="jn">{JLS.names[s][0]}{tag(s)} → {JLS.names[t][0]}{tag(t)}</span>
                <span className="jv">{fmtI.format(n)}</span>
              </div>
            )) : (
              <div className="jrow">
                <span className="jn" style={{ color: 'var(--mut)' }}>
                  {S.jlsTab === 'loc' ? 'Jedna JLS — nema koridora unutar županije.' : '—'}
                </span>
              </div>
            )}
          </div>
          <div className="jls-note">Jedina godina s mjerenim tokovima na razini gradova/općina (DZS posebna obrada; Pitoski i sur. 2021., CC BY). Vremenska vrpca ne mijenja ovaj popis.</div>
        </div>
      )}
    </div>
  );
}
