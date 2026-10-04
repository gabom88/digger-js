// Reloj de cuadros. main.js llama a tick() en cada requestAnimationFrame y el
// motor espera con `await nextFrame()`. Así el bucle del juego original, que
// era bloqueante, puede seguir escrito como un bucle.

let waiters = [];

/** Marca de tiempo (ms) del último cuadro de pantalla. */
export let now = 0;
/** Intervalo medio entre cuadros de pantalla (ms); varía con pantallas de refresco variable. */
export let displayInterval = 1000 / 60;

let last = 0;

export function nextFrame() {
  return new Promise((resolve) => waiters.push(resolve));
}

export function tick(ts) {
  if (last) {
    const dt = ts - last;
    if (dt > 0 && dt < 100) displayInterval += (dt - displayInterval) * 0.1;
  }
  last = ts;
  now = ts;
  const w = waiters;
  waiters = [];
  for (const r of w) r(ts);
}
