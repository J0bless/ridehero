# RideHero Agent Instructions

These instructions apply to AI coding agents working in this repository, including Codex.

## Product mission

RideHero helps theme park guests turn waiting time into experience time. The app should help users make fast, practical decisions about what to ride next, whether a wait is worth it, and how to move through the park with less wasted time.

## Operating model

The user is the CEO and final approver for product direction. AI agents may implement, test, and propose changes, but major UX, business, routing, data, or user-impact decisions require explicit approval.

Use this hierarchy:

1. CEO direction from the user.
2. Current product/UX decisions documented in this repository.
3. Existing app behavior and established visual style.
4. Agent judgment for low-risk implementation details.

## Default workflow

For non-trivial changes:

1. Create a feature branch from `main`.
2. Make the smallest coherent change that satisfies the task.
3. Run validation before committing.
4. Open a pull request into `main`.
5. Include screenshots or notes for visual/UX changes when possible.
6. Do not merge unless the CEO explicitly approves.

Preferred branch names:

- `stage/current-baseline`
- `stage/intro-mode-choice`
- `stage/destinations-flow`
- `stage/plan-my-day`
- `stage/route-engine`
- `stage/live-waits`
- `fix/<short-description>`
- `feature/<short-description>`

## Current app architecture

RideHero is currently a single-page web app centered around `index.html` with supporting map/image assets.

Key user flows:

- App opens into coaster intro.
- Intro reveals mode choice.
- User chooses Quick Route or Plan My Day.
- Both modes lead to Destinations.
- User chooses destination, then park.
- Quick mode goes directly to an optimized route.
- Plan mode opens Plan My Day.
- Plan My Day contains plan tools, suggested morning sweep, and automatic compact wait list.
- Route uses a rolling next-stop queue rather than a fixed after-these list.

## Current UX decisions

Preserve these unless explicitly instructed otherwise:

- Quick Route should be fast and low-friction.
- Plan My Day can be more strategic, but should not feel like a separate app.
- Mode switching from Plan to Quick should immediately open the optimized route for the selected park.
- The mode spinner should remain a lightweight switch, not a disruptive modal.
- Wait times should populate automatically; users should not be asked to manually check waits.
- Wait lists should avoid horizontal scrolling.
- Route should show only the next stop in the sequence.
- Stops can clear by proximity, roughly 100 feet, with a manual fallback.
- Major route intelligence changes require CEO approval.

## Testing and validation

Before proposing a PR, run at least:

```bash
node --check index.html
```

If the app is split into JavaScript files later, run syntax checks against all changed JS files.

For visual changes, verify manually in a browser preview when possible.

## Coding style

- Prefer small, isolated changes.
- Preserve existing behavior unless the task asks to change it.
- Do not introduce frameworks without approval.
- Avoid broad rewrites unless specifically requested.
- Keep the app mobile-first.
- Avoid horizontal scrolling unless explicitly required.
- Keep copy short, clear, and theme-park-user friendly.

## Safety rules

- Do not add real payment, tracking, account, or location storage flows without approval.
- Do not persist user GPS history.
- Do not claim exact indoor GPS accuracy.
- Treat live wait data as best-effort and show graceful fallback states.
- Do not use copyrighted stock/reference media frame-for-frame.

## Deployment notes

`main` should represent the stable production baseline. Work branches should feed into `main` through reviewable pull requests whenever possible.
