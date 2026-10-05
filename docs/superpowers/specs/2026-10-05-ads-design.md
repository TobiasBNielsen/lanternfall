# Reklamer i Lanternfall – design

Dato: 5. oktober 2026

## Mål

Lanternfall skal kunne tjene penge på reklamer, både på eget site (https://lanternfall.bockersoftware.dk, Google) og på CrazyGames (deres SDK). Spillet bliver ikke dårligere at spille: der kommer aldrig en reklame midt i en bølge, og spillet virker som i dag, når der ingen reklame er (adblock, intet fyld, manglende godkendelse).

## Beslutninger

- Ét fælles ad-lag i spillet med udskiftelige udbydere: `crazygames`, `google` og `none`.
- Tre formater:
  - **Belønning i dokken:** +15 perler for en færdigset reklame, højst én gang pr. besøg i dokken.
  - **Mellemreklame ved game over:** vises, når spilleren trykker videre (ny sfære / til titelsiden).
  - **Banner på titelsiden:** kun på menu-skærmen, aldrig under spil.
- Ét fælles leaderboard. Spillet på CrazyGames kalder serveren på lanternfall.bockersoftware.dk.
- Google-delen bygges nu, men slår sig selv fra (opfører sig som `none`), indtil AdSense og H5 Games Ads er godkendt, og ID'erne står i config.
- Samtykke (GDPR): på eget site via Googles certificerede CMP ("Privacy & messaging"), som slås til i AdSense. Den indlæses af `adsbygoogle.js` selv, så der er ingen egen samtykkekode. På CrazyGames står portalen for samtykket.
- Domæneverifikation for AdSense sker via `ads.txt` på bockersoftware.dk og lanternfall.bockersoftware.dk (gjort).

## 1. Ad-laget

### `web/js/config.js` (ny)

Den eneste fil, der er forskellig mellem eget site og CrazyGames-pakken. Den indlæses før alle andre scripts.

```js
const CONFIG = {
  ads: 'google',            // 'google' | 'crazygames' | 'none'
  api: 'api/',              // CrazyGames: 'https://lanternfall.bockersoftware.dk/api/'
  google: {
    client: 'ca-pub-2275526476267750',
    h5: false,              // true når H5 Games Ads er godkendt
    bannerSlot: null,       // AdSense-annonceenhedens slot-id til titelsiden
  },
};
```

### `web/js/ads.js` (ny)

Et modul i samme stil som `Leaderboard` og `Sound` (IIFE, der returnerer et objekt). Det kalder spillet:

| Kald | Svar | Brug |
| --- | --- | --- |
| `Ads.init()` | – | Ved opstart. Indlæser udbyderens SDK. Fejl bliver slugt. |
| `Ads.canReward()` | `boolean` | Om knappen til belønning skal vises. |
| `Ads.rewarded()` | `Promise<boolean>` | `true` kun hvis reklamen blev set færdig. |
| `Ads.interstitial()` | `Promise<void>` | Resolver altid, også uden reklame. |
| `Ads.showBanner()` / `Ads.hideBanner()` | – | Titelsiden. |
| `Ads.busy` | `boolean` | Sand mens en reklame vises. Tastatur og knapper ignoreres imens. |

Regler, der gælder for alle udbydere:

- Intet kald må kaste en fejl eller hænge. Hvert kald har en timeout. Rammer timeouten, svarer `rewarded()` `false` og `interstitial()` resolver.
- Når en reklame starter, kaldes `Sound.suspend()`. Når den slutter eller fejler, kaldes `Sound.resume()`, dog kun hvis siden er synlig.
- Belønning gives aldrig ved fejl, afbrydelse eller timeout.

### Udbydere

**crazygames** (SDK v3, `https://sdk.crazygames.com/crazygames-sdk-v3.js`):

- `await CrazyGames.SDK.init()`. Er `SDK.environment === 'disabled'`, opfører modulet sig som `none`.
- Mellemreklame: `SDK.ad.requestAd('midgame', { adStarted, adFinished, adError })`. SDK'et håndhæver selv mindst 3 minutter mellem mellemreklamer (`adCooldown`), og det behandles som "ingen reklame".
- Belønning: `SDK.ad.requestAd('rewarded', …)`. Kun `adFinished` giver belønning.
- Banner: `SDK.banner.requestResponsiveBanner('adBanner')`, og `SDK.banner.clearAllBanners()` når menuen forlades.
- Spillets livscyklus: `SDK.game.gameplayStart()` når en bølge spilles, og `gameplayStop()` ved pause, dok, game over og menu.
- `canReward()` er sand, når SDK'et er klar og `SDK.ad.hasAdblock()` er falsk.

**google** (AdSense + H5 Games Ads / Ad Placement API):

- `ads.js` indsætter `adsbygoogle.js` med `data-ad-client` og `data-ad-frequency-hint="120s"`. I testtilstand (`localhost` eller `?adtest=1`) sættes også `data-adbreak-test="on"`. Det statiske script-tag i `index.html` fjernes. Verifikationen er klaret via `ads.txt`, så det er ikke længere nødvendigt.
- Den sædvanlige shim: `window.adsbygoogle = window.adsbygoogle || []; adBreak = adConfig = o => adsbygoogle.push(o)`, og `adConfig({ preloadAdBreaks: 'on', sound: 'on' })`.
- Mellemreklame: `adBreak({ type: 'next', name: 'game-over', beforeAd, afterAd, adBreakDone })`. Kun når `google.h5` er sand.
- Belønning: `adBreak({ type: 'reward', name: 'dock-pearls', beforeReward(showAdFn), adViewed, adDismissed, adBreakDone })`. `canReward()` bliver først sand, når `beforeReward` er kaldt fra en forudgående `adBreak`, altså når der står en reklame klar. Knappen kalder `showAdFn()`. Kun `adViewed` giver belønning.
- Banner: et `<ins class="adsbygoogle">` med `google.bannerSlot`, responsivt. Uden slot-id vises intet.

**none:** `canReward()` er falsk, `interstitial()` resolver med det samme, og banneret er skjult.

## 2. Koblingen til spillet

### Dokken (`web/js/ui.js`)

- `openDock()` nulstiller `G.rewardTaken = false`.
- Under de fem varer (efter `dockItems()`) kommer en sjette knap i samme `.item`-stil, når `Ads.canReward() && !G.rewardTaken`:
  - Tekst: **"▶ A word from the sponsor"**, med underteksten *"Watch a short advert and the ship adds 15 pearls to the basket."* og prisen *"free"*. Ikonet ▶ viser, at det er en reklame, som CrazyGames kræver.
  - Bogstav f) / tast F eller 6 (`web/js/input.js`).
- Ved klik: `Ads.rewarded()`. Er svaret `true`, sker `G.pearls += 15`, `G.rewardTaken = true`, `Sound.sfx.buy()` og `renderDock()`. Er svaret `false`, høres `Sound.sfx.deny()`, og knappen bliver stående.
- Så længe `Ads.busy` er sand, ignorerer `buyItem`, `leaveDock` og tasterne alt.

### Game over (`web/js/ui.js`)

- `gameOver()` er uændret, så scoren og leaderboard-kaldet aldrig bliver forsinket.
- `againBtn` og `goMenuBtn` (og Enter i `input.js`) kalder først `await Ads.interstitial()` og derefter `startGame()` eller `toMenu()`. En lille vagt forhindrer dobbeltklik.

### Titelsiden

- `<div id="adBanner" class="ad-banner hidden">` i `#menu`, efter leaderboard-sektionen. Den har en tynd ramme i `--paper-faint` og en lille overline "Advertisement", så den tydeligt er adskilt fra spillets indhold. Den må ikke give vandret scroll ved 390 px.
- `toMenu()` og den første visning kalder `Ads.showBanner()`, og `startGame()` kalder `Ads.hideBanner()`.

### Indlæsning (`web/index.html`)

`js/config.js` og `js/ads.js` indlæses efter `util.js` og før `audio.js`. `Ads.init()` kaldes fra `main.js` ved opstart.

## 3. Fælles leaderboard

- `web/js/leaderboard.js`: `const API = CONFIG.api;`.
- `server/Program.cs`: CORS-politik til `/api`. Den tillader origins, hvis host er et af suffikserne i `appsettings.json`:
  ```json
  "Cors": { "OriginSuffixes": [ ".crazygames.com" ] }
  ```
  Kun `https`, metoderne `GET`, `POST`, `PUT` og `OPTIONS`, og headerne `Content-Type` og `Authorization`. Ingen credentials, for login sker med en Bearer-header. Listen justeres, når de faktiske origins er set i CrazyGames' preview.
- Vi kontrollerer, at Simplys ModSecurity lader `OPTIONS`-preflight komme igennem. Hvis ikke, svarer appen selv på `OPTIONS`, før reglerne rammer (det vurderes ved test).
- Spillerens identitet (`lf_diver` i `localStorage`) følger CrazyGames-iframens storage. En spiller på CrazyGames er altså en anden "dykker" end samme person på eget site. Det er acceptabelt.

## 4. Pakning til CrazyGames

- `deploy/crazygames.sh` kopierer `web/` til en midlertidig mappe og:
  - erstatter `js/config.js` med `deploy/crazygames.config.js` (`ads: 'crazygames'` og fuld API-adresse),
  - indsætter `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>` før `js/config.js` i `index.html`,
  - lader `ads.txt` blive ude af pakken,
  - zipper til `lanternfall-crazygames.zip`.
- `.github/workflows/crazygames.yml` kører scriptet ved push til `main` og manuelt, og lægger zip-filen op som artifact. Selve uploaden til CrazyGames' udviklerportal sker manuelt.
- README får et kort afsnit om reklamer, config og CrazyGames-pakken.

## Fejlhåndtering

| Situation | Resultat |
| --- | --- |
| Adblock / SDK kan ikke indlæses | Udbyderen opfører sig som `none`. Ingen belønningsknap, intet banner. Game over går direkte videre. |
| Intet fyld / cooldown / frekvensloft | `interstitial()` resolver straks. `rewarded()` → `false`, deny-lyd. |
| Spilleren lukker belønningsreklamen før tid | Ingen perler, knappen bliver stående. |
| SDK svarer aldrig | Timeout (8 s før reklamen er startet), derefter som "intet fyld". |
| Fanen skjules under en reklame | Eksisterende `visibilitychange` sætter lyden på pause. `Ads` genoptager kun lyden, når siden er synlig. |
| Leaderboard-kald fra CrazyGames afvises (CORS) | Samme fejl som i dag: "No line to the ship right now." Spillet virker. |

## Test

Der er ingen testopsætning i projektet, så der testes manuelt i tre scenarier. Der tjekkes i Chrome på desktop og i mobilvisning (390 px).

1. **CrazyGames lokalt:** pakken serveres fra `localhost`, og SDK'et kører i "local"-tilstand med demo-reklamer.
   - Belønning giver +15 perler én gang pr. dok.
   - Mellemreklamen kommer ved game over.
   - Banneret vises på titelsiden og forsvinder ved start.
   - Lyden er slukket under reklamer.
   - Leaderboard-kald mod den rigtige server (efter CORS-deploy) virker fra `?useLocalSdk=true` i CrazyGames' preview.
2. **Google i testtilstand:** `dotnet run` med `?adtest=1` og `google.h5 = true` lokalt. Samme tjek.
3. **none / adblock:** `ads: 'none'` og en adblocker på eget site. Ingen knapper eller tomme rammer, og ingen fejl i konsollen, der stopper spillet.

Et pakket spil skal desuden opfylde CrazyGames' tekniske krav (størrelse, ingen eksterne links). Det gennemgås ved upload.

## Ikke med i denne omgang

- Poki, GameDistribution og andre portaler. Laget gør dem nemme at tilføje senere.
- "Andet liv"-belønning, mellemreklamer mellem bølger og bannere andre steder end titelsiden.
- Sporing af indtjening i spillet.
