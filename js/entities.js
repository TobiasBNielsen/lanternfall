'use strict';

// Global game state, created by resetGame() in game.js.
let G = null;

const MAX_LEVEL = 10;
const MAX_HULL = 5;
const MAX_SONAR = 5;
const WEAPONS = {
  harpoon: { name: 'harpoon', rate: 0.17, blurb: 'heavy bolts that go clean through a line of them' },
  sonar: { name: 'sonar ring', rate: 0.14, blurb: 'wide pings that fan out across the water' },
  bubble: { name: 'bubble gun', rate: 0.075, blurb: 'a quick, wobbly stream of stinging bubbles' },
};

const SEA_TYPES = {
  jelly: { hp: 3, score: 100, r: 22, shot: 'spore' },
  jellyB: { hp: 3, score: 120, r: 22, shot: 'spore' },
  angler: { hp: 2, score: 150, r: 22, shot: 'lure' },
  urchin: { hp: 8, score: 300, r: 26, shot: 'spines' },
};

// The field book. Names are invented; the notes are what the diver phoned up to the ship.
const SPECIES = {
  jelly: { latin: 'Rhodomedusa ternaria', common: 'saucer jelly', note: 'Pulses in threes, then rests. Drops something that stings when it passes over the window.' },
  jellyB: { latin: 'Glaucomedusa pallida', common: 'bell jelly', note: 'Tall and nearly clear. The threads hanging off it are longer than the sphere is wide.' },
  angler: { latin: 'Lychnoceras beebei', common: 'lamp-horn', note: 'Its light flickers twice before it spits. Watch the light, not the fish.' },
  urchin: { latin: 'Acanthosphaera errans', common: 'wandering thorn', note: 'Rolls through open water with no current to carry it. Throws its spines in threes.' },
  kraken: { latin: 'Teuthis magna', common: 'grandmother inkwell', note: 'Four arms, and the head is hard as the hull until every one is off.' },
  krakenOld: { latin: 'Teuthis antiqua', common: 'the old one', note: 'Six arms, covered in barnacles and old scars. Something has fought this one before.' },
};

// ---------------------------------------------------------------- particles & text

function spawnParticle(p) {
  if (G.particles.length > 1100) return;
  p.max = p.life;
  if (p.vx === undefined) p.vx = 0;
  if (p.vy === undefined) p.vy = 0;
  p.drag = p.drag || 0;
  p.grav = p.grav || 0;
  p.grow = p.grow || 0;
  p.rot = p.rot || 0;
  p.vr = p.vr || 0;
  p.alpha = p.alpha === undefined ? 1 : p.alpha;
  p.layer = (p.kind === 'glow' && p.color === 'amber') || p.kind === 'ring' ? 'add' : 'normal';
  G.particles.push(p);
}

function sparks(x, y, color, n, speed, life = 0.5, size = 14) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), s = rand(0.3, 1) * speed;
    spawnParticle({ kind: 'glow', color, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1) * life, size: size * rand(0.6, 1.2), grow: -0.7, drag: 3 });
  }
}

function bubbles(x, y, n, spread = 20) {
  for (let i = 0; i < n; i++) {
    spawnParticle({ kind: 'bubble', x: x + rand(-spread, spread), y: y + rand(-spread, spread), vx: rand(-40, 40), vy: rand(-160, -60), life: rand(0.7, 1.5), size: rand(2, 5.5), drag: 1.5, grav: -60, seed: rand(TAU) });
  }
}

function inkCloud(x, y, s = 1) {
  for (let i = 0; i < Math.round(6 * s); i++) {
    const a = rand(TAU), sp = rand(20, 90) * s;
    spawnParticle({ kind: 'ink', x: x + rand(-12, 12) * s, y: y + rand(-12, 12) * s, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(1, 1.8), size: rand(40, 80) * s, grow: 1.2, drag: 1.4 });
  }
}

// A burst is drawn like an engraving of one: a ring, a spray of dots and bubbles. Only lamps glow.
function burst(x, y, s = 1, color = 'paper') {
  if (color === 'amber') spawnParticle({ kind: 'glow', color: 'amber', x, y, life: 0.4, size: 130 * s, grow: 0.2, alpha: 0.7 });
  sparks(x, y, 'paper', Math.round(12 * Math.sqrt(s)), 300 * Math.sqrt(s), 0.7, 18 * Math.sqrt(s));
  bubbles(x, y, Math.round(10 * s), 16 * s);
  spawnParticle({ kind: 'ring', color: '#e8eee6', x, y, life: 0.5, r0: 8 * s, r1: 90 * s, width: 3, dash: true });
}

function floatText(x, y, text, color = '#ffffff', size = 20, life = 1.1) {
  G.texts.push({ x, y, text, color, size, life, max: life });
}

function addScore(v) { G.score += v; }

// ---------------------------------------------------------------- player

function makePlayer() {
  return { x: View.W / 2, y: View.H - 110, vx: 0, r: 13, alive: true, invuln: 2.5, fireCd: 0, tilt: 0, respawnT: 0, muzzle: 0, prop: 0 };
}

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
  } else {
    const n = [1, 1, 2, 2, 2, 3, 3, 4, 4, 5][L - 1];
    for (let i = 0; i < n; i++) {
      const t = i - (n - 1) / 2;
      const b = addBullet(x + t * 9, y, t * 0.05 + rand(-0.05, 0.05), 900, 0.72 * mul, 'bubble', 6);
      b.wob = rand(TAU);
    }
  }
  p.muzzle = 0.06;
  Sound.sfx.shoot(w);
}

function addBullet(x, y, ang, speed, dmg, kind, r) {
  const b = { x, y, vx: Math.sin(ang) * speed, vy: -Math.cos(ang) * speed, ang, dmg, kind, r, dead: false, pierce: false };
  G.bullets.push(b);
  return b;
}

function playerHit(cause) {
  const p = G.player;
  if (!p.alive || p.invuln > 0) return;
  p.alive = false;
  burst(p.x, p.y, 2, 'amber');
  G.hitStop = 0.12;
  inkCloud(p.x, p.y, 0.8);
  Sound.sfx.playerDie();
  G.shake = 20;
  G.flash = 0.35;
  G.hull--;
  // half the purse spills out and sinks; some of it can be caught again
  const lost = Math.floor(G.pearls / 2);
  if (lost > 0) {
    G.pearls -= lost;
    const n = Math.min(lost, 14);
    for (let i = 0; i < n; i++) {
      const v = Math.floor(lost / n) + (i < lost % n ? 1 : 0);
      G.pickups.push({ type: 'pearl', value: v, x: p.x, y: p.y, vx: rand(-160, 160), vy: rand(-260, -80), r: 12, rot: 0, dead: false, spilled: true });
    }
    floatText(p.x, p.y - 40, `lost ${lost} pearls`, '#e8eee6', 18, 1.4);
  }
  if (cause === 'air') floatText(p.x, p.y - 70, 'no air', '#f2a93b', 26, 1.6);
  if (G.hull <= 0) G.gameOverT = 2.4;
  else p.respawnT = 1.6;
}

function launchSonar() {
  const p = G.player;
  if (G.sonar <= 0 || !p.alive || G.buoy) return;
  G.sonar--;
  G.buoy = { x: p.x, y: p.y - 30, sx: p.x, sy: p.y - 30, tx: View.W / 2, ty: View.H * 0.38, t: 0, dur: 0.7, ang: 0 };
  Sound.sfx.buoyLaunch();
}

function detonateSonar() {
  const m = G.buoy;
  G.buoy = null;
  G.flash = 0.6;
  G.shake = 24;
  Sound.sfx.sonarBlast();
  for (let i = 0; i < 4; i++) {
    spawnParticle({ kind: 'ring', color: i % 2 ? '#f2a93b' : '#e8eee6', x: m.x, y: m.y, life: 0.7 + i * 0.18, r0: 10, r1: Math.max(View.W, View.H) * (0.6 + i * 0.25), width: 6 - i });
  }
  burst(m.x, m.y, 2.4, 'amber');
  for (const e of G.enemies) {
    if (e.dead || e.hidden) continue;
    if (e.type === 'boss') { if (!e.armsLeft) damageEnemy(e, e.maxhp * 0.15, e.x, e.y, 'sonar'); }
    else if (e.type === 'arm') damageEnemy(e, e.maxhp * 0.35, e.x, e.y, 'sonar');
    else killEnemy(e);
  }
  for (const s of G.shots) {
    s.dead = true;
    bubbles(s.x, s.y, 2, 4);
  }
}

// ---------------------------------------------------------------- enemies

function makeCreature(kind, x, y) {
  const T = SEA_TYPES[kind];
  const hp = T.hp * G.hpMul;
  const e = {
    type: 'sea', kind, x, y, r: T.r, hp, maxhp: hp, score: T.score,
    anim: rand(6), animSpeed: kind === 'angler' ? rand(8, 11) : rand(3.5, 5), flash: 0, rot: 0, lastX: x,
    shotT: rand(1.5, 10) / G.shotMul, tell: 0, dead: false, hidden: false, move: null,
  };
  G.enemies.push(e);
  return e;
}

function spawnWreck(o) {
  const anchor = o.anchor;
  const e = {
    type: 'wreck', x: o.x, y: o.y, r: anchor ? 30 : 22, vx: o.vx, vy: o.vy, rot: rand(TAU), vr: rand(-1.4, 1.4),
    hp: (anchor ? 9 : 4) * G.hpMul, sprite: anchor ? Sprites.anchor : Sprites.barrel, anchor, flash: 0,
    score: anchor ? 200 : 80, dead: false, hidden: false,
  };
  e.maxhp = e.hp;
  G.enemies.push(e);
  return e;
}

function fireShot(kind, x, y, vx, vy) {
  if (G.shots.length >= G.shotCap && kind !== 'boss') return;
  G.shots.push({ kind: kind === 'boss' ? 'spore' : kind, x, y, vx, vy, r: kind === 'spine' ? 6 : 8, t: rand(TAU), dead: false });
}

// Each kind attacks in its own way.
function creatureAttack(e) {
  const T = SEA_TYPES[e.kind], sp = G.shotSpeed, p = G.player;
  if (T.shot === 'spore') {
    fireShot('spore', e.x, e.y + 16, rand(-20, 20), rand(120, 170) * sp);
  } else if (T.shot === 'lure') {
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    const v = 260 * sp;
    fireShot('spore', e.x + 18, e.y - 30, Math.cos(a) * v, Math.sin(a) * v);
    spawnParticle({ kind: 'glow', color: 'amber', x: e.x + 18, y: e.y - 35, life: 0.3, size: 60, grow: 0.3 });
  } else {
    for (const a of [-0.35, 0, 0.35]) fireShot('spine', e.x, e.y + 20, Math.sin(a) * 240 * sp, Math.cos(a) * 240 * sp);
  }
}

function damageEnemy(e, dmg, hx, hy, kind) {
  if (e.dead) return;
  if (e.type === 'boss' && e.armsLeft > 0) {
    // the head is shielded while any arm is still attached
    spawnParticle({ kind: 'glow', color: 'paper', x: hx, y: hy, life: 0.1, size: 18 });
    Sound.sfx.clink();
    return;
  }
  e.hp -= dmg;
  e.flash = e.type === 'boss' || e.type === 'arm' ? 0.035 : 0.07;
  spawnParticle({ kind: 'glow', color: 'amber', x: hx, y: hy, life: 0.12, size: 26, grow: 0.5 });
  if (e.type === 'boss' || e.type === 'arm') Sound.sfx.bossHit(); else Sound.sfx.hit();
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  if (e.type === 'sea') {
    G.kills++;
    addScore(e.score);
    sparks(e.x, e.y, 'paper', 9, 200, 0.5, 12);
    spawnParticle({ kind: 'ring', color: '#e8eee6', x: e.x, y: e.y, life: 0.35, r0: 6, r1: 46, width: 2, dash: true });
    bubbles(e.x, e.y, 7);
    G.hitStop = Math.max(G.hitStop, 0.035);
    logSpecies(e.kind);
    Sound.sfx.pop(e.kind);
    if (e.kind === 'urchin') dropPearl(e.x, e.y, 3);
    else if (chance(0.6)) dropPearl(e.x, e.y, 1);
    if (chance(0.05)) dropAir(e.x, e.y);
  } else if (e.type === 'wreck') {
    addScore(e.score);
    burst(e.x, e.y, e.r / 40);
    for (let i = 0; i < 7; i++) {
      const a = rand(TAU), s = rand(60, 200);
      spawnParticle({ kind: 'debris', color: '#e8eee6', x: e.x, y: e.y, vx: Math.cos(a) * s + e.vx, vy: Math.sin(a) * s + e.vy, life: rand(0.6, 1.1), size: rand(3, 7), rot: rand(TAU), vr: rand(-8, 8), drag: 1.5, grav: 60 });
    }
    Sound.sfx.crunch(e.r / 30);
    if (chance(e.anchor ? 1 : 0.35)) dropPearl(e.x, e.y, e.anchor ? 3 : 1);
  } else if (e.type === 'arm') {
    const b = e.boss;
    b.armsLeft--;
    e.severed = 1;
    addScore(1000);
    inkCloud(e.x, e.y, 1.1);
    burst(e.x, e.y, 1.2);
    G.hitStop = 0.08;
    Sound.sfx.sever();
    G.shake = Math.max(G.shake, 12);
    for (let i = 0; i < 3; i++) dropPearl(e.x + rand(-20, 20), e.y, 1);
    floatText(e.x, e.y - 20, b.armsLeft ? `${b.armsLeft} arm${b.armsLeft > 1 ? 's' : ''} left` : 'the head is bare', '#f2a93b', 24, 1.4);
  } else if (e.type === 'boss') {
    bossDeath(e);
  }
}

function bossDeath(b) {
  G.boss = null;
  addScore(b.score);
  floatText(b.x, b.y - 40, '+' + b.score.toLocaleString('en-US'), '#f2a93b', 34, 2);
  logSpecies(b.sprite);
  Sound.sfx.bossGroan();
  for (let i = 0; i < 10; i++) {
    G.timers.push({
      t: i * 0.13,
      fn: () => {
        burst(b.x + rand(-100, 100), b.y + rand(-100, 60), rand(0.8, 1.4));
        inkCloud(b.x + rand(-60, 60), b.y + rand(-60, 40), 0.6);
        Sound.sfx.crunch(1.2);
        G.shake = Math.max(G.shake, 12);
      },
    });
  }
  G.timers.push({
    t: 1.4,
    fn: () => {
      burst(b.x, b.y, 3.2, 'amber');
      inkCloud(b.x, b.y, 2.2);
      G.flash = 0.8; G.shake = 26;
      Sound.sfx.sonarBlast();
      Sound.Music.setMode('normal');
      for (let i = 0; i < 12; i++) dropPearl(b.x + rand(-80, 80), b.y + rand(-40, 40), i < 4 ? 3 : 1);
      dropAir(b.x, b.y + 30);
    },
  });
}

// ---------------------------------------------------------------- pickups

function dropPearl(x, y, value) {
  G.pickups.push({ type: 'pearl', value, x, y, vx: rand(-60, 60), vy: rand(-160, -40), r: value > 1 ? 14 : 11, dead: false });
}

function dropAir(x, y) {
  G.pickups.push({ type: 'air', x, y, vx: 0, vy: -40, t: rand(TAU), r: 18, dead: false });
}

function collectPickup(pk) {
  const p = G.player;
  pk.dead = true;
  if (pk.type === 'pearl') {
    G.pearls += pk.value;
    G.pearlsTotal += pk.value;
    addScore(25 * pk.value);
    if (pk.value > 1) floatText(pk.x, pk.y, '+' + pk.value, '#e8eee6', 18);
    Sound.sfx.pearl(pk.value > 1);
  } else if (pk.type === 'air') {
    G.oxygen = Math.min(100, G.oxygen + 35);
    floatText(p.x, p.y - 50, 'air', '#e8eee6', 20);
    bubbles(pk.x, pk.y, 8, 10);
    Sound.sfx.gulp();
  }
}
