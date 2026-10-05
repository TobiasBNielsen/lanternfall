'use strict';

// Drawing: the water, creatures, bosses, shots, the sphere, and text painted onto the canvas.

let shakeX = 0, shakeY = 0;

function render() {
  const k = View.scale * View.dpr;
  const W = View.W, H = View.H;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  Background.draw(ctx);

  if (state === 'menu') {
    drawMenuSchool();
  } else if (G) {
    // one shake offset per frame, shared by both passes
    shakeX = G.shake > 0 ? rand(-G.shake, G.shake) * 0.5 : 0;
    shakeY = G.shake > 0 ? rand(-G.shake, G.shake) * 0.5 : 0;
    ctx.setTransform(k, 0, 0, k, k * shakeX, k * shakeY);
    drawPickups();
    drawEnemies();
    drawShots();
    drawPlayer();
    drawBuoy();
    drawParticles('normal');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawDarkness();
    ctx.setTransform(k, 0, 0, k, k * shakeX, k * shakeY);
    // the sphere's shots are amber light, so they sit above the dark and need no hole cut for them
    drawBullets();
    drawParticles('add');
    drawTexts();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawBossBar();
    drawBanner();
  }

  if (G && G.flash > 0 && state !== 'menu') {
    ctx.fillStyle = `rgba(232,238,230,${Math.min(1, G.flash)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// Deep water swallows everything except whatever glows: the sub's lamp, lures, jellies, spores.
function drawDarkness() {
  const d = Math.max(Background.darkness(), G.forceDark || 0);
  if (d <= 0.01) return;
  const W = View.W, H = View.H;
  // the light mask only needs refreshing every other frame; nobody can see a 16 ms lag in a shadow
  darkTick = !darkTick;
  if (darkTick && state === 'playing') { ctx.drawImage(darkCanvas, 0, 0, W, H); return; }
  const dc = darkCtx;
  dc.setTransform(DARK_RES, 0, 0, DARK_RES, 0, 0);
  dc.globalCompositeOperation = 'source-over';
  dc.clearRect(0, 0, W, H);
  dc.fillStyle = `rgba(2,6,20,${d})`;
  dc.fillRect(0, 0, W, H);
  dc.globalCompositeOperation = 'destination-out';
  const glow = Sprites.glow.paper.c;
  const hole = (x, y, s, a = 1) => { dc.globalAlpha = a; dc.drawImage(glow, x - s / 2, y - s / 2, s, s); };
  const p = G.player;
  if (p.alive) { hole(p.x, p.y - 150, 460, 1); hole(p.x, p.y, 230, 1); }
  for (const e of G.enemies) {
    if (e.hidden || e.dead) continue;
    if (e.type === 'sea') {
      if (e.kind === 'angler') hole(e.x + 18, e.y - 35, 170, 1);
      else if (e.kind === 'urchin') hole(e.x, e.y, 110, 0.5);
      else hole(e.x, e.y - 10, 150, 0.8);
    } else if (e.type === 'boss') {
      if (e.variant === 'queen') hole(e.hx, e.hy, e.blackout > 0 ? 150 : 330, 1);
      else hole(e.x, e.y - 40, 360, 0.6);
    }
    else if (e.type === 'arm') hole(e.x, e.y, 120, 0.5);
    else hole(e.x, e.y, 90, 0.4);
  }
  for (const s of G.shots) hole(s.x, s.y, 70, 1);
  for (const pk of G.pickups) hole(pk.x, pk.y, 80, 0.9);
  if (G.buoy) hole(G.buoy.x, G.buoy.y, 160, 1);
  for (const b of G.bullets) {
    if (b.kind === 'flare') hole(b.x, b.y, 300, 1);
    else if (b.kind === 'net' && b.open > 0) hole(b.x, b.y, b.r * 2.2, 0.5);
  }
  dc.globalAlpha = 1;
  ctx.drawImage(darkCanvas, 0, 0, W, H);
}

function drawParticles(layer) {
  if (layer === 'add') ctx.globalCompositeOperation = 'lighter';
  for (const p of G.particles) {
    if (p.layer !== layer) continue;
    const k = p.life / p.max;
    const sz = p.size * (1 + p.grow * (1 - k));
    switch (p.kind) {
      case 'glow':
        ctx.globalAlpha = Math.min(1, k * 1.6) * p.alpha;
        if (p.color === 'amber') {
          ctx.drawImage(Sprites.glow.amber.c, p.x - sz / 2, p.y - sz / 2, sz, sz);
        } else {
          // everything that isn't a lamp is drawn as a pen dot
          ctx.fillStyle = PAPER;
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.8, sz * 0.08), 0, TAU); ctx.fill();
        }
        break;
      case 'ring': {
        const r = lerp(p.r0, p.r1, ease.outCubic(1 - k));
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width * k + 0.5;
        if (p.dash) ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
        if (p.dash) ctx.setLineDash([]);
        break;
      }
      case 'arc': {
        // a spark jumping between creatures: a jagged amber line with a white core
        ctx.globalAlpha = k;
        const n = 7, dx = (p.x2 - p.x) / n, dy = (p.y2 - p.y) / n, len = Math.hypot(dx, dy);
        const nx = -dy / (len || 1), ny = dx / (len || 1);
        for (const [w, col] of [[3, AMBER], [1, PAPER]]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          for (let i = 1; i < n; i++) {
            const off = Math.sin(p.seed + i * 2.7 + G.time * 60) * 9;
            ctx.lineTo(p.x + dx * i + nx * off, p.y + dy * i + ny * off);
          }
          ctx.lineTo(p.x2, p.y2);
          ctx.stroke();
        }
        break;
      }
      case 'ink':
        ctx.globalAlpha = Math.min(1, k * 1.5) * 0.85;
        ctx.drawImage(Sprites.ink.c, p.x - sz / 2, p.y - sz / 2, sz, sz);
        break;
      case 'bubble':
        ctx.globalAlpha = Math.min(1, k * 2) * 0.8;
        ctx.strokeStyle = PAPER;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.stroke();
        break;
      case 'debris':
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(-p.size / 2, 0); ctx.lineTo(p.size / 2, 0); ctx.stroke();
        ctx.restore();
        break;
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawPickups() {
  for (const pk of G.pickups) {
    if (pk.type === 'pearl') {
      const big = pk.value > 1;
      if (big) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.3;
        ctx.drawImage(Sprites.glow.amber.c, pk.x - 22, pk.y - 22, 44, 44);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      drawSprite(ctx, big ? Sprites.bigPearl : Sprites.pearl, pk.x, pk.y);
    } else {
      const s = 1 + Math.sin(pk.t * 4) * 0.06;
      drawSprite(ctx, Sprites.air, pk.x, pk.y, 0, s);
    }
  }
}

// Lines "boil" a few times a second, like pencil animation, independent of the creature's own motion.
function boilIndex(seed) { return (Math.floor(performance.now() / 140) + seed) % BOIL; }

function creatureFrame(e) {
  let key = e.type === 'boss' ? e.sprite : e.type === 'seg' ? 'colonySeg' : e.kind;
  if (key === 'gulper' && e.open > 0) key = 'gulperOpen';
  const set = Sprites.sea[key];
  const i = Math.floor(e.anim) % set.count;
  const b = boilIndex(e.boilSeed || 0);
  return e.flash > 0 ? set.flash[i][b] : set.frames[i][b];
}

const ARM_COLORS = { kraken: PRUSSIAN, krakenOld: '#172f63' };

function drawArm(arm, b) {
  const pts = arm.pts;
  if (!pts.length) return;
  const n = pts.length;
  const rad = i => lerp(16, 4.5, i / (n - 1));
  // outline first, then the body over it, so only the outer edge of the union stays white
  ctx.fillStyle = PAPER;
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], rad(i) + 1.8, 0, TAU); ctx.fill(); }
  ctx.fillStyle = arm.flash > 0 ? '#6f8fc9' : ARM_COLORS[b.sprite];
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], rad(i), 0, TAU); ctx.fill(); }
  if (arm.dead) {
    const [x, y] = pts[n - 1];
    ctx.fillStyle = DEEP;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill();
    return;
  }
  ctx.strokeStyle = 'rgba(232,238,230,0.65)';
  ctx.lineWidth = 0.9;
  for (let i = 1; i < n; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const a = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
    const r = rad(i);
    // shading strokes on the shadow side, suckers on the other
    ctx.beginPath();
    ctx.moveTo(x1 + Math.cos(a) * r * 0.2, y1 + Math.sin(a) * r * 0.2);
    ctx.lineTo(x1 + Math.cos(a) * r * 0.9, y1 + Math.sin(a) * r * 0.9);
    ctx.stroke();
    if (i % 2 === 0) {
      ctx.beginPath(); ctx.arc(x1 - Math.cos(a) * r * 0.5, y1 - Math.sin(a) * r * 0.5, Math.max(1.2, r * 0.28), 0, TAU); ctx.stroke();
    }
  }
}

function drawEnemies() {
  for (const e of G.enemies) {
    if (e.hidden || e.type !== 'wreck') continue;
    drawSprite(ctx, e.sprite, e.x, e.y, e.rot);
    if (e.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      drawSprite(ctx, e.sprite, e.x, e.y, e.rot, 1, 0.4);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  // the only glow a creature has is the lamp-horn's lamp, and it flickers before it spits
  const dk = Background.darkness();
  ctx.globalCompositeOperation = 'lighter';
  for (const e of G.enemies) {
    if (e.hidden || e.type !== 'sea' || e.kind !== 'angler') continue;
    let a = 0.35 + dk * 0.6;
    if (e.tell > 0) a *= Math.floor(e.tell * 14) % 2 ? 1.8 : 0.3;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(Sprites.glow.amber.c, e.x + 19 - 28, e.y - 35 - 28, 56, 56);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // the thread that strings a chain colony together
  ctx.strokeStyle = 'rgba(232,238,230,0.6)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const e of G.enemies) {
    if (e.kind !== 'chain' || e.dead || !e.lead || e.lead.dead) continue;
    ctx.moveTo(e.x, e.y - 4); ctx.lineTo(e.lead.x, e.lead.y + 6);
  }
  ctx.stroke();
  for (const e of G.enemies) {
    if (e.hidden || e.type !== 'sea') continue;
    let sc = e.scale || 1, x = e.x;
    if (e.tell > 0 && e.kind !== 'angler') {
      if (e.kind === 'gulper') x += Math.sin(e.tell * 60) * 3;
      // jellies and thorns draw themselves in before they let go
      else sc *= 1 - Math.sin((e.tell / 0.35) * Math.PI) * 0.08;
    }
    const f = creatureFrame(e);
    if (e.flip) {
      ctx.save();
      ctx.translate(x, e.y);
      ctx.scale(-1, 1);
      drawSprite(ctx, f, 0, 0, -e.rot, sc);
      ctx.restore();
    } else {
      drawSprite(ctx, f, x, e.y, e.rot, sc);
    }
  }
  const b = G.boss;
  if (b && !b.dead && b.variant === 'queen') drawQueenBoss(b);
  else if (b && !b.dead && b.variant === 'colony') drawColonyBoss(b);
  else if (b && !b.dead) {
    for (const arm of b.arms) drawArm(arm, b);
    const by = b.y + Math.sin(G.time * 1.6) * 5;
    drawSprite(ctx, creatureFrame(b), b.x, by, b.rot);
    if (b.armsLeft > 0 && b.state === 'fight') {
      ctx.strokeStyle = 'rgba(232,238,230,0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 7]);
      ctx.lineDashOffset = -G.time * 12;
      ctx.beginPath(); ctx.ellipse(b.x, by - 40, 94, 106, 0, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function drawQueenBoss(b) {
  const by = b.y + Math.sin(G.time * 1.2) * 4;
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(b.x + 6, by - 80);
  ctx.quadraticCurveTo(b.x + 24 + b.sway * 0.3, by - 180, b.hx, b.hy + 8);
  ctx.stroke();
  drawSprite(ctx, creatureFrame(b), b.x, by, b.rot);
  // her lamp: the only thing in the water worth aiming at
  const dim = b.blackout > 0 ? 0.35 : 1;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (0.75 + Math.sin(G.time * 5) * 0.15) * dim;
  ctx.drawImage(Sprites.glow.amber.c, b.hx - 55, b.hy - 55, 110, 110);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = b.flash > 0 ? PAPER : AMBER;
  ctx.beginPath(); ctx.arc(b.hx, b.hy, 10, 0, TAU); ctx.fill();
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(b.hx, b.hy, 10, 0, TAU); ctx.stroke();
}

function drawColonyBoss(b) {
  let tail = -1;
  for (let i = b.arms.length - 1; i >= 0; i--) if (!b.arms[i].dead) { tail = i; break; }
  ctx.strokeStyle = 'rgba(232,238,230,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  for (let i = 0; i <= tail; i++) ctx.lineTo(b.arms[i].x, b.arms[i].y);
  ctx.stroke();
  for (let i = tail; i >= 0; i--) {
    const s = b.arms[i];
    if (s.dead) continue;
    drawSprite(ctx, creatureFrame(s), s.x, s.y, s.rot);
  }
  if (tail >= 0 && b.state === 'fight') {
    // the one bell that can be cut right now
    const s = b.arms[tail];
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.lineDashOffset = -G.time * 18;
    ctx.beginPath(); ctx.arc(s.x, s.y, 30, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }
  drawSprite(ctx, creatureFrame(b), b.x, b.y, b.rot);
  if (b.armsLeft > 0 && b.state === 'fight') {
    ctx.strokeStyle = 'rgba(232,238,230,0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 7]);
    ctx.beginPath(); ctx.arc(b.x, b.y, 50, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawShots() {
  for (const s of G.shots) {
    if (s.kind === 'spine') drawSprite(ctx, Sprites.spine, s.x, s.y, Math.atan2(s.vy, s.vx) - Math.PI / 2);
    else drawSprite(ctx, Sprites.spore, s.x, s.y, s.t * 3);
  }
}

// A net: a folded bundle in flight, then a mesh of amber cord once it opens.
function drawNet(b) {
  ctx.strokeStyle = AMBER;
  if (!b.open) {
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, TAU); ctx.moveTo(b.x - 6, b.y); ctx.lineTo(b.x + 6, b.y); ctx.moveTo(b.x, b.y - 6); ctx.lineTo(b.x, b.y + 6); ctx.stroke();
    return;
  }
  const r = b.r;
  ctx.globalAlpha = Math.min(1, b.open * 2);
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.clip();
  ctx.lineWidth = 0.8;
  ctx.globalAlpha *= 0.55;
  ctx.beginPath();
  for (let d = -r; d <= r; d += 13) {
    ctx.moveTo(b.x - r, b.y + d - r); ctx.lineTo(b.x + r, b.y + d + r);
    ctx.moveTo(b.x - r, b.y + d + r); ctx.lineTo(b.x + r, b.y + d - r);
  }
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

// Hundreds of these a second: skip save/restore and set the transform directly.
function drawBullets() {
  const k = View.scale * View.dpr, ox = k * shakeX, oy = k * shakeY;
  for (const b of G.bullets) {
    if (b.kind === 'net') { drawNet(b); continue; }
    if (b.kind === 'flare') {
      ctx.globalCompositeOperation = 'lighter';
      const g = 60 + Math.sin(G.time * 40 + b.x) * 10;
      ctx.drawImage(Sprites.glow.amber.c, b.x - g / 2, b.y - g / 2, g, g);
      ctx.globalCompositeOperation = 'source-over';
    }
    const sp = Sprites.bullet[b.kind];
    if (b.kind === 'bubble' || Math.abs(b.ang) < 0.02) {
      ctx.drawImage(sp.c, b.x - sp.w / 2, b.y - sp.h / 2, sp.w, sp.h);
    } else {
      const c = Math.cos(b.ang) * k, s = Math.sin(b.ang) * k;
      ctx.setTransform(c, s, -s, c, k * b.x + ox, k * b.y + oy);
      ctx.drawImage(sp.c, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
      ctx.setTransform(k, 0, 0, k, ox, oy);
    }
  }
}

let lampCone = null;

function drawPlayer() {
  const p = G.player;
  if (!p.alive) return;
  const blink = p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0;
  ctx.save();
  // the sphere never quite sits still: it bobs and rolls a little on its own
  ctx.translate(p.x, p.y + Math.sin(G.time * 2.1) * 1.6);

  ctx.globalCompositeOperation = 'lighter';
  if (!lampCone) {
    lampCone = ctx.createLinearGradient(0, -30, 0, -260);
    lampCone.addColorStop(0, 'rgba(242,169,59,0.16)');
    lampCone.addColorStop(1, 'rgba(242,169,59,0)');
  }
  ctx.fillStyle = lampCone;
  ctx.beginPath(); ctx.moveTo(-5, -30); ctx.lineTo(5, -30); ctx.lineTo(75, -260); ctx.lineTo(-75, -260); ctx.closePath(); ctx.fill();
  if (p.muzzle > 0) ctx.drawImage(Sprites.glow.amber.c, -16, -50, 32, 32);
  ctx.globalCompositeOperation = 'source-over';
  if (p.invuln > 0) {
    ctx.strokeStyle = 'rgba(232,238,230,0.5)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([2, 5]);
    ctx.lineDashOffset = G.time * 20;
    ctx.beginPath(); ctx.arc(0, -2, 34, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = 'rgba(232,238,230,0.6)';
  ctx.lineWidth = 1.4;
  for (const sx of [-24, 24]) {
    const pw = Math.abs(Math.sin(p.prop + sx)) * 5 + 1;
    ctx.beginPath(); ctx.moveTo(sx - pw, 31); ctx.lineTo(sx + pw, 31); ctx.stroke();
  }

  ctx.rotate(p.tilt * 0.3 + Math.sin(G.time * 1.3) * 0.04);
  ctx.globalAlpha = blink ? 0.4 : 1;
  const s = Sprites.sphere;
  ctx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
  ctx.restore();
}

function drawBuoy() {
  const m = G.buoy;
  if (!m) return;
  drawSprite(ctx, Sprites.buoy, m.x, m.y, m.ang);
}

function drawTexts() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of G.texts) {
    const k = t.life / t.max;
    ctx.globalAlpha = Math.min(1, k * 3);
    ctx.font = `italic ${t.size}px ${DISPLAY_FONT}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(8,20,50,0.75)';
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
}

const DISPLAY_FONT = '"IM Fell English", Georgia, serif';
const MONO_FONT = '"Courier Prime", "Courier New", monospace';
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

function drawBossBar() {
  const b = G.boss;
  if (!b || b.dead || b.state === 'enter') return;
  const W = View.W;
  const w = Math.min(420, W - 60), x = Math.round((W - w) / 2), y = W < 700 ? 116 : 92, h = 5;
  let k, label;
  if (b.armsLeft > 0) {
    let hp = 0, max = 0;
    for (const a of b.arms) { hp += Math.max(0, a.hp); max += a.maxhp; }
    k = hp / max;
    label = b.variant === 'colony' ? `bells: ${b.armsLeft}` : `arms: ${'|'.repeat(b.armsLeft)}`;
  } else {
    k = clamp(b.hp / b.maxhp, 0, 1);
    label = b.variant === 'queen' ? 'the lamp' : b.variant === 'colony' ? 'the float' : 'the head';
  }
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.fillStyle = b.armsLeft > 0 ? PAPER : AMBER;
  ctx.fillRect(x + 2, y + 2, Math.max(0, (w - 3) * k), h - 3);
  ctx.fillStyle = PAPER;
  ctx.textAlign = 'left';
  ctx.font = `italic 19px ${DISPLAY_FONT}`;
  ctx.fillText(b.name, x, y - 8);
  ctx.textAlign = 'right';
  ctx.font = `14px ${MONO_FONT}`;
  ctx.fillText(label, x + w, y - 8);
}

// Each wave opens like an entry in the log: depth and water, a heading, one line of notes.
function drawBanner() {
  const W = View.W, H = View.H;
  let title = null, kicker = null, note = null;
  const t = G.waveT, dur = 2.4;
  if (G.waveState === 'intro') {
    title = G.waveDef.title;
    kicker = `${G.depth.toLocaleString('en-US')} m, ${zoneAt(G.depth).name}`;
    note = G.waveDef.note;
  } else if (G.waveState === 'clear' && G.gameOverT <= 0) {
    title = 'Clear water';
    kicker = `${G.depth.toLocaleString('en-US')} m`;
    note = `${G.clearBonus.toLocaleString('en-US')} points for the log.`;
  }
  if (!title) return;
  const a = t < 0.4 ? t / 0.4 : t > dur - 0.4 ? Math.max(0, (dur - t) / 0.4) : 1;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(W / 2, H * 0.4);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = Math.min(58, W / 10);
  ctx.font = `italic ${size}px ${DISPLAY_FONT}`;
  const maxW = W - 60;
  const tw = ctx.measureText(title).width;
  if (tw > maxW) { size *= maxW / tw; ctx.font = `italic ${size}px ${DISPLAY_FONT}`; }
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(8,20,50,0.55)';
  ctx.strokeText(title, 0, 0);
  ctx.fillStyle = PAPER;
  ctx.fillText(title, 0, 0);

  ctx.font = `15px ${MONO_FONT}`;
  ctx.fillStyle = G.waveDef.type === 'kraken' && G.waveState === 'intro' ? AMBER : PAPER;
  ctx.fillText(kicker, 0, -size * 0.95);
  // a rule that draws itself across, like a pen stroke
  const rw = Math.min(W - 80, Math.max(tw, 260)) * ease.outCubic(clamp(t / 0.6, 0, 1));
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-rw / 2, -size * 0.62); ctx.lineTo(rw / 2, -size * 0.6); ctx.stroke();
  if (note) {
    ctx.font = `15px ${MONO_FONT}`;
    ctx.fillStyle = 'rgba(232,238,230,0.85)';
    ctx.fillText(note, 0, size * 0.8, W - 40);
  }
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

// ---------------------------------------------------------------- menu scene

function buildMenuSchool() {
  menuSchool = [];
  const kinds = ['jelly', 'jellyB', 'angler', 'chain', 'urchin', 'jellyB', 'pyro', 'jelly', 'angler'];
  kinds.forEach(kind => {
    menuSchool.push({ kind, x: rand(View.W), y: rand(View.H), vy: rand(-26, -12), ph: rand(TAU), anim: rand(6), scale: rand(0.75, 1.15), seed: randi(0, 9) });
  });
}

function drawMenuSchool() {
  for (const c of menuSchool) {
    const set = Sprites.sea[c.kind];
    const f = set.frames[Math.floor(c.anim) % set.count][boilIndex(c.seed)];
    drawSprite(ctx, f, c.x + Math.sin(c.ph) * 30, c.y, Math.sin(c.ph) * 0.12, c.scale, 0.75);
  }
}

function updateMenu(dt) {
  for (const c of menuSchool) {
    c.y += c.vy * dt;
    c.ph += dt * 0.5;
    c.anim += dt * (c.kind === 'angler' ? 9 : 4);
    if (c.y < -80) { c.y = View.H + 80; c.x = rand(View.W); }
  }
}
