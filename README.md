# Interior Hard-Renovation Preview Skill

`interior-3d-preview` is a Codex skill and Three.js template for rough-room hard-renovation previews. It turns a calibrated floor plan into a navigable 3D shell model with topology-checked walls, doors, windows, locked structural status, demolition simulation, wall measurement, area measurement, and manual model adjustment.

V4 deliberately focuses on hard-renovation decisions. Furniture can change any time; wall removal, openings, appliance niches, and built-in dimensions are the decisions that need clearer engineering preview.

## What It Does

- Builds a 3D rough-room model from floor-plan dimensions.
- Normalizes walls into a shared-node `wallGraph` so corners and T-junctions are checked instead of visually patched.
- Renders wall segments with real visible door, window, and passage openings.
- Locks unknown and load-bearing walls by default.
- Lets users mark a verified non-load-bearing wall and simulate demolition.
- Keeps the original model immutable; simulated changes live in `renovationPlan`.
- Supports wall-click measurement and top-down measurement boxes.
- Adds adjustment mode for dragging nodes, moving wall lines, editing openings, tracing missing walls, calibrating uploaded floor plans, and exporting corrected `scene.json`.
- Provides room jump buttons for first-person inspection.

## Safety Boundary

This project is not a structural safety tool and does not output construction drawings, beam calculations, or demolition approval. A normal floor plan image cannot reliably identify load-bearing walls.

Default policy:

- `loadBearing`: locked
- `unknown`: locked
- `nonLoadBearing`: can be simulated after user confirmation

If structural status is missing, ask the user for developer drawings, property-management notes, designer markup, or engineer confirmation.

## Repository Layout

```text
.
├── SKILL.md
├── agents/openai.yaml
├── assets/frontend-template/
│   ├── public/scene.json
│   ├── public/floorplans/apartment-hard-renovation.jpg
│   └── src/
├── examples/
│   ├── apartment-hard-renovation/
│   └── homeplanq/
├── references/
│   ├── floorplan-to-3d.md
│   ├── hard-renovation-safety.md
│   └── image-model-providers.md
└── scripts/
    ├── create_project.py
    └── validate_scene.py
```

## Install The Skill

```bash
git clone https://github.com/Flowershangfromthebranches/interior-3d-preview-skill.git
mkdir -p ~/.codex/skills
cp -R interior-3d-preview-skill ~/.codex/skills/interior-3d-preview
```

Validate the installed skill:

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py ~/.codex/skills/interior-3d-preview
```

## Generate The Demo Project

From the repository root:

```bash
python3 scripts/create_project.py --out /tmp/interior-hard-renovation-v4 --force
cd /tmp/interior-hard-renovation-v4
npm install
npm run dev
```

The generated project includes:

- `public/scene.json`
- `public/floorplans/apartment-hard-renovation.jpg`
- wall/opening model
- demolition plan state
- wall and area measurement tools
- topology diagnostics
- adjustment mode
- room navigation

## Build And Check

```bash
python3 scripts/validate_scene.py assets/frontend-template/public/scene.json
cd assets/frontend-template
npm run typecheck
npm run build
```

Use `npm run preview` after building when you want a production preview server.

## Demo

The default V4 demo uses `20180116095635_6875.jpg` as a public sample asset. The scene is manually traced from the visible labels and assumes:

- outer plan envelope: about `15.16m x 11.64m`
- default ceiling height: `2.8m`
- default wall thickness: `0.18m`
- door and window dimensions are approximate
- every unverified wall starts as locked
- the bundled topology has `0` duplicate walls, `0` dangling nodes, and `0` opening errors under `scripts/validate_scene.py`

Included spaces:

- 书房
- 次卧北
- 卫生间
- 主卧
- 步入式衣柜
- 次卧南
- 客餐厅
- 玄关 / 门厅
- 厨房
- 阳台北
- 阳台南
- 管道井

## Scene Schema Highlights

`SceneData` now focuses on hard-renovation data:

- `wallGraph`: shared `nodes` and `walls`; this is the preferred V4 model
- `wallSegments`: compatibility export generated from `wallGraph`
- `wallOpenings`: door/window/passage openings tied to wall IDs
- `renovationPlan`: simulated demolition, structural overrides, measurement boxes
- `floorPlanOverlay.cropPx`: crop source plan margins before aligning overlay
- `rooms`: navigation and floor zones, not duplicated wall generators

## Adjustment Workflow

1. Open top-down mode.
2. Use the upload button to import a floor plan image, or use the bundled demo.
3. Use calibration mode to click two points with a known real-world length and enter meters.
4. Turn on adjustment mode:
   - Drag blue nodes for corners and T-junctions.
   - Drag cyan wall handles to move a wall line.
   - Drag door/window handles along their wall.
   - Use the side panel for exact thickness, height, structure status, and opening dimensions.
   - Use trace-wall mode to add missing walls.
5. Export `scene.json` and run `scripts/validate_scene.py` before using the result as a demo or project input.

See `references/floorplan-to-3d.md` for schema examples and modeling rules.

## References Used

- [Three.js Shape](https://threejs.org/docs/pages/Shape.html): shape holes and 2D shape concepts.
- [Three.js ExtrudeGeometry](https://threejs.org/docs/pages/ExtrudeGeometry.html): extruding 2D shapes into 3D geometry.
- [buildingSMART IFC OpeningElement](https://standards.buildingsmart.org/IFC/RELEASE/IFC4_1/FINAL/HTML/schema/ifcproductextension/lexical/ifcopeningelement.htm): opening/void concept for building elements.
- [buildingSMART IFC RelFillsElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRelFillsElement.htm): door/window relationship to an opening.
- [Planning Portal load-bearing walls](https://www.planningportal.co.uk/permission/common-projects/internal-walls/building-regulations-load-bearing-walls/): structural engineer/surveyor guidance.

## Contributing

Keep `SKILL.md` concise and put operational detail in `references/` or this README.

Before committing:

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py .
python3 scripts/validate_scene.py assets/frontend-template/public/scene.json
python3 scripts/create_project.py --out /tmp/interior-hard-renovation-v4 --force
cd /tmp/interior-hard-renovation-v4
npm install
npm run typecheck
npm run build
```
