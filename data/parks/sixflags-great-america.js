(function(api) {
  'use strict';
  var parkId = 'sfgam', verified = '2026-08-10';
  var source = 'https://www.sixflags.com/greatamerica/things-to-do/rides';
  var fastLaneSource = 'https://www.sixflags.com/greatamerica/fast-lane';
  var fastLaneIds = {'wrath-of-rakshasa':1,'raging-bull':1,'goliath':1,'maxx-force':1,'x-flight':1,'batman':1,'superman':1,'vertical-velocity':1};
  var lands = ['Carousel Plaza','Orleans Place','Mardi Gras','Yukon Territory','County Fair','Southwest Territory','DC Universe'];
  var rows = [
    ['american-eagle','American Eagle','County Fair',48],['wrath-of-rakshasa','Wrath of Rakshasa','County Fair',48,null,78],['raging-bull','Raging Bull','Southwest Territory',54],
    ['goliath','Goliath','County Fair',48],['maxx-force','Maxx Force','Carousel Plaza',48],['x-flight','X Flight','County Fair',54,null,78],
    ['batman','BATMAN The Ride','Yukon Territory',54],['superman','SUPERMAN: Ultimate Flight','Orleans Place',54],['vertical-velocity','The Flash: Vertical Velocity','DC Universe',54,null,80],
    ['whizzer','Whizzer','Hometown Square',36,42]
  ];
  lands = lands.concat(rows.map(function(row) { return row[2]; }).filter(function(name, index, all) { return all.indexOf(name) === index && lands.indexOf(name) < 0; }));
  var landRecords = lands.map(function(name) { return { id:parkId+'-'+api.normalize(name), parkId:parkId, name:name, slug:api.normalize(name) }; }), byName = {};
  landRecords.forEach(function(land) { byName[land.name] = land.id; });
  var output = {}; output[parkId] = { source:source, lastVerified:verified, lands:landRecords, rides:rows.map(ride) }; api.register({ parks:output });
  function ride(row) {
    var height = row[3];
    var hasFastLane = fastLaneIds[row[0]] === 1;
    return { id:parkId+'-'+row[0], providerId:null, parkId:parkId, landId:byName[row[2]], name:row[1], normalizedName:api.normalize(row[1]), type:'ride', classification:'ride', operatingStatus:'UNKNOWN', latitude:null, longitude:null, minimumHeight:null, minimumHeightInches:height, minimumHeightCm:Math.round(height*2.54), minimumHeightUnaccompaniedInches:Number.isFinite(row[4])?row[4]:null, maximumHeightInches:Number.isFinite(row[5])?row[5]:null, restrictionType:'minimum-height', restrictionsVerified:true, restrictionsSourceUrl:source, restrictionsSourceName:'Six Flags Great America', restrictionsLastVerified:verified, accessPrograms:{fastLane:hasFastLane}, accessProgramConfidence:{fastLane:'verified'}, accessProgramsSourceUrl:fastLaneSource, accessProgramsLastVerified:verified, thrillCategory:'thrill', indoorOutdoor:'unknown', singleRider:null, childSwap:null, expressEligibility:null, source:source, lastVerified:verified };
  }
})(window.RideHeroParkData);
