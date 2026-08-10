# RideHero multi-resort architecture and data notes

Last verified: 2026-08-10

## Scope

The catalog contains 3 brands, 8 destinations, and 15 parks. Walt Disney World continues to use its existing provider-backed attraction set. The expansion adds 112 curated ride records:

| Park | Curated ride records | Live provider ID verified | Routing quality |
| --- | ---: | --- | --- |
| Magic Kingdom | Provider-backed | Yes | Verified |
| EPCOT | Provider-backed | Yes | Verified |
| Hollywood Studios | Provider-backed | Yes | Verified |
| Animal Kingdom | Provider-backed | Yes | Verified |
| Disneyland Park | 14 | Yes | Approximate |
| Disney California Adventure | 12 | Yes | Approximate |
| Universal Studios Florida | 8 | Yes | Approximate |
| Islands of Adventure | 8 | Yes | Approximate |
| Epic Universe | 10 | Yes | Approximate |
| Volcano Bay | 8 | Yes | Approximate |
| Universal Studios Hollywood | 10 | Yes | Approximate |
| Universal Studios Japan | 12 | Yes | Approximate |
| Six Flags Great Adventure | 10 | Yes | Approximate |
| Six Flags Magic Mountain | 10 | Yes | Approximate |
| Six Flags Great America | 10 | Yes | Approximate |

“Provider-backed” means the existing Walt Disney World catalog remains dynamically supplied by the current wait integration instead of being duplicated in the new static files. A verified provider ID means the park is present in the documented ThemeParks.wiki public API; it does not guarantee that every ride publishes a wait at all times.

## Data sources

Official operator pages were used first for park structure and curated ride names:

- Disney World: <https://disneyworld.disney.go.com/attractions/>
- Disneyland Resort: <https://disneyland.disney.go.com/attractions/>
- Universal Orlando: <https://www.universalorlando.com/web/en/us/theme-parks>
- Universal Studios Hollywood ride FAQ: <https://www.universalstudioshollywood.com/web/en/us/faqs/rides-and-attractions>
- Universal Studios Japan areas and attractions: <https://www.usj.co.jp/web/en/us/areas>
- Six Flags Great Adventure: <https://www.sixflags.com/greatadventure>
- Six Flags Magic Mountain: <https://www.sixflags.com/magicmountain>
- Six Flags Great America: <https://www.sixflags.com/greatamerica>

Live status and wait normalization uses the documented ThemeParks.wiki API:

- API overview: <https://api.themeparks.wiki/>
- API documentation: <https://api.themeparks.wiki/docs/v1/>

Each park and curated ride record includes its source and verification date. Metadata that was not reliably verified remains `null` or `UNKNOWN`.

## Runtime boundaries

- `data/park-catalog.js` is the authoritative brand/destination/park registry.
- `data/parks/*.js` contains lazily loaded static lands and curated rides.
- `js/park-catalog.js` loads and validates datasets and map assets.
- `js/navigation.js` owns hierarchy navigation, deep links, recent context, and the compact park switcher.
- `js/wait-provider.js` normalizes external live data, short-term caching, aborts, and Walt Disney World proxy fallback.
- `js/location-service.js` shares cached geolocation, bounds checks, distance calculation, and manual/entrance/center fallback selection.
- `js/route-engine.js` supplies park-independent route input signatures and verified-route capability checks while the existing optimizer is generalized in place.
- `js/data-quality.js` normalizes confidence, provenance, aliases, locations, restrictions, and access programs.
- `js/walking-network.js` selects verified graph distance, provider GPS, land/zone proximity, or a neutral fallback and returns a trust weight with every estimate.
- `js/data-health.js` renders the on-demand `#/admin/data-health` audit dashboard.
- `js/storage-migration.js` migrates the old context into versioned, per-park state without clearing existing preferences.

Quick Mode accepts only normalized `classification === "ride"` records that are currently open. Unmatched provider attractions for expansion parks are classified as `other`, so they cannot enter Quick routes. Full Day retains the existing rides/attractions/both behavior.

## Confidence and route inputs

Records use `verified`, `provider`, `approximate`, or `unknown` confidence. A park center supplied by the live provider is not treated as a guest entrance. Each ride separately stores `attractionLocation`, `guestEntranceLocation`, `exitLocation`, and `routingNode`.

Distance selection is tiered:

1. Verified pedestrian graph between assigned routing nodes.
2. Provider or verified GPS coordinates, preferring the guest entrance.
3. Same-land or cross-land proximity.
4. Neutral distance only when no defensible spatial input exists.

Lower-confidence distance contributes less to route scoring, shifting the optimizer toward real wait information. The selected distance quality is visible on route results.

Access programs are normalized as `lightningLane`, `expressPass`, `fastLane`, `singleRider`, and `childSwap`. Height restrictions use numeric inches and centimeters plus `restrictionsVerified`; party filtering never applies an unverified restriction.

Universal Orlando Resort and Universal Studios Hollywood height requirements are stored as structured inches and centimeters only when the operator publishes a numeric minimum. Rides with supervising-companion rules but no numeric minimum remain unverified for filtering so the optimizer never invents a restriction.

Disneyland Resort records distinguish a verified numeric minimum from a verified `none` restriction. Both states come from the operator catalog; only numeric minimums participate in party-height filtering.

The selected Six Flags parks use operator-published minimums plus separate accompanied, unaccompanied, and maximum-height fields where applicable. A missing current operator detail remains explicitly unverified rather than inheriting a historical value.

Universal Studios Japan restrictions retain the operator's exact centimeter values, with derived inch values for party comparison. Accompanied, unaccompanied, maximum-height, and supervision-only rules are stored separately for all curated USJ rides.

Universal Studios Japan Express Pass availability is verified at the park level. Ride-level eligibility is marked only on attraction pages that explicitly say `Universal Express Pass Valid`; an unmarked ride does not inherit eligibility from the park product.

Disneyland Resort ride-level Lightning Lane eligibility follows the current official Single Pass and Multi Pass lists. Rides absent from those lists remain false and do not inherit eligibility merely because Lightning Lane exists at the park.

Verified walking graphs keep visual maps independent from pedestrian routing. The graph importer accepts sourced pedestrian paths and separately maps canonical ride IDs to guest-entrance routing nodes. Entrances beyond the strict snap threshold fail import instead of silently attaching to an unrelated path.

Park-level access-program availability is separate from ride-level eligibility. RideHero lists Lightning Lane, Express Pass, or Fast Lane preferences only where the operator verifies that park program. Unknown park availability stays unknown, and selecting a program never creates per-ride eligibility or synthetic wait savings.

The walking graph importer requires verified, sourced pedestrian GeoJSON. No graph is marked verified merely because a visual park map exists.

## Known limitations

- Verified walkway graphs and legally reusable detailed map imagery are available only for the four existing Walt Disney World parks in this repository.
- Expansion parks use straight-line proximity for ranking and intentionally show no walking route line.
- Entrance coordinates were not stored unless verified, so those parks fall back to a clearly labeled approximate park-center start after any manual start.
- A trusted-map audit did not return independently named entrance records for the requested parks. Entrances therefore remain explicitly unknown pending operator-verified or individually reviewable map records.
- Curated files are intentionally conservative rather than exhaustive. Live provider records can supplement the Full Day experience, while Quick Mode admits only verified ride matches.
- Live waits are best effort. Missing, malformed, partial, or unavailable responses never become zero-minute waits.
- A future data-maintenance pass should verify entrances, ride coordinates, accessibility metadata, and walking networks directly from licensed or operator-approved sources.
