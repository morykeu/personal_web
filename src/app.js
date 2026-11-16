(function(){
  "use strict";

  var STORE_KEY = "km.lang";
  /* Each language has its own address, so both can be indexed: the build
     writes a Czech copy of the page to /cs/ (vite.config.js). */
  var PATH = {cs:"/cs/", en:"/"};
  var switches = document.querySelectorAll(".lang a");

  /* ---------- language ---------- */

  /* localStorage throws in some privacy modes — never let that kill the page */
  function stored(){
    try { return localStorage.getItem(STORE_KEY); } catch(e){ return null; }
  }
  function store(lang){
    try { localStorage.setItem(STORE_KEY, lang); } catch(e){}
  }

  function onCzechPath(){
    return location.pathname.replace(/\/+$/, "") === "/cs";
  }

  /* /cs/ is Czech, whatever was saved — the address was asked for by name.
     On / the saved choice wins; otherwise English for everyone, regardless of
     the browser's own language. */
  function initialLang(){
    if (onCzechPath()) return "cs";
    var saved = stored();
    if (saved === "cs" || saved === "en") return saved;
    return "en";
  }

  /* Keeps the address in step with the language without a reload; query and
     hash (?debug=1, #contact) stay where they are. */
  function syncPath(lang){
    if (onCzechPath() === (lang === "cs")) return;
    try { history.replaceState(null, "", PATH[lang] + location.search + location.hash); } catch(e){}
  }

  function setLang(lang, persist){
    document.documentElement.lang = lang;
    /* <title> carries data-cs / data-en like everything else, so it is swapped here too */
    document.querySelectorAll("[data-cs]").forEach(function(el){
      var v = el.getAttribute("data-" + lang);
      if (v !== null) el.innerHTML = v;
    });
    document.querySelectorAll("[data-cs-aria]").forEach(function(el){
      var v = el.getAttribute("data-" + lang + "-aria");
      if (v !== null) el.setAttribute("aria-label", v);
    });
    switches.forEach(function(a){
      if (a.dataset.lang === lang) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
    syncPath(lang);
    if (persist) store(lang);
    /* Anything outside this file that depends on the copy (text lengths change
       layout) listens here. Fires on every switch, including the initial one;
       a listener attached later reads document.documentElement.lang instead. */
    window.dispatchEvent(new CustomEvent("km:lang", {detail: {lang: lang}}));
  }

  /* runs while the loader still covers the page, so a cs → en swap never flashes */
  setLang(initialLang(), false);
  /* The switch is a pair of real links (/cs/ and /), which is what works
     without JavaScript and what a crawler follows. With JavaScript the copy is
     swapped in place instead, so the scroll position survives. A click meant
     for a new tab or window is left to the browser. */
  switches.forEach(function(a){
    a.addEventListener("click", function(e){
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      setLang(a.dataset.lang, true);
    });
  });

  /* ---------- loader: counts up, then hands off to the trace animation ---------- */
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var pct = document.getElementById("pct"),
      fill = document.getElementById("barfill"),
      loader = document.getElementById("loader"),
      hops = document.getElementById("hops");

  var root = document.documentElement;

  /* Waits for `event` while `pending` says so, but never longer than `ms`. */
  function waitFor(pending, event, ms, go){
    var gone = false;
    function once(){ if (!gone){ gone = true; go(); } }
    if (!pending) return once();
    window.addEventListener(event, once, { once: true });
    setTimeout(once, ms);
  }

  function finish(){
    loader.classList.add("done");
    document.body.classList.remove("locked");
    /* The 3D scene, if it runs, sends a packet from the globe to the first hop
       and starts the trace as it lands (src/scene/trace.js). */
    waitFor(root.hasAttribute("data-trace-handoff"), "km:trace", 2500, function(){
      hops.classList.add("ready");
    });
    /* Under reduced motion this runs synchronously while this file executes,
       before any later module has had a chance to listen — so a listener
       should first check #loader.done and only then wait for the event. */
    window.dispatchEvent(new CustomEvent("km:ready"));
  }
  if (reduce){ finish(); }
  else {
    /* The count is random, but never behind the clock. A background tab runs
       timers at most once a second, and a count made only of ticks took ten
       seconds there; this way it ends one tick after COUNT_MS at worst.
       The whole loader is short on purpose: the page itself is ready in a
       fraction of a second, so this is an intro, not a wait — about 0.8 s
       when the scene is ready in time, 1.4 s at worst (it used to be 2.6 s). */
    var COUNT_MS = 650;
    var n = 0, t0 = Date.now();
    var t = setInterval(function(){
      n = Math.max(n + Math.random() * 16 + 8, (Date.now() - t0) / COUNT_MS * 100);
      if (n >= 100){
        n = 100;
        clearInterval(t);
        /* A 3D scene still compiling its shaders (src/scene/main.js) gets up to
           0.6 s more under the loader; past that it fades in after the reveal. */
        waitFor(root.classList.contains("scene-pending"), "km:scene", 600, function(){
          setTimeout(finish, 150);
        });
      }
      pct.textContent = Math.floor(n) + "%";
      fill.style.right = (100 - n) + "%";
    }, 60);
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

  /* ---------- section nav highlight ---------- */
  /* A second observer on purpose. The reveal one above drops each section with
     unobserve() once it has appeared; this one has to keep reporting for as
     long as the page is open, so the two cannot share. */
  var navLinks = document.querySelectorAll(".secnav a");
  if (navLinks.length && "IntersectionObserver" in window){
    var watched = [];
    /* #hero has no nav item. Watching it anyway is what clears the highlight
       when the visitor scrolls back above the first numbered section. */
    var hero = document.getElementById("hero");
    if (hero) watched.push(hero);
    navLinks.forEach(function(a){
      var el = document.getElementById(a.getAttribute("href").slice(1));
      if (el) watched.push(el);
    });

    var onScreen = {}, atEnd = false;
    function light(id){
      var href = "#" + id;
      /* "location" rather than "true": this is the current place within one
         page, not the current page out of several */
      navLinks.forEach(function(a){
        if (a.getAttribute("href") === href) a.setAttribute("aria-current", "location");
        else a.removeAttribute("aria-current");
      });
    }
    function markActive(){
      /* scrolled to the very end: the last section is too short to ever
         reach the band, so it would stay on the one before it */
      if (atEnd) return light(watched[watched.length - 1].id);
      for (var i = 0; i < watched.length; i++){
        if (onScreen[watched[i].id]) return light(watched[i].id);
      }
      /* nothing on the band — happens past the last section, where leaving the
         previous item lit is the right answer */
    }

    /* A band one percent tall, a fifth of the way down the viewport: whichever
       section covers it is the one being read. Sections are contiguous, so the
       band is always covered by one of them. Percentages rather than pixels
       keep that true through a resize without rebuilding the observer. */
    var navIo = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ onScreen[e.target.id] = e.isIntersecting; });
      markActive();
    }, {rootMargin:"-20% 0px -79% 0px"});
    watched.forEach(function(el){ navIo.observe(el); });

    /* The footer is the last box on the page, so all of it on screen means
       the page cannot scroll any further. The root reaches 4px below the
       window to absorb sub-pixel rounding at the bottom. */
    var footer = document.querySelector("footer");
    if (footer){
      new IntersectionObserver(function(entries){
        var e = entries[entries.length - 1];
        var end = e.intersectionRatio >= 0.99;
        if (end === atEnd) return;
        atEnd = end;
        markActive();
      }, {threshold:[0, 0.99], rootMargin:"0px 0px 4px 0px"}).observe(footer);
    }
  }

  /* Last line on purpose: it stands down the CSS failsafe (style.css, "failsafe"),
     which uncovers the page by itself if this file never loads or throws on
     the way here. */
  root.classList.add("js-ok");
})();
