'use strict';

// All sound is synthesized with the Web Audio API - no audio files needed.
const Sound = (() => {
  let ctx = null, master, sfxBus, musicBus, noiseBuf, water, waterF = 0;
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
    // everything is heard through water: the deeper, the more muffled
    water = ctx.createBiquadFilter();
    water.type = 'lowpass'; water.frequency.value = 5000; water.Q.value = 0.6;
    master.connect(water); water.connect(comp); comp.connect(ctx.destination);
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
      } else if (w === 'bubble') {
        tone({ type: 'sine', f: rand(380, 520), f2: 900, dur: 0.05, vol: 0.04 });
      } else if (w === 'flare') {
        noise({ dur: 0.18, vol: 0.08, filter: 'bandpass', f: 900, f2: 2400, q: 1 });
      } else if (w === 'net') {
        noise({ dur: 0.25, vol: 0.07, filter: 'lowpass', f: 700, f2: 300 });
      } else {
        noise({ dur: 0.09, vol: 0.09, filter: 'highpass', f: 3000 });
        tone({ type: 'square', f: rand(90, 140), dur: 0.08, vol: 0.05, filter: 'lowpass', ff: 1200 });
      }
    },
    flare() {
      if (!ctx || !throttle('flare', 60)) return;
      noise({ dur: 0.35, vol: 0.18, filter: 'lowpass', f: 1800, f2: 200 });
      tone({ type: 'sine', f: 180, f2: 60, dur: 0.3, vol: 0.14 });
    },
    net() {
      if (!ctx || !throttle('net', 80)) return;
      noise({ dur: 0.3, vol: 0.08, filter: 'bandpass', f: 1400, f2: 600, q: 2 });
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
    // steel under pressure: a slow, uneven groan
    creak() {
      if (!ctx) return;
      const f = rand(55, 85);
      tone({ type: 'sawtooth', f, f2: f * rand(1.2, 1.6), dur: rand(0.8, 1.4), vol: 0.07, filter: 'bandpass', ff: 320, q: 6, attack: 0.25 });
      tone({ type: 'sawtooth', f: f * 1.5, f2: f * 1.3, dur: 0.6, vol: 0.04, filter: 'bandpass', ff: 500, q: 8, attack: 0.1, delay: 0.5 });
    },
    // a pencil scratching a new entry into the book
    logged() {
      if (!ctx) return;
      for (let i = 0; i < 5; i++) noise({ dur: rand(0.05, 0.11), vol: 0.06, filter: 'bandpass', f: rand(2500, 4200), q: 3, delay: i * 0.09 + rand(0, 0.03) });
      tone({ type: 'triangle', f: 660, dur: 0.3, vol: 0.05, delay: 0.5 });
      tone({ type: 'triangle', f: 990, dur: 0.4, vol: 0.04, delay: 0.62 });
    },
  };

  // The score is not a loop. It is a handful of layers that listen to the dive:
  //   a drone whose root falls with each zone of water,
  //   a music-box line that plays short motifs and repeats them with small changes, echoing,
  //   the sound of the surface, fading as you go down,
  //   long low glides in the deep water, like something very large far away,
  //   and in a fight, a slow heartbeat that thickens as the water fills up.
  // Modes: 'calm' (title page, supplies), 'normal' (a dive), 'boss'.
  const ZONE_ROOTS = [[0, 38], [800, 36], [2400, 33], [5000, 29], [9000, 26]];
  const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

  const Music = {
    playing: false, mode: 'calm', timer: null,
    root: 38, depth: 0, intensity: 0,
    nextNote: 0, nextBeat: 0, beat: 0, nextGlide: 0,
    motif: [], motifPos: 0, motifRepeats: 0,
    drone: null, surf: null, echo: null,

    start() {
      if (!ctx || this.playing) return;
      this.playing = true;
      const t = ctx.currentTime;

      // an echo, darkened a little on every repeat, like sound travelling through water
      const d = ctx.createDelay(1.5), fb = ctx.createGain(), tone_ = ctx.createBiquadFilter(), wet = ctx.createGain();
      d.delayTime.value = 0.46; fb.gain.value = 0.42;
      tone_.type = 'lowpass'; tone_.frequency.value = 1700;
      wet.gain.value = 0.55;
      d.connect(tone_); tone_.connect(fb); fb.connect(d); tone_.connect(wet); wet.connect(musicBus);
      this.echo = d;

      // the drone: two slightly detuned voices a fifth apart, breathing through a slow filter
      const dg = ctx.createGain(); dg.gain.value = 0;
      const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 380; df.Q.value = 2;
      const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
      lfo.frequency.value = 0.07; lfoG.gain.value = 140;
      lfo.connect(lfoG); lfoG.connect(df.frequency); lfo.start(t);
      const oscs = [];
      for (const [ratio, det, type] of [[1, -4, 'triangle'], [1, 5, 'sine'], [1.5, 2, 'triangle'], [0.5, 0, 'sine']]) {
        const o = ctx.createOscillator();
        o.type = type; o.frequency.value = midi(this.root) * ratio; o.detune.value = det;
        o.connect(df); o.start(t);
        oscs.push([o, ratio]);
      }
      df.connect(dg); dg.connect(musicBus);
      dg.gain.setTargetAtTime(0.09, t, 2.5);
      this.drone = { gain: dg, oscs };

      // the surface: looping noise shaped into slow swells
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 420; sf.Q.value = 0.7;
      const sg = ctx.createGain(); sg.gain.value = 0;
      const swell = ctx.createOscillator(), swellG = ctx.createGain();
      swell.frequency.value = 0.11; swellG.gain.value = 0.025;
      swell.connect(swellG); swellG.connect(sg.gain); swell.start(t);
      src.connect(sf); sf.connect(sg); sg.connect(musicBus); src.start(t);
      this.surf = sg;

      this.nextNote = t + 1.5; this.nextBeat = t + 1; this.nextGlide = t + 8;
      this.timer = setInterval(() => this.tick(), 50);
      this.setDepth(0, true);
    },

    setMode(m) {
      if (m === this.mode) return;
      this.mode = m;
      if (!ctx || !this.drone) return;
      // the boss drone sits a semitone of unease above where it should be
      this.retune(true);
      this.drone.gain.gain.setTargetAtTime(m === 'boss' ? 0.13 : m === 'calm' ? 0.07 : 0.09, ctx.currentTime, 1.2);
      this.motif = [];
    },

    setIntensity(n) { this.intensity = Math.min(1, n / 20); },

    setDepth(d, force) {
      // called every frame; only act when the depth has actually moved
      if (!force && Math.abs(d - this.depth) < 25) return;
      this.depth = d;
      let root = ZONE_ROOTS[0][1];
      for (const [from, r] of ZONE_ROOTS) if (d >= from) root = r;
      if (this.surf) this.surf.gain.setTargetAtTime(0.035 * Math.max(0, 1 - d / 1800), ctx.currentTime, 1.5);
      if (root !== this.root || force) { this.root = root; this.retune(); }
    },

    retune() {
      if (!this.drone) return;
      const base = midi(this.root + (this.mode === 'boss' ? 1 : 0));
      for (const [o, ratio] of this.drone.oscs) o.frequency.setTargetAtTime(base * ratio, ctx.currentTime, 3);
    },

    // one plucked note of the music box: a pure tone with a bell-like overtone, sent into the echo
    bell(t, m, vol) {
      const f = midi(m);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      for (const [ratio, v] of [[1, 1], [2.76, 0.18], [5.4, 0.05]]) {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f * ratio; og.gain.value = v;
        o.connect(og); og.connect(g);
        o.start(t); o.stop(t + 2.3);
      }
      g.connect(musicBus);
      g.connect(this.echo);
    },

    newMotif() {
      const len = randi(3, 6);
      let idx = randi(2, 6);
      this.motif = [];
      for (let i = 0; i < len; i++) {
        this.motif.push({ step: idx, gap: pick([1, 1, 1.5, 2, 3]) });
        idx = clamp(idx + pick([-2, -1, -1, 1, 1, 2, 3]), 0, SCALE.length - 1);
      }
      this.motifPos = 0;
      this.motifRepeats = randi(2, 3);
    },

    heartbeat(t, strong) {
      const v = (strong ? 0.5 : 0.28) * (0.35 + this.intensity * 0.65);
      tone({ at: t, type: 'sine', f: 70, f2: 38, dur: 0.28, vol: v, bus: musicBus });
      tone({ at: t + 0.21, type: 'sine', f: 60, f2: 34, dur: 0.24, vol: v * 0.6, bus: musicBus });
    },

    tick() {
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime, ahead = now + 0.2;
      if (this.nextNote < now - 1) this.nextNote = now + 0.1;
      if (this.nextBeat < now - 1) this.nextBeat = now + 0.1;

      // music box: slower and sparser when calm, a little restless in a fight
      while (this.nextNote < ahead) {
        if (!this.motif.length || this.motifPos >= this.motif.length) {
          if (this.motif.length && --this.motifRepeats > 0) {
            this.motifPos = 0;
            // a small change each time round, so it never quite repeats
            const n = pick(this.motif);
            n.step = clamp(n.step + pick([-1, 1]), 0, SCALE.length - 1);
            this.nextNote += 1.2;
          } else {
            this.newMotif();
            this.nextNote += this.mode === 'calm' ? 3.5 : 2.2;
          }
          continue;
        }
        const n = this.motif[this.motifPos++];
        const octave = this.mode === 'boss' ? 36 : 36 + (this.depth > 5000 ? -12 : 0);
        const vol = this.mode === 'calm' ? 0.05 : 0.065;
        this.bell(this.nextNote, this.root + octave + SCALE[n.step] + (this.mode === 'boss' && n.step % 3 === 1 ? 1 : 0), vol);
        const unit = this.mode === 'calm' ? 0.62 : this.mode === 'boss' ? 0.4 : 0.5;
        this.nextNote += n.gap * unit;
      }

      // the heartbeat, only during a dive
      if (this.mode !== 'calm') {
        const period = this.mode === 'boss' ? 60 / 84 : 60 / 62;
        while (this.nextBeat < ahead) {
          if (this.mode === 'boss' || this.intensity > 0.05) this.heartbeat(this.nextBeat, this.beat % 4 === 0);
          // in a boss fight, a low cluster swells up every eight beats
          if (this.mode === 'boss' && this.beat % 8 === 0) {
            for (const iv of [0, 1, 6]) tone({ at: this.nextBeat, type: 'sawtooth', f: midi(this.root + 12 + iv), dur: 2.6, vol: 0.035, attack: 1.2, filter: 'lowpass', ff: 600, bus: musicBus });
          }
          this.beat++;
          this.nextBeat += period;
        }
      } else {
        this.nextBeat = ahead;
      }

      // far below: something very large calling now and then
      if (this.depth >= 2400 && now > this.nextGlide) {
        this.nextGlide = now + rand(12, 26);
        const f = rand(150, 220);
        tone({ at: now + 0.1, type: 'sine', f, f2: f * rand(0.55, 0.7), dur: 3.4, vol: 0.05, attack: 1.1, bus: this.echo });
        tone({ at: now + 0.1, type: 'triangle', f: f * 2.01, f2: f * 1.3, dur: 3, vol: 0.015, attack: 1.3, bus: this.echo });
      }
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

  function setDepth(d) {
    if (!water) return;
    Music.setDepth(d);
    const f = Math.round(lerp(5000, 1100, clamp(d / 8000, 0, 1)) / 50) * 50;
    if (f !== waterF) { waterF = f; water.frequency.setTargetAtTime(f, ctx.currentTime, 0.6); }
  }

  return { init, sfx, Music, settings, setSfx, setMusic, setDepth, suspend, resume };
})();
