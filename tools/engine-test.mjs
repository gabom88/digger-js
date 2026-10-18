// Ejecuta el motor real en Node, sin navegador, para probar cambios y sacar
// capturas. Los cuadros avanzan a mano (frames.tick) y el audio se genera a
// mano (generateSamples), porque soundlevdone() espera a que acabe la melodía.
//
//   node tools/engine-test.mjs              prueba rápida (título → VERSUS)
//   node tools/engine-test.mjs --shots dir  además guarda capturas PNG en dir
//
// Para escribir otra prueba, importa { start } y usa los ayudantes que
// devuelve: run(n) avanza n cuadros, hold([acciones], n) mantiene acciones
// pulsadas (0-4 J1: der, arr, izq, abajo, disparo; 5-9 J2), key(a) envía una
// pulsación virtual (como el tacto: 4 continúa/confirma, 18 = Esc/N) y
// shot(nombre) guarda el framebuffer como PNG.

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.window ??= { addEventListener() {}, innerWidth: 800, innerHeight: 500 };
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'js');
const load = (f) => import(pathToFileURL(path.join(JS, f)).href);

const e = await load('engine.js');
const video = await load('video.js');
const frames = await load('frames.js');
const controls = await load('controls.js');
const touch = await load('touch.js');

controls.init({ keys: {} }, { onPress: e.onPress });
e.initsound(44100);

// Paleta 0 sin intensidad (la del juego normal), igual que en video.js
const PAL = [[0,0,0],[0,0,128],[0,128,0],[0,128,128],[128,0,0],[128,0,128],[128,64,0],[128,128,128],
  [64,64,64],[0,0,255],[0,255,0],[0,255,255],[255,0,0],[255,0,255],[255,255,0],[255,255,255]];

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => {
  let x = 0xffffffff;
  for (const v of b) x = CRC[(x ^ v) & 255] ^ (x >>> 8);
  return (x ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

/** Arranca mainprog() con las opciones dadas y devuelve los ayudantes. */
export function start(opts = {}, shotsDir = null) {
  const samples = new Float32Array(3100);
  let t = 0;
  const run = async (n = 1) => {
    for (let i = 0; i < n; i++) {
      t += 70; // algo más que un cuadro del juego (ftime 80000 ≈ 67 ms)
      frames.tick(t);
      e.generateSamples(samples);
      await new Promise((r) => setImmediate(r));
    }
  };
  const hold = async (actions, n) => {
    touch.held.fill(0);
    for (const a of actions) {
      touch.held[a] = 1;
      e.onPress(a);
    }
    await run(n);
    touch.held.fill(0);
  };
  const key = async (action, n = 3) => {
    controls.pushVirtualKey(action);
    await run(n);
  };
  const shot = (name) => {
    if (!shotsDir) return;
    fs.mkdirSync(shotsDir, { recursive: true });
    const W = video.WIDTH, H = video.HEIGHT;
    const raw = Buffer.alloc((W * 3 + 1) * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const o = y * (W * 3 + 1) + 1 + x * 3;
        const c = PAL[video.fb[y * W + x]];
        raw[o] = c[0];
        raw[o + 1] = c[1];
        raw[o + 2] = c[2];
      }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0);
    ihdr.writeUInt32BE(H, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    fs.writeFileSync(path.join(shotsDir, name + '.png'), Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
    ]));
  };
  e.configure({ mode: '1p', startLevel: 1, speed: 80000, sound: false, music: false, ...opts });
  e.mainprog();
  return { e, touch, run, hold, key, shot };
}

// Prueba rápida al ejecutar el archivo directamente
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--shots');
  const { e, run, hold, key, shot, touch } = start({ mode: 'vs' }, i > 0 ? process.argv[i + 1] : null);
  const check = (name, ok) => {
    console.log((ok ? 'ok   ' : 'FALLA') + ' ' + name);
    if (!ok) process.exitCode = 1;
  };
  await run(20);
  check('título en pantalla', e.isOnTitle());
  shot('titulo');
  await key(4, 1); // desvanecer el letrero
  await run(40);
  await key(4, 3); // continuar
  touch.held[4] = 1; // confirmar ORIGINAL con disparo y dejarlo pulsado
  e.onPress(4);
  await key(4, 1);
  let fired = false;
  for (let k = 0; k < 40; k++) {
    await run(1);
    if (e.debugState().firing) fired = true;
  }
  touch.held[4] = 0;
  const s = e.debugState();
  check('partida VERSUS en marcha', s.inPlay && e.currentMode() === 'vs');
  check('no dispara con la tecla que empezó la partida', !fired);
  await hold([0, 7], 10); // J1 a la derecha, J2 a la izquierda
  check('los diggers se mueven', e.debugState().x !== s.x);
  shot('versus');
  e.suspend();
  const frozen = JSON.stringify(e.debugState());
  await run(50);
  check('el menú congela la partida', JSON.stringify(e.debugState()) === frozen);
  e.resume();
  e.requestQuit();
  await run(10);
  check('terminar partida sale de mainprog', !e.isRunning());
  process.exit();
}
