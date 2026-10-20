import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import type { SceneHandle } from './scene';

gsap.registerPlugin(ScrollTrigger);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const root = document.documentElement;

// Emil-style curves: strong ease-out for entrances, nothing eases in.
const EASE_OUT = 'expo.out';
const EASE_UI = 'power3.out';
const GLYPHS = '▓▒░<>/\\|=+*#%01ΔΣΞ';

/* ── Smooth scroll ─────────────────────────────────────────────────────── */

let lenis: Lenis | null = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis!.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"], a[href^="/#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const hash = a.getAttribute('href')!.replace(/^\//, '');
      const target = hash.length > 1 ? document.querySelector(hash) : null;
      if (!target || location.pathname !== '/') return;
      e.preventDefault();
      lenis!.scrollTo(target as HTMLElement, { offset: -20, duration: 1.6 });
    });
  });
}

/* ── 3D scene ──────────────────────────────────────────────────────────── */

const canvas = document.querySelector<HTMLCanvasElement>('#field');
let scene: SceneHandle | null = null;
// three.js is the heaviest dependency, so it loads after first paint.
if (canvas) {
  import('./scene').then(({ createScene }) => {
    scene = createScene(canvas, { reduced });
    if (!scene) {
      root.classList.add('no-webgl');
      return;
    }
    scene.setFade(1);
    onScroll();
  });
}

// Each [data-morph] section owns a shape; between section centres the
// cloud blends from one to the next.
const morphStops: { el: HTMLElement; value: number; y: number }[] = [];
document.querySelectorAll<HTMLElement>('[data-morph]').forEach((el) => {
  morphStops.push({ el, value: Number(el.dataset.morph), y: 0 });
});

function measureStops() {
  for (const s of morphStops) {
    const r = s.el.getBoundingClientRect();
    s.y = r.top + window.scrollY + r.height / 2;
  }
}

function morphAt(scrollY: number) {
  if (!morphStops.length) return 0;
  const probe = scrollY + window.innerHeight / 2;
  if (probe <= morphStops[0].y) return morphStops[0].value;
  for (let i = 0; i < morphStops.length - 1; i++) {
    const a = morphStops[i];
    const b = morphStops[i + 1];
    if (probe <= b.y) {
      const t = (probe - a.y) / (b.y - a.y);
      return a.value + (b.value - a.value) * t;
    }
  }
  return morphStops[morphStops.length - 1].value;
}

/* ── Scroll trace ──────────────────────────────────────────────────────── */

// A single circuit line threads down the page through every [data-trace]
// anchor and draws itself as you scroll; its head carries a live readout.
const traceSvg = document.querySelector<SVGSVGElement>('#trace');
const tracePath = traceSvg?.querySelector<SVGPathElement>('.trace-line');
const traceGhost = traceSvg?.querySelector<SVGPathElement>('.trace-ghost');
const traceHead = traceSvg?.querySelector<SVGGElement>('.trace-head');
const traceLabel = traceSvg?.querySelector<SVGTextElement>('.trace-label');
let traceLength = 0;
let traceLookup: { y: number; len: number }[] = [];

function buildTrace() {
  if (!traceSvg || !tracePath || !traceGhost) return;
  const host = traceSvg.parentElement!;
  const hostRect = host.getBoundingClientRect();
  const w = hostRect.width;
  // Collapse the svg before measuring: it sits inside the host, so its old
  // height would count toward scrollHeight and the page could only ever grow.
  traceSvg.style.height = '0px';
  const h = host.scrollHeight;
  traceSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  traceSvg.style.height = `${h}px`;

  const anchors = [...document.querySelectorAll<HTMLElement>('[data-trace]')].map((el) => {
    const r = el.getBoundingClientRect();
    const side = el.dataset.trace;
    // On phones the line hugs the left edge so it never cuts across copy.
    if (w < 768) return { x: 7, y: r.top - hostRect.top + r.height / 2 };
    const inset = Math.min(40, w * 0.03);
    const x = side === 'right' ? w - inset : side === 'center' ? w / 2 : inset;
    return { x, y: r.top - hostRect.top + r.height / 2 };
  });
  if (anchors.length < 2) return;

  const R = 28;
  let d = `M ${anchors[0].x} ${anchors[0].y}`;
  for (let i = 1; i < anchors.length; i++) {
    const p = anchors[i - 1];
    const q = anchors[i];
    if (Math.abs(q.x - p.x) < 1) {
      d += ` L ${q.x} ${q.y}`;
      continue;
    }
    // Down, across, down: a right-angle run with rounded corners.
    const mid = p.y + (q.y - p.y) * 0.5;
    const dir = q.x > p.x ? 1 : -1;
    const r = Math.min(R, Math.abs(q.x - p.x) / 2, (q.y - p.y) / 4);
    d += ` L ${p.x} ${mid - r} Q ${p.x} ${mid} ${p.x + dir * r} ${mid}`;
    d += ` L ${q.x - dir * r} ${mid} Q ${q.x} ${mid} ${q.x} ${mid + r} L ${q.x} ${q.y}`;
  }
  tracePath.setAttribute('d', d);
  traceGhost.setAttribute('d', d);
  traceLength = tracePath.getTotalLength();
  tracePath.style.strokeDasharray = `${traceLength}`;

  traceLookup = [];
  const steps = Math.ceil(traceLength / 12);
  let maxY = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const len = (i / steps) * traceLength;
    const pt = tracePath.getPointAtLength(len);
    if (pt.y > maxY) {
      maxY = pt.y;
      traceLookup.push({ y: pt.y, len });
    }
  }
}

function traceLenForY(y: number) {
  const lk = traceLookup;
  if (!lk.length) return 0;
  if (y <= lk[0].y) return 0;
  if (y >= lk[lk.length - 1].y) return traceLength;
  let lo = 0;
  let hi = lk.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (lk[m].y < y) lo = m;
    else hi = m;
  }
  const a = lk[lo];
  const b = lk[hi];
  // Horizontal runs share one y, so take the far end of the run.
  return a.len + (b.len - a.len) * ((y - a.y) / Math.max(1e-6, b.y - a.y));
}

function updateTrace(scrollY: number) {
  if (!tracePath || !traceSvg || !traceLength) return;
  const host = traceSvg.parentElement!;
  const hostTop = host.getBoundingClientRect().top + scrollY;
  const y = scrollY + window.innerHeight * 0.62 - hostTop;
  const len = traceLenForY(y);
  tracePath.style.strokeDashoffset = `${traceLength - len}`;
  if (traceHead) {
    const pt = tracePath.getPointAtLength(len);
    traceHead.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
    traceHead.style.opacity = len > 2 && len < traceLength - 2 ? '1' : '0';
    if (traceLabel) {
      const flip = pt.x > traceSvg.viewBox.baseVal.width / 2;
      traceLabel.setAttribute('x', flip ? '-14' : '14');
      traceLabel.setAttribute('text-anchor', flip ? 'end' : 'start');
      traceLabel.textContent = `${String(Math.round(pt.y)).padStart(5, '0')} · ${Math.round((len / traceLength) * 100)}%`;
    }
  }
}

/* ── HUD ───────────────────────────────────────────────────────────────── */

// The desktop HUD and the mobile dock share these readouts.
const hudDepth = document.querySelectorAll<HTMLElement>('[data-hud="depth"]');
const hudBar = document.querySelector<HTMLElement>('[data-hud="bar"]');
const hudRing = document.querySelector<SVGCircleElement>('[data-hud="ring"]');
const hudSection = document.querySelectorAll<HTMLElement>('[data-hud="section"]');
const hudClock = document.querySelectorAll<HTMLElement>('[data-hud="clock"]');
const hudVel = document.querySelector<HTMLElement>('[data-hud="vel"]');
const RING = 2 * Math.PI * 17;

if (hudClock.length) {
  const tick = () => {
    const t = new Date().toTimeString().slice(0, 8);
    hudClock.forEach((el) => (el.textContent = t));
  };
  tick();
  setInterval(tick, 1000);
}

document.querySelectorAll<HTMLElement>('[data-section]').forEach((el) => {
  ScrollTrigger.create({
    trigger: el,
    start: 'top 55%',
    end: 'bottom 55%',
    onToggle: (self) => {
      if (!self.isActive) return;
      hudSection.forEach((h) => {
        if (h.dataset.text === el.dataset.section) return;
        h.dataset.text = el.dataset.section!;
        scramble(h, 0.45);
      });
    },
  });
});

/* ── Text: decode on reveal ────────────────────────────────────────────── */

function scramble(el: HTMLElement, duration = 0.9) {
  const final = el.dataset.text ?? el.textContent ?? '';
  el.dataset.text = final;
  if (reduced) {
    el.textContent = final;
    return;
  }
  const obj = { p: 0 };
  gsap.to(obj, {
    p: 1,
    duration,
    ease: 'none',
    onUpdate: () => {
      const n = Math.floor(obj.p * final.length);
      let out = final.slice(0, n);
      for (let i = n; i < final.length; i++) {
        out += final[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
    },
    onComplete: () => {
      el.textContent = final;
    },
  });
}

document.querySelectorAll<HTMLElement>('[data-scramble]').forEach((el) => {
  el.dataset.text = el.textContent ?? '';
  ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => scramble(el) });
});

/* ── Boot sequence + hero ──────────────────────────────────────────────── */

function splitChars(el: HTMLElement) {
  const text = el.textContent ?? '';
  el.setAttribute('aria-label', text);
  el.textContent = '';
  for (const word of text.split(' ')) {
    const w = document.createElement('span');
    w.className = 'w';
    w.setAttribute('aria-hidden', 'true');
    for (const ch of word) {
      const c = document.createElement('span');
      c.className = 'c';
      c.textContent = ch;
      w.appendChild(c);
    }
    el.appendChild(w);
    el.appendChild(document.createTextNode(' '));
  }
  return el.querySelectorAll<HTMLElement>('.c');
}

function intro() {
  const name = document.querySelector<HTMLElement>('[data-split]');
  const chars = name ? splitChars(name) : null;
  scene?.setFade(1);
  if (reduced || !chars) {
    root.classList.add('is-ready');
    return;
  }
  const tl = gsap.timeline({ onStart: () => root.classList.add('is-ready') });
  tl.from(chars, { yPercent: 110, rotateX: -80, opacity: 0, duration: 1.3, ease: EASE_OUT, stagger: { each: 0.035, from: 'start' } })
    .from('[data-intro]', { y: 18, opacity: 0, duration: 0.9, ease: EASE_UI, stagger: 0.08 }, 0.35)
    .from('.hud', { opacity: 0, duration: 0.8, ease: EASE_UI }, 0.6)
    .from('.dock', { yPercent: 160, opacity: 0, duration: 1, ease: EASE_OUT }, 0.7);
}

const boot = document.querySelector<HTMLElement>('#boot');
const seen = (() => {
  try {
    return sessionStorage.getItem('fz-boot') === '1';
  } catch {
    return false;
  }
})();

if (boot && !seen && !reduced) {
  try {
    sessionStorage.setItem('fz-boot', '1');
  } catch {}
  const lines = [...boot.querySelectorAll<HTMLElement>('.boot-line')];
  const bar = boot.querySelector<HTMLElement>('.boot-bar i');
  const tl = gsap.timeline({
    onComplete: () => {
      gsap.to(boot, {
        clipPath: 'inset(0 0 100% 0)',
        duration: 0.9,
        ease: 'expo.inOut',
        onComplete: () => boot.remove(),
      });
      intro();
    },
  });
  tl.set(boot, { opacity: 1 });
  lines.forEach((l, i) => {
    tl.fromTo(l, { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.18, ease: EASE_UI }, i * 0.16);
  });
  if (bar) tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: lines.length * 0.16 + 0.2, ease: 'power2.inOut' }, 0);
} else {
  boot?.remove();
  intro();
}

/* ── Manifesto: words light up as they cross the viewport ─────────────── */

document.querySelectorAll<HTMLElement>('[data-words]').forEach((el) => {
  const words = (el.textContent ?? '').trim().split(/\s+/);
  el.setAttribute('aria-label', el.textContent!.trim());
  el.innerHTML = words.map((w) => `<span aria-hidden="true">${w}</span>`).join(' ');
  if (reduced) return;
  gsap.fromTo(
    el.children,
    { opacity: 0.1, filter: 'blur(6px)' },
    {
      opacity: 1,
      filter: 'blur(0px)',
      stagger: 0.12,
      ease: 'none',
      scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: 0.6 },
    },
  );
});

/* ── Generic reveals ───────────────────────────────────────────────────── */

if (!reduced) {
  gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
    gsap.from(el, {
      y: 40,
      opacity: 0,
      duration: 1.1,
      ease: EASE_OUT,
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });

  gsap.utils.toArray<HTMLElement>('[data-clip]').forEach((el) => {
    gsap.fromTo(
      el,
      { clipPath: 'inset(12% 12% 12% 12%)' },
      {
        clipPath: 'inset(0% 0% 0% 0%)',
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 95%', end: 'top 35%', scrub: 0.5 },
      },
    );
    const img = el.querySelector('img');
    if (img) {
      gsap.fromTo(img, { scale: 1.25 }, {
        scale: 1,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    }
  });

  gsap.utils.toArray<HTMLElement>('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target)) return;
    const obj = { v: 0 };
    gsap.to(obj, {
      v: target,
      duration: 1.6,
      ease: EASE_OUT,
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      onUpdate: () => {
        el.textContent = String(Math.round(obj.v)).padStart(el.dataset.pad ? Number(el.dataset.pad) : 1, '0');
      },
    });
  });
}

/* ── Work: a pinned horizontal run on wide screens ─────────────────────── */

const mm = gsap.matchMedia();
mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
  const track = document.querySelector<HTMLElement>('[data-track]');
  const pin = document.querySelector<HTMLElement>('[data-pin]');
  if (!track || !pin) return;
  const distance = () => track.scrollWidth - window.innerWidth;
  const tween = gsap.to(track, {
    x: () => -distance(),
    ease: 'none',
    scrollTrigger: {
      trigger: pin,
      start: 'top top',
      end: () => `+=${distance()}`,
      pin: true,
      scrub: 0.8,
      invalidateOnRefresh: true,
      anticipatePin: 1,
    },
  });

  const panels = gsap.utils.toArray<HTMLElement>('[data-panel]', track);
  panels.forEach((panel) => {
    const media = panel.querySelector('.panel-media');
    const img = panel.querySelector('img');
    if (media) {
      gsap.fromTo(media, { clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)' }, {
        clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
        ease: 'none',
        scrollTrigger: { trigger: panel, containerAnimation: tween, start: 'left 95%', end: 'left 45%', scrub: 0.4 },
      });
    }
    if (img) {
      gsap.fromTo(img, { xPercent: -10 }, {
        xPercent: 10,
        ease: 'none',
        scrollTrigger: { trigger: panel, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true },
      });
    }
  });

  const progress = document.querySelector<HTMLElement>('[data-work-progress]');
  if (progress) {
    ScrollTrigger.create({
      trigger: pin,
      start: 'top top',
      end: () => `+=${distance()}`,
      onUpdate: (self) => gsap.set(progress, { scaleX: self.progress }),
    });
  }
  return () => tween.kill();
});

/* ── Work: a stacked deck on phones ──────────────────────────────────── */

// Each case file sticks a little lower than the last; as the next one slides
// over it, the buried card sinks back, tips away and dims.
let deck: { card: HTMLElement; next: HTMLElement }[] = [];

mm.add('(max-width: 767px) and (prefers-reduced-motion: no-preference)', () => {
  const panels = gsap.utils.toArray<HTMLElement>('[data-panel]');
  deck = [];
  panels.forEach((panel, i) => {
    panel.style.setProperty('--i', String(i));
    const card = panel.querySelector<HTMLElement>('.panel-link');
    if (card && panels[i + 1]) deck.push({ card, next: panels[i + 1] });
  });
  root.classList.add('has-deck');
  updateDeck();
  return () => {
    root.classList.remove('has-deck');
    deck.forEach(({ card }) => {
      card.style.transform = '';
      card.style.removeProperty('--dim');
    });
    deck = [];
  };
});

function updateDeck() {
  if (!deck.length) return;
  const vh = window.innerHeight;
  for (const { card, next } of deck) {
    const stick = parseFloat(getComputedStyle(next).top) || 0;
    const top = next.getBoundingClientRect().top;
    const p = gsap.utils.clamp(0, 1, (vh - top) / Math.max(1, vh - stick));
    card.style.transform = `scale(${1 - p * 0.1}) rotateX(${p * 8}deg)`;
    card.style.setProperty('--dim', String(p * 0.7));
  }
}

/* ── Marquee rows react to scroll speed ────────────────────────────────── */

const marquees = gsap.utils.toArray<HTMLElement>('[data-marquee]').map((el) => {
  const dir = el.dataset.marquee === 'reverse' ? 1 : -1;
  const inner = el.firstElementChild as HTMLElement;
  return { inner, dir, x: 0 };
});

let velocity = 0;

gsap.ticker.add((_, delta) => {
  const dt = delta / 1000;
  for (const m of marquees) {
    if (reduced) break;
    const half = m.inner.scrollWidth / 2;
    m.x += m.dir * (40 + Math.min(Math.abs(velocity) * 0.25, 600)) * dt;
    if (m.x <= -half) m.x += half;
    if (m.x > 0) m.x -= half;
    m.inner.style.transform = `translate3d(${m.x}px,0,0)`;
  }
});

/* ── Velocity skew on panels ───────────────────────────────────────────── */

const skewTargets = document.querySelectorAll<HTMLElement>('[data-skew]');
const skewTo = [...skewTargets].map((el) => gsap.quickTo(el, 'skewX', { duration: 0.5, ease: EASE_UI }));

/* ── Per-scroll updates ────────────────────────────────────────────────── */

let lastY = window.scrollY;
let lastT = performance.now();

function onScroll() {
  const y = lenis ? lenis.scroll : window.scrollY;
  const now = performance.now();
  const v = lenis ? lenis.velocity * 60 : ((y - lastY) / Math.max(1, now - lastT)) * 1000;
  velocity = v;
  lastY = y;
  lastT = now;

  scene?.setMorph(morphAt(y));
  scene?.setScrollVelocity(v);
  updateTrace(y);
  updateDeck();

  const max = document.documentElement.scrollHeight - window.innerHeight;
  const pct = max > 0 ? y / max : 0;
  const depth = String(Math.round(pct * 100)).padStart(3, '0');
  hudDepth.forEach((el) => (el.textContent = depth));
  if (hudBar) hudBar.style.transform = `scaleY(${pct})`;
  if (hudRing) hudRing.style.strokeDashoffset = `${RING * (1 - pct)}`;
  if (hudVel) hudVel.textContent = (Math.abs(v) / 100).toFixed(1).padStart(4, '0');
  if (!reduced) {
    const s = gsap.utils.clamp(-6, 6, v / -300);
    skewTo.forEach((fn) => fn(s));
  }
}

if (lenis) lenis.on('scroll', onScroll);
else window.addEventListener('scroll', onScroll, { passive: true });

function relayout() {
  measureStops();
  buildTrace();
  onScroll();
}

ScrollTrigger.addEventListener('refresh', relayout);
window.addEventListener('load', () => ScrollTrigger.refresh());
document.fonts?.ready.then(() => ScrollTrigger.refresh());
relayout();

/* ── Pointer: reticle cursor, field repulsion, magnetic buttons ───────── */

const reticle = document.querySelector<HTMLElement>('#reticle');
const reticleLabel = reticle?.querySelector<HTMLElement>('.reticle-label');

if (finePointer && reticle) {
  root.classList.add('has-reticle');
  const xTo = gsap.quickTo(reticle, 'x', { duration: 0.25, ease: EASE_UI });
  const yTo = gsap.quickTo(reticle, 'y', { duration: 0.25, ease: EASE_UI });
  // Touch laptops and emulators can report a fine pointer and still get
  // touched: the cursor stands down for touch and comes back for a mouse.
  window.addEventListener('pointerdown', (e) => {
    root.classList.toggle('has-reticle', e.pointerType === 'mouse');
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    root.classList.add('has-reticle');
    xTo(e.clientX);
    yTo(e.clientY);
    if (reticleLabel) reticleLabel.textContent = `${String(e.clientX).padStart(4, '0')}.${String(e.clientY).padStart(4, '0')}`;
    scene?.setPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
  });
  document.addEventListener('pointerleave', () => scene?.setPointer(9, 9));
  document.addEventListener('pointerover', (e) => {
    const t = (e.target as HTMLElement).closest('a, button, [data-hover]');
    reticle.classList.toggle('is-active', !!t);
  });
}

if (finePointer && !reduced) {
  document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * 0.3);
      yTo((e.clientY - (r.top + r.height / 2)) * 0.3);
    });
    el.addEventListener('pointerleave', () => {
      xTo(0);
      yTo(0);
    });
  });

  // Panels tilt toward the pointer, like a held card.
  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((el) => {
    const rx = gsap.quickTo(el, 'rotateX', { duration: 0.5, ease: EASE_UI });
    const ry = gsap.quickTo(el, 'rotateY', { duration: 0.5, ease: EASE_UI });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * 8);
      rx(-((e.clientY - r.top) / r.height - 0.5) * 8);
    });
    el.addEventListener('pointerleave', () => {
      rx(0);
      ry(0);
    });
  });
}

/* ── Touch: the field answers a finger ───────────────────────────────── */

const taps = document.querySelector<HTMLElement>('#taps');
const toNdc = (x: number, y: number) => [(x / window.innerWidth) * 2 - 1, -((y / window.innerHeight) * 2 - 1)] as const;
const buzz = (ms: number) => {
  try {
    if (navigator.userActivation?.hasBeenActive ?? true) navigator.vibrate?.(ms);
  } catch {}
};

// Where a finger lands, brackets snap shut on it and a ring rolls outward:
// the cursor's job, done only when there is something to answer.
function lockOn(x: number, y: number) {
  if (!taps) return;
  const el = document.createElement('div');
  el.className = 'tap';
  el.style.transform = `translate(${x}px, ${y}px)`;
  el.innerHTML = '<span class="tap-ring"></span><span class="tap-box"></span><span class="tap-label"></span>';
  taps.appendChild(el);
  const [ring, box, label] = el.children as unknown as HTMLElement[];
  label.textContent = `LOCK ${String(Math.round(x)).padStart(4, '0')}.${String(Math.round(y)).padStart(4, '0')}`;
  scramble(label, 0.35);
  gsap
    .timeline({ onComplete: () => el.remove() })
    .fromTo(box, { scale: 2.4, rotate: 45, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, duration: 0.4, ease: EASE_OUT })
    .fromTo(ring, { scale: 0.3, opacity: 0.9 }, { scale: 3.4, opacity: 0, duration: 0.9, ease: EASE_OUT }, 0)
    .to(el, { opacity: 0, duration: 0.35, ease: 'power2.out' }, 0.8);
}

if (!finePointer) {
  let release = 0;
  let sx = 0;
  let sy = 0;
  let st = 0;
  window.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      if (!t) return;
      clearTimeout(release);
      sx = t.clientX;
      sy = t.clientY;
      st = performance.now();
      scene?.setPointer(...toNdc(t.clientX, t.clientY));
    },
    { passive: true },
  );
  window.addEventListener(
    'touchmove',
    (e) => {
      const t = e.touches[0];
      if (t) scene?.setPointer(...toNdc(t.clientX, t.clientY));
    },
    { passive: true },
  );
  window.addEventListener(
    'touchend',
    (e) => {
      release = window.setTimeout(() => scene?.setPointer(9, 9), 500);
      const t = e.changedTouches[0];
      // Only a tap fires: a swipe is the visitor scrolling, not talking to us.
      if (!t || Math.hypot(t.clientX - sx, t.clientY - sy) > 10 || performance.now() - st > 400) return;
      if (root.classList.contains('menu-open')) return;
      if ((e.target as HTMLElement).closest?.('a, button')) buzz(6);
      if (reduced) return;
      lockOn(t.clientX, t.clientY);
      scene?.pulse(...toNdc(t.clientX, t.clientY));
    },
    { passive: true },
  );

  // Tilt the phone and the cloud turns with it. Android hands orientation
  // over freely; iOS asks first, so there the visitor opts in with a button.
  const gyroBtn = document.querySelector<HTMLButtonElement>('[data-gyro]');
  const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  const listenTilt = () => {
    let base: number | null = null;
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;
      base ??= e.beta;
      scene?.setTilt(e.gamma / 30, (e.beta - base) / 30);
    });
  };
  if (!reduced && DOE) {
    if (typeof DOE.requestPermission === 'function') {
      if (gyroBtn) {
        gyroBtn.hidden = false;
        gyroBtn.addEventListener('click', async () => {
          try {
            if ((await DOE.requestPermission!()) === 'granted') {
              listenTilt();
              buzz(10);
              gyroBtn.dataset.state = 'linked';
              gyroBtn.querySelector('span')!.textContent = 'Motion sensor linked';
              scramble(gyroBtn.querySelector('span')!, 0.5);
              scene?.pulse(0, 0.2);
            }
          } catch {}
        });
      }
    } else {
      listenTilt();
    }
  }
}

/* ── Mobile menu ─────────────────────────────────────────────────────── */

const menu = document.querySelector<HTMLElement>('#menu');
const menuBtn = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');

if (menu && menuBtn) {
  const words = menu.querySelectorAll<HTMLElement>('[data-menu-word]');
  const label = menuBtn.querySelector<HTMLElement>('.dock-menu-label');
  let open = false;

  const setMenu = (next: boolean) => {
    if (next === open) return;
    open = next;
    root.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    if (label) label.textContent = open ? 'Close' : 'Menu';
    buzz(8);
    gsap.killTweensOf(menu);
    if (open) {
      menu.inert = false;
      lenis?.stop();
      gsap.set(menu, { visibility: 'visible' });
      gsap.to(menu, { clipPath: 'inset(0% 0% 0% 0%)', duration: reduced ? 0 : 0.75, ease: 'expo.out' });
      if (!reduced) {
        gsap.fromTo(words, { yPercent: 110 }, { yPercent: 0, duration: 0.9, ease: EASE_OUT, stagger: 0.06, delay: 0.12 });
        words.forEach((w, i) => gsap.delayedCall(0.12 + i * 0.06, () => scramble(w, 0.5)));
      }
      menu.querySelector<HTMLElement>('a')?.focus({ preventScroll: true });
    } else {
      menu.inert = true;
      lenis?.start();
      gsap.to(menu, {
        clipPath: 'inset(100% 0% 0% 0%)',
        duration: reduced ? 0 : 0.55,
        ease: 'expo.inOut',
        onComplete: () => gsap.set(menu, { visibility: 'hidden' }),
      });
    }
  };

  menuBtn.addEventListener('click', () => setMenu(!open));
  // Capture phase, so smooth scrolling is back on before the link asks for it.
  menu.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) setMenu(false);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      setMenu(false);
      menuBtn.focus();
    }
  });
  window.matchMedia('(max-width: 767px)').addEventListener('change', (e) => {
    if (!e.matches) setMenu(false);
  });
}
