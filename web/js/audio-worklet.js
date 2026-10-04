// Reproduce las muestras PCM que genera el emulador del altavoz del PC
// (newsnd.c) en el hilo principal. Equivale al búfer circular de la versión DOS.

class DiggerPcm extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.played = 0;
    this.sinceReport = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'clear') {
        this.queue = [];
        this.offset = 0;
        this.played = 0;
      } else {
        this.queue.push(e.data);
      }
    };
  }

  process(inputs, outputs) {
    const out = outputs[0][0];
    let i = 0;
    while (i < out.length && this.queue.length) {
      const buf = this.queue[0];
      const n = Math.min(out.length - i, buf.length - this.offset);
      out.set(buf.subarray(this.offset, this.offset + n), i);
      i += n;
      this.offset += n;
      this.played += n;
      if (this.offset >= buf.length) {
        this.queue.shift();
        this.offset = 0;
      }
    }
    if (i < out.length) out.fill(0, i);
    this.sinceReport += out.length;
    if (this.sinceReport >= 1024) {
      this.sinceReport = 0;
      this.port.postMessage(this.played);
    }
    return true;
  }
}

registerProcessor('digger-pcm', DiggerPcm);
