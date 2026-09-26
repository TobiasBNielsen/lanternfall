'use strict';

const DEPTH_PER_WAVE = 400; // feet

const WAVES = [
  { type: 'bloom', title: 'A bloom of saucer jellies', note: 'They come up in clouds, pulsing in threes.', clusters: 4, per: 6, kinds: ['jelly'] },
  { type: 'current', title: 'Lamp-horns on the current', note: 'Lights moving together. Too many to be one fish.', groups: 4, per: 7, kinds: ['angler'] },
  { type: 'maelstrom', title: 'The maelstrom', note: 'The water turns, and everything in it turns too.', rings: [14], kinds: ['jellyB', 'jelly'] },
  { type: 'kraken', title: 'Grandmother Inkwell', note: 'Something large. The telephone to the ship goes quiet.', arms: 4 },
  { type: 'wreckfall', title: 'Wreckfall', note: 'Barrels and anchors from a ship that went down long before us.', dur: 16 },
  { type: 'bloom', title: 'The thorn reef', note: 'Jellies, and the thorns that roll along with them.', clusters: 5, per: 6, kinds: ['jelly', 'urchin', 'jellyB'] },
  { type: 'current', title: 'Midnight shoal', note: 'The lamp-horns again, with bells trailing behind.', groups: 5, per: 8, kinds: ['angler', 'angler', 'jellyB'] },
  { type: 'kraken', title: 'The Old One', note: 'Scarred all over. It is older than the ship above us.', arms: 6, hard: true },
];

function startWave(n) {
  const def = WAVES[(n - 1) % WAVES.length];
  const loop = Math.floor((n - 1) / WAVES.length);
  G.wave = n;
  G.depth = n * DEPTH_PER_WAVE;
  Background.setDepth(G.depth);
  G.hpMul = (1 + (n - 1) * 0.1) * (1 + loop * 0.25);
  G.shotMul = 0.65 + (n - 1) * 0.07;
  G.shotSpeed = 1 + Math.min(0.6, (n - 1) * 0.03);
  G.shotCap = Math.round(6 + n * 1.5);
  G.waveDef = def;
  G.waveObj = WaveTypes[def.type](def, n, loop);
  G.waveState = 'intro';
  G.waveT = 0;
  Sound.sfx.waveStart();
}

// Smoothly move an entering creature from its start point to its formation target.
function enterLerp(e, tx, ty, dur = 1.3) {
  const k = ease.outCubic(clamp((e.enterT - e.delay) / dur, 0, 1));
  e.x = lerp(e.startX, tx, k);
  e.y = lerp(e.startY, ty, k);
}

const WaveTypes = {
  // Loose clusters of jellies that drift and pulse, each cluster on its own current.
  bloom(def, n) {
    const t = { v: 0 };
    let C = def.clusters;
    function move(e, dt) {
      const W = View.W;
      const cw = W / C;
      const cx = cw * (e.cl + 0.5) + Math.sin(t.v * 0.35 + e.cl * 1.9) * Math.min(60, cw * 0.25);
      const cy = 150 + (e.cl % 2) * 120 + Math.sin(t.v * 0.5 + e.cl * 1.3) * 26;
      const pulse = -Math.abs(Math.sin(t.v * 1.8 + e.ph)) * 7;
      e.enterT += dt;
      enterLerp(e, cx + e.ox, cy + e.oy + pulse, 1.6);
    }
    return {
      begin() {
        C = clamp(Math.round(View.W / 220), 3, def.clusters);
        for (let c = 0; c < C; c++) {
          for (let i = 0; i < def.per; i++) {
            const kind = def.kinds[(c + i) % def.kinds.length];
            const e = makeCreature(kind, 0, -80);
            const a = (i / Math.max(1, def.per - 1)) * TAU + c;
            const rr = i === 0 ? 0 : 48 + (i % 2) * 10;
            e.cl = c; e.ox = Math.cos(a) * rr; e.oy = Math.sin(a) * rr * 0.8; e.ph = rand(TAU);
            e.enterT = 0; e.delay = c * 0.25 + i * 0.08;
            e.startX = (View.W / C) * (c + 0.5) + e.ox * 2; e.startY = -60 - i * 20;
            e.move = move;
          }
        }
      },
      update(dt) { t.v += dt; },
      done() { return G.enemies.length === 0; },
    };
  },

  // Schools of anglers sweeping across the screen on figure-eight currents.
  current(def, n) {
    const speed = 1 + Math.min(0.5, n * 0.02);
    const paths = [];
    for (let g = 0; g < def.groups; g++) {
      paths.push({ dir: g % 2 ? -1 : 1, a: 0.7 + (g % 3) * 0.12, b: 1.4 + (g % 2) * 0.25, ph: g * 0.9, ph2: g * 0.5, cy: 0.22 + (g % 3) * 0.06 });
    }
    function pos(P, s) {
      return {
        x: View.W / 2 + P.dir * View.W * 0.38 * Math.sin(P.a * s + P.ph),
        y: View.H * P.cy + View.H * 0.14 * Math.sin(P.b * s + P.ph2),
      };
    }
    function move(e, dt) {
      e.s += dt * speed;
      if (e.s < 0) { e.hidden = true; e.x = -300; e.y = -300; return; }
      e.hidden = false;
      const P = paths[e.path];
      const q = pos(P, e.s);
      if (e.s < 1.4) {
        const k = ease.outCubic(e.s / 1.4);
        e.x = lerp(P.dir > 0 ? -80 : View.W + 80, q.x, k);
        e.y = lerp(View.H * 0.12, q.y, k);
      } else {
        e.x = q.x; e.y = q.y;
      }
    }
    return {
      begin() {
        for (let g = 0; g < def.groups; g++) {
          for (let i = 0; i < def.per; i++) {
            const e = makeCreature(def.kinds[(g + i) % def.kinds.length], -300, -300);
            e.s = -(g * 3.2 + i * 0.3);
            e.path = g;
            e.hidden = true;
            e.move = move;
          }
        }
      },
      update() {},
      done() { return G.enemies.length === 0; },
    };
  },

  // Rings that breathe in and out, spinning faster as they tighten.
  maelstrom(def, n) {
    const t = { v: 0 };
    function move(e, dt) {
      const cx = View.W / 2 + Math.sin(t.v * 0.3) * View.W * 0.08;
      const cy = View.H * 0.32;
      const base = e.ring === 0 ? Math.min(View.W * 0.38, View.H * 0.25) : Math.min(View.W * 0.2, View.H * 0.13);
      const squeeze = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t.v * 0.5 + e.ring * 2));
      e.spin += dt * (0.4 + (1 - squeeze) * 1.6) * (e.ring % 2 ? -1 : 1);
      const ang = e.spin + (e.idx / e.m) * TAU;
      e.enterT += dt;
      enterLerp(e, cx + Math.cos(ang) * base * squeeze, cy + Math.sin(ang) * base * squeeze * 0.8, 1.5);
    }
    return {
      begin() {
        def.rings.forEach((m, ri) => {
          for (let i = 0; i < m; i++) {
            const e = makeCreature(def.kinds[(ri + i) % def.kinds.length], 0, -80);
            e.ring = ri; e.idx = i; e.m = m; e.spin = 0;
            e.enterT = 0; e.delay = i * 0.06 + ri * 0.5;
            e.startX = View.W / 2 + (i / m - 0.5) * View.W; e.startY = -80;
            e.move = move;
          }
        });
      },
      update(dt) { t.v += dt; },
      done() { return G.enemies.length === 0; },
    };
  },

  // Barrels and anchors raining down from a sunken fleet above.
  wreckfall(def, n, loop) {
    let t = 0, spawnT = 0, fishT = 3;
    const drift = rand(-1, 1) * 50;
    const fish = def.fish || loop > 0;
    function crosser(e, dt) {
      e.x += e.vx * dt;
      e.y = e.baseY + Math.sin(e.x * 0.012) * 40;
      if ((e.vx > 0 && e.x > View.W + 80) || (e.vx < 0 && e.x < -80)) e.dead = true;
    }
    return {
      begin() {},
      update(dt) {
        t += dt;
        if (t >= def.dur) return;
        spawnT -= dt;
        if (spawnT <= 0) {
          spawnT = rand(0.35, 0.8) / (1 + n * 0.03);
          spawnWreck({ x: rand(20, View.W - 20), y: -50, anchor: chance(0.2), vx: drift + rand(-30, 30), vy: rand(100, 190) * (1 + n * 0.01) });
        }
        if (fish) {
          fishT -= dt;
          if (fishT <= 0) {
            fishT = rand(3.5, 5);
            const dir = chance(0.5) ? 1 : -1;
            const baseY = rand(90, View.H * 0.35);
            for (let i = 0; i < 5; i++) {
              const e = makeCreature('angler', dir > 0 ? -60 - i * 70 : View.W + 60 + i * 70, baseY);
              e.vx = dir * 200; e.baseY = baseY;
              e.move = crosser;
            }
          }
        }
      },
      done() { return t >= def.dur && G.enemies.length === 0; },
    };
  },

  // A kraken whose head is armoured until every arm has been shot off.
  kraken(def, n, loop) {
    let b = null;
    const SEG = 12;

    function spore(ang, speed, ox = 0) {
      fireShot('boss', b.x + ox, b.y + 30, Math.cos(ang) * speed, Math.sin(ang) * speed);
    }
    function attack() {
      const rage = b.armsLeft === 0;
      const opts = ['fan', 'reach', 'reach'];
      if (rage || def.hard) opts.push('ring', 'ink');
      if (!rage) opts.push('spines');
      if (G.enemies.length < 14) opts.push('spawn');
      const a = pick(opts);
      const sp = 220 * G.shotSpeed;
      if (a === 'fan') {
        const c = rage ? 9 : 7;
        for (let i = 0; i < c; i++) spore(Math.PI / 2 + (i - (c - 1) / 2) * 0.17, sp);
      } else if (a === 'ring') {
        for (let i = 0; i < 14; i++) spore(0.12 + (i / 13) * (Math.PI - 0.24), sp * 0.9);
      } else if (a === 'reach') {
        const alive = b.arms.filter(r => !r.dead && r.reach <= 0);
        if (!alive.length) return spore(Math.atan2(G.player.y - b.y, G.player.x - b.x), sp * 1.3);
        const arm = pick(alive);
        arm.reach = 1.3;
        Sound.sfx.whoosh();
      } else if (a === 'spines') {
        for (const arm of b.arms) {
          if (arm.dead) continue;
          const ang = Math.atan2(G.player.y - arm.y, G.player.x - arm.x);
          fireShot('boss', arm.x, arm.y, Math.cos(ang) * sp * 1.1, Math.sin(ang) * sp * 1.1);
        }
      } else if (a === 'ink') {
        for (let i = 0; i < 5; i++) inkCloud(rand(View.W * 0.15, View.W * 0.85), rand(View.H * 0.25, View.H * 0.55), 1.3);
        for (let i = 0; i < 5; i++) spore(Math.PI / 2 + (i - 2) * 0.3, sp * 0.8);
        Sound.sfx.squirt();
      } else {
        for (let i = 0; i < 4; i++) {
          const e = makeCreature(i % 2 ? 'jelly' : 'jellyB', b.x + (i - 1.5) * 40, b.y + 60);
          e.vx = (i - 1.5) * 120; e.vy = 60;
          e.move = diver;
        }
      }
    }
    function diver(e, dt) {
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.vy += 40 * dt;
      e.vx += (G.player.x - e.x) * 0.45 * dt;
      e.vx *= 1 - 0.3 * dt;
      if (e.y > View.H + 60) e.dead = true;
    }
    function layoutArms(dt) {
      const count = b.arms.length;
      for (const arm of b.arms) {
        const i = arm.idx;
        const u = count === 1 ? 0 : i / (count - 1) - 0.5;
        const bx = b.x + u * 64, by = b.y + 30;
        let a0 = Math.PI / 2 + u * 1.9 + Math.sin(G.time * 1.4 + i * 1.1) * 0.25;
        let len = 170;
        if (!arm.dead && arm.reach > 0) {
          arm.reach = Math.max(0, arm.reach - dt);
          const k = Math.sin((1 - arm.reach / 1.3) * Math.PI);
          const toP = Math.atan2(G.player.y - by, G.player.x - bx);
          a0 = lerp(a0, toP, k * 0.85);
          len += k * 230;
        }
        if (arm.dead) { len = 38; arm.severed = Math.max(0, arm.severed - dt); }
        const pts = [];
        let px = bx, py = by;
        const step = len / SEG;
        for (let k = 0; k <= SEG; k++) {
          pts.push([px, py]);
          const ang = a0 + Math.sin(G.time * 2.2 + i * 0.9 + k * 0.45) * 0.45 * (k / SEG);
          px += Math.cos(ang) * step;
          py += Math.sin(ang) * step;
        }
        arm.pts = pts;
        if (!arm.dead) { arm.x = pts[SEG - 2][0]; arm.y = pts[SEG - 2][1]; }
        arm.flash = Math.max(0, arm.flash - dt);
      }
    }
    function move(b_, dt) {
      if (b.state === 'enter') {
        b.y = lerp(b.y, 235, Math.min(1, dt * 1.3));
        if (Math.abs(b.y - 235) < 4) { b.state = 'fight'; Sound.sfx.bossGroan(); }
        layoutArms(dt);
        return;
      }
      const rage = b.armsLeft === 0;
      b.retarget -= dt;
      if (b.retarget <= 0) {
        b.tx = rand(150, View.W - 150);
        b.ty = rand(220, Math.max(250, View.H * 0.32));
        b.retarget = rand(1.8, 3.2) / (rage ? 1.5 : 1);
      }
      b.x = lerp(b.x, b.tx, Math.min(1, dt * (rage ? 1.6 : 0.9)));
      b.y = lerp(b.y, b.ty, Math.min(1, dt * (rage ? 1.6 : 0.9)));
      layoutArms(dt);
      b.atkT -= dt;
      if (b.atkT <= 0) {
        attack();
        b.atkT = rand(1.3, 2.3) / (rage ? 1.4 : 1) / (def.hard ? 1.15 : 1) / (1 + loop * 0.15);
      }
    }
    return {
      begin() {
        const hp = (180 + loop * 120) * (def.hard ? 1.5 : 1) * (1 + (n - 1) * 0.03);
        b = {
          type: 'boss', x: View.W / 2, y: -220, r: 70, oy: -45, hp, maxhp: hp,
          name: def.title, sprite: def.hard ? 'krakenOld' : 'kraken',
          score: (def.hard ? 12000 : 6000) * (loop + 1),
          state: 'enter', tx: View.W / 2, ty: 235, retarget: 2, atkT: 1.8,
          anim: 0, animSpeed: 3, flash: 0, rot: 0, dead: false, hidden: false,
          arms: [], armsLeft: def.arms,
        };
        b.move = move;
        G.enemies.push(b);
        const armHp = hp * (def.hard ? 0.22 : 0.3);
        for (let i = 0; i < def.arms; i++) {
          const arm = { type: 'arm', boss: b, idx: i, hp: armHp, maxhp: armHp, r: 28, x: b.x, y: b.y, pts: [], reach: 0, severed: 0, flash: 0, dead: false, hidden: false };
          b.arms.push(arm);
          G.enemies.push(arm);
        }
        G.boss = b;
        Sound.Music.setMode('boss');
      },
      update() {},
      done() { return b.dead && G.enemies.length === 0 && G.timers.length === 0; },
    };
  },
};
