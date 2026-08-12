# RideHero live maps and Friends

## Live park maps

RideHero's route screen uses the vanilla `RideHeroParkMap` adapter for all parks in the catalog. The adapter requests only tiles in the currently visible viewport (plus a one-tile edge buffer), never prefetches another park or zoom stack, and always keeps attribution visible.

The default development provider is OpenStreetMap Standard. It is a best-effort community service, not a production SLA. Before sustained production growth, set `window.RIDEHERO_MAP_PROVIDER` before `js/park-map.js` loads and use an authorized commercial or self-hosted OpenStreetMap-derived provider with the required attribution and licensing:

```js
window.RIDEHERO_MAP_PROVIDER = {
  id: 'authorized-provider',
  urlTemplate: 'https://maps.example/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap contributors · Map provider',
  attributionUrl: 'https://www.openstreetmap.org/copyright',
  license: 'ODbL',
  minZoom: 13,
  maxZoom: 18,
  tileSize: 256
};
```

High-detail map imagery and route intelligence are separate. RideHero plots a ride only when it has a verified guest entrance or provider coordinate. It draws a walking line only when the line is backed by a sourced, verified geographic walking graph. Missing data is shown as unavailable; it is never guessed.

Live GPS remains in memory and begins only after an existing Quick Route location choice or an explicit map action. The map-owned watcher stops when the route map closes; Quick Route's existing proximity-clearing watcher continues only for its active route lifecycle. GPS is not written to RideHero storage or route-share payloads.

## Friends and route sharing

Friends v1 is deliberately device-only. It saves sanitized display names in local browser storage as planning shortcuts, then opens the existing RideHero Share Route flow. Friend names are not added to share links, analytics, route snapshots, or network requests.

This version does not provide accounts, contact access, invitations, delivery receipts, presence, or real-time route synchronization. Those capabilities require authenticated backend infrastructure and a separate privacy/security review.
