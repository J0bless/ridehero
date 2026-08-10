(function(api) {
  'use strict';
  var source = 'https://disneyworld.disney.go.com/attractions/';
  api.register({ parks: {
    mk: dataset('mk', ['Main Street, U.S.A.','Adventureland','Frontierland','Liberty Square','Fantasyland','Tomorrowland']),
    ep: dataset('ep', ['World Celebration','World Discovery','World Nature','World Showcase']),
    hs: dataset('hs', ['Hollywood Boulevard','Echo Lake','Grand Avenue','Star Wars: Galaxy’s Edge','Toy Story Land','Sunset Boulevard']),
    ak: dataset('ak', ['Oasis','Discovery Island','Pandora – The World of Avatar','Africa','Asia','DinoLand U.S.A.'])
  }});
  function dataset(parkId, names) { return { source: source, lastVerified: '2026-08-10', lands: names.map(function(name, i){ return { id: parkId + '-land-' + i, parkId: parkId, name: name, slug: null }; }), rides: [] }; }
})(window.RideHeroParkData);
