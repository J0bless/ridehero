RideHero v8.5 - Rebuilt Loop Animation From Zero

This build resets the opening coaster loop animation instead of stacking more patches:
- Rebuilt the loop track as one continuous SVG route.
- The visible track and the moving train now use the exact same path geometry.
- Cars are moved individually along the path with spacing offsets, so they bend around the loop like a real coaster train.
- Old rigid-train CSS animation is disabled.
- Intro restarts from frame zero on each page load for cleaner testing.
- Visible pull/peel/rope artifacts remain hidden.
- Preserves v8.4 bottom-nav cleanup, v8.3 context hiding, v8.2 destination flow, mode spinner behavior, Disney maps, routing, and UI work.

Note:
The Vecteezy stock video was used only as a motion/style reference. This build does not copy the stock asset frame-for-frame.

Deployment marker:
RideHero v8.5 2026-07-17
