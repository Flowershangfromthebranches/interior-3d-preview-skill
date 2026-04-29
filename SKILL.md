---
name: interior-3d-preview
description: Use when creating an AI-assisted hard-renovation preview from floor plans and measured room data. Guides Codex through extracting a wall/opening model, protecting unknown or load-bearing walls, and generating a navigable Three.js rough-room prototype with demolition simulation and measurement tools.
license: MIT
---

# Interior Hard-Renovation Preview

Create a navigable hard-renovation model from a floor plan. This skill focuses on rough-room engineering decisions: walls, doors, windows, openings, measurements, and demolition planning. It is not a structural safety report or construction drawing.

## Inputs

Ask for missing high-impact inputs when they affect safety or scale:
- Floor plan image or sketch, preferably with labeled dimensions.
- Ceiling height, wall thickness, and any known column/beam/pipe-shaft locations.
- Door and window widths, sill heights, and opening directions when available.
- Structural information from developer drawings, property management, designer notes, or engineer review.

## Workflow

1. **Scope and safety**
   - State that ordinary floor plans cannot reliably identify load-bearing walls.
   - Default every unknown wall to locked and non-demolishable until the user supplies structural status.
   - Do not infer demolition safety from wall appearance alone.

2. **Create structured engineering scene data**
   - Build `scene.json` around `rooms`, `wallSegments`, `wallOpenings`, and `renovationPlan`.
   - Use `references/floorplan-to-3d.md` for floor-plan calibration, wall segments, and door/window openings.
   - Use `references/hard-renovation-safety.md` for demolition constraints and wording.
   - Keep original walls immutable; store simulated changes in `renovationPlan`.

3. **Generate a preview project**
   - Run the bundled script:
     ```bash
     python scripts/create_project.py --out <target-dir>
     ```
   - The generated project includes the hard-renovation demo and a matching `public/scene.json`.
   - Replace or manually correct `public/scene.json` for a user-specific home.

4. **Validate**
   - Top-down mode shows the floor-plan overlay aligned with modeled walls.
   - Door, window, and passage openings render as real gaps in wall panels.
   - Clicking a wall shows dimensions, openings, and structural status.
   - Unknown/load-bearing walls cannot be simulated as demolished.
   - User-marked non-load-bearing walls can be simulated, undone, reset, and exported.
   - Measurement boxes report width, depth, height, area, and volume.

## Output Expectations

For each project, provide:
- `scene.json` with explicit assumptions and locked unknown structural status.
- A generated Three.js preview project.
- A list of walls/openings that need user or professional confirmation.
- A demolition plan JSON only when the user marks walls as verified non-load-bearing.

## References

- Floor plans and wall/opening geometry: `references/floorplan-to-3d.md`
- Renovation safety and load-bearing policy: `references/hard-renovation-safety.md`
- Optional image generation providers: `references/image-model-providers.md`
