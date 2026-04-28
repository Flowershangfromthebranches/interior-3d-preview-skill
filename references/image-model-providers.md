# Image Model Providers

Use this when the project needs generated or edited raster visuals for soft-furnishing previews, furniture cutouts, or material textures.

## Provider Interface

```ts
type ImageProvider = {
  id: 'gpt-image-2' | 'nano-banana' | 'custom';
  mode: 'generate' | 'edit' | 'composite';
  apiKeyEnv?: string;
  endpointEnv?: string;
};
```

## Provider Policy

- Prefer Codex built-in `imagegen` for one-off image work when available.
- For generated project code, read API keys from env vars such as `OPENAI_API_KEY`, `NANO_BANANA_API_KEY`, or user-specified names.
- Never write secrets into `scene.json`, source files, screenshots, or GitHub.
- Keep provider adapters optional. If no provider is configured, output prompts and placeholders.

## Recommended Uses

- `gpt-image-2`: room style previews, furniture cleanup, material texture concepts, visual before/after mockups.
- `nano-banana`: optional third-party provider slot. Use only after the user provides endpoint and auth details.
- `custom`: any compatible image endpoint supplied by the user.

## Prompt Split

Use separate prompts for:
- Furniture cutout or cleanup.
- Material or texture generation.
- Whole-room soft-furnishing composite.

Avoid asking one image request to infer floor plan geometry and produce final decor at the same time.
