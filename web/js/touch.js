// Controles táctiles en pantalla: una cruceta y un botón de disparo por
// jugador, y los botones de pausa y menú. Incluye un modo de edición para
// moverlos arrastrándolos.

import { DEFAULT_TOUCH_LAYOUT, DEFAULT_TOUCH_LAYOUT_2P } from './settings.js';

const DPAD_BASE = 150;
const FIRE_BASE = 104;

/**
 * Un juego de controles por jugador. base: primera acción del jugador
 * (derecha), igual que en input.c: J1 usa 0..4 y J2 5..9.
 */
const PLAYERS = [
  { base: 0, dpadKey: 'dpad', fireKey: 'fire', dpadSize: 'dpadSize', fireSize: 'fireSize' },
  { base: 5, dpadKey: 'dpad2', fireKey: 'fire2', dpadSize: 'dpad2Size', fireSize: 'fire2Size' },
];
const DIRS = { right: 0, up: 1, left: 2, down: 3 };

let layer, btnPause, btnMenu;
let settings = null;
let callbacks = {};
let editing = false;
let onEditChange = null;
let visible = false;
let showP2 = false;

/** Acciones que el tacto mantiene pulsadas (índices 0..9, J1 y J2). */
export const held = new Uint8Array(10);

export function orientation() {
  return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
}

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent.appendChild(e);
  return e;
}

const ARROW = (rot) =>
  `<svg viewBox="0 0 24 24" style="transform:rotate(${rot}deg)" aria-hidden="true"><path d="M12 4l7 9h-4.5v7h-5v-7H5z"/></svg>`;

export function init(container, s, cb) {
  settings = s;
  callbacks = cb;
  layer = el('div', 'touch-layer', container);
  layer.hidden = true;

  PLAYERS.forEach((p, i) => {
    const n = i + 1;
    p.dpad = el('div', `tc tc-dpad p${n}`, layer);
    p.dpad.setAttribute('aria-label', `Cruceta del jugador ${n}`);
    el('div', 'dpad-arrow up', p.dpad, ARROW(0));
    el('div', 'dpad-arrow right', p.dpad, ARROW(90));
    el('div', 'dpad-arrow down', p.dpad, ARROW(180));
    el('div', 'dpad-arrow left', p.dpad, ARROW(270));
    p.knob = el('div', 'dpad-knob', p.dpad);
    el('span', 'tc-tag', p.dpad, 'J' + n);

    p.fire = el('div', `tc tc-fire p${n}`, layer, `<span>FUEGO</span><span class="tc-tag">J${n}</span>`);
    p.fire.setAttribute('aria-label', `Disparo del jugador ${n}`);

    setupDpad(p);
    setupFire(p);
  });

  const bar = el('div', 'tc-bar', layer);
  btnPause = el('button', 'tc-btn', bar,
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>');
  btnPause.setAttribute('aria-label', 'Pausa');
  btnMenu = el('button', 'tc-btn', bar,
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="2.4" rx="1"/><rect x="4" y="11" width="16" height="2.4" rx="1"/><rect x="4" y="16" width="16" height="2.4" rx="1"/></svg>');
  btnMenu.setAttribute('aria-label', 'Menú');

  btnPause.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!editing) callbacks.onPause?.(); });
  btnMenu.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!editing) callbacks.onMenu?.(); });

  window.addEventListener('resize', applyLayout);
  window.addEventListener('orientationchange', () => setTimeout(applyLayout, 200));
  applyLayout();
}

function capture(elem, pid) {
  try {
    elem.setPointerCapture(pid);
  } catch {
    // Sin captura el control sigue funcionando mientras el dedo no salga de él
  }
}

function setDir(p, dir) {
  for (const [name, d] of Object.entries(DIRS)) {
    const a = p.base + d;
    const on = name === dir ? 1 : 0;
    if (on && !held[a]) callbacks.onPress?.(a);
    held[a] = on;
  }
  for (const arrow of p.dpad.querySelectorAll('.dpad-arrow')) {
    arrow.classList.toggle('active', arrow.classList.contains(dir));
  }
}

function setupDpad(p) {
  let pid = null;
  const update = (e) => {
    const r = p.dpad.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const rad = r.width / 2;
    const dist = Math.hypot(dx, dy);
    const k = Math.min(1, dist / rad) * rad * 0.45;
    p.knob.style.transform = dist > 0 ? `translate(${(dx / dist) * k}px, ${(dy / dist) * k}px)` : '';
    if (dist < rad * 0.2) setDir(p, null);
    else if (Math.abs(dx) > Math.abs(dy)) setDir(p, dx > 0 ? 'right' : 'left');
    else setDir(p, dy > 0 ? 'down' : 'up');
  };
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    p.knob.style.transform = '';
    setDir(p, null);
  };
  p.dpad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (editing) return startDrag(e, p.dpad, p.dpadKey);
    pid = e.pointerId;
    capture(p.dpad, pid);
    callbacks.onAnyPress?.();
    update(e);
  });
  p.dpad.addEventListener('pointermove', (e) => { if (e.pointerId === pid) update(e); });
  p.dpad.addEventListener('pointerup', end);
  p.dpad.addEventListener('pointercancel', end);
}

function setupFire(p) {
  let pid = null;
  const a = p.base + 4;
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    held[a] = 0;
    p.fire.classList.remove('active');
  };
  p.fire.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (editing) return startDrag(e, p.fire, p.fireKey);
    pid = e.pointerId;
    capture(p.fire, pid);
    held[a] = 1;
    p.fire.classList.add('active');
    callbacks.onPress?.(a);
    callbacks.onAnyPress?.();
  });
  p.fire.addEventListener('pointerup', end);
  p.fire.addEventListener('pointercancel', end);
}

function startDrag(e, elem, key) {
  const pid = e.pointerId;
  capture(elem, pid);
  const r = elem.getBoundingClientRect();
  const offX = e.clientX - (r.left + r.width / 2);
  const offY = e.clientY - (r.top + r.height / 2);
  elem.classList.add('dragging');
  const move = (ev) => {
    if (ev.pointerId !== pid) return;
    const W = window.innerWidth, H = window.innerHeight;
    const pos = settings.touch.layout[orientation()][key];
    pos.x = Math.min(1, Math.max(0, (ev.clientX - offX) / W));
    pos.y = Math.min(1, Math.max(0, (ev.clientY - offY) / H));
    applyLayout();
  };
  const up = (ev) => {
    if (ev.pointerId !== pid) return;
    elem.classList.remove('dragging');
    elem.removeEventListener('pointermove', move);
    elem.removeEventListener('pointerup', up);
    elem.removeEventListener('pointercancel', up);
    onEditChange?.();
  };
  elem.addEventListener('pointermove', move);
  elem.addEventListener('pointerup', up);
  elem.addEventListener('pointercancel', up);
}

/** Coloca y dimensiona los controles según la configuración. */
export function applyLayout() {
  if (!layer) return;
  const t = settings.touch;
  const W = window.innerWidth, H = window.innerHeight;
  const pos = t.layout[orientation()];
  const scale = Math.min(1.25, Math.max(0.7, Math.min(W, H) / 400));
  const p2 = showP2 && t.twoPlayer;
  layer.classList.toggle('two-players', p2);
  PLAYERS.forEach((p, i) => {
    const on = i === 0 || p2;
    p.dpad.hidden = p.fire.hidden = !on;
    if (!on) return;
    place(p.dpad, pos[p.dpadKey], Math.round(DPAD_BASE * t[p.dpadSize] * scale), W, H);
    place(p.fire, pos[p.fireKey], Math.round(FIRE_BASE * t[p.fireSize] * scale), W, H);
  });
  layer.style.setProperty('--tc-opacity', String(t.opacity));
}

function place(elem, p, size, W, H) {
  // Mantener el control completo dentro de la pantalla
  const cx = Math.min(W - size / 2, Math.max(size / 2, p.x * W));
  const cy = Math.min(H - size / 2, Math.max(size / 2, p.y * H));
  elem.style.width = elem.style.height = size + 'px';
  elem.style.left = cx - size / 2 + 'px';
  elem.style.top = cy - size / 2 + 'px';
}

/** v: mostrar la capa; pad: mostrar crucetas y disparos (si no, solo pausa y menú). */
export function setVisible(v, pad = true) {
  visible = v;
  if (!layer) return;
  layer.hidden = !v;
  layer.classList.toggle('no-pad', !pad);
  if (!v || !pad) releaseAll();
  applyLayout();
}

/** Muestra los controles del jugador 2 (si están activados en la configuración). */
export function setPlayer2Visible(v) {
  showP2 = v;
  if (!v) releaseAll();
  applyLayout();
}

export function isVisible() {
  return visible;
}

export function releaseAll() {
  held.fill(0);
  for (const p of PLAYERS) {
    if (!p.dpad) continue;
    p.knob.style.transform = '';
    p.fire.classList.remove('active');
    for (const a of p.dpad.querySelectorAll('.dpad-arrow')) a.classList.remove('active');
  }
}

/** Modo edición: los controles se arrastran en vez de usarse. */
export function setEditMode(on, onChange) {
  editing = on;
  onEditChange = onChange || null;
  layer.classList.toggle('editing', on);
  releaseAll();
  applyLayout();
}

/** Vuelve a la disposición inicial de la orientación actual (de 1 o 2 jugadores). */
export function resetLayout() {
  const o = orientation();
  const def = settings.touch.twoPlayer ? DEFAULT_TOUCH_LAYOUT_2P : DEFAULT_TOUCH_LAYOUT;
  settings.touch.layout[o] = structuredClone(def[o]);
  applyLayout();
}
