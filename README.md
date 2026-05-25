# Lighting 

## Run locally

- `npm install`
- `npm start` → [http://localhost:1234](http://localhost:1234)

## Controls

- **Camera**: Orbit X/Y and distance sliders; **W/A/S/D** orbit, **Q/E** zoom
- **Point light**: X/Y/Z sliders, RGB color, animate toggle, ON/OFF
- **Spot light**: Position + cutoff angle, ON/OFF (aims at scene center)
- **Lighting** / **Normal viz** toggle buttons

## GitHub Pages

1. `npm install`
2. `npm run build` (creates the `docs/` folder)
3. Commit and push everything, including `docs/`
4. On GitHub: **Settings → Pages**
   - **Source**: Deploy from a branch
   - **Branch**: `main`
   - **Folder**: `/docs`
5. Wait 1–2 minutes. Your site will be at:

   **https://jay-sangha.github.io/A4-Lighting/**

After you change code, run `npm run build` again and push before the live site updates.

