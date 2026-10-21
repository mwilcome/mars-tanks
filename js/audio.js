/** Small synthesized effects. Nothing loads from the network. */

export function createAudio() {
  let ctx = null;
  let muted = false;
  let engine = null;
  let engineGain = null;
  try {
    muted = localStorage.getItem("mars-tanks-mute") === "1";
  } catch {
    muted = false;
  }

  function ac() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function envGain(audio, value, dur) {
    const g = audio.createGain();
    g.gain.setValueAtTime(value, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    g.connect(audio.destination);
    return g;
  }

  function tone(freq, dur, type, value) {
    const audio = ac();
    if (!audio || muted) return;
    const o = audio.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.45), audio.currentTime + dur);
    o.connect(envGain(audio, value, dur));
    o.start();
    o.stop(audio.currentTime + dur + 0.02);
  }

  function noise(dur, value, freq) {
    const audio = ac();
    if (!audio || muted) return;
    const n = Math.max(1, Math.floor(audio.sampleRate * dur));
    const buf = audio.createBuffer(1, n, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = audio.createBufferSource();
    src.buffer = buf;
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq;
    const g = envGain(audio, value, dur);
    src.connect(filter);
    filter.connect(g);
    src.start();
  }

  function ensureEngine() {
    const audio = ac();
    if (!audio || engine) return audio;
    engineGain = audio.createGain();
    engineGain.gain.value = 0;
    engineGain.connect(audio.destination);
    engine = audio.createOscillator();
    engine.type = "sawtooth";
    engine.frequency.value = 46;
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 180;
    engine.connect(filter);
    filter.connect(engineGain);
    engine.start();
    return audio;
  }

  return {
    get muted() {
      return muted;
    },
    unlock() {
      ac();
    },
    toggle() {
      muted = !muted;
      try {
        localStorage.setItem("mars-tanks-mute", muted ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (muted && engineGain) engineGain.gain.value = 0;
      return muted;
    },
    engine(on) {
      if (muted) {
        if (engineGain) engineGain.gain.value = 0;
        return;
      }
      if (!on && !engineGain) return;
      const audio = ensureEngine();
      if (!audio || !engineGain) return;
      const target = on ? 0.018 : 0;
      engineGain.gain.cancelScheduledValues(audio.currentTime);
      engineGain.gain.linearRampToValueAtTime(target, audio.currentTime + 0.08);
    },
    play(name) {
      if (muted) return;
      if (name === "blip") tone(640, 0.06, "square", 0.03);
      else if (name === "denied") tone(140, 0.12, "square", 0.04);
      else if (name === "fire") {
        noise(0.18, 0.12, 1800);
        tone(220, 0.22, "sawtooth", 0.05);
      } else if (name === "boom") {
        noise(0.45, 0.16, 600);
        tone(90, 0.4, "sine", 0.08);
      } else if (name === "hit") tone(180, 0.14, "triangle", 0.05);
    },
  };
}
