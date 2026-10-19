# Osobní web — Kryštof Moravec

Jednostránkové osobní portfolio, dvojjazyčné (čeština / angličtina). Výsledkem
je pořád statický web — HTML, CSS a JavaScript bez serveru —, ale skládá ho
build přes [Vite](https://vite.dev/).

## Proč build

Do října 2026 web žádný build neměl a bylo to záměrné: jeden HTML soubor,
jedno CSS, jeden skript, nic k instalaci. Build vznikl kvůli plánované
animované 3D scéně na pozadí (Three.js, GSAP ScrollTrigger, Lenis):

- **Knihovny musí být z npm, ne z CDN.** CSP povoluje jen skripty z vlastní
  domény (`script-src 'self'`), takže cokoli z cdnjs nebo unpkg by prohlížeč
  odmítl. Bez buildu by se knihovny musely ručně kopírovat do repozitáře a
  aktualizovat po jedné.
- **Bez buildu by nefungovaly addony Three.js.** Importují holý specifikátor
  `'three'`, na který prohlížeč potřebuje importmapu. Ta se dá zapsat jen
  inline — a inline skript CSP zakazuje, pokud se mu nepovolí hashem.
- **Rozdělení kódu.** Three.js má sám kolem 170 kB (gzip). Vite ho dá do
  samostatného souboru, který se stáhne jen tehdy, když scéna opravdu poběží —
  ne pro `prefers-reduced-motion`, úsporu dat nebo prohlížeč bez WebGL.

Produkční build nevkládá do HTML žádný spustitelný inline skript, takže CSP
zůstala beze změny. Jediný `<script>` bez `src` je `application/ld+json`,
který prohlížeč nespouští.

## Struktura

```
index.html            obsah stránky, meta tagy, JSON-LD, favicon jako inline SVG
vercel.json           build pro Vercel, bezpečnostní hlavičky, cache pro fonty a assety
package.json          závislosti a skripty (dev / build / preview)
src/style.css         veškeré styly včetně @font-face
src/app.js            přepínač jazyka, úvodní loader, odhalování sekcí, navigace
src/scene/            volitelná 3D scéna a plynulý scroll (viz níž)
src/motion/           mikroanimace v sekcích (viz níž)
public/assets/fonts/  Space Grotesk a JetBrains Mono (woff2)
public/assets/img/    náhledový obrázek pro sdílení
```

`src/` Vite zpracuje a výsledné soubory pojmenuje hashem. `public/` kopíruje
do buildu beze změny a pod stejnou cestou — fonty a náhledový obrázek proto
leží tam, protože je odkazují pevné adresy (preload v `<head>` a absolutní
`og:image`).

Texty obou jazykových verzí jsou přímo v `index.html` v atributech `data-cs` a `data-en`.
Přepínač jazyka je jen prohodí — druhá stránka ani překladový soubor neexistuje.
Když se tedy něco upravuje, je potřeba upravit **obě** varianty textu.

`src/app.js` posílá na `window` dvě události pro kód, který na stránce závisí:

- `km:ready` — loader doběhl a stránka je odkrytá
- `km:lang` — přepnul se jazyk, `event.detail.lang` je `"cs"` nebo `"en"`

A dvě poslouchá — posílá je 3D scéna (níž), pokud běží:

- `km:scene` — scéna je zkompilovaná; loader na ni čeká nejvýš 1,2 s
- `km:trace` — paket z glóbu doletěl na první hop; traceroute na něj čeká
  nejvýš 2,5 s

## 3D scéna a plynulý scroll

Vrstva navíc v `src/scene/`. Stránka na ní nezávisí — bez ní vypadá a funguje
přesně jako dřív.

```
main.js     brána: rozhodne, co se stáhne (viz tabulka níž)
scroll.js   Lenis, odkazy v rámci stránky, předávky mezi sekcemi (ScrollTrigger)
states.js   co scéna dělá v které sekci — jen data, jednotky jsou popsané v souboru
layout.js   kam se glóbus vejde v hero — měřeno z DOM, ne odhadnuté
scene.js    renderer, míchání stavů podle scrollu, umístění, smyčka, odkrytí
globe.js    drátěný ikosaedr, tělo, uzly (fibonacci, shlukování), aura, uzel „já“
packets.js  oblouky s pakety a svítící stopou
links.js    zvýrazněná spojení v sekci projektů
orbits.js   oběžné dráhy se satelity
beacon.js   paket od uzlu „já“ k divákovi v kontaktu
trace.js    paket z glóbu na první hop traceroute v hero
mask.js     díra ve scéně pod nadpisem hero a pod hlavičkou (kontrast)
lens.js     čočka pod kurzorem: tmavá kapka s lomem a perleťovým leskem
budget.js   rozpočet kontrastu: jak jasné smí být pozadí pod každým řádkem textu
stars.js    hvězdy
glow.js     textury pro body, sprity a pulz
debug.js    přehled pro ?debug=1
```

| návštěvník | co dostane |
| --- | --- |
| `prefers-reduced-motion` | nic — nativní scroll, CSS pozadí (mřížka + glow) |
| úspora dat nebo bez WebGL2 | plynulý scroll a mikroanimace; CSS pozadí zůstává |
| ostatní | plynulý scroll, mikroanimace i scéna |

Three.js je za dynamickým importem, takže si ho první dva řádky tabulky
vůbec nestáhnou. Ostatním se začne stahovat až po prvním vykreslení
stránky (dva `requestAnimationFrame`), takže nadpis na scénu nikdy nečeká. Když scéna běží, má `<html>` třídu `.has-scene` — podle ní
se schovají glow divy a za text se přidá tmavá clona, která drží kontrast
nad 4,5 : 1.

Barvy scéna čte z CSS proměnných `--violet`, `--magenta`, `--text` a `--ink`,
takže změna palety v `:root` se do ní propíše sama.

### Stavy po sekcích

Každá sekce má v `states.js` svůj stav (klíčem je id sekce): kde glóbus je
a jak je velký, jas, rotace, hustota a rychlost paketů, shlukování uzlů,
zvýraznění uzlu „já“, rozestup prstenců, úhel kamery… Mezi sousedními
sekcemi se scéna míchá podle pozice scrollu — předávka začne, když horní hrana
další sekce dojede na 85 % výšky okna, a skončí na 35 %. Funguje oběma směry;
mezi předávkami stav drží. Po kliknutí na odkaz v navigaci míří scéna rovnou
do cílového stavu a sekce mezi tím nepřehrává.

| sekce | scéna |
| --- | --- |
| hero | glóbus vedle nadpisu, tak velký, jak místo dovolí, plný jas |
| 01 O mně | kamera se přiblíží k uzlu „já“ (magenta, pulzující kroužek), zbytek ustoupí a ztmavne |
| 02 Čemu se věnuju | uzly se shluknou — jeden shluk na položku sekce, oblouky vedou mezi nimi |
| 03 Praxe | proud paketů: víc oblouků, rychlejší pakety i rotace |
| 04 Vzdělání | prstence se rozestoupí a srovnají, satelity zpomalí |
| 05 Projekty | klid, jedno zvýrazněné spojení na projekt |
| 06 Kontakt | glóbus uprostřed za obsahem, uzel „já“ posílá pakety k divákovi |

Počet shluků a spojení se bere z HTML (`.row` v `#work` a `#projects`), takže
nový projekt dostane i nové spojení. Na dotykových zařízeních
(`pointer: coarse`) jsou všechny stavy zjednodušené: glóbus za textem, nižší
jas, kamera se nepřibližuje, poloviční počty prvků.

### Velikost glóbu v hero

Glóbus nesmí zasáhnout do nadpisu ani traceroute a musí být celý vidět, takže
jeho velikost určuje volné místo vedle nadpisu. Na 1440×900 je to asi 36 %
výšky okna, na 1920×1080 asi 48 % (tabulka je v `layout.js`). Limitem je
nadpis: mezi 1280 a 1440 px má už plnou velikost a jeho druhý řádek sahá do
~70 % šířky. Kdyby se zalomil do čtyř řádků (`max-width: 13ch`), uvolnilo by
se místo na ~55 % — to by ale byla změna designu.

### Loader a traceroute

Loader drží na 100 %, dokud se scéna nezkompiluje, ale nejvýš 1,2 s — pak
stránku odkryje a scéna se dorovná po něm. Počítadlo neztrácí krok s reálným
časem: v záložce otevřené na pozadí běží časovače jednou za sekundu a loader
počítaný jen po tikách tam trval 12 s.

Když scéna běží, vyletí po odkrytí z glóbu paket, doletí na první uzel
traceroute a teprve pak se trasa začne kreslit. Paket je prvek stránky, ne
scény — za traceroute je clona, která by ho v canvasu pohltila.

### Čočka pod kurzorem

Jen s myší (`pointer: fine`), se scénou a nikdy s `prefers-reduced-motion`.
Systémový kurzor zůstává, jak je; čočka je ve scéně pod ním.

- **Vzhled** (`src/scene/lens.js`): tmavá skleněná kapka, asi 80 px. Uvnitř
  se scéna láme jako přes polokouli (posun podle normály, jemná chromatická
  aberace) a po okraji se přelévá perleťový lesk jen v barvách webu —
  fialová, magenta, světlá lila. Nejsilnější je u okraje, uprostřed je
  kapka tmavá; barvy se pomalu posouvají s časem a se směrem pohybu.
- **Pohyb**: pozice jde přes pružinu (tuhost 170, tlumení 16 — o něco méně,
  než je kritické, takže po zastavení lehce dokmitne). V rychlém pohybu se
  kapka protáhne po směru a zúží napříč; protažení má vlastní pružinu, takže
  se chvěje jako gel. Nad odkazem, tlačítkem nebo kartou naroste a změkne,
  při kliknutí se smáčkne a vyšle kruh, v klidu se zmenší, mimo okno zmizí.
- **Scéna** reaguje na paprsek pod kurzorem: blízké uzly se k němu jemně
  přitáhnou a rozsvítí, pakety poblíž zrychlí.

Scéna se vykreslí do canvasu jako vždy, hotový snímek se zkopíruje do
textury a jeden průchod přes celou plochu canvas překreslí — s kapkou navrch.
(Render target to není schválně: three do něj kreslí v lineárních barvách
a aditivní záře scény by pak vypadaly jinak.)

**Kontrast.** Aby byla kapka vidět i pod textem, nahradí s myší CSS clony
(`.has-lens`) *rozpočet kontrastu* (`src/scene/budget.js`): pro každý řádek
textu se z jeho skutečné barvy spočítá, jak jasné smí být pozadí, aby
zůstalo 4,7 : 1, a ten limit se nakreslí do malé textury. Měkký okraj
kolem řádku tvoří soustředné obdélníky v násobcích limitu — ne
`ctx.filter: blur()`, ten Safari neumí. Stejný průchod
pak pod textem udělá canvas neprůhledný (zakryje i CSS mřížku) a ořízne jas
— scény i kapky — přesně na limit. Šedý text tak snese skoro jen tmu,
bílý nadpis mnohem víc. Odkaz pod myší, který mění barvu, se přepočítává
každý snímek. Kapka v hlavičce se kreslí do malé kopie uvnitř hlavičky,
nad závojem a pod jejím textem. Na dotyku a bez čočky zůstávají clony.

### Ladění

S parametrem `?debug=1` se v rohu ukáže přehled: aktuální stav, která
předávka běží a jak daleko je, scroll, umístění glóbu, stav čočky, FPS a čas
snímku scény. S myší má navíc přepínače (čočka, aberace, reakce scény),
posuvníky pro ladění čočky (velikost, tuhost a tlumení pružiny, síla lomu,
intenzita lesku — mění se za běhu) a tlačítko A/B, které změří dvě sekundy
bez efektů a dvě s nimi (FPS a čas snímku včetně GPU). Funguje i na produkci,
ale kód se stáhne jen s parametrem.

Ve vývojovém režimu (`npm run dev`) je v konzoli `window.__kmScene` — dá se
s ním krokovat čas, číst aktuální stav a umístění a přepočítat layout. Do
produkčního buildu se nedostane.

## Mikroanimace

`src/motion/` přidává drobné pohyby v sekcích. Načte ho brána v
`src/scene/main.js` pro každého kromě `prefers-reduced-motion`, s WebGL
i bez něj. Všechna pravidla, na kterých závisí, jsou v `style.css` pod
třídou `.has-motion`, kterou modul nastaví, až když běží — bez JavaScriptu
a s reduced motion je stránka přesně ta statická.

```
index.js     spojí všechno dohromady; jediná funkce na gsap.ticker
pointer.js   poloha myši, sdílená pro všechno, co ji sleduje
progress.js  průběh scrollu: linka na spodní hraně hlavičky s paketem na čele
navline.js   aktivní položka navigace: jedna linka, která přejíždí mezi položkami
reveal.js    odhalení sekce: dekódování čísla, karty postupně, Hands-on jako terminál
timeline.js  vzdělání: kolejnice časové osy kreslená scrollem
magnet.js    odkazy v hlavičce a kontaktu se přitáhnou k myši (max 6 px)
tilt.js      karty se natočí k myši (max 6°) s odleskem, který ji sleduje
```

Kdy je sekce odhalená, rozhoduje dál `app.js` (třída `.in`). Pohyb sekce
samotné zůstává přechodem v CSS a GSAP na `.rv` nikdy nesahá — karty jedou
také přes CSS, jen zpožděné podle pořadí. Hýbe se jen `transform`
a `opacity` a rozměry prvků se čtou při událostech (najetí myší, změna
velikosti, přepnutí jazyka), nikdy uvnitř snímku. Magnet a náklon běží jen
s myší (`pointer: fine`). Čísla sekcí nemají `data-cs`, takže je `setLang`
nepřepisuje; přepnutí jazyka i tak každé dekódování hned dokončí.

## Fonty

Space Grotesk a JetBrains Mono jsou uložené v `public/assets/fonts/`, ne
načítané z Google Fonts. Důvody dva: nenačítá se nic z cizí domény (takže se
ani neodesílá IP adresa návštěvníka třetí straně) a odpadá čekání na DNS a TLS
handshake ještě před vykreslením prvního písmene.

Jsou to **variabilní** fonty — jeden soubor pokrývá celý rozsah řezů, proto
je v `@font-face` uvedený `font-weight` jako rozsah (`400 700`) a ne jedna
hodnota. Proto také stačí čtyři soubory místo deseti.

Rozdělení na `latin` a `latin-ext` přes `unicode-range` znamená, že soubor
s diakritikou se stáhne jen tehdy, když ho stránka potřebuje.

Oba fonty jsou pod SIL Open Font License 1.1.

## Spuštění lokálně

Potřeba je Node.js `^20.19` nebo `>=22.12` (stejný požadavek jako má Vite).

```bash
npm install
```

Vývojový server s okamžitým překreslením po uložení:

```bash
npm run dev
```

Produkční build do `dist/` a jeho lokální náhled — to je přesně to, co pak
poběží na Vercelu:

```bash
npm run build
```

```bash
npm run preview
```

Pozor na jednu věc: `npm run preview` neposílá hlavičky z `vercel.json`, takže
CSP se v něm neprojeví. Chybu typu „Refused to load…“ lokálně neuvidíš —
změny, které by s CSP mohly kolidovat, je potřeba ověřit na preview nasazení.

## Nasazení

Web běží na <https://krystofmoravec.vercel.app/> a nasazuje se automaticky
z GitHubu (repozitář `morykeu/personal_web`).

- push do větve `main` → produkční nasazení
- push do jiné větve nebo pull request → náhledové (preview) nasazení s vlastní URL

Nastavení buildu je ve `vercel.json`, takže přebíjí to, co je v projektu na
Vercelu naklikané:

| Nastavení        | Hodnota          |
| ---------------- | ---------------- |
| Framework Preset | Vite             |
| Build Command    | `npm run build`  |
| Output Directory | `dist`           |
| Install Command  | *(výchozí — `npm install`)* |

### Hlavičky

`vercel.json` nastavuje bezpečnostní hlavičky (`Content-Security-Policy`,
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy`) a roční `immutable` cache pro fonty a pro JS a CSS
v `/assets/`. Ty mají v názvu hash obsahu, takže nová verze má vždy novou
adresu a stará cache nevadí. `index.html` se cachuje výchozím způsobem
Vercelu (pokaždé se ověří).

CSP má u `style-src` hodnotu `'unsafe-inline'`. Není to nedbalost — stránka
má inline `style="animation-delay:…"` přímo na prvcích SVG a `<noscript>`
blok se styly. Bez toho by se traceroute animace nespustila. Kdyby se ty
inline styly někdy přesunuly do tříd, dá se `'unsafe-inline'` odebrat.

Při úpravě hlaviček je dobré je nejdřív ověřit lokálně, protože špatná CSP
umí stránku rozbít až na produkci — chyby se objeví v konzoli prohlížeče
jako „Refused to load…".

### Při změně domény

`<link rel="canonical">` a `og:url` v `<head>` obsahují produkční adresu
natvrdo. Při přechodu na vlastní doménu je potřeba přepsat obě — a vždy
jako **absolutní** adresu včetně `https://` a koncového lomítka. Bez schématu
si prohlížeč i vyhledávače hodnotu vyloží jako relativní cestu.

### Náhledový obrázek

`public/assets/img/og.jpg` (1200×630 px) je to, co se zobrazí při sdílení
odkazu na LinkedInu, Facebooku, X nebo v Discordu. Je odkazovaný absolutní
adresou z `og:image` a `twitter:image`.

Po jeho výměně je potřeba dát platformám vědět, že mají načíst novou verzi —
mají odkazy dlouho v cache:

- LinkedIn: <https://www.linkedin.com/post-inspector/>
- Facebook: <https://developers.facebook.com/tools/debug/>

Jednodušší alternativa je nahrát obrázek pod novým názvem a přepsat cestu
v `<head>` — nová adresa cache obejde.

## Přístupnost

Stránka cílí na WCAG 2.1 AA:

- veškerý text má kontrast alespoň 4,5 : 1 vůči pozadí
- všechny interaktivní prvky mají viditelný `:focus-visible` rámeček
- nadpisy jdou v pořadí `h1` → `h2` → `h3`, bez přeskakování úrovní
- orientační body `banner` / `main` / `contentinfo` a pojmenované sekce
- odkazy s vlastním `aria-label` (navigace, značka KM.) mají v něm i to, co
  je vidět — kdo ovládá web hlasem, řekne „01 About“ (WCAG 2.5.3)
- respektuje `prefers-reduced-motion` — animace se vypnou
- bez JavaScriptu se úvodní loader přeskočí a obsah zůstane čitelný

Ten poslední bod hlídá blok `<noscript>` v `<head>`. Jeho pravidla mají
`!important` záměrně: Vite při buildu přesune hlavní stylesheet až za něj,
takže bez toho by bez JS přetekl loader přes celou stránku.
