// Motor de Digger traducido de C a JavaScript.
//
// Cada sección corresponde a un archivo del código original (main.c,
// digger.c, monster.c, bags.c, drawing.c, sprite.c, scores.c, input.c,
// sound.c y newsnd.c). Los nombres de variables y funciones se conservan para
// que sea fácil compararlo con el C. Las funciones que en C esperaban de forma
// bloqueante (newframe, getkey...) aquí son async y usan `await`.
//
// Digger Remastered - Copyright (c) Andrew Jenner 1998-2004 (GPL v2)
// Portions Copyright (c) 1983 Windmill Software Inc.

import * as video from './video.js';
import * as controls from './controls.js';
import * as frames from './frames.js';
import { loadScoreBuffer, saveScoreBuffer } from './settings.js';

const gputi = video.vgaputi;
const ggeti = video.vgageti;
const gputim = video.vgaputim;
const ggetpix = video.vgagetpix;
const gwrite = video.vgawrite;
const gclear = video.vgaclear;
const gpal = video.vgapal;
const ginten = video.vgainten;
const gtitle = video.vgatitle;

/** Ganchos hacia la interfaz (los rellena main.js). */
export const hooks = {
  onSoundFlags: null, // (soundflag, musicflag) => void
  onSpeed: null, // (ftime) => void
  onMode: null, // (mode) => void, al cambiar el modo con Esc/N en el título
};

// ===========================================================================
// def.h
// ===========================================================================

const DIR_NONE = -1, DIR_RIGHT = 0, DIR_UP = 2, DIR_LEFT = 4, DIR_DOWN = 6;
const TYPES = 5;
const BONUSES = 1, BAGS = 50, MONSTERS = 6, DIGGERS = 2, FIREBALLS = DIGGERS;
const SPRITES = BONUSES + BAGS + MONSTERS + FIREBALLS + DIGGERS;
const FIRSTBONUS = 0, LASTBONUS = FIRSTBONUS + BONUSES;
const FIRSTBAG = LASTBONUS, LASTBAG = FIRSTBAG + BAGS;
const FIRSTMONSTER = LASTBAG, LASTMONSTER = FIRSTMONSTER + MONSTERS;
const FIRSTFIREBALL = LASTMONSTER, LASTFIREBALL = FIRSTFIREBALL + FIREBALLS;
const FIRSTDIGGER = LASTFIREBALL, LASTDIGGER = FIRSTDIGGER + DIGGERS;
const MWIDTH = 15, MHEIGHT = 10, MSIZE = MWIDTH * MHEIGHT;

/** División entera de C (trunca hacia cero). */
const idiv = (a, b) => (a / b) | 0;

// ===========================================================================
// record.c (la grabación de partidas no se porta: valores fijos)
// ===========================================================================

const playing = false;
const drfvalid = true;
const kludge = false;

// ===========================================================================
// main.c
// ===========================================================================

const gamedat = [{ level: 0, levdone: false }, { level: 0, levdone: false }];
let pldispbuf = '';
let curplayer = 0, nplayers = 1, penalty = 0, diggers = 1, startlev = 1;
let levnotdrawn = false, alldead = false, unlimlives = false, started = false;
let gtime = 0;
let gauntlet = false, timeout = false;
/** Modo TWO PLAYERS VERSUS: dos diggers a la vez que comparten puntos y vidas. */
let shared = false;
/** Modo actual ('1p', '2p', 'vs', '2s' o 'gauntlet') y nivel de la partida. */
let curmode = '1p';
let playlev = 1;
/** Pantalla de título (para el botón táctil de pausa). */
let ontitle = false;
/** Los controles táctiles están visibles (cambian los textos de ayuda). */
let touchui = false;
const levfflag = false;

/** Salir de mainprog() y volver al menú de la página. */
let quitRequested = false;
/** true mientras se juega un nivel (para pausar al ocultar la página). */
let inPlay = false;
let running = false;

const leveldat = [
  ['S   B     HHHHS',
   'V  CC  C  V B  ',
   'VB CC  C  V    ',
   'V  CCB CB V CCC',
   'V  CC  C  V CCC',
   'HH CC  C  V CCC',
   ' V    B B V    ',
   ' HHHH     V    ',
   'C   V     V   C',
   'CC  HHHHHHH  CC'],
  ['SHHHHH  B B  HS',
   ' CC  V       V ',
   ' CC  V CCCCC V ',
   'BCCB V CCCCC V ',
   'CCCC V       V ',
   'CCCC V B  HHHH ',
   ' CC  V CC V    ',
   ' BB  VCCCCV CC ',
   'C    V CC V CC ',
   'CC   HHHHHH    '],
  ['SHHHHB B BHHHHS',
   'CC  V C C V BB ',
   'C   V C C V CC ',
   ' BB V C C VCCCC',
   'CCCCV C C VCCCC',
   'CCCCHHHHHHH CC ',
   ' CC  C V C  CC ',
   ' CC  C V C     ',
   'C    C V C    C',
   'CC   C H C   CC'],
  ['SHBCCCCBCCCCBHS',
   'CV  CCCCCCC  VC',
   'CHHH CCCCC HHHC',
   'C  V  CCC  V  C',
   '   HHH C HHH   ',
   '  B  V B V  B  ',
   '  C  VCCCV  C  ',
   ' CCC HHHHH CCC ',
   'CCCCC CVC CCCCC',
   'CCCCC CHC CCCCC'],
  ['SHHHHHHHHHHHHHS',
   'VBCCCCBVCCCCCCV',
   'VCCCCCCV CCBC V',
   'V CCCC VCCBCCCV',
   'VCCCCCCV CCCC V',
   'V CCCC VBCCCCCV',
   'VCCBCCCV CCCC V',
   'V CCBC VCCCCCCV',
   'VCCCCCCVCCCCCCV',
   'HHHHHHHHHHHHHHH'],
  ['SHHHHHHHHHHHHHS',
   'VCBCCV V VCCBCV',
   'VCCC VBVBV CCCV',
   'VCCCHH V HHCCCV',
   'VCC V CVC V CCV',
   'VCCHH CVC HHCCV',
   'VC V CCVCC V CV',
   'VCHHBCCVCCBHHCV',
   'VCVCCCCVCCCCVCV',
   'HHHHHHHHHHHHHHH'],
  ['SHCCCCCVCCCCCHS',
   ' VCBCBCVCBCBCV ',
   'BVCCCCCVCCCCCVB',
   'CHHCCCCVCCCCHHC',
   'CCV CCCVCCC VCC',
   'CCHHHCCVCCHHHCC',
   'CCCCV CVC VCCCC',
   'CCCCHH V HHCCCC',
   'CCCCCV V VCCCCC',
   'CCCCCHHHHHCCCCC'],
  ['HHHHHHHHHHHHHHS',
   'V CCBCCCCCBCC V',
   'HHHCCCCBCCCCHHH',
   'VBV CCCCCCC VBV',
   'VCHHHCCCCCHHHCV',
   'VCCBV CCC VBCCV',
   'VCCCHHHCHHHCCCV',
   'VCCCC V V CCCCV',
   'VCCCCCV VCCCCCV',
   'HHHHHHHHHHHHHHH'],
];

function getlevch(x, y, l) {
  if ((l === 3 || l === 4) && !levfflag && diggers === 2 && y === 9 && (x === 6 || x === 8))
    return 'H';
  // Con un solo jugador, el C inicializaba también el nivel 0 del jugador 2
  // (leía fuera del arreglo sin consecuencias). Aquí se usa el nivel 1.
  return (leveldat[l - 1] || leveldat[0])[y][x];
}

async function game() {
  let t, c, i;
  let flashplayer = false;
  if (gauntlet) {
    cgtime = gtime * 1193181;
    timeout = false;
  }
  initlives();
  gamedat[0].level = playlev;
  if (nplayers === 2)
    gamedat[1].level = playlev;
  alldead = false;
  gclear();
  curplayer = 0;
  initlevel();
  curplayer = 1;
  initlevel();
  zeroscores();
  bonusvisible = true;
  if (nplayers === 2)
    flashplayer = true;
  curplayer = 0;
  while (getalllives() !== 0 && !escape && !timeout) {
    while (!alldead && !escape && !timeout) {
      initmbspr();
      randv = getlrt();
      if (levnotdrawn) {
        levnotdrawn = false;
        drawscreen();
        if (flashplayer) {
          flashplayer = false;
          pldispbuf = 'PLAYER ' + (curplayer === 0 ? '1' : '2');
          cleartopline();
          for (t = 0; t < 15; t++)
            for (c = 1; c <= 3; c++) {
              outtext(pldispbuf, 108, 0, c);
              writecurscore(c);
              await newframe();
              if (escape)
                return;
            }
          drawscores();
          for (i = 0; i < diggers; i++)
            addscore(i, 0);
        }
      } else
        initchars();
      outtext('        ', 108, 0, 3);
      initscores();
      drawlives();
      music(1);

      flushkeybuf();
      for (i = 0; i < diggers; i++)
        readdir(i);
      inPlay = true;
      while (!alldead && !gamedat[curplayer].levdone && !escape && !timeout) {
        penalty = 0;
        await dodigger();
        domonsters();
        dobags();
        if (penalty > 8)
          incmont(penalty - 8);
        await testpause();
        checklevdone();
      }
      inPlay = false;
      erasediggers();
      musicoff();
      t = 20;
      while ((getnmovingbags() !== 0 || t !== 0) && !escape && !timeout) {
        if (t !== 0)
          t--;
        penalty = 0;
        dobags();
        await dodigger();
        domonsters();
        if (penalty < 8)
          t = 0;
      }
      soundstop();
      for (i = 0; i < diggers; i++)
        killfire(i);
      erasebonus();
      cleanupbags();
      savefield();
      erasemonsters();
      if (gamedat[curplayer].levdone)
        await soundlevdone();
      if (countem() === 0 || gamedat[curplayer].levdone) {
        for (i = curplayer; i < diggers + curplayer; i++)
          if (getlives(i) > 0 && !digalive(i))
            declife(i);
        drawlives();
        gamedat[curplayer].level++;
        if (gamedat[curplayer].level > 1000)
          gamedat[curplayer].level = 1000;
        initlevel();
      } else if (alldead) {
        for (i = curplayer; i < curplayer + diggers; i++)
          if (getlives(i) > 0)
            declife(i);
        drawlives();
      }
      if ((alldead && getalllives() === 0 && !gauntlet && !escape) || timeout)
        await endofgame();
    }
    alldead = false;
    if (nplayers === 2 && getlives(1 - curplayer) !== 0) {
      curplayer = 1 - curplayer;
      flashplayer = levnotdrawn = true;
    }
  }
}

/** Opciones que en el original venían del INI o de la línea de comandos. */
export function configure(opts) {
  setmode(opts.mode || '1p');
  touchui = !!opts.touchControls;
  gtime = Math.min(3599, Math.max(1, opts.gauntletTime | 0 || 120));
  startlev = Math.max(1, opts.startLevel | 0 || 1);
  unlimlives = !!opts.unlimitedLives;
  ftime = opts.speed || 80000;
  soundflag = opts.sound !== false;
  musicflag = opts.music !== false;
}

export function isRunning() {
  return running;
}

/** Bucle principal del original (mainprog). Termina al salir desde el título. */
export async function mainprog() {
  running = true;
  quitRequested = false;
  introdone = false;
  ginit();
  escape = false;
  do {
    soundstop();
    creatembspr();
    detectjoy();
    gclear();
    gtitle();
    loadscores();
    outtext('D I G G E R', 100, 0, 3);
    shownplayers();
    showtable();
    await titlescreen();
    if (escape || quitRequested)
      break;
    pausef = false;
    await game();
    escape = false;
  } while (!escape && !quitRequested);
  finish();
  running = false;
}

// ---------------------------------------------------------------------------
// Pantalla de título: modos de juego y selección de nivel (no está en el C)
// ---------------------------------------------------------------------------

/** Modos que se recorren con Esc/N. */
const TITLE_MODES = ['1p', '2p', 'vs'];
/** Niveles que se pueden elegir. Del 10 en adelante la dificultad ya no sube. */
const SELECTLEVELS = 10;
/** Línea de ayuda, bajo el marco (donde estaba «Windmill Software 1983»). */
const HINTY = 184;

/** El letrero de Windmill ya se desvaneció en esta sesión. */
let introdone = false;
/** Teclas leídas por checkkeyb() en el título (se necesitan enteras, no solo la acción). */
const titlekeys = [];
let titlestate = 'mode'; // 'mode' | 'type' | 'level'
let typepick = 0; // 0 = ORIGINAL, 1 = SELECT LEVEL
let levelpick = 0;
let titleframe = 0, animx = 0;
let hint = [], hintidx = 0, hintchars = 0, hinttime = 0;

export function isOnTitle() {
  return ontitle;
}

async function titlescreen() {
  let frame = 0;
  ontitle = true;
  started = false;
  titlestate = 'mode';
  titleframe = 0;
  if (introdone) {
    clearcopyright();
    sethint();
  }
  commandbuffer = 0;
  await newframe();
  titlekeys.length = 0;
  while (!started && !quitRequested && !escape) {
    getcommand();
    start = false;
    while (titlekeys.length && !started && !escape)
      await titlekey(titlekeys.shift());
    if (started || escape)
      break;
    if (titlestate === 'mode')
      titleanim();
    else if ((frame & 3) === 0)
      drawcursor((frame & 4) === 0);
    if (introdone)
      updatehint();
    await newframe();
    frame++;
  }
  ontitle = false;
  start = false;
}

/** La animación original con Nobbin, Hobbin, Digger, Gold, Emerald y Bonus. */
function titleanim() {
  const frame = titleframe;
  if (frame === 0)
    clearpanel();
  if (frame === 50) {
    movedrawspr(FIRSTMONSTER, 292, 63);
    animx = 292;
  }
  if (frame > 50 && frame <= 77) {
    animx -= 4;
    drawmon(0, true, DIR_LEFT, animx, 63);
  }
  if (frame > 77)
    drawmon(0, true, DIR_RIGHT, 184, 63);
  if (frame === 83)
    outtext('NOBBIN', 216, 64, 2);
  if (frame === 90) {
    movedrawspr(FIRSTMONSTER + 1, 292, 82);
    drawmon(1, false, DIR_LEFT, 292, 82);
    animx = 292;
  }
  if (frame > 90 && frame <= 117) {
    animx -= 4;
    drawmon(1, false, DIR_LEFT, animx, 82);
  }
  if (frame > 117)
    drawmon(1, false, DIR_RIGHT, 184, 82);
  if (frame === 123)
    outtext('HOBBIN', 216, 83, 2);
  if (frame === 130) {
    movedrawspr(FIRSTDIGGER, 292, 101);
    drawdigger(0, DIR_LEFT, 292, 101, true);
    animx = 292;
  }
  if (frame > 130 && frame <= 157) {
    animx -= 4;
    drawdigger(0, DIR_LEFT, animx, 101, true);
  }
  if (frame > 157)
    drawdigger(0, DIR_RIGHT, 184, 101, true);
  if (frame === 163)
    outtext('DIGGER', 216, 102, 2);
  if (frame === 178) {
    movedrawspr(FIRSTBAG, 184, 120);
    drawgold(0, 0, 184, 120);
  }
  if (frame === 183)
    outtext('GOLD', 216, 121, 2);
  if (frame === 198)
    drawemerald(184, 141);
  if (frame === 203)
    outtext('EMERALD', 216, 140, 2);
  if (frame === 218)
    drawbonus(184, 158);
  if (frame === 223)
    outtext('BONUS', 216, 159, 2);
  titleframe++;
  if (titleframe > 250)
    titleframe = 0;
}

/** Quita los personajes de la animación y deja el panel derecho en negro. */
function clearpanel() {
  for (const n of [FIRSTMONSTER, FIRSTMONSTER + 1, FIRSTDIGGER, FIRSTBAG, FIRSTBONUS])
    erasespr(n);
  for (let t = 54; t < 174; t += 12)
    outtext('            ', 164, t, 0);
}

function dirof(action) {
  switch (action) {
    case 0: case 5: return DIR_RIGHT;
    case 1: case 6: return DIR_UP;
    case 2: case 7: return DIR_LEFT;
    case 3: case 8: return DIR_DOWN;
  }
  return DIR_NONE;
}

async function titlekey(k) {
  const a = k.action;
  if (a >= 11 && a <= 15) // velocidad, sonido, salir: ya los atendió checkkeyb()
    return;
  if (!introdone) {
    await dissolvecopyright();
    introdone = true;
    flushkeybuf();
    titlekeys.length = 0;
    sethint();
    return;
  }
  // En pantallas táctiles y mandos no hay Esc/N: la cruceta cambia de modo y
  // el botón de pausa (acción 18 virtual) hace de Esc/N
  const pad = k.code === 'Virtual' || k.code === 'Gamepad';
  const back = a === 18;
  const dir = dirof(a);
  switch (titlestate) {
    case 'mode':
      if (back)
        cyclemode(1);
      else if (pad && (dir === DIR_LEFT || dir === DIR_RIGHT))
        cyclemode(dir === DIR_RIGHT ? 1 : -1);
      else if (!(pad && dir !== DIR_NONE)) {
        titlestate = 'type';
        drawtype();
        sethint();
      }
      break;
    case 'type':
      if (back) {
        titlestate = 'mode';
        titleframe = 0;
        sethint();
      } else if (dir !== DIR_NONE) {
        typepick = 1 - typepick;
        drawtype();
      } else if (typepick === 0) {
        playlev = startlev;
        started = true;
      } else {
        titlestate = 'level';
        drawlevels();
        sethint();
      }
      break;
    case 'level':
      if (back) {
        titlestate = 'type';
        drawtype();
        sethint();
      } else if (dir !== DIR_NONE) {
        const step = dir === DIR_RIGHT ? 1 : dir === DIR_LEFT ? -1 : dir === DIR_DOWN ? 2 : -2;
        levelpick = (levelpick + step + SELECTLEVELS) % SELECTLEVELS;
        drawlevels();
      } else {
        playlev = levelpick + 1;
        started = true;
      }
      break;
  }
}

function cyclemode(step) {
  const i = TITLE_MODES.indexOf(curmode);
  const next = i < 0 ? 0 : (i + step + TITLE_MODES.length) % TITLE_MODES.length;
  setmode(TITLE_MODES[next]);
  shownplayers();
  loadscores();
  showtable();
  hooks.onMode?.(curmode);
}

/** ¿Jugar los niveles uno tras otro o elegir el nivel? */
function drawtype() {
  clearpanel();
  outtext('ORIGINAL', 182, 76, typepick === 0 ? 3 : 2);
  outtext('SELECT', 182, 106, typepick === 1 ? 3 : 2);
  outtext('LEVEL', 194, 120, typepick === 1 ? 3 : 2);
  drawcursor(true);
}

/** [1] [2] ... [10] en dos columnas. */
function drawlevels() {
  clearpanel();
  for (let i = 0; i < SELECTLEVELS; i++) {
    const [x, y] = levelpos(i);
    outtext('[' + (i + 1) + ']', x + 12, y, i === levelpick ? 3 : 2);
  }
  drawcursor(true);
}

function levelpos(i) {
  return [i % 2 === 0 ? 170 : 236, 62 + (i >> 1) * 22];
}

/** El indicador > parpadea en la opción elegida. */
function drawcursor(on) {
  const c = on ? '>' : ' ';
  if (titlestate === 'type') {
    outtext(typepick === 0 ? c : ' ', 168, 76, 3);
    outtext(typepick === 1 ? c : ' ', 168, 106, 3);
  } else if (titlestate === 'level') {
    for (let i = 0; i < SELECTLEVELS; i++) {
      const [x, y] = levelpos(i);
      outtext(i === levelpick ? c : ' ', x, y, 3);
    }
  }
}

/** Textos de ayuda que se alternan en la línea inferior. */
function sethint() {
  if (titlestate === 'mode')
    hint = touchui
      ? ['PAD < >: CHANGE MODE', 'FIRE: CONTINUE']
      : ['ESC OR N: CHANGE MODE', 'ANY OTHER KEY: CONTINUE'];
  else
    hint = touchui
      ? ['PAD: MOVE  FIRE: OK', 'PAUSE BUTTON: BACK']
      : ['ARROWS: MOVE  ENTER: OK', 'ESC OR N: BACK'];
  hintidx = 0;
  hintchars = 0;
  hinttime = 0;
  outtext(' '.repeat(26), 4, HINTY, 3);
}

/** Escribe la ayuda letra a letra, como una terminal, y la cambia cada pocos segundos. */
function updatehint() {
  const text = hint[hintidx];
  const x = 160 - text.length * 6;
  if (hintchars < text.length) {
    hintchars = Math.min(text.length, hintchars + 2);
    outtext(text.slice(0, hintchars), x, HINTY, hintidx === 0 ? 3 : 1);
    if (hintchars < text.length)
      gwrite(x + hintchars * 12, HINTY, '_', 2);
  } else if (++hinttime > 45) {
    hinttime = 0;
    hintchars = 0;
    hintidx = (hintidx + 1) % hint.length;
    outtext(' '.repeat(26), 4, HINTY, 3);
  }
}

// Zona de «© Windmill Software 1983» en el framebuffer de 640x400
const COPY_Y0 = 362, COPY_Y1 = 400;

function clearcopyright() {
  video.fb.fill(0, COPY_Y0 * video.WIDTH, COPY_Y1 * video.WIDTH);
  video.invalidate();
}

/**
 * Desvanece el letrero de Windmill al estilo de las consolas de 8 bits: primero
 * se pixela en bloques cada vez más grandes y después los bloques se apagan
 * uno a uno, en orden aleatorio, pasando por un color más oscuro.
 */
async function dissolvecopyright() {
  const W = video.WIDTH, fb = video.fb;
  const H = COPY_Y1 - COPY_Y0;
  const snap = fb.slice(COPY_Y0 * W, COPY_Y1 * W);
  const DARKER = [0, 8, 8, 8, 8, 8, 8, 8, 0, 1, 2, 3, 4, 5, 6, 7];
  const BIG = 16;
  const thresholds = [];
  for (let i = 0; i < Math.ceil(W / BIG) * Math.ceil(H / BIG); i++)
    thresholds.push(Math.random());
  soundbreak();

  // Color de un bloque: el más frecuente entre los píxeles encendidos, si
  // cubren al menos una cuarta parte del bloque
  const blockcolor = (bx, by, size) => {
    const counts = new Uint16Array(16);
    let n = 0, lit = 0;
    for (let y = by; y < Math.min(by + size, H); y++)
      for (let x = bx; x < Math.min(bx + size, W); x++) {
        const c = snap[y * W + x];
        n++;
        if (c) {
          counts[c]++;
          lit++;
        }
      }
    if (lit * 4 < n)
      return 0;
    let best = 0;
    for (let c = 1; c < 16; c++)
      if (counts[c] > counts[best])
        best = c;
    return best;
  };
  const fillblock = (bx, by, size, c) => {
    for (let y = by; y < Math.min(by + size, H); y++)
      fb.fill(c, (COPY_Y0 + y) * W + bx, (COPY_Y0 + y) * W + Math.min(bx + size, W));
  };

  const t0 = frames.now;
  const DURATION = 1200;
  for (;;) {
    video.present();
    await frames.nextFrame();
    const p = (frames.now - t0) / DURATION;
    if (p >= 1 || quitRequested)
      break;
    if (p < 0.4) {
      const size = [2, 4, 8, 16][Math.floor(p / 0.1)];
      for (let by = 0; by < H; by += size)
        for (let bx = 0; bx < W; bx += size)
          fillblock(bx, by, size, blockcolor(bx, by, size));
    } else {
      const q = (p - 0.4) / 0.6;
      let i = 0;
      for (let by = 0; by < H; by += BIG)
        for (let bx = 0; bx < W; bx += BIG, i++) {
          const r = thresholds[i];
          let c = blockcolor(bx, by, BIG);
          if (q > r)
            c = 0;
          else if (q > r - 0.2)
            c = DARKER[c];
          fillblock(bx, by, BIG, c);
        }
    }
    video.invalidate();
  }
  soundbreakoff();
  clearcopyright();
  curtime = null;
}

function finish() {
  inPlay = false;
  soundstop();
  musicoff();
  video.present();
}

/** Botón "menú": abandona la partida y sale de mainprog. */
export function requestQuit() {
  quitRequested = true;
  escape = true;
  suspended = false;
}

/**
 * Congela el juego mientras el menú de la página está abierto: ni la partida
 * ni el sonido avanzan, y al volver se sigue exactamente donde estaba.
 */
let suspended = false;

export function suspend() {
  suspended = true;
}

export function resume() {
  suspended = false;
  curtime = null;
}

export function isSuspended() {
  return suspended;
}

/** Modo de la partida en marcha (puede diferir del elegido en el menú). */
export function currentMode() {
  return curmode;
}

/**
 * Ajustes cambiados en el menú durante una partida. La velocidad, el sonido,
 * la música y las vidas ilimitadas se aplican al momento. El modo y el nivel
 * inicial solo se aplican si se está en la pantalla de título; si no, en la
 * próxima partida.
 */
export function applySettings(opts) {
  if (ontitle) {
    configure(opts);
    shownplayers();
    loadscores();
    showtable();
    if (introdone)
      sethint();
    return;
  }
  ftime = opts.speed || 80000;
  soundflag = opts.sound !== false;
  musicflag = opts.music !== false;
  unlimlives = !!opts.unlimitedLives;
  touchui = !!opts.touchControls;
}

/** Pausa la partida en curso (al ocultar la página o desde el botón táctil). */
export function requestPause() {
  if (inPlay && !suspended) pausef = true;
}

export function isPaused() {
  return paused;
}

function shownplayers() {
  let l1, l2;
  if (diggers === 2) {
    l1 = 'TWO PLAYER';
    l2 = gauntlet ? 'GAUNTLET' : shared ? 'VERSUS' : 'SIMULTANEOUS';
    if (shared)
      l1 = 'TWO PLAYERS';
  } else if (gauntlet) {
    l1 = 'GAUNTLET';
    l2 = 'MODE';
  } else if (nplayers === 1) {
    l1 = 'ONE';
    l2 = 'PLAYER';
  } else {
    l1 = 'TWO';
    l2 = 'PLAYERS';
  }
  // Centrado en el panel derecho; primero se borra el texto anterior
  outtext('            ', 170, 25, 3);
  outtext('            ', 170, 39, 3);
  outtext(l1, 240 - l1.length * 6, 25, 3);
  outtext(l2, 240 - l2.length * 6, 39, 3);
}

function getalllives() {
  if (shared)
    return getlives(0);
  let t = 0;
  for (let i = curplayer; i < diggers + curplayer; i++)
    t += getlives(i);
  return t;
}

function setmode(mode) {
  curmode = mode;
  diggers = mode === '2s' || mode === 'vs' ? 2 : 1;
  nplayers = mode === '2p' ? 2 : 1;
  gauntlet = mode === 'gauntlet';
  shared = mode === 'vs';
}

function initlevel() {
  gamedat[curplayer].levdone = false;
  makefield();
  makeemfield();
  initbags();
  levnotdrawn = true;
}

function drawscreen() {
  creatembspr();
  drawstatics();
  drawbags();
  drawemeralds();
  initdigger();
  initmonsters();
}

function initchars() {
  initmbspr();
  initdigger();
  initmonsters();
}

function checklevdone() {
  if ((countem() === 0 || monleft() === 0) && isalive())
    gamedat[curplayer].levdone = true;
  else
    gamedat[curplayer].levdone = false;
}

function incpenalty() {
  penalty++;
}

function cleartopline() {
  outtext('                          ', 0, 0, 3);
  outtext(' ', 308, 0, 3);
}

function levplan() {
  let l = levno();
  if (l > 8)
    l = (l & 3) + 5; /* Level plan: 12345678, 678, (5678) 247 times, 5 forever */
  return l;
}

function levof10() {
  if (gamedat[curplayer].level > 10)
    return 10;
  return gamedat[curplayer].level;
}

function levno() {
  return gamedat[curplayer].level;
}

function setdead(df) {
  alldead = df;
}

let paused = false;

async function testpause() {
  if (pausef) {
    pausef = false;
    paused = true;
    soundpause();
    sett2val(40);
    setsoundt2();
    cleartopline();
    outtext('PRESS ANY KEY', 80, 0, 1);
    controls.flush();
    while (!controls.kbhit() && !quitRequested) {
      video.present();
      await frames.nextFrame();
    }
    controls.getkey();
    paused = false;
    pausef = false;
    cleartopline();
    drawscores();
    for (let i = 0; i < diggers; i++)
      addscore(i, 0);
    drawlives();
    curtime = null;
  } else
    soundpauseoff();
}

let randv = 0;

function randno(n) {
  randv = (Math.imul(randv, 0x15a4e35) + 1) | 0;
  return (randv & 0x7fffffff) % n;
}

function getlrt() {
  return (Date.now() * 1193) | 0;
}

function ginit() {
  video.vgainit();
  gpal(0);
}

// ===========================================================================
// digger.c
// ===========================================================================

const newDigger = () => ({
  x: 0, y: 0, h: 0, v: 0, rx: 0, ry: 0, mdir: 0, dir: 0, bagtime: 0, rechargetime: 0,
  fx: 0, fy: 0, fdir: 0, expsn: 0, deathstage: 0, deathbag: 0, deathani: 0, deathtime: 0,
  emocttime: 0, emn: 0, msc: 0, lives: 0, ivt: 0,
  notfiring: false, alive: false, firepressed: false, dead: false, levdone: false, invin: false,
});
const digdat = [newDigger(), newDigger()];

let startbonustimeleft = 0, bonustimeleft = 0;
let emmask = 0;
const emfield = new Int8Array(MSIZE);
let bonusvisible = false, bonusmode = false, digvisible = false;

function initdigger() {
  for (let dig = curplayer; dig < diggers + curplayer; dig++) {
    const d = digdat[dig];
    // En VERSUS las vidas compartidas pueden llegar a 0 con un digger todavía
    // vivo (está jugando la última): ese también vuelve a su posición inicial
    if (getlives(dig) === 0 && !(shared && d.alive)) {
      // Sin vidas: queda muerto del todo y no sigue animando su muerte en el
      // nivel nuevo. diggerdie() lo revive si el equipo gana una vida.
      d.alive = false;
      d.dead = true;
      d.deathstage = 4;
      d.deathtime = 0;
      d.expsn = 0;
      d.notfiring = true;
      d.rechargetime = 0;
      continue;
    }
    d.v = 9;
    d.mdir = 4;
    d.h = diggers === 1 ? 7 : 8 - dig * 2;
    d.x = d.h * 20 + 12;
    d.dir = dig === 0 ? DIR_RIGHT : DIR_LEFT;
    d.rx = 0;
    d.ry = 0;
    d.bagtime = 0;
    d.alive = true;
    d.dead = false; /* alive !=> !dead but dead => !alive */
    d.invin = false;
    d.ivt = 0;
    d.deathstage = 1;
    d.y = d.v * 18 + 18;
    movedrawspr(dig + FIRSTDIGGER - curplayer, d.x, d.y);
    d.notfiring = true;
    d.emocttime = 0;
    d.firepressed = false;
    d.expsn = 0;
    d.rechargetime = 0;
    d.emn = 0;
    d.msc = 1;
  }
  digvisible = true;
  bonusvisible = bonusmode = false;
}

/** ftime: duración de un cuadro en ticks del PIT (1193181 Hz). 80000 = 67 ms. */
let ftime = 80000;
/** Momento (ms) en que debía empezar el cuadro actual; null = resincronizar. */
let curtime = null;

/** Estadísticas para el indicador de FPS. */
export const stats = { logicFps: 0, displayFps: 0 };
let statFrames = 0, statDisplay = 0, statStart = 0;

/**
 * newframe(): espera a que pase un cuadro del juego (ftime).
 *
 * El original esperaba en un bucle activo. Aquí el tiempo se mide con la marca
 * de cada requestAnimationFrame y el objetivo avanza en pasos fijos (no desde
 * el momento en que se despertó), así que la velocidad media es exacta aunque
 * la pantalla refresque a 60, 90, 120 Hz o a una tasa variable (Android). Si
 * el juego se queda atrás (pestaña oculta, tirón largo) se resincroniza en vez
 * de acelerar para recuperar.
 */
async function newframe() {
  while (suspended && !quitRequested)
    await frames.nextFrame();
  const frameMs = ftime / 1193.181;
  for (;;) {
    video.present();
    await frames.nextFrame();
    statDisplay++;
    checkkeyb();
    const t = frames.now;
    if (curtime === null) {
      curtime = t - frameMs;
      break;
    }
    const tol = Math.min(frames.displayInterval * 0.5, 8);
    if (t + tol >= curtime + frameMs)
      break;
  }
  curtime += frameMs;
  if (frames.now - curtime > Math.max(150, frameMs * 2))
    curtime = frames.now;
  statFrames++;
  if (frames.now - statStart >= 1000) {
    const dt = (frames.now - statStart) / 1000;
    stats.logicFps = statFrames / dt;
    stats.displayFps = statDisplay / dt;
    statFrames = statDisplay = 0;
    statStart = frames.now;
  }
}

let cgtime = 0;

function drawdig(n, d, x, y, f) {
  drawdigger(n - curplayer, d, x, y, f);
  if (digdat[n].invin) {
    digdat[n].ivt--;
    if (digdat[n].ivt === 0)
      digdat[n].invin = false;
    else if (digdat[n].ivt % 10 < 5)
      erasespr(FIRSTDIGGER + n - curplayer);
  }
}

async function dodigger() {
  await newframe();
  if (gauntlet) {
    drawlives();
    if (cgtime < ftime)
      timeout = true;
    cgtime -= ftime;
  }
  for (let n = curplayer; n < diggers + curplayer; n++) {
    const d = digdat[n];
    if (d.expsn !== 0)
      drawexplosion(n);
    else
      updatefire(n);
    if (digvisible) {
      if (d.alive) {
        if (d.bagtime !== 0) {
          drawdig(n, d.mdir, d.x, d.y, d.notfiring && d.rechargetime === 0);
          incpenalty();
          d.bagtime--;
        } else
          updatedigger(n);
      } else
        diggerdie(n);
    }
    if (d.emocttime > 0)
      d.emocttime--;
  }
  if (bonusmode && isalive()) {
    if (bonustimeleft !== 0) {
      bonustimeleft--;
      if (startbonustimeleft !== 0 || bonustimeleft < 20) {
        startbonustimeleft--;
        if (bonustimeleft & 1) {
          ginten(0);
          soundbonus();
        } else {
          ginten(1);
          soundbonus();
        }
        if (startbonustimeleft === 0) {
          music(0);
          soundbonusoff();
          ginten(1);
        }
      }
    } else {
      endbonusmode();
      soundbonusoff();
      music(1);
    }
  }
  if (bonusmode && !isalive()) {
    endbonusmode();
    soundbonusoff();
    music(1);
  }
}

function updatefire(n) {
  const d = digdat[n];
  let pix = 0, i, clflag;
  if (d.notfiring) {
    if (d.rechargetime !== 0)
      d.rechargetime--;
    else if (getfirepflag(n - curplayer)) {
      if (d.alive) {
        d.rechargetime = levof10() * 3 + 60;
        d.notfiring = false;
        switch (d.dir) {
          case DIR_RIGHT:
            d.fx = d.x + 8;
            d.fy = d.y + 4;
            break;
          case DIR_UP:
            d.fx = d.x + 4;
            d.fy = d.y;
            break;
          case DIR_LEFT:
            d.fx = d.x;
            d.fy = d.y + 4;
            break;
          case DIR_DOWN:
            d.fx = d.x + 4;
            d.fy = d.y + 8;
        }
        d.fdir = d.dir;
        movedrawspr(FIRSTFIREBALL + n - curplayer, d.fx, d.fy);
        soundfire(n);
      }
    }
  } else {
    switch (d.fdir) {
      case DIR_RIGHT:
        d.fx += 8;
        pix = ggetpix(d.fx, d.fy + 4) | ggetpix(d.fx + 4, d.fy + 4);
        break;
      case DIR_UP:
        d.fy -= 7;
        pix = 0;
        for (i = 0; i < 7; i++)
          pix |= ggetpix(d.fx + 4, d.fy + i);
        pix &= 0xc0;
        break;
      case DIR_LEFT:
        d.fx -= 8;
        pix = ggetpix(d.fx, d.fy + 4) | ggetpix(d.fx + 4, d.fy + 4);
        break;
      case DIR_DOWN:
        d.fy += 7;
        pix = 0;
        for (i = 0; i < 7; i++)
          pix |= ggetpix(d.fx, d.fy + i);
        pix &= 0x3;
        break;
    }
    drawfire(n - curplayer, d.fx, d.fy, 0);
    const clfirst = first.slice();
    const clcoll = coll.slice();
    incpenalty();
    i = clfirst[2];
    while (i !== -1) {
      killmon(i - FIRSTMONSTER);
      scorekill(n);
      d.expsn = 1;
      i = clcoll[i];
    }
    i = clfirst[4];
    while (i !== -1) {
      const o = i - FIRSTDIGGER + curplayer;
      if (o !== n && !digdat[o].invin && digdat[o].alive) {
        killdigger(o, 3, 0);
        d.expsn = 1;
      }
      i = clcoll[i];
    }
    clflag = clfirst[0] !== -1 || clfirst[1] !== -1 || clfirst[2] !== -1 || clfirst[3] !== -1 ||
      clfirst[4] !== -1;
    if (clfirst[0] !== -1 || clfirst[1] !== -1 || clfirst[3] !== -1) {
      d.expsn = 1;
      i = clfirst[3];
      while (i !== -1) {
        if (digdat[i - FIRSTFIREBALL + curplayer].expsn === 0)
          digdat[i - FIRSTFIREBALL + curplayer].expsn = 1;
        i = clcoll[i];
      }
    }
    switch (d.fdir) {
      case DIR_RIGHT:
        if (d.fx > 296)
          d.expsn = 1;
        else if (pix !== 0 && !clflag) {
          d.expsn = 1;
          d.fx -= 8;
          drawfire(n - curplayer, d.fx, d.fy, 0);
        }
        break;
      case DIR_UP:
        if (d.fy < 15)
          d.expsn = 1;
        else if (pix !== 0 && !clflag) {
          d.expsn = 1;
          d.fy += 7;
          drawfire(n - curplayer, d.fx, d.fy, 0);
        }
        break;
      case DIR_LEFT:
        if (d.fx < 16)
          d.expsn = 1;
        else if (pix !== 0 && !clflag) {
          d.expsn = 1;
          d.fx += 8;
          drawfire(n - curplayer, d.fx, d.fy, 0);
        }
        break;
      case DIR_DOWN:
        if (d.fy > 183)
          d.expsn = 1;
        else if (pix !== 0 && !clflag) {
          d.expsn = 1;
          d.fy -= 7;
          drawfire(n - curplayer, d.fx, d.fy, 0);
        }
    }
  }
}

function erasediggers() {
  for (let i = 0; i < diggers; i++)
    erasespr(FIRSTDIGGER + i);
  digvisible = false;
}

function drawexplosion(n) {
  const d = digdat[n];
  switch (d.expsn) {
    case 1:
      soundexplode(n);
    // fall through
    case 2:
    case 3:
      drawfire(n - curplayer, d.fx, d.fy, d.expsn);
      incpenalty();
      d.expsn++;
      break;
    default:
      killfire(n);
      d.expsn = 0;
  }
}

function killfire(n) {
  if (!digdat[n].notfiring) {
    digdat[n].notfiring = true;
    erasespr(FIRSTFIREBALL + n - curplayer);
    soundfireoff(n);
  }
}

function updatedigger(n) {
  const d = digdat[n];
  let dir, ddir, push = true, bagf, i;
  readdir(n - curplayer);
  dir = getdir(n - curplayer);
  if (dir === DIR_RIGHT || dir === DIR_UP || dir === DIR_LEFT || dir === DIR_DOWN)
    ddir = dir;
  else
    ddir = DIR_NONE;
  if (d.rx === 0 && (ddir === DIR_UP || ddir === DIR_DOWN))
    d.dir = d.mdir = ddir;
  if (d.ry === 0 && (ddir === DIR_RIGHT || ddir === DIR_LEFT))
    d.dir = d.mdir = ddir;
  if (dir === DIR_NONE)
    d.mdir = DIR_NONE;
  else
    d.mdir = d.dir;
  if ((d.x === 292 && d.mdir === DIR_RIGHT) ||
      (d.x === 12 && d.mdir === DIR_LEFT) ||
      (d.y === 180 && d.mdir === DIR_DOWN) ||
      (d.y === 18 && d.mdir === DIR_UP))
    d.mdir = DIR_NONE;
  const diggerox = d.x;
  const diggeroy = d.y;
  if (d.mdir !== DIR_NONE)
    eatfield(diggerox, diggeroy, d.mdir);
  switch (d.mdir) {
    case DIR_RIGHT:
      drawrightblob(d.x, d.y);
      d.x += 4;
      break;
    case DIR_UP:
      drawtopblob(d.x, d.y);
      d.y -= 3;
      break;
    case DIR_LEFT:
      drawleftblob(d.x, d.y);
      d.x -= 4;
      break;
    case DIR_DOWN:
      drawbottomblob(d.x, d.y);
      d.y += 3;
      break;
  }
  if (hitemerald(idiv(d.x - 12, 20), idiv(d.y - 18, 18), (d.x - 12) % 20, (d.y - 18) % 18, d.mdir)) {
    if (d.emocttime === 0)
      d.emn = 0;
    scoreemerald(n);
    soundem();
    soundemerald(d.emn);
    d.emn++;
    if (d.emn === 8) {
      d.emn = 0;
      scoreoctave(n);
    }
    d.emocttime = 9;
  }
  drawdig(n, d.dir, d.x, d.y, d.notfiring && d.rechargetime === 0);
  const clfirst = first.slice();
  const clcoll = coll.slice();
  incpenalty();

  i = clfirst[1];
  bagf = false;
  while (i !== -1) {
    if (bagexist(i - FIRSTBAG)) {
      bagf = true;
      break;
    }
    i = clcoll[i];
  }

  if (bagf) {
    if (d.mdir === DIR_RIGHT || d.mdir === DIR_LEFT) {
      push = pushbags(d.mdir, clfirst, clcoll);
      d.bagtime++;
    } else if (!pushudbags(clfirst, clcoll))
      push = false;
    if (!push) { /* Strange, push not completely defined */
      d.x = diggerox;
      d.y = diggeroy;
      drawdig(n, d.mdir, d.x, d.y, d.notfiring && d.rechargetime === 0);
      incpenalty();
      d.dir = reversedir(d.mdir);
    }
  }
  if (clfirst[2] !== -1 && bonusmode && d.alive)
    for (let nmon = killmonsters(clfirst, clcoll); nmon !== 0; nmon--) {
      soundeatm();
      sceatm(n);
    }
  if (clfirst[0] !== -1) {
    scorebonus(n);
    initbonusmode();
  }
  d.h = idiv(d.x - 12, 20);
  d.rx = (d.x - 12) % 20;
  d.v = idiv(d.y - 18, 18);
  d.ry = (d.y - 18) % 18;
}

function sceatm(n) {
  scoreeatm(n, digdat[n].msc);
  digdat[n].msc <<= 1;
}

const deatharc = [3, 5, 6, 6, 5, 3, 0];

function diggerdie(n) {
  const d = digdat[n];
  let i, all;
  switch (d.deathstage) {
    case 1:
      if (bagy(d.deathbag) + 6 > d.y)
        d.y = bagy(d.deathbag) + 6;
      drawdigger(n - curplayer, 15, d.x, d.y, false);
      incpenalty();
      if (getbagdir(d.deathbag) + 1 === 0) {
        soundddie();
        d.deathtime = 5;
        d.deathstage = 2;
        d.deathani = 0;
        d.y -= 6;
      }
      break;
    case 2: {
      if (d.deathtime !== 0) {
        d.deathtime--;
        break;
      }
      if (d.deathani === 0)
        music(2);
      drawdigger(n - curplayer, 14 - d.deathani, d.x, d.y, false);
      const clfirst = first.slice();
      const clcoll = coll.slice();
      incpenalty();
      if (d.deathani === 0 && clfirst[2] !== -1)
        killmonsters(clfirst, clcoll);
      if (d.deathani < 4) {
        d.deathani++;
        d.deathtime = 2;
      } else {
        d.deathstage = 4;
        if (musicflag || diggers > 1)
          d.deathtime = 100;
        else
          d.deathtime = 10;
      }
      break;
    }
    case 3:
      d.deathstage = 5;
      d.deathani = 0;
      d.deathtime = 0;
      break;
    case 5:
      if (d.deathani >= 0 && d.deathani <= 6) {
        drawdigger(n - curplayer, 15, d.x, d.y - deatharc[d.deathani], false);
        if (d.deathani === 6 && !isalive())
          musicoff();
        incpenalty();
        d.deathani++;
        if (d.deathani === 1)
          soundddie();
        if (d.deathani === 7) {
          d.deathtime = 5;
          d.deathani = 0;
          d.deathstage = 2;
        }
      }
      break;
    case 4:
      if (d.deathtime !== 0)
        d.deathtime--;
      else {
        // En VERSUS, un digger que ya contó su muerte y espera a que el equipo
        // gane una vida vuelve en cuanto la hay, gastándola
        const revive = shared && d.dead;
        d.dead = true;
        all = true;
        for (i = 0; i < diggers; i++)
          if (!digdat[i].dead) {
            all = false;
            break;
          }
        if (all)
          setdead(true);
        else if (isalive() && getlives(n) > 0) {
          declife(n);
          drawlives();
          if (revive || getlives(n) > 0) {
            d.v = 9;
            d.mdir = 4;
            d.h = diggers === 1 ? 7 : 8 - n * 2;
            d.x = d.h * 20 + 12;
            d.dir = n === 0 ? DIR_RIGHT : DIR_LEFT;
            d.rx = 0;
            d.ry = 0;
            d.bagtime = 0;
            d.alive = true;
            d.dead = false;
            d.invin = true;
            d.ivt = 50;
            d.deathstage = 1;
            d.y = d.v * 18 + 18;
            erasespr(n + FIRSTDIGGER - curplayer);
            movedrawspr(n + FIRSTDIGGER - curplayer, d.x, d.y);
            d.notfiring = true;
            d.emocttime = 0;
            d.firepressed = false;
            d.expsn = 0;
            d.rechargetime = 0;
            d.emn = 0;
            d.msc = 1;
          }
          clearfire(n);
          if (bonusmode)
            music(0);
          else
            music(1);
        }
      }
  }
}

function createbonus() {
  bonusvisible = true;
  drawbonus(292, 18);
}

function initbonusmode() {
  bonusmode = true;
  erasebonus();
  ginten(1);
  bonustimeleft = 250 - levof10() * 20;
  startbonustimeleft = 20;
  for (let i = 0; i < diggers; i++)
    digdat[i].msc = 1;
}

function endbonusmode() {
  bonusmode = false;
  ginten(0);
}

function erasebonus() {
  if (bonusvisible) {
    bonusvisible = false;
    erasespr(FIRSTBONUS);
  }
  ginten(0);
}

function reversedir(dir) {
  switch (dir) {
    case DIR_RIGHT: return DIR_LEFT;
    case DIR_LEFT: return DIR_RIGHT;
    case DIR_UP: return DIR_DOWN;
    case DIR_DOWN: return DIR_UP;
  }
  return dir;
}

function checkdiggerunderbag(h, v) {
  for (let n = curplayer; n < diggers + curplayer; n++) {
    const d = digdat[n];
    if (d.alive && (d.mdir === DIR_UP || d.mdir === DIR_DOWN) && idiv(d.x - 12, 20) === h &&
        (idiv(d.y - 18, 18) === v || idiv(d.y - 18, 18) + 1 === v))
      return true;
  }
  return false;
}

function killdigger(n, stage, bag) {
  const d = digdat[n];
  if (d.invin)
    return;
  if (d.deathstage < 2 || d.deathstage > 4) {
    d.alive = false;
    d.deathstage = stage;
    d.deathbag = bag;
  }
}

function makeemfield() {
  emmask = 1 << curplayer;
  for (let x = 0; x < MWIDTH; x++)
    for (let y = 0; y < MHEIGHT; y++)
      if (getlevch(x, y, levplan()) === 'C')
        emfield[y * MWIDTH + x] |= emmask;
      else
        emfield[y * MWIDTH + x] &= ~emmask;
}

function drawemeralds() {
  emmask = 1 << curplayer;
  for (let x = 0; x < MWIDTH; x++)
    for (let y = 0; y < MHEIGHT; y++)
      if (emfield[y * MWIDTH + x] & emmask)
        drawemerald(x * 20 + 12, y * 18 + 21);
}

const embox = [8, 12, 12, 9, 16, 12, 6, 9];

function hitemerald(x, y, rx, ry, dir) {
  let hit = false, r;
  if (dir !== DIR_RIGHT && dir !== DIR_UP && dir !== DIR_LEFT && dir !== DIR_DOWN)
    return hit;
  if (dir === DIR_RIGHT && rx !== 0)
    x++;
  if (dir === DIR_DOWN && ry !== 0)
    y++;
  if (dir === DIR_RIGHT || dir === DIR_LEFT)
    r = rx;
  else
    r = ry;
  if (emfield[y * MWIDTH + x] & emmask) {
    if (r === embox[dir]) {
      drawemerald(x * 20 + 12, y * 18 + 21);
      incpenalty();
    }
    if (r === embox[dir + 1]) {
      eraseemerald(x * 20 + 12, y * 18 + 21);
      incpenalty();
      hit = true;
      emfield[y * MWIDTH + x] &= ~emmask;
    }
  }
  return hit;
}

function countem() {
  let n = 0;
  for (let x = 0; x < MWIDTH; x++)
    for (let y = 0; y < MHEIGHT; y++)
      if (emfield[y * MWIDTH + x] & emmask)
        n++;
  return n;
}

function killemerald(x, y) {
  if (emfield[(y + 1) * MWIDTH + x] & emmask) {
    emfield[(y + 1) * MWIDTH + x] &= ~emmask;
    eraseemerald(x * 20 + 12, (y + 1) * 18 + 21);
  }
}

function getfirepflag(n) {
  return n === 0 ? firepflag : fire2pflag;
}

function diggerx(n) {
  return digdat[n].x;
}

function diggery(n) {
  return digdat[n].y;
}

function digalive(n) {
  return digdat[n].alive;
}

function digresettime(n) {
  digdat[n].bagtime = 0;
}

function isalive() {
  for (let i = curplayer; i < diggers + curplayer; i++)
    if (digdat[i].alive)
      return true;
  return false;
}

// En el modo VERSUS las vidas de digdat[0] son las de los dos diggers
function getlives(pl) {
  return digdat[shared ? 0 : pl].lives;
}

function addlife(pl) {
  digdat[shared ? 0 : pl].lives++;
  sound1up();
}

function initlives() {
  for (let i = 0; i < diggers + nplayers - 1; i++)
    digdat[i].lives = 3;
}

function declife(pl) {
  if (!gauntlet)
    digdat[shared ? 0 : pl].lives--;
}

// ===========================================================================
// monster.c
// ===========================================================================

const newMonster = () => ({
  x: 0, y: 0, h: 0, v: 0, xr: 0, yr: 0, dir: 0, hdir: 0, t: 0, hnt: 0, death: 0, bag: 0,
  dtime: 0, stime: 0, chase: 0, flag: false, nob: false, alive: false,
});
const mondat = Array.from({ length: MONSTERS }, newMonster);

let nextmonster = 0, totalmonsters = 0, maxmononscr = 0, nextmontime = 0, mongaptime = 0;
let chase = 0;
let unbonusflag = false;

function initmonsters() {
  for (let i = 0; i < MONSTERS; i++)
    mondat[i].flag = false;
  nextmonster = 0;
  mongaptime = 45 - (levof10() << 1);
  totalmonsters = levof10() + 5;
  switch (levof10()) {
    case 1:
      maxmononscr = 3;
      break;
    case 2: case 3: case 4: case 5: case 6: case 7:
      maxmononscr = 4;
      break;
    case 8: case 9: case 10:
      maxmononscr = 5;
  }
  nextmontime = 10;
  unbonusflag = true;
}

function erasemonsters() {
  for (let i = 0; i < MONSTERS; i++)
    if (mondat[i].flag)
      erasespr(i + FIRSTMONSTER);
}

function domonsters() {
  if (nextmontime > 0)
    nextmontime--;
  else {
    if (nextmonster < totalmonsters && nmononscr() < maxmononscr && isalive() && !bonusmode)
      createmonster();
    if (unbonusflag && nextmonster === totalmonsters && nextmontime === 0)
      if (isalive()) {
        unbonusflag = false;
        createbonus();
      }
  }
  for (let i = 0; i < MONSTERS; i++) {
    const m = mondat[i];
    if (m.flag) {
      if (m.hnt > 10 - levof10()) {
        if (m.nob) {
          m.nob = false;
          m.hnt = 0;
        }
      }
      if (m.alive) {
        if (m.t === 0) {
          monai(i);
          if (randno(15 - levof10()) === 0) /* Need to split for determinism */
            if (m.nob && m.alive)
              monai(i);
        } else
          m.t--;
      } else
        mondie(i);
    }
  }
}

function createmonster() {
  for (let i = 0; i < MONSTERS; i++) {
    const m = mondat[i];
    if (!m.flag) {
      m.flag = true;
      m.alive = true;
      m.t = 0;
      m.nob = true;
      m.hnt = 0;
      m.h = 14;
      m.v = 0;
      m.x = 292;
      m.y = 18;
      m.xr = 0;
      m.yr = 0;
      m.dir = DIR_LEFT;
      m.hdir = DIR_LEFT;
      m.chase = chase + curplayer;
      chase = (chase + 1) % diggers;
      nextmonster++;
      nextmontime = mongaptime;
      m.stime = 5;
      movedrawspr(i + FIRSTMONSTER, m.x, m.y);
      break;
    }
  }
}

let mongotgold = false;

function mongold() {
  mongotgold = true;
}

function monai(mon) {
  const md = mondat[mon];
  let dir, mdirp1, mdirp2, mdirp3, mdirp4, t, i, m, dig, push;
  const monox = md.x;
  const monoy = md.y;
  if (md.xr === 0 && md.yr === 0) {

    /* If we are here the monster needs to know which way to turn next. */

    /* Turn hobbin back into nobbin if it's had its time */

    if (md.hnt > 30 + (levof10() << 1))
      if (!md.nob) {
        md.hnt = 0;
        md.nob = true;
      }

    /* Set up monster direction properties to chase Digger */

    dig = md.chase;
    if (!digalive(dig))
      dig = (diggers - 1) - dig;

    if (Math.abs(diggery(dig) - md.y) > Math.abs(diggerx(dig) - md.x)) {
      if (diggery(dig) < md.y) { mdirp1 = DIR_UP; mdirp4 = DIR_DOWN; }
      else { mdirp1 = DIR_DOWN; mdirp4 = DIR_UP; }
      if (diggerx(dig) < md.x) { mdirp2 = DIR_LEFT; mdirp3 = DIR_RIGHT; }
      else { mdirp2 = DIR_RIGHT; mdirp3 = DIR_LEFT; }
    } else {
      if (diggerx(dig) < md.x) { mdirp1 = DIR_LEFT; mdirp4 = DIR_RIGHT; }
      else { mdirp1 = DIR_RIGHT; mdirp4 = DIR_LEFT; }
      if (diggery(dig) < md.y) { mdirp2 = DIR_UP; mdirp3 = DIR_DOWN; }
      else { mdirp2 = DIR_DOWN; mdirp3 = DIR_UP; }
    }

    /* In bonus mode, run away from Digger */

    if (bonusmode) {
      t = mdirp1; mdirp1 = mdirp4; mdirp4 = t;
      t = mdirp2; mdirp2 = mdirp3; mdirp3 = t;
    }

    /* Adjust priorities so that monsters don't reverse direction unless they
       really have to */

    dir = reversedir(md.dir);
    if (dir === mdirp1) {
      mdirp1 = mdirp2;
      mdirp2 = mdirp3;
      mdirp3 = mdirp4;
      mdirp4 = dir;
    }
    if (dir === mdirp2) {
      mdirp2 = mdirp3;
      mdirp3 = mdirp4;
      mdirp4 = dir;
    }
    if (dir === mdirp3) {
      mdirp3 = mdirp4;
      mdirp4 = dir;
    }

    /* Introduce a random element on levels <6 : occasionally swap p1 and p3 */

    if (randno(levof10() + 5) === 1) /* Need to split for determinism */
      if (levof10() < 6) {
        t = mdirp1;
        mdirp1 = mdirp3;
        mdirp3 = t;
      }

    /* Check field and find direction */

    if (fieldclear(mdirp1, md.h, md.v))
      dir = mdirp1;
    else if (fieldclear(mdirp2, md.h, md.v))
      dir = mdirp2;
    else if (fieldclear(mdirp3, md.h, md.v))
      dir = mdirp3;
    else if (fieldclear(mdirp4, md.h, md.v))
      dir = mdirp4;

    /* Hobbins don't care about the field: they go where they want. */

    if (!md.nob)
      dir = mdirp1;

    /* Monsters take a time penalty for changing direction */

    if (md.dir !== dir)
      md.t++;

    /* Save the new direction */

    md.dir = dir;
  }

  /* If monster is about to go off edge of screen, stop it. */

  if ((md.x === 292 && md.dir === DIR_RIGHT) ||
      (md.x === 12 && md.dir === DIR_LEFT) ||
      (md.y === 180 && md.dir === DIR_DOWN) ||
      (md.y === 18 && md.dir === DIR_UP))
    md.dir = DIR_NONE;

  /* Change hdir for hobbin */

  if (md.dir === DIR_LEFT || md.dir === DIR_RIGHT)
    md.hdir = md.dir;

  /* Hobbins dig */

  if (!md.nob)
    eatfield(md.x, md.y, md.dir);

  /* (Draw new tunnels) and move monster */

  switch (md.dir) {
    case DIR_RIGHT:
      if (!md.nob)
        drawrightblob(md.x, md.y);
      md.x += 4;
      break;
    case DIR_UP:
      if (!md.nob)
        drawtopblob(md.x, md.y);
      md.y -= 3;
      break;
    case DIR_LEFT:
      if (!md.nob)
        drawleftblob(md.x, md.y);
      md.x -= 4;
      break;
    case DIR_DOWN:
      if (!md.nob)
        drawbottomblob(md.x, md.y);
      md.y += 3;
      break;
  }

  /* Hobbins can eat emeralds */

  if (!md.nob)
    hitemerald(idiv(md.x - 12, 20), idiv(md.y - 18, 18), (md.x - 12) % 20, (md.y - 18) % 18, md.dir);

  /* If Digger's gone, don't bother */

  if (!isalive()) {
    md.x = monox;
    md.y = monoy;
  }

  /* If monster's just started, don't move yet */

  if (md.stime !== 0) {
    md.stime--;
    md.x = monox;
    md.y = monoy;
  }

  /* Increase time counter for hobbin */

  if (!md.nob && md.hnt < 100)
    md.hnt++;

  /* Draw monster */

  push = true;
  drawmon(mon, md.nob, md.hdir, md.x, md.y);
  const clfirst = first.slice();
  const clcoll = coll.slice();
  incpenalty();

  /* Collision with another monster */

  if (clfirst[2] !== -1) {
    md.t++; /* Time penalty */
    /* Ensure both aren't moving in the same dir. */
    i = clfirst[2];
    do {
      m = i - FIRSTMONSTER;
      if (md.dir === mondat[m].dir && mondat[m].stime === 0 && md.stime === 0)
        mondat[m].dir = reversedir(mondat[m].dir);
      /* The kludge here is to preserve playback for a bug in previous
         versions. */
      if (!kludge)
        incpenalty();
      else if (!(m & 1))
        incpenalty();
      i = clcoll[i];
    } while (i !== -1);
    if (kludge)
      if (clfirst[0] !== -1)
        incpenalty();
  }

  /* Check for collision with bag */

  i = clfirst[1];
  let bagf = false;
  while (i !== -1) {
    if (bagexist(i - FIRSTBAG)) {
      bagf = true;
      break;
    }
    i = clcoll[i];
  }

  if (bagf) {
    md.t++; /* Time penalty */
    mongotgold = false;
    if (md.dir === DIR_RIGHT || md.dir === DIR_LEFT) {
      push = pushbags(md.dir, clfirst, clcoll); /* Horizontal push */
      md.t++; /* Time penalty */
    } else if (!pushudbags(clfirst, clcoll)) /* Vertical push */
      push = false;
    if (mongotgold) /* No time penalty if monster eats gold */
      md.t = 0;
    if (!md.nob && md.hnt > 1)
      removebags(clfirst, clcoll); /* Hobbins eat bags */
  }

  /* Increase hobbin cross counter */

  if (md.nob && clfirst[2] !== -1 && isalive())
    md.hnt++;

  /* See if bags push monster back */

  if (!push) {
    md.x = monox;
    md.y = monoy;
    drawmon(mon, md.nob, md.hdir, md.x, md.y);
    incpenalty();
    if (md.nob) /* The other way to create hobbin: stuck on h-bag */
      md.hnt++;
    if ((md.dir === DIR_UP || md.dir === DIR_DOWN) && md.nob)
      md.dir = reversedir(md.dir); /* If vertical, give up */
  }

  /* Collision with Digger */

  if (clfirst[4] !== -1 && isalive()) {
    if (bonusmode) {
      killmon(mon);
      i = clfirst[4];
      while (i !== -1) {
        if (digalive(i - FIRSTDIGGER + curplayer))
          sceatm(i - FIRSTDIGGER + curplayer);
        i = clcoll[i];
      }
      soundeatm(); /* Collision in bonus mode */
    } else {
      i = clfirst[4];
      while (i !== -1) {
        if (digalive(i - FIRSTDIGGER + curplayer))
          killdigger(i - FIRSTDIGGER + curplayer, 3, 0); /* Kill Digger */
        i = clcoll[i];
      }
    }
  }

  /* Update co-ordinates */

  md.h = idiv(md.x - 12, 20);
  md.v = idiv(md.y - 18, 18);
  md.xr = (md.x - 12) % 20;
  md.yr = (md.y - 18) % 18;
}

function mondie(mon) {
  const m = mondat[mon];
  switch (m.death) {
    case 1:
      if (bagy(m.bag) + 6 > m.y)
        m.y = bagy(m.bag);
      drawmondie(mon, m.nob, m.hdir, m.x, m.y);
      incpenalty();
      if (getbagdir(m.bag) === -1) {
        m.dtime = 1;
        m.death = 4;
      }
      break;
    case 4:
      if (m.dtime !== 0)
        m.dtime--;
      else {
        killmon(mon);
        if (diggers === 2)
          scorekill2();
        else
          scorekill(curplayer);
      }
  }
}

function fieldclear(dir, x, y) {
  switch (dir) {
    case DIR_RIGHT:
      if (x < 14)
        if ((getfield(x + 1, y) & 0x2000) === 0)
          if ((getfield(x + 1, y) & 1) === 0 || (getfield(x, y) & 0x10) === 0)
            return true;
      break;
    case DIR_UP:
      if (y > 0)
        if ((getfield(x, y - 1) & 0x2000) === 0)
          if ((getfield(x, y - 1) & 0x800) === 0 || (getfield(x, y) & 0x40) === 0)
            return true;
      break;
    case DIR_LEFT:
      if (x > 0)
        if ((getfield(x - 1, y) & 0x2000) === 0)
          if ((getfield(x - 1, y) & 0x10) === 0 || (getfield(x, y) & 1) === 0)
            return true;
      break;
    case DIR_DOWN:
      if (y < 9)
        if ((getfield(x, y + 1) & 0x2000) === 0)
          if ((getfield(x, y + 1) & 0x40) === 0 || (getfield(x, y) & 0x800) === 0)
            return true;
  }
  return false;
}

function checkmonscared(h) {
  for (let m = 0; m < MONSTERS; m++)
    if (h === mondat[m].h && mondat[m].dir === DIR_UP)
      mondat[m].dir = DIR_DOWN;
}

function killmon(mon) {
  if (mondat[mon].flag) {
    mondat[mon].flag = mondat[mon].alive = false;
    erasespr(mon + FIRSTMONSTER);
    if (bonusmode)
      totalmonsters++;
  }
}

function squashmonsters(bag, clfirst, clcoll) {
  let next = clfirst[2];
  while (next !== -1) {
    const m = next - FIRSTMONSTER;
    if (mondat[m].y >= bagy(bag))
      squashmonster(m, 1, bag);
    next = clcoll[next];
  }
}

function killmonsters(clfirst, clcoll) {
  let next = clfirst[2], n = 0;
  while (next !== -1) {
    killmon(next - FIRSTMONSTER);
    n++;
    next = clcoll[next];
  }
  return n;
}

function squashmonster(mon, death, bag) {
  mondat[mon].alive = false;
  mondat[mon].death = death;
  mondat[mon].bag = bag;
}

function monleft() {
  return nmononscr() + totalmonsters - nextmonster;
}

function nmononscr() {
  let n = 0;
  for (let i = 0; i < MONSTERS; i++)
    if (mondat[i].flag)
      n++;
  return n;
}

function incmont(n) {
  if (n > MONSTERS)
    n = MONSTERS;
  for (let m = 1; m < n; m++)
    mondat[m].t++;
}

function getfield(x, y) {
  return field[y * 15 + x];
}

// ===========================================================================
// bags.c
// ===========================================================================

const newBag = () => ({
  x: 0, y: 0, h: 0, v: 0, xr: 0, yr: 0, dir: 0, wt: 0, gt: 0, fallh: 0,
  wobbling: false, unfallen: false, exist: false,
});
const bagdat1 = Array.from({ length: BAGS }, newBag);
const bagdat2 = Array.from({ length: BAGS }, newBag);
const bagdat = Array.from({ length: BAGS }, newBag);

let pushcount = 0, goldtime = 0;

function initbags() {
  let bag, x, y;
  pushcount = 0;
  goldtime = 150 - levof10() * 10;
  for (bag = 0; bag < BAGS; bag++)
    bagdat[bag].exist = false;
  bag = 0;
  for (x = 0; x < MWIDTH; x++)
    for (y = 0; y < MHEIGHT; y++)
      if (getlevch(x, y, levplan()) === 'B')
        if (bag < BAGS) {
          const b = bagdat[bag++];
          b.exist = true;
          b.gt = 0;
          b.fallh = 0;
          b.dir = DIR_NONE;
          b.wobbling = false;
          b.wt = 15;
          b.unfallen = true;
          b.x = x * 20 + 12;
          b.y = y * 18 + 18;
          b.h = x;
          b.v = y;
          b.xr = 0;
          b.yr = 0;
        }
  const dst = curplayer === 0 ? bagdat1 : bagdat2;
  for (bag = 0; bag < BAGS; bag++)
    Object.assign(dst[bag], bagdat[bag]);
}

function drawbags() {
  for (let bag = 0; bag < BAGS; bag++) {
    Object.assign(bagdat[bag], curplayer === 0 ? bagdat1[bag] : bagdat2[bag]);
    if (bagdat[bag].exist)
      movedrawspr(bag + FIRSTBAG, bagdat[bag].x, bagdat[bag].y);
  }
}

function cleanupbags() {
  soundfalloff();
  for (let bag = 0; bag < BAGS; bag++) {
    const b = bagdat[bag];
    if (b.exist && ((b.h === 7 && b.v === 9) || b.xr !== 0 || b.yr !== 0 || b.gt !== 0 ||
        b.fallh !== 0 || b.wobbling)) {
      b.exist = false;
      erasespr(bag + FIRSTBAG);
    }
    Object.assign(curplayer === 0 ? bagdat1[bag] : bagdat2[bag], b);
  }
}

function dobags() {
  let bag;
  let soundfalloffflag = true, soundwobbleoffflag = true;
  for (bag = 0; bag < BAGS; bag++) {
    const b = bagdat[bag];
    if (b.exist) {
      if (b.gt !== 0) {
        if (b.gt === 1) {
          soundbreak();
          drawgold(bag, 4, b.x, b.y);
          incpenalty();
        }
        if (b.gt === 3) {
          drawgold(bag, 5, b.x, b.y);
          incpenalty();
        }
        if (b.gt === 5) {
          drawgold(bag, 6, b.x, b.y);
          incpenalty();
        }
        b.gt++;
        if (b.gt === goldtime)
          removebag(bag);
        else if (b.v < MHEIGHT - 1 && b.gt < goldtime - 10)
          if ((getfield(b.h, b.v + 1) & 0x2000) === 0)
            b.gt = goldtime - 10;
      } else
        updatebag(bag);
    }
  }
  for (bag = 0; bag < BAGS; bag++) {
    const b = bagdat[bag];
    if (b.dir === DIR_DOWN && b.exist)
      soundfalloffflag = false;
    if (b.dir !== DIR_DOWN && b.wobbling && b.exist)
      soundwobbleoffflag = false;
  }
  if (soundfalloffflag)
    soundfalloff();
  if (soundwobbleoffflag)
    soundwobbleoff();
}

const wblanim = [2, 0, 1, 0];

function updatebag(bag) {
  const b = bagdat[bag];
  const x = b.x, h = b.h, xr = b.xr, y = b.y, v = b.v, yr = b.yr;
  switch (b.dir) {
    case DIR_NONE:
      if (y < 180 && xr === 0) {
        if (b.wobbling) {
          if (b.wt === 0) {
            b.dir = DIR_DOWN;
            soundfall();
            break;
          }
          b.wt--;
          const wbl = b.wt % 8;
          if (!(wbl & 1)) {
            drawgold(bag, wblanim[wbl >> 1], x, y);
            incpenalty();
            soundwobble();
          }
        } else if ((getfield(h, v + 1) & 0xfdf) !== 0xfdf)
          if (!checkdiggerunderbag(h, v + 1))
            b.wobbling = true;
      } else {
        b.wt = 15;
        b.wobbling = false;
      }
      break;
    case DIR_RIGHT:
    case DIR_LEFT:
      if (xr === 0) {
        if (y < 180 && (getfield(h, v + 1) & 0xfdf) !== 0xfdf) {
          b.dir = DIR_DOWN;
          b.wt = 0;
          soundfall();
        } else
          baghitground(bag);
      }
      break;
    case DIR_DOWN:
      if (yr === 0)
        b.fallh++;
      if (y >= 180)
        baghitground(bag);
      else if ((getfield(h, v + 1) & 0xfdf) === 0xfdf)
        if (yr === 0)
          baghitground(bag);
      checkmonscared(b.h);
  }
  if (b.dir !== DIR_NONE) {
    if (b.dir !== DIR_DOWN && pushcount !== 0)
      pushcount--;
    else
      pushbag(bag, b.dir);
  }
}

function baghitground(bag) {
  const b = bagdat[bag];
  if (b.dir === DIR_DOWN && b.fallh > 1)
    b.gt = 1;
  else
    b.fallh = 0;
  b.dir = DIR_NONE;
  b.wt = 15;
  b.wobbling = false;
  drawgold(bag, 0, b.x, b.y);
  const clfirst = first.slice();
  const clcoll = coll.slice();
  incpenalty();
  let i = clfirst[1];
  while (i !== -1) {
    removebag(i - FIRSTBAG);
    i = clcoll[i];
  }
}

function pushbag(bag, dir) {
  const b = bagdat[bag];
  let x, y, push = true, i, clfirst, clcoll;
  const ox = x = b.x;
  const oy = y = b.y;
  const h = b.h;
  const v = b.v;
  if (b.gt !== 0) {
    getgold(bag);
    return true;
  }
  if (b.dir === DIR_DOWN && (dir === DIR_RIGHT || dir === DIR_LEFT)) {
    drawgold(bag, 3, x, y);
    clfirst = first.slice();
    clcoll = coll.slice();
    incpenalty();
    i = clfirst[4];
    while (i !== -1) {
      if (diggery(i - FIRSTDIGGER + curplayer) >= y)
        killdigger(i - FIRSTDIGGER + curplayer, 1, bag);
      i = clcoll[i];
    }
    if (clfirst[2] !== -1)
      squashmonsters(bag, clfirst, clcoll);
    return true;
  }
  if ((x === 292 && dir === DIR_RIGHT) || (x === 12 && dir === DIR_LEFT) ||
      (y === 180 && dir === DIR_DOWN) || (y === 18 && dir === DIR_UP))
    push = false;
  if (push) {
    switch (dir) {
      case DIR_RIGHT:
        x += 4;
        break;
      case DIR_LEFT:
        x -= 4;
        break;
      case DIR_DOWN:
        if (b.unfallen) {
          b.unfallen = false;
          drawsquareblob(x, y);
          drawtopblob(x, y + 21);
        } else
          drawfurryblob(x, y);
        eatfield(x, y, dir);
        killemerald(h, v);
        y += 6;
    }
    switch (dir) {
      case DIR_DOWN:
        drawgold(bag, 3, x, y);
        clfirst = first.slice();
        clcoll = coll.slice();
        incpenalty();
        i = clfirst[4];
        while (i !== -1) {
          if (diggery(i - FIRSTDIGGER + curplayer) >= y)
            killdigger(i - FIRSTDIGGER + curplayer, 1, bag);
          i = clcoll[i];
        }
        if (clfirst[2] !== -1)
          squashmonsters(bag, clfirst, clcoll);
        break;
      case DIR_RIGHT:
      case DIR_LEFT: {
        b.wt = 15;
        b.wobbling = false;
        drawgold(bag, 0, x, y);
        clfirst = first.slice();
        clcoll = coll.slice();
        incpenalty();
        pushcount = 1;
        if (clfirst[1] !== -1)
          if (!pushbags(dir, clfirst, clcoll)) {
            x = ox;
            y = oy;
            drawgold(bag, 0, ox, oy);
            incpenalty();
            push = false;
          }
        i = clfirst[4];
        let digf = false;
        while (i !== -1) {
          if (digalive(i - FIRSTDIGGER + curplayer))
            digf = true;
          i = clcoll[i];
        }
        if (digf || clfirst[2] !== -1) {
          x = ox;
          y = oy;
          drawgold(bag, 0, ox, oy);
          incpenalty();
          push = false;
        }
      }
    }
    if (push)
      b.dir = dir;
    else
      b.dir = reversedir(dir);
    b.x = x;
    b.y = y;
    b.h = idiv(x - 12, 20);
    b.v = idiv(y - 18, 18);
    b.xr = (x - 12) % 20;
    b.yr = (y - 18) % 18;
  }
  return push;
}

function pushbags(dir, clfirst, clcoll) {
  let push = true;
  let next = clfirst[1];
  while (next !== -1) {
    if (!pushbag(next - FIRSTBAG, dir))
      push = false;
    next = clcoll[next];
  }
  return push;
}

function pushudbags(clfirst, clcoll) {
  let push = true;
  let next = clfirst[1];
  while (next !== -1) {
    if (bagdat[next - FIRSTBAG].gt !== 0)
      getgold(next - FIRSTBAG);
    else
      push = false;
    next = clcoll[next];
  }
  return push;
}

function removebag(bag) {
  if (bagdat[bag].exist) {
    bagdat[bag].exist = false;
    erasespr(bag + FIRSTBAG);
  }
}

function bagexist(bag) {
  return bagdat[bag].exist;
}

function bagy(bag) {
  return bagdat[bag].y;
}

function getbagdir(bag) {
  if (bagdat[bag].exist)
    return bagdat[bag].dir;
  return -1;
}

function removebags(clfirst, clcoll) {
  let next = clfirst[1];
  while (next !== -1) {
    removebag(next - FIRSTBAG);
    next = clcoll[next];
  }
}

function getnmovingbags() {
  let n = 0;
  for (let bag = 0; bag < BAGS; bag++) {
    const b = bagdat[bag];
    if (b.exist && b.gt < 10 && (b.gt !== 0 || b.wobbling))
      n++;
  }
  return n;
}

function getgold(bag) {
  let f = true;
  drawgold(bag, 6, bagdat[bag].x, bagdat[bag].y);
  incpenalty();
  let i = first[4];
  while (i !== -1) {
    if (digalive(i - FIRSTDIGGER + curplayer)) {
      scoregold(i - FIRSTDIGGER + curplayer);
      soundgold();
      digresettime(i - FIRSTDIGGER + curplayer);
      f = false;
    }
    i = coll[i];
  }
  if (f)
    mongold();
  removebag(bag);
}

// ===========================================================================
// drawing.c
// ===========================================================================

const field1 = new Int16Array(MSIZE), field2 = new Int16Array(MSIZE), field = new Int16Array(MSIZE);

const monbufs = Array.from({ length: MONSTERS }, () => new Uint8Array(960));
const bagbufs = Array.from({ length: BAGS }, () => new Uint8Array(960));
const bonusbufs = Array.from({ length: BONUSES }, () => new Uint8Array(960));
const diggerbufs = Array.from({ length: DIGGERS }, () => new Uint8Array(960));
const firebufs = Array.from({ length: FIREBALLS }, () => new Uint8Array(256));

const bitmasks = [0xfffe, 0xfffd, 0xfffb, 0xfff7, 0xffef, 0xffdf, 0xffbf, 0xff7f,
  0xfeff, 0xfdff, 0xfbff, 0xf7ff];

const monspr = new Int16Array(MONSTERS);
const monspd = new Int16Array(MONSTERS);
const digspr = new Int16Array(DIGGERS), digspd = new Int16Array(DIGGERS), firespr = new Int16Array(FIREBALLS);

function outtext(p, x, y, c) {
  for (let i = 0; i < p.length; i++) {
    gwrite(x, y, p.charCodeAt(i), c);
    x += 12;
  }
}

function makefield() {
  for (let x = 0; x < MWIDTH; x++)
    for (let y = 0; y < MHEIGHT; y++) {
      const i = y * MWIDTH + x;
      field[i] = -1;
      const c = getlevch(x, y, levplan());
      if (c === 'S' || c === 'V')
        field[i] &= 0xd03f;
      if (c === 'S' || c === 'H')
        field[i] &= 0xdfe0;
      if (curplayer === 0)
        field1[i] = field[i];
      else
        field2[i] = field[i];
    }
}

function drawstatics() {
  for (let i = 0; i < MSIZE; i++)
    field[i] = curplayer === 0 ? field1[i] : field2[i];
  setretr(true);
  gpal(0);
  ginten(0);
  drawbackg(levplan());
  drawfield();
}

function savefield() {
  for (let i = 0; i < MSIZE; i++)
    if (curplayer === 0)
      field1[i] = field[i];
    else
      field2[i] = field[i];
}

function drawfield() {
  for (let x = 0; x < MWIDTH; x++)
    for (let y = 0; y < MHEIGHT; y++)
      if ((field[y * MWIDTH + x] & 0x2000) === 0) {
        const xp = x * 20 + 12;
        const yp = y * 18 + 18;
        if ((field[y * MWIDTH + x] & 0xfc0) !== 0xfc0) {
          field[y * MWIDTH + x] &= 0xd03f;
          drawbottomblob(xp, yp - 15);
          drawbottomblob(xp, yp - 12);
          drawbottomblob(xp, yp - 9);
          drawbottomblob(xp, yp - 6);
          drawbottomblob(xp, yp - 3);
          drawtopblob(xp, yp + 3);
        }
        if ((field[y * MWIDTH + x] & 0x1f) !== 0x1f) {
          field[y * MWIDTH + x] &= 0xdfe0;
          drawrightblob(xp - 16, yp);
          drawrightblob(xp - 12, yp);
          drawrightblob(xp - 8, yp);
          drawrightblob(xp - 4, yp);
          drawleftblob(xp + 4, yp);
        }
        if (x < 14)
          if ((field[y * MWIDTH + x + 1] & 0xfdf) !== 0xfdf)
            drawrightblob(xp, yp);
        if (y < 9)
          if ((field[(y + 1) * MWIDTH + x] & 0xfdf) !== 0xfdf)
            drawbottomblob(xp, yp);
      }
}

function eatfield(x, y, dir) {
  let h = idiv(x - 12, 20), xr = idiv((x - 12) % 20, 4), v = idiv(y - 18, 18), yr = idiv((y - 18) % 18, 3);
  incpenalty();
  switch (dir) {
    case DIR_RIGHT:
      h++;
      field[v * MWIDTH + h] &= bitmasks[xr];
      if (field[v * MWIDTH + h] & 0x1f)
        break;
      field[v * MWIDTH + h] &= 0xdfff;
      break;
    case DIR_UP:
      yr--;
      if (yr < 0) {
        yr += 6;
        v--;
      }
      field[v * MWIDTH + h] &= bitmasks[6 + yr];
      if (field[v * MWIDTH + h] & 0xfc0)
        break;
      field[v * MWIDTH + h] &= 0xdfff;
      break;
    case DIR_LEFT:
      xr--;
      if (xr < 0) {
        xr += 5;
        h--;
      }
      field[v * MWIDTH + h] &= bitmasks[xr];
      if (field[v * MWIDTH + h] & 0x1f)
        break;
      field[v * MWIDTH + h] &= 0xdfff;
      break;
    case DIR_DOWN:
      v++;
      field[v * MWIDTH + h] &= bitmasks[6 + yr];
      if (field[v * MWIDTH + h] & 0xfc0)
        break;
      field[v * MWIDTH + h] &= 0xdfff;
  }
}

function creatembspr() {
  let i;
  for (i = 0; i < BAGS; i++)
    createspr(FIRSTBAG + i, 62, bagbufs[i], 4, 15, 0, 0);
  for (i = 0; i < MONSTERS; i++)
    createspr(FIRSTMONSTER + i, 71, monbufs[i], 4, 15, 0, 0);
  createdbfspr();
  for (i = 0; i < MONSTERS; i++) {
    monspr[i] = 0;
    monspd[i] = 1;
  }
}

function initmbspr() {
  let i;
  for (i = 0; i < BAGS; i++)
    initspr(FIRSTBAG + i, 62, 4, 15, 0, 0);
  for (i = 0; i < MONSTERS; i++)
    initspr(FIRSTMONSTER + i, 71, 4, 15, 0, 0);
  initdbfspr();
}

function drawmon(n, nobf, dir, x, y) {
  monspr[n] += monspd[n];
  if (monspr[n] === 2 || monspr[n] === 0)
    monspd[n] = -monspd[n];
  if (monspr[n] > 2)
    monspr[n] = 2;
  if (monspr[n] < 0)
    monspr[n] = 0;
  if (nobf)
    initspr(FIRSTMONSTER + n, monspr[n] + 69, 4, 15, 0, 0);
  else
    switch (dir) {
      case DIR_RIGHT:
        initspr(FIRSTMONSTER + n, monspr[n] + 73, 4, 15, 0, 0);
        break;
      case DIR_LEFT:
        initspr(FIRSTMONSTER + n, monspr[n] + 77, 4, 15, 0, 0);
    }
  drawspr(FIRSTMONSTER + n, x, y);
}

function drawmondie(n, nobf, dir, x, y) {
  if (nobf)
    initspr(FIRSTMONSTER + n, 72, 4, 15, 0, 0);
  else
    switch (dir) {
      case DIR_RIGHT:
        initspr(FIRSTMONSTER + n, 76, 4, 15, 0, 0);
        break;
      case DIR_LEFT:
        initspr(FIRSTMONSTER + n, 80, 4, 14, 0, 0);
    }
  drawspr(FIRSTMONSTER + n, x, y);
}

function drawgold(n, t, x, y) {
  initspr(FIRSTBAG + n, t + 62, 4, 15, 0, 0);
  drawspr(FIRSTBAG + n, x, y);
}

function drawlife(t, x, y) {
  drawmiscspr(x, y, t + 110, 4, 12);
}

function drawemerald(x, y) {
  initmiscspr(x, y, 4, 10);
  drawmiscspr(x, y, 108, 4, 10);
  getis();
}

function eraseemerald(x, y) {
  initmiscspr(x, y, 4, 10);
  drawmiscspr(x, y, 109, 4, 10);
  getis();
}

function createdbfspr() {
  let i;
  for (i = 0; i < DIGGERS; i++) {
    digspd[i] = 1;
    digspr[i] = 0;
  }
  for (i = 0; i < FIREBALLS; i++)
    firespr[i] = 0;
  for (i = FIRSTDIGGER; i < LASTDIGGER; i++)
    createspr(i, 0, diggerbufs[i - FIRSTDIGGER], 4, 15, 0, 0);
  for (i = FIRSTBONUS; i < LASTBONUS; i++)
    createspr(i, 81, bonusbufs[i - FIRSTBONUS], 4, 15, 0, 0);
  for (i = FIRSTFIREBALL; i < LASTFIREBALL; i++)
    createspr(i, 82, firebufs[i - FIRSTFIREBALL], 2, 8, 0, 0);
}

function initdbfspr() {
  let i;
  for (i = 0; i < DIGGERS; i++) {
    digspd[i] = 1;
    digspr[i] = 0;
  }
  for (i = 0; i < FIREBALLS; i++)
    firespr[i] = 0;
  for (i = FIRSTDIGGER; i < LASTDIGGER; i++)
    initspr(i, 0, 4, 15, 0, 0);
  for (i = FIRSTBONUS; i < LASTBONUS; i++)
    initspr(i, 81, 4, 15, 0, 0);
  for (i = FIRSTFIREBALL; i < LASTFIREBALL; i++)
    initspr(i, 82, 2, 8, 0, 0);
}

function drawrightblob(x, y) {
  initmiscspr(x + 16, y - 1, 2, 18);
  drawmiscspr(x + 16, y - 1, 102, 2, 18);
  getis();
}

function drawleftblob(x, y) {
  initmiscspr(x - 8, y - 1, 2, 18);
  drawmiscspr(x - 8, y - 1, 104, 2, 18);
  getis();
}

function drawtopblob(x, y) {
  initmiscspr(x - 4, y - 6, 6, 6);
  drawmiscspr(x - 4, y - 6, 103, 6, 6);
  getis();
}

function drawbottomblob(x, y) {
  initmiscspr(x - 4, y + 15, 6, 6);
  drawmiscspr(x - 4, y + 15, 105, 6, 6);
  getis();
}

function drawfurryblob(x, y) {
  initmiscspr(x - 4, y + 15, 6, 8);
  drawmiscspr(x - 4, y + 15, 107, 6, 8);
  getis();
}

function drawsquareblob(x, y) {
  initmiscspr(x - 4, y + 17, 6, 6);
  drawmiscspr(x - 4, y + 17, 106, 6, 6);
  getis();
}

function drawbackg(l) {
  for (let y = 14; y < 200; y += 4)
    for (let x = 0; x < 320; x += 20)
      drawmiscspr(x, y, 93 + l, 5, 4);
}

function drawfire(n, x, y, t) {
  const nn = n === 0 ? 0 : 32;
  if (t === 0) {
    firespr[n]++;
    if (firespr[n] > 2)
      firespr[n] = 0;
    initspr(FIRSTFIREBALL + n, 82 + firespr[n] + nn, 2, 8, 0, 0);
  } else
    initspr(FIRSTFIREBALL + n, 84 + t + nn, 2, 8, 0, 0);
  drawspr(FIRSTFIREBALL + n, x, y);
}

function drawbonus(x, y) {
  const n = 0;
  initspr(FIRSTBONUS + n, 81, 4, 15, 0, 0);
  movedrawspr(FIRSTBONUS + n, x, y);
}

function drawdigger(n, t, x, y, f) {
  const nn = n === 0 ? 0 : 31;
  digspr[n] += digspd[n];
  if (digspr[n] === 2 || digspr[n] === 0)
    digspd[n] = -digspd[n];
  if (digspr[n] > 2)
    digspr[n] = 2;
  if (digspr[n] < 0)
    digspr[n] = 0;
  if (t >= 0 && t <= 6 && !(t & 1)) {
    initspr(FIRSTDIGGER + n, (t + (f ? 0 : 1)) * 3 + digspr[n] + 1 + nn, 4, 15, 0, 0);
    drawspr(FIRSTDIGGER + n, x, y);
    return;
  }
  if (t >= 10 && t <= 15) {
    initspr(FIRSTDIGGER + n, 40 + nn - t, 4, 15, 0, 0);
    drawspr(FIRSTDIGGER + n, x, y);
    return;
  }
  first[0] = first[1] = first[2] = first[3] = first[4] = -1;
}

function drawlives() {
  let l, n, buf;
  if (gauntlet) {
    const g = Math.floor(cgtime / 1193181);
    buf = String(Math.floor(g / 60)).padStart(3, ' ') + ':' + String(g % 60).padStart(2, '0');
    outtext(buf, 124, 0, 3);
    return;
  }
  n = getlives(0) - 1;
  outtext('     ', 96, 0, 2);
  if (n > 4) {
    drawlife(0, 80, 0);
    outtext('X' + n, 100, 0, 2);
  } else
    for (l = 1; l < 5; l++) {
      drawlife(n > 0 ? 0 : 2, l * 20 + 60, 0);
      n--;
    }
  if (nplayers === 2) {
    outtext('     ', 164, 0, 2);
    n = getlives(1) - 1;
    if (n > 4) {
      buf = n + 'X';
      outtext(buf, 220 - buf.length * 12, 0, 2);
      drawlife(1, 224, 0);
    } else
      for (l = 1; l < 5; l++) {
        drawlife(n > 0 ? 1 : 2, 244 - l * 20, 0);
        n--;
      }
  }
  if (diggers === 2 && !shared) {
    outtext('     ', 164, 0, 1);
    n = getlives(1) - 1;
    if (n > 4) {
      buf = n + 'X';
      outtext(buf, 220 - buf.length * 12, 0, 1);
      drawlife(3, 224, 0);
    } else
      for (l = 1; l < 5; l++) {
        drawlife(n > 0 ? 3 : 2, 244 - l * 20, 0);
        n--;
      }
  }
}

// ===========================================================================
// sprite.c
// ===========================================================================

const sprrdrwf = new Array(SPRITES + 1).fill(false);
const sprrecf = new Array(SPRITES + 1).fill(false);
const sprenf = new Array(SPRITES).fill(false);
const sprch = new Int16Array(SPRITES + 1);
const sprmov = new Array(SPRITES).fill(null);
const sprx = new Int16Array(SPRITES + 1);
const spry = new Int16Array(SPRITES + 1);
const sprwid = new Int16Array(SPRITES + 1);
const sprhei = new Int16Array(SPRITES + 1);
const sprbwid = new Int16Array(SPRITES);
const sprbhei = new Int16Array(SPRITES);
const sprnch = new Int16Array(SPRITES);
const sprnwid = new Int16Array(SPRITES);
const sprnhei = new Int16Array(SPRITES);
const sprnbwid = new Int16Array(SPRITES);
const sprnbhei = new Int16Array(SPRITES);

function setretr() {}

function createspr(n, ch, mov, wid, hei, bwid, bhei) {
  sprnch[n] = sprch[n] = ch;
  sprmov[n] = mov;
  sprnwid[n] = sprwid[n] = wid;
  sprnhei[n] = sprhei[n] = hei;
  sprnbwid[n] = sprbwid[n] = bwid;
  sprnbhei[n] = sprbhei[n] = bhei;
  sprenf[n] = false;
}

function movedrawspr(n, x, y) {
  sprx[n] = x & -4;
  spry[n] = y;
  sprch[n] = sprnch[n];
  sprwid[n] = sprnwid[n];
  sprhei[n] = sprnhei[n];
  sprbwid[n] = sprnbwid[n];
  sprbhei[n] = sprnbhei[n];
  clearrdrwf();
  setrdrwflgs(n);
  putis();
  ggeti(sprx[n], spry[n], sprmov[n], sprwid[n], sprhei[n]);
  sprenf[n] = true;
  sprrdrwf[n] = true;
  putims();
}

function erasespr(n) {
  if (!sprenf[n])
    return;
  gputi(sprx[n], spry[n], sprmov[n], sprwid[n], sprhei[n]);
  sprenf[n] = false;
  clearrdrwf();
  setrdrwflgs(n);
  putims();
}

function drawspr(n, x, y) {
  x &= -4;
  clearrdrwf();
  setrdrwflgs(n);
  const t1 = sprx[n];
  const t2 = spry[n];
  const t3 = sprwid[n];
  const t4 = sprhei[n];
  sprx[n] = x;
  spry[n] = y;
  sprwid[n] = sprnwid[n];
  sprhei[n] = sprnhei[n];
  clearrecf();
  setrdrwflgs(n);
  sprhei[n] = t4;
  sprwid[n] = t3;
  spry[n] = t2;
  sprx[n] = t1;
  sprrdrwf[n] = true;
  putis();
  sprenf[n] = true;
  sprx[n] = x;
  spry[n] = y;
  sprch[n] = sprnch[n];
  sprwid[n] = sprnwid[n];
  sprhei[n] = sprnhei[n];
  sprbwid[n] = sprnbwid[n];
  sprbhei[n] = sprnbhei[n];
  ggeti(sprx[n], spry[n], sprmov[n], sprwid[n], sprhei[n]);
  putims();
  bcollides(n);
}

function initspr(n, ch, wid, hei, bwid, bhei) {
  sprnch[n] = ch;
  sprnwid[n] = wid;
  sprnhei[n] = hei;
  sprnbwid[n] = bwid;
  sprnbhei[n] = bhei;
}

function initmiscspr(x, y, wid, hei) {
  sprx[SPRITES] = x;
  spry[SPRITES] = y;
  sprwid[SPRITES] = wid;
  sprhei[SPRITES] = hei;
  clearrdrwf();
  setrdrwflgs(SPRITES);
  putis();
}

function getis() {
  for (let i = 0; i < SPRITES; i++)
    if (sprrdrwf[i])
      ggeti(sprx[i], spry[i], sprmov[i], sprwid[i], sprhei[i]);
  putims();
}

function drawmiscspr(x, y, ch, wid, hei) {
  sprx[SPRITES] = x & -4;
  spry[SPRITES] = y;
  sprch[SPRITES] = ch;
  sprwid[SPRITES] = wid;
  sprhei[SPRITES] = hei;
  gputim(sprx[SPRITES], spry[SPRITES], sprch[SPRITES], sprwid[SPRITES], sprhei[SPRITES]);
}

function clearrdrwf() {
  clearrecf();
  sprrdrwf.fill(false);
}

function clearrecf() {
  sprrecf.fill(false);
}

function setrdrwflgs(n) {
  if (!sprrecf[n]) {
    sprrecf[n] = true;
    for (let i = 0; i < SPRITES; i++)
      if (sprenf[i] && i !== n) {
        if (collide(i, n)) {
          sprrdrwf[i] = true;
          setrdrwflgs(i);
        }
      }
  }
}

function collide(bx, si) {
  if (sprx[bx] >= sprx[si]) {
    if (sprx[bx] > (sprwid[si] << 2) + sprx[si] - 1)
      return false;
  } else if (sprx[si] > (sprwid[bx] << 2) + sprx[bx] - 1)
    return false;
  if (spry[bx] >= spry[si]) {
    if (spry[bx] <= sprhei[si] + spry[si] - 1)
      return true;
    return false;
  }
  if (spry[si] <= sprhei[bx] + spry[bx] - 1)
    return true;
  return false;
}

function bcollide(bx, si) {
  if (sprx[bx] >= sprx[si]) {
    if (sprx[bx] + sprbwid[bx] > (sprwid[si] << 2) + sprx[si] - sprbwid[si] - 1)
      return false;
  } else if (sprx[si] + sprbwid[si] > (sprwid[bx] << 2) + sprx[bx] - sprbwid[bx] - 1)
    return false;
  if (spry[bx] >= spry[si]) {
    if (spry[bx] + sprbhei[bx] <= sprhei[si] + spry[si] - sprbhei[si] - 1)
      return true;
    return false;
  }
  if (spry[si] + sprbhei[si] <= sprhei[bx] + spry[bx] - sprbhei[bx] - 1)
    return true;
  return false;
}

function putims() {
  for (let i = 0; i < SPRITES; i++)
    if (sprrdrwf[i])
      gputim(sprx[i], spry[i], sprch[i], sprwid[i], sprhei[i]);
}

function putis() {
  for (let i = 0; i < SPRITES; i++)
    if (sprrdrwf[i])
      gputi(sprx[i], spry[i], sprmov[i], sprwid[i], sprhei[i]);
}

const first = new Array(TYPES).fill(-1);
const coll = new Array(SPRITES).fill(-1);
const firstt = [FIRSTBONUS, FIRSTBAG, FIRSTMONSTER, FIRSTFIREBALL, FIRSTDIGGER];
const lastt = [LASTBONUS, LASTBAG, LASTMONSTER, LASTFIREBALL, LASTDIGGER];

function bcollides(spr) {
  let spc, next, i;
  for (next = 0; next < TYPES; next++)
    first[next] = -1;
  for (next = 0; next < SPRITES; next++)
    coll[next] = -1;
  for (i = 0; i < TYPES; i++) {
    next = -1;
    for (spc = firstt[i]; spc < lastt[i]; spc++)
      if (sprenf[spc] && spc !== spr)
        if (bcollide(spr, spc)) {
          if (next === -1)
            first[i] = next = spc;
          else
            coll[next = (coll[next] = spc)] = -1;
        }
  }
}

// ===========================================================================
// scores.c
// ===========================================================================

const scdat = [{ score: 0, nextbs: 0 }, { score: 0, nextbs: 0 }];
const scorehigh = new Array(12).fill(0);
const scoreinit = Array.from({ length: 11 }, () => '...');
let scoret = 0;
let scorebuf = new Uint8Array(512);
const bonusscore = 20000;

function readscores() {
  scorebuf = loadScoreBuffer();
}

function writescores() {
  saveScoreBuffer(scorebuf);
}

function initscores() {
  for (let i = 0; i < diggers; i++)
    addscore(i, 0);
}

/** Desplazamiento de la tabla de récords del modo actual dentro de scorebuf. */
function scoretableoffset() {
  let p = 0;
  if (gauntlet)
    p = 111;
  if (diggers === 2)
    p += 222;
  return p;
}

function loadscores() {
  let p = scoretableoffset();
  readscores();
  if (scorebuf[p++] !== 's'.charCodeAt(0)) {
    for (let i = 0; i < 11; i++) {
      scorehigh[i + 1] = 0;
      scoreinit[i] = '...';
    }
  } else
    for (let i = 1; i < 11; i++) {
      scoreinit[i] = String.fromCharCode(scorebuf[p], scorebuf[p + 1], scorebuf[p + 2]);
      p += 5;
      let s = '';
      for (let x = 0; x < 6; x++)
        s += String.fromCharCode(scorebuf[p++]);
      scorehigh[i + 1] = parseInt(s.trim(), 10) || 0;
    }
}

function zeroscores() {
  scdat[0].score = scdat[1].score = 0;
  scdat[0].nextbs = scdat[1].nextbs = bonusscore;
  scoret = 0;
}

function writecurscore(col) {
  if (curplayer === 0)
    writenum(scdat[0].score, 0, 0, 6, col);
  else if (scdat[1].score < 100000)
    writenum(scdat[1].score, 236, 0, 6, col);
  else
    writenum(scdat[1].score, 248, 0, 6, col);
}

function drawscores() {
  writenum(scdat[0].score, 0, 0, 6, 3);
  if (nplayers === 2 || (diggers === 2 && !shared)) {
    if (scdat[1].score < 100000)
      writenum(scdat[1].score, 236, 0, 6, 3);
    else
      writenum(scdat[1].score, 248, 0, 6, 3);
  }
}

function addscore(n, score) {
  if (shared)
    n = 0;
  scdat[n].score += score;
  if (scdat[n].score > 999999)
    scdat[n].score = 0;
  if (n === 0)
    writenum(scdat[n].score, 0, 0, 6, 1);
  else if (scdat[n].score < 100000)
    writenum(scdat[n].score, 236, 0, 6, 1);
  else
    writenum(scdat[n].score, 248, 0, 6, 1);
  if (scdat[n].score >= scdat[n].nextbs + n && /* +n to reproduce original bug */
      scdat[n].score < 1000000) {
    if (getlives(n) < 5 || unlimlives) {
      if (gauntlet)
        cgtime += 17897715; /* 15 second time bonus instead of the life */
      else
        addlife(n);
      drawlives();
    }
    scdat[n].nextbs += bonusscore;
  }
  incpenalty();
  incpenalty();
  incpenalty();
}

async function endofgame() {
  let i;
  let initflag = false;
  for (i = 0; i < diggers; i++)
    addscore(i, 0);
  if (playing || !drfvalid)
    return;
  if (gauntlet) {
    cleartopline();
    outtext('TIME UP', 120, 0, 3);
    for (i = 0; i < 50 && !escape; i++)
      await newframe();
    outtext('       ', 120, 0, 3);
  }
  for (i = curplayer; i < curplayer + (shared ? 1 : diggers); i++) {
    scoret = scdat[i].score;
    if (scoret > scorehigh[11]) {
      gclear();
      drawscores();
      pldispbuf = 'PLAYER ' + (i === 0 ? '1' : '2');
      outtext(pldispbuf, 108, 0, 2);
      outtext(' NEW HIGH SCORE ', 64, 40, 2);
      if (!(await getinitials()))
        return;
      shufflehigh();
      savescores();
      initflag = true;
    }
  }
  if (!initflag && !gauntlet) {
    cleartopline();
    outtext('GAME OVER', 104, 0, 3);
    for (i = 0; i < 50 && !escape; i++)
      await newframe();
    outtext('         ', 104, 0, 3);
    setretr(true);
  }
}

function showtable() {
  let col = 2;
  outtext('HIGH SCORES', 16, 25, 3);
  for (let i = 1; i < 11; i++) {
    const hsbuf = scoreinit[i] + ' ' + numtostring(scorehigh[i + 1]);
    outtext(hsbuf, 16, 31 + 13 * i, col);
    col = 1;
  }
}

function savescores() {
  const p = scoretableoffset();
  scorebuf[p] = 's'.charCodeAt(0);
  for (let i = 1; i < 11; i++) {
    const hsbuf = scoreinit[i] + ' ' + numtostring(scorehigh[i + 1]);
    for (let j = 0; j < 11; j++)
      scorebuf[p + j + i * 11 - 10] = hsbuf.charCodeAt(j);
  }
  writescores();
}

/**
 * Pide las iniciales. Además del teclado, se pueden elegir con la cruceta:
 * arriba/abajo cambian la letra, disparo o derecha la confirman e izquierda
 * borra. Devuelve false si el jugador abandonó (botón de menú).
 */
async function getinitials() {
  await newframe();
  outtext('ENTER YOUR', 100, 70, 3);
  outtext(' INITIALS', 100, 90, 3);
  outtext('_ _ _', 128, 130, 3);
  const chars = [46, 46, 46];
  killsound();
  for (let i = 0; i < 3; i++) {
    let k = 0;
    while (k === 0) {
      k = await getinitial(i * 24 + 128, 130);
      if (k < 0)
        return false;
      if (k === 8 || k === 127) {
        if (i > 0) {
          gwrite(i * 24 + 128, 130, '_', 3);
          i--;
        }
        k = 0;
      }
    }
    gwrite(i * 24 + 128, 130, k, 3);
    chars[i] = k;
  }
  scoreinit[0] = String.fromCharCode(...chars);
  for (let i = 0; i < 20; i++)
    await newframe();
  setupsound();
  gclear();
  gpal(0);
  ginten(0);
  setretr(true);
  return true;
}

const INITIAL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789. ';
let initialPick = 0;

async function getinitial(x, y) {
  let blink = 0;
  let picking = false;
  gwrite(x, y, '_', 3);
  controls.flush();
  for (;;) {
    video.present();
    await frames.nextFrame();
    if (quitRequested)
      return -1;
    blink++;
    if (picking) {
      // La letra elegida con la cruceta parpadea
      gwrite(x, y, (blink >> 4) & 1 ? '_' : INITIAL_CHARS[initialPick], 3);
    }
    while (controls.kbhit()) {
      const k = controls.getkey();
      const a = k.action;
      if (k.key && k.key.length === 1) {
        const c = k.key.toUpperCase();
        if (/[A-Z0-9. ]/.test(c) && a !== 1 && a !== 3)
          return c.charCodeAt(0);
      }
      if (k.code === 'Backspace' || k.code === 'Delete')
        return 8;
      if (a === 1 || a === 3) {
        if (picking)
          initialPick = (initialPick + (a === 1 ? 1 : INITIAL_CHARS.length - 1)) % INITIAL_CHARS.length;
        picking = true;
        blink = 0;
        gwrite(x, y, INITIAL_CHARS[initialPick], 3);
      } else if (a === 4 || a === 0 || (k.code === 'Enter' && picking)) {
        if (picking)
          return INITIAL_CHARS.charCodeAt(initialPick);
        picking = true;
        gwrite(x, y, INITIAL_CHARS[initialPick], 3);
      } else if (a === 2) {
        return 8;
      }
    }
  }
}

function shufflehigh() {
  let i, j;
  for (j = 10; j > 1; j--)
    if (scoret < scorehigh[j])
      break;
  for (i = 10; i > j; i--) {
    scorehigh[i + 1] = scorehigh[i];
    scoreinit[i] = scoreinit[i - 1];
  }
  scorehigh[j + 1] = scoret;
  scoreinit[j] = scoreinit[0];
}

function scorekill(n) {
  addscore(n, 250);
}

function scorekill2() {
  addscore(0, 125);
  addscore(1, 125);
}

function scoreemerald(n) {
  addscore(n, 25);
}

function scoreoctave(n) {
  addscore(n, 250);
}

function scoregold(n) {
  addscore(n, 500);
}

function scorebonus(n) {
  addscore(n, 1000);
}

function scoreeatm(n, msc) {
  addscore(n, msc * 200);
}

function writenum(n, x, y, w, c) {
  let xp = (w - 1) * 12 + x;
  n %= 1000000;
  while (w > 0) {
    const d = n % 10;
    if (w > 1 || d > 0)
      gwrite(xp, y, d + 48, c);
    n = Math.floor(n / 10);
    w--;
    xp -= 12;
  }
}

/** Número de 7 caracteres alineado a la derecha. */
function numtostring(n) {
  return String(n).padStart(7, ' ').slice(-7);
}

/** Tabla de récords del modo actual (para mostrarla fuera del juego). */
export function getHighScores(opts) {
  const buf = loadScoreBuffer();
  let p = 0;
  if (opts.mode === 'gauntlet') p = 111;
  if (opts.mode === '2s' || opts.mode === 'vs') p += 222;
  const out = [];
  if (buf[p++] !== 115) return out;
  for (let i = 1; i < 11; i++) {
    const name = String.fromCharCode(buf[p], buf[p + 1], buf[p + 2]);
    p += 5;
    let s = '';
    for (let x = 0; x < 6; x++) s += String.fromCharCode(buf[p++]);
    out.push({ name, score: parseInt(s.trim(), 10) || 0 });
  }
  return out;
}

// ===========================================================================
// input.c (variante Windows: teclas como funciones mapeables)
// ===========================================================================

let escape = false, firepflag = false, fire2pflag = false, start = false;
let pausef = false;
/** aflag[i]: la acción i se pulsó desde la última lectura (pulsaciones muy cortas). */
const aflag = new Array(10).fill(false);
let dynamicdir = DIR_NONE, dynamicdir2 = DIR_NONE, staticdir = DIR_NONE, staticdir2 = DIR_NONE;
let keydir = 0, keydir2 = 0;
let commandbuffer = 0;
let oupressed = false, odpressed = false, olpressed = false, orpressed = false;
let ou2pressed = false, od2pressed = false, ol2pressed = false, or2pressed = false;

/** Llamado por controls.js en cada pulsación (tecla, toque o mando). */
export function onPress(action) {
  if (action >= 0 && action < 10)
    aflag[action] = true;
}

const held = (a) => controls.isHeld(a);

function getcommand() {
  const t = commandbuffer;
  commandbuffer = 0;
  return t;
}

function checkkeyb() {
  let k;
  for (let i = 0; i < 10; i++)
    if (held(i))
      aflag[i] = true;
  if (controls.kbhit()) {
    const key = controls.getkey();
    if (ontitle)
      titlekeys.push(key);
    commandbuffer = key.action + 1;
    if (commandbuffer !== 19)
      start = true;
  }
  if (commandbuffer) {
    k = commandbuffer - 1;
    if (commandbuffer !== 19)
      commandbuffer = 0;
    switch (k) {
      case 11: /* Increase speed */
        if (ftime > 10000)
          ftime -= 10000;
        hooks.onSpeed?.(ftime);
        break;
      case 12: /* Decrease speed */
        ftime += 10000;
        hooks.onSpeed?.(ftime);
        break;
      case 13: /* Toggle music */
        musicflag = !musicflag;
        hooks.onSoundFlags?.(soundflag, musicflag);
        break;
      case 14: /* Toggle sound */
        soundflag = !soundflag;
        hooks.onSoundFlags?.(soundflag, musicflag);
        break;
      case 15: /* Exit */
        escape = true;
        break;
      case 16: /* Pause */
        pausef = true;
        break;
    }
  }
}

function detectjoy() {
  staticdir = dynamicdir = DIR_NONE;
}

function flushkeybuf() {
  controls.flush();
  aflag.fill(false);
}

function clearfire(n) {
  aflag[n === 0 ? 4 : 9] = false;
}

function readdir(n) {
  let u = false, d = false, l = false, r = false;
  const o = n === 0 ? 0 : 5;
  if (aflag[o + 1] || held(o + 1)) { u = true; aflag[o + 1] = false; }
  if (aflag[o + 3] || held(o + 3)) { d = true; aflag[o + 3] = false; }
  if (aflag[o + 2] || held(o + 2)) { l = true; aflag[o + 2] = false; }
  if (aflag[o + 0] || held(o + 0)) { r = true; aflag[o + 0] = false; }
  const fire = held(o + 4) || aflag[o + 4];
  aflag[o + 4] = false;

  if (n === 0) {
    firepflag = fire;
    if (u && !oupressed)
      staticdir = dynamicdir = DIR_UP;
    if (d && !odpressed)
      staticdir = dynamicdir = DIR_DOWN;
    if (l && !olpressed)
      staticdir = dynamicdir = DIR_LEFT;
    if (r && !orpressed)
      staticdir = dynamicdir = DIR_RIGHT;
    if ((oupressed && !u && dynamicdir === DIR_UP) ||
        (odpressed && !d && dynamicdir === DIR_DOWN) ||
        (olpressed && !l && dynamicdir === DIR_LEFT) ||
        (orpressed && !r && dynamicdir === DIR_RIGHT)) {
      dynamicdir = DIR_NONE;
      if (u) dynamicdir = staticdir = 2;
      if (d) dynamicdir = staticdir = 6;
      if (l) dynamicdir = staticdir = 4;
      if (r) dynamicdir = staticdir = 0;
    }
    oupressed = u;
    odpressed = d;
    olpressed = l;
    orpressed = r;
    keydir = staticdir;
    if (dynamicdir !== DIR_NONE)
      keydir = dynamicdir;
    staticdir = DIR_NONE;
  } else {
    fire2pflag = fire;
    if (u && !ou2pressed)
      staticdir2 = dynamicdir2 = DIR_UP;
    if (d && !od2pressed)
      staticdir2 = dynamicdir2 = DIR_DOWN;
    if (l && !ol2pressed)
      staticdir2 = dynamicdir2 = DIR_LEFT;
    if (r && !or2pressed)
      staticdir2 = dynamicdir2 = DIR_RIGHT;
    if ((ou2pressed && !u && dynamicdir2 === DIR_UP) ||
        (od2pressed && !d && dynamicdir2 === DIR_DOWN) ||
        (ol2pressed && !l && dynamicdir2 === DIR_LEFT) ||
        (or2pressed && !r && dynamicdir2 === DIR_RIGHT)) {
      dynamicdir2 = DIR_NONE;
      if (u) dynamicdir2 = staticdir2 = 2;
      if (d) dynamicdir2 = staticdir2 = 6;
      if (l) dynamicdir2 = staticdir2 = 4;
      if (r) dynamicdir2 = staticdir2 = 0;
    }
    ou2pressed = u;
    od2pressed = d;
    ol2pressed = l;
    or2pressed = r;
    keydir2 = staticdir2;
    if (dynamicdir2 !== DIR_NONE)
      keydir2 = dynamicdir2;
    staticdir2 = DIR_NONE;
  }
}

function getdir(n) {
  return n === 0 ? keydir : keydir2;
}

// ===========================================================================
// sound.c
// ===========================================================================

let wavetype = 0, musvol = 0;
let spkrmode = 0, timerrate = 0x7d0;
let timercount = 0, t2val = 0, t0val = 0;
let pulsewidth = 1;
const volume = 1;
let timerclock = 0;
let soundflag = true, musicflag = true;
let sndflag = false, soundpausedflag = false;
let randvs = 0;

function randnos(n) {
  randvs = (Math.imul(randvs, 0x15a4e35) + 1) | 0;
  return (randvs & 0x7fffffff) % n;
}

function sett2val(t2v) {
  if (sndflag)
    timer2(t2v);
}

function soundint() {
  timerclock = (timerclock + 1) & 0xff;
  if (soundlevdoneflag)
    soundlevdoneupdate();
  if (soundflag && !sndflag)
    sndflag = musicflag = true;
  if (!soundflag && sndflag) {
    sndflag = false;
    timer2(40);
    setsoundt2();
    soundoff();
  }
  if (sndflag && !soundpausedflag) {
    t0val = 0x7d00;
    t2val = 40;
    if (musicflag)
      musicupdate();
    soundemeraldupdate();
    soundwobbleupdate();
    soundddieupdate();
    soundbreakupdate();
    soundgoldupdate();
    soundemupdate();
    soundexplodeupdate();
    soundfireupdate();
    soundeatmupdate();
    soundfallupdate();
    sound1upupdate();
    soundbonusupdate();
    if (t0val === 0x7d00 || t2val !== 40)
      setsoundt2();
    else {
      setsoundmode();
      sett0();
    }
    sett2val(t2val);
  }
}

function soundstop() {
  soundfalloff();
  soundwobbleoff();
  for (let i = 0; i < FIREBALLS; i++)
    soundfireoff(i);
  musicoff();
  soundbonusoff();
  for (let i = 0; i < FIREBALLS; i++)
    soundexplodeoff(i);
  soundbreakoff();
  soundemoff();
  soundemeraldoff();
  soundgoldoff();
  soundeatmoff();
  soundddieoff();
  sound1upoff();
}

let soundlevdoneflag = false;
let nljpointer = 0, nljnoteduration = 0;

/**
 * Jingle de nivel completado. En el original el bucle avanzaba una nota cada
 * vez que cambiaba timerclock; aquí soundint() llama a soundlevdoneupdate()
 * directamente y el juego solo espera a que termine.
 */
async function soundlevdone() {
  soundstop();
  nljpointer = 0;
  nljnoteduration = 20;
  soundlevdoneflag = soundpausedflag = true;
  while (soundlevdoneflag && !escape) {
    video.present();
    await frames.nextFrame();
    checkkeyb();
  }
  soundlevdoneoff();
}

function soundlevdoneoff() {
  soundlevdoneflag = soundpausedflag = false;
}

const newlevjingle = [0x8e8, 0x712, 0x5f2, 0x7f0, 0x6ac, 0x54c,
  0x712, 0x5f2, 0x4b8, 0x474, 0x474];

function soundlevdoneupdate() {
  if (sndflag) {
    if (nljpointer < 11)
      t2val = newlevjingle[nljpointer];
    t0val = t2val + 35;
    musvol = 50;
    setsoundmode();
    sett0();
    sett2val(t2val);
    if (nljnoteduration > 0)
      nljnoteduration--;
    else {
      nljnoteduration = 20;
      nljpointer++;
      if (nljpointer > 10)
        soundlevdoneoff();
    }
  } else
    soundlevdoneflag = false;
}

let soundfallflag = false, soundfallf = false;
let soundfallvalue = 0, soundfalln = 0;

function soundfall() {
  soundfallvalue = 1000;
  soundfallflag = true;
}

function soundfalloff() {
  soundfallflag = false;
  soundfalln = 0;
}

function soundfallupdate() {
  if (soundfallflag) {
    if (soundfalln < 1) {
      soundfalln++;
      if (soundfallf)
        t2val = soundfallvalue;
    } else {
      soundfalln = 0;
      if (soundfallf) {
        soundfallvalue += 50;
        soundfallf = false;
      } else
        soundfallf = true;
    }
  }
}

let soundbreakflag = false;
let soundbreakduration = 0, soundbreakvalue = 0;

function soundbreak() {
  soundbreakduration = 3;
  if (soundbreakvalue < 15000)
    soundbreakvalue = 15000;
  soundbreakflag = true;
}

function soundbreakoff() {
  soundbreakflag = false;
}

function soundbreakupdate() {
  if (soundbreakflag) {
    if (soundbreakduration !== 0) {
      soundbreakduration--;
      t2val = soundbreakvalue;
    } else
      soundbreakflag = false;
  }
}

let soundwobbleflag = false;
let soundwobblen = 0;

function soundwobble() {
  soundwobbleflag = true;
}

function soundwobbleoff() {
  soundwobbleflag = false;
  soundwobblen = 0;
}

function soundwobbleupdate() {
  if (soundwobbleflag) {
    soundwobblen++;
    if (soundwobblen > 63)
      soundwobblen = 0;
    switch (soundwobblen) {
      case 0:
        t2val = 0x7d0;
        break;
      case 16:
      case 48:
        t2val = 0x9c4;
        break;
      case 32:
        t2val = 0xbb8;
        break;
    }
  }
}

const soundfireflag = [false, false], sff = [false, false];
const soundfirevalue = [0, 0], soundfiren = [0, 0];
let soundfirew = 0;

function soundfire(n) {
  soundfirevalue[n] = 500;
  soundfireflag[n] = true;
}

function soundfireoff(n) {
  soundfireflag[n] = false;
  soundfiren[n] = 0;
}

function soundfireupdate() {
  let n, f = false;
  for (n = 0; n < FIREBALLS; n++) {
    sff[n] = false;
    if (soundfireflag[n]) {
      if (soundfiren[n] === 1) {
        soundfiren[n] = 0;
        soundfirevalue[n] += idiv(soundfirevalue[n], 55);
        sff[n] = true;
        f = true;
        if (soundfirevalue[n] > 30000)
          soundfireoff(n);
      } else
        soundfiren[n]++;
    }
  }
  if (f) {
    do {
      n = soundfirew++;
      if (soundfirew === FIREBALLS)
        soundfirew = 0;
    } while (!sff[n]);
    t2val = soundfirevalue[n] + randnos(soundfirevalue[n] >> 3);
  }
}

const soundexplodeflag = [false, false], sef = [false, false];
const soundexplodevalue = [0, 0], soundexplodeduration = [0, 0];
let soundexplodew = 0;

function soundexplode(n) {
  soundexplodevalue[n] = 1500;
  soundexplodeduration[n] = 10;
  soundexplodeflag[n] = true;
  soundfireoff(n);
}

function soundexplodeoff(n) {
  soundexplodeflag[n] = false;
}

function soundexplodeupdate() {
  let n, f = false;
  for (n = 0; n < FIREBALLS; n++) {
    sef[n] = false;
    if (soundexplodeflag[n]) {
      if (soundexplodeduration[n] !== 0) {
        soundexplodevalue[n] = soundexplodevalue[n] - (soundexplodevalue[n] >> 3);
        soundexplodeduration[n]--;
        sef[n] = true;
        f = true;
      } else
        soundexplodeflag[n] = false;
    }
  }
  if (f) {
    do {
      n = soundexplodew++;
      if (soundexplodew === FIREBALLS)
        soundexplodew = 0;
    } while (!sef[n]);
    t2val = soundexplodevalue[n];
  }
}

let soundbonusflag = false;
let soundbonusn = 0;

function soundbonus() {
  soundbonusflag = true;
}

function soundbonusoff() {
  soundbonusflag = false;
  soundbonusn = 0;
}

function soundbonusupdate() {
  if (soundbonusflag) {
    soundbonusn++;
    if (soundbonusn > 15)
      soundbonusn = 0;
    if (soundbonusn >= 0 && soundbonusn < 6)
      t2val = 0x4ce;
    if (soundbonusn >= 8 && soundbonusn < 14)
      t2val = 0x5e9;
  }
}

let soundemflag = false;

function soundem() {
  soundemflag = true;
}

function soundemoff() {
  soundemflag = false;
}

function soundemupdate() {
  if (soundemflag) {
    t2val = 1000;
    soundemoff();
  }
}

let soundemeraldflag = false;
let soundemeraldduration = 0, emerfreq = 0, soundemeraldn = 0;
const emfreqs = [0x8e8, 0x7f0, 0x712, 0x6ac, 0x5f2, 0x54c, 0x4b8, 0x474];

function soundemerald(n) {
  emerfreq = emfreqs[n];
  soundemeraldduration = 7;
  soundemeraldn = 0;
  soundemeraldflag = true;
}

function soundemeraldoff() {
  soundemeraldflag = false;
}

function soundemeraldupdate() {
  if (soundemeraldflag) {
    if (soundemeraldduration !== 0) {
      if (soundemeraldn === 0 || soundemeraldn === 1)
        t2val = emerfreq;
      soundemeraldn++;
      if (soundemeraldn > 7) {
        soundemeraldn = 0;
        soundemeraldduration--;
      }
    } else
      soundemeraldoff();
  }
}

let soundgoldflag = false, soundgoldf = false;
let soundgoldvalue1 = 0, soundgoldvalue2 = 0, soundgoldduration = 0;

function soundgold() {
  soundgoldvalue1 = 500;
  soundgoldvalue2 = 4000;
  soundgoldduration = 30;
  soundgoldf = false;
  soundgoldflag = true;
}

function soundgoldoff() {
  soundgoldflag = false;
}

function soundgoldupdate() {
  if (soundgoldflag) {
    if (soundgoldduration !== 0)
      soundgoldduration--;
    else
      soundgoldflag = false;
    if (soundgoldf) {
      soundgoldf = false;
      t2val = soundgoldvalue1;
    } else {
      soundgoldf = true;
      t2val = soundgoldvalue2;
    }
    soundgoldvalue1 += soundgoldvalue1 >> 4;
    soundgoldvalue2 -= soundgoldvalue2 >> 4;
  }
}

let soundeatmflag = false;
let soundeatmvalue = 0, soundeatmduration = 0, soundeatmn = 0;

function soundeatm() {
  soundeatmduration = 20;
  soundeatmn = 3;
  soundeatmvalue = 2000;
  soundeatmflag = true;
}

function soundeatmoff() {
  soundeatmflag = false;
}

function soundeatmupdate() {
  if (soundeatmflag) {
    if (soundeatmn !== 0) {
      if (soundeatmduration !== 0) {
        if (soundeatmduration % 4 === 1)
          t2val = soundeatmvalue;
        if (soundeatmduration % 4 === 3)
          t2val = soundeatmvalue - (soundeatmvalue >> 4);
        soundeatmduration--;
        soundeatmvalue -= soundeatmvalue >> 4;
      } else {
        soundeatmduration = 20;
        soundeatmn--;
        soundeatmvalue = 2000;
      }
    } else
      soundeatmflag = false;
  }
}

let soundddieflag = false;
let soundddien = 0, soundddievalue = 0;

function soundddie() {
  soundddien = 0;
  soundddievalue = 20000;
  soundddieflag = true;
}

function soundddieoff() {
  soundddieflag = false;
}

function soundddieupdate() {
  if (soundddieflag) {
    soundddien++;
    if (soundddien === 1)
      musicoff();
    if (soundddien >= 1 && soundddien <= 10)
      soundddievalue = 20000 - soundddien * 1000;
    if (soundddien > 10)
      soundddievalue += 500;
    if (soundddievalue > 30000)
      soundddieoff();
    t2val = soundddievalue;
  }
}

let sound1upflag = false;
let sound1upduration = 0;

function sound1up() {
  sound1upduration = 96;
  sound1upflag = true;
}

function sound1upoff() {
  sound1upflag = false;
}

function sound1upupdate() {
  if (sound1upflag) {
    if (idiv(sound1upduration, 3) % 2 !== 0)
      t2val = (sound1upduration << 2) + 600;
    sound1upduration--;
    if (sound1upduration < 1)
      sound1upflag = false;
  }
}

let musicplaying = false;
let musicp = 0, tuneno = 0, noteduration = 0, notevalue = 0, musicmaxvol = 0,
  musicattackrate = 0, musicsustainlevel = 0, musicdecayrate = 0, musicnotewidth = 0,
  musicreleaserate = 0, musicstage = 0, musicn = 0;

function music(tune) {
  tuneno = tune;
  musicp = 0;
  noteduration = 0;
  switch (tune) {
    case 0:
      musicmaxvol = 50;
      musicattackrate = 20;
      musicsustainlevel = 20;
      musicdecayrate = 10;
      musicreleaserate = 4;
      break;
    case 1:
      musicmaxvol = 50;
      musicattackrate = 50;
      musicsustainlevel = 8;
      musicdecayrate = 15;
      musicreleaserate = 1;
      break;
    case 2:
      musicmaxvol = 50;
      musicattackrate = 50;
      musicsustainlevel = 25;
      musicdecayrate = 5;
      musicreleaserate = 1;
  }
  musicplaying = true;
  if (tune === 2)
    soundddieoff();
}

function musicoff() {
  musicplaying = false;
  musicp = 0;
}

const bonusjingle = [
  0x11d1, 2, 0x11d1, 2, 0x11d1, 4, 0x11d1, 2, 0x11d1, 2, 0x11d1, 4, 0x11d1, 2, 0x11d1, 2,
  0xd59, 4, 0xbe4, 4, 0xa98, 4, 0x11d1, 2, 0x11d1, 2, 0x11d1, 4, 0x11d1, 2, 0x11d1, 2,
  0x11d1, 4, 0xd59, 2, 0xa98, 2, 0xbe4, 4, 0xe24, 4, 0x11d1, 4, 0x11d1, 2, 0x11d1, 2,
  0x11d1, 4, 0x11d1, 2, 0x11d1, 2, 0x11d1, 4, 0x11d1, 2, 0x11d1, 2, 0xd59, 4, 0xbe4, 4,
  0xa98, 4, 0xd59, 2, 0xa98, 2, 0x8e8, 10, 0xa00, 2, 0xa98, 2, 0xbe4, 2, 0xd59, 4,
  0xa98, 4, 0xd59, 4, 0x11d1, 2, 0x11d1, 2, 0x11d1, 4, 0x11d1, 2, 0x11d1, 2, 0x11d1, 4,
  0x11d1, 2, 0x11d1, 2, 0xd59, 4, 0xbe4, 4, 0xa98, 4, 0x11d1, 2, 0x11d1, 2, 0x11d1, 4,
  0x11d1, 2, 0x11d1, 2, 0x11d1, 4, 0xd59, 2, 0xa98, 2, 0xbe4, 4, 0xe24, 4, 0x11d1, 4,
  0x11d1, 2, 0x11d1, 2, 0x11d1, 4, 0x11d1, 2, 0x11d1, 2, 0x11d1, 4, 0x11d1, 2, 0x11d1, 2,
  0xd59, 4, 0xbe4, 4, 0xa98, 4, 0xd59, 2, 0xa98, 2, 0x8e8, 10, 0xa00, 2, 0xa98, 2,
  0xbe4, 2, 0xd59, 4, 0xa98, 4, 0xd59, 4, 0xa98, 2, 0xa98, 2, 0xa98, 4, 0xa98, 2,
  0xa98, 2, 0xa98, 4, 0xa98, 2, 0xa98, 2, 0xa98, 4, 0x7f0, 4, 0xa98, 4, 0x7f0, 4,
  0xa98, 4, 0x7f0, 4, 0xa98, 4, 0xbe4, 4, 0xd59, 4, 0xe24, 4, 0xfdf, 4, 0xa98, 2,
  0xa98, 2, 0xa98, 4, 0xa98, 2, 0xa98, 2, 0xa98, 4, 0xa98, 2, 0xa98, 2, 0xa98, 4,
  0x7f0, 4, 0xa98, 4, 0x7f0, 4, 0xa98, 4, 0x7f0, 4, 0x8e8, 4, 0x970, 4, 0x8e8, 4,
  0x970, 4, 0x8e8, 4, 0xa98, 2, 0xa98, 2, 0xa98, 4, 0xa98, 2, 0xa98, 2, 0xa98, 4,
  0xa98, 2, 0xa98, 2, 0xa98, 4, 0x7f0, 4, 0xa98, 4, 0x7f0, 4, 0xa98, 4, 0x7f0, 4,
  0xa98, 4, 0xbe4, 4, 0xd59, 4, 0xe24, 4, 0xfdf, 4, 0xa98, 2, 0xa98, 2, 0xa98, 4,
  0xa98, 2, 0xa98, 2, 0xa98, 4, 0xa98, 2, 0xa98, 2, 0xa98, 4, 0x7f0, 4, 0xa98, 4,
  0x7f0, 4, 0xa98, 4, 0x7f0, 4, 0x8e8, 4, 0x970, 4, 0x8e8, 4, 0x970, 4, 0x8e8, 4,
  0x7d64];

const backgjingle = [
  0xfdf, 2, 0x11d1, 2, 0xfdf, 2, 0x1530, 2, 0x1ab2, 2, 0x1530, 2, 0x1fbf, 4, 0xfdf, 2,
  0x11d1, 2, 0xfdf, 2, 0x1530, 2, 0x1ab2, 2, 0x1530, 2, 0x1fbf, 4, 0xfdf, 2, 0xe24, 2,
  0xd59, 2, 0xe24, 2, 0xd59, 2, 0xfdf, 2, 0xe24, 2, 0xfdf, 2, 0xe24, 2, 0x11d1, 2,
  0xfdf, 2, 0x11d1, 2, 0xfdf, 2, 0x1400, 2, 0xfdf, 4, 0xfdf, 2, 0x11d1, 2, 0xfdf, 2,
  0x1530, 2, 0x1ab2, 2, 0x1530, 2, 0x1fbf, 4, 0xfdf, 2, 0x11d1, 2, 0xfdf, 2, 0x1530, 2,
  0x1ab2, 2, 0x1530, 2, 0x1fbf, 4, 0xfdf, 2, 0xe24, 2, 0xd59, 2, 0xe24, 2, 0xd59, 2,
  0xfdf, 2, 0xe24, 2, 0xfdf, 2, 0xe24, 2, 0x11d1, 2, 0xfdf, 2, 0x11d1, 2, 0xfdf, 2,
  0xe24, 2, 0xd59, 4, 0xa98, 2, 0xbe4, 2, 0xa98, 2, 0xd59, 2, 0x11d1, 2, 0xd59, 2,
  0x1530, 4, 0xa98, 2, 0xbe4, 2, 0xa98, 2, 0xd59, 2, 0x11d1, 2, 0xd59, 2, 0x1530, 4,
  0xa98, 2, 0x970, 2, 0x8e8, 2, 0x970, 2, 0x8e8, 2, 0xa98, 2, 0x970, 2, 0xa98, 2,
  0x970, 2, 0xbe4, 2, 0xa98, 2, 0xbe4, 2, 0xa98, 2, 0xd59, 2, 0xa98, 4, 0xa98, 2,
  0xbe4, 2, 0xa98, 2, 0xd59, 2, 0x11d1, 2, 0xd59, 2, 0x1530, 4, 0xa98, 2, 0xbe4, 2,
  0xa98, 2, 0xd59, 2, 0x11d1, 2, 0xd59, 2, 0x1530, 4, 0xa98, 2, 0x970, 2, 0x8e8, 2,
  0x970, 2, 0x8e8, 2, 0xa98, 2, 0x970, 2, 0xa98, 2, 0x970, 2, 0xbe4, 2, 0xa98, 2,
  0xbe4, 2, 0xa98, 2, 0xd59, 2, 0xa98, 4, 0x7f0, 2, 0x8e8, 2, 0xa98, 2, 0xd59, 2,
  0x11d1, 2, 0xd59, 2, 0x1530, 4, 0xa98, 2, 0xbe4, 2, 0xa98, 2, 0xd59, 2, 0x11d1, 2,
  0xd59, 2, 0x1530, 4, 0xa98, 2, 0x970, 2, 0x8e8, 2, 0x970, 2, 0x8e8, 2, 0xa98, 2,
  0x970, 2, 0xa98, 2, 0x970, 2, 0xbe4, 2, 0xa98, 2, 0xbe4, 2, 0xd59, 2, 0xbe4, 2,
  0xa98, 4, 0x7d64];

const dirge = [
  0x7d00, 2, 0x11d1, 6, 0x11d1, 4, 0x11d1, 2, 0x11d1, 6, 0xefb, 4, 0xfdf, 2,
  0xfdf, 4, 0x11d1, 2, 0x11d1, 4, 0x12e0, 2, 0x11d1, 12, 0x7d00, 16, 0x7d00, 16,
  0x7d00, 16, 0x7d00, 16, 0x7d00, 16, 0x7d00, 16, 0x7d00, 16, 0x7d00, 16, 0x7d00, 16,
  0x7d00, 16, 0x7d00, 16, 0x7d00, 16, 0x7d64];

function musicupdate() {
  if (!musicplaying)
    return;
  if (noteduration !== 0)
    noteduration--;
  else {
    musicstage = musicn = 0;
    switch (tuneno) {
      case 0:
        noteduration = bonusjingle[musicp + 1] * 3;
        musicnotewidth = noteduration - 3;
        notevalue = bonusjingle[musicp];
        musicp += 2;
        if (bonusjingle[musicp] === 0x7d64)
          musicp = 0;
        break;
      case 1:
        noteduration = backgjingle[musicp + 1] * 6;
        musicnotewidth = 12;
        notevalue = backgjingle[musicp];
        musicp += 2;
        if (backgjingle[musicp] === 0x7d64)
          musicp = 0;
        break;
      case 2:
        noteduration = dirge[musicp + 1] * 10;
        musicnotewidth = noteduration - 10;
        notevalue = dirge[musicp];
        musicp += 2;
        if (dirge[musicp] === 0x7d64)
          musicp = 0;
        break;
    }
  }
  musicn++;
  wavetype = 1;
  t0val = notevalue;
  if (musicn >= musicnotewidth)
    musicstage = 2;
  switch (musicstage) {
    case 0:
      if (musvol + musicattackrate >= musicmaxvol) {
        musicstage = 1;
        musvol = musicmaxvol;
        break;
      }
      musvol += musicattackrate;
      break;
    case 1:
      if (musvol - musicdecayrate <= musicsustainlevel) {
        musvol = musicsustainlevel;
        break;
      }
      musvol -= musicdecayrate;
      break;
    case 2:
      if (musvol - musicreleaserate <= 1) {
        musvol = 1;
        break;
      }
      musvol -= musicreleaserate;
  }
  if (musvol === 1)
    t0val = 0x7d00;
}

function soundpause() {
  soundpausedflag = true;
}

function soundpauseoff() {
  soundpausedflag = false;
}

function sett0() {
  if (sndflag) {
    timer2(t2val);
    if (t0val < 1000 && (wavetype === 1 || wavetype === 2))
      t0val = 1000;
    timer0(t0val);
    timerrate = t0val;
    if (musvol < 1)
      musvol = 1;
    if (musvol > 50)
      musvol = 50;
    pulsewidth = musvol * volume;
    setsoundmode();
  }
}

let soundt0flag = false;

function setsoundt2() {
  if (soundt0flag) {
    spkrmode = 0;
    soundt0flag = false;
    setspkrt2();
  }
}

function setsoundmode() {
  spkrmode = wavetype;
  if (!soundt0flag && sndflag) {
    soundt0flag = true;
    setspkrt2();
  }
}

let int8flag = false;

function startint8() {
  if (!int8flag) {
    timerrate = 0x4000;
    settimer0(0x4000);
    int8flag = true;
  }
}

function stopint8() {
  settimer0(0);
  if (int8flag)
    int8flag = false;
  sett2val(40);
  setspkrt2();
}

/** initsound() + soundinitglob(): prepara el emulador para la frecuencia de muestreo dada. */
export function initsound(samprate) {
  soundinitglob(samprate);
  settimer2(40);
  setspkrt2();
  settimer0(0);
  wavetype = 2;
  t0val = 12000;
  musvol = 8;
  t2val = 40;
  soundt0flag = true;
  sndflag = true;
  spkrmode = 0;
  int8flag = false;
  setsoundt2();
  soundstop();
  setupsound();
  timerrate = 0x4000;
  settimer0(0x4000);
  randvs = getlrt();
}

function killsound() {
  setsoundt2();
  timer2(40);
  stopint8();
}

function setupsound() {
  curtime = null;
  startint8();
}

export function setSoundFlags(sound, mus) {
  soundflag = sound;
  musicflag = mus;
}

// ===========================================================================
// newsnd.c: emulador del temporizador 8253 y del altavoz del PC
// (toda la aritmética de "Uint4" es de 16 bits sin signo)
// ===========================================================================

let rate = 27;
let t0rate = 0, t2rate = 0, t2new = 0, t0v = 0, t2v = 0;
let i8pulse = 0;
let t2f = false, t2sw = false, i8flag = false;
let lut = new Uint8Array(258);
const pwlut = new Uint16Array(51);

function soundinitglob(samprate) {
  if (samprate < 5000)
    samprate = 5000;
  rate = Math.floor(0x1234dd / samprate);
  t2sw = false; /* As it should be left */
  lut = new Uint8Array(rate + 1);
  for (let i = 0; i <= rate; i++)
    lut[i] = Math.floor((i * 255) / rate);
  for (let i = 1; i <= 50; i++)
    pwlut[i] = (16 + i * 18) >> 2; /* Counted timer ticks in original */
}

const L = (i) => lut[i < 0 ? 0 : i > rate ? rate : i];

function settimer2(t2) {
  if (t2 === 40)
    t2 = rate; /* Otherwise aliasing would cause noise artifacts */
  t2 = (t2 & 0xffff) >> 1;
  t2v = t2new = t2;
}

function soundoff() {
  t2sw = false;
}

function setspkrt2() {
  t2sw = true;
}

function settimer0(t0) {
  t0v = t0rate = t0 & 0xffff;
}

function timer0(t0) {
  t0rate = t0 & 0xffff;
}

function timer2(t2) {
  if (t2 === 40)
    t2 = rate; /* Otherwise aliasing would cause noise artifacts */
  t2 = (t2 & 0xffff) >> 1;
  t2new = t2rate = t2;
  t2v = t2rate;
}

const MIN_SAMP = 0, MAX_SAMP = 255;

function getsample1() {
  let f = false;
  let spkrt2 = 0, noi8 = 0, complicate = 0, not2 = 0;

  // subcarry(&t2v, rate)
  t2v = (t2v - rate) & 0xffff;
  if (t2v >= ((-rate) & 0xffff)) {
    not2 = (t2v + rate) & 0xffff; /* Amount of time that went by before change */
    if (t2f) {
      spkrt2 = (-t2v) & 0xffff; /* MIN_SAMPs at beginning */
      t2rate = t2new;
      if (t2rate === (rate >> 1))
        t2v = t2rate;
    } else /* MIN_SAMPs at end */
      spkrt2 = (t2v + rate) & 0xffff;
    t2v = (t2v + t2rate) & 0xffff;
    if (t2rate === (rate >> 1))
      t2v = t2rate;
    else
      t2f = !t2f;
    complicate |= 1;
  }

  // subcarry(&t0v, rate)
  t0v = (t0v - rate) & 0xffff;
  if (t0v >= ((-rate) & 0xffff)) { /* Effectively using mode 2 here */
    i8flag = true;
    noi8 = (t0v + rate) & 0xffff; /* Amount of time that went by before interrupt */
    t0v = (t0v + t0rate) & 0xffff;
    complicate |= 2;
  }

  const t2sw0 = t2sw;

  if (i8flag && i8pulse <= 0) {
    f = true;
    if (spkrmode !== 0) {
      if (spkrmode !== 1)
        t2sw = !t2sw;
      else {
        i8pulse = pwlut[pulsewidth];
        t2sw = true;
        f = false;
      }
    }
  }

  if (i8pulse > 0) {
    complicate |= 4;
    i8pulse -= rate;
    if (i8pulse <= 0) {
      complicate |= 8;
      t2sw = false;
      i8flag = true;
      f = true;
    }
  }

  if (f) {
    // addcarry(&timercount, timerrate)
    timercount = (timercount + timerrate) & 0xffff;
    if (timercount < (timerrate & 0xffff)) {
      soundint(); /* Update music and sound effects 72.8 Hz */
      timercount = (timercount - 0x4000) & 0xffff;
    }
    i8flag = false;
  }

  if (!(complicate & 1) && t2f)
    return MIN_SAMP;

  /* 12 unique cases, no break statements!
     No more than about 6 of these lines are executed on any single call. */

  switch (complicate) {
    case 2: /* Int8 happened */
      if (t2sw !== t2sw0) {
        if (t2sw) /* <==> !t2sw0 */
          return L(rate - noi8);
        return L(noi8);
      }
    // fall through
    case 0: /* Nothing happened! */
      if (!t2sw)
        return MIN_SAMP;
    // fall through
    case 4: /* Int8 is pulsing => t2sw */
      return MAX_SAMP;
    case 1: /* The t2 wave changed */
      if (!t2sw)
        return MIN_SAMP;
    // fall through
    case 5: /* The t2 wave changed and Int8 is pulsing => t2sw */
      return L(spkrt2);
    case 3: /* Int8 happened and t2 wave changed */
      if (!t2sw0 && !t2sw)
        return MIN_SAMP; /* both parts are off */
      if (t2sw0 && t2sw)
        return L(spkrt2); /* both parts are on */
      if (not2 < noi8) { /* t2 happened first */
        if (t2sw0) /* "on" part is before i8 */
          return t2f ? L(spkrt2) : L(spkrt2 - (rate - noi8));
        return t2f ? MIN_SAMP : L(rate - noi8); /* "on" part is after i8 => constant */
      }
      /* i8 happened first */
      if (t2sw0) /* "on" part is before i8 => constant */
        return t2f ? MIN_SAMP : L(noi8);
      return t2f ? L(spkrt2) : L(spkrt2 - noi8); /* "on" part is after i8 */
    case 6: /* The Int8 pulse started */
      if (t2sw0)
        return MAX_SAMP;
      return L(rate - noi8);
    case 7: /* The Int8 pulse started and the t2 wave changed */
      if (t2sw0)
        return L(spkrt2);
      if (not2 < noi8) /* t2 happened first */
        return t2f ? MIN_SAMP : L(rate - noi8);
      return t2f ? L(spkrt2) : L(spkrt2 - noi8); /* i8 happened first */
    case 12: /* The Int8 pulse stopped */
      if (t2sw)
        return MAX_SAMP;
      return L(i8pulse + rate);
    case 13: /* The Int8 pulse stopped and the t2 wave changed */
      if (t2sw)
        return L(spkrt2);
      if (not2 < i8pulse + rate) /* t2 happened first */
        return t2f ? L(spkrt2 + i8pulse) : L(spkrt2);
      return t2f ? MIN_SAMP : L(i8pulse + rate); /* i8pulse ended first */
    case 14: /* The Int8 pulse started and stopped in the same sample */
      if (t2sw0)
        return t2sw ? MAX_SAMP : L(noi8 + i8pulse + rate);
      return t2sw ? L(rate - noi8) : L(i8pulse + rate);
    case 15: /* Everything happened at once */
      if (not2 < noi8) { /* First subcase: t2 happens before pulse */
        if (t2f) { /* MIN_SAMPs at beginning */
          if (t2sw0)
            return t2sw ? L(spkrt2) : L(spkrt2 + noi8 + i8pulse);
          return t2sw ? L(rate - noi8) : L(i8pulse + rate);
        }
        /* MIN_SAMPs at end */
        return t2sw0 ? L(spkrt2) : MIN_SAMP;
      }
      if (not2 < rate + noi8 + i8pulse) { /* Subcase 2: t2 happens during pulse */
        if (t2f) /* MIN_SAMPs at beginning */
          return t2sw ? L(spkrt2) : L(spkrt2 + noi8 + i8pulse);
        /* MIN_SAMPs at end */
        return t2sw0 ? L(spkrt2) : L(spkrt2 - noi8);
      }
      /* Third subcase: t2 happens after pulse */
      if (t2f) /* MIN_SAMPs at beginning */
        return t2sw ? L(spkrt2) : MIN_SAMP;
      /* MIN_SAMPs at end */
      if (t2sw0)
        return t2sw ? L(spkrt2) : L(noi8 + i8pulse + rate);
      return t2sw ? L(spkrt2 - noi8) : L(i8pulse + rate);
  }
  return MIN_SAMP; /* This should never happen */
}

// Filtro paso alto: el altavoz emulado produce valores 0..255 con mucha
// componente continua (el silencio es 0). Un condensador de acoplo, como en
// la tarjeta de sonido, la elimina.
let hpX = 0, hpY = 0;

/** Rellena out con muestras en coma flotante (-1..1). */
export function generateSamples(out) {
  if (suspended) {
    out.fill(0);
    return;
  }
  for (let i = 0; i < out.length; i++) {
    const x = getsample1() / 255;
    hpY = x - hpX + 0.995 * hpY;
    hpX = x;
    out[i] = Math.max(-1, Math.min(1, hpY * 0.5));
  }
}

/** Estado mínimo para pruebas automatizadas. */
export function debugState() {
  const d = digdat[curplayer];
  return { x: d.x, y: d.y, alive: d.alive, lives: getlives(curplayer), score: scdat[0].score, level: levno(), inPlay, paused };
}
