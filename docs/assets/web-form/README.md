# Web-form design source

The approved screens for `docs/WEB_FORM_MICROSITE_PLAN.md`, as Claude Design artboards.

- `gen.mjs` — the single generator. `node gen.mjs` rewrites every `*.dc.html` and
  `canvas.json` in this directory. Edit the generator, not the outputs.
- `*.dc.html` — one artboard per screen. Claimant screens in a desktop and a `Phone*`
  version; the six `Agent*` screens are the agent-assisted path (plan §1.4).
- `canvas.json` — artboard positions and the annotations shown on the canvas.

The published, editable canvas is the "Travel Claim Form" artifact; this directory is the
source it was built from, kept here so the design cannot vanish with a temp folder.
