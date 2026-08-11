(function(global) {
  'use strict';
  var catalog = global.RIDEHERO_CATALOG;
  var root = document.getElementById('screen-setup');
  var loadingParkId = null;
  var modeTransition = null;
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
    var initialProgress = lastMode === 'full' ? 1 : 0;
    return '<div class="mode-selector" data-mode-selector>' +
      '<div class="mode-swipe-stage" data-mode-swipe tabindex="0" role="group" aria-label="Planning mode. Use left and right arrow keys to compare modes." data-initial-progress="' + initialProgress + '">' +
        '<div class="mode-swipe-track" data-mode-track>' +
          '<article class="mode-card mode-card-quick mode-panel" data-mode-panel="quick">' +
            '<div class="mode-card-inner" data-mode-copy="quick"><span class="mode-card-icon" aria-hidden="true">Q</span><span class="mode-card-copy"><span class="mode-card-kicker">Fast &amp; simple</span><strong>Quick Route</strong><span>Find the smartest nearby rides based on your location, current waits, and walking distance.</span></span><button class="mode-card-cta" type="button" data-planning-mode="quick">Plan a Quick Route <b aria-hidden="true">&rsaquo;</b></button></div>' +
          '</article>' +
          '<article class="mode-card mode-card-full mode-panel" data-mode-panel="full">' +
            '<div class="mode-card-inner" data-mode-copy="full"><span class="mode-card-icon" aria-hidden="true">M</span><span class="mode-card-copy"><span class="mode-card-kicker">Intentional &amp; optimized</span><strong>Maximize My Day</strong><span>Build a full-day strategy balancing priority experiences, waits, walking, and timing.</span></span><button class="mode-card-cta" type="button" data-planning-mode="full">Maximize My Day <b aria-hidden="true">&rsaquo;</b></button></div>' +
          '</article>' +
        '</div>' +
        '<div class="mode-progress-rail" data-mode-rail aria-hidden="true"><span class="mode-progress-cart"><i></i><i></i></span></div>' +
      '</div>' +
      '<div class="mode-switch-actions" role="group" aria-label="Compare planning modes">' +
        '<button type="button" data-mode-target="quick">Quick Route</button>' +
        '<button type="button" data-mode-target="full">Maximize My Day</button>' +
      '</div>' +
    '</div>';
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
    initModeTransition();
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

  function clamp01(value) { return Math.max(0, Math.min(1, value)); }
  function smoothRange(value, start, end) {
    var t = clamp01((value - start) / (end - start));
    return t * t * (3 - (2 * t));
  }
  function modeTextOpacities(value) {
    var progress = clamp01(value);
    return {
      quick: 1 - smoothRange(progress, 0.14, 0.42),
      full: smoothRange(progress, 0.58, 0.86)
    };
  }

  function initModeTransition() {
    if (modeTransition && modeTransition.destroy) modeTransition.destroy();
    var stage = root.querySelector('[data-mode-swipe]');
    if (!stage) { modeTransition = null; return; }
    var track = stage.querySelector('[data-mode-track]');
    var rail = stage.querySelector('[data-mode-rail]');
    var quickPanel = stage.querySelector('[data-mode-panel="quick"]');
    var fullPanel = stage.querySelector('[data-mode-panel="full"]');
    var quickInner = stage.querySelector('[data-mode-copy="quick"]');
    var fullInner = stage.querySelector('[data-mode-copy="full"]');
    var targetButtons = root.querySelectorAll('[data-mode-target]');
    var progress = Number(stage.dataset.initialProgress) || 0;
    var settledMode = progress >= 0.5 ? 'full' : 'quick';
    var dragging = false;
    var moved = false;
    var startX = 0;
    var startProgress = progress;
    var lastX = 0;
    var lastTime = 0;
    var velocity = 0;
    var frame = 0;
    var resizeObserver = null;
    var reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function setFocusable(panel, enabled) {
      panel.querySelectorAll('button,a,input,select,textarea,[tabindex]').forEach(function(control) {
        if (enabled) control.removeAttribute('tabindex'); else control.setAttribute('tabindex', '-1');
      });
      panel.inert = !enabled;
      panel.setAttribute('aria-hidden', enabled ? 'false' : 'true');
    }

    function settleAccessibility(mode) {
      settledMode = mode;
      var quickActive = mode === 'quick';
      quickPanel.classList.toggle('is-active', quickActive);
      fullPanel.classList.toggle('is-active', !quickActive);
      setFocusable(quickPanel, quickActive);
      setFocusable(fullPanel, !quickActive);
      targetButtons.forEach(function(button) {
        var active = button.dataset.modeTarget === mode;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    function applyProgress(nextProgress, isSettled) {
      progress = clamp01(nextProgress);
      var opacities = modeTextOpacities(progress);
      var quickOpacity = opacities.quick;
      var fullOpacity = opacities.full;
      stage.style.setProperty('--mode-progress', progress.toFixed(4));
      track.style.transform = 'translate3d(' + (-50 * progress).toFixed(4) + '%,0,0)';
      var stageWidth = stage.getBoundingClientRect ? stage.getBoundingClientRect().width : stage.clientWidth;
      rail.style.transform = 'translate3d(' + ((Math.max(stageWidth, 1) * (1 - progress)) - 3).toFixed(2) + 'px,0,0)';
      quickInner.style.opacity = quickOpacity.toFixed(4);
      fullInner.style.opacity = fullOpacity.toFixed(4);
      quickInner.style.pointerEvents = quickOpacity < 0.5 ? 'none' : '';
      fullInner.style.pointerEvents = fullOpacity < 0.5 ? 'none' : '';
      if (isSettled) settleAccessibility(progress >= 0.5 ? 'full' : 'quick');
      else {
        quickPanel.classList.remove('is-active');
        fullPanel.classList.remove('is-active');
        setFocusable(quickPanel, false);
        setFocusable(fullPanel, false);
      }
    }

    function animateTo(target, done) {
      target = clamp01(target);
      if (frame) global.cancelAnimationFrame(frame);
      var from = progress;
      var distance = Math.abs(target - from);
      if (reducedMotion || distance < 0.001) {
        applyProgress(target, true);
        if (done) done();
        return;
      }
      var started = null;
      var duration = 180 + (distance * 90);
      function step(time) {
        if (started == null) started = time;
        var t = clamp01((time - started) / duration);
        var eased = 1 - Math.pow(1 - t, 3);
        applyProgress(from + ((target - from) * eased), t === 1);
        if (t < 1) frame = global.requestAnimationFrame(step);
        else { frame = 0; if (done) done(); }
      }
      frame = global.requestAnimationFrame(step);
    }

    function finishDrag(event) {
      if (!dragging || event.pointerId !== stage.__modePointerId) return;
      dragging = false;
      stage.classList.remove('is-dragging');
      if (stage.hasPointerCapture && stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
      var tappedPanel = !moved && event.target.closest ? event.target.closest('[data-mode-panel]') : null;
      var target = tappedPanel ? (tappedPanel.dataset.modePanel === 'full' ? 1 : 0) : (Math.abs(velocity) > 0.35 ? (velocity < 0 ? 1 : 0) : (progress >= 0.5 ? 1 : 0));
      animateTo(target);
    }

    stage.addEventListener('pointerdown', function(event) {
      if (event.button != null && event.button !== 0) return;
      if (event.target.closest && event.target.closest('button')) return;
      if (frame) { global.cancelAnimationFrame(frame); frame = 0; }
      dragging = true;
      moved = false;
      startX = lastX = event.clientX;
      startProgress = progress;
      lastTime = event.timeStamp || performance.now();
      velocity = 0;
      stage.__modePointerId = event.pointerId;
      stage.setPointerCapture(event.pointerId);
      stage.classList.add('is-dragging');
    });
    stage.addEventListener('pointermove', function(event) {
      if (!dragging || event.pointerId !== stage.__modePointerId) return;
      var width = Math.max(stage.clientWidth, 1);
      var dx = event.clientX - startX;
      var now = event.timeStamp || performance.now();
      var elapsed = Math.max(now - lastTime, 1);
      velocity = (event.clientX - lastX) / elapsed;
      lastX = event.clientX;
      lastTime = now;
      moved = moved || Math.abs(dx) > 4;
      applyProgress(startProgress - (dx / width), false);
      if (moved) event.preventDefault();
    });
    stage.addEventListener('pointerup', finishDrag);
    stage.addEventListener('pointercancel', finishDrag);
    stage.addEventListener('keydown', function(event) {
      if (event.key === 'ArrowLeft' || event.key === 'Home') { event.preventDefault(); animateTo(0); }
      else if (event.key === 'ArrowRight' || event.key === 'End') { event.preventDefault(); animateTo(1); }
    });
    targetButtons.forEach(function(button) {
      button.onclick = function() { animateTo(button.dataset.modeTarget === 'full' ? 1 : 0); };
    });
    applyProgress(progress, true);
    if (global.ResizeObserver) {
      resizeObserver = new global.ResizeObserver(function(){ applyProgress(progress, !dragging && !frame); });
      resizeObserver.observe(stage);
    }
    modeTransition = { applyProgress: applyProgress, animateTo: animateTo, getProgress: function(){ return progress; }, getMode: function(){ return settledMode; }, destroy: function(){ if (frame) global.cancelAnimationFrame(frame); if (resizeObserver) resizeObserver.disconnect(); } };
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
    var target = mode === 'full' ? 1 : 0;
    if (modeTransition) modeTransition.animateTo(target, function(){ global.setTimeout(function(){ document.body.classList.remove('mode-choice-made'); go(['brands']); }, reduced ? 0 : 120); });
    else global.setTimeout(function(){ document.body.classList.remove('mode-choice-made'); go(['brands']); }, reduced ? 0 : 240);
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
  global.RideHeroMultiResort = { render: render, choosePark: activatePark, selectPlanningMode: selectPlanningMode, goHome: goHome, changePark: openParkSwitcher, changeMode: function(){ showScreen('setup'); go(['mode']); }, updateChangeParkAction: updateContextActions, getState: function(){ return Object.assign({}, appState); }, getModeTextOpacities: modeTextOpacities };
  global.addEventListener('hashchange', render);
  if (!location.hash || location.hash === '#/' || location.hash === '#') go(['mode'], true); else render();
})(window);
