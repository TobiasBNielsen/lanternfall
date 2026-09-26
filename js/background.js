'use strict';

// Water column: colour and light depend on how deep the sub is.
const ZONES = [
  { from: 0, name: 'Sunlight Zone', top: '#1b6a88', bot: '#0a2d48', rays: 1 },
  { from: 800, name: 'Twilight Zone', top: '#0e3a5a', bot: '#061a2e', rays: 0.45 },
  { from: 1600, name: 'Midnight Zone', top: '#07182b', bot: '#030b16', rays: 0.1 },
  { from: 2800, name: 'The Abyss', top: '#050b16', bot: '#02050b', rays: 0 },
  { from: 4400, name: 'Hadal Trench', top: '#05040d', bot: '#010103', rays: 0 },
];

function zoneAt(depth) {
  let z = ZONES[0];
  for (const zz of ZONES) if (depth >= zz.from) z = zz;
  return z;
}

function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
}

const Background = {
  snow: [],
  spires: [],
  depth: 0,
  shown: 0, // eased depth used for colours
  sink: 0,
  t: 0,
  bgGrad: null,
  vignette: null,

  init() {
    this.resize();
    this.spires = [this.newSpire(true), this.newSpire(true)];
  },

  resize() {
    const { W, H } = View;
    const count = Math.round((W * H) / 3200);
    this.snow = [];
    for (let i = 0; i < count; i++) {
      const layer = Math.random() < 0.6 ? 0 : Math.random() < 0.7 ? 1 : 2;
      this.snow.push({
        x: rand(W), y: rand(H), layer,
        speed: [10, 22, 40][layer] * rand(0.8, 1.2),
        size: [1, 1.6, 2.4][layer],
        ph: rand(TAU),
      });
    }
  },

  newSpire(initial) {
    const sp = pick(Sprites.spires);
    const s = rand(0.7, 1.2);
    const left = chance(0.5);
    return {
      sp, s,
      x: left ? rand(-20, View.W * 0.18) : rand(View.W * 0.82, View.W + 20),
      y: initial ? rand(View.H * 0.3, View.H) : View.H + (sp.h * s) / 2,
      speed: rand(8, 14),
      flip: left ? 1 : -1,
    };
  },

  setDepth(d) { this.depth = d; },

  update(dt, sinking) {
    this.t += dt;
    this.sink = lerp(this.sink, sinking, Math.min(1, dt * 2));
    this.shown = lerp(this.shown, this.depth, Math.min(1, dt * 0.8));
    const boost = 1 + this.sink * 8;
    const { W, H } = View;
    // the sub sinks, so everything in the water drifts upwards past it
    for (const s of this.snow) {
      s.y -= s.speed * boost * dt;
      s.x += Math.sin(this.t * 0.6 + s.ph) * 6 * dt;
      if (s.y < -10) { s.y = H + rand(10); s.x = rand(W); }
    }
    for (let i = 0; i < this.spires.length; i++) {
      const p = this.spires[i];
      p.y -= p.speed * (1 + this.sink * 6) * dt;
      if (p.y + (p.sp.h * p.s) / 2 < 0) this.spires[i] = this.newSpire(false);
    }
  },

  // 0 near the surface, up to ~0.85 in the trench
  darkness() { return clamp((this.shown - 900) / 3000, 0, 0.85); },

  colors() {
    const d = this.shown;
    let i = 0;
    while (i < ZONES.length - 1 && d >= ZONES[i + 1].from) i++;
    const a = ZONES[i], b = ZONES[Math.min(i + 1, ZONES.length - 1)];
    const t = a === b ? 0 : clamp((d - a.from) / (b.from - a.from), 0, 1);
    return { top: mixHex(a.top, b.top, t), bot: mixHex(a.bot, b.bot, t), rays: lerp(a.rays, b.rays, t) };
  },

  draw(ctx) {
    const { W, H } = View;
    const c = this.colors();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, c.top);
    g.addColorStop(1, c.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // light shafts from the surface
    if (c.rays > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const cx = W * (0.1 + i * 0.2) + Math.sin(this.t * 0.25 + i * 1.7) * 60;
        const w = 60 + (i % 3) * 40;
        const a = (0.05 + 0.03 * Math.sin(this.t * 0.7 + i)) * c.rays;
        const rg = ctx.createLinearGradient(0, 0, 0, H * 0.9);
        rg.addColorStop(0, `rgba(190,240,255,${a})`);
        rg.addColorStop(1, 'rgba(190,240,255,0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.3, 0); ctx.lineTo(cx + w * 0.3, 0);
        ctx.lineTo(cx + w * 1.4 + 120, H * 0.9); ctx.lineTo(cx - w * 0.2 + 120, H * 0.9);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    for (const p of this.spires) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(p.flip, 1);
      drawSprite(ctx, p.sp, 0, 0, 0, p.s, 0.35);
      ctx.restore();
    }

    const k = this.sink;
    ctx.fillStyle = '#cfe9f2';
    for (const s of this.snow) {
      ctx.globalAlpha = s.layer === 0 ? 0.25 : 0.45;
      if (k > 0.05) {
        const len = s.speed * k * 0.2 + s.size;
        ctx.fillRect(s.x - s.size / 2, s.y, s.size, len);
      } else {
        ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
      }
    }
    ctx.globalAlpha = 1;
  },

  buildOverlays(ctx) {
    const { W, H } = View;
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,4,10,0.55)');
    this.vignette = v;
  },
};
