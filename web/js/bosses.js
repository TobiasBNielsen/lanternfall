'use strict';

// The four large things: two krakens, the lantern queen and the colony. Each is a wave type.

Object.assign(WaveTypes, {
  // The lantern queen: the water goes dark, her lamp is the only target, her body is armour.
  queen(def, n, loop) {
    let b = null;
    function diver(e, dt) {
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.vy += 40 * dt;
      e.vx += (G.player.x - e.x) * 0.45 * dt;
      e.vx *= 1 - 0.3 * dt;
      if (e.y > View.H + 60) e.dead = true;
    }
    function lureSpore(ang, speed) {
      fireShot('boss', b.hx, b.hy, Math.cos(ang) * speed, Math.sin(ang) * speed);
    }
    function attack() {
      const sp = 220 * G.shotSpeed;
      const opts = ['pulse', 'lunge', 'lunge', 'blackout'];
      if (G.enemies.length < 8) opts.push('call');
      const a = pick(opts);
      if (a === 'pulse') {
        for (let i = 0; i < 12; i++) lureSpore((i / 12) * TAU, sp * 0.8);
      } else if (a === 'lunge') {
        b.charge = 1.3; b.tx = G.player.x; b.ty = View.H * 0.5;
        Sound.sfx.whoosh();
      } else if (a === 'blackout') {
        b.blackout = 2.6; b.pelt = 0.5;
      } else {
        for (let i = 0; i < 2; i++) {
          const e = makeCreature('angler', b.x + (i ? 80 : -80), b.y);
          e.vx = (i ? 1 : -1) * 90; e.vy = 70; e.move = diver;
        }
      }
    }
    function move(b_, dt) {
      b.sway = Math.sin(G.time * 1.3) * 26;
      b.hx = b.x + 72 + b.sway;
      b.hy = b.y - 150 + Math.cos(G.time * 1.7) * 10;
      if (b.state === 'enter') {
        b.y = lerp(b.y, 300, Math.min(1, dt * 1.2));
        G.forceDark = Math.min(0.72, G.forceDark + dt * 0.5);
        if (Math.abs(b.y - 300) < 4) { b.state = 'fight'; Sound.sfx.bossGroan(); }
        return;
      }
      if (b.blackout > 0) {
        b.blackout -= dt;
        G.forceDark = Math.min(0.96, G.forceDark + dt * 2);
        b.pelt -= dt;
        if (b.pelt <= 0) {
          b.pelt = 0.35;
          lureSpore(Math.atan2(G.player.y - b.hy, G.player.x - b.hx), 280 * G.shotSpeed);
        }
      } else {
        G.forceDark = lerp(G.forceDark, 0.72, Math.min(1, dt * 2));
      }
      if (b.charge > 0) {
        b.charge -= dt;
        const k = b.charge > 0.65 ? dt * 4 : dt * 2;
        b.x = lerp(b.x, b.charge > 0.65 ? b.tx : b.homeX, Math.min(1, k));
        b.y = lerp(b.y, b.charge > 0.65 ? b.ty : 300, Math.min(1, k));
        return;
      }
      b.retarget -= dt;
      if (b.retarget <= 0) {
        b.homeX = rand(170, View.W - 170);
        b.retarget = rand(2, 3.4);
      }
      b.x = lerp(b.x, b.homeX, Math.min(1, dt * 0.8));
      b.y = lerp(b.y, 300, Math.min(1, dt * 0.8));
      b.atkT -= dt;
      if (b.atkT <= 0) {
        attack();
        b.atkT = rand(1.8, 2.8) / (1 + loop * 0.15) / (b.hp < b.maxhp * 0.4 ? 1.35 : 1);
      }
    }
    return {
      begin() {
        const hp = (200 + loop * 120) * (1 + (n - 1) * 0.03);
        b = {
          type: 'boss', variant: 'queen', sprite: 'queen', species: 'queen', name: def.title,
          x: View.W / 2, y: -220, r: 30, bodyR: 82, hp, maxhp: hp,
          score: 9000 * (loop + 1), state: 'enter', homeX: View.W / 2, tx: 0, ty: 0,
          retarget: 2, atkT: 2, charge: 0, blackout: 0, pelt: 0, sway: 0,
          anim: 0, animSpeed: 2.5, flash: 0, rot: 0, lastX: View.W / 2, dead: false, hidden: false,
          arms: [], armsLeft: 0,
        };
        b.move = move;
        G.enemies.push(b);
        G.boss = b;
        Sound.Music.setMode('boss');
      },
      update() {},
      done() { return b.dead && G.enemies.length === 0 && G.timers.length === 0; },
    };
  },

  // The colony: a long chain of bells behind a float. Only the last bell can be cut,
  // and the float is armoured until every bell is gone.
  colony(def, n, loop) {
    let b = null;
    const GAP = 30;
    function place() {
      const tr = b.trail;
      let idx = tr.length - 1, acc = 0, want = GAP;
      for (const seg of b.arms) {
        while (idx > 0) {
          const [x0, y0] = tr[idx], [x1, y1] = tr[idx - 1];
          const d = Math.hypot(x1 - x0, y1 - y0);
          if (acc + d >= want) {
            const k = (want - acc) / d;
            seg.x = lerp(x0, x1, k); seg.y = lerp(y0, y1, k);
            break;
          }
          acc += d; idx--;
        }
        if (idx <= 0) { seg.x = tr[0][0]; seg.y = tr[0][1] - (want - acc); }
        want += GAP;
      }
    }
    function move(b_, dt) {
      const left = b.armsLeft / b.arms.length;
      b.t += dt * 0.42 * (1 + (1 - left) * 0.9);
      const tx = View.W / 2 + Math.sin(b.t) * View.W * 0.4;
      const ty = View.H * 0.32 + Math.sin(b.t * 2 + 0.6) * View.H * 0.16;
      if (b.state === 'enter') {
        b.x = lerp(b.x, tx, Math.min(1, dt * 1.2));
        b.y = lerp(b.y, ty, Math.min(1, dt * 1.2));
        b.enterT = (b.enterT || 0) + dt;
        if (b.enterT > 2.6) { b.state = 'fight'; Sound.sfx.bossGroan(); }
      } else {
        b.x = lerp(b.x, tx, Math.min(1, dt * 4));
        b.y = lerp(b.y, ty, Math.min(1, dt * 4));
      }
      const last = b.trail[b.trail.length - 1];
      if (!last || Math.hypot(last[0] - b.x, last[1] - b.y) > 3) {
        b.trail.push([b.x, b.y]);
        if (b.trail.length > 700) b.trail.splice(0, 100);
      }
      place();
      if (b.state !== 'fight') return;
      b.atkT -= dt;
      if (b.atkT <= 0) {
        const sp = 200 * G.shotSpeed;
        if (b.armsLeft > 0) {
          const alive = b.arms.filter(s => !s.dead);
          for (let i = 0; i < 3; i++) {
            const s = pick(alive);
            fireShot('boss', s.x, s.y + 10, rand(-30, 30), sp);
          }
          const a = Math.atan2(G.player.y - b.y, G.player.x - b.x);
          for (const o of [-0.2, 0, 0.2]) fireShot('boss', b.x, b.y, Math.cos(a + o) * sp * 1.2, Math.sin(a + o) * sp * 1.2);
          b.atkT = rand(1.2, 1.9) / (1 + loop * 0.15);
        } else {
          for (let i = 0; i < 10; i++) fireShot('boss', b.x, b.y, Math.cos((i / 10) * TAU) * sp, Math.sin((i / 10) * TAU) * sp);
          b.atkT = rand(0.9, 1.3);
        }
      }
    }
    return {
      begin() {
        const hp = (160 + loop * 100) * (1 + (n - 1) * 0.03);
        const bellHp = hp * 0.12;
        b = {
          type: 'boss', variant: 'colony', sprite: 'colony', species: 'colony', name: def.title,
          x: View.W / 2, y: -80, r: 30, hp, maxhp: hp, score: 10000 * (loop + 1),
          state: 'enter', t: 0, atkT: 2, trail: [[View.W / 2, -400], [View.W / 2, -80]],
          anim: 0, animSpeed: 3, flash: 0, rot: 0, lastX: View.W / 2, dead: false, hidden: false,
          arms: [], armsLeft: def.bells,
        };
        b.move = move;
        G.enemies.push(b);
        for (let i = 0; i < def.bells; i++) {
          const seg = { type: 'seg', boss: b, idx: i, hp: bellHp, maxhp: bellHp, r: 20, x: b.x, y: -120 - i * GAP, anim: i * 0.7, animSpeed: 4, flash: 0, rot: 0, lastX: b.x, dead: false, hidden: false, boilSeed: i };
          b.arms.push(seg);
          G.enemies.push(seg);
        }
        G.boss = b;
        Sound.Music.setMode('boss');
      },
      update() {},
      done() { return b.dead && G.enemies.length === 0 && G.timers.length === 0; },
    };
  },

  // A kraken whose head is armoured until every arm has been shot off.
  kraken(def, n, loop) {
    let b = null;
    const SEG = 12;

    function spore(ang, speed, ox = 0) {
      fireShot('boss', b.x + ox, b.y + 30, Math.cos(ang) * speed, Math.sin(ang) * speed);
    }
    function attack() {
      const rage = b.armsLeft === 0;
      const opts = ['fan', 'reach', 'reach'];
      if (rage || def.hard) opts.push('ring', 'ink');
      if (!rage) opts.push('spines');
      if (G.enemies.length < 14) opts.push('spawn');
      const a = pick(opts);
      const sp = 220 * G.shotSpeed;
      if (a === 'fan') {
        const c = rage ? 9 : 7;
        for (let i = 0; i < c; i++) spore(Math.PI / 2 + (i - (c - 1) / 2) * 0.17, sp);
      } else if (a === 'ring') {
        for (let i = 0; i < 14; i++) spore(0.12 + (i / 13) * (Math.PI - 0.24), sp * 0.9);
      } else if (a === 'reach') {
        const alive = b.arms.filter(r => !r.dead && r.reach <= 0);
        if (!alive.length) return spore(Math.atan2(G.player.y - b.y, G.player.x - b.x), sp * 1.3);
        const arm = pick(alive);
        arm.reach = 1.3;
        Sound.sfx.whoosh();
      } else if (a === 'spines') {
        for (const arm of b.arms) {
          if (arm.dead) continue;
          const ang = Math.atan2(G.player.y - arm.y, G.player.x - arm.x);
          fireShot('boss', arm.x, arm.y, Math.cos(ang) * sp * 1.1, Math.sin(ang) * sp * 1.1);
        }
      } else if (a === 'ink') {
        for (let i = 0; i < 5; i++) inkCloud(rand(View.W * 0.15, View.W * 0.85), rand(View.H * 0.25, View.H * 0.55), 1.3);
        for (let i = 0; i < 5; i++) spore(Math.PI / 2 + (i - 2) * 0.3, sp * 0.8);
        Sound.sfx.squirt();
      } else {
        for (let i = 0; i < 4; i++) {
          const e = makeCreature(i % 2 ? 'jelly' : 'jellyB', b.x + (i - 1.5) * 40, b.y + 60);
          e.vx = (i - 1.5) * 120; e.vy = 60;
          e.move = diver;
        }
      }
    }
    function diver(e, dt) {
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.vy += 40 * dt;
      e.vx += (G.player.x - e.x) * 0.45 * dt;
      e.vx *= 1 - 0.3 * dt;
      if (e.y > View.H + 60) e.dead = true;
    }
    function layoutArms(dt) {
      const count = b.arms.length;
      for (const arm of b.arms) {
        const i = arm.idx;
        const u = count === 1 ? 0 : i / (count - 1) - 0.5;
        const bx = b.x + u * 64, by = b.y + 30;
        let a0 = Math.PI / 2 + u * 1.9 + Math.sin(G.time * 1.4 + i * 1.1) * 0.25;
        let len = 170;
        if (!arm.dead && arm.reach > 0) {
          arm.reach = Math.max(0, arm.reach - dt);
          const k = Math.sin((1 - arm.reach / 1.3) * Math.PI);
          const toP = Math.atan2(G.player.y - by, G.player.x - bx);
          a0 = lerp(a0, toP, k * 0.85);
          len += k * 230;
        }
        if (arm.dead) { len = 38; arm.severed = Math.max(0, arm.severed - dt); }
        const pts = [];
        let px = bx, py = by;
        const step = len / SEG;
        for (let k = 0; k <= SEG; k++) {
          pts.push([px, py]);
          const ang = a0 + Math.sin(G.time * 2.2 + i * 0.9 + k * 0.45) * 0.45 * (k / SEG);
          px += Math.cos(ang) * step;
          py += Math.sin(ang) * step;
        }
        arm.pts = pts;
        if (!arm.dead) { arm.x = pts[SEG - 2][0]; arm.y = pts[SEG - 2][1]; }
        arm.flash = Math.max(0, arm.flash - dt);
      }
    }
    function move(b_, dt) {
      if (b.state === 'enter') {
        b.y = lerp(b.y, 235, Math.min(1, dt * 1.3));
        if (Math.abs(b.y - 235) < 4) { b.state = 'fight'; Sound.sfx.bossGroan(); }
        layoutArms(dt);
        return;
      }
      const rage = b.armsLeft === 0;
      b.retarget -= dt;
      if (b.retarget <= 0) {
        b.tx = rand(150, View.W - 150);
        b.ty = rand(220, Math.max(250, View.H * 0.32));
        b.retarget = rand(1.8, 3.2) / (rage ? 1.5 : 1);
      }
      b.x = lerp(b.x, b.tx, Math.min(1, dt * (rage ? 1.6 : 0.9)));
      b.y = lerp(b.y, b.ty, Math.min(1, dt * (rage ? 1.6 : 0.9)));
      layoutArms(dt);
      b.atkT -= dt;
      if (b.atkT <= 0) {
        attack();
        b.atkT = rand(1.3, 2.3) / (rage ? 1.4 : 1) / (def.hard ? 1.15 : 1) / (1 + loop * 0.15);
      }
    }
    return {
      begin() {
        const hp = (180 + loop * 120) * (def.hard ? 1.5 : 1) * (1 + (n - 1) * 0.03);
        b = {
          type: 'boss', x: View.W / 2, y: -220, r: 70, oy: -45, hp, maxhp: hp,
          name: def.title, sprite: def.hard ? 'krakenOld' : 'kraken', variant: 'kraken',
          score: (def.hard ? 12000 : 6000) * (loop + 1),
          state: 'enter', tx: View.W / 2, ty: 235, retarget: 2, atkT: 1.8,
          anim: 0, animSpeed: 3, flash: 0, rot: 0, dead: false, hidden: false,
          arms: [], armsLeft: def.arms,
        };
        b.move = move;
        G.enemies.push(b);
        const armHp = hp * (def.hard ? 0.22 : 0.3);
        for (let i = 0; i < def.arms; i++) {
          const arm = { type: 'arm', boss: b, idx: i, hp: armHp, maxhp: armHp, r: 28, x: b.x, y: b.y, pts: [], reach: 0, severed: 0, flash: 0, dead: false, hidden: false };
          b.arms.push(arm);
          G.enemies.push(arm);
        }
        G.boss = b;
        Sound.Music.setMode('boss');
      },
      update() {},
      done() { return b.dead && G.enemies.length === 0 && G.timers.length === 0; },
    };
  },
});
