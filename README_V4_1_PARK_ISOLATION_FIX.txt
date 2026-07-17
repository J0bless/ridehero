RideHero v4.1 - Park Isolation Fix Full Replacement

This build keeps v4 solid colors and v3 routing cleanup, then fixes likely park blending issues.

Fixes:
- Prevents late wait-time requests from one park from filling another park's screen.
- Clears ride/route/cache state when changing parks.
- Keeps active ride data tied to the selected park.
- Replaces older coordinate fallback behavior that could overwrite newer park-specific anchors.
- Places unknown rides within their own inferred park land instead of generic blended zones.
- Adds a small map data marker so each rendered route map is tied to the selected park.

Upload:
1. Unzip this package.
2. Upload all files inside to your GitHub repo root.
3. Replace existing files.
4. Commit.
5. Hard refresh GitHub Pages.

Deployment marker:
RideHero v4.1 2026-07-16
