import { JLS, ISOS, D, SHORTN, fmtI } from '../lib/metrics.ts';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { L } from '../lib/i18n.ts';
import type { JlsRow, Patch, State } from '../lib/types.ts';

export default function JlsCard({ S, setS, toggleJls }: {
  S: State; setS: (p: Patch) => void; toggleJls: () => void;
}) {
  const on = S.view === 'flow' && !!S.sel && !!JLS.c[S.sel];
  const open = on && S.jls;

  let rows: JlsRow[] = [], cap = '';
  if (open) {
    const dd = JLS.c[S.sel!];
    if (S.jlsTab === 'loc') { rows = dd.loc; cap = L('najveći koridori unutar županije', 'largest corridors within the county'); }
    else if (S.dir === 'out') { rows = dd.out; cap = L('najveći odlazni koridori', 'largest outbound corridors'); }
    else if (S.dir === 'in') { rows = dd.in; cap = L('najveći dolazni koridori', 'largest inbound corridors'); }
    else { rows = dd.out.concat(dd.in).slice().sort((a, b) => b[2] - a[2]).slice(0, 12); cap = L('najveći bruto koridori (JLS neto nije objavljen)', 'largest gross corridors (LAU net is not published)'); }
  }
  const tag = (j: number) => {
    const iso = ISOS[JLS.names[j][1]];
    return iso === S.sel ? null : <span className="jc"> {SHORTN[iso]}</span>;
  };
  const onKey = (e: ReactKeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleJls(); } };

  return (
    /* inert under the open glossary: .jcard and .helpcard share top:14/left:16
       and the glossary is wider and above it, so #jcardHd was fully covered and
       still a tab stop (2.4.11) */
    <div className={'chipcard jcard' + (on ? ' show' : '') + (open ? ' open' : '')} id="jcard"
      inert={S.help || undefined}>
      <div className="chip-hd" id="jcardHd" role="button" tabIndex={0} aria-expanded={open}
        onClick={toggleJls} onKeyDown={onKey}>
        {/* decorative: the state is already in aria-expanded, so announcing
            "▸ JLS koridori, collapsed" just reads the glyph out loud */}
        <span className="chip-arr" aria-hidden="true">▸</span>
        {/* scope in the collapsed header, matching the Državljanstvo / Dob chips
            — otherwise this one chip hides its year and status until opened */}
        <span id="jcardTitle">{on ? 'JLS koridori · ' + (D[S.sel!]?.n || '') : 'JLS koridori'}
          {!open && <span className="chip-more"> · 2018. · izmjereno</span>}</span>
      </div>
      {open && (
        <div className="chip-body">
          <div className="jcard-cap" id="jcardCap">{cap + ' · 2018. · izmjereno'}</div>
          <div className="jtabs" id="jlsTabs">
            <button data-v="inter" aria-pressed={S.jlsTab === 'inter'} onClick={() => setS({ jlsTab: 'inter' })}>{L('Među županijama', 'Between counties')}</button>
            <button data-v="loc" aria-pressed={S.jlsTab === 'loc'} onClick={() => setS({ jlsTab: 'loc' })}>{L('Unutar županije', 'Within the county')}</button>
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
                  {S.jlsTab === 'loc'
                    ? L('Jedna JLS — nema koridora unutar županije.', 'A single LAU — no corridors within the county.')
                    : L('Nema zabilježenih koridora prema drugim županijama.', 'No recorded corridors to other counties.')}
                </span>
              </div>
            )}
          </div>
          <div className="jls-note">{L('Jedina godina s mjerenim tokovima na razini gradova/općina (DZS posebna obrada; Pitoski i sur. 2021., CC BY). Vremenska vrpca ne mijenja ovaj popis.',
          'The only year with measured flows at town/municipality level (CBS special processing; Pitoski et al. 2021, CC BY). The time scrubber does not change this list.')}</div>
        </div>
      )}
    </div>
  );
}
