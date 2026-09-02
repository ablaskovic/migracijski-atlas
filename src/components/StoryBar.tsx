import { useEffect, useRef } from 'react';
import { STORIES } from '../lib/stories.ts';
import { jlsGeo } from '../lib/geoAsync.ts';
import { focusSoon } from '../lib/state.ts';
import { L, t } from '../lib/i18n.ts';
import type { Patch, State } from '../lib/types.ts';

/* Nalazi — curated findings. The picker is a header control (left of Prikaz);
   only the caption banner stays over the map, bottom-center between the legend
   (left) and the chip panels (right). */
export function StorySelect({ S, applyStory, resetAll }: {
  S: State; applyStory: (i: number) => void; resetAll: () => void;
}) {
  /* Bound to the live preset. It was pinned to -1 on the reasoning that
     re-picking the preset already shown fires no change event, so a reader who
     had drifted away from a Nalaz could not get back to it — but drifting away
     is exactly what clears `S.story` (App.up invalidates the caption the moment
     it stops describing the screen), so the placeholder is already back by then
     and the pick fires. The only re-pick that still fires nothing is one whose
     state is on screen, which is a no-op.
     Pinning it broke the keyboard outright: ArrowDown on a CLOSED select is how
     Windows and Linux step through one in Chrome and Firefox, and it moves the
     value from -1 to option 0 every time. Measured with three presses on the
     shipped build: Nalaz 1, Nalaz 1, Nalaz 1 — the other fourteen findings
     unreachable without knowing to open the popup first, and each press firing a
     full view jump. */
  /* The one header control whose name did not contain its visible label.
     Every other group in Header associates its .ctrl-lab through
     aria-labelledby, and Header's own comment invokes 2.5.3 for exactly
     this — “a speech-input user saying what they can see would have missed
     the link”. Here the label read “Nalazi” and the accessible name
     “Odabir nalaza”, which does not contain it; in English “Findings”
     against “Choose a finding”, likewise. So “click Nalazi” matched
     nothing, and a screen reader announced a name no sighted colleague
     could read out. The visible label leads and the descriptive part
     follows it, so the name both starts with what is on screen and still
     says what the control does. */
  return (
    <div className="ctrl storysel"><span className="ctrl-lab" id="storyLab">{t('ctrl.story')}</span>
      <div className="storysel-row">
        <select id="story" aria-label={t('ctrl.story') + L(' — odabir nalaza', ' — choose a finding')} value={S.story ?? -1}
          onChange={e => { const i = +e.target.value; if (i >= 0) applyStory(i); }}>
          <option value={-1}>{S.story != null ? (S.story + 1) + L('. nalaz…', '. finding…') : L('odaberi…', 'choose…')}</option>
          {STORIES.map((st, i) => <option key={i} value={i}>{(i + 1) + '. ' + st.label}</option>)}
        </select>
        <button className="rstbtn" id="resetBtn" onClick={resetAll}
          title={t('ctrl.resetTitle')} aria-label={t('ctrl.resetTitle')}>⟲</button>
      </div>
    </div>
  );
}

export default function StoryBar({ S, setS }: {
  S: State; setS: (p: Patch) => void;
}) {
  /* Picking a preset rewrites the whole view, and the caption *is* the feature —
     it reached no AT user, who heard only the year/view status line while ~30 tab
     stops away from the text that explains it.
     The region is now permanently mounted and its *content* appears, which is the
     pattern #srLive and #expLive already use: a live region that enters the DOM
     already populated is not guaranteed to announce (VoiceOver notoriously), so
     the original fix may never have reached the readers it was written for. Empty
     it paints nothing — see .storybar:empty. */
  /* …and when a key clears it rather than its own ×. Tab to the banner's × and
     press ArrowRight: App steps the year, `yi` is in STORY_KEYS so the caption
     dies, this block unmounts the focused button and focus drops to <body> —
     while CLICKING the same × hands focus to #story. Same hand-off, same
     target, guarded on focus having actually fallen so nothing else is moved. */
  const hadStory = useRef(S.story);
  useEffect(() => {
    const was = hadStory.current;
    hadStory.current = S.story;
    if (was != null && S.story == null && document.activeElement === document.body) focusSoon('#story');
  }, [S.story]);
  return (
    <div className="storybar" id="storyBar" role="status" aria-live="polite">
      {/* …and not while the payload it is about is missing — see `needs` in
          stories.ts. The legend and the export buttons already step back for
          this condition; the banner was the one surface that did not. */}
      {S.story != null && !(STORIES[S.story].needs === 'jls' && !jlsGeo()) && (
        <>
          <span className="storybar-k">{(S.story + 1) + '/' + STORIES.length}</span>
          <span className="storybar-t" id="storyCap">{STORIES[S.story].cap}</span>
          <button className="card-x" id="storyX" aria-label={L('Zatvori nalaz', 'Close the finding')}
            onClick={() => { setS({ story: null }); focusSoon('#story'); }}>×</button>
        </>
      )}
    </div>
  );
}
