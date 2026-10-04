# st-venice-image

A SillyTavern third-party extension that adds image generation via the [Venice AI](https://venice.ai/) image API.

## Why this exists

SillyTavern's built-in image generation "OpenAI" source hardcodes `api.openai.com`, so it can't be pointed at Venice. This extension calls Venice's native `/image/generate` endpoint directly from the browser (Venice's API allows CORS), with full parameter support: model choice, negative prompts, sizes, watermark and safe-mode toggles.

## Install

In SillyTavern: **Extensions (puzzle piece) → Install extension →** paste the repo URL:

```
https://github.com/AnonCollab/st-venice-image
```

Then open **Extensions → Venice Image Generation**, paste your Venice API key, and you're set.

## Use

Slash command in any chat:

```
/vimg anime portrait of a catgirl knight, detailed armor, sunset
```

With a per-image negative prompt:

```
/vimg negative="blurry, deformed" a cozy tavern interior, warm light
```

A **Test Generation** button in the settings panel generates a sample image.

## Message button

Every character message gets a small image button in its action bar. Click it to generate an image from that message's text with Venice — handy for illustrating Veyra's responses.

## Defaults

- Model: `wai-Illustrious` (Anime WAI — Venice's own anime model, recommended for anime)
- Size: 832x1216 portrait
- Safe mode: off (uncensored; Venice still blocks illegal content)
- Watermark: hidden
- Generated images are sent to the current chat as character messages
