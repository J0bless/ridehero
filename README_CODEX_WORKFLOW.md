# RideHero Codex Workflow

This repository uses Codex as the developer agent and ChatGPT/product direction as the planning layer.

## Recommended workflow

1. Product direction is decided in ChatGPT with the CEO.
2. Codex receives a focused implementation task.
3. Codex creates a branch.
4. Codex implements the smallest coherent change.
5. Codex runs checks.
6. Codex opens a pull request.
7. CEO reviews and approves before merge.

## Branch structure

Keep `main` stable.

Suggested long-running stage branches:

- `stage/current-baseline`
- `stage/intro-mode-choice`
- `stage/destinations-flow`
- `stage/plan-my-day`
- `stage/route-engine`
- `stage/live-waits`

Suggested short-lived branches:

- `fix/<short-description>`
- `feature/<short-description>`
- `ux/<short-description>`
- `refactor/<short-description>`

## Pull request rules

Every PR should include:

- What changed
- Why it changed
- How it was tested
- Screenshots or screen notes for UX changes
- Known limitations

Do not merge major UX, routing, monetization, data, location, or deployment changes without explicit CEO approval.

## Current baseline

The latest local build before repo setup was:

`RideHero v9.7 2026-07-17`

Key included features:

- Track-aligned coaster intro animation
- Earlier page pull
- Draggable mode divider
- Quick Route / Plan My Day mode choice
- Destination and park selection flow
- Automatic Plan page wait list
- No horizontal wait-list scrolling
- Plan to Quick switch opens optimized route
- Rolling route queue
- Single next stop shown
- Approximate 100 ft proximity clear with manual fallback

## Standard task prompt for Codex

Use this template:

```text
Repo: J0bless/ridehero

Task:
<clear implementation request>

Constraints:
- Preserve existing RideHero UX decisions from AGENTS.md.
- Keep changes small and focused.
- Do not redesign unrelated screens.
- Run `node --check index.html` before opening a PR.
- Open a PR into main when complete.
- Include a concise summary and test notes.
```
