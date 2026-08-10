(function(api) {
  'use strict';
  var parkId = 'sfga', verified = '2026-08-10';
  var source = 'https://www.sixflags.com/greatadventure/things-to-do/rides';
  var lands = ['Main Street','Pine Barrens','Movietown','Metropolis','Frontier Adventures','Boardwalk','Shoreline Pier'];
  var rows = [
    ['el-toro','El Toro','Plaza del Carnaval',48],['nitro','Nitro','Adventure Seaport',54],['jersey-devil','Jersey Devil Coaster','Pine Barrens',48],
    ['flash-vertical-velocity','THE FLASH: Vertical Velocity','Movietown',48,56],['medusa','Medusa','Frontier Adventures',54],['batman','BATMAN The Ride','Movietown',54],
    ['superman','SUPERMAN: Ultimate Flight','Boardwalk',54],['green-lantern','Green Lantern','Boardwalk',null],['runaway-mine-train','Runaway Mine Train','Frontier Adventures',44],
    ['skull-mountain','Skull Mountain','Adventure Seaport',44,48,77]
  ];
  lands = lands.concat(rows.map(function(row) { return row[2]; }).filter(function(name, index, all) { return all.indexOf(name) === index && lands.indexOf(name) < 0; }));
  var landRecords = lands.map(function(name) { return { id:parkId+'-'+api.normalize(name), parkId:parkId, name:name, slug:api.normalize(name) }; }), byName = {};
  landRecords.forEach(function(land) { byName[land.name] = land.id; });
  var output = {}; output[parkId] = { source:source, lastVerified:verified, lands:landRecords, rides:rows.map(ride) }; api.register({ parks:output });
  function ride(row) {
    var height = row[3], isVerified = Number.isFinite(height);
    return { id:parkId+'-'+row[0], providerId:null, parkId:parkId, landId:byName[row[2]], name:row[1], normalizedName:api.normalize(row[1]), type:'ride', classification:'ride', operatingStatus:'UNKNOWN', latitude:null, longitude:null, minimumHeight:null, minimumHeightInches:isVerified?height:null, minimumHeightCm:isVerified?Math.round(height*2.54):null, minimumHeightUnaccompaniedInches:Number.isFinite(row[4])?row[4]:null, maximumHeightInches:Number.isFinite(row[5])?row[5]:null, restrictionType:isVerified?'minimum-height':'unknown', restrictionsVerified:isVerified, restrictionsSourceUrl:isVerified?source:null, restrictionsSourceName:isVerified?'Six Flags Great Adventure':null, restrictionsLastVerified:isVerified?verified:null, thrillCategory:'thrill', indoorOutdoor:'unknown', singleRider:null, childSwap:null, expressEligibility:null, source:source, lastVerified:verified };
  }
})(window.RideHeroParkData);
