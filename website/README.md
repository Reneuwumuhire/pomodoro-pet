# Petomato — landing site

A single-page, dependency-free marketing site. Bold "electronics catalog" design:
material-blocked sections (silver casing → ink → green LCD → bone → red), a live
**interactive device** hero (real ticking timer + animated canvas pet + switchable skins),
and the six real app skins in the gallery.

## Preview

Just open `index.html` in a browser — it works straight from the file system (no build, no
server). Or serve it:

```bash
cd website && python3 -m http.server 8200   # http://localhost:8200
```

## Wire up the downloads (macOS + Windows)

The page **detects the visitor's OS** and shows the matching button (with the other as a
secondary link). By default both point at the GitHub **Releases** page (`RELEASES` constant at the
top of `app.js`). To link assets directly instead, either:

- publish a release and set each `DOWNLOADS[*].file` to the asset URL, or
- drop the built files next to `index.html` and use relative names:

| OS      | Build command  | Example filename             |
| ------- | -------------- | ---------------------------- |
| macOS   | `pnpm dist`     | `PomodoroPet-mac-arm64.dmg`  |
| Windows | `pnpm dist:win` | `PomodoroPet-win-x64.exe`    |

## Deploy

It's fully static — drop the `website/` folder on Netlify, Vercel, GitHub Pages, or any host.

## Stack

- Hand-written HTML/CSS, one vanilla JS file (`app.js`) + the ported pixel-pet renderer
  (`assets/pet.js`, same sprites as the app).
- Fonts: **Bricolage Grotesque** (display) + **Press Start 2P** (pixel accents), self-hosted.
- Skin screenshots are real captures of the app in each theme.
