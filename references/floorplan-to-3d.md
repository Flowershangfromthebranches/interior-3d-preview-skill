# Floor Plan To 3D

Use this when converting a floor plan image, sketch, or measured layout into `scene.json`.

## Scene Data Shape

```json
{
  "units": "m",
  "scaleAssumptions": ["Door width assumed 0.82m"],
  "rooms": [
    {
      "id": "living",
      "name": "Living Room",
      "center": [0, 0],
      "size": [5.8, 4.2],
      "height": 2.8,
      "floorMaterial": "#d7c2a2",
      "wallMaterial": "#f3efe7"
    }
  ],
  "openings": [
    { "wall": "living-north", "type": "door", "offset": 1.2, "width": 0.9 }
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

## Quality Checks

- Room rectangles must not overlap unless intentionally open-plan.
- Camera start must be inside the largest room and at human eye height, about `1.55m`.
- Every room needs `center`, `size`, and `height`.
- Mark uncertainty in `scaleAssumptions`; do not hide guessed dimensions.
