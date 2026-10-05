'use strict';

// Mouse, keyboard and touch. Only records intent; the simulation reads it each frame.

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
