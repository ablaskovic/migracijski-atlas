import { useEffect, useRef, useState } from 'react';
import { fmtI, fmtR, Y0, YEND } from '../lib/metrics.ts';
import { exportPNG, exportSVG } from '../lib/exportPng.ts';
import { StorySelect } from './StoryBar.tsx';
import { focusSoon } from '../lib/state.ts';
import { PAPER, paperPending, paperSub } from '../lib/credits.ts';
import { L, t, titleAlt, yrSpan } from '../lib/i18n.ts';
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
      {/* `data-t` is the label again, and index.css draws it as a zero-height
          ghost at the pressed weight: aria-pressed adds font-weight:500, which is
          0,4–2,3 px wider per label (measured), so without it pressing a button
          resized it, shifted every button to its right, changed the group's own
          width and moved every control after it. */}
      {opts.map(([v, label]) => (
        <button key={v} data-v={v} data-t={label} aria-pressed={v === value} disabled={off}
          onClick={() => onPick(v)}>{label}</button>
      ))}
    </div>
  );
}

const OFF_TIP = () => L('Nije primjenjivo u ovom prikazu', 'Not applicable in this view');

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
        <div className="hd-eyebrow">{L(`DZS 7.4.2. ${yrSpan(Y0, YEND)} · tokovi: 2018. izmjereno · ostale godine IPF procjena`,
          `CBS 7.4.2. ${yrSpan(Y0, YEND)} · flows: 2018 measured · other years IPF estimate`)}</div>
        <div className="hd-titlerow">
          {/* data-alt is the title in the other language, reserved as a ghost so
              the switch beside it does not move when it is pressed — see
              index.css .hd-title::after and lib/i18n.ts titleAlt(). */}
          <h1 className="hd-title" data-alt={titleAlt()}>{t('hd.title')}</h1>
          <div className="seg hd-lang" id="segLang" role="group" aria-label="Jezik / Language">
              {(['hr', 'en'] as const).map(l => (
                <button key={l} data-l={l} data-t={l === 'hr' ? 'HR' : 'EN'}
                  aria-pressed={S.lang === l} lang={l}
                  /* `lang` per button so a screen reader pronounces each name in its
                     own language, and the title in the language being offered — the
                     label a reader needs is the one they can already read */
                  title={l === 'hr' ? 'Prikaži na hrvatskom' : 'Show in English'}
                  onClick={() => setS({ lang: l })}>{l === 'hr' ? 'HR' : 'EN'}</button>
              ))}
          </div>
        </div>
        {/* The study is published, so the subtitle names it and links to the
            record — the most prominent surface in the app, and the first thing
            a reader meets. All copy comes from lib/credits.ts; the footer and
            the glossary carry the full citation and the non-affiliation note.
            The accessible name is the short form *followed by* the full
            citation, because 2.5.3 Label in Name requires the visible text to be
            contained in it — "Rad: Maras, M. i Vinovrški, L. …" does not contain
            "Maras i Vinovrški (2026.)", and a speech-input user saying what they
            can see would have missed the link. */}
        <div className="hd-sub">{L('Unutarnje i vanjske migracije + međužupanijski tokovi — interaktivna nadopuna uz',
          'Internal and external migration + inter-county flows — an interactive companion to')}{' '}
          {paperPending() ? paperSub() : (
            <a className="paper-link" href={PAPER.url} target="_blank" rel="noopener noreferrer"
              aria-label={`${PAPER.short} — ${PAPER.citation} ${L('Otvara se u novoj kartici.', 'Opens in a new tab.')}`}>{paperSub()}</a>
          )}</div>
      </div>
      <div className="ctrls">
        <StorySelect S={S} applyStory={applyStory} resetAll={resetAll} />
        <div className="ctrl"><span className="ctrl-lab" id="segViewLab">{t('ctrl.view')}</span>
          <Seg id="segView" labId="segViewLab" value={S.view} onPick={setView}
            /* "Godine" sits with the county-level views it shares a colour scale
               with (Saldo/Klasifikacija/Regije) rather than beside the two flow
               views, which answer a different question entirely. */
            opts={[['saldo', t('view.saldo')], ['klas', t('view.klas')], ['reg', t('view.reg')], ['yrs', t('view.yrs')], ['flow', t('view.flow')], ['mx', t('view.mx')], ['jmap', t('view.jmap')]]} />
        </div>
        <div className="ctrl" id="cFlow"><span className="ctrl-lab" id="segFlowLab">{t('ctrl.flow')}</span>
          <Seg id="segFlow" labId="segFlowLab" value={S.flow} off={lockFD} title={OFF_TIP()} onPick={v => setS({ flow: v })}
            opts={[['tot', L('Migracije', 'Migration')], ['int', t('flow.int')], ['ext', t('flow.ext')], ['nat', t('flow.nat')], ['all', t('flow.all')]]} />
        </div>
        <div className="ctrl" id="cDen"><span className="ctrl-lab" id="segDenLab">{L('Vrijednosti', 'Values')}</span>
          <Seg id="segDen" labId="segDenLab" value={S.den} off={lockFD} title={OFF_TIP()} onPick={v => setS({ den: v })}
            opts={[['abs', t('den.abs')], ['rel11', t('den.rel11')], ['relest', t('den.relest')]]} />
        </div>
        <div className="ctrl" id="cMode"><span className="ctrl-lab" id="segModeLab">{t('ctrl.time')}</span>
          <Seg id="segMode" labId="segModeLab" value={S.cum ? 'cum' : 'yr'} off={lockT} title={OFF_TIP()} onPick={setMode}
            opts={[['yr', t('time.year')], ['cum', t('time.cum')]]} />
        </div>
        {/* an id, not `.ctrls>.ctrl:last-child`: the narrow-width grid singles
            this group out to share a row with Vrijeme, and it is no longer the
            last child now that Prag and Smjer follow it */}
        <div className="ctrl" id="cExp"><span className="ctrl-lab" id="segExpLab">{t('ctrl.export')}</span>
          <div className="seg" id="segExp" role="group" aria-labelledby="segExpLab">
            {/* the ghost here reserves the widest *state*, not the label: this
                button reads PNG, then "…", then "greška", and the group used to
                narrow ~20 px mid-export and widen again on failure */}
            <button id="pngBtn" data-t={L('greška', 'error')} disabled={busy} onClick={onPng} title={L('Preuzmi kartu kao PNG', 'Download the map as PNG')}
              aria-label={L('Preuzmi trenutačnu kartu kao PNG', 'Download the current map as PNG')}>{err === 'png' ? L('greška', 'error') : busy ? '…' : 'PNG'}</button>
            <button id="svgBtn" data-t={L('greška', 'error')} onClick={onSvg} title={L('Preuzmi kartu kao SVG (vektor)', 'Download the map as SVG (vector)')}
              aria-label={L('Preuzmi trenutačnu kartu kao SVG (vektor)', 'Download the current map as SVG (vector)')}>{err === 'svg' ? L('greška', 'error') : 'SVG'}</button>
          </div>
          {/* An aria-label overrides button text, so the busy and error states
              were invisible to AT — on the only error surface in the app. */}
          <span className="sr-only" id="expLive" role="status" aria-live="polite">
            {err === 'png' ? L('Izvoz PNG-a nije uspio.', 'PNG export failed.') : err === 'svg' ? L('Izvoz SVG-a nije uspio.', 'SVG export failed.')
              : busy ? L('Priprema PNG-a…', 'Preparing the PNG…') : ''}
          </span>
        </div>
        {/* Izvoz sits before the two view-specific groups, not after them, and
            that ordering is load-bearing rather than cosmetic. Prag appears only
            in Klasifikacija and Smjer only in the three flow views, so exactly
            one optional group is ever present — and while they sat mid-row,
            appearing pushed everything after them along: measured, switching
            Saldo → Klasifikacija moved Izvoz 255 px sideways at 1280 and 1024,
            and at 1440 wrapped it onto a new row (1.024 px left, 54 px down).
            Last, they can only ever extend the tail. The DOM order is the visual
            order — no CSS `order`, which would leave the tab sequence disagreeing
            with the page (2.4.3). */}
        <div className={'ctrl only thr' + (S.view === 'klas' ? ' show' : '')} id="thrBox">
          <span className="ctrl-lab" id="thrLab">{L('Prag „gubitnice”', '“Losing” threshold')}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* the shared label already names the slider, so this group needs its
                own name rather than a second claim on "Prag „gubitnice”" */}
            <Seg id="thrMode" aria={L('Jedinica praga', 'Threshold unit')} value={S.thrRel ? 'rel' : 'abs'} onPick={v => setS({ thrRel: v === 'rel' })}
              opts={[['abs', L('osobe', 'people')], ['rel', '%']]} />
            {/* aria-valuetext, or AT reads the raw "1.5" while the visible
                readout says "−1,5 %" — different sign, separator and unit */}
            {S.thrRel ? (
              <input type="range" id="thr" min="0.5" max="5" step="0.1" value={S.thrPct}
                aria-label={L('Prag gubitnice (% popisa 2011.)', 'Losing threshold (% of 2011 census)')}
                aria-valuetext={'−' + fmtR.format(S.thrPct) + L(' % popisa 2011.', ' % of 2011 census')}
                onChange={e => setS({ thrPct: +e.target.value })} />
            ) : (
              <input type="range" id="thr" min="500" max="15000" step="250" value={S.thr}
                aria-label={L('Prag gubitnice (osobe)', 'Losing threshold (people)')}
                aria-valuetext={'−' + fmtI.format(S.thr) + L(' osoba', ' people')}
                onChange={e => setS({ thr: +e.target.value })} />
            )}
            <span className="thr-val" id="thrVal">
              {S.thrRel ? '−' + fmtR.format(S.thrPct) + ' %' : '−' + fmtI.format(S.thr)}
            </span>
          </div>
        </div>
        <div className={'ctrl only' + (S.view === 'flow' || S.view === 'mx' || S.view === 'jmap' ? ' show' : '')} id="dirBox">
          <span className="ctrl-lab" id="segDirLab">{t('ctrl.dir')}</span>
          <Seg id="segDir" labId="segDirLab" value={S.dir} onPick={v => setS({ dir: v })}
            opts={[['out', t('dir.out')], ['in', t('dir.in')], ['net', t('dir.net')]]} />
        </div>
      </div>
    </header>
  );
}
