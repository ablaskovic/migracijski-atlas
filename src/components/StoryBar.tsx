import { STORIES } from '../lib/stories.ts';
import { focusSoon } from '../lib/state.ts';
import type { Patch, State } from '../lib/types.ts';

/* Nalazi — curated findings. The picker is a header control (left of Prikaz);
   only the caption banner stays over the map, bottom-center between the legend
   (left) and the chip panels (right). */
export function StorySelect({ S, applyStory, resetAll }: {
  S: State; applyStory: (i: number) => void; resetAll: () => void;
}) {
  /* Pinned to -1 rather than to S.story: bound to the active preset, re-picking
     the one already shown fires no change event, so once the user has drifted
     away from a Nalaz there is no way back to it. The banner is what reports
     which preset is live. */
  return (
    <div className="ctrl storysel"><span className="ctrl-lab">Nalazi</span>
      <div className="storysel-row">
        <select id="story" aria-label="Odabir nalaza" value={-1}
          onChange={e => { const i = +e.target.value; if (i >= 0) applyStory(i); }}>
          <option value={-1}>{S.story != null ? (S.story + 1) + '. nalaz…' : 'odaberi…'}</option>
          {STORIES.map((st, i) => <option key={i} value={i}>{(i + 1) + '. ' + st.label}</option>)}
        </select>
        <button className="rstbtn" id="resetBtn" onClick={resetAll}
          title="Vrati na početni prikaz" aria-label="Vrati na početni prikaz">⟲</button>
      </div>
    </div>
  );
}

export default function StoryBar({ S, setS }: {
  S: State; setS: (p: Patch) => void;
}) {
  return (
    <>
      {S.story != null && (
        <div className="storybar" id="storyBar">
          <span className="storybar-k">{(S.story + 1) + '/' + STORIES.length}</span>
          <span className="storybar-t" id="storyCap">{STORIES[S.story].cap}</span>
          <button className="card-x" id="storyX" aria-label="Zatvori nalaz"
            onClick={() => { setS({ story: null }); focusSoon('#story'); }}>×</button>
        </div>
      )}
    </>
  );
}
