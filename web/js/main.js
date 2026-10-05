// Arranque de la aplicación: menú de configuración, bucle de cuadros,
// controles y PWA.

import * as video from './video.js';
import * as audio from './audio.js';
import * as frames from './frames.js';
import * as controls from './controls.js';
import * as touch from './touch.js';
import * as engine from './engine.js';
import {
  ACTIONS, DEFAULT_KEYS, DEFAULT_TOUCH_LAYOUT, DEFAULT_TOUCH_LAYOUT_2P, TOUCH_PRESET_KEYS,
  loadSettings, saveSettings, loadScoreBuffer, saveScoreBuffer, clearScores,
} from './settings.js';

const $ = (id) => document.getElementById(id);
const settings = loadSettings();
const save = () => saveSettings(settings);

// --- Pantalla y bucle de cuadros ----------------------------------------

video.attachCanvas($('screen'));
video.vgatitle();
video.present();

engine.initsound(audio.sampleRate);
audio.setSource(engine.generateSamples);
audio.setVolume(settings.sound.volume);

const fpsEl = $('fps');
let lastFpsText = 0;

function loop(ts) {
  controls.pollGamepads();
  audio.pump(ts);
  frames.tick(ts);
  if (settings.display.showFps && ts - lastFpsText > 500 && engine.isRunning()) {
    lastFpsText = ts;
    const hz = Math.round(1000 / frames.displayInterval);
    fpsEl.textContent = `Pantalla ${hz} Hz · Juego ${engine.stats.logicFps.toFixed(1)} fps`;
  }
  if (!timerMode) requestAnimationFrame(loop);
}
// ?timer: avanza con setInterval en lugar de requestAnimationFrame (pruebas
// automatizadas con la ventana oculta, donde rAF no se ejecuta)
const timerMode = new URLSearchParams(location.search).has('timer');
if (timerMode) setInterval(() => loop(performance.now()), 1000 / 60);
else requestAnimationFrame(loop);

// Si rAF se frena (algunos Android en ahorro de energía), el audio sigue
// alimentándose con un temporizador.
setInterval(() => audio.pump(performance.now()), 25);

// --- Controles ------------------------------------------------------------

controls.init(settings, { onPress: engine.onPress });

touch.init($('touch-root'), settings, {
  onPress(a) {
    engine.onPress(a);
    controls.pushVirtualKey(a);
  },
  onAnyPress() {
    audio.resumeIfNeeded();
  },
  onPause() {
    if (engine.isPaused()) controls.pushVirtualKey();
    // En el título, el botón de pausa hace de Esc/N (cambiar modo o volver)
    else if (engine.isOnTitle()) controls.pushVirtualKey(18);
    else engine.requestPause();
  },
  onMenu() {
    openPauseMenu();
  },
});

engine.hooks.onSoundFlags = (s, m) => {
  settings.sound.sound = s;
  settings.sound.music = m;
  save();
  syncForm();
};
engine.hooks.onMode = (mode) => {
  settings.game.mode = mode;
  save();
  syncForm();
  touch.setPlayer2Visible(wantsPlayer2(mode));
};

/** La cruceta del jugador 2 solo hace falta con dos diggers a la vez. */
function wantsPlayer2(mode) {
  return settings.touch.twoPlayer && (mode === '2s' || mode === 'vs');
}

// iOS suspende el audio al cambiar de app; se reanuda con el siguiente toque
for (const ev of ['pointerdown', 'keydown']) {
  window.addEventListener(ev, () => audio.resumeIfNeeded(), { capture: true, passive: true });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) engine.requestPause();
});

// --- Jugar ---------------------------------------------------------------

let playing = false;

async function startGame() {
  if (playing) return;
  playing = true;
  // El audio se desbloquea dentro del gesto del usuario (requisito de Safari)
  const before = audio.sampleRate;
  const unlocked = audio.unlock();
  $('menu').hidden = true;
  await unlocked;
  if (audio.sampleRate !== before) engine.initsound(audio.sampleRate);
  engine.configure({ ...settings.game, ...settings.sound, touchControls: settings.touch.enabled });
  controls.setGameActive(true);
  controls.flush();
  touch.setPlayer2Visible(wantsPlayer2(settings.game.mode));
  touch.setVisible(true, settings.touch.enabled);
  fpsEl.hidden = !settings.display.showFps;
  document.activeElement?.blur?.();
  try {
    await engine.mainprog();
  } catch (err) {
    console.error(err);
    toast('Error en el juego: ' + err.message);
  }
  playing = false;
  controls.setGameActive(false);
  touch.setVisible(false);
  fpsEl.hidden = true;
  video.vgatitle();
  video.present();
  showMenu();
}

function showMenu() {
  renderScores();
  // Con una partida en pausa, el botón principal la continúa en vez de empezar otra
  const paused = engine.isSuspended();
  $('play').textContent = paused ? '▶ Continuar' : '▶ Jugar';
  $('quit').hidden = !paused;
  syncPlayHint();
  $('menu').hidden = false;
  $('play').focus({ preventScroll: true });
}

/** Botón de menú durante el juego: congela la partida y abre los ajustes. */
function openPauseMenu() {
  if (!playing || engine.isSuspended()) return;
  engine.suspend();
  controls.setGameActive(false);
  touch.setVisible(false);
  fpsEl.hidden = true;
  showMenu();
}

/** Vuelve a la partida con los ajustes que se hayan cambiado. */
function resumeGame() {
  $('menu').hidden = true;
  engine.applySettings({ ...settings.game, ...settings.sound, touchControls: settings.touch.enabled });
  touch.setPlayer2Visible(wantsPlayer2(engine.currentMode()));
  touch.setVisible(true, settings.touch.enabled);
  fpsEl.hidden = !settings.display.showFps;
  controls.setGameActive(true);
  controls.flush();
  audio.resumeIfNeeded();
  document.activeElement?.blur?.();
  engine.resume();
}

$('play').addEventListener('click', () => {
  if (engine.isSuspended()) resumeGame();
  else startGame();
});

// Termina la partida en pausa; startGame() vuelve a mostrar el menú al salir
$('quit').addEventListener('click', () => {
  engine.requestQuit();
  $('quit').hidden = true;
  $('play').textContent = '▶ Jugar';
});

// --- Pestañas --------------------------------------------------------------

for (const tab of document.querySelectorAll('.tabs button')) {
  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('.tabs button')) t.classList.toggle('active', t === tab);
    for (const p of document.querySelectorAll('.panel')) p.hidden = p.dataset.panel !== tab.dataset.tab;
    if (tab.dataset.tab === 'scores') renderScores();
  });
}

// --- Pestaña Juego ----------------------------------------------------------

const speedPercent = (ftime) => Math.round((80000 / ftime) * 100);

function syncForm() {
  const g = settings.game;
  $('opt-mode').value = g.mode;
  $('row-gtime').hidden = g.mode !== 'gauntlet';
  $('opt-gtime').value = g.gauntletTime;
  $('opt-level').value = g.startLevel;
  $('opt-speed').value = speedPercent(g.speed);
  $('opt-speed-out').textContent = speedPercent(g.speed) + ' %';
  $('opt-unlimited').checked = g.unlimitedLives;
  $('opt-sound').checked = settings.sound.sound;
  $('opt-music').checked = settings.sound.music;
  $('opt-volume').value = settings.sound.volume;
  $('opt-fps').checked = settings.display.showFps;
  const t = settings.touch;
  $('opt-touch').checked = t.enabled;
  $('edit-touch').disabled = !t.enabled;
  $('ed-two').checked = t.twoPlayer;
  $('editor').classList.toggle('two-players', t.twoPlayer);
  $('ed-dpad').value = t.dpadSize;
  $('ed-fire').value = t.fireSize;
  $('ed-dpad2').value = t.dpad2Size;
  $('ed-fire2').value = t.fire2Size;
  $('ed-opacity').value = t.opacity;
  $('touch-summary').textContent = t.twoPlayer
    ? 'Mando de 2 jugadores activado: la segunda cruceta aparece en los modos simultáneo y versus.'
    : '';
  renderPresets();
  syncPlayHint();
}

function syncPlayHint() {
  let text;
  if (engine.isSuspended() && !engine.isOnTitle())
    text = 'Partida en pausa. La velocidad, el sonido y los controles se aplican al continuar; el modo y el nivel inicial, en la próxima partida.';
  else if (settings.touch.enabled)
    text = 'En el título, la cruceta (← →) cambia el modo, el disparo continúa y el botón de pausa vuelve atrás.';
  else
    text = 'En el título, Esc o N cambia el modo (1 jugador, 2 jugadores, versus); cualquier otra tecla continúa y deja elegir entre jugar los niveles en orden o escoger uno.';
  $('play-hint').textContent = text;
}

function bind(id, fn, ev = 'input') {
  $(id).addEventListener(ev, (e) => {
    fn(e.target);
    save();
    syncForm();
  });
}

bind('opt-mode', (el) => { settings.game.mode = el.value; }, 'change');
bind('opt-gtime', (el) => {
  settings.game.gauntletTime = Math.min(3599, Math.max(10, parseInt(el.value, 10) || 120));
}, 'change');
bind('opt-level', (el) => {
  settings.game.startLevel = Math.min(1000, Math.max(1, parseInt(el.value, 10) || 1));
}, 'change');
bind('opt-speed', (el) => { settings.game.speed = Math.round(8000000 / Number(el.value)); });
bind('opt-unlimited', (el) => { settings.game.unlimitedLives = el.checked; }, 'change');
bind('opt-sound', (el) => { settings.sound.sound = el.checked; }, 'change');
bind('opt-music', (el) => { settings.sound.music = el.checked; }, 'change');
bind('opt-volume', (el) => {
  settings.sound.volume = Number(el.value);
  audio.setVolume(settings.sound.volume);
});
bind('opt-fps', (el) => { settings.display.showFps = el.checked; }, 'change');

// --- Pestaña Táctil y editor del mando ---------------------------------------

function touchSlider(id, key) {
  bind(id, (el) => {
    settings.touch[key] = Number(el.value);
    touch.applyLayout();
  });
}
touchSlider('ed-dpad', 'dpadSize');
touchSlider('ed-fire', 'fireSize');
touchSlider('ed-dpad2', 'dpad2Size');
touchSlider('ed-fire2', 'fire2Size');
touchSlider('ed-opacity', 'opacity');

// Al activar los controles se abre el editor, así se ven mientras se ajustan
bind('opt-touch', (el) => {
  settings.touch.enabled = el.checked;
  if (el.checked) openEditor();
}, 'change');

$('edit-touch').addEventListener('click', openEditor);

const sameSpot = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

bind('ed-two', (el) => {
  const t = settings.touch;
  t.twoPlayer = el.checked;
  // Si el jugador 1 sigue en la posición de fábrica, se pasa directamente a
  // la disposición de dos jugadores (cada uno en su mitad de la pantalla)
  if (el.checked) {
    for (const o of ['landscape', 'portrait']) {
      const cur = t.layout[o], def = DEFAULT_TOUCH_LAYOUT[o];
      if (sameSpot(cur.dpad, def.dpad) && sameSpot(cur.fire, def.fire))
        t.layout[o] = structuredClone(DEFAULT_TOUCH_LAYOUT_2P[o]);
    }
  }
  touch.applyLayout();
}, 'change');

function openEditor() {
  $('menu').hidden = true;
  $('editor').hidden = false;
  setEditorOffset(0, false);
  updateOrientationBadge();
  touch.setPlayer2Visible(true);
  touch.setVisible(true, true);
  touch.setEditMode(true, save);
}

function closeEditor() {
  touch.setEditMode(false);
  touch.setVisible(false);
  $('editor').hidden = true;
  save();
  showMenu();
}

function updateOrientationBadge() {
  $('ed-orient').textContent = touch.orientation() === 'landscape' ? 'Horizontal' : 'Vertical';
}
window.addEventListener('resize', updateOrientationBadge);

$('ed-collapse').addEventListener('click', () => {
  const ed = $('editor');
  const collapsed = ed.classList.toggle('collapsed');
  $('ed-collapse').textContent = collapsed ? '▾' : '▴';
  $('ed-collapse').setAttribute('aria-expanded', String(!collapsed));
  setEditorOffset(edOffset);
});

// --- Apartar el panel del editor ---------------------------------------------
// El panel se arrastra por la cabecera o por el asa de abajo. Hacia arriba
// puede salir casi entero de la pantalla (solo queda el asa a la vista) y
// hacia abajo hasta dejar solo la cabecera. Un toque en el asa lo aparta o lo
// devuelve a su sitio.

let edOffset = 0;

function editorLimits() {
  const ed = $('editor');
  const top = parseFloat(getComputedStyle(ed).top) || 0;
  const h = ed.offsetHeight;
  return {
    // Arriba queda visible solo el asa, justo bajo la zona segura (muesca)
    min: -(h - $('ed-handle').offsetHeight),
    max: Math.max(0, window.innerHeight - top - $('editor').querySelector('.editor-head').offsetHeight - 12),
  };
}

function setEditorOffset(y, animate = true) {
  const ed = $('editor');
  const { min, max } = editorLimits();
  edOffset = Math.min(max, Math.max(min, y));
  ed.classList.toggle('dragging', !animate);
  ed.style.setProperty('--ed-y', edOffset + 'px');
  const away = edOffset < -20;
  $('ed-handle-text').textContent = away
    ? '▾ Toca o arrastra para bajar el panel'
    : 'Toca o arrastra para apartar el panel ▴';
  $('ed-handle').setAttribute('aria-label', away ? 'Mostrar el panel' : 'Apartar el panel');
}

function toggleEditorAway() {
  setEditorOffset(edOffset < -20 || edOffset > 20 ? 0 : editorLimits().min);
}

for (const el of [$('ed-handle'), $('editor').querySelector('.editor-head')]) {
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    const pid = e.pointerId;
    const startY = e.clientY;
    const start = edOffset;
    let moved = false;
    try { el.setPointerCapture(pid); } catch { /* sin captura también funciona */ }
    const move = (ev) => {
      if (ev.pointerId !== pid) return;
      const dy = ev.clientY - startY;
      if (Math.abs(dy) > 6) moved = true;
      if (moved) setEditorOffset(start + dy, false);
    };
    const up = (ev) => {
      if (ev.pointerId !== pid) return;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      $('editor').classList.remove('dragging');
      if (!moved && el === $('ed-handle')) toggleEditorAway();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
}

$('ed-handle').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    toggleEditorAway();
  }
});

// Con ratón o trackpad: la rueda sobre la cabecera o el asa mueve el panel
for (const el of [$('ed-handle'), $('editor').querySelector('.editor-head')]) {
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    setEditorOffset(edOffset - e.deltaY, false);
    $('editor').classList.remove('dragging');
  }, { passive: false });
}

window.addEventListener('resize', () => {
  if (!$('editor').hidden) setEditorOffset(edOffset, false);
});

$('ed-reset').addEventListener('click', () => {
  touch.resetLayout();
  save();
});

$('ed-done').addEventListener('click', closeEditor);

// --- Presets del mando táctil ---------------------------------------------
// Cada preset guarda las dos orientaciones, los tamaños, la transparencia y
// si hay controles del jugador 2.

function renderPresets() {
  const presets = settings.touch.presets;
  for (const id of ['ed-preset', 'opt-preset']) {
    const sel = $(id);
    const prev = sel.value;
    sel.textContent = '';
    const head = document.createElement('option');
    head.value = '';
    head.textContent = presets.length ? 'Elegir preset…' : 'Sin presets guardados';
    sel.appendChild(head);
    presets.forEach((p, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = p.name;
      sel.appendChild(o);
    });
    sel.value = presets[prev] ? prev : '';
    sel.disabled = !presets.length;
  }
  $('ed-preset-del').disabled = $('ed-preset').value === '';
}

function applyPreset(i) {
  const p = settings.touch.presets[i];
  if (!p) return;
  const t = settings.touch;
  for (const k of TOUCH_PRESET_KEYS) if (k in p) t[k] = p[k];
  for (const o of ['landscape', 'portrait']) {
    if (p.layout[o]) t.layout[o] = { ...structuredClone(DEFAULT_TOUCH_LAYOUT[o]), ...structuredClone(p.layout[o]) };
  }
  $('ed-preset-name').value = p.name;
  save();
  syncForm();
  $('ed-preset').value = $('opt-preset').value = String(i);
  $('ed-preset-del').disabled = false;
  touch.applyLayout();
  toast(`Preset «${p.name}» cargado`);
}

for (const id of ['ed-preset', 'opt-preset']) {
  $(id).addEventListener('change', (e) => {
    if (e.target.value === '') {
      $('ed-preset-del').disabled = true;
      return;
    }
    applyPreset(Number(e.target.value));
  });
}

function savePreset() {
  const t = settings.touch;
  const name = $('ed-preset-name').value.trim() || `Preset ${t.presets.length + 1}`;
  const preset = { name, layout: structuredClone(t.layout) };
  for (const k of TOUCH_PRESET_KEYS) preset[k] = t[k];
  let i = t.presets.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
  if (i >= 0) t.presets[i] = preset;
  else i = t.presets.push(preset) - 1;
  save();
  renderPresets();
  $('ed-preset').value = $('opt-preset').value = String(i);
  $('ed-preset-del').disabled = false;
  $('ed-preset-name').value = name;
  toast(`Preset «${name}» guardado (vertical y horizontal)`);
}

$('ed-preset-save').addEventListener('click', savePreset);
$('ed-preset-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    savePreset();
  }
});

$('ed-preset-del').addEventListener('click', () => {
  const i = Number($('ed-preset').value);
  const p = settings.touch.presets[i];
  if ($('ed-preset').value === '' || !p) return;
  if (!confirm(`¿Borrar el preset «${p.name}»?`)) return;
  settings.touch.presets.splice(i, 1);
  save();
  $('ed-preset').value = '';
  renderPresets();
  toast(`Preset «${p.name}» borrado`);
});

// --- Pestaña Teclas ---------------------------------------------------------

let listening = null;

function renderKeys() {
  for (const group of ['controls', 'system']) {
    const box = $('keys-' + group);
    box.textContent = '';
    for (const a of ACTIONS.filter((x) => x.group === group)) {
      const row = document.createElement('div');
      row.className = 'key-row';
      const name = document.createElement('span');
      name.textContent = a.name;
      row.appendChild(name);
      for (let slot = 0; slot < 2; slot++) {
        const b = document.createElement('button');
        b.type = 'button';
        const code = settings.keys[a.id][slot];
        b.className = 'key-slot' + (code ? '' : ' empty');
        b.textContent = code ? controls.keyLabel(code) : 'vacía';
        b.title = code ? 'Cambiar tecla (clic derecho para vaciar)' : 'Asignar tecla';
        b.addEventListener('click', () => startListening(b, a.id, slot));
        b.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          settings.keys[a.id][slot] = null;
          save();
          renderKeys();
        });
        row.appendChild(b);
      }
      box.appendChild(row);
    }
  }
}

function startListening(btn, id, slot) {
  if (listening) {
    const same = listening.btn === btn;
    controls.captureNextKey(null);
    listening = null;
    if (same) {
      // Segundo toque sobre la misma casilla: vaciarla (en iOS no hay clic derecho)
      settings.keys[id][slot] = null;
      save();
      renderKeys();
      return;
    }
    renderKeys();
    btn = findSlot(id, slot);
  }
  listening = { btn, id, slot };
  btn.classList.add('listening');
  btn.textContent = 'Pulsa tecla';
  btn.title = 'Pulsa la tecla nueva, o toca otra vez para dejar la casilla vacía';
  controls.captureNextKey((code) => {
    listening = null;
    // Quitar la tecla de cualquier otra acción
    for (const a of ACTIONS) {
      settings.keys[a.id] = settings.keys[a.id].map((c, i) =>
        c === code && !(a.id === id && i === slot) ? null : c);
    }
    settings.keys[id][slot] = code;
    save();
    renderKeys();
  });
}

function findSlot(id, slot) {
  const idx = ACTIONS.findIndex((a) => a.id === id);
  const group = ACTIONS[idx].group;
  const pos = ACTIONS.filter((a) => a.group === group).findIndex((a) => a.id === id);
  return $('keys-' + group).children[pos].children[slot + 1];
}

$('keys-reset').addEventListener('click', () => {
  settings.keys = structuredClone(DEFAULT_KEYS);
  save();
  renderKeys();
});

// --- Pestaña Récords --------------------------------------------------------

function renderScores() {
  const list = $('scores-list');
  list.textContent = '';
  const rows = engine.getHighScores({ mode: $('scores-mode').value });
  if (!rows.length || rows.every((r) => r.score === 0)) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Todavía no hay récords en esta tabla.';
    list.appendChild(li);
    return;
  }
  rows.forEach((r, i) => {
    const li = document.createElement('li');
    for (const text of [i + 1 + '.', r.name, r.score.toLocaleString('es')]) {
      const s = document.createElement('span');
      s.textContent = text;
      li.appendChild(s);
    }
    list.appendChild(li);
  });
}

$('scores-mode').addEventListener('change', renderScores);

$('scores-clear').addEventListener('click', () => {
  if (!confirm('¿Borrar todos los récords guardados en este navegador?')) return;
  clearScores();
  renderScores();
  toast('Récords borrados');
});

$('scores-import').addEventListener('click', () => $('scores-file').click());
$('scores-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 112 || bytes[0] !== 115) {
    toast('El archivo no parece un DIGGER.SCO válido');
    return;
  }
  const buf = new Uint8Array(512);
  buf.set(bytes.subarray(0, 512));
  saveScoreBuffer(buf);
  renderScores();
  toast('Récords importados');
});

$('scores-export').addEventListener('click', () => {
  const blob = new Blob([loadScoreBuffer()], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'DIGGER.SCO';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// --- Avisos -----------------------------------------------------------------

let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

// --- PWA ------------------------------------------------------------------

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('install-box').hidden = false;
});
$('install').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
  $('install-box').hidden = true;
});

const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isIOS && !standalone) $('ios-install').hidden = false;

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker:', err));
}

// Evitar el zoom con doble toque y gestos de pellizco en iOS
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

// --- Inicio -----------------------------------------------------------------

syncForm();
renderKeys();
showMenu();
