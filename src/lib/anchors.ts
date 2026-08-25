import { geoConicEqualArea, geoPath, geoContains, geoArea } from 'd3-geo';
import type { Geometry, Polygon } from 'geojson';
import { GEO } from './metrics.ts';

/* ── Label and hub anchors that are actually inside their county ─────────────
   MapView anchored both the county name and the Tokovi hub on `p.centroid(f)`,
   d3's *area-weighted* centroid over every ring of the feature. For a shape
   that is concave or archipelagic that point need not lie in the shape at all,
   and for two of the twenty-one counties it does not:

     HR-13 Zadarska      15,5927E 44,1925N — open sea in the Zadar channel,
                         pulled west by Pag, Dugi otok, Ugljan and Pašman
     HR-12 Brodsko-pos.  17,7666E 45,2047N — inside HR-11 Požeško-slavonska

   So with "Aa oznake" on, the word "Zadarska" floated on the Adriatic and the
   word "Brodsko-pos." was printed across a different county — the map labelled
   one county with another county's name — and selecting Zadarska as the Tokovi
   hub drew the hub dot and all twenty arc endpoints from a point at sea.

   The correction is per-county and is a property of the geometry file, not of
   the viewport: `fitExtent` only scales and translates, and a centroid commutes
   with an affine map, so the *inverted* centroid is the same lon/lat at every
   size (measured identical at 570×439, 900×600 and 1200×700). It is therefore
   computed once, in lon/lat, and projected by whatever projection the map has
   built — which also keeps the per-resize path at what it was: one centroid per
   county, plus one proj() for each of the two that need moving.

   Lazily, because nothing in the default view reads an anchor: labels are
   opt-in and the arcs belong to Tokovi, so the ~8 ms scan is paid on the first
   projection build that could draw one rather than at boot. */

/* the shape rather than the feature: for a MultiPolygon the mainland, i.e. the
   ring the reader thinks of as the county, not the islands that drag its
   centroid offshore */
const mainland = (g: Geometry): Geometry => {
  if (g.type !== 'MultiPolygon') return g;
  return g.coordinates
    .map(coordinates => ({ type: 'Polygon', coordinates }) as Polygon)
    .reduce((a, b) => (geoArea(a) > geoArea(b) ? a : b));
};

/* Point on surface, the cheap classic: cut the ring at one latitude, take the
   midpoint of the widest span of county along it. O(edges), always inside, and
   it is what is left when even the mainland ring is concave enough to centroid
   outside itself — HR-12, a strip along the Sava whose centroid lands north of
   it. Holes are ignored: no county here has one. */
const onSurface = (g: Geometry, lat: number): [number, number] | null => {
  if (g.type !== 'Polygon') return null;
  const ring = g.coordinates[0], xs: number[] = [];
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
    if ((y1 > lat) !== (y2 > lat)) xs.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
  }
  xs.sort((a, b) => a - b);
  let widest = -1, x = 0;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > widest) { widest = xs[i + 1] - xs[i]; x = (xs[i] + xs[i + 1]) / 2; }
  }
  return widest < 0 ? null : [x, lat];
};

let cache: Record<string, [number, number]> | null = null;

/** lon/lat anchors for the counties whose area centroid is not inside them. */
export function offCentre(): Record<string, [number, number]> {
  if (cache) return cache;
  /* any extent gives the same answer — see above; this one is arbitrary */
  const proj = geoConicEqualArea().parallels([43.2, 46.2]).rotate([-16.4, 0])
    .fitExtent([[0, 0], [1000, 800]], GEO);
  const path = geoPath(proj);
  const fix: Record<string, [number, number]> = {};
  for (const f of GEO.features) {
    const c = proj.invert!(path.centroid(f));
    if (!c || geoContains(f, c)) continue;
    const big = mainland(f.geometry);
    const cb = proj.invert!(path.centroid(big));
    const a = cb && geoContains(big, cb) ? cb : cb && onSurface(big, cb[1]);
    if (a) fix[f.properties.shapeISO] = a;
  }
  cache = fix;
  return fix;
}
