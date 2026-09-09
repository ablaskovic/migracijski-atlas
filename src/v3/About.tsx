import { useRef, type RefObject } from 'react';
import { APP_VERSION, ATLAS_AUTHOR, CODE_LICENCE, CODE_YEAR, FONT_LICENCE, FONT_LICENCES, IMG_LICENCE, REPO, sources } from '../lib/licences.ts';
import { NO_AFFIL, PAPER, PAPER_KLAS, PAPER_THR, PAPER_WINDOW, paperCaveatLine, regionReadingLine } from '../lib/credits.ts';
import { CIT, D, DEMO, ISOS, PAPER_KLAS_DIFF, PE_SPAN, YEARS, klasLab } from '../lib/metrics.ts';
import { ANALYTICS_URL, privacyNote } from '../lib/privacy.ts';
import Icon from './Icon.tsx';
import './research-context.css';

export default function About({ dialog, lang }: { dialog: RefObject<HTMLDialogElement | null>; lang: 'hr' | 'en' }) {
  const L = (hr: string, en: string) => lang === 'hr' ? hr : en;
  const nf = new Intl.NumberFormat(lang === 'hr' ? 'hr-HR' : 'en-GB');
  const period = `${PAPER_WINDOW.from}–${PAPER_WINDOW.to}`;
  const newTab = L('Otvara se u novoj kartici', 'Opens in a new tab');
  const build = APP_VERSION();
  const backdropPress = useRef(false);
  const outside = (x: number, y: number) => { const r = dialog.current?.getBoundingClientRect(); return !!r && (x < r.left || x > r.right || y < r.top || y > r.bottom); };
  return <dialog ref={dialog} className="v3-about" aria-labelledby="v3-about-title"
    onPointerDown={e => { backdropPress.current = e.target === e.currentTarget && outside(e.clientX, e.clientY); }}
    onPointerCancel={() => { backdropPress.current = false; }}
    onClick={e => { if (backdropPress.current && e.target === e.currentTarget && outside(e.clientX, e.clientY)) dialog.current?.close(); backdropPress.current = false; }}>
    <div className="v3-dialog-header"><span className="v3-eyebrow">{L('O ATLASU', 'ABOUT THE ATLAS')}</span><button className="v3-icon-button" aria-label={L('Zatvori', 'Close')} onClick={() => dialog.current?.close()}><Icon name="close" /></button></div>
    <h2 id="v3-about-title">{L('Podaci s kontekstom.', 'Data with context.')}</h2>
    <p>{L(`Interaktivni pregled registriranih migracija ${ISOS.length} hrvatske županije od ${YEARS[0]}. do ${YEARS[YEARS.length - 1]}.`, `An interactive view of registered migration across Croatia’s ${ISOS.length} counties from ${YEARS[0]} to ${YEARS[YEARS.length - 1]}.`)}</p>

    <h3>{L('Znanstveni rad i atribucija', 'The research paper and attribution')}</h3>
    <p>{L('Atlas je interaktivna nadopuna radu koji migracije županija razmatra kao kriterij regionalizacije Hrvatske.', 'The atlas is an interactive companion to a paper that considers county migration as a criterion for the regionalisation of Croatia.')}</p>
    <p className="v3-about-citation" lang="hr"><a href={PAPER.url} target="_blank" rel="noopener noreferrer">{PAPER.citation}</a></p>
    <div className="v3-about-paper-links"><a href={PAPER.url} target="_blank" rel="noopener noreferrer" aria-label={`${L('Rad na Hrčku', 'Paper on Hrčak')}. ${newTab}`}>Hrčak<Icon name="external" size={13} /></a><a href={PAPER.doi} target="_blank" rel="noopener noreferrer" aria-label={`DOI. ${newTab}`}>DOI<Icon name="external" size={13} /></a><span>{L('Otvoreni pristup', 'Open access')} · {PAPER.licence}</span></div>
    <p className="v3-about-independence">{NO_AFFIL()}{' '}{L('Autori rada ovaj prikaz nisu pregledali, odobrili niti ga podupiru. Za pogreške u atlasu odgovoran je autor atlasa.', 'The paper’s authors have not reviewed, approved or endorsed this presentation. Errors in the atlas are the atlas author’s responsibility.')}</p>

    <details><summary>{L('Kako čitati atlas · pojmovi', 'Reading the atlas · glossary')}<Icon name="chevron" size={17} /></summary>
      <p>{L('Tirkizno označava pozitivnu, a koraljno negativnu vrijednost. Sredina ljestvice je nula. Za odabranu sastavnicu, jedinicu i godišnji ili kumulativni prikaz ljestvica boja ostaje ista kroz godine.', 'Teal indicates positive values and coral negative values. The midpoint is zero. For the chosen metric, unit and annual or cumulative mode, the color scale stays fixed across years.')}</p>
      <dl className="v3-about-glossary">
        <dt>{L('Migracijski saldo', 'Net migration')}</dt><dd>{L('Doseljeni − odseljeni. Saldo opisuje razliku, a ne ukupan broj preseljenja.', 'Arrivals − departures. The balance describes the difference, not the total number of moves.')}</dd>
        <dt>{L('Unutarnje / vanjske', 'Internal / external')}</dt><dd>{L('Preseljenja unutar Hrvatske / preko državne granice. Županijski tokovi prikazuju samo preseljenja između županija.', 'Moves within Croatia / across the national border. County flows show only moves between counties.')}</dd>
        <dt>{L('Prirodni prirast', 'Natural change')}</dt><dd>{L('Živorođeni − umrli. Zbroj migracija i prirodnog prirasta nije ukupna promjena broja stanovnika.', 'Live births − deaths. Migration plus natural change is not total population change.')}</dd>
        <dt>{L('Kumulativno', 'Cumulative')}</dt><dd>{L('Zbroj godišnjih vrijednosti od 2011. do odabrane godine, uključivo.', 'The sum of annual values from 2011 through the selected year, inclusive.')}</dd>
        <dt>{L('% popisa 2011.', '% of 2011 census')}</dt><dd>{L('Vrijednost podijeljena brojem stanovnika iz popisa 2011. i pomnožena sa 100. Baza ostaje ista za sve godine.', 'The value divided by 2011 census population, multiplied by 100. The population base stays fixed across years.')}</dd>
        <dt>{L('% tekuće procjene', '% of current estimate')}</dt><dd>{L(`Vrijednost prema procjeni stanovništva odabrane godine. Procjene su dostupne za ${PE_SPAN[0]}.–${PE_SPAN[1]}.; izvan raspona koristi se najbliža dostupna godina. Kumulativna stopa koristi procjenu završne godine, a ne zbroj godišnjih postotaka.`, `The value relative to the selected year’s population estimate. Estimates cover ${PE_SPAN[0]}–${PE_SPAN[1]}; outside this range the nearest available year is used. A cumulative rate uses the endpoint estimate, not a sum of annual percentages.`)}</dd>
        <dt>{L('Koridor / OD matrica', 'Corridor / OD matrix')}</dt><dd>{L('Koridor je par mjesta i preseljenja među njima. Matrica podrijetlo–odredište povezuje mjesta iz kojih ljudi odlaze s onima u koja dolaze. Neto ovisi o tome čija se perspektiva prikazuje.', 'A corridor is a pair of places and the moves between them. An origin–destination matrix connects where people leave with where they arrive. The net balance depends on whose perspective is shown.')}</dd>
        <dt>{L('Klasifikacija', 'Classification')}</dt><dd>{L('Pobjednice imaju pozitivan saldo; neutralne su između negativnog praga i nule; gubitnice su ispod praga.', 'Gaining counties have a positive balance; neutral counties fall between the negative threshold and zero; losing counties fall below the threshold.')}</dd>
        <dt>{L('Godine', 'Years')}</dt><dd>{L('Redak predstavlja županiju, a stupac godinu. Boja ćelije pokazuje vrijednost odabrane sastavnice.', 'Each row is a county and each column a year. Cell color shows the selected metric’s value.')}</dd>
        <dt>{L('DZS / JLS / STAN', 'CBS / LAU / STAN')}</dt><dd>{L('Državni zavod za statistiku / jedinice lokalne samouprave (gradovi i općine) / oznaka DZS-ove serije o stanovništvu.', 'Croatian Bureau of Statistics / local administrative units (towns and municipalities) / the CBS population-series code.')}</dd>
      </dl>
    </details>

    <details><summary>{L('Koje godine i koja područja?', 'Which years and which areas?')}<Icon name="chevron" size={17} /></summary>
      <ul className="v3-about-scope">
        <li>{L(`Županijski migracijski saldo i prirodni prirast: ${YEARS[0]}.–${YEARS[YEARS.length - 1]}. Nacionalni migracijski pregled koristi vanjski saldo.`, `County migration balances and natural change: ${YEARS[0]}–${YEARS[YEARS.length - 1]}. The national migration overview uses net external migration.`)}</li>
        <li>{L('Međužupanijski koridori: izmjereno 2018.; ostale godine i svaki kumulativni zbroj su IPF procjene. Karta gradova i općina te njihovi koridori odnose se samo na unutarnje migracije 2018.', 'Inter-county corridors: measured in 2018; other years and every cumulative total are IPF estimates. Town and municipality maps and corridors cover internal migration in 2018 only.')}</li>
        <li>{L(`Državljanstvo: nacionalne vanjske migracije ${CIT.years[0]}.–${CIT.years[CIT.years.length - 1]}. Skupine označavaju državljanstvo, a ne zemlju prethodnog boravka.`, `Citizenship: national external migration in ${CIT.years[0]}–${CIT.years[CIT.years.length - 1]}. Groups describe citizenship, not the country of previous residence.`)}</li>
        <li>{L(`Zemlje podrijetla i odredišta te dob i spol: nacionalni podaci samo za ${DEMO.year}. Popis zemalja prikazuje najvećih ${DEMO.countries.length} po doseljenima i ostatak; nije riječ o državljanstvu.`, `Countries of origin and destination, age and sex: national data for ${DEMO.year} only. The country list shows the top ${DEMO.countries.length} by arrivals and the remainder; it does not describe citizenship.`)}</li>
        <li>{L('Ukupan broj unutarnjih preseljenja u podacima o dobi i spolu uključuje i preseljenja unutar županije. Zato je veći od zbroja međužupanijskih odlazaka.', 'Total internal moves in age and sex data include moves within counties. This makes the total larger than the sum of inter-county departures.')}</li>
      </ul>
    </details>

    <details><summary>{L('Izmjereni tokovi i IPF procjene', 'Measured flows and IPF estimates')}<Icon name="chevron" size={17} /></summary>
      <p>{L('IPF znači iterativno usklađivanje margina. Struktura izmjerenih tokova iz 2018. skalira se na DZS-ove godišnje odseljene. Zbroj svakog retka odgovara objavljenim odseljenima; doseljeni se reproduciraju približno. Koridor s nulom u 2018. ostaje nula u svakoj procijenjenoj godini.', 'IPF means iterative proportional fitting. The measured 2018 flow structure is scaled to CBS annual departures. Each row matches published departures; arrivals are reproduced approximately. A corridor with zero moves in 2018 remains zero in every estimated year.')}</p>
      <p>{L('Od 2007. razlike u doseljenima iznose nekoliko osoba po županiji. Za 1998.–2006. objavljeni doseljeni prije usklađivanja skaliraju se na ukupne odseljene; nacionalne margine razlikuju se do oko 550 osoba. Ovi izračuni nisu objavljena DZS statistika i ne smiju se predstavljati kao takva.', 'From 2007, arrival differences are within a few people per county. For 1998–2006, published arrivals are rescaled to total departures before fitting; national margins differ by up to about 550 people. These calculations are not published CBS statistics and must not be presented as such.')}</p>
      <p>{L('Debljina luka koristi korijensku skalu broja preseljenja. Koridori ispod pet osoba nisu ucrtani; njihov izostanak s karte ne znači nužno nulu.', 'Arc width uses a square-root scale of the number of moves. Corridors below five people are not drawn; their absence from the map does not necessarily mean zero.')}</p>
    </details>

    <details><summary>{L('Metoda rada, klasifikacija i regije', 'The paper’s method, classification and regions')}<Icon name="chevron" size={17} /></summary>
      <p>{L(`Rad računa klasifikaciju za ${period}. uz apsolutni prag −${nf.format(PAPER_THR)} osoba. Objavljuje ${PAPER_KLAS.gain.length} pobjednica, ${PAPER_KLAS.neu.length} neutralnih i ${PAPER_KLAS.loss.length} gubitnica. Promijenjeni prag, relativni prag ili drugo razdoblje daju drukčije pitanje od onoga u radu.`, `The paper classifies ${period} with an absolute threshold of −${nf.format(PAPER_THR)} people. It reports ${PAPER_KLAS.gain.length} gaining, ${PAPER_KLAS.neu.length} neutral and ${PAPER_KLAS.loss.length} losing counties. A changed threshold, a relative threshold or another period asks a different question from the paper.`)}</p>
      <p>{paperCaveatLine()}{'. '}{L('Osim praga, migracijske vrijednosti nisu prepisane iz rada: potječu iz DZS-a ili izračuna atlasa.', 'Apart from the threshold, migration values are not copied from the paper: they come from CBS or the atlas’s calculations.')}</p>
      {PAPER_KLAS_DIFF.length > 0 && <p>{L('Na sadašnjoj seriji, uz izvorni prag i razdoblje, razlikuju se: ', 'With the original threshold and period, the current series differs for: ')}{PAPER_KLAS_DIFF.map((d, i) => <span key={d.iso}>{i > 0 && '; '}<span lang="hr">{D[d.iso].n}</span>{` (${klasLab(d.paper, 1)} → ${klasLab(d.here, 1)})`}</span>)}.</p>}
      <p>{regionReadingLine()}{' '}{L('Prikazana je podjela na pet regija. Rad razmatra i druge regionalizacije.', 'The atlas shows the five-region split. The paper considers other regionalisations too.')}</p>
      <p>{L('Dvije su pripadnosti posebno otvorene raspravi: ', 'Two assignments are particularly open to discussion: ')}<span lang="hr">Ličko-senjska</span>{L(' je u Sjevernojadranskoj regiji, a ', ' is in North Adriatic, and ')}<span lang="hr">Šibensko-kninska</span>{L(' u Dalmatinskoj. Rad prvu povezuje sa Zadrom u varijanti s devet regija, a drugu ne navodi među dalmatinskim dobitnicima.', ' is in Dalmatian. The paper associates the former with Zadar in its nine-region variant and does not list the latter among the Dalmatian gainers.')}</p>
    </details>

    <details><summary>{L('Ograničenja podataka', 'Data limitations')}<Icon name="chevron" size={17} /></summary>
      <p>{L('Podaci opisuju registrirane migracije. Rad upozorava da se dio iseljenika ne odjavljuje, zbog čega je iseljavanje podcijenjeno. Od 2011. metodologija obuhvaća i privremeni boravak; usporedbe preko te godine zahtijevaju oprez.', 'The data describe registered migration. The paper notes that some emigrants do not de-register, so emigration is undercounted. Since 2011, the methodology also covers temporary stays; comparisons across that year need care.')}</p>
      <p>{L('Rad navodi nedostatak jedinstvenog registra stanovništva te upozorava da neke prijave prebivališta u priobalju mogu odražavati kuće za odmor, a ne stvarno preseljenje. Dnevne migracije i putovanja na posao nisu obuhvaćeni.', 'The paper notes the absence of a unified population register and cautions that some coastal residence registrations may reflect holiday homes rather than actual moves. Daily commuting and travel to work are not covered.')}</p>
      <p>{L('Prije 2007. zbrojevi međužupanijskih doseljenih i odseljenih ne podudaraju se u potpunosti. Županijski saldo, tokovi i prirodni prirast opisuju različite veličine; saldo nije broj jedinstvenih ljudi niti ukupna promjena stanovništva.', 'Before 2007, inter-county arrivals and departures do not fully balance. County balances, flows and natural change describe different quantities; a balance is neither a count of unique people nor total population change.')}</p>
    </details>

    <h3>{L('Izvori i licencije', 'Sources and licences')}</h3>
    <div className="v3-source-list">{sources().map(source => <a href={source.href} key={source.href} target="_blank" rel="noopener noreferrer" aria-label={`${source.label} — ${source.note}. ${newTab}`}><div><strong>{source.label}</strong><span>{source.note}</span></div><Icon name="external" size={16} /></a>)}</div>
    <p className="v3-about-licences">{L('Izvezene slike (PNG i SVG): ', 'Exported images (PNG and SVG): ')}<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">{IMG_LICENCE}</a>{L(', uz zadržavanje atribucije. Podaci ostaju pod uvjetima svojih izvora; granice su pod ', ', retaining attribution. Data remain under their source terms; boundaries use ')}<a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">ODbL 1.0</a>{L('. Kod: ', '. Code: ')}{CODE_LICENCE}{L('. Fontovi: ', '. Fonts: ')}{FONT_LICENCE}{' ('}{FONT_LICENCES.map((f, i) => <span key={f.href}>{i > 0 && ' · '}<a href={f.href} target="_blank" rel="noopener noreferrer" aria-label={`${f.label} — ${FONT_LICENCE}. ${newTab}`}>{f.label}</a></span>)}).</p>

    <details><summary>{L('Privatnost i spremljene postavke', 'Privacy and saved preferences')}<Icon name="chevron" size={17} /></summary>
      <p>{privacyNote()}</p>
      <a className="v3-about-privacy-link" href={ANALYTICS_URL} target="_blank" rel="noopener noreferrer" aria-label={`${L('Vercelova pravila privatnosti', 'Vercel’s privacy policy')}. ${newTab}`}>{L('Vercelova pravila privatnosti', 'Vercel’s privacy policy')}<Icon name="external" size={14} /></a>
      <p>{L('Verzija i posljednji prikaz pamte se u ovoj kartici preglednika. Jezik i tema spremaju se na vaš uređaj. Odabrana županija, godina i ostale postavke analize žive u fragmentu poveznice (#…), koji preglednik ne šalje poslužitelju; fragment se uklanja i iz analitičkih događaja. Nema pretraživanja lokacije putem vanjske usluge.', 'The version and last view are remembered in this browser tab. Language and theme are saved on your device. The selected county, year and other analysis settings live in the URL fragment (#…), which the browser does not send to the server; the fragment is also removed from analytics events. No external service is used to look up your location.')}</p>
    </details>
    <p className="v3-dialog-credit">{L('Autor atlasa', 'Atlas author')}: <span lang="hr">{ATLAS_AUTHOR}</span> · © {CODE_YEAR} · {CODE_LICENCE}{build && <> · {L('Izdanje koda', 'Build')} {build}</>} · <a href={REPO} target="_blank" rel="noopener noreferrer" aria-label={`${L('Izvorni kod atlasa na GitHubu', 'Atlas source code on GitHub')}. ${newTab}`}>GitHub<Icon name="external" size={12} /></a></p>
  </dialog>;
}
