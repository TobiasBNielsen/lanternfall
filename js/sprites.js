'use strict';

// Everything is drawn once at startup as white linework on transparent canvases,
// in the manner of a cyanotype print: paper-white lines, Prussian blue ground,
// and a single warm amber reserved for things that give off light.
const Sprites = { ss: 2 };

const PAPER = '#e8eee6';
const AMBER = '#f2a93b';
const DEEP = '#0b1d44';
const PRUSSIAN = '#20478c';
const WASH = 'rgba(232,238,230,0.10)';
const BOIL = 2; // hand-drawn variants per frame, cycled to make the lines shimmer

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function makeSprite(w, h, draw) {
  const ss = Sprites.ss;
  const c = makeCanvas(w * ss, h * ss);
  const x = c.getContext('2d');
  x.scale(ss, ss);
  x.translate(w / 2, h / 2);
  x.lineJoin = 'round';
  x.lineCap = 'round';
  draw(x);
  return { c, w, h };
}

function flashSprite(sp) {
  const c = makeCanvas(sp.c.width, sp.c.height);
  const x = c.getContext('2d');
  x.drawImage(sp.c, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = 'rgba(255,255,255,0.6)';
  x.fillRect(0, 0, c.width, c.height);
  return { c, w: sp.w, h: sp.h };
}

function drawSprite(ctx, sp, x, y, rot = 0, scale = 1, alpha = 1) {
  if (alpha <= 0) return;
  const w = sp.w * scale, h = sp.h * scale;
  if (!rot) {
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(sp.c, x - w / 2, y - h / 2, w, h);
    if (alpha !== 1) ctx.globalAlpha = 1;
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.drawImage(sp.c, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// frames[i][b]: animation phase i, hand-drawn variant b.
function buildSet(w, h, drawFn, opts, count = 6) {
  const frames = [], flash = [];
  for (let i = 0; i < count; i++) {
    const f = [], fl = [];
    for (let b = 0; b < BOIL; b++) {
      const sp = makeSprite(w, h, x => drawFn(x, i / count, opts));
      f.push(sp);
      fl.push(flashSprite(sp));
    }
    frames.push(f);
    flash.push(fl);
  }
  return { frames, flash, count };
}

// ---------------------------------------------------------------- pen helpers

const jit = a => (Math.random() * 2 - 1) * a;

function penPath(x, pts, closed, j = 0.5) {
  x.beginPath();
  pts.forEach(([px, py], i) => {
    const X = px + jit(j), Y = py + jit(j);
    if (i) x.lineTo(X, Y); else x.moveTo(X, Y);
  });
  if (closed) x.closePath();
}

function arcPts(cx, cy, rx, ry, a0, a1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

// A circle drawn by hand: it never quite closes on itself.
function penCircle(x, cx, cy, r, j = 0.4) {
  const a0 = rand(TAU);
  penPath(x, arcPts(cx, cy, r, r, a0, a0 + TAU + rand(0.12, 0.4), Math.max(12, Math.round(r * 1.6))), false, j);
  x.stroke();
}

// Engraver's shading: parallel strokes clipped to a shape, only on the side away from the light.
function hatch(x, clip, box, opt = {}) {
  const { angle = -0.8, gap = 3.2, width = 0.7, alpha = 0.7, from = -1, to = 1 } = opt;
  const [bx, by, bw, bh] = box;
  x.save();
  clip();
  x.clip();
  x.strokeStyle = rgba(PAPER, alpha);
  x.lineWidth = width;
  const cx = bx + bw / 2, cy = by + bh / 2, R = Math.hypot(bw, bh) / 2;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  for (let d = -R; d <= R; d += gap) {
    const t = d / R;
    if (t < from || t > to) continue;
    const px = cx + -sa * d, py = cy + ca * d;
    x.beginPath();
    x.moveTo(px - ca * R + jit(0.6), py - sa * R + jit(0.6));
    x.lineTo(px + ca * R + jit(0.6), py + sa * R + jit(0.6));
    x.stroke();
  }
  x.restore();
}

function stipple(x, clip, box, n, r = 0.7, alpha = 0.8) {
  const [bx, by, bw, bh] = box;
  x.save();
  clip();
  x.clip();
  x.fillStyle = rgba(PAPER, alpha);
  for (let i = 0; i < n; i++) {
    x.beginPath(); x.arc(bx + rand(bw), by + rand(bh), r * rand(0.6, 1.3), 0, TAU); x.fill();
  }
  x.restore();
}

function ink(x, w = 1.4, a = 1) {
  x.strokeStyle = rgba(PAPER, a);
  x.lineWidth = w;
}

// ---------------------------------------------------------------- specimens

// Rhodomedusa ternaria: a flat saucer jelly with a fringe of fine tentacles.
function drawSaucerJelly(x, ph) {
  const s = Math.sin(ph * TAU);
  const bw = 27 * (1 - s * 0.1), bh = 14 * (1 + s * 0.18), rim = -14;
  ink(x, 0.8, 0.75);
  for (let i = 0; i < 11; i++) {
    const tx = (i / 10 - 0.5) * bw * 1.9;
    const len = i % 2 ? 34 : 46;
    const pts = [];
    for (let k = 0; k <= 8; k++) pts.push([tx + Math.sin(ph * TAU + i * 0.8 + k * 0.7) * (1 + k * 0.5), rim + 2 + (k / 8) * len]);
    penPath(x, pts, false, 0.3); x.stroke();
  }
  ink(x, 1.1, 0.9);
  for (const side of [-1, 0, 1]) {
    const pts = [];
    for (let k = 0; k <= 10; k++) pts.push([side * 6 + (k % 2 ? 2.5 : -2.5) + Math.sin(ph * TAU + k * 0.5 + side) * 2, rim + 3 + k * 2.4]);
    penPath(x, pts, false, 0.3); x.stroke();
  }
  const bell = () => {
    x.beginPath();
    arcPts(0, rim, bw, bh + 8, Math.PI, TAU, 22).forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
    for (let i = 0; i < 9; i++) {
      const x0 = bw - (i * 2 * bw) / 9, x1 = bw - ((i + 1) * 2 * bw) / 9;
      x.quadraticCurveTo((x0 + x1) / 2, rim + 3.5, x1, rim);
    }
    x.closePath();
  };
  x.fillStyle = WASH;
  bell(); x.fill();
  hatch(x, bell, [-bw, rim - bh - 8, bw * 2, bh + 12], { from: 0.15, gap: 3 });
  ink(x, 0.7, 0.55);
  for (let i = 0; i < 8; i++) {
    const a = Math.PI + (i + 0.5) * (Math.PI / 8);
    penPath(x, [[0, rim - 3], [Math.cos(a) * bw * 0.92, rim + Math.sin(a) * (bh + 6) * 0.9]], false, 0.3); x.stroke();
  }
  ink(x, 1.5);
  penPath(x, arcPts(0, rim, bw, bh + 8, Math.PI - 0.05, TAU + 0.05, 22), false, 0.5); x.stroke();
  penPath(x, [[-bw, rim], [bw, rim]], false, 0.4); x.stroke();
  // light organs along the rim
  x.fillStyle = AMBER;
  for (let i = 0; i < 5; i++) {
    x.beginPath(); x.arc(-bw * 0.8 + i * bw * 0.4, rim + 1.5, 1.3, 0, TAU); x.fill();
  }
}

// Glaucomedusa pallida: a tall bell trailing four very long threads.
function drawBellJelly(x, ph) {
  const s = Math.sin(ph * TAU);
  const w = 16 * (1 - s * 0.12), h = 30 * (1 + s * 0.08), rim = -10;
  ink(x, 0.8, 0.7);
  for (let i = 0; i < 4; i++) {
    const tx = (i / 3 - 0.5) * w * 1.4;
    const pts = [];
    for (let k = 0; k <= 12; k++) pts.push([tx + Math.sin(ph * TAU + i + k * 0.55) * (0.8 + k * 0.35), rim + 1 + k * 5.2]);
    penPath(x, pts, false, 0.3); x.stroke();
  }
  const bell = () => {
    x.beginPath();
    x.moveTo(-w, rim);
    x.bezierCurveTo(-w * 1.1, rim - h * 0.9, -w * 0.35, rim - h * 1.1, 0, rim - h * 1.1);
    x.bezierCurveTo(w * 0.35, rim - h * 1.1, w * 1.1, rim - h * 0.9, w, rim);
    x.closePath();
  };
  x.fillStyle = WASH;
  bell(); x.fill();
  hatch(x, bell, [-w, rim - h * 1.2, w * 2, h * 1.2], { from: 0.1, gap: 2.6, angle: -1.1 });
  ink(x, 0.9, 0.8);
  const sp = [];
  for (let k = 0; k <= 30; k++) { const a = k * 0.55, r = 1 + k * 0.22; sp.push([Math.cos(a) * r, rim - h * 0.45 + Math.sin(a) * r * 1.3]); }
  penPath(x, sp, false, 0.2); x.stroke();
  ink(x, 1.5);
  bell(); x.stroke();
  x.fillStyle = AMBER;
  x.beginPath(); x.arc(0, rim - h * 1.02, 1.6, 0, TAU); x.fill();
}

// Lychnoceras beebei, the lamp-horn: all jaw, one eye, and a light on a stalk.
function drawAngler(x, ph) {
  const s = Math.sin(ph * TAU);
  const body = () => {
    x.beginPath();
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const r = 22 + Math.sin(a * 3 + 1) * 1.6 + Math.cos(a * 5) * 1.1;
      const px = Math.cos(a) * r * 1.05, py = Math.sin(a) * r * 0.95 - 2;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.closePath();
  };
  ink(x, 1.1, 0.9);
  for (const side of [-1, 1]) {
    penPath(x, [[side * 21, -6], [side * (33 + s * 3), -14 + s * 3], [side * (30 + s * 2), -6], [side * (35 + s * 2), 2], [side * 21, 5]], false, 0.5);
    x.stroke();
  }
  x.fillStyle = 'rgba(11,29,68,0.55)';
  body(); x.fill();
  hatch(x, body, [-24, -26, 48, 48], { from: -0.1, gap: 2.4 });
  stipple(x, body, [-24, -26, 48, 24], 26, 0.6, 0.6);
  ink(x, 1.6);
  body(); x.stroke();
  x.fillStyle = DEEP;
  x.beginPath(); x.moveTo(-18, 5); x.quadraticCurveTo(0, 30 + s * 2, 18, 5); x.quadraticCurveTo(0, 13, -18, 5); x.fill();
  ink(x, 1.4);
  penPath(x, [[-18, 5], [-9, 20 + s], [0, 24 + s * 2], [9, 20 + s], [18, 5]], false, 0.4); x.stroke();
  x.fillStyle = PAPER;
  for (let i = 0; i < 8; i++) {
    const tx = -14 + i * 4 + jit(0.5), ty = 7 + Math.sin((i / 7) * Math.PI) * 5;
    const len = 3.5 + ((i * 7) % 4);
    x.beginPath(); x.moveTo(tx - 1.2, ty); x.lineTo(tx + jit(0.6), ty + len); x.lineTo(tx + 1.2, ty); x.fill();
  }
  // one small, unimpressed eye
  ink(x, 1.1);
  penCircle(x, -9, -9, 3.6, 0.2);
  x.fillStyle = PAPER;
  x.beginPath(); x.arc(-8.4, -8.6, 1.4, 0, TAU); x.fill();
  ink(x, 1.3);
  penPath(x, [[-3, -23], [0, -34], [6 + s * 2, -42], [15 + s * 2, -42 + s * 2], [19 + s * 2, -37 + s * 2]], false, 0.3);
  x.stroke();
  x.fillStyle = AMBER;
  x.beginPath(); x.arc(19 + s * 2, -35 + s * 2, 3.6, 0, TAU); x.fill();
}

// Acanthosphaera errans: a wandering ball of thorns.
function drawUrchin(x, ph, o) {
  const body = () => { x.beginPath(); x.arc(0, 0, 15, 0, TAU); };
  ink(x, 1.1);
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + o.twist[i] + ph * 0.3;
    const len = o.len[i] + Math.sin(ph * TAU + i) * 1.5;
    penPath(x, [[Math.cos(a) * 14, Math.sin(a) * 14], [Math.cos(a) * len, Math.sin(a) * len]], false, 0.3);
    x.stroke();
  }
  x.fillStyle = DEEP;
  body(); x.fill();
  hatch(x, body, [-15, -15, 30, 30], { from: 0, gap: 2.2 });
  x.fillStyle = PAPER;
  for (let r = 4; r < 14; r += 4.5) {
    const m = Math.round(r * 1.2);
    for (let k = 0; k < m; k++) {
      const a = (k / m) * TAU + r;
      x.beginPath(); x.arc(Math.cos(a) * r + jit(0.4), Math.sin(a) * r + jit(0.4), 0.9, 0, TAU); x.fill();
    }
  }
  ink(x, 1.6);
  penCircle(x, 0, 0, 15, 0.4);
}

// Teuthis: the head only; the arms are drawn live because they can be shot off.
function drawKraken(x, ph, o) {
  const s = Math.sin(ph * TAU);
  const w = 74 * (1 + s * 0.03), h = 96 * (1 - s * 0.03);
  const mantle = () => {
    x.beginPath();
    x.moveTo(-w, 30);
    x.bezierCurveTo(-w * 1.05, -h * 0.4, -w * 0.6, -h - 10, 0, -h - 12);
    x.bezierCurveTo(w * 0.6, -h - 10, w * 1.05, -h * 0.4, w, 30);
    x.quadraticCurveTo(0, 56, -w, 30);
    x.closePath();
  };
  for (const side of [-1, 1]) {
    const fin = () => { x.beginPath(); x.moveTo(side * 30, -h + 26); x.quadraticCurveTo(side * (86 + s * 4), -h + 4, side * 50, -h + 66); x.closePath(); };
    x.fillStyle = o.body;
    fin(); x.fill();
    ink(x, 0.8, 0.6);
    for (let k = 1; k < 6; k++) { penPath(x, [[side * 36, -h + 30 + k * 6], [side * (48 + k * 6), -h + 14 + k * 7]], false, 0.4); x.stroke(); }
    ink(x, 1.8);
    fin(); x.stroke();
  }
  x.fillStyle = o.body;
  mantle(); x.fill();
  hatch(x, mantle, [-w, -h - 14, w * 2, h + 70], { from: 0.05, gap: 3.4, width: 0.9 });
  hatch(x, mantle, [-w, -h - 14, w * 2, h + 70], { from: 0.5, gap: 1.7, width: 0.7 });
  ink(x, 0.9, 0.7);
  for (const [px, py, r] of o.spots) penCircle(x, px, py, r, 0.4);
  ink(x, 1.1, 0.8);
  for (const sc of o.scars) { penPath(x, sc, false, 0.5); x.stroke(); }
  ink(x, 2.2);
  mantle(); x.stroke();
  // eyes: dark sockets, amber irises, a heavy lid
  for (const side of [-1, 1]) {
    x.fillStyle = DEEP;
    x.beginPath(); x.ellipse(side * 30, 4, 17, 14, 0, 0, TAU); x.fill();
    ink(x, 1.8);
    penPath(x, arcPts(side * 30, 4, 17, 14, 0, TAU + 0.2, 26), false, 0.4); x.stroke();
    x.fillStyle = AMBER;
    x.beginPath(); x.ellipse(side * 30, 7, 9, 6, 0, 0, TAU); x.fill();
    x.fillStyle = DEEP;
    x.beginPath(); x.ellipse(side * 30, 7, 7, 1.8, 0, 0, TAU); x.fill();
    x.fillStyle = o.body;
    x.beginPath(); x.ellipse(side * 30, 4, 17.5, 14.5, 0, Math.PI, TAU); x.fill();
    ink(x, 2);
    penPath(x, [[side * 12, 3], [side * 30, 0], [side * 47, 2]], false, 0.4); x.stroke();
  }
  ink(x, 1.1);
  const n = o.barnacles;
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1) - 0.5;
    const bx = t * 70 + jit(3), by = -h - 4 + Math.abs(t) * 30;
    x.fillStyle = DEEP;
    penPath(x, [[bx - 6, by + 4], [bx - 3, by - 6], [bx + 3, by - 6], [bx + 6, by + 4]], true, 0.3);
    x.fill(); x.stroke();
  }
}

// ---------------------------------------------------------------- the sphere & its things

// A steel diving sphere with a lamp, a window and two little screw props.
function drawSphere(x) {
  const hull = () => { x.beginPath(); x.arc(0, -2, 21, 0, TAU); };
  ink(x, 1.3);
  for (const side of [-1, 1]) {
    x.fillStyle = DEEP;
    penPath(x, [[side * 18, 8], [side * 27, 12], [side * 27, 24], [side * 18, 22]], true, 0.3);
    x.fill(); x.stroke();
    penPath(x, [[side * 24, 26], [side * 24, 30]], false, 0.2); x.stroke();
  }
  x.fillStyle = DEEP;
  penPath(x, [[-6, 17], [6, 17], [3, 29], [-3, 29]], true, 0.3);
  x.fill(); x.stroke();
  x.fillStyle = '#284f93';
  hull(); x.fill();
  hatch(x, hull, [-21, -23, 42, 42], { from: 0.2, gap: 2.6 });
  ink(x, 2);
  penCircle(x, 0, -2, 21, 0.4);
  ink(x, 0.9, 0.8);
  penCircle(x, 0, -2, 17.5, 0.4);
  x.fillStyle = PAPER;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    x.beginPath(); x.arc(Math.cos(a) * 19.3, -2 + Math.sin(a) * 19.3, 0.8, 0, TAU); x.fill();
  }
  x.fillStyle = DEEP;
  x.beginPath(); x.arc(0, -5, 7.5, 0, TAU); x.fill();
  ink(x, 1.6);
  penCircle(x, 0, -5, 7.5, 0.2);
  ink(x, 0.8, 0.7);
  penPath(x, [[-3.5, -8], [-1, -10.5]], false, 0.1); x.stroke();
  ink(x, 1.2);
  penPath(x, [[-3, -22], [-4, -27], [4, -27], [3, -22]], false, 0.2); x.stroke();
  x.fillStyle = AMBER;
  x.beginPath(); x.arc(0, -28, 3, 0, TAU); x.fill();
}

function drawSpore(x) {
  const c = () => { x.beginPath(); x.arc(0, 0, 7, 0, TAU); };
  x.fillStyle = DEEP;
  c(); x.fill();
  hatch(x, c, [-7, -7, 14, 14], { gap: 2.2, alpha: 0.9, angle: -0.8 });
  hatch(x, c, [-7, -7, 14, 14], { gap: 2.2, alpha: 0.9, angle: 0.8 });
  ink(x, 1.6);
  penCircle(x, 0, 0, 7, 0.3);
}

function drawSpine(x) {
  x.strokeStyle = DEEP;
  x.lineWidth = 4;
  x.beginPath(); x.moveTo(0, -10); x.lineTo(0, 11); x.stroke();
  ink(x, 1.8);
  penPath(x, [[0, -11], [0, 12]], false, 0.3); x.stroke();
}

function drawPearl(x, big) {
  const r = big ? 7.5 : 5.5;
  x.fillStyle = PAPER;
  x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill();
  x.strokeStyle = big ? AMBER : DEEP;
  x.lineWidth = big ? 2 : 1.3;
  penCircle(x, 0, 0, r, 0.2);
  x.strokeStyle = PRUSSIAN;
  x.lineWidth = 1;
  x.beginPath(); x.arc(0, 0, r * 0.55, 0.3, 1.6); x.stroke();
}

function drawAir(x) {
  x.fillStyle = 'rgba(232,238,230,0.12)';
  x.beginPath(); x.arc(0, 0, 14, 0, TAU); x.fill();
  ink(x, 1.4);
  penCircle(x, 0, 0, 14, 0.3);
  ink(x, 1.6);
  x.beginPath(); x.arc(0, 0, 10, Math.PI * 1.1, Math.PI * 1.45); x.stroke();
  x.fillStyle = PAPER;
  x.font = '700 10px "Courier Prime", "Courier New", monospace';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('air', 0, 2);
}

function drawBarrel(x) {
  const shape = () => { x.beginPath(); x.moveTo(-14, -22); x.quadraticCurveTo(-20, 0, -14, 22); x.lineTo(14, 22); x.quadraticCurveTo(20, 0, 14, -22); x.closePath(); };
  x.fillStyle = DEEP;
  shape(); x.fill();
  hatch(x, shape, [-20, -22, 40, 44], { from: 0.1, gap: 2.6 });
  ink(x, 0.8, 0.6);
  for (const sx of [-7, 0, 7]) { penPath(x, [[sx, -22], [sx * 1.25, 0], [sx, 22]], false, 0.4); x.stroke(); }
  ink(x, 1.8);
  shape(); x.stroke();
  for (const by of [-13, 13]) { penPath(x, [[-17, by], [17, by]], false, 0.4); x.stroke(); }
}

function drawAnchor(x) {
  x.strokeStyle = DEEP;
  x.lineWidth = 7;
  x.beginPath(); x.arc(0, -24, 6, 0, TAU); x.moveTo(0, -18); x.lineTo(0, 22); x.moveTo(-16, -11); x.lineTo(16, -11); x.stroke();
  x.beginPath(); x.arc(0, 4, 22, Math.PI * 0.15, Math.PI * 0.85); x.stroke();
  ink(x, 1.8);
  penCircle(x, 0, -24, 6, 0.3);
  penPath(x, [[-3, -18], [-3, 22]], false, 0.3); x.stroke();
  penPath(x, [[3, -18], [3, 22]], false, 0.3); x.stroke();
  penPath(x, [[-16, -14], [16, -14], [16, -8], [-16, -8]], true, 0.3); x.stroke();
  penPath(x, arcPts(0, 4, 22, 22, Math.PI * 0.12, Math.PI * 0.88, 14), false, 0.4); x.stroke();
  for (const s of [-1, 1]) { penPath(x, [[s * 19, 12], [s * 27, 3], [s * 13, 9]], true, 0.3); x.stroke(); }
}

function drawBuoySprite(x) {
  x.fillStyle = DEEP;
  x.beginPath(); x.arc(0, 2, 9, 0, TAU); x.fill();
  ink(x, 1.6);
  penCircle(x, 0, 2, 9, 0.3);
  penPath(x, [[-9, 2], [9, 2]], false, 0.3); x.stroke();
  penPath(x, [[0, -7], [0, -15]], false, 0.2); x.stroke();
  x.fillStyle = AMBER;
  x.beginPath(); x.arc(0, -16, 2.6, 0, TAU); x.fill();
}

function drawHarpoon(x) {
  x.strokeStyle = AMBER;
  x.lineWidth = 1.8;
  penPath(x, [[0, 16], [0, -8]], false, 0.2); x.stroke();
  x.fillStyle = AMBER;
  x.beginPath(); x.moveTo(0, -17); x.lineTo(4, -6); x.lineTo(0, -8.5); x.lineTo(-4, -6); x.closePath(); x.fill();
  x.lineWidth = 1.3;
  x.beginPath(); x.moveTo(0, 12); x.lineTo(-3, 16); x.moveTo(0, 12); x.lineTo(3, 16); x.stroke();
}

function drawPing(x) {
  x.strokeStyle = AMBER;
  x.lineWidth = 2;
  penPath(x, arcPts(0, 12, 16, 16, Math.PI * 1.22, Math.PI * 1.78, 10), false, 0.2); x.stroke();
  x.lineWidth = 1;
  penPath(x, arcPts(0, 16, 16, 16, Math.PI * 1.28, Math.PI * 1.72, 10), false, 0.2); x.stroke();
}

function drawShotBubble(x) {
  x.strokeStyle = AMBER;
  x.lineWidth = 1.5;
  x.beginPath(); x.arc(0, 0, 4.5, 0, TAU); x.stroke();
  x.fillStyle = AMBER;
  x.beginPath(); x.arc(-1.5, -1.5, 1.1, 0, TAU); x.fill();
}

function makeGlow(hex) {
  return makeSprite(64, 64, x => {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 32);
    g.addColorStop(0, rgba(hex, 1));
    g.addColorStop(0.25, rgba(hex, 0.5));
    g.addColorStop(1, rgba(hex, 0));
    x.fillStyle = g;
    x.fillRect(-32, -32, 64, 64);
  });
}

// Tall seabed silhouettes that drift past as the sphere sinks.
function drawSpire(x, w, h, kelp) {
  x.fillStyle = '#000';
  if (kelp) {
    for (let k = 0; k < 4; k++) {
      const bx = rand(-w * 0.35, w * 0.35);
      x.beginPath();
      x.moveTo(bx - 3, h / 2);
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        x.lineTo(bx + Math.sin(t * 9 + k) * 14 - 3, h / 2 - t * h * 0.95);
      }
      for (let i = 20; i >= 0; i--) {
        const t = i / 20;
        x.lineTo(bx + Math.sin(t * 9 + k) * 14 + 3, h / 2 - t * h * 0.95);
      }
      x.fill();
      for (let i = 2; i < 18; i += 2) {
        const t = i / 20, y = h / 2 - t * h * 0.95, lx = bx + Math.sin(t * 9 + k) * 14;
        x.beginPath(); x.ellipse(lx + (i % 4 ? 10 : -10), y, 11, 4, i % 4 ? 0.5 : -0.5, 0, TAU); x.fill();
      }
    }
  } else {
    x.beginPath();
    x.moveTo(-w / 2, h / 2);
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      x.lineTo(-((w / 2) * (1 - t * 0.85) + rand(-8, 8)), h / 2 - t * h);
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      x.lineTo((w / 2) * (1 - t * 0.85) + rand(-8, 8), h / 2 - t * h);
    }
    x.closePath();
    x.fill();
  }
}

function urchinOpts() {
  const len = [], twist = [];
  for (let i = 0; i < 26; i++) { len.push(rand(24, 40)); twist.push(rand(-0.08, 0.08)); }
  return { len, twist };
}

Sprites.init = function () {
  const S = Sprites;
  S.sea = {
    jelly: buildSet(80, 110, drawSaucerJelly, {}),
    jellyB: buildSet(70, 130, drawBellJelly, {}),
    angler: buildSet(84, 100, drawAngler, {}),
    urchin: buildSet(90, 90, drawUrchin, urchinOpts()),
    kraken: buildSet(200, 230, drawKraken, {
      body: PRUSSIAN, barnacles: 3, scars: [],
      spots: [[-30, -70, 8], [22, -84, 5], [36, -40, 6], [-44, -24, 4], [8, -56, 3]],
    }, 4),
    krakenOld: buildSet(200, 230, drawKraken, {
      body: '#172f63', barnacles: 8,
      spots: [[-34, -62, 9], [26, -80, 7], [40, -36, 5], [-12, -40, 4]],
      scars: [[[-50, -60], [-20, -30]], [[-46, -64], [-18, -36]], [[30, -20], [55, -48]]],
    }, 4),
  };
  S.sphere = makeSprite(64, 72, drawSphere);
  S.spore = makeSprite(20, 20, drawSpore);
  S.spine = makeSprite(10, 28, drawSpine);
  S.pearl = makeSprite(16, 16, x => drawPearl(x, false));
  S.bigPearl = makeSprite(22, 22, x => drawPearl(x, true));
  S.air = makeSprite(34, 34, drawAir);
  S.barrel = makeSprite(44, 52, drawBarrel);
  S.anchor = makeSprite(64, 66, drawAnchor);
  S.buoy = makeSprite(22, 40, drawBuoySprite);

  // Only two kinds of light exist in this world: paper-white and lamp-amber.
  S.glow = { paper: makeGlow(PAPER), amber: makeGlow(AMBER) };
  S.ink = makeSprite(64, 64, x => {
    x.fillStyle = 'rgba(6,14,34,0.9)';
    x.beginPath();
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * TAU, r = 22 + rand(-6, 8);
      if (i) x.lineTo(Math.cos(a) * r, Math.sin(a) * r); else x.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    x.closePath();
    x.fill();
  });

  S.bullet = {
    harpoon: makeSprite(12, 36, drawHarpoon),
    sonar: makeSprite(40, 24, drawPing),
    bubble: makeSprite(12, 12, drawShotBubble),
  };

  S.spires = [
    makeSprite(160, 520, x => drawSpire(x, 150, 500, false)),
    makeSprite(120, 420, x => drawSpire(x, 110, 400, true)),
    makeSprite(220, 380, x => drawSpire(x, 200, 360, false)),
  ];
};
