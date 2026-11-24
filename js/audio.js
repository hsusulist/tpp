/* =========================================================
   Âm thanh tổng hợp bằng WebAudio (không cần file mp3)
   ========================================================= */
const Sound = (function () {
  let ctx = null, master, music, sfx, noiseBuf;
  let mood = 'none', nextNote = 0, alarmTimer = null, fireNode = null, volume = 0.7;
  const SCALES = {
    calm: [220, 261.63, 293.66, 329.63, 392, 440, 523.25],
    sad: [220, 246.94, 261.63, 329.63, 349.23, 440, 493.88],
    warm: [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33],
    tense: [207.65, 220, 233.08, 311.13, 329.63, 415.3],
  };

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    music = ctx.createGain(); music.gain.value = 0.55; music.connect(master);
    sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // tiếng ù nền của căn nhà
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o1.frequency.value = 55; o2.frequency.value = 55.5; g.gain.value = 0.025;
    o1.connect(g); o2.connect(g); g.connect(master); o1.start(); o2.start();
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    const ng = ctx.createGain(); ng.gain.value = 0.012;
    n.connect(f); f.connect(ng); ng.connect(master); n.start();
  }

  function tone(freq, dur, type, vol, when, dest, attack) {
    if (!ctx) return;
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfx); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function noise(dur, vol, freq, type, when, dest) {
    if (!ctx) return;
    const t = ctx.currentTime + (when || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || sfx); s.start(t); s.stop(t + dur + 0.05);
    return { s, f, g };
  }
  function piano(freq, vol, when) {
    tone(freq, 3.2, 'triangle', vol * 0.5, when, music, 0.01);
    tone(freq * 2, 1.8, 'sine', vol * 0.18, when, music, 0.01);
    tone(freq * 0.5, 3.5, 'sine', vol * 0.2, when, music, 0.02);
  }

  function update() {
    if (!ctx || mood === 'none') return;
    const now = ctx.currentTime;
    if (now < nextNote) return;
    const sc = SCALES[mood] || SCALES.calm;
    const f = sc[Math.floor(Math.random() * sc.length)];
    piano(f, mood === 'tense' ? 0.12 : 0.16, 0);
    if (Math.random() < 0.35) piano(sc[Math.floor(Math.random() * 3)] / 2, 0.12, 0.05);
    const gap = mood === 'tense' ? 0.9 + Math.random() * 1.2 : 1.6 + Math.random() * 2.2;
    nextNote = now + gap;
  }

  const S = {
    pick() { tone(660, 0.12, 'sine', 0.15); tone(990, 0.15, 'sine', 0.08, 0.05); },
    clink() { tone(2200 + Math.random() * 400, 0.25, 'sine', 0.12); tone(3300, 0.15, 'sine', 0.05, 0.03); },
    sweep() { noise(0.5, 0.12, 2500, 'bandpass'); noise(0.4, 0.1, 2000, 'bandpass', 0.35); },
    wipe() { noise(0.6, 0.08, 1200, 'bandpass'); },
    water() { noise(1.2, 0.1, 800, 'lowpass'); for (let i = 0; i < 4; i++) tone(500 + Math.random() * 600, 0.1, 'sine', 0.05, i * 0.2); },
    ding() { tone(1320, 1.6, 'sine', 0.3); tone(1760, 1.2, 'sine', 0.12, 0.01); },
    chime() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 1.2, 'sine', 0.13, i * 0.09)); },
    car() { const o = tone(60, 2.8, 'sawtooth', 0.06, 0, sfx, 0.4); if (o) o.frequency.linearRampToValueAtTime(40, ctx.currentTime + 2.8); noise(2.8, 0.08, 200, 'lowpass'); },
    door() { tone(90, 0.35, 'sine', 0.35); noise(0.25, 0.15, 400, 'lowpass'); },
    thud() { tone(70, 0.5, 'sine', 0.5); noise(0.3, 0.3, 300, 'lowpass'); },
    tick(v) { tone(1800, 0.03, 'square', 0.02 + 0.1 * (v || 0)); },
    step() { noise(0.08, 0.05, 300, 'lowpass'); },
    scribble() { noise(0.15, 0.05, 3000, 'highpass'); },
    heart() { tone(55, 0.25, 'sine', 0.4); tone(50, 0.25, 'sine', 0.3, 0.22); },
    error() { tone(200, 0.2, 'square', 0.06); tone(150, 0.25, 'square', 0.06, 0.12); },
    blip() { tone(880, 0.06, 'square', 0.05); },
    whoosh() { noise(1.2, 0.2, 600, 'bandpass'); },
    paper() { noise(0.3, 0.12, 4000, 'highpass'); },
    alarm(on) {
      if (on && !alarmTimer) alarmTimer = setInterval(() => { tone(3100, 0.18, 'square', 0.07); tone(3100, 0.18, 'square', 0.07, 0.25); }, 700);
      if (!on && alarmTimer) { clearInterval(alarmTimer); alarmTimer = null; }
    },
    fire(on) {
      if (!ctx) return;
      if (on && !fireNode) {
        const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
        const g = ctx.createGain(); g.gain.value = 0.15;
        s.connect(f); f.connect(g); g.connect(sfx); s.start(); fireNode = s;
      }
      if (!on && fireNode) { fireNode.stop(); fireNode = null; }
    },
  };

  return {
    init, update, ...S,
    setMood(m) { mood = m; if (ctx) nextNote = ctx.currentTime + 0.3; },
    setVolume(v) { volume = v; if (master) master.gain.value = v; },
    stopAll() { S.alarm(false); S.fire(false); },
  };
})();
