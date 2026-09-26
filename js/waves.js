'use strict';

const DEPTH_PER_WAVE = 400; // feet

// Sixteen dives to a cycle; every fourth ends with something large. After that the cycle repeats, harder.
const WAVES = [
  { type: 'bloom', title: 'A bloom of saucer jellies', note: 'They come up in clouds, pulsing in threes.', clusters: 4, per: 6, kinds: ['jelly'] },
  { type: 'current', title: 'Lamp-horns on the current', note: 'Lights moving together. Too many to be one fish.', groups: 4, per: 7, kinds: ['angler'] },
  { type: 'maelstrom', title: 'The maelstrom', note: 'The water turns, and everything in it turns too.', rings: [14], kinds: ['jellyB', 'jelly'] },
  { type: 'kraken', title: 'Grandmother Inkwell', note: 'Something large. The telephone to the ship goes quiet.', arms: 4 },
  { type: 'wreckfall', title: 'Wreckfall', note: 'Barrels and anchors from a ship that went down long before us.', dur: 16 },
  { type: 'mix', title: 'Strung together', note: 'Chains of little bells, and something silver cutting between them.',
    parts: [{ type: 'chains', chains: 3, len: 7 }, { type: 'darts', dur: 14, every: 3.2 }] },
  { type: 'darts', title: 'Silver hatchets', note: 'They come in pairs, flat as coins, and they do not turn.', dur: 20, every: 1.6 },
  { type: 'queen', title: 'The Lantern Queen', note: 'Every light goes out but one.' },
  { type: 'bloom', title: 'The thorn reef', note: 'Jellies, and the thorns that roll along with them.', clusters: 5, per: 6, kinds: ['jelly', 'urchin', 'jellyB'] },
  { type: 'mix', title: 'Open mouths', note: 'Three gulpers, waiting. The water pulls toward them.',
    parts: [{ type: 'gulpers', count: 3 }, { type: 'bloom', clusters: 3, per: 4, kinds: ['jellyB'] }] },
  { type: 'pyro', title: 'Fire-tubes', note: 'Tubes of light that break into smaller tubes of light.', count: 5 },
  { type: 'colony', title: 'The Colony', note: 'Forty feet of bells, all joined, all coming.', bells: 12 },
  { type: 'current', title: 'Midnight shoal', note: 'The lamp-horns again, with bells trailing behind.', groups: 5, per: 8, kinds: ['angler', 'angler', 'jellyB'] },
  { type: 'mix', title: 'Chains and mouths', note: 'The bells again. The gulpers do not mind them.',
    parts: [{ type: 'chains', chains: 3, len: 8 }, { type: 'gulpers', count: 2 }] },
  { type: 'mix', title: 'The graveyard of ships', note: 'Wreckage falling through a field of little lights.',
    parts: [{ type: 'wreckfall', dur: 16, fish: true }, { type: 'pyro', count: 3 }] },
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
  G.forceDark = 0;
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

  // Several wave types at once. The wave is over when every part is.
  mix(def, n, loop) {
    const parts = def.parts.map(pd => WaveTypes[pd.type](pd, n, loop));
    return {
      begin() { parts.forEach(pt => pt.begin()); },
      update(dt) { parts.forEach(pt => pt.update(dt)); },
      done() { return parts.every(pt => pt.done()); },
    };
  },

  // Chains of bells winding through the water. Each bell follows the one in front;
  // if the front one dies, the next bell leads.
  chains(def, n) {
    const t = { v: 0 };
    function lead(c, s) {
      return {
        x: View.W / 2 + Math.sin(s + c.ph) * View.W * 0.4,
        y: View.H * 0.3 + Math.sin(s * 1.7 + c.ph) * View.H * 0.17,
      };
    }
    function move(e, dt) {
      const c = e.chain;
      let ahead = null;
      for (let i = e.idx - 1; i >= 0; i--) if (!c.segs[i].dead) { ahead = c.segs[i]; break; }
      e.lead = ahead;
      if (!ahead) {
        const q = lead(c, t.v * 0.5 * c.speed);
        const k = Math.min(1, dt * 2.5);
        e.x = lerp(e.x, q.x, k); e.y = lerp(e.y, q.y, k);
      } else {
        const dx = e.x - ahead.x, dy = e.y - ahead.y, d = Math.hypot(dx, dy) || 1;
        if (d > 24) { e.x = ahead.x + (dx / d) * 24; e.y = ahead.y + (dy / d) * 24; }
      }
    }
    return {
      begin() {
        for (let c = 0; c < def.chains; c++) {
          const chain = { segs: [], ph: c * 2.1, speed: 1 + Math.min(0.4, n * 0.015) };
          const x0 = View.W * (0.2 + 0.3 * c);
          for (let i = 0; i < def.len; i++) {
            const e = makeCreature('chain', x0, -40 - i * 24 - c * 120);
            e.chain = chain; e.idx = i; e.move = move;
            chain.segs.push(e);
          }
        }
      },
      update(dt) { t.v += dt; },
      done() { return G.enemies.length === 0; },
    };
  },

  // Silver hatchets crossing in pairs and threes, alternating sides.
  darts(def, n) {
    let t = 0, spawnT = 0.5, side = 1;
    function move(e, dt) {
      e.x += e.vx * dt;
      e.y = e.baseY + Math.sin(e.x * 0.018 + e.ph) * 18;
      if ((e.vx > 0 && e.x > View.W + 60) || (e.vx < 0 && e.x < -60)) e.dead = true;
    }
    return {
      begin() {},
      update(dt) {
        t += dt;
        if (t >= def.dur) return;
        spawnT -= dt;
        if (spawnT > 0) return;
        spawnT = def.every * rand(0.8, 1.2);
        side = -side;
        const count = chance(0.4) ? 3 : 2;
        const baseY = rand(90, View.H * 0.55);
        for (let i = 0; i < count; i++) {
          const e = makeCreature('hatchet', side > 0 ? -40 - i * 46 : View.W + 40 + i * 46, baseY + i * 14);
          e.vx = side * rand(300, 360) * (1 + Math.min(0.5, n * 0.015));
          e.baseY = baseY + i * 14; e.ph = i; e.flip = side < 0;
          e.animSpeed = 12;
          e.move = move;
        }
      },
      done() { return t >= def.dur && G.enemies.length === 0; },
    };
  },

  // Gulpers hanging in a row, swaying, taking turns to open up.
  gulpers(def) {
    const t = { v: 0 };
    function move(e, dt) {
      e.enterT += dt;
      const cx = e.slot + Math.sin(t.v * 0.4 + e.ph) * 30;
      const cy = 175 + Math.sin(t.v * 0.7 + e.ph) * 14;
      enterLerp(e, cx, cy, 1.8);
    }
    return {
      begin() {
        for (let i = 0; i < def.count; i++) {
          const e = makeCreature('gulper', 0, -120);
          e.slot = View.W * ((i + 0.5) / def.count);
          e.ph = i * 1.7; e.enterT = 0; e.delay = i * 0.4;
          e.startX = e.slot; e.startY = -120;
          e.shotT = 2.5 + i * 2.2;
          e.move = move;
        }
      },
      update(dt) { t.v += dt; },
      done() { return G.enemies.length === 0; },
    };
  },

  // Fire-tubes drifting and bouncing around the upper water; each one breaks into three.
  pyro(def) {
    function move(e, dt) {
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.x < 30 && e.vx < 0) e.vx = -e.vx;
      if (e.x > View.W - 30 && e.vx > 0) e.vx = -e.vx;
      if (e.y > View.H * 0.62 && e.vy > 0) e.vy = -e.vy;
      if (e.y < 50 && e.vy < 0 && !e.entering) e.vy = -e.vy;
      if (e.y > 60) e.entering = false;
    }
    return {
      begin() {
        for (let i = 0; i < def.count; i++) {
          const e = makeCreature('pyro', rand(60, View.W - 60), -60 - i * 70);
          const a = Math.PI / 2 + rand(-0.6, 0.6);
          e.vx = Math.cos(a) * 110; e.vy = Math.sin(a) * 110;
          e.entering = true;
          e.move = move;
        }
      },
      update() {},
      done() { return G.enemies.length === 0; },
    };
  },

  // The lantern queen: the water goes dark, her lamp is the only target, her body is armour.
  queen(def, n, loop) {
    let b = null;
    function diver(e, dt) {
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.vy += 40 * dt;
      e.vx += (G.player.x - e.x) * 0.45 * dt;
      e.vx *= 1 - 0.3 * dt;
      if (e.y > View.H + 60) e.dead = true;
    }
    function lureSpore(ang, speed) {
      fireShot('boss', b.hx, b.hy, Math.cos(ang) * speed, Math.sin(ang) * speed);
    }
    function attack() {
      const sp = 220 * G.shotSpeed;
      const opts = ['pulse', 'lunge', 'lunge', 'blackout'];
      if (G.enemies.length < 8) opts.push('call');
      const a = pick(opts);
      if (a === 'pulse') {
        for (let i = 0; i < 12; i++) lureSpore((i / 12) * TAU, sp * 0.8);
      } else if (a === 'lunge') {
        b.charge = 1.3; b.tx = G.player.x; b.ty = View.H * 0.5;
        Sound.sfx.whoosh();
      } else if (a === 'blackout') {
        b.blackout = 2.6; b.pelt = 0.5;
      } else {
        for (let i = 0; i < 2; i++) {
          const e = makeCreature('angler', b.x + (i ? 80 : -80), b.y);
          e.vx = (i ? 1 : -1) * 90; e.vy = 70; e.move = diver;
        }
      }
    }
    function move(b_, dt) {
      b.sway = Math.sin(G.time * 1.3) * 26;
      b.hx = b.x + 72 + b.sway;
      b.hy = b.y - 150 + Math.cos(G.time * 1.7) * 10;
      if (b.state === 'enter') {
        b.y = lerp(b.y, 300, Math.min(1, dt * 1.2));
        G.forceDark = Math.min(0.72, G.forceDark + dt * 0.5);
        if (Math.abs(b.y - 300) < 4) { b.state = 'fight'; Sound.sfx.bossGroan(); }
        return;
      }
      if (b.blackout > 0) {
        b.blackout -= dt;
        G.forceDark = Math.min(0.96, G.forceDark + dt * 2);
        b.pelt -= dt;
        if (b.pelt <= 0) {
          b.pelt = 0.35;
          lureSpore(Math.atan2(G.player.y - b.hy, G.player.x - b.hx), 280 * G.shotSpeed);
        }
      } else {
        G.forceDark = lerp(G.forceDark, 0.72, Math.min(1, dt * 2));
      }
      if (b.charge > 0) {
        b.charge -= dt;
        const k = b.charge > 0.65 ? dt * 4 : dt * 2;
        b.x = lerp(b.x, b.charge > 0.65 ? b.tx : b.homeX, Math.min(1, k));
        b.y = lerp(b.y, b.charge > 0.65 ? b.ty : 300, Math.min(1, k));
        return;
      }
      b.retarget -= dt;
      if (b.retarget <= 0) {
        b.homeX = rand(170, View.W - 170);
        b.retarget = rand(2, 3.4);
      }
      b.x = lerp(b.x, b.homeX, Math.min(1, dt * 0.8));
      b.y = lerp(b.y, 300, Math.min(1, dt * 0.8));
      b.atkT -= dt;
      if (b.atkT <= 0) {
        attack();
        b.atkT = rand(1.8, 2.8) / (1 + loop * 0.15) / (b.hp < b.maxhp * 0.4 ? 1.35 : 1);
      }
    }
    return {
      begin() {
        const hp = (200 + loop * 120) * (1 + (n - 1) * 0.03);
        b = {
          type: 'boss', variant: 'queen', sprite: 'queen', species: 'queen', name: def.title,
          x: View.W / 2, y: -220, r: 30, bodyR: 82, hp, maxhp: hp,
          score: 9000 * (loop + 1), state: 'enter', homeX: View.W / 2, tx: 0, ty: 0,
          retarget: 2, atkT: 2, charge: 0, blackout: 0, pelt: 0, sway: 0,
          anim: 0, animSpeed: 2.5, flash: 0, rot: 0, lastX: View.W / 2, dead: false, hidden: false,
          arms: [], armsLeft: 0,
        };
        b.move = move;
        G.enemies.push(b);
        G.boss = b;
        Sound.Music.setMode('boss');
      },
      update() {},
      done() { return b.dead && G.enemies.length === 0 && G.timers.length === 0; },
    };
  },

  // The colony: a long chain of bells behind a float. Only the last bell can be cut,
  // and the float is armoured until every bell is gone.
  colony(def, n, loop) {
    let b = null;
    const GAP = 30;
    function place() {
      const tr = b.trail;
      let idx = tr.length - 1, acc = 0, want = GAP;
      for (const seg of b.arms) {
        while (idx > 0) {
          const [x0, y0] = tr[idx], [x1, y1] = tr[idx - 1];
          const d = Math.hypot(x1 - x0, y1 - y0);
          if (acc + d >= want) {
            const k = (want - acc) / d;
            seg.x = lerp(x0, x1, k); seg.y = lerp(y0, y1, k);
            break;
          }
          acc += d; idx--;
        }
        if (idx <= 0) { seg.x = tr[0][0]; seg.y = tr[0][1] - (want - acc); }
        want += GAP;
      }
    }
    function move(b_, dt) {
      const left = b.armsLeft / b.arms.length;
      b.t += dt * 0.42 * (1 + (1 - left) * 0.9);
      const tx = View.W / 2 + Math.sin(b.t) * View.W * 0.4;
      const ty = View.H * 0.32 + Math.sin(b.t * 2 + 0.6) * View.H * 0.16;
      if (b.state === 'enter') {
        b.x = lerp(b.x, tx, Math.min(1, dt * 1.2));
        b.y = lerp(b.y, ty, Math.min(1, dt * 1.2));
        b.enterT = (b.enterT || 0) + dt;
        if (b.enterT > 2.6) { b.state = 'fight'; Sound.sfx.bossGroan(); }
      } else {
        b.x = lerp(b.x, tx, Math.min(1, dt * 4));
        b.y = lerp(b.y, ty, Math.min(1, dt * 4));
      }
      const last = b.trail[b.trail.length - 1];
      if (!last || Math.hypot(last[0] - b.x, last[1] - b.y) > 3) {
        b.trail.push([b.x, b.y]);
        if (b.trail.length > 700) b.trail.splice(0, 100);
      }
      place();
      if (b.state !== 'fight') return;
      b.atkT -= dt;
      if (b.atkT <= 0) {
        const sp = 200 * G.shotSpeed;
        if (b.armsLeft > 0) {
          const alive = b.arms.filter(s => !s.dead);
          for (let i = 0; i < 3; i++) {
            const s = pick(alive);
            fireShot('boss', s.x, s.y + 10, rand(-30, 30), sp);
          }
          const a = Math.atan2(G.player.y - b.y, G.player.x - b.x);
          for (const o of [-0.2, 0, 0.2]) fireShot('boss', b.x, b.y, Math.cos(a + o) * sp * 1.2, Math.sin(a + o) * sp * 1.2);
          b.atkT = rand(1.2, 1.9) / (1 + loop * 0.15);
        } else {
          for (let i = 0; i < 10; i++) fireShot('boss', b.x, b.y, Math.cos((i / 10) * TAU) * sp, Math.sin((i / 10) * TAU) * sp);
          b.atkT = rand(0.9, 1.3);
        }
      }
    }
    return {
      begin() {
        const hp = (160 + loop * 100) * (1 + (n - 1) * 0.03);
        const bellHp = hp * 0.12;
        b = {
          type: 'boss', variant: 'colony', sprite: 'colony', species: 'colony', name: def.title,
          x: View.W / 2, y: -80, r: 30, hp, maxhp: hp, score: 10000 * (loop + 1),
          state: 'enter', t: 0, atkT: 2, trail: [[View.W / 2, -400], [View.W / 2, -80]],
          anim: 0, animSpeed: 3, flash: 0, rot: 0, lastX: View.W / 2, dead: false, hidden: false,
          arms: [], armsLeft: def.bells,
        };
        b.move = move;
        G.enemies.push(b);
        for (let i = 0; i < def.bells; i++) {
          const seg = { type: 'seg', boss: b, idx: i, hp: bellHp, maxhp: bellHp, r: 20, x: b.x, y: -120 - i * GAP, anim: i * 0.7, animSpeed: 4, flash: 0, rot: 0, lastX: b.x, dead: false, hidden: false, boilSeed: i };
          b.arms.push(seg);
          G.enemies.push(seg);
        }
        G.boss = b;
        Sound.Music.setMode('boss');
      },
      update() {},
      done() { return b.dead && G.enemies.length === 0 && G.timers.length === 0; },
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
          name: def.title, sprite: def.hard ? 'krakenOld' : 'kraken', variant: 'kraken',
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
