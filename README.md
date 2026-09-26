# Lanternfall

A deep-sea shooter for the browser. Take a little yellow sub down through glowing jellies, anglerfish and a kraken, and see how deep you get before the air runs out.

**▶ Play it here: https://tobiasbnielsen.github.io/lanternfall/**

## How it plays

- **Every wave is 200 m deeper.** The water gets darker zone by zone: Sunlight, Twilight, Midnight, the Abyss and the Hadal Trench. Down there you only see what glows.
- **Air runs out.** Your oxygen drains during a fight. Catch the air bubbles rising from the vents below, or lose a hull plate.
- **Pearls are money.** Creatures and wrecks drop pearls. Between waves you dock and spend them: tune your weapon, refit to another one, patch the hull or buy sonar charges.
- **Getting hit costs you.** You lose a hull plate and half your pearls spill into the water. Catch them before they sink.
- **Krakens** turn up every fourth wave. Their head is armoured until you've shot off every arm.

## Features

- Three weapons (Harpoon, Sonar Ring, Bubble Gun), each with 10 power levels bought at the dock
- Four kinds of wave: jelly blooms, anglerfish currents, maelstroms and wreckfalls, plus two krakens
- Real darkness in the deep zones: the sub's headlamp, anglerfish lures and jellies cut through it
- Graphics drawn procedurally on an HTML5 canvas, with no image files
- Synthesized sound effects and music using the Web Audio API
- Plays on desktop (mouse or keyboard) and on mobile (touch)
- High score and deepest dive saved locally

## Controls

| Action       | Desktop                         | Mobile                    |
| ------------ | ------------------------------- | ------------------------- |
| Steer        | Mouse, WASD or arrow keys       | Drag anywhere             |
| Fire         | Hold left click or Space        | Auto-fire while touching  |
| Sonar blast  | Right click, M or Shift         | Red SONAR button          |
| Pause        | P or Esc                        | Pause button              |
| Dock         | 1–5 to buy, Enter to dive       | Tap                       |

## Running locally

No build step and no dependencies. Serve the folder with any static web server:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Project structure

```
index.html        Page layout, menus, dock and HUD
css/style.css     Styling
js/util.js        Math helpers, storage, viewport
js/audio.js       Synthesized sound effects and music
js/sprites.js     Procedural sprite rendering
js/background.js  Water column, light shafts, depth zones
js/entities.js    Sub, weapons, creatures, pickups and particles
js/waves.js       Wave definitions, movement patterns and the kraken
js/game.js        Game loop, input, rendering, dock and UI
```
