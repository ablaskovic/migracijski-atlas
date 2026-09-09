import { NO_AFFIL, PAPER } from '../lib/credits.ts';
import type { Lang } from '../lib/types.ts';
import Icon from './Icon.tsx';
import './research-context.css';

export default function ResearchContext({ lang, onAbout }: { lang: Lang; onAbout?: () => void }) {
  const L = (hr: string, en: string) => lang === 'hr' ? hr : en;
  return <aside className="v3-research" aria-label={L('Znanstveni rad i atribucija', 'The research paper and attribution')}>
    <span className="v3-research-mark" aria-hidden="true"><Icon name="trend" size={21} /></span>
    <div className="v3-research-body">
      <div className="v3-research-heading"><span className="v3-eyebrow">{L('INTERAKTIVNA NADOPUNA RADU', 'AN INTERACTIVE RESEARCH COMPANION')}</span>
        <a href={PAPER.url} target="_blank" rel="noopener noreferrer" aria-label={`${PAPER.short} — ${L('Pročitajte znanstveni rad (nova kartica)', 'Read the research paper (new tab)')}`}>
          {PAPER.short}<Icon name="external" size={14} />
        </a>
      </div>
      <p>{L('Migracije županija kao kriterij regionalizacije Hrvatske.', 'County migration as a criterion for Croatia’s regionalisation.')}</p>
      <p className="v3-research-independence">{NO_AFFIL()}</p>
    </div>
    {onAbout && <button className="v3-research-more" onClick={onAbout}>{L('O radu i podacima', 'About the paper and data')}<Icon name="chevron" size={16} /></button>}
  </aside>;
}
