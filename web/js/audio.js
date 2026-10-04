// Salida de audio: reemplaza win_snd.c / el driver de Sound Blaster.
// El emulador del altavoz (engine.generateSamples) siempre avanza, aunque no
// haya audio disponible, porque también marca el ritmo de la música y del
// jingle de fin de nivel. Sin audio, las muestras se generan y se descartan.

let ctx = null;
let node = null;
let gain = null;
let running = false;
let sent = 0;
let played = 0;
let virtualTime = null;
let volume = 0.8;
let source = null;
/** true si se usa ScriptProcessorNode, que genera las muestras él mismo. */
let direct = false;

export let sampleRate = 44100;

const TARGET_SECONDS = 0.07;
const MAX_CHUNK_SECONDS = 0.25;

/** fn(Float32Array) rellena el búfer con muestras. */
export function setSource(fn) {
  source = fn;
}

export function setVolume(v) {
  volume = v;
  if (gain) gain.gain.value = v;
}

/** Debe llamarse dentro de un gesto del usuario (requisito de iOS/Safari). */
export async function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC({ latencyHint: 'interactive' });
      sampleRate = ctx.sampleRate;
      // Truco de iOS: reproducir un búfer vacío dentro del gesto desbloquea la salida
      const silent = ctx.createBufferSource();
      silent.buffer = ctx.createBuffer(1, 1, sampleRate);
      silent.connect(ctx.destination);
      silent.start(0);
      const resumed = ctx.resume().catch(() => {});
      await resumed;
      if (ctx.audioWorklet) {
        const url = new URL('./audio-worklet.js', import.meta.url);
        await ctx.audioWorklet.addModule(url);
        node = new AudioWorkletNode(ctx, 'digger-pcm', { numberOfInputs: 0, outputChannelCount: [1] });
        node.port.onmessage = (e) => { played = e.data; };
      } else {
        // Sin AudioWorklet (páginas http:// que no son localhost, navegadores
        // antiguos): ScriptProcessorNode pide las muestras directamente.
        direct = true;
        node = ctx.createScriptProcessor(2048, 0, 1);
        node.onaudioprocess = (e) => source?.(e.outputBuffer.getChannelData(0));
      }
      gain = ctx.createGain();
      gain.gain.value = volume;
      node.connect(gain).connect(ctx.destination);
      ctx.onstatechange = () => updateRunning();
    }
    if (ctx.state !== 'running') await ctx.resume();
  } catch (err) {
    console.warn('Audio no disponible:', err);
  }
  updateRunning();
  return running;
}

function updateRunning() {
  const now = !!(ctx && node && ctx.state === 'running');
  if (now !== running) {
    running = now;
    sent = played = 0;
    if (node && !direct) node.port.postMessage('clear');
    virtualTime = null;
  }
}

export function isRunning() {
  return running;
}

/** Genera las muestras que falten. Se llama en cada cuadro y con un temporizador. */
export function pump(nowMs = performance.now()) {
  if (!source || (running && direct)) return;
  let need;
  if (running) {
    need = Math.round(TARGET_SECONDS * sampleRate) - (sent - played);
  } else {
    if (virtualTime === null) virtualTime = nowMs;
    need = Math.round(((nowMs - virtualTime) * sampleRate) / 1000);
    if (need <= 0) return;
    virtualTime += (need * 1000) / sampleRate;
  }
  need = Math.min(need, Math.round(MAX_CHUNK_SECONDS * sampleRate));
  if (need <= 0) return;
  const buf = new Float32Array(need);
  source(buf);
  if (running) {
    node.port.postMessage(buf, [buf.buffer]);
    sent += need;
  }
}

/** Reanuda el contexto si iOS lo suspendió (llamada, Siri, cambio de app...). */
export function resumeIfNeeded() {
  if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') {
    ctx.resume().catch(() => {}).finally(updateRunning);
  }
}

export function suspend() {
  if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}).finally(updateRunning);
}
