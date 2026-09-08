import type { RefObject } from 'react';
import { ATLAS_AUTHOR, REPO, sources } from '../lib/licences.ts';
import { PAPER, NO_AFFIL } from '../lib/credits.ts';
import { privacyNote } from '../lib/privacy.ts';
import Icon from './Icon.tsx';

export default function About({ dialog, lang }: { dialog: RefObject<HTMLDialogElement | null>; lang: 'hr' | 'en' }) {
  const L = (hr: string, en: string) => lang === 'hr' ? hr : en;
  return <dialog ref={dialog} className="v3-about" aria-labelledby="v3-about-title" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
    <div className="v3-dialog-header"><span className="v3-eyebrow">{L('O ATLASU', 'ABOUT THE ATLAS')}</span><button className="v3-icon-button" aria-label={L('Zatvori', 'Close')} onClick={() => dialog.current?.close()}><Icon name="close" /></button></div>
    <h2 id="v3-about-title">{L('Podaci s kontekstom.', 'Data with context.')}</h2><p>{L('Interaktivni pregled registriranih migracija 21 hrvatske županije od 1998. do 2025.', 'An interactive view of registered migration across Croatia’s 21 counties from 1998 to 2025.')}</p>
    <h3>{L('Kako čitati atlas', 'Reading the atlas')}</h3><ul>
      <li>{L('Saldo = doseljeni − odseljeni. Tirkizno označava dobitak, koraljno gubitak. Ljestvica boja ostaje ista kroz godine za odabranu sastavnicu i jedinicu.', 'Net migration = arrivals − departures. Teal indicates gains; coral indicates losses. The color scale stays fixed across years for the selected metric and unit.')}</li>
      <li>{L('Zbroj uvijek počinje 2011. Postotci se računaju prema stanovništvu iz popisa 2011. Prirodni prirast je broj rođenih umanjen za broj umrlih. Migracije + prirodni prirast nisu ukupna promjena stanovništva.', 'Cumulative totals start in 2011. Percentages use the 2011 census population. Natural change is births minus deaths. Migration + natural change is not total population change.')}</li>
      <li>{L('Metodologija DZS-a mijenja se 2011.; usporedbe preko te godine zahtijevaju oprez. Prije 2007. unutarnji doseljeni i odseljeni nisu potpuno usklađeni. Nacionalni migracijski pregled koristi vanjski saldo.', 'CBS methodology changes in 2011; comparisons across that year need care. Before 2007, internal arrivals and departures do not fully balance. The national migration overview uses the external balance.')}</li>
      <li>{L('Unutarnji tokovi ovdje obuhvaćaju preseljenja između županija. Samo je godišnja matrica 2018. izmjerena; ostale godine i kumulativni tokovi su IPF procjene, sa strukturom 2018. skaliranom na DZS odseljene i približnim doseljenima.', 'Internal flows here cover moves between counties. Only the annual 2018 matrix is measured; other years and cumulative flows are IPF estimates, with the 2018 structure scaled to CBS out-margins and approximate in-margins.')}</li>
    </ul>
    <h3>{L('Izvori', 'Sources')}</h3><div className="v3-source-list">{sources().map(source => <a href={source.href} key={source.href} target="_blank" rel="noreferrer"><div><strong>{source.label}</strong><span>{source.note}</span></div><Icon name="external" size={16} /></a>)}</div>
    <h3>{L('Istraživački kontekst', 'Research context')}</h3><p><a href={PAPER.url} target="_blank" rel="noreferrer">{PAPER.short}</a>. {NO_AFFIL()}</p>
    <h3>{L('Vaš izbor prikaza', 'Your display preferences')}</h3><p>{L('V2 zadržava klasične alate: klasifikaciju, regije, matricu, općine i gradove te dob, spol i državljanstvo. V3 donosi novi način istraživanja istih županijskih podataka. Verzija i posljednji prikaz pamte se u ovoj kartici preglednika. Jezik i tema spremaju se na vaš uređaj. Odabir županije i godine ostaje u fragmentu poveznice i uklanja se iz analitičkih događaja.', 'V2 retains the classic tools: classification, regions, matrix, municipalities, age, sex, and citizenship. V3 offers a new way to explore the same county data. The version and last view are remembered in this browser tab. Language and theme are saved on your device. County and year selections stay in the URL fragment and are removed from analytics events.')}</p>
    <h3>{L('Privatnost', 'Privacy')}</h3><p>{privacyNote()}</p>
    <p className="v3-dialog-credit">{ATLAS_AUTHOR} · {L('Kod', 'Code')}: MIT · <a href={REPO} target="_blank" rel="noreferrer">GitHub</a></p>
  </dialog>;
}
