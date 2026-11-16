import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig } from 'vite';

/* Česká verze na vlastní adrese (/cs/), aby ji vyhledávače mohly indexovat.

   Zdroj zůstává jeden: index.html, kde má každý text obě varianty v data-cs
   a data-en. Po buildu se z hotového dist/index.html udělá kopie, ve které je
   čeština přímo v obsahu — bez JavaScriptu, takže ji přečte i crawler:

     <html lang>                en → cs
     prvky s data-cs            obsah = hodnota data-cs
     prvky s data-cs-aria       aria-label = hodnota data-cs-aria
     <meta … data-cs-content>   content = hodnota data-cs-content
     canonical, og:url          …/ → …/cs/
     og:locale a jeho alternate prohozené
     přepínač jazyka            aria-current na CS

   Atributy data-cs / data-en v kopii zůstávají — app.js podle nich přepíná
   zpátky na angličtinu bez načtení stránky.

   Kopie se nedělá přes parser HTML, ale regulárními výrazy; vejde se to bez
   další závislosti, protože zdroj má pevný tvar. Aby se tichá chyba nedostala
   na web, build spadne, kdykoli tvar nesedí — hlavně když se text prvku liší
   od jeho data-en (zapomenutá druhá varianta po úpravě textu). */

const ORIGIN = 'https://krystofmoravec.cz';

/* otevírací značka: jméno a atributy; hodnoty atributů smí obsahovat < i > */
const OPEN_TAG = /<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s"'<>\/=]+(?:="[^"]*")?)*)\s*>/g;

function attr(attrs, name) {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : null;
}

function setAttr(attrs, name, value) {
  const re = new RegExp(`(\\s${name}=")[^"]*(")`);
  if (!re.test(attrs)) throw new Error(`[cs] chybí atribut ${name} v: <…${attrs}>`);
  return attrs.replace(re, (_, a, b) => a + value + b);
}

function replaceOnce(html, from, to) {
  const parts = html.split(from);
  if (parts.length !== 2) {
    throw new Error(`[cs] čekal jsem právě jeden výskyt „${from}“, je jich ${parts.length - 1}`);
  }
  return parts.join(to);
}

export function toCzech(html) {
  let out = '';
  let pos = 0;
  let swapped = 0;
  OPEN_TAG.lastIndex = 0;

  for (let m; (m = OPEN_TAG.exec(html)); ) {
    const [tag, name] = m;
    let attrs = m[2];
    const cs = attr(attrs, 'data-cs');
    const csAria = attr(attrs, 'data-cs-aria');
    const csContent = attr(attrs, 'data-cs-content');
    if (cs === null && csAria === null && csContent === null) continue;

    if (csAria !== null) attrs = setAttr(attrs, 'aria-label', csAria);
    if (csContent !== null) attrs = setAttr(attrs, 'content', csContent);
    out += html.slice(pos, m.index) + `<${name}${attrs}>`;
    pos = m.index + tag.length;

    if (cs !== null) {
      const en = attr(attrs, 'data-en');
      const close = `</${name}>`;
      const end = html.indexOf(close, pos);
      const inner = end === -1 ? null : html.slice(pos, end);
      if (inner !== en) {
        throw new Error(
          `[cs] obsah <${name}> nesedí s jeho data-en — po úpravě textu je potřeba přepsat obojí.\n` +
          `  data-en: ${en}\n  obsah:   ${inner}`
        );
      }
      out += cs;
      pos = end;
      OPEN_TAG.lastIndex = end;
    }
    swapped++;
  }
  out += html.slice(pos);
  if (!swapped) throw new Error('[cs] v index.html není žádný prvek s data-cs');

  out = replaceOnce(out, '<html lang="en">', '<html lang="cs">');
  out = replaceOnce(out, `<link rel="canonical" href="${ORIGIN}/">`, `<link rel="canonical" href="${ORIGIN}/cs/">`);
  out = replaceOnce(out, `<meta property="og:url" content="${ORIGIN}/">`, `<meta property="og:url" content="${ORIGIN}/cs/">`);
  out = replaceOnce(out, '<meta property="og:locale" content="en_US">', '<meta property="og:locale" content="cs_CZ">');
  out = replaceOnce(out, '<meta property="og:locale:alternate" content="cs_CZ">', '<meta property="og:locale:alternate" content="en_US">');
  out = replaceOnce(out, '<a href="/cs/" data-lang="cs" hreflang="cs">', '<a href="/cs/" data-lang="cs" hreflang="cs" aria-current="true">');
  out = replaceOnce(out, '<a href="/" data-lang="en" hreflang="en" aria-current="true">', '<a href="/" data-lang="en" hreflang="en">');
  return out;
}

function czechPage() {
  let outDir = 'dist';
  return {
    name: 'km-czech-page',
    apply: 'build',
    configResolved(config) { outDir = join(config.root, config.build.outDir); },
    /* až po zápisu na disk: index.html tou dobou už odkazuje na hashované soubory */
    async closeBundle() {
      const html = await readFile(join(outDir, 'index.html'), 'utf8');
      await mkdir(join(outDir, 'cs'), { recursive: true });
      await writeFile(join(outDir, 'cs', 'index.html'), toCzech(html));
    },
  };
}

export default defineConfig({
  plugins: [czechPage()],
});
