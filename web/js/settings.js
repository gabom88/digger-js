// Configuración y puntuaciones guardadas en localStorage
// (reemplaza DIGGER.INI y DIGGER.SCO).

const SETTINGS_KEY = 'digger.settings.v1';
const SCORES_KEY = 'digger.scores.v1';

/**
 * Acciones mapeables. El índice es el mismo que keycodes[] en input.c, así el
 * motor puede seguir usando los números originales.
 */
export const ACTIONS = [
  { id: 0, group: 'controls', name: 'Derecha (J1)' },
  { id: 1, group: 'controls', name: 'Arriba (J1)' },
  { id: 2, group: 'controls', name: 'Izquierda (J1)' },
  { id: 3, group: 'controls', name: 'Abajo (J1)' },
  { id: 4, group: 'controls', name: 'Disparar (J1)' },
  { id: 5, group: 'controls', name: 'Derecha (J2)' },
  { id: 6, group: 'controls', name: 'Arriba (J2)' },
  { id: 7, group: 'controls', name: 'Izquierda (J2)' },
  { id: 8, group: 'controls', name: 'Abajo (J2)' },
  { id: 9, group: 'controls', name: 'Disparar (J2)' },
  { id: 16, group: 'system', name: 'Pausa' },
  { id: 18, group: 'system', name: 'Cambiar nº de jugadores' },
  { id: 15, group: 'system', name: 'Salir al título' },
  { id: 11, group: 'system', name: 'Acelerar' },
  { id: 12, group: 'system', name: 'Frenar' },
  { id: 13, group: 'system', name: 'Música sí/no' },
  { id: 14, group: 'system', name: 'Sonido sí/no' },
];

export const DEFAULT_KEYS = {
  0: ['ArrowRight', 'Numpad6'],
  1: ['ArrowUp', 'Numpad8'],
  2: ['ArrowLeft', 'Numpad4'],
  3: ['ArrowDown', 'Numpad2'],
  4: ['Enter', 'F1'],
  5: ['KeyD', null],
  6: ['KeyW', null],
  7: ['KeyA', null],
  8: ['KeyS', null],
  9: ['Tab', null],
  11: ['NumpadAdd', 'Equal'],
  12: ['NumpadSubtract', 'Minus'],
  13: ['F7', 'KeyM'],
  14: ['F9', 'KeyO'],
  15: ['F10', 'KeyQ'],
  16: ['Space', 'KeyP'],
  18: ['Escape', 'KeyN'],
};

const isTouchDevice = typeof window !== 'undefined' &&
  (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

// Posiciones (fracción del ancho y alto de la pantalla) de los controles de
// cada jugador. dpad2/fire2 son los del jugador 2.
export const DEFAULT_TOUCH_LAYOUT = {
  landscape: {
    dpad: { x: 0.11, y: 0.7 }, fire: { x: 0.89, y: 0.72 },
    dpad2: { x: 0.89, y: 0.3 }, fire2: { x: 0.11, y: 0.3 },
  },
  portrait: {
    dpad: { x: 0.27, y: 0.78 }, fire: { x: 0.78, y: 0.8 },
    dpad2: { x: 0.78, y: 0.58 }, fire2: { x: 0.27, y: 0.58 },
  },
};

/** Disposición para dos jugadores: cada uno en su mitad de la pantalla. */
export const DEFAULT_TOUCH_LAYOUT_2P = {
  landscape: {
    dpad: { x: 0.1, y: 0.74 }, fire: { x: 0.27, y: 0.88 },
    dpad2: { x: 0.9, y: 0.74 }, fire2: { x: 0.73, y: 0.88 },
  },
  portrait: {
    dpad: { x: 0.22, y: 0.66 }, fire: { x: 0.22, y: 0.87 },
    dpad2: { x: 0.78, y: 0.66 }, fire2: { x: 0.78, y: 0.87 },
  },
};

/** Valores que guarda un preset del mando táctil (además de la disposición). */
export const TOUCH_PRESET_KEYS = ['dpadSize', 'fireSize', 'dpad2Size', 'fire2Size', 'opacity', 'twoPlayer'];

export function defaultSettings() {
  return {
    keys: structuredClone(DEFAULT_KEYS),
    touch: {
      enabled: isTouchDevice,
      dpadSize: 1,
      fireSize: 1,
      twoPlayer: false, // controles para el jugador 2 (modos simultáneo y versus)
      dpad2Size: 1,
      fire2Size: 1,
      opacity: 0.45,
      layout: structuredClone(DEFAULT_TOUCH_LAYOUT),
      // Disposiciones guardadas: { name, layout: { landscape, portrait }, ...TOUCH_PRESET_KEYS }
      presets: [],
    },
    game: {
      mode: '1p', // '1p' | '2p' (alternos) | '2s' (simultáneos) | 'gauntlet'
      gauntletTime: 120,
      startLevel: 1,
      unlimitedLives: false,
      speed: 80000, // ftime original, en ticks del PIT (1193181 Hz)
    },
    sound: { sound: true, music: true, volume: 0.7 },
    display: { showFps: false },
  };
}

function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (!(k in saved)) continue;
    const b = base[k];
    const s = saved[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) base[k] = merge(b, s);
    else if (typeof s === typeof b || (b === null || s === null)) base[k] = s;
  }
  return base;
}

export function loadSettings() {
  const s = defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      merge(s, saved);
      if (!Array.isArray(s.touch.presets)) s.touch.presets = [];
      s.touch.presets = s.touch.presets.filter((p) => p && typeof p.name === 'string' && p.layout);
      // Las teclas se guardan como mapa; aseguramos dos ranuras por acción
      for (const a of ACTIONS) {
        const v = saved?.keys?.[a.id];
        s.keys[a.id] = Array.isArray(v) ? [v[0] ?? null, v[1] ?? null] : [...DEFAULT_KEYS[a.id]];
      }
    }
  } catch {
    // Sin almacenamiento (modo privado, etc.): se usan los valores por defecto
  }
  return s;
}

export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Ignorado: el juego funciona igual sin poder guardar
  }
}

/** Búfer de 512 bytes con el mismo formato que DIGGER.SCO. */
export function loadScoreBuffer() {
  const buf = new Uint8Array(512);
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    if (raw) {
      const bytes = atob(raw);
      for (let i = 0; i < Math.min(512, bytes.length); i++) buf[i] = bytes.charCodeAt(i);
    }
  } catch {
    // Sin puntuaciones guardadas
  }
  return buf;
}

export function saveScoreBuffer(buf) {
  try {
    let s = '';
    for (let i = 0; i < 512; i++) s += String.fromCharCode(buf[i]);
    localStorage.setItem(SCORES_KEY, btoa(s));
    return true;
  } catch {
    return false;
  }
}

export function clearScores() {
  try {
    localStorage.removeItem(SCORES_KEY);
  } catch {
    // nada que borrar
  }
}
