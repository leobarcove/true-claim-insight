# User-flow site

A static page rendering the eleven diagrams in `docs/USER_FLOWS.md`. No build
step, no framework — one HTML file, the logo, and a Vercel config.

```
index.html    the page, with the diagrams inline as Mermaid source
logo.png      copied from apps/claimant-web/public/logo.png
vercel.json   headers + noindex
```

## Deploying to Vercel

Point a project at this directory rather than the repository root:

- **Root Directory:** `docs/sites/user-flow`
- **Framework Preset:** Other
- **Build Command:** none
- **Output Directory:** leave empty

Or from the CLI:

```bash
cd docs/sites/user-flow
vercel            # preview
vercel --prod     # production
```

## Things worth knowing before editing

**The diagrams are duplicated, not imported.** `docs/USER_FLOWS.md` is the
source of truth; the Mermaid source is copied into `index.html` because a
static page cannot read the markdown at runtime. Change one, change the other.

**Labels use backtick markdown strings, not `<br/>`.** Mermaid 11 parses a
double-quoted label as a markdown string and strips raw HTML, so `<br/>` is
silently dropped and the words run together. A backtick string honours real
newlines:

```
C1["`Claimant
PWA`"]
```

Bold is `**text**` for the same reason.

**Category is a coloured ring, never a fill.** `style X stroke:#17966A` leaves
the node interior to whatever the active Mermaid theme provides, so the same
diagram source reads correctly in both light and dark. Filling a node with a
fixed light colour breaks the moment the viewer switches theme — the text
follows the theme, the fill does not.

**The page owns Mermaid's theme.** `mermaid.initialize()` is called with a full
palette for each theme and every diagram is re-rendered when the theme changes,
because `mermaid.run()` replaces the element's contents and the original source
has to be kept to redraw. This is the reason the page can guarantee legibility
that an embedded viewer cannot.

**Mermaid loads from jsDelivr**, pinned to major version 11, and the CSP in
`vercel.json` allows exactly that origin. The page needs the network to draw
its diagrams — if it has to work offline, vendor `mermaid.esm.min.mjs` into this
folder and change the import to a relative path.

**The page is marked `noindex`** in both a meta tag and an `X-Robots-Tag`
header. It describes an unreleased system and names a prospective client.
