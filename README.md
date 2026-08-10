# RideHero

## Current baseline

This repository baseline is **RideHero v9.7 (2026-07-17)**, imported from:

`ridehero_V9_7_TRACK_ALIGNED_EARLY_PULL_FULL_REPLACE_2026-07-17.zip`

The v9.7 baseline includes the track-aligned coaster intro with an earlier page pull while preserving the existing RideHero experience:

- Single next-stop route queue
- Proximity-based stop clearing with manual fallback
- Draggable mode divider
- Compact automatic wait list without horizontal scrolling
- Destination and park selection flow
- Quick Route and Plan My Day mode behavior
- Image-backed maps and routing UI for all four Disney parks

## App files

- `index.html` contains the single-page application.
- `*_app_map.webp` files are the runtime park-map assets.
- PNG and JPG map files are retained as source-quality backups.

## Baseline validation

Run the required syntax check before proposing changes:

```bash
node --check index.html
```

Preserve this behavior unless a focused branch and pull request explicitly changes it.

## Multi-resort architecture

RideHero now keeps its brand, destination, and park registry in `data/park-catalog.js`. Park datasets live under `data/parks/` and are loaded only after a park is selected. The catalog-driven navigation uses reload-safe hash routes and follows this sequence:

`Brand → Destination / Resort → Park → Planning Mode → Route`

The normalized wait provider fetches only the active park, caches a successful response for two minutes, cancels stale requests during park switches, and preserves missing waits as unknown. Existing Walt Disney World proxy fallback behavior remains available. Static park information remains usable when live waits fail.

Existing Walt Disney World maps are loaded only when their route view opens. Parks without a verified map or walking network use approximate proximity mode and do not draw invented route lines.

Implementation details, verified data counts, sources, and limitations are documented in [Multi-resort architecture and data notes](docs/MULTI_RESORT_ARCHITECTURE.md).

## Approved ChatGPT auto-merge

The `Auto-merge approved ChatGPT PRs` workflow enables squash auto-merge only when every eligibility rule is satisfied:

- Only pull requests targeting `main` are eligible.
- Only pull requests authored by `J0bless` are eligible.
- Draft pull requests cannot merge.
- The pull request must have the `chatgpt-approved` label.
- GitHub waits for all required checks and branch protections.
- Approved pull requests use squash merge.
- Pull requests without the label must never merge automatically.
