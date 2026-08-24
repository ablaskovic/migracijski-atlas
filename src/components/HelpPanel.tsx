import { useEffect, useState } from 'react';
import { focusSoon } from '../lib/state.ts';
import {
  NO_AFFIL, PAPER, PAPER_THR, PAPER_WINDOW,
  paperCheckNote, paperHelpIntro, paperPending, paperTerm,
} from '../lib/credits.ts';
import { D, KLAB, PAPER_KLAS_DIFF, fmtI } from '../lib/metrics.ts';
import {
  ATLAS_AUTHOR, CODE_LICENCE, CODE_YEAR, FONT_LICENCE, FONT_LICENCES, IMG_LICENCE, REPO, sources,
} from '../lib/licences.ts';
import { L, NEWTAB, t, yrSpan } from '../lib/i18n.ts';
import type { Patch, State } from '../lib/types.ts';

/* a function for the reason Legend's twin is one: a module constant freezes the
   study's window in whatever language happened to be default at import time */
const PW = (): string => yrSpan(PAPER_WINDOW.from, PAPER_WINDOW.to);

/* The legend has room for the names; this has room for the reason. Grouped by
   transition rather than listed per county, so the sentence stays one clause
   however many counties move — and derived from PAPER_KLAS_DIFF rather than
   written out, so a DZS revision that closes the gap deletes the sentence
   instead of leaving it asserting a difference that is no longer there. */
function klasDiffSentence(): string {
  if (!PAPER_KLAS_DIFF.length) {
    return L('Na seriji koju atlas prikazuje razredi se poklapaju s objavljenima.',
      'On the series the atlas shows, the classes match the published ones.');
  }
  const by = new Map<string, typeof PAPER_KLAS_DIFF>();
  for (const d of PAPER_KLAS_DIFF) {
    const k = `${d.paper}|${d.here}`;
    by.set(k, [...(by.get(k) ?? []), d]);
  }
  const parts = [...by.entries()].map(([k, ds]) => {
    const [paper, here] = k.split('|') as [keyof typeof KLAB, keyof typeof KLAB];
    const names = ds.map(d => D[d.iso]?.n ?? d.iso).join(L(' i ', ' and '));
    return L(`${names} (u radu ${KLAB[paper]}, ovdje ${KLAB[here]})`,
      `${names} (${KLAB[paper]} in the paper, ${KLAB[here]} here)`);
  });
  /* How far past the line, derived — the sentence this replaced said the gap was
     "a few hundred people", which is true of the distance to the threshold and
     false of the distance to the study's own figures (measured: 606 and 302
     against the threshold, 1.593 and 583 against the paper). Only the first is
     recomputable here, so it is the only one stated. */
  const over = PAPER_KLAS_DIFF.filter(d => d.here === 'loss')
    .map(d => fmtI.format(Math.abs(Math.round(d.v)) - PAPER_THR));
  const tail = over.length === PAPER_KLAS_DIFF.length
    ? L(` Na ovoj seriji prelaze prag od −${fmtI.format(PAPER_THR)} za ${over.join(' odnosno ')} ${over.length > 1 ? 'osoba' : 'osobu'}.`,
      ` On this series they pass the −${fmtI.format(PAPER_THR)} line by ${over.join(' and ')} ${over.length > 1 ? 'people' : 'person'} respectively.`)
    : '';
  return L(`Razlikuju se: ${parts.join('; ')}.${tail}`, `The differences: ${parts.join('; ')}.${tail}`);
}

/* "Kako čitati" — the one stable place the vocabulary lives. Every other
   explanation in the atlas is a per-view legend note that changes as soon as the
   user switches views, so a first-time reader had nowhere to learn what saldo,
   tokovi or IPF mean, or which end of the colour ramp is which. Deliberately
   plain copy: this is the page that assumes nothing. */
/* Below 900 px the glossary stops being a card beside the map and becomes a
   near-fullscreen fixed overlay — and the ≥900 px rule that made what it covers
   inert names exactly the two elements that shared coordinates in *that* layout
   (#card and #jcard). Measured at 390×844: 33 of the cycle's 85 tab stops are
   100 % covered, including #helpBtn itself, both chip headers, a county path and
   all five footer links — and it is not a 45-press walk to reach them, it is ONE
   Shift+Tab from the just-opened dialog onto the button that opened it (2.4.11).

   Narrow, the glossary is effectively modal, so it is made modal: everything
   outside it goes inert while it is open, which is the same tool the ≥900 px
   rule already uses, applied to the set the narrow layout actually covers.
   `.sr-only` is skipped — it is the year/view status line, it cannot be covered
   by anything, it holds no tab stop, and inerting it would silence the one
   announcement the app makes while nothing has focus.

   Wide, the glossary is deliberately NOT modal — it is a 330 px card beside a
   map that stays live — and that is kept. What is not kept is the claim that a
   non-modal card covers nothing: it is 330 px of opaque panel over the map's
   left edge, and how much of the map that is depends on the width. Measured
   with 120 Tab presses and elementFromPoint at each stop: 0 entirely-obscured
   stops at 1440 px, SEVEN at 1000 px — consecutive county buttons drawn behind
   the card, focus ring included, where Enter re-selects a county the reader
   cannot see (2.4.11). Half a desktop screen, or 1440 px at 150 % zoom.
   So the map's tab stops are suspended at every width while the dialog is open,
   rather than at a breakpoint or against a geometry that a zoom or a pan
   invalidates a frame later. The trade is 21 stops the reader gives up while a
   dialog is open and Escape hands straight back; the map keeps its pointer
   behaviour throughout, and every other control on the page stays reachable,
   which is what non-modal means here. */
function useModalWhenNarrow(open: boolean, view: State['view']): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(max-width:900px)').matches);
  useEffect(() => {
    const mq = matchMedia('(max-width:900px)');
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    if (!open) return;
    const card = document.getElementById('helpCard');
    if (!card) return;
    const touched: Element[] = [];
    /* The map's own tab stops are suspended by MapView, which drives
       lib/suspendMap.ts from *every* opaque map overlay rather than from this
       one — the glossary was never the only 300-odd px of panel drawn over live
       county paths. `inert` cannot reach them either way: it is an IDL attribute
       of HTMLElement and svg#map is an SVGSVGElement, so setting it there parses
       and does nothing (measured in Chrome — a focusable child of an inert <svg>
       still takes Tab). Measured at 390×844 with the glossary open before that
       fix: 80 of the 80 tab stops outside the dialog were county paths, every one
       100 % covered, and Enter on one selected a county the reader could not see. */
    if (narrow) {
      for (let el: Element | null = card; el && el !== document.body; el = el.parentElement) {
        for (const sib of el.parentElement?.children ?? []) {
          /* skip what is already inert (#card and #jcard, set by React) so the
             cleanup below cannot clear a flag it did not set */
          if (sib === el || sib.hasAttribute('inert') || sib.classList.contains('sr-only')) continue;
          /* …and skip what `inert` cannot reach: the map is the one non-HTML
             sibling on the walk, and it is handled above. Flagging it was worse
             than useless — it made `closest('[inert]')` report the 21 county
             paths as inert to anything asking, this suite included. */
          if (!(sib instanceof HTMLElement)) continue;
          sib.setAttribute('inert', '');
          touched.push(sib);
        }
      }
    }
    return () => { touched.forEach(el => el.removeAttribute('inert')); };
    /* `view` stays a dependency: above 900 px the dialog is not modal, so the
       reader can switch views with it open, and the sibling set the walk marks
       is view-dependent. */
  }, [open, narrow, view]);
  return narrow;
}

export default function HelpPanel({ S, setS }: { S: State; setS: (p: Patch) => void }) {
  const narrow = useModalWhenNarrow(S.help, S.view);
  if (!S.help) return null;
  return (
    /* tabIndex -1 so App can move focus *into* the panel on open: it declared
       role=dialog and then left focus on the ? button three tab stops away,
       which told a screen-reader user nothing had happened. Named by its own
       visible heading rather than a duplicate aria-label. */
    <div className="helpcard" id="helpCard" role="dialog" aria-modal={narrow ? 'true' : 'false'}
      aria-labelledby="helpTitle" tabIndex={-1}>
      <div className="card-hd">
        <h2 className="card-name" id="helpTitle">{L('Kako čitati', 'How to read')}</h2>
        {/* back to the ? that opened it — same as the Escape path in App */}
        <button className="card-x" id="helpX" aria-label={L('Zatvori pojmovnik', 'Close the glossary')}
          onClick={() => { setS({ help: false }); focusSoon('#helpBtn'); }}>×</button>
      </div>

      <h3 className="help-h">{L('Boje', 'Colours')}</h3>
      <div className="help-p">
        <b className="help-blue">{L('Plavo', 'Blue')}</b>{L(' — županija dobiva stanovnike (pozitivna vrijednost). ', ' — the county gains people (a positive value). ')}
        <b className="help-red">{L('Crveno', 'Red')}</b>
        {L(' — gubi ih (negativna). Sredina skale je 0, tj. ravnoteža. Krajevi skale su isti za sve godine da bi se godine mogle uspoređivati, pa rane godine izgledaju blijedo jer su vrijednosti male.',
          ' — it loses them (a negative value). The middle of the scale is 0, i.e. balance. The ends of the scale are the same for every year so that years can be compared, which is why early years look pale: their values are small.')}
      </div>

      <h3 className="help-h">{L('Izmjereno ili procjena', 'Measured or estimated')}</h3>
      <div className="help-p">
        <span className="cls-tag meas">{t('badge.meas')}</span>{L(' — stvarno objavljeni podatak. ', ' — an actually published figure. ')}
        <span className="cls-tag est">{t('badge.est')}</span>
        {L(' — izračun, ne mjerenje. Međužupanijski tokovi izmjereni su samo za 2018.; sve ostale godine su procjena (IPF = iterativno usklađivanje margina: struktura iz 2018. skalirana na DZS godišnje zbrojeve). Usklađuju se odseljeni: zbroj svakog retka točno odgovara objavljenim odseljenima u svakoj godini. Doseljeni se reproduciraju samo približno — točno za 2018., unutar nekoliko osoba od 2007., a za 1998.–2006. objavljeni doseljeni se prije usklađivanja skaliraju na ukupne odseljene (nacionalna razlika je tada 464–550 osoba). Kumulativni zbroj je uvijek procjena.',
          ' — a computation, not a measurement. Inter-county flows are measured for 2018 only; every other year is an estimate (IPF = iterative proportional fitting: the 2018 structure scaled to CBS annual totals). It is the out-margin that is fitted: each row sums exactly to the published out-migration for that year. The in-margin is only reproduced approximately — exactly for 2018, within a few people from 2007, and for 1998–2006 the published in-margin is rescaled to the out-total before fitting (the national gap there is 464–550 people). A cumulative sum is always an estimate.')}
      </div>

      <h3 className="help-h">{L('Pojmovi', 'Terms')}</h3>
      <dl className="help-dl">
        <dt>{L('saldo', 'net balance')}</dt><dd>{L('doseljeni minus odseljeni — razlika, ne ukupan broj selidbi', 'arrivals minus departures — the difference, not the total number of moves')}</dd>
        <dt>{L('unutarnje / vanjske', 'internal / external')}</dt><dd>{L('selidbe unutar RH / selidbe preko granice', 'moves within Croatia / moves across the border')}</dd>
        <dt>{L('prirodno', 'natural')}</dt><dd>{L('rođeni minus umrli (prirodni prirast) — nema veze sa selidbama', 'births minus deaths (natural change) — nothing to do with moving house')}</dd>
        <dt>{L('mig. + prirodno', 'mig. + natural')}</dt><dd>{L('zbroj tih dviju objavljenih sastavnica; nije jednako ukupnoj promjeni broja stanovnika', 'the sum of those two published components; not the same as total population change')}</dd>
        <dt>{L('tokovi', 'flows')}</dt><dd>{L('tko se seli iz koje županije u koju (matrica podrijetlo–odredište)', 'who moves from which county to which (an origin–destination matrix)')}</dd>
        <dt>{L('koridor', 'corridor')}</dt><dd>{L('jedan par županija i selidbe među njima', 'one pair of counties and the moves between them')}</dd>
        <dt>{L('klasifikacija', 'classification')}</dt><dd>{L('podjela na pobjednice / neutralne / gubitnice prema pragu koji sami pomičete', 'the split into gaining / neutral / losing counties at a threshold you move yourself')}</dd>
        <dt>{L('kumulativno', 'cumulative')}</dt><dd>{L('zbroj svih godina od 2011. do odabrane, umjesto jedne godine', 'the sum of every year from 2011 to the selected one, instead of a single year')}</dd>
        {/* the shorthand the segment button uses; without this the view's name is
            the one control in the header that explains itself nowhere */}
        <dt>{L('godine', 'years')}</dt><dd>{L('prikaz u kojem je redak županija, a stupac godina — cijela serija svih 21 županije odjednom, u istim bojama kao karta', 'the view where a row is a county and a column a year — the whole series for all 21 counties at once, in the same colours as the map')}</dd>
        {/* Both denominators were undefined in the one surface that assumes
            nothing, and nothing said which of the two is the study's measure.
            The second also clamps: pe covers 2001.–2024., so 2025 divides by the
            2024 estimate and 1998.–2000. by the 2001 one. */}
        <dt>{L('% popisa 2011.', '% of 2011 census')}</dt><dd>{L('vrijednost podijeljena brojem stanovnika po popisu 2011. — mjera kojom se služi i rad', 'the value divided by the population at the 2011 census — the measure the paper uses too')}</dd>
        <dt>{L('% tek. procjene', '% of current estimate')}</dt><dd>{L('podijeljeno procjenom stanovništva za tu godinu; procjene postoje za 2001.–2024., pa se za ranije godine i za 2025. uzima najbliža dostupna', 'divided by the population estimate for that year; estimates exist for 2001–2024, so earlier years and 2025 use the nearest available one')}</dd>
        {/* the legend and the rail say "iz rada" in three places; without this
            entry the shorthand pointed at nothing a reader could resolve */}
        <dt>{L('rad', 'the paper')}</dt><dd>{paperTerm()}</dd>
      </dl>

      <h3 className="help-h">{L('Kratice', 'Abbreviations')}</h3>
      <div className="help-p">
        <b>{L('DZS', 'CBS')}</b>{L(' — Državni zavod za statistiku. ', ' — the Croatian Bureau of Statistics. ')}
        <b>{L('JLS', 'LAU')}</b>
        {L(' — jedinice lokalne samouprave, tj. gradovi i općine. ', ' — local administrative units, i.e. towns and municipalities. ')}
        <b>STAN</b>{L(' — oznaka DZS-ove serije o stanovništvu.', ' — the code for the CBS population series.')}
        <b>{L(' OD matrica', ' OD matrix')}</b>
        {L(' — origin–destination, tablica selidbi iz svake županije u svaku.', ' — origin–destination, a table of moves from every county to every other.')}
      </div>

      <h3 className="help-h">{L('Upravljanje', 'Controls')}</h3>
      <div className="help-p">
        <b>← →</b>{L(' mijenjaju godinu, ', ' change the year, ')}<b>Home</b> / <b>End</b>
        {L(' skaču na prvu i zadnju, ', ' jump to the first and last, ')}
        <b>{L(' razmaknica', ' space')}</b>{L(' pokreće reprodukciju kroz godine.', ' starts playback through the years.')}
        {/* zoom was wheel/pinch/drag only — the feature, and the county labels that
            only appear once a county is zoomed large enough, had no keyboard route */}
        <b> +</b>{L(' i ', ' and ')}<b>−</b>{L(' zumiraju kartu i matricu, ', ' zoom the map and the matrix, ')}
        <b>0</b>{L(' vraća na početno, a ', ' resets, and ')}<b>Shift</b>
        {L(' + strelice pomiču zumirani prikaz; isto radi kotačić miša, odnosno povlačenje mišem. Na karti i u matrici ',
          ' + the arrow keys pan a zoomed view; the mouse wheel and dragging do the same. On the map and in the matrix ')}
        <b>Enter</b>{L(' ili ', ' or ')}<b>{L('razmaknica', 'space')}</b>
        {L(' otvaraju odabrano — karticu županije, odnosno koridor; u prikazu Godine postavljaju odabranu godinu. U matrici, u prikazu Godine i na JLS karti ',
          ' opens what is selected — the county card or the corridor; in the Years view they set the selected year. In the matrix, in Years and on the LAU map ')}
        <b> Home</b> / <b>End</b>{L(' i ', ' and ')}<b>PageUp</b> / <b>PageDown</b>
        {L(' skaču kroz mrežu.', ' jump across the grid.')}
      </div>

      {/* The study states these about the very series the atlas paints, and the
          atlas said none of them. It was scrupulous about its own caveats (IPF,
          identity sums, panel scope) and silent about its source's — which, now
          that a reader can open the source and find them, reads as selective
          rather than concise. */}
      <h3 className="help-h">{L('Ograničenja podataka', 'Data limitations')}</h3>
      <div className="help-p">
        {L('Ova ograničenja iznosi i sam rad, a odnose se na iste serije koje atlas prikazuje. Vanjske migracije DZS vodi po odjavama prebivališta pri MUP-u, a velik se dio iseljenika ne odjavljuje — iseljavanje je zato podcijenjeno. Od 2011. metodologija obuhvaća i privremeni boravak, što povećava i broj doseljenih i broj odseljenih. Hrvatska nema jedinstveni registar stanovništva. U priobalnim županijama dio prijava prebivališta ne prati stvarno preseljenje (kuće za odmor), pa su njihovi pokazatelji povoljniji nego što kretanje ljudi opravdava. Dnevne migracije nisu obuhvaćene — ni u radu ni ovdje.',
          'The paper states these limitations itself, and they concern the very series the atlas displays. CBS records external migration from residence de-registrations at the Ministry of the Interior, and a large share of emigrants never de-register — so emigration is undercounted. Since 2011 the methodology also covers temporary stays, which inflates both arrivals and departures. Croatia has no unified population register. In coastal counties some residence registrations do not correspond to an actual move (holiday homes), so their indicators look better than the movement of people warrants. Commuting is not covered — neither in the paper nor here.')}
      </div>
      <div className="help-p">
        {L('Serija počinje 1998., ali su međužupanijske margine usklađene tek od 2007.: prije toga zbroj doseljenih među županijama ne odgovara zbroju odseljenih (do oko 550 osoba godišnje), pa su te godine najmekši dio serije. Kumulativni zbroj i klasifikacija uvijek počinju 2011., kao i rad.',
          'The series starts in 1998, but the inter-county margins only reconcile from 2007: before that the sum of arrivals between counties does not match the sum of departures (by up to about 550 people a year), which makes those years the softest part of the series. Cumulative sums and the classification always start in 2011, as the paper does.')}
      </div>

      {/* The full disclosure. The footer carries the same two facts in one line
          because a statement only reachable through a panel is one most readers
          never meet; this is where there is room to say why. All conditional
          copy comes from lib/credits.ts — see the header of that file. */}
      <h3 className="help-h">{L('Rad i atribucija', 'The paper and attribution')}</h3>
      <div className="help-p">
        {L('Atlas je interaktivna nadopuna znanstvenog rada koji migracije županija razmatra kao kriterij regionalizacije Hrvatske. ',
          'The atlas is an interactive companion to a paper that considers county migration as a criterion for the regionalisation of Croatia. ')}{paperHelpIntro()}
      </div>
      {/* The full citation, once, where there is room for it — the header and the
          footer carry the short form and the same link. */}
      {!paperPending() && (
        <div className="help-cite" lang="hr">
          <a className="paper-link" href={PAPER.url} target="_blank" rel="noopener noreferrer"
            aria-label={`${PAPER.citation} ${NEWTAB()}`}>{PAPER.citation}</a>
          <div className="help-doi">{PAPER.doi}</div>
        </div>
      )}
      <div className="help-p">
        {/* This used to say "nijedna brojka nije preuzeta iz rada" one sentence
            after naming the threshold, which is a number taken from the study.
            The intent — no migration figure is copied — was right and is kept;
            the exception is now stated instead of contradicted. */}
        {L('Iz rada dolazi samo ono što je u sučelju označeno s „iz rada”: prag klasifikacije (',
          'Only what the interface marks as coming “from the paper” does: the classification threshold (')}
        {'−' + fmtI.format(PAPER_THR)}
        {L(') i pripadnost županija u prikazu Regije. Osim samog praga, nijedna brojka nije preuzeta iz rada — sve su vrijednosti DZS-ove ili su izračunate ovdje. ',
          ') and which county belongs to which region in the Regions view. Apart from the threshold itself, no figure is taken from the paper — every value is CBS’s or computed here. ')}{paperCheckNote()}
      </div>
      <div className="help-p">
        <b>{L('Zašto se razredi razlikuju od objavljenih.', 'Why the classes differ from the published ones.')}</b>
        {L(` Klasifikacija ovdje primjenjuje prag iz rada, ali na novijoj DZS seriji, pa rezultat nije istovjetan objavljenome. Rad za ${PW()} objavljuje sedam pobjednica, sedam neutralnih i sedam gubitnica.`,
          ` The classification here applies the paper’s threshold, but to a newer CBS series, so the result is not identical to the published one. For ${PW()} the paper publishes seven gaining, seven neutral and seven losing counties.`)}
        {' ' + klasDiffSentence()}
        {L(` Metoda je ista; razlikuje se berba podataka. Rad računa ${PW()} — pomaknete li vremensku vrpcu dalje, prikaz više ne odgovara razdoblju koje je rad analizirao.`,
          ` The method is the same; the data vintage differs. The paper computes ${PW()} — move the scrubber beyond it and the view no longer matches the period the paper analysed.`)}
      </div>
      <div className="help-p">
        <b>{L('Kako je nastala podjela na regije.', 'How the regional split was arrived at.')}</b>
        {L(' Rad predlaže pet regija sa središtima u Zagrebu, Splitu, Rijeci i Osijeku te Središnju Hrvatsku bez izrazitog središta, ali ne objavljuje popis županija po regijama — raspored u prikazu Regije zato je tumačenje atlasa, a ne prijepis. Dvije su odluke sporne: Ličko-senjska je ovdje u Sjevernojadranskoj (rad je u varijanti s devet regija spominje uz Zadar), a Šibensko-kninska u Dalmatinskoj (rad je ne navodi među dalmatinskim dobitnicima). Rad uz podjelu na pet razmatra i međukorak s devet regija te iz literature navodi prijedloge sa sedam i s 12–15 regija; atlas prikazuje samo podjelu na pet i ne imenuje središta.',
          ' The paper proposes five regions centred on Zagreb, Split, Rijeka and Osijek, plus a Central Croatia with no pronounced centre, but it publishes no county-by-region list — so the arrangement in the Regions view is the atlas’s reading, not a transcription. Two decisions are debatable: Ličko-senjska sits in North Adriatic here (the paper mentions it alongside Zadar in its nine-region variant), and Šibensko-kninska in Dalmatian (the paper does not list it among the Dalmatian gainers). Alongside the five-region split the paper also considers an intermediate nine-region step and cites proposals of seven and of 12–15 regions from the literature; the atlas shows only the five and does not name the centres.')}
      </div>
      <div className="help-p">
        {NO_AFFIL()}{L(' Autori rada ovaj prikaz nisu pregledali, odobrili niti ga podupiru,', ' The authors of the paper have not reviewed, approved or endorsed this presentation,')}
        {L(' a za svaku pogrešku u njemu odgovoran je isključivo autor atlasa.',
          ' and any error in it is the atlas author’s alone.')}
      </div>

      {/* The footer names these four and now links them; this is where each one
          gets to say what it covers and under what terms. Kept out of the footer
          because that lane is fixed height above the map — every wrapped line it
          gains the map loses. */}
      <h3 className="help-h">{L('Licencije i izvori', 'Licences and sources')}</h3>
      <dl className="help-dl">
        {sources().map(s => (
          <div key={s.href} className="help-src">
            <a className="paper-link" href={s.href} target="_blank" rel="noopener noreferrer"
              aria-label={`${s.label} — ${s.note} ${NEWTAB()}`}>{s.label}</a>
            <span className="help-srcnote"> — {s.note}</span>
          </div>
        ))}
      </dl>
      <div className="help-p">
        {/* A rendered map is a Produced Work under ODbL §4.3, not a derived
            database, so share-alike does not reach it and the figure can carry
            its own terms — provided the attribution travels with it, which the
            export band does. CC BY so the next researcher can just use it. */}
        {L('Izvezene slike (PNG i SVG) objavljene su pod ', 'Exported images (PNG and SVG) are published under ')}
        <b>{IMG_LICENCE}</b>
        {L(' — slobodno ih upotrijebite uz navođenje izvora, koji je već otisnut na samoj slici. Kod atlasa je pod ',
          ' — use them freely with attribution, which is already printed on the image itself. The atlas code is under ')}
        <b>{CODE_LICENCE}</b>
        {/* The one credit on this page that was anonymous. Everything upstream —
            DZS, Pitoski i sur., OSM, geoBoundaries, the study's own authors — is
            named and linked; the atlas said "autor atlasa" and stopped there.
            Named here, with the repository, so a reader can check the code that
            produced every figure. Year and holder are LICENSE §1's. */}
        {` (© ${CODE_YEAR} `}<span lang="hr">{ATLAS_AUTHOR}</span>{' — '}
        <a className="paper-link" href={REPO} target="_blank" rel="noopener noreferrer"
          aria-label={`${L('Izvorni kod atlasa na GitHubu', 'The atlas source code on GitHub')}. ${NEWTAB()}`}>GitHub</a>
        {')'}{L(', a fontovi pod ', ', and the fonts under ')}
        <b>{FONT_LICENCE}</b>
        {/* one link per copyright holder, each with a name of its own and the
            new-tab warning every other external link in the app carries (3.2.5) */}
        {' ('}{FONT_LICENCES.map((f, i) => (
          <span key={f.href}>{i > 0 && ' · '}
            <a className="paper-link" href={f.href} target="_blank" rel="noopener noreferrer"
              aria-label={`${f.label} — ${FONT_LICENCE}. ${NEWTAB()}`}>{f.label}</a>
          </span>
        ))}{'). '}
        {L('IPF procjene su izračun ovog atlasa, a ne objavljena statistika — ne prosljeđujte ih kao DZS-ove brojke.',
          'The IPF estimates are this atlas’s computation, not published statistics — do not pass them on as CBS figures.')}
      </div>

      <div className="help-note">
        {L('Vremenska vrpca ne mijenja panele Državljanstvo (2021.–2025.), Zemlje i Dob i spol (samo 2025.) ni prikaz JLS 2018. — njihov je opseg ispisan u zaglavlju svakog panela.',
          'The time scrubber does not change the Citizenship (2021–2025), Countries or Age and sex (2025 only) panels, nor the LAU 2018 view — each panel states its own scope in its header.')}
      </div>
    </div>
  );
}
