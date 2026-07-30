import { focusSoon } from '../lib/state.ts';
import {
  NO_AFFIL, PAPER, PAPER_THR, PAPER_WINDOW,
  paperCheckNote, paperHelpIntro, paperPending, paperTerm,
} from '../lib/credits.ts';
import { D, KLAB, PAPER_KLAS_DIFF, fmtI } from '../lib/metrics.ts';
import {
  CODE_LICENCE, FONT_LICENCE, FONT_LICENCE_HREF, IMG_LICENCE, SOURCES,
} from '../lib/licences.ts';
import type { Patch, State } from '../lib/types.ts';

const PW = `${PAPER_WINDOW.from}.–${PAPER_WINDOW.to}.`;

/* The legend has room for the names; this has room for the reason. Grouped by
   transition rather than listed per county, so the sentence stays one clause
   however many counties move — and derived from PAPER_KLAS_DIFF rather than
   written out, so a DZS revision that closes the gap deletes the sentence
   instead of leaving it asserting a difference that is no longer there. */
function klasDiffSentence(): string {
  if (!PAPER_KLAS_DIFF.length) return 'Na seriji koju atlas prikazuje razredi se poklapaju s objavljenima.';
  const by = new Map<string, typeof PAPER_KLAS_DIFF>();
  for (const d of PAPER_KLAS_DIFF) {
    const k = `${d.paper}|${d.here}`;
    by.set(k, [...(by.get(k) ?? []), d]);
  }
  const parts = [...by.entries()].map(([k, ds]) => {
    const [paper, here] = k.split('|') as [keyof typeof KLAB, keyof typeof KLAB];
    const names = ds.map(d => D[d.iso]?.n ?? d.iso).join(' i ');
    return `${names} (u radu ${KLAB[paper]}, ovdje ${KLAB[here]})`;
  });
  /* How far past the line, derived — the sentence this replaced said the gap was
     "a few hundred people", which is true of the distance to the threshold and
     false of the distance to the study's own figures (measured: 606 and 302
     against the threshold, 1.593 and 583 against the paper). Only the first is
     recomputable here, so it is the only one stated. */
  const over = PAPER_KLAS_DIFF.filter(d => d.here === 'loss')
    .map(d => fmtI.format(Math.abs(Math.round(d.v)) - PAPER_THR));
  const tail = over.length === PAPER_KLAS_DIFF.length
    ? ` Na ovoj seriji prelaze prag od −${fmtI.format(PAPER_THR)} za ${over.join(' odnosno ')} ${over.length > 1 ? 'osoba' : 'osobu'}.`
    : '';
  return `Razlikuju se: ${parts.join('; ')}.${tail}`;
}

/* "Kako čitati" — the one stable place the vocabulary lives. Every other
   explanation in the atlas is a per-view legend note that changes as soon as the
   user switches views, so a first-time reader had nowhere to learn what saldo,
   tokovi or IPF mean, or which end of the colour ramp is which. Deliberately
   plain copy: this is the page that assumes nothing. */
export default function HelpPanel({ S, setS }: { S: State; setS: (p: Patch) => void }) {
  if (!S.help) return null;
  return (
    /* tabIndex -1 so App can move focus *into* the panel on open: it declared
       role=dialog and then left focus on the ? button three tab stops away,
       which told a screen-reader user nothing had happened. Named by its own
       visible heading rather than a duplicate aria-label. */
    <div className="helpcard" id="helpCard" role="dialog" aria-modal="false"
      aria-labelledby="helpTitle" tabIndex={-1}>
      <div className="card-hd">
        <h2 className="card-name" id="helpTitle">Kako čitati</h2>
        {/* back to the ? that opened it — same as the Escape path in App */}
        <button className="card-x" id="helpX" aria-label="Zatvori pojmovnik"
          onClick={() => { setS({ help: false }); focusSoon('#helpBtn'); }}>×</button>
      </div>

      <h3 className="help-h">Boje</h3>
      <div className="help-p">
        <b className="help-blue">Plavo</b> — županija dobiva stanovnike (pozitivna vrijednost).{' '}
        <b className="help-red">Crveno</b> — gubi ih (negativna). Sredina skale je 0, tj. ravnoteža.
        Krajevi skale su isti za sve godine da bi se godine mogle uspoređivati, pa rane godine
        izgledaju blijedo jer su vrijednosti male.
      </div>

      <h3 className="help-h">Izmjereno ili procjena</h3>
      <div className="help-p">
        <span className="cls-tag meas">izmjereno</span> — stvarno objavljeni podatak.{' '}
        <span className="cls-tag est">procjena (IPF)</span> — izračun, ne mjerenje.
        Međužupanijski tokovi izmjereni su samo za 2018.; sve ostale godine su procjena
        (IPF = iterativno usklađivanje margina: struktura iz 2018. skalirana na DZS
        godišnje zbrojeve). Kumulativni zbroj je uvijek procjena.
      </div>

      <h3 className="help-h">Pojmovi</h3>
      <dl className="help-dl">
        <dt>saldo</dt><dd>doseljeni minus odseljeni — razlika, ne ukupan broj selidbi</dd>
        <dt>unutarnje / vanjske</dt><dd>selidbe unutar RH / selidbe preko granice</dd>
        <dt>prirodno</dt><dd>rođeni minus umrli (prirodni prirast) — nema veze sa selidbama</dd>
        <dt>mig. + prirodno</dt><dd>zbroj tih dviju objavljenih sastavnica; nije jednako ukupnoj promjeni broja stanovnika</dd>
        <dt>tokovi</dt><dd>tko se seli iz koje županije u koju (matrica podrijetlo–odredište)</dd>
        <dt>koridor</dt><dd>jedan par županija i selidbe među njima</dd>
        <dt>klasifikacija</dt><dd>podjela na pobjednice / neutralne / gubitnice prema pragu koji sami pomičete</dd>
        <dt>kumulativno</dt><dd>zbroj svih godina od 2011. do odabrane, umjesto jedne godine</dd>
        {/* the shorthand the segment button uses; without this the view's name is
            the one control in the header that explains itself nowhere */}
        <dt>godine</dt><dd>prikaz u kojem je redak županija, a stupac godina — cijela serija svih 21 županije odjednom, u istim bojama kao karta</dd>
        {/* Both denominators were undefined in the one surface that assumes
            nothing, and nothing said which of the two is the study's measure.
            The second also clamps: pe covers 2001.–2024., so 2025 divides by the
            2024 estimate and 1998.–2000. by the 2001 one. */}
        <dt>% popisa 2011.</dt><dd>vrijednost podijeljena brojem stanovnika po popisu 2011. — mjera kojom se služi i rad</dd>
        <dt>% tek. procjene</dt><dd>podijeljeno procjenom stanovništva za tu godinu; procjene postoje za 2001.–2024., pa se za ranije godine i za 2025. uzima najbliža dostupna</dd>
        {/* the legend and the rail say "iz rada" in three places; without this
            entry the shorthand pointed at nothing a reader could resolve */}
        <dt>rad</dt><dd>{paperTerm()}</dd>
      </dl>

      <h3 className="help-h">Kratice</h3>
      <div className="help-p">
        <b>DZS</b> — Državni zavod za statistiku. <b>JLS</b> — jedinice lokalne samouprave,
        tj. gradovi i općine. <b>STAN</b> — oznaka DZS-ove serije o stanovništvu.
        <b> OD matrica</b> — origin–destination, tablica selidbi iz svake županije u svaku.
      </div>

      <h3 className="help-h">Upravljanje</h3>
      <div className="help-p">
        <b>← →</b> mijenjaju godinu, <b>Home</b> / <b>End</b> skaču na prvu i zadnju,
        <b> razmaknica</b> pokreće reprodukciju kroz godine.
        {/* zoom was wheel/pinch/drag only — the feature, and the county labels that
            only appear once a county is zoomed large enough, had no keyboard route */}
        <b> +</b> i <b>−</b> zumiraju kartu i matricu, <b>0</b> vraća na početno,
        a <b>Shift</b> + strelice pomiču zumirani prikaz; isto radi kotačić miša,
        odnosno povlačenje mišem.
        Na karti i u matrici <b>Enter</b> ili <b>razmaknica</b> otvaraju odabrano —
        karticu županije, odnosno koridor; u prikazu Godine postavljaju odabranu godinu.
        U matrici, u prikazu Godine i na JLS karti
        <b> Home</b> / <b>End</b> i <b>PageUp</b> / <b>PageDown</b> skaču kroz mrežu.
      </div>

      {/* The study states these about the very series the atlas paints, and the
          atlas said none of them. It was scrupulous about its own caveats (IPF,
          identity sums, panel scope) and silent about its source's — which, now
          that a reader can open the source and find them, reads as selective
          rather than concise. */}
      <h3 className="help-h">Ograničenja podataka</h3>
      <div className="help-p">
        Ova ograničenja iznosi i sam rad, a odnose se na iste serije koje atlas prikazuje.
        Vanjske migracije DZS vodi po odjavama prebivališta pri MUP-u, a velik se dio
        iseljenika ne odjavljuje — iseljavanje je zato podcijenjeno. Od 2011. metodologija
        obuhvaća i privremeni boravak, što povećava i broj doseljenih i broj odseljenih.
        Hrvatska nema jedinstveni registar stanovništva. U priobalnim županijama dio prijava
        prebivališta ne prati stvarno preseljenje (kuće za odmor), pa su njihovi pokazatelji
        povoljniji nego što kretanje ljudi opravdava. Dnevne migracije nisu obuhvaćene —
        ni u radu ni ovdje.
      </div>
      <div className="help-p">
        Serija počinje 1998., ali su međužupanijske margine usklađene tek od 2007.: prije
        toga zbroj doseljenih među županijama ne odgovara zbroju odseljenih (do oko 550 osoba
        godišnje), pa su te godine najmekši dio serije. Kumulativni zbroj i klasifikacija
        uvijek počinju 2011., kao i rad.
      </div>

      {/* The full disclosure. The footer carries the same two facts in one line
          because a statement only reachable through a panel is one most readers
          never meet; this is where there is room to say why. All conditional
          copy comes from lib/credits.ts — see the header of that file. */}
      <h3 className="help-h">Rad i atribucija</h3>
      <div className="help-p">
        Atlas je interaktivna nadopuna znanstvenog rada koji migracije županija razmatra
        kao kriterij regionalizacije Hrvatske. {paperHelpIntro()}
      </div>
      {/* The full citation, once, where there is room for it — the header and the
          footer carry the short form and the same link. */}
      {!paperPending() && (
        <div className="help-cite">
          <a className="paper-link" href={PAPER.url} target="_blank" rel="noopener noreferrer"
            aria-label={`${PAPER.citation} Otvara se u novoj kartici.`}>{PAPER.citation}</a>
          <div className="help-doi">{PAPER.doi}</div>
        </div>
      )}
      <div className="help-p">
        {/* This used to say "nijedna brojka nije preuzeta iz rada" one sentence
            after naming the threshold, which is a number taken from the study.
            The intent — no migration figure is copied — was right and is kept;
            the exception is now stated instead of contradicted. */}
        Iz rada dolazi samo ono što je u sučelju označeno s „iz rada”: prag klasifikacije
        ({'−' + fmtI.format(PAPER_THR)}) i pripadnost županija u prikazu Regije. Osim samog
        praga, nijedna brojka nije preuzeta iz rada — sve su vrijednosti DZS-ove ili su
        izračunate ovdje. {paperCheckNote()}
      </div>
      <div className="help-p">
        <b>Zašto se razredi razlikuju od objavljenih.</b> Klasifikacija ovdje primjenjuje
        prag iz rada, ali na novijoj DZS seriji, pa rezultat nije istovjetan objavljenome.
        Rad za {PW} objavljuje sedam pobjednica, sedam neutralnih i sedam gubitnica.
        {' ' + klasDiffSentence()} Metoda je ista; razlikuje se berba podataka. Rad računa {PW}
        — pomaknete li vremensku vrpcu dalje, prikaz više ne odgovara razdoblju koje je rad
        analizirao.
      </div>
      <div className="help-p">
        <b>Kako je nastala podjela na regije.</b> Rad predlaže pet regija sa središtima u
        Zagrebu, Splitu, Rijeci i Osijeku te Središnju Hrvatsku bez izrazitog središta, ali
        ne objavljuje popis županija po regijama — raspored u prikazu Regije zato je
        tumačenje atlasa, a ne prijepis. Dvije su odluke sporne: Ličko-senjska je ovdje u
        Sjevernojadranskoj (rad je u varijanti s devet regija spominje uz Zadar), a
        Šibensko-kninska u Dalmatinskoj (rad je ne navodi među dalmatinskim dobitnicima).
        Rad uz podjelu na pet razmatra i međukorak s devet regija te iz literature navodi
        prijedloge sa sedam i s 12–15 regija; atlas prikazuje samo podjelu na pet i ne
        imenuje središta.
      </div>
      <div className="help-p">
        {NO_AFFIL} Autori rada ovaj prikaz nisu pregledali, odobrili niti ga podupiru,
        a za svaku pogrešku u njemu odgovoran je isključivo autor atlasa.
      </div>

      {/* The footer names these four and now links them; this is where each one
          gets to say what it covers and under what terms. Kept out of the footer
          because that lane is fixed height above the map — every wrapped line it
          gains the map loses. */}
      <h3 className="help-h">Licencije i izvori</h3>
      <dl className="help-dl">
        {SOURCES.map(s => (
          <div key={s.href} className="help-src">
            <a className="paper-link" href={s.href} target="_blank" rel="noopener noreferrer"
              aria-label={`${s.label} — ${s.note} Otvara se u novoj kartici.`}>{s.label}</a>
            <span className="help-srcnote"> — {s.note}</span>
          </div>
        ))}
      </dl>
      <div className="help-p">
        {/* A rendered map is a Produced Work under ODbL §4.3, not a derived
            database, so share-alike does not reach it and the figure can carry
            its own terms — provided the attribution travels with it, which the
            export band does. CC BY so the next researcher can just use it. */}
        Izvezene slike (PNG i SVG) objavljene su pod <b>{IMG_LICENCE}</b> — slobodno ih
        upotrijebite uz navođenje izvora, koji je već otisnut na samoj slici. Kod atlasa je
        pod <b>{CODE_LICENCE}</b>, a fontovi (Oswald, IBM Plex) pod{' '}
        <a className="paper-link" href={FONT_LICENCE_HREF} target="_blank" rel="noopener noreferrer">{FONT_LICENCE}</a>.
        IPF procjene su izračun ovog atlasa, a ne objavljena statistika — ne prosljeđujte ih
        kao DZS-ove brojke.
      </div>

      <div className="help-note">
        Vremenska vrpca ne mijenja panele Državljanstvo (2021.–2025.), Zemlje i Dob i spol
        (samo 2025.) ni prikaz JLS 2018. — njihov je opseg ispisan u zaglavlju svakog panela.
      </div>
    </div>
  );
}
