import { useEffect, useState, type RefObject } from 'react';

/** The on-screen size of one user unit of an SVG whose viewBox scales with its box, so text can keep a screen-pixel floor. */
export default function useScreenScale(svg: RefObject<SVGSVGElement | null>): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const measure = () => { const a = element.getScreenCTM()?.a ?? 1; setScale(old => Math.abs(old - a) < .001 ? old : a); };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [svg]);
  return scale;
}
