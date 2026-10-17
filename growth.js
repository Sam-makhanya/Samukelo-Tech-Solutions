/*!
 * Growth Engine website tracker · Samukelo Tech Solutions
 * Sends visits, WhatsApp/call taps, WhatsApp order forms and enquiry forms
 * to the business's Growth Engine Google Sheet. No cookies, no personal data
 * except what a visitor types into an enquiry form.
 *
 * Use:  <script src="growth.js" data-endpoint="https://script.google.com/macros/s/XXXX/exec" defer></script>
 */
(function () {
  'use strict';
  var me = document.currentScript;
  var ENDPOINT = (me && me.getAttribute('data-endpoint')) || window.GROWTH_ENDPOINT || '';
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(ENDPOINT)) return;
  if (navigator.webdriver || /bot|crawl|spider|lighthouse/i.test(navigator.userAgent)) return;

  function store(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; }
  }

  // Where did this visitor come from? (kept for the whole visit)
  function detectSource() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
    var tag = q && (q.get('src') || q.get('utm_source'));
    if (tag) return tag.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40) || 'tagged';
    if (q && q.get('fbclid')) return 'facebook';
    if (q && q.get('gclid')) return 'google ads';
    var ref = document.referrer, host = '';
    if (!ref) return 'direct';
    try { host = new URL(ref).hostname.replace(/^www\./, ''); } catch (e) { return 'direct'; }
    if (host === location.hostname.replace(/^www\./, '')) return '';
    var known = [['google', 'google'], ['bing', 'bing'], ['facebook', 'facebook'], ['fb.', 'facebook'],
                 ['instagram', 'instagram'], ['tiktok', 'tiktok'], ['whatsapp', 'whatsapp'], ['wa.me', 'whatsapp'],
                 ['t.co', 'twitter'], ['twitter', 'twitter'], ['x.com', 'twitter'], ['linkedin', 'linkedin'], ['youtube', 'youtube']];
    for (var i = 0; i < known.length; i++) if (host.indexOf(known[i][0]) >= 0) return known[i][1];
    return host.slice(0, 40);
  }
  var SOURCE = store('ge_src') || detectSource() || 'direct';
  var isNewVisit = !store('ge_src');
  store('ge_src', SOURCE);

  function send(data, useFetch) {
    data.page = (location.pathname + location.hash).slice(0, 100);
    data.source = SOURCE;
    var body = new URLSearchParams(data);
    try {
      if (!useFetch && navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return Promise.resolve();
    } catch (e) { /* fall through */ }
    return fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', body: body, keepalive: true }).catch(function () {});
  }

  // 1) Visit
  send({ type: 'pageview', detail: isNewVisit ? 'new' : '' });

  // 2) Taps on WhatsApp / phone / email links
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var h = a.getAttribute('href') || '';
    if (/wa\.me|api\.whatsapp\.com|whatsapp:\/\//i.test(h)) send({ type: 'whatsapp' });
    else if (/^tel:/i.test(h)) send({ type: 'call' });
    else if (/^mailto:/i.test(h)) send({ type: 'email' });
  }, true);

  // 3) Order/booking forms that open WhatsApp with window.open (existing sites keep working unchanged)
  var nativeOpen = window.open;
  if (typeof nativeOpen === 'function') {
    window.open = function (url) {
      try { if (url && /wa\.me|api\.whatsapp\.com/i.test(String(url))) send({ type: 'whatsapp_order' }); } catch (e) { /* ignore */ }
      return nativeOpen.apply(window, arguments);
    };
  }

  // 4) Enquiry forms: <form data-growth-form> with fields name, phone, email, service, message
  function wire(form) {
    if (form.__ge) return; form.__ge = true;
    var trap = document.createElement('input');                     // spam trap, invisible to people
    trap.type = 'text'; trap.name = 'website_url'; trap.tabIndex = -1; trap.autocomplete = 'off';
    trap.setAttribute('aria-hidden', 'true');
    trap.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
    form.appendChild(trap);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form), data = { type: 'lead' };
      ['name', 'phone', 'email', 'service', 'message', 'website_url'].forEach(function (k) {
        var v = fd.get(k); if (v) data[k] = String(v).slice(0, 1000);
      });
      if (!data.name && !data.phone && !data.email) return;
      var btn = form.querySelector('[type=submit]');
      if (btn) { btn.disabled = true; }
      send(data, true).then(function () {
        var thanks = form.getAttribute('data-thanks') || "Thank you! We'll get back to you shortly.";
        var wa = (form.getAttribute('data-whatsapp') || '').replace(/\D/g, '');
        var box = document.createElement('div');
        box.className = 'gf-thanks';
        box.setAttribute('role', 'status');
        box.textContent = thanks;
        if (wa) {
          var link = document.createElement('a');
          var text = 'Hi! I just sent an enquiry on your website' + (data.service ? ' about ' + data.service : '') + (data.name ? '. My name is ' + data.name : '') + '.';
          link.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent(text);
          link.target = '_blank'; link.rel = 'noopener';
          link.className = 'gf-wa';
          link.textContent = 'Chat on WhatsApp now';
          box.appendChild(document.createElement('br'));
          box.appendChild(link);
        }
        form.replaceWith(box);
      });
    });
  }
  function scan() { Array.prototype.forEach.call(document.querySelectorAll('form[data-growth-form]'), wire); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
})();
