import { useEffect, useRef, useState } from 'react';
import { fmtI, fmtR, Y0, YEND } from '../lib/metrics.ts';
import { exportPNG, exportSVG } from '../lib/exportPng.ts';
import { ensureFonts } from '../lib/exportFonts.ts';
import { jlsGeo, regGeo } from '../lib/geoAsync.ts';
import { StorySelect } from './StoryBar.tsx';
import { EFF_FD, LOCK_FD, focusSoon } from '../lib/state.ts';
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
  /* Its own flag, not PNG's. Header already learned that lesson for `err` — one
     shared flag reported a failure against the control that did not fail — and
     the same argument applies to busy: sharing it would leave one export button
     dead while the other was working. */
  const [busySvg, setBusySvg] = useState(false);
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

  /* The only signal a failed export gave was "greška" for 1,6 s, and a bare
     `catch {}` discarded the reason — so a reader could report nothing more than
     "it did not work" and neither could the console. The label stays; the cause
     goes where a cause belongs. */
  const onPng = async () => {
    setBusy(true); setErr(null);
    try { await exportPNG(document.querySelector<SVGSVGElement>('#map')!, S, true); }
    catch (e) { console.error('PNG export failed', e); fail('png'); }
    /* `finally`, not a bare statement after the await: setBusy(false) used to sit
       on the happy path, so anything that made the await never settle — a wedged
       font fetch was the reachable one — left #pngBtn disabled reading '…' and the
       live region stuck on "Priprema PNG-a…" for the rest of the session. */
    finally {
      setBusy(false);
      /* the button disables itself mid-export, and browsers blur a newly-disabled
         element — so a keyboard export dropped focus to <body> every time */
      focusSoon('#pngBtn');
    }
  };
  /* The SVG twin embeds the same faces the PNG twin does, and it can only embed
     what has already arrived. exportSVG is synchronous by contract — App exposes
     it as window.__exportSVG and the suite drives it synchronously in ~20 places
     — so the wait belongs in the caller, which is what exportPNG already does.
     Pressing SVG inside the window where the warm woff2 fetches are still in
     flight shipped a figure with zero @font-face rules: every county label,
     matrix number and band string in whatever substitute the opening
     application had, and the band was fitted with canvas measureText against the
     page's real Oswald/Plex metrics, so the wider substitute overran the 20 px
     margins the fit was computed to respect. */
  const onSvg = async () => {
    setErr(null); setBusySvg(true);
    try {
      await ensureFonts();
      exportSVG(document.querySelector<SVGSVGElement>('#map')!, S, true);
    } catch (e) { console.error('SVG export failed', e); fail('svg'); }
    finally { setBusySvg(false); focusSoon('#svgBtn'); }
  };

  /* An export is the artifact that leaves the app under CC BY, so it must not
     claim to show geometry it does not have. Block geo_jls and press SVG in the
     JLS view and the download is a 265.934-byte document headed "GRADOVI I
     OPĆINE: NETO PO JLS · UNUTARNJA MIGRACIJA (IZMJERENO)" containing 21
     unfilled county outlines and none of the 556 municipalities the title names —
     while the app itself, two hundred pixels away, reads "Geometrija JLS nije
     učitana." The same is true through the ordinary load gap. Regije loses its
     five outlines the same way, which MapView already says on screen. Both
     buttons consult the payload now, so the figure cannot be minted at all in a
     state the app is already reporting as incomplete. */
  const geoMissing = (S.view === 'jmap' && !jlsGeo()) || (S.view === 'reg' && !regGeo());
  const lockFD = LOCK_FD.has(S.view);
  /* …and while locked, report the metric the view actually draws rather than the
     raw state, exactly as segMode below derives 'cum'. The raw form left the two
     disabled groups asserting aria-pressed on a lens their view ignores —
     "Prirodno" over a Klasifikacija that classifies on total migration, and over
     three corridor views whose own legends say "Samo preseljenja unutar RH". */
  const eff = EFF_FD[S.view];
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
          <Seg id="segFlow" labId="segFlowLab" value={eff ? eff.flow : S.flow} off={lockFD} title={OFF_TIP()} onPick={v => setS({ flow: v })}
            opts={[['tot', L('Migracije', 'Migration')], ['int', t('flow.int')], ['ext', t('flow.ext')], ['nat', t('flow.nat')], ['all', t('flow.all')]]} />
        </div>
        <div className="ctrl" id="cDen"><span className="ctrl-lab" id="segDenLab">{L('Vrijednosti', 'Values')}</span>
          <Seg id="segDen" labId="segDenLab" value={eff ? eff.den : S.den} off={lockFD} title={OFF_TIP()} onPick={v => setS({ den: v })}
            opts={[['abs', t('den.abs')], ['rel11', t('den.rel11')], ['relest', t('den.relest')]]} />
        </div>
        <div className="ctrl" id="cMode"><span className="ctrl-lab" id="segModeLab">{t('ctrl.time')}</span>
          {/* Klasifikacija is unconditionally cumulative — klasOf() reads
              val(..., true) whatever S.cum says — and eleven other surfaces
              spell that as `S.cum || S.view === 'klas'`. This was the twelfth,
              and the only one deriving the answer from S.cum alone: entering
              klas from godišnje left the disabled group reporting "Godišnje"
              pressed while #srLive, #bigYearSub and the legend all said
              cumulative. `#v=klas&c=0&y=2024` boots straight into it. */}
          <Seg id="segMode" labId="segModeLab" value={S.cum || S.view === 'klas' ? 'cum' : 'yr'} off={lockT} title={OFF_TIP()} onPick={setMode}
            opts={[['yr', t('time.year')], ['cum', t('time.cum')]]} />
        </div>
        {/* an id, not `.ctrls>.ctrl:last-child`: the narrow-width grid singles
            this group out to share a row with Vrijeme, and it is no longer the
            last child now that Prag and Smjer follow it */}
        <div className="ctrl" id="cExp"><span className="ctrl-lab" id="segExpLab">{t('ctrl.export')}</span>
          <div className="seg" id="segExp" role="group" aria-labelledby="segExpLab">
            {/* the ghost here reserves the widest *state*, not the label: this
                button reads PNG, then "…", then "greška", and the group used to
                narrow ~20 px mid-export and widen again on failure.
                `data-t2` is the same word in the *other* language, drawn as a
                second zero-height ghost (index.css). PNG and SVG are the same
                string in both languages, so the visible label never changes —
                but "greška" is wider than "error", and with only the current
                language reserved the pair resized and slid on a language
                switch: measured 47,7 → 38,1 px on #pngBtn at 1440, 46,7 → 37,1
                on #svgBtn, moving both. Reserving the wider of the two makes the
                box the same in HR and EN. Same reasoning as .hd-title[data-alt]. */}
            <button id="pngBtn" data-t={L('greška', 'error')} data-t2={L('error', 'greška')} disabled={busy || geoMissing} onClick={onPng} title={L('Preuzmi kartu kao PNG', 'Download the map as PNG')}
              aria-label={L('Preuzmi trenutačnu kartu kao PNG', 'Download the current map as PNG')}>{err === 'png' ? L('greška', 'error') : busy ? '…' : 'PNG'}</button>
            <button id="svgBtn" data-t={L('greška', 'error')} data-t2={L('error', 'greška')} disabled={busySvg || geoMissing} onClick={onSvg} title={L('Preuzmi kartu kao SVG (vektor)', 'Download the map as SVG (vector)')}
              aria-label={L('Preuzmi trenutačnu kartu kao SVG (vektor)', 'Download the current map as SVG (vector)')}>{err === 'svg' ? L('greška', 'error') : busySvg ? '…' : 'SVG'}</button>
          </div>
          {/* An aria-label overrides button text, so the busy and error states
              were invisible to AT — on the only error surface in the app. */}
          <span className="sr-only" id="expLive" role="status" aria-live="polite">
            {err === 'png' ? L('Izvoz PNG-a nije uspio.', 'PNG export failed.') : err === 'svg' ? L('Izvoz SVG-a nije uspio.', 'SVG export failed.')
              : busy ? L('Priprema PNG-a…', 'Preparing the PNG…') : busySvg ? L('Priprema SVG-a…', 'Preparing the SVG…')
                : geoMissing ? L('Izvoz nije dostupan dok geometrija nije učitana.', 'Export is unavailable until the geometry has loaded.') : ''}
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
