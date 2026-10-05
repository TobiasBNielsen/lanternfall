'use strict';

// The frame loop and start-up. Loaded last.

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
  Sound.Music.setIntensity(G && state === 'playing' ? G.enemies.length : 0);
  if (G && state === 'playing' && G.depth >= 480) {
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
  Ads.init().then(() => { if (state === 'menu') Ads.showBanner(); });
  if (window.matchMedia('(pointer: coarse)').matches) {
    Input.mode = 'touch';
    document.body.classList.add('touch');
  }
  window.addEventListener('resize', resize);
  requestAnimationFrame(t => { lastT = t; frame(t); });
}

boot();
