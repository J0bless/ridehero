(function(global) {
  'use strict';

  var verified = '2026-08-10';
  var tp = 'themeparks-wiki';
  var parks = {
    mk: park('mk', 'magic-kingdom', 'disney', 'walt-disney-world', 'Magic Kingdom Park', 'Magic Kingdom', 'Bay Lake', 'Florida', 'United States', 'America/New_York', 28.4160036778, -81.5811902834, '75ea578a-adc8-4116-a54d-dccb60765ef9', 'https://disneyworld.disney.go.com/destinations/magic-kingdom/', 'disney-world', map('magic_kingdom_app_map.png?v=9.8-detailed', 900, 680, 'verified')),
    ep: park('ep', 'epcot', 'disney', 'walt-disney-world', 'EPCOT', 'EPCOT', 'Bay Lake', 'Florida', 'United States', 'America/New_York', 28.3762301397, -81.5494047655, '47f90d2c-e191-4239-a466-5892ef59a88b', 'https://disneyworld.disney.go.com/destinations/epcot/', 'disney-world', map('epcot_app_map.png?v=9.8-detailed', 900, 680, 'verified')),
    hs: park('hs', 'hollywood-studios', 'disney', 'walt-disney-world', "Disney's Hollywood Studios", 'Hollywood Studios', 'Bay Lake', 'Florida', 'United States', 'America/New_York', 28.3584111691, -81.558689232, '288747d1-8b4f-4a64-867e-ea7c9b27bad8', 'https://disneyworld.disney.go.com/destinations/hollywood-studios/', 'disney-world', map('hollywood_studios_app_map.png?v=9.8-detailed', 900, 680, 'verified')),
    ak: park('ak', 'animal-kingdom', 'disney', 'walt-disney-world', "Disney's Animal Kingdom Theme Park", 'Animal Kingdom', 'Bay Lake', 'Florida', 'United States', 'America/New_York', 28.3553842507, -81.5900898529, '1c84a229-8862-4648-9c71-378ddd2c7693', 'https://disneyworld.disney.go.com/destinations/animal-kingdom/', 'disney-world', map('animal_kingdom_app_map.webp', 1536, 1024, 'verified')),
    dl: park('dl', 'disneyland', 'disney', 'disneyland-resort', 'Disneyland Park', 'Disneyland', 'Anaheim', 'California', 'United States', 'America/Los_Angeles', 33.8095545068, -117.9189529669, '7340550b-c14d-4def-80bb-acdb51d49a66', 'https://disneyland.disney.go.com/destinations/disneyland/', 'disneyland', map(null, null, null, 'approximate')),
    dca: park('dca', 'california-adventure', 'disney', 'disneyland-resort', 'Disney California Adventure Park', 'California Adventure', 'Anaheim', 'California', 'United States', 'America/Los_Angeles', 33.8087804896, -117.9189353206, '832fcd51-ea19-4e77-85c7-75d5843b127c', 'https://disneyland.disney.go.com/destinations/disney-california-adventure/', 'disneyland', map(null, null, null, 'approximate')),
    usf: park('usf', 'universal-studios-florida', 'universal', 'universal-orlando', 'Universal Studios Florida', 'Universal Studios Florida', 'Orlando', 'Florida', 'United States', 'America/New_York', 28.477986, -81.468386, 'eb3f4560-2383-4a36-9152-6b3e5ed6bc57', 'https://www.universalorlando.com/web/en/us/theme-parks/universal-studios-florida', 'universal-orlando', map(null, null, null, 'approximate')),
    ioa: park('ioa', 'islands-of-adventure', 'universal', 'universal-orlando', 'Universal Islands of Adventure', 'Islands of Adventure', 'Orlando', 'Florida', 'United States', 'America/New_York', 28.47225, -81.467594, '267615cc-8943-4c2a-ae2c-5da728ca591f', 'https://www.universalorlando.com/web/en/us/theme-parks/islands-of-adventure', 'universal-orlando', map(null, null, null, 'approximate')),
    epic: park('epic', 'epic-universe', 'universal', 'universal-orlando', 'Universal Epic Universe', 'Epic Universe', 'Orlando', 'Florida', 'United States', 'America/New_York', 28.4414454548964, -81.4486740912188, '12dbb85b-265f-44e6-bccf-f1faa17211fc', 'https://www.universalorlando.com/web/en/us/theme-parks/epic-universe', 'universal-orlando', map(null, null, null, 'approximate')),
    vb: park('vb', 'volcano-bay', 'universal', 'universal-orlando', 'Universal Volcano Bay', 'Volcano Bay', 'Orlando', 'Florida', 'United States', 'America/New_York', 28.461355, -81.472286, 'fe78a026-b91b-470c-b906-9d2266b692da', 'https://www.universalorlando.com/web/en/us/theme-parks/volcano-bay', 'universal-orlando', map(null, null, null, 'approximate')),
    ush: park('ush', 'hollywood', 'universal', 'universal-hollywood', 'Universal Studios Hollywood', 'Universal Studios Hollywood', 'Universal City', 'California', 'United States', 'America/Los_Angeles', 34.13814279796987, -118.35329508393052, 'bc4005c5-8c7e-41d7-b349-cdddf1796427', 'https://www.universalstudioshollywood.com/web/en/us', 'universal-hollywood', map(null, null, null, 'approximate')),
    usj: park('usj', 'japan', 'universal', 'universal-japan', 'Universal Studios Japan', 'Universal Studios Japan', 'Osaka', 'Osaka Prefecture', 'Japan', 'Asia/Tokyo', 34.6654, 135.4324, '47f61fac-7586-41ac-ae80-61c9257cf33e', 'https://www.usj.co.jp/web/en/us', 'universal-japan', map(null, null, null, 'approximate')),
    sfga: park('sfga', 'great-adventure', 'six-flags', 'six-flags-great-adventure', 'Six Flags Great Adventure', 'Great Adventure', 'Jackson Township', 'New Jersey', 'United States', 'America/New_York', 40.13633274468086, -74.44006631914895, '556f0126-8082-4b66-aeee-1e3593fed188', 'https://www.sixflags.com/greatadventure', 'sixflags-great-adventure', map(null, null, null, 'approximate')),
    sfmm: park('sfmm', 'magic-mountain', 'six-flags', 'six-flags-magic-mountain', 'Six Flags Magic Mountain', 'Magic Mountain', 'Valencia', 'California', 'United States', 'America/Los_Angeles', 34.42423428947369, -118.59764502631579, 'c6073ab0-83aa-4e25-8d60-12c8f25684bc', 'https://www.sixflags.com/magicmountain', 'sixflags-magic-mountain', map(null, null, null, 'approximate')),
    sfgam: park('sfgam', 'great-america', 'six-flags', 'six-flags-great-america', 'Six Flags Great America', 'Great America', 'Gurnee', 'Illinois', 'United States', 'America/Chicago', 42.367267555555564, -87.93380948888893, '15805a4d-4023-4702-b9f2-3d3cab2e0c1e', 'https://www.sixflags.com/greatamerica', 'sixflags-great-america', map(null, null, null, 'approximate'))
  };

  function map(asset, width, height, routingQuality) {
    return { asset: asset, width: width, height: height, routingQuality: routingQuality };
  }

  function park(id, slug, brandId, destinationId, officialName, shortName, city, region, country, timezone, latitude, longitude, providerId, officialSource, dataFile, parkMap) {
    return {
      id: id, slug: slug, brandId: brandId, destinationId: destinationId,
      officialName: officialName, shortName: shortName, city: city,
      state: country === 'United States' ? region : null,
      prefecture: country === 'Japan' ? region : null,
      country: country, timezone: timezone, latitude: latitude, longitude: longitude,
      dataConfidence: 'verified', sourceName: 'Official operator park page', sourceUrl: officialSource,
      parkCenter: { latitude: latitude, longitude: longitude, dataConfidence: 'provider', sourceName: 'ThemeParks.wiki', sourceUrl: 'https://api.themeparks.wiki/' },
      entrance: null, entranceConfidence: 'unknown',
      bounds: { center: { latitude: latitude, longitude: longitude }, radiusKm: 5, dataConfidence: 'approximate', sourceName: 'RideHero proximity boundary', sourceUrl: null },
      operatingStatus: 'UNKNOWN', officialSource: officialSource, lastVerified: verified,
      waitTimeProviderId: providerId, waitTimeProvider: tp,
      accessPrograms: accessProgramsFor(id),
      mapRoutingAvailable: parkMap.routingQuality === 'verified', routingQuality: parkMap.routingQuality,
      liveWaitTimesAvailable: true, map: parkMap, dataFile: dataFile
    };
  }

  function accessProgram(available, sourceName, sourceUrl) {
    return { available: available, dataConfidence: available === true ? 'verified' : 'unknown', sourceName: sourceName || null, sourceUrl: sourceUrl || null, lastVerified: available === true ? verified : null };
  }

  function accessProgramsFor(parkId) {
    var unknown = function() { return accessProgram(null, null, null); };
    var programs = { lightningLane: unknown(), expressPass: unknown(), fastLane: unknown() };
    if (['mk','ep','hs','ak'].includes(parkId)) programs.lightningLane = accessProgram(true, 'Walt Disney World Resort', 'https://disneyworld.disney.go.com/lightning-lane-passes/');
    if (['dl','dca'].includes(parkId)) programs.lightningLane = accessProgram(true, 'Disneyland Resort', 'https://disneyland.disney.go.com/lightning-lane-passes/');
    if (['usf','ioa'].includes(parkId)) programs.expressPass = accessProgram(true, 'Universal Orlando Resort', 'https://www.universalorlando.com/web/en/us/tickets-packages/park-tickets');
    if (parkId === 'ush') programs.expressPass = accessProgram(true, 'Universal Studios Hollywood', 'https://www.universalstudioshollywood.com/web/en/us/faqs/rides-and-attractions');
    if (parkId === 'usj') programs.expressPass = accessProgram(true, 'Universal Studios Japan', 'https://www.usj.co.jp/web/en/us/tickets/express-pass');
    if (['sfga','sfmm','sfgam'].includes(parkId)) programs.fastLane = accessProgram(true, 'Six Flags', 'https://www.sixflags.com/blog/fast-lane-updates');
    return programs;
  }

  global.RIDEHERO_CATALOG = {
    schemaVersion: 1,
    lastVerified: verified,
    brands: {
      disney: { id: 'disney', slug: 'disney', name: 'Disney', accent: '#3157A4', icon: '✦' },
      universal: { id: 'universal', slug: 'universal', name: 'Universal', accent: '#0B6E69', icon: '◎' },
      'six-flags': { id: 'six-flags', slug: 'six-flags', name: 'Six Flags', accent: '#B24B32', icon: '▲' }
    },
    destinations: {
      'walt-disney-world': destination('walt-disney-world', 'disney', 'Walt Disney World Resort', 'Lake Buena Vista, Florida', ['mk','ep','hs','ak']),
      'disneyland-resort': destination('disneyland-resort', 'disney', 'Disneyland Resort', 'Anaheim, California', ['dl','dca']),
      'universal-orlando': destination('universal-orlando', 'universal', 'Universal Orlando Resort', 'Orlando, Florida', ['usf','ioa','epic','vb']),
      'universal-hollywood': destination('universal-hollywood', 'universal', 'Universal Studios Hollywood', 'Universal City, California', ['ush']),
      'universal-japan': destination('universal-japan', 'universal', 'Universal Studios Japan', 'Osaka, Japan', ['usj']),
      'six-flags-great-adventure': destination('six-flags-great-adventure', 'six-flags', 'Six Flags Great Adventure', 'Jackson Township, New Jersey', ['sfga']),
      'six-flags-magic-mountain': destination('six-flags-magic-mountain', 'six-flags', 'Six Flags Magic Mountain', 'Valencia, California', ['sfmm']),
      'six-flags-great-america': destination('six-flags-great-america', 'six-flags', 'Six Flags Great America', 'Gurnee, Illinois', ['sfgam'])
    },
    parks: parks
  };

  function destination(id, brandId, name, location, parkIds) {
    return { id: id, slug: id, brandId: brandId, name: name, location: location, parkIds: parkIds };
  }
})(window);
