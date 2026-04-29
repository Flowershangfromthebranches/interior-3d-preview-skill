---
name: interior-3d-preview
description: Use when creating an AI-assisted interior design preview from floor plans, room photos, and furniture images. Guides Codex through extracting a structured room model, optionally using image-generation providers such as gpt-image-2 or nano-banana for soft-furnishing visuals, and generating a navigable Three.js prototype with first-person and top-down views.
license: MIT
---

# Interior 3D Preview

Create a navigable interior design preview from user-provided floor plans, room photos, and furniture images. This skill is for early design visualization, not construction-grade drawings.

## Inputs

Ask for missing high-impact inputs only when needed:
- Floor plan image or sketch, preferably with at least one known dimension.
- Room photos for material, lighting, and soft-furnishing context.
- Furniture images plus rough dimensions or a reference object for scale.
- Desired style, budget level, fixed items, and must-avoid changes.

## Workflow

1. **Scope and constraints**
   - State that the result is a visual planning model, not a building permit or engineering artifact.
   - Identify known scale anchors, uncertain room boundaries, and furniture dimensions.

2. **Create structured scene data**
   - Build or request a `scene.json` with rooms, walls, openings, furniture, materials, and image provider config.
   - For dimensioned floor plans, convert labeled millimeter values to meters and keep the calculation in `scaleAssumptions`.
   - When exact extraction is uncertain, create a plausible first pass and mark it for manual correction in `scene.json`.
   - Use `references/floorplan-to-3d.md` for room extraction and closed-room modeling.
   - Use `references/furniture-placement.md` for furniture image handling and placement.

3. **Use image models only where they add value**
   - Prefer built-in `imagegen` for one-off visual edits when available.
   - For project API integration, follow `references/image-model-providers.md`.
   - Use separate prompts for furniture cutouts, room style previews, and material textures.
   - Never store API keys in generated source; use env vars or project config.

4. **Generate a preview project**
   - Run the bundled script:
     ```bash
     python scripts/create_project.py --out <target-dir>
     ```
   - The generated project includes the `homeplanq.png` sample floor-plan demo and a matching `public/scene.json`.
   - Replace or manually correct the generated `public/scene.json` for a user-specific project.
   - Build and inspect the preview:
     ```bash
     npm install
     npm run build
     npm run dev
     ```

5. **Validate**
   - First-person camera can move through the model.
   - Top-down view shows room layout, furniture placement, and floor-plan overlay when configured.
   - Walls form closed rectangular spaces unless the floor plan explicitly shows open boundaries.
   - Furniture is scaled plausibly and does not intersect fixed walls.
   - Image-model outputs are labeled as generated previews, not factual measurements.

## Output Expectations

For each project, provide:
- `scene.json` with explicit assumptions.
- A generated Three.js preview project.
- A short list of uncertain geometry or furniture placements that need user confirmation.
- Optional image-generation prompts or provider config for gpt-image-2, nano-banana, or custom providers.

## References

- Floor plans and room geometry: `references/floorplan-to-3d.md`
- Furniture placement: `references/furniture-placement.md`
- Image generation providers: `references/image-model-providers.md`
