import { STORIES } from '../lib/stories.ts';
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
  return (
    <div className="ctrl storysel"><span className="ctrl-lab">{t('ctrl.story')}</span>
      <div className="storysel-row">
        <select id="story" aria-label={L('Odabir nalaza', 'Choose a finding')} value={S.story ?? -1}
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
  return (
    <div className="storybar" id="storyBar" role="status" aria-live="polite">
      {S.story != null && (
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
