(function(global) {
  'use strict';
  var catalog = global.RIDEHERO_CATALOG;
  var root = document.getElementById('screen-setup');
  var loadingParkId = null;
  var recent = global.RideHeroState.get().recent || {};
  var appState = {
    planningMode: normalizePlanningMode(recent.planningMode),
    brandId: recent.brandId || null,
    destinationId: recent.destinationId || null,
    parkId: recent.parkId || null,
    locationSource: null,
    routeStyle: null
  };

  function values(object) { return Object.keys(object || {}).map(function(key) { return object[key]; }); }
  function routeFor(parts) { return '#/' + parts.filter(Boolean).map(encodeURIComponent).join('/'); }
  function go(parts, replace) {
    var next = routeFor(parts);
    if (location.hash === next) render();
    else if (replace) location.replace(next);
    else location.hash = next;
  }
  function currentRoute() { return (location.hash || '#/mode').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>'"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]; }); }
  function normalizePlanningMode(mode) { return mode === 'full' || mode === 'strategic' ? 'full' : mode === 'quick' ? 'quick' : null; }
  function legacyGuidanceMode() { return appState.planningMode === 'full' ? 'strategic' : 'quick'; }
  function modeName() { return appState.planningMode === 'full' ? 'Maximize My Day' : 'Quick Route'; }
  function modeSummary() { return appState.planningMode === 'full' ? 'Full-day strategy' : 'Nearby rides only'; }
  function rememberContext(context) { recent = Object.assign({}, recent, context || {}); global.RideHeroState.rememberContext(context); }

  function shell(title, eyebrow, body, backRoute, crumbs, options) {
    options = options || {};
    var modeAction = appState.planningMode && !options.hideModeAction ? '<button class="catalog-mode-action" type="button" data-route="#/mode"><span>' + esc(modeName()) + '</span><strong>Change Mode</strong></button>' : '<span></span>';
    return '<div class="catalog-page' + (options.modePage ? ' mode-catalog-page' : '') + '" data-catalog-page>' +
      '<header class="catalog-header"><div class="catalog-nav-row">' +
      (backRoute ? '<button class="catalog-icon-btn" type="button" data-action="back" data-fallback-route="' + esc(backRoute) + '" aria-label="Go back">&lsaquo;</button>' : '<span></span>') +
      '<button class="catalog-wordmark" type="button" data-action="home" aria-label="RideHero home"><span class="catalog-wordmark-mark" aria-hidden="true">RH</span><span>RideHero</span></button>' +
      modeAction + '</div>' +
      (crumbs && crumbs.length ? '<nav class="catalog-breadcrumbs" aria-label="Breadcrumb">' + crumbs.map(function(item, i){ return '<button type="button" data-route="' + esc(item.route) + '"' + (i === crumbs.length - 1 ? ' aria-current="page"' : '') + '>' + esc(item.label) + '</button>'; }).join('<span aria-hidden="true">&rsaquo;</span>') + '</nav>' : '') +
      '<div class="catalog-heading" tabindex="-1"><span>' + esc(eyebrow) + '</span><h1>' + esc(title) + '</h1>' + (options.description ? '<p>' + esc(options.description) + '</p>' : '') + '</div></header>' +
      '<main class="catalog-content">' + body + '</main></div>';
  }

  function modeCards() {
    var lastMode = normalizePlanningMode(recent.planningMode);
    return '<div class="mode-card-grid" aria-label="Planning modes">' +
      '<button class="mode-card mode-card-quick' + (lastMode === 'quick' ? ' was-recent' : '') + '" type="button" data-planning-mode="quick">' +
        '<span class="mode-card-top"><span class="mode-card-icon" aria-hidden="true">Q</span><span class="mode-card-badge">Rides only</span></span>' +
        '<span class="mode-card-copy"><span class="mode-card-kicker">Fast &amp; simple</span><strong>Quick Route</strong><span>Find the smartest nearby rides based on your location, current waits, and walking distance.</span></span>' +
        '<span class="mode-card-preview" aria-hidden="true"><span><b>Nearby</b><small>location-aware</small></span><span><b>Live</b><small>wait-aware</small></span></span>' +
        '<span class="mode-card-cta">Plan a Quick Route <b aria-hidden="true">&rsaquo;</b></span>' +
      '</button>' +
      '<button class="mode-card mode-card-full' + (lastMode === 'full' ? ' was-recent' : '') + '" type="button" data-planning-mode="full">' +
        '<span class="mode-card-top"><span class="mode-card-icon" aria-hidden="true">M</span><span class="mode-card-badge">Full-day plan</span></span>' +
        '<span class="mode-card-copy"><span class="mode-card-kicker">Intentional &amp; optimized</span><strong>Maximize My Day</strong><span>Build a full-day strategy balancing priority experiences, waits, walking, and timing.</span></span>' +
        '<span class="mode-card-preview" aria-hidden="true"><span><b>Priority</b><small>experience-led</small></span><span><b>Balanced</b><small>walk + waits</small></span></span>' +
        '<span class="mode-card-cta">Maximize My Day <b aria-hidden="true">&rsaquo;</b></span>' +
      '</button></div>';
  }

  function renderMode() {
    root.innerHTML = shell('How should we guide your day?', 'Choose planning mode', modeCards(), null, [], {
      modePage: true,
      hideModeAction: true,
      description: 'Choose how RideHero should plan before you choose where you are going.'
    });
  }

  function brandMarker(brand) { return brand.id === 'six-flags' ? '6' : brand.name.charAt(0).toUpperCase(); }
  function brandCards() {
    return '<div class="catalog-card-grid brand-card-grid">' + values(catalog.brands).map(function(brand) {
      return '<button class="catalog-card brand-card" type="button" data-brand="' + brand.id + '" style="--catalog-accent:' + brand.accent + '"><span class="catalog-card-icon" aria-hidden="true">' + esc(brandMarker(brand)) + '</span><span class="catalog-card-copy"><strong>' + esc(brand.name) + '</strong><small>Choose a destination</small></span><span class="catalog-card-arrow" aria-hidden="true">&rsaquo;</span></button>';
    }).join('') + '</div>';
  }

  function recentCard() {
    var park = catalog.parks[recent.parkId];
    if (!park) return '';
    return '<section class="catalog-recent-group" aria-labelledby="recent-park-title"><div class="catalog-section-label" id="recent-park-title">Recent park</div><button class="catalog-continue" type="button" data-recent-park="' + park.id + '"><span>Continue with ' + esc(modeName()) + '</span><strong>' + esc(park.shortName) + '</strong><small>' + esc(catalog.destinations[park.destinationId].name) + '</small><b aria-hidden="true">&rsaquo;</b></button></section>';
  }

  function renderBrands() {
    var body = '<section class="mode-context-card"><span class="mode-context-icon" aria-hidden="true">' + (appState.planningMode === 'full' ? 'M' : 'Q') + '</span><span><small>Planning with</small><strong>' + esc(modeName()) + '</strong><em>' + esc(modeSummary()) + '</em></span></section>' + recentCard() + '<div class="catalog-section-label">Brands</div>' + brandCards() + '<button class="catalog-debug-link" type="button" data-route="#/admin/data-health">Park data health</button>';
    root.innerHTML = shell('Where are you going?', modeSummary(), body, routeFor(['mode']), [{ label: 'Mode', route: routeFor(['mode']) }, { label: 'Brands', route: routeFor(['brands']) }], { description: 'Choose a park family to continue.' });
  }

  function renderBrand(brand) {
    appState.brandId = brand.id;
    var destinations = values(catalog.destinations).filter(function(item){ return item.brandId === brand.id; });
    var cards = '<div class="catalog-card-grid">' + destinations.map(function(destination) {
      var count = destination.parkIds.length;
      return '<button class="catalog-card destination-card" type="button" data-destination="' + destination.id + '"><span class="catalog-card-copy"><strong>' + esc(destination.name) + '</strong><small>' + esc(destination.location) + '</small><em>' + count + ' supported park' + (count === 1 ? '' : 's') + '</em></span><span class="catalog-card-arrow" aria-hidden="true">&rsaquo;</span></button>';
    }).join('') + '</div>';
    root.innerHTML = shell('Choose a ' + brand.name + ' destination', modeName(), cards, routeFor(['brands']), [{ label: 'Mode', route: routeFor(['mode']) }, { label: 'Brands', route: routeFor(['brands']) }, { label: brand.name, route: routeFor(['parks', brand.slug]) }], { description: 'Select a resort or destination.' });
  }

  function parkStatus(park) {
    var waits = park.liveWaitTimesAvailable ? '<span class="status-available">Live waits available</span>' : '<span>Live waits unavailable</span>';
    var routing = park.map.routingQuality === 'verified' ? '<span class="status-available">Walking routes available</span>' : '<span>Proximity guidance</span>';
    return waits + routing;
  }

  function renderDestination(brand, destination) {
    appState.brandId = brand.id;
    appState.destinationId = destination.id;
    var cards = '<div class="catalog-card-grid park-catalog-grid">' + destination.parkIds.map(function(parkId) {
      var park = catalog.parks[parkId];
      return '<button class="catalog-card park-catalog-card" type="button" data-park="' + park.id + '"><span class="park-catalog-dot" style="--catalog-accent:' + brand.accent + '"></span><span class="catalog-card-copy"><strong>' + esc(park.shortName) + '</strong><small>' + esc(destination.name) + '</small><em class="park-card-status">' + parkStatus(park) + '</em></span><span class="catalog-card-arrow" aria-hidden="true">&rsaquo;</span></button>';
    }).join('') + '</div>';
    root.innerHTML = shell('Choose your park', destination.name, cards, routeFor(['parks', brand.slug]), [{ label: 'Mode', route: routeFor(['mode']) }, { label: 'Brands', route: routeFor(['brands']) }, { label: brand.name, route: routeFor(['parks', brand.slug]) }, { label: destination.name, route: routeFor(['parks', brand.slug, destination.slug]) }], { description: 'RideHero will load only the selected park.' });
  }

  function renderPark(brand, destination, park) {
    appState.brandId = brand.id;
    appState.destinationId = destination.id;
    appState.parkId = park.id;
    var action = appState.planningMode === 'full' ? 'Opening Maximize My Day' : 'Finding nearby rides';
    var body = '<section class="park-ready-card" aria-live="polite"><div class="park-ready-top"><span class="park-catalog-dot" style="--catalog-accent:' + brand.accent + '"></span><div><small>' + esc(destination.name) + '</small><strong>' + esc(park.officialName) + '</strong></div></div><div class="park-capabilities">' + parkStatus(park) + '</div><div class="catalog-inline-loading" data-loading-park><span class="catalog-loading-spinner" aria-hidden="true"></span><span><strong>' + esc(action) + '&hellip;</strong><small>Loading park information and current planning context.</small></span></div></section>';
    root.innerHTML = shell(park.shortName, modeName(), body, routeFor(['parks', brand.slug, destination.slug]), [{ label: 'Mode', route: routeFor(['mode']) }, { label: brand.name, route: routeFor(['parks', brand.slug]) }, { label: destination.name, route: routeFor(['parks', brand.slug, destination.slug]) }, { label: park.shortName, route: routeFor(['parks', brand.slug, destination.slug, park.slug]) }], { description: action + '.' });
  }

  function renderDataHealth() {
    root.innerHTML = shell('Park data health', 'Admin / debug', '<div id="data-health-root"></div>', routeFor(['brands']), [{ label: 'Brands', route: routeFor(['brands']) }, { label: 'Data health', route: '#/admin/data-health' }], { hideModeAction: false });
    if (global.RideHeroDataHealth) global.RideHeroDataHealth.render(root.querySelector('#data-health-root'));
  }

  function render() {
    if (!root) return;
    root.classList.add('active');
    document.querySelectorAll('.screen').forEach(function(screen){ if (screen !== root) screen.classList.remove('active'); });
    var parts = currentRoute();
    var parkToActivate = null;
    if (parts[0] === 'admin' && parts[1] === 'data-health') renderDataHealth();
    else if (!parts.length || parts[0] === 'mode') renderMode();
    else if (!appState.planningMode) { go(['mode'], true); return; }
    else if (parts[0] === 'brands') renderBrands();
    else if (parts[0] === 'parks') {
      var found = global.RideHeroParkData.findParkByRoute(parts[1], parts[2], parts[3]);
      if (!found.brand) renderBrands();
      else if (!found.destination) renderBrand(found.brand);
      else if (!found.park) renderDestination(found.brand, found.destination);
      else { renderPark(found.brand, found.destination, found.park); parkToActivate = found.park.id; }
    } else renderMode();
    bind();
    var heading = root.querySelector('.catalog-heading');
    if (heading) heading.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    updateContextActions();
    if (parkToActivate) activatePark(parkToActivate);
  }

  function bind() {
    root.querySelectorAll('[data-action="home"]').forEach(function(button){ button.onclick = goHome; });
    root.querySelectorAll('[data-action="back"]').forEach(function(button){ button.onclick = function(){ if (global.history.length > 1) history.back(); else location.hash = button.dataset.fallbackRoute; }; });
    root.querySelectorAll('[data-route]').forEach(function(button){ button.onclick = function(){ location.hash = button.dataset.route; }; });
    root.querySelectorAll('[data-planning-mode]').forEach(function(button){ button.onclick = function(){ selectPlanningMode(button.dataset.planningMode, button); }; });
    root.querySelectorAll('[data-brand]').forEach(function(button){ button.onclick = function(){ var brand = catalog.brands[button.dataset.brand]; go(['parks', brand.slug]); }; });
    root.querySelectorAll('[data-destination]').forEach(function(button){ button.onclick = function(){ var destination = catalog.destinations[button.dataset.destination]; var brand = catalog.brands[destination.brandId]; go(['parks', brand.slug, destination.slug]); }; });
    root.querySelectorAll('[data-park]').forEach(function(button){
      button.onclick = function(){ var park = catalog.parks[button.dataset.park]; var destination = catalog.destinations[park.destinationId]; var brand = catalog.brands[park.brandId]; go(['parks', brand.slug, destination.slug, park.slug]); };
      button.addEventListener('pointerenter', function(){ global.RideHeroParkData.load(button.dataset.park).catch(function(){}); }, { once: true });
    });
    root.querySelectorAll('[data-recent-park]').forEach(function(button){ button.onclick = function(){ var park = catalog.parks[button.dataset.recentPark]; var destination = catalog.destinations[park.destinationId]; var brand = catalog.brands[park.brandId]; go(['parks', brand.slug, destination.slug, park.slug]); }; });
  }

  function selectPlanningMode(mode, button) {
    mode = normalizePlanningMode(mode);
    if (!mode) return;
    appState.planningMode = mode;
    appState.brandId = null;
    appState.destinationId = null;
    appState.parkId = null;
    rememberContext({ planningMode: mode });
    if (typeof applyGuidanceMode === 'function') applyGuidanceMode(legacyGuidanceMode());
    document.body.classList.add('mode-choice-made');
    root.querySelectorAll('[data-planning-mode]').forEach(function(card){ card.classList.toggle('is-selected', card === button); card.disabled = true; });
    var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    global.setTimeout(function(){ document.body.classList.remove('mode-choice-made'); go(['brands']); }, reduced ? 0 : 240);
  }

  async function activatePark(parkId) {
    var park = catalog.parks[parkId];
    if (!park || loadingParkId) return;
    loadingParkId = parkId;
    try {
      await global.RideHeroParkData.load(parkId);
      if (typeof currentPark !== 'undefined') {
        var changed = currentPark !== parkId;
        currentPark = parkId;
        parkHasBeenSelected = true;
        if (changed && typeof resetParkRuntimeState === 'function') resetParkRuntimeState();
      }
      global.RideHeroLocationService.setSelectedPark(parkId);
      rememberContext({ planningMode: appState.planningMode, brandId: park.brandId, destinationId: park.destinationId, parkId: parkId });
      ensureLegacyBridge(park);
      if (typeof applyGuidanceMode === 'function') applyGuidanceMode(legacyGuidanceMode());
      if (appState.planningMode === 'full') openPlanFlow();
      else goQuickRouteForPark();
    } catch (error) {
      showCatalogError('This park could not be loaded. Please retry.');
      var loading = root.querySelector('[data-loading-park]');
      if (loading) loading.innerHTML = '<button class="catalog-primary" type="button" data-retry-park>Retry loading park</button>';
      var retry = root.querySelector('[data-retry-park]');
      if (retry) retry.onclick = function(){ activatePark(parkId); };
    } finally { loadingParkId = null; }
  }

  function ensureLegacyBridge(park) {
    if (!global.PARK_META_BRIDGE) global.PARK_META_BRIDGE = {};
    if (typeof PARK_META !== 'undefined' && !PARK_META[park.id]) PARK_META[park.id] = { name: park.shortName, color: catalog.brands[park.brandId].accent, emoji: 'RH', zones: [] };
    if (typeof TP_IDS !== 'undefined') TP_IDS[park.id] = park.waitTimeProviderId;
    if (typeof HERO_COLORS !== 'undefined') HERO_COLORS[park.id] = catalog.brands[park.brandId].accent;
  }

  function showCatalogError(message) {
    var main = root.querySelector('.catalog-content');
    if (main) main.insertAdjacentHTML('afterbegin', '<div class="catalog-error" role="alert">' + esc(message) + '</div>');
  }

  function updateContextActions() {
    var parkId = global.RideHeroState.get().recent.parkId;
    var changePark = document.getElementById('catalog-change-park');
    if (!changePark) {
      changePark = document.createElement('button'); changePark.id = 'catalog-change-park'; changePark.className = 'catalog-context-action catalog-change-park'; changePark.type = 'button'; changePark.textContent = 'Change Park';
      document.body.appendChild(changePark); changePark.onclick = openParkSwitcher;
    }
    var changeMode = document.getElementById('catalog-change-mode');
    if (!changeMode) {
      changeMode = document.createElement('button'); changeMode.id = 'catalog-change-mode'; changeMode.className = 'catalog-context-action catalog-change-mode'; changeMode.type = 'button'; changeMode.textContent = 'Change Mode';
      document.body.appendChild(changeMode); changeMode.onclick = function(){ showScreen('setup'); go(['mode']); };
    }
    var inSetup = activeScreenIdSafe() === 'setup';
    changePark.hidden = !parkId || inSetup;
    changeMode.hidden = !appState.planningMode || inSetup;
  }

  function switcherMarkup() {
    return values(catalog.brands).map(function(brand) {
      var destinations = values(catalog.destinations).filter(function(destination) { return destination.brandId === brand.id; });
      return '<section class="park-switcher-brand"><h3>' + esc(brand.name) + '</h3>' + destinations.map(function(destination) {
        return '<div class="park-switcher-destination"><strong>' + esc(destination.name) + '</strong><div>' + destination.parkIds.map(function(parkId) { var park = catalog.parks[parkId]; return '<button type="button" data-switch-park="' + park.id + '">' + esc(park.shortName) + '</button>'; }).join('') + '</div></div>';
      }).join('') + '</section>';
    }).join('');
  }

  function openParkSwitcher() {
    var dialog = document.getElementById('catalog-park-switcher');
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'catalog-park-switcher'; dialog.className = 'catalog-park-switcher'; dialog.setAttribute('aria-labelledby', 'park-switcher-title');
      dialog.innerHTML = '<div class="park-switcher-head"><div><span>Quick switch</span><h2 id="park-switcher-title">Change Park</h2></div><button type="button" data-close-switcher aria-label="Close park switcher">&times;</button></div><div class="park-switcher-scroll">' + switcherMarkup() + '</div>';
      document.body.appendChild(dialog);
      dialog.querySelector('[data-close-switcher]').onclick = function() { dialog.close(); };
      dialog.onclick = function(event) { if (event.target === dialog) dialog.close(); };
      dialog.querySelectorAll('[data-switch-park]').forEach(function(button) { button.onclick = function() { dialog.close(); var park = catalog.parks[button.dataset.switchPark]; var destination = catalog.destinations[park.destinationId]; var brand = catalog.brands[park.brandId]; showScreen('setup'); go(['parks', brand.slug, destination.slug, park.slug]); }; });
    }
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }

  function goHome() { showScreen('setup'); go(appState.planningMode ? ['brands'] : ['mode']); }
  function activeScreenIdSafe() { return typeof activeScreenId === 'function' ? activeScreenId() : ''; }
  global.RideHeroAppState = appState;
  global.RideHeroMultiResort = { render: render, choosePark: activatePark, selectPlanningMode: selectPlanningMode, goHome: goHome, changePark: openParkSwitcher, changeMode: function(){ showScreen('setup'); go(['mode']); }, updateChangeParkAction: updateContextActions, getState: function(){ return Object.assign({}, appState); } };
  global.addEventListener('hashchange', render);
  if (!location.hash || location.hash === '#/' || location.hash === '#') go(['mode'], true); else render();
})(window);
