RideHero debug patch build

Base cleanup:
- Removed the hidden Animal Kingdom proximity-pin/search overlay and its event handlers.
- Removed hidden static pin groups that were not needed for the optimized route view.
- Switched the Animal Kingdom background image to WebP for faster load.
- Kept PNG as backup in the package.

Patch in this build:
- Fixed Select all / Deselect all targeting so the footer button no longer changes the Rides / Attractions / Both filter labels.
- Added a dedicated toggle-all-btn id and updateToggleAllButton() state sync.
- Preserved the source chip when switching filters.

Important upload files:
- index.html
- animal_kingdom_app_map.webp
- animal_kingdom_app_map.png

Verify source markers:
RideHero cleaned runtime build 2026-06-25
RideHero debug patch 2026-06-25: preserve source chip + fixed Select/Deselect All targeting


RideHero 4-park Disney build 2026-07-16
- Adds image-backed route maps for Magic Kingdom, EPCOT, and Hollywood Studios.
- Use index.html plus all *_app_map.webp assets in the repo root.
- PNG backups are included for editing/reference.
