/* =========================================================
   THE PERFECT PICTURE — main game logic
   ========================================================= */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const C = World.C;

  // ======== BALANCE CONFIG ========
  const CFG = {
    RATE: 0.5,            // game minutes per real second (11 h ≈ 22 real minutes)
    START: 360, END: 1020,
    REACH: 2.7, WALK: 2.8, RUN: 4.8, EYE: 1.55, RAD: 0.27,
    OVEN_SEC: 30, OVEN_TIMEWARP: 3,
    WRONG_DAY_CHANCE: 0.02, BURN_CHANCE: 0.30, CLUMSY_CHANCE: 0.07,
    BAG_CAP: 10, KBIN_CAP: 12,
    SCRUB_PER_PX: 0.0017, SCRUB_HOLD: 0.22, SWEEP_RATE: 0.75,
  };
  const ROOM_W = { LV: 20, KT: 20, DN: 15, HW: 10, BA: 15, PB: 20 };
  const ROOM_NAME = { LV: 'Living Room', KT: 'Kitchen', DN: 'Dining Room', HW: 'Hallway & Foyer', BA: 'Bathroom', PB: "Parents' Bedroom" };
  const TOOL_INFO = { rag: { name: 'Rag', icon: '🧽' }, broom: { name: 'Broom', icon: '🧹' }, mop: { name: 'Mop', icon: '🧼' }, bag: { name: 'Trash bag', icon: '🗑️' } };
  const DEST_ICON = { trash: '🗑️', laundry: '👕', mail: '✉️', book: '📕', pillow: '🛋️', box: '📦', shoes: '👟', towel: '🧺', dishes: '🍽️', plates: '🍽️', kbag: '🛍️', cake: '🎂' };
  const DEST_HINT = { trash: 'a trash bin (kitchen / outside)', laundry: 'the laundry basket (Laundry)', mail: 'the mail tray (Foyer)', book: 'the bookshelf (Living Room)', pillow: 'the couch', box: 'the hallway closet', shoes: 'the shoe rack (Foyer)', towel: 'the towel rack (Bathroom)', dishes: 'the kitchen sink', plates: 'the dining table', kbag: 'the bins OUTSIDE (back door)', cake: 'the dining table' };
  const FLAT = {   // how tools lie on the floor after being dropped (local parts)
    broom: [{ o: [0, 0.02, 0], s: [0.035, 0.035, 1.1] }, { o: [0, 0.06, 0.55], s: [0.34, 0.12, 0.1] }],
    mop: [{ o: [0, 0.02, 0], s: [0.035, 0.035, 1.1] }, { o: [0, 0.05, 0.55], s: [0.32, 0.1, 0.18] }],
    rag: [{ o: [0, 0.015, 0], s: [0.3, 0.03, 0.3] }],
    bag: [{ o: [0, 0.1, 0], s: [0.26, 0.2, 0.2] }],
  };
  const FLATCOL = { broom: [0x9a7040, 0xc8a040], mop: [0x8a8a90, 0xd8d4c8], rag: [0xd0a050], bag: [0x1d1d1f] };
  // ======== SAVE ========
  const SAVE_KEY = 'theperfectpicture_save_en_v2';
  function defaultSave() { return { endings: {}, badCount: 0, sadUnlocked: false, phase2: false, warned: false, settings: { sens: 1, invert: false, speed: 1, vol: 0.7, easter: false, quality: 'auto', fov: 75, grain: true, aa: false } }; }
  function loadSave() {
    const d = defaultSave();
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); Object.assign(d, s); d.settings = Object.assign(defaultSave().settings, s.settings || {}); } catch (e) { }
    return d;
  }
  let save = loadSave();
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { } }
  const endingCount = () => Object.keys(save.endings).length;

  // ======== STATE ========
  let MODE = 'menu';
  let S = null;
  const P = { x: 14.5, z: 3.2, level: 0, yaw: 0, pitch: 0, bob: 0, step: 0, moving: false, running: false };
  let camOverride = null, MODELS = [], ENT = [], OVERLAY = [];
  const keys = {};
  let locked = false, ignoreUnlock = false, envClock = 0, target = null, using = null, mouseDown = false, swing = 0;
  let CLOCKS = [], CATCH = [];
  const DC = {};

  function applyQuality() {
    const q = save.settings.quality;
    const map = { low: { scale: 0.6, maxScale: 0.6, lights: 4, auto: false }, medium: { scale: 0.85, maxScale: 0.85, lights: 6, auto: false }, high: { scale: 1, maxScale: 1, lights: 8, auto: false }, auto: { scale: 0.8, maxScale: 1, lights: 6, auto: true } };
    Engine.setQuality(map[q] || map.auto);
    $('grain').style.display = save.settings.grain ? '' : 'none';
  }

  // ======== MODEL HELPERS ========
  function pt(x1, y1, z1, x2, y2, z2, col, pat, extra) {
    return Object.assign({ o: [(x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2], s: [x2 - x1, y2 - y1, z2 - z1], c: col, pat: pat || 0 }, extra || {});
  }
  // parts given in WORLD coords -> model with pos at bottom-centre
  function normParts(m, parts) {
    let mnx = 1e9, mxx = -1e9, mny = 1e9, mnz = 1e9, mxz = -1e9;
    for (const p of parts) { mnx = Math.min(mnx, p.o[0] - p.s[0] / 2); mxx = Math.max(mxx, p.o[0] + p.s[0] / 2); mny = Math.min(mny, p.o[1] - p.s[1] / 2); mnz = Math.min(mnz, p.o[2] - p.s[2] / 2); mxz = Math.max(mxz, p.o[2] + p.s[2] / 2); }
    if (!parts.length) { m.parts = []; m.dirty = true; return m; }
    m.pos = [(mnx + mxx) / 2, mny, (mnz + mxz) / 2];
    m.parts = parts.map(p => Object.assign({}, p, { o: [p.o[0] - m.pos[0], p.o[1] - m.pos[1], p.o[2] - m.pos[2]] }));
    m.dirty = true; return m;
  }
  function mw(parts, extra) { const m = Object.assign({ pos: [0, 0, 0], rotY: 0, visible: true, parts: [], indoor: true }, extra || {}); normParts(m, parts); MODELS.push(m); return m; }
  function ghost(x1, y1, z1, x2, y2, z2) { return mw([pt(x1, y1, z1, x2, y2, z2, [1, 1, 1])], { visible: false, ghost: true }); }
  function setPartsW(m, parts) { normParts(m, parts); }
  function aabb(m) {
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; const sc = m.scale || 1;
    for (const p of m.parts) for (let i = 0; i < 3; i++) { const c = m.pos[i] + p.o[i] * sc, h = p.s[i] * sc / 2; mn[i] = Math.min(mn[i], c - h); mx[i] = Math.max(mx[i], c + h); }
    for (let i = 0; i < 3; i++) if (mx[i] - mn[i] < 0.2) { const c = (mn[i] + mx[i]) / 2; mn[i] = c - 0.1; mx[i] = c + 0.1; }
    return [mn, mx];
  }
  function rayParts(m, o, d) {
    const sc = m.scale || 1; let best = null;
    for (const p of m.parts) {
      const mn = [], mx = [];
      for (let i = 0; i < 3; i++) { const c = m.pos[i] + p.o[i] * sc, h = Math.max(p.s[i] * sc / 2, 0.06); mn.push(c - h); mx.push(c + h); }
      const t = rayBox(o, d, mn, mx); if (t != null && (best == null || t < best)) best = t;
    }
    return best;
  }
  function rayBox(o, d, mn, mx) {
    let tmin = 0, tmax = 1e9;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-8) { if (o[i] < mn[i] || o[i] > mx[i]) return null; }
      else { let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i]; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; } tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return null; }
    }
    return tmin;
  }

  // ======== UI BASICS ========
  function show(id, on) { const el = $(id); if (el) el.classList.toggle('hidden', !on); }
  const isShown = id => !$(id).classList.contains('hidden');
  function fmtTime(m) { m = Math.floor(m) % 1440; const h = Math.floor(m / 60), mi = m % 60; const ap = h >= 12 ? 'PM' : 'AM'; let hh = h % 12; if (hh === 0) hh = 12; return hh + ':' + String(mi).padStart(2, '0') + ' ' + ap; }
  function notify(text, ms) {
    const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = text; $('toasts').appendChild(d);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => d.classList.add('out'), ms || 3500); setTimeout(() => d.remove(), (ms || 3500) + 600);
  }
  function setMode(m) {
    MODE = m;
    if (m !== 'play' && document.pointerLockElement) { ignoreUnlock = true; document.exitPointerLock(); }
    const playing = m === 'play';
    show('cross', playing); show('inv', playing && !!S && !S.prelude); show('minimap', playing);
    if (!playing) { show('prompt', false); show('ovenhud', false); using = null; }
    show('hud', false); show('objective', false);
    if (S) updateHUD();
    updateLockHint();
  }
  function updateLockHint() { show('lockhint', MODE === 'play' && !locked); }

  // dialogue
  let dlgResolve = null, dlgTyping = null, dlgFull = '';
  function dialog(who, text, style) {
    return new Promise(res => {
      show('dialog', true);
      $('dname').textContent = who || ''; $('dname').style.display = who ? '' : 'none';
      const el = $('dtext'); el.className = style ? 'st-' + style : ''; el.textContent = '';
      dlgFull = text; let i = 0; clearInterval(dlgTyping);
      dlgTyping = setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i % 6 === 0 && who && style !== 'narr') Sound.blip(); if (i >= text.length) { clearInterval(dlgTyping); dlgTyping = null; } }, 20);
      dlgResolve = () => { show('dialog', false); dlgResolve = null; res(); };
    });
  }
  function advanceDialog() { if (!dlgResolve) return false; if (dlgTyping) { clearInterval(dlgTyping); dlgTyping = null; $('dtext').textContent = dlgFull; return true; } dlgResolve(); return true; }
  $('dialog').addEventListener('click', advanceDialog);
  let chResolve = null;
  function choose(q, opts) {
    return new Promise(res => {
      show('choices', true); $('cq').textContent = q || ''; const list = $('clist'); list.innerHTML = '';
      opts.forEach((o, i) => { const b = document.createElement('button'); b.className = 'btn choice'; b.innerHTML = `<span class="k">${i + 1}</span> ${o}`; b.onclick = () => done(i); list.appendChild(b); });
      function done(i) { show('choices', false); chResolve = null; Sound.blip(); res(i); }
      chResolve = done; chResolve.n = opts.length;
    });
  }
  let ovResolve = null;
  function overlay(html, btn, cls) {
    return new Promise(res => {
      show('overlay', true); $('ocard').className = cls || '';
      $('ocard').innerHTML = html + (btn ? `<div class="obtns"><button class="btn" id="obtn">${btn}</button></div>` : '');
      ovResolve = () => { show('overlay', false); ovResolve = null; res(); };
      if (btn) $('obtn').onclick = ovResolve;
    });
  }
  function fade(toBlack, ms) { const f = $('fade'); f.style.transition = `opacity ${ms}ms`; f.style.opacity = toBlack ? '1' : '0'; f.style.pointerEvents = toBlack ? 'all' : 'none'; return new Promise(r => setTimeout(r, ms + 30)); }
  function setFadeText(t, s) { $('ftitle').textContent = t || ''; $('fsub').textContent = s || ''; }
  function tint(t) { $('tint').className = t ? 't-' + t : ''; }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function qte(label, sec) {
    return new Promise(res => {
      show('qte', true); $('qbtn').textContent = label + ' [E]';
      const t0 = performance.now(); let done = false;
      const fin = v => { if (done) return; done = true; show('qte', false); window.removeEventListener('keydown', kh); res(v); };
      const kh = e => { if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); fin(true); } };
      window.addEventListener('keydown', kh); $('qbtn').onclick = () => fin(true);
      (function tick() { if (done) return; const left = sec - (performance.now() - t0) / 1000; $('qtime').style.width = Math.max(0, left / sec * 100) + '%'; if (left <= 0) return fin(false); requestAnimationFrame(tick); })();
    });
  }

  // ======== DAD ========
  let dadModel = null;
  function showDad(o) {
    const d = World.person({ shirt: C(0x4d5a6e), pants: C(0x2b2d33), beard: true, sit: o.sit, x: o.x, y: o.y || 0, z: o.z, rot: o.rot || 0 });
    if (!dadModel) { dadModel = d; MODELS.push(dadModel); } else { dadModel.parts = d.parts; dadModel.pos = d.pos; dadModel.rotY = d.rotY; dadModel.dirty = true; }
    dadModel.visible = true;
  }
  function hideDad() { if (dadModel) dadModel.visible = false; }

  const G = {
    say: (w, t) => dialog(w, t), narr: t => dialog('', t, 'narr'), think: t => dialog('You (thinking)', t, 'think'),
    choose, wait, fade, tint, overlay, qte, notify,
    sfx: n => Sound[n] && Sound[n](), mood: m => Sound.setMood(m),
    look: (e, t) => { camOverride = { eye: e, target: t }; }, dad: showDad, hideDad,
    placePlayerForArrival() { camOverride = { eye: [2.5, 1.5, 15.6], target: [2.5, 1.45, 19.2] }; },
    showPhoto(drawn) { const p = overlay(`<h2 class="ot">The family photo</h2><canvas id="phc" width="480" height="360"></canvas>`, 'Continue', 'photo'); drawPhoto($('phc'), S.pieces, drawn ? S.drawing : null, true); return p; },
  };
  async function runScene(fn) {
    const prev = MODE; setMode('cutscene');
    try { await fn(); } catch (e) { reportErr(e); }
    if (S && !S.ended && MODE === 'cutscene') { camOverride = null; setMode(prev === 'cutscene' ? 'play' : prev); }
  }

  // ======== FAMILY PHOTO (canvas) ========
  const CELL = { 2: [0, 0], 3: [0, 1], 4: [0, 2], 5: [0, 3], 7: [1, 0], 6: [1, 1], 8: [1, 2], 9: [1, 3], 10: [2, 0], 1: [2, 1], 11: [2, 2], 12: [2, 3] };
  let basePhoto = null;
  function figure(c, x, headY, r, shirt, pants, hair, isMom, s) {
    c.fillStyle = pants; c.fillRect(x - 22 * s, headY + r + 95 * s, 18 * s, 70 * s); c.fillRect(x + 4 * s, headY + r + 95 * s, 18 * s, 70 * s);
    c.fillStyle = shirt; c.fillRect(x - 28 * s, headY + r - 2, 56 * s, 100 * s);
    if (isMom) { c.beginPath(); c.moveTo(x - 30 * s, headY + r + 60 * s); c.lineTo(x + 30 * s, headY + r + 60 * s); c.lineTo(x + 40 * s, headY + r + 130 * s); c.lineTo(x - 40 * s, headY + r + 130 * s); c.fill(); }
    c.fillStyle = hair; if (isMom) { c.beginPath(); c.ellipse(x, headY + 8, r + 7, r + 22, 0, 0, 7); c.fill(); }
    c.fillStyle = '#e8b48e'; c.beginPath(); c.arc(x, headY, r, 0, 7); c.fill();
    c.fillStyle = hair; c.beginPath(); c.arc(x, headY - 6, r + 1, Math.PI * 1.05, Math.PI * 1.95); c.fill();
    c.fillStyle = '#2a1a10'; c.beginPath(); c.arc(x - r * 0.35, headY - 2, 2.8, 0, 7); c.arc(x + r * 0.35, headY - 2, 2.8, 0, 7); c.fill();
    c.strokeStyle = '#8a3a2a'; c.lineWidth = 2.2; c.beginPath(); c.arc(x, headY + r * 0.2, r * 0.45, 0.2, Math.PI - 0.2); c.stroke();
    if (isMom) { c.fillStyle = 'rgba(230,120,120,.45)'; c.beginPath(); c.arc(x - r * 0.55, headY + r * 0.25, 5, 0, 7); c.arc(x + r * 0.55, headY + r * 0.25, 5, 0, 7); c.fill(); }
  }
  function paintBase() {
    const cv = document.createElement('canvas'); cv.width = 480; cv.height = 360; const c = cv.getContext('2d');
    let g = c.createLinearGradient(0, 0, 0, 160); g.addColorStop(0, '#7fb8e6'); g.addColorStop(1, '#cfe6f2'); c.fillStyle = g; c.fillRect(0, 0, 480, 160);
    c.fillStyle = '#fff3c0'; c.beginPath(); c.arc(410, 55, 26, 0, 7); c.fill();
    c.fillStyle = '#fff'; [[70, 50], [250, 35], [330, 80]].forEach(([x, y]) => { c.beginPath(); c.ellipse(x, y, 34, 12, 0, 0, 7); c.fill(); });
    g = c.createLinearGradient(0, 150, 0, 225); g.addColorStop(0, '#3d7fae'); g.addColorStop(1, '#6fb0c9'); c.fillStyle = g; c.fillRect(0, 150, 480, 75);
    c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 2; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(i * 90, 200 + (i % 2) * 8); c.quadraticCurveTo(i * 90 + 40, 192, i * 90 + 80, 202); c.stroke(); }
    g = c.createLinearGradient(0, 220, 0, 360); g.addColorStop(0, '#e9d39c'); g.addColorStop(1, '#d4b77a'); c.fillStyle = g; c.fillRect(0, 220, 480, 140);
    figure(c, 95, 112, 30, '#4d6a8e', '#2b2d33', '#5a3b28', false, 1.0);
    figure(c, 185, 168, 28, '#d36a7a', '#e9e2d6', '#3a2418', true, 0.92);
    figure(c, 285, 222, 22, '#f0c23a', '#3b5a8a', '#3a2418', false, 0.7);
    c.strokeStyle = '#4d6a8e'; c.lineWidth = 12; c.lineCap = 'round'; c.beginPath(); c.moveTo(118, 175); c.quadraticCurveTo(150, 190, 170, 215); c.stroke();
    c.strokeStyle = '#d36a7a'; c.lineWidth = 11; c.beginPath(); c.moveTo(205, 225); c.lineTo(226, 288); c.stroke();
    c.strokeStyle = '#f0c23a'; c.lineWidth = 9; c.beginPath(); c.moveTo(270, 262); c.lineTo(238, 290); c.stroke();
    c.fillStyle = '#e8b48e'; c.beginPath(); c.arc(229, 292, 9, 0, 7); c.fill(); c.beginPath(); c.arc(239, 293, 7, 0, 7); c.fill();
    c.fillStyle = '#e34'; c.beginPath(); c.arc(395, 300, 22, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(395, 300, 22, -0.6, 0.6); c.lineTo(395, 300); c.fill();
    c.fillStyle = '#36c'; c.beginPath(); c.arc(395, 300, 22, 1.5, 2.6); c.lineTo(395, 300); c.fill();
    c.font = 'italic 13px Georgia'; c.fillStyle = 'rgba(80,60,40,.7)'; c.fillText('Summer 2021 ♡', 360, 350);
    basePhoto = cv;
  }
  function drawPhoto(cv, pieces, drawnImg, taped) {
    if (!basePhoto) paintBase();
    const c = cv.getContext('2d'); c.fillStyle = '#1a1614'; c.fillRect(0, 0, 480, 360);
    for (const k in CELL) {
      const n = +k, [r, col] = CELL[n], x = col * 120, y = r * 120, has = pieces.has(n), useDraw = n === 6 && !has && drawnImg;
      if (!has && !useDraw) { c.strokeStyle = 'rgba(255,255,255,.08)'; c.setLineDash([4, 4]); c.strokeRect(x + 4, y + 4, 112, 112); c.setLineDash([]); c.fillStyle = 'rgba(255,255,255,.18)'; c.font = '14px sans-serif'; c.fillText('#' + n, x + 50, y + 65); continue; }
      c.save(); const jit = i => ((n * 13 + i * 7) % 5) - 2; c.beginPath();
      c.moveTo(x + 2 + jit(1), y + 2); c.lineTo(x + 40, y + 1 + jit(2)); c.lineTo(x + 80, y + 3 + jit(3)); c.lineTo(x + 118 + jit(4), y + 2); c.lineTo(x + 117, y + 60 + jit(5));
      c.lineTo(x + 118 + jit(6), y + 118); c.lineTo(x + 60, y + 117 + jit(7)); c.lineTo(x + 2, y + 118 + jit(8)); c.lineTo(x + 3 + jit(9), y + 60); c.closePath(); c.clip();
      if (useDraw) { c.fillStyle = 'rgba(245,240,230,.95)'; c.fillRect(x, y, 120, 120); c.drawImage(drawnImg, x, y, 120, 120); }
      else c.drawImage(basePhoto, x, y, 120, 120, x, y, 120, 120);
      c.restore();
      if (taped) { c.fillStyle = 'rgba(255,250,220,.35)'; c.fillRect(x + 100, y + 40, 26, 10); c.fillRect(x + 40, y + 108, 10, 22); }
    }
  }

  // ======== RUN SETUP ========
  function initColliders() {
    DC.table = World.addCol(13.75, 13.6, 15.25, 15.9, { y2: 0.78 });
    DC.coffee = World.addCol(7.6, 11.4, 9.2, 12.2, { y2: 0.42 });
    DC.bookshelf = World.addCol(0.08, 14.4, 0.5, 16.3, { y2: 1.9 });
    DC.closet = World.addCol(0.08, 7.3, 0.9, 9.3, { y2: 2.2 });
    DC.dadStand = World.addCol(1.9, 0.3, 2.5, 0.8, { y2: 0.55 });
    DC.momStand = World.addCol(5.5, 0.3, 6.1, 0.8, { y2: 0.55 });
    DC.toilet = World.addCol(11.3, 1.2, 11.9, 1.95, { y2: 0.8 });
    DC.kbin = World.addCol(25.05, 16.05, 25.55, 16.55, { y2: 0.8 });
    DC.outbin = World.addCol(26.95, 11.6, 27.75, 13.3, { y2: 1.1 });
    DC.basket = World.addCol(6.75, 19.05, 7.35, 19.6, { y2: 0.5 });
    DC.grave = World.addCol(37.75, -1.4, 38.65, -1.2, { y2: 1.3 });
    DC.officeDoor = World.addCol(18.6, 6.9, 19.7, 7.1, { y2: 2.15 });
    DC.bush1 = World.addCol(34.6, 1.8, 40, 2.9, { y2: 1.6 });
    DC.bush2 = World.addCol(34.6, -3, 35.6, 2.0, { y2: 1.6 });
    DC.roofBoxes = World.addCol(11.0, 5.4, 11.6, 6.0, { lvl: 1, y1: 3, y2: 3.6 });
  }

  function newRun(opts) {
    for (const m of MODELS) Engine.freeModel(m);
    for (const m of OVERLAY) Engine.freeModel(m);
    MODELS = []; ENT = []; OVERLAY = []; CLOCKS = []; CATCH = []; dadModel = null; using = null; target = null;
    World.setSeed(77);
    S = {
      time: 180, ended: false, prelude: !!(opts && opts.prelude), phase2: save.phase2 && !(opts && opts.prelude),
      early: false, dadLeft: false, talks: 0, warned: false, busy: null, flags: {}, seen: {},
      cake: { stage: 'none', ing: -1, mix: 0, bake: 0, late: 0, quality: null, msg: '', placed: false, burnt: false },
      oven: null, pieces: new Set(), hasCrayons: false, drawing: null, assembled: false, hung: false, boxesPlaced: false,
      smoke: [], fireLevel: 0, inv: { slots: [null, null, null], sel: 0 }, kbin: 6,
    };
    if (S.phase2) S.pieces.add(1);
    buildWorld();
    buildHeldModels();
    updateInv();
  }

  // ---- entity helpers ----
  function E(def) { def.done = false; ENT.push(def); return def; }
  function done(id) { const e = ENT.find(x => x.id === id); return !!(e && e.done); }
  function countDone(prefix) { let n = 0; for (const e of ENT) if (e.id && e.id.startsWith(prefix) && e.done) n++; return n; }
  function countAll(prefix) { let n = 0; for (const e of ENT) if (e.id && e.id.startsWith(prefix)) n++; return n; }
  function roomPct(r) {
    let t = 0, d = 0;
    for (const e of ENT) { if (!e.w || e.room !== r) continue; t += e.w; if (e.done) d += e.w; else if (e.amount != null) d += e.w * (1 - e.amount) * 0.9; }
    return t ? d / t : 0;
  }
  function housePct() { let s = 0; for (const r in ROOM_W) s += roomPct(r) * ROOM_W[r]; return s / 100; }
  function spend(min) { if (S && !S.prelude) S.time += min; }

  function carry(def) { def.kind = 'carry'; return E(def); }
  function dest(def) { def.kind = 'dest'; def.filled = def.filled || 0; if (def.catchBox) CATCH.push(def); return E(def); }
  function scrub(def) { def.kind = 'scrub'; def.amount = def.amount == null ? 1 : def.amount; def.hard = def.hard || 1; return E(def); }
  function sweep(def) { def.kind = 'sweep'; def.amount = 1; return E(def); }
  function act(def) { def.kind = 'act'; return E(def); }

  function dirtPatch(id, room, x, z, size, col, kind) {
    const s = size || (0.35 + World.rnd() * 0.35), parts = [];
    const c = col || C(0x3b2f24);
    parts.push(pt(x - s / 2, 0.003, z - s / 2, x + s / 2, 0.011, z + s / 2, c, 16));
    for (let i = 0; i < 4; i++) { const dx = (World.rnd() - 0.5) * s, dz = (World.rnd() - 0.5) * s, q = 0.04 + World.rnd() * 0.06; parts.push(pt(x + dx - q, 0.003, z + dz - q, x + dx + q, 0.03, z + dz + q, c)); }
    const m = mw(parts);
    const w = kind === 'mop' ? 2 : 1.5;
    if (kind === 'mop') return scrub({ id, room, w, model: m, tool: 'mop', name: 'stain', decal: true, hard: 1.2 });
    return sweep({ id, room, w, model: m, name: 'dirt' });
  }
  function freeSpot(x1, z1, x2, z2, avoid) {
    for (let k = 0; k < 50; k++) { const x = x1 + World.rnd() * (x2 - x1), z = z1 + World.rnd() * (z2 - z1); if (!avoid.some(a => x > a[0] - 0.2 && x < a[2] + 0.2 && z > a[1] - 0.2 && z < a[3] + 0.2)) return [x, z]; }
    return [x1, z1];
  }
  const M = {};

  // ======================================================
  //                 BUILD ALL INTERACTABLES
  // ======================================================
  function buildWorld() {
    const WOOD = C(0x6b4a33), WOOD_D = C(0x47301f), METAL = C(0x9aa0a6), WHITE = C(0xeae6dc);
    const GRIME = C(0x6a5a3a), DUSTC = C(0x8a867c);

    // ---------- YOUR ROOM ----------
    M.bed = ghost(12.2, 0, 0.3, 13.6, 0.6, 2.5);
    act({
      model: M.bed, label: () => S.prelude ? null : (S.time < 360 ? 'Sleep until 6:00 AM' : 'Sleep until Dad comes home (skip to 5 PM)'),
      act: async () => {
        if (S.time < 360) return runScene(async () => { await fade(true, 600); S.time = 360; await wait(300); await fade(false, 600); });
        let ok; await runScene(async () => { ok = await choose('Sleep until Dad comes home? The whole day will pass.', ['Sleep', 'Not yet']); });
        if (ok === 0) skipTo(CFG.END);
      }
    });
    M.drawer = ghost(16.2, 0.45, 0.78, 17.0, 0.7, 0.86);
    act({ model: M.drawer, label: () => (S.phase2 && S.pieces.size >= 8 && S.pieces.size <= 10 && !S.flags.hoard) ? 'Hide the photo pieces in the drawer' : null,
      act: () => runScene(async () => { const i = await choose("Hide the pieces? Dad will never know.", ['Hide them — they\'re mine', 'No']); if (i === 0) { S.flags.hoard = true; Sound.paper(); await G.think("These are mine. I won't let Dad destroy them again."); } }) });
    M.crayons = mw([pt(17.0, 0.78, 0.3, 17.3, 0.82, 0.5, C(0xd84b3b)), pt(17.02, 0.82, 0.32, 17.28, 0.84, 0.48, C(0xf0c23a))]);
    M.crayons._vis = () => S.phase2 && !S.hasCrayons;
    act({ model: M.crayons, label: () => (S.phase2 && !S.hasCrayons) ? 'Take the crayons' : null, act: () => { S.hasCrayons = true; Sound.pick(); notify('🖍 You took the box of crayons.'); } });
    M.gameboy = mw([pt(13.85, 0, 2.75, 14.0, 0.04, 2.98, C(0x9aa0a0)), pt(13.88, 0.04, 2.78, 13.97, 0.045, 2.86, C(0x6a8a4a), 0, { em: 1 })]);
    act({ model: M.gameboy, label: () => S.prelude ? null : 'Your old Game Boy',
      act: async () => { let i; await runScene(async () => { await G.say('You', 'Oh! I forgot I had this!'); i = await choose(S.phase2 ? `Play games? You still need to find ${12 - S.pieces.size} more pieces.` : 'Play games? (This will take time)', ['Play', 'Keep working']); }); if (i === 0) gameboyRoute(); } });
    M.preludePiece = mw([pt(15.9, 0.78, 0.4, 16.12, 0.8, 0.58, C(0xfff4d0), 0, { em: 1 })]);
    M.preludePiece._vis = () => S.prelude && !S.flags.gotPiece;
    act({ model: M.preludePiece, label: () => (S.prelude && !S.flags.gotPiece) ? 'A glowing photo piece...' : null, act: () => runScene(async () => { S.flags.gotPiece = true; await Story.phase2Piece(G); }) });

    // ---------- STORAGE: TOOLS ----------
    const tool = (id, t, parts, name) => carry({ id, model: mw(parts), name, tool: t, dest: null, bagCount: 0 });
    tool('tool_broom', 'broom', [pt(20.62, 0.05, 7.22, 20.68, 1.4, 7.28, C(0x9a7040)), pt(20.45, 0, 7.18, 20.85, 0.28, 7.34, C(0xc8a040), 7)], 'broom');
    tool('tool_mop', 'mop', [pt(21.22, 0.05, 7.22, 21.28, 1.4, 7.28, C(0x8a8a90)), pt(21.08, 0, 7.15, 21.42, 0.2, 7.35, C(0xd8d4c8), 7)], 'mop');
    mw([pt(21.0, 0, 7.5, 21.5, 0.35, 8.0, C(0x3a6ab0), 13)]);   // mop bucket (decor)
    tool('tool_rag', 'rag', [pt(21.8, 1.2, 7.12, 22.15, 1.55, 7.16, C(0xd0a050), 7)], 'cleaning rag');
    tool('tool_bag', 'bag', [pt(22.6, 1.25, 7.15, 22.9, 1.45, 7.35, C(0x1d1d1f), 13), pt(22.62, 1.27, 7.35, 22.88, 1.43, 7.36, C(0xf0c040))], 'trash bag');

    // ---------- CLOCKS ----------
    const clock = (cx, cy, cz, yaw, big) => {
      const R = big ? 0.24 : 0.2;
      const face = mw([pt(-R, -R, -0.005, R, R, 0.005, C(0xf2ead6), 0)], {}); face.parts[0].o = [0, 0, 0]; face.pos = [cx, cy, cz]; face.rotY = yaw;
      const ticks = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ticks.push({ o: [Math.sin(a) * R * 0.82, Math.cos(a) * R * 0.82, 0.006], s: [0.018, i % 3 ? 0.03 : 0.05, 0.004], c: C(0x222222) }); }
      const tk = mw([]); tk.parts = ticks; tk.dirty = true; tk.pos = [cx, cy, cz]; tk.rotY = yaw; tk.roll = 1e-6;
      const hh = mw([]); hh.parts = [{ o: [0, R * 0.25, 0.012], s: [0.025, R * 0.5, 0.006], c: C(0x1a1a1a) }]; hh.dirty = true; hh.pos = [cx, cy, cz]; hh.rotY = yaw;
      const mh = mw([]); mh.parts = [{ o: [0, R * 0.36, 0.016], s: [0.014, R * 0.72, 0.006], c: C(0x1a1a1a) }]; mh.dirty = true; mh.pos = [cx, cy, cz]; mh.rotY = yaw;
      const c = { face, hh, mh, x: cx, z: cz }; CLOCKS.push(c);
      act({ model: face, label: () => 'Check the clock', act: () => { const left = Math.max(0, CFG.END - S.time); Sound.tick(1); notify(`🕰 The clock says <b>${fmtTime(S.time)}</b>${S.time < CFG.END ? ` — Dad gets home at 5:00 PM (${Math.floor(left / 60)}h ${Math.floor(left % 60)}m left)` : ''}`, 4500); } });
      return c;
    };
    const gc = clock(8.8, 1.62, 8.965, Math.PI, true);
    gc.pend = mw([]); gc.pend.parts = [{ o: [0, -0.22, 0], s: [0.012, 0.44, 0.01], c: C(0xb08a40), pat: 13 }, { o: [0, -0.46, 0], s: [0.1, 0.1, 0.02], c: C(0xc8a040), pat: 13 }]; gc.pend.dirty = true; gc.pend.pos = [8.8, 1.3, 8.985]; gc.pend.rotY = Math.PI;
    clock(18.11, 2.0, 18.2, Math.PI / 2, false);

    // ---------- BATHROOM (BA) ----------
    M.sink = mw([pt(8.3, 0.85, 0.2, 9.3, 0.9, 0.65, C(0xf4f4f0), 13)], { dust: 1, dustCol: GRIME });
    scrub({ id: 'ba_sink', room: 'BA', w: 15, model: M.sink, tool: 'rag', name: 'sink' });
    M.cabinet = ghost(8.3, 1.2, 0.05, 9.3, 2.1, 0.25);
    act({ id: 'ba_cab', room: 'BA', w: 15, model: M.cabinet, label: () => done('ba_cab') ? null : 'Organize the medicine cabinet',
      act: () => runScene(async () => { Sound.clink(); spend(5); ENT.find(e => e.id === 'ba_cab').done = true; await Story.medicine(G); checkEvents(); }) });
    M.toilet = mw([pt(11.3, 0, 1.25, 11.75, 0.42, 1.9, C(0xf0f0ea), 13), pt(11.6, 0.42, 1.2, 11.9, 0.85, 1.95, C(0xf0f0ea), 13)], { dust: 1, dustCol: GRIME });
    scrub({ id: 'ba_toilet', room: 'BA', w: 20, model: M.toilet, tool: 'rag', name: 'toilet' });
    M.tub = mw([pt(10.5, 0.5, 4.9, 11.75, 0.6, 6.75, C(0xdfe8ea), 13)], { dust: 1, dustCol: GRIME });
    scrub({ id: 'ba_tub', room: 'BA', w: 20, model: M.tub, tool: 'rag', name: 'bathtub', hard: 1.6 });
    M.mirror = mw([pt(8.32, 1.22, 0.1, 9.28, 2.08, 0.115, C(0xc8d8dc), 19)], { dust: 1, dustCol: C(0x7a6a50) });
    scrub({ id: 'ba_mirror', room: 'BA', w: 10, model: M.mirror, tool: 'rag', name: 'mirror' });
    M.rack = mw([pt(11.86, 1.05, 2.5, 11.92, 1.1, 3.5, METAL, 13)]);
    dest({ id: 'ba_rack', model: M.rack, accepts: ['towel'], label: 'Hang the fresh towel', slots: [[11.82, 0.7, 3.0]], onAccept: it => { it.model.rotY = Math.PI / 2; } });
    M.dirtyTowel = mw([pt(8.8, 0, 3.6, 9.4, 0.06, 4.1, C(0x6f6a5e), 7)]);
    carry({ id: 'ba_towel_old', room: 'BA', w: 10, model: M.dirtyTowel, name: 'dirty towel', dest: 'laundry' });
    M.freshTowel = mw([pt(5.45, 0.88, 19.0, 6.25, 1.02, 19.55, C(0x7ec0f0), 7), pt(5.45, 0.95, 18.98, 6.25, 0.97, 19.0, C(0xffffff), 7)]);
    carry({ id: 'ba_towel_new', room: 'BA', w: 10, model: M.freshTowel, name: 'fresh towel', dest: 'towel' });

    // ---------- PARENTS' BEDROOM (PB) ----------
    const messyBed = () => [pt(2.65, 0.32, 0.35, 5.35, 0.52, 2.65, C(0xd8d2c6), 7),
      pt(4.05, 0.52, 0.95, 5.3, 0.6, 2.6, C(0x7a6a8a), 6), pt(4.1, 0.52, 0.38, 5.2, 0.68, 0.82, C(0xeeeeee), 6),
      pt(2.7, 0.52, 1.0, 3.6, 0.78, 1.9, C(0x2f3a5a), 7), pt(3.2, 0.52, 1.6, 4.0, 0.72, 2.6, C(0x2f3a5a), 7),
      pt(2.8, 0.52, 0.5, 3.5, 0.64, 0.9, C(0xcccccc), 7, { r: 0.4 }), pt(3.0, 0, 2.7, 3.9, 0.15, 3.2, C(0x2f3a5a), 7)];
    M.pbed = mw(messyBed());
    const bedE = act({ id: 'pb_bed', room: 'PB', w: 25, model: M.pbed, label: () => bedE.done ? null : (bedE.started ? null : 'Make the bed (tuck in all 4 corners)'), act: () => startBedCorners(bedE) });
    M.dadStand = mw([pt(1.9, 0, 0.3, 2.5, 0.55, 0.8, WOOD_D, 12)]);
    M.momStand = mw([pt(5.5, 0, 0.3, 6.1, 0.55, 0.8, WOOD, 12), pt(5.6, 0.55, 0.4, 5.9, 0.6, 0.6, C(0x8a2a2a)), pt(5.95, 0.55, 0.45, 6.05, 0.58, 0.55, C(0x222222))], { dust: 1, dustCol: DUSTC });
    scrub({ id: 'pb_mom', room: 'PB', w: 15, model: M.momStand, tool: 'rag', name: "Mom's nightstand", onDone: () => runScene(() => Story.momStand(G)) });
    M.dresserTop = mw([pt(7.2, 1.0, 3.0, 7.85, 1.02, 5.0, C(0x6b4a33), 12)], { dust: 1, dustCol: DUSTC });
    scrub({ id: 'pb_dresser', room: 'PB', w: 15, model: M.dresserTop, tool: 'rag', name: 'dresser', onDone: () => { } });
    // dad's bottles (trash)
    [[1.98, 0.38], [2.12, 0.62], [2.35, 0.42]].forEach(([x, z], i) => {
      const col = i % 2 ? C(0x5a3a1a) : C(0x2f5a2a);
      const m = mw([pt(x - 0.04, 0.55, z - 0.04, x + 0.04, 0.77, z + 0.04, col, 19), pt(x - 0.018, 0.77, z - 0.018, x + 0.018, 0.85, z + 0.018, col, 19)]);
      carry({ id: 'pb_bottle' + i, room: 'PB', w: 4, model: m, name: 'bottle', dest: 'trash', trash: true, icon: '🍾' });
    });
    [[3.2, 3.6], [6.2, 2.9], [1.6, 5.9]].forEach(([x, z], i) => {
      const m = mw([pt(x - 0.3, 0, z - 0.25, x + 0.3, 0.08, z + 0.25, C([0x4a4a5a, 0x7a6a5a, 0x5a6a7a][i]), 7, { r: i * 0.6 })]);
      carry({ id: 'pb_clothes' + i, room: 'PB', w: 5, model: m, name: 'clothes', dest: 'laundry' });
    });
    M.wallet = mw([pt(2.1, 0.55, 0.48, 2.3, 0.585, 0.62, C(0x4a2a18))]);
    M.wallet._vis = () => S.phase2 && !S.pieces.has(6) && countDone('pb_bottle') >= 3;
    act({ model: M.wallet, label: () => M.wallet._vis() ? "Dad's old wallet" : null,
      act: () => runScene(async () => { await G.think("Dad's wallet..."); S.pieces.add(6); Sound.chime(); await G.narr('(Inside, folded carefully — piece #6. Mom\'s smiling face.)'); await G.think("He kept it. He's been carrying her face with him every day."); notify(`📸 Piece #6 — her face (${S.pieces.size}/12)`); }) });

    // ---------- OFFICE ----------
    M.officeDoor = mw([pt(18.6, 0, 6.92, 19.7, 2.15, 7.08, C(0x3e2a1c), 12), pt(19.5, 0.95, 7.08, 19.58, 1.05, 7.13, METAL, 13)]);
    DC.officeDoor.on = true;
    act({ model: M.officeDoor, label: () => S.flags.officeOpen ? null : "Dad's office (locked)",
      act: async () => {
        if (!S.phase2) { Sound.error(); notify("It's locked. Dad never lets anyone in here."); return; }
        let i; await runScene(async () => { i = await choose('Maybe Dad hid photo pieces in there... Break the door open?', ['Force it open', 'Leave it']); });
        if (i === 0) busyAction('Forcing the lock...', 2.2, 20, 'thud', () => { S.flags.officeOpen = true; M.officeDoor.visible = false; DC.officeDoor.on = false; Sound.thud(); notify('The door bursts open.'); });
      } });
    M.officeDesk = ghost(22, 0.7, 0.4, 24.6, 1.0, 1.3);
    act({ model: M.officeDesk, label: () => S.flags.officeOpen ? "Search Dad's desk" : null, act: () => busyAction('Searching...', 1.5, 10, 'paper', () => endingImmediate(20)) });

    // ---------- HALLWAY / FOYER / LAUNDRY (HW) ----------
    M.closet = mw([pt(0.08, 0, 7.3, 0.9, 2.2, 9.3, WOOD, 12), pt(0.9, 0.15, 7.4, 0.93, 2.1, 8.25, C(0x5a3e2a), 12), pt(0.9, 0.15, 8.35, 0.93, 2.1, 9.2, C(0x5a3e2a), 12), pt(0.93, 1.0, 8.2, 0.97, 1.1, 8.4, METAL, 13)]);
    dest({ id: 'hw_closet', model: M.closet, accepts: ['box'], label: 'Put the box back in the closet', slots: [[0.5, 1.5, 7.6], [0.5, 1.5, 8.3], [0.5, 1.5, 9.0]], onAccept: it => { it.model.visible = false; } });
    [[1.4, 7.6], [2.0, 9.1], [3.0, 7.5]].forEach(([x, z], i) => {
      const m = mw([pt(x - 0.25, 0, z - 0.2, x + 0.25, 0.35, z + 0.2, C([0x9a7a4a, 0x7a8a9a, 0x8a6a3a][i]))]);
      carry({ id: 'hw_box' + i, room: 'HW', w: 8, model: m, name: 'box', dest: 'box' });
    });
    [2.5, 8.0, 11.3, 16.0].forEach((x, i) => {
      const f = mw([pt(x - 0.3, 1.2, 7.08, x + 0.3, 1.95, 7.12, C(0x1d1916), 12)], { dust: 1, dustCol: DUSTC });
      scrub({ id: 'hw_frame' + i, room: 'HW', w: 5, model: f, tool: 'rag', name: 'photo frame', onDone: () => { if (!S.seen.frames) { S.seen.frames = 1; runScene(() => Story.frames(G)); } } });
    });
    [[3, 8.4], [7.4, 7.9], [11.6, 8.8], [15.4, 8.1], [18.4, 8.6], [2.2, 18.4], [3.8, 19.3]].forEach(([x, z], i) => dirtPatch('hw_dirt' + i, 'HW', x, z));
    // foyer mail tray (destination for mail)
    M.mailTray = mw([pt(4.35, 0.8, 17.1, 4.8, 0.86, 17.8, C(0x6a5040), 12)]);
    dest({ id: 'fy_tray', model: M.mailTray, accepts: ['mail'], label: 'Put the mail in the tray', slots: [[4.57, 0.86, 17.3], [4.57, 0.88, 17.45], [4.57, 0.9, 17.6], [4.57, 0.92, 17.7]] });
    // shoes
    M.bench = ghost(0.15, 0.3, 18.0, 0.6, 0.5, 19.4);
    dest({ id: 'fy_bench', model: M.bench, accepts: ['shoes'], label: 'Put the shoes on the rack', slots: [[0.38, 0.45, 18.4], [0.38, 0.45, 19.0]] });
    [[3.3, 17.6], [1.6, 17.1]].forEach(([x, z], i) => {
      const m = mw([pt(x - 0.15, 0, z - 0.1, x + 0.15, 0.1, z + 0.1, C(0x2a2018)), pt(x - 0.12, 0.1, z - 0.08, x - 0.02, 0.16, z + 0.08, C(0x2a2018))]);
      carry({ id: 'hw_shoes' + i, room: 'HW', w: 4, model: m, name: 'shoes', dest: 'shoes' });
    });
    // laundry basket
    M.basket = mw([pt(6.75, 0, 19.05, 7.35, 0.45, 19.6, C(0xc8a878), 7)]);
    dest({ id: 'ld_basket', model: M.basket, accepts: ['laundry'], multi: true, short: 'laundry basket', catchBox: [6.65, 0.15, 18.95, 7.45, 0.95, 19.7], label: 'Drop it in the laundry basket', slots: [[7.05, 0.35, 19.3]], onAccept: it => { it.model.visible = false; } });
    // wire (trap)
    M.wire = mw([pt(1.25, 0, 9.0, 1.55, 0.1, 9.3, C(0x222222))]);
    M.wire._vis = () => save.sadUnlocked && !S.flags.trap;
    act({ model: M.wire, label: () => (save.sadUnlocked && !S.flags.trap) ? 'A coil of wire...' : null,
      act: () => runScene(async () => { await G.think("When he comes home drunk tonight... it'll look like an accident."); const i = await choose('String the wire across the hallway?', ['Set the trap', "No. I can't."]); if (i === 0) { S.flags.trap = true; M.trapLine.visible = true; Sound.paper(); } }) });
    M.trapLine = mw([pt(7.45, 0.12, 7.1, 7.5, 0.14, 9.4, C(0x1a1a1a))]); M.trapLine.visible = false;
    M.ladder = mw([pt(9.72, 0, 8.15, 9.8, 2.8, 8.35, WOOD, 12), pt(10.2, 0, 8.15, 10.28, 2.8, 8.35, WOOD, 12), ...[0.4, 0.8, 1.2, 1.6, 2.0, 2.4].map(y => pt(9.8, y, 8.21, 10.2, y + 0.05, 8.29, WOOD))]);
    M.ladder._vis = () => S.assembled;
    act({ model: M.ladder, label: () => S.assembled && !S.hung ? 'Climb to the roof (attic ladder)' : null,
      act: () => runScene(async () => { await fade(true, 500); P.level = 1; P.x = 10; P.z = 9.2; P.yaw = 0; await fade(false, 500); await G.think('Mom used to hang our family photos high up. She said the morning sun made them look magical.'); }) });

    // ---------- LIVING ROOM (LV) ----------
    const avoidLV = [[6.6, 13.2, 10.0, 14.1], [7.6, 11.4, 9.2, 12.2], [7.2, 9.6, 9.4, 10.2], [0, 11.7, 0.8, 13.9], [0.08, 14.4, 0.55, 16.3], [1.4, 14.4, 2.3, 15.3], [0.6, 9.6, 1.6, 10.1]];
    for (let i = 0; i < 18; i++) {
      let x, z; if (i < 6) { x = 9.6 + World.rnd() * 0.9; z = 15.2 + World.rnd() * 0.9; } else[x, z] = freeSpot(0.7, 10.4, 10.6, 16.2, avoidLV);
      const lying = World.rnd() < 0.4, col = World.rnd() < 0.5 ? C(0x2f5a2a) : C(0x6a3a14);
      const parts = lying ? [pt(x - 0.11, 0, z - 0.04, x + 0.11, 0.08, z + 0.04, col, 19), pt(x + 0.11, 0.02, z - 0.02, x + 0.18, 0.06, z + 0.02, col, 19)]
        : [pt(x - 0.04, 0, z - 0.04, x + 0.04, 0.22, z + 0.04, col, 19), pt(x - 0.018, 0.22, z - 0.018, x + 0.018, 0.3, z + 0.018, col, 19)];
      carry({ id: 'lv_bottle' + i, room: 'LV', w: 1.5, model: mw(parts), name: 'beer bottle', dest: 'trash', trash: true, icon: '🍾' });
    }
    for (let i = 0; i < 6; i++) {
      const [x, z] = freeSpot(0.7, 10.4, 10.6, 16.2, avoidLV), k = i % 3;
      const parts = k === 0 ? [pt(x - 0.2, 0, z - 0.15, x + 0.2, 0.02, z + 0.15, C(0xc8c4b8))] : k === 1 ? [pt(x - 0.06, 0, z - 0.06, x + 0.06, 0.08, z + 0.06, C(0xf2f2f2), 7), pt(x + 0.08, 0, z, x + 0.16, 0.06, z + 0.08, C(0xf2f2f2), 7)] : [pt(x - 0.1, 0, z - 0.08, x + 0.1, 0.05, z + 0.08, C(0xc03a2a))];
      carry({ id: 'lv_trash' + i, room: 'LV', w: 1.5, model: mw(parts), name: ['old newspaper', 'tissues', 'chip bag'][k], dest: 'trash', trash: true, icon: ['📰', '🧻', '🍟'][k] });
    }
    M.tv = mw([pt(7.6, 0.5, 9.85, 9.0, 1.3, 9.95, C(0x16161a), 19), pt(8.2, 0.5, 9.8, 8.4, 0.55, 10.0, C(0x222222))], { dust: 1, dustCol: DUSTC });
    scrub({ id: 'lv_tv', room: 'LV', w: 8, model: M.tv, tool: 'rag', name: 'TV' });
    M.coffee = mw([pt(7.6, 0.36, 11.4, 9.2, 0.42, 12.2, C(0x6b4a33), 12), pt(7.65, 0, 11.45, 7.75, 0.36, 11.55, WOOD_D), pt(9.05, 0, 12.05, 9.15, 0.36, 12.15, WOOD_D), pt(7.65, 0, 12.05, 7.75, 0.36, 12.15, WOOD_D), pt(9.05, 0, 11.45, 9.15, 0.36, 11.55, WOOD_D)], { dust: 1, dustCol: DUSTC });
    scrub({ id: 'lv_coffee', room: 'LV', w: 7, model: M.coffee, tool: 'rag', name: 'coffee table' });
    const shelf = [pt(0.08, 0, 14.4, 0.5, 1.9, 16.3, C(0x5a3e2a), 12)];
    for (let i = 0; i < 4; i++) shelf.push(pt(0.45, 0.4 + i * 0.45, 14.45, 0.5, 0.43 + i * 0.45, 16.25, C(0x47301f)));
    for (let j = 0; j < 7; j++) shelf.push(pt(0.15, 0.43, 14.5 + j * 0.13, 0.42, 0.72, 14.6 + j * 0.13, C([0x7a2a2a, 0x2a4a6a, 0x5a6a2a][j % 3])));
    M.shelf = mw(shelf, { dust: 1, dustCol: DUSTC });
    scrub({ id: 'lv_shelf', room: 'LV', w: 7, model: M.shelf, tool: 'rag', name: 'bookshelf', hard: 1.4 });
    const shelfDest = dest({ id: 'lv_shelfdest', model: ghost(0.08, 0.85, 14.4, 0.55, 1.75, 16.3), accepts: ['book'], label: 'Put the book back on the shelf', slots: [[0.3, 0.88, 15.0], [0.3, 0.88, 15.3], [0.3, 1.33, 15.0], [0.3, 1.33, 15.6]], onAccept: it => { it.model.rotY = Math.PI / 2; } });
    [[3.5, 12.0], [5.4, 15.4], [2.6, 10.8], [10.2, 12.5]].forEach(([x, z], i) => {
      const m = mw([pt(x - 0.12, 0, z - 0.17, x + 0.12, 0.05, z + 0.17, C([0x8a2a2a, 0x2a4a7a, 0x4a6a2a, 0x7a6a3a][i]), 12, { r: i })]);
      carry({ id: 'lv_book' + i, room: 'LV', w: 3, model: m, name: 'book', dest: 'book' });
    });
    M.couchSlots = ghost(6.8, 0.4, 13.2, 9.8, 0.95, 14.1);
    dest({ id: 'lv_couch', model: M.couchSlots, accepts: ['pillow'], label: 'Put the cushion back on the couch', slots: [[7.3, 0.45, 13.75], [8.3, 0.45, 13.75], [9.3, 0.45, 13.75]] });
    [[1.85, 0.42, 14.8], [4.2, 0, 13.0], [0.9, 0, 11.5]].forEach(([x, y, z], i) => {
      const m = mw([pt(x - 0.25, y, z - 0.08, x + 0.25, y + 0.4, z + 0.08, C([0x8a6a3a, 0x6a3a3a, 0x8a6a3a][i]), 7, { r: 0.5 * i })]);
      carry({ id: 'lv_pillow' + i, room: 'LV', w: 3, model: m, name: 'cushion', dest: 'pillow' });
    });
    [[2.5, 11.2], [4.8, 12.8], [3.2, 15.8], [6.0, 15.2], [9.9, 11.0], [5.6, 10.5], [1.5, 13.9], [10.2, 14.7]].forEach(([x, z], i) => dirtPatch('lv_dirt' + i, 'LV', x, z));
    M.fireplace = ghost(0.08, 0.1, 12.3, 0.75, 0.9, 13.3);
    act({ model: M.fireplace, label: () => (S.phase2 && S.pieces.has(6) && S.pieces.size >= 8 && !S.assembled) ? 'Examine the pieces by the firelight' : null,
      act: () => runScene(async () => {
        await G.think("I can barely see the photos. Let me take them near the fireplace for better light.");
        const i = await choose('Examine the pieces by firelight? (Better lighting)', ['Yes', 'No']); if (i !== 0) return;
        await G.narr("(You kneel in front of the embers and hold up piece #6 — Mom's smiling face.)");
        await G.think('I can see it better now. Her smile...');
        if (Math.random() < CFG.BURN_CHANCE) { await G.narr('(SUDDENLY — a spark flies out of the fireplace and lands on the pieces.)'); await G.say('You', 'What— NO!'); await G.narr('(The old, dry paper catches fire instantly.)'); S.pieces.clear(); endingImmediate(14); }
        else await G.think("She's so beautiful... (Better not hold them this close to the fire.)");
      }) });

    // ---------- DINING (DN) ----------
    M.table = mw([pt(13.75, 0.7, 13.6, 15.25, 0.78, 15.9, C(0x6b4a33), 12), pt(13.85, 0, 13.7, 13.95, 0.7, 13.8, WOOD_D), pt(15.05, 0, 15.7, 15.15, 0.7, 15.8, WOOD_D), pt(13.85, 0, 15.7, 13.95, 0.7, 15.8, WOOD_D), pt(15.05, 0, 13.7, 15.15, 0.7, 13.8, WOOD_D)], { dust: 1, dustCol: DUSTC });
    const tableE = scrub({ id: 'dn_dust', room: 'DN', w: 20, model: M.table, tool: 'rag', name: 'dining table', hard: 1.6 });
    for (let i = 0; i < 4; i++) {
      const x = 13.95 + (i % 2) * 0.75, z = 13.8 + Math.floor(i / 2) * 1.2 + World.rnd() * 0.3;
      const m = mw([pt(x, 0.78, z, x + 0.45, 0.84 + World.rnd() * 0.06, z + 0.32, C(0xe8e2d2)), pt(x + 0.1, 0.84, z + 0.05, x + 0.4, 0.88, z + 0.3, C(0xd8cca8))]);
      carry({ id: 'dn_mail' + i, room: 'DN', w: 7, model: m, name: 'pile of mail', dest: 'mail' });
    }
    M.plates = mw([[14.5, 13.9], [14.1, 15.6], [14.9, 15.6]].flatMap(([x, z]) => [pt(x - 0.14, 0.78, z - 0.14, x + 0.14, 0.8, z + 0.14, C(0xf4f2ee), 13), pt(x + 0.17, 0.78, z - 0.1, x + 0.2, 0.79, z + 0.1, C(0x9aa0a6), 13)]));
    M.plates.visible = false;
    M.cabinet2 = ghost(11.15, 0.8, 17.5, 11.65, 2.0, 19.5);
    act({ model: M.cabinet2, label: () => (!S.flags.tookPlates && !done('dn_set')) ? 'Take plates from the china cabinet' : null, act: () => { S.flags.tookPlates = true; const it = ENT.find(e => e.id === 'dn_set'); it.model.visible = true; pickUp(it); } });
    M.platesCarry = mw([pt(-0.15, 0, -0.15, 0.15, 0.08, 0.15, C(0xf4f2ee), 13)]); M.platesCarry.visible = false;
    carry({ id: 'dn_set', room: 'DN', w: 18, model: M.platesCarry, name: 'plates', dest: 'plates' });
    M.tableDest = ghost(13.75, 0.7, 13.6, 15.25, 1.0, 15.9);
    dest({ id: 'dn_table', model: M.tableDest, accepts: ['plates', 'cake'], label: it => it.dest === 'cake' ? 'Put the cake on the table' : 'Set the table for three', slots: [[14.5, 0.78, 14.75]],
      onAccept: it => {
        if (it.dest === 'plates') { it.model.visible = false; M.plates.visible = true; runScene(() => G.think('Three plates. For Dad, for me... and for Mom.')); }
        else decorateCake(it);
      } });
    [[12.0, 11.0], [16.8, 12.2], [12.4, 18.2], [16.9, 18.6]].forEach(([x, z], i) => dirtPatch('dn_dirt' + i, 'DN', x, z));

    // ---------- KITCHEN (KT) ----------
    [[21.4, 9.95], [23.5, 9.95], [24.1, 10.05], [21.6, 14.1]].forEach(([x, z], i) => {
      const y = i === 3 ? 0.93 : 0.93, parts = [], n = 3 + i;
      for (let k = 0; k < n; k++) parts.push(pt(x - 0.15, y + k * 0.035, z - 0.15, x + 0.15, y + 0.03 + k * 0.035, z + 0.13, C([0xe8e2d6, 0xc8d2d8, 0xd8c8b0][k % 3]), 13));
      parts.push(pt(x - 0.05, y + n * 0.035, z - 0.04, x + 0.08, y + 0.12 + n * 0.035, z + 0.06, C(0x9a8a6a)));
      const m = mw(parts, { dust: 0.7, dustCol: C(0x6a5030) });
      carry({ id: 'kt_dish' + i, room: 'KT', w: 7, model: m, name: 'stack of dirty dishes', dest: 'dishes' });
    });
    M.sinkDest = ghost(22.0, 0.88, 9.7, 23.0, 1.05, 10.3);
    dest({ id: 'kt_sink', model: M.sinkDest, accepts: ['dishes'], label: 'Wash the dishes in the sink', slots: [[22.5, 0.88, 10.0]], onAccept: it => washDishes(it) });
    M.dishRack = mw([pt(23.4, 0.93, 9.7, 24.0, 0.96, 10.25, C(0x9aa0a6), 13)]);
    [[20.8, 9.75], [24.6, 9.75]].forEach(([x, z], i) => {
      const s = mw([pt(x - 0.35, 0.93, z, x + 0.35, 0.94, z + 0.5, C(0x5a4026)), pt(x - 0.1, 0.93, z + 0.1, x + 0.1, 0.99, z + 0.2, C(0xb0a080))]);
      scrub({ id: 'kt_counter' + i, room: 'KT', w: 7, model: s, tool: 'rag', name: 'spill', decal: true });
    });
    [[20.9, 14.0], [22.0, 14.35], [23.0, 14.0]].forEach(([x, z], i) => {
      const s = mw([pt(x - 0.2, 0.93, z - 0.15, x + 0.2, 0.97 + i * 0.02, z + 0.15, C(0xe0dccc)), pt(x - 0.1, 0.97, z - 0.1, x + 0.15, 1.0 + i * 0.02, z + 0.12, C(0xc8b88a))]);
      carry({ id: 'kt_clutter' + i, room: 'KT', w: 4, model: s, name: 'junk mail', dest: 'trash', trash: true, icon: '📄' });
    });
    [[19.5, 12.0], [23.8, 12.3], [20.0, 16.5], [22.5, 17.8], [24.5, 15.6], [19.3, 18.6]].forEach(([x, z], i) => dirtPatch('kt_stain' + i, 'KT', x, z, 0.5 + World.rnd() * 0.3, C(0x5a4630), 'mop'));
    // kitchen trash bin
    M.kbin = mw([pt(25.05, 0, 16.05, 25.55, 0.75, 16.55, C(0x3a4a3a), 13), pt(25.02, 0.75, 16.02, 25.58, 0.8, 16.58, C(0x2a3a2a), 13), pt(25.1, 0.8, 16.1, 25.5, 0.98, 16.5, C(0xd8d0c0), 7)]);
    M.kbag = mw([pt(-0.22, 0, -0.22, 0.22, 0.5, 0.22, C(0x1d1d1f), 13), pt(-0.06, 0.5, -0.06, 0.06, 0.6, 0.06, C(0x1d1d1f), 13)]); M.kbag.visible = false; M.kbag.pos = [25.3, 0.3, 16.3];
    const kbagE = carry({ id: 'kt_trash', room: 'KT', w: 15, model: M.kbag, name: 'kitchen trash bag', dest: 'kbag' });
    dest({ id: 'kt_bin', model: M.kbin, accepts: ['trash'], multi: true, bagBin: true, short: 'kitchen bin', catchBox: [24.95, 0.45, 15.95, 25.65, 1.4, 16.65], label: it => S.kbin >= CFG.KBIN_CAP ? null : `Throw it in the kitchen bin (${S.kbin}/${CFG.KBIN_CAP})`, slots: null, binCap: () => S.kbin < CFG.KBIN_CAP,
      onAccept: it => { it.model.visible = false; S.kbin++; refreshKbin(); if (S.kbin >= CFG.KBIN_CAP) notify('The kitchen bin is full — take the bag out to the bins outside.'); } });
    act({ model: M.kbin, label: () => 'Kitchen trash bin', act: () => trashMenu(kbagE) });
    // outdoor bins (backyard, right outside the back door)
    M.outbin = mw([pt(26.95, 0, 11.6, 27.75, 1.05, 12.4, C(0x2f4a3a), 13), pt(26.9, 1.05, 11.55, 27.8, 1.12, 12.45, C(0x24382c), 13),
      pt(26.95, 0, 12.5, 27.75, 1.05, 13.3, C(0x2a3a5a), 13), pt(26.9, 1.05, 12.45, 27.8, 1.12, 13.35, C(0x1e2c48), 13)], { indoor: false });
    dest({ id: 'out_bin', model: M.outbin, accepts: ['trash', 'kbag'], multi: true, bagBin: true, short: 'outside bin', catchBox: [26.8, 0.55, 11.45, 27.9, 1.7, 13.45], label: it => it.dest === 'kbag' ? 'Throw the bag in the outside bin' : 'Throw it in the outside bin', slots: null, onAccept: it => { it.model.visible = false; } });
    refreshKbin();
    // cake stations
    M.recipe = mw([pt(20.25, 0.55, 10.3, 20.85, 0.78, 10.35, C(0x9a8a6c), 12), pt(20.5, 0.65, 10.35, 20.6, 0.68, 10.38, METAL, 13), pt(20.38, 0.78, 10.22, 20.62, 0.795, 10.42, C(0xf6e4e4), 0, { r: 0.15 })]);
    M.recipe._vis = () => true;
    act({ model: M.recipe, label: () => (S.cake.stage === 'none' && !S.prelude) ? 'Open the drawer (a card is sticking out)' : null,
      act: () => runScene(async () => { Sound.paper(); await overlay(Story.recipeText, 'Keep the recipe', 'paper'); S.cake.stage = 'recipe'; setPartsW(M.recipe, [pt(20.25, 0.55, 10.3, 20.85, 0.78, 10.35, C(0x9a8a6c), 12), pt(20.5, 0.65, 10.35, 20.6, 0.68, 10.38, METAL, 13)]); await G.think("Her handwriting... I haven't seen this in so long."); notify('🎂 New goal: bake Mom\'s cake (check the fridge)'); }) });
    M.fridge = ghost(25.05, 0.2, 10.5, 25.85, 1.95, 11.5);
    act({ model: M.fridge, label: () => S.cake.stage === 'recipe' ? 'Check the ingredients' : null, act: ingredients });
    M.bowl = mw([pt(21.0, 0.93, 13.9, 21.45, 1.08, 14.35, C(0xe0d8c0), 13), pt(21.05, 1.08, 13.95, 21.4, 1.1, 14.3, C(0xf0e4b8))]);
    M.bowl._vis = () => S.cake.stage === 'ingredients';
    act({ model: M.bowl, label: () => S.cake.stage === 'ingredients' ? 'Mix the batter' : null, act: mixGame });
    M.oven = mw([pt(18.8, 0.1, 10.3, 19.8, 0.82, 10.35, C(0x2a2a2c), 13), pt(18.95, 0.35, 10.35, 19.65, 0.65, 10.36, C(0x111111), 19), pt(18.9, 0.72, 10.35, 18.98, 0.78, 10.39, METAL, 13), pt(19.62, 0.72, 10.35, 19.7, 0.78, 10.39, METAL, 13)]);
    act({ model: M.oven, label: () => { const st = S.cake.stage; if (st === 'mixed') return 'Put the cake in the oven (30 min)'; if (st === 'baking') return 'Baking...'; if (st === 'ready') return S.cake.late > 20 ? 'TAKE IT OUT! PUT OUT THE FIRE!' : 'Take the cake out!'; return null; }, act: ovenAct });
    M.cake = mw([]); M.cake.visible = false;
    carry({ id: 'cake', model: M.cake, name: 'cake', dest: 'cake' });

    // ---------- BACKYARD ----------
    const bushParts = [];
    for (let x = 34.7; x < 40; x += 0.7) bushParts.push(pt(x, 0, 1.85 + World.rnd() * 0.2, x + 0.75, 1.3 + World.rnd() * 0.5, 2.85, C([0x2b4520, 0x35552a, 0x223a18][Math.floor(x * 3) % 3]), 4));
    for (let z = -2.9; z < 2.0; z += 0.7) bushParts.push(pt(34.6 + World.rnd() * 0.2, 0, z, 35.6, 1.3 + World.rnd() * 0.5, z + 0.75, C([0x2b4520, 0x35552a, 0x223a18][Math.floor(z * 3 + 9) % 3]), 4));
    M.bushes = mw(bushParts, { indoor: false });
    const cleared = save.phase2 && !S.prelude;
    M.bushes.visible = !cleared; DC.bush1.on = DC.bush2.on = !cleared;
    act({ model: M.bushes, label: () => M.bushes.visible ? (S.prelude ? 'Push through the overgrowth' : 'Thick overgrown bushes') : null,
      act: () => { if (!S.prelude) { Sound.error(); return notify('The plants are too thick to get through.'); } busyAction('Pushing through...', 2.0, 0, 'whoosh', () => { M.bushes.visible = false; DC.bush1.on = DC.bush2.on = false; }); } });
    M.grave = mw([pt(37.75, 0.15, -1.4, 38.65, 1.25, -1.2, C(0x8a8a84), 10), pt(37.85, 1.25, -1.4, 38.55, 1.35, -1.2, C(0x8a8a84), 10), pt(38.07, 0.85, -1.2, 38.33, 1.1, -1.19, C(0xd8c8a0)),
      pt(37.7, 0.15, -1.25, 38.0, 1.0, -1.14, C(0x2f4a22), 4), pt(38.3, 0.6, -1.25, 38.7, 1.3, -1.14, C(0x2f4a22), 4), pt(37.9, 1.1, -1.45, 38.4, 1.42, -1.15, C(0x35552a), 4)], { indoor: false });
    act({ model: M.grave, label: () => S.prelude ? (S.flags.gotPiece ? 'A stone covered in vines' : null) : "Mom's grave",
      act: () => { if (S.prelude) return preludeGrave(); runScene(async () => { await G.think('Mom... I miss you.'); await G.narr('(The wind moves through the overgrown garden. Everything is quiet.)'); }); } });

    // ---------- ROOF (level 1) ----------
    M.roofLadder = ghost(9.6, 3.0, 7.85, 10.4, 3.5, 8.65);
    act({ model: M.roofLadder, lvl: 1, label: () => 'Climb back down', act: () => runScene(async () => { await fade(true, 400); P.level = 0; P.x = 10; P.z = 8.9; await fade(false, 400); }) });
    M.roofBoxes = mw([pt(11.0, 3.0, 5.4, 11.6, 3.45, 6.0, C(0x9a7a4a)), pt(11.05, 3.45, 5.45, 11.55, 3.85, 5.95, C(0x8a6a3a))], { indoor: false });
    act({ model: M.roofBoxes, lvl: 1, label: () => S.boxesPlaced ? null : 'Stack the boxes under the nail',
      act: () => busyAction('Stacking boxes...', 1.4, 5, 'thud', () => { S.boxesPlaced = true; DC.roofBoxes.on = false; setPartsW(M.roofBoxes, [pt(9.7, 3.0, 4.6, 10.3, 3.45, 5.2, C(0x9a7a4a)), pt(9.75, 3.45, 4.65, 10.25, 3.85, 5.15, C(0x8a6a3a), 0, { r: 0.15 })]); }) });
    M.nail = ghost(9.8, 3.95, 4.45, 10.2, 4.35, 4.75);
    act({ model: M.nail, lvl: 1, label: () => S.hung ? null : (S.boxesPlaced ? 'Hang the photo on the nail' : "Mom's old nail (too high — need something to stand on)"),
      act: () => { if (!S.boxesPlaced) { Sound.error(); return notify("It's too high. I need something to stand on..."); } S.hung = true; M.hungPhoto.visible = true; Sound.chime(); endingImmediate(16); } });
    M.hungPhoto = mw([pt(9.62, 3.72, 4.5, 10.38, 4.28, 4.52, C(0xf0e8d8), 0, { em: 1 }), pt(9.66, 4.04, 4.52, 10.34, 4.24, 4.53, C(0x8fc0e8), 0, { em: 1 }), pt(9.66, 3.95, 4.52, 10.34, 4.04, 4.53, C(0x3d7fae), 0, { em: 1 }),
      pt(9.66, 3.76, 4.52, 10.34, 3.95, 4.53, C(0xe0c890), 0, { em: 1 }), pt(9.76, 3.8, 4.53, 9.84, 4.12, 4.54, C(0x4d6a8e), 0, { em: 1 }), pt(9.96, 3.8, 4.53, 10.04, 4.08, 4.54, C(0xd36a7a), 0, { em: 1 }), pt(10.14, 3.8, 4.53, 10.2, 4.0, 4.54, C(0xf0c23a), 0, { em: 1 })], { indoor: false });
    M.hungPhoto.visible = false;

    // ---------- DAD (3–6 AM) ----------
    M.dadTalk = ghost(7.8, 0, 13.2, 8.8, 1.6, 14.1);
    act({ model: M.dadTalk, label: () => (S.early && !S.dadLeft && dadModel && dadModel.visible && S.talks < 3) ? 'Talk to Dad' : null, act: () => runScene(async () => { S.talks++; await Story.earlyTalk(G); }) });

    // smoke pool
    for (let i = 0; i < 24; i++) { const sm = mw([pt(-0.17, 0, -0.17, 0.17, 0.34, 0.17, C(0x3a3a3a), 0, { a: 0.4 })]); sm.visible = false; sm.life = 0; S.smoke.push(sm); }

    // ---------- PHOTO PIECES (Phase 2) ----------
    pieceModel(2, 9.6, 0, 10.0, () => done('lv_tv'));
    pieceModel(3, 10.0, 0, 15.5, () => countDone('lv_bottle') >= 10);
    pieceModel(5, 22.9, 0.93, 14.45, () => countDone('kt_clutter') >= 3);
    pieceModel(7, 22.4, 0.94, 10.05, () => countDone('kt_dish') >= 4);
    pieceModel(8, 14.4, 0.78, 14.2, () => countDone('dn_mail') >= 4);
    pieceModel(9, 13.3, 0.47, 13.95, () => done('dn_dust'));
    pieceModel(10, 1.3, 0, 8.3, () => countDone('hw_box') >= 3);
    pieceModel(11, 4.0, 0, 2.85, () => done('pb_bed'));
    pieceModel(12, 7.5, 1.03, 4.6, () => done('pb_dresser'));
  }

  function pieceModel(n, x, y, z, reveal) {
    const m = mw([pt(x - 0.08, y, z - 0.07, x + 0.08, y + 0.012, z + 0.07, C(0xf4efe2), 0, { em: 1 })]);
    m._vis = () => S.phase2 && reveal() && !S.pieces.has(n);
    act({ model: m, label: () => m._vis() ? `Pick up photo piece #${n}` : null, act: () => { spend(2); Sound.paper(); gainPiece(n); } });
  }
  function gainPiece(n) {
    S.pieces.add(n); Sound.chime(); notify(`📸 Found photo piece #${n} (${S.pieces.size}/12)`);
    if (S.pieces.size === 10) notify("⚠ The pieces are fragile... don't RUN (Shift) while carrying this many!", 6000);
    if (S.pieces.size === 11 && !S.pieces.has(6)) notify('Only piece #6 is missing — her face. Press P to look at the photo.', 6000);
    if (S.pieces.size === 12) notify('All 12 pieces! Press P to tape the photo back together.', 6000);
  }
  function refreshKbin() {
    const full = Math.min(1, S.kbin / CFG.KBIN_CAP), parts = [pt(25.05, 0, 16.05, 25.55, 0.75, 16.55, C(0x3a4a3a), 13), pt(25.02, 0.75, 16.02, 25.58, 0.8, 16.58, C(0x2a3a2a), 13)];
    if (S.kbin > 0) parts.push(pt(25.1, 0.6, 16.1, 25.5, 0.6 + 0.4 * full, 16.5, C(0xd8d0c0), 7));
    if (S.kbin >= CFG.KBIN_CAP) parts.push(pt(25.2, 0.95, 16.15, 25.45, 1.05, 16.4, C(0xc03a2a)), pt(24.9, 0, 16.6, 25.1, 0.06, 16.8, C(0xc8c4b8)));
    setPartsW(M.kbin, parts);
  }
  function newKbag() {
    S.kbagN = (S.kbagN || 0) + 1;
    const m = mw([pt(-0.22, 0, -0.22, 0.22, 0.5, 0.22, C(0x1d1d1f), 13), pt(-0.06, 0.5, -0.06, 0.06, 0.6, 0.06, C(0x1d1d1f), 13)]);
    m.pos = [25.3, 0.3, 16.3];
    return carry({ id: 'kt_trashx' + S.kbagN, room: 'KT', w: 0, model: m, name: 'kitchen trash bag', dest: 'kbag' });
  }
  async function trashMenu(kbagE) {
    let fn = null;
    await runScene(async () => {
      const opts = [], fns = [];
      if (S.kbin > 0) { opts.push(`Take the trash bag out (bin ${S.kbin}/${CFG.KBIN_CAP})`); fns.push(() => { if (freeSlot() < 0) { Sound.error(); return notify('Your hands are full (3/3).'); } const bag = (!kbagE.done && !kbagE.carried && !kbagE.model.visible) ? kbagE : newKbag(); bag.model.visible = true; pickUp(bag); S.kbin = 0; refreshKbin(); notify('Carry it to the bins outside — through the BACK DOOR in the kitchen.', 5000); }); }
      if (heldTool() === 'bag' && held().bagCount > 0 && S.kbin < CFG.KBIN_CAP) { opts.push(`Empty your trash bag here (${held().bagCount})`); fns.push(() => { const b = held(); S.kbin = Math.min(CFG.KBIN_CAP, S.kbin + b.bagCount); b.bagCount = 0; refreshKbin(); updateInv(); Sound.thud(); }); }
      if (S.phase2 && !S.flags.searchedTrash) { opts.push('Dig through the trash (looking for photo pieces)'); fns.push(() => busyAction('Digging through trash...', 1.6, 12, 'paper', () => { S.flags.searchedTrash = true; gainPiece(4); })); }
      if (S.phase2 && S.pieces.size >= 3 && !S.flags.thrown && !S.assembled) { opts.push('Throw the photo pieces away'); fns.push(throwPieces); }
      opts.push('Never mind'); fns.push(() => { });
      const i = await choose('Kitchen trash bin', opts); fn = fns[i];
    });
    if (fn) fn();
  }

  // ---------- bed corners mini-task ----------
  function startBedCorners(bedE) {
    bedE.started = true; spend(2);
    const corners = [[2.7, 0.35], [5.3, 0.35], [2.7, 2.62], [5.3, 2.62]];
    let left = 4;
    notify('Tuck in all four corners of the bed (look at the glowing corners and press E).', 5000);
    setPartsW(M.pbed, [pt(2.65, 0.32, 0.35, 5.35, 0.52, 2.65, C(0xd8d2c6), 7), pt(2.7, 0.52, 0.4, 5.3, 0.62, 2.6, C(0x3a4a6a), 7, { r: 0.04 })]);
    corners.forEach(([x, z]) => {
      const m = mw([pt(x - 0.12, 0.5, z - 0.12, x + 0.12, 0.66, z + 0.12, C(0xffe0a0), 0, { em: 1, a: 0.7 })]);
      const e = act({ model: m, label: () => m.visible ? 'Tuck in this corner' : null, act: () => { m.visible = false; Sound.paper(); spend(1); swing = 1; left--; if (left === 0) finishBed(bedE); } });
    });
  }
  function finishBed(bedE) {
    bedE.done = true;
    setPartsW(M.pbed, [pt(2.65, 0.32, 0.35, 5.35, 0.52, 2.65, C(0xd8d2c6), 7), pt(2.7, 0.52, 0.95, 4.0, 0.6, 2.6, C(0x3a4a6a), 7), pt(4.0, 0.52, 0.95, 5.3, 0.6, 2.6, C(0x7a6a8a), 6), pt(2.8, 0.52, 0.38, 3.9, 0.68, 0.82, C(0xeeeeee), 7), pt(4.1, 0.52, 0.38, 5.2, 0.68, 0.82, C(0xeeeeee), 6)]);
    Sound.pick(); checkEvents(); runScene(() => Story.bedDivide(G));
  }

  // ======== INVENTORY (3 slots) & HANDS ========
  const HELD = {};
  function buildHeldModels() {
    const mk = parts => ({ pos: [0, 0, 0], rotY: 0, visible: false, parts, dirty: true, indoor: true });
    HELD.rag = mk([{ o: [0, 0, 0], s: [0.16, 0.05, 0.2], c: C(0xd0a050), pat: 7 }]);
    HELD.broom = mk([{ o: [0, 0.05, 0], s: [0.035, 0.85, 0.035], c: C(0x9a7040), pat: 12 }, { o: [0, -0.42, 0], s: [0.34, 0.16, 0.1], c: C(0xc8a040), pat: 7 }, { o: [0, -0.33, 0], s: [0.3, 0.05, 0.09], c: C(0x8a2a2a) }]);
    HELD.mop = mk([{ o: [0, 0.05, 0], s: [0.035, 0.85, 0.035], c: C(0x8a8a90), pat: 13 }, { o: [0, -0.42, 0], s: [0.32, 0.12, 0.18], c: C(0xd8d4c8), pat: 7 }]);
    HELD.bag = mk([{ o: [0, 0, 0], s: [0.28, 0.32, 0.28], c: C(0x1d1d1f), pat: 13 }, { o: [0, 0.2, 0], s: [0.08, 0.1, 0.08], c: C(0x1d1d1f), pat: 13 }]);
    OVERLAY = [HELD.rag, HELD.broom, HELD.mop, HELD.bag];
  }
  const held = () => S.inv.slots[S.inv.sel];
  const heldTool = () => { const h = held(); return h ? (h.tool || null) : 'hands'; };
  const slotOfTool = t => S.inv.slots.findIndex(x => x && x.tool === t);
  function freeSlot() { if (!S.inv.slots[S.inv.sel]) return S.inv.sel; return S.inv.slots.findIndex(x => !x); }
  function iconOf(e) { return e.tool ? TOOL_INFO[e.tool].icon : (e.icon || DEST_ICON[e.dest] || '•'); }
  function selectSlot(i) { if (!S || i < 0 || i > 2) return; if (S.inv.sel !== i) { S.inv.sel = i; using = null; Sound.blip(); } updateInv(); }
  function updateInv() {
    if (!S) return;
    $('invslots').innerHTML = S.inv.slots.map((e, i) => {
      const sel = i === S.inv.sel;
      const cnt = e && e.tool === 'bag' ? `<span class="cnt">${e.bagCount}/${CFG.BAG_CAP}</span>` : '';
      return `<div class="slot${sel ? ' sel' : ''}${e ? '' : ' empty'}"><span class="num">${i + 1}</span><span class="ico">${e ? iconOf(e) : ''}</span><span class="nm">${e ? (e.tool ? TOOL_INFO[e.tool].name : e.name) : ''}</span>${cnt}</div>`;
    }).join('');
    const h = held();
    $('invhint').innerHTML = h ? (h.dest && DEST_HINT[h.dest] ? `→ ${DEST_HINT[h.dest]} · ` : '') + 'G drop · RMB throw' : '';
  }
  function pickUp(e) {
    const i = freeSlot();
    if (i < 0) { Sound.error(); notify('Your hands are full (3/3). Drop (G) or throw (right click) something first.'); return false; }
    S.inv.slots[i] = e; S.inv.sel = i; e.carried = true; e.phys = null; using = null;
    const k = MODELS.indexOf(e.model); if (k >= 0) MODELS.splice(k, 1);
    if (!e.tool) { e.model._wasRot = e.model.rotY; if (!OVERLAY.includes(e.model)) OVERLAY.push(e.model); }
    e.model.visible = true; e.model.dirty = true; spend(0.5); Sound.pick(); updateInv();
    return true;
  }
  function takeOut(e) {
    const i = S.inv.slots.indexOf(e); if (i < 0) return;
    S.inv.slots[i] = null; e.carried = false;
    const k = OVERLAY.indexOf(e.model); if (k >= 0) OVERLAY.splice(k, 1);
    if (!MODELS.includes(e.model)) MODELS.push(e.model);
    e.model.visible = true; e.model.pitch = 0; e.model.scale = 1; e.model._hs = null; e.model.rotY = e.model._wasRot || 0;
    updateInv();
  }
  function clearInv() { for (const e of S.inv.slots.slice()) if (e) { takeOut(e); e.model.visible = false; } }
  function dropHeld(throwIt) {
    const e = held(); if (!e || MODE !== 'play') return;
    takeOut(e);
    if (e.tool && FLAT[e.tool]) { e.model.parts = FLAT[e.tool].map((p, i) => ({ o: p.o.slice(), s: p.s.slice(), c: C(FLATCOL[e.tool][i] || FLATCOL[e.tool][0]), pat: 7 })); e.model.dirty = true; }
    const eye = camEye(), d = camDir();
    e.model.pos = [eye[0] + d[0] * 0.35, eye[1] - 0.3 + d[1] * 0.35, eye[2] + d[2] * 0.35];
    e.model.rotY = P.yaw;
    const sp = throwIt ? 7 : 1.3;
    e.phys = { v: [d[0] * sp, d[1] * sp + (throwIt ? 1.6 : 0.5), d[2] * sp], spin: (Math.random() - 0.5) * (throwIt ? 12 : 3), lvl: P.level };
    if (throwIt) Sound.whoosh(); else Sound.blip();
  }
  function placeInto(d, e) {
    if (e.carried) takeOut(e);
    e.phys = null;
    if (d.slots) { const s = d.slots[d.filled % d.slots.length]; e.model.pos = [s[0], s[1], s[2]]; }
    d.filled++; e.done = true; spend(0.5); Sound.pick();
    if (d.onAccept) d.onAccept(e);
    checkEvents();
  }
  function matching(d) { return S.inv.slots.filter(x => x && !x.tool && d.accepts.includes(x.dest)); }

  // ======== PHYSICS (dropped / thrown items) ========
  function physStep(e, dt) {
    const ph = e.phys, m = e.model, r = 0.08, floor = ph.lvl ? 3.0 : 0;
    const prevY = m.pos[1];
    ph.v[1] -= 9.8 * dt;
    m.pos[0] += ph.v[0] * dt; m.pos[1] += ph.v[1] * dt; m.pos[2] += ph.v[2] * dt;
    m.rotY += ph.spin * dt;
    for (const d of CATCH) {
      if (!d.accepts.includes(e.dest) || (d.binCap && !d.binCap())) continue;
      const b = d.catchBox;
      if (m.pos[0] > b[0] && m.pos[0] < b[3] && m.pos[1] > b[1] && m.pos[1] < b[4] && m.pos[2] > b[2] && m.pos[2] < b[5]) { placeInto(d, e); Sound.thud(); notify(`🎯 Into the ${d.short}!`, 1500); return; }
    }
    let grounded = false;
    for (const c of World.colliders) {
      if (!c.on || c.lvl !== ph.lvl || (c.y2 - c.y1) < 0.15) continue;
      const y = m.pos[1]; if (y > c.y2 || y + 0.15 < c.y1) continue;
      if (m.pos[0] < c.x1 - r || m.pos[0] > c.x2 + r || m.pos[2] < c.z1 - r || m.pos[2] > c.z2 + r) continue;
      if (prevY >= c.y2 - 0.04 && ph.v[1] <= 0) { m.pos[1] = c.y2; if (ph.v[1] < -2) Sound.step(); ph.v[1] = -ph.v[1] * 0.25; if (Math.abs(ph.v[1]) < 0.6) ph.v[1] = 0; grounded = true; continue; }
      const dx1 = m.pos[0] - (c.x1 - r), dx2 = (c.x2 + r) - m.pos[0], dz1 = m.pos[2] - (c.z1 - r), dz2 = (c.z2 + r) - m.pos[2];
      const mn = Math.min(dx1, dx2, dz1, dz2);
      if (mn === dx1) { m.pos[0] = c.x1 - r; ph.v[0] = -Math.abs(ph.v[0]) * 0.35; }
      else if (mn === dx2) { m.pos[0] = c.x2 + r; ph.v[0] = Math.abs(ph.v[0]) * 0.35; }
      else if (mn === dz1) { m.pos[2] = c.z1 - r; ph.v[2] = -Math.abs(ph.v[2]) * 0.35; }
      else { m.pos[2] = c.z2 + r; ph.v[2] = Math.abs(ph.v[2]) * 0.35; }
      if (Math.hypot(ph.v[0], ph.v[2]) > 1.5) Sound.step();
    }
    const insideHouse = m.pos[0] > 0 && m.pos[0] < 26 && m.pos[2] > 0 && m.pos[2] < 20;
    if (!ph.lvl && insideHouse && m.pos[1] > 2.6) { m.pos[1] = 2.6; ph.v[1] = -Math.abs(ph.v[1]) * 0.3; }
    if (m.pos[1] <= floor) { m.pos[1] = floor; if (ph.v[1] < -2.5) Sound.step(); ph.v[1] = -ph.v[1] * 0.3; if (Math.abs(ph.v[1]) < 0.6) ph.v[1] = 0; grounded = true; }
    if (grounded) {
      const f = Math.pow(0.01, dt); ph.v[0] *= f; ph.v[2] *= f; ph.spin *= f;
      if (Math.hypot(ph.v[0], ph.v[1], ph.v[2]) < 0.12) e.phys = null;
    }
  }
  function updatePhysics(dt) {
    for (const e of ENT) {
      if (!e.phys) continue;
      const sp = Math.hypot(...e.phys.v), n = Math.min(8, Math.max(1, Math.ceil(sp * dt / 0.06)));
      for (let i = 0; i < n && e.phys; i++) physStep(e, dt / n);
    }
  }

  // ======== LABELS & INTERACTION ========
  function labelFor(e) {
    const tl = heldTool(), h = held();
    if (e.kind === 'carry') {
      if (e.done || e.carried || e.noPick || e.phys) return null;
      if (tl === 'bag' && e.trash) return h.bagCount >= CFG.BAG_CAP ? 'Trash bag is full — empty it in a bin' : `Bag the ${e.name} (${h.bagCount}/${CFG.BAG_CAP})`;
      if (freeSlot() < 0) return `The ${e.name} — your hands are full (3/3)`;
      return `Pick up the ${e.name}`;
    }
    if (e.kind === 'dest') {
      if (e.bagBin && tl === 'bag' && h.bagCount > 0) return `Empty the trash bag (${h.bagCount})`;
      const items = matching(e); if (!items.length) return null;
      if (e.binCap && !e.binCap()) return 'The bin is full';
      if (e.multi && items.length > 1) return `Put ${items.length} items in the ${e.short}`;
      const it = items.includes(h) ? h : items[0];
      return typeof e.label === 'function' ? e.label(it) : e.label;
    }
    if (e.kind === 'scrub' || e.kind === 'sweep') {
      if (e.done) return null;
      const need = e.kind === 'sweep' ? 'broom' : e.tool, tn = TOOL_INFO[need].name;
      const what = e.kind === 'sweep' ? 'Dirt on the floor' : e.decal ? `A ${e.name}` : `Dusty ${e.name}`;
      if (tl !== need) { const i = slotOfTool(need); return i >= 0 ? `${what} — switch to the ${tn} (key ${i + 1})` : `${what} — needs the ${tn} (Storage room)`; }
      return need === 'broom' ? 'Hold [LMB] to sweep the dirt away' : `Hold [LMB] + move the mouse to ${need === 'mop' ? 'mop' : 'wipe'} the ${e.name}`;
    }
    if (e.kind === 'act') return e.label();
    return null;
  }
  function interact(e) {
    const tl = heldTool(), h = held();
    if (e.kind === 'carry') {
      if (tl === 'bag' && e.trash) {
        if (h.bagCount >= CFG.BAG_CAP) { Sound.error(); return notify('Your trash bag is full. Empty it in the kitchen bin or the bins outside.'); }
        h.bagCount++; e.done = true; e.model.visible = false; spend(0.5); Sound.clink(); updateInv(); checkEvents(); return;
      }
      return pickUp(e);
    }
    if (e.kind === 'dest') {
      if (e.bagBin && tl === 'bag' && h.bagCount > 0) {
        if (e.id === 'kt_bin') { const room = CFG.KBIN_CAP - S.kbin, n = Math.min(room, h.bagCount); if (n <= 0) { Sound.error(); return notify('The kitchen bin is full.'); } S.kbin += n; h.bagCount -= n; refreshKbin(); }
        else { notify(`Emptied ${h.bagCount} pieces of trash.`); h.bagCount = 0; }
        Sound.thud(); spend(0.5); updateInv(); return;
      }
      const items = matching(e); if (!items.length) return;
      if (e.binCap && !e.binCap()) { Sound.error(); return; }
      if (e.multi) { let left = 0; for (const it of items) { if (e.binCap && !e.binCap()) { left++; continue; } placeInto(e, it); } if (left) notify('The bin is full — take its bag to the bins outside (back door).'); return; }
      return placeInto(e, items.includes(h) ? h : items[0]);
    }
    if (e.kind === 'scrub' || e.kind === 'sweep') {
      const need = e.kind === 'sweep' ? 'broom' : e.tool;
      if (tl !== need) { const i = slotOfTool(need); if (i >= 0) return selectSlot(i); Sound.error(); return notify(`You need the ${TOOL_INFO[need].name} — it's in the Storage room at the end of the hallway.`); }
      using = { e, acc: 0, t: 0 };
      return;
    }
    if (e.kind === 'act') return e.act();
  }

  function busyAction(label, dur, cost, sfx, cb) { if (S.busy) return; S.busy = { label, t: 0, dur, cost: cost || 0, cb }; if (sfx && Sound[sfx]) Sound[sfx](); }

  function applyUse(dt) {
    if (!using) return;
    const e = using.e;
    if (e.done || target !== e) { using = null; return; }
    swing += dt * 9;
    if (e.kind === 'scrub') {
      let dec = using.acc * CFG.SCRUB_PER_PX + (keys.KeyE || mouseDown ? dt * CFG.SCRUB_HOLD * (using.acc > 0 ? 0.3 : 1) : 0);
      dec /= e.hard; using.acc = 0;
      e.amount = Math.max(0, e.amount - dec);
      using.t += dt; if (using.t > 0.35) { using.t = 0; Sound.wipe(); }
      if (e.decal) e.model.alpha = 0.15 + 0.85 * e.amount; else e.model.dust = e.amount * (e.model._dust0 || 1);
      if (e.amount <= 0) { e.done = true; if (e.decal) e.model.visible = false; else e.model.dust = 0; Sound.pick(); notify(`✨ The ${e.name} is clean.`, 1800); if (e.onDone) e.onDone(); using = null; checkEvents(); }
    } else if (e.kind === 'sweep') {
      e.amount = Math.max(0, e.amount - dt * CFG.SWEEP_RATE);
      const f = [-Math.sin(P.yaw), -Math.cos(P.yaw)];
      e.model.pos[0] += f[0] * dt * 0.55; e.model.pos[2] += f[1] * dt * 0.55;
      e.model.scale = 0.35 + 0.65 * e.amount; e.model.alpha = 0.2 + 0.8 * e.amount;
      using.t += dt; if (using.t > 0.45) { using.t = 0; Sound.sweep(); }
      if (e.amount <= 0) { e.done = true; e.model.visible = false; Sound.pick(); using = null; checkEvents(); }
    }
  }

  function checkEvents() {
    if (!S.flags.recipeHint && roomPct('KT') >= 0.2 && S.cake.stage === 'none' && !S.prelude) { S.flags.recipeHint = true; notify('There\'s a card sticking out of the drawer next to the stove...', 5000); }
    if (!S.flags.cleanAll && housePct() >= 0.995) { S.flags.cleanAll = true; notify('✨ The house is spotless!', 5000); }
    updateInv();
  }

  // ======== CAKE ========
  function ingredients() {
    runScene(async () => {
      await overlay(`<h2 class="ot">Ingredients</h2><div class="ing"><div>✅ Flour</div><div>✅ Sugar</div><div>❌ Eggs <i>(fridge is empty)</i></div><div>✅ Butter <i>(old but usable)</i></div><div>❌ Fresh strawberries</div><div>✅ Milk <i>(expired... probably fine?)</i></div><div>✅ Vanilla extract</div></div>`, 'Next');
      const i = await choose("You're missing eggs and strawberries. What do you do?", ['Make it anyway (imperfect cake)', 'Skip the cake', 'Look for substitutes in the cabinets (takes time)']);
      if (i === 1) { S.cake.stage = 'skipped'; return; }
      if (i === 0) { S.cake.ing = 0; S.cake.stage = 'ingredients'; notify('Mix the batter at the kitchen island.'); return; }
      setMode('play');
      busyAction('Searching the cabinets...', 2.5, 35, 'paper', () => runScene(async () => { S.cake.ing = 1; S.cake.stage = 'ingredients'; await G.narr('(Behind the cereal you find powdered eggs and a jar of Mom\'s homemade strawberry jam, labelled in her handwriting: "For special days ♡")'); notify('Mix the batter at the kitchen island.'); }));
    });
  }
  function mixGame() {
    runScene(async () => {
      const score = await new Promise(res => {
        overlay(`<h2 class="ot">Mix the batter</h2><p>Press <b>SPACE</b> or <b>click</b> when the needle is inside the glowing zone (5 times)</p><canvas id="mixc" width="420" height="70"></canvas><p id="mixs">0 / 5</p>`, null, 'mini');
        const cv = $('mixc'), c = cv.getContext('2d'); let t = 0, n = 0, hits = 0, zc = 0.3 + Math.random() * 0.4, last = performance.now(), fin = false;
        const press = () => { if (fin) return; const pos = (Math.sin(t * 3.0) + 1) / 2; if (Math.abs(pos - zc) < 0.08) { hits++; Sound.pick(); } else Sound.error(); n++; zc = 0.15 + Math.random() * 0.7; $('mixs').textContent = `${n} / 5 — ${hits} hits`; if (n >= 5) { fin = true; window.removeEventListener('keydown', kh); setTimeout(() => { ovResolve && ovResolve(); res(hits / 5); }, 400); } };
        const kh = e => { if (e.code === 'Space') { e.preventDefault(); press(); } };
        cv.onclick = press; window.addEventListener('keydown', kh);
        (function loop(now) { if (fin) return; t += (now - last) / 1000; last = now; const pos = (Math.sin(t * 3.0) + 1) / 2; c.fillStyle = '#2a2420'; c.fillRect(0, 0, 420, 70); c.fillStyle = '#e8c070'; c.fillRect((zc - 0.08) * 420, 10, 0.16 * 420, 50); c.fillStyle = '#fff'; c.fillRect(pos * 420 - 3, 0, 6, 70); requestAnimationFrame(loop); })(last);
      });
      S.cake.mix = score; S.cake.stage = 'mixed'; spend(25);
      await G.think('Mom used to let me help with this part...');
      tint('flash'); await G.narr('(A memory: you and Mom in the kitchen, flour on your noses, both laughing.)'); tint(null);
      await G.say('You', 'I miss those days.');
      notify('Put the batter in the oven.');
    });
  }
  function ovenAct() {
    const st = S.cake.stage;
    if (st === 'mixed') { Sound.door(); S.cake.stage = 'baking'; S.oven = { t: 0 }; M.oven.parts[1].c = C(0xff8a30); M.oven.parts[1].em = 1; M.oven.dirty = true; notify('⏲ Baking. Come back as soon as you hear the "ding"! (You can clean meanwhile)', 5000); }
    else if (st === 'baking') notify('Not yet. ' + Math.ceil(CFG.OVEN_SEC - S.oven.t) + ' seconds left.');
    else if (st === 'ready') {
      if (freeSlot() < 0) { Sound.error(); return notify('Your hands are full! Drop something (G) and grab the cake!'); }
      const late = S.cake.late; Sound.door(); Sound.alarm(false); S.oven = null; S.cake.stage = 'removed';
      M.oven.parts[1].c = C(0x111111); M.oven.parts[1].em = 0; M.oven.dirty = true;
      if (late <= 10) { S.cake.bake = 1; notify('🎂 Golden brown — perfect!'); } else if (late <= 20) { S.cake.bake = 0.5; notify('A bit dark... slightly overbaked.'); } else { S.cake.bake = 0; S.cake.burnt = true; notify('Burnt black... and still smoking.'); }
      cakeParts(false); const ce = ENT.find(e => e.id === 'cake'); M.cake.visible = true; pickUp(ce);
      notify('Carry the cake to the dining table.');
    }
  }
  function cakeParts(decorated) {
    const sponge = S.cake.burnt ? C(0x2a1a10) : S.cake.bake < 1 ? C(0x9a6a3a) : C(0xe0b070);
    const parts = [pt(-0.2, 0, -0.2, 0.2, 0.02, 0.2, C(0xf2f2f2), 13), pt(-0.15, 0.02, -0.15, 0.15, 0.14, 0.15, sponge)];
    if (decorated && !S.cake.burnt) {
      parts.push(pt(-0.155, 0.14, -0.155, 0.155, 0.17, 0.155, S.cake.ing ? C(0xf4b8c8) : C(0xf6f0e4)));
      if (S.cake.ing) [[-0.08, -0.08], [0.08, -0.06], [0, 0.08], [-0.07, 0.05], [0.07, 0.07]].forEach(([dx, dz]) => parts.push(pt(dx - 0.02, 0.17, dz - 0.02, dx + 0.02, 0.2, dz + 0.02, C(0xd02030))));
      [[-0.05, 0], [0.05, 0], [0, -0.05]].forEach(([dx, dz]) => { parts.push(pt(dx - 0.008, 0.17, dz - 0.008, dx + 0.008, 0.26, dz + 0.008, C(0xf0f0ff))); parts.push(pt(dx - 0.012, 0.26, dz - 0.012, dx + 0.012, 0.29, dz + 0.012, C(0xffc040), 0, { em: 1 })); });
    }
    M.cake.parts = parts; M.cake.dirty = true;
  }
  function decorateCake(it) {
    runScene(async () => {
      if (S.cake.burnt) { await G.think("It's burnt... I'll put it out anyway."); S.cake.quality = 'burnt'; }
      else {
        const msg = await new Promise(res => {
          overlay(`<h2 class="ot">Decorate the cake</h2><p>Write a message in icing (optional):</p><input id="cmsg" maxlength="28" placeholder="Happy Anniversary / I love you both / For Mom"><br>`, 'Done', 'mini').then(() => res($('cmsg') ? $('cmsg').value.trim() : ''));
          setTimeout(() => $('cmsg') && $('cmsg').focus(), 50);
          const inp = $('cmsg'); inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { const v = inp.value.trim(); ovResolve && ovResolve(); res(v); } });
        });
        S.cake.msg = msg || '';
        const perfect = S.cake.ing === 1 && S.cake.mix >= 0.8 && S.cake.bake === 1 && !!S.cake.msg;
        const good = S.cake.bake >= 0.5 && (S.cake.ing + S.cake.mix + S.cake.bake) >= 1.2;
        S.cake.quality = perfect ? 'perfect' : good ? 'good' : 'basic';
      }
      spend(15); cakeParts(true); M.cake.pos = [14.5, 0.78, 14.75]; S.cake.placed = true; Sound.chime();
      notify(`🎂 The cake is on the table — quality: ${{ perfect: 'Perfect ♡', good: 'Good', basic: 'Basic', burnt: 'Burnt' }[S.cake.quality]}`);
    });
  }

  // ======== DISH WASHING MINIGAME ========
  function washDishes(it) {
    it.model.visible = false;
    runScene(async () => {
      for (let plate = 0; plate < 3; plate++) {
        await new Promise(res => {
          overlay(`<h2 class="ot">Wash the dishes — plate ${plate + 1}/3</h2><canvas id="dishc" width="360" height="360"></canvas><p class="small">Hold the mouse button and scrub the grime off</p><div id="dishp" class="small">0%</div>`, null, 'mini');
          const cv = $('dishc'), c = cv.getContext('2d');
          c.fillStyle = '#5a8aa0'; c.fillRect(0, 0, 360, 360);
          for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(255,255,255,.08)'; c.beginPath(); c.arc(Math.random() * 360, Math.random() * 360, 4 + Math.random() * 10, 0, 7); c.fill(); }
          c.fillStyle = '#f4f2ee'; c.beginPath(); c.arc(180, 180, 150, 0, 7); c.fill(); c.strokeStyle = '#d8d4cc'; c.lineWidth = 6; c.beginPath(); c.arc(180, 180, 110, 0, 7); c.stroke();
          const grime = document.createElement('canvas'); grime.width = grime.height = 360; const g = grime.getContext('2d');
          for (let i = 0; i < 26; i++) { const a = Math.random() * 7, r = Math.random() * 130; g.fillStyle = ['rgba(120,80,30,.9)', 'rgba(90,110,40,.85)', 'rgba(150,60,40,.85)'][i % 3]; g.beginPath(); g.ellipse(180 + Math.cos(a) * r, 180 + Math.sin(a) * r, 12 + Math.random() * 26, 8 + Math.random() * 18, Math.random() * 3, 0, 7); g.fill(); }
          const base = c.getImageData(0, 0, 360, 360);
          const total = countPix(g);
          const draw = () => { c.putImageData(base, 0, 0); c.drawImage(grime, 0, 0); };
          draw();
          let down = false, lx = 0, ly = 0, check = 0, fin = false;
          const posOf = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 360 / r.width, (e.clientY - r.top) * 360 / r.height]; };
          cv.onmousedown = e => { down = true;[lx, ly] = posOf(e); }; window.onmouseup = () => down = false;
          cv.onmousemove = e => {
            if (!down || fin) return; const [x, y] = posOf(e);
            g.globalCompositeOperation = 'destination-out'; g.lineCap = 'round'; g.lineWidth = 72; g.strokeStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.moveTo(lx, ly); g.lineTo(x, y); g.stroke(); g.globalCompositeOperation = 'source-over';
            lx = x; ly = y; draw(); if (Math.random() < 0.15) Sound.wipe();
            if (++check % 6 === 0) { const left = countPix(g) / total; $('dishp').textContent = Math.round((1 - left) * 100) + '% clean'; if (left < 0.1) { fin = true; Sound.pick(); setTimeout(() => { ovResolve(); res(); }, 250); } }
          };
        });
        spend(3);
      }
      const n = countDone('kt_dish') + 1;
      setPartsW(M.dishRack, [pt(23.4, 0.93, 9.7, 24.0, 0.96, 10.25, C(0x9aa0a6), 13), ...Array.from({ length: n * 2 }, (_, k) => pt(23.45 + k * 0.065, 0.96, 9.8, 23.47 + k * 0.065, 1.22, 10.15, C(0xf4f2ee), 13))]);
      checkEvents();
    });
  }
  function countPix(g) { const d = g.getImageData(0, 0, 360, 360).data; let n = 0; for (let i = 3; i < d.length; i += 32) if (d[i] > 40) n++; return n || 1; }

  // ======== PHASE 2 PHOTO ========
  function throwPieces() {
    runScene(async () => {
      const i = await choose('These pieces hurt to look at. Throw them away?', ['Keep them', 'Throw them away']);
      if (i !== 1) return;
      await G.think("What's the point? She's gone. These pieces won't bring her back.");
      Sound.paper(); await G.say('You', 'Better to forget. Like Dad wanted.');
      S.flags.thrown = true; S.pieces.clear();
    });
  }
  function openPhoto() {
    if (!S || !S.phase2 || MODE !== 'play') return;
    runScene(async () => {
      const n = S.pieces.size, has6 = S.pieces.has(6), btns = [];
      if (n === 12 && !S.assembled) btns.push(['Tape the photo back together', 'tape']);
      if (n === 11 && !has6 && !S.assembled) { btns.push(["Draw Mom's face" + (S.hasCrayons ? '' : ' (needs crayons)'), 'draw']); btns.push(['Wait for Dad and talk honestly', 'wait']); }
      btns.push(['Close', 'close']);
      const choice = await new Promise(res => {
        overlay(`<h2 class="ot">Photo pieces: ${n}/12</h2><canvas id="phc" width="480" height="360"></canvas><p class="small">${S.assembled ? 'The photo is taped together. Mom always hung photos up high...' : has6 ? 'Her face is here.' : 'Piece #6 (her face) is still missing.'}</p><div class="obtns">${btns.map(b => `<button class="btn" data-a="${b[1]}">${b[0]}</button>`).join('')}</div>`, null, 'photo');
        drawPhoto($('phc'), S.pieces, null, S.assembled);
        document.querySelectorAll('#ocard [data-a]').forEach(b => b.onclick = () => { ovResolve(); res(b.dataset.a); });
      });
      if (choice === 'tape') { spend(20); S.assembled = true; Sound.paper(); await G.say('You', "It's perfect. It's finally complete."); await G.think('Mom used to hang our family photos high up... The attic ladder in the hallway leads to the roof.'); notify('New goal: hang the photo on the roof (attic ladder in the hallway)', 6000); }
      else if (choice === 'draw') { if (!S.hasCrayons) { await G.think("I need crayons... I think there's a box on my desk."); return; } await drawGame(); }
      else if (choice === 'wait') { const i = await choose("Don't draw it. Don't force it. Just wait for Dad and tell him the truth?", ['Wait for Dad', 'Not yet']); if (i === 0) { await G.say('You', "I can't do this alone. I need to talk to Dad."); endingImmediate(21); } }
    });
  }
  async function drawGame() {
    const late = S.time >= CFG.END - 35;
    await G.say('You', "I can't find her face anywhere. That piece is gone.");
    await G.say('You', 'But... I could draw it. I remember what she looked like... right?');
    const steps = [["Draw Mom's eyes", "That's not right... not right at all."], ["Draw Mom's nose", "Why can't I remember?!"], ["Draw Mom's smile", "I can't... I can't remember what she looked like..."]];
    let img = null;
    for (let k = 0; k < steps.length; k++) {
      await new Promise(res => {
        overlay(`<h2 class="ot">${steps[k][0]}</h2><canvas id="drw" width="320" height="320"></canvas><p class="small">Hold the left mouse button to draw</p><div class="obtns"><button class="btn" id="dok">Done</button></div>`, null, 'mini');
        const cv = $('drw'), c = cv.getContext('2d');
        if (S._drawState) c.putImageData(S._drawState, 0, 0);
        else { c.fillStyle = '#f5efe2'; c.fillRect(0, 0, 320, 320); c.strokeStyle = '#c9b89a'; c.lineWidth = 3; c.setLineDash([6, 6]); c.beginPath(); c.ellipse(160, 165, 105, 130, 0, 0, 7); c.stroke(); c.setLineDash([]); }
        let down = false, lx = 0, ly = 0;
        const posOf = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 320 / r.width, (e.clientY - r.top) * 320 / r.height]; };
        cv.onmousedown = e => { down = true;[lx, ly] = posOf(e); }; window.onmouseup = () => down = false;
        cv.onmousemove = e => { if (!down) return; const [x, y] = posOf(e); c.strokeStyle = ['#5a3020', '#3a2418', '#c0504a'][k]; c.lineCap = 'round'; for (let j = 0; j < 3; j++) { c.lineWidth = 3 + Math.random() * 3; c.beginPath(); c.moveTo(lx + Math.random() * 2, ly + Math.random() * 2); c.lineTo(x + Math.random() * 2, y + Math.random() * 2); c.stroke(); } lx = x; ly = y; if (Math.random() < 0.3) Sound.scribble(); };
        $('dok').onclick = () => { S._drawState = c.getImageData(0, 0, 320, 320); img = cv.toDataURL(); ovResolve(); res(); };
      });
      spend(10);
      if (late && k === 0) { notify('⚠ 4:55 PM — Dad will be home in 5 minutes!', 4000); S.time = CFG.END - 5; S._drawState = null; endingImmediate(13); return; }
      await G.say('You', steps[k][1]);
    }
    S._drawState = null;
    const im = new Image(); im.src = img; await new Promise(r => { im.onload = r; setTimeout(r, 300); });
    S.drawing = im;
    await G.narr("(You tape the crayon face into the gap where piece #6 should be.)");
    await G.showPhoto(true);
    await G.say('You', 'This is wrong. This is all wrong.');
    await G.narr('(But you have nothing else.)');
    endingImmediate(15);
  }

  // ======== GAME BOY ========
  async function gameboyRoute() {
    await runScene(async () => {
      await new Promise(res => {
        overlay(`<h2 class="ot">GAME BOY</h2><canvas id="gbc" width="160" height="144"></canvas><p class="small">← → to catch the blocks. <span id="gbt"></span></p>`, null, 'gb');
        const cv = $('gbc'), c = cv.getContext('2d'); let px = 70, blocks = [], score = 0, t0 = performance.now(), last = t0, spawn = 0, end = false;
        const kh = e => { if (e.code === 'ArrowLeft' || e.code === 'KeyA') px -= 10; if (e.code === 'ArrowRight' || e.code === 'KeyD') px += 10; px = Math.max(0, Math.min(136, px)); };
        window.addEventListener('keydown', kh);
        (function loop(now) {
          const dt = (now - last) / 1000; last = now; const left = 15 - (now - t0) / 1000;
          spawn -= dt; if (spawn <= 0) { blocks.push({ x: Math.random() * 150, y: -8 }); spawn = 0.5; }
          c.fillStyle = '#9bbc0f'; c.fillRect(0, 0, 160, 144); c.fillStyle = '#0f380f';
          blocks.forEach(b => { b.y += 60 * dt; c.fillRect(b.x, b.y, 8, 8); if (b.y > 128 && b.y < 138 && b.x > px - 6 && b.x < px + 24) { b.y = 999; score++; Sound.blip(); } });
          blocks = blocks.filter(b => b.y < 150); c.fillStyle = '#306230'; c.fillRect(px, 134, 24, 6);
          c.fillStyle = '#0f380f'; c.font = '10px monospace'; c.fillText('SCORE ' + score, 4, 12); $('gbt').textContent = Math.max(0, Math.ceil(left)) + 's';
          if (left <= 0 && !end) { end = true; window.removeEventListener('keydown', kh); setTimeout(() => { ovResolve(); res(); }, 300); return; }
          requestAnimationFrame(loop);
        })(t0);
      });
      await fade(true, 800); S.time = Math.max(S.time, 990); await fade(false, 600);
      await G.say('You', `Oh no! It's already ${fmtTime(S.time)}! I lost track of time!`);
    });
    if (!S.ended) skipTo(CFG.END, S.phase2 ? 19 : 4);
  }

  // ======== PHASE 2 PRELUDE ========
  async function preludeGrave() {
    await runScene(async () => {
      await Story.grave(G);
      save.phase2 = true; persist(); S.ended = true;
      await fade(true, 1500); setFadeText('PHASE 2', 'Find the 12 pieces. Find her face.'); await wait(3500); setFadeText('', '');
      goMenu();
    });
  }
  async function startPrelude() {
    newRun({ prelude: true }); S.time = 1380;
    P.x = 15.2; P.z = 2.0; P.level = 0; P.yaw = 0.3; P.pitch = -0.3; camOverride = null;
    setMode('cutscene'); Sound.setMood('sad'); setFadeText('', '');
    await fade(false, 1200);
    await G.narr('(Night. The house is silent. Dad is asleep.)');
    await G.narr("(Something is glowing on your desk... it wasn't there before.)");
    setMode('play');
  }

  // ======== ENDINGS ========
  function skipTo(t, endingId) {
    runScene(async () => {
      await fade(true, 700); S.time = t; await wait(250);
      if (t >= CFG.END && !endingId) { evaluate5PM(); return; }
      if (endingId) { endingImmediate(endingId); return; }
      await fade(false, 500);
    });
  }
  const collectInfo = () => ({ clean: housePct(), cakeMsg: S.cake.msg, pieces: S.pieces.size });
  async function endingImmediate(id) {
    if (S.ended) return;
    S.ended = true; S.busy = null; using = null; setMode('cutscene'); Sound.stopAll();
    clearInv();
    let sub = null;
    try {
      if ([13, 15, 18, 19, 21].includes(id)) S.time = Math.max(S.time, CFG.END);
      if (id === 18) { await G.narr('(You trip on the edge of the rug. The pieces scatter across the floor.)'); await G.say('You', 'No!'); }
      const r = await Story['e' + id](G, collectInfo()); if (typeof r === 'string') sub = r;
    } catch (e) { reportErr(e); }
    await finishEnding(id, sub);
  }
  async function finishEnding(id, sub) {
    save.endings[id] = true; if (id === 3) save.badCount = (save.badCount || 0) + 1; persist();
    await endingCard(id, sub);
    if (id === 3 && save.badCount >= 10 && !save.endings[5]) { setMode('cutscene'); const yes = await Story.e5(G); if (yes) { save.endings[5] = true; save.sadUnlocked = true; persist(); await endingCard(5, null); } }
    if (!save.phase2 && endingCount() >= 7) { show('ending', false); return startPrelude(); }
    goMenu();
  }
  function endingCard(id, sub) {
    return new Promise(res => {
      const En = ENDINGS[id]; setMode('cutscene'); show('dialog', false);
      Sound.setMood(id === 7 || id === 16 || id === 21 ? 'warm' : 'sad');
      $('etitle').textContent = En.name; $('esub').textContent = sub ? `${En.sub} — ${sub}` : En.sub;
      $('estar').textContent = En.star === 2 ? '✨✨ ULTIMATE TRUE ENDING ✨✨' : En.star ? '✨ TRUE ENDING ✨' : '';
      $('ecount').textContent = `${endingCount()}/21 endings unlocked` + (id === 3 ? ` · Bad Endings: ${save.badCount}/10` : '');
      $('ebig').textContent = 'ENDING #' + id;
      show('ending', true); Sound.chime();
      $('enext').onclick = () => { show('ending', false); res(); };
    });
  }
  async function evaluate5PM() {
    if (S.ended) return;
    S.ended = true; using = null; setMode('cutscene'); Sound.stopAll();
    clearInv();
    await fade(true, 700);
    const clean = housePct(), n = S.pieces.size, has6 = S.pieces.has(6);
    const cakeOk = S.cake.placed && (S.cake.quality === 'perfect' || S.cake.quality === 'good');
    let id;
    if (S.flags.trap) id = 6;
    else if (S.phase2 && S.flags.thrown) id = 12;
    else if (S.phase2 && S.flags.hoard) id = 17;
    else if (S.phase2 && has6) id = 11;
    else if (S.phase2 && n === 11) id = 13;
    else if (S.phase2 && n >= 3) id = 10;
    else if (S.phase2 && clean < 0.2 && S.cake.stage === 'none') id = 9;
    else if (clean >= 0.85 && cakeOk) id = (save.settings.easter || Math.random() < CFG.WRONG_DAY_CHANCE) ? 7 : 2;
    else if (clean >= 0.5) id = 1;
    else id = 3;
    let sub = null;
    try {
      if (id === 13) { G.placePlayerForArrival(); showDad({ x: 2.5, z: 19.2, rot: Math.PI }); Sound.car(); await wait(1500); Sound.door(); await fade(false, 500); await G.say('Dad', "I'm home!"); await G.narr("(You're still sitting with 11 pieces. Only her face is missing.)"); await G.say('Dad', 'Were you... working on something?'); await G.say('You', 'I was so close...'); }
      else { const r = await Story['e' + id](G, collectInfo()); if (typeof r === 'string') sub = r; }
    } catch (e) { reportErr(e); }
    await finishEnding(id, sub);
  }
  async function fireEnding() {
    if (S.ended) return;
    S.ended = true; S.busy = null; using = null; setMode('cutscene'); S.fireLevel = 1;
    camOverride = { eye: [21.5, 1.6, 15.5], target: [19.3, 0.8, 10.3] };
    await wait(2500); Sound.alarm(false); await fade(true, 1200); Sound.fire(false);
    camOverride = { eye: [34, 1.6, 16], target: [22, 2.6, 12] }; S.fireLevel = 2;
    const fl = [];
    for (let i = 0; i < 30; i++) { const x = 15 + Math.random() * 11, z = 9 + Math.random() * 11, h = 0.8 + Math.random() * 2.4, w = 0.4 + Math.random() * 0.9; fl.push(pt(x - w / 2, 2.9, z - w / 2, x + w / 2, 2.9 + h, z + w / 2, Math.random() < 0.5 ? C(0xff7a20) : C(0xffc040), 9, { em: 1, a: 0.85 })); }
    fl.push(pt(26.0, 0.1, 14.0, 26.1, 2.1, 15.3, C(0xff8a30), 9, { em: 1 })); fl.push(pt(26.0, 1.0, 17.2, 26.1, 2.1, 18.8, C(0xff6a20), 9, { em: 1 }));
    mw(fl, { indoor: false });
    await fade(false, 1000); Sound.fire(true);
    try { await Story.e8(G); } catch (e) { reportErr(e); }
    Sound.fire(false);
    await finishEnding(8, null);
  }

  // ======== START GAME ========
  async function startGame() {
    Sound.init(); show('menu', false);
    newRun();
    P.x = 13.0; P.z = 3.0; P.level = 0; P.yaw = 0; P.pitch = 0;
    setMode('cutscene');
    $('fade').style.opacity = '1';
    setFadeText('3:00 AM', "Mom and Dad's wedding anniversary"); await wait(2000); setFadeText('', '');
    let c; try { c = await Story.intro(G); } catch (e) { reportErr(e); }
    camOverride = null;
    if (c === 0) {
      await fade(true, 800); S.time = 360; S.dadLeft = true; hideDad();
      setFadeText('6:00 AM', ''); Sound.ding(); await wait(1500); setFadeText('', '');
      P.x = 14.3; P.z = 3.4; P.yaw = -Math.PI / 2 + 0.6;
      await fade(false, 800); await Story.dadLeaves(G);
    } else {
      S.early = true; S.time = 185;
      showDad({ x: 8.3, z: 13.75, rot: Math.PI, sit: true });
      P.x = 14.3; P.z = 3.4; P.yaw = -Math.PI / 2 + 0.6;
      notify('Dad is sitting in the living room. He leaves for work at 6:00.', 5000);
    }
    notify('Cleaning tools are in the <b>Storage room</b> (end of the hallway). <b>M</b> = map. Check the time on the <b>hallway clock</b>.', 8000);
    if (S.phase2) notify('📸 You hold piece #1. 11 more are hidden around the house... (P: view photo)', 7000);
    Sound.setMood('calm'); setMode('play');
  }
  async function dadLeavesEarly() {
    S.dadLeft = true;
    await runScene(async () => {
      if (dadModel && dadModel.visible && Math.hypot(dadModel.pos[0] - P.x, dadModel.pos[2] - P.z) < 8) await G.say('Dad', "I'm off to work. Remember what I asked, okay?");
      hideDad(); await Story.dadLeaves(G);
    });
  }
  function goMenu() {
    Sound.stopAll(); Sound.setMood('calm'); camOverride = null;
    for (const m of MODELS) Engine.freeModel(m); for (const m of OVERLAY) Engine.freeModel(m);
    S = null; MODELS = []; ENT = []; OVERLAY = []; dadModel = null;
    setMode('menu');
    ['dialog', 'choices', 'overlay', 'qte', 'ending', 'pause', 'details', 'bigmap', 'progress', 'inv'].forEach(id => show(id, false));
    tint(null); setFadeText('', ''); fade(false, 600); if (menuStatic) menuStatic.forEach(m => Engine.freeModel(m)); menuStatic = null;
    show('menu', true); refreshMenu();
  }

  // ======== INPUT ========
  const canvas = $('c');
  canvas.addEventListener('mousedown', e => {
    Sound.init();
    if (MODE !== 'play') return;
    if (!locked) { lockPointer(); return; }
    if (e.button === 0) { mouseDown = true; tryInteract(); }
    if (e.button === 2 && S) dropHeld(true);
  });
  window.addEventListener('mouseup', e => { if (e.button === 0) { mouseDown = false; if (using && !keys.KeyE) using = null; } });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => { if (MODE !== 'play' || !S) return; selectSlot((S.inv.sel + (e.deltaY > 0 ? 1 : 2)) % 3); }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked && MODE === 'play' && !ignoreUnlock) openPause();
    ignoreUnlock = false; updateLockHint();
  });
  document.addEventListener('mousemove', e => {
    if (!locked || MODE !== 'play') return;
    const s = 0.0022 * save.settings.sens;
    P.yaw -= e.movementX * s; P.pitch -= e.movementY * s * (save.settings.invert ? -1 : 1);
    P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch));
    if (using && using.e.kind === 'scrub') using.acc += Math.min(80, Math.hypot(e.movementX, e.movementY));
  });
  window.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    const first = !keys[e.code]; keys[e.code] = true;
    if (e.code === 'Escape') { e.preventDefault(); return handleEscape(); }
    if (e.code === 'Tab') { e.preventDefault(); if (MODE === 'play') show('details', !isShown('details')); return; }
    if (dlgResolve && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE')) { e.preventDefault(); advanceDialog(); return; }
    if (chResolve && /^Digit[1-9]$/.test(e.code)) { const i = +e.code.slice(5) - 1; if (i < chResolve.n) chResolve(i); return; }
    if (MODE === 'play' && S) {
      if (e.code === 'KeyE' && first) tryInteract();
      if (e.code === 'KeyP') openPhoto();
      if (e.code === 'KeyG') dropHeld(false);
      if (e.code === 'KeyF') dropHeld(true);
      if (e.code === 'KeyM') show('bigmap', !isShown('bigmap'));
      if (/^Digit[1-3]$/.test(e.code)) selectSlot(+e.code.slice(5) - 1);
    }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyE' && using && !mouseDown) using = null; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; using = null; });

  // Escape closes the top-most panel first
  function handleEscape() {
    if (isShown('settings')) return closeSettings();
    if (isShown('gallery')) return show('gallery', false);
    if (isShown('help')) return show('help', false);
    if (isShown('bigmap')) return show('bigmap', false);
    if (MODE === 'paused') return closePause();
    if (MODE === 'play') return openPause();
  }
  function tryInteract() { if (!S || S.busy || MODE !== 'play' || !target) return; const t = target; try { interact(t); } catch (e) { reportErr(e); } }
  function openPause() { if (MODE !== 'play') return; setMode('paused'); show('pause', true); }
  function closePause() { show('pause', false); setMode('play'); lockPointer(); }
  function lockPointer() { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
  let settingsFrom = null;
  function openSettings(from) { settingsFrom = from; if (from === 'pause') show('pause', false); show('settings', true); refreshMenu(); }
  function closeSettings() { show('settings', false); if (settingsFrom === 'pause' && MODE === 'paused') show('pause', true); settingsFrom = null; }

  // ======== UPDATE ========
  function camEye() { return [P.x, (P.level ? 3.0 : 0) + CFG.EYE + Math.sin(P.bob) * 0.035, P.z]; }
  function camDir() { const cp = Math.cos(P.pitch); return [-Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp]; }
  function move(dt) {
    let fx = 0, fz = 0;
    if (keys.KeyW || keys.ArrowUp) fz += 1; if (keys.KeyS || keys.ArrowDown) fz -= 1;
    if (keys.KeyA || keys.ArrowLeft) fx -= 1; if (keys.KeyD || keys.ArrowRight) fx += 1;
    P.running = !!(keys.ShiftLeft || keys.ShiftRight);
    P.moving = !!(fx || fz) && !S.busy;
    if (!P.moving) return;
    const l = Math.hypot(fx, fz); fx /= l; fz /= l;
    const sp = (P.running ? CFG.RUN : CFG.WALK) * dt * (using ? 0.5 : 1);
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    let nx = P.x + (-sy * fz + cy * fx) * sp, nz = P.z + (-cy * fz - sy * fx) * sp;
    for (let it = 0; it < 3; it++)[nx, nz] = collide(nx, nz);
    P.x = nx; P.z = nz;
    P.bob += dt * (P.running ? 13 : 9); P.step += dt * (P.running ? 2.6 : 1.8);
    if (P.step > 1) { P.step = 0; Sound.step(); }
  }
  function collide(nx, nz) {
    const R = CFG.RAD;
    for (const c of World.colliders) {
      if (!c.on || c.lvl !== P.level || (c.y2 - c.y1) < 0.2) continue;
      const cx = Math.max(c.x1, Math.min(nx, c.x2)), cz = Math.max(c.z1, Math.min(nz, c.z2));
      const dx = nx - cx, dz = nz - cz, d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      if (d2 > 1e-9) { const d = Math.sqrt(d2); nx = cx + dx / d * R; nz = cz + dz / d * R; }
      else { const ps = [[c.x1 - R - nx, 0], [c.x2 + R - nx, 0], [0, c.z1 - R - nz], [0, c.z2 + R - nz]]; ps.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1])); nx += ps[0][0]; nz += ps[0][1]; }
    }
    return [nx, nz];
  }
  function pick() {
    const eye = camEye(), dir = camDir();
    let wallT = Infinity;
    for (const c of World.colliders) {
      if (!c.on || c.lvl !== P.level || (c.y2 - c.y1) < 1.7) continue;
      if (Math.abs((c.x1 + c.x2) / 2 - P.x) > 8 && Math.abs((c.z1 + c.z2) / 2 - P.z) > 8) continue;
      const t = rayBox(eye, dir, [c.x1, c.y1, c.z1], [c.x2, c.y2, c.z2]); if (t != null && t < wallT) wallT = t;
    }
    let best = null, bt = CFG.REACH, lab = null;
    for (const e of ENT) {
      if ((e.lvl || 0) !== P.level) continue;
      const m = e.model; if (!m || e.carried || !(m.visible || m.ghost)) continue;
      const [mn, mx] = aabb(m);
      if (mn[0] > P.x + 3.2 || mx[0] < P.x - 3.2 || mn[2] > P.z + 3.2 || mx[2] < P.z - 3.2) continue;
      let t = rayBox(eye, dir, mn, mx);
      if (t == null || t > wallT + 0.05 || t > CFG.REACH) continue;
      if (m.parts.length > 1) t = rayParts(m, eye, dir);           // precise test per part
      if (t == null || t > wallT + 0.05) continue;
      const l = labelFor(e); if (!l) continue;
      if (e.kind === 'dest') t -= 0.5;   // prefer the place to put things
      if (t < bt) { best = e; bt = t; lab = l; }
    }
    if (best) best._lab = lab;
    return best;
  }

  let hudT = 0, tickT = 0, clumsyT = 0, mapT = 0;
  function update(dt) {
    envClock += dt;
    for (const l of World.lights) l.f = l.flicker ? 1 - l.flicker * (0.5 + 0.5 * Math.sin(envClock * 11 + l.p[0]) * Math.sin(envClock * 3.7)) * (Math.random() < 0.02 ? 2 : 1) : 1;
    if (!S) return;
    for (const m of MODELS) if (m._vis) m.visible = m._vis();
    updateSmoke(dt); updateHeld(dt); updateClocks();
    if (MODE !== 'play') return;
    move(dt);
    updatePhysics(dt);
    if (!S.prelude) {
      const rate = CFG.RATE * (save.settings.speed || 1);
      S.time += dt * rate;
      if (S.oven && S.cake.stage === 'baking') S.time += dt * rate * (CFG.OVEN_TIMEWARP - 1);
      tickT += dt; if (tickT >= 1) { tickT = 0; let near = 99; for (const c of CLOCKS) near = Math.min(near, Math.hypot(c.x - P.x, c.z - P.z)); Sound.tick(Math.max(0, 1 - near / 7) * 0.8 + Math.max(0, (S.time - 960) / 300)); }
      if (S.early && !S.dadLeft && S.time >= 360) { dadLeavesEarly(); return; }
      if (!S.warned && S.time >= CFG.END - 5) { S.warned = true; notify('⚠ Dad will be home in 5 minutes!', 5000); Sound.heart(); }
      if (S.time >= CFG.END && !S.busy) { evaluate5PM(); return; }
    }
    if (S.busy) {
      const b = S.busy; b.t += dt; S.time += b.cost * dt / b.dur;
      show('progress', true); $('plabel').textContent = b.label; $('pfill').style.width = Math.min(100, b.t / b.dur * 100) + '%';
      if (b.t >= b.dur) { S.busy = null; show('progress', false); try { b.cb(); } catch (e) { reportErr(e); } }
    }
    if (S.oven) {
      S.oven.t += dt;
      if (S.cake.stage === 'baking' && S.oven.t >= CFG.OVEN_SEC) { S.cake.stage = 'ready'; S.cake.late = 0; Sound.ding(); notify('🔔 DING! The cake is ready! Take it out now!', 4000); }
      if (S.cake.stage === 'ready') {
        const prev = S.cake.late; S.cake.late = S.oven.t - CFG.OVEN_SEC; const L = S.cake.late;
        if (prev < 10 && L >= 10) notify('⚠ Something smells burnt! The cake is burning!');
        if (prev < 20 && L >= 20) { notify('🔥 SMOKE! The smoke alarm is going off!', 4000); Sound.alarm(true); M.oven.parts[1].c = C(0xff3010); M.oven.dirty = true; }
        if (prev < 28 && L >= 28) { notify('🔥🔥 THE FIRE IS SPREADING TO THE CABINETS! HURRY!', 4000); Sound.fire(true); }
        if (L >= 35) { S.oven = null; fireEnding(); return; }
      }
    }
    if (S.phase2 && S.pieces.size >= 10 && !S.assembled && P.running && P.moving) {
      clumsyT += dt; if (clumsyT >= 1) { clumsyT = 0; if (Math.random() < CFG.CLUMSY_CHANCE) { S.pieces.clear(); endingImmediate(18); return; } }
    }
    if (!S.busy) {
      const t = pick();
      for (const e of ENT) if (e.model) e.model.hi = false;
      target = t;
      if (t) { if (t.model && !t.model.ghost) t.model.hi = true; $('prompt').innerHTML = `<span class="key">${t.kind === 'scrub' || t.kind === 'sweep' ? 'LMB' : 'E'}</span> ${t._lab}`; show('prompt', true); }
      else show('prompt', false);
      applyUse(dt);
    } else show('prompt', false);
    hudT -= dt; if (hudT <= 0) { hudT = 0.15; updateHUD(); }
    mapT -= dt; if (mapT <= 0) { mapT = 0.1; drawMap(); }
  }
  function updateHeld(dt) {
    for (const m of OVERLAY) m.visible = false;
    if (!S || MODE === 'menu' || camOverride) return;
    const e = camEye(), cp = Math.cos(P.pitch), sp = Math.sin(P.pitch);
    const f = [-Math.sin(P.yaw) * cp, sp, -Math.cos(P.yaw) * cp], r = [Math.cos(P.yaw), 0, -Math.sin(P.yaw)];
    const up = [Math.sin(P.yaw) * sp, cp, Math.cos(P.yaw) * sp];
    const sw = using ? Math.sin(swing) : 0; if (!using) swing = Math.max(0, swing - dt * 4);
    const at = (fw, rt, dn) => [e[0] + f[0] * fw + r[0] * rt - up[0] * dn, e[1] + f[1] * fw + r[1] * rt - up[1] * dn, e[2] + f[2] * fw + r[2] * rt - up[2] * dn];
    const h = held(); if (!h) return;
    if (!h.tool) {
      const m = h.model; m.visible = true;
      if (m._hs == null) { let mx = 0.05; for (const p of m.parts) for (let i = 0; i < 3; i++) mx = Math.max(mx, Math.abs(p.o[i]) * 2 + p.s[i]); m._hs = Math.min(0.9, 0.34 / mx); }
      m.pos = at(0.62, 0.24, 0.3 + 0.05 * Math.sin(P.bob)); m.rotY = P.yaw; m.pitch = 0; m.scale = m._hs; return;
    }
    const tl = h.tool, m = HELD[tl]; if (!m) return;
    m.visible = true; m.rotY = P.yaw;
    if (tl === 'broom' || tl === 'mop') { m.pos = at(0.75 + sw * 0.1, 0.24 + sw * 0.2, 0.22); m.pitch = 0.8; }
    else if (tl === 'rag') { m.pos = at(0.55 + Math.abs(sw) * 0.05, 0.25 + sw * 0.08, 0.3 - Math.abs(sw) * 0.05); m.pitch = P.pitch; }
    else if (tl === 'bag') { m.scale = 0.7 + 0.6 * h.bagCount / CFG.BAG_CAP; m.pos = at(0.6, 0.3, 0.42); m.pitch = 0; }
  }
  function updateClocks() {
    const t = S ? S.time : 1010, hA = ((t / 60) % 12) / 12 * Math.PI * 2, mA = (t % 60) / 60 * Math.PI * 2;
    for (const c of CLOCKS) { c.hh.roll = -hA || 1e-6; c.mh.roll = -mA || 1e-6; if (c.pend) c.pend.roll = Math.sin(envClock * Math.PI) * 0.22 || 1e-6; }
  }
  function updateSmoke(dt) {
    if (!S) return;
    const burning = (S.cake.stage === 'ready' && S.cake.late >= 15) || S.fireLevel;
    for (const s of S.smoke) {
      if (s.life > 0) { s.life -= dt; s.pos[1] += dt * 0.6; s.pos[0] += dt * 0.25 * Math.sin(s.life * 3); s.scale = 1 + (3 - s.life) * 0.5; s.alpha = Math.max(0, s.life / 3) * 0.9; if (s.life <= 0) s.visible = false; }
      else if (burning && Math.random() < dt * 6) {
        s.life = 3; s.visible = true; s.scale = 1;
        s.pos = S.fireLevel === 2 ? [16 + Math.random() * 10, 2.5 + Math.random(), 10 + Math.random() * 9] : [19.1 + Math.random() * 0.4, 0.8, 10.45];
        s.indoor = S.fireLevel === 2 ? false : true;
      }
    }
  }

  // ======== HUD / MAP ========
  function updateHUD() {
    if (!S) return;
    const r = World.roomAt(P.x, P.z); $('roomname').textContent = P.level ? 'Roof' : r ? r.name : 'Outside';
    if (isShown('details')) {
      const pct = Math.round(housePct() * 100);
      const todo = k => {
        const left = {};
        for (const e of ENT) {
          if (!e.w || e.room !== k || e.done) continue;
          let n = e.name || 'task';
          if (e.kind === 'carry') n = `${e.name} → ${DEST_HINT[e.dest] || 'its place'}`;
          else if (e.kind === 'scrub') n = e.decal ? `${e.name} (${e.tool === 'mop' ? 'mop' : 'rag'})` : `dusty ${e.name} (rag)`;
          else if (e.kind === 'sweep') n = 'dirt on the floor (broom)';
          else if (e.id === 'pb_bed') n = 'make the bed';
          else if (e.id === 'ba_cab') n = 'medicine cabinet (behind the mirror)';
          left[n] = (left[n] || 0) + 1;
        }
        return Object.entries(left).map(([n, c]) => `<div class="small">• ${c > 1 ? c + '× ' : ''}${n}</div>`).join('');
      };
      $('details').innerHTML = '<div class="ot2">WHAT\'S LEFT · Tab to close</div>' + Object.keys(ROOM_W).map(k => { const p = Math.round(roomPct(k) * 100); return `<div class="row"><span>${ROOM_NAME[k]}</span><span>${p}%</span></div><div class="bar sm"><div style="width:${p}%"></div></div>${p < 100 ? todo(k) : ''}`; }).join('') + `<div class="small" style="margin-top:8px">Total ${pct}%</div>`;
    }
  }
  function drawMap() {
    const big = isShown('bigmap');
    const cv = big ? $('bigmapc') : $('minimapc'); if (!cv) return;
    const c = cv.getContext('2d'), W = cv.width, H = cv.height;
    const x0 = -1.5, z0 = -4, x1 = 41, z1 = 24, sc = Math.min(W / (x1 - x0), H / (z1 - z0));
    const X = x => (x - x0) * sc, Z = z => (z - z0) * sc;
    c.clearRect(0, 0, W, H); c.fillStyle = 'rgba(14,12,10,.85)'; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(70,95,55,.35)'; c.fillRect(X(26), Z(-3), (40 - 26) * sc, 26 * sc);
    const cur = World.roomAt(P.x, P.z);
    for (const r of World.rooms) {
      if (r.out) continue;
      c.fillStyle = cur === r ? 'rgba(232,194,122,.35)' : 'rgba(255,255,255,.08)'; c.fillRect(X(r.x1), Z(r.z1), (r.x2 - r.x1) * sc, (r.z2 - r.z1) * sc);
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1; c.strokeRect(X(r.x1), Z(r.z1), (r.x2 - r.x1) * sc, (r.z2 - r.z1) * sc);
      if (big || sc > 5) { c.fillStyle = 'rgba(255,255,255,.75)'; c.font = `${big ? 13 : 8}px sans-serif`; c.textAlign = 'center'; c.fillText(r.name, X((r.x1 + r.x2) / 2), Z((r.z1 + r.z2) / 2) + 4); }
    }
    for (const d of World.mapDoors) {
      c.fillStyle = d.main ? '#f1c060' : d.locked ? '#c0504a' : 'rgba(255,255,255,.6)'; c.fillRect(X(d.x) - 3, Z(d.z) - 3, 6, 6);
      if (d.label && big) { c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.fillText(d.label, X(d.x), Z(d.z) + (d.z >= 20 ? 16 : -8)); }
    }
    if (big) { c.fillStyle = 'rgba(255,255,255,.6)'; c.font = '12px sans-serif'; c.textAlign = 'center'; c.fillText('Backyard · Trash bins', X(31), Z(12)); }
    c.fillStyle = 'rgba(180,220,255,.9)'; c.fillRect(X(27) - 2, Z(12.4) - 2, 5, 5);
    // player
    const px = X(P.x), pz = Z(P.z), a = P.yaw;
    c.fillStyle = '#ff6a50'; c.beginPath(); c.moveTo(px - Math.sin(a) * 9, pz - Math.cos(a) * 9); c.lineTo(px + Math.cos(a) * 5, pz - Math.sin(a) * 5); c.lineTo(px - Math.cos(a) * 5, pz + Math.sin(a) * 5); c.closePath(); c.fill();
  }

  // ======== ENVIRONMENT ========
  const SKY = [[0, 0x050810], [300, 0x0b1020], [345, 0x2a2a48], [375, 0xe0a070], [420, 0x8fb8e0], [720, 0x9cc4ec], [930, 0xc8b890], [1020, 0xf09050], [1110, 0x503050], [1170, 0x0b1020], [1440, 0x050810]];
  function lerpC(a, b, t) { const A = C(a), B = C(b); return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; }
  function skyAt(m) { m = ((m % 1440) + 1440) % 1440; for (let i = 0; i < SKY.length - 1; i++) if (m >= SKY[i][0] && m <= SKY[i + 1][0]) return lerpC(SKY[i][1], SKY[i + 1][1], (m - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0])); return C(0x050810); }
  function envFor(time) {
    const hor = skyAt(time);
    const day = Math.max(0, Math.min(1, (time - 345) / 75)) * Math.max(0, Math.min(1, (1140 - time) / 90)), night = 1 - day;
    const top = [hor[0] * 0.55, hor[1] * 0.65, Math.min(1, hor[2] * 0.95 + 0.05)];
    const a = (time - 360) / (1140 - 360) * Math.PI;
    let sd = [-Math.cos(a) * 0.8, -Math.max(0.25, Math.sin(a)), 0.35]; const l = Math.hypot(...sd); sd = sd.map(v => v / l);
    const warm = Math.max(0, (time - 900) / 150);
    const sunCol = [1.6 * day + 0.06 * night, (1.45 - 0.4 * warm) * day + 0.08 * night, (1.25 - 0.7 * warm) * day + 0.14 * night];
    const ambOut = [0.12 + 0.35 * day, 0.13 + 0.38 * day, 0.18 + 0.4 * day];
    const ambIn = [0.07 + 0.1 * day, 0.065 + 0.09 * day, 0.07 + 0.08 * day];
    const lights = World.lights.map(L => Object.assign({}, L, { i: L.i * (S && S.prelude ? 0.55 : (1.0 + 0.25 * night)) * 1.25 }));
    if (S && ((S.cake.stage === 'ready' && S.cake.late > 20) || S.fireLevel)) lights.unshift({ p: [19.3, 1.2, 10.9], c: [1, 0.45, 0.1], i: 1.8 + Math.random() * 0.6, r: 8, f: 1 });
    return { skyTop: top, skyHor: hor, ambIn, ambOut, sunDir: sd, sunCol, lights, fog: [hor[0] * 0.8, hor[1] * 0.8, hor[2] * 0.85], fogN: 25, fogF: 90, win: [Math.min(1.2, hor[0] * 1.2 + 0.08), Math.min(1.2, hor[1] * 1.2 + 0.08), Math.min(1.2, hor[2] * 1.2 + 0.1)], time: envClock, expo: 1.15, night, tint: [1, 1, 1] };
  }

  // ======== DRAW ========
  let menuStatic = null;
  function draw() {
    if (MODE === 'menu' || !S) {
      if (!menuStatic) { newRun(); menuStatic = MODELS; S = null; MODELS = []; ENT = []; OVERLAY = []; }
      const a = envClock * 0.04;
      const cam = { eye: [5.8 + Math.cos(a) * 2.2, 1.65, 13.6 + Math.sin(a) * 1.6], target: [3.0 + Math.sin(a * 0.7), 1.0, 11.5], fov: 1.15 };
      Engine.render(cam, menuStatic, envFor(1010), []);
      return;
    }
    let cam;
    if (camOverride) cam = { eye: camOverride.eye, target: camOverride.target };
    else { const e = camEye(), d = camDir(); cam = { eye: e, target: [e[0] + d[0], e[1] + d[1], e[2] + d[2]] }; }
    cam.fov = (save.settings.fov || 75) * Math.PI / 180 * 0.85;
    const env = envFor(S.time);
    if (S.fireLevel === 2) { env.skyHor = [0.5, 0.15, 0.05]; env.skyTop = [0.2, 0.05, 0.03]; env.fog = [0.3, 0.12, 0.06]; env.fogN = 5; env.fogF = 45; }
    Engine.render(cam, MODELS.filter(m => !m.overlayOnly), env, camOverride ? [] : OVERLAY);
    if ($('fps').style.display !== 'none') $('fps').textContent = `${Math.round(Engine.stats.fps)} fps · ${Math.round(Engine.stats.scale * 100)}% res · ${Engine.stats.calls} draws`;
  }

  // ======== MENU ========
  function refreshMenu() {
    $('mcount').textContent = `${endingCount()}/21`;
    $('mbar').style.width = (endingCount() / 21 * 100) + '%';
    $('mphase').textContent = save.phase2 ? 'PHASE 2 · Find the photo' : 'PHASE 1';
    $('mphase').classList.toggle('p2', !!save.phase2);
    const st = save.settings;
    $('setSens').value = st.sens; $('setSpeed').value = st.speed; $('setVol').value = st.vol; $('setQuality').value = st.quality;
    $('setFov').value = st.fov; $('setGrain').checked = !!st.grain; $('setInvert').checked = !!st.invert; $('setEaster').checked = !!st.easter; $('setAA').checked = !!st.aa;
    $('fovVal').textContent = st.fov + '°';
  }
  function showGallery() {
    const g = $('glist'); g.innerHTML = '';
    for (let i = 1; i <= 21; i++) {
      const En = ENDINGS[i], got = save.endings[i], d = document.createElement('div');
      d.className = 'gitem' + (got ? ' got' : '') + (En.star ? ' star' : '');
      d.innerHTML = `<div class="gn">#${i} · PHASE ${En.phase}${En.star ? ' · ★' : ''}</div><div class="gt">${got ? En.name : '? ? ?'}</div><div class="gs">${got ? En.sub : 'Locked'}</div>${got ? `<div class="gh">${En.hint}</div>` : ''}`;
      g.appendChild(d);
    }
    $('gcount').textContent = `${endingCount()}/21 unlocked · Bad Endings: ${save.badCount || 0}/10`;
    show('gallery', true);
  }
  $('bPlay').onclick = () => { if (!save.warned) { show('warn', true); return; } startGame().catch(reportErr); };
  $('wOk').onclick = () => { save.warned = true; persist(); show('warn', false); startGame().catch(reportErr); };
  $('bGallery').onclick = showGallery; $('gclose').onclick = () => show('gallery', false);
  $('bHelp').onclick = () => show('help', true); $('hclose').onclick = () => show('help', false);
  $('bSettings').onclick = () => openSettings('menu'); $('sclose').onclick = closeSettings;
  $('setSens').oninput = e => { save.settings.sens = +e.target.value; persist(); };
  $('setSpeed').onchange = e => { save.settings.speed = +e.target.value; persist(); };
  $('setVol').oninput = e => { save.settings.vol = +e.target.value; Sound.setVolume(save.settings.vol); persist(); };
  $('setQuality').onchange = e => { save.settings.quality = e.target.value; persist(); applyQuality(); };
  $('setFov').oninput = e => { save.settings.fov = +e.target.value; $('fovVal').textContent = e.target.value + '°'; persist(); };
  $('setGrain').onchange = e => { save.settings.grain = e.target.checked; persist(); applyQuality(); };
  $('setInvert').onchange = e => { save.settings.invert = e.target.checked; persist(); };
  $('setAA').onchange = e => { save.settings.aa = e.target.checked; persist(); notify('Anti-aliasing changes apply after reloading the page.'); };
  $('setFps').onchange = e => { $('fps').style.display = e.target.checked ? '' : 'none'; };
  $('setEaster').onchange = e => { save.settings.easter = e.target.checked; persist(); };
  $('bUnlock2').onclick = () => { save.phase2 = true; persist(); refreshMenu(); notify('Phase 2 unlocked (developer mode).'); };
  $('bReset').onclick = () => { if (confirm('Erase all progress (unlocked endings)?')) { const st = save.settings; save = defaultSave(); save.settings = st; persist(); refreshMenu(); } };
  $('pResume').onclick = closePause;
  $('pMenu').onclick = () => { show('pause', false); goMenu(); };
  $('pSettings').onclick = () => openSettings('pause');
  document.querySelectorAll('.stab').forEach(b => b.onclick = () => { document.querySelectorAll('.stab').forEach(x => x.classList.remove('on')); b.classList.add('on'); document.querySelectorAll('.spage').forEach(p => p.classList.toggle('hidden', p.dataset.p !== b.dataset.p)); });

  function reportErr(e) { console.error(e); const el = $('err'); el.textContent = '⚠ Error: ' + (e && e.message || e); el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 8000); }
  window.addEventListener('error', e => reportErr(e.error || e.message));
  window.addEventListener('unhandledrejection', e => { const m = String(e.reason && (e.reason.message || e.reason)); if (/pointer ?lock|exited the lock/i.test(m)) return; reportErr(e.reason); });

  // film grain texture
  (function () { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'); const d = c.createImageData(128, 128); for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 22; } c.putImageData(d, 0, 0); $('grain').style.backgroundImage = `url(${cv.toDataURL()})`; })();

  // ======== BOOT ========
  try { Engine.init(canvas, { aa: save.settings.aa }); World.build(); initColliders(); }
  catch (e) { document.body.innerHTML = `<div style="color:#fff;padding:40px;font-family:sans-serif">Could not start 3D graphics: ${e.message}<br>Please use an up-to-date Chrome or Edge with hardware acceleration enabled.</div>`; return; }
  applyQuality(); Sound.setVolume(save.settings.vol); refreshMenu(); fade(false, 900);
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    try { Sound.update(); update(dt); draw(); } catch (e) { reportErr(e); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__TPP = { get S() { return S; }, get ENT() { return ENT; }, P, save, startGame, evaluate5PM, endingImmediate, get MODE() { return MODE; }, housePct, roomPct, openPhoto, skipTo, CFG, M, G, gainPiece, preludeGrave, startPrelude, fireEnding, ovenAct, interact, selectSlot, dropHeld, pick: () => pick(), get target() { return target; }, keys, Engine };
})();
