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
    <div className="helpcard" id="helpCard" role="dialog" aria-modal="false" aria-label="Kako čitati atlas">
      <div className="card-hd">
        <span className="card-name">Kako čitati</span>
        {/* back to the ? that opened it — same as the Escape path in App */}
        <button className="card-x" id="helpX" aria-label="Zatvori"
          onClick={() => { setS({ help: false }); focusSoon('#helpBtn'); }}>×</button>
      </div>

      <div className="help-h">Boje</div>
      <div className="help-p">
        <b className="help-blue">Plavo</b> — županija dobiva stanovnike (pozitivna vrijednost).{' '}
        <b className="help-red">Crveno</b> — gubi ih (negativna). Sredina skale je 0, tj. ravnoteža.
        Krajevi skale su isti za sve godine da bi se godine mogle uspoređivati, pa rane godine
        izgledaju blijedo jer su vrijednosti male.
      </div>

      <div className="help-h">Izmjereno ili procjena</div>
      <div className="help-p">
        <span className="cls-tag meas">izmjereno</span> — stvarno objavljeni podatak.{' '}
        <span className="cls-tag est">procjena (IPF)</span> — izračun, ne mjerenje.
        Međužupanijski tokovi izmjereni su samo za 2018.; sve ostale godine su procjena
        (IPF = iterativno usklađivanje margina: struktura iz 2018. skalirana na DZS
        godišnje zbrojeve). Kumulativni zbroj je uvijek procjena.
      </div>

      <div className="help-h">Pojmovi</div>
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

      <div className="help-h">Kratice</div>
      <div className="help-p">
        <b>DZS</b> — Državni zavod za statistiku. <b>JLS</b> — jedinice lokalne samouprave,
        tj. gradovi i općine. <b>STAN</b> — oznaka DZS-ove serije o stanovništvu.
        <b> OD matrica</b> — origin–destination, tablica selidbi iz svake županije u svaku.
      </div>

      <div className="help-h">Upravljanje</div>
      <div className="help-p">
        <b>← →</b> mijenjaju godinu, <b>razmaknica</b> pokreće reprodukciju kroz godine.
        Kotačić miša zumira kartu i matricu, povlačenje pomiče prikaz.
        Klik na županiju otvara njezinu karticu; u Tokovima klik na partnera u popisu
        otvara koridor kroz vrijeme.
      </div>

      <div className="help-note">
        Vremenska vrpca ne mijenja panele Državljanstvo (2021.–2025.), Zemlje i Dob i spol
        (samo 2025.) ni prikaz JLS 2018. — njihov je opseg ispisan u zaglavlju svakog panela.
      </div>
    </div>
  );
}
