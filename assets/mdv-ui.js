/* MAISON D'VUE — shared shop furniture.

   1. The announcement banner (free US shipping, free Tirana salon pickup).
   2. The 15% signup popup: email only, posted straight to the Mailchimp
      audience the rest of the house already uses, then the monogram
      confirmation slides across.

   The Mailchimp post goes through a hidden iframe rather than fetch(): the
   list-manage endpoint sends no CORS headers, but a plain form POST isn't
   subject to CORS at all. Same submission, no navigation — which is what
   lets the second screen slide in over the first. */
(function () {
  var MC_ACTION   = 'https://maisondvue.us20.list-manage.com/subscribe/post?u=ece90c707751d2379f6f22e77&id=3a9da7ab07&f_id=004802eef0';
  var MC_HONEYPOT = 'b_ece90c707751d2379f6f22e77_3a9da7ab07';
  var STORE_KEY   = 'mdv_popup_state';
  var DELAY_MS    = 8000;          // a breath before the offer appears
  var SNOOZE_DAYS = 30;            // after "no thanks" or a close
  var MARK        = 'monogram-bw.svg';
  var MEDIA       = 'maison-dvue-elixir-smoke.jpg';

  /* ── Banner ─────────────────────────────────────────────────────── */
  function banner() {
    if (document.querySelector('.mdv-ship-banner')) return;
    var el = document.createElement('div');
    el.className = 'mdv-ship-banner';
    el.setAttribute('role', 'complementary');
    el.setAttribute('aria-label', 'Shipping and pickup');
    el.innerHTML =
      '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
      '<path d="M1 6h12v9H1z"/><path d="M13 9h4.5l3 3v3H13z"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>' +
      'Free Domestic Shipping</span>' +
      '<span class="sep" aria-hidden="true">&middot;</span>' +
      '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
      '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>' +
      'Free Tirana Salon Pickup</span>';
    document.body.insertBefore(el, document.body.firstChild);
    document.body.classList.add('mdv-has-banner');
  }

  /* ── Popup state ────────────────────────────────────────────────── */
  function state() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function remember(patch) {
    var s = state();
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function snoozed() {
    var s = state();
    if (s.joined) return true;
    if (!s.dismissedAt) return false;
    return (Date.now() - s.dismissedAt) < SNOOZE_DAYS * 864e5;
  }

  /* ── Popup ──────────────────────────────────────────────────────── */
  function build() {
    var pop = document.createElement('div');
    pop.className = 'mdv-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'true');
    pop.setAttribute('aria-label', 'Fifteen percent off your first order');
    pop.hidden = false;
    pop.innerHTML =
      '<div class="mdv-pop__panel">' +
        '<div class="mdv-pop__media"><img src="' + MEDIA + '" alt="" loading="lazy"></div>' +
        '<div class="mdv-pop__stage">' +
          '<button type="button" class="mdv-pop__close" aria-label="Close">&times;</button>' +
          '<div class="mdv-pop__rail">' +

            '<div class="mdv-pop__screen">' +
              '<img class="mdv-pop__mark" src="' + MARK + '" alt="" aria-hidden="true">' +
              '<p class="mdv-pop__eyebrow">Unlock</p>' +
              '<p class="mdv-pop__figure">15% Off</p>' +
              '<p class="mdv-pop__sub">Your First Order</p>' +
              '<form class="mdv-pop__form" novalidate>' +
                '<input class="mdv-pop__field" type="email" name="EMAIL" required ' +
                  'autocomplete="email" inputmode="email" placeholder="Email Address" aria-label="Email address">' +
                '<div style="position:absolute;left:-9999px" aria-hidden="true">' +
                  '<input type="text" name="' + MC_HONEYPOT + '" tabindex="-1" autocomplete="off"></div>' +
                '<button type="submit" class="mdv-pop__cta">Get 15% Off' +
                  '<small>when you sign up for our letters</small></button>' +
                '<button type="button" class="mdv-pop__decline">No Thanks</button>' +
              '</form>' +
              '<p class="mdv-pop__fine">By signing up you agree to receive letters from MAISON D&rsquo;VUE. ' +
                'Unsubscribe at any time. <a href="/privacy.html">Privacy</a> &middot; <a href="/terms.html">Terms</a></p>' +
            '</div>' +

            '<div class="mdv-pop__screen" aria-live="polite">' +
              '<img class="mdv-pop__mark mdv-pop__mark--big" src="' + MARK + '" alt="" aria-hidden="true">' +
              '<p class="mdv-pop__title">Check your email</p>' +
              '<p class="mdv-pop__body">Your 15% is on its way. If it has not arrived in a moment, ' +
                'look in your promotions folder &mdash; our letters are worth moving to the inbox.</p>' +
            '</div>' +

          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(pop);

    var tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'mdv-pop-tab';
    tab.innerHTML = 'Get 15% Off <span class="mdv-pop-tab__x" aria-hidden="true">&times;</span>';
    tab.setAttribute('aria-label', 'Open the fifteen percent offer');
    document.body.appendChild(tab);

    return { pop: pop, tab: tab };
  }

  /* Hidden-iframe post — no navigation, so the confirmation can slide in. */
  var frame;
  function postToMailchimp(email, honey) {
    if (!frame) {
      frame = document.createElement('iframe');
      frame.name = 'mdv-mc-frame';
      frame.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;';
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('tabindex', '-1');
      document.body.appendChild(frame);
    }
    var f = document.createElement('form');
    f.method = 'post';
    f.action = MC_ACTION;
    f.target = 'mdv-mc-frame';
    f.style.display = 'none';

    var fields = {};
    fields.EMAIL = email;
    fields[MC_HONEYPOT] = honey || '';
    Object.keys(fields).forEach(function (name) {
      var input = document.createElement('input');
      input.type = 'text';
      input.name = name;
      input.value = fields[name];
      f.appendChild(input);
    });

    document.body.appendChild(f);
    f.submit();
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 2000);
  }

  function init() {
    banner();
    if (!/^https?:/.test(location.protocol)) return;

    var built = build();
    var pop = built.pop, tab = built.tab;
    var form = pop.querySelector('.mdv-pop__form');
    var field = pop.querySelector('.mdv-pop__field');
    var lastFocus = null;
    var timer;

    function open() {
      lastFocus = document.activeElement;
      pop.classList.add('is-open');
      tab.classList.remove('is-visible');
      setTimeout(function () { field.focus(); }, 360);
    }
    function close(dismissed) {
      pop.classList.remove('is-open');
      if (dismissed) remember({ dismissedAt: Date.now() });
      if (!state().joined) tab.classList.add('is-visible');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    pop.querySelector('.mdv-pop__close').addEventListener('click', function () { close(true); });
    pop.querySelector('.mdv-pop__decline').addEventListener('click', function () { close(true); });
    pop.addEventListener('click', function (e) { if (e.target === pop) close(true); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && pop.classList.contains('is-open')) close(true);
    });
    tab.addEventListener('click', open);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (field.value || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        field.classList.add('is-error');
        field.focus();
        return;
      }
      field.classList.remove('is-error');
      postToMailchimp(email, form.querySelector('input[name="' + MC_HONEYPOT + '"]').value);
      remember({ joined: true, joinedAt: Date.now() });
      pop.classList.add('is-done');          // the monogram screen slides across
      tab.classList.remove('is-visible');
      setTimeout(function () { close(false); }, 4200);
    });

    if (snoozed()) {
      if (!state().joined) tab.classList.add('is-visible');
      return;
    }
    timer = setTimeout(open, DELAY_MS);

    // Leaving for the tab bar? Show it now rather than never.
    document.addEventListener('mouseout', function onOut(e) {
      if (e.clientY > 0 || pop.classList.contains('is-open') || snoozed()) return;
      clearTimeout(timer);
      document.removeEventListener('mouseout', onOut);
      open();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
