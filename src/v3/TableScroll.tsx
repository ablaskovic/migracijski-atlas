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
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setOverflows(element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, [ref]);
  return <div className="v3-table-frame">
    {overflows && <p className="v3-table-scroll-hint" id={hint}><span aria-hidden="true">↔</span>{lang === 'hr' ? 'Pomičite vodoravno za sve stupce.' : 'Scroll sideways to see every column.'}</p>}
    <div className={className} ref={ref} role="region" tabIndex={0} aria-label={label} aria-describedby={overflows ? hint : undefined}>{children}</div>
  </div>;
}
