(function () {
  'use strict';
  if (window.__refinedDark) return;
  window.__refinedDark = true;

  const KEY = '__refined_dark_on';
  const SKIP_KEY = '__refined_dark_skip_hosts';
  const getSkipped = () => { try { return JSON.parse(localStorage.getItem(SKIP_KEY) || '[]'); } catch (e) { return []; } };
  const isHostSkipped = () => getSkipped().includes(location.hostname);
  const toggleHostSkip = () => {
    const list = getSkipped();
    const idx = list.indexOf(location.hostname);
    if (idx >= 0) list.splice(idx, 1); else list.push(location.hostname);
    try { localStorage.setItem(SKIP_KEY, JSON.stringify(list)); } catch (e) {}
  };
  const isOn = () => { try { return localStorage.getItem(KEY) !== '0' && !isHostSkipped(); } catch (e) { return true; } };
  const saveOn = v => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {} };

  const CFG = {
    pageBg: '#0a0a0c',
    minSurface: 0.045,
    surfaceRange: 0.20,
    dimImages: 0.92,
    disqus: 'invert',
    skipHosts: ['archive.org', 'worldofreel.com'], // Heavy complex readers/apps can be listed here or toggled with Alt+Shift+D
    batch: 250
  };
  if (CFG.skipHosts.some(h => location.hostname === h || location.hostname.endsWith('.' + h))) return;

  const base = document.createElement('style');
  base.id = '__refined-dark-base';
  base.textContent = `
    :root{color-scheme:dark!important}
    html,body{background-color:${CFG.pageBg}!important}
    ${CFG.disqus === 'native' ? '#disqus_thread{color:#ececf0!important;color-scheme:dark!important}' : ''}
    ${CFG.disqus === 'invert' ? 'iframe[src*="disqus.com/embed/comments"]{color-scheme:light!important;filter:invert(.92) hue-rotate(180deg)!important}' : ''}
    ::selection{background:#3b5bdb!important;color:#fff!important}
    *{scrollbar-color:#3a3a42 ${CFG.pageBg}}
    ::placeholder{color:#8b8b95!important;opacity:1!important}
    input,textarea,select{caret-color:#e8e8ec}
    ${CFG.dimImages < 1 ? `img:not([src$=".svg"]),video,canvas{filter:brightness(${CFG.dimImages})}` : ''}
  `;
  const mountBase = () => { if (!base.isConnected) (document.head || document.documentElement).appendChild(base); };

  const cache = new Map();
  let ctx2d = null;
  function parse(str) {
    if (!str || str === 'none') return null;
    if (cache.has(str)) return cache.get(str);
    let out = null;
    if (str === 'transparent') out = [0, 0, 0, 0];
    else {
      let m = str.match(/^rgba?\(([^)]+)\)/);
      if (!m) {
        try {
          ctx2d = ctx2d || document.createElement('canvas').getContext('2d');
          ctx2d.fillStyle = '#000'; ctx2d.fillStyle = str;
          const n = ctx2d.fillStyle;
          m = n.startsWith('#')
            ? [0, `${parseInt(n.slice(1, 3), 16)},${parseInt(n.slice(3, 5), 16)},${parseInt(n.slice(5, 7), 16)}`]
            : n.match(/^rgba?\(([^)]+)\)/);
        } catch (e) { m = null; }
      }
      if (m) {
        const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
        out = [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
      }
    }
    cache.set(str, out);
    return out;
  }
  const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  function toHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function fromHsl(h, s, l) {
    const f = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(v => Math.round(v * 255));
  }
  const css = (rgb, a) => a < 1 ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})` : `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

  function mapSurface(c) {
    const [r, g, b, a] = c;
    if (a < 0.05) return null;
    const [h, s, l] = toHsl(r, g, b);
    if (lum(r, g, b) < 0.55) return null;
    if (s > 0.45 && l < 0.8) return null;
    const nl = CFG.minSurface + (1 - l) * CFG.surfaceRange * 1.6;
    return css(fromHsl(h, Math.min(s, 0.35), Math.min(nl, 0.22)), a);
  }
  function mapText(c) {
    const [r, g, b, a] = c;
    if (a < 0.05 || lum(r, g, b) > 0.6) return null;
    const [h, s, l] = toHsl(r, g, b);
    return css(fromHsl(h, Math.min(s, 0.7), Math.max(0.74, 0.92 - l * 0.35)), a);
  }
  function mapBorder(c) {
    const [r, g, b, a] = c;
    if (a < 0.05 || lum(r, g, b) < 0.55) return null;
    const [h, s, l] = toHsl(r, g, b);
    return css(fromHsl(h, Math.min(s, 0.25), 0.18 + (1 - l) * 0.25), a);
  }

  const bgLum = new WeakMap();
  const applied = new WeakMap();
  const BORDERS = ['top', 'right', 'bottom', 'left'];
  const DEFAULT_LUM = lum(10, 10, 12);

  function setImp(el, prop, val) {
    let rec = applied.get(el);
    if (!rec) applied.set(el, (rec = []));
    if (!rec.some(x => x[0] === prop))
      rec.push([prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
    el.style.setProperty(prop, val, 'important');
  }
  function reset(el) {
    const rec = applied.get(el);
    if (!rec) return;
    rec.forEach(([p, v, pr]) => v ? el.style.setProperty(p, v, pr) : el.style.removeProperty(p));
    applied.delete(el);
    bgLum.delete(el);
  }

  function process(el) {
    if (!el || el.nodeType !== 1 || el.id === '__refined-dark-base') return DEFAULT_LUM;
    if (bgLum.has(el)) return bgLum.get(el);
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'META' || tag === 'HEAD') return DEFAULT_LUM;

    const parent = el.parentElement;
    const parentLum = parent ? process(parent) : DEFAULT_LUM;
    let cs;
    try { cs = getComputedStyle(el); } catch (e) { return parentLum; }

    // Skip invisible full-screen preloaders/overlays so they never turn into opaque black walls
    if (cs.position === 'fixed' && (parseFloat(cs.opacity) < 0.15 || cs.pointerEvents === 'none')) {
      bgLum.set(el, parentLum);
      return parentLum;
    }

    let eff = parentLum;
    const bg = parse(cs.backgroundColor);
    if (bg && bg[3] > 0.05) {
      const m = mapSurface(bg);
      if (m) setImp(el, 'background-color', m);
      const fin = parse(m || cs.backgroundColor);
      if (fin && bg[3] >= 0.6) eff = lum(fin[0], fin[1], fin[2]);
    }

    const bi = cs.backgroundImage;
    if (bi && bi !== 'none') {
      if (bi.includes('gradient')) {
        let changed = false;
        const nbi = bi.replace(/rgba?\([^)]+\)/g, s => {
          const c = parse(s); const m = c && mapSurface(c);
          if (m) changed = true;
          return m || s;
        });
        if (changed) { setImp(el, 'background-image', nbi); eff = DEFAULT_LUM + 0.05; }
      } else if (bi.includes('url(')) {
        eff = null;
      }
    }

    if (eff !== null && eff < 0.4) {
      const tc = parse(cs.color);
      const m = tc && mapText(tc);
      if (m) setImp(el, 'color', m);
    }

    for (const side of BORDERS) {
      if (parseFloat(cs['border' + side[0].toUpperCase() + side.slice(1) + 'Width']) > 0) {
        const bc = parse(cs['border' + side[0].toUpperCase() + side.slice(1) + 'Color']);
        const m = bc && mapBorder(bc);
        if (m) setImp(el, 'border-' + side + '-color', m);
      }
    }

    if (el instanceof SVGElement && tag !== 'svg' && eff !== null && eff < 0.4) {
      for (const p of ['fill', 'stroke']) {
        const c = parse(cs[p]);
        const m = c && mapText(c);
        if (m) setImp(el, p, m);
      }
    }

    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      const c = parse(cs.backgroundColor);
      if (c && c[3] < 0.05) setImp(el, 'background-color', '#15151a');
    }

    bgLum.set(el, eff);
    return eff;
  }

  const queue = [];
  const queued = new Set();
  let scheduled = false;

  function enqueue(node, deep) {
    if (!node || node.nodeType !== 1) return;
    const add = n => { if (!queued.has(n)) { queued.add(n); queue.push(n); } };
    add(node);
    if (deep) node.querySelectorAll('*').forEach(add);
    schedule();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  }
  function run() {
    scheduled = false;
    prepNative();
    const n = Math.min(CFG.batch, queue.length);
    for (let i = 0; i < n; i++) {
      const el = queue.shift();
      queued.delete(el);
      if (el.isConnected) process(el);
    }
    if (queue.length) schedule();
  }

  // Only watch newly added elements (removes attribute-class thrashing that froze heavy sites)
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(n => { markSeen(n); enqueue(n, true); });
    }
  });

  const seen = new WeakSet();
  const disqusFrames = () => Array.from(document.querySelectorAll('iframe[src*="disqus.com"]'));
  function markSeen(n) {
    if (!n || n.nodeType !== 1) return;
    if (n.tagName === 'IFRAME') seen.add(n);
    else n.querySelectorAll && n.querySelectorAll('iframe').forEach(f => seen.add(f));
  }
  function reinsert(f) {
    const p = f.parentNode; if (!p) return;
    const nx = f.nextSibling; p.removeChild(f); p.insertBefore(f, nx);
  }
  function fixDisqus() {
    disqusFrames().forEach(f => { if (!seen.has(f)) { seen.add(f); reinsert(f); } });
  }
  function prepNative() {
    if (CFG.disqus !== 'native') return;
    const t = document.getElementById('disqus_thread');
    if (!t) return;
    for (let el = t; el && el !== document.documentElement; el = el.parentElement) {
      if (!applied.get(el) || !applied.get(el).some(x => x[0] === 'color')) setImp(el, 'color', '#ececf0');
    }
  }

  let active = false;
  function enable() {
    if (active) return;
    active = true;
    mountBase();
    mo.observe(document.documentElement, { childList: true, subtree: true });
    enqueue(document.documentElement, true);
    prepNative();
    if (CFG.disqus === 'native') fixDisqus();
  }
  function disable() {
    active = false;
    mo.disconnect();
    queue.length = 0; queued.clear();
    base.remove();
    document.querySelectorAll('*').forEach(reset);
    if (CFG.disqus === 'native') disqusFrames().forEach(f => { seen.delete(f); reinsert(f); });
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:48px;transform:translateX(-50%);background:#222;color:#fff;padding:8px 14px;border-radius:20px;font:13px sans-serif;z-index:2147483647;opacity:.95';
    (document.body || document.documentElement).appendChild(t);
    setTimeout(() => t.remove(), 1400);
  }

  window.__refinedDarkToggle = () => {
    toggleHostSkip();
    if (active) { disable(); toast('Dark mode OFF for ' + location.hostname); }
    else { enable(); toast('Dark mode ON for ' + location.hostname); }
  };

  // Alt+Shift+D toggles dark mode off/on (avoids Clipjump's Ctrl+Shift+D)
  document.addEventListener('keydown', e => {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      window.__refinedDarkToggle();
    }
  });

  if (isOn()) enable();
  document.addEventListener('DOMContentLoaded', () => { if (active) enqueue(document.documentElement, true); });
  window.addEventListener('load', () => { if (active) enqueue(document.documentElement, true); });

  if (typeof hcj !== 'undefined' && hcj.on) {
    hcj.on('action', () => {
      if (active) { disable(); saveOn(false); toast('Dark mode off'); }
      else { enable(); saveOn(true); toast('Dark mode on'); }
    });
  }
})();
