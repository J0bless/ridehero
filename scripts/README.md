# Park data maintenance

RideHero does not scrape private or undocumented APIs. Data audits use a human-reviewed JSON snapshot taken from an official operator listing.

## Ride listing audit

```bash
node scripts/audit-park-data.cjs current-rides.json official-operator-snapshot.json
```

The report flags new rides, likely renames, permanently closed rides, and records missing from the official snapshot. Each accepted change must retain `sourceUrl`, `sourceName`, and `lastVerified`.

## Walking graph import

```bash
node scripts/build-walking-graph.cjs verified-paths.geojson metadata.json
```

Only GeoJSON `LineString` features with `properties.pedestrian: true` are imported. Metadata must identify a verified source. The script refuses approximate or unsourced input, preventing guessed paths from entering a verified graph.
