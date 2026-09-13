# Orbit Forge 🚀

A 3D rocket design and launch game that runs entirely in the browser. Build a rocket from different nose cones, body shapes, fins, engines and fuel tanks, then launch it. A good design reaches orbit. A bad one crashes, tumbles, or tears itself apart.

Built with plain HTML, CSS and JavaScript modules, [three.js](https://threejs.org/) for rendering and [cannon-es](https://github.com/pmndrs/cannon-es) for crash debris physics. There is no build step, so it deploys straight to GitHub Pages.

## Learn the science (kids to adults)

- **🎓 Academy**: opens automatically on the first visit, or from the **Learn** button. Nine short animated lessons, each with something to play with:
  1. Action and reaction (Newton’s third law, with an engine test stand)
  2. Thrust vs. weight (drag the thrust slider and watch it lift off or stay put)
  3. The rocket equation (fuel share vs. final speed, compared with orbit targets)
  4. Staging (one stage vs. two stages burning the same fuel)
  5. Air resistance (a wind tunnel with pointed, rounded and flat noses)
  6. Stability (turn the fins off and send a gust of wind)
  7. Orbits (Newton’s cannonball: crash, orbit or escape)
  8. How a launch works (liftoff → gravity turn → Max Q → staging → coast → circularize)
  9. Mission briefing (the 8 steps to build an orbital rocket)

  Each lesson has a plain-language explanation, an optional **"The science"** card with the formula, and a **real-world fact**. Kids can switch the science cards off.
- **🧭 Guide me**: a spotlight walks you through building your first orbital rocket, one part at a time, with a **Do it for me** button on every step.
- **🔬 Science tips**: pop-ups explain liftoff, Mach 1, Max Q, staging, reaching space, engine cut-off, the circularization burn and orbit as they happen. Toggle them with the **Tips** button during flight.

## Gameplay

1. **Design** in the hangar:
   - **Nose cone:** Ogive, Conical, Elliptical or Flat Cap. These change drag and the transonic drag spike.
   - **Body shape:** Cylinder, Tapered, Square Box or Spherical Tanks. These change fuel volume, dry mass, drag and structural strength.
   - **Fins:** None, Delta, Swept or Big Square. These change aerodynamic stability and drag.
   - **1–3 stages**, each with its own engine (Bell, Conical, Aerospike, Vacuum Bell, Triple Cluster) and tank length.
   - **Flight plan:** Gravity Turn, Lofted Turn, Aggressive Turn, Straight Up, or Manual.
2. **Check the analysis panel** for launch mass, thrust-to-weight, Δv per stage, and the centre-of-mass vs centre-of-pressure stability diagram.
3. **Launch** and watch the flight computer fly it, or fly it yourself.

### How designs fail

| Failure | Cause |
| --- | --- |
| Never left the pad | Liftoff thrust-to-weight below 1 |
| Aerodynamic breakup | Unstable (CP ahead of CM) with too little engine gimbal, or a steep angle of attack in thick air |
| Structural failure | Dynamic pressure above what the body can take (too much thrust low down, or a weak box or sphere body) |
| Crashed / broke apart on reentry | Not enough Δv, or too much drag, to reach orbital speed |

## Physics model

- Compact, Kerbin-sized planet: 600 km radius, 9.81 m/s² surface gravity, and an exponential atmosphere up to 70 km. Orbit needs roughly 3,400 m/s of Δv.
- Inverse-square gravity, integrated in the orbital plane.
- Thrust with altitude-dependent Isp, drag with Mach-dependent coefficients, and extra drag when flying sideways.
- Barrowman-style centre of pressure, with a centre of mass that shifts as fuel drains. Pitch dynamics include aerodynamic torque, damping and engine gimbal authority.
- Structural limits on dynamic pressure, bending load (angle of attack × dynamic pressure × slenderness), and G-force.
- Keplerian orbit prediction for the apoapsis, periapsis and map view.
- Rigid-body debris from cannon-es when a rocket is destroyed.

## Controls

| Input | Action |
| --- | --- |
| Drag / scroll | Orbit and zoom the camera |
| `M` | Toggle the orbit map |
| `,` `.` | Time warp down / up |
| `Space` | Stage now |
| `Esc` | Back to the hangar |
| `A` / `D` | Pitch (manual flight plan) |
| `W` / `S`, `Z` / `X` | Throttle up / down, full / cut (manual) |

## Run locally

ES modules and import maps need to be served over HTTP, so opening `index.html` directly from disk won't work. From this folder, run:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. Any static server works, for example `npx serve`.

## Deploy to GitHub Pages

1. Create a GitHub repository and push these files to the `main` branch, with `index.html` at the repository root.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, and save.
4. After a minute the game is live at `https://<your-username>.github.io/<repo-name>/`.

The `.nojekyll` file tells GitHub Pages to serve the files as-is. three.js and cannon-es load from the jsDelivr CDN, so players need an internet connection.

## Project layout

```
index.html        page shell, import map, HUD markup
css/style.css     all styling
js/main.js        scene setup, game state, main loop
js/config.js      planet constants, parts catalog, tuning
js/design.js      design → geometry, masses, aerodynamics, stats, presets
js/physics.js     flight simulation and guidance (no three.js dependency)
js/rocketMesh.js  procedural 3D rocket models
js/world.js       planet, atmosphere, launch site, sky, lights
js/effects.js     exhaust, explosions, cannon-es debris
js/ui.js          hangar, analysis panel, HUD, results
js/icons.js       SVG part icons
```

## License

Rocket Orbit Forge App © 2026 by [Vishal Bhoir](https://linktr.ee/thebioway) is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
