(function(api) {
  'use strict';
  var parkId = 'usj', verified = '2026-08-10';
  var source = 'https://www.usj.co.jp/web/en/us/search-results/filtered?attraction_experience=rides-attractions';
  var lands = ['SUPER NINTENDO WORLD','The Wizarding World of Harry Potter','Minion Park','Universal Wonderland','Hollywood','New York','Jurassic Park','Amity Village'];
  var rows = [
    ['mario-kart','Mario Kart: Koopa’s Challenge','SUPER NINTENDO WORLD',107,122,null,true],['yoshis-adventure','Yoshi’s Adventure','SUPER NINTENDO WORLD',92,122,null,true],
    ['mine-cart-madness','Mine Cart Madness','SUPER NINTENDO WORLD',107,122,null,true],['forbidden-journey','Harry Potter and the Forbidden Journey','The Wizarding World of Harry Potter',122,122],
    ['flight-hippogriff','Flight of the Hippogriff','The Wizarding World of Harry Potter',92,122,195,true],['minion-mayhem','Despicable Me: Minion Mayhem','Minion Park',102,122,null,true],
    ['freeze-ray-sliders','Freeze Ray Sliders','Minion Park',92,122],['flying-dinosaur','The Flying Dinosaur','Jurassic Park',132,132,198,true],
    ['jurassic-park-ride','Jurassic Park – The Ride','Jurassic Park',107,122,null,true],['hollywood-dream','Hollywood Dream – The Ride','Hollywood',132,132,null,true],
    ['flying-snoopy','The Flying Snoopy','Universal Wonderland',92,122],['hello-kitty-cupcake','Hello Kitty’s Cupcake Dream','Universal Wonderland',null,122]
  ];
  var landRecords = lands.map(function(name) { return { id:parkId+'-'+api.normalize(name), parkId:parkId, name:name, slug:api.normalize(name) }; }), byName = {};
  landRecords.forEach(function(land) { byName[land.name] = land.id; });
  var output = {}; output[parkId] = { source:source, lastVerified:verified, lands:landRecords, rides:rows.map(ride) }; api.register({ parks:output });
  function inches(cm) { return cm == null ? null : Math.round(cm / 2.54 * 10) / 10; }
  function ride(row) {
    var minimumCm = row[3], aloneCm = row[4], maximumCm = row[5];
    return { id:parkId+'-'+row[0], providerId:null, parkId:parkId, landId:byName[row[2]], name:row[1], normalizedName:api.normalize(row[1]), type:'ride', classification:'ride', operatingStatus:'UNKNOWN', latitude:null, longitude:null, minimumHeight:null, minimumHeightInches:inches(minimumCm), minimumHeightCm:minimumCm, minimumHeightUnaccompaniedInches:inches(aloneCm), minimumHeightUnaccompaniedCm:aloneCm, maximumHeightInches:inches(maximumCm), maximumHeightCm:maximumCm, restrictionType:minimumCm==null?'supervision-only':'minimum-height', restrictionsVerified:true, restrictionsSourceUrl:source, restrictionsSourceName:'Universal Studios Japan', restrictionsLastVerified:verified, accessPrograms:{expressPass:row[6]===true}, thrillCategory:null, indoorOutdoor:'unknown', singleRider:null, childSwap:null, expressEligibility:null, source:source, lastVerified:verified };
  }
})(window.RideHeroParkData);
