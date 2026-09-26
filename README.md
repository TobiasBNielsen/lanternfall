# Lanternfall

Notes from a descent. A deep-sea shooter for the browser, drawn like a 1930s cyanotype: paper-white linework on Prussian blue, and a single warm amber for anything that gives off light.

**▶ Play it here: https://tobiasbnielsen.github.io/lanternfall/**

## How it plays

- **Every wave is 400 ft deeper.** The blue deepens from sunlit water through the twilight and the midnight water down to the abyss and the trench. Down there you only see what glows: your lamp, the lamp-horns' lights, the spores they spit.
- **Air runs out.** Your air drains during a fight. Catch the bubbles rising from the vents below, or lose a hull plate.
- **Pearls pay for supplies.** Between waves the ship above lowers a basket: grade your weapon up, swap to another one, add a hull plate or buy sonar charges.
- **Getting hit costs you.** You lose a plate and half your pearls spill into the water. Catch them before they sink.
- **Watch for the warning.** Every creature gives a moment's notice before it attacks. The lamp-horn's light flickers twice before it spits.
- **Krakens** turn up every fourth wave. The head is armoured until every arm is shot off.
- **The field book.** The first time you take a new species it goes in the book as a plate, with its name and a line of notes. Six to find.

## Look and feel

- Every creature is drawn procedurally as pen linework with engraver's hatching and stippling. Each frame exists in two hand-drawn variants that alternate, so the lines shimmer like pencil animation.
- The water has the blotchy exposure, brush streaks and ragged edges of a hand-coated cyanotype sheet.
- Type is IM Fell English for headings and Courier Prime for the log.
- Sound is synthesized with the Web Audio API and heard through a filter that gets more muffled the deeper you go. At depth, the hull creaks.

## Controls

| Action       | Desktop                         | Mobile                    |
| ------------ | ------------------------------- | ------------------------- |
| Steer        | Mouse, WASD or arrow keys       | Drag anywhere             |
| Fire         | Hold left click or Space        | Auto-fire while touching  |
| Sonar blast  | Right click, M or Shift         | Round sonar button        |
| Pause        | P or Esc                        | Pause button              |
| Supplies     | A–E or 1–5 to buy, Enter to dive | Tap                      |

## Running locally

No build step and no dependencies. Serve the folder with any static web server:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Project structure

```
index.html        Title page, HUD, supplies and field book
css/style.css     Styling
js/util.js        Math helpers, storage, viewport
js/audio.js       Synthesized sound effects and music
js/sprites.js     Procedural linework, hatching and stippling
js/background.js  Water column, cyanotype texture, depth zones
js/entities.js    Sphere, weapons, creatures, species notes, pickups
js/waves.js       Wave definitions, movement patterns and the kraken
js/game.js        Game loop, input, rendering, supplies, field book, UI
```
