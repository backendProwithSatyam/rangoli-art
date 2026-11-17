# Radha Rani – Rangoli Reel

A Radha Rani rangoli that draws itself. Ten cursor agents sketch it in chalk, pour the powder
(veil, lotus-petal crown, hair, skin), add the kajal, bindi and jewellery, and finish with gold
glitter and the title **श्री राधा रानी**. The reel is 9:16 and about 41 seconds long, made to be
screen-recorded on a phone and posted as an Instagram reel.

## Record it on your phone

1. Open the page on your phone (see below).
2. Start the phone's screen recorder, then go back to the page.
3. Tap **Tap to start**. The reel goes full screen and plays once, then holds on the final frame.
4. Stop the recording and trim the start and end in your gallery or in Instagram.

Tap the screen after it ends to play it again. Add music inside Instagram.

**Tips**

- Android Chrome hides its address bar when the reel starts. On iPhone, tap **Share → Add to Home
  Screen** and open it from the home screen icon to get rid of the Safari bars.
- Keep the phone awake: on an `https://` link the page stops the screen from dimming by itself. On a
  plain `http://` link, set Auto-Lock / Screen timeout to at least 1 minute while recording.
- Silent mode, Do Not Disturb and full brightness help a clean recording.

## Open it on your phone

**Same Wi-Fi (quickest).** On the PC, in this folder:

```bash
python -m http.server 5500 --bind 0.0.0.0
```

Find the PC's address with `ipconfig` (IPv4 Address, for example `192.168.1.20`) and open
`http://192.168.1.20:5500` on the phone. If it doesn't load, allow Python through Windows Firewall
for private networks.

**Public link (works anywhere, https).**

```bash
npx vercel          # preview deploy (first time asks you to log in)
npx vercel --prod   # production URL
```

## Options

Add these to the link, for example `http://192.168.1.20:5500/?tags=0&credit=my-handle`:

| Option | Effect |
| --- | --- |
| `seconds=30` | How long the drawing part takes (the whole reel adds ~11 s) |
| `hud=0` | Hide the code line, timer and progress pill |
| `tags=0` | Hide the agents' name tags |
| `camera=0` | No zooming, the whole picture stays in view |
| `credit=my-handle` | Text on the end card (default `satyam shukla`) |
| `seed=7` | A different powder grain and sparkle pattern |

---

## How this project is built

**Type:** a static, front-end-only web app. No backend, no build step, no npm install.
Everything is drawn on one `<canvas>` in the browser.

### Stack

| Part | Technology | Why |
| --- | --- | --- |
| Page | HTML + CSS + vanilla JavaScript (ES modules) | Opens instantly on any phone |
| Graphics | HTML5 Canvas 2D at 1080×1920 | Exactly an Instagram reel frame |
| Shapes | SVG path strings, measured with a hidden `<svg>` path | Easy to author curves, and sample points along them |
| Fonts | Inter, JetBrains Mono, Tiro Devanagari Hindi (Google Fonts) | UI text, code line and the Hindi title |
| Phone extras | Fullscreen API, Screen Wake Lock API, web app manifest | Clean, uninterrupted screen recordings |

### Files

| File | What it does |
| --- | --- |
| `index.html` | The canvas and the tap-to-start screen |
| `style.css` | Full-screen, phone-first layout |
| `src/art.js` | **The artwork.** Radha Rani as 54 ordered layers (veil, petals, face, eyes, jewellery…) |
| `src/engine.js` | Agents, scheduling, powder reveal, camera, glitter finale, HUD and title |
| `src/cursors.js` | The 8 cursor types: arrow, crosshair, I-beam, pencil, pen, powder cone, brush ring, wand |
| `src/geometry.js` | Path helpers: mirror, ellipse, petal, sampling points along a path |
| `src/main.js` | Start on tap, full screen, keep awake, URL options |

### How it works

1. **Layers.** Each layer in `art.js` has a `draw()` that paints the finished piece, plus how it is
   made: a chalk `sketch`, a pen `line`, a powder `fill`, or `dots` (beads, pearls, flowers).
2. **Footprints.** Every layer is painted once at 1/12 size to find which cells it covers. A layer
   may start only when every lower layer it overlaps is finished, so the stacking is always right
   and agents work in parallel wherever the picture allows.
3. **Agents.** Ten cursors pick the lowest available layer, fly to it, and follow its path:
   zig-zag rows for powder, the outline for lines, one stop per bead. Big layers get a crew.
4. **Powder reveal.** Each layer is pre-painted off screen; the agent stamps grainy dabs into a
   mask as it moves and only the masked part shows. When the crew finishes, the rest fades in.
5. **Timing.** A dry run measures the whole schedule, then the clock is scaled so the drawing
   always takes `seconds` (30 by default), whatever the phone's speed.
6. **Finale.** Agents switch to wands and sprinkle glitter on the gold, a halo rises behind the
   crown, a light sweep passes, and the title fades in.

### Change the picture

- Colours, shapes and order are all in `src/art.js`. Each `add({...})` is one layer, drawn in order.
- Paths are in 1080×1920 coordinates. The left side is written once and `mirror()` makes the right.
- `crew` makes a layer faster by sharing it between agents; `label` is the name tag text.
