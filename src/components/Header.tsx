import { useState } from 'react';
import { fmtI, fmtR, Y0, YEND } from '../lib/metrics.ts';
import { exportPNG, exportSVG } from '../lib/exportPng.ts';
import type { Patch, State, View } from '../lib/types.ts';

function Seg<T extends string>({ id, opts, value, onPick, off, title }: {
  id: string; opts: [T, string][]; value: T; onPick: (v: T) => void; off?: boolean; title?: string;
}) {
  return (
    <div className={'seg' + (off ? ' off' : '')} id={id} title={off ? title : undefined}>
      {opts.map(([v, label]) => (
        <button key={v} data-v={v} aria-pressed={v === value} onClick={() => onPick(v)}>{label}</button>
      ))}
    </div>
  );
}

const OFF_TIP = 'Nije primjenjivo u ovom prikazu';

export default function Header({ S, setS, setView, setMode }: {
  S: State; setS: (p: Patch) => void; setView: (v: View) => void;
  setMode: (v: 'yr' | 'cum') => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const onPng = async () => {
    setBusy(true); setErr(false);
    try { await exportPNG(document.querySelector<SVGSVGElement>('#map')!, S, true); }
    catch { setErr(true); setTimeout(() => setErr(false), 1600); }
    setBusy(false);
  };
  const onSvg = () => {
    try { exportSVG(document.querySelector<SVGSVGElement>('#map')!, S, true); }
    catch { setErr(true); setTimeout(() => setErr(false), 1600); }
  };

  const lockFD = S.view === 'klas' || S.view === 'flow' || S.view === 'mx' || S.view === 'jmap';
  const lockT = S.view === 'klas' || S.view === 'jmap';
  return (
    <header className="hd">
      <div>
        <div className="hd-eyebrow">{`DZS 7.4.2. ${Y0}.–${YEND}. · tokovi: 2018. izmjereno · ostale godine IPF procjena`}</div>
        <h1 className="hd-title">Migracijski atlas županija</h1>
        <div className="hd-sub">Unutarnje i vanjske migracije + međužupanijski tokovi — interaktivna nadopuna uz Maras &amp; Vinovrški (2026.)</div>
      </div>
      <div className="ctrls">
        <div className="ctrl"><span className="ctrl-lab">Prikaz</span>
          <Seg id="segView" value={S.view} onPick={setView}
            opts={[['saldo', 'Saldo'], ['klas', 'Klasifikacija'], ['reg', 'Regije'], ['flow', 'Tokovi'], ['mx', 'Matrica'], ['jmap', 'JLS 2018.']]} />
        </div>
        <div className="ctrl" id="cFlow"><span className="ctrl-lab">Sastavnica</span>
          <Seg id="segFlow" value={S.flow} off={lockFD} title={OFF_TIP} onPick={v => setS({ flow: v })}
            opts={[['tot', 'Migracije'], ['int', 'Unutarnje'], ['ext', 'Vanjske'], ['nat', 'Prirodno'], ['all', 'Mig. + prirodno']]} />
        </div>
        <div className="ctrl" id="cDen"><span className="ctrl-lab">Vrijednosti</span>
          <Seg id="segDen" value={S.den} off={lockFD} title={OFF_TIP} onPick={v => setS({ den: v })}
            opts={[['abs', 'Apsolutno'], ['rel11', '% popisa 2011.'], ['relest', '% tek. procjene']]} />
        </div>
        <div className="ctrl" id="cMode"><span className="ctrl-lab">Vrijeme</span>
          <Seg id="segMode" value={S.cum ? 'cum' : 'yr'} off={lockT} title={OFF_TIP} onPick={setMode}
            opts={[['yr', 'Godišnje'], ['cum', 'Kumulativno']]} />
        </div>
        <div className={'ctrl only thr' + (S.view === 'klas' ? ' show' : '')} id="thrBox">
          <span className="ctrl-lab">Prag „gubitnice”</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Seg id="thrMode" value={S.thrRel ? 'rel' : 'abs'} onPick={v => setS({ thrRel: v === 'rel' })}
              opts={[['abs', 'osobe'], ['rel', '%']]} />
            {S.thrRel ? (
              <input type="range" id="thr" min="0.5" max="5" step="0.1" value={S.thrPct}
                aria-label="Prag gubitnice (% popisa 2011.)" onChange={e => setS({ thrPct: +e.target.value })} />
            ) : (
              <input type="range" id="thr" min="500" max="15000" step="250" value={S.thr}
                aria-label="Prag gubitnice (osobe)" onChange={e => setS({ thr: +e.target.value })} />
            )}
            <span className="thr-val" id="thrVal">
              {S.thrRel ? '−' + fmtR.format(S.thrPct) + ' %' : '−' + fmtI.format(S.thr)}
            </span>
          </div>
        </div>
        <div className={'ctrl only' + (S.view === 'flow' || S.view === 'mx' || S.view === 'jmap' ? ' show' : '')} id="dirBox">
          <span className="ctrl-lab">Smjer</span>
          <Seg id="segDir" value={S.dir} onPick={v => setS({ dir: v })}
            opts={[['out', 'Odlasci'], ['in', 'Dolasci'], ['net', 'Neto']]} />
        </div>
        <div className="ctrl"><span className="ctrl-lab">Izvoz</span>
          <div className="seg">
            <button id="pngBtn" disabled={busy} onClick={onPng} title="Preuzmi kartu kao PNG"
              aria-label="Preuzmi trenutačnu kartu kao PNG">{err ? 'greška' : busy ? '…' : 'PNG'}</button>
            <button id="svgBtn" onClick={onSvg} title="Preuzmi kartu kao SVG (vektor)"
              aria-label="Preuzmi trenutačnu kartu kao SVG (vektor)">SVG</button>
          </div>
        </div>
      </div>
    </header>
  );
}
