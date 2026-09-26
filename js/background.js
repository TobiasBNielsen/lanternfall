'use strict';

// Depth is in meters. Each zone is a deeper exposure of the same blue.
const ZONES = [
  { from: 0, name: 'sunlit water', top: '#3569b3', bot: '#23518f', rays: 1 },
  { from: 240, name: 'the twilight', top: '#23518f', bot: '#183b73', rays: 0.4 },
  { from: 720, name: 'the midnight water', top: '#14305f', bot: '#0d2148', rays: 0.08 },
  { from: 1500, name: 'the abyss', top: '#0c1c40', bot: '#08132d', rays: 0 },
  { from: 2700, name: 'the trench', top: '#070f25', bot: '#040918', rays: 0 },
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
  grad: null,
  gradKey: null,
  rayGrad: null,
  print: null, // the uneven exposure of a hand-coated cyanotype sheet

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
        size: [1, 1.5, 2.2][layer],
        ph: rand(TAU),
      });
    }
    this.buildPrint();
  },

  // Blotchy exposure, brush streaks and ragged edges, painted once per resize.
  buildPrint() {
    const { W, H } = View;
    const c = makeCanvas(Math.ceil(W / 2), Math.ceil(H / 2));
    const x = c.getContext('2d');
    x.scale(0.5, 0.5);
    for (let i = 0; i < 26; i++) {
      const cx = rand(W), cy = rand(H), r = rand(120, 380);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      const light = chance(0.5);
      g.addColorStop(0, light ? 'rgba(232,238,230,0.05)' : 'rgba(0,6,24,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    // long horizontal brush strokes from coating the paper
    for (let i = 0; i < 40; i++) {
      const y = rand(H), h = rand(2, 9);
      x.fillStyle = chance(0.5) ? 'rgba(232,238,230,0.025)' : 'rgba(0,6,24,0.05)';
      x.fillRect(rand(-100, W * 0.3), y, rand(W * 0.5, W * 1.2), h);
    }
    // ragged, under-exposed border where the brush didn't reach
    x.fillStyle = 'rgba(232,238,230,0.07)';
    for (const side of [0, 1]) {
      x.beginPath();
      const ex = side ? W : 0, dir = side ? -1 : 1;
      x.moveTo(ex, 0);
      for (let y = 0; y <= H; y += 18) x.lineTo(ex + dir * (rand(4, 16) + (y % 90 < 18 ? rand(6, 14) : 0)), y);
      x.lineTo(ex, H);
      x.closePath();
      x.fill();
    }
    this.print = c;
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
    // the sphere sinks, so everything in the water drifts upwards past it
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

  // 0 in the upper water, up to ~0.85 in the trench
  darkness() { return clamp((this.shown - 480) / 1800, 0, 0.85); },

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
    // the water colour only changes between waves, so the gradient is rebuilt only then
    const key = c.top + c.bot + H;
    if (key !== this.gradKey) {
      this.gradKey = key;
      this.grad = ctx.createLinearGradient(0, 0, 0, H);
      this.grad.addColorStop(0, c.top);
      this.grad.addColorStop(1, c.bot);
    }
    ctx.fillStyle = this.grad;
    ctx.fillRect(0, 0, W, H);

    // pale shafts where the sunlight still gets through
    if (c.rays > 0.01) {
      for (let i = 0; i < 4; i++) {
        const cx = W * (0.12 + i * 0.26) + Math.sin(this.t * 0.2 + i * 1.7) * 50;
        const w = 50 + (i % 3) * 36;
        ctx.globalAlpha = (0.05 + 0.02 * Math.sin(this.t * 0.6 + i)) * c.rays;
        ctx.fillStyle = this.rayGrad;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.3, 0); ctx.lineTo(cx + w * 0.3, 0);
        ctx.lineTo(cx + w * 1.3 + 110, H * 0.85); ctx.lineTo(cx - w * 0.2 + 110, H * 0.85);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    for (const p of this.spires) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(p.flip, 1);
      drawSprite(ctx, p.sp, 0, 0, 0, p.s, 0.22);
      ctx.restore();
    }

    const k = this.sink;
    ctx.fillStyle = '#e8eee6';
    for (const s of this.snow) {
      ctx.globalAlpha = s.layer === 0 ? 0.22 : 0.4;
      if (k > 0.05) {
        const len = s.speed * k * 0.2 + s.size;
        ctx.fillRect(s.x - s.size / 2, s.y, s.size, len);
      } else {
        ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
      }
    }
    ctx.globalAlpha = 1;
    if (this.print) ctx.drawImage(this.print, 0, 0, W, H);
  },

  // Static per resize: the ray gradient, and the vignette baked into the print texture
  // so the whole screen is only composited once for both.
  buildOverlays(ctx) {
    const { W, H } = View;
    this.rayGrad = ctx.createLinearGradient(0, 0, 0, H * 0.85);
    this.rayGrad.addColorStop(0, 'rgba(232,238,230,1)');
    this.rayGrad.addColorStop(1, 'rgba(232,238,230,0)');
    this.gradKey = null;
    if (!this.print) return;
    const x = this.print.getContext('2d');
    x.setTransform(0.5, 0, 0, 0.5, 0, 0);
    const v = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(3,9,26,0.45)');
    x.fillStyle = v;
    x.fillRect(0, 0, W, H);
  },
};
