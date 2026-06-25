UPLOAD THESE TWO FILES TO THE ROOT OF GITHUB:
1. index.html
2. animal_kingdom_app_map.png

Root cause fixed:
The Animal Kingdom buildMap() was creating the left control panel while the SVG was still detached from the page.
Because of that, document.getElementById('ak-chips') returned null, buildMap() threw an error, and renderRouteMapSafely() fell back to the pastel mini-map.

Fix applied:
- Changed panel lookups to panel.querySelector(...)
- Added guards so the detached panel cannot crash buildMap()
- Removed the Animal Kingdom fallback to the pastel mini-map
- Added this source marker: AK MAP VERSION 2026-06-24 FIX DETACHED PANEL

After deploying, view source and search for:
AK MAP VERSION 2026-06-24 FIX DETACHED PANEL