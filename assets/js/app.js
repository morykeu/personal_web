(function(){
  "use strict";

  var STORE_KEY = "km.lang";
  var TITLE = {cs:"Kryštof Moravec — sítě, bezpečnost, AI", en:"Kryštof Moravec — networks, security, AI"};
  var buttons = document.querySelectorAll(".lang button");

  /* ---------- language ---------- */

  /* localStorage throws in some privacy modes — never let that kill the page */
  function stored(){
    try { return localStorage.getItem(STORE_KEY); } catch(e){ return null; }
  }
  function store(lang){
    try { localStorage.setItem(STORE_KEY, lang); } catch(e){}
  }

  /* saved choice wins; otherwise English for everyone, regardless of the
     browser's own language — Czech is only ever reached via the CS button */
  function initialLang(){
    var saved = stored();
    if (saved === "cs" || saved === "en") return saved;
    return "en";
  }

  function setLang(lang, persist){
    document.documentElement.lang = lang;
    document.title = TITLE[lang];
    document.querySelectorAll("[data-cs]").forEach(function(el){
      var v = el.getAttribute("data-" + lang);
      if (v !== null) el.innerHTML = v;
    });
    document.querySelectorAll("[data-cs-aria]").forEach(function(el){
      var v = el.getAttribute("data-" + lang + "-aria");
      if (v !== null) el.setAttribute("aria-label", v);
    });
    buttons.forEach(function(b){
      b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
    });
    if (persist) store(lang);
  }

  /* runs while the loader still covers the page, so a cs → en swap never flashes */
  setLang(initialLang(), false);
  buttons.forEach(function(b){
    b.addEventListener("click", function(){ setLang(b.dataset.lang, true); });
  });

  /* ---------- loader: counts up, then hands off to the trace animation ---------- */
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var pct = document.getElementById("pct"),
      fill = document.getElementById("barfill"),
      loader = document.getElementById("loader"),
      hops = document.getElementById("hops");

  function finish(){
    loader.classList.add("done");
    document.body.classList.remove("locked");
    hops.classList.add("ready");
  }
  if (reduce){ finish(); }
  else {
    var n = 0;
    var t = setInterval(function(){
      n += Math.random() * 13 + 4;
      if (n >= 100){ n = 100; clearInterval(t); setTimeout(finish, 320); }
      pct.textContent = Math.floor(n) + "%";
      fill.style.right = (100 - n) + "%";
    }, 90);
  }

  /* ---------- scroll reveals ---------- */
  var rv = document.querySelectorAll(".rv");
  if (!("IntersectionObserver" in window)){
    /* without the observer the sections would stay at opacity 0 */
    rv.forEach(function(el){ el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target); }});
    }, {threshold:.14, rootMargin:"0px 0px -8% 0px"});
    rv.forEach(function(el){ io.observe(el); });
  }
})();
