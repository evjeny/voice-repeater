// AudioWorklet processor: unbounded delay line.
// Mic samples go into a FIFO of chunks; output lags input by `delay` seconds.
class DelayProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const initial = options?.processorOptions?.delay ?? 10;
    this.delaySamples = Math.round(Math.max(0, initial) * sampleRate);
    this.chunks = [];      // queue of Float32Array
    this.head = 0;         // index of first live chunk
    this.offset = 0;       // read offset inside head chunk
    this.buffered = 0;     // total unread samples
    this.port.onmessage = (e) => {
      if (typeof e.data?.delay === 'number' && e.data.delay >= 0) {
        this.delaySamples = Math.round(e.data.delay * sampleRate);
      }
    };
  }

  push(chunk) {
    this.chunks.push(chunk);
    this.buffered += chunk.length;
  }

  // Remove n oldest samples; copy into out[outStart..] if out is given.
  pop(n, out, outStart) {
    let pos = outStart;
    while (n > 0) {
      const c = this.chunks[this.head];
      const take = Math.min(n, c.length - this.offset);
      if (out) out.set(c.subarray(this.offset, this.offset + take), pos);
      pos += take;
      n -= take;
      this.offset += take;
      this.buffered -= take;
      if (this.offset >= c.length) {
        this.chunks[this.head] = undefined;
        this.head++;
        this.offset = 0;
      }
    }
    // Compact the queue array occasionally.
    if (this.head > 1024) {
      this.chunks = this.chunks.slice(this.head);
      this.head = 0;
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const out = outputs[0][0];
    const frames = out.length;

    // Mono mixdown of input (silence if no input this quantum, so timing stays consistent).
    const chunk = new Float32Array(frames);
    if (input && input.length) {
      const ch = input.length;
      for (let c = 0; c < ch; c++) {
        const data = input[c];
        for (let i = 0; i < frames; i++) chunk[i] += data[i];
      }
      if (ch > 1) for (let i = 0; i < frames; i++) chunk[i] /= ch;
    }
    this.push(chunk);

    // excess = samples older than the delay point.
    const excess = this.buffered - this.delaySamples;
    if (excess > frames) this.pop(excess - frames, null, 0); // delay was decreased: drop oldest
    const n = Math.min(frames, Math.max(0, excess));
    out.fill(0, 0, frames - n);
    if (n > 0) this.pop(n, out, frames - n);

    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}

registerProcessor('delay-processor', DelayProcessor);
