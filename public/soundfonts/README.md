# SoundFont assets

Drop a General MIDI `.sf3` file here as `default.sf3` and the music engine
will use it for all bass / lead / pad rendering. Drums and FX stay
synthesized.

## Recommended free downloads

All of these are free, CC-licensed, and ship a complete General MIDI bank.
`.sf3` (Opus-compressed) is preferred — smaller download, identical audio
quality once decoded.

| Soundfont | License | Size | Notes |
|---|---|---|---|
| **GeneralUserGS** | CC0 (S. Christian Collins) | ~30 MB SF3 | Best default. Clean GM bank, good drums. https://schristiancollins.com/generaluser.php |
| **MuseScore_General** | MIT | ~35 MB SF3 | What MuseScore ships with. https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/ |
| **FluidR3_GM** | MIT | ~140 MB SF2 | The "classic" big GM bank. Convert to .sf3 with the SpessaSynth converter or `polyphone` to save bandwidth. |

## Install

1. Download one of the above.
2. Rename to `default.sf3` (or `default.sf2`).
3. Place this file at `public/soundfonts/default.sf3`.
4. Reload the app. The first generation will fetch + cache the soundfont in
   IndexedDB (browser-side, ~30 MB one-time). All subsequent generations are
   instant cache hits.

## Custom URL

To point at a different soundfont, set the env var before `npm run dev`:

```bash
VITE_SOUNDFONT_URL=https://your.cdn/soundfont.sf3 npm run dev
```

## Disable / fall back to oscillators

In the browser console:

```js
localStorage.setItem('musevibe.soundfont', 'false');
```

then reload. Re-enable with:

```js
localStorage.removeItem('musevibe.soundfont');
```
