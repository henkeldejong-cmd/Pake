// Facebook Sponsored-Post Hider v3 — conservative: strong signals only, no menu clicking, no layout jumps
(function () {
  'use strict';
  if (window.__fbCleanerLoaded) return;
  window.__fbCleanerLoaded = true;

  // ================= CONFIG =================
  const HIDE_SUGGESTED   = false; // also hide posts labelled exactly "Suggested for you" (off by default: riskier)
  const CONFIRM_SCANS    = 2;     // a post must look like an ad on this many consecutive scans before it is touched
  const MAX_CLEAN_CHECKS = 8;     // after this many "clean" scans a post is left alone (re-armed once when it first scrolls into view)
  const HEADER_ZONE_PX   = 150;   // markers only count this close to the top of a post
  const SCAN_DELAY_MS    = 500;
  const DEBUG            = false; // true = only outline matches (red = ad, orange = suggested) and log why; nothing is hidden
  // ==========================================

  const log = (...a) => console.log('[FB Cleaner]', ...a);
  const clean = (s) => (s || '').replace(/[\u200B-\u200D\uFEFF\u00AD\u2060\u034F\s]/g, '').toLowerCase();

  // "mask" keeps the post's height (nothing moves); "hide" collapses it, only used for posts that are below the screen
  const css = document.createElement('style');
  css.textContent =
    '[data-fbc="mask"]{visibility:hidden!important}' +
    '[data-fbc="hide"]{display:none!important}' +
    '[data-fbc="dbg-ad"]{outline:3px solid red!important}' +
    '[data-fbc="dbg-sug"]{outline:3px solid orange!important}';
  (document.head || document.documentElement).appendChild(css);

  const POST_SEL = 'div[aria-posinset], [data-pagelet^="FeedUnit"], [role="article"]';
  const AD_LINK = 'a[href*="/ads/about"], a[href*="/ads/preferences"], a[href*="/ad_prefs"]';

  const inZone = (el, top) => {
    const t = el.getBoundingClientRect().top - top;
    return t >= -10 && t < HEADER_ZONE_PX;
  };

  function adReason(post, top) {
    for (const a of post.querySelectorAll(AD_LINK)) if (inZone(a, top)) return 'ad-link';

    for (const el of post.querySelectorAll('[aria-labelledby]')) {
      if (!inZone(el, top)) continue;
      const target = document.getElementById(el.getAttribute('aria-labelledby'));
      if (target && clean(target.textContent) === 'sponsored') return 'labelledby:sponsored';
    }
    for (const el of post.querySelectorAll('[aria-label]')) {
      if (inZone(el, top) && clean(el.getAttribute('aria-label')) === 'sponsored') return 'aria-label:sponsored';
    }
    for (const s of post.querySelectorAll('span, a')) {
      if (s.children.length === 0 && inZone(s, top) && clean(s.textContent) === 'sponsored') return 'text:sponsored';
    }
    return null;
  }

  function suggestedReason(post, top) {
    for (const s of post.querySelectorAll('span')) {
      if (s.children.length === 0 && inZone(s, top) && clean(s.textContent) === 'suggestedforyou') return 'suggested-label';
    }
    return null;
  }

  function classify(post) {
    const top = post.getBoundingClientRect().top;
    const a = adReason(post, top);
    if (a) return { kind: 'ad', why: a };
    if (HIDE_SUGGESTED) {
      const s = suggestedReason(post, top);
      if (s) return { kind: 'sug', why: s };
    }
    return null;
  }

  const isTopLevel = (el) => !(el.parentElement && el.parentElement.closest('[role="article"], [aria-posinset]'));

  // identity of the post currently living in a DOM node (Facebook recycles nodes while scrolling)
  const signature = (el) => {
    const h = el.querySelector('h2, h3, h4');
    return (el.getAttribute('aria-posinset') || '') + '|' + (h ? h.textContent.trim().slice(0, 60) : '');
  };

  const info = new WeakMap();

  function scan() {
    const vh = window.innerHeight;
    document.querySelectorAll(POST_SEL).forEach((el) => {
      if (!isTopLevel(el) || el.closest('[role="dialog"]')) return;

      const sig = signature(el);
      let i = info.get(el);
      if (!i || i.sig !== sig) {                       // new post in this node: forget everything about the old one
        if (el.hasAttribute('data-fbc')) el.removeAttribute('data-fbc');
        i = { sig, pos: 0, neg: 0, state: '', vp: false };
        info.set(el, i);
      }

      if (i.state) {                                   // already decided: never flip-flop, only collapse once it's off-screen below
        if (i.state === 'mask' && el.getBoundingClientRect().top > vh + 100) {
          i.state = 'hide'; el.setAttribute('data-fbc', 'hide');
        }
        return;
      }

      const r = el.getBoundingClientRect();
      if (!i.vp && r.top < vh && r.bottom > 0) { i.vp = true; if (i.neg >= MAX_CLEAN_CHECKS) i.neg = 0; }
      if (i.neg >= MAX_CLEAN_CHECKS) return;

      const c = classify(el);
      if (!c) { i.pos = 0; i.neg++; return; }

      i.pos++;
      if (i.pos < CONFIRM_SCANS) return;               // wait for a second, independent look

      if (DEBUG) {
        i.state = 'dbg';
        el.setAttribute('data-fbc', 'dbg-' + c.kind);
        log(c.kind, c.why, el);
        return;
      }
      i.state = r.top > vh ? 'hide' : 'mask';
      el.setAttribute('data-fbc', i.state);
      log('hid', c.kind, c.why);
    });
  }

  let timer = null;
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; scan(); }, SCAN_DELAY_MS);
  };

  function start() {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', schedule, { passive: true });
    setInterval(scan, 1500);                           // makes the "second look" happen even if the page goes quiet
    scan();
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
