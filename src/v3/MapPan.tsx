import type { Lang } from '../lib/i18n.ts';
import Icon from './Icon.tsx';
import type useMapNavigation from './useMapNavigation.ts';
import './map-interactions.css';

/** Pan buttons while a map is zoomed, so dragging is not the only way to move it (WCAG 2.5.7). */
export default function MapPan({ nav, lang }: { nav: ReturnType<typeof useMapNavigation>; lang: Lang }) {
  if (nav.zoom <= 1) return null;
  const L = (hr: string, en: string) => lang === 'hr' ? hr : en;
  const steps = [['up', 0, 1, L('Pomakni kartu gore', 'Pan up')], ['left', 1, 0, L('Pomakni kartu lijevo', 'Pan left')], ['right', -1, 0, L('Pomakni kartu desno', 'Pan right')], ['down', 0, -1, L('Pomakni kartu dolje', 'Pan down')]] as const;
  return <div className="v3-map-pan" role="group" aria-label={L('Pomicanje karte', 'Pan the map')}>
    {steps.map(([dir, dx, dy, label]) => <button key={dir} className={'is-' + dir} aria-label={label} title={label} onClick={() => nav.pan(dx, dy)}><Icon name="chevron" size={16} /></button>)}
  </div>;
}
