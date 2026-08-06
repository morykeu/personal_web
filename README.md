# Osobní web — Kryštof Moravec

Jednostránkové osobní portfolio. Statický web, dvojjazyčný (čeština / angličtina),
bez build procesu a bez závislostí — jen HTML, CSS a jeden soubor s JavaScriptem.

## Struktura

```
index.html            obsah stránky, meta tagy, JSON-LD, favicon jako inline SVG
vercel.json           bezpečnostní hlavičky a cache pro fonty
assets/css/style.css  veškeré styly včetně @font-face
assets/js/app.js      přepínač jazyka, úvodní loader, animace při scrollování
assets/fonts/         Space Grotesk a JetBrains Mono (woff2)
assets/img/og.jpg     náhledový obrázek pro sdílení
```

Texty obou jazykových verzí jsou přímo v `index.html` v atributech `data-cs` a `data-en`.
Přepínač jazyka je jen prohodí — druhá stránka ani překladový soubor neexistuje.
Když se tedy něco upravuje, je potřeba upravit **obě** varianty textu.

## Fonty

Space Grotesk a JetBrains Mono jsou uložené v `assets/fonts/`, ne načítané
z Google Fonts. Důvody dva: nenačítá se nic z cizí domény (takže se ani
neodesílá IP adresa návštěvníka třetí straně) a odpadá čekání na DNS a TLS
handshake ještě před vykreslením prvního písmene.

Jsou to **variabilní** fonty — jeden soubor pokrývá celý rozsah řezů, proto
je v `@font-face` uvedený `font-weight` jako rozsah (`400 700`) a ne jedna
hodnota. Proto také stačí čtyři soubory místo deseti.

Rozdělení na `latin` a `latin-ext` přes `unicode-range` znamená, že soubor
s diakritikou se stáhne jen tehdy, když ho stránka potřebuje.

Oba fonty jsou pod SIL Open Font License 1.1.

## Spuštění lokálně

Stačí otevřít `index.html` v prohlížeči. Kvůli konzistentnímu chování
(relativní cesty, `localStorage`) je ale lepší pustit si jednoduchý server:

```bash
python -m http.server 5173
```

Potom otevřít <http://localhost:5173>.

Alternativa bez Pythonu:

```bash
npx serve .
```

Žádná instalace závislostí, žádný build, žádný watch — po úpravě souboru
stačí obnovit stránku (u CSS a JS případně tvrdý reload, `Ctrl+Shift+R`).

## Nasazení

Web běží na <https://krystofmoravec.vercel.app/> a nasazuje se automaticky
z GitHubu (repozitář `morykeu/personal_web`).

- push do větve `main` → produkční nasazení
- push do jiné větve nebo pull request → náhledové (preview) nasazení s vlastní URL

Build se nespouští, jde o statické soubory. Ve Vercelu je projekt založený
jako **Other** / bez frameworku:

| Nastavení        | Hodnota        |
| ---------------- | -------------- |
| Framework Preset | Other          |
| Build Command    | *(prázdné)*    |
| Output Directory | `.`            |
| Install Command  | *(prázdné)*    |

### Hlavičky

`vercel.json` nastavuje bezpečnostní hlavičky (`Content-Security-Policy`,
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy`) a roční cache pro fonty.

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

`assets/img/og.jpg` (1200×630 px) je to, co se zobrazí při sdílení odkazu na
LinkedInu, Facebooku, X nebo v Discordu. Je odkazovaný absolutní adresou
z `og:image` a `twitter:image`.

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
- respektuje `prefers-reduced-motion` — animace se vypnou
- bez JavaScriptu se úvodní loader přeskočí a obsah zůstane čitelný
