# Furniture Placement

Use this when the user supplies furniture images or placement photos.

## Furniture Item Shape

```json
{
  "id": "sofa-main",
  "name": "Sofa",
  "roomId": "living",
  "center": [0.8, -1.1],
  "size": [2.4, 0.95, 0.82],
  "rotation": 0,
  "color": "#87988f",
  "image": "/furniture/sofa.png",
  "placementAssumption": "Centered on the west wall from user photo"
}
```

## Placement Rules

- Ask for real dimensions when available. If missing, use a category default and mark it as assumed.
- Use placement photos to infer wall side, orientation, and clearance, not exact millimeter position.
- Keep walkways at least `0.75m` where possible.
- Prevent furniture from crossing room boundaries. If a requested placement conflicts with a wall, preserve the user intent and flag the conflict.
- Use image textures as visual labels or surface previews; do not claim they are physically accurate materials.

## Defaults

- Sofa: `2.2m x 0.9m x 0.8m`
- Dining table: `1.6m x 0.9m x 0.75m`
- Bed queen: `2.0m x 1.5m x 0.6m`
- Wardrobe: `1.8m x 0.6m x 2.2m`
- Coffee table: `1.1m x 0.6m x 0.42m`

## Image Handling

- Use a furniture image as a reference/cutout for visual preview.
- If using image generation, isolate tasks: one prompt for background removal, one for material cleanup, one for room composite.
- Preserve the furniture silhouette and proportions when compositing.
