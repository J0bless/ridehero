(function(root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RideHeroParkMap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';

  var TILE_SIZE = 256;
  var EARTH_RADIUS = 6378137;
  var defaultProvider = Object.freeze({
    id: 'openstreetmap-standard',
    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    attributionUrl: 'https://www.openstreetmap.org/copyright',
    license: 'ODbL',
    minZoom: 13,
    maxZoom: 18,
    tileSize: TILE_SIZE
  });

  function finite(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)); }
  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  function provider() { return Object.assign({}, defaultProvider, root && root.RIDEHERO_MAP_PROVIDER || {}); }
  function tileUrl(config, z, x, y) {
    return String(config.urlTemplate).replace('{z}', z).replace('{x}', x).replace('{y}', y);
  }
  function project(latitude, longitude, zoom) {
    var lat = clamp(Number(latitude), -85.05112878, 85.05112878);
    var lng = Number(longitude);
    var scale = TILE_SIZE * Math.pow(2, zoom);
    var sin = Math.sin(lat * Math.PI / 180);
    return {
      x: (lng + 180) / 360 * scale,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
    };
  }
  function unproject(x, y, zoom) {
    var scale = TILE_SIZE * Math.pow(2, zoom);
    var longitude = x / scale * 360 - 180;
    var n = Math.PI - 2 * Math.PI * y / scale;
    var latitude = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { latitude: latitude, longitude: longitude };
  }
  function validLocation(location) {
    if (!(location && finite(location.latitude) && finite(location.longitude))) return false;
    var latitude = Number(location.latitude), longitude = Number(location.longitude);
    return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  }
  function trustedConfidence(value) { return value === 'verified' || value === 'provider'; }
  function sourcedLocation(location) { return !!(location && location.sourceName && location.sourceUrl); }
  function rideLocation(ride) {
    if (!ride) return null;
    var entrance = ride.guestEntranceLocation;
    if (validLocation(entrance) && trustedConfidence(entrance.dataConfidence) && sourcedLocation(entrance)) {
      return { latitude:Number(entrance.latitude), longitude:Number(entrance.longitude), quality:entrance.dataConfidence, label:'Guest entrance' };
    }
    var attraction = ride.attractionLocation;
    if (validLocation(attraction) && trustedConfidence(attraction.dataConfidence) && sourcedLocation(attraction)) {
      return { latitude:Number(attraction.latitude), longitude:Number(attraction.longitude), quality:attraction.dataConfidence, label:'Provider attraction location' };
    }
    var directSourceName = ride.locationSourceName || ride.sourceName || (ride.providerNamespace ? 'Theme park data provider' : null);
    var directSourceUrl = ride.locationSourceUrl || ride.sourceUrl || ride.source;
    if (validLocation({latitude:ride.latitude, longitude:ride.longitude}) && trustedConfidence(ride.locationConfidence) && directSourceName && directSourceUrl) {
      return { latitude:Number(ride.latitude), longitude:Number(ride.longitude), quality:ride.locationConfidence, label:'Provider attraction location' };
    }
    return null;
  }
  function canDrawRoute(route) {
    return !!(route && route.schemaVersion === 1 && route.quality === 'verified' && route.parkId && route.sourceName && route.sourceUrl && route.lastVerified && route.stopCoverageComplete === true && Array.isArray(route.coordinates) && route.coordinates.length > 1 && route.coordinates.every(function(point) {
      return Array.isArray(point) && point.length >= 2 && validLocation({latitude:point[1], longitude:point[0]});
    }));
  }

  function mount(container, options) {
    options = options || {};
    if (!container || !root || !root.document) return Promise.reject(new Error('A map container is required.'));
    var park = options.park || {};
    if (!validLocation(park)) return Promise.reject(new Error('This park does not have a map center yet.'));
    var config = provider();
    var center = { latitude:Number(park.latitude), longitude:Number(park.longitude) };
    var zoom = clamp(Number(options.zoom) || 15, config.minZoom, config.maxZoom);
    var stops = Array.isArray(options.stops) ? options.stops.slice() : [];
    var userLocation = validLocation(options.userLocation) ? Object.assign({}, options.userLocation) : null;
    var route = canDrawRoute(options.route) ? options.route : null;
    var tileNodes = Object.create(null);
    var destroyed = false;
    var drag = null;
    var resizeObserver = null;

    container.textContent = '';
    var shell = root.document.createElement('section'); shell.className = 'rh-park-map'; shell.setAttribute('aria-label', (park.shortName || park.officialName || 'Park') + ' live map');
    var viewport = root.document.createElement('div'); viewport.className = 'rh-park-map-viewport'; viewport.tabIndex = 0; viewport.setAttribute('role', 'region'); viewport.setAttribute('aria-label', 'Interactive park map. Swipe sideways or use arrow keys to pan, and use the map controls to zoom.');
    var tiles = root.document.createElement('div'); tiles.className = 'rh-park-map-tiles'; tiles.setAttribute('aria-hidden', 'true');
    var overlay = root.document.createElement('div'); overlay.className = 'rh-park-map-overlay';
    var controls = root.document.createElement('div'); controls.className = 'rh-park-map-controls';
    var zoomIn = button('+', 'Zoom in'); var zoomOut = button('−', 'Zoom out'); var recenter = button('⌖', 'Recenter map on park'); var locate = button('●', 'Show my live location'); locate.classList.add('rh-map-locate');
    controls.appendChild(zoomIn); controls.appendChild(zoomOut); controls.appendChild(recenter); controls.appendChild(locate);
    var status = root.document.createElement('div'); status.className = 'rh-park-map-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    var quality = root.document.createElement('div'); quality.className = 'rh-park-map-quality';
    var attribution = root.document.createElement('a'); attribution.className = 'rh-park-map-attribution'; attribution.href = config.attributionUrl; attribution.target = '_blank'; attribution.rel = 'noopener'; attribution.textContent = config.attribution;
    viewport.appendChild(tiles); viewport.appendChild(overlay); viewport.appendChild(controls); viewport.appendChild(status); viewport.appendChild(quality); viewport.appendChild(attribution); shell.appendChild(viewport); container.appendChild(shell);

    function button(text, label) { var node = root.document.createElement('button'); node.type = 'button'; node.textContent = text; node.setAttribute('aria-label', label); return node; }
    function dimensions() { return { width:viewport.clientWidth || container.clientWidth || 360, height:viewport.clientHeight || 310 }; }
    function topLeft() { var size=dimensions(), point=project(center.latitude, center.longitude, zoom); return { x:point.x-size.width/2, y:point.y-size.height/2, width:size.width, height:size.height }; }
    function screenPoint(latitude, longitude) { var origin=topLeft(), point=project(latitude, longitude, zoom); return { x:point.x-origin.x, y:point.y-origin.y }; }
    function setStatus(message) { status.textContent = message || ''; }

    function renderTiles() {
      if (destroyed) return;
      var origin = topLeft(), max = Math.pow(2, zoom), needed = Object.create(null);
      var minX = Math.floor(origin.x / TILE_SIZE) - 1, maxX = Math.floor((origin.x + origin.width) / TILE_SIZE) + 1;
      var minY = Math.max(0, Math.floor(origin.y / TILE_SIZE) - 1), maxY = Math.min(max - 1, Math.floor((origin.y + origin.height) / TILE_SIZE) + 1);
      for (var rawX=minX; rawX<=maxX; rawX++) for (var y=minY; y<=maxY; y++) {
        var x=((rawX%max)+max)%max, key=zoom+'/'+x+'/'+y; needed[key]=true;
        var image=tileNodes[key];
        if (!image) {
          image=root.document.createElement('img'); image.alt=''; image.decoding='async'; image.loading='eager'; image.draggable=false; image.className='rh-park-map-tile'; image.src=tileUrl(config,zoom,x,y);
          image.addEventListener('error', function(){ setStatus('Map tiles are temporarily unavailable. Your route details remain available below.'); });
          tileNodes[key]=image; tiles.appendChild(image);
        }
        image.style.transform='translate3d('+Math.round(rawX*TILE_SIZE-origin.x)+'px,'+Math.round(y*TILE_SIZE-origin.y)+'px,0)';
      }
      Object.keys(tileNodes).forEach(function(key){ if (!needed[key]) { tileNodes[key].remove(); delete tileNodes[key]; } });
    }

    function clearOverlay() { while (overlay.firstChild) overlay.removeChild(overlay.firstChild); }
    function renderOverlay() {
      if (destroyed) return;
      clearOverlay();
      locate.classList.remove('is-active'); locate.setAttribute('aria-label','Show my live location');
      if (route) drawVerifiedRoute(route);
      var markerCount=0;
      stops.forEach(function(ride,index) {
        var location=rideLocation(ride); if (!location) return;
        markerCount += 1;
        var point=screenPoint(location.latitude,location.longitude);
        var marker=root.document.createElement('span'); marker.className='rh-park-map-stop'; marker.style.transform='translate3d('+Math.round(point.x)+'px,'+Math.round(point.y)+'px,0)'; marker.textContent=String(index+1); marker.setAttribute('role','img'); marker.setAttribute('aria-label',(index+1)+'. '+String(ride.name||'Route stop')+'. '+location.label+'.'); marker.title=String(ride.name||'Route stop')+' — '+location.label; overlay.appendChild(marker);
      });
      if (userLocation) drawUserLocation(userLocation);
      var missing=Math.max(0,stops.length-markerCount);
      quality.textContent = route ? 'Verified walking path' : 'Live basemap · walking line unavailable' + (missing ? ' · '+missing+' stop location'+(missing===1?'':'s')+' unavailable' : '');
    }
    function drawVerifiedRoute(value) {
      var svg=root.document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('class','rh-park-map-route'); svg.setAttribute('aria-hidden','true');
      var size=dimensions(); svg.setAttribute('viewBox','0 0 '+size.width+' '+size.height);
      var path=root.document.createElementNS('http://www.w3.org/2000/svg','polyline');
      path.setAttribute('points',value.coordinates.map(function(pair){var p=screenPoint(pair[1],pair[0]);return p.x+','+p.y;}).join(' ')); path.setAttribute('fill','none'); path.setAttribute('stroke','#D62828'); path.setAttribute('stroke-width','5'); path.setAttribute('stroke-linecap','round'); path.setAttribute('stroke-linejoin','round'); svg.appendChild(path); overlay.appendChild(svg);
    }
    function drawUserLocation(value) {
      var point=screenPoint(value.latitude,value.longitude);
      var metresPerPixel=Math.cos(Number(value.latitude)*Math.PI/180)*2*Math.PI*EARTH_RADIUS/(TILE_SIZE*Math.pow(2,zoom));
      var radius=finite(value.accuracy)?clamp(Number(value.accuracy)/metresPerPixel,10,120):16;
      var accuracy=root.document.createElement('span'); accuracy.className='rh-park-map-accuracy'; accuracy.style.width=(radius*2)+'px'; accuracy.style.height=(radius*2)+'px'; accuracy.style.transform='translate3d('+(point.x-radius)+'px,'+(point.y-radius)+'px,0)'; accuracy.setAttribute('aria-hidden','true');
      var dot=root.document.createElement('span'); dot.className='rh-park-map-user'; dot.style.transform='translate3d('+Math.round(point.x)+'px,'+Math.round(point.y)+'px,0)'; dot.setAttribute('role','img'); dot.setAttribute('aria-label','Your live location'+(finite(value.accuracy)?', accuracy about '+Math.round(value.accuracy)+' metres':'')+'.'); dot.title='Your live location'; overlay.appendChild(accuracy); overlay.appendChild(dot);
      locate.classList.add('is-active'); locate.setAttribute('aria-label','Recenter on my live location');
    }
    function render() { renderTiles(); renderOverlay(); zoomIn.disabled=zoom>=config.maxZoom; zoomOut.disabled=zoom<=config.minZoom; }
    function setCenter(value) { center={latitude:Number(value.latitude),longitude:Number(value.longitude)}; render(); }
    function setZoom(value) { zoom=clamp(Number(value),config.minZoom,config.maxZoom); render(); }
    function panPixels(dx,dy) { var p=project(center.latitude,center.longitude,zoom), next=unproject(p.x+dx,p.y+dy,zoom); center=next; render(); }
    function fitContent() {
      var locations = stops.map(rideLocation).filter(Boolean);
      if (userLocation) locations.push(userLocation);
      if (locations.length < 2) { center={latitude:Number(park.latitude),longitude:Number(park.longitude)}; zoom=clamp(Number(options.zoom)||15,config.minZoom,config.maxZoom); render(); return; }
      var size=dimensions(), candidate=config.maxZoom, points=locations.map(function(location){return project(location.latitude,location.longitude,config.maxZoom);});
      var minX=Math.min.apply(null,points.map(function(point){return point.x;})), maxX=Math.max.apply(null,points.map(function(point){return point.x;}));
      var minY=Math.min.apply(null,points.map(function(point){return point.y;})), maxY=Math.max.apply(null,points.map(function(point){return point.y;}));
      while(candidate>config.minZoom && ((maxX-minX)/Math.pow(2,config.maxZoom-candidate)>Math.max(80,size.width-110) || (maxY-minY)/Math.pow(2,config.maxZoom-candidate)>Math.max(80,size.height-90))) candidate-=1;
      center=unproject((minX+maxX)/2,(minY+maxY)/2,config.maxZoom); zoom=clamp(candidate,config.minZoom,config.maxZoom); render();
    }

    zoomIn.addEventListener('click',function(){setZoom(zoom+1);}); zoomOut.addEventListener('click',function(){setZoom(zoom-1);});
    recenter.addEventListener('click',function(){setCenter({latitude:park.latitude,longitude:park.longitude});setStatus('Map recentered on '+(park.shortName||'the park')+'.');});
    locate.addEventListener('click',function(){
      if (userLocation) { setCenter(userLocation); setStatus('Map centered on your live location.'); return; }
      if (typeof options.onRequestLocation !== 'function') { setStatus('Live location is unavailable.'); return; }
      locate.disabled=true; setStatus('Checking your live location…');
      Promise.resolve(options.onRequestLocation()).then(function(value){ if (destroyed) return; if (validLocation(value)) { userLocation=Object.assign({},value); setCenter(userLocation); setStatus('Live location shown.'); } else setStatus('A valid live location was not available.'); }).catch(function(){if(!destroyed)setStatus('Location permission or a valid position was unavailable.');}).then(function(){if(!destroyed)locate.disabled=false;});
    });
    viewport.addEventListener('pointerdown',function(event){ if (event.target.closest && event.target.closest('button,a')) return; drag={x:event.clientX,y:event.clientY,center:project(center.latitude,center.longitude,zoom)}; viewport.setPointerCapture(event.pointerId); });
    viewport.addEventListener('pointermove',function(event){ if(!drag)return; drag.dx=event.clientX-drag.x; drag.dy=event.clientY-drag.y; tiles.style.transform='translate3d('+drag.dx+'px,'+drag.dy+'px,0)'; overlay.style.transform='translate3d('+drag.dx+'px,'+drag.dy+'px,0)'; });
    function endDrag(){ if(!drag)return; var next=unproject(drag.center.x-(drag.dx||0),drag.center.y-(drag.dy||0),zoom); center=next; drag=null; tiles.style.transform=''; overlay.style.transform=''; render(); } viewport.addEventListener('pointerup',endDrag); viewport.addEventListener('pointercancel',endDrag);
    viewport.addEventListener('keydown',function(event){ var amount=64; if(event.key==='ArrowLeft'){panPixels(-amount,0);}else if(event.key==='ArrowRight'){panPixels(amount,0);}else if(event.key==='ArrowUp'){panPixels(0,-amount);}else if(event.key==='ArrowDown'){panPixels(0,amount);}else if(event.key==='+'||event.key==='='){setZoom(zoom+1);}else if(event.key==='-'){setZoom(zoom-1);}else{return;}event.preventDefault();});
    if (typeof root.ResizeObserver === 'function') { resizeObserver=new root.ResizeObserver(render); resizeObserver.observe(viewport); }
    fitContent();
    return Promise.resolve(Object.freeze({
      setStops:function(value){stops=Array.isArray(value)?value.slice():[];renderOverlay();},
      setRoute:function(value){route=canDrawRoute(value)?value:null;renderOverlay();return !!route;},
      setUserLocation:function(value){userLocation=validLocation(value)?Object.assign({},value):null;renderOverlay();},
      fit:fitContent,
      destroy:function(){destroyed=true;if(resizeObserver)resizeObserver.disconnect();if(shell.parentNode)shell.parentNode.removeChild(shell);},
      getState:function(){return{center:Object.assign({},center),zoom:zoom,stopCount:stops.length,hasUserLocation:!!userLocation,routeDrawn:!!route};}
    }));
  }

  return Object.freeze({ provider:provider, project:project, unproject:unproject, rideLocation:rideLocation, canDrawRoute:canDrawRoute, mount:mount });
});
