import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { Lang } from '../lib/types.ts';
import './table-scroll.css';

export default function TableScroll({ children, className, lang, label, scrollRef }: {
  children: ReactNode; className: string; lang: Lang; label: string;
  scrollRef?: RefObject<HTMLDivElement | null>;
}) {
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = scrollRef ?? ownRef;
  const hint = useId();
  const [scrolls, setScrolls] = useState({ x: false, y: false });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => { const x = element.scrollWidth > element.clientWidth + 1, y = element.scrollHeight > element.clientHeight + 1; setScrolls(old => old.x === x && old.y === y ? old : { x, y }); };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, [ref]);
  // Only an area that scrolls is a focusable region, reached by keyboard to scroll it; its name says what it holds, the hint how to scroll.
  const region = scrolls.x || scrolls.y ? { role: 'region', tabIndex: 0, 'aria-label': label } : {};
  return <div className="v3-table-frame">
    {scrolls.x && <p className="v3-table-scroll-hint" id={hint}><span aria-hidden="true">↔</span>{lang === 'hr' ? 'Pomičite vodoravno za sve stupce.' : 'Scroll sideways to see every column.'}</p>}
    <div className={className} ref={ref} {...region} aria-describedby={scrolls.x ? hint : undefined}>{children}</div>
  </div>;
}
