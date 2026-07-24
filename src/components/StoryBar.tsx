import { STORIES } from '../lib/stories.ts';
import type { Patch, State } from '../lib/types.ts';

/* Nalazi — curated findings. The select chip sits top-center of the map
   (header keeps its v4 one-row budget); the caption banner is bottom-center,
   between the legend (left) and chip panels (right). */
export default function StoryBar({ S, setS, applyStory }: {
  S: State; setS: (p: Patch) => void; applyStory: (i: number) => void;
}) {
  return (
    <>
      <div className="storysel">
        <select id="story" aria-label="Odabir nalaza" value={S.story ?? -1}
          onChange={e => { const i = +e.target.value; if (i >= 0) applyStory(i); }}>
          <option value={-1}>Nalazi — odaberi</option>
          {STORIES.map((st, i) => <option key={i} value={i}>{(i + 1) + '. ' + st.label}</option>)}
        </select>
      </div>
      {S.story != null && (
        <div className="storybar" id="storyBar">
          <span className="storybar-k">{(S.story + 1) + '/' + STORIES.length}</span>
          <span className="storybar-t" id="storyCap">{STORIES[S.story].cap}</span>
          <button className="card-x" id="storyX" aria-label="Zatvori nalaz" onClick={() => setS({ story: null })}>×</button>
        </div>
      )}
    </>
  );
}
