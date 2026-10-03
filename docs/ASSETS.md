# Assets — what we use and what we reviewed

**Art direction:** blueprint and schematic line art. It's hand-written SVG
in ISO 1219 style, recolored by CSS, and animated in code. Third-party assets
are used only where code-drawn art can't do the job (sound) or where they match
the style.

## In use

**Brand:** IFP's colors, font and the official iFP logo (`assets/brand/`, drawn by `src/brand.js`); see
[CREDITS.md](../CREDITS.md). Themes are CSS variables at the top of `style.css`
(light by default, `data-theme="dark"` on `<html>` for the shop floor); the machine
canvas always reads the dark set from its wrapper.

**Sound effects:** 12 clips from Kenney (CC0), listed in
[CREDITS.md](../CREDITS.md). They're wired up in `src/audio.js`. A mute toggle
sits in the header (keyboard `M`) and is remembered per browser.

To swap a sound, replace the MP3 in `assets/audio/` (same name), or point
the event at a different file in the `SOUNDS` map in `src/audio.js`. The clips
were picked by name, length and loudness, not by ear, so a listening pass is
welcome.

## Reviewed Kenney packs (all CC0)

Downloaded and inspected on 2026-10-01. Kenney's visual style is flat and
cartoony, so most visual packs would clash with the blueprint look.

| Pack | What it is | Fit | Possible use |
|---|---|---|---|
| Interface Sounds, Impact Sounds, Sci-Fi Sounds, Music Jingles | Short SFX and stingers | ✅ **In use** | More variety: achievements, contract complete, department hires |
| UI Audio, Digital Audio | Clicks, switches, beeps | ✅ Good | Alternates if the current picks feel off |
| Board Game Icons | 256 single-color **SVG** glyphs | ✅ Good | Recolorable UI glyphs (lock, hourglass, $, flag) that sit fine next to line art |
| Medals | Medal sprites | ⚠️ Partial | Achievements (would need restyling) |
| Tiny Factory | Pixel-art factory tiles: pipes, conveyors, workers | ⚠️ Different style | A possible "shop floor" view showing workers and machines, as its own pixel-art screen |
| Platformer Pack: Industrial, Pixel Platformer: Industrial | Industrial tiles: pipes, panels, hazard stripes | ⚠️ Different style | Hazard stripes and panels for decoration |
| Game Icons (+ Expansion) | Controller/UI icons | ❌ Low | Mostly gamepad and media icons |
| UI Pack, UI Pack: Sci-Fi | Buttons, panels, sliders | ❌ Low | Our CSS panels already cover this |
| Particle Pack, Smoke Particles | PNG particle textures | ⚠️ Later | Steam or oil-mist effects on a relief-valve dump or a burst hose (Safety incidents) |
| Cartography Pack | Map symbols | ❌ Low | The territory map is already a tile cartogram |

## Rules for adding assets

1. License must be CC0 or similarly permissive. Record every file in CREDITS.md.
2. Commit only the files the game uses, not whole packs.
3. Prefer SVG, or MP3 for audio. Keep each file small.
4. No customer or supplier logos, and no photos of real people, without permission.
