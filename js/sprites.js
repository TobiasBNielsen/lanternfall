'use strict';

// Every graphic is drawn procedurally once at startup into offscreen canvases.
const Sprites = { ss: 2 };
const OUTLINE = '#0b1626';

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
  x.fillStyle = 'rgba(255,255,255,0.55)';
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

// Six animation frames (phase 0..1) plus white hit-flash copies.
function buildSet(w, h, drawFn, opts) {
  const frames = [], flash = [];
  for (let i = 0; i < 6; i++) {
    const sp = makeSprite(w, h, x => drawFn(x, i / 6, opts));
    frames.push(sp);
    flash.push(flashSprite(sp));
  }
  return { frames, flash };
}

function eyes(x, ex, ey, r, angry) {
  for (const s of [-1, 1]) {
    x.fillStyle = '#fffaf0';
    x.strokeStyle = OUTLINE;
    x.lineWidth = 1.6;
    x.beginPath(); x.arc(s * ex, ey, r, 0, TAU); x.fill(); x.stroke();
    x.fillStyle = OUTLINE;
    x.beginPath(); x.arc(s * ex + s * -0.6, ey + r * 0.25, r * 0.5, 0, TAU); x.fill();
    if (angry) {
      x.lineWidth = 2.4;
      x.beginPath(); x.moveTo(s * (ex + r + 1), ey - r - 3); x.lineTo(s * (ex - r + 1), ey - r + 1); x.stroke();
    }
  }
}

// ---------------------------------------------------------------- sea life

function drawJelly(x, ph, o) {
  const s = Math.sin(ph * TAU);
  const bw = 25 * (1 - s * 0.1), bh = 22 * (1 + s * 0.12);
  const top = -26;

  // trailing tentacles
  x.strokeStyle = rgba(o.c1, 0.75);
  x.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const tx = (i - 2) * bw * 0.36;
    x.beginPath();
    x.moveTo(tx, top + bh);
    for (let k = 1; k <= 6; k++) {
      const yy = top + bh + k * 6.5;
      x.lineTo(tx + Math.sin(ph * TAU + i * 1.3 + k * 0.9) * (2 + k * 0.7), yy);
    }
    x.stroke();
  }
  // frilly oral arms
  x.fillStyle = rgba(o.c2, 0.85);
  for (const side of [-1, 1]) {
    x.beginPath();
    x.moveTo(side * 5, top + bh - 2);
    for (let k = 0; k <= 5; k++) {
      const yy = top + bh + k * 5;
      x.lineTo(side * (7 + Math.sin(ph * TAU + k + side) * 3.5), yy);
    }
    x.lineTo(side * 2, top + bh + 26);
    x.closePath();
    x.fill();
  }
  // bell
  const g = x.createRadialGradient(-6, top + 4, 2, 0, top + bh * 0.6, bw * 1.2);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, o.c1); g.addColorStop(1, o.c2);
  x.fillStyle = g;
  x.strokeStyle = OUTLINE;
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(-bw, top + bh);
  x.bezierCurveTo(-bw, top - 4, bw, top - 4, bw, top + bh);
  const scal = 6;
  for (let i = 0; i < scal; i++) {
    const x0 = bw - (i * 2 * bw) / scal, x1 = bw - ((i + 1) * 2 * bw) / scal;
    x.quadraticCurveTo((x0 + x1) / 2, top + bh + 5, x1, top + bh);
  }
  x.closePath();
  x.fill(); x.stroke();
  // inner glow ring
  x.fillStyle = 'rgba(255,255,255,0.35)';
  x.beginPath(); x.ellipse(-bw * 0.35, top + bh * 0.25, bw * 0.22, bh * 0.2, -0.4, 0, TAU); x.fill();
  eyes(x, 7, top + bh * 0.62, 3.6, false);
}

function drawAngler(x, ph, o) {
  const s = Math.sin(ph * TAU);
  // lure stalk arcing over the head
  x.strokeStyle = o.c2;
  x.lineWidth = 2.6;
  x.beginPath();
  x.moveTo(-2, -20);
  x.quadraticCurveTo(4 + s * 3, -46, 18 + s * 2, -38 + s * 2);
  x.stroke();
  x.fillStyle = '#fff5c2';
  x.strokeStyle = OUTLINE;
  x.lineWidth = 1.5;
  x.beginPath(); x.arc(18 + s * 2, -35 + s * 2, 4.5, 0, TAU); x.fill(); x.stroke();

  // side fins
  x.fillStyle = o.c2;
  x.strokeStyle = OUTLINE;
  x.lineWidth = 1.8;
  for (const side of [-1, 1]) {
    x.beginPath();
    x.moveTo(side * 20, -2);
    x.lineTo(side * (34 + s * 3), -10 + s * 4);
    x.lineTo(side * (32 + s * 2), 6 + s * 2);
    x.closePath();
    x.fill(); x.stroke();
  }
  // body
  const g = x.createRadialGradient(-7, -10, 3, 0, 0, 30);
  g.addColorStop(0, o.c1); g.addColorStop(1, o.c2);
  x.fillStyle = g;
  x.lineWidth = 2.2;
  x.beginPath(); x.ellipse(0, 0, 23, 22, 0, 0, TAU); x.fill(); x.stroke();
  // speckles
  x.fillStyle = 'rgba(255,255,255,0.18)';
  for (const [px, py, r] of [[-10, -12, 2], [9, -14, 1.6], [14, -4, 1.3], [-15, -2, 1.4]]) {
    x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
  }
  // underbite full of needles
  x.fillStyle = '#1a0f1f';
  x.beginPath();
  x.moveTo(-17, 4);
  x.quadraticCurveTo(0, 26 + s * 2, 17, 4);
  x.quadraticCurveTo(0, 12, -17, 4);
  x.fill(); x.stroke();
  x.fillStyle = '#fffaf0';
  for (let i = 0; i < 7; i++) {
    const tx = -13 + i * 4.3;
    const ty = 6 + Math.sin((i / 6) * Math.PI) * 5;
    x.beginPath(); x.moveTo(tx - 1.6, ty); x.lineTo(tx, ty + 5); x.lineTo(tx + 1.6, ty); x.fill();
  }
  eyes(x, 9, -8, 4.2, true);
}

function drawUrchin(x, ph, o) {
  const n = 18;
  x.strokeStyle = o.c2;
  x.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + ph * 0.35;
    const len = (i % 2 ? 30 : 36) + Math.sin(ph * TAU + i) * 2;
    x.lineWidth = i % 2 ? 2.4 : 3.2;
    x.beginPath();
    x.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
    x.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    x.stroke();
  }
  x.fillStyle = o.tip;
  for (let i = 0; i < n; i += 2) {
    const a = (i / n) * TAU + ph * 0.35;
    const len = 36 + Math.sin(ph * TAU + i) * 2;
    x.beginPath(); x.arc(Math.cos(a) * len, Math.sin(a) * len, 2, 0, TAU); x.fill();
  }
  const g = x.createRadialGradient(-6, -7, 2, 0, 0, 22);
  g.addColorStop(0, o.c1); g.addColorStop(1, o.c2);
  x.fillStyle = g;
  x.strokeStyle = OUTLINE;
  x.lineWidth = 2.2;
  x.beginPath(); x.arc(0, 0, 20, 0, TAU); x.fill(); x.stroke();
  eyes(x, 7, -2, 4, true);
  x.strokeStyle = OUTLINE;
  x.lineWidth = 2;
  x.beginPath(); x.arc(0, 9, 5, Math.PI * 1.15, Math.PI * 1.85); x.stroke();
}

// The kraken's head only; its arms are drawn live because they move and can be shot off.
function drawKraken(x, ph, o) {
  const s = Math.sin(ph * TAU);
  const w = 74 * (1 + s * 0.03), h = 96 * (1 - s * 0.03);
  // fins
  x.fillStyle = o.c2;
  x.strokeStyle = OUTLINE;
  x.lineWidth = 3;
  for (const side of [-1, 1]) {
    x.beginPath();
    x.moveTo(side * 30, -h + 26);
    x.quadraticCurveTo(side * (84 + s * 4), -h + 6, side * 50, -h + 64);
    x.closePath();
    x.fill(); x.stroke();
  }
  // mantle
  const g = x.createRadialGradient(-22, -h + 30, 8, 0, -h / 2, h);
  g.addColorStop(0, o.c1); g.addColorStop(0.55, o.c2); g.addColorStop(1, o.c3);
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(-w, 30);
  x.bezierCurveTo(-w * 1.05, -h * 0.4, -w * 0.6, -h - 10, 0, -h - 12);
  x.bezierCurveTo(w * 0.6, -h - 10, w * 1.05, -h * 0.4, w, 30);
  x.quadraticCurveTo(0, 56, -w, 30);
  x.closePath();
  x.fill(); x.stroke();
  // spots
  x.fillStyle = 'rgba(255,255,255,0.14)';
  for (const [px, py, r] of [[-30, -70, 9], [22, -84, 6], [36, -40, 7], [-44, -24, 5], [8, -56, 4]]) {
    x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
  }
  // big tired eyes
  for (const side of [-1, 1]) {
    x.fillStyle = '#fff3c4';
    x.strokeStyle = OUTLINE;
    x.lineWidth = 2.6;
    x.beginPath(); x.ellipse(side * 30, 4, 17, 14, 0, 0, TAU); x.fill(); x.stroke();
    x.fillStyle = OUTLINE;
    x.beginPath(); x.ellipse(side * 30, 6, 9, 3.2, 0, 0, TAU); x.fill();
    // heavy lid
    x.fillStyle = o.c3;
    x.beginPath(); x.ellipse(side * 30, 4, 17, 14, 0, Math.PI, TAU); x.fill();
    x.lineWidth = 2.6;
    x.beginPath(); x.moveTo(side * 12, 1 + side * 0); x.lineTo(side * 47, -2); x.stroke();
  }
  // crown of barnacles (the hard variant wears more)
  x.fillStyle = '#d9d2bf';
  x.lineWidth = 1.8;
  const n = o.barnacles;
  for (let i = 0; i < n; i++) {
    const t = (i / Math.max(1, n - 1)) - 0.5;
    const bx = t * 70, by = -h - 4 + Math.abs(t) * 30;
    x.beginPath(); x.moveTo(bx - 6, by + 4); x.lineTo(bx - 3, by - 6); x.lineTo(bx + 3, by - 6); x.lineTo(bx + 6, by + 4); x.closePath();
    x.fill(); x.stroke();
  }
}

// ---------------------------------------------------------------- the sub & bits

function drawSub(x) {
  x.strokeStyle = OUTLINE;
  x.lineWidth = 2;
  // stern fins
  x.fillStyle = '#1f8a9e';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(s * 10, 14); x.lineTo(s * 25, 26); x.lineTo(s * 24, 32); x.lineTo(s * 9, 27);
    x.closePath(); x.fill(); x.stroke();
  }
  // side thrusters
  for (const s of [-1, 1]) {
    x.fillStyle = '#c9d6dc';
    roundRectPath(x, s * 22 - 5, -6, 10, 22, 4);
    x.fill(); x.stroke();
    x.fillStyle = '#1f8a9e';
    x.fillRect(s * 22 - 5, 10, 10, 3);
  }
  // hull
  const g = x.createLinearGradient(-17, 0, 17, 0);
  g.addColorStop(0, '#d98c00'); g.addColorStop(0.45, '#ffd84d'); g.addColorStop(1, '#c47a00');
  x.fillStyle = g;
  x.lineWidth = 2.2;
  x.beginPath();
  x.moveTo(0, -34);
  x.bezierCurveTo(17, -34, 18, -10, 17, 12);
  x.quadraticCurveTo(15, 30, 0, 32);
  x.quadraticCurveTo(-15, 30, -17, 12);
  x.bezierCurveTo(-18, -10, -17, -34, 0, -34);
  x.closePath();
  x.fill(); x.stroke();
  // rivets
  x.fillStyle = 'rgba(80,40,0,0.45)';
  for (let i = 0; i < 5; i++) {
    x.beginPath(); x.arc(-12, -8 + i * 8, 1.2, 0, TAU); x.arc(12, -8 + i * 8, 1.2, 0, TAU); x.fill();
  }
  // porthole
  x.fillStyle = '#9aa5ad';
  x.beginPath(); x.arc(0, -16, 10.5, 0, TAU); x.fill(); x.stroke();
  const gg = x.createRadialGradient(-3, -20, 1, 0, -16, 9);
  gg.addColorStop(0, '#dffcff'); gg.addColorStop(0.5, '#3bb6d6'); gg.addColorStop(1, '#0b3550');
  x.fillStyle = gg;
  x.lineWidth = 1.6;
  x.beginPath(); x.arc(0, -16, 7.5, 0, TAU); x.fill(); x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.8)';
  x.beginPath(); x.ellipse(-2.6, -19, 1.8, 2.8, -0.5, 0, TAU); x.fill();
  // headlamp
  x.fillStyle = '#fff6c9';
  x.beginPath(); x.ellipse(0, -32, 4, 2.4, 0, 0, TAU); x.fill(); x.stroke();
  // propeller hub
  x.fillStyle = '#5b6770';
  x.beginPath(); x.arc(0, 33, 3.5, 0, TAU); x.fill(); x.stroke();
}

function drawSpore(x) {
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 9);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#e6b3ff'); g.addColorStop(1, '#8a3fd1');
  x.fillStyle = g;
  x.strokeStyle = '#2a0f45';
  x.lineWidth = 1.6;
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU, r = i % 2 ? 6 : 8.5;
    i ? x.lineTo(Math.cos(a) * r, Math.sin(a) * r) : x.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  x.closePath();
  x.fill(); x.stroke();
}

function drawSpine(x) {
  x.fillStyle = '#ff9ad5';
  x.strokeStyle = '#3a0c2c';
  x.lineWidth = 1.3;
  x.beginPath();
  x.moveTo(0, 12); x.lineTo(2.6, -6); x.lineTo(0, -10); x.lineTo(-2.6, -6);
  x.closePath();
  x.fill(); x.stroke();
}

function drawPearl(x, big) {
  const r = big ? 9 : 6.5;
  const g = x.createRadialGradient(-r * 0.35, -r * 0.4, 0.5, 0, 0, r);
  if (big) { g.addColorStop(0, '#fffbe0'); g.addColorStop(0.5, '#ffd76a'); g.addColorStop(1, '#c98a14'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#f3e6f5'); g.addColorStop(1, '#b7a3c6'); }
  x.fillStyle = g;
  x.strokeStyle = OUTLINE;
  x.lineWidth = 1.5;
  x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill(); x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.9)';
  x.beginPath(); x.ellipse(-r * 0.35, -r * 0.4, r * 0.28, r * 0.18, -0.6, 0, TAU); x.fill();
}

function drawAir(x) {
  const g = x.createRadialGradient(0, 0, 6, 0, 0, 16);
  g.addColorStop(0, 'rgba(160,240,255,0.08)'); g.addColorStop(1, 'rgba(160,240,255,0.45)');
  x.fillStyle = g;
  x.strokeStyle = 'rgba(230,252,255,0.95)';
  x.lineWidth = 2;
  x.beginPath(); x.arc(0, 0, 15, 0, TAU); x.fill(); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,0.95)';
  x.lineWidth = 2.4;
  x.beginPath(); x.arc(0, 0, 10, Math.PI * 1.1, Math.PI * 1.45); x.stroke();
  x.fillStyle = '#e8fdff';
  x.font = '700 10px "Space Mono", monospace';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('O2', 0, 2);
}

function drawBarrel(x) {
  x.strokeStyle = OUTLINE;
  x.lineWidth = 2.2;
  const g = x.createLinearGradient(-18, 0, 18, 0);
  g.addColorStop(0, '#5a3418'); g.addColorStop(0.45, '#a8672e'); g.addColorStop(1, '#4a2a12');
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(-14, -22); x.quadraticCurveTo(-20, 0, -14, 22); x.lineTo(14, 22); x.quadraticCurveTo(20, 0, 14, -22);
  x.closePath(); x.fill(); x.stroke();
  x.strokeStyle = 'rgba(0,0,0,0.3)';
  x.lineWidth = 1.2;
  for (const sx of [-7, 0, 7]) { x.beginPath(); x.moveTo(sx, -22); x.quadraticCurveTo(sx * 1.25, 0, sx, 22); x.stroke(); }
  x.strokeStyle = '#6f7c83';
  x.lineWidth = 3;
  for (const by of [-13, 13]) { x.beginPath(); x.moveTo(-17, by); x.lineTo(17, by); x.stroke(); }
  // barnacle crust
  x.fillStyle = '#d9d2bf';
  x.beginPath(); x.arc(-8, 4, 2.6, 0, TAU); x.arc(-4, 8, 2, 0, TAU); x.fill();
}

function drawAnchor(x) {
  x.strokeStyle = OUTLINE;
  x.lineWidth = 2.2;
  const iron = '#5d6a73';
  x.fillStyle = iron;
  // ring
  x.lineWidth = 5; x.strokeStyle = iron;
  x.beginPath(); x.arc(0, -24, 6, 0, TAU); x.stroke();
  x.lineWidth = 2.2; x.strokeStyle = OUTLINE;
  x.beginPath(); x.arc(0, -24, 8.5, 0, TAU); x.stroke();
  // stock
  roundRectPath(x, -16, -14, 32, 6, 2); x.fill(); x.stroke();
  // shank
  roundRectPath(x, -3.5, -18, 7, 40, 2); x.fill(); x.stroke();
  // arms & flukes
  x.lineWidth = 7; x.strokeStyle = iron;
  x.beginPath(); x.arc(0, 4, 22, Math.PI * 0.15, Math.PI * 0.85); x.stroke();
  x.fillStyle = iron; x.strokeStyle = OUTLINE; x.lineWidth = 2;
  for (const s of [-1, 1]) {
    x.beginPath(); x.moveTo(s * 20, 10); x.lineTo(s * 26, 2); x.lineTo(s * 14, 8); x.closePath(); x.fill(); x.stroke();
  }
  x.fillStyle = 'rgba(160,90,40,0.45)';
  x.beginPath(); x.arc(-2, 2, 3, 0, TAU); x.arc(10, 18, 3.5, 0, TAU); x.fill();
}

function drawBuoySprite(x) {
  x.strokeStyle = OUTLINE;
  x.lineWidth = 1.8;
  x.fillStyle = '#ef4b2c';
  x.beginPath(); x.ellipse(0, 2, 8, 12, 0, 0, TAU); x.fill(); x.stroke();
  x.fillStyle = '#fff1d6';
  x.save(); x.beginPath(); x.ellipse(0, 2, 8, 12, 0, 0, TAU); x.clip();
  x.fillRect(-9, -2, 18, 5); x.restore();
  x.beginPath(); x.moveTo(0, -10); x.lineTo(0, -17); x.stroke();
  x.fillStyle = '#fff6c9';
  x.beginPath(); x.arc(0, -17, 2.4, 0, TAU); x.fill(); x.stroke();
}

function drawHarpoon(x) {
  x.strokeStyle = '#fff1d6';
  x.lineWidth = 2.2;
  x.beginPath(); x.moveTo(0, 16); x.lineTo(0, -8); x.stroke();
  x.fillStyle = '#ffd24d';
  x.beginPath(); x.moveTo(0, -17); x.lineTo(4.5, -6); x.lineTo(0, -8); x.lineTo(-4.5, -6); x.closePath(); x.fill();
  x.strokeStyle = '#ff9d4d';
  x.lineWidth = 1.6;
  x.beginPath(); x.moveTo(0, 12); x.lineTo(-3.5, 16); x.moveTo(0, 12); x.lineTo(3.5, 16); x.stroke();
}

function drawPing(x) {
  x.strokeStyle = 'rgba(77,225,255,0.35)';
  x.lineWidth = 7;
  x.beginPath(); x.arc(0, 10, 16, Math.PI * 1.2, Math.PI * 1.8); x.stroke();
  x.strokeStyle = '#b8f6ff';
  x.lineWidth = 2.6;
  x.beginPath(); x.arc(0, 10, 16, Math.PI * 1.22, Math.PI * 1.78); x.stroke();
}

function drawShotBubble(x) {
  x.fillStyle = 'rgba(140,240,190,0.35)';
  x.strokeStyle = '#d4ffe8';
  x.lineWidth = 1.8;
  x.beginPath(); x.arc(0, 0, 5.5, 0, TAU); x.fill(); x.stroke();
  x.fillStyle = '#ffffff';
  x.beginPath(); x.arc(-1.8, -1.8, 1.4, 0, TAU); x.fill();
}

function makeGlow(hex) {
  return makeSprite(64, 64, x => {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 32);
    g.addColorStop(0, rgba(hex, 1));
    g.addColorStop(0.25, rgba(hex, 0.55));
    g.addColorStop(1, rgba(hex, 0));
    x.fillStyle = g;
    x.fillRect(-32, -32, 64, 64);
  });
}

// Tall seabed silhouettes that drift past as the sub sinks.
function drawSpire(x, w, h, kelp) {
  x.fillStyle = '#000';
  if (kelp) {
    for (let k = 0; k < 4; k++) {
      const bx = rand(-w * 0.35, w * 0.35);
      x.beginPath();
      x.moveTo(bx - 3, h / 2);
      for (let i = 0; i <= 20; i++) {
        const t = i / 20, y = h / 2 - t * h * rand(0.7, 1);
        x.lineTo(bx + Math.sin(t * 9 + k) * 14 - 3, y);
      }
      for (let i = 20; i >= 0; i--) {
        const t = i / 20, y = h / 2 - t * h * 0.95;
        x.lineTo(bx + Math.sin(t * 9 + k) * 14 + 3, y);
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
      const y = h / 2 - t * h;
      const half = (w / 2) * (1 - t * 0.85) + rand(-8, 8);
      x.lineTo(-half, y);
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const y = h / 2 - t * h;
      const half = (w / 2) * (1 - t * 0.85) + rand(-8, 8);
      x.lineTo(half, y);
    }
    x.closePath();
    x.fill();
  }
}

Sprites.init = function () {
  const S = Sprites;
  S.sea = {
    jelly: buildSet(80, 110, drawJelly, { c1: '#ff9ed8', c2: '#b0409a' }),
    jellyB: buildSet(80, 110, drawJelly, { c1: '#9fe8ff', c2: '#2f78b8' }),
    angler: buildSet(84, 96, drawAngler, { c1: '#6f5a86', c2: '#2c2140' }),
    urchin: buildSet(84, 84, drawUrchin, { c1: '#8f5bd6', c2: '#3a1a66', tip: '#ffb3e6' }),
    kraken: buildSet(200, 230, drawKraken, { c1: '#ff9a6b', c2: '#d6503a', c3: '#7a2218', barnacles: 3 }),
    krakenOld: buildSet(200, 230, drawKraken, { c1: '#b999ff', c2: '#6a3fb5', c3: '#2d1463', barnacles: 7 }),
  };
  S.sub = makeSprite(64, 76, drawSub);
  S.spore = makeSprite(22, 22, drawSpore);
  S.spine = makeSprite(10, 28, drawSpine);
  S.pearl = makeSprite(18, 18, x => drawPearl(x, false));
  S.bigPearl = makeSprite(24, 24, x => drawPearl(x, true));
  S.air = makeSprite(36, 36, drawAir);
  S.barrel = makeSprite(44, 52, drawBarrel);
  S.anchor = makeSprite(64, 66, drawAnchor);
  S.buoy = makeSprite(22, 40, drawBuoySprite);

  S.glow = {};
  const GLOWS = { white: '#ffffff', amber: '#ffd23f', orange: '#ff8a1f', red: '#ff3b3b', green: '#4dff9a', blue: '#4da6ff', purple: '#b36bff', cyan: '#4de1ff', pink: '#ff5fa2' };
  for (const k in GLOWS) S.glow[k] = makeGlow(GLOWS[k]);
  S.ink = makeSprite(64, 64, x => {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 32);
    g.addColorStop(0, 'rgba(8,6,20,0.95)'); g.addColorStop(1, 'rgba(8,6,20,0)');
    x.fillStyle = g; x.fillRect(-32, -32, 64, 64);
  });

  S.bullet = {
    harpoon: makeSprite(12, 36, drawHarpoon),
    sonar: makeSprite(40, 24, drawPing),
    bubble: makeSprite(14, 14, drawShotBubble),
  };

  S.spires = [
    makeSprite(160, 520, x => drawSpire(x, 150, 500, false)),
    makeSprite(120, 420, x => drawSpire(x, 110, 400, true)),
    makeSprite(220, 380, x => drawSpire(x, 200, 360, false)),
  ];
};
