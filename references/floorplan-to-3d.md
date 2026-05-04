# Floor Plan To Hard-Renovation 3D

Use this when converting a floor plan image, sketch, or measured layout into `scene.json`.

## Scene Data Shape

```json
{
  "units": "m",
  "defaultHeight": 2.8,
  "defaultWallThickness": 0.18,
  "floorPlanOverlay": {
    "image": "/floorplans/source-plan.jpg",
    "center": [0, 0],
    "size": [15.16, 11.64],
    "opacity": 0.34,
    "cropPx": [38, 86, 760, 724]
  },
  "rooms": [
    {
      "id": "living",
      "name": "客餐厅",
      "type": "living",
      "boundary": [[-0.5, -5.0], [3.8, -5.0], [3.8, 4.2], [-0.5, 4.2]]
    }
  ],
  "wallGraph": {
    "nodes": [
      { "id": "n-1", "point": [3.8, -5.0], "source": "trace" },
      { "id": "n-2", "point": [3.8, 4.2], "source": "trace" }
    ],
    "walls": [
      {
        "id": "w-living-east",
        "name": "客餐厅东墙",
        "startNodeId": "n-1",
        "endNodeId": "n-2",
        "structuralStatus": "unknown",
        "demolishable": false
      }
    ]
  },
  "wallSegments": [
    {
      "id": "w-living-east",
      "name": "客餐厅东墙",
      "start": [3.8, -5.0],
      "end": [3.8, 4.2],
      "structuralStatus": "unknown",
      "demolishable": false
    }
  ],
  "wallOpenings": [
    {
      "id": "op-entry",
      "wallId": "w-living-east",
      "kind": "passage",
      "center": 4.1,
      "width": 1.2,
      "height": 2.2,
      "sillHeight": 0
    }
  ],
  "renovationPlan": {
    "demolishedWallIds": [],
    "structuralOverrides": {},
    "measurementBoxes": []
  }
}
```

## Calibration Rules

- Convert millimeter labels to meters by dividing by `1000`.
- Pick one outer horizontal dimension chain and one vertical dimension chain as the coordinate scale anchors.
- Crop floor-plan white margins using `floorPlanOverlay.cropPx` before aligning the image to the 3D wall model.
- Keep the image overlay as a reference only; actual dimensions come from structured wall and room data.
- Put every estimate in `scaleAssumptions`, including wall thickness, ceiling height, openings, and missing dimensions.

## Wall Modeling Rules

- Model walls as a shared-node `wallGraph`; every physical corner or T-junction should be one reused node.
- Keep `wallSegments` only for compatibility export from the graph.
- Use one shared wall line for a wall between two rooms.
- Set exterior walls, pipe shafts, and structural-looking boundary walls to `loadBearing` or `unknown`; never mark them non-load-bearing without user-supplied proof.
- Use `WallNode.point` in plan coordinates. The renderer computes wall length, angle, and panel geometry from node pairs.
- Split long walls at T-junctions. A partition ending at the middle of another wall must share a node with that wall.
- Do not remove source walls when simulating demolition. Store changes in `renovationPlan.demolishedWallIds`.

## Upload And Adjustment Rules

- For a new floor plan, ask the user to draw a calibration line on a known dimension and enter the real length in meters.
- Use the calibrated overlay for tracing; do not treat image pixels as final dimensions without user confirmation.
- Save user corrections in `localStorage` during editing and export corrected `scene.json` after tracing.
- If the generated model is wrong, fix the graph data first: move nodes, delete extra walls, add missing walls, then validate.

## Door And Window Openings

- Represent openings using `wallOpenings`, modeled after BIM/IFC concepts where an opening voids a wall and may be filled by a door or window.
- `door`: `sillHeight = 0`, typical height `2.05-2.15m`.
- `window`: typical `sillHeight = 0.8-0.95m`, height `1.0-1.2m`.
- `passage`: an open doorway or sliding-door opening, usually no door leaf.
- The renderer splits the wall into left/right side panels, optional window sill panel, and upper lintel panel. This avoids fragile boolean cutting while still creating real visible gaps.

## Quality Checks

- Floor-plan overlay and 3D wall lines should visually align in top-down mode.
- Each wall opening must reference a valid `wallId` and fit within that wall length.
- `scripts/validate_scene.py` should report zero duplicate walls, dangling nodes, overlapping walls, opening errors, and missing room references for bundled demos.
- Every wall must have a structural status. Use `unknown` when not verified.
- Unknown or load-bearing walls must remain locked until user-supplied structural data changes the status.
- Measurement boxes should report meters, square meters, and cubic meters.
