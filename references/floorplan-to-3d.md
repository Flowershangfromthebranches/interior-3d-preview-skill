# Floor Plan To 3D

Use this when converting a floor plan image, sketch, or measured layout into `scene.json`.

## Scene Data Shape

```json
{
  "units": "m",
  "scaleAssumptions": ["Door width assumed 0.82m"],
  "floorPlanOverlay": {
    "image": "/floorplans/source-plan.png",
    "center": [0, 0],
    "size": [8.2, 6.1],
    "opacity": 0.35
  },
  "rooms": [
    {
      "id": "living",
      "name": "Living Room",
      "type": "living",
      "center": [0, 0],
      "size": [5.8, 4.2],
      "height": 2.8,
      "floorMaterial": "#d7c2a2",
      "wallMaterial": "#f3efe7"
    }
  ],
  "openings": [
    { "roomId": "living", "wall": "north", "type": "door", "offset": 1.2, "width": 0.9 }
  ],
  "furniture": []
}
```

## Extraction Rules

- Prefer rectangular rooms for v1. If a room is irregular, split it into adjacent rectangles and label the join as open.
- Use a known dimension if supplied. If none exists, assume a standard interior door is 0.8-0.9m wide and mark the scale as uncertain.
- Model walls as thin boxes around each room. Use `0.14m` wall thickness by default.
- Keep rooms closed unless the plan clearly shows a missing wall, archway, or open-plan join.
- Door and window openings can be represented by translucent markers in v1; do not cut boolean holes unless the project specifically needs it.
- Use `type` to distinguish `living`, `kitchen`, `bedroom`, `bath`, `balcony`, `utility`, and `other`.
- Use `wallMode: "low"` for balconies, terraces, half walls, or railings. Use `opacity` for semi-transparent reference spaces.
- Use `floorPlanOverlay` only as a visual reference in top-down mode; the 3D model is still driven by the structured rooms and furniture.

## Dimensioned Floor Plan Rules

- Convert labeled millimeter dimensions to meters by dividing by `1000`.
- Prefer outer dimension chains for the overall model envelope, then place individual rooms inside that envelope.
- When only partial dimensions are visible, keep the measured axis exact and estimate the other axis from the plan aspect ratio or known room conventions.
- Put every inference in `scaleAssumptions`, including room splits, balcony depth, wall thickness, and non-visible furniture dimensions.
- Align the `floorPlanOverlay.size` to the same meter envelope as the modeled rooms. If the image contains large white margins, increase the overlay size only enough to match visible labels and note that choice.
- The bundled `homeplanq.png` demo treats the visible plan as approximately `16.15m x 8.0m`; balcony depth and furniture locations are visual approximations, not construction-grade measurements.

## Quality Checks

- Room rectangles must not overlap unless intentionally open-plan.
- Camera start must be inside the largest room and at human eye height, about `1.55m`.
- Every room needs `center`, `size`, and `height`.
- Mark uncertainty in `scaleAssumptions`; do not hide guessed dimensions.
