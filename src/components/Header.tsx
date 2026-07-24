import { useState } from 'react';
import { fmtI, Y0, YEND } from '../lib/metrics.ts';
import { exportPNG } from '../lib/exportPng.ts';
import type { Patch, State, View } from '../lib/types.ts';

function Seg<T extends string>({ id, opts, value, onPick, off }: {
  id: string; opts: [T, string][]; value: T; onPick: (v: T) => void; off?: boolean;
}) {
  return (
    <div className={'seg' + (off ? ' off' : '')} id={id}>
      {opts.map(([v, label]) => (
        <button key={v} data-v={v} aria-pressed={v === value} onClick={() => onPick(v)}>{label}</button>
      ))}
    </div>
  );
}

export default function Header({ S, setS, setView, setMode }: {
  S: State; setS: (p: Patch) => void; setView: (v: View) => void; setMode: (v: 'yr' | 'cum') => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const onPng = async () => {
    setBusy(true); setErr(false);
    try { await exportPNG(document.querySelector<SVGSVGElement>('#map')!, S, true); }
    catch { setErr(true); setTimeout(() => setErr(false), 1600); }
    setBusy(false);
  };

  const lockFD = S.view === 'klas' || S.view === 'flow';
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
            opts={[['saldo', 'Saldo'], ['klas', 'Klasifikacija'], ['reg', 'Regije'], ['flow', 'Tokovi 2018.']]} />
        </div>
        <div className="ctrl" id="cFlow"><span className="ctrl-lab">Sastavnica</span>
          <Seg id="segFlow" value={S.flow} off={lockFD} onPick={v => setS({ flow: v })}
            opts={[['tot', 'Migracije'], ['int', 'Unutarnje'], ['ext', 'Vanjske'], ['nat', 'Prirodno'], ['all', 'Mig. + prirodno']]} />
        </div>
        <div className="ctrl" id="cDen"><span className="ctrl-lab">Vrijednosti</span>
          <Seg id="segDen" value={S.den} off={lockFD} onPick={v => setS({ den: v })}
            opts={[['abs', 'Apsolutno'], ['rel11', '% popisa 2011.'], ['relest', '% tek. procjene']]} />
        </div>
        <div className="ctrl" id="cMode"><span className="ctrl-lab">Vrijeme</span>
          <Seg id="segMode" value={S.cum ? 'cum' : 'yr'} off={S.view === 'klas'} onPick={setMode}
            opts={[['yr', 'Godišnje'], ['cum', 'Kumulativno od 2011.']]} />
        </div>
        <div className={'ctrl only thr' + (S.view === 'klas' ? ' show' : '')} id="thrBox">
          <span className="ctrl-lab">Prag „gubitnice”</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="range" id="thr" min="500" max="15000" step="250" value={S.thr}
              aria-label="Prag gubitnice" onChange={e => setS({ thr: +e.target.value })} />
            <span className="thr-val" id="thrVal">{'−' + fmtI.format(S.thr)}</span>
          </div>
        </div>
        <div className={'ctrl only' + (S.view === 'flow' ? ' show' : '')} id="dirBox">
          <span className="ctrl-lab">Smjer</span>
          <Seg id="segDir" value={S.dir} onPick={v => setS({ dir: v })}
            opts={[['out', 'Odlasci'], ['in', 'Dolasci'], ['net', 'Neto']]} />
        </div>
        <div className="ctrl"><span className="ctrl-lab">Izvoz</span>
          <div className="seg">
            <button id="pngBtn" disabled={busy} onClick={onPng}
              aria-label="Preuzmi trenutačnu kartu kao PNG">{err ? 'greška' : busy ? '…' : 'PNG ↓'}</button>
          </div>
        </div>
      </div>
    </header>
  );
}
