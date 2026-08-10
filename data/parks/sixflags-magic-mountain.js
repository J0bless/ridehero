(function(api) {
  'use strict';
  var parkId = 'sfmm', verified = '2026-08-10';
  var source = 'https://www.sixflags.com/magicmountain/things-to-do/rides';
  var lands = ['Six Flags Plaza','Baja Ridge','Boardwalk','DC Universe','Samurai Summit','The Underground'];
  var rows = [
    ['x2','X2','Six Flags Plaza',48],['tatsu','Tatsu','Samurai Summit',54],['twisted-colossus','Twisted Colossus','The Underground',48],
    ['wonder-woman','WONDER WOMAN Flight of Courage','DC Universe',48],['full-throttle','Full Throttle','Six Flags Plaza',54],['west-coast-racers','West Coast Racers','The Underground',54],
    ['goliath','Goliath','Boardwalk',48],['apocalypse','Apocalypse','The Underground',48],['batman','BATMAN The Ride','DC Universe',54],['ninja','Ninja','Samurai Summit',42]
  ];
  var landRecords = lands.map(function(name) { return { id:parkId+'-'+api.normalize(name), parkId:parkId, name:name, slug:api.normalize(name) }; }), byName = {};
  landRecords.forEach(function(land) { byName[land.name] = land.id; });
  var output = {}; output[parkId] = { source:source, lastVerified:verified, lands:landRecords, rides:rows.map(ride) }; api.register({ parks:output });
  function ride(row) {
    var height = row[3];
    return { id:parkId+'-'+row[0], providerId:null, parkId:parkId, landId:byName[row[2]], name:row[1], normalizedName:api.normalize(row[1]), type:'ride', classification:'ride', operatingStatus:'UNKNOWN', latitude:null, longitude:null, minimumHeight:null, minimumHeightInches:height, minimumHeightCm:Math.round(height*2.54), restrictionType:'minimum-height', restrictionsVerified:true, restrictionsSourceUrl:source, restrictionsSourceName:'Six Flags Magic Mountain', restrictionsLastVerified:verified, thrillCategory:'thrill', indoorOutdoor:'unknown', singleRider:null, childSwap:null, expressEligibility:null, source:source, lastVerified:verified };
  }
})(window.RideHeroParkData);
