# Interior Hard-Renovation Preview Skill

`interior-3d-preview` is a Codex skill and Three.js template for rough-room hard-renovation previews. It turns a measured floor plan into a navigable 3D shell model with walls, doors, windows, locked structural status, demolition simulation, and area measurement.

V3 deliberately removes the soft-furnishing focus. Furniture can change any time; wall removal, openings, appliance niches, and built-in dimensions are the decisions that need clearer engineering preview.

## What It Does

- Builds a 3D rough-room model from floor-plan dimensions.
- Renders wall segments with real visible door, window, and passage openings.
- Locks unknown and load-bearing walls by default.
- Lets users mark a verified non-load-bearing wall and simulate demolition.
- Keeps the original model immutable; simulated changes live in `renovationPlan`.
- Supports top-down measurement boxes for length, width, height, area, and volume.
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
└── scripts/create_project.py
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
python3 scripts/create_project.py --out /tmp/interior-hard-renovation-v3 --force
cd /tmp/interior-hard-renovation-v3
npm install
npm run dev
```

The generated project includes:

- `public/scene.json`
- `public/floorplans/apartment-hard-renovation.jpg`
- wall/opening model
- demolition plan state
- measurement tool
- room navigation

## Build And Check

```bash
npm run typecheck
npm run build
```

Use `npm run preview` after building when you want a production preview server.

## Demo

The default V3 demo uses `20180116095635_6875.jpg` as a public sample asset. The scene is manually traced from the visible labels and assumes:

- outer plan envelope: about `15.16m x 11.64m`
- default ceiling height: `2.8m`
- default wall thickness: `0.18m`
- door and window dimensions are approximate
- every unverified wall starts as locked

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

- `wallSegments`: explicit wall line segments with height, thickness, and structural status
- `wallOpenings`: door/window/passage openings tied to wall IDs
- `renovationPlan`: simulated demolition, structural overrides, measurement boxes
- `floorPlanOverlay.cropPx`: crop source plan margins before aligning overlay
- `rooms`: navigation and floor zones, not duplicated wall generators

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
python3 scripts/create_project.py --out /tmp/interior-hard-renovation-v3 --force
cd /tmp/interior-hard-renovation-v3
npm install
npm run typecheck
npm run build
```
