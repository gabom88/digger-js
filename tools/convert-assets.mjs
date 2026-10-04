// Convierte los gráficos del código fuente C original (vgagrafx.c, alpha.c y
// vtitle.bmp) a un módulo JavaScript, y genera los iconos PNG de la PWA.
//
// Uso:  node tools/convert-assets.mjs
//
// Digger Remastered - Copyright (c) Andrew Jenner 1998-2004 (GPL v2)

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => fs.readFileSync(path.join(root, f), 'latin1');

// --- Lectura de arreglos de bytes en C -------------------------------------

function parseArrays(text) {
  const arrays = {};
  const re = /(?:HUint3|Uint3)\s+(?:near\s+)?(\w+)\[\]\s*=\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const nums = m[2].split(',').map((s) => s.trim()).filter(Boolean)
      .map((s) => parseInt(s, s.startsWith('0x') ? 16 : 10));
    arrays[m[1]] = Uint8Array.from(nums);
  }
  return arrays;
}

const vga = parseArrays(src('vgagrafx.c'));
const alpha = parseArrays(src('alpha.c'));

// vgatable: pares (datos, máscara) indexados por número de sprite
const vt = src('vgagrafx.c').match(/HUint3 \*vgatable\[\]=\{([^}]*)\}/)[1]
  .replace(/\/\*.*?\*\//g, '').split(',').map((s) => s.trim()).filter(Boolean);
if (vt.length % 2) throw new Error('vgatable impar');

const names = [];
const nameIndex = {};
const useName = (n) => {
  if (!(n in vga)) throw new Error('Falta arreglo ' + n);
  if (!(n in nameIndex)) { nameIndex[n] = names.length; names.push(n); }
  return nameIndex[n];
};
const table = [];
for (let i = 0; i < vt.length; i += 2) table.push([useName(vt[i]), useName(vt[i + 1])]);

// Fuente: ascii2vga[0x5f]
const fontNames = src('alpha.c').match(/Uint3 near \*ascii2vga\[0x5f\]=\{([^}]*)\}/)[1]
  .replace(/\/\*.*?\*\//g, '').split(',').map((s) => s.trim()).filter(Boolean);
const font = fontNames.map((n) => (n === '0' ? null : Buffer.from(alpha[n]).toString('base64')));

// --- Pantalla de título (BMP 640x400, 4 bits, RLE4) --------------------------

function decodeRle4Bmp(buf) {
  const off = buf.readUInt32LE(10);
  const w = buf.readInt32LE(18);
  const h = buf.readInt32LE(22);
  const comp = buf.readUInt32LE(30);
  if (comp !== 2) throw new Error('Se esperaba RLE4');
  const px = new Uint8Array(w * h);
  let x = 0, y = h - 1, p = off;
  const put = (c) => { if (x < w && y >= 0) px[y * w + x] = c; x++; };
  for (;;) {
    const n = buf[p++], b = buf[p++];
    if (n > 0) {
      for (let i = 0; i < n; i++) put(i & 1 ? b & 15 : b >> 4);
    } else if (b === 0) { x = 0; y--; }
    else if (b === 1) break;
    else if (b === 2) { x += buf[p++]; y -= buf[p++]; }
    else {
      const bytes = (b + 1) >> 1;
      for (let i = 0; i < b; i++) { const v = buf[p + (i >> 1)]; put(i & 1 ? v & 15 : v >> 4); }
      p += bytes + (bytes & 1);
    }
  }
  return { w, h, px };
}

const title = decodeRle4Bmp(fs.readFileSync(path.join(root, 'vtitle.bmp')));
const packed = new Uint8Array(title.px.length >> 1);
for (let i = 0; i < packed.length; i++) packed[i] = (title.px[i * 2] << 4) | title.px[i * 2 + 1];

// --- Salida JS -------------------------------------------------------------

const out = `// Generado por tools/convert-assets.mjs a partir de vgagrafx.c, alpha.c y vtitle.bmp.
// No editar a mano.
// Digger Remastered - Copyright (c) Andrew Jenner 1998-2004 (GPL v2)
// Portions Copyright (c) 1983 Windmill Software Inc.

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Arreglos de bytes de los sprites VGA (4 planos + máscara), en el formato original. */
export const GFX = [
${names.map((n) => `  b64('${Buffer.from(vga[n]).toString('base64')}'), // ${n}`).join('\n')}
];

/** vgatable[]: [índice de datos, índice de máscara] por número de sprite. */
export const VGATABLE = ${JSON.stringify(table)};

/** ascii2vga[]: glifos de 24x24 px a 4 bits por píxel, desde el carácter 32. */
export const FONT = [
${font.map((f) => (f ? `  b64('${f}')` : '  null')).join(',\n')}
];

/** Pantalla de título 640x400, 4 bits por píxel empaquetados. */
export const TITLE = b64('${Buffer.from(packed).toString('base64')}');
`;
fs.writeFileSync(path.join(root, 'web/js/gfxdata.js'), out);
console.log(`gfxdata.js: ${names.length} arreglos, ${table.length} sprites, ${(out.length / 1024).toFixed(0)} KB`);

// --- Iconos PNG ------------------------------------------------------------

const PAL = [[0,0,0],[0,0,128],[0,128,0],[0,128,128],[128,0,0],[128,0,128],[128,64,0],[128,128,128],
  [64,64,64],[0,0,255],[0,255,0],[0,255,255],[255,0,0],[255,0,255],[255,255,0],[255,255,255]];

// Igual que vgaputim(): w en bytes (8 px), h en filas lógicas (2 px)
function spritePixels(ch, w, h) {
  const [di, mi] = table[ch];
  const data = vga[names[di]], mask = vga[names[mi]];
  const W = w * 8, H = h * 2, out = new Int16Array(W * H).fill(-1);
  const plane = w * h * 2;
  for (let y = 0; y < H; y++)
    for (let xb = 0; xb < w; xb++) {
      const o = y * w + xb;
      for (let i = 0; i < 8; i++) {
        if (mask[o] & (0x80 >> i)) continue;
        let c = 0;
        for (let pl = 0; pl < 4; pl++) c |= ((data[o + pl * plane] << i) & 0x80) >> (4 + pl);
        out[y * W + xb * 8 + i] = c;
      }
    }
  return { W, H, px: out };
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function makeIcon(size, fill) {
  // Excavador mirando a la derecha (sprite 1) sobre fondo de tierra (sprite 93)
  const dig = spritePixels(1, 4, 15);
  const back = spritePixels(93, 5, 4);
  const rgba = Buffer.alloc(size * size * 4);
  const scale = Math.floor((size * fill) / dig.W);
  const ox = Math.floor((size - dig.W * scale) / 2), oy = Math.floor((size - dig.H * scale) / 2);
  const bscale = Math.max(1, Math.round(size / 160));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let c = back.px[(Math.floor(y / bscale) % back.H) * back.W + (Math.floor(x / bscale) % back.W)];
      const sx = Math.floor((x - ox) / scale), sy = Math.floor((y - oy) / scale);
      if (sx >= 0 && sy >= 0 && sx < dig.W && sy < dig.H) {
        const d = dig.px[sy * dig.W + sx];
        // halo negro alrededor del excavador: el túnel
        c = d >= 0 ? d : 0;
      }
      const [r, g, b] = PAL[Math.max(0, c)];
      rgba.set([r, g, b, 255], (y * size + x) * 4);
    }
  return png(size, rgba);
}

const icons = { 'icon-192.png': [192, 0.8], 'icon-512.png': [512, 0.8],
  'icon-maskable-512.png': [512, 0.6], 'apple-touch-icon.png': [180, 0.8], 'favicon-32.png': [32, 0.95] };
for (const [file, [size, fill]] of Object.entries(icons)) {
  fs.writeFileSync(path.join(root, 'web/icons', file), makeIcon(size, fill));
}
console.log('Iconos generados en web/icons/');
