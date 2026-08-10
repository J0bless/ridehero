(function(global) {
  'use strict';
  var catalog = global.RIDEHERO_CATALOG;
  var root = document.getElementById('screen-setup');
  var loadingParkId = null;

  function values(object) { return Object.keys(object || {}).map(function(key) { return object[key]; }); }
  function routeFor(parts) { return '#/' + parts.filter(Boolean).join('/'); }
  function go(parts) { var next = routeFor(parts); if (location.hash === next) render(); else location.hash = next; }
  function currentRoute() { return (location.hash || '#/').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>'"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]; }); }

  function shell(title, eyebrow, body, crumbs, backAction) {
    return '<div class="catalog-page" data-catalog-page>' +
      '<header class="catalog-header"><div class="catalog-nav-row">' +
      (backAction ? '<button class="catalog-icon-btn" type="button" data-action="back" aria-label="Go back">‹</button>' : '<span></span>') +
      '<button class="catalog-wordmark" type="button" data-action="home">RideHero</button>' +
      '<span></span></div>' +
      (crumbs && crumbs.length ? '<nav class="catalog-breadcrumbs" aria-label="Breadcrumb">' + crumbs.map(function(item, i){ return '<button type="button" data-route="' + esc(item.route) + '"' + (i === crumbs.length - 1 ? ' aria-current="page"' : '') + '>' + esc(item.label) + '</button>'; }).join('<span>›</span>') + '</nav>' : '') +
      '<div class="catalog-heading" tabindex="-1"><span>' + esc(eyebrow) + '</span><h1>' + esc(title) + '</h1></div></header>' +
      '<main class="catalog-content">' + body + '</main></div>';
  }

  function brandCards() {
    return '<div class="catalog-card-grid brand-card-grid">' + values(catalog.brands).map(function(brand) {
      return '<button class="catalog-card brand-card" type="button" data-brand="' + brand.id + '" style="--catalog-accent:' + brand.accent + '"><span class="catalog-card-icon">' + esc(brand.icon) + '</span><span><strong>' + esc(brand.name) + '</strong><small>Explore destinations</small></span><span aria-hidden="true">›</span></button>';
    }).join('') + '</div>';
  }

  function renderHome() {
    var recent = global.RideHeroState.get().recent || {};
    var park = catalog.parks[recent.parkId];
    var continueCard = park ? '<button class="catalog-continue" type="button" data-park="' + park.id + '"><span>Continue planning</span><strong>' + esc(park.shortName) + '</strong><small>' + esc(recent.planningMode === 'strategic' ? 'Maximize My Day' : 'Quick Route') + '</small></button>' : '';
    root.innerHTML = shell('Choose your destination', 'Plan less. Ride more.', continueCard + brandCards(), [], false);
  }

  function renderBrand(brand) {
    var destinations = values(catalog.destinations).filter(function(item){ return item.brandId === brand.id; });
    var cards = '<div class="catalog-card-grid">' + destinations.map(function(destination) {
      var count = destination.parkIds.length;
      return '<button class="catalog-card destination-card" type="button" data-destination="' + destination.id + '"><span><strong>' + esc(destination.name) + '</strong><small>' + esc(destination.location) + ' · ' + count + ' park' + (count === 1 ? '' : 's') + '</small></span><span aria-hidden="true">›</span></button>';
    }).join('') + '</div>';
    root.innerHTML = shell(brand.name, 'Choose a resort or destination', cards, [{ label: 'Home', route: '#/' }, { label: brand.name, route: routeFor(['parks', brand.slug]) }], true);
  }

  function renderDestination(brand, destination) {
    var cards = '<div class="catalog-card-grid park-catalog-grid">' + destination.parkIds.map(function(parkId) {
      var park = catalog.parks[parkId];
      return '<button class="catalog-card park-catalog-card" type="button" data-park="' + park.id + '"><span class="park-catalog-dot" style="--catalog-accent:' + brand.accent + '"></span><span><strong>' + esc(park.shortName) + '</strong><small>' + esc(park.city) + (park.state ? ', ' + esc(park.state) : '') + '</small><em>' + (park.liveWaitTimesAvailable ? 'Live waits supported' : 'Static information') + ' · ' + esc(park.map.routingQuality) + ' routing</em></span><span aria-hidden="true">›</span></button>';
    }).join('') + '</div>';
    root.innerHTML = shell(destination.name, 'Choose a park', cards, [{ label: 'Home', route: '#/' }, { label: brand.name, route: routeFor(['parks', brand.slug]) }, { label: destination.name, route: routeFor(['parks', brand.slug, destination.slug]) }], true);
  }

  function renderPark(brand, destination, park) {
    var body = '<section class="park-ready-card"><div class="park-ready-top"><span class="park-catalog-dot" style="--catalog-accent:' + brand.accent + '"></span><div><strong>' + esc(park.officialName) + '</strong><small>' + esc(park.city) + (park.state ? ', ' + esc(park.state) : park.prefecture ? ', ' + esc(park.prefecture) : '') + '</small></div></div>' +
      '<div class="park-capabilities"><span>' + (park.liveWaitTimesAvailable ? 'Live waits' : 'Static information') + '</span><span>' + (park.map.routingQuality === 'verified' ? 'Verified walkways' : 'Approximate proximity') + '</span><span>' + esc(park.timezone) + '</span></div>' +
      '<p>' + (park.map.routingQuality === 'verified' ? 'RideHero can use the verified park map and walking network.' : 'RideHero will compare nearby rides without drawing an unverified walking path.') + '</p>' +
      '<button class="catalog-primary" type="button" data-select-mode="' + park.id + '">Choose planning mode</button></section>';
    root.innerHTML = shell(park.shortName, 'Park selected', body, [{ label: 'Home', route: '#/' }, { label: brand.name, route: routeFor(['parks', brand.slug]) }, { label: destination.name, route: routeFor(['parks', brand.slug, destination.slug]) }, { label: park.shortName, route: routeFor(['parks', brand.slug, destination.slug, park.slug]) }], true);
  }

  function render() {
    if (!root) return;
    root.classList.add('active');
    document.querySelectorAll('.screen').forEach(function(screen){ if (screen !== root) screen.classList.remove('active'); });
    var parts = currentRoute();
    if (!parts.length || parts[0] !== 'parks') renderHome();
    else {
      var found = global.RideHeroParkData.findParkByRoute(parts[1], parts[2], parts[3]);
      if (!found.brand) renderHome();
      else if (!found.destination) renderBrand(found.brand);
      else if (!found.park) renderDestination(found.brand, found.destination);
      else renderPark(found.brand, found.destination, found.park);
    }
    bind();
    var heading = root.querySelector('.catalog-heading');
    if (heading) heading.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    updateChangeParkAction();
  }

  function bind() {
    root.querySelectorAll('[data-action="home"]').forEach(function(button){ button.onclick = function(){ go([]); }; });
    root.querySelectorAll('[data-action="back"]').forEach(function(button){ button.onclick = function(){ history.back(); }; });
    root.querySelectorAll('[data-route]').forEach(function(button){ button.onclick = function(){ location.hash = button.dataset.route; }; });
    root.querySelectorAll('[data-brand]').forEach(function(button){ button.onclick = function(){ var brand=catalog.brands[button.dataset.brand]; go(['parks',brand.slug]); }; });
    root.querySelectorAll('[data-destination]').forEach(function(button){ button.onclick = function(){ var destination=catalog.destinations[button.dataset.destination],brand=catalog.brands[destination.brandId]; go(['parks',brand.slug,destination.slug]); }; });
    root.querySelectorAll('[data-park]').forEach(function(button){
      button.onclick = function(){ choosePark(button.dataset.park, false); };
      button.addEventListener('pointerenter', function(){ global.RideHeroParkData.load(button.dataset.park).catch(function(){}); }, { once: true });
    });
    root.querySelectorAll('[data-select-mode]').forEach(function(button){ button.onclick = function(){ choosePark(button.dataset.selectMode, true); }; });
  }

  async function choosePark(parkId, openMode) {
    var park = catalog.parks[parkId];
    if (!park || loadingParkId) return;
    var destination = catalog.destinations[park.destinationId];
    var brand = catalog.brands[park.brandId];
    if (!openMode) { go(['parks', brand.slug, destination.slug, park.slug]); return; }
    loadingParkId = parkId;
    var button = root.querySelector('[data-select-mode]');
    if (button) { button.disabled = true; button.textContent = 'Loading park…'; }
    try {
      await global.RideHeroParkData.load(parkId);
      if (typeof currentPark !== 'undefined') {
        var changed = currentPark !== parkId;
        currentPark = parkId;
        parkHasBeenSelected = true;
        if (changed && typeof resetParkRuntimeState === 'function') resetParkRuntimeState();
      }
      global.RideHeroLocationService.setSelectedPark(parkId);
      global.RideHeroState.rememberContext({ brandId: park.brandId, destinationId: park.destinationId, parkId: parkId });
      global.RideHeroPendingModePark = parkId;
      ensureLegacyBridge(park);
      showModeChoice(true);
    } catch (error) {
      if (button) { button.disabled = false; button.textContent = 'Retry loading park'; }
      showCatalogError('This park could not be loaded. Please retry.');
    } finally { loadingParkId = null; }
  }

  function ensureLegacyBridge(park) {
    if (!global.PARK_META_BRIDGE) global.PARK_META_BRIDGE = {};
    if (typeof PARK_META !== 'undefined' && !PARK_META[park.id]) PARK_META[park.id] = { name: park.shortName, color: catalog.brands[park.brandId].accent, emoji: '🎢', zones: [] };
    if (typeof TP_IDS !== 'undefined') TP_IDS[park.id] = park.waitTimeProviderId;
    if (typeof HERO_COLORS !== 'undefined') HERO_COLORS[park.id] = catalog.brands[park.brandId].accent;
  }

  function showCatalogError(message) {
    var main = root.querySelector('.catalog-content');
    if (main) main.insertAdjacentHTML('afterbegin', '<div class="catalog-error" role="alert">' + esc(message) + '</div>');
  }

  function updateChangeParkAction() {
    var parkId = global.RideHeroState.get().recent.parkId;
    var button = document.getElementById('catalog-change-park');
    if (!button) {
      button = document.createElement('button'); button.id = 'catalog-change-park'; button.className = 'catalog-change-park'; button.type = 'button'; button.textContent = 'Change Park';
      document.body.appendChild(button);
      button.onclick = openParkSwitcher;
    }
    button.hidden = !parkId || activeScreenIdSafe() === 'setup';
  }

  function switcherMarkup() {
    return values(catalog.brands).map(function(brand) {
      var destinations = values(catalog.destinations).filter(function(destination) { return destination.brandId === brand.id; });
      return '<section class="park-switcher-brand"><h3>' + esc(brand.name) + '</h3>' + destinations.map(function(destination) {
        return '<div class="park-switcher-destination"><strong>' + esc(destination.name) + '</strong><div>' + destination.parkIds.map(function(parkId) {
          var park = catalog.parks[parkId];
          return '<button type="button" data-switch-park="' + park.id + '">' + esc(park.shortName) + '</button>';
        }).join('') + '</div></div>';
      }).join('') + '</section>';
    }).join('');
  }

  function openParkSwitcher() {
    var dialog = document.getElementById('catalog-park-switcher');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'catalog-park-switcher';
      dialog.className = 'catalog-park-switcher';
      dialog.setAttribute('aria-labelledby', 'park-switcher-title');
      dialog.innerHTML = '<div class="park-switcher-head"><div><span>Quick switch</span><h2 id="park-switcher-title">Change Park</h2></div><button type="button" data-close-switcher aria-label="Close park switcher">&times;</button></div><div class="park-switcher-scroll">' + switcherMarkup() + '</div>';
      document.body.appendChild(dialog);
      dialog.querySelector('[data-close-switcher]').onclick = function() { dialog.close(); };
      dialog.onclick = function(event) { if (event.target === dialog) dialog.close(); };
      dialog.querySelectorAll('[data-switch-park]').forEach(function(button) {
        button.onclick = function() { dialog.close(); choosePark(button.dataset.switchPark, true); };
      });
    }
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function activeScreenIdSafe() { return typeof activeScreenId === 'function' ? activeScreenId() : ''; }
  global.RideHeroMultiResort = { render: render, choosePark: choosePark, goHome: function(){ go([]); }, changePark: openParkSwitcher, updateChangeParkAction: updateChangeParkAction };
  global.addEventListener('hashchange', render);
  if (!location.hash) location.replace('#/'); else render();
})(window);
