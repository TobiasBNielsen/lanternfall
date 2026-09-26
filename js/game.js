'use strict';

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
    shake: 0, flash: 0, time: 0, playTime: 0, gameOverT: 0, hitStop: 0, creakT: 8,
    hpMul: 1, shotMul: 1, shotSpeed: 1, shotCap: 8,
  };
  startWave(1);
}

// ---------------------------------------------------------------- input

const Input = { keys: {}, mx: 0, my: 0, mouseDown: false, mode: 'mouse', touchId: null, tsx: 0, tsy: 0, psx: 0, psy: 0 };
const MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];

window.addEventListener('keydown', e => {
  // typing a name into the log must not steer the sphere or restart the dive
  if (e.target && e.target.tagName === 'INPUT') return;
  Input.keys[e.code] = true;
  if (MOVE_KEYS.includes(e.code)) Input.mode = 'keys';
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (state === 'playing') {
    if (e.code === 'KeyM' || e.code === 'KeyX' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') launchSonar();
    if (e.code === 'KeyP' || e.code === 'Escape') pauseGame();
  } else if (state === 'paused') {
    if (e.code === 'KeyP' || e.code === 'Escape') resumeGame();
  } else if (state === 'dock') {
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m) buyItem(+m[1] - 1);
    const l = /^Key([A-E])$/.exec(e.code);
    if (l) buyItem(l[1].charCodeAt(0) - 65);
    if (e.code === 'Enter') leaveDock();
  } else if (state === 'menu' || state === 'gameover') {
    if (e.code === 'Enter') startGame();
  }
});
window.addEventListener('keyup', e => { Input.keys[e.code] = false; });

window.addEventListener('mousemove', e => {
  const x = e.clientX / View.scale, y = e.clientY / View.scale;
  if (Input.mode !== 'mouse' && Math.abs(x - Input.mx) + Math.abs(y - Input.my) > 4) Input.mode = 'mouse';
  Input.mx = x; Input.my = y;
  document.body.classList.toggle('hide-cursor', state === 'playing' && Input.mode === 'mouse');
});
canvas.addEventListener('mousedown', e => {
  Sound.init();
  Input.mode = 'mouse';
  if (e.button === 0) Input.mouseDown = true;
  if (e.button === 2 && state === 'playing') launchSonar();
});
window.addEventListener('mouseup', e => { if (e.button === 0) Input.mouseDown = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  Sound.init();
  Input.mode = 'touch';
  if (Input.touchId !== null || !G) return;
  const t = e.changedTouches[0];
  Input.touchId = t.identifier;
  Input.tsx = t.clientX / View.scale; Input.tsy = t.clientY / View.scale;
  Input.psx = G.player.x; Input.psy = G.player.y;
  Input.mx = G.player.x; Input.my = G.player.y;
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!G) return;
  for (const t of e.changedTouches) {
    if (t.identifier !== Input.touchId) continue;
    const x = t.clientX / View.scale, y = t.clientY / View.scale;
    Input.mx = Input.psx + (x - Input.tsx) * 1.3;
    Input.my = Input.psy + (y - Input.tsy) * 1.3;
  }
}, { passive: false });
function endTouch(e) {
  for (const t of e.changedTouches) if (t.identifier === Input.touchId) Input.touchId = null;
}
canvas.addEventListener('touchend', endTouch);
canvas.addEventListener('touchcancel', endTouch);

function isFiring() {
  return Input.keys.Space || Input.mouseDown || (Input.mode === 'touch' && Input.touchId !== null);
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
    p.x += (dx / len) * 540 * dt;
    p.y += (dy / len) * 540 * dt;
  } else {
    const f = Math.min(1, dt * (Input.mode === 'touch' ? 22 : 15));
    let mx = (Input.mx - p.x) * f, my = (Input.my - p.y) * f;
    const maxStep = 1400 * dt, d = Math.hypot(mx, my);
    if (d > maxStep) { mx *= maxStep / d; my *= maxStep / d; }
    p.x += mx; p.y += my;
  }
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

function updateBullets(dt) {
  const W = View.W;
  for (const b of G.bullets) {
    if (b.kind === 'bubble') { b.wob += dt * 14; b.x += Math.sin(b.wob) * 60 * dt; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -50 || b.x < -50 || b.x > W + 50) { b.dead = true; continue; }
    for (const e of G.enemies) {
      if (e.dead || e.hidden || e.y < -40) continue;
      const rr = e.r + b.r;
      if (dist2(b.x, b.y, e.x, e.y + (e.oy || 0)) < rr * rr) {
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

function updateEnemies(dt) {
  const p = G.player, H = View.H, W = View.W;
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (e.move) e.move(e, dt);
    e.flash = Math.max(0, e.flash - dt);
    if (e.type === 'wreck') {
      e.x += e.vx * dt; e.y += e.vy * dt; e.rot += e.vr * dt;
      if (e.y > H + e.r + 30 || e.x < -e.r - 150 || e.x > W + e.r + 150) e.dead = true;
    } else if (e.type !== 'arm') {
      e.anim += dt * e.animSpeed;
      const vx = (e.x - e.lastX) / Math.max(dt, 1e-4);
      e.lastX = e.x;
      e.rot = lerp(e.rot, clamp(vx * 0.001, -0.3, 0.3), Math.min(1, dt * 6));
      if (e.type === 'boss') e.rot *= 0.3;
    }
    if (e.type === 'sea' && !e.hidden && e.y > 20 && e.y < H * 0.78 && e.x > 0 && e.x < W) {
      // every creature gives a moment's warning before it attacks
      if (e.tell > 0) {
        e.tell -= dt;
        if (e.tell <= 0) creatureAttack(e);
      } else {
        e.shotT -= dt;
        if (e.shotT <= 0) {
          e.shotT = rand(4, 16) / G.shotMul * (e.kind === 'angler' ? 1.4 : 1);
          e.tell = e.kind === 'angler' ? 0.55 : 0.35;
        }
      }
    }
    if (!e.hidden && p.alive && p.invuln <= 0) {
      const rr = e.r * 0.8 + p.r;
      if (dist2(e.x, e.y + (e.oy || 0), p.x, p.y) < rr * rr) {
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

// ---------------------------------------------------------------- render

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
  const d = Background.darkness();
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
    } else if (e.type === 'boss') hole(e.x, e.y - 40, 360, 0.6);
    else if (e.type === 'arm') hole(e.x, e.y, 120, 0.5);
    else hole(e.x, e.y, 90, 0.4);
  }
  for (const s of G.shots) hole(s.x, s.y, 70, 1);
  for (const pk of G.pickups) hole(pk.x, pk.y, 80, 0.9);
  if (G.buoy) hole(G.buoy.x, G.buoy.y, 160, 1);
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
  const set = Sprites.sea[e.type === 'boss' ? e.sprite : e.kind];
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
  for (const e of G.enemies) {
    if (e.hidden || e.type !== 'sea') continue;
    let sc = 1;
    if (e.tell > 0 && e.kind !== 'angler') {
      // jellies and thorns draw themselves in before they let go
      sc = 1 - Math.sin((e.tell / 0.35) * Math.PI) * 0.08;
    }
    drawSprite(ctx, creatureFrame(e), e.x, e.y, e.rot, sc);
  }
  const b = G.boss;
  if (b && !b.dead) {
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

function drawShots() {
  for (const s of G.shots) {
    if (s.kind === 'spine') drawSprite(ctx, Sprites.spine, s.x, s.y, Math.atan2(s.vy, s.vx) - Math.PI / 2);
    else drawSprite(ctx, Sprites.spore, s.x, s.y, s.t * 3);
  }
}

// Hundreds of these a second: skip save/restore and set the transform directly.
function drawBullets() {
  const k = View.scale * View.dpr, ox = k * shakeX, oy = k * shakeY;
  for (const b of G.bullets) {
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
    label = `arms: ${'|'.repeat(b.armsLeft)}`;
  } else {
    k = clamp(b.hp / b.maxhp, 0, 1);
    label = 'the head';
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
    kicker = `${G.depth.toLocaleString('en-US')} ft, ${zoneAt(G.depth).name}`;
    note = G.waveDef.note;
  } else if (G.waveState === 'clear' && G.gameOverT <= 0) {
    title = 'Clear water';
    kicker = `${G.depth.toLocaleString('en-US')} ft`;
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
  const kinds = ['jelly', 'jellyB', 'angler', 'jelly', 'urchin', 'jellyB', 'angler', 'jelly'];
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

// ---------------------------------------------------------------- HUD & screens

const hud = {
  root: $('hud'), score: $('score'), depth: $('depthLabel'), hull: $('hull'), sonar: $('sonarIcons'),
  pearls: $('pearls'), weapon: $('weaponName'), grade: $('grade'), o2: $('o2Cells'), o2Box: $('o2Box'),
};
const hudCache = {};
for (let i = 0; i < 10; i++) hud.o2.appendChild(document.createElement('i'));

// Up to 5 little marks, then a number, so the HUD never grows wider than the phone.
function tally(el, n) {
  n = Math.max(0, n);
  el.textContent = '';
  for (let i = 0; i < Math.min(n, 5); i++) el.appendChild(document.createElement('i'));
  if (n > 5) {
    const b = document.createElement('b');
    b.textContent = '+' + (n - 5);
    el.appendChild(b);
  }
}

function setHud(key, val, fn) {
  if (hudCache[key] !== val) { hudCache[key] = val; fn(val); }
}

function updateHud() {
  setHud('score', G.score, v => { hud.score.textContent = v.toLocaleString('en-US'); });
  setHud('depth', G.depth, v => { hud.depth.textContent = v.toLocaleString('en-US') + ' ft'; });
  setHud('hull', G.hull, v => tally(hud.hull, v));
  setHud('sonar', G.sonar, v => { tally(hud.sonar, v); $('sonarCount').textContent = v; });
  setHud('pearls', G.pearls, v => { hud.pearls.textContent = v; });
  setHud('weapon', G.weapon, v => { hud.weapon.textContent = WEAPONS[v].name; });
  setHud('level', G.level, v => { hud.grade.textContent = 'grade ' + ROMAN[v]; });
  setHud('o2', Math.ceil(G.oxygen / 10), v => {
    [...hud.o2.children].forEach((c, i) => c.classList.toggle('on', i < v));
  });
  setHud('low', G.oxygen < 25, v => { hud.o2Box.classList.toggle('low', v); });
  setHud('boss', !!G.boss, v => { hud.root.classList.toggle('boss', v); });
}

function showScreen(id) {
  if (id) $('plateToast').classList.add('hidden');
  for (const s of ['menu', 'pause', 'dock', 'gameover']) $(s).classList.toggle('hidden', s !== id);
  hud.root.classList.toggle('hidden', !(state === 'playing' || state === 'paused'));
  document.body.classList.toggle('hide-cursor', state === 'playing' && Input.mode === 'mouse');
}

function refreshBest() {
  const best = Store.get('lf_best', { score: 0, depth: 0 });
  $('record').textContent = best.score > 0
    ? `Deepest so far: ${best.depth.toLocaleString('en-US')} ft, with ${best.score.toLocaleString('en-US')} points.`
    : 'No dives in the log yet.';
  renderPlates();
  renderBoard();
}

function startGame() {
  Sound.init();
  Sound.sfx.click();
  Sound.Music.setMode('normal');
  resetGame();
  for (const k in hudCache) delete hudCache[k];
  Input.mx = G.player.x; Input.my = G.player.y;
  Input.mouseDown = false;
  state = 'playing';
  showScreen(null);
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  Input.mouseDown = false;
  $('pauseDepth').textContent = G.depth.toLocaleString('en-US');
  showScreen('pause');
}

function resumeGame() {
  if (state !== 'paused') return;
  Sound.init();
  state = 'playing';
  lastT = performance.now();
  showScreen(null);
}

function toMenu() {
  state = 'menu';
  G = null;
  Background.setDepth(0);
  Sound.Music.setMode('normal');
  refreshBest();
  showScreen('menu');
}

function gameOver() {
  state = 'gameover';
  const best = Store.get('lf_best', { score: 0, depth: 0 });
  const record = G.score > best.score;
  Store.set('lf_best', { score: Math.max(best.score, G.score), depth: Math.max(best.depth, G.depth) });
  $('goDepth').textContent = G.depth.toLocaleString('en-US');
  $('goZone').textContent = zoneAt(G.depth).name;
  $('goKills').textContent = G.kills.toLocaleString('en-US');
  $('goPearls').textContent = G.pearlsTotal.toLocaleString('en-US');
  $('goScore').textContent = G.score.toLocaleString('en-US');
  $('goBest').textContent = record ? 'That is the best dive in the log.' : `The best dive in the log is still ${best.score.toLocaleString('en-US')}.`;
  $('goSpecies').textContent = `${speciesLog.size} of ${Object.keys(SPECIES).length}`;
  lastDive = { score: G.score, depth: G.depth, kills: G.kills, species: speciesLog.size, duration: Math.round(G.playTime) };
  const form = $('signForm');
  form.classList.toggle('hidden', G.score <= 0);
  form.classList.remove('done');
  $('signName').value = Store.get('lf_name', '');
  $('signStatus').textContent = '';
  $('signStatus').classList.remove('err');
  $('signBtn').disabled = false;
  Sound.Music.setMode('normal');
  showScreen('gameover');
}

// ---------------------------------------------------------------- the dock (shop between waves)

function dockItems() {
  const items = [];
  const L = G.level, w = WEAPONS[G.weapon];
  items.push({
    name: L >= MAX_LEVEL ? `The ${w.name} is at grade X` : `Grade the ${w.name} up to ${ROMAN[L + 1]}`,
    desc: L >= MAX_LEVEL ? 'Nothing more the ship can do for it.' : 'More bolts per pull, and they hit harder.',
    cost: 6 + L * 4, ok: L < MAX_LEVEL,
    buy() { G.level++; },
  });
  for (const k in WEAPONS) {
    if (k === G.weapon) continue;
    items.push({
      name: `Swap to the ${WEAPONS[k].name}`, desc: `${WEAPONS[k].blurb[0].toUpperCase() + WEAPONS[k].blurb.slice(1)}. Keeps its grade.`,
      cost: 12, ok: true,
      buy() { G.weapon = k; },
    });
  }
  items.push({
    name: 'An extra hull plate', desc: G.hull >= MAX_HULL ? 'The sphere cannot take any more.' : 'One more hit before the water gets in.',
    cost: 22, ok: G.hull < MAX_HULL,
    buy() { G.hull++; },
  });
  items.push({
    name: 'A sonar charge', desc: G.sonar >= MAX_SONAR ? 'The rack is full.' : 'One blast that clears the water around you.',
    cost: 14, ok: G.sonar < MAX_SONAR,
    buy() { G.sonar++; },
  });
  return items;
}

function renderDock() {
  $('dockDepth').textContent = G.depth.toLocaleString('en-US');
  $('dockPearls').textContent = G.pearls;
  const list = $('dockItems');
  list.textContent = '';
  dockItems().forEach((it, i) => {
    const btn = document.createElement('button');
    btn.className = 'item';
    if (!it.ok) btn.classList.add('maxed');
    else if (G.pearls < it.cost) btn.classList.add('cant');
    btn.innerHTML = '<span class="letter"></span><span class="item-text"><b></b><small></small></span><span class="price"></span>';
    btn.querySelector('.letter').textContent = 'abcde'[i] + ')';
    btn.querySelector('b').textContent = it.name;
    btn.querySelector('small').textContent = it.desc;
    btn.querySelector('.price').textContent = it.ok ? `${it.cost} pearls` : '';
    btn.addEventListener('click', () => buyItem(i));
    list.appendChild(btn);
  });
}

function openDock() {
  state = 'dock';
  G.oxygen = 100;
  Input.mouseDown = false;
  G.shots.length = 0;
  Sound.sfx.dock();
  renderDock();
  showScreen('dock');
}

function buyItem(i) {
  if (state !== 'dock') return;
  const it = dockItems()[i];
  if (!it) return;
  if (!it.ok || G.pearls < it.cost) { Sound.sfx.deny(); return; }
  G.pearls -= it.cost;
  it.buy();
  Sound.sfx.buy();
  for (const k in hudCache) delete hudCache[k];
  renderDock();
}

function leaveDock() {
  if (state !== 'dock') return;
  Sound.sfx.click();
  startWave(G.wave + 1);
  G.player.invuln = Math.max(G.player.invuln, 1);
  state = 'playing';
  lastT = performance.now();
  showScreen(null);
}

// ---------------------------------------------------------------- the deepest dives

let lastDive = null;

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

async function renderBoard() {
  const list = $('boardList');
  const note = text => {
    list.textContent = '';
    const li = document.createElement('li');
    li.className = 'board-note';
    li.textContent = text;
    list.appendChild(li);
  };
  try {
    const rows = await Leaderboard.top(10);
    if (!rows || !rows.length) { note('Nobody has signed the log yet. Be the first.'); return; }
    const mine = Store.get('lf_name', '');
    list.textContent = '';
    rows.forEach((r, i) => {
      const li = document.createElement('li');
      if (mine && r.name === mine) li.className = 'me';
      li.innerHTML = '<span class="n"></span><span class="who"></span><span class="ft"></span><span class="pts"></span>';
      li.querySelector('.n').textContent = i + 1 + '.';
      li.querySelector('.who').textContent = r.name;
      li.querySelector('.ft').textContent = r.depth.toLocaleString('en-US') + ' ft';
      li.querySelector('.pts').textContent = r.score.toLocaleString('en-US');
      list.appendChild(li);
    });
  } catch (e) {
    note(`${e.message} The log will be here when the line is back.`);
  }
}

$('signForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!lastDive) return;
  const name = $('signName').value.trim().replace(/\s+/g, ' ');
  const status = $('signStatus');
  if (!name) return;
  Store.set('lf_name', name);
  $('signBtn').disabled = true;
  status.classList.remove('err');
  status.textContent = 'Sending it up to the ship…';
  try {
    const r = await Leaderboard.submit({ ...lastDive, name });
    lastDive = null;
    $('signForm').classList.add('done');
    const rank = r ? Number(r.rank) : 0;
    status.textContent = rank
      ? `Signed. That puts you ${ordinal(rank)} in the log${r.personal_best ? ', and it is your best dive yet' : ''}.`
      : 'Signed.';
    Sound.sfx.logged();
  } catch (err) {
    status.classList.add('err');
    status.textContent = err.message;
    $('signBtn').disabled = false;
  }
});

// ---------------------------------------------------------------- the field book

const speciesLog = new Set(Store.get('lf_species', []));
let plateTimer = null;

function drawSpecimen(cv, kind, known) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = cv.clientWidth || 96;
  cv.width = Math.round(size * dpr);
  cv.height = Math.round(size * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, size, size);
  if (!known) {
    c.strokeStyle = 'rgba(232,238,230,0.35)';
    c.setLineDash([3, 5]);
    c.strokeRect(6.5, 6.5, size - 13, size - 13);
    return;
  }
  const sp = Sprites.sea[kind].frames[0][0];
  const k = (size - 12) / Math.max(sp.w, sp.h);
  c.drawImage(sp.c, (size - sp.w * k) / 2, (size - sp.h * k) / 2, sp.w * k, sp.h * k);
}

function renderPlates() {
  const grid = $('plateGrid');
  grid.textContent = '';
  const kinds = Object.keys(SPECIES);
  $('speciesCount').textContent = `${speciesLog.size} of ${kinds.length}`;
  for (const kind of kinds) {
    const known = speciesLog.has(kind);
    const fig = document.createElement('figure');
    fig.className = 'plate' + (known ? '' : ' unknown');
    const cv = document.createElement('canvas');
    const cap = document.createElement('figcaption');
    cap.textContent = known ? SPECIES[kind].latin : 'not yet seen';
    fig.append(cv, cap);
    grid.appendChild(fig);
    drawSpecimen(cv, kind, known);
  }
}

// The first time a species dies in front of the window, it goes in the book.
function logSpecies(kind) {
  if (!SPECIES[kind] || speciesLog.has(kind)) return;
  speciesLog.add(kind);
  Store.set('lf_species', [...speciesLog]);
  const sp = SPECIES[kind];
  const toast = $('plateToast');
  $('toastLatin').textContent = sp.latin;
  $('toastCommon').textContent = `${sp.common}, logged at ${G.depth.toLocaleString('en-US')} ft`;
  $('toastNote').textContent = sp.note;
  toast.classList.remove('hidden');
  drawSpecimen($('toastCanvas'), kind, true);
  Sound.sfx.logged();
  clearTimeout(plateTimer);
  plateTimer = setTimeout(() => toast.classList.add('hidden'), 5200);
}

function syncToggles() {
  document.querySelectorAll('[data-toggle]').forEach(btn => {
    const key = btn.dataset.toggle;
    const on = Sound.settings[key];
    btn.classList.toggle('off', !on);
    btn.querySelector('.state').textContent = on ? 'on' : 'off';
  });
}

$('playBtn').addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);
$('goMenuBtn').addEventListener('click', toMenu);
$('resumeBtn').addEventListener('click', resumeGame);
$('restartBtn').addEventListener('click', startGame);
$('quitBtn').addEventListener('click', toMenu);
$('pauseBtn').addEventListener('click', pauseGame);
$('diveBtn').addEventListener('click', leaveDock);
$('sonarBtn').addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); if (state === 'playing') launchSonar(); }, { passive: false });
$('sonarBtn').addEventListener('click', () => { if (state === 'playing') launchSonar(); });
document.querySelectorAll('[data-toggle]').forEach(btn => {
  btn.addEventListener('click', () => {
    Sound.init();
    const key = btn.dataset.toggle;
    if (key === 'sfx') Sound.setSfx(!Sound.settings.sfx); else Sound.setMusic(!Sound.settings.music);
    syncToggles();
    Sound.sfx.click();
  });
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pauseGame(); Sound.suspend(); }
  else Sound.resume();
});
window.addEventListener('blur', pauseGame);

// ---------------------------------------------------------------- main loop

let lastT = performance.now();

function frame(now) {
  const dt = Math.min((now - lastT) / 1000, 1 / 30);
  lastT = now;
  if (state === 'playing' || state === 'gameover') update(dt);
  else if (state === 'menu') updateMenu(dt);

  let sinking = 0;
  if (G && state !== 'menu') {
    if ((G.waveState === 'clear' && G.waveT > 1.2) || (G.waveState === 'intro' && G.waveT < 1.4 && G.wave > 1)) sinking = 1;
  }
  if (state !== 'paused') Background.update(dt, sinking);
  Sound.setDepth(Background.shown);
  if (G && state === 'playing' && G.depth >= 1600) {
    G.creakT -= dt;
    if (G.creakT <= 0) { G.creakT = rand(7, 15); Sound.sfx.creak(); }
  }
  render();
  if (G && (state === 'playing' || state === 'paused')) updateHud();
  requestAnimationFrame(frame);
}

function boot() {
  resize();
  Sprites.ss = clamp(View.scale * View.dpr * 1.1, 1.5, 3);
  Sprites.init();
  Background.init();
  Background.buildOverlays(ctx);
  buildMenuSchool();
  refreshBest();
  syncToggles();
  if (window.matchMedia('(pointer: coarse)').matches) {
    Input.mode = 'touch';
    document.body.classList.add('touch');
  }
  window.addEventListener('resize', resize);
  requestAnimationFrame(t => { lastT = t; frame(t); });
}

boot();
