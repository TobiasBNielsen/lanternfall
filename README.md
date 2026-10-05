# Lanternfall

Notes from a descent. A deep-sea shooter for the browser, drawn like a 1930s cyanotype: paper-white linework on Prussian blue, and a single warm amber for anything that gives off light.

**▶ Play it here: https://lanternfall.bockersoftware.dk/**

## How it plays

- **Every wave is 120 meters deeper.** The blue deepens from sunlit water through the twilight and the midnight water down to the abyss and the trench. Down there you only see what glows: your lamp, the lamp-horns' lights, the spores they spit.
- **Air runs out.** Your air drains during a fight. Catch the bubbles rising from the vents below, or lose a hull plate.
- **Pearls pay for supplies.** Between waves the ship above lowers a basket: grade your weapon up, swap to one of two other weapons it has room for, add a hull plate or buy sonar charges.
- **Six weapons:** harpoon, sonar ring, bubble gun, flare gun (sticks, lights up the dark, then bursts), net (tangles and slows everything it opens on) and galvanic coil (a spark that jumps from creature to creature).
- **Getting hit costs you.** You lose a plate and half your pearls spill into the water. Catch them before they sink.
- **Watch for the warning.** Every creature gives a moment's notice before it attacks. The lamp-horn's light flickers twice before it spits.
- **Something large every fourth wave,** each with its own rule:
  - *Grandmother Inkwell* and *The Old One*, krakens whose heads are armoured until every arm is shot off.
  - *The Lantern Queen*, who puts out every light but her own. Her body stops your shots; only her lamp can be hurt.
  - *The Colony*, twelve meters of bells behind a float. Only the last bell can be cut, and the float waits for the end.
- **Sixteen waves to a cycle** with ten kinds of creature, among them chain colonies that come apart bell by bell, silver hatchets that cross in pairs, gulpers that drag the sphere toward their open mouths (and can only be hurt while open), and fire-tubes that break into three.
- **The field book.** The first time you take a new species it goes in the book as a plate, with its name and a line of notes. Twelve to find.
- **The deepest dives.** Sign the log once with a name, and from then on every dive goes on the shared leaderboard by itself. Names are reserved: nobody else can sign as you. Your own place shows on the title page even when you are far down the log.

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

The game itself has no build step and no dependencies. The leaderboard is a small ASP.NET Core app that also serves the game. With the .NET 10 SDK installed:

```bash
dotnet run --project server --urls http://localhost:5080
```

Then open http://localhost:5080. The leaderboard is kept in `App_Data/lanternfall.db` (SQLite) next to the built app.

## Hosting

The game runs on a Simply.com web hotel (Windows/IIS) at https://lanternfall.bockersoftware.dk, in the folder `/lanternfall`. Every push to `main` publishes the app self-contained for `win-x86` (Simply's requirement) and uploads the changed files over FTPS (`.github/workflows/deploy.yml`). While files are replaced, `app_offline.htm` keeps visitors on a short "back in a minute" page. The database file is never uploaded or overwritten.

The workflow uses the repository variables `FTP_HOST`, `FTP_USER` and `FTP_DIR` and the secret `FTP_PASSWORD`.

## Project structure

```
web/index.html           Title page, HUD, supplies and field book
web/css/style.css        Styling
web/js/util.js           Math helpers, storage, viewport
web/js/audio.js          Synthesized sound and music
web/js/sprites.js        Procedural linework, hatching and stippling
web/js/background.js     Water column, cyanotype texture, depth zones
web/js/entities.js       Creatures, species notes, damage, pickups, particles
web/js/weapons.js        The six weapons and how their shots behave
web/js/waves.js          Wave definitions and movement patterns
web/js/bosses.js         The krakens, the lantern queen and the colony
web/js/leaderboard.js    Talks to the shared log of deepest dives
web/js/core.js           Game state and one step of the simulation
web/js/input.js          Mouse, keyboard and touch
web/js/render.js         Everything drawn on the canvas
web/js/ui.js             HUD, screens, supplies, field book, leaderboard UI
web/js/main.js           Frame loop and start-up
server/Program.cs        Serves the game and the leaderboard API
server/Rules.cs          What a finished dive has to look like to go in the log
server/Board.cs          Ranks divers by their best dive
server/Db.cs             The SQLite file and its tables
deploy/app_offline.htm   Shown while a new version is being uploaded
```
