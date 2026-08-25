# QSViewer

A novel way to view BIM models on the web.

![Cover Shot](reports/img/cover-shot-penthouse-lower-res.gif)

Construction 3D models face unique challenges from a computer graphics perspective.

- They require high memory.
- They demand a powerful GPU.
- They exhaust your CPU processing loop.

QSViewer addresses these challenges while providing a lightweight, web-based viewing experience that changes context as you move around. The demo piece is a 800 MB 3D model of a highrise residential development, containing 78k modelled objects, 6 disciplinary layers, and 37 Million triangles, that runs at 60 FPS.

[See these results for yourself](https://suryashch.github.io/QSViewer/).

---

## Features

Context shifts as you do.

![QSViewer - Context Shift](reports/img/qsviewer-context.gif)

Adjust the Query Radius.

![Adjust Query Radius](reports/img/qsviewer-query-radius-2-lowres.gif)

Double click to center on an object.

![Double Click to Center](reports/img/qsviewer-doubleclick-lowres-2.gif)

Dark mode, on demand.

![Dark Mode](reports/img/qsviewer-darkmode-lowres-short.gif)

Works on mobile.

![QSViewer - Mobile View](reports/img/qsviewer-mobile.gif)

---

## How it Works

The engine determines the closest objects to the camera, using a spatial search tree. These objects represent a small subset of the total, and change as the user moves around. The rest of the time, the engine loads the lightweight facade and nothing else.

![QSViewer Zoomed Shot](reports/img/cover-shot-2-lowres.gif)

Additional details are available in the accompanying report, [A Game Developer's Approach to BIM]([reports/a-game-dev-approach-to-bim.md](https://medium.com/@suryash.c/a-game-developers-approach-to-bim-9b4c75311ab6?sharedUserId=suryash.c))

---

## Reproducibility

This project is intended to be a proof of concept only. This may change depending on community feedback.

To reproduce these results locally, clone the repo.

```bash
git clone https://github.com/suryashch/QSViewer.git
```

Download the required packages (listed in package-lock.json).

```bash
npm install
```

Run the application.

```bash
npm run
```

Or, open `index.html` in a browser.

---

Model Credits: [buildingSmart Community](https://github.com/buildingsmart-community).

Built with [three.js](https://threejs.org/) and [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh).
