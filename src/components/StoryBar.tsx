import { STORIES } from '../lib/stories.ts';
import type { Patch, State } from '../lib/types.ts';

/* Nalazi — curated findings. The picker is a header control (left of Prikaz);
   only the caption banner stays over the map, bottom-center between the legend
   (left) and the chip panels (right). */
export function StorySelect({ S, applyStory }: {
  S: State; applyStory: (i: number) => void;
}) {
  return (
    <div className="ctrl storysel"><span className="ctrl-lab">Nalazi</span>
      <select id="story" aria-label="Odabir nalaza" value={S.story ?? -1}
        onChange={e => { const i = +e.target.value; if (i >= 0) applyStory(i); }}>
        <option value={-1}>odaberi…</option>
        {STORIES.map((st, i) => <option key={i} value={i}>{(i + 1) + '. ' + st.label}</option>)}
      </select>
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
          <button className="card-x" id="storyX" aria-label="Zatvori nalaz" onClick={() => setS({ story: null })}>×</button>
        </div>
      )}
    </>
  );
}
