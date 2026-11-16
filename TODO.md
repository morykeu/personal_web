# Odložené úkoly

Věci, které nejdou vyřešit v repozitáři nebo čekají na rozhodnutí. Vzešly
z kontroly webu 16. 11. 2026.

## DMARC — zatím schválně beze změny

Záznam `_dmarc.krystofmoravec.cz` je `v=DMARC1; p=none;`. To znamená, že
e-mail, který se jen tváří jako odeslaný z téhle domény, příjemce nemá pokyn
odmítnout ani dát do spamu. SPF (`include:icloud.com ~all`) i DKIM
(`sig1._domainkey`, iCloud) jsou nastavené správně.

Zpřísnění je odložené, dokud nebude jasné, že vlastní pošta z iCloudu chodí
příjemcům spolehlivě do doručené (ne do spamu nebo hromadných). Postup, až na
to dojde:

1. poslat pár zkušebních zpráv na Gmail, Seznam a Outlook a v hlavičkách
   ověřit `spf=pass`, `dkim=pass` a `dmarc=pass`
2. v Cloudflare DNS změnit TXT `_dmarc` na `v=DMARC1; p=quarantine;`
3. po několika týdnech bez problémů na `v=DMARC1; p=reject;`

Platí jen tehdy, pokud se z domény posílá výhradně přes iCloud. Jakákoli
další služba (newsletter, formulář) by nejdřív potřebovala vlastní SPF a DKIM.

## Ostatní mimo repozitář

- **Cloudflare → Scrape Shield → Email Address Obfuscation: vypnout.** Bez
  JavaScriptu se kvůli němu v kontaktu zobrazí „[email protected]“ místo
  adresy. Adresa je stejně v čistém textu v JSON-LD a v `security.txt`, takže
  maskování nic nechrání.
- **GitHub: homepage repozitáře** ukazuje na starou adresu na Vercelu, která
  vrací 404. Změnit na `https://krystofmoravec.cz/`.
- **Wedos: automatické prodloužení domény** (vyprší 19. 10. 2027).
- **Dvoufázové ověření** na účtech Cloudflare, Wedos, GitHub a Apple ID.
- **Google Search Console:** po nasazení české verze znovu odeslat sitemapu.
- **CAA záznam** (volitelné): doména žádný nemá, certifikát tedy smí vydat
  kterákoli autorita.
