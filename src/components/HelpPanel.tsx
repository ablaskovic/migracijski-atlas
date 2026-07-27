import { focusSoon } from '../lib/state.ts';
import type { Patch, State } from '../lib/types.ts';

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
        karticu županije, odnosno koridor. U matrici i na JLS karti
        <b> Home</b> / <b>End</b> i <b>PageUp</b> / <b>PageDown</b> skaču kroz mrežu.
      </div>

      <div className="help-note">
        Vremenska vrpca ne mijenja panele Državljanstvo (2021.–2025.), Zemlje i Dob i spol
        (samo 2025.) ni prikaz JLS 2018. — njihov je opseg ispisan u zaglavlju svakog panela.
      </div>
    </div>
  );
}
