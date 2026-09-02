import { JLS, ISOS, D, SHORTN, fmtI } from '../lib/metrics.ts';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { L, t, yr } from '../lib/i18n.ts';
import type { JlsRow, Patch, State } from '../lib/types.ts';

/* "· 2018. · izmjereno" was one hardcoded string appended to an already
   translated caption, so an English reader met "largest gross corridors (LAU net
   is not published) · 2018. · izmjereno". Composed from `yr()` and the badge
   dictionary instead, a translated caption can never carry an untranslated
   scope or honesty label again. */
const SCOPE = (): string => ' · ' + yr(2018) + ' · ' + t('badge.meas');

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
  /* …and not when the municipality IS the county. Grad Zagreb is both — a
     municipality at drill index 274 and SHORTN['HR-21'] — and it is the single
     most frequent corridor endpoint in the payload, so rows read "Velika Gorica
     → Grad Zagreb Grad Zagreb". Swept over all 21 counties × all three Smjer
     values: 423 of 756 rendered rows carried the doubling, in 20 of the 21
     counties; only s=HR-21 was clean, because there the first test already
     returns null. Rail renders the same fact and guards it by name, with a
     comment saying so and a check that encodes the rule — this is the surface
     that did not get it. */
  const tag = (j: number) => {
    const iso = ISOS[JLS.names[j][1]];
    if (iso === S.sel || JLS.names[j][0] === SHORTN[iso]) return null;
    return <span className="jc"> {SHORTN[iso]}</span>;
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
        {/* The scope was rendered only while collapsed, so opening the card
            removed a line from its own header and the chip shrank 26 px under
            the pointer that had just clicked it, at every width and in both
            languages. Both sibling chips render their scope unconditionally —
            and their caption repeats it, exactly as this one's does. */}
        <span id="jcardTitle">{L('JLS koridori', 'LAU corridors') + (on ? ' · ' + (D[S.sel!]?.n || '') : '')}
          <span className="chip-more">{SCOPE()}</span></span>
      </div>
      {open && (
        <div className="chip-body">
          <div className="jcard-cap" id="jcardCap">{cap + SCOPE()}</div>
          <div className="jtabs" id="jlsTabs">
            <button data-v="inter" aria-pressed={S.jlsTab === 'inter'} onClick={() => setS({ jlsTab: 'inter' })}>{L('Među županijama', 'Between counties')}</button>
            <button data-v="loc" aria-pressed={S.jlsTab === 'loc'} onClick={() => setS({ jlsTab: 'loc' })}>{L('Unutar županije', 'Within the county')}</button>
          </div>
          <div id="jcardList">
            {rows.length ? rows.map(([s, t, n], i) => (
              <div className="jrow" key={i}>
                {/* two municipality names and their county tags — lang="hr" */}
                <span className="jn" lang="hr">{JLS.names[s][0]}{tag(s)} → {JLS.names[t][0]}{tag(t)}</span>
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
