// Capa de video: reemplaza win_vid.c.
// Un framebuffer indexado de 640x400 (16 colores) igual al back_bitmap de la
// versión Windows. Las coordenadas que recibe el juego son lógicas (320x200).
//
// Digger Remastered - Copyright (c) Andrew Jenner 1998-2004 (GPL v2)

import { GFX, VGATABLE, FONT, TITLE } from './gfxdata.js';

export const WIDTH = 640;
export const HEIGHT = 400;
const SIZE = WIDTH * HEIGHT;

/** Framebuffer: un índice de paleta por píxel. */
export const fb = new Uint8Array(SIZE);

// Paletas VGA (RGB) de win_vid.c: pal1, pal1 intensa, pal2, pal2 intensa.
// En el original estaban en orden BGR (RGBQUAD).
const PALETTES = [
  [[0,0,0],[0,0,128],[0,128,0],[0,128,128],[128,0,0],[128,0,128],[128,64,0],[128,128,128],
   [64,64,64],[0,0,255],[0,255,0],[0,255,255],[255,0,0],[255,0,255],[255,255,0],[255,255,255]],
  [[0,0,0],[0,0,255],[0,255,0],[0,255,255],[255,0,0],[255,0,255],[255,128,0],[192,192,192],
   [128,128,128],[128,128,255],[128,255,128],[128,255,255],[255,128,128],[255,128,255],[255,255,128],[255,255,255]],
  [[0,0,0],[0,128,0],[128,0,0],[128,64,0],[0,0,128],[0,128,128],[128,0,128],[128,128,128],
   [64,64,64],[0,255,0],[255,0,0],[255,128,0],[0,0,255],[0,255,255],[255,0,255],[255,255,255]],
  [[0,0,0],[0,255,0],[255,0,0],[255,128,0],[0,0,255],[0,255,255],[255,0,255],[192,192,192],
   [128,128,128],[128,255,128],[255,128,128],[255,255,128],[128,128,255],[128,255,255],[255,128,255],[255,255,255]],
];

// Paletas convertidas a Uint32 en el orden de bytes de ImageData (RGBA little endian)
const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const PAL32 = PALETTES.map((pal) => Uint32Array.from(pal, ([r, g, b]) =>
  littleEndian ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0));

let curPalette = 0;
let curIntensity = 0;
let dirty = true;

let canvas = null;
let ctx = null;
let image = null;
let image32 = null;

export function attachCanvas(el) {
  canvas = el;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  ctx = canvas.getContext('2d', { alpha: false });
  image = ctx.createImageData(WIDTH, HEIGHT);
  image32 = new Uint32Array(image.data.buffer);
  dirty = true;
}

/** Copia el framebuffer al canvas si cambió algo desde la última vez. */
export function present() {
  if (!dirty || !ctx) return;
  dirty = false;
  const pal = PAL32[curPalette * 2 + curIntensity];
  for (let i = 0; i < SIZE; i++) image32[i] = pal[fb[i]];
  ctx.putImageData(image, 0, 0);
}

export function invalidate() { dirty = true; }

// --- Funciones gráficas del juego (mismas firmas que vga*() en C) ----------

export function vgainit() {}

export function vgaclear() {
  fb.fill(0);
  dirty = true;
}

export function vgapal(pal) {
  curPalette = pal;
  dirty = true;
}

export function vgainten(inten) {
  curIntensity = inten;
  dirty = true;
}

/** Copia un bloque guardado (w en bytes de 8 px, h en filas lógicas) al framebuffer. */
export function vgaputi(x, y, p, w, h) {
  const rowLen = w * 8;
  for (let i = 0; i < h * 2; i++) {
    if (i + y * 2 >= HEIGHT) break;
    const dst = (y * 2 + i) * WIDTH + x * 2;
    const src = i * rowLen;
    for (let k = 0; k < rowLen; k++) {
      const d = dst + k;
      if (d >= 0 && d < SIZE) fb[d] = p[src + k];
    }
  }
  dirty = true;
}

/** Guarda un bloque del framebuffer en p. */
export function vgageti(x, y, p, w, h) {
  const rowLen = w * 8;
  for (let i = 0; i < h * 2; i++) {
    if (i + y * 2 >= HEIGHT) break;
    const src = (y * 2 + i) * WIDTH + x * 2;
    const dst = i * rowLen;
    for (let k = 0; k < rowLen; k++) {
      const s = src + k;
      p[dst + k] = s >= 0 && s < SIZE ? fb[s] : 0;
    }
  }
}

// Caché de sprites decodificados por (ch, w, h): Int8Array con -1 = transparente
const spriteCache = new Map();

function decodeSprite(ch, w, h) {
  const key = (ch << 16) | (w << 8) | h;
  let spr = spriteCache.get(key);
  if (spr) return spr;
  const [di, mi] = VGATABLE[ch];
  const data = GFX[di];
  const mask = GFX[mi];
  const W = w * 8, H = h * 2, plane = w * h * 2;
  spr = new Int8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let xb = 0; xb < w; xb++) {
      const o = y * w + xb;
      const m = mask[o] ?? 0;
      for (let i = 0; i < 8; i++) {
        let c = -1;
        if (!(m & (0x80 >> i))) {
          c = 0;
          for (let pl = 0; pl < 4; pl++) c |= (((data[o + pl * plane] ?? 0) << i) & 0x80) >> (4 + pl);
        }
        spr[y * W + xb * 8 + i] = c;
      }
    }
  }
  spriteCache.set(key, spr);
  return spr;
}

/** Dibuja el sprite ch con máscara (vgaputim). */
export function vgaputim(x, y, ch, w, h) {
  if (ch < 0 || ch >= VGATABLE.length) return;
  const spr = decodeSprite(ch, w, h);
  const W = w * 8, H = h * 2;
  const base = y * 2 * WIDTH + x * 2;
  for (let yy = 0; yy < H; yy++) {
    const row = base + yy * WIDTH;
    for (let xx = 0; xx < W; xx++) {
      const c = spr[yy * W + xx];
      if (c < 0) continue;
      const d = row + xx;
      if (d >= 0 && d < SIZE) fb[d] = c;
    }
  }
  dirty = true;
}

/** Lee 8x2 píxeles y devuelve un byte con un bit por columna ocupada (vgagetpix). */
export function vgagetpix(x, y) {
  if (x > 319 || y > 199) return 0xff;
  let rval = 0;
  for (let yi = 0; yi < 2; yi++)
    for (let xi = 0; xi < 8; xi++) {
      const i = (y * 2 + yi) * WIDTH + x * 2 + xi;
      if (i >= 0 && i < SIZE && fb[i]) rval |= 0x80 >> xi;
    }
  return rval & 0xee;
}

// La fuente original no trae < > [ ]. Se dibujan aquí con el mismo estilo:
// trazo en color 10, luz (15) arriba y a la izquierda, sombra (12) abajo y a
// la derecha, y la mitad inferior más gruesa.
function makeGlyph(segments) {
  const mask = new Uint8Array(24 * 24);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const px = x + 0.5, py = y + 0.5;
      for (const [x1, y1, x2, y2] of segments) {
        const dx = x2 - x1, dy = y2 - y1;
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
        const half = py < 12 ? 1.6 : 2.6;
        if (Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)) <= half) mask[y * 24 + x] = 1;
      }
    }
  const on = (x, y) => x >= 0 && x < 24 && y >= 0 && y < 24 && mask[y * 24 + x] === 1;
  const glyph = new Uint8Array(288);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      let c = 0;
      if (on(x, y)) c = 10;
      else if (on(x + 1, y) || on(x, y + 1)) c = 15;
      else if (on(x - 1, y) || on(x, y - 1)) c = 12;
      glyph[y * 12 + (x >> 1)] |= x & 1 ? c : c << 4;
    }
  return glyph;
}

const EXTRA_GLYPHS = {
  '>': makeGlyph([[5, 3, 16, 12], [16, 12, 5, 20]]),
  '<': makeGlyph([[16, 3, 5, 12], [5, 12, 16, 20]]),
  '[': makeGlyph([[7, 2, 7, 20], [7, 2, 15, 2], [7, 20, 15, 20]]),
  ']': makeGlyph([[13, 2, 13, 20], [5, 2, 13, 2], [5, 20, 13, 20]]),
};

/** Escribe un carácter de 12x12 lógicos con el color c (1, 2 o 3). */
export function vgawrite(x, y, ch, c) {
  if (typeof ch === 'string') ch = ch.charCodeAt(0);
  ch -= 32;
  if (ch < 0 || ch >= 0x5f) return;
  const glyph = EXTRA_GLYPHS[String.fromCharCode(ch + 32)] ?? FONT[ch];
  for (let yi = 0; yi < 24; yi++) {
    const row = (y * 2 + yi) * WIDTH + x * 2;
    for (let xi = 0; xi < 24; xi++) {
      let color = 0;
      if (glyph) {
        const b = glyph[yi * 12 + (xi >> 1)];
        color = xi & 1 ? b & 0x0f : b >> 4;
        if (color === 10) {
          if (c === 2) color = 12;
          else if (c === 3) color = 14;
        } else if (color === 12) {
          if (c === 1) color = 2;
          else if (c === 2) color = 4;
          else if (c === 3) color = 6;
        }
      }
      const d = row + xi;
      if (d >= 0 && d < SIZE) fb[d] = color;
    }
  }
  dirty = true;
}

export function vgatitle() {
  for (let i = 0; i < SIZE / 2; i++) {
    const b = TITLE[i];
    fb[i * 2] = b >> 4;
    fb[i * 2 + 1] = b & 15;
  }
  dirty = true;
}
