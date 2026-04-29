# Interior 3D Preview Skill

`interior-3d-preview` is a Codex skill for turning floor plans, room photos, and furniture images into an early navigable 3D interior design preview.

The repository includes the installable skill, references for building `scene.json`, and a Vite + React + Three.js template with a bundled `homeplanq.png` demo.

## Use Cases

- Preview hard decoration layout from a floor plan.
- Review soft-furnishing ideas with furniture placeholders or generated texture assets.
- Walk through a room model with a first-person camera.
- Inspect and correct room geometry in a top-down editor-style view.
- Prepare prompts and provider configuration for image models such as `gpt-image-2` or `nano-banana`.

## Current Boundaries

- This is a visualization prototype, not construction documentation.
- V2 uses manually curated `scene.json` data for the sample floor plan.
- Rooms are represented as rectangular closed volumes; irregular rooms should be split into rectangles.
- Furniture is represented by simple boxes, colors, labels, and optional image textures.
- Image generation is optional. The core template works without API keys.

## Repository Layout

```text
.
├── SKILL.md
├── agents/openai.yaml
├── assets/frontend-template/
│   ├── public/scene.json
│   ├── public/floorplans/homeplanq.png
│   └── src/
├── examples/homeplanq/
│   ├── homeplanq.png
│   └── scene.json
├── references/
│   ├── floorplan-to-3d.md
│   ├── furniture-placement.md
│   └── image-model-providers.md
└── scripts/create_project.py
```

## Install The Skill

Clone the repository and copy it into your Codex skills directory:

```bash
git clone https://github.com/Flowershangfromthebranches/interior-3d-preview-skill.git
mkdir -p ~/.codex/skills
cp -R interior-3d-preview-skill ~/.codex/skills/interior-3d-preview
```

Validate the installed skill:

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py ~/.codex/skills/interior-3d-preview
```

If your Codex system skills are installed somewhere else, run `quick_validate.py` from that installation path.

## Generate The Demo Project

From the repository root:

```bash
python3 scripts/create_project.py --out /tmp/interior-preview-homeplanq --force
cd /tmp/interior-preview-homeplanq
npm install
npm run dev
```

The generated project includes:

- `public/scene.json`
- `public/floorplans/homeplanq.png`
- first-person camera controls
- top-down orbit controls
- a floor-plan overlay visible only in top-down mode

## Build And Check

```bash
npm run typecheck
npm run build
```

Use `npm run preview` after building when you want a production preview server.

## Homeplanq Demo

The V2 demo uses `examples/homeplanq/homeplanq.png` as a public sample asset. The matching `scene.json` approximates the labeled plan as about `16.15m x 8.0m`.

Included spaces:

- Living / Dining
- Kitchen
- Master Bedroom
- Bedroom 2
- Bedroom 3
- Bathroom West
- Bathroom East
- North, living, and south balconies

Included placeholder furniture:

- dining table
- sofa
- coffee table
- kitchen counter
- three beds
- bathroom fixtures

The sample is intentionally not construction-grade. It is meant to show the workflow and provide a starting point for manual correction.

## Scene Schema Highlights

`SceneData` supports:

- `floorPlanOverlay`: a reference floor-plan image shown in top-down mode
- `Room.type`: `living`, `kitchen`, `bedroom`, `bath`, `balcony`, `utility`, or `other`
- `Room.wallMode`: `full`, `low`, or `none`
- `Room.opacity`: room-level transparency for balconies and reference spaces
- `imageProviders`: optional image model provider configuration

See `references/floorplan-to-3d.md` for geometry rules.

## Image Model Providers

Provider entries are stored in `scene.json`:

```ts
type ImageProvider = {
  id: 'gpt-image-2' | 'nano-banana' | 'custom';
  mode: 'generate' | 'edit' | 'composite';
  apiKeyEnv?: string;
  endpointEnv?: string;
};
```

Recommended environment variables:

```bash
export OPENAI_API_KEY="..."
export NANO_BANANA_API_KEY="..."
export NANO_BANANA_ENDPOINT="..."
```

Do not commit API keys. If no provider is configured, the skill should still produce prompts, `scene.json`, and the Three.js preview.

## Skill Workflow

When invoked by Codex, the skill should:

1. Identify the floor-plan scale and uncertain dimensions.
2. Produce or refine `scene.json`.
3. Generate a preview project with `scripts/create_project.py`.
4. Run typecheck/build.
5. Report assumptions and placements that need user confirmation.

## Contributing

Keep `SKILL.md` concise and put operational details in `references/` or this README. Validate skill changes before opening a pull request:

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py .
python3 scripts/create_project.py --out /tmp/interior-preview-homeplanq --force
```

Then run the generated template checks:

```bash
cd /tmp/interior-preview-homeplanq
npm install
npm run typecheck
npm run build
```
