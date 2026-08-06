# Osobní web — Kryštof Moravec

Jednostránkové osobní portfolio. Statický web, dvojjazyčný (čeština / angličtina),
bez build procesu a bez závislostí — jen HTML, CSS a jeden soubor s JavaScriptem.

## Struktura

```
index.html            obsah stránky, meta tagy pro SEO a sdílení, favicon jako inline SVG
assets/css/style.css  veškeré styly
assets/js/app.js      přepínač jazyka, úvodní loader, animace při scrollování
```

Texty obou jazykových verzí jsou přímo v `index.html` v atributech `data-cs` a `data-en`.
Přepínač jazyka je jen prohodí — druhá stránka ani překladový soubor neexistuje.
Když se tedy něco upravuje, je potřeba upravit **obě** varianty textu.

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

Protože jde o čistě statický web, není potřeba `vercel.json` ani nastavovat
build. Ve Vercelu se projekt zakládá jako **Other** / bez frameworku:

| Nastavení        | Hodnota        |
| ---------------- | -------------- |
| Framework Preset | Other          |
| Build Command    | *(prázdné)*    |
| Output Directory | `.`            |
| Install Command  | *(prázdné)*    |

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
