// Entrada del jugador: teclado, controles táctiles y mandos.
// Reemplaza la parte de win_sys.c que leía el teclado (key_pressed, getkey,
// kbhit). La lógica de input.c vive en engine.js.

import * as touch from './touch.js';

let settings = null;
let onPress = null;
let captureHandler = null;
let gameActive = false;

// Teclas que se dejan al navegador si no están asignadas a nada
const BROWSER_KEYS = new Set(['F5', 'F11', 'F12']);

const pressedCodes = new Set();
const queue = [];

/** Estado "mantenido" de cada acción desde el mando (índices de keycodes). */
const padHeld = new Uint8Array(19);
let padPrev = new Uint8Array(19);

export function init(s, handlers) {
  settings = s;
  onPress = handlers.onPress;
  window.addEventListener('keydown', keydown, { capture: true });
  window.addEventListener('keyup', keyup, { capture: true });
  window.addEventListener('blur', () => { pressedCodes.clear(); touch.releaseAll(); });
}

/** Mientras el juego está en pantalla, las teclas no llegan al navegador. */
export function setGameActive(v) {
  gameActive = v;
  if (!v) pressedCodes.clear();
}

/** Para la pantalla de mapeo: la siguiente tecla va a fn(code) en vez de al juego. */
export function captureNextKey(fn) {
  captureHandler = fn;
}

function actionsFor(code) {
  const out = [];
  for (const [id, codes] of Object.entries(settings.keys)) {
    if (codes.includes(code)) out.push(Number(id));
  }
  return out;
}

function keydown(e) {
  if (captureHandler) {
    e.preventDefault();
    e.stopPropagation();
    const fn = captureHandler;
    captureHandler = null;
    fn(e.code);
    return;
  }
  if (!gameActive) return;
  // Dejar pasar atajos del sistema (Cmd+R, Ctrl+Shift+I, etc.)
  if (e.metaKey || (e.ctrlKey && e.code !== 'ControlLeft' && e.code !== 'ControlRight')) return;
  const actions = actionsFor(e.code);
  if (actions.length || !BROWSER_KEYS.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  pressedCodes.add(e.code);
  queue.push({ code: e.code, key: e.key, action: actions.length ? actions[0] : -1 });
  if (queue.length > 16) queue.shift();
  for (const a of actions) onPress?.(a);
}

function keyup(e) {
  pressedCodes.delete(e.code);
  if (gameActive) e.preventDefault();
}

/** Una pulsación táctil cuenta como "cualquier tecla" (empezar, quitar la pausa...). */
export function pushVirtualKey(action = -1) {
  queue.push({ code: 'Virtual', key: '', action });
}

export function isHeld(action) {
  const codes = settings.keys[action];
  if (codes) for (const c of codes) if (c && pressedCodes.has(c)) return true;
  if (action < 10 && touch.held[action]) return true;
  return padHeld[action] === 1;
}

export function kbhit() {
  return queue.length > 0;
}

/** Devuelve la siguiente tecla del búfer o null. */
export function getkey() {
  return queue.shift() ?? null;
}

export function flush() {
  queue.length = 0;
}

// --- Mandos (Gamepad API) --------------------------------------------------

const PAD_MAP = [
  // [botón estándar, acción]
  [15, 0], [12, 1], [14, 2], [13, 3], // cruceta
  [0, 4], [1, 4], [2, 4], [3, 4], // A B X Y -> disparar
  [9, 16], // Start -> pausa
  [8, 15], // Select -> salir al título
];

export function pollGamepads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  padHeld.fill(0);
  for (const gp of pads) {
    if (!gp || !gp.connected) continue;
    for (const [b, a] of PAD_MAP) if (gp.buttons[b]?.pressed) padHeld[a] = 1;
    const [ax = 0, ay = 0] = gp.axes;
    if (Math.max(Math.abs(ax), Math.abs(ay)) > 0.5) {
      if (Math.abs(ax) > Math.abs(ay)) padHeld[ax > 0 ? 0 : 2] = 1;
      else padHeld[ay > 0 ? 3 : 1] = 1;
    }
  }
  for (let a = 0; a < padHeld.length; a++) {
    if (padHeld[a] && !padPrev[a]) {
      queue.push({ code: 'Gamepad', key: '', action: a });
      onPress?.(a);
    }
  }
  padPrev = padHeld.slice();
}

/** Nombre legible de un KeyboardEvent.code. */
export function keyLabel(code) {
  if (!code) return '—';
  const named = {
    ArrowRight: '→', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', Space: 'Espacio',
    Enter: 'Intro', Escape: 'Esc', Tab: 'Tab', Backspace: 'Retroceso', ShiftLeft: 'Mayús izq.',
    ShiftRight: 'Mayús der.', ControlLeft: 'Ctrl izq.', ControlRight: 'Ctrl der.', AltLeft: 'Alt izq.',
    AltRight: 'Alt der.', Minus: '-', Equal: '=', NumpadAdd: 'Num +', NumpadSubtract: 'Num -',
    NumpadEnter: 'Num Intro', Comma: ',', Period: '.', Slash: '/', Semicolon: 'Ñ / ;',
    Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`', IntlBackslash: '<',
  };
  if (named[code]) return named[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
