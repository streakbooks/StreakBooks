/* global AudioWorkletProcessor, registerProcessor, sampleRate */
class WakeCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(Math.round(sampleRate * 0.02));
    this.offset = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel)
      for (const value of channel) {
        this.buffer[this.offset++] = value;
        if (this.offset === this.buffer.length) {
          this.port.postMessage(this.buffer);
          this.offset = 0;
        }
      }
    return true;
  }
}
registerProcessor("streakbooks-wake-capture", WakeCapture);
