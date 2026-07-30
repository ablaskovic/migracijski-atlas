import { useEffect, useRef, useState } from 'react';
import { fmtI, fmtR, Y0, YEND } from '../lib/metrics.ts';
import { exportPNG, exportSVG } from '../lib/exportPng.ts';
import { StorySelect } from './StoryBar.tsx';
import { focusSoon } from '../lib/state.ts';
import { PAPER, paperPending, paperSub } from '../lib/credits.ts';
import type { Patch, State, View } from '../lib/types.ts';

function Seg<T extends string>({ id, opts, value, onPick, off, title, labId, aria }: {
  id: string; opts: [T, string][]; value: T; onPick: (v: T) => void;
  off?: boolean; title?: string; labId?: string; aria?: string;
}) {
  /* `off` used to be opacity + pointer-events:none, which left the buttons in the
     tab order (focusable and Enter-activatable while looking dead) and killed
     hover on the very element carrying the explanation. `disabled` handles the
     first; .seg.off::after re-captures hover for the title, see index.css.
     role=group + a name: the visible .ctrl-lab beside each group ("Prikaz",
     "Sastavnica", …) was pure decoration to a screen reader, which heard seven
     indistinguishable runs of pressed/not-pressed buttons. */
  return (
    <div className={'seg' + (off ? ' off' : '')} id={id} title={off ? title : undefined}
      role="group" aria-labelledby={labId} aria-label={aria} aria-disabled={off || undefined}>
      {opts.map(([v, label]) => (
        <button key={v} data-v={v} aria-pressed={v === value} disabled={off}
          onClick={() => onPick(v)}>{label}</button>
      ))}
    </div>
  );
}

const OFF_TIP = 'Nije primjenjivo u ovom prikazu';

export default function Header({ S, setS, setView, setMode, applyStory, resetAll }: {
  S: State; setS: (p: Patch) => void; setView: (v: View) => void;
  setMode: (v: 'yr' | 'cum') => void; applyStory: (i: number) => void; resetAll: () => void;
}) {
  const [busy, setBusy] = useState(false);
  /* Which exporter failed, not just "something did". One shared flag meant an
     SVG failure lit "greška" on the PNG button — an error reported against the
     control that did not fail, while the one that did looked untouched. */
  const [err, setErr] = useState<'png' | 'svg' | null>(null);
  const errT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fail = (which: 'png' | 'svg') => {
    setErr(which);
    clearTimeout(errT.current);
    errT.current = setTimeout(() => setErr(null), 1600);
  };
  useEffect(() => () => clearTimeout(errT.current), []);

  const onPng = async () => {
    setBusy(true); setErr(null);
    try { await exportPNG(document.querySelector<SVGSVGElement>('#map')!, S, true); }
    catch { fail('png'); }
    setBusy(false);
    /* the button disables itself mid-export, and browsers blur a newly-disabled
       element — so a keyboard export dropped focus to <body> every time */
    focusSoon('#pngBtn');
  };
  const onSvg = () => {
    setErr(null);
    try { exportSVG(document.querySelector<SVGSVGElement>('#map')!, S, true); }
    catch { fail('svg'); }
  };

  const lockFD = S.view === 'klas' || S.view === 'flow' || S.view === 'mx' || S.view === 'jmap';
  const lockT = S.view === 'klas' || S.view === 'jmap';
  return (
    <header className="hd">
      <div>
        <div className="hd-eyebrow">{`DZS 7.4.2. ${Y0}.–${YEND}. · tokovi: 2018. izmjereno · ostale godine IPF procjena`}</div>
        <h1 className="hd-title">Migracijski atlas županija</h1>
        {/* The study is published, so the subtitle names it and links to the
            record — the most prominent surface in the app, and the first thing
            a reader meets. All copy comes from lib/credits.ts; the footer and
            the glossary carry the full citation and the non-affiliation note.
            The accessible name is the short form *followed by* the full
            citation, because 2.5.3 Label in Name requires the visible text to be
            contained in it — "Rad: Maras, M. i Vinovrški, L. …" does not contain
            "Maras i Vinovrški (2026.)", and a speech-input user saying what they
            can see would have missed the link. */}
        <div className="hd-sub">Unutarnje i vanjske migracije + međužupanijski tokovi — interaktivna nadopuna uz{' '}
          {paperPending() ? paperSub() : (
            <a className="paper-link" href={PAPER.url} target="_blank" rel="noopener noreferrer"
              aria-label={`${PAPER.short} — ${PAPER.citation} Otvara se u novoj kartici.`}>{paperSub()}</a>
          )}</div>
      </div>
      <div className="ctrls">
        <StorySelect S={S} applyStory={applyStory} resetAll={resetAll} />
        <div className="ctrl"><span className="ctrl-lab" id="segViewLab">Prikaz</span>
          <Seg id="segView" labId="segViewLab" value={S.view} onPick={setView}
            /* "Godine" sits with the county-level views it shares a colour scale
               with (Saldo/Klasifikacija/Regije) rather than beside the two flow
               views, which answer a different question entirely. */
            opts={[['saldo', 'Saldo'], ['klas', 'Klasifikacija'], ['reg', 'Regije'], ['yrs', 'Godine'], ['flow', 'Tokovi'], ['mx', 'Matrica'], ['jmap', 'JLS 2018.']]} />
        </div>
        <div className="ctrl" id="cFlow"><span className="ctrl-lab" id="segFlowLab">Sastavnica</span>
          <Seg id="segFlow" labId="segFlowLab" value={S.flow} off={lockFD} title={OFF_TIP} onPick={v => setS({ flow: v })}
            opts={[['tot', 'Migracije'], ['int', 'Unutarnje'], ['ext', 'Vanjske'], ['nat', 'Prirodno'], ['all', 'Mig. + prirodno']]} />
        </div>
        <div className="ctrl" id="cDen"><span className="ctrl-lab" id="segDenLab">Vrijednosti</span>
          <Seg id="segDen" labId="segDenLab" value={S.den} off={lockFD} title={OFF_TIP} onPick={v => setS({ den: v })}
            opts={[['abs', 'Apsolutno'], ['rel11', '% popisa 2011.'], ['relest', '% tek. procjene']]} />
        </div>
        <div className="ctrl" id="cMode"><span className="ctrl-lab" id="segModeLab">Vrijeme</span>
          <Seg id="segMode" labId="segModeLab" value={S.cum ? 'cum' : 'yr'} off={lockT} title={OFF_TIP} onPick={setMode}
            opts={[['yr', 'Godišnje'], ['cum', 'Kumulativno']]} />
        </div>
        <div className={'ctrl only thr' + (S.view === 'klas' ? ' show' : '')} id="thrBox">
          <span className="ctrl-lab" id="thrLab">Prag „gubitnice”</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* the shared label already names the slider, so this group needs its
                own name rather than a second claim on "Prag „gubitnice”" */}
            <Seg id="thrMode" aria="Jedinica praga" value={S.thrRel ? 'rel' : 'abs'} onPick={v => setS({ thrRel: v === 'rel' })}
              opts={[['abs', 'osobe'], ['rel', '%']]} />
            {/* aria-valuetext, or AT reads the raw "1.5" while the visible
                readout says "−1,5 %" — different sign, separator and unit */}
            {S.thrRel ? (
              <input type="range" id="thr" min="0.5" max="5" step="0.1" value={S.thrPct}
                aria-label="Prag gubitnice (% popisa 2011.)"
                aria-valuetext={'−' + fmtR.format(S.thrPct) + ' % popisa 2011.'}
                onChange={e => setS({ thrPct: +e.target.value })} />
            ) : (
              <input type="range" id="thr" min="500" max="15000" step="250" value={S.thr}
                aria-label="Prag gubitnice (osobe)"
                aria-valuetext={'−' + fmtI.format(S.thr) + ' osoba'}
                onChange={e => setS({ thr: +e.target.value })} />
            )}
            <span className="thr-val" id="thrVal">
              {S.thrRel ? '−' + fmtR.format(S.thrPct) + ' %' : '−' + fmtI.format(S.thr)}
            </span>
          </div>
        </div>
        <div className={'ctrl only' + (S.view === 'flow' || S.view === 'mx' || S.view === 'jmap' ? ' show' : '')} id="dirBox">
          <span className="ctrl-lab" id="segDirLab">Smjer</span>
          <Seg id="segDir" labId="segDirLab" value={S.dir} onPick={v => setS({ dir: v })}
            opts={[['out', 'Odlasci'], ['in', 'Dolasci'], ['net', 'Neto']]} />
        </div>
        <div className="ctrl"><span className="ctrl-lab" id="segExpLab">Izvoz</span>
          <div className="seg" id="segExp" role="group" aria-labelledby="segExpLab">
            <button id="pngBtn" disabled={busy} onClick={onPng} title="Preuzmi kartu kao PNG"
              aria-label="Preuzmi trenutačnu kartu kao PNG">{err === 'png' ? 'greška' : busy ? '…' : 'PNG'}</button>
            <button id="svgBtn" onClick={onSvg} title="Preuzmi kartu kao SVG (vektor)"
              aria-label="Preuzmi trenutačnu kartu kao SVG (vektor)">{err === 'svg' ? 'greška' : 'SVG'}</button>
          </div>
          {/* An aria-label overrides button text, so the busy and error states
              were invisible to AT — on the only error surface in the app. */}
          <span className="sr-only" id="expLive" role="status" aria-live="polite">
            {err === 'png' ? 'Izvoz PNG-a nije uspio.' : err === 'svg' ? 'Izvoz SVG-a nije uspio.'
              : busy ? 'Priprema PNG-a…' : ''}
          </span>
        </div>
      </div>
    </header>
  );
}
