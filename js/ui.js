'use strict';

// Everything outside the canvas: HUD, screens, supplies, the field book and the deepest dives.

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
  setHud('depth', G.depth, v => { hud.depth.textContent = v.toLocaleString('en-US') + ' m'; });
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

// Best dives saved before depth was measured in meters were stored in feet; convert them once.
function loadBest() {
  const best = Store.get('lf_best', { score: 0, depth: 0 });
  if (!best.meters) {
    best.depth = Math.round(best.depth * 0.3);
    best.meters = true;
    Store.set('lf_best', best);
  }
  return best;
}

function refreshBest() {
  const best = loadBest();
  $('record').textContent = best.score > 0
    ? `Deepest so far: ${best.depth.toLocaleString('en-US')} m, with ${best.score.toLocaleString('en-US')} points.`
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
  hint('steer');
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
  clearHints();
  G = null;
  Background.setDepth(0);
  Sound.Music.setMode('calm');
  refreshBest();
  showScreen('menu');
}

function gameOver() {
  state = 'gameover';
  clearHints();
  const best = loadBest();
  const record = G.score > best.score;
  Store.set('lf_best', { score: Math.max(best.score, G.score), depth: Math.max(best.depth, G.depth), meters: true });
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
  Sound.Music.setMode('calm');
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
  const others = Object.keys(WEAPONS).filter(k => k !== G.weapon);
  for (const k of [others[G.wave % others.length], others[(G.wave + 2) % others.length]]) {
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
  Sound.Music.setMode('calm');
  hint('dock');
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
  Sound.Music.setMode('normal');
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
      li.innerHTML = '<span class="n"></span><span class="who"></span><span class="dep"></span><span class="pts"></span>';
      li.querySelector('.n').textContent = i + 1 + '.';
      li.querySelector('.who').textContent = r.name;
      li.querySelector('.dep').textContent = r.depth.toLocaleString('en-US') + ' m';
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

// ---------------------------------------------------------------- first-dive notes

// Each note shows once, ever, at the moment it becomes useful. They never pause the game.
const HINTS = {
  steer: () => Input.mode === 'touch'
    ? 'Drag anywhere to steer. The harpoon fires while your finger is down.'
    : 'Steer with the mouse. Hold the button down to fire.',
  pearl: 'A pearl. Sweep over it. The ship takes pearls as payment for supplies.',
  tell: 'That flicker is a warning. Something is about to spit at you.',
  air: 'The air is running down. Catch a bubble rising from below.',
  spill: 'Half your pearls spilled out. They sink slowly, so go after them.',
  sonar: () => Input.mode === 'touch'
    ? 'Crowded? The round button sends a sonar blast that clears the water.'
    : 'Crowded? Right-click, or M, sends a sonar blast that clears the water.',
  boss: 'It cannot be hurt all over. Look for the part that can.',
  dock: 'Spend pearls here. Early on, grading up your weapon is usually the best buy.',
};
const hintsSeen = new Set(Store.get('lf_hints', []));
const hintQueue = [];
let hintTimer = null;

function hint(key) {
  if (hintsSeen.has(key)) return;
  hintsSeen.add(key);
  Store.set('lf_hints', [...hintsSeen]);
  hintQueue.push(key);
  if (!hintTimer) nextHint();
}

function nextHint() {
  const el = $('hintLine');
  const key = hintQueue.shift();
  if (!key) { hintTimer = null; el.classList.add('hidden'); return; }
  const h = HINTS[key];
  $('hintText').textContent = typeof h === 'function' ? h() : h;
  // restart the fade-in for each new note
  el.classList.add('hidden');
  void el.offsetWidth;
  el.classList.remove('hidden');
  hintTimer = setTimeout(nextHint, 5600);
}

function clearHints() {
  hintQueue.length = 0;
  clearTimeout(hintTimer);
  hintTimer = null;
  $('hintLine').classList.add('hidden');
}

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
  $('toastCommon').textContent = `${sp.common}, logged at ${G.depth.toLocaleString('en-US')} m`;
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
