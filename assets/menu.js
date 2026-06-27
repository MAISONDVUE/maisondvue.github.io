/* MAISON D'VUE — mobile menu
 * Self-contained: injects a hamburger into the page nav and a full-screen
 * overlay menu (big centered primary links, small utility links at the
 * bottom). Mirrors the chat widget's injection pattern so a single file
 * powers every page. Mobile only (hamburger hidden >= 861px).
 */
(function () {
  if (window.__mdvMenuLoaded) return;
  window.__mdvMenuLoaded = true;

  var NAVY = "#0B1F3A";
  var PAPER = "#FCFAF7";

  // Big centered destinations.
  var PRIMARY = [
    { label: "The Elixir", href: "product.html" },
    { label: "The Story", href: "gallery.html" },
    { label: "Founding Creators", href: "creators.html" }
  ];
  // Small utility links along the bottom.
  var SECONDARY = [
    { label: "La Maison", href: "about.html" },
    { label: "Shop", href: "https://shop.maisondvue.com/" },
    { label: "Campaigns", href: "gallery.html" },
    { label: "Login", href: "creator-dashboard.html" }
  ];

  var css =
    ".mdv-burger{display:none;background:none;border:0;cursor:pointer;padding:8px;margin:0 -8px 0 0;color:" + PAPER + ";align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;transition:color 320ms ease}" +
    ".mdv-burger svg{width:24px;height:18px;display:block}" +
    /* solid/scrolled nav and the always-light creator pages get dark burger */
    ".mdv-nav.scrolled .mdv-burger,.nav .mdv-burger{color:" + NAVY + "}" +
    "@media(max-width:860px){.mdv-burger{display:inline-flex;order:-1}}" +

    ".mdv-menu{position:fixed;inset:0;z-index:400;background:" + PAPER + ";display:flex;flex-direction:column;" +
      "opacity:0;visibility:hidden;transform:translateY(-6px);transition:opacity 360ms ease,transform 360ms ease,visibility 360ms}" +
    ".mdv-menu.open{opacity:1;visibility:visible;transform:none}" +
    ".mdv-menu-top{flex:0 0 auto;height:72px;display:flex;align-items:center;justify-content:space-between;padding:0 22px}" +
    ".mdv-menu-icon{background:none;border:0;cursor:pointer;padding:8px;color:" + NAVY + ";display:inline-flex;align-items:center;-webkit-tap-highlight-color:transparent}" +
    ".mdv-menu-icon svg{width:22px;height:22px;display:block}" +
    ".mdv-menu-primary{flex:1 1 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;padding:24px 20px}" +
    ".mdv-menu-primary a{font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:clamp(28px,8vw,38px);letter-spacing:0.05em;text-transform:uppercase;color:" + NAVY + ";line-height:1.04;text-align:center}" +
    ".mdv-menu-secondary{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:18px;padding:0 20px calc(48px + env(safe-area-inset-bottom))}" +
    ".mdv-menu-secondary a{font-family:'Jost',Helvetica,Arial,sans-serif;font-weight:500;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:" + NAVY + "}" +
    ".mdv-menu-primary a,.mdv-menu-secondary a{text-decoration:none;transition:opacity 200ms ease}" +
    ".mdv-menu-primary a:active,.mdv-menu-secondary a:active{opacity:0.55}" +
    "body.mdv-menu-open{overflow:hidden}" +
    /* keep the floating chat badge from sitting on top of the open menu */
    "body.mdv-menu-open .mdv-chat-launcher{opacity:0;visibility:hidden;pointer-events:none}";

  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  function svgBurger() {
    return '<svg viewBox="0 0 24 18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><line x1="0" y1="2" x2="24" y2="2"/><line x1="0" y1="9" x2="24" y2="9"/><line x1="0" y1="16" x2="24" y2="16"/></svg>';
  }
  function svgClose() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>';
  }
  function svgBag() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M6 7h12l-1 14H7L6 7z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>';
  }
  function links(arr) {
    return arr.map(function (l) { return '<a href="' + l.href + '">' + l.label + '</a>'; }).join("");
  }

  function build() {
    var nav = document.querySelector(".mdv-nav") || document.querySelector(".nav");
    if (!nav) return;

    // Hamburger, placed at the start (left) of the nav; shown on mobile only.
    var burger = document.createElement("button");
    burger.className = "mdv-burger";
    burger.type = "button";
    burger.setAttribute("aria-label", "Open menu");
    burger.innerHTML = svgBurger();
    nav.insertBefore(burger, nav.firstChild);

    // Match the hamburger to the nav's logo colour so it's legible on every
    // page (light over dark hero, navy on a light/scrolled nav).
    var sampler = nav.querySelector(".nav-logo") || nav.querySelector("a");
    function syncBurger() { if (sampler) burger.style.color = getComputedStyle(sampler).color; }
    syncBurger();
    setTimeout(syncBurger, 60);
    window.addEventListener("scroll", syncBurger, { passive: true });

    // Full-screen overlay.
    var menu = document.createElement("div");
    menu.className = "mdv-menu";
    menu.id = "mdvMenu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-modal", "true");
    menu.setAttribute("aria-label", "Menu");
    menu.innerHTML =
      '<div class="mdv-menu-top">' +
        '<button class="mdv-menu-icon mdv-menu-close" type="button" aria-label="Close menu">' + svgClose() + '</button>' +
        '<a class="mdv-menu-icon" href="https://shop.maisondvue.com/cart" aria-label="Bag">' + svgBag() + '</a>' +
      '</div>' +
      '<nav class="mdv-menu-primary">' + links(PRIMARY) + '</nav>' +
      '<nav class="mdv-menu-secondary">' + links(SECONDARY) + '</nav>';
    document.body.appendChild(menu);

    function openMenu() { menu.classList.add("open"); document.body.classList.add("mdv-menu-open"); }
    function closeMenu() { menu.classList.remove("open"); document.body.classList.remove("mdv-menu-open"); }

    burger.addEventListener("click", openMenu);
    menu.querySelector(".mdv-menu-close").addEventListener("click", closeMenu);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
    // Closing on link tap keeps the transition tidy before navigation.
    menu.querySelectorAll("a[href]").forEach(function (a) {
      a.addEventListener("click", function () { closeMenu(); });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
