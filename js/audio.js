'use strict';

// All sound is synthesized with the Web Audio API - no audio files needed.
const Sound = (() => {
  let ctx = null, master, sfxBus, musicBus, noiseBuf;
  const settings = { sfx: Store.get('lf_sfx', true), music: Store.get('lf_music', true) };
  const last = {};
  const SFX_VOL = 0.55, MUSIC_VOL = 0.3;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = 0.9;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = settings.sfx ? SFX_VOL : 0; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = settings.music ? MUSIC_VOL : 0; musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    Music.start();
  }

  function throttle(key, ms) {
    const now = performance.now();
    if (last[key] && now - last[key] < ms) return false;
    last[key] = now;
    return true;
  }

  function tone(o) {
    if (!ctx) return;
    const t0 = o.at !== undefined ? o.at : ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
    const vol = o.vol === undefined ? 0.2 : o.vol;
    const a = o.attack === undefined ? 0.004 : o.attack;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter; f.frequency.value = o.ff || 2000; f.Q.value = o.q || 1;
      osc.connect(f); node = f;
    }
    node.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t0); osc.stop(t0 + o.dur + 0.03);
  }

  function noise(o) {
    if (!ctx) return;
    const t0 = o.at !== undefined ? o.at : ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
    f.Q.value = o.q || 1;
    const g = ctx.createGain();
    const vol = o.vol === undefined ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + o.dur + 0.03);
  }

  const midi = m => 440 * Math.pow(2, (m - 69) / 12);

  const sfx = {
    shoot(w) {
      if (!ctx || !throttle('shoot', 55)) return;
      if (w === 'harpoon') {
        noise({ dur: 0.07, vol: 0.06, filter: 'bandpass', f: 1400, f2: 500, q: 1.5 });
        tone({ type: 'triangle', f: 300, f2: 120, dur: 0.08, vol: 0.05 });
      } else if (w === 'sonar') {
        tone({ type: 'sine', f: 1500, f2: 900, dur: 0.12, vol: 0.045 });
      } else {
        tone({ type: 'sine', f: rand(380, 520), f2: 900, dur: 0.05, vol: 0.04 });
      }
    },
    hit() {
      if (!ctx || !throttle('hit', 45)) return;
      tone({ type: 'triangle', f: rand(420, 560), f2: 200, dur: 0.05, vol: 0.05 });
    },
    // a wet little "blorp", pitched per creature
    pop(kind) {
      if (!ctx || !throttle('pop', 55)) return;
      const base = { jelly: 520, jellyB: 600, angler: 300, urchin: 220 }[kind] || 400;
      const p = rand(0.9, 1.15);
      tone({ type: 'sine', f: base * p, f2: base * 2.6 * p, dur: 0.09, vol: 0.12 });
      tone({ type: 'sine', f: base * 1.5 * p, f2: base * 0.6 * p, dur: 0.12, vol: 0.06, delay: 0.05 });
      noise({ dur: 0.1, vol: 0.05, filter: 'lowpass', f: 900, f2: 200 });
    },
    crunch(size = 1) {
      if (!ctx || !throttle('crunch', 50)) return;
      const s = Math.min(1.6, size);
      noise({ dur: 0.2 + 0.3 * s, vol: 0.2 * s, filter: 'lowpass', f: 1400, f2: 90 });
      tone({ type: 'sine', f: 110, f2: 35, dur: 0.25 * s + 0.1, vol: 0.2 * s });
    },
    clink() {
      if (!ctx || !throttle('clink', 90)) return;
      tone({ type: 'triangle', f: 1900, f2: 1500, dur: 0.06, vol: 0.03 });
    },
    sever() {
      if (!ctx) return;
      noise({ dur: 0.5, vol: 0.2, filter: 'bandpass', f: 700, f2: 150, q: 0.8 });
      tone({ type: 'sawtooth', f: 160, f2: 60, dur: 0.45, vol: 0.1, filter: 'lowpass', ff: 700 });
    },
    whoosh() {
      if (!ctx) return;
      noise({ dur: 0.6, vol: 0.12, filter: 'bandpass', f: 300, f2: 1200, q: 1.2, attack: 0.15 });
    },
    squirt() {
      if (!ctx) return;
      noise({ dur: 0.7, vol: 0.18, filter: 'lowpass', f: 600, f2: 120, attack: 0.02 });
    },
    pearl(big) {
      if (!ctx || !throttle('pearl', 35)) return;
      tone({ type: 'sine', f: big ? 1320 : rand(1500, 1700), f2: big ? 2640 : 2100, dur: 0.08, vol: 0.05 });
      if (big) tone({ type: 'sine', f: 1760, dur: 0.12, vol: 0.04, delay: 0.06 });
    },
    gulp() {
      if (!ctx) return;
      [0, 0.07, 0.14].forEach((d, i) => tone({ type: 'sine', f: 300 + i * 120, f2: 700 + i * 200, dur: 0.07, vol: 0.09, delay: d }));
    },
    lowAir() {
      if (!ctx) return;
      tone({ type: 'square', f: 880, dur: 0.07, vol: 0.035, filter: 'lowpass', ff: 2000 });
      tone({ type: 'square', f: 660, dur: 0.07, vol: 0.035, filter: 'lowpass', ff: 2000, delay: 0.1 });
    },
    oneUp() {
      if (!ctx) return;
      [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.12, vol: 0.07, delay: i * 0.07 }));
    },
    playerDie() {
      if (!ctx) return;
      noise({ dur: 1.0, vol: 0.3, filter: 'lowpass', f: 1800, f2: 60 });
      tone({ type: 'sawtooth', f: 400, f2: 40, dur: 0.9, vol: 0.1, filter: 'lowpass', ff: 900 });
      for (let i = 0; i < 6; i++) tone({ type: 'sine', f: rand(300, 700), f2: rand(900, 1400), dur: 0.06, vol: 0.05, delay: 0.1 + i * 0.07 });
    },
    buoyLaunch() {
      if (!ctx) return;
      noise({ dur: 0.5, vol: 0.12, filter: 'bandpass', f: 400, f2: 1800, q: 1.4, attack: 0.05 });
    },
    // the big one: a sonar ping that rings through the water
    sonarBlast() {
      if (!ctx) return;
      tone({ type: 'sine', f: 1200, dur: 1.4, vol: 0.18, attack: 0.005 });
      tone({ type: 'sine', f: 1205, dur: 1.4, vol: 0.12, delay: 0.02 });
      noise({ dur: 1.2, vol: 0.35, filter: 'lowpass', f: 1200, f2: 40 });
      tone({ type: 'sine', f: 80, f2: 25, dur: 1.1, vol: 0.45 });
    },
    bossHit() {
      if (!ctx || !throttle('bossHit', 70)) return;
      tone({ type: 'triangle', f: 180, f2: 120, dur: 0.06, vol: 0.05 });
    },
    bossGroan() {
      if (!ctx) return;
      tone({ type: 'sawtooth', f: 70, f2: 48, dur: 1.4, vol: 0.14, filter: 'lowpass', ff: 400, attack: 0.2 });
      tone({ type: 'sawtooth', f: 105, f2: 70, dur: 1.2, vol: 0.08, filter: 'lowpass', ff: 500, attack: 0.3, delay: 0.2 });
    },
    waveStart() {
      if (!ctx) return;
      tone({ type: 'sine', f: 1400, dur: 0.5, vol: 0.07 });
      tone({ type: 'sine', f: 1400, dur: 0.4, vol: 0.03, delay: 0.35 });
    },
    waveClear() {
      if (!ctx) return;
      [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.2, vol: 0.08, delay: i * 0.08 }));
    },
    dock() {
      if (!ctx) return;
      noise({ dur: 0.4, vol: 0.08, filter: 'bandpass', f: 500, q: 2 });
      tone({ type: 'triangle', f: 196, dur: 0.25, vol: 0.12, delay: 0.1 });
      tone({ type: 'triangle', f: 147, dur: 0.35, vol: 0.12, delay: 0.3 });
    },
    buy() {
      if (!ctx) return;
      [1047, 1319, 1568].forEach((f, i) => tone({ type: 'square', f, dur: 0.08, vol: 0.04, delay: i * 0.05, filter: 'lowpass', ff: 3500 }));
    },
    deny() {
      if (!ctx) return;
      tone({ type: 'square', f: 180, dur: 0.14, vol: 0.05, filter: 'lowpass', ff: 900 });
    },
    click() {
      if (!ctx) return;
      tone({ type: 'sine', f: 720, f2: 900, dur: 0.05, vol: 0.05 });
    },
  };

  // Small step sequencer with look-ahead scheduling.
  const SONGS = {
    normal: { tempo: 124, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] },
    boss: { tempo: 146, chords: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]] },
  };
  const BASS_STEPS = new Set([0, 3, 6, 8, 10, 11, 14]);

  const Music = {
    playing: false, mode: 'normal', step: 0, nextTime: 0, timer: null,
    start() {
      if (!ctx || this.playing) return;
      this.playing = true; this.step = 0;
      this.nextTime = ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.tick(), 25);
    },
    setMode(m) { this.mode = m; },
    tick() {
      if (ctx.state !== 'running') return;
      const song = SONGS[this.mode];
      const spb = 60 / song.tempo / 4;
      if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
      while (this.nextTime < ctx.currentTime + 0.12) {
        this.play(song, this.step, this.nextTime, spb);
        this.nextTime += spb;
        this.step = (this.step + 1) % 64;
      }
    },
    play(song, s, t, spb) {
      const bar = s >> 4, i = s & 15;
      const ch = song.chords[bar];
      const boss = this.mode === 'boss';
      if (i % 4 === 0) tone({ at: t, type: 'sine', f: 150, f2: 45, dur: 0.18, vol: 0.5, bus: musicBus });
      if (i === 4 || i === 12) noise({ at: t, dur: 0.12, vol: 0.18, filter: 'bandpass', f: 1800, bus: musicBus });
      if (i % 2 === 1) noise({ at: t, dur: 0.03, vol: 0.08, filter: 'highpass', f: 7000, bus: musicBus });
      if (BASS_STEPS.has(i)) {
        tone({ at: t, type: 'sawtooth', f: midi(ch[0] - 24), dur: spb * 1.6, vol: 0.2, filter: 'lowpass', ff: 520, bus: musicBus });
      }
      const note = ch[i % 3] + 12 * ((i >> 2) % 2) + (boss ? 12 : 0);
      tone({ at: t, type: 'triangle', f: midi(note), dur: spb * 0.9, vol: 0.06, filter: 'lowpass', ff: 1300, bus: musicBus });
    },
  };

  function setSfx(on) {
    settings.sfx = on; Store.set('lf_sfx', on);
    if (sfxBus) sfxBus.gain.setTargetAtTime(on ? SFX_VOL : 0, ctx.currentTime, 0.02);
  }
  function setMusic(on) {
    settings.music = on; Store.set('lf_music', on);
    if (musicBus) musicBus.gain.setTargetAtTime(on ? MUSIC_VOL : 0, ctx.currentTime, 0.05);
  }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  return { init, sfx, Music, settings, setSfx, setMusic, suspend, resume };
})();
