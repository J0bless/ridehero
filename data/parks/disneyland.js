(function(api) {
  'use strict';
  var verified = '2026-08-10';
  var source = 'https://disneyland.disney.go.com/attractions/';
  var restrictionSource = 'https://disneyland.disney.go.com/faq/parks/height-requirements/';
  api.register({ parks: {
    dl: make('dl', ['Main Street, U.S.A.','Adventureland','New Orleans Square','Critter Country','Star Wars: Galaxy’s Edge','Frontierland','Fantasyland','Mickey’s Toontown','Tomorrowland'], [
      ['its-a-small-world','"it’s a small world"','Fantasyland',null],['mickey-minnies-runaway-railway','Mickey & Minnie’s Runaway Railway','Mickey’s Toontown',null],['space-mountain','Space Mountain','Tomorrowland',40],['big-thunder-mountain-railroad','Big Thunder Mountain Railroad','Frontierland',40],['matterhorn-bobsleds','Matterhorn Bobsleds','Fantasyland',42],['indiana-jones-adventure','Indiana Jones Adventure','Adventureland',46],['rise-of-the-resistance','Star Wars: Rise of the Resistance','Star Wars: Galaxy’s Edge',40],['millennium-falcon-smugglers-run','Millennium Falcon: Smugglers Run','Star Wars: Galaxy’s Edge',38],['tianas-bayou-adventure','Tiana’s Bayou Adventure','Critter Country',40],['pirates-of-the-caribbean','Pirates of the Caribbean','New Orleans Square',null],['haunted-mansion','Haunted Mansion','New Orleans Square',null],['peter-pans-flight','Peter Pan’s Flight','Fantasyland',null],['alice-in-wonderland','Alice in Wonderland','Fantasyland',null],['buzz-lightyear-astro-blasters','Buzz Lightyear Astro Blasters','Tomorrowland',null]
    ]),
    dca: make('dca', ['Buena Vista Street','Hollywood Land','Avengers Campus','Cars Land','San Fransokyo Square','Grizzly Peak','Pixar Pier','Paradise Gardens Park'], [
      ['radiator-springs-racers','Radiator Springs Racers','Cars Land',40],['incredicoaster','Incredicoaster','Pixar Pier',48],['guardians-mission-breakout','Guardians of the Galaxy – Mission: BREAKOUT!','Avengers Campus',40],['web-slingers','WEB SLINGERS: A Spider-Man Adventure','Avengers Campus',null],['soarin-across-america','Soarin’ Across America','Grizzly Peak',40],['toy-story-midway-mania','Toy Story Midway Mania!','Pixar Pier',null],['goofys-sky-school','Goofy’s Sky School','Paradise Gardens Park',42],['grizzly-river-run','Grizzly River Run','Grizzly Peak',42],['monsters-inc','Monsters, Inc. Mike & Sulley to the Rescue!','Hollywood Land',null],['little-mermaid','The Little Mermaid – Ariel’s Undersea Adventure','Paradise Gardens Park',null],['luigis-rollickin-roadsters','Luigi’s Rollickin’ Roadsters','Cars Land',32],['maters-junkyard-jamboree','Mater’s Junkyard Jamboree','Cars Land',32]
    ])
  }});
  function make(parkId, landNames, rideRows) {
    var lands = landNames.map(function(name){ return { id: parkId + '-' + api.normalize(name), parkId: parkId, name: name, slug: api.normalize(name) }; });
    var byName = {}; lands.forEach(function(land){ byName[land.name] = land.id; });
    return { source: source, lastVerified: verified, lands: lands, rides: rideRows.map(function(row){ return ride(parkId, row[0], row[1], byName[row[2]], row[3]); }) };
  }
  function ride(parkId, id, name, landId, height) { var hasMinimum=Number.isFinite(height); return { id: parkId + '-' + id, providerId: null, parkId: parkId, landId: landId, name: name, normalizedName: api.normalize(name), type: 'ride', classification: 'ride', operatingStatus: 'UNKNOWN', latitude: null, longitude: null, minimumHeight: null, minimumHeightInches: hasMinimum ? height : null, minimumHeightCm: hasMinimum ? Math.round(height * 2.54) : null, restrictionType: hasMinimum ? 'minimum-height' : 'none', restrictionsVerified: true, restrictionsSourceUrl: restrictionSource, restrictionsSourceName: 'Disneyland Resort', restrictionsLastVerified: verified, thrillCategory: null, indoorOutdoor: 'unknown', singleRider: null, childSwap: null, expressEligibility: null, source: source, lastVerified: verified }; }
})(window.RideHeroParkData);
