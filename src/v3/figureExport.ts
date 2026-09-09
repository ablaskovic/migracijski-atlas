import { ensureFonts, fontCss } from '../lib/exportFonts.ts';
import { L } from '../lib/i18n.ts';
import { ATLAS_AUTHOR, FONT_NOTICE, exportLicenceLine, sources } from '../lib/licences.ts';
import sansLatin from '../fonts/ibm-plex-sans-latin.woff2';
import sansExt from '../fonts/ibm-plex-sans-latin-ext.woff2';

export interface FigureMetadata {
  title: string;
  subtitle: string;
  notes: string[];
  filename: string;
  legend?: string;
}

const NS = 'http://www.w3.org/2000/svg';
const PRESENTATION = ['color', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'letter-spacing', 'word-spacing', 'text-anchor', 'dominant-baseline', 'alignment-baseline', 'paint-order', 'visibility', 'display', 'vector-effect', 'stop-color', 'stop-opacity', 'clip-path', 'clip-rule', 'mask', 'filter', 'marker-start', 'marker-mid', 'marker-end', 'transform', 'transform-origin', 'transform-box'];
let sansCss = '';
let sansPending: Promise<string> | null = null;

function ensureSans(): Promise<string> {
  if (sansCss) return Promise.resolve(sansCss);
  sansPending ??= (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const faces = await Promise.all([sansLatin, sansExt].map(async (url, i) => {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('Font fetch failed: ' + response.status);
        const bytes = await response.arrayBuffer();
        if (new DataView(bytes).getUint32(0) !== 0x774f4632) throw new Error('Invalid WOFF2 font');
        const uri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Font read failed'));
          reader.readAsDataURL(new Blob([bytes], { type: 'font/woff2' }));
        });
        const range = i ? 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329' : 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
        return `@font-face{font-family:'IBM Plex Sans';font-style:normal;font-weight:400 600;src:url(${uri}) format('woff2');unicode-range:${range}}`;
      }));
      sansCss = faces.join('');
      return sansCss;
    } finally {
      clearTimeout(timeout);
      sansPending = null;
    }
  })();
  return sansPending;
}

function node<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
}

/** Capture before any await: playback, selection and theme may change while fonts load. */
function snapshot(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const theme = getComputedStyle(document.documentElement);
  const originals = [svg, ...svg.querySelectorAll<SVGElement>('*')];
  const copies = [clone, ...clone.querySelectorAll<SVGElement>('*')];
  originals.forEach((original, i) => {
    const copy = copies[i];
    const style = getComputedStyle(original);
    const resolve = (value: string) => value.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g, (_, name: string, fallback: string | undefined) => style.getPropertyValue(name).trim() || theme.getPropertyValue(name).trim() || fallback || '')
      .replace(/url\(["']?[^)]*#([^"')]+)["']?\)/g, 'url(#$1)')
      .replace(/Atlas Sans/g, 'IBM Plex Sans');
    // Disconnected generated figures already carry their presentation attributes.
    if (original.isConnected) for (const property of PRESENTATION) {
      const value = style.getPropertyValue(property);
      if (value) copy.style.setProperty(property, resolve(value));
    }
    for (const attr of Array.from(copy.attributes)) {
      if (attr.name === 'style') continue;
      if (attr.name === 'tabindex' || attr.name.startsWith('on') || attr.name.startsWith('aria-') || attr.name === 'role') copy.removeAttribute(attr.name);
      else if (attr.value.includes('var(') || attr.value.includes('Atlas Sans')) copy.setAttribute(attr.name, resolve(attr.value));
    }
    copy.style.cssText = resolve(copy.style.cssText);
    copy.style.setProperty('animation', 'none');
    copy.style.setProperty('transition', 'none');
  });
  // Parent selectors no longer apply to the standalone file, and controls stay in the app.
  clone.querySelectorAll('script, foreignObject, [data-export-ignore]').forEach(element => element.remove());
  clone.removeAttribute('class');
  const box = svg.viewBox.baseVal;
  const width = box.width || svg.width.baseVal.value || svg.getBoundingClientRect().width || 820;
  const height = box.height || svg.height.baseVal.value || svg.getBoundingClientRect().height || 535;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  // Generated tables are measured off-screen before export; that staging position is not figure content.
  for (const property of ['position', 'left', 'top', 'right', 'bottom']) clone.style.removeProperty(property);
  clone.style.removeProperty('transform');
  clone.style.removeProperty('transform-origin');
  clone.style.setProperty('overflow', 'hidden');
  clone.style.setProperty('width', String(width) + 'px');
  clone.style.setProperty('height', String(height) + 'px');
  let background = '';
  for (let ancestor: Element | null = svg; ancestor && !background; ancestor = ancestor.parentElement) {
    const color = getComputedStyle(ancestor).backgroundColor;
    if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') background = color;
  }
  return { clone, width, height, background: background || theme.getPropertyValue('--surface').trim() || '#fff', text: theme.getPropertyValue('--text').trim() || '#172d3c', muted: theme.getPropertyValue('--muted').trim() || '#526979', border: theme.getPropertyValue('--border').trim() || '#dbe4e9' };
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export a complete, standalone figure. Callers provide view-specific method and caveat notes. */
export async function exportFigure(svg: SVGSVGElement, format: 'png' | 'svg', metadata: FigureMetadata): Promise<void> {
  const captured = snapshot(svg);
  const meta = { ...metadata, notes: [...metadata.notes] };
  const credits = [
    ...sources().map(source => `${source.label} · ${source.href}`),
    exportLicenceLine(),
    L(`Migracijski atlas · autor: ${ATLAS_AUTHOR}`, `Migration atlas · author: ${ATLAS_AUTHOR}`),
  ];
  const fontError = L('Fontovi za izvoz nisu dostupni. Pokušajte ponovno.', 'Export fonts are unavailable. Please try again.');
  const [existingFonts, sans] = await Promise.all([ensureFonts(), ensureSans()]);
  if (!existingFonts) throw new Error(fontError);
  const { clone, width, height, background, text, muted, border } = captured;
  const padding = 28;
  const outputWidth = Math.max(760, width + padding * 2);
  const figure = node('svg', { xmlns: NS, width: outputWidth, role: 'img' });
  const title = node('title'); title.textContent = meta.title; figure.append(title);
  const description = node('desc'); description.textContent = [meta.subtitle, meta.legend, ...meta.notes, ...credits].filter(Boolean).join('\n'); figure.append(description);
  const style = node('style'); style.textContent = `/* ${FONT_NOTICE} */${fontCss()}${sans}`; figure.append(style);
  const backdrop = node('rect', { width: outputWidth, fill: background }); figure.append(backdrop);
  const context = document.createElement('canvas').getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  let y = padding;
  const paragraph = (value: string, size: number, color: string, weight = 400, gap = 7) => {
    if (!value) return;
    context.font = `${weight} ${size}px "Atlas Sans", sans-serif`;
    const available = outputWidth - padding * 2;
    const lines: string[] = [];
    for (const section of value.split('\n')) {
      let line = '';
      for (const word of section.split(/\s+/)) {
        if (line && context.measureText(line + ' ' + word).width > available) { lines.push(line); line = ''; }
        for (const char of (line ? ' ' : '') + word) {
          if (line && context.measureText(line + char).width > available) { lines.push(line); line = ''; }
          line += char;
        }
      }
      lines.push(line);
    }
    const element = node('text', { x: padding, y: y + size, fill: color, 'font-family': 'IBM Plex Sans, sans-serif', 'font-size': size, 'font-weight': weight });
    lines.forEach((line, i) => { const span = node('tspan', { x: padding, dy: i ? size * 1.5 : 0 }); span.textContent = line; element.append(span); });
    figure.append(element);
    y += lines.length * size * 1.5 + gap;
  };
  paragraph(meta.title, 26, text, 600, 4);
  paragraph(meta.subtitle, 14, muted, 400, 18);
  clone.setAttribute('x', String((outputWidth - width) / 2));
  clone.setAttribute('y', String(y));
  figure.append(clone);
  y += height + 18;
  if (meta.legend) paragraph(meta.legend, 13, text, 500, 14);
  figure.append(node('line', { x1: padding, x2: outputWidth - padding, y1: y, y2: y, stroke: border }));
  y += 16;
  meta.notes.forEach(note => paragraph(note, 12, text));
  if (meta.notes.length) y += 5;
  credits.forEach(credit => paragraph(credit, 11, muted, 400, 3));
  const outputHeight = Math.ceil(y + padding);
  figure.setAttribute('height', String(outputHeight));
  figure.setAttribute('viewBox', `0 0 ${outputWidth} ${outputHeight}`);
  backdrop.setAttribute('height', String(outputHeight));
  const blob = new Blob([new XMLSerializer().serializeToString(figure)], { type: 'image/svg+xml;charset=utf-8' });
  const filename = meta.filename.replace(/\.(?:png|svg)$/i, '') + '.' + format;
  if (format === 'svg') { download(blob, filename); return; }
  const url = URL.createObjectURL(blob);
  try {
    const picture = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Figure could not be rendered'));
      image.src = url;
    });
    const scale = Math.min(2, Math.sqrt(16_000_000 / (outputWidth * outputHeight)), 8192 / outputWidth, 8192 / outputHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(outputWidth * scale));
    canvas.height = Math.max(1, Math.floor(outputHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable');
    ctx.drawImage(picture, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG could not be created')), 'image/png'));
    download(png, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
