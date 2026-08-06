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

Web běží na Vercelu, nasazuje se automaticky z GitHubu.

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

### Po prvním nasazení

V `index.html` je potřeba nahradit zástupnou adresu `https://example.com/`
skutečnou doménou — na dvou místech, `<link rel="canonical">` a `og:url`.
Obě jsou označené komentářem `TODO`.

Zároveň se hodí doplnit náhledový obrázek pro sdílení (`og:image`, 1200×630 px);
v `<head>` je na něj připravený zakomentovaný blok. Bez něj se odkaz na
sociálních sítích zobrazí jen jako text.

## Přístupnost

Stránka cílí na WCAG 2.1 AA:

- veškerý text má kontrast alespoň 4,5 : 1 vůči pozadí
- všechny interaktivní prvky mají viditelný `:focus-visible` rámeček
- nadpisy jdou v pořadí `h1` → `h2` → `h3`, bez přeskakování úrovní
- orientační body `banner` / `main` / `contentinfo` a pojmenované sekce
- respektuje `prefers-reduced-motion` — animace se vypnou
- bez JavaScriptu se úvodní loader přeskočí a obsah zůstane čitelný
