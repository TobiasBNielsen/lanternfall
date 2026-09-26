'use strict';

// Game state, the canvas, and everything that happens in one step of the simulation.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);

let state = 'menu'; // menu | playing | paused | dock | gameover
let menuSchool = [];

// Low-res layer used to paint the deep-water darkness with holes for every light.
const darkCanvas = makeCanvas(1, 1);
const darkCtx = darkCanvas.getContext('2d');
const DARK_RES = 0.25;
let darkTick = false;

// ---------------------------------------------------------------- setup

function resize() {
  const cw = window.innerWidth, ch = window.innerHeight;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cw * ch * dpr * dpr > 3.7e6) dpr = Math.sqrt(3.7e6 / (cw * ch));
  const scale = Math.min(ch / 800, cw / 560);
  View.scale = scale;
  View.dpr = dpr;
  View.W = cw / scale;
  View.H = ch / scale;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  darkCanvas.width = Math.ceil(View.W * DARK_RES);
  darkCanvas.height = Math.ceil(View.H * DARK_RES);
  Background.resize();
  Background.buildOverlays(ctx);
  if (G && G.player) {
    G.player.x = clamp(G.player.x, 30, View.W - 30);
    G.player.y = clamp(G.player.y, 60, View.H - 40);
  }
}

function resetGame() {
  G = {
    score: 0, hull: 3, sonar: 1, pearls: 0, pearlsTotal: 0, nextHull: 30000,
    wave: 0, depth: 0, weapon: 'harpoon', level: 1, oxygen: 100, lowAirT: 0, airT: 3,
    player: makePlayer(), bullets: [], enemies: [], shots: [], pickups: [], particles: [], texts: [], timers: [],
    buoy: null, boss: null, kills: 0,
    waveState: 'intro', waveT: 0, waveObj: null, waveDef: null, clearBonus: 0,
    shake: 0, flash: 0, time: 0, playTime: 0, gameOverT: 0, hitStop: 0, creakT: 8, forceDark: 0, dragX: 0, dragY: 0,
    hpMul: 1, shotMul: 1, shotSpeed: 1, shotCap: 8,
  };
  startWave(1);
}

// ---------------------------------------------------------------- update

function update(dt) {
  // a tiny freeze on big hits, so they land
  G.playTime += dt;
  if (G.hitStop > 0) { G.hitStop -= dt; dt *= 0.12; }
  G.time += dt;
  const timers = G.timers;
  for (let i = 0; i < timers.length; i++) {
    const tm = timers[i];
    tm.t -= dt;
    if (tm.t <= 0 && !tm.dead) { tm.dead = true; tm.fn(); }
  }
  compact(G.timers);

  updateWaveFlow(dt);
  updatePlayer(dt);
  updateAir(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateShots(dt);
  updatePickups(dt);
  updateBuoy(dt);
  updateParticles(dt);

  for (const t of G.texts) { t.life -= dt; t.y -= 40 * dt; if (t.life <= 0) t.dead = true; }
  compact(G.texts);

  G.shake = Math.max(0, G.shake - dt * 45);
  G.flash = Math.max(0, G.flash - dt * 1.8);

  if (G.score >= G.nextHull) {
    G.nextHull += 30000;
    if (G.hull < MAX_HULL) {
      G.hull++;
      floatText(G.player.x, G.player.y - 60, 'a spare plate', '#f2a93b', 24, 1.6);
      Sound.sfx.oneUp();
    }
  }
  if (G.gameOverT > 0) {
    G.gameOverT -= dt;
    if (G.gameOverT <= 0) gameOver();
  }
}

function updateWaveFlow(dt) {
  G.waveT += dt;
  if (G.waveState === 'intro') {
    if (G.waveT >= 2.4) { G.waveState = 'active'; G.waveT = 0; G.waveObj.begin(); }
  } else if (G.waveState === 'active') {
    G.waveObj.update(dt);
    if (G.waveObj.done() && G.gameOverT <= 0) {
      G.waveState = 'clear';
      G.waveT = 0;
      G.clearBonus = 500 * G.wave;
      addScore(G.clearBonus);
      Sound.sfx.waveClear();
    }
  } else if (G.waveState === 'clear') {
    // let the last pearls drift into the sub before docking
    if (G.waveT >= 2.2 && G.gameOverT <= 0) {
      for (const pk of G.pickups) if (pk.type === 'pearl') collectPickup(pk);
      compact(G.pickups);
      openDock();
    }
  }
}

function updatePlayer(dt) {
  const p = G.player;
  const W = View.W, H = View.H;

  if (!p.alive) {
    if (G.hull > 0 && p.respawnT > 0) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) {
        p.alive = true; p.invuln = 3;
        p.x = W / 2; p.y = H - 110; p.vx = 0;
        G.oxygen = Math.max(G.oxygen, 60);
        Input.mx = p.x; Input.my = p.y;
        if (Input.touchId !== null) { Input.psx = p.x; Input.psy = p.y; Input.tsx = Input.mx; Input.tsy = Input.my; }
      }
    }
    return;
  }

  const oldX = p.x;
  if (Input.mode === 'keys') {
    const k = Input.keys;
    const dx = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
    const dy = (k.ArrowDown || k.KeyS ? 1 : 0) - (k.ArrowUp || k.KeyW ? 1 : 0);
    const len = Math.hypot(dx, dy) || 1;
    p.x += (dx / len) * 540 * dt + G.dragX * dt * 1.6;
    p.y += (dy / len) * 540 * dt + G.dragY * dt * 1.6;
  } else {
    const f = Math.min(1, dt * (Input.mode === 'touch' ? 22 : 15));
    let mx = (Input.mx + G.dragX - p.x) * f, my = (Input.my + G.dragY - p.y) * f;
    const maxStep = 1400 * dt, d = Math.hypot(mx, my);
    if (d > maxStep) { mx *= maxStep / d; my *= maxStep / d; }
    p.x += mx; p.y += my;
  }
  // an open gulper drags the sphere toward its mouth
  let pulled = false;
  for (const e of G.enemies) {
    if (e.dead || e.kind !== 'gulper' || e.open <= 0) continue;
    const dx = e.x - p.x, dy = e.y + 10 - p.y, d = Math.hypot(dx, dy) || 1;
    if (d > 560) continue;
    // the pull shifts where the sphere is trying to go, so steering has to fight it
    const pull = 340 * (1 - d / 560);
    G.dragX += (dx / d) * pull * dt; G.dragY += (dy / d) * pull * dt;
    pulled = true;
    if (chance(dt * 24)) {
      const k = rand(0.2, 0.9);
      spawnParticle({ kind: 'bubble', x: lerp(p.x, e.x, k) + rand(-30, 30), y: lerp(p.y, e.y, k), vx: dx / d * 220, vy: dy / d * 220, life: 0.5, size: rand(1.5, 3), seed: rand(TAU) });
    }
  }
  if (!pulled) { const k = Math.max(0, 1 - dt * 3); G.dragX *= k; G.dragY *= k; }
  const dm = Math.hypot(G.dragX, G.dragY);
  if (dm > 320) { G.dragX *= 320 / dm; G.dragY *= 320 / dm; }
  p.x = clamp(p.x, 30, W - 30);
  p.y = clamp(p.y, 60, H - 40);
  p.vx = (p.x - oldX) / Math.max(dt, 1e-4);
  p.tilt = lerp(p.tilt, clamp(p.vx / 900, -1, 1), Math.min(1, dt * 10));
  p.invuln = Math.max(0, p.invuln - dt);
  p.muzzle = Math.max(0, p.muzzle - dt);
  p.prop += dt * (8 + Math.abs(p.vx) * 0.02);

  p.fireCd -= dt;
  if (isFiring() && p.fireCd <= 0) {
    fireWeapon(p);
    p.fireCd = WEAPONS[G.weapon].rate;
  }

  if (chance(dt * 14)) spawnParticle({ kind: 'bubble', x: p.x + rand(-4, 4), y: p.y + 34, vx: rand(-20, 20), vy: rand(20, 60), life: rand(0.5, 0.9), size: rand(1.5, 3.5), drag: 2, grav: -120, seed: rand(TAU) });
}

// Oxygen runs down during a fight; bubbles of air rise from the vents below.
function updateAir(dt) {
  const p = G.player;
  if (G.waveState !== 'active' || !p.alive) return;
  G.oxygen -= dt * 2.1;
  if (G.oxygen <= 0) {
    G.oxygen = 0;
    playerHit('air');
    return;
  }
  if (G.oxygen < 25) {
    G.lowAirT -= dt;
    if (G.lowAirT <= 0) { G.lowAirT = 0.9; Sound.sfx.lowAir(); }
  }
  G.airT -= dt;
  if (G.airT <= 0) {
    G.airT = G.oxygen < 40 ? rand(2.4, 3.6) : rand(4.5, 7);
    G.pickups.push({ type: 'air', x: rand(40, View.W - 40), y: View.H + 30, vx: 0, vy: -rand(55, 85), t: rand(TAU), r: 18, dead: false });
  }
}

function updateEnemies(dt) {
  const p = G.player, H = View.H, W = View.W;
  for (const e of G.enemies) {
    if (e.dead) continue;
    // anything caught in a net moves at a third of its speed
    let mdt = dt;
    if (e.tangled > 0) { e.tangled -= dt; mdt = dt * 0.35; }
    if (e.move) e.move(e, mdt);
    e.flash = Math.max(0, e.flash - dt);
    if (e.open > 0) e.open -= dt;
    if (e.type === 'wreck') {
      e.x += e.vx * mdt; e.y += e.vy * mdt; e.rot += e.vr * mdt;
      if (e.y > H + e.r + 30 || e.x < -e.r - 150 || e.x > W + e.r + 150) e.dead = true;
    } else if (e.type !== 'arm') {
      e.anim += mdt * e.animSpeed;
      const vx = (e.x - e.lastX) / Math.max(dt, 1e-4);
      e.lastX = e.x;
      e.rot = lerp(e.rot, clamp(vx * 0.001, -0.3, 0.3), Math.min(1, dt * 6));
      if (e.type === 'boss' || e.kind === 'hatchet') e.rot *= 0.3;
    }
    const T = e.type === 'sea' ? SEA_TYPES[e.kind] : null;
    if (T && T.shot && !e.hidden && e.open <= 0 && e.y > 20 && e.y < H * 0.78 && e.x > 0 && e.x < W) {
      // every creature gives a moment's warning before it attacks
      if (e.tell > 0) {
        e.tell -= mdt;
        if (e.tell <= 0) creatureAttack(e);
      } else {
        e.shotT -= mdt;
        if (e.shotT <= 0) {
          e.shotT = rand(4, 16) / G.shotMul * (e.kind === 'angler' ? 1.4 : T.slow || 1) * (e.kind === 'gulper' ? 0.6 : 1);
          e.tell = e.kind === 'angler' ? 0.55 : e.kind === 'gulper' ? 0.7 : 0.35;
        }
      }
    }
    if (!e.hidden && p.alive && p.invuln <= 0) {
      const cy = e.bodyR ? e.y : e.y + (e.oy || 0);
      const rr = (e.bodyR || e.r * 0.8) + p.r;
      if (dist2(e.x, cy, p.x, p.y) < rr * rr) {
        playerHit();
        if (e.type === 'sea' || e.type === 'wreck') killEnemy(e);
      }
    }
  }
  compact(G.enemies);
}

function updateShots(dt) {
  const p = G.player, H = View.H, W = View.W;
  for (const s of G.shots) {
    s.t += dt;
    if (s.kind === 'spore') s.x += Math.sin(s.t * 3) * 18 * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.y > H + 30 || s.x < -30 || s.x > W + 30 || s.y < -60) { s.dead = true; continue; }
    if (p.alive && p.invuln <= 0) {
      const rr = s.r + p.r;
      if (dist2(s.x, s.y, p.x, p.y) < rr * rr) {
        s.dead = true;
        sparks(s.x, s.y, 'paper', 6, 150, 0.4, 12);
        playerHit();
      }
    }
  }
  compact(G.shots);
}

function updatePickups(dt) {
  const p = G.player, H = View.H;
  for (const pk of G.pickups) {
    if (pk.type === 'pearl') {
      pk.vy = Math.min(110, pk.vy + 300 * dt);
      pk.vx *= 1 - 1.5 * dt;
    } else {
      pk.t += dt;
      pk.vx = Math.sin(pk.t * 2) * 28;
    }
    if (p.alive) {
      const d2 = dist2(pk.x, pk.y, p.x, p.y);
      if (d2 < 120 * 120) {
        const d = Math.sqrt(d2) || 1;
        pk.x += ((p.x - pk.x) / d) * 380 * dt;
        pk.y += ((p.y - pk.y) / d) * 380 * dt;
      }
      const rr = p.r + pk.r + 10;
      if (d2 < rr * rr) { collectPickup(pk); continue; }
    }
    pk.x += pk.vx * dt; pk.y += pk.vy * dt;
    if (pk.y > H + 40 || pk.y < -60) pk.dead = true;
  }
  compact(G.pickups);
}

function updateBuoy(dt) {
  const m = G.buoy;
  if (!m) return;
  m.t += dt;
  const k = Math.min(1, m.t / m.dur);
  const e = ease.inOutSine(k);
  const nx = lerp(m.sx, m.tx, e);
  const ny = lerp(m.sy, m.ty, e) - Math.sin(k * Math.PI) * 60;
  m.ang = Math.atan2(nx - m.x, -(ny - m.y)) || 0;
  m.x = nx; m.y = ny;
  if (chance(0.7)) spawnParticle({ kind: 'bubble', x: m.x, y: m.y + 16, vx: rand(-20, 20), vy: rand(20, 60), life: 0.6, size: rand(2, 4), grav: -80, seed: rand(TAU) });
  if (k >= 1) detonateSonar();
}

function updateParticles(dt) {
  for (const p of G.particles) {
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }
    if (p.drag) { const d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d; }
    p.vy += p.grav * dt;
    if (p.kind === 'bubble') p.vx += Math.sin(p.life * 7 + p.seed) * 50 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
  compact(G.particles);
}
