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
};
