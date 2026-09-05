# prh-company-search

Selainpohjainen (vanilla JavaScript, ei build-vaihetta) sovellus, jolla haetaan
yritysten osoitteenmuutostietoja PRH:n (Patentti- ja rekisterihallitus) avoimesta
datasta (https://avoindata.prh.fi/fi) ja tulevaisuudessa myös muista
tietolähteistä.

## Ominaisuudet

- Hakualueen määritys joko
  - **säteellä (0–10 km)** annetusta osoitteesta, tai
  - **postinumeroittain** (yksi tai useampi).
- Haun voi **tallentaa** (nimellä, selaimen `localStorage`iin) ja ajaa myöhemmin
  uudelleen, tai avata suoraan tallennetun tuloksen "kuvan".
- Rajaus yrityksen koon mukaan (liikevaihto ja/tai henkilöstömäärä).
- Rajaus pois:
  - c/o-osoitteet
  - asunto-osakeyhtiöt
- Tulosten vienti **CSV**-muotoon.
- Tulosten **lajittelu**: nimi, koko, muutospäivä.
- Jokaiselle tulokselle näytetään aika muutospäivästä muodossa **vv/kk**.

## Ajaminen

Sovellus käyttää selaimen natiiveja ES-moduuleja (`<script type="module">`),
joten se pitää tarjoilla HTTP:n yli (ei `file://`, koska selaimet estävät
moduulien latauksen `file://`-protokollasta). Esimerkiksi:

```bash
# Python
python3 -m http.server 8080

# tai Node
npx http-server -p 8080
```

Avaa sitten selaimessa `http://localhost:8080`.

Ei ulkoisia riippuvuuksia / paketteja - kaikki koodi on tavallista selain-JS:ää.

## Arkkitehtuuri

```
index.html            Käyttöliittymän runko
css/styles.css        Tyylit
js/app.js             UI-kytkennät (tapahtumankäsittelijät, DOM-päivitykset)
js/models/Company.js  Yhtenäinen ("normalisoitu") yritys-tietomalli
js/providers/         Tietolähteet (data-adapterit)
  DataProvider.js        Abstrakti rajapinta yritysrekisteritiedolle
  PrhProvider.js          PRH-toteutus (avoindata.prh.fi)
  CompanySizeProvider.js  Abstrakti rajapinta kokotiedolle (liikevaihto/henkilöstö)
  LocalSizeProvider.js    Oletustoteutus: paikallinen/tuotu kokotieto
  ProviderRegistry.js     Rekisteri, josta UI valitsee aktiiviset providerit
js/services/           Puhdasta logiikkaa, ei UI-riippuvuuksia
  SearchController.js    Kokoaa haun: provider + suodattimet + koko
  GeocodingService.js     Osoite -> koordinaatit (Nominatim/OpenStreetMap)
  RadiusSearchService.js  Sädehaku kunnan karkean suodatuksen + etäisyyslaskun avulla
  ExclusionFilters.js     c/o- ja asunto-osakeyhtiö-suodattimet
  SizeFilterService.js    Liikevaihto/henkilöstösuodatus
  SortService.js          Lajittelu
  DateUtils.js            vv/kk-muotoilu
  CsvExportService.js     CSV-vienti
  SavedSearchService.js   Tallennetut haut (localStorage)
```

### Providerin lisääminen (laajennettavuus)

Uuden yritysrekisteri-tietolähteen lisääminen ei vaadi muutoksia muualle
sovellukseen:

1. Luo uusi luokka, joka perii `DataProvider`-luokan ja toteuttaa
   `searchByPostCodes` / `searchByMunicipality` palauttaen `Company`-mallin
   mukaisia olioita (`createCompany(...)`).
2. Rekisteröi se `js/providers/ProviderRegistry.js`-tiedostoon.
3. Lisää se valikoksi `index.html`:n `#data-provider`-valintaan (tapahtuu
   automaattisesti, koska `app.js` lukee providerit rekisteristä).

Sama pätee kokotietolähteille (`CompanySizeProvider`).

## Oletukset ja rajoitukset (tärkeää lukea)

PRH:n avoin data ja sen julkinen rajapinta eivät tue kaikkea, mitä alkuperäinen
toive kattoi täydellisesti. Seuraavat kohdat on ratkaistu parhaalla
mahdollisella tavalla ja dokumentoitu sekä koodissa (`PrhProvider.js`,
`RadiusSearchService.js`) että tässä:

- **Osoitteen muutospäivä**: PRH:n avoimessa datassa ei ole erillistä
  "osoitteenmuutospäivä"-kenttää. Sovellus käyttää osoitetietueen omaa
  `registrationDate`-kenttää (osoitteen rekisteröinti-/voimaantulopäivä)
  parhaana julkisesti saatavilla olevana vastineena.
- **Säteittäinen haku**: PRH:n rajapinnassa ei ole natiivia geo-/säde-hakua.
  Sovellus geokoodaa annetun osoitteen (OpenStreetMap Nominatim), hakee PRH:sta
  kaikki kyseisen **kunnan** yritykset karkeana esisuodatuksena, geokoodaa
  jokaisen ehdokasyrityksen osoitteen ja suodattaa lopuksi todellisen
  etäisyyden (Haversine-kaava) mukaan ≤ valittu säde. Tämä voi jättää
  huomiotta kuntarajan juuri toisella puolella olevia yrityksiä, ja on hidas
  suurissa kunnissa (rajattu `maxCandidates`-arvolla, oletus 60 yritystä -
  Nominatimin käyttöehtojen kunnioittaminen tarkoittaa ~1 geokoodauspyyntö/s,
  joten haku voi kestää jopa minuutin verran). Jos tulevaisuudessa
  jokin tietolähde tarjoaa natiivin säde-/geohaun, se voidaan toteuttaa
  suoraan kyseisen providerin sisällä ilman, että muuta koodia tarvitsee
  muuttaa.
- **Yrityksen koko (liikevaihto/henkilöstömäärä)**: PRH:n avoin
  kaupparekisteridata ei sisällä talous- tai henkilöstötietoja lainkaan -
  vain rekisteritiedot (nimi, yritysmuoto, osoitteet, päivämäärät).
  Sovellus **ei siis keksi tai arvioi** näitä lukuja. Sen sijaan
  `LocalSizeProvider` mahdollistaa koon syöttämisen käsin tulostaulukkoon tai
  tuomisen CSV-tiedostosta (`y-tunnus,liikevaihto,henkilostomaara`), jonka
  jälkeen koon mukainen suodatus ja lajittelu toimivat normaalisti. Kun
  todellinen maksullinen kokotieto-API (esim. Asiakastieto, Finder, Vainu)
  otetaan käyttöön, sille kirjoitetaan oma `CompanySizeProvider`-toteutus -
  suodatus/lajittelu/UI eivät muutu.
- **Geokoodaus (Nominatim)**: käytetään ilmaista julkista OpenStreetMap
  Nominatim-palvelua, jonka käyttöehdot rajoittavat pyyntitiheyttä
  (~1 pyyntö/s). Sovellus kunnioittaa tätä kuristamalla pyyntöjä, mikä voi
  tehdä laajoista säteittäisistä hauista hitaita. Tuotantokäytössä suositellaan
  oman Nominatim-instanssin tai kaupallisen geokooderin käyttöä.
- **c/o- ja asunto-osakeyhtiösuodatus** perustuu osoitteen `careOf`-kenttään
  sekä yrityksen nimen/yritysmuodon tekstihahmontunnistukseen (esim.
  "Asunto Oy", "As Oy", "asunto-osakeyhtiö"). Poikkeukselliset nimeämiskäytännöt
  voivat teoriassa livahtaa suodattimen ohi; tarkempi tunnistus voidaan lisätä
  myöhemmin PRH:n `companyForms`-koodien tarkentuessa.
- Jos PRH:n rajapinnan JSON-kentät muuttuvat tai poikkeavat oletetusta
  rakenteesta, ainoastaan `PrhProvider._mapCompany`/`_mapAddress` tarvitsee
  päivittää - loppu sovellus toimii normalisoidun `Company`-mallin varassa.
