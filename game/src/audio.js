// Every sound in Coral Bay is synthesized with WebAudio — no audio files. A tiny engine
// hum follows the player's car, sirens wail from a pair of detuned oscillators, and the
// one-shot effects (gunshot, punch, pickup, crash) are shaped noise and blips. M toggles mute.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let ambientTimer = 0;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type = 'square', vol = 0.2, slideTo = null) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, type = 'lowpass') {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  return {
    /** Start the ambient pad (call once, after the first user gesture). */
    startAmbient() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
    },
    /** Engine hum: rpm 0..1 while the player drives, null to stop. */
    engine(rpm) {
      if (!ensure()) return;
      if (rpm === null) {
        if (engineOsc) { engineOsc.stop(); engineOsc = null; engineGain = null; }
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineGain = ctx.createGain();
        engineOsc.type = 'sawtooth';
        engineGain.gain.value = 0.05;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 420;
        engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.value = 55 + rpm * 130;
    },
    /** Police siren: on/off, volume by distance 0..1. */
    siren(on, level = 0.4) {
      if (!ensure()) return;
      if (!on) {
        if (sirenOsc) { sirenOsc.stop(); sirenLfo.stop(); sirenOsc = null; }
        return;
      }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenGain = ctx.createGain();
        sirenLfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        sirenOsc.type = 'triangle';
        sirenOsc.frequency.value = 800;
        sirenLfo.frequency.value = 0.65;
        lfoGain.gain.value = 180;
        sirenLfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
        sirenGain.gain.value = 0.03;
        sirenOsc.connect(sirenGain); sirenGain.connect(master);
        sirenOsc.start(); sirenLfo.start();
      }
      if (sirenGain) sirenGain.gain.value = 0.012 + level * 0.05;
    },
    gunshot() { noise(0.16, 0.5, 2600, 'highpass'); blip(160, 0.1, 'square', 0.25, 40); },
    punch() { noise(0.08, 0.35, 500); },
    crash(big = false) { noise(big ? 0.4 : 0.2, big ? 0.55 : 0.3, 300); },
    pickup() { blip(660, 0.09, 'sine', 0.25); setTimeout(() => blip(990, 0.14, 'sine', 0.25), 70); },
    cash() { blip(880, 0.08, 'triangle', 0.22); setTimeout(() => blip(1320, 0.12, 'triangle', 0.22), 60); },
    busted() { blip(220, 0.5, 'sawtooth', 0.3, 55); },
    wasted() { blip(330, 0.9, 'sine', 0.3, 40); },
    door() { blip(140, 0.07, 'square', 0.15, 90); },
    /** A soft synth pad chord every few seconds, the sound of the bay at noon. */
    update(dt) {
      if (!ctx || muted) return;
      ambientTimer -= dt;
      if (ambientTimer <= 0) {
        ambientTimer = 6 + Math.random() * 5;
        blip(196, 2.8, 'sine', 0.035);
        blip(294, 2.8, 'sine', 0.028);
      }
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
  };
}
