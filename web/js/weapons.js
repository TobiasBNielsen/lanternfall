'use strict';

// The six weapons: how each one fires, and how its shots, flares and nets behave once fired.

const WEAPONS = {
  harpoon: { name: 'harpoon', rate: 0.17, blurb: 'heavy bolts that go clean through a line of them' },
  sonar: { name: 'sonar ring', rate: 0.14, blurb: 'wide pings that fan out across the water' },
  bubble: { name: 'bubble gun', rate: 0.075, blurb: 'a quick, wobbly stream of stinging bubbles' },
  flare: { name: 'flare gun', rate: 0.42, blurb: 'flares that stick, light up the dark, then burst' },
  net: { name: 'net', rate: 0.55, blurb: 'a slow net that opens wide and tangles whatever it catches' },
  coil: { name: 'galvanic coil', rate: 0.2, blurb: 'a spark that jumps from one creature to the next' },
};

function fireWeapon(p) {
  const L = G.level, w = G.weapon, mul = 1 + (L - 1) * 0.1;
  const x = p.x, y = p.y - 34;
  if (w === 'harpoon') {
    const n = [1, 1, 2, 2, 3, 3, 3, 4, 4, 5][L - 1];
    for (let i = 0; i < n; i++) {
      const t = i - (n - 1) / 2;
      const b = addBullet(x + t * 12, y - Math.abs(t) * -4, t * 0.025, 1150, 1.9 * mul, 'harpoon', 7);
      b.pierce = true; b.hits = [];
    }
  } else if (w === 'sonar') {
    const n = [1, 2, 3, 3, 4, 5, 5, 6, 7, 7][L - 1];
    const spread = n === 1 ? 0 : Math.min(0.09 * (n - 1) + (L >= 4 ? 0.1 : 0), 0.8);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      addBullet(x + t * 10, y, t * spread, 820, 1.0 * mul, 'sonar', 12);
    }
  } else if (w === 'bubble') {
    const n = [1, 1, 2, 2, 2, 3, 3, 4, 4, 5][L - 1];
    for (let i = 0; i < n; i++) {
      const t = i - (n - 1) / 2;
      const b = addBullet(x + t * 9, y, t * 0.05 + rand(-0.05, 0.05), 900, 0.72 * mul, 'bubble', 6);
      b.wob = rand(TAU);
    }
  } else if (w === 'flare') {
    const n = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4][L - 1];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      const b = addBullet(x, y, t * 0.5, 720, 0.6 * mul, 'flare', 8);
      b.life = 1.05; b.boom = 3.2 * mul; b.radius = 62 + L * 5;
    }
  } else if (w === 'net') {
    const n = L >= 7 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const b = addBullet(x + (n > 1 ? (i - 0.5) * 30 : 0), y, n > 1 ? (i - 0.5) * 0.3 : 0, 520, 1.3 * mul, 'net', 10);
      b.life = 0.5; b.span = 58 + L * 5; b.hold = 1.3 + L * 0.05; b.open = 0;
    }
  } else {
    zapChain(p, L, mul);
  }
  p.muzzle = 0.06;
  Sound.sfx.shoot(w);
}

function addBullet(x, y, ang, speed, dmg, kind, r) {
  const b = { x, y, vx: Math.sin(ang) * speed, vy: -Math.cos(ang) * speed, ang, dmg, kind, r, dead: false, pierce: false };
  G.bullets.push(b);
  return b;
}

// The galvanic coil: find the nearest creature ahead, then let the spark jump on to its neighbours.
function zapChain(p, L, mul) {
  const jumps = 1 + Math.floor(L / 2);
  const hit = [];
  let fx = p.x, fy = p.y - 30, reach = 360, dmg = 1.7 * mul;
  for (let j = 0; j <= jumps; j++) {
    let best = null, bd = reach * reach;
    for (const e of G.enemies) {
      if (e.dead || e.hidden || hit.includes(e) || hitY(e) > fy + (j ? reach : 10)) continue;
      const d = dist2(fx, fy, hitX(e), hitY(e));
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) break;
    const tx = hitX(best), ty = hitY(best);
    spawnParticle({ kind: 'arc', x: fx, y: fy, x2: tx, y2: ty, life: 0.13, seed: rand(1000) });
    hit.push(best);
    damageEnemy(best, dmg, tx, ty, 'coil');
    fx = tx; fy = ty; reach = 170; dmg *= 0.85;
  }
  if (!hit.length) spawnParticle({ kind: 'arc', x: fx, y: fy, x2: fx + rand(-30, 30), y2: fy - 120, life: 0.08, seed: rand(1000) });
}

// A flare going off: light, a ring, and damage to everything close.
function flareBurst(b) {
  spawnParticle({ kind: 'glow', color: 'amber', x: b.x, y: b.y, life: 0.5, size: b.radius * 3, grow: 0.2, alpha: 0.8 });
  spawnParticle({ kind: 'ring', color: '#f2a93b', x: b.x, y: b.y, life: 0.4, r0: 6, r1: b.radius, width: 3 });
  sparks(b.x, b.y, 'paper', 8, 220, 0.5, 12);
  Sound.sfx.flare();
  for (const e of G.enemies) {
    if (e.dead || e.hidden) continue;
    const rr = b.radius + e.r;
    if (dist2(b.x, b.y, hitX(e), hitY(e)) < rr * rr) damageEnemy(e, b.boom, hitX(e), hitY(e), 'flare');
  }
}

function updateBullets(dt) {
  const W = View.W, H = View.H;
  for (const b of G.bullets) {
    if (b.kind === 'net' && b.open > 0) { updateNet(b, dt); continue; }
    if (b.kind === 'flare') {
      b.life -= dt;
      if (b.stuck) {
        if (!b.stuck.dead) { b.x = hitX(b.stuck) + b.sx; b.y = hitY(b.stuck) + b.sy; }
      } else {
        b.vy += 240 * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.ang = Math.atan2(b.vx, -b.vy);
      }
      if (chance(dt * 30)) spawnParticle({ kind: 'glow', color: 'amber', x: b.x, y: b.y, vx: rand(-20, 20), vy: rand(10, 40), life: 0.25, size: 16, grow: -0.6 });
      if (b.life <= 0) { b.dead = true; flareBurst(b); continue; }
      if (b.stuck) continue;
    } else {
      if (b.kind === 'bubble') { b.wob += dt * 14; b.x += Math.sin(b.wob) * 60 * dt; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.kind === 'net') { b.life -= dt; if (b.life <= 0) { openNet(b); continue; } }
    }
    if (b.y < -50 || b.x < -50 || b.x > W + 50 || b.y > H + 50) { b.dead = true; continue; }
    for (const e of G.enemies) {
      if (e.dead || e.hidden || e.y < -40) continue;
      // a body too big to shoot through: shots stop on it, flares stick to it
      if (e.bodyR && dist2(b.x, b.y, e.x, e.y) < e.bodyR * e.bodyR && dist2(b.x, b.y, hitX(e), hitY(e)) > (e.r + b.r) * (e.r + b.r)) {
        if (b.kind === 'flare') { b.stuck = e; b.sx = b.x - hitX(e); b.sy = b.y - hitY(e); b.life = Math.min(b.life, 0.8); }
        else if (b.kind === 'net') openNet(b);
        else { b.dead = true; spawnParticle({ kind: 'glow', color: 'paper', x: b.x, y: b.y, life: 0.1, size: 16 }); Sound.sfx.clink(); }
        break;
      }
      const hx = hitX(e), hy = hitY(e);
      const rr = e.r + b.r;
      if (dist2(b.x, b.y, hx, hy) < rr * rr) {
        if (b.kind === 'flare') {
          b.stuck = e; b.sx = b.x - hx; b.sy = b.y - hy; b.life = Math.min(b.life, 0.8);
          damageEnemy(e, b.dmg, b.x, b.y, 'flare');
          break;
        }
        if (b.kind === 'net') { openNet(b); break; }
        if (b.pierce) {
          if (b.hits.includes(e)) continue;
          b.hits.push(e);
        }
        damageEnemy(e, b.dmg, b.x, b.y, b.kind);
        if (!b.pierce) { b.dead = true; break; }
      }
    }
  }
  compact(G.bullets);
}

function openNet(b) {
  b.open = b.hold; b.r = 6; b.tick = 0;
  b.vx = 0; b.vy = -18;
  Sound.sfx.net();
}

// An open net drifts up slowly, tangles everything inside it and stings it a few times a second.
function updateNet(b, dt) {
  b.open -= dt;
  if (b.open <= 0) { b.dead = true; return; }
  b.y += b.vy * dt;
  b.r = lerp(b.r, b.span, Math.min(1, dt * 7));
  b.tick -= dt;
  const sting = b.tick <= 0;
  if (sting) b.tick = 0.25;
  for (const e of G.enemies) {
    if (e.dead || e.hidden) continue;
    const rr = b.r + e.r * 0.6;
    if (dist2(b.x, b.y, hitX(e), hitY(e)) > rr * rr) continue;
    if (e.type === 'sea' || e.type === 'wreck') e.tangled = 0.35;
    if (sting) damageEnemy(e, b.dmg * 0.25, hitX(e), hitY(e), 'net');
  }
}
