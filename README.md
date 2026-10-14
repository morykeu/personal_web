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
vercel.json           build pro Vercel, bezpečnostní hlavičky, cache pro fonty
package.json          závislosti a skripty (dev / build / preview)
src/style.css         veškeré styly včetně @font-face
src/app.js            přepínač jazyka, úvodní loader, odhalování sekcí, navigace
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
- respektuje `prefers-reduced-motion` — animace se vypnou
- bez JavaScriptu se úvodní loader přeskočí a obsah zůstane čitelný

Ten poslední bod hlídá blok `<noscript>` v `<head>`. Jeho pravidla mají
`!important` záměrně: Vite při buildu přesune hlavní stylesheet až za něj,
takže bez toho by bez JS přetekl loader přes celou stránku.
