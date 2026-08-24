#!/usr/bin/env node
/* Join per-JLS 2018 stats (ext/jls_stats.json, from parse_jlsmap.py) onto OSM
   admin_level=7 geometry (raw/jls_geo_osm.geojson) -> src/data/geo_jls.json.

   raw/jls_geo_osm.geojson provenance: Overpass query
     area["ISO3166-1"="HR"][admin_level=2]->.hr;
     rel(area.hr)[admin_level=7][boundary=administrative]; out geom;
   (© OpenStreetMap contributors, ODbL) -> osmtogeojson -> mapshaper
   `-simplify visvalingam 2% keep-shapes -filter-islands min-area=0.5km2
    -o precision=0.0001`.

   Matching: same folding rules as parse_jlsmap.py; OSM "Grad "/"Općina " prefixes
   stripped; duplicate names (Privlaka, Otok, Sveta Nedelja/Nedjelja) resolved by
   which county polygon contains the JLS centroid. Asserts a perfect 1:1 cover of
   all 556 JLS before writing anything. Rings rewound for d3 (geoArea > π test). */
const fs = require('fs');
const path = require('path');

const P = p => path.join(__dirname, p);

function fold(s) {
  s = s.toLowerCase().replace(/đ/g, 'd');
  s = s.replace(/[‒–—―−]/g, '-');
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}
const k2 = s => fold(s).replace(/[\s-]/g, '');

(async () => {
  const { geoArea, geoCentroid, geoContains } = await import('d3-geo');

  const stats = JSON.parse(fs.readFileSync(P('ext/jls_stats.json'), 'utf8'));  // [name, cIx, in, out]
  const geo = JSON.parse(fs.readFileSync(P('raw/jls_geo_osm.geojson'), 'utf8'));
  const counties = JSON.parse(fs.readFileSync(P('../../src/data/geo_counties.json'), 'utf8'));
  const ISOS = counties.features.map(f => f.properties.shapeISO).sort(
    (a, b) => Number(a.slice(3)) - Number(b.slice(3)));

  /* three-tier index over registry names, like the python matcher */
  const idx0 = new Map(), idx1 = new Map(), idx2 = new Map();
  const push = (m, k, i) => { const a = m.get(k) || []; if (!a.includes(i)) a.push(i); m.set(k, a); };
  stats.forEach(([name], i) => {
    const f = fold(name);
    push(idx0, f, i);
    const variants = new Set([f, ...f.split(/\s-\s/).map(p => p.trim())]);
    for (const v of variants) { push(idx1, v, i); push(idx2, k2(v), i); }
  });

  /* rewind BEFORE matching — an inverted polygon covers the sphere-complement,
     so its centroid lands on the antipode and county lookup fails */
  for (const f of geo.features) {
    if (geoArea(f) > Math.PI) {
      const rev = r => r.reverse();
      if (f.geometry.type === 'Polygon') f.geometry.coordinates.forEach(rev);
      else f.geometry.coordinates.forEach(p => p.forEach(rev));
    }
  }

  const countyOfPoint = pt => {
    for (const cf of counties.features) if (geoContains(cf, pt)) return cf.properties.shapeISO;
    /* simplified borders: fall back to nearest county centroid */
    let best = null, bd = Infinity;
    for (const cf of counties.features) {
      const c = geoCentroid(cf);
      const d = (c[0] - pt[0]) ** 2 + (c[1] - pt[1]) ** 2;
      if (d < bd) { bd = d; best = cf.properties.shapeISO; }
    }
    return best;
  };

  const taken = new Map();   // statIdx -> feature
  const unmatched = [];
  for (const f of geo.features) {
    const raw = (f.properties.name || '').replace(/^(Grad|Op[cć]ina)\s+/i, '');
    const uni = [...new Set([
      ...(idx0.get(fold(raw)) || []), ...(idx1.get(fold(raw)) || []), ...(idx2.get(k2(raw)) || []),
    ])];
    /* names repeat across counties (Novigrad ×2, Privlaka ×2, Otok ×2 …) —
       the centroid's county picks the right one even for single hits, because a
       bilingual registry name can shadow its cross-county namesake */
    let cands = uni;
    if (uni.length >= 1) {
      const cIx = ISOS.indexOf(countyOfPoint(geoCentroid(f)));
      const byCty = uni.filter(i => stats[i][1] === cIx);
      if (byCty.length === 1) cands = byCty;
      else if (uni.length > 1) cands = byCty;   /* ambiguous + county miss = no match */
    }
    if (cands.length !== 1) { unmatched.push(f.properties.name); continue; }
    const i = cands[0];
    if (taken.has(i)) throw new Error('double match: ' + f.properties.name + ' vs ' + taken.get(i).properties.name);
    taken.set(i, f);
  }

  /* Grad Zagreb is admin_level 6 in OSM (it is simultaneously a county), so the
     level-7 pull can't contain it — its JLS boundary IS the county boundary,
     which the repo already carries as HR-21 in geo_counties.json */
  const gzIx = stats.findIndex(s => s[0] === 'Grad Zagreb');
  if (!taken.has(gzIx)) {
    const gz = counties.features.find(f => f.properties.shapeISO === 'HR-21');
    taken.set(gzIx, { type: 'Feature', properties: { name: 'Grad Zagreb' }, geometry: gz.geometry });
  }

  const missing = stats.map((s, i) => [s, i]).filter(([, i]) => !taken.has(i)).map(([s]) => s[0]);
  console.log('matched:', taken.size, '/ 556 · unmatched OSM features:', JSON.stringify(unmatched));
  if (missing.length) console.log('JLS without geometry:', JSON.stringify(missing));
  if (taken.size !== 556) throw new Error('need a perfect 1:1 cover before emitting');

  const feats = [];
  for (const [i, f] of [...taken.entries()].sort((a, b) => a[0] - b[0])) {
    const [name, cIx, inn, out] = stats[i];
    feats.push({ type: 'Feature',
      properties: { j: i, n: name, c: cIx, i: inn, o: out },
      geometry: f.geometry });
  }
  /* every feature must be tiny relative to the sphere after rewinding */
  for (const f of feats) if (geoArea(f) > Math.PI) throw new Error('winding fail: ' + f.properties.n);

  /* Every validation in this pipeline is pre-write and this one was not: the
     1:1 cover check and the winding check above both precede the write, and the
     totals check sat AFTER it. A run that tripped the throw had already replaced
     the shipped 475 kB payload with the unvalidated one and then exited
     non-zero — so a maintainer seeing "stat totals drifted" reasonably assumes
     nothing was written, reverts the stats file and reruns, while the working
     tree already holds the new geometry and the next build bundles it. The file
     header says "Asserts a perfect 1:1 cover of all 556 JLS before writing
     anything", which is the mental model this restores. The totals come from
     `feats`, which already exists here, so it is a reorder and nothing else. */
  const totIn = feats.reduce((a, f) => a + f.properties.i, 0);
  const totOut = feats.reduce((a, f) => a + f.properties.o, 0);
  if (totIn !== 57465 || totOut !== 57465) throw new Error('stat totals drifted: ' + totIn + '/' + totOut);

  const outFC = { type: 'FeatureCollection', features: feats };
  fs.writeFileSync(P('../../src/data/geo_jls.json'), JSON.stringify(outFC));
  console.log('geo_jls.json:', feats.length, 'features,',
    (fs.statSync(P('../../src/data/geo_jls.json')).size / 1024).toFixed(0) + ' KB · totals in/out = 57465 OK');
})();
