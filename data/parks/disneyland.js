(function(api) {
  'use strict';
  var verified = '2026-08-10';
  var source = 'https://disneyland.disney.go.com/attractions/';
  api.register({ parks: {
    dl: make('dl', ['Main Street, U.S.A.','Adventureland','New Orleans Square','Critter Country','Star Wars: Galaxy’s Edge','Frontierland','Fantasyland','Mickey’s Toontown','Tomorrowland'], [
      ['its-a-small-world','"it’s a small world"','Fantasyland'],['mickey-minnies-runaway-railway','Mickey & Minnie’s Runaway Railway','Mickey’s Toontown'],['space-mountain','Space Mountain','Tomorrowland'],['big-thunder-mountain-railroad','Big Thunder Mountain Railroad','Frontierland'],['matterhorn-bobsleds','Matterhorn Bobsleds','Fantasyland'],['indiana-jones-adventure','Indiana Jones Adventure','Adventureland'],['rise-of-the-resistance','Star Wars: Rise of the Resistance','Star Wars: Galaxy’s Edge'],['millennium-falcon-smugglers-run','Millennium Falcon: Smugglers Run','Star Wars: Galaxy’s Edge'],['tianas-bayou-adventure','Tiana’s Bayou Adventure','Critter Country'],['pirates-of-the-caribbean','Pirates of the Caribbean','New Orleans Square'],['haunted-mansion','Haunted Mansion','New Orleans Square'],['peter-pans-flight','Peter Pan’s Flight','Fantasyland'],['alice-in-wonderland','Alice in Wonderland','Fantasyland'],['buzz-lightyear-astro-blasters','Buzz Lightyear Astro Blasters','Tomorrowland']
    ]),
    dca: make('dca', ['Buena Vista Street','Hollywood Land','Avengers Campus','Cars Land','San Fransokyo Square','Grizzly Peak','Pixar Pier','Paradise Gardens Park'], [
      ['radiator-springs-racers','Radiator Springs Racers','Cars Land'],['incredicoaster','Incredicoaster','Pixar Pier'],['guardians-mission-breakout','Guardians of the Galaxy – Mission: BREAKOUT!','Avengers Campus'],['web-slingers','WEB SLINGERS: A Spider-Man Adventure','Avengers Campus'],['soarin-across-america','Soarin’ Across America','Grizzly Peak'],['toy-story-midway-mania','Toy Story Midway Mania!','Pixar Pier'],['goofys-sky-school','Goofy’s Sky School','Paradise Gardens Park'],['grizzly-river-run','Grizzly River Run','Grizzly Peak'],['monsters-inc','Monsters, Inc. Mike & Sulley to the Rescue!','Hollywood Land'],['little-mermaid','The Little Mermaid – Ariel’s Undersea Adventure','Paradise Gardens Park'],['luigis-rollickin-roadsters','Luigi’s Rollickin’ Roadsters','Cars Land'],['maters-junkyard-jamboree','Mater’s Junkyard Jamboree','Cars Land']
    ])
  }});
  function make(parkId, landNames, rideRows) {
    var lands = landNames.map(function(name){ return { id: parkId + '-' + api.normalize(name), parkId: parkId, name: name, slug: api.normalize(name) }; });
    var byName = {}; lands.forEach(function(land){ byName[land.name] = land.id; });
    return { source: source, lastVerified: verified, lands: lands, rides: rideRows.map(function(row){ return ride(parkId, row[0], row[1], byName[row[2]]); }) };
  }
  function ride(parkId, id, name, landId) { return { id: parkId + '-' + id, providerId: null, parkId: parkId, landId: landId, name: name, normalizedName: api.normalize(name), type: 'ride', classification: 'ride', operatingStatus: 'UNKNOWN', latitude: null, longitude: null, minimumHeight: null, thrillCategory: null, indoorOutdoor: 'unknown', singleRider: null, childSwap: null, expressEligibility: null, source: source, lastVerified: verified }; }
})(window.RideHeroParkData);
