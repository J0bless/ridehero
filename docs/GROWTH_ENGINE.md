# RideHero Growth Engine v1

RideHero sharing is local-first and does not add a third-party analytics or route-storage service.

## Share architecture

- `js/route-session.js` records an allowlisted active route and truthful completion events in local storage. It never stores GPS coordinates.
- `js/growth-loader.js` keeps the full sharing engine out of the normal planning path.
- `js/share-model.js` validates schema-versioned snapshots and creates cryptographically random share IDs.
- `js/share-actions.js` coordinates native file/link sharing and resilient copy fallbacks.
- `js/growth-engine.js` renders shared-route previews, imports independent local copies, builds Day Summaries, and generates share-card images only on request.
- `js/growth-analytics.js` emits privacy-filtered local events. No network analytics destination is configured.

## Share URL

Version 1 links use this form:

```text
/r/<random-uuid>?r=share#share=<validated-base64url-snapshot>
```

The fragment contains only park ID, planning mode, ride order, route style, timestamps, permissions, and optional sanitized display text. It excludes account data, provider secrets, and location history. Keeping the payload in the fragment also prevents it from being sent in the HTTP request or referrer.

Share payloads are not retained in a separate local share cache. The active local route is resumable for up to 18 hours so a same-day refresh can recover progress without accidentally merging different park days.

Cloudflare Pages rewrites `/r/*` to the application shell. Shared routes are served with `X-Robots-Tag: noindex, follow`; the client also applies matching robots metadata.

## Truthful summaries

Day Summary metrics come only from recorded session events:

- completed route stops
- manually confirmed completed rides
- finite posted waits captured at completion
- route duration
- re-optimization count
- walking distance only when every completed leg has a finite meter estimate

Provider-GPS walking totals are labeled estimated. RideHero intentionally excludes time saved, money saved, wait avoided, and pixel/minute-derived mileage.

## Group routes

Joining imports the saved order as a new local route. It does not mutate the source share and does not synchronize participant progress or location. The v1 capability interface reserves future group voting, coordinated re-optimization, and live progress without claiming those features today.

If the recipient already has an active route, RideHero requires an explicit replacement confirmation. Leaving or joining a shared route clears the personal share payload from the address bar before continuing.

## Static-hosting limitation

The route works cross-device because the validated snapshot is self-contained. Static hosting cannot render park-specific Open Graph HTML before a social crawler requests the page, so v1 uses a strong generic RideHero preview plus client-updated route metadata. Opaque short links and truly route-specific social previews require a future Cloudflare Function with durable storage.
