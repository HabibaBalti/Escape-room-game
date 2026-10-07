# Station Halcyon: Split Signal

A two-player co-op escape room in the browser, inspired by the "two players, two rooms, talk it out" format of *Alone Together*, but set on a damaged space station.

A micrometeor strike has sealed the station's bulkhead. The **Commander** is stuck on the Command Deck and the **Engineer** is stuck in the Engineering Bay. Each room holds the clues the *other* player needs, so the only way out is to describe what you see.

## How to play

1. Both players open the game on their **own device** (just open `index.html`, or host the folder on GitHub Pages / any static host).
2. One picks **Commander**, the other **Engineer**.
3. Get on a voice call. **Don't look at each other's screens.**
4. It's point-and-click. Each room has two walls, and you turn with the arrows on the sides. Click an object to zoom in, and use the arrow at the bottom to step back.
5. Click things to pick them up. Click an inventory item once to select it (some things only reveal their secrets when the right item is selected), and click it again to look at it closely.
6. Stuck? The **Hint** button gives hints for whatever you're looking at.

Progress is saved in the browser (separately for each role). Use **Menu → Reset** to start over.

No build step and no server. It's plain HTML/CSS/JS.

## Files

- `index.html`: page shell
- `style.css`: styling
- `game.js`: scenes (drawn in SVG), puzzles, inventory, hints, save state

<details>
<summary><strong>Spoilers: full solution</strong></summary>

| # | Who solves | Puzzle | Clue is in | Answer |
|---|---|---|---|---|
| 1 | Commander | Locker: 4 constellation plates | Engineer's star chart (watch for mirrored decoys) | `7453` → UV Torch |
| 2 | Engineer | Tool store colour lock | Commander's blinking beacon (starts after the long pause) | Yellow, Blue, Red, Blue, Green → Punch Card + Morse Card |
| 3 | Commander | Panel 7 letter grid (select the UV torch) | Engineer's punch card hole positions | `COMET` (tell the Engineer) |
| 4 | Engineer | Terminal password | Word from step 3 | `COMET` (letter dials) |
| 5 | Commander | Navigation course | Engineer's terminal diagram (rotated: north points right) | 8-cell path, see `COURSE` in `game.js` → Cipher Wheel + Morse transmission |
| 6 | Engineer | Coolant valves ▲ ● ■ | Commander's gauges (different order) | ▲6 ●2 ■9 → opens hatch |
| 7 | Commander | Command airlock | Glyphs in Engineer's hatch ♂ ♃ ☾ ♄, decoded with the cipher wheel | `3672` |
| 8 | Engineer | Engineering airlock | Commander's Morse transmission, decoded with the Morse card | `3806` |

</details>
