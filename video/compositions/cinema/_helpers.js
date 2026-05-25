/* Shared helpers for all cinema/* sub-compositions.
   Each beat calls cinemaSetup(rootSel, timelineId) to get back a configured
   timeline + helper bag bound to that beat's root selector. */

window.__cinema = window.__cinema || {};

window.__cinema.splitRows = function(root) {
  document.querySelectorAll(root + ' .kinetic-row[data-text]').forEach(row => {
    const raw = row.dataset.text;
    const tokens = raw.split(/(\s+|<\w+>[^<]*<\/\w+>)/).filter(t => t.length > 0);
    row.innerHTML = '';
    tokens.forEach(tok => {
      if (/^\s+$/.test(tok)) { row.appendChild(document.createTextNode(tok)); return; }
      const m = tok.match(/^<(\w+)>(.*)<\/\w+>$/);
      if (m) {
        const tag = m[1], content = m[2];
        content.split(/(\s+)/).forEach(w => {
          if (/^\s+$/.test(w) || w === '') row.appendChild(document.createTextNode(w));
          else {
            const s = document.createElement('span');
            s.className = 'kw kw-' + tag;
            s.innerHTML = w;
            row.appendChild(s);
          }
        });
      } else {
        const s = document.createElement('span');
        s.className = 'kw';
        s.innerHTML = tok;
        row.appendChild(s);
      }
    });
  });
};

window.__cinema.setup = function(rootSel, timelineId) {
  window.__cinema.splitRows(rootSel);
  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.out' } });
  window.__timelines[timelineId] = tl;

  const R = rootSel;

  /* Per-word stagger entrance with spring overshoot */
  function kineticIn(time, sel, baseDelay = 0, perWord = 0.045) {
    tl.set(`${R} ${sel}`, { opacity: 1 }, time);
    tl.to(`${R} ${sel} .kw`,
      { opacity: 1, y: 0, duration: 0.85, ease: 'back.out(1.7)',
        stagger: { each: perWord, from: 'start' } }, time + baseDelay);
  }
  function kineticOut(time, sel, exitY = -24) {
    tl.to(`${R} ${sel} .kw`,
      { opacity: 0, y: exitY, duration: 0.45, ease: 'power3.in',
        stagger: { each: 0.025, from: 'start' } }, time);
    tl.set(`${R} ${sel}`, { opacity: 0 }, time + 0.7);
  }
  /* Elastic pop-in for big number reveals */
  function popIn(time, sel) {
    tl.set(`${R} ${sel}`, { opacity: 1 }, time);
    tl.fromTo(`${R} ${sel} .kw`,
      { opacity: 0, scale: 0.6, y: 30 },
      { opacity: 1, scale: 1, y: 0, duration: 1.0, ease: 'elastic.out(0.9, 0.55)',
        stagger: { each: 0.07, from: 'center' } }, time);
  }
  /* Wipe with anticipation pull-back + overshoot */
  function wipeOver(time, wipeSel, fromBg, toBg) {
    tl.set(`${R} ${wipeSel}`, { opacity: 1, scale: 0 }, time);
    tl.to(`${R} ${wipeSel}`, { scale: 0.18, duration: 0.18, ease: 'power2.out' }, time);
    tl.to(`${R} ${wipeSel}`, { scale: 28, duration: 0.55, ease: 'power4.in' }, time + 0.18);
    if (fromBg && toBg) {
      tl.set(`${R} ${fromBg}`, { opacity: 0 }, time + 0.65);
      tl.set(`${R} ${toBg}`,   { opacity: 1 }, time + 0.65);
    }
    tl.to(`${R} ${wipeSel}`, { scale: 32, duration: 0.18, ease: 'power1.out' }, time + 0.73);
    tl.to(`${R} ${wipeSel}`, { opacity: 0, duration: 0.45, ease: 'power2.out' }, time + 0.85);
  }
  /* Cursor with tilt + overshoot */
  function cursorArc(time, x, y, duration = 1.1, tiltDeg = 0) {
    tl.to(`${R} #cursor, ${R} .cursor`,
      { left: x, top: y, rotation: tiltDeg, duration, ease: 'back.out(1.3)' }, time);
    tl.to(`${R} #cursor, ${R} .cursor`,
      { rotation: 0, duration: 0.4, ease: 'back.out(2)' }, time + duration);
  }
  /* Click with anticipation pull-back + push overshoot */
  function cursorClick(time, x, y, rippleSel) {
    tl.to(`${R} #cursor, ${R} .cursor`,
      { scale: 0.92, duration: 0.12, ease: 'power2.in', transformOrigin: '16px 12px' }, time);
    tl.to(`${R} #cursor, ${R} .cursor`,
      { scale: 1.06, duration: 0.18, ease: 'back.out(2.5)' }, time + 0.12);
    tl.to(`${R} #cursor, ${R} .cursor`,
      { scale: 1.0, duration: 0.22, ease: 'power2.out' }, time + 0.30);
    if (rippleSel) {
      tl.set(`${R} ${rippleSel}`, { left: x, top: y, opacity: 0.95, scale: 0.5 }, time + 0.20);
      tl.to(`${R} ${rippleSel}`,  { scale: 4.2, opacity: 0, duration: 0.85, ease: 'power3.out' }, time + 0.20);
    }
  }
  /* Stage zoom toward (x,y) with breathing during hold */
  function zoomStage(time, x, y, scale = 1.32, hold = 1.2, stageSel = '.stage') {
    tl.set(`${R} ${stageSel}`, { transformOrigin: `${x}px ${y}px` }, time);
    tl.to(`${R} ${stageSel}`,  { scale, duration: 0.55, ease: 'power2.out' }, time);
    tl.to(`${R} ${stageSel}`,
      { scale: scale * 1.015, duration: hold * 0.5, ease: 'sine.inOut', yoyo: true, repeat: 1 },
      time + 0.55);
    tl.to(`${R} ${stageSel}`,  { scale: 1, duration: 0.65, ease: 'power2.inOut' }, time + 0.55 + hold);
  }
  function swapScreen(time, fromSel, toSel) {
    tl.to(`${R} ${fromSel}`, { opacity: 0, duration: 0.32 }, time);
    tl.to(`${R} ${toSel}`,   { opacity: 1, duration: 0.32 }, time);
  }

  return { tl, kineticIn, kineticOut, popIn, wipeOver, cursorArc, cursorClick, zoomStage, swapScreen };
};

/* Hand cursor SVG template */
window.__cinema.cursorSvg = `<svg width="64" height="80" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
  <path d="M9 4 v15 l-2 -1 q-3 -1.5 -4 1 v3 q0 1.5 1 3 l5 8 q1 2 3 2 h10 q2 0 3 -2 l2 -7 q0.5 -2 0.5 -4 v-4 q0 -2 -2 -2 t-2 2 v-2 q0 -2 -2 -2 t-2 2 v-2 q0 -2 -2 -2 t-2 2 v-9 q0 -2 -2 -2 t-2 2 z"
        fill="#ffffff" stroke="#1a1a1f" stroke-width="2" stroke-linejoin="round"/>
</svg>`;

/* Triagent mark SVG (for intro/outro) */
window.__cinema.triagentMark = function(size = 84) {
  const inner = Math.round(size * 0.55);
  return `<div style="width:${size}px;height:${size}px;border-radius:${Math.round(size*0.27)}px;background:linear-gradient(135deg,#b380ff,#7c3aed);display:flex;align-items:center;justify-content:center;box-shadow:0 10px 30px rgba(162,89,255,0.25);">
    <svg width="${inner}" height="${inner}" viewBox="0 0 32 32" fill="none">
      <path d="M16 4L26 22H6L16 4Z" stroke="white" stroke-width="2.4" stroke-linejoin="round"/>
      <circle cx="16" cy="18" r="2.5" fill="white"/>
    </svg>
  </div>`;
};
